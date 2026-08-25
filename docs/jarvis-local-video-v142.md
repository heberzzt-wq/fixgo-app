# Jarvis local video V142

This is an infrastructure migration behind the existing `video.generate`
contract. It does not add a planner, semantic router, public local-only tool,
memory, or artifact ledger.

## Initial policy

`CURRENT_STABLE` is the default and continues to use the certified Veo path.
The policy is read only from local infrastructure configuration, never from
prompt text.

| Mode | Behavior |
| --- | --- |
| `CURRENT_STABLE` | Existing certified external provider. |
| `LOCAL_TEST` | Local worker only; external authorization is always denied. |
| `LOCAL_PREFERRED` | Local only when enabled, healthy, and certified; otherwise an explicit external fallback when enabled. |
| `LOCAL_ONLY` | Local worker only; external fallback is forbidden. |

Rollback is deterministic: set `JARVIS_VIDEO_ENGINE_POLICY=CURRENT_STABLE` and
restart the local bridge. No semantic contract or mission plan changes.

## Feature flags and budgets

- `JARVIS_VIDEO_ENGINE_POLICY` (default `CURRENT_STABLE`)
- `JARVIS_LOCAL_VIDEO_ENABLED` (default `false`)
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

## Selected model

The first target is the official `Wan-AI/Wan2.2-TI2V-5B` checkpoint.

- License: Apache-2.0.
- Official code: <https://github.com/Wan-Video/Wan2.2>
- Official weights: <https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B>
- Text-to-video and image-to-video in the same TI2V profile.
- Published target: 720p at 24 fps.
- Published minimum inference profile: 24 GB VRAM with model offload.
- Current checkpoint snapshot: approximately 34.2 GB before runtime caches.

The model is selected for a future compatible worker host, not certified on
the present Intel-only laptop. No weights are downloaded by this change.

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
JARVIS_LOCAL_VIDEO_MODEL_DIR=<weights>/Wan2.2-TI2V-5B
JARVIS_WAN22_REPO_DIR=<checkout>/Wan2.2
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

Therefore:

- production remains `CURRENT_STABLE`;
- `LOCAL_PREFERRED` and `LOCAL_ONLY` are not promoted;
- no model/dependency download is authorized;
- no local generative MP4 is claimed on this host;
- controlled tests exercise the worker contract with a fixture, clearly not as
  creative or human acceptance evidence.
