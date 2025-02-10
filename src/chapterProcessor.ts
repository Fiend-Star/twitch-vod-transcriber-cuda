import { Database } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import { summariseText, segmentTranscript } from "./chapterUtils.ts";
import { getDataPath } from "./utils.ts";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";

const dbPath = getDataPath("db");
const dbFile = join(dbPath, "sqlite.db");
const db = new Database(dbFile);

export async function processTranscript(videoId: string) {
  console.log("🔍 Fetching transcript for video:", videoId);
  
  const transcript = db.prepare("SELECT content FROM transcripts WHERE video_id = ?").get(videoId);
  if (!transcript) {
    console.error("🚨 No transcript found for video:", videoId);
    return;
  }

  console.log("✂️ Segmenting transcript...");
  const chapters = await segmentTranscript(transcript.content);

  console.log("📝 Generating summaries...");
  const processedChapters = chapters.map((chapter) => ({
    ...chapter,
    summary: summariseText(chapter.content),
  }));

  console.log("💾 Storing chapters in database...");
  const stmt = db.prepare(
    `INSERT INTO chapters (id, video_id, start_time, end_time, content, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  );
  
  for (const chapter of processedChapters) {
    stmt.run(
      crypto.randomUUID(),
      videoId,
      chapter.start_time,
      chapter.end_time,
      chapter.content,
      chapter.summary
    );
  }

  console.log("✅ Processing complete! 🎉");
}
