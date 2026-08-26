# Jarvis local video V142

This is an infrastructure migration behind the existing `video.generate`
contract. It does not add a planner, semantic router, public local-only tool,
memory, or artifact ledger.

## Automatic local-first policy

`LOCAL_PREFERRED` is the normal default. The policy is read only from local
infrastructure configuration, never from prompt text. `CURRENT_STABLE` remains
an explicit, deterministic rollback to Veo.

| Mode | Behavior |
| --- | --- |
| `CURRENT_STABLE` | Existing certified external provider. |
| `LOCAL_TEST` | Local worker only; external authorization is always denied. |
| `LOCAL_PREFERRED` | Wan2.2 first, compatible Wan2.1 second, then an explicit Veo fallback. |
| `LOCAL_ONLY` | Local worker only; external fallback is forbidden. |

Rollback is deterministic: set `JARVIS_VIDEO_ENGINE_POLICY=CURRENT_STABLE` and
restart the local bridge. No semantic contract or mission plan changes.

## Feature flags and budgets

- `JARVIS_VIDEO_ENGINE_POLICY` (default `LOCAL_PREFERRED`)
- `JARVIS_LOCAL_VIDEO_ENABLED` (default `true`, except `CURRENT_STABLE`)
- `JARVIS_LOCAL_VIDEO_CERTIFIED` (default `false`)
- `JARVIS_LOCAL_IMAGE_ENABLED` (default `false`)
- `JARVIS_LOCAL_SPEECH_ENABLED` (default `false`)
- `JARVIS_EXTERNAL_FALLBACK_ENABLED` (default `true`)
- `JARVIS_EXTERNAL_BUDGET_USD_PER_OPERATION`
- `JARVIS_EXTERNAL_BUDGET_USD_PER_EPISODE`
- `JARVIS_EXTERNAL_BUDGET_USD_PER_DAY`
- `JARVIS_EXTERNAL_VIDEO_ESTIMATED_COST_USD_PER_CALL`

An external call in `LOCAL_TEST` or `LOCAL_ONLY` is denied before the provider
is invoked. `LOCAL_PREFERRED` fallback is never silent: the result records
`engineRequested`, `engineUsed`, `fallbackUsed`, `fallbackReason`,
`externalApiUsed`, and `externalEstimatedCostUsd`.

## Ordered local backends

The first target is the official `Wan-AI/Wan2.2-TI2V-5B` checkpoint.

- License: Apache-2.0.
- Official code: <https://github.com/Wan-Video/Wan2.2>
- Official weights: <https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B>
- Text-to-video and image-to-video in the same TI2V profile.
- Published target: 720p at 24 fps.
- Published minimum inference profile: 24 GB VRAM with model offload.
- Current checkpoint snapshot: approximately 34.2 GB before runtime caches.

The second target is `Wan-AI/Wan2.1-T2V-1.3B` (Apache-2.0), text-to-video only,
with an 8.19 GB VRAM gate. It is eligible only when Wan2.2 is unavailable and
the mission has no reference assets and does not require image-to-video.
References are never discarded to make a mission fit Wan2.1.

Each backend must independently pass CUDA/VRAM/disk, FFmpeg/FFprobe, runner,
official repository `generate.py`, physical model weights, health, and
certification gates. A recoverable Wan2.2 runtime failure reruns selection with
that backend excluded: compatible T2V can continue on Wan2.1; reference/I2V
goes to explicit Veo fallback. `LOCAL_TEST` and `LOCAL_ONLY` never use Veo.
No weights are downloaded by this change.

## Worker contract

The local bridge exposes authenticated release-bound routes:

- `/video/local/health`
- `/video/local/start`
- `/video/local/poll`
- `/video/local/cancel`
- `/video/local/cleanup`

Each start creates one durable `local-video/<uuid>` operation under
`.jarvis-artifacts/.video-worker`. A successful result must independently prove
an MP4 container, at least 100,000 bytes, SHA-256, duration, frame rate, width,
height, and an Artifact Studio ledger record before returning
`VIDEO_GENERATED_VERIFIED`.

The runner is `scripts/jarvis-local-video-wan22.py`. Configure it only on a
compatible machine:

```text
JARVIS_LOCAL_VIDEO_ENABLED=true
JARVIS_VIDEO_ENGINE_POLICY=LOCAL_TEST
JARVIS_LOCAL_VIDEO_RUNNER=<python executable>
JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT=<repo>/scripts/jarvis-local-video-wan22.py
JARVIS_WAN22_MODEL_DIR=<weights>/Wan2.2-TI2V-5B
JARVIS_WAN22_REPO_DIR=<checkout>/Wan2.2
JARVIS_WAN22_CERTIFIED=true
JARVIS_WAN21_MODEL_DIR=<weights>/Wan2.1-T2V-1.3B
JARVIS_WAN21_REPO_DIR=<checkout>/Wan2.1
JARVIS_WAN21_CERTIFIED=true
JARVIS_FFMPEG_PATH=<ffmpeg executable>
JARVIS_FFPROBE_PATH=<ffprobe executable>
```

The runner removes known hosted prompt-extension credentials from its child
environment, forces Hugging Face/Transformers/W&B offline modes, and does not
enable Wan prompt extension. The worker still checks `externalApiUsed=false`
and cost zero in the final receipt. TI2V uses the first user-assigned reference
as the initialization image while preserving every assigned reference in the
durable job; multi-reference visual parity is not certified yet.

## Current hardware gate

The audited host has Intel HD Graphics 5500 without NVIDIA CUDA, roughly 1 GB
reported graphics memory, about 11.9 GB RAM, and roughly 9.5 GB free disk.
FFmpeg and FFprobe 8.1.2 were subsequently installed and verified in PATH;
WSL2, Docker, PyTorch, Diffusers, and a model checkpoint remain intentionally
absent. The machine is still below both the 24 GB VRAM and 34.2 GB checkpoint
gates.

Therefore, on this laptop:

- default `LOCAL_PREFERRED` reports both local backends unavailable and selects
  the explicit Veo fallback; this is expected behavior, not a local error;
- `CURRENT_STABLE` remains available as the direct Veo rollback;
- no model/dependency download is authorized;
- no local generative MP4 is claimed on this host;
- controlled tests exercise the worker contract with a fixture, clearly not as
  creative or human acceptance evidence.
