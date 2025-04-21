import { execWithLogs, getDataPath } from "./utils.ts";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { ensureDirExists } from "./utils.ts";

export interface SpeakerSegment {
  start: number;
  end: number;
  speaker: string;
}

export async function diarizeAudio(audioFile: string, videoId: string): Promise<SpeakerSegment[]> {
  console.log("🔊 Starting speaker diarization with PyAnnote...");

  const outputDir = getDataPath("diarization");
  await ensureDirExists(outputDir);
  const outputFile = join(outputDir, `diarization_${videoId}.json`);

  try {
    // Run the PyAnnote diarization script
    const pythonScript = join(Deno.cwd(), "src", "python", "diarize.py");

    await execWithLogs([
      "python3",
      pythonScript,
      "--audio",
      audioFile,
      "--output",
      outputFile
    ]);

    // Read and parse the diarization results
    const diarizationData = await Deno.readTextFile(outputFile);
    return JSON.parse(diarizationData) as SpeakerSegment[];
  } catch (error) {
    console.error("❌ Error during diarization:", error);
    console.log("⚠️ Falling back to transcription without speaker identification");
    return [];
  }
}

export function integrateTranscriptWithSpeakers(
    transcript: any,
    speakerSegments: SpeakerSegment[]
): any {
  // If no speaker segments, return the original transcript
  if (!speakerSegments || speakerSegments.length === 0) {
    console.log("⚠️ No speaker segments found, using transcript without speaker labels");
    return transcript;
  }

  console.log("🔀 Integrating transcript with speaker information...");

  const segments = transcript.segments.map((segment: any) => {
    // Find the speaker for this segment based on temporal overlap
    const speaker = findSpeakerForSegment(segment, speakerSegments);
    return {
      ...segment,
      speaker
    };
  });

  // Update the combined text to include speaker information
  const textWithSpeakers = segments
      .map((segment: any) => `[${segment.speaker}]: ${segment.text}`)
      .join(" ");

  return {
    ...transcript,
    text: textWithSpeakers,
    segments
  };
}

function findSpeakerForSegment(segment: any, speakerSegments: SpeakerSegment[]): string {
  // Default speaker if no match is found
  let speaker = "UNKNOWN";

  // Calculate the midpoint of the segment
  const segmentMidpoint = (segment.start + segment.end) / 2;

  // Find the speaker segment that contains this midpoint
  for (const speakerSegment of speakerSegments) {
    if (segmentMidpoint >= speakerSegment.start && segmentMidpoint <= speakerSegment.end) {
      speaker = speakerSegment.speaker;
      break;
    }
  }

  return speaker;
}