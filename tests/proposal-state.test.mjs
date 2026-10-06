import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createSia7ProposalState,
    SIA7_PROPOSAL_STATE_CONTRACT, responsiveStylePatch, compareResponsiveRepair, executePreparedResponsiveRepair
} from "../modules/terminal/proposal-state.js";
import { createHash } from "node:crypto";

test("responsive approval restricts exact patches to existing presentation and rejects business code", () => {
    const source = '<html><head><style>button { width:14px; }</style></head><body><script>business()</script></body></html>';
    const patch = { file: "gestia-terminal.html", search: "width:14px", replace: "width:44px", matchCount: 1 };
    assert.equal(responsiveStylePatch(source, patch).afterCss, "button { width:44px; }");
    for (const change of [{ file: "firebase.js" }, { search: "business()" }, { replace: "</style><script>bad()</script>" }, { matchCount: 2 }]) {
        assert.throws(() => responsiveStylePatch(source, { ...patch, ...change }), /RESPONSIVE_STYLE_PATCH/);
    }
});

const responsiveSample = (findings, extra = {}) => ({ ok: true, interfaceEvidence: { source: "RENDERED_DOM_LAYOUT_REPLAY", phase: "before",
    url: "https://runtime.test/gestia-terminal.html", stateFingerprint: "a".repeat(64), sourceRevision: "b".repeat(64),
    viewports: [{ viewport: { width: 360, height: 800 }, horizontalOverflow: false,
        elements: [{ selector: "#menu", interactive: true, rect: [0, 0, 44, 44] }], findings }], ...extra } });
const responsiveAfter = (findings, extra = {}) => responsiveSample(findings, { phase: "after", sourceRevision: "c".repeat(64), ...extra });
const smallTarget = { selector: "#menu", kind: "small_touch_target", classification: "recommendation" };
test("responsive comparison requires same matrix, same state and improvement without new defects", () => {
    const before = responsiveSample([smallTarget]);
    assert.equal(compareResponsiveRepair(before, responsiveAfter([])).ok, true);
    assert.equal(compareResponsiveRepair(before, responsiveAfter([smallTarget])).reason, "RESPONSIVE_NO_MEASURED_IMPROVEMENT");
    assert.equal(compareResponsiveRepair(before, responsiveAfter([], { stateFingerprint: "different" })).ok, false);
    assert.equal(compareResponsiveRepair(before, responsiveAfter([{ ...smallTarget, kind: "clipping", classification: "defect" }])).reason, "RESPONSIVE_NEW_DEFECT");
    assert.equal(compareResponsiveRepair(before, { ok: false }).ok, false);
});

test("responsive approval never writes on synthetic approval, stale source or a non-improving preview", async () => {
    const source = '<html><head><style>button{width:14px}</style></head><body>Terminal</body></html>';
    const patch = { file: "gestia-terminal.html", search: "width:14px", replace: "width:44px", matchCount: 1 };
    const hash = value => createHash("sha256").update(value).digest("hex");
    const preparation = { status: "WRITE_PREPARED", file: patch.file, expiresAt: Date.now()+60000, fingerprint: "fp", nonce: "nonce", approvalCommand: "AUTORIZO fp",
        snapshotSha256: hash(source), expectedSha256: hash(source.replace(patch.search, patch.replace)) };
    let writes = 0;
    const input = { preparation, patch, audit: { source: "RENDERED_DOM_LAYOUT_REPLAY", url: "https://runtime.test/gestia-terminal.html", viewports: [{ viewport: { width:360,height:800 } }] },
        approvalEvent: { isTrusted: false }, bridge: { requestJson: async () => ({ ok: true, content: source }) },
        runtime: { execute: async () => { writes++; return { ok: true }; } },
        replay: async (_url, options, _runtime, trusted) => responsiveSample([smallTarget], { phase: options.phase, sourceRevision: hash(trusted.styleOverride) }) };
    await assert.rejects(executePreparedResponsiveRepair(input), /HUMAN_APPROVAL_REQUIRED/);
    await assert.rejects(executePreparedResponsiveRepair({ ...input, approvalEvent:{isTrusted:true}, bridge:{requestJson:async()=>({ok:true,content:source+" "})} }), /SOURCE_CHANGED/);
    await assert.rejects(executePreparedResponsiveRepair({ ...input, approvalEvent:{isTrusted:true} }), /NO_MEASURED_IMPROVEMENT/);
    assert.equal(writes, 0);
});

test("responsive comparison rejects wrong source, phase, revisions, missing targets and new overflow", () => {
    const before = responsiveSample([smallTarget]);
    for (const extra of [{ source: "DOM_ONLY" }, { phase: "before" }, { sourceRevision: "" }, { stateFingerprint: "changed" }]) {
        assert.equal(compareResponsiveRepair(before, responsiveAfter([], extra)).ok, false, JSON.stringify(extra));
    }
    assert.equal(compareResponsiveRepair(before, responsiveAfter([]), { beforeSourceRevision: "f".repeat(64), afterSourceRevision: "c".repeat(64) }).ok, false);
    const hidden = responsiveAfter([]);
    hidden.interfaceEvidence.viewports[0].elements = [];
    assert.equal(compareResponsiveRepair(before, hidden).reason, "RESPONSIVE_MEASURED_TARGET_DISAPPEARED");
    const overflow = responsiveAfter([]);
    overflow.interfaceEvidence.viewports[0].horizontalOverflow = true;
    assert.equal(compareResponsiveRepair(before, overflow).reason, "RESPONSIVE_NEW_HORIZONTAL_OVERFLOW");
    const malformed = responsiveAfter([]);
    malformed.interfaceEvidence.viewports[0].findings = undefined;
    assert.equal(compareResponsiveRepair(before, malformed).ok, false);
});

test("responsive comparison allows an intentionally hidden target to disappear only with measured hidden-state evidence", () => {
    const finding = { selector: "#tray", kind: "hidden_element_rendered", classification: "defect" };
    const before = responsiveSample([finding]);
    before.interfaceEvidence.viewports[0].elements.push({ selector: "#tray", hiddenAttribute: true, display: "flex", rect: [0, 0, 360, 14] });
    const after = responsiveAfter([]);
    assert.equal(compareResponsiveRepair(before, after).reason, "RESPONSIVE_MEASURED_TARGET_DISAPPEARED");
    after.interfaceEvidence.viewports[0].hiddenStates = [{ selector: "#tray", hiddenAttribute: true, display: "none", rendered: false, rect: [0, 0, 0, 0] }];
    assert.equal(compareResponsiveRepair(before, after).ok, true);
    after.interfaceEvidence.viewports[0].hiddenStates[0].rect = [];
    assert.equal(compareResponsiveRepair(before, after).ok, false);
});

let repairFixtureId = 0;
function repairCollaborators({ browserFailure = false, testTransportFailure = false, rollbackTransportFailure = false, wrongRevision = false } = {}) {
    const source = `<html><head><style>button{width:14px}</style></head><body>Terminal ${repairFixtureId++}</body></html>`;
    const patch = { file: "gestia-terminal.html", search: "width:14px", replace: "width:44px", matchCount: 1 };
    const hash = value => createHash("sha256").update(value).digest("hex");
    const candidate = source.replace(patch.search, patch.replace);
    const preparation = { status: "WRITE_PREPARED", file: patch.file, expiresAt: Date.now() + 60000,
        fingerprint: `repair-${repairFixtureId}`, nonce: "one-use", objectiveId: "OBJ", caseId: "CASE",
        snapshotSha256: hash(source), expectedSha256: hash(candidate) };
    preparation.approvalCommand = `AUTORIZO ${preparation.fingerprint}`;
    let current = source, replays = 0;
    const calls = [];
    const rollback = () => {
        current = source;
        return { ok: false, status: "POST_WRITE_TEST_FAILED_ROLLED_BACK", testResult: { exitCode: 0 },
            rollbackResults: [{ ok: true, restoredSha256: preparation.snapshotSha256, restoredBytes: Buffer.byteLength(source) }] };
    };
    const input = {
        preparation, patch, approvalEvent: { isTrusted: true },
        audit: responsiveSample([smallTarget]).interfaceEvidence,
        bridge: {
            async requestJson() { return { ok: true, content: current }; },
            async testWriteReceipts(args) {
                calls.push({ name: "bridge.rollback", args });
                if (rollbackTransportFailure) throw new Error("bridge offline");
                return rollback();
            }
        },
        runtime: { async execute(name, args, context) {
            calls.push({ name, args, context });
            if (name === "repo.authorizeWrite") return { ok: true, status: "WRITE_AUTHORIZED_ONCE" };
            if (name === "repo.write") { current = candidate; return { ok: true, verified: true, fingerprint: preparation.fingerprint }; }
            if (name === "tests.run") {
                if (testTransportFailure === "response") return { ok: false, status: "BRIDGE_REQUEST_FAILED", error: "verification transport lost" };
                if (testTransportFailure) throw new Error("verification transport lost");
                if (args.verificationFailure) return { ...rollback(), testsPassed: false, objectiveSatisfied: false };
                return { ok: true, testsPassed: true, objectiveSatisfied: true, exitCode: 0, status: "POST_WRITE_TESTS_PASSED" };
            }
            assert.fail(`Unexpected tool ${name}`);
        } },
        replay: async (_url, options, _runtime, trusted) => {
            replays++;
            const findings = options.phase === "before" || (browserFailure && replays === 3) ? [smallTarget] : [];
            return responsiveSample(findings, { phase: options.phase,
                sourceRevision: wrongRevision && replays === 3 ? "f".repeat(64) : hash(trusted.styleOverride) });
        }
    };
    return { input, calls, source, candidate, current: () => current };
}

test("responsive repair verifies the written candidate with scoped authorization and fresh after evidence", async () => {
    const fixture = repairCollaborators();
    const result = await executePreparedResponsiveRepair(fixture.input);
    assert.equal(result.status, "RESPONSIVE_LOCAL_REPAIR_VERIFIED");
    assert.equal(result.ok, true);
    assert.equal(result.published, false);
    assert.equal(result.interactionVerified, false);
    assert.equal(fixture.current(), fixture.candidate);
    assert.deepEqual(fixture.calls.map(call => call.name), ["repo.authorizeWrite", "repo.write", "tests.run"]);
    assert.ok(fixture.calls.every(call => call.context.approved === true && call.context.objectiveId === "OBJ" && call.context.caseId === "CASE"));
    assert.equal(result.before.interfaceEvidence.phase, "before");
    assert.equal(result.after.interfaceEvidence.phase, "after");
    assert.equal(fixture.calls[2].args.fingerprints[0], fixture.input.preparation.fingerprint);
    await assert.rejects(executePreparedResponsiveRepair(fixture.input), /IDENTICAL_PATCH_ALREADY_ATTEMPTED/);
});

test("responsive repair routes failed comparison and wrong CSS revision into receipt rollback", async () => {
    for (const options of [{ browserFailure: true }, { wrongRevision: true }]) {
        const fixture = repairCollaborators(options);
        const result = await executePreparedResponsiveRepair(fixture.input);
        assert.equal(result.ok, false);
        assert.equal(result.status, "POST_WRITE_TEST_FAILED_ROLLED_BACK");
        assert.ok(fixture.calls.find(call => call.name === "tests.run").args.verificationFailure);
        assert.equal(fixture.current(), fixture.source);
        assert.equal(result.tests.rollbackResults[0].restoredSha256, fixture.input.preparation.snapshotSha256);
    }
});

test("responsive repair reports a post-write transport failure and attempts only receipt-bound rollback", async () => {
    for (const [testTransportFailure, rollbackTransportFailure] of [[true, false], [true, true], ["response", false]]) {
        const fixture = repairCollaborators({ testTransportFailure, rollbackTransportFailure });
        const result = await executePreparedResponsiveRepair(fixture.input);
        assert.equal(result.ok, false);
        assert.equal(result.rollbackPending, rollbackTransportFailure);
        assert.equal(result.status, rollbackTransportFailure ? "RESPONSIVE_POST_WRITE_VERIFICATION_UNAVAILABLE" : "POST_WRITE_TEST_FAILED_ROLLED_BACK");
        const rollbackCall = fixture.calls.find(call => call.name === "bridge.rollback");
        assert.equal(rollbackCall.args.fingerprints[0], fixture.input.preparation.fingerprint);
        assert.match(rollbackCall.args.verificationFailure, /transport lost/);
        assert.equal(fixture.calls.filter(call => call.name === "bridge.rollback").length, 1);
        assert.equal(fixture.current(), rollbackTransportFailure ? fixture.candidate : fixture.source);
    }
});

function createStorage() {
    const values = new Map();

    return {
        values,
        getItem(key) {
            return values.has(key)
                ? values.get(key)
                : null;
        },
        setItem(key, value) {
            values.set(key, String(value));
        },
        removeItem(key) {
            values.delete(key);
        }
    };
}

function proposal(overrides = {}) {
    return {
        file: "tecnico-b2b.html",
        search: "class=\"old\"",
        replace: "class=\"new\"",
        ...overrides
    };
}

test("shared proposal authority clears active and pending persistence together", () => {
    const storage = createStorage();
    const host = {};
    let removedCards = 0;

    const state = createSia7ProposalState({
        host,
        storage,
        documentRef: {
            querySelectorAll() {
                return [
                    {
                        remove() {
                            removedCards += 1;
                        }
                    }
                ];
            }
        },
        now: () => 1000
    });

    state.rememberActive(proposal());
    state.rememberPending(
        proposal({ fingerprint: "sha256:test" })
    );

    assert.ok(
        storage.values.has(
            state.storageKeys.active
        )
    );
    assert.ok(
        storage.values.has(
            state.storageKeys.pending
        )
    );

    state.clear();

    assert.equal(
        host.__SIA7_ACTIVE_PATCH_PROPOSAL__,
        null
    );
    assert.equal(
        host.__SIA7_PENDING_PATCH_APPROVAL__,
        null
    );
    assert.equal(storage.values.size, 0);
    assert.equal(removedCards, 1);
});

test("expired pending approvals fail closed and are removed", () => {
    const storage = createStorage();
    const host = {};

    const state = createSia7ProposalState({
        host,
        storage,
        now: () => 10_000,
        maxAgeMs: 100
    });

    storage.setItem(
        state.storageKeys.pending,
        JSON.stringify(
            proposal({
                createdAt: 1,
                updatedAt: 1
            })
        )
    );

    assert.equal(state.readPending(), null);
    assert.equal(
        storage.getItem(state.storageKeys.pending),
        null
    );
    assert.equal(
        host.__SIA7_PENDING_PATCH_APPROVAL__,
        null
    );
});

test("a new active proposal invalidates an older pending approval", () => {
    const storage = createStorage();
    const host = {};
    let clock = 1000;

    const state = createSia7ProposalState({
        host,
        storage,
        now: () => clock
    });

    state.rememberPending(
        proposal({ fingerprint: "old-approval" })
    );

    clock = 2000;
    state.rememberActive(
        proposal({
            replace: "class=\"newer\""
        })
    );

    assert.equal(state.readPending(), null);
    assert.equal(
        storage.getItem(state.storageKeys.pending),
        null
    );
    assert.equal(
        state.readActive().replace,
        "class=\"newer\""
    );
});

test("proposal authority contract exposes fail-closed guarantees", () => {
    assert.equal(
        SIA7_PROPOSAL_STATE_CONTRACT.version,
        "1.0.0-shared-proposal-state"
    );
    assert.ok(
        SIA7_PROPOSAL_STATE_CONTRACT.guarantees
            .includes(
                "cancel_clears_active_and_pending_storage"
            )
    );
    assert.ok(
        SIA7_PROPOSAL_STATE_CONTRACT.guarantees
            .includes(
                "new_active_invalidates_pending_approval"
            )
    );
});
