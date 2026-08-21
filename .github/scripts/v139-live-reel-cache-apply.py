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


# 1) Short reels: keep the same canonical planner/renderer, remove only the old 30s floor.
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

# 2) Preserve the structured tool failure instead of collapsing to "Error desconocido".
replace_once_or_present(
    "gestia-core/tools.bridge.js",
    'result?.error || "Error desconocido",',
    '''result?.error ||
                result?.message ||
                result?.status ||
                "TOOL_EXECUTION_FAILED",''',
    "V139_TOOL_FAILURE_MESSAGE_ANCHOR"
)

# 3a) Same-lineage stale bridge is a version mismatch, never an identity corruption.
replace_once_or_present(
    "gestia-core/tools.runtime.js",
    '''        const identityCompatible =
            releaseCompatible;
        const releaseSkewBridgeVersionCompatible =''',
    '''        const identityCompatible =
            releaseCompatible;
        const releaseSkewBridgeVersionCompatible =''',
    "V139_BRIDGE_IDENTITY_NOOP_GUARD"
)
# Insert the stale-lineage diagnostic after release-skew version calculation.
runtime = Path("gestia-core/tools.runtime.js")
runtime_text = runtime.read_text(encoding="utf-8")
stale_marker = "const staleSameLineageBridge ="
if stale_marker not in runtime_text:
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

# 3b) A cloud image is not a completed artifact until the existing local bridge persists it.
actuator = Path("gestia-core/jarvis/jarvis.actuator.pack.js")
actuator_text = actuator.read_text(encoding="utf-8")n
