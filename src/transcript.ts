import {Database} from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import {execWithLogs, execWithOutput, getDataPath, readJsonFile} from "./utils.ts";
import {Video, WhisperOutput} from "./types.ts";
import {deleteTranscriptByVideoId, insertTranscript} from "./db/helpers.ts";
import {join} from "https://deno.land/std@0.208.0/path/mod.ts";
import {ZodError} from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {config} from "https://deno.land/x/dotenv@v3.2.2/mod.ts";

const env = config();
const USE_GPU = env.USE_GPU;
const CONCURRENT_CHUNK_PROCESS = env.CONCURRENT_CHUNK_PROCESS;
const CHUNK_DURATION = 1800; // 30 minutes in seconds
const OVERLAP_DURATION = 30; // 30 seconds of overlap between chunks

// Retry configuration
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 5000,
  maxDelay: 30000
};

async function withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    config = RETRY_CONFIG
): Promise<T> {
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === config.maxAttempts) {
        throw error;
      }

      const delay = Math.min(
          config.baseDelay * Math.pow(2, attempt - 1),
          config.maxDelay
      );

      console.warn(
          `⚠️ ${operationName} failed (attempt ${attempt}/${config.maxAttempts}). ` +
          `Retrying in ${delay / 1000} seconds...`
      );
      console.error(error);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error(`Failed after ${config.maxAttempts} attempts`);
}

async function processChunksInPairs(chunkFiles: string[], transcriptsDir: string, useCuda: boolean) {
  const transcriptions: WhisperOutput[] = new Array(chunkFiles.length);
  const CONCURRENT_CHUNKS = CONCURRENT_CHUNK_PROCESS;

  // Process chunks in groups of CONCURRENT_CHUNKS
  for (let i = 0; i < chunkFiles.length; i += CONCURRENT_CHUNKS) {
    const chunkPromises = [];

    // Create promises for current batch of chunks
    for (let j = 0; j < CONCURRENT_CHUNKS && i + j < chunkFiles.length; j++) {
      const chunkIndex = i + j;
      console.log(`Starting chunk ${chunkIndex + 1}/${chunkFiles.length}`);

      const promise = withRetry(
          () => transcribeChunk(chunkFiles[chunkIndex], transcriptsDir, useCuda, chunkIndex),
          `Chunk ${chunkIndex} transcription`,
          {...RETRY_CONFIG, maxAttempts: 2}
      ).then(result => {
        transcriptions[chunkIndex] = result;
        console.log(`✓ Completed chunk ${chunkIndex + 1}/${chunkFiles.length}`);
      });

      chunkPromises.push(promise);
    }

    // Wait for current batch to complete before starting next batch
    await Promise.all(chunkPromises);
    console.log(`\nCompleted chunks ${i + 1}-${Math.min(i + CONCURRENT_CHUNKS, chunkFiles.length)} of ${chunkFiles.length}\n`);
  }

  return transcriptions;
}

async function generateTranscript(db: Database, video: Video) {
  console.log(`🎙️ Generating transcript for video: ${video.id}`);

  const audioDir = getDataPath("audio");
  const transcriptsDir = getDataPath("transcripts");
  const audioFile = join(audioDir, `audio_${video.id}.wav`);

  await prepareDirectories(audioDir, transcriptsDir);
  const useCuda = await checkCuda();

  try {
    await withRetry(async () => {
      await convertVideoToAudio(video.file_path, audioFile);

      const chunkFiles = await splitAudioIntoChunks(
          audioFile,
          audioDir,
          CHUNK_DURATION,
          OVERLAP_DURATION
      );

      console.log(`\nStarting transcription of ${chunkFiles.length} chunks in pairs...`);
      const transcriptions = await processChunksInPairs(chunkFiles, transcriptsDir, useCuda);

      const mergedTranscript = mergeTranscriptions(transcriptions, OVERLAP_DURATION);

      await insertTranscript(db, {
        id: crypto.randomUUID(),
        video_id: video.id,
        content: mergedTranscript.text,
        segments: JSON.stringify(mergedTranscript.segments),
        created_at: new Date().toISOString(),
      });

      console.log(`✅ Transcript generated and saved for video: ${video.id}`);
    }, "Full transcription process");
  } catch (error) {
    await handleError(db, video.id, error);
  } finally {
    await cleanupFiles(audioDir);
  }
}

async function prepareDirectories(audioDir: string, transcriptsDir: string) {
  await Promise.all([
    Deno.mkdir(audioDir, {recursive: true}).catch(ignoreExistsError),
    Deno.mkdir(transcriptsDir, {recursive: true}).catch(ignoreExistsError),
  ]);
}

async function checkCuda(): Promise<boolean> {
  try {
    if (USE_GPU !== "false") {
      await execWithLogs(["nvidia-smi"]);      console.log("✅ CUDA GPU detected");
      return true;
    }
    console.log("ℹ️ GPU usage disabled by configuration");
    return false;
  } catch {
    console.warn("⚠️ No CUDA GPU detected, falling back to CPU");
    return false;
  }
}

async function convertVideoToAudio(videoPath: string, audioFile: string) {
  console.log("Converting video to audio...");
  try {
    await execWithLogs([
      "ffmpeg",
      "-y",
      "-i", videoPath,
      "-vn",
      "-acodec", "pcm_s16le",
      "-ar", "16000",
      "-ac", "1",
      "-threads", "4",
      "-loglevel", "info",
      audioFile,
      "-progress", "vidToAudio.log"
    ]);

    // Verify the output file exists and has size
    const fileInfo = await Deno.stat(audioFile);
    if (fileInfo.size === 0) {
      throw new Error("Generated audio file is empty");
    }
  } catch (error) {
    console.error(`Error converting video to audio: ${error}`);
    throw error;
  }
}

async function splitAudioIntoChunks(audioFile: string, outputDir: string, chunkDuration: number, overlap: number) {
  console.log("=== Starting Audio Chunking Process ===");
  console.log(`Input file: ${audioFile}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Chunk duration: ${chunkDuration}s, Overlap: ${overlap}s`);

  // Calculate effective chunk time with overlap
  if (overlap >= chunkDuration) {
    throw new Error("Overlap must be smaller than chunk duration.");
  }
  const effectiveChunkDuration = chunkDuration - overlap;
  console.log(`Effective chunk duration: ${effectiveChunkDuration}s`);

  // Get total duration of audio
  const {duration} = await getAudioDuration(audioFile);
  console.log(`Total audio duration: ${duration}s`);

  const chunkFiles = [];
  const expectedChunks = Math.ceil(duration / effectiveChunkDuration);
  console.log(`Expected number of chunks: ${expectedChunks}`);

  // Split into overlapping chunks
  for (let start = 0, index = 0; start < duration; start += effectiveChunkDuration, index++) {
    const chunkFile = join(outputDir, `chunk_${index}.wav`);
    console.log(`\n--- Processing Chunk ${index + 1}/${expectedChunks} ---`);
    console.log(`Output file: ${chunkFile}`);
    console.log(`Start time: ${start}s, Duration: ${chunkDuration}s`);

    try {
      const ffmpegCmd = [
        "ffmpeg",
        "-i", audioFile,
        "-ss", `${start}`,
        "-t", `${chunkDuration}`,
        "-acodec", "copy",
        "-y",
        chunkFile,
        "-loglevel", "error"
      ];
      console.log(`Executing: ${ffmpegCmd.join(' ')}`);

      await execWithLogs(ffmpegCmd);

      // Verify chunk was created
      const chunkStats = await Deno.stat(chunkFile);
      console.log(`✓ Chunk ${index} created successfully: ${chunkStats.size} bytes`);
      chunkFiles.push(chunkFile);
    } catch (error) {
      console.error(`❌ Error creating chunk ${index}:`, error);
      throw error;
    }
  }

  console.log(`\n=== Chunking Complete ===`);
  console.log(`Successfully created ${chunkFiles.length} chunks`);
  return chunkFiles;
}

// Function to get total duration of audio file
async function getAudioDuration(audioFile: string): Promise<{ duration: number }> {
  try {
    console.log("Getting duration for:", audioFile);

    const output = await execWithOutput([
      "ffprobe",
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      audioFile
    ]);

    // Log raw output for debugging
    console.log("Raw ffprobe output:", output);

    // Handle both Buffer and string outputs
    const durationStr = output instanceof Uint8Array
        ? new TextDecoder().decode(output).trim()
        : String(output).trim();

    console.log("Parsed duration string:", durationStr);

    const duration = parseFloat(durationStr);

    if (isNaN(duration)) {
      throw new Error(`Invalid duration value: ${durationStr}`);
    }

    console.log("Final parsed duration:", duration);

    // Sanity check - duration should not be 0 for a valid audio file
    if (duration <= 0) {
      throw new Error(`Invalid duration: ${duration}. File may be corrupted or empty.`);
    }

    return {duration};
  } catch (error) {
    console.error('Error getting audio duration:', error);
    // Check if file exists and has size
    try {
      const stats = await Deno.stat(audioFile);
      console.log("File stats:", {
        exists: true,
        size: stats.size,
        isFile: stats.isFile
      });
    } catch (statError) {
      console.error("File stat error:", statError);
    }
    throw error;
  }
}

// Updated merge function to handle overlaps
function mergeTranscriptions(transcriptions: WhisperOutput[], overlap: number) {
  let combinedSegments: any[] = [];
  let timeOffset = 0;

  for (let i = 0; i < transcriptions.length; i++) {
    const currentChunk = transcriptions[i];
    // Get segments for current chunk
    let currentSegments = currentChunk.segments ? [...currentChunk.segments] : [];

    if (i > 0) {
      // Find overlapping content with previous chunk
      const overlapStart = timeOffset - overlap;
      const overlapEnd = timeOffset;

      // Filter out segments that are completely in the overlap region and duplicate previous content
      currentSegments = currentSegments.filter(segment => {
        const isInOverlap = segment.start < overlap && segment.end > 0;
        if (!isInOverlap) return true;

        // Check if this segment's text is similar to already transcribed content
        const prevText = combinedSegments
            .filter(s => s.end > overlapStart && s.start < overlapEnd)
            .map(s => s.text)
            .join(" ");

        return !isTextSimilar(segment.text, prevText);
      });
    }

    // Adjust timestamps for current chunk
    currentSegments = currentSegments.map(segment => ({
      ...segment,
      start: segment.start + timeOffset - (i > 0 ? overlap : 0),
      end: segment.end + timeOffset - (i > 0 ? overlap : 0),
    }));

    combinedSegments.push(...currentSegments);

    // Update timeOffset for next chunk
    const lastSegment = currentSegments[currentSegments.length - 1];
    if (lastSegment) {
      timeOffset = lastSegment.end + overlap;
    }
  }

  // Generate combined text from final segments
  const combinedText = combinedSegments
      .map(segment => segment.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  return {text: combinedText, segments: combinedSegments};
}

// Helper function to check text similarity
function isTextSimilar(text1: string, text2: string, threshold = 0.8): boolean {
  if (!text1 || !text2) return false;

  // Normalize texts
  const normalize = (text: string) =>
      text.toLowerCase()
          .replace(/[.,!?;:]/g, '')
          .trim();

  const words1 = normalize(text1).split(/\s+/);
  const words2 = normalize(text2).split(/\s+/);

  // Calculate word overlap
  const commonWords = words1.filter(word =>
      words2.includes(word)
  );

  const similarity = commonWords.length / (words1.length + words2.length - commonWords.length);
  return similarity >= threshold;
}


async function transcribeChunk(chunkFile: string, transcriptsDir: string, useCuda: boolean, index: number) {
  console.log(`\n=== Starting Transcription of Chunk ${index} ===`);
  const chunkJsonFile = join(transcriptsDir, `chunk_${index}.json`);

  console.log("Configuration:");
  console.log(`- Input file: ${chunkFile}`);
  console.log(`- Output JSON: ${chunkJsonFile}`);
  console.log(`- Using CUDA: ${useCuda}`);

  // Retry the Whisper command execution
  await withRetry(async () => {
    const whisperCmd = [
      "whisper",
      chunkFile,
      "--model", "large-v2",
      "--output_format", "json",
      "--output_dir", transcriptsDir,
      "--beam_size", "5",
    ];

    if (useCuda) {
      whisperCmd.push("--device", "cuda:0");
    }

    console.log("Executing Whisper command:");
    console.log(whisperCmd.join(' '));

    await execWithLogs(whisperCmd);
    console.log(`✓ Whisper processing completed for chunk ${index}`);
  }, `Whisper execution for chunk ${index}`);

  // Verify the output exists
  try {
    const jsonStats = await Deno.stat(chunkJsonFile);
    console.log(`✓ Transcript JSON created: ${jsonStats.size} bytes`);
  } catch (error) {
    console.error(`❌ Failed to find transcript JSON for chunk ${index}:`, error);
    throw error;
  }

  // Retry the file reading and parsing
  return await withRetry(async () => {
    console.log(`Reading and parsing JSON for chunk ${index}`);
    const rawData = await readJsonFile(chunkJsonFile);
    console.log(`✓ Successfully parsed JSON for chunk ${index}`);

    const parsedOutput = WhisperOutput.parse(rawData);
    console.log(`=== Completed Transcription of Chunk ${index} ===\n`);

    return parsedOutput;
  }, `Parse output for chunk ${index}`);
}

async function handleError(db: Database, videoId: string, error: Error) {
  console.error(`Error for video ${videoId}:`, error);

  if (error instanceof ZodError) {
    console.error("❌ Fatal ZodError: Data structure mismatch. Cleaning up database.");
    try {
      await deleteTranscriptByVideoId(db, videoId);
      console.log(`Deleted transcript entries for video ID: ${videoId}`);
    } catch (dbError) {
      console.error("Error deleting transcript entries:", dbError);
    }
  }

  // Always rethrow the error for the retry mechanism
  throw error;
}


async function cleanupFiles(directory: string) {
  for await (const entry of Deno.readDir(directory)) {
    if (entry.isFile && (entry.name.startsWith("audio_") || entry.name.startsWith("chunk_"))) {
      await Deno.remove(join(directory, entry.name)).catch(() =>
          console.warn(`Could not remove file: ${entry.name}`)
      );
    }
  }
}

function ignoreExistsError(error: Error) {
  if (!(error instanceof Deno.errors.AlreadyExists)) {
    throw error;
  }
}

export {generateTranscript};
