import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import http from 'node:http';

const require = createRequire(import.meta.url);
const manifest = require('../functions/package.json');
const legacy = require('../functions/index.js');
const secure = require('../functions/secure-entry.js');
const entry = require('../functions/' + manifest.main);

test('Firebase package loads the secure financial exports while preserving platform capabilities', () => {
    assert.equal(manifest.main, 'secure-entry-alias.js');
    assert.equal(entry.api, secure.api);
    assert.equal(entry.onServiceCompleted, secure.onServiceCompleted);
    assert.notEqual(entry.api, legacy.api);
    assert.notEqual(entry.onServiceCompleted, legacy.onServiceCompleted);
    for (const name of ['reconciliarLiquidacionB2C','approveB2cTechnician','completeB2bService','submitB2bPersonnelKyc','reviewB2bPersonnelKyc','jarvisSemanticPlan','jarvisVideoGenerate']) {
        assert.equal(typeof entry[name], 'function', name);
    }
});

test('real package rejects anonymous reconciliation and personnel approval before accessing data', async () => {
    for (const name of ['reconciliarLiquidacionB2C','submitB2bPersonnelKyc','reviewB2bPersonnelKyc']) {
        await assert.rejects(entry[name].run({}, {}), error => error.code === 'unauthenticated');
    }
});

test('release identity reports the executing secure financial authority', async () => {
    const server = http.createServer(entry.api);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/release-identity`);
        const identity = await response.json();
        assert.equal(identity.financial_authority,'secure-entry');
        assert.ok(identity.settlement_version);
        assert.equal(response.status, identity.prepared ? 200 : 503);
    } finally { await new Promise(resolve => server.close(resolve)); }
});

test('retired trigger cannot liquidate even if index.js becomes the entrypoint', async () => {
    await assert.rejects(legacy.onServiceCompleted.run({}, {}), /SECURE_FINANCIAL_ENTRY_REQUIRED/);
});

test('retired checkout and webhook return an explicit failure without processing payments', async () => {
    const server = http.createServer(legacy.api);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        for (const route of ['/create-checkout-session', '/webhook', '/stripe-webhook', '/']) {
            const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
                method:'POST', headers:{'content-type':'application/json'}, body:'{}'
            });
            assert.equal(response.status,503);
            assert.equal((await response.json()).error,'SECURE_FINANCIAL_ENTRY_REQUIRED');
        }
    } finally { await new Promise(resolve => server.close(resolve)); }
});

test('financial retry is exposed through the canonical Firebase client to the administrative panel', () => {
    const client = fs.readFileSync(new URL('../firebase.js',import.meta.url),'utf8');
    const panel = fs.readFileSync(new URL('../panel-admin.js',import.meta.url),'utf8');
    assert.match(client,/httpsCallable\(cloudFunctions, "reconciliarLiquidacionB2C"\)/);
    assert.match(panel,/await reconciliarLiquidacionB2C\(\{ serviceId: service.id, reason: reason.trim\(\) \}\)/);
});
