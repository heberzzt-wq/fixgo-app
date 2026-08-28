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

## RunPod physical adapter (remote execution)

RunPod is connected behind the same `/video/local/*` routes and the same
`video.generate` obligation. It is enabled only in the bridge process:

```text
JARVIS_REMOTE_GPU_PROVIDER=runpod
RUNPOD_API_KEY=<server-side secret>
JARVIS_RUNPOD_GPU_TYPE_ID=NVIDIA L40S
JARVIS_RUNPOD_CLOUD_TYPE=SECURE
JARVIS_RUNPOD_NETWORK_VOLUME_ID=<existing-volume-in-US-TX-3>
JARVIS_LOCAL_VIDEO_EXECUTION_TARGET=remote
JARVIS_VIDEO_ENGINE_POLICY=LOCAL_TEST
JARVIS_LOCAL_VIDEO_MODEL=wan22-ti2v-5b
JARVIS_LOCAL_VIDEO_RUNNER_SCRIPT=<repo>/scripts/jarvis-local-video-wan22.py
JARVIS_RUNPOD_CANONICAL_SHA=<40-hex SHA returned by git rev-parse HEAD>
JARVIS_REMOTE_GPU_HARD_BUDGET_USD=2
JARVIS_REMOTE_GPU_BUDGET_STOP_RATIO=0.95
JARVIS_RUNPOD_TOTAL_HOURLY_RATE_USD=0.99
JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED=false
```

The credential belongs in the environment of the process that starts
`jarvis-fs-bridge.js`; it must not be placed in browser configuration, HTML,
Artifact Studio metadata, a mission payload, or a committed `.env` file.

### Zero-cost gate versus paid physical preflight

`JARVIS_RUNPOD_PAID_RESOURCE_CREATION_AUTHORIZED` defaults to `false`. It may
be changed to `true` only under a new, explicit human authority that identifies
the canonical SHA and economic limit. A missing, non-positive, or greater than
USD 2 `JARVIS_REMOTE_GPU_HARD_BUDGET_USD` fails closed; there is no implicit
budget. Polling stops at the configured ratio (0.95 for a USD 1.90 operational
ceiling under a USD 2 hard cap) so deletion retains margin.

The adapter separates two evidence levels:

| `ZERO_COST_PRECHECK` (before credentials or billable creation) | `PHYSICAL_PAID_PREFLIGHT` (only after one Pod exists) |
| --- | --- |
| Canonical Git SHA equals the configured SHA and bridge identity is `BRIDGE_IDENTITY_OK`. | The allocated GPU exactly matches the explicitly authorized A40/CC 8.6 or L40S/CC 8.9 profile and has at least 48 GB VRAM. |
| Policy is exactly `LOCAL_TEST`, backend is exactly `wan22-ti2v-5b`, and external fallback is forbidden. | CUDA, NVCC, Python 3.12, PyTorch 2.8/CUDA 12.8, FFmpeg, and FlashAttention work on that Pod. |
| OCI image digest, Wan repo revision, model revision, requirements SHA, and every required model file are immutable. | Required Python imports, `pip check`, a real CUDA tensor operation, and offline `generate.py --help` pass. |
| Durable identity, reference bytes/SHA, local duplicate-obligation state, explicit GPU request, volume/data-center contract, exact budget, and the sanitized Pod body are valid. | The mounted cache and every physical model file match the manifest; FlashAttention must execute a real CUDA kernel on the selected compute capability. |

`inspectZeroCostPrecheck` builds and validates the same provision body later
used by `POST /pods`, but substitutes `[EPHEMERAL_PUBLIC_KEY]` and performs no
provider request. It never returns the RunPod API key or private SSH key. Even a
green zero-cost report is not physical readiness and cannot authorize billing.

For a persistent network volume, the sanitized future body is equivalent to:

```json
{
  "cloudType": "SECURE",
  "computeType": "GPU",
  "containerDiskInGb": 30,
  "volumeMountPath": "/workspace",
  "gpuCount": 1,
  "gpuTypeIds": ["NVIDIA L40S"],
  "gpuTypePriority": "custom",
  "imageName": "runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404@sha256:0a360022e8de4375af99430f84e8b38951acc397252163a37ceac7204d01be35",
  "interruptible": false,
  "minRAMPerGPU": 62,
  "minVCPUPerGPU": 16,
  "ports": ["22/tcp"],
  "supportPublicIp": true,
  "name": "jarvis-v142-<durable-obligation-prefix>",
  "networkVolumeId": "<existing-verified-volume-id>",
  "dataCenterIds": ["US-TX-3"],
  "env": {
    "PUBLIC_KEY": "[EPHEMERAL_PUBLIC_KEY]",
    "JARVIS_OPERATION_ID": "<durable-operation-id>",
    "JARVIS_OBLIGATION_FINGERPRINT": "<64-hex-durable-fingerprint>"
  }
}
```

This example is documentation only. It omits `volumeInGb` when a network volume
is attached, and neither the report nor tests send it to RunPod.

### Persistent cache and disk envelope

The model manifest is exactly 34,203,123,497 bytes. V142 reserves another
8,589,934,592 bytes (8 GiB) for the Wan repository, virtual environment,
operation assets/results, and working margin, producing a contractual peak of
42,793,058,089 bytes (about 42.79 decimal GB or 39.85 GiB). A 50 GB network
volume therefore has about 7.21 decimal GB of contractual headroom, but remains
conditionally sufficient until the mounted Pod proves at least 45 GiB free.

The persistent layout is singular:

- model: `/workspace/jarvis-v142/cache/wan22-ti2v-5b/model`;
- Wan repository: `/workspace/jarvis-v142/cache/wan22-ti2v-5b/Wan2.2`;
- virtual environment: `/workspace/jarvis-v142/cache/wan22-ti2v-5b/venv`;
- Hugging Face local-dir metadata: inside the model's `.cache/huggingface`;
- build temporaries: `/tmp` on the 30 GB container disk.

The bootstrap uses `hf download --local-dir`, disables Xet chunk/shard caches,
sets `PIP_NO_CACHE_DIR=1`, and creates the venv with system site packages. It
does not intentionally keep a second complete checkpoint. `CACHE_HIT` requires
the manifest, repository revision, requirements SHA, every file byte count and
SHA-256, and the complete runtime preflight. Missing, partial, or merely
expected cache state remains `CACHE_MISS`/`CACHE_POPULATING`; a new runtime can
reuse `CACHE_READY` only after repeating physical verification.

The cache profile is GPU-specific even though the model bytes and pinned
repository revisions are shared. `wan22-ti2v-5b-a40-v2` requires CC 8.6;
`wan22-ti2v-5b-l40s-v1` requires CC 8.9. An A40 manifest or a FlashAttention
binary that only works on sm_86 cannot become an L40S cache hit. The L40S
physical preflight imports FlashAttention and executes `flash_attn_func` on
CUDA before it can set `CACHE_READY` or `CACHE_HIT`.

### CPU model staging without GPU-readiness claims

The same adapter exposes a read-only CPU staging precheck; it does not create a
second workflow or provision anything. The current candidate is `cpu3c` in
`US-TX-3`, 2 vCPU, 4 GB RAM, with the same 50 GB Network Volume mounted at
`/workspace`. RunPod's authenticated flavor query exposes USD 0.06/hour but
does not expose CPU stock (`stockStatus=null`). Therefore the report is
`CPU_STAGING_COMPATIBLE_CAPACITY_UNCONFIRMED`, keeps resource creation disabled,
and a later paid authority must let RunPod decide actual placement.

CPU staging may clone the pinned Wan repository, run `hf download`, verify the
repository revision and every model byte/SHA-256, and write the model manifest.
Its maximum state is `CACHE_MODEL_READY`. It cannot certify CUDA, NVCC,
PyTorch-CUDA, compute capability, FlashAttention CUDA kernels, Wan runtime help,
`CACHE_READY`, or `CACHE_HIT`. Those remain mandatory L40S physical checks.
At USD 0.06/hour, 30 minutes of CPU staging is USD 0.03 compute, excluding the
separately billed persistent Network Volume.

The adapter performs this single durable lifecycle:

1. Query official RunPod GPU availability and on-demand price for the one
   explicitly selected profile. No A40-to-L40S or L40S-to-other-GPU fallback
   exists.
2. `POST https://rest.runpod.io/v1/pods` for exactly one on-demand Pod using
   the approved PyTorch 2.8/CUDA 12.8 image pinned by immutable OCI digest,
   30 GB container disk and the selected profile's minimum RAM/vCPU,
   and TCP 22. A mutable image tag is rejected before billable capacity is
   created.
3. Generate an ephemeral SSH keypair, pass only its public key to the Pod, and
   bind the local receipt to `missionId`, `objectiveId`, `obligationId`,
   `operationName`, and `rootInstructionHash`.
4. Verify the exact live GPU/CC/CUDA/VRAM/disk/Python/PyTorch/FFmpeg/NVCC health. Transfer the
   existing V142 runner, durable job JSON, and physical references with an
   SHA-256 manifest. Windows paths are rewritten to Pod paths.
5. Install/verify the official Wan2.2 repository and
   `Wan-AI/Wan2.2-TI2V-5B`, then start exactly one remote job. The repository,
   requirements file, model revision, every runtime model file, and their
   SHA-256 values are pinned. FlashAttention is installed separately using its
   supported no-build-isolation path. A cache hit is accepted only after
   `pip check`, all required Python imports, a real CUDA tensor operation, the
   expected Python/Torch/CUDA/GPU compute-capability versions, a real
   FlashAttention CUDA operation, and offline
   `generate.py --help` all pass. Every poll uses the same `remoteJobId`; a
   transport timeout remains retryable and never provisions another Pod.
6. Download the MP4, compare remote and local bytes/SHA-256, then let the
   existing engine verify MP4/media metadata. Artifact Studio registration
   happens only after physical verification and verified Pod deletion.
7. `DELETE https://rest.runpod.io/v1/pods/{podId}` on success, failure,
   timeout, cancel, bad SHA, invalid MP4, lost worker, or bridge-handled
   exception. `STOP` is not used as release. The ephemeral private key is
   removed after verified deletion.

The first physical trial is capped at USD 2. Polling cancels at 95% of that
cap so the delete request has headroom. Estimated rental cost is calculated
from the greater of RunPod's returned Pod price and the configured total hourly
rate (GPU plus the displayed storage allowance); actual cost is queried from
`GET /billing/pods?podId=...` when RunPod has exposed it. `LOCAL_TEST` prevents
Veo and Gemini recovery calls during certification.

Configuration readiness is deliberately different from physical readiness.
Before a Pod exists, the bridge records the explicitly requested GPU, VRAM, storage, and
immutable image, but it does not claim that CUDA, Python, FFmpeg, the Wan CLI,
or model dependencies are healthy. Those become verified only from the live
worker probes above. Any mismatch fails closed before inference and triggers
Pod deletion.

This route uses the official Wan2.2 command-line entry point directly through
the existing `scripts/jarvis-local-video-wan22.py` runner. InvokeAI and ComfyUI
are not part of this V142 execution path and are not installed as hidden
dependencies.

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
