import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createSia7ProposalState,
    SIA7_PROPOSAL_STATE_CONTRACT
} from "../modules/terminal/proposal-state.js";

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
