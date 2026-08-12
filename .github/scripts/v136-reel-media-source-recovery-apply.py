from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:150]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")

# Orchestrator version and structured recovery helpers.
replace_once(
    "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    'const VERSION = "1.13.0-real-reel-production-gate-v134";',
    'const VERSION = "1.14.0-reel-media-source-recovery-v136";\nconst REEL_MEDIA_RECOVERY_MAX_ATTEMPTS = 3;'
)

helpers = r'''
function reelMediaRecoveryState(task = {}, mission = {}) {
    if (task?.name !== "reel.create") return null;
    if (reelArgsHaveExplicitVisualMedia(task?.args || {})) return null;
    if (verifiedCollectedVisualAssets(mission).length > 0) return null;

    const attemptedUrls = [...new Set(
        (Array.isArray(mission?.blockedTasks) ? mission.blockedTasks : [])
            .filter(item => item?.name === "web.media.collect")
            .map(item => text(item?.args?.url, 2000))
            .filter(Boolean)
    )];
    const verifiedSources = [...new Set([
        ...explicitMissionHttpSourceUrls(mission?.originalInstruction || ""),
        ...verifiedResearchMediaSourceUrls(mission)
    ])];
    const attempted = new Set(attemptedUrls);
    const availableVerifiedSources = verifiedSources.filter(url => !attempted.has(url));
    const previous = mission?.reelMediaRecovery && typeof mission.reelMediaRecovery === "object"
        ? mission.reelMediaRecovery
        : {};

    return {
        active: true,
        reason: "REEL_VISUAL_MEDIA_SOURCE_RECOVERY",
        attempts: Math.max(0, Number(previous.attempts || 0)),
        maxAttempts: REEL_MEDIA_RECOVERY_MAX_ATTEMPTS,
        attemptedUrls,
        availableVerifiedSources,
        verifiedSourceCount: verifiedSources.length,
        originalInstruction: text(mission?.originalInstruction, 12000)
    };
}

function reelMediaRecoveryAllowedCalls(calls = [], recovery = {}) {
    const attempted = new Set(
        (Array.isArray(recovery?.attemptedUrls) ? recovery.attemptedUrls : [])
            .map(value => text(value, 2000))
            .filter(Boolean)
    );
    const verified = new Set(
        (Array.isArray(recovery?.availableVerifiedSources) ? recovery.availableVerifiedSources : [])
            .map(value => text(value, 2000))
            .filter(Boolean)
    );
    return (Array.isArray(calls) ? calls : []).filter(call => {
        const name = text(call?.name, 100);
        if (name === "web.research") return true;
        if (name !== "web.media.collect") return false;
        const url = text(call?.args?.url, 2000);
        if (!url || attempted.has(url)) return false;
        return verified.size > 0 && verified.has(url);
    });
}

function deterministicReelMediaRecoveryCall(recovery = {}) {
    const sources = Array.isArray(recovery?.availableVerifiedSources)
        ? recovery.availableVerifiedSources
        : [];
    if (sources.length !== 1) return null;
    return {
        name: "web.media.collect",
        args: {
            url: sources[0],
            requireAnyVisual: true,
            maxImages: 8,
            maxVideos: 4
        },
        reason: "REEL_MEDIA_RECOVERY_VERIFIED_SOURCE"
    };
}

function archiveRecoveredMediaSourceAttempts(mission = {}, now = () => new Date().toISOString()) {
    const blocked = Array.isArray(mission?.blockedTasks) ? mission.blockedTasks : [];
    const recovered = blocked.filter(item => item?.name === "web.media.collect");
    if (recovered.length === 0) return;
    mission.recoveredMediaSourceAttempts = [
        ...(Array.isArray(mission.recoveredMediaSourceAttempts)
            ? mission.recoveredMediaSourceAttempts
            : []),
        ...recovered.map(item => ({
            name: item.name,
            args: item.args,
            reason: item.reason,
            observation: item.observation,
            recoveredAt: now()
        }))
    ].slice(-12);
    mission.blockedTasks = blocked.filter(item => item?.name !== "web.media.collect");
    mission.errors = (Array.isArray(mission?.errors) ? mission.errors : [])
        .filter(item => item?.tool !== "web.media.collect");
    mission.reelMediaRecovery = {
        ...(mission.reelMediaRecovery || {}),
        active: false,
        recovered: true,
        recoveredAt: now()
    };
}

'''
replace_once(
    "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    'export async function runJarvisMission({',
    helpers + 'export async function runJarvisMission({' 
)

old_dependency_block = '''        const task = mission.pendingTasks.shift();\n        const mediaDependency =\n            reelMediaDependencyCall(\n                task,\n                mission\n            );\n        if (mediaDependency) {\n            const dependencyTasks =\n                trustedCalls(\n                    [mediaDependency],\n                    mission\n                );\n            if (dependencyTasks.length > 0) {\n                if (!mission.requiredToolNames.includes("web.media.collect")) {\n                    mission.requiredToolNames.push("web.media.collect");\n                }\n                mission.pendingTasks.unshift(task);\n                mission.pendingTasks.unshift(...dependencyTasks);\n                mission.plannedTools.push(...dependencyTasks.map(item => item.name));\n                mission.updatedAt = now();\n                saveMission(persistence, mission);\n                continue;\n            }\n        }'''
new_dependency_block = '''        const task = mission.pendingTasks.shift();\n        const mediaDependency =\n            reelMediaDependencyCall(\n                task,\n                mission\n            );\n        if (mediaDependency) {\n            const dependencyTasks =\n                trustedCalls(\n                    [mediaDependency],\n                    mission\n                );\n            if (dependencyTasks.length > 0) {\n                if (!mission.requiredToolNames.includes("web.media.collect")) {\n                    mission.requiredToolNames.push("web.media.collect");\n                }\n                mission.pendingTasks.unshift(task);\n                mission.pendingTasks.unshift(...dependencyTasks);\n                mission.plannedTools.push(...dependencyTasks.map(item => item.name));\n                mission.updatedAt = now();\n                saveMission(persistence, mission);\n                continue;\n            }\n        }\n\n        const mediaRecovery =\n            reelMediaRecoveryState(\n                task,\n                mission\n            );\n        if (mediaRecovery) {\n            const deterministicRecovery =\n                deterministicReelMediaRecoveryCall(\n                    mediaRecovery\n                );\n            const deterministicTasks =\n                deterministicRecovery\n                    ? trustedCalls([deterministicRecovery], mission)\n                    : [];\n            if (deterministicTasks.length > 0) {\n                if (!mission.requiredToolNames.includes("web.media.collect")) {\n                    mission.requiredToolNames.push("web.media.collect");\n                }\n                mission.reelMediaRecovery = {\n                    ...mediaRecovery,\n                    strategy: "VERIFIED_UNUSED_SOURCE"\n                };\n                mission.pendingTasks.unshift(task);\n                mission.pendingTasks.unshift(...deterministicTasks);\n                mission.plannedTools.push(...deterministicTasks.map(item => item.name));\n                mission.updatedAt = now();\n                saveMission(persistence, mission);\n                continue;\n            }\n\n            if (mediaRecovery.attempts >= mediaRecovery.maxAttempts) {\n                const observation = {\n                    ok: false,\n                    executionOk: true,\n                    objectiveSatisfied: false,\n                    status: "REEL_MEDIA_SOURCE_RECOVERY_EXHAUSTED",\n                    requiresInput: false,\n                    requiresApproval: false,\n                    blocked: true,\n                    degraded: false,\n                    retryable: false,\n                    summary: "No se encontro una fuente visual verificable alternativa para completar el reel.",\n                    error: "REEL_MEDIA_SOURCE_RECOVERY_EXHAUSTED",\n                    evidence: {\n                        attemptedUrls: mediaRecovery.attemptedUrls,\n                        availableVerifiedSources: mediaRecovery.availableVerifiedSources,\n                        attempts: mediaRecovery.attempts\n                    }\n                };\n                mission.blockedTasks.push({\n                    ...task,\n                    status: "BLOCKED",\n                    observation,\n                    reason: observation.status,\n                    completedAt: now()\n                });\n                mission.errors.push({\n                    tool: "reel.create",\n                    status: observation.status,\n                    retryable: false,\n                    at: now()\n                });\n                mission.observations.push({\n                    tool: "reel.create",\n                    args: task.args,\n                    signature: task.signature,\n                    ...observation,\n                    at: now()\n                });\n                mission.reelMediaRecovery = {\n                    ...mediaRecovery,\n                    active: false,\n                    exhausted: true,\n                    exhaustedAt: now()\n                };\n                mission.reason = observation.status;\n                mission.updatedAt = now();\n                saveMission(persistence, mission);\n                break;\n            }\n\n            const recoveryForPlanner = {\n                ...mediaRecovery,\n                attempts: mediaRecovery.attempts + 1\n            };\n            mission.reelMediaRecovery = recoveryForPlanner;\n            let recoveryPlan;\n            try {\n                const plannerMission = structuredClone(mission);\n                plannerMission.phase = "REEL_MEDIA_SOURCE_RECOVERY";\n                plannerMission.reelMediaRecovery = structuredClone(recoveryForPlanner);\n                recoveryPlan = await planner({\n                    originalInstruction,\n                    routingInstruction: mission.routingInstruction,\n                    mission: plannerMission,\n                    memoryContext: memoryContext && typeof memoryContext === "object"\n                        ? structuredClone(memoryContext)\n                        : null\n                });\n            } catch (error) {\n                mission.errors.push({\n                    tool: "semantic.planner",\n                    status: text(error?.message || "REEL_MEDIA_RECOVERY_PLANNER_UNAVAILABLE", 500),\n                    retryable: true,\n                    at: now()\n                });\n                mission.pendingTasks.unshift(task);\n                mission.updatedAt = now();\n                saveMission(persistence, mission);\n                continue;\n            }\n            const recoveryCandidates =\n                reelMediaRecoveryAllowedCalls(\n                    recoveryPlan?.toolCalls || recoveryPlan || [],\n                    recoveryForPlanner\n                );\n            const recoveryTasks =\n                trustedCalls(\n                    recoveryCandidates,\n                    mission\n                );\n            if (recoveryTasks.length > 0) {\n                mission.pendingTasks.unshift(task);\n                mission.pendingTasks.unshift(...recoveryTasks);\n                mission.plannedTools.push(...recoveryTasks.map(item => item.name));\n                mission.updatedAt = now();\n                saveMission(persistence, mission);\n                continue;\n            }\n            mission.pendingTasks.unshift(task);\n            mission.updatedAt = now();\n            saveMission(persistence, mission);\n            continue;\n        }'''
replace_once(
    "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    old_dependency_block,
    new_dependency_block
)

replace_once(
    "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    '''        if (observation.objectiveSatisfied) {\n            mission.completedTasks.push(record);''',
    '''        if (observation.objectiveSatisfied) {\n            if (task.name === "web.media.collect") {\n                archiveRecoveredMediaSourceAttempts(mission, now);\n            }\n            mission.completedTasks.push(record);'''
)
replace_once(
    "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    'export const __test = { callSignature, compactRoutingInstruction, isFailureStatus, safeObservation, trustedCalls, canonicalMissionEvidence, unwrapObservationPayload, explicitMissionHttpSourceUrls, verifiedResearchMediaSourceUrls, reelArgsHaveExplicitVisualMedia, verifiedCollectedVisualAssets, reelMediaDependencyCall };',
    'export const __test = { callSignature, compactRoutingInstruction, isFailureStatus, safeObservation, trustedCalls, canonicalMissionEvidence, unwrapObservationPayload, explicitMissionHttpSourceUrls, verifiedResearchMediaSourceUrls, reelArgsHaveExplicitVisualMedia, verifiedCollectedVisualAssets, reelMediaDependencyCall, reelMediaRecoveryState, reelMediaRecoveryAllowedCalls, deterministicReelMediaRecoveryCall, archiveRecoveredMediaSourceAttempts };'
)

# Planner recovery prompt/version.
replace_once(
    "gestia-core/jarvis/jarvis.multifunction.planner.js",
    'const VERSION = "4.18.0-reel-mission-fidelity-v133";',
    'const VERSION = "4.19.0-reel-media-source-recovery-v136";'
)
replace_once(
    "gestia-core/jarvis/jarvis.multifunction.planner.js",
    '''        missionState?.phase === "COMPLETION_AUDIT"\n            ? "AUDITORIA DE CIERRE: compara cada entregable con la evidencia. Si todo esta satisfecho devuelve toolCalls=[] y missionComplete=true. Si falta algo devuelve exactamente una herramienta pertinente con argumentos completos y missionComplete=false. No explores capacidades no solicitadas. Si repo.search entrego sourceDefinitions o definitionFiles, prioriza esas rutas ejecutables sobre archivos que solo mencionan el simbolo y permite repetir lectura o diagnostico cuando el archivo sea distinto."\n            : "Devuelve solamente JSON valido con toolCalls, missionComplete y explanation. Si la intencion actual no necesita herramientas, devuelve toolCalls=[] y missionComplete=true; si necesita una o mas herramientas, missionComplete=false.",''',
    '''        missionState?.phase === "REEL_MEDIA_SOURCE_RECOVERY"\n            ? `RECUPERACION DE FUENTE VISUAL PARA REEL: reel.create esta en espera y no debe ejecutarse ni volver a planearse hasta obtener medios reales. No reutilices URLs de reelMediaRecovery.attemptedUrls. Si reelMediaRecovery.availableVerifiedSources contiene una URL adecuada, usa web.media.collect exclusivamente con una de esas URLs verificadas. Si no hay una fuente verificada util, usa web.research sobre la misma entidad exacta de la instruccion para encontrar otra pagina o publicacion publica que pueda contener fotos o video, con un researchGoal nuevo. No inventes URLs, no uses busqueda de imagenes sin procedencia y no atribuyas material de otra entidad.`\n            : missionState?.phase === "COMPLETION_AUDIT"\n                ? "AUDITORIA DE CIERRE: compara cada entregable con la evidencia. Si todo esta satisfecho devuelve toolCalls=[] y missionComplete=true. Si falta algo devuelve exactamente una herramienta pertinente con argumentos completos y missionComplete=false. No explores capacidades no solicitadas. Si repo.search entrego sourceDefinitions o definitionFiles, prioriza esas rutas ejecutables sobre archivos que solo mencionan el simbolo y permite repetir lectura o diagnostico cuando el archivo sea distinto."\n                : "Devuelve solamente JSON valido con toolCalls, missionComplete y explanation. Si la intencion actual no necesita herramientas, devuelve toolCalls=[] y missionComplete=true; si necesita una o mas herramientas, missionComplete=false.",'''
)

# Cache-bust browser import chain.
replace_once(
    "gestia-core/gestia-core.js",
    "'/gestia-core/jarvis/jarvis.multifunction.planner.js?v=v94-source-grounded-research-v124-20260810'",
    "'/gestia-core/jarvis/jarvis.multifunction.planner.js?v=v136-reel-media-source-recovery-20260812'"
)
replace_once(
    "gestia-core/gestia-core.js",
    "'/gestia-core/jarvis/jarvis.mission.orchestrator.js?v=v94-source-grounded-research-v124-20260810'",
    "'/gestia-core/jarvis/jarvis.mission.orchestrator.js?v=v136-reel-media-source-recovery-20260812'"
)
replace_once(
    "gestia-core/jarvis/jarvis.multitool.pack.js",
    '"./jarvis.multifunction.planner.js?v=v94-generalist-production-integrity-v121-20260810"',
    '"./jarvis.multifunction.planner.js?v=v136-reel-media-source-recovery-20260812"'
)
replace_once(
    "gestia-terminal.html",
    '<script type="module" src="/gestia-core/gestia-core.js?v=v94-marketing-actuator-bridge-v126-20260810"></script>',
    '<script type="module" src="/gestia-core/gestia-core.js?v=v136-reel-media-source-recovery-20260812"></script>'
)

print("v136 reel media source recovery patch applied")
