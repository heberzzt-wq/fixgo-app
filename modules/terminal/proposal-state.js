import "./nexo-bootstrap.js?v=v142-semantic-no-deadline-20261001";
import { inspectResponsiveCurrentBrowserPage } from "../../gestia-core/jarvis/jarvis.browser.grounding.js";
import { recordAutonomyEvent } from "../../gestia-core/jarvis/jarvis.autonomy.engine.js";
import { composeEvidenceGroundedConversation } from "../../gestia-core/jarvis/jarvis.conversation.composer.js";

// First vertical slice: an exact replacement inside the Terminal's existing
// presentation style. The model proposes; a trusted UI click consumes the
// bridge's existing one-use authorization. Business code is outside this seam.
export function responsiveStylePatch(source, patch) {
    if (typeof source !== "string" || patch?.file !== "gestia-terminal.html" || patch.matchCount !== 1 ||
        typeof patch.search !== "string" || !patch.search || typeof patch.replace !== "string" || !patch.replace) {
        throw new Error("RESPONSIVE_STYLE_PATCH_SCOPE_REQUIRED");
    }
    const opening = /<style(?:\s[^>]*)?>/i.exec(source);
    const start = opening ? opening.index + opening[0].length : -1;
    const end = start < 0 ? -1 : source.indexOf("</style>", start);
    const index = source.indexOf(patch.search);
    if (start < 0 || end < 0 || index < start || index + patch.search.length > end ||
        source.indexOf(patch.search, index + 1) !== -1 || /<\//.test(patch.replace)) {
        throw new Error("RESPONSIVE_STYLE_PATCH_OUTSIDE_PRESENTATION");
    }
    const candidate = source.slice(0, index) + patch.replace + source.slice(index + patch.search.length);
    return { source, candidate, beforeCss: source.slice(start, end),
        afterCss: candidate.slice(start, end + patch.replace.length - patch.search.length) };
}

export function compareResponsiveRepair(before, after, expected = {}) {
    const a = before?.interfaceEvidence, b = after?.interfaceEvidence;
    const validHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
    if (before?.ok !== true || after?.ok !== true || !validHash(a?.stateFingerprint) || a.stateFingerprint !== b?.stateFingerprint ||
        a.url !== b.url || !Array.isArray(a.viewports) || !a.viewports.length || !Array.isArray(b.viewports) || a.viewports.length !== b.viewports.length) {
        return { ok: false, reason: "RESPONSIVE_SAME_STATE_EVIDENCE_REQUIRED" };
    }
    if (a.source !== "RENDERED_DOM_LAYOUT_REPLAY" || b.source !== a.source || a.phase !== "before" || b.phase !== "after") {
        return { ok: false, reason: "RESPONSIVE_PHASE_SOURCE_EVIDENCE_REQUIRED" };
    }
    if (!validHash(a.sourceRevision) || !validHash(b.sourceRevision) || a.sourceRevision === b.sourceRevision ||
        (expected.beforeSourceRevision && a.sourceRevision !== expected.beforeSourceRevision) ||
        (expected.afterSourceRevision && b.sourceRevision !== expected.afterSourceRevision)) {
        return { ok: false, reason: "RESPONSIVE_SOURCE_REVISION_MISMATCH" };
    }
    let reduced = 0;
    const improvedViewports = [];
    const key = finding => `${finding.kind}:${finding.selector}`;
    for (let index = 0; index < a.viewports.length; index++) {
        const old = a.viewports[index], next = b.viewports[index];
        if (!old?.viewport || !next?.viewport || !Number.isFinite(old.viewport.width) || !Number.isFinite(old.viewport.height) ||
            old.viewport.width <= 0 || old.viewport.height <= 0 || old.viewport.width !== next.viewport.width || old.viewport.height !== next.viewport.height) {
            return { ok: false, reason: "RESPONSIVE_VIEWPORT_MATRIX_CHANGED" };
        }
        if (!Array.isArray(old.findings) || !Array.isArray(next.findings) || !Array.isArray(old.elements) || !Array.isArray(next.elements) ||
            (old.stateFingerprint && old.stateFingerprint !== a.stateFingerprint) || (next.stateFingerprint && next.stateFingerprint !== b.stateFingerprint)) {
            return { ok: false, reason: "RESPONSIVE_MEASUREMENTS_REQUIRED" };
        }
        const retained = new Set(next.elements.filter(element => Array.isArray(element.rect) && element.rect.length === 4 &&
            element.rect.every(Number.isFinite) && element.rect[2] > 0 && element.rect[3] > 0).map(element => element.selector));
        const resolvedHidden = new Set(old.findings.filter(finding => finding.kind === "hidden_element_rendered" &&
            old.elements.some(element => element.selector === finding.selector && element.hiddenAttribute === true) &&
            (Array.isArray(next.hiddenStates) ? next.hiddenStates : []).some(state => state.selector === finding.selector &&
                state.hiddenAttribute === true && state.display === "none" && state.rendered === false &&
                Array.isArray(state.rect) && state.rect.length === 4 && state.rect.every(Number.isFinite) && state.rect[2] === 0 && state.rect[3] === 0))
            .map(finding => finding.selector));
        const required = new Set([...old.elements.filter(element => element.interactive).map(element => element.selector),
            ...old.findings.filter(finding => ["defect", "recommendation"].includes(finding.classification)).map(finding => finding.selector)]);
        if ([...required].some(selector => !retained.has(selector) && !resolvedHidden.has(selector))) {
            return { ok: false, reason: "RESPONSIVE_MEASURED_TARGET_DISAPPEARED", viewport: next.viewport };
        }
        if (next.horizontalOverflow === true && old.horizontalOverflow !== true) {
            return { ok: false, reason: "RESPONSIVE_NEW_HORIZONTAL_OVERFLOW", viewport: next.viewport };
        }
        const existing = new Set(old.findings.filter(f => f.classification === "defect").map(key));
        if (next.findings.some(f => f.classification === "defect" && !existing.has(key(f)))) {
            return { ok: false, reason: "RESPONSIVE_NEW_DEFECT", viewport: next.viewport };
        }
        const measured = findings => findings.filter(f => ["defect", "recommendation"].includes(f.classification)).length;
        if (measured(next.findings) > measured(old.findings)) return { ok: false, reason: "RESPONSIVE_FINDINGS_INCREASED", viewport: next.viewport };
        if (measured(next.findings) < measured(old.findings) || (old.horizontalOverflow === true && next.horizontalOverflow === false)) {
            reduced++; improvedViewports.push(next.viewport);
        }
    }
    return { ok: reduced > 0, reason: reduced ? "RESPONSIVE_MEASURED_IMPROVEMENT" : "RESPONSIVE_NO_MEASURED_IMPROVEMENT",
        improvedViewports, interactionVerified: false, physicalDeviceTested: false, published: false };
}

const responsiveAttempts = new Set();
const unwrapResult = result => result?.data || result;
async function sourceDigest(source) {
    const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function executePreparedResponsiveRepair({ preparation, patch, context = {}, audit, approvalEvent,
    runtime = globalThis.JarvisToolRuntime, bridge = globalThis.JarvisLocalBridge,
    replay = inspectResponsiveCurrentBrowserPage, browserRuntime = globalThis } = {}) {
    if (approvalEvent?.isTrusted !== true) throw new Error("RESPONSIVE_HUMAN_APPROVAL_REQUIRED");
    if (preparation?.status !== "WRITE_PREPARED" || preparation.expiresAt <= Date.now() ||
        preparation.file !== patch?.file || !preparation.fingerprint || !preparation.nonce ||
        preparation.approvalCommand !== `AUTORIZO ${preparation.fingerprint}`) throw new Error("RESPONSIVE_PREPARATION_INVALID");
    if (audit?.source !== "RENDERED_DOM_LAYOUT_REPLAY" || !audit.viewports?.length ||
        new URL(audit.url).pathname !== "/gestia-terminal.html") throw new Error("RESPONSIVE_TERMINAL_AUDIT_REQUIRED");
    const attempt = `${preparation.snapshotSha256}:${preparation.expectedSha256}`;
    if (responsiveAttempts.has(attempt)) throw new Error("RESPONSIVE_IDENTICAL_PATCH_ALREADY_ATTEMPTED");
    const read = await bridge.requestJson("/read", { file: patch.file, maxBytes: 1000000 });
    if (read?.ok !== true || read.partial === true || typeof read.content !== "string" ||
        await sourceDigest(read.content) !== preparation.snapshotSha256) throw new Error("RESPONSIVE_SOURCE_CHANGED");
    const styles = responsiveStylePatch(read.content, patch);
    if (await sourceDigest(styles.candidate) !== preparation.expectedSha256) throw new Error("RESPONSIVE_CANDIDATE_HASH_MISMATCH");
    const expectedRevisions = { beforeSourceRevision: await sourceDigest(styles.beforeCss), afterSourceRevision: await sourceDigest(styles.afterCss) };
    const options = { viewports: audit.viewports.map(item => item.viewport), phase: "before" };
    const replaySession = {};
    const before = await replay(audit.url, options, browserRuntime, { replaySession, styleOverride: styles.beforeCss });
    const preview = await replay(audit.url, { ...options, phase: "after" }, browserRuntime, { replaySession, styleOverride: styles.afterCss });
    const preflight = compareResponsiveRepair(before, preview, expectedRevisions);
    if (!preflight.ok) throw new Error(preflight.reason);
    responsiveAttempts.add(attempt);
    const trustedContext = { ...context, objectiveId: preparation.objectiveId, caseId: preparation.caseId, approved: true };
    const execute = async (name, args) => unwrapResult(await runtime.execute(name, args, trustedContext));
    const authorization = await execute("repo.authorizeWrite", { fingerprint: preparation.fingerprint, nonce: preparation.nonce,
        approvalCommand: preparation.approvalCommand });
    if (authorization?.ok !== true) return { ok: false, status: "RESPONSIVE_AUTHORIZATION_FAILED", authorization };
    let write;
    try { write = await execute("repo.write", { fingerprint: preparation.fingerprint, nonce: preparation.nonce }); }
    catch (error) { write = { ok: false, status: "RESPONSIVE_WRITE_REPLY_UNAVAILABLE", error: String(error.message || error) }; }
    if (write?.ok !== true || write.verified !== true) {
        // A lost reply does not prove that the write did not happen. The bridge
        // alone can restore its receipt, and only while its output is unchanged.
        const verificationFailure = String(write?.error || write?.status || "RESPONSIVE_WRITE_OUTCOME_UNVERIFIED").slice(0, 1000);
        let recovery = { ok: false, status: "RESPONSIVE_WRITE_RECOVERY_UNAVAILABLE", error: verificationFailure };
        if (typeof bridge?.testWriteReceipts === "function") {
            try { recovery = await bridge.testWriteReceipts({ command: "responsive", fingerprints: [preparation.fingerprint],
                timeoutMs: 120000, verificationFailure }); }
            catch (error) { recovery = { ...recovery, rollbackError: String(error.message || error) }; }
        }
        const rolledBack = Array.isArray(recovery?.rollbackResults) && recovery.rollbackResults.length > 0 &&
            recovery.rollbackResults.every(item => item.ok === true);
        let originalBytesVerified = rolledBack;
        if (!originalBytesVerified) {
            try {
                const current = await bridge.requestJson("/read", { file: patch.file, maxBytes: 1000000 });
                originalBytesVerified = current?.ok === true && current.partial !== true && typeof current.content === "string" &&
                    await sourceDigest(current.content) === preparation.snapshotSha256;
            } catch { /* Keep the write outcome unresolved; never infer unchanged bytes. */ }
        }
        const result = { ok: false, status: rolledBack ? "POST_WRITE_TEST_FAILED_ROLLED_BACK"
            : originalBytesVerified ? "RESPONSIVE_WRITE_FAILED_ORIGINAL_BYTES_VERIFIED" : "RESPONSIVE_WRITE_OUTCOME_UNVERIFIED",
            file: patch.file, fingerprint: preparation.fingerprint, write,
            tests: { ...recovery, testsPassed: false, objectiveSatisfied: false, verificationError: verificationFailure },
            before, rollbackPending: !originalBytesVerified, originalBytesVerified,
            published: false, interactionVerified: false, physicalDeviceTested: false };
        recordAutonomyEvent({ type: "responsive_repair", status: "failed", file: patch.file,
            reason: result.status, stage: "write_reply_recovery", operation: "one_time_style_patch" });
        return result;
    }
    let after, comparison, verificationFailure = "";
    try {
        const actual = await bridge.requestJson("/read", { file: patch.file, maxBytes: 1000000 });
        if (actual?.ok !== true || actual.partial === true || typeof actual.content !== "string" || await sourceDigest(actual.content) !== preparation.expectedSha256) throw new Error("RESPONSIVE_WRITTEN_BYTES_MISMATCH");
        // Re-read the actual bytes after writing; do not verify just the proposal.
        const opening = /<style(?:\s[^>]*)?>/i.exec(actual.content);
        const start = opening.index + opening[0].length;
        const css = actual.content.slice(start, actual.content.indexOf("</style>", start));
        after = await replay(audit.url, { ...options, phase: "after" }, browserRuntime, { replaySession, styleOverride: css });
        comparison = compareResponsiveRepair(before, after, expectedRevisions);
        if (!comparison.ok) verificationFailure = comparison.reason;
    } catch (error) { verificationFailure = String(error.message || error); }
    const verificationArgs = { command: "responsive", fingerprints: [preparation.fingerprint], timeoutMs: 120000, verificationFailure };
    let tests;
    try { tests = await execute("tests.run", verificationArgs); }
    catch (error) {
        tests = { ok: false, testsPassed: false, status: "RESPONSIVE_POST_WRITE_VERIFICATION_UNAVAILABLE", error: String(error.message || error) };
    }
    const testsVerified = tests?.status === "POST_WRITE_TESTS_PASSED" && tests?.testsPassed === true && tests?.objectiveSatisfied !== false && tests?.exitCode === 0;
    const ok = !verificationFailure && comparison?.ok === true && testsVerified;
    // A failed transport is not a verified rollback. Make one bounded recovery
    // call using the existing receipt; no new write authority is introduced.
    let rollbackPending = !ok && !(Array.isArray(tests?.rollbackResults) && tests.rollbackResults.length && tests.rollbackResults.every(item => item.ok === true));
    if (rollbackPending && !tests?.rollbackResults?.length && typeof bridge?.testWriteReceipts === "function") {
        const verificationError = tests?.error || tests?.status || "RESPONSIVE_POST_WRITE_VERIFICATION_UNAVAILABLE";
        try {
            const recovery = await bridge.testWriteReceipts({ ...verificationArgs,
                verificationFailure: String(verificationFailure || verificationError).slice(0, 1000) });
            tests = { ...recovery, testsPassed: false, objectiveSatisfied: false, verificationError };
            rollbackPending = !(Array.isArray(tests.rollbackResults) && tests.rollbackResults.length && tests.rollbackResults.every(item => item.ok === true));
        } catch (error) {
            tests = { ...tests, status: "RESPONSIVE_POST_WRITE_VERIFICATION_UNAVAILABLE", verificationError,
                rollbackError: String(error.message || error), testsPassed: false, objectiveSatisfied: false };
        }
    }
    const result = { ok, status: ok ? "RESPONSIVE_LOCAL_REPAIR_VERIFIED"
        : tests?.status === "POST_WRITE_TESTS_PASSED" ? "RESPONSIVE_POST_WRITE_VERIFICATION_INCOMPLETE" : tests?.status || "RESPONSIVE_REPAIR_FAILED",
        file: patch.file, fingerprint: preparation.fingerprint, write, tests, before, after, comparison,
        rollbackPending, published: false, interactionVerified: false, physicalDeviceTested: false };
    recordAutonomyEvent({ type: "responsive_repair", status: ok ? "success" : "failed", file: patch.file,
        reason: result.status, stage: "post_write_verification", operation: "one_time_style_patch" });
    return result;
}

if (typeof window !== "undefined" && window.document && typeof window.addEventListener === "function") {
    window.addEventListener("jarvis:write-prepared", event => {
        const detail = event.detail;
        const audit = detail?.context?.completedTasks?.filter(task => task.name === "browser.inspect")
            .map(task => task.observation?.interfaceEvidence).find(value => value?.source === "RENDERED_DOM_LAYOUT_REPLAY");
        const output = window.document.getElementById("gestia-output");
        if (!audit || !output || detail.patch?.file !== "gestia-terminal.html") return;
        const card = document.createElement("section");
        card.className = "max-w-4xl mx-auto w-full bg-gestia-panel border border-slate-700 p-4 rounded-2xl";
        card.dataset.testid = "responsive-repair-proposal";
        const title = document.createElement("h3"); title.textContent = "Corrección de presentación pendiente de aprobación";
        const preview = document.createElement("pre"); preview.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;max-height:18rem;overflow:auto";
        preview.textContent = `${detail.patch.file}\nANTES\n${detail.patch.search}\nDESPUÉS\n${detail.patch.replace}`;
        const status = document.createElement("p"); status.setAttribute("role", "status");
        status.textContent = "Se comprobará el cambio en todos los tamaños antes de escribir. Si falla la verificación posterior, se solicitará la reversión de este patch. Publicación pendiente.";
        const button = document.createElement("button"); button.type = "button";
        button.className = "bg-gestia-primary text-white px-4 py-3 rounded-lg";
        button.textContent = "Aprobar este cambio y comprobar";
        button.addEventListener("click", async click => {
            if (!click.isTrusted || button.disabled) return;
            button.disabled = true; status.textContent = "Comprobando el cambio y su autorización…";
            try {
                const result = await executePreparedResponsiveRepair({ ...detail, audit, approvalEvent: click });
                status.textContent = result.ok ? "Cambio local verificado. Publicación e interacción en la versión publicada pendientes." : `Reparación no completada: ${result.status}.`;
                if (result.rollbackPending) status.textContent += " La reversión no está verificada; el archivo requiere revisión antes de continuar.";
                if (result.tests?.rollbackResults?.length) status.textContent += result.tests.rollbackResults.every(item => item.ok) ? " Bytes originales restaurados y verificados." : " Reversión incompleta: hay que revisar el estado del archivo.";
                const evidenceItems = [{ name: "repo.write", observation: result.write }, { name: "tests.run", observation: result.tests },
                    { name: "browser.inspect", observation: result.before }, { name: "browser.inspect", observation: result.after },
                    { name: "mission.outcome", observation: { status: "PARTIAL", reason: result.status,
                        completionAssessment: { objectives: [{ satisfied: false, limitation: "Publicación y prueba de interacción de la versión publicada pendientes." }] } } }];
                const answer = await composeEvidenceGroundedConversation({ instruction: "Explica qué se corrigió, en qué tamaños mejoró y qué falta; usa la evidencia antes/después. No afirmes publicación ni visión.", evidenceItems,
                    executeConversation: (prompt, options) => window.JarvisToolRuntime.execute("conversation.respond", { prompt, ...options }, {}) });
                if (answer.ok && answer.text) { const text = document.createElement("p"); text.style.whiteSpace = "pre-wrap"; text.textContent = answer.text; card.append(text); }
            } catch (error) { status.textContent = `Cambio detenido: ${error.message}. No se acreditó la reparación.`; }
        });
        card.append(title, preview, status, button); output.append(card);
    });
}

const ACTIVE_STORAGE_KEY =
    "sia7:activePatchProposal:v1";

const PENDING_STORAGE_KEY =
    "sia7:pendingPatchApproval:v1";

const DEFAULT_MAX_AGE_MS =
    1000 * 60 * 60 * 2;

function quoteCommandArg(value = "") {
    return JSON.stringify(
        String(value || "")
    );
}

export function buildSia7PatchPreviewCommand(
    payload = {}
) {
    if (payload.command) {
        return payload.command;
    }

    return [
        "repo.patchPreview",
        `file=${quoteCommandArg(payload.file)}`,
        `search=${quoteCommandArg(payload.search)}`,
        `replace=${quoteCommandArg(payload.replace)}`,
        "dryRun=true"
    ].join(" ");
}

export function buildSia7ActivePatchProposal(
    payload = {},
    now = Date.now()
) {
    return {
        version: "41.61-shared-proposal-state",
        file: payload.file || "",
        lineRange: {
            startLine:
                payload.lineRange?.startLine || null,
            endLine:
                payload.lineRange?.endLine || null
        },
        search: payload.search || "",
        replace: payload.replace || "",
        fileRisk: payload.fileRisk || "ND",
        patchRisk: payload.patchRisk || "LOW_DRY_RUN",
        command:
            buildSia7PatchPreviewCommand(payload),
        approvalCommand:
            payload.approvalCommand ||
            `Jarvis, apruebo patch ${payload.file || ""}`.trim(),
        dryRun: true,
        writeAllowed: false,
        status:
            payload.status ||
            "PENDING_ADJUSTMENT_OR_APPROVAL",
        updatedAt:
            Number(payload.updatedAt) || now,
        ...(
            payload.createdAt
                ? { createdAt: payload.createdAt }
                : {}
        )
    };
}

export function isFreshSia7PatchProposal(
    proposal = {},
    {
        now = Date.now(),
        maxAgeMs = DEFAULT_MAX_AGE_MS
    } = {}
) {
    if (
        !proposal?.file ||
        !proposal?.search ||
        !proposal?.replace
    ) {
        return false;
    }

    const updatedAt =
        Number(
            proposal.updatedAt ||
            proposal.createdAt ||
            0
        );

    return !updatedAt ||
        now - updatedAt <= maxAgeMs;
}

function safeRemove(storage, key) {
    try {
        storage?.removeItem?.(key);
    }
    catch(error) {}
}

function safeRead(storage, key) {
    try {
        const raw =
            storage?.getItem?.(key);

        return raw
            ? JSON.parse(raw)
            : null;
    }
    catch(error) {
        return null;
    }
}

function safeWrite(storage, key, value) {
    try {
        storage?.setItem?.(
            key,
            JSON.stringify(value)
        );
    }
    catch(error) {}
}

export function createSia7ProposalState({
    host = {},
    storage = null,
    documentRef = null,
    now = () => Date.now(),
    maxAgeMs = DEFAULT_MAX_AGE_MS
} = {}) {
    const isFresh = proposal =>
        isFreshSia7PatchProposal(
            proposal,
            {
                now: now(),
                maxAgeMs
            }
        );

    const clearPending = () => {
        host.__SIA7_PENDING_PATCH_APPROVAL__ =
            null;

        safeRemove(
            storage,
            PENDING_STORAGE_KEY
        );
    };

    const clear = () => {
        host.__SIA7_ACTIVE_VISUAL_PATCH_PROPOSAL__ =
            null;
        host.__SIA7_ACTIVE_PATCH_PROPOSAL__ =
            null;

        clearPending();

        safeRemove(
            storage,
            ACTIVE_STORAGE_KEY
        );

        try {
            documentRef
                ?.querySelectorAll?.(
                    "[data-sia7-visual-patch-proposal='true']"
                )
                ?.forEach?.(card => card.remove());
        }
        catch(error) {}
    };

    const rememberActive = payload => {
        clearPending();

        const proposal =
            buildSia7ActivePatchProposal(
                payload,
                now()
            );

        host.__SIA7_ACTIVE_PATCH_PROPOSAL__ =
            proposal;

        safeWrite(
            storage,
            ACTIVE_STORAGE_KEY,
            proposal
        );

        return proposal;
    };

    const readActive = () => {
        const current =
            host.__SIA7_ACTIVE_PATCH_PROPOSAL__;

        if (isFresh(current)) {
            return current;
        }

        if (current) {
            clear();
            return null;
        }

        const stored =
            safeRead(
                storage,
                ACTIVE_STORAGE_KEY
            );

        if (isFresh(stored)) {
            host.__SIA7_ACTIVE_PATCH_PROPOSAL__ =
                stored;

            return stored;
        }

        if (stored) {
            clear();
        }

        return null;
    };

    const rememberPending = payload => {
        const proposal =
            buildSia7ActivePatchProposal(
                payload,
                now()
            );

        const pending = {
            ...proposal,
            fingerprint:
                payload.fingerprint || "",
            approvalCommand:
                payload.approvalCommand ||
                proposal.approvalCommand,
            status:
                "PENDING_SAFE_WRITE_APPROVAL",
            createdAt:
                Number(payload.createdAt) || now(),
            updatedAt:
                now()
        };

        host.__SIA7_PENDING_PATCH_APPROVAL__ =
            pending;

        safeWrite(
            storage,
            PENDING_STORAGE_KEY,
            pending
        );

        return pending;
    };

    const readPending = () => {
        const current =
            host.__SIA7_PENDING_PATCH_APPROVAL__;

        if (isFresh(current)) {
            return current;
        }

        if (current) {
            clearPending();
            return null;
        }

        const stored =
            safeRead(
                storage,
                PENDING_STORAGE_KEY
            );

        if (isFresh(stored)) {
            host.__SIA7_PENDING_PATCH_APPROVAL__ =
                stored;

            return stored;
        }

        if (stored) {
            clearPending();
        }

        return null;
    };

    return Object.freeze({
        version:
            "1.0.0-shared-proposal-state",
        storageKeys:
            Object.freeze({
                active: ACTIVE_STORAGE_KEY,
                pending: PENDING_STORAGE_KEY
            }),
        maxAgeMs,
        build:
            buildSia7ActivePatchProposal,
        isFresh,
        rememberActive,
        readActive,
        rememberPending,
        readPending,
        clearPending,
        clear
    });
}

if (typeof window !== "undefined") {
    let browserStorage = null;

    try {
        browserStorage = window.localStorage;
    }
    catch(error) {}

    window.Sia7ProposalState ||=
        createSia7ProposalState({
            host: window,
            storage:
                browserStorage,
            documentRef:
                window.document
        });
}

export const SIA7_PROPOSAL_STATE_CONTRACT =
    Object.freeze({
        version:
            "1.0.0-shared-proposal-state",
        activeStorageKey:
            ACTIVE_STORAGE_KEY,
        pendingStorageKey:
            PENDING_STORAGE_KEY,
        maxAgeMs:
            DEFAULT_MAX_AGE_MS,
        guarantees: [
            "single_terminal_proposal_authority",
            "cancel_clears_active_and_pending_storage",
            "new_active_invalidates_pending_approval",
            "expired_pending_approval_fails_closed"
        ]
    });
