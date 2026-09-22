import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const source = fs.readFileSync(new URL('../firebase.js', import.meta.url), 'utf8');
const wrapper = source.slice(source.indexOf('export async function solicitarRetiroB2C'), source.indexOf('export async function crearServicioB2C')).replace('export async', 'async');
const recovery = fs.readFileSync(new URL('../b2c-request-recovery.js', import.meta.url), 'utf8').replaceAll('export ', '');
function harness(options = {}) {
    const values = options.values || new Map();
    const calls = []; const auth = { currentUser: { uid: options.uid || 'technician-a' } };
    let outcome = 'failure'; let sequence = 0;
    const storage = {
        getItem: key => values.get(key) || null,
        setItem: (key, value) => { if (options.storageFails) throw Error('storage blocked'); if (!options.silentStorage) values.set(key, value); },
        removeItem: key => values.delete(key)
    };
    const scope = { auth, cloudFunctions: {}, TextEncoder, Uint8Array, localStorage: storage,
        crypto: { randomUUID: () => `opaque_withdrawal_${++sequence}`, subtle: { digest: async (...args) => {
            const result = await webcrypto.subtle.digest(...args);
            if (options.swapDuringDigest) auth.currentUser = { uid: 'technician-b' };
            return result;
        } } },
        httpsCallable: (_, name) => {
            assert.equal(name, 'solicitarRetiro');
            return async payload => { calls.push(structuredClone(payload));
                if (outcome === 'failure') throw Error('uncertain network');
                return { data: outcome === 'unconfirmed' ? { ok: false } : { ok: true, withdrawalId: 'withdrawal_fixture', amount: payload.amount } };
            };
        }
    };
    vm.runInNewContext(recovery + '\n' + wrapper + '\nglobalThis.withdraw=solicitarRetiroB2C;', scope);
    return { values, calls, auth, withdraw: scope.withdraw, setOutcome: value => { outcome = value; } };
}
test('real withdrawal wrapper persists opaque identity, retries after reload, and clears only confirmed success', async () => {
    const h = harness();
    await assert.rejects(h.withdraw(125), /uncertain network/);
    const firstId = h.calls[0].requestId;
    assert.match(firstId, /^[A-Za-z0-9_-]{8,128}$/);
    assert.equal(h.values.size, 1);
    assert.equal([...h.values.values()][0], firstId);
    assert.ok(![...h.values.keys()][0].includes('125'), 'amount is digested, never persisted in plaintext');
    const reload = harness({ values: h.values });
    reload.setOutcome('unconfirmed');
    await assert.rejects(reload.withdraw(125), /UNCONFIRMED/);
    assert.equal(reload.calls[0].requestId, firstId);
    assert.equal(h.values.size, 1);
    reload.setOutcome('success');
    assert.equal((await reload.withdraw(125)).ok, true);
    assert.equal(reload.calls[1].requestId, firstId);
    assert.equal(h.values.size, 0);
});
test('recovery identity is isolated by user, purpose and amount', async () => {
    const h = harness();
    await assert.rejects(h.withdraw(125));
    await assert.rejects(h.withdraw(150));
    h.auth.currentUser = { uid: 'technician-b' };
    await assert.rejects(h.withdraw(125));
    assert.equal(h.values.size, 3);
    assert.equal(new Set(h.calls.map(c => c.requestId)).size, 3);
    assert.ok(wrapper.includes("purpose: 'withdrawal'"));
});
test('account change while reserving id blocks backend and preserves pending identity', async () => {
    const h = harness({ swapDuringDigest: true });
    await assert.rejects(h.withdraw(125), /SESSION_CHANGED/);
    assert.equal(h.calls.length, 0);
    assert.equal(h.values.size, 1);
    h.auth.currentUser = null;
    await assert.rejects(h.withdraw(125), /SESSION_CHANGED/);
    assert.equal(h.calls.length, 0);
});
test('unavailable or nonpersistent recovery storage fails before any backend call', async () => {
    for (const options of [{storageFails: true}, {silentStorage: true}]) {
        const h = harness(options);
        await assert.rejects(h.withdraw(125), /storage blocked|RECOVERY_UNAVAILABLE/);
        assert.equal(h.calls.length, 0);
    }
});
test('invalid amounts fail before backend and before recovery storage changes', async () => {
    const h = harness();
    for (const amount of ['125', 0, -1, NaN, Infinity, undefined]) await assert.rejects(h.withdraw(amount), /AMOUNT_INVALID/);
    assert.equal(h.calls.length, 0);
    assert.equal(h.values.size, 0);
});
