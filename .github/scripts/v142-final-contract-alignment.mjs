import fs from "node:fs";

function sourceOf(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function write(file, source) {
  fs.writeFileSync(file, source, "utf8");
}

function replaceExactOnce(file, before, after, label) {
  let source = sourceOf(file);
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  source = source.replace(before, after);
  write(file, source);
}

function appendOnce(file, marker, addition) {
  let source = sourceOf(file);
  if (source.includes(marker)) return;
  write(file, `${source.trimEnd()}\n\n${addition.trim()}\n`);
}

function assertCurrentV142Authority() {
  const bridge = sourceOf("jarvis-fs-bridge.js");
  const engine = sourceOf("jarvis-local-video-engine.js");
  const runner = sourceOf("scripts/jarvis-local-video-wan22.py");
  const doc = sourceOf("docs/jarvis-local-video-v142.md");
  const required = [
    [bridge, "RUNPOD_L40S_IDENTITY_BACKEND_REQUIRED", "V142_IDENTITY_BRIDGE_FAIL_CLOSED"],
    [engine, "LOCAL_VIDEO_IDENTITY_FIDELITY_UNSUPPORTED", "V142_IDENTITY_GATE_ENGINE"],
    [engine, "!requiresIdentityFidelity && references.length > Number(model.maximumReferenceAssets || 0)", "V142_IDENTITY_REFERENCES_STAY_SEPARATE"],
    [engine, "RUNPOD_PROVISION_CLEANUP_FAILED", "V142_PROVISION_CLEANUP_FAIL_CLOSED"],
    [engine, "cleanupFailure.remoteWorker", "V142_PROVISION_CLEANUP_RETAINS_POD"],
    [runner, "LOCAL_VIDEO_RUNTIME_UNSUPPORTED", "V142_UNKNOWN_RUNTIME_FAIL_CLOSED"],
    [doc, "must never be merged into a contact sheet, collage, or identity sheet", "V142_DOC_IDENTITY_SHEET_FORBIDDEN"],
    [doc, "cleanup is download-first", "V142_DOC_DOWNLOAD_FIRST"]
  ];
  for (const [source, marker, label] of required) {
    if (!source.includes(marker)) throw new Error(`${label}_MISSING`);
  }
  if (
    !runner.includes("LOCAL_VIDEO_HUMO_EXECUTOR_NOT_IMPLEMENTED") &&
    !runner.includes("def run_humo_identity_probe(")
  ) {
    throw new Error("V142_HUMO_EXECUTOR_STATE_MISSING");
  }
  if (bridge.includes("invocationPayload.requiresIdentityFidelity = false")) {
    throw new Error("V142_IDENTITY_FIDELITY_BYPASS_STILL_PRESENT");
  }
}

function ensureShotIdentityBindings() {
  const artifactStudioFile = "jarvis-artifact-studio.js";
  const actuatorFile = "gestia-core/jarvis/jarvis.actuator.pack.js";
  const engineFile = "jarvis-local-video-engine.js";
  const testFile = "tests/jarvis-video-reference-mission-continuity-v142.test.mjs";

  replaceExactOnce(
    artifactStudioFile,
    `        castIds: clone(episode.castIds),\n        storyBeats: clone(episode.storyBeats),`,
    `        castIds: clone(episode.castIds),\n        cast: (episode.castIds || []).map(characterId => ({\n            characterId,\n            displayName: clean(canon.characters?.[characterId]?.displayName) || characterId\n        })),\n        storyBeats: clone(episode.storyBeats),`,
    "V142_SERIES_CONTEXT_EXPOSES_CAST_IDENTITY"
  );

  replaceExactOnce(
    actuatorFile,
    `export function buildLocalSeriesShotPlan(timeline = []) {`,
    `function normalizeSeriesIdentityLabel(value = "") {\n    return String(value || "")\n        .normalize("NFD")\n        .replace(/[\\u0300-\\u036f]/g, "")\n        .trim()\n        .toUpperCase();\n}\n\nfunction resolveShotIdentityBindings(activeSegments = [], cast = [], references = []) {\n    const directory = new Map();\n    for (const character of Array.isArray(cast) ? cast : []) {\n        const characterId = String(character?.characterId || "").trim();\n        if (!characterId) continue;\n        for (const label of [characterId, character?.displayName]) {\n            const normalized = normalizeSeriesIdentityLabel(label);\n            if (normalized) directory.set(normalized, characterId);\n        }\n    }\n    const characterIds = [];\n    for (const segment of Array.isArray(activeSegments) ? activeSegments : []) {\n        for (const rawLine of Array.isArray(segment?.lines) ? segment.lines : []) {\n            const speaker = /^([^:]{1,120}):\\s*/u.exec(String(rawLine || "").trim())?.[1] || "";\n            const characterId = directory.get(normalizeSeriesIdentityLabel(speaker));\n            if (characterId && !characterIds.includes(characterId)) characterIds.push(characterId);\n        }\n    }\n    if (characterIds.length === 0 && Array.isArray(cast) && cast.length === 1) {\n        const onlyCharacterId = String(cast[0]?.characterId || "").trim();\n        if (onlyCharacterId) characterIds.push(onlyCharacterId);\n    }\n    const referenceOutputs = (Array.isArray(references) ? references : [])\n        .filter(reference => characterIds.includes(String(reference?.characterId || "").trim()))\n        .map(reference => String(reference?.sourceOutput || "").trim())\n        .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);\n    return {\n        characterIds,\n        referenceOutputs,\n        mode: characterIds.length === 0\n            ? "unassigned"\n            : characterIds.length === 1\n                ? "single_identity"\n                : "multi_identity"\n    };\n}\n\nexport function buildLocalSeriesShotPlan(timeline = [], { cast = [], references = [] } = {}) {`,
    "V142_SHOT_PLAN_IDENTITY_BINDING_HELPERS"
  );

  replaceExactOnce(
    actuatorFile,
    `        const activeSegments = segments.filter(segment =>\n            Number(segment.startSeconds) < endSeconds &&\n            Number(segment.endSeconds) > startSeconds\n        );\n        return {`,
    `        const activeSegments = segments.filter(segment =>\n            Number(segment.startSeconds) < endSeconds &&\n            Number(segment.endSeconds) > startSeconds\n        );\n        const identity = resolveShotIdentityBindings(activeSegments, cast, references);\n        return {`,
    "V142_SHOT_PLAN_RESOLVES_IDENTITY"
  );

  replaceExactOnce(
    actuatorFile,
    `            startSeconds,\n            durationSeconds,\n            prompt: [`,
    `            startSeconds,\n            durationSeconds,\n            characterIds: identity.characterIds,\n            identityReferenceOutputs: identity.referenceOutputs,\n            identityMode: identity.mode,\n            prompt: [`,
    "V142_SHOT_PLAN_PERSISTS_IDENTITY_BINDING"
  );

  replaceExactOnce(
    actuatorFile,
    `                const seriesShotPlan = seriesTimeline.length > 0\n                    ? buildLocalSeriesShotPlan(seriesTimeline)\n                    : [];`,
    `                const seriesShotPlan = seriesTimeline.length > 0\n                    ? buildLocalSeriesShotPlan(seriesTimeline, {\n                        cast: seriesContext?.cast || [],\n                        references: seriesContext?.referenceAssets || []\n                    })\n                    : [];`,
    "V142_SERIES_SHOTS_USE_CANON_IDENTITY"
  );

  replaceExactOnce(
    engineFile,
    `                segmentTitle: String(shot?.segmentTitle || "").trim() || null,\n                startSeconds: Number(shot?.startSeconds),`,
    `                segmentTitle: String(shot?.segmentTitle || "").trim() || null,\n                characterIds: [...new Set((Array.isArray(shot?.characterIds) ? shot.characterIds : [])\n                    .map(value => String(value || "").trim())\n                    .filter(Boolean))],\n                identityReferenceOutputs: [...new Set((Array.isArray(shot?.identityReferenceOutputs)\n                    ? shot.identityReferenceOutputs\n                    : [])\n                    .map(value => String(value || "").trim().replaceAll("\\\\", "/"))\n                    .filter(Boolean))],\n                identityMode: new Set(["unassigned", "single_identity", "multi_identity"]).has(\n                    String(shot?.identityMode || "").trim()\n                ) ? String(shot.identityMode).trim() : "unassigned",\n                startSeconds: Number(shot?.startSeconds),`,
    "V142_ENGINE_PRESERVES_SHOT_IDENTITY"
  );

  replaceExactOnce(
    engineFile,
    `                !shot.shotId || !shot.prompt ||\n                !(shot.durationSeconds > 0 && shot.durationSeconds <= 5) ||`,
    `                !shot.shotId || !shot.prompt ||\n                (shot.identityMode === "single_identity" && shot.characterIds.length !== 1) ||\n                (shot.identityMode === "multi_identity" && shot.characterIds.length < 2) ||\n                (shot.identityMode === "unassigned" && shot.characterIds.length !== 0) ||\n                shot.identityReferenceOutputs.some(output => !referenceOutputs.includes(output)) ||\n                !(shot.durationSeconds > 0 && shot.durationSeconds <= 5) ||`,
    "V142_ENGINE_VALIDATES_SHOT_IDENTITY_BINDING"
  );

  replaceExactOnce(
    testFile,
    `import { registerJarvisActuatorTools } from "../gestia-core/jarvis/jarvis.actuator.pack.js";`,
    `import {\n    buildLocalSeriesShotPlan,\n    registerJarvisActuatorTools\n} from "../gestia-core/jarvis/jarvis.actuator.pack.js";`,
    "V142_TEST_IMPORT_SHOT_PLAN_IDENTITY"
  );

  appendOnce(
    testFile,
    "v142 series shots bind explicit character references without cross-identity collage",
    `test("v142 series shots bind explicit character references without cross-identity collage", () => {\n    const timeline = [{\n        segmentId: "segment-1", title: "Heberto", startSeconds: 0, endSeconds: 5,\n        durationSeconds: 5, lines: ["HEBERTO: Ya quedo."], text: "HEBERTO: Ya quedo."\n    }, {\n        segmentId: "segment-2", title: "Roldan", startSeconds: 5, endSeconds: 10,\n        durationSeconds: 5, lines: ["ROLDAN: Falta nivelar."], text: "ROLDAN: Falta nivelar."\n    }, {\n        segmentId: "segment-3", title: "Ambos", startSeconds: 10, endSeconds: 15,\n        durationSeconds: 5, lines: ["HEBERTO: Sostengo.", "ROLDAN: Termino."],\n        text: "HEBERTO: Sostengo. ROLDAN: Termino."\n    }];\n    const cast = [\n        { characterId: "CHAR_HEBERTO", displayName: "Heberto" },\n        { characterId: "CHAR_ROLDAN", displayName: "Roldan" }\n    ];\n    const references = [\n        { characterId: "CHAR_HEBERTO", sourceOutput: ".jarvis-artifacts/images/heberto.png" },\n        { characterId: "CHAR_ROLDAN", sourceOutput: ".jarvis-artifacts/images/roldan.png" }\n    ];\n    const shots = buildLocalSeriesShotPlan(timeline, { cast, references });\n    assert.deepEqual(shots[0].characterIds, ["CHAR_HEBERTO"]);\n    assert.deepEqual(shots[0].identityReferenceOutputs, [references[0].sourceOutput]);\n    assert.equal(shots[0].identityMode, "single_identity");\n    assert.deepEqual(shots[1].characterIds, ["CHAR_ROLDAN"]);\n    assert.deepEqual(shots[1].identityReferenceOutputs, [references[1].sourceOutput]);\n    assert.equal(shots[1].identityMode, "single_identity");\n    assert.deepEqual(shots[2].characterIds, ["CHAR_HEBERTO", "CHAR_ROLDAN"]);\n    assert.deepEqual(shots[2].identityReferenceOutputs, references.map(item => item.sourceOutput));\n    assert.equal(shots[2].identityMode, "multi_identity");\n});`
  );
}

function ensureHuMoIdentityProbeExecutor() {
  const engineFile = "jarvis-local-video-engine.js";
  const runnerFile = "scripts/jarvis-local-video-wan22.py";
  const testFile = "tests/jarvis-local-video-engine-v142.test.mjs";

  replaceExactOnce(
    engineFile,
    `    candidatePortrait: Object.freeze({\n        width: 480,\n        height: 832,\n        fps: 25,\n        frames: 97\n    }),`,
    `    candidateProbeGeometry: Object.freeze({\n        width: 832,\n        height: 480,\n        fps: 25,\n        frames: 97,\n        durationSeconds: 3.88,\n        orientation: "landscape"\n    }),\n    portraitTargetUnresolved: true,`,
    "V142_HUMO_PROBE_GEOMETRY_MATCHES_OFFICIAL_RUNTIME"
  );

  replaceExactOnce(
    runnerFile,
    `        "mode": "TIA",\n        "portrait_size": "480*832",\n        "landscape_size": "832*480",\n        "target_fps": 25.0,\n        "frame_count": 97,\n        "reference_assets": True,\n        "max_reference_assets": 3,\n        "audio_required": True,\n        "physical_runtime_certified": False,`,
    `        "mode": "TIA",\n        "probe_size": "832*480",\n        "probe_width": 832,\n        "probe_height": 480,\n        "target_fps": 25.0,\n        "frame_count": 97,\n        "probe_duration_seconds": 3.88,\n        "reference_assets": True,\n        "max_reference_assets": 3,\n        "maximum_identity_count": 1,\n        "audio_required": True,\n        "runtime_assets_pinned": False,\n        "physical_runtime_certified": False,`,
    "V142_HUMO_RUNNER_PROBE_GEOMETRY"
  );

  replaceExactOnce(
    runnerFile,
    `    if runtime == "humo":\n        if (\n            config.get("physical_runtime_certified") is not True\n            or config.get("physical_portrait_certified") is not True\n            or config.get("paid_execution_authorized") is not True\n        ):\n            raise RuntimeError("LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED")\n        raise RuntimeError("LOCAL_VIDEO_HUMO_EXECUTOR_NOT_IMPLEMENTED")`,
    `    if runtime == "humo":\n        if (\n            config.get("physical_runtime_certified") is not True\n            or config.get("physical_portrait_certified") is not True\n            or config.get("paid_execution_authorized") is not True\n        ):\n            raise RuntimeError("LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED")\n        if config.get("runtime_assets_pinned") is not True:\n            raise RuntimeError("LOCAL_VIDEO_HUMO_RUNTIME_ASSETS_INCOMPLETE")\n        return backend, config`,
    "V142_HUMO_RESOLVER_REACHES_EXECUTOR_ONLY_AFTER_GATES"
  );

  replaceExactOnce(
    runnerFile,
    `def run(job_file: Path, result_file: Path) -> int:\n    job = read_json(job_file)`,
    `def _required_humo_path(value: str, status: str, directory: bool = False) -> Path:\n    raw = str(value or "").strip()\n    if not raw:\n        raise RuntimeError(status)\n    candidate = Path(raw).resolve()\n    if directory:\n        if not candidate.is_dir():\n            raise RuntimeError(status)\n    elif not candidate.is_file():\n        raise RuntimeError(status)\n    return candidate\n\n\ndef _humo_executable(value: str, fallback: str) -> str:\n    requested = str(value or "").strip()\n    if requested:\n        resolved = shutil.which(requested) if not Path(requested).is_absolute() else requested\n        if resolved and Path(resolved).is_file():\n            return str(resolved)\n        raise RuntimeError("LOCAL_VIDEO_HUMO_TORCHRUN_UNAVAILABLE")\n    resolved = shutil.which(fallback)\n    if not resolved:\n        raise RuntimeError("LOCAL_VIDEO_HUMO_TORCHRUN_UNAVAILABLE")\n    return str(resolved)\n\n\ndef _trim_humo_probe_audio(\n    source: Path,\n    target: Path,\n    ffmpeg: str,\n    start_seconds: float,\n    duration_seconds: float,\n) -> None:\n    target.parent.mkdir(parents=True, exist_ok=True)\n    completed = subprocess.run(\n        [\n            ffmpeg,\n            "-hide_banner", "-nostdin", "-loglevel", "error", "-y",\n            "-ss", f"{start_seconds:.6f}",\n            "-t", f"{duration_seconds:.6f}",\n            "-i", str(source),\n            "-ar", "16000", "-ac", "1",\n            str(target),\n        ],\n        check=False,\n        capture_output=True,\n        text=True,\n        timeout=120,\n    )\n    if completed.returncode != 0 or not target.is_file() or target.stat().st_size <= 44:\n        diagnostic = str(completed.stderr or completed.stdout or "")[-1000:]\n        raise RuntimeError(f"LOCAL_VIDEO_HUMO_AUDIO_PREPARATION_FAILED:{diagnostic}")\n\n\ndef run_humo_identity_probe(\n    job: dict[str, Any], result_file: Path, config: dict[str, Any]\n) -> int:\n    shot_plan = list(job.get("shotPlan") or [])\n    if len(shot_plan) != 1:\n        raise RuntimeError("LOCAL_VIDEO_HUMO_IDENTITY_PROBE_SINGLE_SHOT_REQUIRED")\n    shot = shot_plan[0]\n    identity_mode = str(shot.get("identityMode") or "").strip()\n    character_ids = [str(value or "").strip() for value in shot.get("characterIds") or [] if str(value or "").strip()]\n    if identity_mode == "multi_identity" or len(character_ids) > int(config["maximum_identity_count"]):\n        raise RuntimeError("LOCAL_VIDEO_HUMO_MULTI_IDENTITY_UNSUPPORTED")\n    if identity_mode != "single_identity" or len(character_ids) != 1:\n        raise RuntimeError("LOCAL_VIDEO_HUMO_IDENTITY_ASSIGNMENT_REQUIRED")\n    duration_seconds = float(shot.get("durationSeconds") or 0)\n    maximum_duration = float(config["probe_duration_seconds"])\n    if not 0 < duration_seconds <= maximum_duration + 0.001:\n        raise RuntimeError("LOCAL_VIDEO_HUMO_IDENTITY_PROBE_DURATION_UNSUPPORTED")\n\n    reference_outputs = [str(value or "").strip().replace("\\\\", "/") for value in job.get("referenceOutputs") or []]\n    reference_files = [Path(str(value)).resolve() for value in job.get("referenceFiles") or []]\n    if len(reference_outputs) != len(reference_files):\n        raise RuntimeError("LOCAL_VIDEO_HUMO_REFERENCE_BINDING_INVALID")\n    reference_map = dict(zip(reference_outputs, reference_files))\n    identity_outputs = [\n        str(value or "").strip().replace("\\\\", "/")\n        for value in shot.get("identityReferenceOutputs") or []\n        if str(value or "").strip()\n    ]\n    identity_files = [reference_map.get(output) for output in identity_outputs]\n    if (\n        not identity_files\n        or len(identity_files) > int(config["max_reference_assets"])\n        or any(file is None or not file.is_file() for file in identity_files)\n    ):\n        raise RuntimeError("LOCAL_VIDEO_HUMO_REFERENCE_BINDING_INVALID")\n\n    audio_raw = str(job.get("audioFile") or "").strip()\n    audio_file = _required_humo_path(audio_raw, "LOCAL_VIDEO_HUMO_AUDIO_REFERENCE_REQUIRED")\n    ffmpeg = os.environ.get("JARVIS_FFMPEG_PATH") or shutil.which("ffmpeg")\n    ffprobe = os.environ.get("JARVIS_FFPROBE_PATH") or shutil.which("ffprobe")\n    if not ffmpeg:\n        raise RuntimeError("LOCAL_VIDEO_FFMPEG_UNAVAILABLE")\n    if not ffprobe:\n        raise RuntimeError("LOCAL_VIDEO_FFPROBE_UNAVAILABLE")\n\n    humo_root = _required_humo_path(\n        os.environ.get("JARVIS_HUMO_REPO_DIR", ""),\n        "LOCAL_VIDEO_HUMO_REPOSITORY_NOT_CONFIGURED",\n        directory=True,\n    )\n    main_file = _required_humo_path(\n        str(humo_root / str(config["entrypoint"])),\n        "LOCAL_VIDEO_HUMO_REPOSITORY_NOT_READY",\n    )\n    config_file = _required_humo_path(\n        str(humo_root / str(config["config_path"])),\n        "LOCAL_VIDEO_HUMO_CONFIG_NOT_READY",\n    )\n    humo_weights = _required_humo_path(\n        os.environ.get("JARVIS_HUMO_WEIGHTS_DIR", ""),\n        "LOCAL_VIDEO_HUMO_WEIGHTS_NOT_CONFIGURED",\n        directory=True,\n    )\n    wan21_weights = _required_humo_path(\n        os.environ.get("JARVIS_HUMO_WAN21_MODEL_DIR", ""),\n        "LOCAL_VIDEO_HUMO_WAN21_ASSETS_NOT_CONFIGURED",\n        directory=True,\n    )\n    checkpoint = _required_humo_path(\n        str(humo_weights / "HuMo-1.7B" / "ema.pth"),\n        "LOCAL_VIDEO_HUMO_CHECKPOINT_MISSING",\n    )\n    zero_vae = _required_humo_path(\n        str(humo_weights / "zero_vae_129frame.pt"),\n        "LOCAL_VIDEO_HUMO_ZERO_VAE_MISSING",\n    )\n    wan21_vae = _required_humo_path(\n        str(wan21_weights / "Wan2.1_VAE.pth"),\n        "LOCAL_VIDEO_HUMO_WAN21_VAE_MISSING",\n    )\n    t5_checkpoint = _required_humo_path(\n        str(wan21_weights / "models_t5_umt5-xxl-enc-bf16.pth"),\n        "LOCAL_VIDEO_HUMO_T5_MISSING",\n    )\n    t5_tokenizer = _required_humo_path(\n        str(wan21_weights / "google" / "umt5-xxl"),\n        "LOCAL_VIDEO_HUMO_T5_TOKENIZER_MISSING",\n        directory=True,\n    )\n    whisper = _required_humo_path(\n        os.environ.get("JARVIS_HUMO_WHISPER_DIR", ""),\n        "LOCAL_VIDEO_HUMO_WHISPER_MISSING",\n        directory=True,\n    )\n    separator = _required_humo_path(\n        os.environ.get("JARVIS_HUMO_AUDIO_SEPARATOR_FILE", ""),\n        "LOCAL_VIDEO_HUMO_AUDIO_SEPARATOR_MISSING",\n    )\n    torchrun = _humo_executable(os.environ.get("JARVIS_HUMO_TORCHRUN", ""), "torchrun")\n\n    output_file = Path(str(job.get("outputFile") or "")).resolve()\n    output_file.parent.mkdir(parents=True, exist_ok=True)\n    operation_id = str(job.get("operationId") or "identity-probe").replace("/", "-")\n    probe_root = output_file.parent / f"humo-probe-{operation_id}"\n    probe_output = probe_root / "output"\n    probe_output.mkdir(parents=True, exist_ok=True)\n    item_name = "identity_probe"\n    prompt_file = probe_root / "prompt.json"\n    probe_audio = probe_root / "audio.wav"\n    _trim_humo_probe_audio(\n        audio_file,\n        probe_audio,\n        str(ffmpeg),\n        float(shot.get("startSeconds") or 0),\n        duration_seconds,\n    )\n    write_json_atomic(prompt_file, {\n        item_name: {\n            "img_paths": [str(file) for file in identity_files],\n            "audio_path": str(probe_audio),\n            "prompt": build_prompt(job, str(shot.get("prompt") or "")),\n        }\n    })\n\n    command = [\n        torchrun,\n        "--standalone",\n        "--nnodes=1",\n        "--nproc_per_node=1",\n        str(main_file),\n        str(config_file),\n        "dit.sp_size=1",\n        f"generation.frames={int(config['frame_count'])}",\n        "generation.seed=666666",\n        "generation.scale_t=7.0",\n        "generation.scale_i=4.0",\n        "generation.scale_a=7.5",\n        "generation.mode=TIA",\n        f"generation.height={int(config['probe_height'])}",\n        f"generation.width={int(config['probe_width'])}",\n        "diffusion.timesteps.sampling.steps=50",\n        f"generation.positive_prompt={prompt_file}",\n        f"generation.output.dir={probe_output}",\n        f"dit.checkpoint_dir={checkpoint}",\n        f"dit.zero_vae_path={zero_vae}",\n        f"vae.checkpoint={wan21_vae}",\n        f"text.t5_checkpoint={t5_checkpoint}",\n        f"text.t5_tokenizer={t5_tokenizer}",\n        f"audio.vocal_separator={separator}",\n        f"audio.wav2vec_model={whisper}",\n    ]\n    completed = subprocess.run(\n        command,\n        cwd=humo_root,\n        env=offline_environment(),\n        check=False,\n        capture_output=True,\n        text=True,\n        timeout=int(os.environ.get("JARVIS_LOCAL_VIDEO_TIMEOUT_SECONDS", "7200")),\n    )\n    if completed.returncode != 0:\n        diagnostic = str(completed.stderr or completed.stdout or "")[-2000:]\n        raise RuntimeError(f"LOCAL_VIDEO_HUMO_EXIT_{completed.returncode}:{diagnostic}")\n\n    generated = probe_output / f"{item_name}_seed666666.mp4"\n    if not generated.is_file() or generated.stat().st_size < 100000:\n        raise RuntimeError("LOCAL_VIDEO_HUMO_PHYSICAL_OUTPUT_INVALID")\n    media = inspect_video(generated, str(ffprobe))\n    if (\n        int(media.get("width") or 0) != int(config["probe_width"])\n        or int(media.get("height") or 0) != int(config["probe_height"])\n        or float(media.get("fps") or 0) + 0.01 < float(config["target_fps"])\n    ):\n        raise RuntimeError("LOCAL_VIDEO_HUMO_PROBE_MEDIA_MISMATCH")\n    os.replace(generated, output_file)\n    media = inspect_video(output_file, str(ffprobe))\n    write_json_atomic(result_file, {\n        "ok": True,\n        "status": "LOCAL_VIDEO_HUMO_IDENTITY_PROBE_COMPLETED",\n        "runnerVersion": RUNNER_VERSION,\n        "operationId": str(job.get("operationId") or ""),\n        "operationName": str(job.get("operationName") or ""),\n        "output": str(job.get("output") or ""),\n        "mimeType": "video/mp4",\n        "backend": str(job.get("backend") or "humo-1.7b-identity"),\n        "model": str(config["model"]),\n        "engine": "local",\n        "provider": "local",\n        "externalApiUsed": False,\n        "externalEstimatedCostUsd": 0,\n        "identityMode": "single_identity",\n        "characterIds": character_ids,\n        "identityReferenceOutputs": identity_outputs,\n        "identityProbe": True,\n        "portraitCertified": False,\n        "probeGeometry": {\n            "width": int(config["probe_width"]),\n            "height": int(config["probe_height"]),\n            "fps": float(config["target_fps"]),\n            "frames": int(config["frame_count"]),\n        },\n        **media,\n    })\n    return 0\n\n\ndef run(job_file: Path, result_file: Path) -> int:\n    job = read_json(job_file)`,
    "V142_HUMO_IDENTITY_PROBE_EXECUTOR"
  );

  replaceExactOnce(
    runnerFile,
    `    backend, config = resolve_backend(job)\n    repo_env = str(config["repo_env"])`,
    `    backend, config = resolve_backend(job)\n    if str(config.get("runtime") or "wan22").strip().lower() == "humo":\n        return run_humo_identity_probe(job, result_file, config)\n    repo_env = str(config["repo_env"])`,
    "V142_HUMO_RUNTIME_DISPATCH"
  );

  replaceExactOnce(
    testFile,
    `test("V142 HuMo runner cannot fall through to Wan runtime", () => {\n    const runner = fs.readFileSync(\n        new URL("../scripts/jarvis-local-video-wan22.py", import.meta.url),\n        "utf8"\n    );\n    const start = runner.indexOf("def resolve_backend(");\n    const end = runner.indexOf("def offline_environment(", start);\n    assert.ok(start >= 0 && end > start);\n    const resolver = runner.slice(start, end);\n    assert.match(resolver, /runtime = str\\(config\\.get\\("runtime"\\) or "wan22"\\)/);\n    assert.match(resolver, /LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED/);\n    assert.match(resolver, /LOCAL_VIDEO_HUMO_EXECUTOR_NOT_IMPLEMENTED/);\n    assert.match(resolver, /LOCAL_VIDEO_RUNTIME_UNSUPPORTED/);\n    assert.ok(\n        resolver.indexOf("LOCAL_VIDEO_HUMO_EXECUTOR_NOT_IMPLEMENTED") <\n        resolver.indexOf("return backend, config")\n    );\n});`,
    `test("V142 HuMo identity probe executor exists but remains behind certification and asset authority", () => {\n    const runner = fs.readFileSync(\n        new URL("../scripts/jarvis-local-video-wan22.py", import.meta.url),\n        "utf8"\n    );\n    const start = runner.indexOf("def resolve_backend(");\n    const end = runner.indexOf("def offline_environment(", start);\n    assert.ok(start >= 0 && end > start);\n    const resolver = runner.slice(start, end);\n    assert.match(resolver, /runtime = str\\(config\\.get\\("runtime"\\) or "wan22"\\)/);\n    assert.match(resolver, /LOCAL_VIDEO_IDENTITY_RUNTIME_NOT_CERTIFIED/);\n    assert.match(resolver, /LOCAL_VIDEO_HUMO_RUNTIME_ASSETS_INCOMPLETE/);\n    assert.match(resolver, /LOCAL_VIDEO_RUNTIME_UNSUPPORTED/);\n    assert.doesNotMatch(resolver, /LOCAL_VIDEO_HUMO_EXECUTOR_NOT_IMPLEMENTED/);\n\n    const executorStart = runner.indexOf("def run_humo_identity_probe(");\n    const runStart = runner.indexOf("def run(job_file:", executorStart);\n    assert.ok(executorStart >= 0 && runStart > executorStart);\n    const executor = runner.slice(executorStart, runStart);\n    for (const marker of [\n        "LOCAL_VIDEO_HUMO_IDENTITY_PROBE_SINGLE_SHOT_REQUIRED",\n        "LOCAL_VIDEO_HUMO_MULTI_IDENTITY_UNSUPPORTED",\n        "LOCAL_VIDEO_HUMO_IDENTITY_ASSIGNMENT_REQUIRED",\n        "LOCAL_VIDEO_HUMO_IDENTITY_PROBE_DURATION_UNSUPPORTED",\n        "generation.mode=TIA",\n        "generation.height=",\n        "generation.width=",\n        "generation.positive_prompt=",\n        "audio.vocal_separator=",\n        "audio.wav2vec_model=",\n        "LOCAL_VIDEO_HUMO_IDENTITY_PROBE_COMPLETED"\n    ]) assert.equal(executor.includes(marker), true, marker);\n    assert.match(runner, /"probe_width": 832/);\n    assert.match(runner, /"probe_height": 480/);\n    assert.match(runner, /"probe_duration_seconds": 3\\.88/);\n});`,
    "V142_HUMO_EXECUTOR_REGRESSION"
  );

  replaceExactOnce(
    testFile,
    `    assert.match(candidate, /width: 480/);\n    assert.match(candidate, /height: 832/);`,
    `    assert.match(candidate, /width: 832/);\n    assert.match(candidate, /height: 480/);\n    assert.match(candidate, /durationSeconds: 3\\.88/);\n    assert.match(candidate, /portraitTargetUnresolved: true/);`,
    "V142_HUMO_CANDIDATE_GEOMETRY_REGRESSION"
  );
}

assertCurrentV142Authority();
ensureShotIdentityBindings();
ensureHuMoIdentityProbeExecutor();
assertCurrentV142Authority();

const engine = sourceOf("jarvis-local-video-engine.js");
const actuator = sourceOf("gestia-core/jarvis/jarvis.actuator.pack.js");
const artifactStudio = sourceOf("jarvis-artifact-studio.js");
const runner = sourceOf("scripts/jarvis-local-video-wan22.py");
const identityBindingTest = sourceOf("tests/jarvis-video-reference-mission-continuity-v142.test.mjs");
const localVideoTest = sourceOf("tests/jarvis-local-video-engine-v142.test.mjs");

for (const marker of [
  "characterIds: identity.characterIds",
  "identityReferenceOutputs: identity.referenceOutputs",
  "identityMode: identity.mode",
  "buildLocalSeriesShotPlan(seriesTimeline, {"
]) {
  if (!actuator.includes(marker)) throw new Error(`V142_SHOT_IDENTITY_ACTUATOR_MISSING:${marker}`);
}
if (!artifactStudio.includes("cast: (episode.castIds || []).map(characterId => ({")) {
  throw new Error("V142_SERIES_CONTEXT_CAST_DIRECTORY_MISSING");
}
for (const marker of [
  "identityReferenceOutputs",
  "identityMode",
  "shot.identityReferenceOutputs.some(output => !referenceOutputs.includes(output))",
  "candidateProbeGeometry",
  "portraitTargetUnresolved: true"
]) {
  if (!engine.includes(marker)) throw new Error(`V142_SHOT_IDENTITY_ENGINE_MISSING:${marker}`);
}
for (const marker of [
  "def run_humo_identity_probe(",
  "LOCAL_VIDEO_HUMO_RUNTIME_ASSETS_INCOMPLETE",
  "LOCAL_VIDEO_HUMO_MULTI_IDENTITY_UNSUPPORTED",
  '"probe_width": 832',
  '"probe_height": 480',
  '"probe_duration_seconds": 3.88'
]) {
  if (!runner.includes(marker)) throw new Error(`V142_HUMO_EXECUTOR_MISSING:${marker}`);
}
if (runner.includes("LOCAL_VIDEO_HUMO_EXECUTOR_NOT_IMPLEMENTED")) {
  throw new Error("V142_HUMO_EXECUTOR_STILL_MARKED_NOT_IMPLEMENTED");
}
if (!identityBindingTest.includes("v142 series shots bind explicit character references without cross-identity collage")) {
  throw new Error("V142_SHOT_IDENTITY_REGRESSION_MISSING");
}
if (!localVideoTest.includes("V142 HuMo identity probe executor exists but remains behind certification and asset authority")) {
  throw new Error("V142_HUMO_EXECUTOR_REGRESSION_MISSING");
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_RUNPOD_L40S_IDENTITY_FIDELITY_GUARD_VERIFIED",
  sameSemanticAuthority: true,
  identityFidelityRequiredForReferences: true,
  identityReferencesRemainSeparate: true,
  identityRuntimeCandidate: "humo-1.7b-identity",
  identityRuntimePhysicallyCertified: false,
  identityRuntimePaidExecutionAuthorized: false,
  identityRuntimeAssetsPinned: false,
  identityProbeExecutorImplemented: true,
  identityProbeGeometry: "832x480@25fps_97frames",
  portraitTargetUnresolved: true,
  shotIdentityBindingsPersisted: true,
  multiIdentityShotsRemainExplicit: true,
  multiIdentityExecutionBlocked: true,
  successfulGenerationDownloadsBeforeRelease: true,
  paidSpendGuardedByExistingRunpodAuthority: true,
  newFiles: false,
  newBrains: false
}));