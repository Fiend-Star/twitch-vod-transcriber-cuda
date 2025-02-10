import { Database } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import { generateChapterTitle, generateBulletPointSummary, segmentTranscript, RawChapter } from "./chapterUtils.ts";
import { getDataPath } from "./utils.ts";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";

// Types
interface Transcript {
  content: string;
}

interface ProcessedChapter extends RawChapter {
  summary: string;
  title: string;
}

// Database setup
const dbPath = getDataPath("db");
const dbFile = join(dbPath, "sqlite.db");
const db = new Database(dbFile);

export async function processTranscript(videoId: string): Promise<void> {
  try {
    console.log("🔍 Fetching transcript for video:", videoId);
    
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

    console.log(`✅ Processing complete! 🎉 Found ${processedChapters.length} chapters`);
    console.log("📜 Chapter Titles and Summaries:");
    processedChapters.forEach((chapter, index) => {
      console.log(
        `\n📌 Chapter ${index + 1} (${chapter.start_time}s - ${chapter.end_time}s):`
      );
      console.log(`📖 Title: ${chapter.title}`);
      console.log(`📝 Summary: ${chapter.summary}`);
    });

  } catch (error) {
    console.error("Error processing transcript:", error);
    throw error;
  } finally {
    db.close();
  }
}

if (import.meta.main) {
  try {
    await processTranscript(Deno.args[0]);
  } catch (error) {
    console.error("Failed to process transcript:", error);
    Deno.exit(1);
  }
}