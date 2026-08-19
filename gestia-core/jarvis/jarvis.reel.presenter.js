const VERSION = "1.1.0-marketing-plan-reel-hydration-v12";

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

function completedMarketingPlan(completedTasks = []) {
    return [...(Array.isArray(completedTasks) ? completedTasks : [])]
        .reverse()
        .find(item =>
            item?.name === "marketing.plan" &&
            item?.observation?.objectiveSatisfied === true &&
            item?.observation?.status === "MARKETING_PACKAGE_READY"
        ) || null;
}

function secondsFromRange(value = "") {
    const source = clean(value);
    const separator = source.indexOf("-");
    if (separator < 1) return 0;
    const start = Number(source.slice(0, separator).trim());
    const end = Number(source.slice(separator + 1).trim());
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    return end - start;
}

function normalizedSceneDurations(storyboard = [], durationSeconds = 30) {
    const count = storyboard.length;
    if (count < 1) return [];
    const target = Number(durationSeconds);
    if (!Number.isFinite(target) || target <= 0) return [];
    const measured = storyboard.map(scene => secondsFromRange(scene?.range));
    const measuredTotal = measured.reduce((sum, value) => sum + value, 0);
    const raw = measuredTotal > 0
        ? measured.map(value => value > 0 ? value * target / measuredTotal : target / count)
        : storyboard.map(() => target / count);
    const bounded = raw.map(value => Math.max(1, Number(value.toFixed(3))));
    const current = bounded.reduce((sum, value) => sum + value, 0);
    bounded[bounded.length - 1] = Number((bounded.at(-1) + target - current).toFixed(3));
    if (bounded.at(-1) < 1) {
        return storyboard.map((_scene, index) => {
            const base = Math.floor((target / count) * 1000) / 1000;
            return index === count - 1
                ? Number((target - base * (count - 1)).toFixed(3))
                : base;
        });
    }
    return bounded;
}

function reelPlanFromMarketing(completedTasks = []) {
    const marketing = completedMarketingPlan(completedTasks);
    const evidence = marketing?.observation?.evidence || {};
    const video = evidence?.videoPackage && typeof evidence.videoPackage === "object"
        ? evidence.videoPackage
        : null;
    const campaign = evidence?.campaign && typeof evidence.campaign === "object"
        ? evidence.campaign
        : {};
    const brand = evidence?.brand && typeof evidence.brand === "object"
        ? evidence.brand
        : {};
    const storyboard = Array.isArray(video?.storyboard)
        ? video.storyboard.filter(scene => scene && typeof scene === "object").slice(0, 18)
        : [];
    const durationSeconds = Number(video?.durationSeconds || 0);
    if (
        !marketing ||
        !video ||
        !Number.isFinite(durationSeconds) ||
        durationSeconds < 30 ||
        durationSeconds > 180 ||
        storyboard.length < 3
    ) {
        return null;
    }

    const durations = normalizedSceneDurations(storyboard, durationSeconds);
    const script = Array.isArray(video?.script) ? video.script : [];
    const narrationBySection = new Map(
        script.map(item => [clean(item?.section).toLowerCase(), clean(item?.text)])
    );
    const scenes = storyboard.map((scene, index) => {
        const purpose = clean(scene?.purpose).toLowerCase();
        const overlay = clean(scene?.overlay);
        const narration = narrationBySection.get(purpose) || overlay;
        return {
            durationSeconds: durations[index],
            overlay,
            voiceover: narration,
            visual: `Usar medio visual verificado coherente con la escena ${index + 1}: ${purpose || "campaña"}.`,
            evidence: "marketing.plan:videoPackage",
            transition: index === storyboard.length - 1 ? "cut" : "fade"
        };
    });
    const timelineSeconds = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
    if (
        Math.abs(timelineSeconds - durationSeconds) > 0.01 ||
        scenes.some(scene => !scene.overlay || !scene.voiceover || scene.durationSeconds < 1)
    ) {
        return null;
    }

    return {
        kind: "reel",
        brandName: clean(brand?.name || campaign?.brandName),
        title: clean(campaign?.name) || `${clean(brand?.name) || "Campaña"} — reel`,
        cta: clean(campaign?.cta),
        durationSeconds,
        timelineSeconds,
        scenes,
        source: "marketing.plan"
    };
}

function executablePlan(completedTasks = []) {
    const task = completedReelPlan(completedTasks);
    const plan = task?.observation?.preparedArtifact;
    if (plan?.kind === "reel") return plan;
    return reelPlanFromMarketing(completedTasks);
}

export function reelNarrationFromCompletedTasks(completedTasks = []) {
    const plan = executablePlan(completedTasks);
    const scenes = Array.isArray(plan?.scenes) ? plan.scenes : [];
    return scenes
        .map(scene => clean(scene?.voiceover || scene?.subtitle))
        .filter(Boolean)
        .join(" ")
        .trim()
        .slice(0, 12000);
}

export function reelArtifactArgsFromCompletedTasks(
    completedTasks = [],
    fallbackArgs = {}
) {
    const plan = executablePlan(completedTasks);
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
        dependency: "reel.plan -> reel.create; marketing.plan.videoPackage -> reel.create fallback",
        factualPolicy: "PLAN_OUTPUT_ONLY"
    };
}

export const __test = {
    completedReelPlan,
    completedMarketingPlan,
    secondsFromRange,
    normalizedSceneDurations,
    reelPlanFromMarketing
};
