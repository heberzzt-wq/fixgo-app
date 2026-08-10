const VERSION = "1.0.0-plan-to-video-v113";

function clean(value = "") {
    return typeof value === "string" ? value.trim() : "";
}

function completedReelPlan(completedTasks = []) {
    return [...(Array.isArray(completedTasks) ? completedTasks : [])]
        .reverse()
        .find(item =>
            item?.name === "reel.plan" &&
            item?.observation?.objectiveSatisfied === true &&
            item?.observation?.status === "REEL_PLAN_READY"
        ) || null;
}

export function reelArtifactArgsFromCompletedTasks(
    completedTasks = [],
    fallbackArgs = {}
) {
    const task = completedReelPlan(completedTasks);
    const plan = task?.observation?.preparedArtifact;
    if (!plan || plan.kind !== "reel") return null;

    const durationSeconds = Number(plan.durationSeconds);
    const scenes = Array.isArray(plan.scenes)
        ? plan.scenes
            .filter(scene => scene && typeof scene === "object")
            .slice(0, 18)
            .map(scene => ({
                durationSeconds: Number(scene.durationSeconds),
                overlay: clean(scene.overlay),
                subtitle: clean(scene.voiceover || scene.subtitle),
                visualDescription: clean(scene.visual || scene.visualDescription),
                transition: clean(scene.transition) || "fade",
                ...(clean(scene.mediaType)
                    ? { mediaType: clean(scene.mediaType) }
                    : {}),
                ...(clean(scene.assetOutput)
                    ? { assetOutput: clean(scene.assetOutput) }
                    : {})
            }))
        : [];
    const timelineSeconds = scenes.reduce(
        (sum, scene) => sum + (Number.isFinite(scene.durationSeconds) ? scene.durationSeconds : 0),
        0
    );
    const valid =
        clean(plan.brandName) &&
        clean(plan.title) &&
        clean(plan.cta) &&
        Number.isFinite(durationSeconds) &&
        durationSeconds >= 30 &&
        durationSeconds <= 180 &&
        scenes.length >= 3 &&
        Math.abs(timelineSeconds - durationSeconds) <= 0.01 &&
        scenes.every(scene =>
            Number.isFinite(scene.durationSeconds) &&
            scene.durationSeconds >= 1 &&
            scene.overlay
        );
    if (!valid) return null;

    return {
        ...(fallbackArgs && typeof fallbackArgs === "object" ? fallbackArgs : {}),
        brandName: clean(plan.brandName),
        title: clean(plan.title),
        cta: clean(plan.cta),
        durationSeconds,
        scenes
    };
}

export function describeReelPresenter() {
    return {
        ok: true,
        version: VERSION,
        dependency: "reel.plan -> reel.create",
        factualPolicy: "PLAN_OUTPUT_ONLY"
    };
}
