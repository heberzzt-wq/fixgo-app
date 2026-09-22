import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const entry = require('./' + require('./package.json').main);

test('legacy payout is exactly the canonical withdrawal and rejects malformed money', async () => {
    assert.strictEqual(entry.requestPayout, entry.solicitarRetiro);
    for (const payload of [
        { amount: -100, requestId: 'fixture-key-001' },
        { amount: 0, requestId: 'fixture-key-001' },
        { amount: 0.001, requestId: 'fixture-key-001' },
        { amount: '100', requestId: 'fixture-key-001' },
        { monto: 100, requestId: 'fixture-key-001' },
        { amount: 100 }
    ]) {
        await assert.rejects(
            entry.requestPayout.run(payload, { auth: { uid: 'hotfix-unit-technician' } }),
            error => error.code === 'invalid-argument'
        );
    }
});

test('retired legacy generator is inert over real HTTP', async () => {
    const server = http.createServer(entry.generarModulo);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ prompt: 'must never reach a provider' })
        });
        assert.equal(response.status, 410);
        const payload = await response.json();
        assert.equal(payload.error, 'LEGACY_GENERATOR_RETIRED');
        assert.equal(payload.authority, 'secure-entry');
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('legacy closure name is the physically verified canonical B2C close', () => {
    assert.equal(typeof entry.completeB2cService, 'function');
    assert.strictEqual(entry.procesarCierreServicio, entry.completeB2cService);
});
