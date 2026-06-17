"use strict";

const functions = require("firebase-functions/v1");
const { validateRepoWriteSyntax } = require("./repo-syntax-validator");
const repoWriteAuthFactory = require("./repo-write-auth");

const COLLECTION = "repo_write_idempotency";
const LEASE_MS = 150000;
const MAX_KEY_LENGTH = 240;
const HOOK = Symbol.for("gestia.repoWriteIdempotencyHook");
const OWNER = "heberzzt-wq";
const REPO = "fixgo-app";
const BRANCH = "v5.9-polish";

const text = value => typeof value === "string" ? value.trim() : "";
const safeError = error => ({
    message: error?.message || "UNKNOWN_REPO_WRITE_ERROR",
    code: error?.code || null,
    status: error?.status || error?.httpStatus || null
});

module.exports = ({ admin, db, crypto }) => {
    if (!admin || !db || !crypto) {
        throw new Error("REPO_WRITE_IDEMPOTENCY_DEPENDENCIES_REQUIRED");
    }

    const FieldValue = admin.firestore.FieldValue;
    const { authorizeRepoWriteRequest } = repoWriteAuthFactory({ admin, db });
    const hash = value => crypto.createHash("sha256")
        .update(String(value), "utf8")
        .digest("hex");

    function buildRepoWriteIdentity({ uid, idempotencyKey, path, content }) {
        uid = text(uid);
        idempotencyKey = text(idempotencyKey);
        path = text(path);

        if (!uid) return { ok: false, httpStatus: 401, status: "unauthenticated", reason: "REPO_WRITE_UID_REQUIRED" };
        if (!idempotencyKey) return { ok: false, httpStatus: 400, status: "invalid_request", reason: "IDEMPOTENCY_KEY_REQUIRED" };
        if (idempotencyKey.length > MAX_KEY_LENGTH) return { ok: false, httpStatus: 400, status: "invalid_request", reason: "IDEMPOTENCY_KEY_TOO_LONG" };
        if (!path) return { ok: false, httpStatus: 400, status: "invalid_request", reason: "PATH_REQUIRED" };
        if (typeof content !== "string") return { ok: false, httpStatus: 400, status: "invalid_request", reason: "CONTENT_REQUIRED" };

        const contentHash = hash(content);
        return {
            ok: true,
            uid,
            idempotencyKey,
            path,
            contentHash,
            fingerprint: hash([uid, path, contentHash].join("\n")),
            documentId: hash([uid, idempotencyKey].join("\n"))
        };
    }

    async function claimRepoWrite(input) {
        const identity = buildRepoWriteIdentity(input);
        if (!identity.ok) return identity;

        const ref = db.collection(COLLECTION).doc(identity.documentId);
        const now = Date.now();
        const leaseOwner = crypto.randomUUID();

        return db.runTransaction(async transaction => {
            const snapshot = await transaction.get(ref);
            const existing = snapshot.exists ? snapshot.data() : null;

            if (existing && existing.fingerprint !== identity.fingerprint) {
                return { ok: false, httpStatus: 409, status: "conflict", reason: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD", identity, existingStatus: existing.status || null };
            }

            if (existing?.status === "completed") {
                return { ok: true, replayed: true, identity, documentReference: ref, result: existing.result || null, existing };
            }

            const leaseExpiresAt = Number(existing?.lease_expires_at_ms || 0);
            if (existing?.status === "processing" && leaseExpiresAt > now) {
                return { ok: false, httpStatus: 409, status: "processing", reason: "REPO_WRITE_ALREADY_PROCESSING", retryAfterMs: leaseExpiresAt - now, identity, documentReference: ref, existing };
            }

            const attempts = Number(existing?.attempts || 0) + 1;
            const data = {
                idempotency_key: identity.idempotencyKey,
                fingerprint: identity.fingerprint,
                content_hash: identity.contentHash,
                path: identity.path,
                uid: identity.uid,
                role: text(input.role) || null,
                tenant_id: text(input.tenantId) || null,
                status: "processing",
                lease_owner: leaseOwner,
                lease_expires_at_ms: now + LEASE_MS,
                attempts,
                updated_at: FieldValue.serverTimestamp()
            };
            if (!snapshot.exists) data.created_at = FieldValue.serverTimestamp();
            transaction.set(ref, data, { merge: true });
            return { ok: true, replayed: false, identity, documentReference: ref, leaseOwner, attempts };
        });
    }

    async function completeRepoWrite({ claim, result, recoveredByContent = false }) {
        if (!claim?.identity || !claim?.documentReference) throw new Error("VALID_REPO_WRITE_CLAIM_REQUIRED");
        const stored = {
            success: result?.success === true,
            repo: result?.repo || null,
            path: result?.path || claim.identity.path,
            commit: result?.commit || null,
            fileSha: result?.fileSha || null,
            created: result?.created === true,
            updated: result?.updated === true,
            noChange: result?.noChange === true,
            recoveredByContent: recoveredByContent === true
        };
        await claim.documentReference.set({
            status: "completed",
            result: stored,
            completed_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
            lease_owner: FieldValue.delete(),
            lease_expires_at_ms: FieldValue.delete(),
            last_error: FieldValue.delete()
        }, { merge: true });
        return stored;
    }

    async function failRepoWrite({ claim, error }) {
        if (!claim?.identity || !claim?.documentReference) return { ok: false, reason: "VALID_REPO_WRITE_CLAIM_REQUIRED" };
        const stored = safeError(error);
        await claim.documentReference.set({
            status: "failed",
            last_error: stored,
            failed_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
            lease_owner: FieldValue.delete(),
            lease_expires_at_ms: FieldValue.delete()
        }, { merge: true });
        return { ok: true, error: stored };
    }

    function resolveKey(req, authorization, path, content, message) {
        const explicit = text(req.body?.idempotencyKey || req.get?.("Idempotency-Key") || req.get?.("X-Idempotency-Key"));
        if (explicit) return explicit;
        message = text(message);
        return message ? `auto:${hash([authorization.uid, message, path, hash(content)].join("\n"))}` : "";
    }

    let githubPromise = null;
    async function readRemote(path) {
        if (!process.env.GITHUB_TOKEN) return { ok: false };
        githubPromise ||= import("@octokit/rest").then(({ Octokit }) => new Octokit({ auth: process.env.GITHUB_TOKEN }));
        const github = await githubPromise;
        try {
            const response = await github.repos.getContent({ owner: OWNER, repo: REPO, path, ref: BRANCH });
            if (Array.isArray(response.data)) return { ok: false };
            return { ok: true, sha: response.data.sha, content: Buffer.from(response.data.content, "base64").toString("utf8") };
        } catch (error) {
            return error.status === 404 ? { ok: true, sha: null, content: null } : { ok: false, error };
        }
    }

    function makeWrappedHandler(legacy) {
        return functions.runWith({ timeoutSeconds: 120, memory: "512MB" }).https.onRequest(async (req, res) => {
            let claim = null;
            let idempotencyKey = null;

            try {
                if (req.method === "OPTIONS") return legacy(req, res);

                const authorization = await authorizeRepoWriteRequest(req);
                if (!authorization.ok) return legacy(req, res);

                const path = text(req.body?.path || req.query?.path);
                const content = req.body?.content;
                const message = text(req.body?.message);
                if (!path || typeof content !== "string") return legacy(req, res);

                const syntax = validateRepoWriteSyntax({ file: path, content });
                if (!syntax.ok) return legacy(req, res);

                const safePath = syntax.file || path;
                idempotencyKey = resolveKey(req, authorization, safePath, content, message);
                if (!idempotencyKey) return legacy(req, res);

                claim = await claimRepoWrite({
                    uid: authorization.uid,
                    role: authorization.role,
                    tenantId: authorization.tenantId,
                    idempotencyKey,
                    path: safePath,
                    content
                });

                if (!claim.ok) {
                    return res.status(claim.httpStatus || 409).json({
                        success: false,
                        blocked: true,
                        status: claim.status || "conflict",
                        error: claim.reason || "REPO_WRITE_IDEMPOTENCY_BLOCKED",
                        reason: claim.reason || "REPO_WRITE_IDEMPOTENCY_BLOCKED",
                        retryAfterMs: claim.retryAfterMs || null,
                        idempotencyKey,
                        path: safePath,
                        surface: "server"
                    });
                }

                if (claim.replayed) {
                    return res.status(200).json({
                        ...(claim.result || {}),
                        success: true,
                        replayed: true,
                        idempotencyKey,
                        attempts: claim.existing?.attempts || null,
                        surface: "server"
                    });
                }

                const remote = await readRemote(safePath);
                if (remote.ok && typeof remote.content === "string" && remote.content === content) {
                    const result = await completeRepoWrite({
                        claim,
                        recoveredByContent: claim.attempts > 1,
                        result: { success: true, repo: `${OWNER}/${REPO}`, path: safePath, commit: null, fileSha: remote.sha, created: false, updated: false, noChange: true }
                    });
                    return res.status(200).json({ ...result, replayed: false, idempotencyKey, attempts: claim.attempts, surface: "server" });
                }

                const originalJson = res.json.bind(res);
                let finalized = false;
                res.json = body => {
                    if (finalized) return originalJson(body);
                    finalized = true;
                    return Promise.resolve().then(async () => {
                        const status = Number(res.statusCode || 200);
                        if (status >= 200 && status < 300 && body?.success === true) {
                            const stored = await completeRepoWrite({ claim, result: body });
                            return originalJson({ ...body, ...stored, replayed: false, idempotencyKey, attempts: claim.attempts, surface: "server" });
                        }
                        await failRepoWrite({ claim, error: { message: body?.message || body?.error || "REPO_WRITE_FAILED", code: body?.error || body?.reason || null, status } });
                        return originalJson({ ...body, idempotencyKey, surface: body?.surface || "server" });
                    }).catch(async error => {
                        try { await failRepoWrite({ claim, error }); } catch (auditError) { console.error("[REPO_WRITE_IDEMPOTENCY_AUDIT_ERROR]", auditError); }
                        res.statusCode = 500;
                        return originalJson({ success: false, blocked: false, status: "failed", error: "REPO_WRITE_IDEMPOTENCY_FINALIZE_FAILED", reason: "REPO_WRITE_IDEMPOTENCY_FINALIZE_FAILED", message: error.message, idempotencyKey, surface: "server" });
                    });
                };

                return legacy(req, res);
            } catch (error) {
                console.error("[REPO_WRITE_IDEMPOTENCY_RUNTIME_ERROR]", error);
                if (!claim?.ok || claim.replayed) return legacy(req, res);
                try { await failRepoWrite({ claim, error }); } catch (auditError) { console.error("[REPO_WRITE_IDEMPOTENCY_AUDIT_ERROR]", auditError); }
                return res.status(500).json({
                    success: false,
                    blocked: false,
                    status: "failed",
                    error: "REPO_WRITE_IDEMPOTENCY_RUNTIME_FAILED",
                    reason: "REPO_WRITE_IDEMPOTENCY_RUNTIME_FAILED",
                    message: error?.message || "La ejecución idempotente falló.",
                    idempotencyKey,
                    surface: "server"
                });
            }
        });
    }

    function installHook() {
        const parent = module.parent?.exports;
        if (!parent || parent[HOOK]) return;

        const state = { legacy: null, wrapped: null };
        Object.defineProperty(parent, HOOK, { value: state, enumerable: false });
        Object.defineProperty(parent, "repoCommitWriteFile", {
            configurable: true,
            enumerable: true,
            get: () => state.wrapped || state.legacy,
            set: legacy => {
                state.legacy = legacy;
                state.wrapped = makeWrappedHandler(legacy);
            }
        });
    }

    installHook();

    return {
        buildRepoWriteIdentity,
        claimRepoWrite,
        completeRepoWrite,
        failRepoWrite,
        config: { collection: COLLECTION, leaseMs: LEASE_MS, hookInstalled: true }
    };
};
