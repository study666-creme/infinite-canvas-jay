#!/usr/bin/env python3
import argparse
import sys


def timestamp(seconds: float) -> str:
    milliseconds = max(0, round(seconds * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1_000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe video audio to SRT with faster-whisper")
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", default="")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper is not installed", file=sys.stderr)
        return 3

    model = WhisperModel(args.model, device="auto", compute_type="auto")
    segments, _info = model.transcribe(
        args.input,
        language=args.language or None,
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=True,
    )
    count = 0
    with open(args.output, "w", encoding="utf-8", newline="\n") as stream:
        for segment in segments:
            text = segment.text.strip()
            if not text:
                continue
            count += 1
            stream.write(f"{count}\n{timestamp(segment.start)} --> {timestamp(segment.end)}\n{text}\n\n")
    if count == 0:
        print("No speech segments were detected", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
