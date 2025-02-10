import { Database } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import {
  summariseText,
  segmentTranscript,
  generateChapterTitle, 
} from "./chapterUtils.ts";
import { getDataPath } from "./utils.ts";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { Transcript } from "./types.ts";

const dbPath = getDataPath("db");
const dbFile = join(dbPath, "sqlite.db");
const db = new Database(dbFile);

export function processTranscript(videoId: string) {
  console.log("🔍 Fetching transcript for video:", videoId);

  const transcript = db
    .prepare("SELECT content FROM transcripts WHERE video_id = ?")
    .get(videoId) as Transcript;
  if (!transcript) {
    console.error("🚨 No transcript found for video:", videoId);
    return;
  }

  console.log("✂️ Segmenting transcript...");
  const chapters = segmentTranscript(transcript.content);

  console.log("📝 Generating summaries and titles...");
  const processedChapters = chapters.map((chapter) => {
    const summary = summariseText(chapter.content);
    const title = generateChapterTitle(chapter.content, summary);
    return {
      ...chapter,
      summary,
      title,
    };
  });

  console.log("💾 Storing chapters in database...");
  // NOTE: Make sure the chapters table now has a 'title' column.
  const stmt = db.prepare(
    `INSERT INTO chapters (id, video_id, start_time, end_time, content, summary, title, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  );

  for (const chapter of processedChapters) {
    stmt.run(
      crypto.randomUUID(),
      videoId,
      chapter.start_time,
      chapter.end_time,
      chapter.content,
      chapter.summary,
      chapter.title
    );
  }

  console.log(`✅ Processing complete! 🎉. Found ${processedChapters.length}`);

  console.log("📜 Chapter Titles and Summaries:");
  processedChapters.forEach((chapter, index) => {
    console.log(
      `\n📌 Chapter ${index + 1} (${chapter.start_time}s - ${chapter.end_time}s):`
    );
    console.log(`📖 Title: ${chapter.title}`);
    console.log(`📝 Summary: ${chapter.summary}`);
  });
}

processTranscript("2376036725");
