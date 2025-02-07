import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

export interface Video {
  id: string;
  file_path: string;
  created_at: string;
}

export interface Transcript {
  id: string;
  video_id: string;
  content: string;
  segments: string;
  created_at: string;
}

export const WhisperOutput = z.object({
  text: z.string(),
  segments: z.array(z.object({
    id: z.number(),
    start: z.number(),
    end: z.number(),
    text: z.string()
  }))
});
  
  export type WhisperOutput = z.infer<typeof WhisperOutput>;
  
  export type VideoRow = [string, string, string];
  export type TranscriptRow = [string, string, string, string, string];
  
  export type VideoParams = Record<keyof Video, string>;
  export type TranscriptParams = Record<keyof Transcript, string>;