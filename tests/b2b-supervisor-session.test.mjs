import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchB2bSupervisor } from '../b2b-supervisor-session.js';
function harness() {
    let profileNext; let profileStopped = false; const streams = []; const rendered = []; const errors = [];
    const stop = watchB2bSupervisor({
        subscribeProfile(next) { profileNext = next; return () => { profileStopped = true; }; },
        subscribeOrders(tenant, next, error) { const stream = { tenant, next, error, stopped: false }; streams.push(stream); return () => { stream.stopped = true; }; },
        onProfile() {}, onOrders: rows => rendered.push(rows), onError: error => errors.push(error)
    });
    return { profile: value => profileNext(value), streams, rendered, errors, stop, profileStopped: () => profileStopped };
}
const base = { tipo_cuenta: 'B2B', rol: 'supervisor', edificioId: 'TenantA', estado: 'activo', status: 'activo' };
test('supervision subscribes only active supervisor and filters foreign tenant rows', () => {
    const h = harness(); h.profile({ ...base, status: 'pendiente_revision' }); h.profile({ ...base, rol: 'tecnico' });
    assert.equal(h.streams.length, 0); h.profile(base); assert.equal(h.streams[0].tenant, 'TenantA');
    h.streams[0].next([{ id: 'own', edificioId: 'TenantA' }, { id: 'foreign', edificioId: 'TenantB' }]);
    assert.deepEqual(h.rendered.at(-1).map(row => row.id), ['own']);
});
test('tenant changes and revocation stop old listeners, erase data and ignore late results', () => {
    const h = harness(); h.profile(base); const old = h.streams[0];
    h.profile({ ...base, edificioId: 'TenantB' }); assert.equal(old.stopped, true);
    const count = h.rendered.length; old.next([{ edificioId: 'TenantA' }]); old.error(new Error('late'));
    assert.equal(h.rendered.length, count); assert.equal(h.streams[1].stopped, false);
    h.profile({ ...base, suspendido: true }); assert.equal(h.streams[1].stopped, true); assert.deepEqual(h.rendered.at(-1), []);
    h.stop(); assert.equal(h.profileStopped(), true);
    const streams = h.streams.length; h.profile(base); assert.equal(h.streams.length, streams);
});
test('stream error is visible and closes access to stale rows', () => {
    const h = harness(); h.profile(base); h.streams[0].error(new Error('permission-denied'));
    assert.equal(h.streams[0].stopped, true); assert.equal(h.errors.at(-1).message, 'permission-denied'); assert.deepEqual(h.rendered.at(-1), []);
});
