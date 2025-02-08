import { Database } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import { exec, getDataPath } from "./utils.ts";
import { Video, WhisperOutput } from "./types.ts";
import { insertTranscript, deleteTranscriptByVideoId } from "./db/helpers.ts";
import { readJsonFile } from "./utils.ts";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { ZodError } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";

const env = config();
const USE_GPU = env.USE_GPU;

async function generateTranscript(db: Database, video: Video) {
  console.log(`🎙️ Generating transcript for video: ${video.id}`);

  const audioDir = getDataPath("audio");
  const transcriptsDir = getDataPath("transcripts");
  const audioFile = join(audioDir, `audio_${video.id}.wav`);

  await prepareDirectories(audioDir, transcriptsDir);

  const useCuda = await checkCuda();

  try {
    await convertVideoToAudio(video.file_path, audioFile);
    const CHUNK_DURATION = 1800; // 30 minutes in seconds
    const OVERLAP_DURATION = 20; // 10 seconds of overlap between chunks

    // Split audio into 30-minute chunks with 10 seconds overlap
    const chunkFiles = await splitAudioIntoChunks(audioFile, audioDir, CHUNK_DURATION, OVERLAP_DURATION);

    const transcriptions = await Promise.all(
        chunkFiles.map((chunkFile, index) =>
            transcribeChunk(chunkFile, transcriptsDir, useCuda, index)
        )
    );

    // Merge transcriptions while handling overlaps
    const mergedTranscript = mergeTranscriptions(transcriptions, OVERLAP_DURATION);

    await insertTranscript(db, {
      id: crypto.randomUUID(),
      video_id: video.id,
      content: mergedTranscript.text,
      segments: JSON.stringify(mergedTranscript.segments),
      created_at: new Date().toISOString(),
    });

    console.log(`✅ Transcript generated and saved for video: ${video.id}`);
  } catch (error) {
    await handleError(db, video.id, error);
  } finally {
    await cleanupFiles(audioDir);
  }
}

async function prepareDirectories(audioDir: string, transcriptsDir: string) {
  await Promise.all([
    Deno.mkdir(audioDir, { recursive: true }).catch(ignoreExistsError),
    Deno.mkdir(transcriptsDir, { recursive: true }).catch(ignoreExistsError),
  ]);
}

async function checkCuda(): Promise<boolean> {
  try {
    if (USE_GPU !== "false") {
      await exec(["nvidia-smi"]);
      console.log("✅ CUDA GPU detected");
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
  await exec([
    "ffmpeg",
    "-i", videoPath,
    "-vn",
    "-acodec", "pcm_s16le",
    "-ar", "16000",
    "-ac", "1",
    "-preset", "ultrafast",
    "-threads", "4",
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    audioFile,
  ]);
}

async function splitAudioIntoChunks(audioFile: string, outputDir: string, chunkDuration: number, overlap: number) {
  console.log("Splitting audio into overlapping chunks...");

  // Calculate effective chunk time with overlap
  const effectiveChunkDuration = chunkDuration - overlap;

  // Get total duration of audio
  const { duration } = await getAudioDuration(audioFile);
  const chunkFiles = [];

  // Split into overlapping chunks
  for (let start = 0, index = 0; start < duration; start += effectiveChunkDuration, index++) {
    const chunkFile = join(outputDir, `chunk_${index}.wav`);

    await exec([
      "ffmpeg",
      "-i", audioFile,
      "-ss", `${start}`,
      "-t", `${chunkDuration}`,
      "-acodec", "copy",
      "-y",
      chunkFile,
      "-loglevel", "error"
    ]);

    chunkFiles.push(chunkFile);
  }

  return chunkFiles;
}

// Function to get total duration of audio file
async function getAudioDuration(audioFile: string): Promise<{ duration: number }> {
  const output = await exec([
    "ffprobe",
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    audioFile
  ]);
  return { duration: parseFloat(output.trim()) };
}

// Updated merge function to handle overlaps
function mergeTranscriptions(transcriptions: WhisperOutput[], overlap: number) {
  let combinedText = "";
  let combinedSegments: any[] = [];
  let timeOffset = 0;

  for (let i = 0; i < transcriptions.length; i++) {
    const transcription = transcriptions[i];

    // If this isn't the first chunk, remove overlap
    if (i > 0) {
      transcription.segments = transcription.segments.filter(segment => segment.start >= overlap);
    }

    // Adjust timestamps and merge
    for (const segment of transcription.segments) {
      combinedSegments.push({
        ...segment,
        start: segment.start + timeOffset - (i > 0 ? overlap : 0),
        end: segment.end + timeOffset - (i > 0 ? overlap : 0),
      });
    }

    combinedText += transcription.text.trim() + " ";
    timeOffset = combinedSegments[combinedSegments.length - 1]?.end || 0;
  }

  return { text: combinedText.trim(), segments: combinedSegments };
}


async function transcribeChunk(chunkFile: string, transcriptsDir: string, useCuda: boolean, index: number) {
  const chunkJsonFile = join(transcriptsDir, `chunk_${index}.json`);
  const whisperCmd = [
    "whisper",
    chunkFile,
    "--model", "large-v3",
    "--output_format", "json",
    "--output_dir", transcriptsDir,
    "--beam_size", "5",
  ];

  if (useCuda) whisperCmd.push("--device", "cuda:0");

  console.log(`Transcribing chunk ${index}...`);
  await exec(whisperCmd);

  const rawData = await readJsonFile(chunkJsonFile);
  return WhisperOutput.parse(rawData);
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

export { generateTranscript };
