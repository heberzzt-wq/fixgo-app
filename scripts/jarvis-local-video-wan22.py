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


RUNNER_VERSION = "1.3.0-v142-wan-episode-master"
WAN22_SHOT_FRAME_COUNT = 121
MAX_SHOT_COUNT = 36
MAX_MASTER_DURATION_SECONDS = 180.0
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


def build_prompt(job: dict[str, Any], shot_prompt: str = "") -> str:
    parts: list[str] = []
    if shot_prompt:
        parts.append(str(shot_prompt).strip())
    else:
        parts.append(str(job.get("script") or "").strip())
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


def valid_resumable_shot(
    file: Path, ffprobe: str, config: dict[str, Any], size: str
) -> bool:
    if not file.is_file() or file.stat().st_size < 100000:
        return False
    try:
        media = inspect_video(file, ffprobe)
        verify_backend_media(media, config, size)
        return float(media.get("durationSeconds") or 0) >= 4.9
    except Exception:
        return False


def run_wan_shot(
    *,
    job: dict[str, Any],
    config: dict[str, Any],
    wan_root: Path,
    generate_script: Path,
    checkpoint_dir: Path,
    output_file: Path,
    size: str,
    reference_files: list[Path],
    prompt: str,
) -> None:
    command = [
        sys.executable,
        str(generate_script),
        "--task", str(config["task"]),
        "--size", size,
        "--frame_num", str(WAN22_SHOT_FRAME_COUNT),
        "--ckpt_dir", str(checkpoint_dir),
        *[str(value) for value in config["extra_args"]],
        "--save_file", str(output_file),
        "--prompt", build_prompt(job, prompt),
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


def master_episode(
    *,
    shot_files: list[Path],
    shot_plan: list[dict[str, Any]],
    output_file: Path,
    ffmpeg: str,
    duration_seconds: float,
    audio_file: Path | None,
) -> None:
    temporary_output = output_file.with_suffix(".mastering.mp4")
    inputs: list[str] = []
    filters: list[str] = []
    video_labels: list[str] = []
    for index, (shot_file, shot) in enumerate(zip(shot_files, shot_plan)):
        inputs.extend(["-i", str(shot_file)])
        label = f"v{index}"
        filters.append(
            f"[{index}:v]trim=duration={float(shot['durationSeconds']):.6f},"
            f"setpts=PTS-STARTPTS[{label}]"
        )
        video_labels.append(f"[{label}]")
    filters.append(
        f"{''.join(video_labels)}concat=n={len(video_labels)}:v=1:a=0[video]"
    )
    audio_input = (
        ["-i", str(audio_file)]
        if audio_file is not None
        else [
            "-f", "lavfi", "-t", f"{duration_seconds:.6f}",
            "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
        ]
    )
    filters.append(
        f"[{len(shot_files)}:a]apad,atrim=duration={duration_seconds:.6f},"
        "asetpts=PTS-STARTPTS[audio]"
    )
    command = [
        ffmpeg,
        "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
        *inputs,
        *audio_input,
        "-filter_complex", ";".join(filters),
        "-map", "[video]",
        "-map", "[audio]",
        "-t", f"{duration_seconds:.6f}",
        "-r", "24",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        str(temporary_output),
    ]
    completed = subprocess.run(command, check=False, timeout=1800)
    if completed.returncode != 0:
        raise RuntimeError(f"LOCAL_VIDEO_MASTERING_EXIT_{completed.returncode}")
    os.replace(temporary_output, output_file)


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
    ffmpeg = os.environ.get("JARVIS_FFMPEG_PATH") or shutil.which("ffmpeg")
    if not ffprobe:
        raise RuntimeError("LOCAL_VIDEO_FFPROBE_UNAVAILABLE")
    if not ffmpeg:
        raise RuntimeError("LOCAL_VIDEO_FFMPEG_UNAVAILABLE")
    output_file.parent.mkdir(parents=True, exist_ok=True)
    audio_file_raw = str(job.get("audioFile") or "").strip()
    audio_file = Path(audio_file_raw).resolve() if audio_file_raw else None
    if audio_file is not None and not audio_file.is_file():
        raise RuntimeError("LOCAL_VIDEO_AUDIO_REFERENCE_NOT_FOUND")
    aspect_ratio = "16:9" if job.get("aspectRatio") == "16:9" else "9:16"
    size = str(
        config["landscape_size"] if aspect_ratio == "16:9" else config["portrait_size"]
    )
    shot_plan = list(job.get("shotPlan") or [])
    requested_duration = float(job.get("requestedDurationSeconds") or 0)
    if shot_plan:
        if (
            len(shot_plan) > MAX_SHOT_COUNT
            or not 0 < requested_duration <= MAX_MASTER_DURATION_SECONDS
            or abs(sum(float(shot.get("durationSeconds") or 0) for shot in shot_plan) - requested_duration) > 0.001
        ):
            raise RuntimeError("LOCAL_VIDEO_SHOT_PLAN_INVALID")
        shot_root = output_file.parent / f"shots-{job.get('operationId') or 'episode'}"
        shot_root.mkdir(parents=True, exist_ok=True)
        shot_files: list[Path] = []
        for index, shot in enumerate(shot_plan):
            duration = float(shot.get("durationSeconds") or 0)
            prompt = str(shot.get("prompt") or "").strip()
            if not prompt or not 0 < duration <= 5:
                raise RuntimeError("LOCAL_VIDEO_SHOT_PLAN_INVALID")
            shot_file = shot_root / f"shot-{index + 1:03d}.mp4"
            if not valid_resumable_shot(shot_file, ffprobe, config, size):
                if shot_file.exists():
                    shot_file.unlink()
                run_wan_shot(
                    job=job,
                    config=config,
                    wan_root=wan_root,
                    generate_script=generate_script,
                    checkpoint_dir=checkpoint_dir,
                    output_file=shot_file,
                    size=size,
                    reference_files=reference_files,
                    prompt=prompt,
                )
            if not valid_resumable_shot(shot_file, ffprobe, config, size):
                raise RuntimeError("LOCAL_VIDEO_PHYSICAL_SHOT_INVALID")
            shot_files.append(shot_file)
        master_episode(
            shot_files=shot_files,
            shot_plan=shot_plan,
            output_file=output_file,
            ffmpeg=ffmpeg,
            duration_seconds=requested_duration,
            audio_file=audio_file,
        )
    else:
        run_wan_shot(
            job=job,
            config=config,
            wan_root=wan_root,
            generate_script=generate_script,
            checkpoint_dir=checkpoint_dir,
            output_file=output_file,
            size=size,
            reference_files=reference_files,
            prompt="",
        )
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
            "shotCount": len(shot_plan) if shot_plan else 1,
            "requestedDurationSeconds": requested_duration if shot_plan else None,
            "masteringMode": "ffmpeg_multishot_episode" if shot_plan else "single_wan_shot",
            "audioIncluded": bool(audio_file) if shot_plan else False,
            "audioMixMode": (
                "narration_padded_to_episode" if shot_plan and audio_file is not None
                else "silent_episode_bed" if shot_plan
                else "none"
            ),
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
