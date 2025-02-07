import { Database } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import { Video } from "./types.ts";
import { insertVideo } from "./db/helpers.ts";

export function saveVideoMetadata(db: Database, video: Video) {
  insertVideo(db, {
    id: video.id,
    file_path: video.file_path,
    created_at: new Date().toISOString()
  });
}