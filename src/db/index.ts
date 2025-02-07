// src/db/index.ts
import { Database } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import { getDataPath } from "../utils.ts";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";

export function initDb() {
  const dbPath = getDataPath("db");
  const dbFile = join(dbPath, "sqlite.db");
  const db = new Database(dbFile);

  db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      file_path TEXT,
      created_at TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS transcripts (
      id TEXT PRIMARY KEY,
      video_id TEXT REFERENCES videos(id),
      content TEXT,
      segments TEXT,
      created_at TEXT
    )
  `);

  return db;
}

export * from "./helpers.ts";