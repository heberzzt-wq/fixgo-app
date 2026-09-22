import { test } from 'node:test';
import assert from 'node:assert/strict';
import { b2bCacheDatabaseName, canRecoverB2bQueue, recoverLegacyB2bQueues } from '../b2b-offline-authority.js';
test('cache isolates accounts and exact tenants without normalized identity collisions', () => {
    const identities = [['a', 'tenant'], ['b', 'tenant'], ['a', 'Tenant'], ['a', 'other'], ['a_b', 'c'], ['a', 'b_c'], ['a/b', 'c'], ['a', 'b/c']];
    assert.equal(new Set(identities.map(pair => b2bCacheDatabaseName(...pair))).size, identities.length);
    for (const invalid of [['', 'tenant'], ['a', ''], [undefined, 'tenant'], ['a', null]]) assert.throws(() => b2bCacheDatabaseName(...invalid));
});
test('legacy recovery only authorizes actor-owned work with a freshly verified order in the same tenant', () => {
    const work = { actorUid: 'a', collection: 'servicios_b2b' };
    const order = { edificioId: 'tenant', tecnicoId: 'a' };
    assert.equal(canRecoverB2bQueue(work, 'a', 'tenant', order), true);
    assert.equal(canRecoverB2bQueue(work, 'b', 'tenant', order), false);
    assert.equal(canRecoverB2bQueue(work, 'a', 'other', order), false);
    assert.equal(canRecoverB2bQueue(work, 'a', 'tenant', { ...order, tecnicoId: 'b' }), false);
    assert.equal(canRecoverB2bQueue(work, 'a', 'tenant', undefined), false);
    assert.equal(canRecoverB2bQueue(work, 'a', 'tenant', { edificioId: 'tenant' }), false);
    assert.equal(canRecoverB2bQueue({ collection: 'servicios_b2b' }, 'a', 'tenant', order), false);
    assert.equal(canRecoverB2bQueue({ ...work, collection: 'users' }, 'a', 'tenant', order), false);
});
test('absent legacy database is not opened, created or deleted', async () => {
    const indexedDB = { databases: async () => [], open() { throw new Error('must not open'); }, deleteDatabase() { throw new Error('must not delete'); } };
    assert.deepEqual(await recoverLegacyB2bQueues(indexedDB, null, { uid: 'a', tenantId: 'tenant' }), { imported: 0, retained: 0 });
});
