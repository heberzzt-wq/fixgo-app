import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { createLegacySecurityExports } = require('./legacy-security-hotfix');
const { createRequestB2cWithdrawalHandler } = require('./b2c-service-marketplace');
class HttpsError extends Error { constructor(code, message) { super(message); this.code=code; } }
const functions = { https: { HttpsError, onCall:handler=>handler, onRequest:handler=>handler } };
const auth = {auth:{uid:'hotfix-unit-technician',token:{}}};

function harness(completeService) {
    let tokenChecks=0;
    const admin = {auth:()=>({verifyIdToken:async(token,revoked)=>{
        tokenChecks++;
        assert.equal(revoked,true);
        if(token!=='valid-fixture-token')throw new Error('invalid token');
        return {uid:'fixture'};
    }})};
    const requestWithdrawal=async()=>({ok:true});
    const exports=createLegacySecurityExports({functions,admin,requestWithdrawal,completeService});
    return {exports,requestWithdrawal,get tokenChecks(){return tokenChecks;}};
}
async function invokeHttp(handler,authorization) {
    let status=200,body;
    const headers=authorization?{authorization}:{};
    const req={headers,method:'POST',body:{prompt:'must not reach a provider'},get:name=>headers[name.toLowerCase()]};
    const res={status(code){status=code;return this;},json(value){body=value;return this;},set(){return this;},setHeader(){return this;},send(value){body=value;return this;}};
    await handler(req,res);
    return {status,body};
}

test('minimal legacy factory aliases withdrawal exactly and exports no B2B scheduler',()=>{
    const h=harness();
    assert.strictEqual(h.exports.requestPayout,h.requestWithdrawal);
    assert.deepEqual(Object.keys(h.exports).sort(),['generarModulo','procesarCierreServicio','requestPayout']);
});

test('retired generator rejects anonymous/invalid and returns 410 for authenticated without provider dependencies',async()=>{
    const h=harness();
    assert.equal((await invokeHttp(h.exports.generarModulo)).status,401);
    assert.equal(h.tokenChecks,0);
    assert.equal((await invokeHttp(h.exports.generarModulo,'Bearer invalid-fixture-token')).status,401);
    assert.equal((await invokeHttp(h.exports.generarModulo,'Bearer valid-fixture-token')).status,410);
    assert.equal(h.tokenChecks,2);
    const source=fs.readFileSync(new URL('../functions/legacy-security-hotfix.js',import.meta.url),'utf8');
    assert.doesNotMatch(source,/require\(['"](?:@google|stripe|https?|axios)|\bfetch\s*\(/);
});

test('minimal legacy closure fails closed without backend writes; full closure is the same callable',async()=>{
    const h=harness();
    await assert.rejects(h.exports.procesarCierreServicio({serviceId:'fixture'},{}),e=>e.code==='unauthenticated');
    await assert.rejects(h.exports.procesarCierreServicio({serviceId:'fixture'},auth),e=>e.code==='failed-precondition');
    const complete=async()=>({ok:true,success:true});
    assert.strictEqual(harness(complete).exports.procesarCierreServicio,complete);
});

test('canonical withdrawal rejects invalid amount/monto and missing or invalid requestId before data access',async()=>{
    const db=new Proxy({}, {get(){throw new Error('UNEXPECTED_DATABASE_ACCESS');}});
    const withdraw=createRequestB2cWithdrawalHandler({admin:{},db,functions});
    for(const data of [
        {amount:-100},{amount:0},{amount:0.001},{amount:true},{amount:false},{amount:'100'},{amount:null},{amount:NaN},{amount:Infinity},{amount:'not-a-number'},
        {monto:-100},{monto:100},{amount:null},{amount:''}
    ]) await assert.rejects(withdraw({...data,requestId:'fixture-key-001'},auth),e=>e.code==='invalid-argument',JSON.stringify(data));
    for(const requestId of [undefined,'','short','bad/key-with-slash','a'.repeat(129)]) {
        await assert.rejects(withdraw({amount:100,requestId},auth),e=>e.code==='invalid-argument');
    }
    await assert.rejects(withdraw({amount:100,idempotencyKey:'unsupported-alias'},auth),e=>e.code==='invalid-argument');
    await assert.rejects(withdraw({amount:100,requestId:'fixture-key-001'},{}),e=>e.code==='unauthenticated');
});

test('Firebase package exposes requestPayout as exact canonical solicitarRetiro and secured legacy closure',async()=>{
    const entry=require('./'+require('./package.json').main);
    assert.strictEqual(entry.requestPayout,entry.solicitarRetiro);
    assert.equal(typeof entry.generarModulo,'function');
    assert.equal(typeof entry.procesarCierreServicio,'function');
    if(entry.completeB2cService)assert.strictEqual(entry.procesarCierreServicio,entry.completeB2cService);
    else await assert.rejects(entry.procesarCierreServicio.run({serviceId:'fixture'},auth),e=>e.code==='failed-precondition');
    await assert.rejects(entry.requestPayout.run({amount:-100,requestId:'fixture-key-001'},auth),e=>e.code==='invalid-argument');
});
