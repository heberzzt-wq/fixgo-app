import fs from "node:fs/promises";

const paths = {
    core: "gestia-core/gestia-core.js",
    planner: "gestia-core/jarvis/jarvis.multifunction.planner.js",
    dependencies: "gestia-core/jarvis/jarvis.mission.dependencies.js",
    mediaBinder: "gestia-core/jarvis/jarvis.reel.media-binder.js",
    actuator: "gestia-core/jarvis/jarvis.actuator.pack.js",
    bridge: "jarvis-fs-bridge.js",
    reelArtifact: "jarvis-reel-artifact.js",
    reelTest: "tests/jarvis-reel-native-mp4-v138.test.mjs",
    semanticPlannerTest: "tests/jarvis-semantic-planner.test.cjs"
};

async function read(file) {
    return (await fs.readFile(file, "utf8")).replace(/\r\n/g, "\n");
}

async function write(file, source) {
    await fs.writeFile(file, source, "utf8");
}

function replaceOnce(source, before, after, label) {
    if (source.includes(after)) return source;
    const count = source.split(before).length - 1;
    if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
    return source.replace(before, after);
}

async function requireMarkers(file, markers = []) {
    const source = await read(file);
    for (const marker of markers) {
        if (!source.includes(marker)) {
            throw new Error(`V142_BASELINE_MARKER_REQUIRED:${file}:${marker}`);
        }
    }
}

await requireMarkers(paths.dependencies, [
    '"image.generate": 28',
    '"image.edit": 28'
]);
await requireMarkers(paths.mediaBinder, [
    '.jarvis-artifacts/images/',
    'verifiedCreativeAssets.length > 0',
    'origin: binding.asset.origin || "web.media.collect"'
]);
await requireMarkers(paths.actuator, [
    'await sha256Base64(result.imageBase64)',
    'mimeType: result?.mimeType || artifact?.mimeType || null'
]);
await requireMarkers(paths.bridge, [
    '--disable-background-timer-throttling',
    'REEL_VIDEO_FRAME_DENSITY_LOW:',
    'averageRenderedFps < 20'
]);
await requireMarkers(paths.reelArtifact, [
    'renderedFrameCount=0',
    'exporting?setTimeout(()=>frame(performance.now()),1000/30):requestAnimationFrame(frame)'
]);

let planner = await read(paths.planner);
planner = replaceOnce(
    planner,
`        .then(plan => {
            const executablePlan =
                plan?.missionComplete === true ||
                (
                    Array.isArray(plan?.toolCalls) &&
                    plan.toolCalls.some(call => call && typeof call.name === "string" && call.name.trim())
                );
            if (executablePlan) {
                planCache.set(key, { plan, savedAt: Date.now() });
            }
            return plan;
        })`,
`        .then(plan => {
            const currentTurn =
                String(missionState?.phase || "") === "CURRENT_TURN";
            const hasExecutableToolCalls =
                Array.isArray(plan?.toolCalls) &&
                plan.toolCalls.some(call =>
                    call &&
                    typeof call.name === "string" &&
                    call.name.trim()
                );
            const executablePlan =
                hasExecutableToolCalls ||
                (plan?.missionComplete === true && !currentTurn);
            if (executablePlan) {
                planCache.set(key, { plan, savedAt: Date.now() });
            }
            return plan;
        })`,
    "V142_CURRENT_TURN_SILENT_COMPLETION_NOT_CACHED"
);
planner = replaceOnce(
    planner,
`        const contractPlanner = context.semanticPlanner;
        const plan = await resolveSemanticPlan(
            instruction,
            catalog,
            contractPlanner,
            context.missionState || null
        );
        const calls = trustedPlanCalls(
            plan,
            catalog,
            {
                ...context,
                originalInstruction:
                    instruction
            }
        );`,
`        const contractPlanner = context.semanticPlanner;
        let activeMissionState =
            context.missionState || null;
        let plan = await resolveSemanticPlan(
            instruction,
            catalog,
            contractPlanner,
            activeMissionState
        );
        let calls = trustedPlanCalls(
            plan,
            catalog,
            {
                ...context,
                originalInstruction:
                    instruction
            }
        );
        const currentTurn =
            String(activeMissionState?.phase || "") === "CURRENT_TURN";

        if (currentTurn && calls.length === 0) {
            planCache.delete(
                planCacheKey(
                    instruction,
                    catalog,
                    activeMissionState
                )
            );
            const previousToolNames =
                Array.isArray(plan?.toolCalls)
                    ? plan.toolCalls
                        .map(call => String(call?.name || "").trim())
                        .filter(Boolean)
                        .slice(0, 12)
                    : [];
            activeMissionState = {
                ...(activeMissionState || {}),
                phase: "CURRENT_TURN",
                currentTurnValidationFeedback: {
                    status:
                        plan?.missionComplete === true
                            ? "CURRENT_TURN_SILENT_COMPLETION_REJECTED"
                            : "CURRENT_TURN_PLAN_REJECTED_AFTER_CATALOG_VALIDATION",
                    previousToolNames,
                    previousMissionComplete:
                        plan?.missionComplete === true,
                    requirement:
                        "Reevalua el mismo turno con el mismo catalogo y contexto semantico. Devuelve una toolCall ejecutable con todos sus argumentos requeridos. Si el turno es solamente conversacional usa conversation.respond. Si el contexto semantico confirma una produccion activa, continua esa produccion. No cierres silenciosamente un CURRENT_TURN antes de ejecutar o responder."
                }
            };
            console.warn(
                "[CURRENT_TURN_SEMANTIC_SELF_REPAIR]",
                activeMissionState.currentTurnValidationFeedback
            );
            plan = await resolveSemanticPlan(
                instruction,
                catalog,
                contractPlanner,
                activeMissionState
            );
            calls = trustedPlanCalls(
                plan,
                catalog,
                {
                    ...context,
                    missionState:
                        activeMissionState,
                    originalInstruction:
                        instruction
                }
            );
        }

        if (currentTurn && calls.length === 0) {
            planCache.delete(
                planCacheKey(
                    instruction,
                    catalog,
                    activeMissionState
                )
            );
            throw new Error(
                "SEMANTIC_AUTHENTICATED_PROVIDER_SEMANTIC_PLAN_EMPTY"
            );
        }`,
    "V142_CURRENT_TURN_SAME_BRAIN_SELF_REPAIR"
);
await write(paths.planner, planner);

let core = await read(paths.core);
core = replaceOnce(
    core,
`            terminalSemanticPlan =
                await this.analizarIntencionLigera(
                    inputRaw,
                    {
                        ...context,
                        tenantId
                    }
                );
            for (let semanticEmptyAttempt = 1; semanticEmptyAttempt <= 2; semanticEmptyAttempt += 1) {
                const executableToolCalls =
                    Array.isArray(terminalSemanticPlan?.toolCalls)
                        ? terminalSemanticPlan.toolCalls.filter(call =>
                            call &&
                            typeof call.name === "string" &&
                            call.name.trim()
                        )
                        : [];
                if (
                    executableToolCalls.length > 0 ||
                    terminalSemanticPlan?.missionComplete === true
                ) {
                    break;
                }
                const retryDelayMs = semanticEmptyAttempt === 1 ? 350 : 900;
                console.warn(
                    "[CURRENT_TURN_SEMANTIC_EMPTY_RETRY]",
                    semanticEmptyAttempt,
                    retryDelayMs
                );
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                terminalSemanticPlan =
                    await this.analizarIntencionLigera(
                        inputRaw,
                        {
                            ...context,
                            tenantId
                        }
                    );
            }`,
`            terminalSemanticPlan =
                await this.analizarIntencionLigera(
                    inputRaw,
                    {
                        ...context,
                        tenantId
                    }
                );
            // V142 current-turn empty plans are repaired by the same semantic planner before returning here.`,
    "V142_REMOVE_BLIND_CURRENT_TURN_EMPTY_RETRY"
);
for (const marker of [
    "missionContractAttempt <= 3",
    "[MISSION_CONTRACT_SEMANTIC_PLANNER_TRANSIENT_RETRY]",
    "const incompleteProductionFallback = recoveredInitialToolCalls.some"
]) {
    if (!core.includes(marker)) throw new Error(`V142_CORE_STATE_REQUIRED:${marker}`);
}
await write(paths.core, core);

let reelTest = await read(paths.reelTest);
reelTest = replaceOnce(
    reelTest,
`test("V142 keeps one semantic brain when the current-turn plan is empty", () => {
  const coreSource = fs.readFileSync(new URL("../gestia-core/gestia-core.js", import.meta.url), "utf8");
  const plannerSource = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multifunction.planner.js", import.meta.url), "utf8");
  assert.equal(coreSource.includes("[CURRENT_TURN_SEMANTIC_EMPTY_RETRY]"), true);
  assert.equal(coreSource.includes("semanticEmptyAttempt <= 2"), true);
  assert.equal(plannerSource.includes("const executablePlan ="), true);
  assert.equal(plannerSource.includes("if (executablePlan)"), true);
  assert.equal(plannerSource.includes("Los medios recopilados desde publicaciones o fuentes externas son evidencia y referencia"), true);
  assert.equal(plannerSource.includes("un adjunto no convierte una solicitud ejecutable en una conversacion vacia"), true);
});`,
`test("V142 keeps one semantic brain when the current-turn plan is empty", () => {
  const coreSource = fs.readFileSync(new URL("../gestia-core/gestia-core.js", import.meta.url), "utf8");
  const plannerSource = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multifunction.planner.js", import.meta.url), "utf8");
  assert.equal(coreSource.includes("[CURRENT_TURN_SEMANTIC_EMPTY_RETRY]"), false);
  assert.equal(coreSource.includes("V142 current-turn empty plans are repaired by the same semantic planner"), true);
  assert.equal(plannerSource.includes("[CURRENT_TURN_SEMANTIC_SELF_REPAIR]"), true);
  assert.equal(plannerSource.includes("currentTurnValidationFeedback"), true);
  assert.equal(plannerSource.includes("CURRENT_TURN_SILENT_COMPLETION_REJECTED"), true);
  assert.equal(plannerSource.includes("CURRENT_TURN_PLAN_REJECTED_AFTER_CATALOG_VALIDATION"), true);
  assert.equal(plannerSource.includes("planCache.delete("), true);
  assert.equal(plannerSource.includes("plan?.missionComplete === true && !currentTurn"), true);
  assert.equal(plannerSource.includes("SEMANTIC_AUTHENTICATED_PROVIDER_SEMANTIC_PLAN_EMPTY"), true);
  assert.equal(plannerSource.includes("Los medios recopilados desde publicaciones o fuentes externas son evidencia y referencia"), true);
  assert.equal(plannerSource.includes("un adjunto no convierte una solicitud ejecutable en una conversacion vacia"), true);
});`,
    "V142_CURRENT_TURN_SELF_REPAIR_TEST"
);
await write(paths.reelTest, reelTest);

let semanticPlannerTest = await read(paths.semanticPlannerTest);
semanticPlannerTest = semanticPlannerTest.replace(
    /(\} = require\("\.\.\/functions\/jarvis-semantic-planner"\);\n)\n+(const catalog = \[)/,
    "$1\n$2"
);
await write(paths.semanticPlannerTest, semanticPlannerTest);

console.log(JSON.stringify({
    ok: true,
    status: "V142_REEL_CLOSEOUT_APPLIED",
    sameSemanticAuthority: true,
    currentTurnSemanticSelfRepair: true,
    currentTurnSilentCompletionCache: false,
    sourceMediaEvidenceOnlyWhenOriginalCreativeExists: true,
    verifiedGeneratedMediaPreferred: true,
    continuousExportFramePump: true,
    minimumRenderedFps: 20,
    newFiles: false,
    newContracts: false,
    newBrains: false
}));