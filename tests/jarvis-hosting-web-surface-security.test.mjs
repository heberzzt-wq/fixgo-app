import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const config=JSON.parse(fs.readFileSync(new URL('../firebase.json',import.meta.url),'utf8'));
const hosting=config.hosting.find(x=>x.site==='fixgo-44e4d');

test('FixGo hosting release excludes server-only local Jarvis files and leaves browser runtime available',()=>{
 assert.ok(hosting);
 assert.equal(hosting.public,'.');
 const denied=[
  'jarvis-fs-bridge.js','jarvis-upload-bridge.js',
  'jarvis-github-worker.js','jarvis-semantic-http.js',
  'jarvis-qwen-decision-http.js','jarvis-repo-intelligence.js',
  'jarvis-local-video-engine.js',
  'jarvis-workstation-health.js','jarvis-local-intrusion-guard.js',
  'jarvis-isolated-evidence-readback.js','jarvis-structured-artifact-recovery.js',
  'jarvis-xlsx-calculation.js','jarvis-external-connector-contract.js'
 ];
 for(const file of denied){
  assert.ok(hosting.ignore.includes(file),'release still exposes '+file);
  assert.ok(fs.existsSync(new URL('../'+file,import.meta.url)),'server entry vanished '+file);
 }
 // The frontend currently uses an explicit release contract and imports these
 // JS modules. Excluding them would break V142 and is not a security fix.
 for(const required of ['gestia-terminal.html','gestia-core/gestia-core.js',
  'modules/terminal/qwen-general-pilot.js','jarvis-runtime-contract.json',
  'jarvis-qwen-direct-cycle.js','jarvis-platform-self-healing.js']){
  assert.ok(!hosting.ignore.includes(required),'required browser import excluded '+required);
 }
 assert.ok(hosting.ignore.includes('scripts/**'));
 assert.ok(hosting.ignore.includes('security/**'));
 assert.ok(hosting.ignore.includes('functions/**'));
 assert.ok(hosting.ignore.includes('.jarvis-artifacts/**'));
});

test('actual Hosting upload inventory contains no Node-only server entrypoints or developer tools',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 // Firebase CLI uses glob('**/*', {dot:true,follow:true,nodir:true,posix:true,ignore}).
 const {sync:listFiles}=createRequire(import.meta.url)('glob');
 const files=listFiles('**/*',{
  cwd:root,dot:true,follow:true,nodir:true,posix:true,
  ignore:['**/firebase-debug.log','**/firebase-debug.*.log','.firebase/*',...hosting.ignore]
 });
 assert.ok(files.length>=100,'the browser bundle must not be empty');
 for(const required of ['gestia-terminal.html','gestia-core/gestia-core.js','modules/terminal/nexo-bootstrap.js','jarvis-runtime-contract.json']){
  assert.ok(files.includes(required),'browser dependency missing: '+required);
 }
 assert.ok(!files.some(file=>file.startsWith('tools/')),'server MCP toolkit must not ship to Hosting');
 assert.ok(!files.includes('ZUM_CORE.config'),'internal configuration must not ship');
 assert.ok(!files.some(file=>/(^|\/)test-[^/]*\.js$/.test(file)),'development test entrypoint must not ship');
 const unsafe=[];
 for(const file of files.filter(file=>/\.(?:js|cjs|mjs)$/.test(file))){
  const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  if(/\bfrom\s*['"]node:|\b(?:require|import)\s*\(\s*['"](?:node:|fs['"]|child_process['"]|http['"]|https['"]|net['"]|os['"]|worker_threads['"])/.test(source)){
   unsafe.push(file);
  }
 }
 assert.deepEqual(unsafe,[],'Node-only sources leaked into public upload manifest');
});

test('FixGo hosting sends minimal safe response headers without breaking JS and OAuth popups',()=>{
 const common=hosting.headers.find(x=>x.source==='**');
 assert.ok(common);
 const headers=Object.fromEntries(common.headers.map(h=>[h.key,h.value]));
 assert.equal(headers['X-Content-Type-Options'],'nosniff');
 assert.equal(headers['Referrer-Policy'],'strict-origin-when-cross-origin');
 assert.equal(headers['Content-Security-Policy'],undefined,
  'CSP cannot be invented without auditing existing inline and third-party frontend code');
 assert.ok(hosting.headers.some(x=>x.source==='**/*.html'));
});
