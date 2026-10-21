#!/usr/bin/env python3
"""Local-only word-timestamp ASR for a host-generated WAV. No reference transcript."""
import argparse
import hashlib
import json
import os
from pathlib import Path

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["CUDA_VISIBLE_DEVICES"] = ""

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", required=True)
    args = parser.parse_args()
    audio = Path(args.audio).resolve(strict=True)
    model_dir = Path(args.model).resolve(strict=True)
    if not audio.is_file() or audio.suffix.lower() != ".wav":
        raise ValueError("LOCAL_ASR_WAV_REQUIRED")
    if not model_dir.is_dir() or not (model_dir / "model.bin").is_file():
        raise ValueError("LOCAL_ASR_MODEL_REQUIRED")
    data = audio.read_bytes()
    if len(data) > 8_000_000 or len(data) < 32044:
        raise ValueError("LOCAL_ASR_AUDIO_LENGTH_INVALID")
    from faster_whisper import WhisperModel
    recognizer = WhisperModel(str(model_dir), device="cpu", compute_type="int8",
                               local_files_only=True, cpu_threads=4)
    items, info = recognizer.transcribe(
        str(audio), language="es", beam_size=5, word_timestamps=True,
        vad_filter=False, condition_on_previous_text=False)
    words = []
    for segment in items:
        for word in (segment.words or []):
            if word.start is None or word.end is None:
                raise ValueError("LOCAL_ASR_WORD_TIMESTAMPS_REQUIRED")
            words.append({"text": word.word, "startSeconds": float(word.start),
                          "durationSeconds": float(word.end - word.start)})
    print(json.dumps({
        "completed": True, "provider": "faster-whisper", "language": "es",
        "sourceWaveSha256": hashlib.sha256(data).hexdigest(),
        "segments": words,
    }, ensure_ascii=True, separators=(",", ":")))

if __name__ == "__main__":
    main()
