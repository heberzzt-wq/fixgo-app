"""Offline Wan2.2 TI2V-5B runner for the Jarvis local video worker.

This process never calls a hosted inference API. It delegates generation to a
locally checked-out official Wan2.2 repository and writes a deterministic result
manifest consumed and independently verified by the Node bridge.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from typing import Any


RUNNER_VERSION = "1.0.0-v142-wan22-ti2v5b-offline"


def read_json(file: Path) -> dict[str, Any]:
    return json.loads(file.read_text(encoding="utf-8"))


def write_json_atomic(file: Path, value: dict[str, Any]) -> None:
    file.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f"{file.name}.", suffix=".tmp", dir=file.parent
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.replace(temporary_name, file)
    except Exception:
        try:
            os.unlink(temporary_name)
        except OSError:
            pass
        raise


def parse_fraction(value: str) -> float:
    numerator, _, denominator = str(value or "0/1").partition("/")
    divisor = float(denominator or "1")
    return float(numerator or "0") / divisor if divisor else 0.0


def inspect_video(file: Path, ffprobe: str) -> dict[str, Any]:
    completed = subprocess.run(
        [
            ffprobe,
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,avg_frame_rate:format=duration",
            "-of", "json",
            str(file),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=60,
    )
    payload = json.loads(completed.stdout)
    stream = (payload.get("streams") or [{}])[0]
    return {
        "durationSeconds": float((payload.get("format") or {}).get("duration") or 0),
        "fps": parse_fraction(stream.get("avg_frame_rate") or "0/1"),
        "width": int(stream.get("width") or 0),
        "height": int(stream.get("height") or 0),
    }


def build_prompt(job: dict[str, Any]) -> str:
    parts = [str(job.get("script") or "").strip()]
    parts.extend(str(value or "").strip() for value in job.get("prompts") or [])
    parts.append(
        "Maintain the same explicitly assigned character, wardrobe, location, "
        "body profile and narrative continuity throughout the generated shot."
    )
    return " ".join(value for value in parts if value)[:10000]


def run(job_file: Path, result_file: Path) -> int:
    job = read_json(job_file)
    if job.get("externalApiAllowed") is not False:
        raise RuntimeError("LOCAL_VIDEO_EXTERNAL_API_MUST_BE_DISABLED")
    if os.environ.get("JARVIS_LOCAL_VIDEO_EXTERNAL_API_ALLOWED", "false").lower() != "false":
        raise RuntimeError("LOCAL_VIDEO_PROCESS_NETWORK_POLICY_INVALID")

    wan_root = Path(os.environ.get("JARVIS_WAN22_REPO_DIR", "")).resolve()
    generate_script = wan_root / "generate.py"
    checkpoint_dir = Path(str(job.get("modelDirectory") or "")).resolve()
    output_file = Path(str(job.get("outputFile") or "")).resolve()
    if not generate_script.is_file():
        raise RuntimeError("LOCAL_VIDEO_WAN22_REPOSITORY_NOT_READY")
    if not checkpoint_dir.is_dir():
        raise RuntimeError("LOCAL_VIDEO_MODEL_NOT_READY")

    ffprobe = os.environ.get("JARVIS_FFPROBE_PATH") or shutil.which("ffprobe")
    if not ffprobe:
        raise RuntimeError("LOCAL_VIDEO_FFPROBE_UNAVAILABLE")
    output_file.parent.mkdir(parents=True, exist_ok=True)
    aspect_ratio = "16:9" if job.get("aspectRatio") == "16:9" else "9:16"
    size = "1280*720" if aspect_ratio == "16:9" else "720*1280"
    command = [
        sys.executable,
        str(generate_script),
        "--task", "ti2v-5B",
        "--size", size,
        "--ckpt_dir", str(checkpoint_dir),
        "--offload_model", "True",
        "--t5_cpu",
        "--convert_model_dtype",
        "--save_file", str(output_file),
        "--prompt", build_prompt(job),
    ]
    reference_files = [
        Path(str(value)).resolve()
        for value in job.get("referenceFiles") or []
        if str(value).strip()
    ]
    if reference_files:
        if not reference_files[0].is_file():
            raise RuntimeError("LOCAL_VIDEO_PRIMARY_REFERENCE_NOT_FOUND")
        command.extend(["--image", str(reference_files[0])])

    environment = dict(os.environ)
    environment.pop("DASHSCOPE_API_KEY", None)
    environment.pop("GOOGLE_API_KEY", None)
    environment.pop("OPENAI_API_KEY", None)
    environment.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
    environment.pop("GEMINI_API_KEY", None)
    environment.pop("HF_TOKEN", None)
    environment.pop("HUGGING_FACE_HUB_TOKEN", None)
    environment["HF_HUB_OFFLINE"] = "1"
    environment["TRANSFORMERS_OFFLINE"] = "1"
    environment["WANDB_MODE"] = "offline"
    completed = subprocess.run(
        command,
        cwd=wan_root,
        env=environment,
        check=False,
        timeout=int(os.environ.get("JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS", "7200")),
    )
    if completed.returncode != 0:
        raise RuntimeError(f"LOCAL_VIDEO_WAN22_EXIT_{completed.returncode}")
    if not output_file.is_file() or output_file.stat().st_size < 100000:
        raise RuntimeError("LOCAL_VIDEO_PHYSICAL_OUTPUT_INVALID")
    media = inspect_video(output_file, ffprobe)
    write_json_atomic(
        result_file,
        {
            "ok": True,
            "status": "LOCAL_VIDEO_RUNNER_COMPLETED",
            "runnerVersion": RUNNER_VERSION,
            "output": str(job.get("output") or ""),
            "mimeType": "video/mp4",
            "model": "Wan2.2-TI2V-5B",
            "engine": "local",
            "provider": "local",
            "externalApiUsed": False,
            "externalEstimatedCostUsd": 0,
            "referenceAssetCount": len(reference_files),
            "primaryReferenceUsed": str(reference_files[0]) if reference_files else None,
            **media,
        },
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", required=True)
    parser.add_argument("--result", required=True)
    args = parser.parse_args()
    job_file = Path(args.job).resolve()
    result_file = Path(args.result).resolve()
    try:
        return run(job_file, result_file)
    except Exception as error:  # the durable manifest is the worker contract
        error_text = str(error) or "LOCAL_VIDEO_RUNNER_FAILED"
        retryable = (
            error_text.startswith("LOCAL_VIDEO_WAN22_EXIT_")
            or "timed out" in error_text.lower()
            or "out of memory" in error_text.lower()
        )
        write_json_atomic(
            result_file,
            {
                "ok": False,
                "status": error_text,
                "error": error_text,
                "retryable": retryable,
                "runnerVersion": RUNNER_VERSION,
                "engine": "local",
                "provider": "local",
                "externalApiUsed": False,
                "externalEstimatedCostUsd": 0,
            },
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
