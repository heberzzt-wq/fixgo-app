const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../scripts/jarvis-workstation-start.cjs'),'utf8');
function preflight({dirty=false,branch='v142-official',remote='https://github.com/heberzzt-wq/fixgo-app.git',resolvedRemote=remote,remoteHead='a'.repeat(40),cachedHead='a'.repeat(40),base=remoteHead,rebase=false,model='qwen3.5:9b',gitStatus=0,args=['--maintenance','--preflight']}={}){
 const calls=[],logs=[],exit=Error('TEST_EXIT');let code;
 const context={console:{log:x=>logs.push(x),warn:()=>{}},process:{argv:['node','entry',...args],env:{},platform:'win32',exit:n=>{code=n;throw exit;}},
  require:name=>name==='child_process'?{spawnSync:(_exe,args)=>{calls.push(args);return {status:gitStatus,stdout:args[0]==='status'?(dirty?' M functions/a.js':''):args[0]==='config'?remote:args[0]==='remote'?resolvedRemote:args[0]==='ls-remote'?remoteHead+'\trefs/heads/v142-official':args[0]==='merge-base'?base:args.includes('--abbrev-ref')?branch:args.includes('refs/remotes/origin/v142-official')?cachedHead:'a'.repeat(40)};}}:
   name==='fs'?{readFileSync:file=>file==='jarvis-runtime-contract.json'?JSON.stringify({repository:'heberzzt-wq/fixgo-app',branch:'v142-official',semanticModel:model,inferencePolicy:'LOCAL_ONLY'}):'JARVIS_FS_BRIDGE_VERSION="2.64.0-semantic-progress-deadline-v142"',existsSync:file=>file.includes('rebase')?rebase:false}:{} };
 let error;try{vm.runInNewContext(source.slice(0,source.indexOf('Promise.all([import(')),context);}catch(e){if(e!==exit)error=e;}
 return {calls,logs,code,error};
}
test('maintenance preflight validates identity and clean state without fetch/rebase or starting services',()=>{
 const r=preflight();assert.equal(r.error,undefined);assert.equal(r.code,0);
 assert.ok(r.logs.some(line=>line.includes('JARVIS_MAINTENANCE_PREFLIGHT_OK')));
 assert.ok(r.calls.every(args=>['status','rev-parse','config','remote','ls-remote','merge-base'].includes(args[0])));
});
test('maintenance preflight rejects redirected remote, unknown remote SHA and non-descendant',()=>{
 for(const [input,code] of [[{resolvedRemote:'file:///fake.git'},'REMOTE_INVALID'],[{remoteHead:'unknown'},'REMOTE_UNVERIFIED'],[{base:'b'.repeat(40)},'NOT_REMOTE_DESCENDANT']]){
  const r=preflight(input);assert.match(r.error?.message||'',new RegExp(code));
  assert.ok(r.calls.every(args=>!['fetch','push','rebase'].includes(args[0])));
 }
});
test('maintenance preserves dirty, branch, repository, rebase and model rejection gates',()=>{
 for(const [input,code] of [[{dirty:true},'WORKTREE_DIRTY'],[{gitStatus:1},'WORKTREE_DIRTY'],[{branch:'other'},'MAINTENANCE_IDENTITY'],[{remote:'https://github.com/other/repo.git'},'MAINTENANCE_IDENTITY'],[{rebase:true},'MAINTENANCE_REBASE_ACTIVE'],[{model:'other'},'MODEL_CONTRACT_MISMATCH'],[{args:['--preflight']},'MODE_INVALID'],[{args:['--maintenance','--skip-security']},'MODE_INVALID']]){
  const r=preflight(input);assert.match(r.error?.message||'',new RegExp(code));
  assert.ok(r.calls.every(args=>['status','rev-parse','config'].includes(args[0])));
 }
});
test('ordinary startup retains synchronization and refreshes local release after matching HEAD',()=>{
 const r=preflight({args:[]});assert.equal(r.error,undefined);
 assert.ok(r.calls.some(a=>a[0]==='fetch'));assert.ok(r.calls.some(a=>a[0]==='rebase'));
 const preparation=r.calls.findIndex(a=>a[0]==='scripts/prepare-platform-release.mjs');
 assert.ok(preparation>r.calls.findIndex(a=>a.includes('refs/remotes/origin/v142-official')));
});
test('ordinary startup rejects an unpublished local HEAD before importing the publisher',()=>{
 const r=preflight({args:[],cachedHead:'b'.repeat(40)});
 assert.match(r.error?.message||'',/JARVIS_NORMAL_HEAD_NOT_REMOTE/);
});

test('maintenance startup never imports or runs the publishing worker',async()=>{
 const imports=[],calls=[],states=[];let started=0,exitCode;
 const remote='https://github.com/heberzzt-wq/fixgo-app.git',sha='a'.repeat(40);
 const refuse=()=>{const handlers={};const socket={on:(name,fn)=>{handlers[name]=fn;return socket;},once:(name,fn)=>{handlers[name]=fn;return socket;},setTimeout:()=>socket,destroy:()=>{}};queueMicrotask(()=>handlers.error?.({code:'ECONNREFUSED'}));return socket;};
 const context={console:{log:()=>{},warn:()=>{},error:()=>{}},setTimeout,setInterval:()=>assert.fail('publisher interval'),
  process:{argv:['node','entry','--maintenance'],env:{},platform:'win32',exit:n=>{exitCode=n;}},
  require:name=>name==='child_process'?{spawnSync:(_exe,args)=>{calls.push(args);return {status:0,stdout:args[0]==='status'?'':args[0]==='config'||args[0]==='remote'?remote:args[0]==='ls-remote'?sha+'\trefs/heads/v142-official':args.includes('--abbrev-ref')?'v142-official':sha};}}:
   name==='fs'?{readFileSync:file=>file==='jarvis-runtime-contract.json'?JSON.stringify({repository:'heberzzt-wq/fixgo-app',branch:'v142-official',semanticModel:'qwen3.5:9b',inferencePolicy:'LOCAL_ONLY'}):'JARVIS_FS_BRIDGE_VERSION="2.64.0-semantic-progress-deadline-v142"',existsSync:()=>false}:
   name==='http'?{get:refuse}:{connect:refuse},
  load:async name=>{imports.push(name);assert.equal(name,'../jarvis-upload-bridge.js');return {
   warmJarvisLocalModel:()=>assert.fail('unrequested inference'),markJarvisWorkstationRuntime:s=>states.push(s),
   startJarvisUploadBridge:({maintenanceIdentity})=>{started++;assert.equal(maintenanceIdentity.localHead,sha);assert.equal(maintenanceIdentity.remoteHead,sha);return {listening:true};}};}
 };
 await vm.runInNewContext(source.replace(/\bimport\(/g,'load('),context);
 assert.equal(exitCode,undefined);assert.equal(started,1);assert.equal(imports.length,1);
 assert.equal(states.at(-1).workerStarted,false);assert.equal(states.at(-1).gitSyncEnabled,false);
 assert.equal(states.at(-1).remoteWorkerEnabled,false);
 assert.ok(calls.every(args=>!['fetch','push','rebase'].includes(args[0])));
});
