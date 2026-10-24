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
  'jarvis-qwen-decision-http.js','jarvis-qwen-local-action.js',
  'jarvis-qwen-context-policy.js','jarvis-qwen-evidence-pages.js',
  'jarvis-qwen-evidence-checkpoint.js','jarvis-repo-intelligence.js',
  'jarvis-local-video-engine.js',
  'fixgo-core-backend.js','firebase-shim.js','firebase-node-adapter.js',
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
  if(/\bfrom\s*['"](?:node:|firebase-admin(?:\/|['"])|stripe['"])|\b(?:require|import)\s*\(\s*['"](?:node:|fs['"]|child_process['"]|http['"]|https['"]|net['"]|os['"]|worker_threads['"])/.test(source)){
   unsafe.push(file);
  }
 }
 assert.deepEqual(unsafe,[],'Node-only sources leaked into public upload manifest');
});

test('published browser modules and HTML scripts have no missing local dependencies',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 const require=createRequire(import.meta.url);
 const {sync:listFiles}=require('glob');
 const {parse}=require('acorn');
 const files=listFiles('**/*',{cwd:root,dot:true,follow:true,nodir:true,posix:true,
  ignore:['**/firebase-debug.log','**/firebase-debug.*.log','.firebase/*',...hosting.ignore]});
 const included=new Set(files), missing=[], bare=[];
 const origin='https://fixgo-44e4d.web.app/';
 const check=(file,value,kind)=>{
  if(typeof value!=='string'||/^(?:https?:|\/\/|data:)/i.test(value))return;
  if(!value.startsWith('/')&&!value.startsWith('.')){
   bare.push({file,kind,value});
   return;
  }
  const url=new URL(value,new URL('/'+file,origin));
  if(url.origin!==new URL(origin).origin)return;
  const resolved=decodeURIComponent(url.pathname.slice(1));
  if(/\.(?:js|mjs|cjs|css|json)$/.test(resolved)&&!included.has(resolved)){
   missing.push({file,kind,imported:resolved});
  }
 };
 for(const file of files.filter(f=>/\.(?:js|mjs|cjs)$/.test(f))){
  const ast=parse(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),
   {sourceType:'module',ecmaVersion:'latest',allowHashBang:true});
  function visit(node){
   if(!node||typeof node!=='object')return;
   if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)&&node.source){
    check(file,node.source.value,node.type);
   }
   if(node.type==='ImportExpression'&&node.source?.type==='Literal'){
    check(file,node.source.value,node.type);
   }
   for(const [key,value] of Object.entries(node)){
    if(key==='start'||key==='end')continue;
    if(Array.isArray(value)){for(const part of value)if(part?.type)visit(part)}
    else if(value?.type)visit(value);
   }
  }
  visit(ast);
 }
 for(const file of files.filter(f=>f.endsWith('.html'))){
  const html=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  for(const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)){
   const value=match[1];
   check(file,!value.startsWith('/')&&!value.startsWith('.')&&!/^(?:https?:|\/\/)/i.test(value)?'./'+value:value,'HTML_SCRIPT');
  }
 }
 assert.deepEqual(bare,[],'a bare package import would fail in unbundled public JavaScript');
 assert.deepEqual(missing,[],'Hosting would omit an imported browser module or script');
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
