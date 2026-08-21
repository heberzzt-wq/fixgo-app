from pathlib import Path

RELEASE = "v139-short-reel-bridge-recovery-20260821"


def replace_once_or_present(path, old, new, label):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if new in text:
        return False
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}:{path}:{count}:{old[:140]}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    return True


def append_once(path, marker, content):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if marker in text:
        return False
    p.write_text(text.rstrip() + "\n\n" + content.rstrip() + "\n", encoding="utf-8")
    return True


# 1) Short reels: same canonical planner/renderer, without the legacy 30-second floor.
replace_once_or_present(
    "gestia-core/jarvis/jarvis.multitool.pack.js",
    "durationSeconds >= 30 && durationSeconds <= 180 &&",
    "durationSeconds >= 3 && durationSeconds <= 180 &&",
    "V139_SHORT_REEL_PLAN_DURATION_ANCHOR"
)

replace_once_or_present(
    "jarvis-reel-artifact.js",
    '''    if (!Number.isFinite(durationSeconds) || durationSeconds < 30 || durationSeconds > 180) {
        throw new Error("REEL_DURATION_NOT_ALLOWED");
    }''',
    '''    if (!Number.isFinite(durationSeconds) || durationSeconds < 3 || durationSeconds > 180) {
        throw new Error("REEL_DURATION_NOT_ALLOWED");
    }''',
    "V139_SHORT_REEL_RENDER_DURATION_ANCHOR"
)

old_video_package = '''function buildVideoPackage(channels, campaign, durationSeconds) {
    const duration = Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) >= 15
        ? Math.min(Number(durationSeconds), 180)
        : 30;
    return {
        durationSeconds: duration,
        aspectRatio: "9:16",
        dimensions: { width: 1080, height: 1920 },
        channels,
        script: [
            { section: "hook", text: campaign.hooks[0] },
            { section: "problem", text: campaign.pain },
            { section: "solution", text: campaign.offer },
            { section: "proof", text: campaign.differentiator },
            { section: "cta", text: campaign.cta }
        ],
        storyboard: [
            { scene: 1, range: "0-4", purpose: "hook", overlay: campaign.hooks[0] },
            { scene: 2, range: "4-11", purpose: "pain", overlay: campaign.pain },
            { scene: 3, range: "11-20", purpose: "offer", overlay: campaign.offer },
            { scene: 4, range: `20-${Math.max(21, duration - 4)}`, purpose: "proof", overlay: campaign.differentiator },
            { scene: 5, range: `${Math.max(0, duration - 4)}-${duration}`, purpose: "cta", overlay: campaign.cta }
        ],
        subtitles: { required: true, editable: true },
        narration: { scriptReady: true, voiceApprovalRequired: true },
        export: { preview: true, webm: true, mp4: false, mp4Status: "NOT_PRODUCED_BY_PLANNING" },
        status: "draft_for_owner_review"
    };
}'''
new_video_package = '''function buildVideoPackage(channels, campaign, durationSeconds) {
    const requestedDuration = Number(durationSeconds);
    const duration = Number.isFinite(requestedDuration) && requestedDuration >= 3
        ? Math.min(requestedDuration, 180)
        : 30;
    const boundary = ratio =>
        Math.round(duration * ratio * 10) / 10;
    const ranges = [
        [0, boundary(0.2)],
        [boundary(0.2), boundary(0.4)],
        [boundary(0.4), boundary(0.6)],
        [boundary(0.6), boundary(0.8)],
        [boundary(0.8), duration]
    ].map(([start, end]) => `${start}-${end}`);
    return {
        durationSeconds: duration,
        aspectRatio: "9:16",
        dimensions: { width: 1080, height: 1920 },
        channels,
        script: [
            { section: "hook", text: campaign.hooks[0] },
            { section: "problem", text: campaign.pain },
            { section: "solution", text: campaign.offer },
            { section: "proof", text: campaign.differentiator },
            { section: "cta", text: campaign.cta }
        ],
        storyboard: [
            { scene: 1, range: ranges[0], purpose: "hook", overlay: campaign.hooks[0] },
            { scene: 2, range: ranges[1], purpose: "pain", overlay: campaign.pain },
            { scene: 3, range: ranges[2], purpose: "offer", overlay: campaign.offer },
            { scene: 4, range: ranges[3], purpose: "proof", overlay: campaign.differentiator },
            { scene: 5, range: ranges[4], purpose: "cta", overlay: campaign.cta }
        ],
        subtitles: { required: true, editable: true },
        narration: { scriptReady: true, voiceApprovalRequired: true },
        export: { preview: true, webm: true, mp4: false, mp4Status: "NOT_PRODUCED_BY_PLANNING" },
        status: "draft_for_owner_review"
    };
}'''
replace_once_or_present(
    "gestia-core/jarvis/jarvis.marketing.engine.js",
    old_video_package,
    new_video_package,
    "V139_SHORT_MARKETING_REEL_DURATION_ANCHOR"
)

# 2) Preserve structured tool failures instead of collapsing them to "Error desconocido".
replace_once_or_present(
    "gestia-core/tools.bridge.js",
    '                result?.error || "Error desconocido",',
    '''                result?.error ||
                result?.message ||
                result?.status ||
                "TOOL_EXECUTION_FAILED",''',
    "V139_TOOL_FAILURE_MESSAGE_ANCHOR"
)

# 3a) A stale bridge on the correct project/branch remains fail-closed, but reports VERSION_MISMATCH.
runtime = Path("gestia-core/tools.runtime.js")
runtime_text = runtime.read_text(encoding="utf-8")
if "const staleSameLineageBridge =" not in runtime_text:
    old = '''        const compatible =
            releaseCompatible &&
            bridgeVersionCompatible;'''
    new = '''        const staleSameLineageBridge =
            lineageCompatible &&
            releaseCompatible !== true &&
            releaseSkewBridgeVersionCompatible !== true;
        const compatible =
            releaseCompatible &&
            bridgeVersionCompatible;'''
    if runtime_text.count(old) != 1:
        raise SystemExit(f"V139_BRIDGE_STALE_LINEAGE_ANCHOR:{runtime_text.count(old)}")
    runtime_text = runtime_text.replace(old, new, 1)
    old_status = '''                    : identityCompatible && !bridgeVersionCompatible
                        ? "LOCAL_BRIDGE_VERSION_MISMATCH"
                        : "BRIDGE_IDENTITY_MISMATCH",'''
    new_status = '''                    : (identityCompatible && !bridgeVersionCompatible) ||
                        staleSameLineageBridge
                        ? "LOCAL_BRIDGE_VERSION_MISMATCH"
                        : "BRIDGE_IDENTITY_MISMATCH",'''
    if runtime_text.count(old_status) != 1:
        raise SystemExit(f"V139_BRIDGE_STATUS_ANCHOR:{runtime_text.count(old_status)}")
    runtime_text = runtime_text.replace(old_status, new_status, 1)
    runtime.write_text(runtime_text, encoding="utf-8")

# 3b) Cloud generation is not a completed image artifact until the existing bridge persists it.
actuator = Path("gestia-core/jarvis/jarvis.actuator.pack.js")
actuator_text = actuator.read_text(encoding="utf-8")
if "const persistenceFailed =" not in actuator_text:
    old = '''                const finalResult = {
                    ...result,
                    persisted: artifact?.ok === true,
                    output: artifact?.output || null,
                    bytes: artifact?.bytes || null,
                    persistenceStatus: artifact?.status || null,
                    persistenceError: artifact?.ok === false ? artifact.error : null
                };'''
    new = '''                const persistenceRequired =
                    result?.ok === true &&
                    Boolean(result?.imageBase64);
                const persistenceFailed =
                    persistenceRequired &&
                    artifact?.ok !== true;
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
                };'''
    if actuator_text.count(old) != 1:
        raise SystemExit(f"V139_IMAGE_PERSISTENCE_ANCHOR:{actuator_text.count(old)}")
    actuator.write_text(actuator_text.replace(old, new, 1), encoding="utf-8")

# 3c) A terminal local-bridge failure ends artifact execution immediately instead of burning more generations.
orchestrator = Path("gestia-core/jarvis/jarvis.mission.orchestrator.js")
orch_text = orchestrator.read_text(encoding="utf-8")
if "const terminalLocalArtifactFailureCode =" not in orch_text:
    old = '''        const observation = safeObservation(result);
        if (
            task.name === "marketing.plan" &&'''
    new = '''        const observation = safeObservation(result);
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
            task.name === "marketing.plan" &&'''
    if orch_text.count(old) != 1:
        raise SystemExit(f"V139_ORCHESTRATOR_FAILURE_DETECT_ANCHOR:{orch_text.count(old)}")
    orch_text = orch_text.replace(old, new, 1)
    old_block = '''            mission.errors.push({
                tool: task.name,
                status: observation.status,
                retryable: false,
                requiresInput: observation.requiresInput,
                requiresApproval: observation.requiresApproval,
                at: now()
            });

            if (
                observation.requiresInput ||'''
    new_block = '''            mission.errors.push({
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
                observation.requiresInput ||'''
    if orch_text.count(old_block) != 1:
        raise SystemExit(f"V139_ORCHESTRATOR_FAILURE_STOP_ANCHOR:{orch_text.count(old_block)}")
    orchestrator.write_text(orch_text.replace(old_block, new_block, 1), encoding="utf-8")

# Existing reel artifact test now proves an 8-second production timeline is valid.
replace_once_or_present(
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
    "V139_SHORT_REEL_TEST_ANCHOR"
)

append_once(
    "tests/jarvis-reel-live-cache-v139.test.mjs",
    RELEASE,
    f'''test("v139 short reel and bridge artifact recovery stays on canonical runtime surfaces", () => {{
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
  assert.match(runtime, /staleSameLineageBridge[\s\S]{{0,180}}LOCAL_BRIDGE_VERSION_MISMATCH/);

  assert.match(actuator, /const persistenceFailed =/);
  assert.match(actuator, /cloudGenerationStatus: result\?\.status/);
  assert.match(actuator, /objectiveSatisfied: false/);
  assert.match(orchestrator, /const terminalLocalArtifactFailureCode =/);
  assert.match(orchestrator, /mission\.pendingTasks = \[\]/);
  assert.match(orchestrator, /LOCAL_BRIDGE_VERSION_MISMATCH/);
}});

// {RELEASE}'''
)

print("V139_SHORT_REEL_BRIDGE_RECOVERY_APPLIED=true")
