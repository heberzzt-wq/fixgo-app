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
JARVIS_RUNPOD_NETWORK_VOLUME_ID=<existing-standard-50gb-volume-in-EU-NL-1>
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

An explicitly authorized runtime-only certification uses the same adapter and
the same `GPU_RUNTIME_BOOTSTRAP`, with the GPU and one live datacenter selected
at runtime:

```text
JARVIS_RUNPOD_GPU_TYPE_ID=NVIDIA A40
JARVIS_RUNPOD_DATACENTER_ID=<live-selected-datacenter>
JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY=true
JARVIS_RUNPOD_NETWORK_VOLUME_ID=
```

That mode is not video execution and cannot create or populate a model cache.
It provisions no Network Volume, requires Secure Cloud and one exact
datacenter, finishes as `RUNPOD_RUNTIME_PREFLIGHT_CERTIFIED` with
`CACHE_MISS`, starts no inference, and immediately enters the existing Pod
release/absence-verification lifecycle. Paid creation remains denied unless a
separate human authorization sets its exact SHA, GPU, datacenter, and budget.

The credential belongs in the environment of the process that starts
`jarvis-fs-bridge.js`; it must not be placed in browser configuration, HTML,
Artifact Studio metadata, a mission payload, or a committed `.env` file.

### Sanitized provider HTTP evidence

Every non-accepted RunPod HTTP response is captured before the adapter throws.
The durable operation and the adapter receipt retain the HTTP status, sanitized
provider body, safe response headers, provider request/correlation ID when one
is present, stage, operation ID, endpoint without query parameters, method,
response content type, and UTC receipt time. Authorization, API-key, cookie,
and set-cookie values are never persisted; the in-memory RunPod key and its URL
encoding are redacted from provider text. Diagnostics are bounded and retain at
most the ten latest HTTP failures for the operation.

This evidence does not make an HTTP 5xx retryable by itself and does not grant
resource-creation authority. A failed provisioning response remains
`PROVISION_FAILED`, and recovery still follows the existing durable obligation
and explicit paid authority. In particular, observability tests use mocks and
must never repeat a live `POST /pods` merely to obtain an error body.

The observed CPU staging HTTP 500 remains classified as
`RUNPOD_PROVIDER_CAUSE_UNDETERMINED`, with
`RUNPOD_IMAGE_REFERENCE_SEMANTICS_UNVERIFIED` retained as an explicit
hypothesis. Separating tag, registry digest, and runtime identity closes the
known client-side ambiguity without claiming it caused the earlier provider
response. A new physical attempt requires separate human authority.

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
| Canonical Git SHA equals the configured SHA and bridge identity is `BRIDGE_IDENTITY_OK`. | The allocated GPU exactly matches the selected physical profile: A40/CC 8.6 or L40S/CC 8.9, with at least 48 GB VRAM. |
| Policy is exactly `LOCAL_TEST`, backend is exactly `wan22-ti2v-5b`, and external fallback is forbidden. | CUDA, NVCC, Python 3.12, PyTorch 2.8/CUDA 12.8, FFmpeg, and FlashAttention work on that Pod. |
| The approved image tag resolves read-only to its expected registry digest; the Wan repo revision, model revision, requirements SHA, and every required model file are immutable. | Required Python imports, `pip check`, a real CUDA tensor operation, and offline `generate.py --help` pass. |
| Durable identity, local duplicate-obligation state, explicit GPU request, dynamic volume/data-center configuration, exact budget, and the sanitized Pod body are valid. Full video execution also requires reference bytes/SHA. | Runtime-only certification records `CACHE_MISS` and requires no model cache. Full video execution additionally requires the mounted cache and every physical model file to match the current authority. FlashAttention must execute a real CUDA kernel on the selected CC. |

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
  "imageName": "runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404",
  "interruptible": false,
  "minRAMPerGPU": 62,
  "minVCPUPerGPU": 16,
  "ports": ["22/tcp"],
  "supportPublicIp": true,
  "name": "jarvis-v142-<durable-obligation-prefix>",
  "networkVolumeId": "<existing-verified-volume-id>",
  "dataCenterIds": ["EU-NL-1"],
  "env": {
    "PUBLIC_KEY": "[EPHEMERAL_PUBLIC_KEY]",
    "JARVIS_OPERATION_ID": "<durable-operation-id>",
    "JARVIS_OBLIGATION_FINGERPRINT": "<64-hex-durable-fingerprint>"
  }
}
```

This example is documentation only. It omits `volumeInGb` when a network volume
is attached, and neither the report nor tests send it to RunPod.

RunPod documents `imageName` as an image tag. V142 therefore keeps three
separate values in the same adapter: `provisionImageTag`,
`expectedRegistryDigest`, and `runtimeIdentity`. Before any future `POST /pods`,
the public Docker registry manifest for the approved tag must resolve to the
expected digest. A mismatch or an unverifiable manifest fails closed before
RunPod resource traffic. The temporary public-registry bearer token is never
persisted. `@sha256:` is forbidden inside the provisioning `imageName`.

### Persistent cache and disk envelope

The contractual model tree is exactly 34,203,123,497 bytes. Its namespace is
the model directory excluding the root `.cache` subtree. The 34,216,331,040
bytes observed in the last CPU attempt included 13,207,543 bytes of Hugging
Face local-dir metadata under `.cache/huggingface`; those metadata are useful
for resume but are not model snapshot bytes. V142 reserves another
8,589,934,592 bytes (8 GiB) for the Wan repository, virtual environment,
operation assets/results, and working margin, producing a contractual peak of
42,793,058,089 bytes (about 42.79 decimal GB or 39.85 GiB). A 50 GB network
volume therefore has about 7.21 decimal GB of contractual headroom, but remains
conditionally sufficient until the mounted Pod proves at least 45 GiB free.

The persistent layout is singular:

- model: `/workspace/jarvis-v142/cache/wan22-ti2v-5b/model`;
- Wan repository: `/workspace/jarvis-v142/cache/wan22-ti2v-5b/Wan2.2`;
- CPU download-tool environment: `/workspace/jarvis-v142/cache/wan22-ti2v-5b/cpu-tools-venv`;
- GPU runtime environment: `/workspace/jarvis-v142/cache/wan22-ti2v-5b/venv`;
- Hugging Face local-dir metadata: inside the model's `.cache/huggingface`;
- build temporaries: `/tmp` on the 30 GB container disk.

The adapter has two internal bootstrap phases, not two public pipelines.
`CPU_MODEL_STAGING_BOOTSTRAP` uses `hf download --local-dir`, disables Xet
chunk/shard caches, and may only promote `CACHE_MISS` through
`CACHE_POPULATING` to `CACHE_MODEL_READY`. `GPU_RUNTIME_BOOTSTRAP` consumes that
same model directory and is the only phase allowed to install/certify the Wan
GPU runtime and promote to `CACHE_READY`. A later GPU run may report
`CACHE_HIT` only after repeating the complete physical verification. Neither
phase keeps a second checkpoint.

The same `GPU_RUNTIME_BOOTSTRAP` can stop immediately after the complete
physical runtime preflight when `JARVIS_RUNPOD_RUNTIME_CERTIFICATION_ONLY=true`.
It still verifies the exact GPU name/VRAM/compute capability, Python 3.12,
PyTorch 2.8 with CUDA 12.8, NVCC/toolkit 12.8, FFmpeg/FFprobe, pinned Wan Git
revision, requirements, imports, `pip check`, offline `generate.py --help`, a
real CUDA tensor, and a real FlashAttention 2.8.3.post1 CUDA kernel. It does not
run model validation, does not write a cache manifest, cannot claim
`CACHE_MODEL_READY`, `CACHE_READY`, or `CACHE_HIT`, and cannot start inference.
Its evidence becomes placement-eligible only after the same paid Pod has been
deleted and absence has been verified.

`model-manifest.json` is evidence, never authority. It is written atomically
only after the current authority has been compared with the physically observed
repository revision, all 34,203,123,497 model-tree bytes, all 34,201,521,212
required runtime bytes, and every calculated file SHA-256. It records observed
model revision from Hugging Face local-dir metadata, Wan Git HEAD,
files/bytes/SHA and operation/timestamp; it does not persist a
second list of expected bytes, files, or hashes. A partial download keeps
its reusable bytes and Hugging Face metadata on the Network Volume, but its
manifest is removed and it remains `CACHE_POPULATING`. A later CPU Pod resumes
the same `hf download --local-dir` and revalidates the physical tree against
the same current authority. A GPU bootstrap that finds `CACHE_MODEL_READY`
evidence performs that same physical validator before
the download branch and therefore does not download the model again.

The model/cache authority remains singular: `wan22-ti2v-5b`, the pinned model
and Wan revisions, the 12 required file hashes, and the STANDARD-volume cache
evidence. GPU capability profiles are not parallel model contracts. L40S
requires CC 8.9 and A40 requires CC 8.6; both require 48 GB VRAM, the same
image tag/digest, the same Python/Torch/CUDA/NVCC/FlashAttention versions, and
the same runtime bootstrap. L40S retains its existing static physical-runtime
certification. A40 remains `RUNPOD_RUNTIME_PREFLIGHT_CERTIFICATION_REQUIRED`
until one real runtime-only Pod produces matching evidence and is then deleted
with absence verified. For video placement, either GPU also needs a live
STANDARD datacenter and a locally certified cache replica; otherwise placement
returns `PLACEMENT_REQUIRES_CACHE_REPLICA`.

### CPU model staging without GPU-readiness claims

The same adapter exposes a read-only CPU staging precheck; it does not create a
second workflow or provision anything. Its image profile is separate from the
GPU profile: RunPod's official `runpodctl` documentation demonstrates
`ubuntu:22.04` for CPU Pods, and V142 requires that tag to resolve to
`sha256:2edbbc5dc405e9612ba3584ce95480277e3eb374407b5505fe26f17df77c7dbc`
before a future creation can be considered. The current candidate is `cpu3c`
in `EU-NL-1`, 2 vCPU, 4 GB RAM, with the runtime-selected STANDARD 50 GB
Network Volume mounted at `/workspace`. Its ID remains process configuration in
`JARVIS_RUNPOD_NETWORK_VOLUME_ID`; it is never compiled into the adapter.
Before a future `POST /pods`, the authenticated provider receipt must match
that exact ID, `EU-NL-1`, and at least 50 GB. RunPod's V1 Network Volume
response does not expose a per-volume type field, so the adapter does not
invent one: it separately requires the authenticated V2 datacenter catalog to
list `STANDARD` in `networkVolumeTypes` for the same `EU-NL-1` datacenter.
Only that joined evidence satisfies the STANDARD contract. The current
authenticated catalog snapshot reports `cpu3c` HIGH at USD 0.06/hour, but a
fresh read-only check remains mandatory and never authorizes creation by itself.

The physical CPU provisioning attempt on 2026-08-28 returned HTTP 500 with
`Container Disk must be less than or equal to 20` (provider request
`req_01c8f11d-1108-4f15-9cb4-4e3db4c48a75`) before any Pod was created. The
same CPU staging profile therefore records `maximumContainerDiskGb=20`, and
its default dry-run requests 20 GB. Values above that limit fail closed in the
zero-cost precheck as `RUNPOD_CPU_CONTAINER_DISK_EXCEEDS_PROVIDER_LIMIT` and
cannot reach `POST /pods`. This CPU-specific ceiling does not modify the L40S
GPU container-disk contract.

The subsequent physical CPU Pod `qt3yy61cxqwdcu` proved another provider
boundary: a digest-verified plain `ubuntu:22.04` container can reach RUNNING
without exposing an SSH server. Its first receipt reported zero uptime and no
ports; the Pod was deleted without a cache write and the volume remained
`CACHE_MISS`. The CPU profile therefore supplies one exact, audited
`dockerStartCmd`: it installs only CA certificates and OpenSSH server, requires
the provider-injected `PUBLIC_KEY`, writes that public key to root's
`authorized_keys`, creates host keys, and keeps PID 1 alive with `sshd -D -e`.
It contains no private key, RunPod credential, Wan/Hugging Face download,
bootstrap workload, sleep, or secret value. A plain Ubuntu payload without
this exact startup contract fails the zero-cost precheck before `POST /pods`.

RUNNING alone is not CPU runtime readiness. V142 requires increasing uptime,
the same TCP 22 endpoint across at least two polls, a real SSH authentication
as root using the dedicated local private key, the expected authorized public
key, a running `sshd`, and a writable `/workspace` mount. A transient missing
endpoint remains pending while the bounded runtime timeout is open. A missing
key, dead `sshd`, mismatched authorized key, or expired timeout requires Pod
deletion and cannot authorize cache writes.

CPU staging may clone the pinned Wan repository, run `hf download`, verify the
repository revision and every model byte/SHA-256, and write the observed-evidence
model manifest.
Its bootstrap starts with a Bash-only atomic progress writer, so neither the
initial progress event nor the `ERR` trap assumes Python, Git, or the Hugging
Face CLI. It then installs exactly `ca-certificates`, `git`, `python3`,
`python3-venv`, and `python3-pip` from a clean Ubuntu 22.04 base before the first
real Python use. It does not install FFmpeg, build-essential, the full Wan
requirements, CUDA, PyTorch-CUDA, NVCC, or FlashAttention. After
`CPU_RUNTIME_READY`, `/workspace` must be present and writable before any cache
write.
Its maximum state is `CACHE_MODEL_READY`. It cannot certify CUDA, NVCC,
PyTorch-CUDA, compute capability, FlashAttention CUDA kernels, Wan runtime help,
`CACHE_READY`, or `CACHE_HIT`. Those remain mandatory L40S physical checks.
At USD 0.06/hour, 30 minutes of CPU staging is USD 0.03 compute, excluding the
separately billed persistent Network Volume.

The latest physical CPU Pod `m5bodv5y8tziku` reached `MODEL_VALIDATION` and
wrote a readable manifest, but its one-off operator compared
`JSON.stringify(manifest.requiredFiles)` against another expected object whose
property insertion order differed. The values were equivalent: Python had
serialized keys as `bytes,path,sha256`, while JavaScript had constructed
`path,bytes,sha256`. That expected-vs-expected, order-sensitive comparison caused
`MODEL_MANIFEST_CONTRACT_MISMATCH`. The current path removes that comparison:
CPU and GPU run one shared expected-vs-physical validator, and both manifests
contain observed evidence only. The Pod was deleted, its GET returned 404, and
the partial/resumable bytes remain on Network Volume `su3d60su17`.

The bootstrap operation ownership is explicit:

| Operation | Internal owner |
| --- | --- |
| Bootstrap-safe progress, minimal apt packages, `/workspace` write probe | `CPU_MODEL_STAGING_BOOTSTRAP` |
| Pinned Wan clone, minimal Hugging Face CLI, resumable model download | `CPU_MODEL_STAGING_BOOTSTRAP` |
| Snapshot byte total, required-file bytes/SHA-256, atomic model manifest | `CPU_MODEL_STAGING_BOOTSTRAP` |
| FFmpeg/build toolchain, full Wan requirements, PyTorch/CUDA environment | `GPU_RUNTIME_BOOTSTRAP` |
| NVCC, compute capability, CUDA tensor, FlashAttention CUDA kernel | `GPU_RUNTIME_BOOTSTRAP` |
| `pip check`, imports, offline `generate.py --help`, runtime evidence | `GPU_RUNTIME_BOOTSTRAP` |
| `CACHE_MODEL_READY` | CPU maximum; GPU accepted input |
| `CACHE_READY` and physically reverified `CACHE_HIT` | GPU only |
| `RUNPOD_RUNTIME_PREFLIGHT_CERTIFIED` + `CACHE_MISS`, no inference | Runtime-only exit of the same `GPU_RUNTIME_BOOTSTRAP`; Pod cleanup must be verified |

The sanitized CPU dry-run is:

```json
{
  "cloudType": "SECURE",
  "computeType": "CPU",
  "containerDiskInGb": 20,
  "cpuFlavorIds": ["cpu3c"],
  "cpuFlavorPriority": "custom",
  "dataCenterIds": ["EU-NL-1"],
  "dataCenterPriority": "custom",
  "dockerStartCmd": [
    "bash",
    "-lc",
    "set -euo pipefail\nexport DEBIAN_FRONTEND=noninteractive\napt-get update\napt-get install -y --no-install-recommends openssh-server ca-certificates\nmkdir -p /run/sshd /root/.ssh\ntest -n \"${PUBLIC_KEY:-}\"\nprintf '%s\\n' \"${PUBLIC_KEY}\" > /root/.ssh/authorized_keys\nchmod 700 /root/.ssh\nchmod 600 /root/.ssh/authorized_keys\nssh-keygen -A\nexec /usr/sbin/sshd -D -e"
  ],
  "imageName": "ubuntu:22.04",
  "interruptible": false,
  "networkVolumeId": "<JARVIS_RUNPOD_NETWORK_VOLUME_ID>",
  "ports": ["22/tcp"],
  "supportPublicIp": true,
  "vcpuCount": 2,
  "volumeMountPath": "/workspace"
}
```

This body is structurally compatible with the current RunPod
`PodCreateInput` OpenAPI schema. It is evidence only and is not sent.

The adapter performs this single durable lifecycle:

1. Query official RunPod GPU availability and on-demand price for the one
   explicitly selected A40 or L40S profile and its runtime-selected datacenter.
   No GPU substitution or implicit datacenter fallback exists.
2. `POST https://rest.runpod.io/v1/pods` for exactly one on-demand Pod using
   the approved PyTorch 2.8/CUDA 12.8 tag after its registry manifest digest
   has been verified read-only,
   30 GB container disk and the selected profile's minimum RAM/vCPU,
   and TCP 22. Digest syntax inside `imageName`, a tag mismatch, or an
   unverifiable registry digest is rejected before billable capacity is
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
   Under the explicitly authorized runtime-only mode, the lifecycle stops after
   these physical runtime gates with `CACHE_MISS`, skips model/cache validation
   and inference, persists evidence only after verified cleanup, and proceeds
   directly to step 7.
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
