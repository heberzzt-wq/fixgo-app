import assert from "node:assert/strict";
import { test } from "node:test";

import {
    isNexoApprovalCommand,
    normalizeNexoCommand,
    NEXO_UI_BRANDING_VERSION
} from "../gestia-core/nexo/nexo.ui.branding.js";

test("NEXO normalizes accented and punctuated approval language", () => {
    assert.equal(
        normalizeNexoCommand("  ¡Aprobación AUTORIZADA!  "),
        "aprobacion autorizada"
    );
    assert.match(
        NEXO_UI_BRANDING_VERSION,
        /approval-normalization/
    );
});

test("NEXO recognizes the real approval phrase reported by the owner", () => {
    assert.equal(
        isNexoApprovalCommand("aprobación autorizada"),
        true
    );
    assert.equal(
        isNexoApprovalCommand("Apruebo el plan de marketing"),
        true
    );
    assert.equal(
        isNexoApprovalCommand("Autorizo la publicación"),
        true
    );
    assert.equal(
        isNexoApprovalCommand("arre"),
        true
    );
});

test("NEXO never turns rejection or analysis prose into approval", () => {
    assert.equal(
        isNexoApprovalCommand("no autorizo el plan"),
        false
    );
    assert.equal(
        isNexoApprovalCommand("analiza la autorización de pagos"),
        false
    );
    assert.equal(
        isNexoApprovalCommand("rechazo la propuesta"),
        false
    );
});

test("NEXO installs approval interception with capture=true before the legacy submit", async () => {
    const previousDocument = globalThis.document;
    const previousMutationObserver = globalThis.MutationObserver;
    const previousBranding = globalThis.__NEXO_UI_BRANDING__;
    const previousNormalizer = globalThis.__NEXO_APPROVAL_NORMALIZER__;
    const previousNexoApproval = globalThis.NexoApproval;
    const previousStamp = globalThis.__NEXO_RUNTIME_STAMP__;
    const previousLastNormalization =
        globalThis.__NEXO_LAST_APPROVAL_NORMALIZATION__;

    const listeners = [];
    const input = {
        value: "aprobación autorizada",
        dataset: {}
    };
    const form = {
        id: "gestia-form",
        querySelector(selector) {
            return selector === "#gestia-input"
                ? input
                : null;
        }
    };

    const fakeDocument = {
        title: "Terminal Heberto | GestiaPremium",
        readyState: "complete",
        documentElement: {
            dataset: {}
        },
        addEventListener(type, listener, options) {
            listeners.push({
                type,
                listener,
                options
            });
        },
        removeEventListener() {},
        querySelectorAll() {
            return [];
        },
        getElementById(id) {
            return id === "gestia-input"
                ? input
                : null;
        }
    };

    class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
        }
        observe() {}
        disconnect() {}
    }

    try {
        delete globalThis.__NEXO_UI_BRANDING__;
        delete globalThis.__NEXO_APPROVAL_NORMALIZER__;
        delete globalThis.NexoApproval;

        globalThis.document = fakeDocument;
        globalThis.MutationObserver = FakeMutationObserver;

        const moduleUrl = new URL(
            "../gestia-core/nexo/nexo.ui.branding.js",
            import.meta.url
        );
        moduleUrl.searchParams.set(
            "capture-test",
            String(Date.now())
        );

        await import(moduleUrl.href);

        const submitListener = listeners.find(entry =>
            entry.type === "submit"
        );

        assert.ok(submitListener);
        assert.equal(submitListener.options, true);

        submitListener.listener({
            target: form
        });

        assert.equal(input.value, "proceder");
        assert.equal(input.dataset.nexoApprovalNormalized, "true");
        assert.equal(
            input.dataset.nexoOriginalApproval,
            "aprobación autorizada"
        );
        assert.equal(
            globalThis.__NEXO_LAST_APPROVAL_NORMALIZATION__
                ?.normalizedCommand,
            "proceder"
        );
    }
    finally {
        globalThis.__NEXO_UI_BRANDING__
            ?.uninstall?.();

        if (previousDocument === undefined) {
            delete globalThis.document;
        }
        else {
            globalThis.document = previousDocument;
        }

        if (previousMutationObserver === undefined) {
            delete globalThis.MutationObserver;
        }
        else {
            globalThis.MutationObserver =
                previousMutationObserver;
        }

        const restore = (key, value) => {
            if (value === undefined) {
                delete globalThis[key];
            }
            else {
                globalThis[key] = value;
            }
        };

        restore(
            "__NEXO_UI_BRANDING__",
            previousBranding
        );
        restore(
            "__NEXO_APPROVAL_NORMALIZER__",
            previousNormalizer
        );
        restore(
            "NexoApproval",
            previousNexoApproval
        );
        restore(
            "__NEXO_RUNTIME_STAMP__",
            previousStamp
        );
        restore(
            "__NEXO_LAST_APPROVAL_NORMALIZATION__",
            previousLastNormalization
        );
    }
});
