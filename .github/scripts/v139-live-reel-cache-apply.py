from pathlib import Path

RELEASE = "v139-short-reel-bridge-recovery-20260821"


def replace(path, old, new, label):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}:{path}:{count}:{old[:160]}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


def append(path, marker, body):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if marker not in text:
        p.write_text(text.rstrip() + "\n\n" + body.rstrip() + "\n", encoding="utf-8")


# 1) Reel corto: una sola ruta canónica de planificación y render.
replace(
    "gestia-core/jarvis/jarvis.multitool.pack.js",
    "durationSeconds >= 30 && durationSeconds <= 180 &&",
    "durationSeconds >= 3 && durationSeconds <= 180 &&",
    "SHORT_REEL_PLAN_DURATION"
)
replace(
    "jarvis-reel-artifact.js",
    'if (!Number.isFinite(durationSeconds) || durationSeconds < 30 || durationSeconds > 180) throw new Error("REEL_DURATION_NOT_ALLOWED");',
    'if (!Number.isFinite(durationSeconds) || durationSeconds < 3 || durationSeconds > 180) throw new Error("REEL_DURATION_NOT_ALLOWED");',
    "SHORT_REEL_RENDER_DURATION"
)
replace(
    "gestia-core/jarvis/jarvis.marketing.engine.js",
    '''    const duration = Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) >= 15
        ? Math.min(Number(durationSeconds), 180)
        : 30;
    return {''',
    '''    const requestedDuration = Number(durationSeconds);
    const duration = Number.isFinite(requestedDuration) && requestedDuration >= 3
        ? Math.min(requestedDuration, 180)
        : 30;
    const boundary = ratio => Math.round(duration * ratio * 10) / 10;
    const ranges = [
        [0, boundary(0.2)],
        [boundary(0.2), boundary(0.4)],
        [boundary(0.4), boundary(0.6)],
        [boundary(0.6), boundary(0.8)],
        [boundary(0.8), duration]
    ].map(([start, end]) => `${start}-${end}`);
    return {''',
    "SHORT_MARKETING_REEL_DURATION"
)
replace(
    "gestia-core/jarvis/jarvis.marketing.engine.js",
    '''        storyboard: [
            { scene: 1, range: "0-4", purpose: "hook", overlay: campaign.hooks[0] },
            { scene: 2, range: "4-11", purpose: "pain", overlay: campaign.pain },
            { scene: 3, range: "11-20", purpose: "offer", overlay: campaign.offer },
            { scene: 4, range: `20-${Math.max(21, duration - 4)}`, purpose: "proof", overlay: campaign.differentiator },
            { scene: 5, range: `${Math.max(0, duration - 4)}-${duration}`, purpose: "cta", overlay: campaign.cta }
        ],''',
    '''        storyboard: [
            { scene: 1, range: ranges[0], purpose: "hook", overlay: campaign.hooks[0] },
            { scene: 2, range: ranges[1], purpose: "pain", overlay: campaign.pain },
            { scene: 3, range: ranges[2], purpose: "offer", overlay: campaign.offer },
            { scene: 4, range: ranges[3], purpose: "proof", overlay: campaign.differentiator },
            { scene: 5, range: ranges[4], purpose: "cta", overlay: campaign.cta }
        ],''',
    "SHORT_MARKETING_REEL_STORYBOARD"
)

# 2) El bridge conserva el status real; nunca lo colapsa a "Error desconocido".
replace(
    "gestia-core/tools.bridge.js",
    '                result?.error || "Error desconocido",',
    '''                result?.error ||
                result?.message ||
                result?.status ||
                "TOOL_EXECUTION_FAILED",''',
    "TOOL_FAILURE_MESSAGE"
)

# 3a) Bridge viejo en la misma rama = versión desfasada, todavía fail-closed.
replace(
    "gestia-core/tools.runtime.js",
    '''        const compatible =
            releaseCompatible &&
            bridgeVersionCompatible;''',
    '''        const staleSameLineageBridge =
            lineageCompatible &&
            releaseCompatible !== true &&
            releaseSkewBridgeVersionCompatible !== true;
        const compatible =
            releaseCompatible &&
            bridgeVersionCompatible;''',
    "BRIDGE_STALE_LINEAGE"
)
replace(
    "gestia-core/tools.runtime.js",
    '''                    : identityCompatible && !bridgeVersionCompatible
                        ? "LOCAL_BRIDGE_VERSION_MISMATCH"
                        : "BRIDGE_IDENTITY_MISMATCH",''',
    '''                    : (identityCompatible && !bridgeVersionCompatible) ||
                        staleSameLineageBridge
                        ? "LOCAL_BRIDGE_VERSION_MISMATCH"
                        : "BRIDGE_IDENTITY_MISMATCH",''',
    "BRIDGE_STALE_STATUS"
)

# 3b) Imagen cloud sin archivo local no cuenta como entregable terminado.
replace(
    "gestia-core/jarvis/jarvis.actuator.pack.js",
    '''                const finalResult = {
                    ...result,
                    persisted: artifact?.ok === true,
                    output: artifact?.output || null,
                    bytes: artifact?.bytes || null,
                    persistenceStatus: artifact?.status || null,
                    persistenceError: artifact?.ok === false ? artifact.error : null
                };''',
    '''                const persistenceRequired = result?.ok === true && Boolean(result?.imageBase64);
                const persistenceFailed = persistenceRequired && artifact?.ok !== true;
                const finalResult = {
                    ...result,
                    ...(persistenceFailed
                        ? {
                            ok: false,
                            executionOk: true,
                            objectiveSatisfied: false,
                            blocked: true,
                            retryable: false,
                            status: artifact?.status || "IMAGE_ARTIFACT_REQUIRED",
                            error: artifact?.error || artifact?.status || "IMAGE_ARTIFACT_REQUIRED",
                            cloudGenerationStatus: result?.status || null
                        }
                        : {}),
                    persisted: artifact?.ok === true,
                    output: artifact?.output || null,
                    bytes: artifact?.bytes || null,
                    persistenceStatus: artifact?.status || null,
                    persistenceError: artifact?.ok === false ? artifact.error : null
                };''',
    "IMAGE_PERSISTENCE_FAIL_CLOSED"
)

# 3c) Un fallo terminal del bridge corta la misión; no quema más generaciones.
replace(
    "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    '''        const observation = safeObservation(result);
        if (
            task.name === "marketing.plan" &&''',
    '''        const observation = safeObservation(result);
        const terminalLocalArtifactFailureCodes = new Set([
            "BRIDGE_IDENTITY_MISMATCH",
            "LOCAL_BRIDGE_VERSION_MISMATCH",
            "BRIDGE_UNREACHABLE"
        ]);
        let terminalLocalArtifactFailureCode = "";
        try {
            const infrastructureFailureText = JSON.stringify({ result, observation });
            terminalLocalArtifactFailureCode =
                [...terminalLocalArtifactFailureCodes].find(code =>
                    infrastructureFailureText.includes(code)
                ) || "";
        }
        catch {
            terminalLocalArtifactFailureCode = "";
        }
        if (
            task.name === "marketing.plan" &&''',
    "MISSION_BRIDGE_FAILURE_DETECT"
)
replace(
    "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    '''            mission.errors.push({
                tool: task.name,
                status: observation.status,
                retryable: false,
                requiresInput: observation.requiresInput,
                requiresApproval: observation.requiresApproval,
                at: now()
            });

            if (
                observation.requiresInput ||''',
    '''            mission.errors.push({
                tool: task.name,
                status: observation.status,
                retryable: false,
                requiresInput: observation.requiresInput,
                requiresApproval: observation.requiresApproval,
                at: now()
            });

            if (terminalLocalArtifactFailureCode) {
                mission.pendingTasks = [];
                mission.reason = terminalLocalArtifactFailureCode;
                mission.updatedAt = now();
                saveMission(persistence, mission);
                break;
            }

            if (
                observation.requiresInput ||''',
    "MISSION_BRIDGE_FAILURE_STOP"
)

# Prueba física existente: 8 s debe ser válido; 2 s e inconsistencia siguen bloqueados.
replace(
    "tests/jarvis-reel-artifact.test.mjs",
    '''test("reel studio blocks short or inconsistent timelines", () => {
    assert.throws(() => buildReelStudioHtml({ ...input, durationSeconds: 15 }), /REEL_DURATION_NOT_ALLOWED/);
    assert.throws(() => buildReelStudioHtml({ ...input, durationSeconds: 45 }), /REEL_TIMELINE_DURATION_MISMATCH/);
});''',
    '''test("reel studio supports short social timelines and still rejects invalid durations", () => {
    const shortInput = {
        ...input,
        durationSeconds: 8,
        scenes: [
            { ...input.scenes[0], durationSeconds: 2 },
            { ...input.scenes[1], durationSeconds: 3 },
            { ...input.scenes[2], durationSeconds: 3 }
        ]
    };
    const html = buildReelStudioHtml(shortInput);
    const report = describeReelStudio(shortInput, html);
    assert.match(html, /"durationSeconds":8/);
    assert.ok(Object.values(report.checks).every(Boolean));
    assert.throws(() => buildReelStudioHtml({ ...shortInput, durationSeconds: 2 }), /REEL_DURATION_NOT_ALLOWED/);
    assert.throws(() => buildReelStudioHtml({ ...input, durationSeconds: 45 }), /REEL_TIMELINE_DURATION_MISMATCH/);
});''',
    "SHORT_REEL_TEST"
)

extra = r'''test("v139 short reel and bridge artifact recovery stays on canonical runtime surfaces", () => {
  const multitool = fs.readFileSync("gestia-core/jarvis/jarvis.multitool.pack.js", "utf8");
  const reelArtifact = fs.readFileSync("jarvis-reel-artifact.js", "utf8");
  const marketing = fs.readFileSync("gestia-core/jarvis/jarvis.marketing.engine.js", "utf8");
  const toolsBridge = fs.readFileSync("gestia-core/tools.bridge.js", "utf8");
  const actuator = fs.readFileSync("gestia-core/jarvis/jarvis.actuator.pack.js", "utf8");
  const orchestrator = fs.readFileSync("gestia-core/jarvis/jarvis.mission.orchestrator.js", "utf8");

  assert.match(multitool, /durationSeconds >= 3 && durationSeconds <= 180/);
  assert.doesNotMatch(multitool, /durationSeconds >= 30 && durationSeconds <= 180/);
  assert.match(reelArtifact, /durationSeconds < 3/);
  assert.match(marketing, /requestedDuration >= 3/);
  assert.match(marketing, /boundary\(0\.8\)/);
  assert.match(toolsBridge, /result\?\.message \|\|/);
  assert.match(toolsBridge, /result\?\.status \|\|/);
  assert.match(runtime, /const staleSameLineageBridge =/);
  assert.match(runtime, /staleSameLineageBridge[\s\S]{0,180}LOCAL_BRIDGE_VERSION_MISMATCH/);
  assert.match(actuator, /const persistenceFailed =/);
  assert.match(actuator, /cloudGenerationStatus: result\?\.status/);
  assert.match(actuator, /objectiveSatisfied: false/);
  assert.match(orchestrator, /const terminalLocalArtifactFailureCode =/);
  assert.match(orchestrator, /mission\.pendingTasks = \[\]/);
  assert.match(orchestrator, /LOCAL_BRIDGE_VERSION_MISMATCH/);
});

// __RELEASE__'''.replace("__RELEASE__", RELEASE)
append("tests/jarvis-reel-live-cache-v139.test.mjs", RELEASE, extra)

print("V139_SHORT_REEL_BRIDGE_RECOVERY_APPLIED=true")
