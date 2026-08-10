import "./nexo-bootstrap.js?v=v94-generalist-execution-contract-v122-20260810";

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
