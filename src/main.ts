import { downloadTwitchVideo } from "./download.ts";
import { generateTranscript } from "./transcript.ts";
import {getTranscriptByVideoId, initDb, insertVideo} from "./db/index.ts";
import { getVideoById, deleteVideoById } from "./db/helpers.ts";
import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
import { fetchVideoIDs } from "./scraper.ts";
import { ensureDirExists, getDataPath } from "./utils.ts";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { filterVideoIDs } from "./utils.ts";
import {saveVideoMetadata} from "./videoManager.ts";

const env = config();
const CHANNEL_NAME = env.CHANNEL_NAME;
const FILTER_CRITERIA = env.FILTER_CRITERIA;
const SPECIFIC_VODS = env.SPECIFIC_VODS;


async function cleanTempDirectory() {
  const tempDir = getDataPath("temp");
  console.log(`🧹 Cleaning temporary directory: ${tempDir}`);
  try {
    for await (const dirEntry of Deno.readDir(tempDir)) {
      if (dirEntry.isFile || dirEntry.isDirectory) {
        const fullPath = join(tempDir, dirEntry.name);
        await Deno.remove(fullPath, { recursive: true });
        console.log(`🗑️ Removed: ${fullPath}`);
      }
    }
    console.log("✨ Temporary directory cleaned.");
  } catch (error) {
    console.error("❗ Error cleaning temporary directory:", error);
  }
}

async function checkVideoExists(videoID: string): Promise<{exists: boolean, filePath?: string}> {
  const videoDir = getDataPath("videos");
  try {
    const extensions = ['.mp4', '.mkv', '.webm'];
    for (const ext of extensions) {
      const videoPath = join(videoDir, `vod_${videoID}${ext}`);
      try {
        await Deno.stat(videoPath);
        return { exists: true, filePath: videoPath };  // Return path when found
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) {
          throw error;
        }
      }
    }
    return { exists: false };
  } catch (error) {
    console.error(`Error checking video file existence: ${error}`);
    return { exists: false };
  }
}

async function processVideos() {
  console.log("🔍 Checking for new Twitch videos...");

  if (!CHANNEL_NAME) {
    console.error("❌ Missing CHANNEL_NAME in .env");
    return;
  }

  const db = initDb();

  try {
    const videoIDs = await fetchVideoIDs(CHANNEL_NAME);
    console.log(`📹 Found ${videoIDs.length} videos to check`);

    const filteredVideoIDs = filterVideoIDs(videoIDs, FILTER_CRITERIA, SPECIFIC_VODS);

    if (SPECIFIC_VODS && SPECIFIC_VODS.length > 0) {
      console.log(`🎯 Targeting specific VODs: ${SPECIFIC_VODS}`);
    } else if (FILTER_CRITERIA?.trim()) {
      console.log(`🔍 Applying filter criteria: ${FILTER_CRITERIA}`);
    }

    console.log(`📹 Processing ${filteredVideoIDs.length} videos`);

    // First pass: Process videos that exist but need transcription
    for (const videoID of filteredVideoIDs) {
      const video = await getVideoById(db, videoID);
      const { exists: videoFileExists, filePath } = await checkVideoExists(videoID);

      if (videoFileExists && filePath) {
        let currentVideo = video;

        if (!currentVideo) {
          console.log(`⚠️ Found video file for ${videoID} but no database entry. Saving metadata...`);
          try {
            await saveVideoMetadata(db, {
              id: videoID,
              file_path: filePath,
              created_at: new Date().toISOString()
            });
            console.log(`✅ Successfully saved metadata for ${videoID}`);
            // Fetch the newly saved video data
            currentVideo = await getVideoById(db, videoID);
          } catch (error) {
            console.error(`❌ Error saving metadata: ${error}`);
            continue;
          }
        }

        // Now check and generate transcript regardless of whether video was just saved or existed before
        if (currentVideo && !await getTranscriptByVideoId(db, videoID)) {
          console.log(`🎙️ Generating transcript for video: ${videoID}`);
          try {
            await generateTranscript(db, currentVideo);
          } catch (error) {
            console.error(`❌ Error generating transcript for ${videoID}:`, error);
            await deleteVideoById(db, videoID);
          }
        }
        continue;
      }

      // Second pass: Download and process new videos
      if (video) {
        console.log(`⚠️ Found database entry for ${videoID} but no video file. Cleaning up...`);
        // await deleteVideoById(db, videoID);
      }

      console.log(`🚀 Processing new video with ID: ${videoID}`);
      const videoUrl = `https://www.twitch.tv/videos/${videoID}`;

      try {
        const video = await downloadTwitchVideo(db, videoUrl);
        if (video) {
          console.log(`⬇️ Downloaded video: ${videoID}`);
          await generateTranscript(db, video);
        } else {
          console.warn(`⚠️ Could not download video: ${videoID}`);
          try {
            await deleteVideoById(db, videoID);
            console.log(`🗑️ Deleted video metadata for failed download: ${videoID}`);
          } catch(dbError) {
            console.error(`Error deleting the video metadata ${dbError}`);
          }
        }
      } catch (error) {
        console.error(`❌ Error processing video ${videoID}:`, error);
        try {
          await deleteVideoById(db, videoID);
          console.log(`🗑️ Deleted video metadata after error: ${videoID}`);
        } catch(dbError) {
          console.error(`Error deleting the video metadata ${dbError}`);
        }
      }
    }
  } catch (error) {
    console.error("❗ Error in processVideos:", error);
  } finally {
    db.close();
    console.log("🏁 Process complete.");
  }
}

async function main() {
  console.log("🎬 Starting Twitch VOD Downloader");

  await ensureDirExists(getDataPath(""));
  await ensureDirExists(getDataPath("audio"));
  await ensureDirExists(getDataPath("transcripts"));
  await ensureDirExists(getDataPath("db"));
  await ensureDirExists(getDataPath("videos"));
  await ensureDirExists(getDataPath("temp"));

  await cleanTempDirectory();
  await processVideos();
}

main();