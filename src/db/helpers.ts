import { Database } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import { Video, Transcript, VideoRow, TranscriptRow, VideoParams, TranscriptParams } from "../types.ts";
import { executeQuery, getSingleRow, getRows } from "./utils.ts";

const transformVideo = ([id, file_path, created_at]: VideoRow): Video => ({
  id,
  file_path,
  created_at
});

const transformTranscript = ([id, video_id, content, segments, created_at]: TranscriptRow): Transcript => ({
  id,
  video_id,
  content,
  segments,
  created_at
});

export function insertVideo(db: Database, video: Video) {
  const params: VideoParams = {
    id: video.id,
    file_path: video.file_path,
    created_at: video.created_at
  };

  executeQuery(db,
    `INSERT INTO videos (id, file_path, created_at)
     VALUES (:id, :file_path, :created_at)`,
    params
  );
}

export function getVideoById(db: Database, id: string): Video | null {
  return getSingleRow<VideoRow, Video>(
    db,
    "SELECT * FROM videos WHERE id = :id",
    { id },
    transformVideo
  );
}

export function getAllVideos(db: Database): Video[] {
  return getRows<VideoRow, Video>(
    db,
    "SELECT * FROM videos ORDER BY created_at DESC",
    {},
    transformVideo
  );
}

export function insertTranscript(db: Database, transcript: Transcript) {
  const params: TranscriptParams = {
    id: transcript.id,
    video_id: transcript.video_id,
    content: transcript.content,
    segments: transcript.segments,
    created_at: transcript.created_at
  };

  executeQuery(db,
    `INSERT INTO transcripts (id, video_id, content, segments, created_at)
     VALUES (:id, :video_id, :content, :segments, :created_at)`,
    params
  );
}

export function getTranscriptByVideoId(db: Database, videoId: string): Transcript | null {
  return getSingleRow<TranscriptRow, Transcript>(
    db,
    "SELECT * FROM transcripts WHERE video_id = :video_id",
    { video_id: videoId },
    transformTranscript
  );
}

export function searchTranscripts(db: Database, searchQuery: string): Transcript[] {
  return getRows<TranscriptRow, Transcript>(
    db,
    "SELECT * FROM transcripts WHERE content LIKE :search",
    { search: `%${searchQuery}%` },
    transformTranscript
  );
}

export function deleteTranscriptByVideoId(db: Database, videoId: string) {
    db.run("DELETE FROM transcripts WHERE video_id = ?", [videoId]);
}

export function deleteVideoById(db: Database, videoId: string) {
    db.run("DELETE FROM videos WHERE id = ?", [videoId]);
}