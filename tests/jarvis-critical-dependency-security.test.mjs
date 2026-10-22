import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const json=name=>JSON.parse(readFileSync(new URL('../'+name,import.meta.url),'utf8'));
test('critical IP-spoof and websocket-driver fixes remain locked without removing Firebase login test dependencies',()=>{
 const pkg=json('package.json'),lock=json('package-lock.json');
 assert.equal(pkg.overrides['proxy-addr'],'2.0.8');
 assert.equal(pkg.overrides['websocket-driver'],'0.7.5');
 assert.equal(lock.packages['node_modules/proxy-addr']?.version,'2.0.8');
 assert.equal(lock.packages['node_modules/websocket-driver']?.version,'0.7.5');
 assert.equal(pkg.devDependencies.firebase,'10.8.0',
  'owner auth/session regression dependencies must not be pruned');
 assert.equal(pkg.devDependencies['@firebase/rules-unit-testing'],'3.0.2');
 assert.ok(lock.packages['node_modules/firebase'],
  'test Firebase package must remain available after patch upgrades');
 assert.ok(lock.packages['node_modules/@firebase/rules-unit-testing'],
  'Firebase rules test runtime must remain installed');
});
