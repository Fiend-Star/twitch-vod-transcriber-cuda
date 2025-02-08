import { Database } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import { saveVideoMetadata } from "./videoManager.ts";
import { execWithLogs,  } from "./utils.ts";
import { Video } from "./types.ts";
import { getDataPath, getTempFilePath } from "./utils.ts";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";


async function attemptDownload(outputFile: string, videoUrl: string, attempt = 1): Promise<boolean> {
    const maxAttempts = 10;
    const retryDelay = 5_000;
    const fragments = 8;

    console.log(`📥 Downloading: ${videoUrl} (Attempt ${attempt}/${maxAttempts})`);

    const command = [
        "yt-dlp",
        "-o", outputFile,
        "--concurrent-fragments", "16",
        "--buffer-size", "16M",
        "--downloader", "aria2c",
        "--downloader-args", "aria2c:'-x 32 -s 32 -k 2M --optimize-concurrent-downloads'",
        "--no-part",  // Don't use .part files
        "--no-mtime", // Don't set modification time
        videoUrl,
        "--progress"
    ];

    const code = await execWithLogs(command);
    if (code === 0) return true;

    if (attempt < maxAttempts) {
        console.log(`Retry in ${retryDelay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return attemptDownload(outputFile, videoUrl, attempt + 1);
    }

    return false;
}

async function downloadTwitchVideo(db: Database, videoUrl: string): Promise<Video | null> {
    const videoID = videoUrl.split("/").pop();
    if (!videoID) {
        console.error("❌ Failed to extract video ID from URL");
        return null;
    }

    // Use getDataPath to get the correct video directory:
    const videoDir = getDataPath("videos");
    const finalOutputFile = join(videoDir, `vod_${videoID}.mp4`); // Final output file

    let tempFilePath: string | undefined; // Declare outside the try block

    try {
        // Use getTempFilePath for the temporary download file:
        tempFilePath = await getTempFilePath(`vod_${videoID}`, ".mp4.part");

        const success = await attemptDownload(tempFilePath, videoUrl);
        if (!success) {
            console.error(`❌ Failed to download video after multiple attempts: ${videoUrl}`);
            return null;
        }

        // Rename the temporary file to its final name *after* successful download:
        await Deno.rename(tempFilePath, finalOutputFile);

        const video: Video = {
            id: videoID,
            file_path: finalOutputFile, // Use the final file path
            created_at: new Date().toISOString()
        };

        saveVideoMetadata(db, video);
        return video;

    } catch (error) {
        console.error("❌ Error during download or file handling:", error);
        return null; // Or throw the error, depending on your error handling strategy

    } finally {
        if (tempFilePath) {
            try {
                await Deno.stat(tempFilePath);
                await Deno.remove(tempFilePath);
            } catch (cleanupError) {
                if (!(cleanupError instanceof Deno.errors.NotFound)) {
                    console.error("❌ Error cleaning up temporary file:", cleanupError);
                }
            }
        }
    }
}

export { downloadTwitchVideo };