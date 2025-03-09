import { Database } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import { generateChapterTitle, generateBulletPointSummary, segmentTranscript } from "./chapterUtils.ts";
import { getDataPath } from "./utils.ts";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.208.0/fs/mod.ts";
import { Transcript, type ProcessedChapter } from "./types.ts";

// Timestamp formatting utility
function formatSecondsToTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// YouTube chapter description generator
function generateYouTubeChapterDescription(processedChapters: ProcessedChapter[]): string {
  const MAX_DESCRIPTION_LENGTH = 5000;
  const MAX_BULLET_LENGTH = 80;
  const MAX_BULLETS_PER_CHAPTER = 3;
  const TRUNCATION_INDICATOR = "... (selected representative chapters)";

  // Process each chapter
  const processChapter = (chapter: ProcessedChapter) => {
    const timestamp = formatSecondsToTimestamp(chapter.start_time);
    
    // Process summary into limited bullet points
    let bullets = chapter.summary
      .replace(/🔹/g, '-') // Remove emoji
      .split(/\n/) // Split into lines
      .filter(line => line.trim() !== '') // Remove empty lines
      .map(line => line.trim()) // Trim lines
      .map(line => {
        // Truncate long lines
        return line.length > MAX_BULLET_LENGTH 
          ? line.substring(0, MAX_BULLET_LENGTH) + '...' 
          : line;
      })
      .slice(0, MAX_BULLETS_PER_CHAPTER) // Limit to 3 bullets
      .map(line => `* ${line}`); // Add bullet points
    
    return `${timestamp} ${chapter.title}\n${bullets.join('\n')}`;
  };

  // Strategy to select more chapters
  const selectRepresentativeChapters = (chapters: ProcessedChapter[]) => {
    // If few chapters, return all
    if (chapters.length <= 5) {
      return chapters;
    }

    // Always include first and last chapters
    const selectedChapters = [
      chapters[0],
      chapters[chapters.length - 1]
    ];

    // Select more intermediate chapters
    const intermediateCount = Math.min(
      Math.floor((chapters.length - 2) * 0.4),  // 40% of remaining chapters
      8  // Limit to 8 additional chapters
    );

    // Select evenly spaced intermediate chapters
    for (let i = 1; i <= intermediateCount; i++) {
      const index = Math.floor(i * (chapters.length - 1) / (intermediateCount + 1));
      selectedChapters.push(chapters[index]);
    }

    // Sort to maintain original order
    return selectedChapters.sort((a, b) => a.start_time - b.start_time);
  };

  // Select representative chapters
  const representativeChapters = selectRepresentativeChapters(processedChapters);

  // Generate description with selected chapters
  let fullDescription = "🕒 Chapters:\n\n";
  let addedChapters = 0;

  for (const chapter of representativeChapters) {
    const chapterText = processChapter(chapter);
    
    // Check if adding this chapter would exceed the limit
    const potentialDescription = fullDescription + 
      (fullDescription.endsWith('\n\n') ? '' : '\n\n') + 
      chapterText;
    
    if (potentialDescription.length > MAX_DESCRIPTION_LENGTH) {
      // If we've already added some chapters, truncate
      if (addedChapters > 0) {
        fullDescription += TRUNCATION_INDICATOR;
        break;
      }
    }
    
    // Add chapter with a blank line between
    fullDescription += (addedChapters > 0 ? '\n\n' : '') + chapterText;
    addedChapters++;
  }

  // Add footer
  fullDescription += "\n\nNote: Timestamps are approximate and based on the original transcript.";

  return fullDescription;
}

// Database setup
const dbPath = getDataPath("db");
const dbFile = join(dbPath, "sqlite.db");
const db = new Database(dbFile);

export async function processTranscript(videoId: string): Promise<void> {
  try {
    console.log("🔍 Fetching transcript for video:", videoId);
   
    // Flag to track if chapters need to be inserted
    let shouldInsertChapters = false;

    // Check if chapters already exist
    const existingChaptersStmt = db.prepare("SELECT COUNT(*) as count FROM chapters WHERE video_id = ?");
    const existingChaptersResult = existingChaptersStmt.get(videoId) as { count: number };
    
    if (existingChaptersResult.count === 0) {
      shouldInsertChapters = true;
    }

    const stmt = db.prepare("SELECT content FROM transcripts WHERE video_id = ?");
    const transcript = stmt.get(videoId) as Transcript | undefined;
    if (!transcript) {
      console.error("🚨 No transcript found for video:", videoId);
      return;
    }

    console.log("✂️ Segmenting transcript...");
    const chapters = segmentTranscript(transcript.content);

    console.log("📝 Generating summaries and titles...");
    const processedChapters: ProcessedChapter[] = await Promise.all(
      chapters.map(async (chapter) => {
        try {
          const summary = await generateBulletPointSummary(chapter.content);
          const title = generateChapterTitle(chapter.content, chapter.content.substring(0, 100));
          return {
            ...chapter,
            summary,
            title,
          };
        } catch (error) {
          console.error("Error processing chapter:", error);
          return {
            ...chapter,
            summary: chapter.content.substring(0, 200) + "...",
            title: `Chapter ${chapters.indexOf(chapter) + 1}`,
          };
        }
      })
    );

    // Only insert chapters if they don't exist
    if (shouldInsertChapters) {
      console.log("💾 Storing chapters in database...");
      const insertStmt = db.prepare(`
        INSERT INTO chapters (
          id,
          video_id,
          start_time,
          end_time,
          content,
          summary,
          title,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      db.transaction(() => {
        for (const chapter of processedChapters) {
          insertStmt.run(
            crypto.randomUUID(),
            videoId,
            chapter.start_time,
            chapter.end_time,
            chapter.content,
            chapter.summary,
            chapter.title
          );
        }
      })();

      console.log(`✅ Chapters inserted into database! 🎉 Found ${processedChapters.length} chapters`);
    } else {
      console.log(`📊 Found ${processedChapters.length} existing chapters`);
    }
    
    // Generate YouTube-style chapter description
    const youtubeChapterDescription = generateYouTubeChapterDescription(processedChapters);
    
    // Ensure youtube-descriptions directory exists
    const youtubeDescPath = join(getDataPath(""), "youtube-descriptions");
    await ensureDir(youtubeDescPath);
    
    // Write chapters to a file
    const descriptionFilePath = join(youtubeDescPath, `${videoId}_chapters.txt`);
    
    // Remove existing file if it exists
    try {
      await Deno.remove(descriptionFilePath);
      console.log(`🗑️ Removed existing chapter description file: ${descriptionFilePath}`);
    } catch (error) {
      // If file doesn't exist, this will throw a NotFound error, which we can safely ignore
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    }
    
    // Write the new file
    await Deno.writeTextFile(descriptionFilePath, youtubeChapterDescription);
    
    console.log(`📄 YouTube chapter description saved to: ${descriptionFilePath}`);

    // Simplified chapter logging
    console.log("📜 Chapter Details:");
    processedChapters.forEach((chapter, index) => {
      const cleanSummary = chapter.summary
        .replace(/🔹/g, '-')
        .replace(/\n/g, ' ')
        .trim();

      console.log(
        `\nChapter ${index + 1} (${chapter.start_time}s - ${chapter.end_time}s):`
      );
      console.log(`Title: ${chapter.title}`);
      console.log(`Summary: ${cleanSummary}`);
    });
  } catch (error) {
    console.error("Error processing transcript:", error);
    throw error;
  } finally {
    db.close();
  }
}

// Allow direct script execution
if (import.meta.main) {
  try {
    await processTranscript(Deno.args[0]);
  } catch (error) {
    console.error("Failed to process transcript:", error);
    Deno.exit(1);
  }
}