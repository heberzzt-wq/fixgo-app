import fs from "node:fs";
import { execFileSync } from "node:child_process";

const PRODUCT_BASE_COMMIT = "e22cb88b4f494f10bf4590a75a4ceb0d2ad47de5";
const WAN21_REVISION = "37ec512624d61f7aa208f7ea8140a131f93afc9a";
const LOCAL_VIDEO_ENGINE = "jarvis-local-video-engine.js";
const LOCAL_VIDEO_TEST = "tests/jarvis-local-video-engine-v142.test.mjs";
const FS_BRIDGE = "jarvis-fs-bridge.js";

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function write(file, source) {
  fs.writeFileSync(file, source, "utf8");
}

function replaceExactOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  return source.replace(before, after);
}

function appendOnce(source, marker, addition) {
  if (source.includes(marker)) return source;
  return `${source.trimEnd()}\n\n${addition.trim()}\n`;
}

let engine = read(LOCAL_VIDEO_ENGINE);

engine = replaceExactOnce(
  engine,
  [
    '            "  progress HUMO_ASSETS RUNNING",',
    '            `  "$VENV/bin/hf" download ${authority.modelRepository} --revision ${authority.modelRevision} --local-dir "$HUMO_WEIGHTS"`,',
    '            "  \\\"$VENV/bin/hf\\\" download Wan-AI/Wan2.1-T2V-1.3B --local-dir \\\"$WAN21_WEIGHTS\\\"",',
    '            `  "$VENV/bin/hf" download ${authority.whisper.repository} --revision ${authority.whisper.revision} --local-dir "$WHISPER_DIR"`,',
    '            `  test -f "$HUMO_WEIGHTS/${authority.checkpoint.path}"`,'
  ].join("\n"),
  [
    '            "  export HF_HUB_DISABLE_XET=1",',
    '            "  export HF_HUB_DOWNLOAD_TIMEOUT=60",',
    '            "  humo_hf_download() {",',
    '            "    \\\"$VENV/bin/hf\\\" download \\\"$@\\\" --max-workers 1 && return 0",',
    '            "    sleep 5",',
    '            "    \\\"$VENV/bin/hf\\\" download \\\"$@\\\" --max-workers 1",',
    '            "  }",',
    '            "  progress HUMO_ASSETS_HUMO RUNNING",',
    '            `  humo_hf_download ${authority.modelRepository} --revision ${authority.modelRevision} --local-dir "$HUMO_WEIGHTS"`,',
    '            "  progress HUMO_ASSETS_HUMO READY",',
    '            "  progress HUMO_ASSETS_WAN21 RUNNING",',
    `            "  humo_hf_download Wan-AI/Wan2.1-T2V-1.3B --revision ${WAN21_REVISION} --local-dir \\\"$WAN21_WEIGHTS\\\"",`,
    '            "  progress HUMO_ASSETS_WAN21 READY",',
    '            "  progress HUMO_ASSETS_WHISPER RUNNING",',
    '            `  humo_hf_download ${authority.whisper.repository} --revision ${authority.whisper.revision} --local-dir "$WHISPER_DIR"`,',
    '            "  progress HUMO_ASSETS_WHISPER READY",',
    '            "  progress HUMO_ASSETS_VERIFY RUNNING",',
    '            `  test -f "$HUMO_WEIGHTS/${authority.checkpoint.path}"`,'
  ].join("\n"),
  "V142_HUMO_ASSET_DOWNLOAD_HARDENING"
);

engine = replaceExactOnce(
  engine,
  '            "  progress HUMO_ASSETS READY",',
  '            "  progress HUMO_ASSETS_VERIFY READY",',
  "V142_HUMO_ASSET_VERIFY_STAGE"
);

engine = replaceExactOnce(
  engine,
  [
    '        externalComputeMeter: state.externalComputeMeter || null,',
    '        stageTimeline: state.stageTimeline || {},'
  ].join("\n"),
  [
    '        externalComputeMeter: state.externalComputeMeter || null,',
    '        bootstrapDiagnostics: state.bootstrapDiagnostics ? {',
    '            capturedAt: state.bootstrapDiagnostics.capturedAt || null,',
    '            exitCode: Number.isInteger(state.bootstrapDiagnostics.exitCode)',
    '                ? state.bootstrapDiagnostics.exitCode',
    '                : null,',
    '            stage: state.bootstrapDiagnostics.stage || null,',
    '            cacheStatus: state.bootstrapDiagnostics.cacheStatus || null,',
    '            logTail: state.bootstrapDiagnostics.logTail || null,',
    '            captureErrors: Array.isArray(state.bootstrapDiagnostics.captureErrors)',
    '                ? state.bootstrapDiagnostics.captureErrors',
    '                : []',
    '        } : null,',
    '        stageTimeline: state.stageTimeline || {},'
  ].join("\n"),
  "V142_HUMO_PUBLIC_BOOTSTRAP_DIAGNOSTICS"
);

for (const marker of [
  "HF_HUB_DISABLE_XET=1",
  "HF_HUB_DOWNLOAD_TIMEOUT=60",
  "--max-workers 1",
  WAN21_REVISION,
  "HUMO_ASSETS_HUMO",
  "HUMO_ASSETS_WAN21",
  "HUMO_ASSETS_WHISPER",
  "HUMO_ASSETS_VERIFY",
  "bootstrapDiagnostics: state.bootstrapDiagnostics ?"
]) {
  if (!engine.includes(marker)) throw new Error(`V142_HUMO_ASSET_HARDENING_MARKER_MISSING:${marker}`);
}
write(LOCAL_VIDEO_ENGINE, engine);

let bridge = read(FS_BRIDGE);
bridge = replaceExactOnce(
  bridge,
  [
    '        if (!final?.done) throw new Error("HUMO_IDENTITY_PROBE_DEADLINE_EXCEEDED");',
    '        if (final.ok !== true) throw new Error(final.error || final.status || "HUMO_IDENTITY_PROBE_FAILED");'
  ].join("\n"),
  [
    '        if (!final?.done) throw new Error("HUMO_IDENTITY_PROBE_DEADLINE_EXCEEDED");',
    '        if (final.ok !== true) {',
    '            log({',
    '                ok: false,',
    '                status: final.status || "HUMO_IDENTITY_PROBE_FAILED",',
    '                error: final.error || final.status || "HUMO_IDENTITY_PROBE_FAILED",',
    '                podId: launched?.remoteWorker?.podId || null,',
    '                bootstrapDiagnostics: final?.remoteWorker?.bootstrapDiagnostics || null,',
    '                inferenceStarted: final?.remoteWorker?.inferenceStartedAt != null || final?.inferenceStarted === true,',
    '                providerReportedCostUsd: Number(final?.gpuRentalEstimatedCost || final?.remoteWorker?.gpuRentalEstimatedCost || 0)',
    '            });',
    '            throw new Error(final.error || final.status || "HUMO_IDENTITY_PROBE_FAILED");',
    '        }'
  ].join("\n"),
  "V142_HUMO_PROBE_DIAGNOSTICS_VISIBLE"
);

bridge = replaceExactOnce(
  bridge,
  [
    '    if (primaryError) throw primaryError;',
    '    const bytes = fs.statSync(outputFile).size;'
  ].join("\n"),
  [
    '    if (primaryError) {',
    '        log({',
    '            ok: false,',
    '            status: "HUMO_IDENTITY_PROBE_FAILED_AND_RELEASED",',
    '            error: primaryError?.message || String(primaryError),',
    '            podId: launched?.remoteWorker?.podId || null,',
    '            terminationVerified: releaseReceipt?.terminationVerified === true,',
    '            gpuRentalSeconds: Number(releaseReceipt?.gpuRentalSeconds || final?.gpuRentalSeconds || 0),',
    '            gpuRentalEstimatedCost: Number(releaseReceipt?.gpuRentalEstimatedCost || final?.gpuRentalEstimatedCost || 0),',
    '            gpuRentalActualCost: Number(releaseReceipt?.gpuRentalActualCost || 0),',
    '            inferenceStarted: final?.remoteWorker?.inferenceStartedAt != null || final?.inferenceStarted === true',
    '        });',
    '        throw primaryError;',
    '    }',
    '    const bytes = fs.statSync(outputFile).size;'
  ].join("\n"),
  "V142_HUMO_PROBE_FAILURE_RELEASE_RECEIPT"
);

for (const marker of [
  "bootstrapDiagnostics: final?.remoteWorker?.bootstrapDiagnostics || null",
  "HUMO_IDENTITY_PROBE_FAILED_AND_RELEASED",
  "terminationVerified: releaseReceipt?.terminationVerified === true"
]) {
  if (!bridge.includes(marker)) throw new Error(`V142_HUMO_DIAGNOSTIC_BRIDGE_MARKER_MISSING:${marker}`);
}
write(FS_BRIDGE, bridge);

let tests = read(LOCAL_VIDEO_TEST);
tests = appendOnce(
  tests,
  "V142 HuMo asset bootstrap disables Xet and serializes pinned resumable downloads",
  `test("V142 HuMo asset bootstrap disables Xet and serializes pinned resumable downloads", () => {\n    const engineSource = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");\n    assert.match(engineSource, /HF_HUB_DISABLE_XET=1/);\n    assert.match(engineSource, /HF_HUB_DOWNLOAD_TIMEOUT=60/);\n    assert.match(engineSource, /--max-workers 1/);\n    assert.match(engineSource, /37ec512624d61f7aa208f7ea8140a131f93afc9a/);\n    for (const stage of ["HUMO_ASSETS_HUMO", "HUMO_ASSETS_WAN21", "HUMO_ASSETS_WHISPER", "HUMO_ASSETS_VERIFY"]) {\n        assert.match(engineSource, new RegExp(stage));\n    }\n    assert.match(engineSource, /bootstrapDiagnostics: state\\.bootstrapDiagnostics/);\n    const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");\n    assert.match(bridgeSource, /bootstrapDiagnostics: final\\?\\.remoteWorker\\?\\.bootstrapDiagnostics/);\n    assert.match(bridgeSource, /HUMO_IDENTITY_PROBE_FAILED_AND_RELEASED/);\n    assert.match(bridgeSource, /terminationVerified: releaseReceipt\\?\\.terminationVerified === true/);\n});`
);
write(LOCAL_VIDEO_TEST, tests);

execFileSync(process.execPath, ["--check", LOCAL_VIDEO_ENGINE], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", FS_BRIDGE], { stdio: "inherit" });

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_ASSET_DOWNLOAD_HARDENING_MATERIALIZED",
  productBaseCommit: PRODUCT_BASE_COMMIT,
  hfXetDisabled: true,
  hfDownloadTimeoutSeconds: 60,
  hfMaxWorkers: 1,
  wan21Revision: WAN21_REVISION,
  assetStages: [
    "HUMO_ASSETS_HUMO",
    "HUMO_ASSETS_WAN21",
    "HUMO_ASSETS_WHISPER",
    "HUMO_ASSETS_VERIFY"
  ],
  bootstrapDiagnosticsVisible: true,
  failureReleaseReceiptVisible: true,
  inferenceAuthorized: false,
  providerTrafficUsed: false,
  runpodTrafficUsed: false,
  billableGpuCreated: false,
  newFiles: false,
  newBrains: false
}));
