#!/usr/bin/env python3
import argparse
import json
import os
from pyannote.audio import Pipeline

def diarize_audio(audio_file, output_file):
    """
    Perform speaker diarization on an audio file using PyAnnote.
    """
    print(f"Starting diarization for {audio_file}")

    # Access token is required for PyAnnote
    access_token = os.environ.get("HUGGINGFACE_TOKEN")

    if not access_token:
        print("WARNING: HUGGINGFACE_TOKEN not set in environment. Diarization may fail.")
        print("Please set the HUGGINGFACE_TOKEN environment variable with a valid HuggingFace token.")

    # Initialize the diarization pipeline
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization@2.1",
        use_auth_token=access_token
    )

    # Apply the pipeline to the audio file
    diarization = pipeline(audio_file)

    # Convert the diarization result to a list of segments
    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append({
            "start": turn.start,
            "end": turn.end,
            "speaker": f"SPEAKER_{speaker}"
        })

    # Write the segments to the output file
    with open(output_file, "w") as f:
        json.dump(segments, f, indent=2)

    print(f"Diarization complete. Found {len(segments)} speaker segments.")
    print(f"Results saved to {output_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Speaker diarization using PyAnnote")
    parser.add_argument("--audio", required=True, help="Path to the audio file")
    parser.add_argument("--output", required=True, help="Path to save the diarization results")
    args = parser.parse_args()

    diarize_audio(args.audio, args.output)