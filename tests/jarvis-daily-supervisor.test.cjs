const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const {
    DEFAULT_PROBES,
    dateKey,
    summarizeChecks,
    buildSupervisionRecommendations,
    runDailyJarvisSupervision,
    getLatestJarvisSupervisionReport
} = require("../functions/jarvis-daily-supervisor");

function createFirestoreMock() {
    const writes = [];

    return {
        writes,
        collection(name) {
            return {
                doc(id) {
                    return {
                        async set(data, options) {
                            writes.push({ name, id, data, options });
                        }
                    };
                },
                orderBy() {
                    return {
                        limit() {
                            return {
                                async get() {
                                    return {
                                        empty: false,
                                        docs: [{
                                            id: "2026-07-13",
                                            data: () => ({
                                                reportId: "2026-07-13",
                                                status: "HEALTHY",
                                                score: 100
                                            })
                                        }]
                                    };
                                }
                            };
                        }
                    };
                }
            };
        }
    };
}

const adminMock = {
    firestore: {
        FieldValue: {
            serverTimestamp: () => ({ serverTimestamp: true }),
            increment: value => ({ increment: value })
        }
    }
};

test("daily supervisor writes one idempotent read-only report and health heartbeat", async () => {
    const db = createFirestoreMock();
    const allMarkers = DEFAULT_PROBES
        .flatMap(probe => probe.markers)
        .join("\n");
    const fetchImpl = async () => ({
        ok: true,
        status: 200,
        text: async () => allMarkers
    });

    const report = await runDailyJarvisSupervision({
        db,
        admin: adminMock,
        fetchImpl,
        now: new Date("2026-07-13T09:15:00.000Z")
    });

    assert.equal(report.status, "HEALTHY");
    assert.equal(
        report.version,
        "2.1.0-daily-read-only-contract-regression"
    );
    assert.equal(report.score, 100);
    assert.equal(report.summary.failed, 0);
    assert.equal(report.policy.autoPatch, false);
    assert.equal(report.policy.codeWrite, false);
    assert.deepEqual(report.failureDomains, []);
    assert.deepEqual(report.recommendations, []);
    assert.equal(db.writes.length, 2);
    assert.deepEqual(
        db.writes.map(write => `${write.name}/${write.id}`),
        [
            "jarvis_supervision_reports/2026-07-13",
            "gestia_system_health/2026-07-13"
        ]
    );
    assert.equal(
        db.writes.find(write => write.name === "gestia_system_health")
            .data.jarvis_supervision_runs,
        1
    );
});

test("daily supervisor reports missing contracts without attempting repair", async () => {
    const db = createFirestoreMock();
    const report = await runDailyJarvisSupervision({
        db,
        admin: adminMock,
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            text: async () => "incomplete deployment"
        }),
        probes: [DEFAULT_PROBES[0]],
        now: new Date("2026-07-13T09:15:00.000Z")
    });

    assert.equal(report.status, "CRITICAL");
    assert.equal(report.summary.failed, 1);
    assert.equal(report.findings.length, 1);
    assert.deepEqual(report.failureDomains, ["jarvis_runtime"]);
    assert.match(report.recommendations[0], /orden real en Terminal/);
    assert.equal(report.policy.humanApprovalRequired, true);
});

test("daily supervisor rejects a deployed legacy router marker", async () => {
    const db = createFirestoreMock();
    const canonicalProbe = DEFAULT_PROBES.find(
        probe => probe.id === "canonical_role_router"
    );
    const body = [
        ...canonicalProbe.markers,
        "verificarYRedireccionarLegacy"
    ].join("\n");

    const report = await runDailyJarvisSupervision({
        db,
        admin: adminMock,
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            text: async () => body
        }),
        probes: [canonicalProbe],
        now: new Date("2026-07-13T09:15:00.000Z")
    });

    assert.equal(report.status, "CRITICAL");
    assert.deepEqual(
        report.findings[0].unexpectedMarkers,
        ["verificarYRedireccionarLegacy"]
    );
    assert.deepEqual(report.failureDomains, ["auth_routing"]);
});

test("supervision helpers and latest report contract stay deterministic", async () => {
    assert.equal(dateKey(new Date("2026-07-13T23:59:59.000Z")), "2026-07-13");
    assert.deepEqual(
        summarizeChecks([{ ok: true }, { ok: false }]),
        {
            total: 2,
            passed: 1,
            failed: 1,
            score: 50,
            status: "CRITICAL"
        }
    );
    assert.equal(
        summarizeChecks([
            ...Array.from({ length: 14 }, () => ({ ok: true })),
            { ok: false }
        ]).status,
        "DEGRADED"
    );

    assert.ok(DEFAULT_PROBES.some(probe => probe.id === "role_authority_contract"));
    assert.ok(DEFAULT_PROBES.some(probe => probe.id === "runtime_role_router"));
    assert.ok(DEFAULT_PROBES.some(probe => probe.id === "private_surface_gate"));
    assert.ok(DEFAULT_PROBES.some(probe => probe.id === "semantic_diagnostics_contract"));
    assert.ok(DEFAULT_PROBES.some(probe => probe.id === "technical_response_clarity"));
    assert.ok(DEFAULT_PROBES.some(probe => probe.id === "mixed_investigation_composition"));
    assert.ok(DEFAULT_PROBES.some(probe => probe.id === "proposal_state_authority"));
    assert.ok(DEFAULT_PROBES.some(probe => probe.id === "grounded_web_research_contract"));
    assert.ok(DEFAULT_PROBES.some(probe => probe.id === "terminal_response_renderer"));

    assert.deepEqual(
        buildSupervisionRecommendations([
            { id: "login_central_router", ok: false },
            { id: "runtime_health_module", ok: false }
        ]).failureDomains,
        ["auth_routing", "runtime_health"]
    );

    const latest = await getLatestJarvisSupervisionReport({
        db: createFirestoreMock()
    });
    assert.equal(latest.id, "2026-07-13");
    assert.equal(latest.status, "HEALTHY");
});

test("functions and client registry expose the supervisor safely", () => {
    const functionsIndex = fs.readFileSync(
        path.join(__dirname, "..", "functions", "index.js"),
        "utf8"
    );
    const registry = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "repo", "resource.registry.js"),
        "utf8"
    );
    const firestoreEngine = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "jarvis", "jarvis.firestore.engine.js"),
        "utf8"
    );
    const runtimeHealth = fs.readFileSync(
        path.join(__dirname, "..", "runtime-health.js"),
        "utf8"
    );

    assert.match(functionsIndex, /exports\.jarvisDailySupervisor/);
    assert.match(functionsIndex, /schedule\("15 4 \* \* \*"\)/);
    assert.match(functionsIndex, /timeZone\("America\/Cancun"\)/);
    assert.match(functionsIndex, /exports\.jarvisSupervisionStatus/);
    assert.match(functionsIndex, /exports\.jarvisSupervisionRunNow/);
    assert.match(functionsIndex, /JARVIS_SUPERVISION_RUN_NOW_COMPLETE/);
    assert.match(functionsIndex, /recommendations: report\.recommendations/);
    assert.match(registry, /"jarvis_supervision_reports"/);
    assert.doesNotMatch(firestoreEngine, /collection\(db, "tickets"\)/);
    assert.match(firestoreEngine, /collection\(db, "support_tickets"\)/);
    assert.match(runtimeHealth, /export async function runtimeLatency/);
    assert.doesNotMatch(runtimeHealth, /SIA7 REPAIR PLACEHOLDER/);
});

test("daily supervisor probes current V7 deployment signatures", () => {
    const terminalProbe = DEFAULT_PROBES.find(probe => probe.id === "terminal_runtime");
    const webProbe = DEFAULT_PROBES.find(probe => probe.id === "grounded_web_research_contract");
    const cognitionProbe = DEFAULT_PROBES.find(probe => probe.id === "technical_intent_priority");

    assert.ok(terminalProbe.markers.includes("const multiToolTitle"));
    assert.ok(terminalProbe.markers.includes("finalResponse?.title"));
    assert.ok(webProbe.markers.includes("jarvisWebResearch"));
    assert.equal(
        terminalProbe.markers.includes("parallel-delegation-human-actuator-responses"),
        false
    );
    assert.equal(
        webProbe.markers.includes("1.7.0-sia7-bounded-supervision-forensics"),
        false
    );
    assert.ok(cognitionProbe.markers.includes("4.8.0-specialized-tool-scope"));
});

test("supervision endpoints stay isolated from optional Stripe and Gemini initialization", () => {
    const functionsIndex = fs.readFileSync(
        path.join(__dirname, "..", "functions", "index.js"),
        "utf8"
    );
    const supervisorStart = functionsIndex.indexOf("exports.jarvisDailySupervisor");
    const nextSection = functionsIndex.indexOf(
        "exports.despachoTaticoB2B",
        supervisorStart
    );
    const supervisionSection = functionsIndex.slice(
        supervisorStart,
        nextSection > supervisorStart ? nextSection : undefined
    );

    assert.ok(supervisorStart >= 0);
    assert.doesNotMatch(supervisionSection, /initCore\(\)/);
    assert.match(supervisionSection, /runDailyJarvisSupervision\(\{/);
    assert.match(supervisionSection, /getLatestJarvisSupervisionReport\(\{ db \}\)/);
});

test("functions runtime stays on the supported Node 22 contract", () => {
    const functionsPackage = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, "..", "functions", "package.json"),
            "utf8"
        )
    );
    const lock = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, "..", "functions", "package-lock.json"),
            "utf8"
        )
    );

    assert.equal(functionsPackage.engines.node, "22");
    assert.equal(lock.packages[""].engines.node, "22");
    assert.equal(
        lock.packages["node_modules/firebase-functions"].version,
        "7.2.5"
    );
    assert.match(functionsPackage.dependencies["firebase-admin"], /^\^13\./);
});
