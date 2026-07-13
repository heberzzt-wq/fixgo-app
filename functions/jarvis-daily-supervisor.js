"use strict";

const DEFAULT_BASE_URL = "https://fixgo-44e4d.web.app";

const DEFAULT_PROBES = Object.freeze([
    {
        id: "terminal_runtime",
        path: "/gestia-terminal.html",
        markers: [
            "technical-diagnostics-v1",
            "gestia-core/gestia-core.js"
        ]
    },
    {
        id: "login_central_router",
        path: "/app-login.js",
        markers: [
            "FirebaseCore.verificarYRedireccionar",
            "LOGIN_ROLE_PENDING"
        ]
    },
    {
        id: "admin_surface_router",
        path: "/firebase.js",
        markers: [
            "gestia-terminal",
            "gestia-modulo",
            "b2b_admin"
        ]
    },
    {
        id: "technical_intent_priority",
        path: "/gestia-core/jarvis/jarvis.multifunction.planner.js",
        markers: [
            "isJarvisTechnicalDiagnosticRequest",
            "investiga",
            "!isTechnicalDiagnostic"
        ]
    },
    {
        id: "technical_read_only_plan",
        path: "/gestia-core/brain.engine.js",
        markers: [
            "buildLocalTechnicalInvestigationPlan",
            "patchPreviewAllowed: false",
            "local_technical_investigation"
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
        const ok = response.ok && missingMarkers.length === 0;

        return {
            id: probe.id,
            path: probe.path,
            ok,
            httpStatus: response.status,
            latencyMs: Date.now() - startedAt,
            missingMarkers,
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
            severity: "HIGH",
            error: sanitizeError(error)
        };
    }
}

function summarizeChecks(checks = []) {
    const passed = checks.filter(check => check.ok).length;
    const failed = checks.length - passed;
    const score = Math.max(0, 100 - (failed * 20));

    return {
        total: checks.length,
        passed,
        failed,
        score,
        status:
            score >= 90
                ? "HEALTHY"
                : score >= 70
                    ? "DEGRADED"
                    : "CRITICAL"
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
    const checks = [];

    for (const probe of probes) {
        checks.push(await runProbe({
            probe,
            baseUrl,
            fetchImpl,
            timeoutMs
        }));
    }

    const summary = summarizeChecks(checks);
    const report = {
        reportId: key,
        traceId,
        version: "1.0.0-daily-read-only",
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
                error: check.error || null
            })),
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
                admin.firestore.FieldValue.increment(1),
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
    runDailyJarvisSupervision,
    getLatestJarvisSupervisionReport
};
