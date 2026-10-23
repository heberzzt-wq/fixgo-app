import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const config=JSON.parse(fs.readFileSync(new URL('../firebase.json',import.meta.url),'utf8'));
const hosting=(Array.isArray(config.hosting)?config.hosting:[config.hosting]);
test('official FixGo hosting excludes private historical release trees and server-only JS',()=>{
 const fixgo=hosting.find(item=>item.site==='fixgo-44e4d');
 assert.ok(fixgo);
 assert.equal(fixgo.public,'.');
 for(const excluded of [
  '.firebase-release/**','**/.firebase-release/**',
  '.jarvis-artifacts/**','.firebase/**','**/.*',
  'tests/**','scripts/**','docs/**','functions/**',
  'jarvis-fs-bridge.js','jarvis-configured-sources.js',
  'jarvis-isolated-evidence-verify.js','jarvis-run-command-cancellation.js',
  'serviceAccountKey.json','firebase-adminsdk-*.json'
 ])assert.ok(fixgo.ignore.includes(excluded),'Must not host: '+excluded);
});
test('corporate hosting is a separate deployment target',()=>{
 assert.equal(hosting.length>=2,true);
 const fixgo=hosting.find(item=>item.site==='fixgo-44e4d');
 assert.ok(fixgo);
 const others=hosting.filter(item=>item!==fixgo);
 assert.ok(others.length>0);
});
