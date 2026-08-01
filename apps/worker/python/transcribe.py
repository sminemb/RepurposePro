"""Emit a bounded JSON transcript contract for the TypeScript worker."""

from __future__ import annotations

import argparse
import json
from typing import Any

from faster_whisper import WhisperModel


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--device", required=True, choices=("auto", "cpu", "cuda"))
    parser.add_argument("--compute-type", required=True)
    parser.add_argument("--language", required=True, choices=("en",))
    parser.add_argument("--word-timestamps", action="store_true")
    return parser.parse_args()


def word_contract(word: Any) -> dict[str, Any]:
    return {
        "startSeconds": word.start,
        "endSeconds": word.end,
        "text": word.word,
        "probability": word.probability,
    }


def main() -> None:
    args = parse_args()
    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    generated_segments, info = model.transcribe(
        args.audio,
        language=args.language,
        word_timestamps=args.word_timestamps,
    )

    segments: list[dict[str, Any]] = []
    for sequence, segment in enumerate(generated_segments):
        contract: dict[str, Any] = {
            "sequence": sequence,
            "startSeconds": segment.start,
            "endSeconds": segment.end,
            "text": segment.text.strip(),
            "words": None,
        }
        if args.word_timestamps and segment.words is not None:
            contract["words"] = [word_contract(word) for word in segment.words]
        segments.append(contract)

    result = {
        "language": args.language,
        "durationSeconds": info.duration,
        "text": " ".join(segment["text"] for segment in segments).strip(),
        "segments": segments,
    }
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")), flush=True)


if __name__ == "__main__":
    main()
