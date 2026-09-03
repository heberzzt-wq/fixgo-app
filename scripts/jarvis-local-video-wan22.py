"""Offline video runner for the Jarvis V142 local video worker.

This process never calls a hosted inference API. It delegates generation to a
locally checked-out official runtime and writes a durable result manifest
consumed and independently verified by the Node bridge.

The filename is retained for V142/backward compatibility. The worker accepts
the existing Wan2.2 TI2V-5B backend, the explicit lightweight Wan2.1 T2V-1.3B
backend, and a pinned HuMo identity candidate that remains physically uncertified
and non-executable until the existing authority explicitly certifies it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from typing import Any


RUNNER_VERSION = "1.3.1-v142-wan-episode-master"
WAN22_SHOT_FRAME_COUNT = 121
MAX_SHOT_COUNT = 36
MAX_MASTER_DURATION_SECONDS = 180.0
DEFAULT_BACKEND = "wan22-ti2v-5b"


class PhysicalShotInvalid(RuntimeError):
    def __init__(self, evidence: dict[str, Any]):
        super().__init__("LOCAL_VIDEO_PHYSICAL_SHOT_INVALID")
        self.evidence = evidence


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
    "humo-1.7b-identity": {
        "model": "HuMo-1.7B",
        "repo_env": "JARVIS_HUMO_REPO_DIR",
        "runtime": "humo",
        "entrypoint": "main.py",
        "config_path": "humo/configs/inference/generate_1_7B.yaml",
        "mode": "TIA",
        "probe_size": "832*480",
        "probe_width": 832,
        "probe_height": 480,
        "target_fps": 25.0,
        "frame_count": 97,
        "probe_duration_seconds": 3.88,
        "reference_assets": True,
        "max_reference_assets": 3,
        "maximum_identity_count": 1,
        "audio_required": True,
        "extra_args": [],
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
    runtime = str(config.get("runtime") or "wan22").strip().lower()
    if runtime == "humo":
        authority = job.get("identityRuntimeAuthority")
        if not isinstance(authority, dict):
            raise RuntimeError("LOCAL_VIDEO_HUMO_RUNTIME_AUTHORITY_REQUIRED")
        if (
            authority.get("physicalRuntimeCertified") is not True
            or authority.get("paidExecutionAuthorized") is not True
        ):
            raise RuntimeError("LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED")
        if authority.get("runtimeAssetAuthorityPinned") is not True:
            raise RuntimeError("LOCAL_VIDEO_HUMO_RUNTIME_ASSETS_INCOMPLETE")
        return backend, config
    if runtime != "wan22":
        raise RuntimeError("LOCAL_VIDEO_RUNTIME_UNSUPPORTED")
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


def inspect_resumable_shot(
    file: Path, ffprobe: str, config: dict[str, Any], size: str
) -> dict[str, Any]:
    expected_width, expected_height = parse_size(size)
    evidence: dict[str, Any] = {
        "file": str(file),
        "exists": file.is_file(),
        "bytes": file.stat().st_size if file.is_file() else 0,
        "expected": {
            "minimumBytes": 100000,
            "width": expected_width,
            "height": expected_height,
            "minimumDurationSeconds": 4.9,
            "minimumFps": float(config["target_fps"]),
        },
        "observed": None,
        "failedPredicates": [],
    }
    if not evidence["exists"]:
        evidence["failedPredicates"].append("FILE_MISSING")
        return evidence
    if int(evidence["bytes"]) < 100000:
        evidence["failedPredicates"].append("BYTES_BELOW_MINIMUM")
    try:
        media = inspect_video(file, ffprobe)
        evidence["observed"] = media
        if int(media.get("width") or 0) != expected_width:
            evidence["failedPredicates"].append("WIDTH_MISMATCH")
        if int(media.get("height") or 0) != expected_height:
            evidence["failedPredicates"].append("HEIGHT_MISMATCH")
        if float(media.get("durationSeconds") or 0) < 4.9:
            evidence["failedPredicates"].append("DURATION_BELOW_MINIMUM")
        if float(media.get("fps") or 0) + 0.01 < float(config["target_fps"]):
            evidence["failedPredicates"].append("FPS_BELOW_BACKEND_TARGET")
    except Exception as error:
        evidence["failedPredicates"].append("FFPROBE_FAILED")
        evidence["probeError"] = str(error)[:1000]
    evidence["valid"] = len(evidence["failedPredicates"]) == 0
    return evidence


def valid_resumable_shot(
    file: Path, ffprobe: str, config: dict[str, Any], size: str
) -> bool:
    return bool(inspect_resumable_shot(file, ffprobe, config, size).get("valid"))


def prepare_reference_for_backend(
    *,
    reference_file: Path,
    operation_dir: Path,
    operation_id: str,
    ffmpeg: str,
    ffprobe: str,
    size: str,
) -> tuple[Path, dict[str, Any]]:
    """Make TI2V input geometry deterministic before paid inference.

    Official Wan TI2V derives output geometry from the input image aspect ratio
    when ``--image`` is present. The requested ``--size`` only contributes the
    maximum area in that path. Preserve the complete assigned reference on an
    exact backend canvas so the generated shot and the public media contract
    cannot diverge after inference.
    """
    width, height = parse_size(size)
    prepared = operation_dir / f"reference-{operation_id}-{width}x{height}.png"
    filter_graph = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=white"
    )
    completed = subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel", "error",
            "-nostdin",
            "-y",
            "-i", str(reference_file),
            "-vf", filter_graph,
            "-frames:v", "1",
            str(prepared),
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if completed.returncode != 0:
        diagnostic = str(completed.stderr or completed.stdout or "")[-1000:]
        raise RuntimeError(
            f"LOCAL_VIDEO_REFERENCE_GEOMETRY_PREPARATION_FAILED:{diagnostic}"
        )
    if not prepared.is_file() or prepared.stat().st_size < 1:
        raise RuntimeError("LOCAL_VIDEO_REFERENCE_GEOMETRY_PREPARATION_EMPTY")
    observed = inspect_video(prepared, ffprobe)
    if (
        int(observed.get("width") or 0) != width
        or int(observed.get("height") or 0) != height
    ):
        raise RuntimeError("LOCAL_VIDEO_REFERENCE_GEOMETRY_MISMATCH")
    return prepared, {
        "sourceFile": str(reference_file),
        "preparedFile": str(prepared),
        "mode": "fit_and_pad_complete_reference",
        "background": "white",
        "expected": {"width": width, "height": height},
        "observed": {
            "width": int(observed.get("width") or 0),
            "height": int(observed.get("height") or 0),
        },
        "bytes": prepared.stat().st_size,
        "valid": True,
    }


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


def _required_humo_path(value: str, status: str, directory: bool = False) -> Path:
    raw = str(value or "").strip()
    if not raw:
        raise RuntimeError(status)
    candidate = Path(raw).resolve()
    if directory:
        if not candidate.is_dir():
            raise RuntimeError(status)
    elif not candidate.is_file():
        raise RuntimeError(status)
    return candidate


def _sha256_file(file: Path) -> str:
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _verify_humo_asset(file: Path, evidence: dict[str, Any], label: str) -> dict[str, Any]:
    if not file.is_file():
        raise RuntimeError(f"LOCAL_VIDEO_HUMO_ASSET_MISSING:{label}")
    expected_bytes = int(evidence.get("bytes") or 0)
    observed_bytes = file.stat().st_size
    if expected_bytes > 0 and observed_bytes != expected_bytes:
        raise RuntimeError(f"LOCAL_VIDEO_HUMO_ASSET_BYTES_MISMATCH:{label}")
    expected_sha = str(evidence.get("sha256") or "").strip().lower()
    if not expected_sha or len(expected_sha) != 64:
        raise RuntimeError(f"LOCAL_VIDEO_HUMO_ASSET_AUTHORITY_INVALID:{label}")
    observed_sha = _sha256_file(file)
    if observed_sha != expected_sha:
        raise RuntimeError(f"LOCAL_VIDEO_HUMO_ASSET_SHA256_MISMATCH:{label}")
    return {"label": label, "bytes": observed_bytes, "sha256": observed_sha}


def _verify_humo_runtime_authority(
    job: dict[str, Any],
    humo_root: Path,
    humo_weights: Path,
    wan21_weights: Path,
    whisper_root: Path,
    separator_file: Path,
) -> dict[str, Any]:
    authority = job.get("identityRuntimeAuthority")
    if not isinstance(authority, dict) or authority.get("runtimeAssetAuthorityPinned") is not True:
        raise RuntimeError("LOCAL_VIDEO_HUMO_RUNTIME_AUTHORITY_REQUIRED")
    source_revision = str(authority.get("sourceRevision") or "").strip()
    if len(source_revision) != 40:
        raise RuntimeError("LOCAL_VIDEO_HUMO_SOURCE_REVISION_AUTHORITY_INVALID")
    observed_revision = subprocess.run(
        ["git", "-C", str(humo_root), "rev-parse", "HEAD"],
        check=True, capture_output=True, text=True, timeout=30
    ).stdout.strip()
    if observed_revision != source_revision:
        raise RuntimeError("LOCAL_VIDEO_HUMO_SOURCE_REVISION_MISMATCH")

    evidence = []
    evidence.append(_verify_humo_asset(
        humo_weights / str(authority.get("checkpoint", {}).get("path") or ""),
        authority.get("checkpoint") or {}, "checkpoint"
    ))
    evidence.append(_verify_humo_asset(
        humo_weights / str(authority.get("zeroVae", {}).get("path") or ""),
        authority.get("zeroVae") or {}, "zero_vae"
    ))
    evidence.append(_verify_humo_asset(
        wan21_weights / str(authority.get("wan21Vae", {}).get("path") or ""),
        authority.get("wan21Vae") or {}, "wan21_vae"
    ))

    shared_files = authority.get("sharedTextEncoderFiles")
    if not isinstance(shared_files, list) or not shared_files:
        raise RuntimeError("LOCAL_VIDEO_HUMO_SHARED_T5_AUTHORITY_REQUIRED")
    shared_map = {str(item.get("path") or ""): item for item in shared_files if isinstance(item, dict)}
    for required_path in [
        "models_t5_umt5-xxl-enc-bf16.pth",
        "google/umt5-xxl/special_tokens_map.json",
        "google/umt5-xxl/spiece.model",
        "google/umt5-xxl/tokenizer.json",
        "google/umt5-xxl/tokenizer_config.json",
    ]:
        item = shared_map.get(required_path)
        if not item:
            raise RuntimeError(f"LOCAL_VIDEO_HUMO_SHARED_T5_AUTHORITY_MISSING:{required_path}")
        evidence.append(_verify_humo_asset(wan21_weights / required_path, item, f"t5:{required_path}"))

    whisper = authority.get("whisper")
    if not isinstance(whisper, dict):
        raise RuntimeError("LOCAL_VIDEO_HUMO_WHISPER_AUTHORITY_REQUIRED")
    whisper_model = whisper.get("model") or {}
    evidence.append(_verify_humo_asset(
        whisper_root / str(whisper_model.get("path") or ""),
        whisper_model, "whisper_model"
    ))
    metadata = whisper.get("requiredMetadata")
    if not isinstance(metadata, list) or not metadata:
        raise RuntimeError("LOCAL_VIDEO_HUMO_WHISPER_METADATA_AUTHORITY_REQUIRED")
    for relative in metadata:
        metadata_file = whisper_root / str(relative)
        if not metadata_file.is_file() or metadata_file.stat().st_size < 1:
            raise RuntimeError(f"LOCAL_VIDEO_HUMO_WHISPER_METADATA_MISSING:{relative}")

    separator = authority.get("audioSeparator")
    if not isinstance(separator, dict):
        raise RuntimeError("LOCAL_VIDEO_HUMO_AUDIO_SEPARATOR_AUTHORITY_REQUIRED")
    evidence.append(_verify_humo_asset(separator_file, separator, "audio_separator"))
    return {
        "ok": True,
        "sourceRevision": observed_revision,
        "assetCount": len(evidence),
        "assets": evidence,
        "whisperRevision": str(whisper.get("revision") or ""),
        "audioSeparatorRevision": str(separator.get("revision") or ""),
    }


def _humo_executable(value: str, fallback: str) -> str:
    requested = str(value or "").strip()
    if requested:
        resolved = shutil.which(requested) if not Path(requested).is_absolute() else requested
        if resolved and Path(resolved).is_file():
            return str(resolved)
        raise RuntimeError("LOCAL_VIDEO_HUMO_TORCHRUN_UNAVAILABLE")
    resolved = shutil.which(fallback)
    if not resolved:
        raise RuntimeError("LOCAL_VIDEO_HUMO_TORCHRUN_UNAVAILABLE")
    return str(resolved)


def _trim_humo_probe_audio(
    source: Path,
    target: Path,
    ffmpeg: str,
    start_seconds: float,
    duration_seconds: float,
) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    completed = subprocess.run(
        [
            ffmpeg,
            "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
            "-ss", f"{start_seconds:.6f}",
            "-t", f"{duration_seconds:.6f}",
            "-i", str(source),
            "-ar", "16000", "-ac", "1",
            str(target),
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if completed.returncode != 0 or not target.is_file() or target.stat().st_size <= 44:
        diagnostic = str(completed.stderr or completed.stdout or "")[-1000:]
        raise RuntimeError(f"LOCAL_VIDEO_HUMO_AUDIO_PREPARATION_FAILED:{diagnostic}")


def run_humo_identity_probe(
    job: dict[str, Any], result_file: Path, config: dict[str, Any]
) -> int:
    shot_plan = list(job.get("shotPlan") or [])
    if len(shot_plan) != 1:
        raise RuntimeError("LOCAL_VIDEO_HUMO_IDENTITY_PROBE_SINGLE_SHOT_REQUIRED")
    shot = shot_plan[0]
    identity_mode = str(shot.get("identityMode") or "").strip()
    character_ids = [str(value or "").strip() for value in shot.get("characterIds") or [] if str(value or "").strip()]
    if identity_mode == "multi_identity" or len(character_ids) > int(config["maximum_identity_count"]):
        raise RuntimeError("LOCAL_VIDEO_HUMO_MULTI_IDENTITY_UNSUPPORTED")
    if identity_mode != "single_identity" or len(character_ids) != 1:
        raise RuntimeError("LOCAL_VIDEO_HUMO_IDENTITY_ASSIGNMENT_REQUIRED")
    duration_seconds = float(shot.get("durationSeconds") or 0)
    maximum_duration = float(config["probe_duration_seconds"])
    if not 0 < duration_seconds <= maximum_duration + 0.001:
        raise RuntimeError("LOCAL_VIDEO_HUMO_IDENTITY_PROBE_DURATION_UNSUPPORTED")

    reference_outputs = [str(value or "").strip().replace("\\", "/") for value in job.get("referenceOutputs") or []]
    reference_files = [Path(str(value)).resolve() for value in job.get("referenceFiles") or []]
    if len(reference_outputs) != len(reference_files):
        raise RuntimeError("LOCAL_VIDEO_HUMO_REFERENCE_BINDING_INVALID")
    reference_map = dict(zip(reference_outputs, reference_files))
    identity_outputs = [
        str(value or "").strip().replace("\\", "/")
        for value in shot.get("identityReferenceOutputs") or []
        if str(value or "").strip()
    ]
    identity_files = [reference_map.get(output) for output in identity_outputs]
    if (
        not identity_files
        or len(identity_files) > int(config["max_reference_assets"])
        or any(file is None or not file.is_file() for file in identity_files)
    ):
        raise RuntimeError("LOCAL_VIDEO_HUMO_REFERENCE_BINDING_INVALID")

    audio_raw = str(job.get("audioFile") or "").strip()
    audio_file = _required_humo_path(audio_raw, "LOCAL_VIDEO_HUMO_AUDIO_REFERENCE_REQUIRED")
    ffmpeg = os.environ.get("JARVIS_FFMPEG_PATH") or shutil.which("ffmpeg")
    ffprobe = os.environ.get("JARVIS_FFPROBE_PATH") or shutil.which("ffprobe")
    if not ffmpeg:
        raise RuntimeError("LOCAL_VIDEO_FFMPEG_UNAVAILABLE")
    if not ffprobe:
        raise RuntimeError("LOCAL_VIDEO_FFPROBE_UNAVAILABLE")

    humo_root = _required_humo_path(
        os.environ.get("JARVIS_HUMO_REPO_DIR", ""),
        "LOCAL_VIDEO_HUMO_REPOSITORY_NOT_CONFIGURED",
        directory=True,
    )
    main_file = _required_humo_path(
        str(humo_root / str(config["entrypoint"])),
        "LOCAL_VIDEO_HUMO_REPOSITORY_NOT_READY",
    )
    config_file = _required_humo_path(
        str(humo_root / str(config["config_path"])),
        "LOCAL_VIDEO_HUMO_CONFIG_NOT_READY",
    )
    humo_weights = _required_humo_path(
        os.environ.get("JARVIS_HUMO_WEIGHTS_DIR", ""),
        "LOCAL_VIDEO_HUMO_WEIGHTS_NOT_CONFIGURED",
        directory=True,
    )
    wan21_weights = _required_humo_path(
        os.environ.get("JARVIS_HUMO_WAN21_MODEL_DIR", ""),
        "LOCAL_VIDEO_HUMO_WAN21_ASSETS_NOT_CONFIGURED",
        directory=True,
    )
    checkpoint = _required_humo_path(
        str(humo_weights / "HuMo-1.7B" / "ema.pth"),
        "LOCAL_VIDEO_HUMO_CHECKPOINT_MISSING",
    )
    zero_vae = _required_humo_path(
        str(humo_weights / "zero_vae_129frame.pt"),
        "LOCAL_VIDEO_HUMO_ZERO_VAE_MISSING",
    )
    wan21_vae = _required_humo_path(
        str(wan21_weights / "Wan2.1_VAE.pth"),
        "LOCAL_VIDEO_HUMO_WAN21_VAE_MISSING",
    )
    t5_checkpoint = _required_humo_path(
        str(wan21_weights / "models_t5_umt5-xxl-enc-bf16.pth"),
        "LOCAL_VIDEO_HUMO_T5_MISSING",
    )
    t5_tokenizer = _required_humo_path(
        str(wan21_weights / "google" / "umt5-xxl"),
        "LOCAL_VIDEO_HUMO_T5_TOKENIZER_MISSING",
        directory=True,
    )
    whisper = _required_humo_path(
        os.environ.get("JARVIS_HUMO_WHISPER_DIR", ""),
        "LOCAL_VIDEO_HUMO_WHISPER_MISSING",
        directory=True,
    )
    separator = _required_humo_path(
        os.environ.get("JARVIS_HUMO_AUDIO_SEPARATOR_FILE", ""),
        "LOCAL_VIDEO_HUMO_AUDIO_SEPARATOR_MISSING",
    )
    torchrun = _humo_executable(os.environ.get("JARVIS_HUMO_TORCHRUN", ""), "torchrun")
    runtime_asset_evidence = _verify_humo_runtime_authority(
        job, humo_root, humo_weights, wan21_weights, whisper, separator
    )

    output_file = Path(str(job.get("outputFile") or "")).resolve()
    output_file.parent.mkdir(parents=True, exist_ok=True)
    operation_id = str(job.get("operationId") or "identity-probe").replace("/", "-")
    probe_root = output_file.parent / f"humo-probe-{operation_id}"
    probe_output = probe_root / "output"
    probe_output.mkdir(parents=True, exist_ok=True)
    item_name = "identity_probe"
    prompt_file = probe_root / "prompt.json"
    probe_audio = probe_root / "audio.wav"
    _trim_humo_probe_audio(
        audio_file,
        probe_audio,
        str(ffmpeg),
        float(shot.get("startSeconds") or 0),
        duration_seconds,
    )
    write_json_atomic(prompt_file, {
        item_name: {
            "img_paths": [str(file) for file in identity_files],
            "audio_path": str(probe_audio),
            "prompt": build_prompt(job, str(shot.get("prompt") or "")),
        }
    })

    command = [
        torchrun,
        "--standalone",
        "--nnodes=1",
        "--nproc_per_node=1",
        str(main_file),
        str(config_file),
        "dit.sp_size=1",
        f"generation.frames={int(config['frame_count'])}",
        "generation.seed=666666",
        "generation.scale_t=7.0",
        "generation.scale_i=4.0",
        "generation.scale_a=7.5",
        "generation.mode=TIA",
        f"generation.height={int(config['probe_height'])}",
        f"generation.width={int(config['probe_width'])}",
        "diffusion.timesteps.sampling.steps=50",
        f"generation.positive_prompt={prompt_file}",
        f"generation.output.dir={probe_output}",
        f"dit.checkpoint_dir={checkpoint}",
        f"dit.zero_vae_path={zero_vae}",
        f"vae.checkpoint={wan21_vae}",
        f"text.t5_checkpoint={t5_checkpoint}",
        f"text.t5_tokenizer={t5_tokenizer}",
        f"audio.vocal_separator={separator}",
        f"audio.wav2vec_model={whisper}",
    ]
    completed = subprocess.run(
        command,
        cwd=humo_root,
        env=offline_environment(),
        check=False,
        capture_output=True,
        text=True,
        timeout=int(os.environ.get("JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS", "7200")),
    )
    if completed.returncode != 0:
        diagnostic = str(completed.stderr or completed.stdout or "")[-2000:]
        raise RuntimeError(f"LOCAL_VIDEO_HUMO_EXIT_{completed.returncode}:{diagnostic}")

    generated = probe_output / f"{item_name}_seed666666.mp4"
    if not generated.is_file() or generated.stat().st_size < 100000:
        raise RuntimeError("LOCAL_VIDEO_HUMO_PHYSICAL_OUTPUT_INVALID")
    media = inspect_video(generated, str(ffprobe))
    if (
        int(media.get("width") or 0) != int(config["probe_width"])
        or int(media.get("height") or 0) != int(config["probe_height"])
        or float(media.get("fps") or 0) + 0.01 < float(config["target_fps"])
    ):
        raise RuntimeError("LOCAL_VIDEO_HUMO_PROBE_MEDIA_MISMATCH")
    os.replace(generated, output_file)
    media = inspect_video(output_file, str(ffprobe))
    write_json_atomic(result_file, {
        "ok": True,
        "status": "LOCAL_VIDEO_HUMO_IDENTITY_PROBE_COMPLETED",
        "runnerVersion": RUNNER_VERSION,
        "operationId": str(job.get("operationId") or ""),
        "operationName": str(job.get("operationName") or ""),
        "output": str(job.get("output") or ""),
        "mimeType": "video/mp4",
        "backend": str(job.get("backend") or "humo-1.7b-identity"),
        "model": str(config["model"]),
        "engine": "local",
        "provider": "local",
        "externalApiUsed": False,
        "externalEstimatedCostUsd": 0,
        "identityMode": "single_identity",
        "characterIds": character_ids,
        "identityReferenceOutputs": identity_outputs,
        "identityProbe": True,
        "identityRuntimeAuthorityVerified": True,
        "identityRuntimeAssetEvidence": runtime_asset_evidence,
        "portraitCertified": False,
        "probeGeometry": {
            "width": int(config["probe_width"]),
            "height": int(config["probe_height"]),
            "fps": float(config["target_fps"]),
            "frames": int(config["frame_count"]),
        },
        **media,
    })
    return 0


def run(job_file: Path, result_file: Path) -> int:
    job = read_json(job_file)
    if job.get("externalApiAllowed") is not False:
        raise RuntimeError("LOCAL_VIDEO_EXTERNAL_API_MUST_BE_DISABLED")
    if os.environ.get("JARVIS_LOCAL_VIDEO_EXTERNAL_API_ALLOWED", "false").lower() != "false":
        raise RuntimeError("LOCAL_VIDEO_PROCESS_NETWORK_POLICY_INVALID")

    backend, config = resolve_backend(job)
    if str(config.get("runtime") or "wan22").strip().lower() == "humo":
        return run_humo_identity_probe(job, result_file, config)
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
    generation_reference_files = reference_files
    reference_geometry = None
    if reference_files:
        prepared_reference, reference_geometry = prepare_reference_for_backend(
            reference_file=reference_files[0],
            operation_dir=output_file.parent,
            operation_id=str(job.get("operationId") or "video"),
            ffmpeg=ffmpeg,
            ffprobe=ffprobe,
            size=size,
        )
        generation_reference_files = [prepared_reference]
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
                    reference_files=generation_reference_files,
                    prompt=prompt,
                )
            shot_evidence = inspect_resumable_shot(shot_file, ffprobe, config, size)
            if shot_evidence.get("valid") is not True:
                raise PhysicalShotInvalid(shot_evidence)
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
            reference_files=generation_reference_files,
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
            "primaryReferencePrepared": (
                str(generation_reference_files[0]) if generation_reference_files else None
            ),
            "referenceGeometry": reference_geometry,
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
        shot_evidence = getattr(error, "evidence", None)
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
                **({"shotEvidence": shot_evidence} if shot_evidence else {}),
            },
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
