import fs from "node:fs";

const multitoolPath = "gestia-core/jarvis/jarvis.multitool.pack.js";
const plannerPath = "gestia-core/jarvis/jarvis.multifunction.planner.js";

function replaceSection(source, startMarker, endMarker, replacement, label) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0 || end <= start) {
        throw new Error(`V142_PATCH_MARKER_MISSING:${label}`);
    }
    return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

const webResearchRecovery = `export function researchAnchorUrlKey(value = "") {
    try {
        const url = new URL(String(value || "").trim());
        if (!["http:", "https:"].includes(url.protocol)) return "";
        url.hash = "";
        url.search = "";
        const pathname = url.pathname.replace(/\\/+$/g, "") || "/";
        return \`\${url.protocol}//\${url.host}\${pathname}\`.toLowerCase();
    }
    catch {
        return "";
    }
}

export function buildCrossSourceResearchRecoveryQuery(
    query = "",
    trace = {}
) {
    const blockedDomain = String(trace?.allowedDomain || "")
        .trim()
        .toLowerCase()
        .replace(/^www\\./, "");
    const tokens = [
        String(query || ""),
        String(trace?.exactEntity || "")
    ]
        .join(" ")
        .split(/\\s+/)
        .map(item => item.trim())
        .filter(Boolean)
        .filter(item => !item.includes("://"))
        .filter(item => !item.toLowerCase().startsWith("site:"))
        .filter(item => {
            const normalized = item.toLowerCase().replace(/^www\\./, "");
            return !blockedDomain || normalized !== blockedDomain;
        });
    const seen = new Set();
    return tokens
        .filter(item => {
            const key = item.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .join(" ")
        .replace(/\\s+/g, " ")
        .trim()
        .slice(0, 600);
}

function webResearchResultIsUsable(result = {}) {
    return (
        result?.status === "ENTITY_NOT_VERIFIED" ||
        (
            result?.grounded === true &&
            Array.isArray(result?.sources) &&
            result.sources.length > 0
        )
    );
}

function webResearchExactAnchorVerified(result = {}, seedUrl = "") {
    const anchorKey = researchAnchorUrlKey(seedUrl);
    if (!anchorKey) return false;
    return (Array.isArray(result?.sources) ? result.sources : [])
        .some(source =>
            researchAnchorUrlKey(source?.url || source?.href || "") === anchorKey
        );
}

export async function fetchGroundedWebResearch(
    query = "",
    trace = {}
) {
    const user = await waitForAuthenticatedUser();
    const seedUrl = String(trace?.seedUrl || "").trim();
    const normalizedQuery =
        [query, seedUrl]
            .map(value => String(value || "").trim())
            .filter(Boolean)
            .filter((value, index, list) => list.indexOf(value) === index)
            .join(" ")
            .replace(/\\s+/g, " ")
            .trim()
            .slice(0, 600);

    if (!user) {
        return {
            ok: false,
            error: "AUTH_REQUIRED",
            message: "Necesito una sesion valida para investigar en la web."
        };
    }

    if (normalizedQuery.length < 5) {
        return {
            ok: false,
            error: "WEB_RESEARCH_QUERY_REQUIRED",
            message: "Dime que tema debo investigar en la web."
        };
    }

    let primaryMessage = "";
    let recoveryMessage = "";

    try {
        const token = await user.getIdToken();
        const requestCloudResearch = async ({
            queryText,
            allowedDomain = "",
            exactEntity = ""
        }) => {
            const response = await fetch(
                "https://us-central1-fixgo-44e4d.cloudfunctions.net/jarvisWebResearch",
                {
                    method: "POST",
                    headers: {
                        "Authorization": "Bearer " + token,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        data: {
                            query: String(queryText || "").slice(0, 600),
                            objectiveId: trace.objectiveId || "",
                            caseId: trace.caseId || "",
                            allowedDomain,
                            exactEntity
                        }
                    })
                }
            );
            const payload = await response.json();
            const result = payload?.result || payload?.data || null;
            if (!response.ok || !webResearchResultIsUsable(result)) {
                throw new Error(
                    payload?.error?.message ||
                    result?.message ||
                    "WEB_RESEARCH_HTTP_" + response.status
                );
            }
            return result;
        };

        let primaryResult = null;
        try {
            primaryResult = await requestCloudResearch({
                queryText: normalizedQuery,
                allowedDomain: trace.allowedDomain || "",
                exactEntity: trace.exactEntity || ""
            });
        }
        catch(error) {
            primaryMessage = error?.message || String(error);
        }

        const exactAnchorVerified =
            seedUrl && primaryResult
                ? webResearchExactAnchorVerified(primaryResult, seedUrl)
                : false;
        const scopedAnchor = Boolean(seedUrl || trace.allowedDomain);
        const needsCrossSourceRecovery =
            scopedAnchor &&
            (
                !primaryResult ||
                (seedUrl && exactAnchorVerified !== true)
            );

        if (needsCrossSourceRecovery) {
            const recoveryQuery =
                buildCrossSourceResearchRecoveryQuery(query, trace);
            if (recoveryQuery.length >= 5) {
                try {
                    const recoveryResult = await requestCloudResearch({
                        queryText: recoveryQuery,
                        allowedDomain: "",
                        exactEntity: trace.exactEntity || ""
                    });
                    const entityNotVerified =
                        recoveryResult?.status === "ENTITY_NOT_VERIFIED";
                    const recoveryStatus =
                        entityNotVerified
                            ? "ENTITY_NOT_VERIFIED_CROSS_SOURCE_RECOVERY"
                            : "GROUNDED_CROSS_SOURCE_RECOVERY";

                    globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ = recordCapabilityEvidence("web_research", {
                        ok: true,
                        grounded: recoveryResult?.grounded === true,
                        status: recoveryStatus,
                        sourceCount: Array.isArray(recoveryResult?.sources)
                            ? recoveryResult.sources.length
                            : 0,
                        factCount: Array.isArray(recoveryResult?.facts)
                            ? recoveryResult.facts.length
                            : 0,
                        objectiveId: recoveryResult?.objectiveId || trace.objectiveId || null,
                        caseId: recoveryResult?.caseId || trace.caseId || null,
                        checkedAt: new Date().toISOString()
                    });
                    recordCapabilityEvidence("web_research_context", {
                        ok: true,
                        grounded: recoveryResult?.grounded === true,
                        query: recoveryResult?.query || recoveryQuery,
                        answer: String(recoveryResult?.answer || "").slice(0, 5000),
                        sources: Array.isArray(recoveryResult?.sources)
                            ? recoveryResult.sources.slice(0, 8)
                            : [],
                        facts: Array.isArray(recoveryResult?.facts)
                            ? recoveryResult.facts.slice(0, 24)
                            : [],
                        inferences: Array.isArray(recoveryResult?.inferences)
                            ? recoveryResult.inferences.slice(0, 8)
                            : [],
                        checkedAt: new Date().toISOString()
                    });

                    return {
                        ...recoveryResult,
                        ok: true,
                        status: recoveryStatus,
                        source: "JARVIS_CROSS_SOURCE_WEB_RESEARCH_RECOVERY",
                        readOnly: true,
                        sourceScopeRecovered: true,
                        exactAnchorVerified: false,
                        anchorStatus: entityNotVerified
                            ? "EXACT_ANCHOR_UNAVAILABLE_ENTITY_NOT_VERIFIED"
                            : "EXACT_ANCHOR_UNAVAILABLE_CROSS_SOURCE_GROUNDED",
                        anchor: {
                            seedUrl,
                            allowedDomain: String(trace.allowedDomain || ""),
                            verified: false,
                            primaryError: primaryMessage || null
                        }
                    };
                }
                catch(error) {
                    recoveryMessage = error?.message || String(error);
                }
            }
        }

        if (primaryResult) {
            const resultStatus =
                seedUrl && exactAnchorVerified !== true
                    ? "GROUNDED_ANCHOR_UNVERIFIED_DOMAIN_ONLY"
                    : primaryResult.status;
            globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ = recordCapabilityEvidence("web_research", {
                ok: true,
                grounded: primaryResult?.grounded === true,
                status: resultStatus || "GROUNDED",
                sourceCount: Array.isArray(primaryResult?.sources)
                    ? primaryResult.sources.length
                    : 0,
                factCount: Array.isArray(primaryResult?.facts)
                    ? primaryResult.facts.length
                    : 0,
                objectiveId: primaryResult?.objectiveId || trace.objectiveId || null,
                caseId: primaryResult?.caseId || trace.caseId || null,
                checkedAt: new Date().toISOString()
            });
            recordCapabilityEvidence("web_research_context", {
                ok: true,
                grounded: primaryResult?.grounded === true,
                query: primaryResult?.query || normalizedQuery,
                answer: String(primaryResult?.answer || "").slice(0, 5000),
                sources: Array.isArray(primaryResult?.sources)
                    ? primaryResult.sources.slice(0, 8)
                    : [],
                facts: Array.isArray(primaryResult?.facts)
                    ? primaryResult.facts.slice(0, 24)
                    : [],
                inferences: Array.isArray(primaryResult?.inferences)
                    ? primaryResult.inferences.slice(0, 8)
                    : [],
                checkedAt: new Date().toISOString()
            });

            return {
                ...primaryResult,
                status: resultStatus,
                source: "JARVIS_GROUNDED_WEB_RESEARCH",
                readOnly: true,
                exactAnchorVerified:
                    seedUrl
                        ? exactAnchorVerified === true
                        : null,
                anchorStatus:
                    seedUrl
                        ? exactAnchorVerified === true
                            ? "EXACT_ANCHOR_VERIFIED"
                            : "EXACT_ANCHOR_UNAVAILABLE_DOMAIN_EVIDENCE_ONLY"
                        : "NOT_REQUIRED"
            };
        }

        throw new Error(
            [primaryMessage, recoveryMessage]
                .filter(Boolean)
                .join(" | ") ||
            "La investigacion web no estuvo disponible."
        );
    }
    catch(error) {
        const message =
            error?.message ||
            "La investigacion web no estuvo disponible.";

        if (typeof globalThis?.JarvisLocalBridge?.requestJson === "function") {
            const localResult =
                await globalThis.JarvisLocalBridge.requestJson(
                    "/research",
                    {
                        query: normalizedQuery,
                        timeoutMs: 20000,
                        allowedDomain: trace.allowedDomain || "",
                        exactEntity: trace.exactEntity || "",
                        seedUrl: trace.seedUrl || ""
                    },
                    {
                        timeoutMs: 25000
                    }
                );

            if (
                localResult?.ok === true &&
                localResult?.grounded === true &&
                Array.isArray(localResult?.sources) &&
                localResult.sources.length > 0
            ) {
                globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ = recordCapabilityEvidence("web_research", {
                    ok: true,
                    grounded: true,
                    status: "GROUNDED_LOCAL_FALLBACK",
                    sourceCount: localResult.sources.length,
                    checkedAt: new Date().toISOString()
                });
                recordCapabilityEvidence("web_research_context", {
                    ok: true,
                    grounded: true,
                    query: localResult.query || normalizedQuery,
                    answer: String(localResult.answer || "").slice(0, 5000),
                    sources: localResult.sources.slice(0, 8),
                    checkedAt: new Date().toISOString()
                });

                return {
                    ...localResult,
                    status: "GROUNDED_LOCAL_FALLBACK",
                    cloudError: message,
                    source: "JARVIS_LOCAL_GROUNDED_WEB_RESEARCH",
                    readOnly: true,
                    exactAnchorVerified:
                        seedUrl
                            ? webResearchExactAnchorVerified(localResult, seedUrl)
                            : null
                };
            }
        }

        globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ = {
            ok: false,
            grounded: false,
            status: "FAILED",
            sourceCount: 0,
            message,
            checkedAt:
                new Date().toISOString()
        };

        return {
            ok: false,
            error:
                "WEB_RESEARCH_UNAVAILABLE",
            message:
                message,
            query:
                normalizedQuery,
            grounded: false,
            sources: [],
            readOnly: true
        };
    }
}

`;

const plannerAnchorRecovery = `function researchGoalHasSatisfiedExplicitAnchor(
    missionState = null,
    researchGoal = "",
    explicitAnchors = []
) {
    const goal = String(researchGoal || "").trim();
    const anchorUrls = new Set(
        (Array.isArray(explicitAnchors) ? explicitAnchors : [])
            .map(sourceAnchorDescriptor)
            .filter(Boolean)
            .map(item => item.url)
    );
    if (!goal || anchorUrls.size === 0) return false;
    const completedTasks = Array.isArray(missionState?.completedTasks)
        ? missionState.completedTasks
        : [];
    return completedTasks.some(task => {
        if (
            String(task?.name || "") !== "web.research" ||
            task?.observation?.objectiveSatisfied !== true
        ) return false;
        const completedGoal = String(
            task?.args?.researchGoal ||
            task?.observation?.researchGoal ||
            ""
        ).trim();
        if (completedGoal !== goal) return false;

        const observationStatus =
            String(task?.observation?.status || "")
                .trim()
                .toUpperCase();
        if ([
            "GROUNDED_CROSS_SOURCE_RECOVERY",
            "ENTITY_NOT_VERIFIED_CROSS_SOURCE_RECOVERY",
            "GROUNDED_ANCHOR_UNVERIFIED_DOMAIN_ONLY"
        ].includes(observationStatus)) {
            return true;
        }

        const sources = [
            ...(Array.isArray(task?.observation?.validSources)
                ? task.observation.validSources
                : []),
            ...(Array.isArray(task?.observation?.sources)
                ? task.observation.sources
                : [])
        ];
        return sources.some(item => {
            const descriptor = sourceAnchorDescriptor(
                item?.url || item?.href || ""
            );
            return Boolean(descriptor) && anchorUrls.has(descriptor.url);
        });
    });
}

`;

let multitool = fs.readFileSync(multitoolPath, "utf8");
if (!multitool.includes("GROUNDED_CROSS_SOURCE_RECOVERY")) {
    multitool = replaceSection(
        multitool,
        "async function fetchGroundedWebResearch(",
        "async function invokeGroundedMediaAnalysis",
        webResearchRecovery,
        "multitool-web-research"
    );
    fs.writeFileSync(multitoolPath, multitool);
}

let planner = fs.readFileSync(plannerPath, "utf8");
if (
    planner.includes("if (seed && anchorUrls.has(seed.url)) return true;") ||
    !planner.includes("GROUNDED_CROSS_SOURCE_RECOVERY")
) {
    planner = replaceSection(
        planner,
        "function researchGoalHasSatisfiedExplicitAnchor(",
        "function verifiedResearchSourceUrls(",
        plannerAnchorRecovery,
        "planner-anchor-resolution"
    );
    fs.writeFileSync(plannerPath, planner);
}

const finalMultitool = fs.readFileSync(multitoolPath, "utf8");
const finalPlanner = fs.readFileSync(plannerPath, "utf8");
for (const marker of [
    "export async function fetchGroundedWebResearch(",
    "GROUNDED_CROSS_SOURCE_RECOVERY",
    "EXACT_ANCHOR_UNAVAILABLE_CROSS_SOURCE_GROUNDED",
    "buildCrossSourceResearchRecoveryQuery"
]) {
    if (!finalMultitool.includes(marker)) {
        throw new Error(`V142_MULTITOOL_MARKER_MISSING:${marker}`);
    }
}
if (finalPlanner.includes("if (seed && anchorUrls.has(seed.url)) return true;")) {
    throw new Error("V142_SEED_ARGUMENT_STILL_PROVES_ANCHOR");
}
for (const marker of [
    "GROUNDED_CROSS_SOURCE_RECOVERY",
    "ENTITY_NOT_VERIFIED_CROSS_SOURCE_RECOVERY",
    "GROUNDED_ANCHOR_UNVERIFIED_DOMAIN_ONLY"
]) {
    if (!finalPlanner.includes(marker)) {
        throw new Error(`V142_PLANNER_MARKER_MISSING:${marker}`);
    }
}

console.log("V142_MOBILE_WEB_RESEARCH_RECOVERY_PATCH_READY=true");
