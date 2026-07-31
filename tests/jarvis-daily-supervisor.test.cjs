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
    runDailyNexoSupervision,
    getLatestJarvisSupervisionReport,
    getLatestNexoSupervisionReport
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
                                                engineIdentity: "NEXO",
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

test("daily NEXO supervisor writes one idempotent read-only report and health heartbeat", async () => {
    const db = createFirestoreMock();
    const allMarkers = DEFAULT_PROBES
        .flatMap(probe => probe.markers)
        .join("\n");
    const fetchImpl = async () => ({
        ok: true,
        status: 200,
        text: async () => allMarkers
    });

    const report = await runDailyNexoSupervision({
        db,
        admin: adminMock,
        fetchImpl,
        now: new Date("2026-07-13T09:15:00.000Z")
    });

    assert.equal(report.status, "HEALTHY");
    assert.equal(report.engineIdentity, "NEXO");
    assert.equal(
        report.version,
        "3.0.0-nexo-artifact-capability-supervision"
    );
    assert.equal(report.score, 100);
    assert.equal(report.summary.failed, 0);
    assert.equal(report.policy.autoPatch, false);
    assert.equal(report.policy.codeWrite, false);
    assert.equal(report.policy.externalPublicationAllowed, false);
    assert.deepEqual(report.failureDomains, []);
    assert.equal(db.writes.length, 2);
    assert.deepEqual(
        db.writes.map(write => `${write.name}/${write.id}`),
        [
            "jarvis_supervision_reports/2026-07-13",
            "gestia_system_health/2026-07-13"
        ]
    );

    const health = db.writes.find(write =>
        write.name === "gestia_system_health"
    ).data;
    assert.equal(health.jarvis_supervision_runs, 1);
    assert.equal(health.nexo_supervision_runs, 1);
    assert.equal(health.nexo_supervision_last_status, "HEALTHY");
});

test("NEXO supervisor reports an unavailable artifact compiler without repairing", async () => {
    const db = createFirestoreMock();
    const probe = DEFAULT_PROBES.find(item =>
        item.id === "nexo_mission_compiler"
    );
    const report = await runDailyJarvisSupervision({
        db,
        admin: adminMock,
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            text: async () => "incomplete deployment"
        }),
        probes: [probe],
        now: new Date("2026-07-13T09:15:00.000Z")
    });

    assert.equal(report.status, "CRITICAL");
    assert.equal(report.summary.failed, 1);
    assert.deepEqual(report.failureDomains, ["nexo_artifact_execution"]);
    assert.match(report.recommendations[0], /nexo:bridge/i);
    assert.equal(report.policy.humanApprovalRequired, true);
    assert.equal(report.policy.autoPatch, false);
});

test("NEXO supervisor rejects a deployed marketing input blockade", async () => {
    const db = createFirestoreMock();
    const probe = DEFAULT_PROBES.find(item =>
        item.id === "nexo_marketing_natural_brief"
    );
    const body = [
        ...probe.markers,
        "MARKETING_INPUT_REQUIRED"
    ].join("\n");

    const report = await runDailyNexoSupervision({
        db,
        admin: adminMock,
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            text: async () => body
        }),
        probes: [probe],
        now: new Date("2026-07-13T09:15:00.000Z")
    });

    assert.equal(report.status, "CRITICAL");
    assert.deepEqual(
        report.findings[0].unexpectedMarkers,
        ["MARKETING_INPUT_REQUIRED"]
    );
    assert.deepEqual(report.failureDomains, ["nexo_marketing"]);
});

test("supervision helpers and NEXO aliases stay deterministic", async () => {
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

    [
        "nexo_identity",
        "nexo_mission_compiler",
        "nexo_semantic_resilience",
        "nexo_marketing_natural_brief",
        "nexo_artifact_bridge",
        "role_authority_contract",
        "runtime_role_router",
        "private_surface_gate",
        "grounded_web_research_contract"
    ].forEach(id => {
        assert.ok(DEFAULT_PROBES.some(probe => probe.id === id));
    });

    assert.deepEqual(
        buildSupervisionRecommendations([
            { id: "nexo_semantic_resilience", ok: false },
            { id: "runtime_health_module", ok: false }
        ]).failureDomains,
        ["nexo_cognition", "runtime_health"]
    );

    const db = createFirestoreMock();
    const latestLegacy = await getLatestJarvisSupervisionReport({ db });
    const latestNexo = await getLatestNexoSupervisionReport({ db });
    assert.equal(latestLegacy.id, "2026-07-13");
    assert.equal(latestNexo.engineIdentity, "NEXO");
});

test("functions and client registry preserve supervision endpoints safely", () => {
    const functionsIndex = fs.readFileSync(
        path.join(__dirname, "..", "functions", "index.js"),
        "utf8"
    );
    const registry = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "repo", "resource.registry.js"),
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
    assert.match(registry, /"jarvis_supervision_reports"/);
    assert.match(runtimeHealth, /export async function runtimeLatency/);
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
