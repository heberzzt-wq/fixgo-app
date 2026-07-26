"use strict";

const DEFAULT_BASE_URL = "https://fixgo-44e4d.web.app";

const DEFAULT_PROBES = Object.freeze([
    {
        id: "terminal_runtime",
        path: "/gestia-terminal.html",
        markers: [
            "gestia-core/gestia-core.js",
            "const multiToolTitle",
            "finalResponse?.title"
        ]
    },
    {
        id: "login_central_router",
        path: "/app-login.js",
        markers: [
            "FirebaseCore.verificarYRedireccionar",
            "resolveGestiaRole",
            "LOGIN_ROLE_PENDING"
        ]
    },
    {
        id: "canonical_role_router",
        path: "/firebase.js",
        markers: [
            "resolveGestiaRouteDecision",
            "[ROLE_AUTHORITY_REDIRECT]",
            "window.location.replace"
        ],
        forbiddenMarkers: [
            "verificarYRedireccionarLegacy",
            "shouldSkipLegacyRouting",
            "__SIA7_ROUTER_LOCK__"
        ]
    },
    {
        id: "role_authority_contract",
        path: "/gestia-core/auth/role-authority.js",
        markers: [
            "3.0.0-single-navigation-authority",
            "resolveGestiaRouteDecision",
            "no_temporary_client_role"
        ]
    },
    {
        id: "runtime_role_router",
        path: "/gestia-core/gestia.runtime.v7.js",
        markers: [
            "resolveGestiaRouteDecision",
            "resolveCanonicalRouteDecision",
            "routeDecision.reason"
        ],
        forbiddenMarkers: [
            "GestiaRuntime.routes =",
            "resolveHomeRoute",
            "validateSurfaceAccess"
        ]
    },
    {
        id: "private_surface_gate",
        path: "/cliente.html",
        markers: [
            "gestia-auth-pending",
            "fortressLoader"
        ]
    },
    {
        id: "semantic_diagnostics_contract",
        path: "/gestia-core/tools.runtime.js",
        markers: [
            "Tipo principal",
            "Capacidades:",
            "GEOLOCATION_CAPABILITY_DETECTED"
        ]
    },
    {
        id: "technical_intent_priority",
        path: "/gestia-core/jarvis/jarvis.multifunction.planner.js",
        markers: [
            "4.4.0-focused-web-query",
            "jarvisSemanticPlan",
            "trustedPlanCalls"
        ]
    },
    {
        id: "technical_read_only_plan",
        path: "/gestia-core/brain.engine.js",
        markers: [
            "const semanticToolPlan",
            "patchPreviewAllowed: false",
            "model_semantic_planner"
        ]
    },
    {
        id: "mixed_investigation_composition",
        path: "/gestia-core/jarvis/jarvis.multifunction.planner.js",
        markers: [
            "mergeJarvisToolCalls",
            "pendingPlans",
            "maximumToolCalls: 12"
        ]
    },
    {
        id: "proposal_state_authority",
        path: "/modules/terminal/proposal-state.js",
        markers: [
            "1.0.0-shared-proposal-state",
            "cancel_clears_active_and_pending_storage",
            "new_active_invalidates_pending_approval",
            "expired_pending_approval_fails_closed"
        ]
    },
    {
        id: "technical_response_clarity",
        path: "/gestia-core/gestia-core.js",
        markers: [
            "Diagnóstico técnico",
            "Que puede fallar:",
            "Resultados adicionales:",
            "Estado: analisis read-only",
            "1.1.0-focused-web-evidence",
            "buildMissionEvidenceBlocks",
            "buildMissionEvidenceReceipt"
        ]
    },
    {
        id: "grounded_web_research_contract",
        path: "/gestia-core/jarvis/jarvis.multitool.pack.js",
        markers: [
            "web.research",
            "JARVIS_GROUNDED_WEB_RESEARCH",
            "jarvisWebResearch",
            "result.sources.length === 0"
        ]
    },
    {
        id: "terminal_response_renderer",
        path: "/gestia-terminal.html",
        markers: [
            "const multiToolTitle",
            "finalResponse?.title",
            "const safeTitle"
        ],
        forbiddenMarkers: [
            "window.renderJarvisResponse = function"
        ]
    },
    {
        id: "runtime_health_module",
        path: "/runtime-health.js",
        markers: [
            "runtimeLatency",
            "getRuntimeHealthSnapshot",
            "1.0.0-runtime-health"
        ]
    }
]);

function dateKey(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

function sanitizeError(error) {
    return String(error?.message || error || "UNKNOWN_ERROR")
        .replace(/https?:\/\/[^\s]+/gi, "[url]")
        .slice(0, 240);
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs) {
    let timeoutId;

    try {
        return await Promise.race([
            fetchImpl(url, {
                method: "GET",
                headers: {
                    "User-Agent": "Gestia-Jarvis-Daily-Supervisor/1.0"
                }
            }),
            new Promise((_, reject) => {
                timeoutId = setTimeout(
                    () => reject(new Error("PROBE_TIMEOUT")),
                    timeoutMs
                );
            })
        ]);
    } finally {
        clearTimeout(timeoutId);
    }
}

async function runProbe({
    probe,
    baseUrl,
    fetchImpl,
    timeoutMs
}) {
    const startedAt = Date.now();

    try {
        const response = await fetchWithTimeout(
            fetchImpl,
            `${baseUrl}${probe.path}`,
            timeoutMs
        );

        const body = await response.text();
        const missingMarkers = probe.markers.filter(marker =>
            !body.includes(marker)
        );
        const unexpectedMarkers = (probe.forbiddenMarkers || [])
            .filter(marker => body.includes(marker));
        const ok =
            response.ok &&
            missingMarkers.length === 0 &&
            unexpectedMarkers.length === 0;

        return {
            id: probe.id,
            path: probe.path,
            ok,
            httpStatus: response.status,
            latencyMs: Date.now() - startedAt,
            missingMarkers,
            unexpectedMarkers,
            severity: ok ? "OK" : "HIGH"
        };
    } catch (error) {
        return {
            id: probe.id,
            path: probe.path,
            ok: false,
            httpStatus: null,
            latencyMs: Date.now() - startedAt,
            missingMarkers: [],
            unexpectedMarkers: [],
            severity: "HIGH",
            error: sanitizeError(error)
        };
    }
}

function summarizeChecks(checks = []) {
    const passed = checks.filter(check => check.ok).length;
    const failed = checks.length - passed;
    const score = checks.length
        ? Math.round((passed / checks.length) * 100)
        : 0;

    return {
        total: checks.length,
        passed,
        failed,
        score,
        status:
            failed === 0
                ? "HEALTHY"
                : score >= 70
                    ? "DEGRADED"
                    : "CRITICAL"
    };
}

const SUPERVISION_DOMAIN_BY_PROBE = Object.freeze({
    terminal_runtime: "jarvis_runtime",
    login_central_router: "auth_routing",
    canonical_role_router: "auth_routing",
    role_authority_contract: "auth_routing",
    runtime_role_router: "auth_routing",
    private_surface_gate: "auth_routing",
    semantic_diagnostics_contract: "repo_diagnostics",
    technical_intent_priority: "jarvis_cognition",
    technical_read_only_plan: "jarvis_cognition",
    mixed_investigation_composition: "jarvis_cognition",
    proposal_state_authority: "jarvis_governance",
    technical_response_clarity: "jarvis_cognition",
    grounded_web_research_contract: "web_research",
    terminal_response_renderer: "jarvis_cognition",
    runtime_health_module: "runtime_health"
});

function buildSupervisionRecommendations(checks = []) {
    const failedDomains = new Set(
        checks
            .filter(check => !check.ok)
            .map(check => SUPERVISION_DOMAIN_BY_PROBE[check.id] || "unknown")
    );

    const recommendations = [];

    if (failedDomains.has("auth_routing")) {
        recommendations.push("Revisar role-authority, app-login y firebase.js antes de validar redirecciones por rol.");
    }

    if (failedDomains.has("jarvis_runtime") || failedDomains.has("jarvis_cognition")) {
        recommendations.push("Probar una orden real en Terminal y confirmar router, respuesta final y consola sin errores.");
    }

    if (failedDomains.has("repo_diagnostics")) {
        recommendations.push("Ejecutar diagnostico read-only con evidencia por archivo y lineas antes de preparar un patch.");
    }

    if (failedDomains.has("runtime_health")) {
        recommendations.push("Revisar runtime-health y latencia de modulos antes de declarar el sistema estable.");
    }

    if (failedDomains.has("web_research")) {
        recommendations.push("Validar web.research con una consulta real y confirmar respuesta sustentada, fuentes y cero efectos externos.");
    }

    if (failedDomains.has("unknown")) {
        recommendations.push("Revisar el probe fallido y su contrato desplegado antes de intentar una reparacion.");
    }

    return {
        failureDomains: [...failedDomains],
        recommendations
    };
}

async function runDailyJarvisSupervision({
    db,
    admin,
    fetchImpl = global.fetch,
    now = new Date(),
    baseUrl = DEFAULT_BASE_URL,
    probes = DEFAULT_PROBES,
    timeoutMs = 8000
} = {}) {
    if (!db || !admin) {
        throw new Error("SUPERVISOR_FIREBASE_REQUIRED");
    }

    if (typeof fetchImpl !== "function") {
        throw new Error("SUPERVISOR_FETCH_REQUIRED");
    }

    const key = dateKey(now);
    const traceId = `jarvis_supervision_${key}`;
    const checks = await Promise.all(
        probes.map(probe => runProbe({
            probe,
            baseUrl,
            fetchImpl,
            timeoutMs
        }))
    );

    const summary = summarizeChecks(checks);
    const actionPlan = buildSupervisionRecommendations(checks);
    const report = {
        reportId: key,
        traceId,
        version: "2.1.0-daily-read-only-contract-regression",
        status: summary.status,
        score: summary.score,
        summary,
        checks,
        findings: checks
            .filter(check => !check.ok)
            .map(check => ({
                id: check.id,
                path: check.path,
                severity: check.severity,
                missingMarkers: check.missingMarkers,
                unexpectedMarkers: check.unexpectedMarkers,
                error: check.error || null
            })),
        failureDomains: actionPlan.failureDomains,
        recommendations: actionPlan.recommendations,
        policy: {
            readOnlyAudit: true,
            autoPatch: false,
            codeWrite: false,
            humanApprovalRequired: true
        },
        startedAtIso: now.toISOString(),
        completedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db
        .collection("jarvis_supervision_reports")
        .doc(key)
        .set(report, { merge: false });

    await db
        .collection("gestia_system_health")
        .doc(key)
        .set({
            jarvis_supervision_runs:
                1,
            jarvis_supervision_last_status: summary.status,
            jarvis_supervision_last_score: summary.score,
            jarvis_supervision_last_trace: traceId,
            jarvis_supervision_last_run:
                admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

    return report;
}

async function getLatestJarvisSupervisionReport({ db } = {}) {
    if (!db) {
        throw new Error("SUPERVISOR_FIREBASE_REQUIRED");
    }

    const snapshot = await db
        .collection("jarvis_supervision_reports")
        .orderBy("startedAtIso", "desc")
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const doc = snapshot.docs[0];
    return {
        id: doc.id,
        ...doc.data()
    };
}

module.exports = {
    DEFAULT_PROBES,
    dateKey,
    summarizeChecks,
    buildSupervisionRecommendations,
    runDailyJarvisSupervision,
    getLatestJarvisSupervisionReport
};
