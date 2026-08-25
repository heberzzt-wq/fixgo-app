"""Offline Wan runner for the Jarvis V142 local video worker.

This process never calls a hosted inference API. It delegates generation to a
locally checked-out official Wan repository and writes a durable result manifest
consumed and independently verified by the Node bridge.

The filename is retained for V142/backward compatibility. The worker accepts
both the existing Wan2.2 TI2V-5B backend and an explicit lightweight Wan2.1
T2V-1.3B backend without changing the public video.generate contract.
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


RUNNER_VERSION = "1.2.0-v142-wan-physical-integrity"
DEFAULT_BACKEND = "wan22-ti2v-5b"
BACKENDS: dict[str, dict[str, Any]] = {
    "wan22-ti2v-5b": {
        "model": "Wan2.2-TI2V-5B",
        "repo_env": "JARVIS_WAN22_REPO_DIR",
        "task": "ti2v-5B",
        # Official TI2V-5B 720P geometry is 1280*704 / 704*1280.
        "portrait_size": "704*1280",
        "landscape_size": "1280*704",
        "target_fps": 24.0,
        "reference_assets": True,
        "max_reference_assets": 1,
        "extra_args": ["--offload_model", "True", "--t5_cpu", "--convert_model_dtype"],
    },
    "wan21-t2v-1.3b": {
        "model": "Wan2.1-T2V-1.3B",
        "repo_env": "JARVIS_WAN21_REPO_DIR",
        "task": "t2v-1.3B",
        "portrait_size": "480*832",
        "landscape_size": "832*480",
        "target_fps": 16.0,
        "reference_assets": False,
        "max_reference_assets": 0,
        "extra_args": [
            "--offload_model", "True",
            "--t5_cpu",
            "--sample_shift", "8",
            "--sample_guide_scale", "6",
        ],
    },
}


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


def parse_size(value: str) -> tuple[int, int]:
    width, separator, height = str(value).partition("*")
    if separator != "*" or not width.isdigit() or not height.isdigit():
        raise RuntimeError("LOCAL_VIDEO_BACKEND_SIZE_INVALID")
    return int(width), int(height)


def verify_backend_media(media: dict[str, Any], config: dict[str, Any], size: str) -> None:
    expected_width, expected_height = parse_size(size)
    if int(media.get("width") or 0) != expected_width or int(media.get("height") or 0) != expected_height:
        raise RuntimeError("LOCAL_VIDEO_DIMENSIONS_MISMATCH")
    if float(media.get("durationSeconds") or 0) <= 0:
        raise RuntimeError("LOCAL_VIDEO_DURATION_INVALID")
    if float(media.get("fps") or 0) + 0.01 < float(config["target_fps"]):
        raise RuntimeError("LOCAL_VIDEO_FPS_BELOW_BACKEND_TARGET")


def build_prompt(job: dict[str, Any]) -> str:
    parts = [str(job.get("script") or "").strip()]
    parts.extend(str(value or "").strip() for value in job.get("prompts") or [])
    parts.append(
        "Maintain the same explicitly assigned character, wardrobe, location, "
        "body profile and narrative continuity throughout the generated shot."
    )
    return " ".join(value for value in parts if value)[:10000]


def resolve_backend(job: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    backend = str(job.get("backend") or DEFAULT_BACKEND).strip().lower()
    config = BACKENDS.get(backend)
    if config is None:
        raise RuntimeError("LOCAL_VIDEO_BACKEND_UNSUPPORTED")
    expected_model = str(config["model"])
    requested_model = str(job.get("model") or expected_model).strip()
    if requested_model != expected_model:
        raise RuntimeError("LOCAL_VIDEO_BACKEND_MODEL_MISMATCH")
    return backend, config


def offline_environment() -> dict[str, str]:
    environment = dict(os.environ)
    for key in (
        "DASHSCOPE_API_KEY",
        "GOOGLE_API_KEY",
        "OPENAI_API_KEY",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "GEMINI_API_KEY",
        "ANTHROPIC_API_KEY",
        "AZURE_OPENAI_API_KEY",
        "HF_TOKEN",
        "HUGGING_FACE_HUB_TOKEN",
    ):
        environment.pop(key, None)
    environment["JARVIS_LOCAL_VIDEO_EXTERNAL_API_ALLOWED"] = "false"
    environment["HF_HUB_OFFLINE"] = "1"
    environment["TRANSFORMERS_OFFLINE"] = "1"
    environment["WANDB_MODE"] = "offline"
    return environment


def run(job_file: Path, result_file: Path) -> int:
    job = read_json(job_file)
    if job.get("externalApiAllowed") is not False:
        raise RuntimeError("LOCAL_VIDEO_EXTERNAL_API_MUST_BE_DISABLED")
    if os.environ.get("JARVIS_LOCAL_VIDEO_EXTERNAL_API_ALLOWED", "false").lower() != "false":
        raise RuntimeError("LOCAL_VIDEO_PROCESS_NETWORK_POLICY_INVALID")

    backend, config = resolve_backend(job)
    repo_env = str(config["repo_env"])
    wan_root_raw = str(os.environ.get(repo_env, "")).strip()
    if not wan_root_raw:
        raise RuntimeError("LOCAL_VIDEO_WAN_REPOSITORY_NOT_CONFIGURED")
    wan_root = Path(wan_root_raw).resolve()
    generate_script = wan_root / "generate.py"
    checkpoint_dir = Path(str(job.get("modelDirectory") or "")).resolve()
    output_file = Path(str(job.get("outputFile") or "")).resolve()
    if not generate_script.is_file():
        raise RuntimeError("LOCAL_VIDEO_WAN_REPOSITORY_NOT_READY")
    if not checkpoint_dir.is_dir():
        raise RuntimeError("LOCAL_VIDEO_MODEL_NOT_READY")

    reference_files = [
        Path(str(value)).resolve()
        for value in job.get("referenceFiles") or []
        if str(value).strip()
    ]
    if reference_files and not bool(config["reference_assets"]):
        raise RuntimeError("LOCAL_VIDEO_REFERENCES_UNSUPPORTED_BY_BACKEND")
    if len(reference_files) > int(config["max_reference_assets"]):
        raise RuntimeError("LOCAL_VIDEO_REFERENCE_LIMIT_EXCEEDED")
    for reference_file in reference_files:
        if not reference_file.is_file():
            raise RuntimeError("LOCAL_VIDEO_REFERENCE_NOT_FOUND")

    ffprobe = os.environ.get("JARVIS_FFPROBE_PATH") or shutil.which("ffprobe")
    if not ffprobe:
        raise RuntimeError("LOCAL_VIDEO_FFPROBE_UNAVAILABLE")
    output_file.parent.mkdir(parents=True, exist_ok=True)
    aspect_ratio = "16:9" if job.get("aspectRatio") == "16:9" else "9:16"
    size = str(
        config["landscape_size"] if aspect_ratio == "16:9" else config["portrait_size"]
    )
    command = [
        sys.executable,
        str(generate_script),
        "--task", str(config["task"]),
        "--size", size,
        "--ckpt_dir", str(checkpoint_dir),
        *[str(value) for value in config["extra_args"]],
        "--save_file", str(output_file),
        "--prompt", build_prompt(job),
    ]
    if reference_files:
        command.extend(["--image", str(reference_files[0])])

    completed = subprocess.run(
        command,
        cwd=wan_root,
        env=offline_environment(),
        check=False,
        timeout=int(os.environ.get("JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS", "7200")),
    )
    if completed.returncode != 0:
        raise RuntimeError(f"LOCAL_VIDEO_WAN_EXIT_{completed.returncode}")
    if not output_file.is_file() or output_file.stat().st_size < 100000:
        raise RuntimeError("LOCAL_VIDEO_PHYSICAL_OUTPUT_INVALID")
    media = inspect_video(output_file, ffprobe)
    verify_backend_media(media, config, size)
    write_json_atomic(
        result_file,
        {
            "ok": True,
            "status": "LOCAL_VIDEO_RUNNER_COMPLETED",
            "runnerVersion": RUNNER_VERSION,
            "operationId": str(job.get("operationId") or ""),
            "operationName": str(job.get("operationName") or ""),
            "output": str(job.get("output") or ""),
            "mimeType": "video/mp4",
            "backend": backend,
            "model": str(config["model"]),
            "engine": "local",
            "provider": "local",
            "externalApiUsed": False,
            "externalEstimatedCostUsd": 0,
            "referenceAssetCount": len(reference_files),
            "referenceAssetLimit": int(config["max_reference_assets"]),
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
    job: dict[str, Any] = {}
    try:
        job = read_json(job_file)
        return run(job_file, result_file)
    except Exception as error:  # durable manifest is the worker contract
        error_text = str(error) or "LOCAL_VIDEO_RUNNER_FAILED"
        retryable = (
            error_text.startswith("LOCAL_VIDEO_WAN_EXIT_")
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
                "operationId": str(job.get("operationId") or ""),
                "operationName": str(job.get("operationName") or ""),
                "backend": str(job.get("backend") or DEFAULT_BACKEND),
                "model": str(job.get("model") or ""),
                "engine": "local",
                "provider": "local",
                "externalApiUsed": False,
                "externalEstimatedCostUsd": 0,
            },
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())