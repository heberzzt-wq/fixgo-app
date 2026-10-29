import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JARVIS_PRIVATE_RELAY} from '../gestia-core/jarvis/jarvis.semantic.transport.js';
import {compactGitPlannerEvidence} from '../gestia-core/jarvis/jarvis.mission.planner-state.js';
const tools=readFileSync(new URL('../gestia-core/tools.runtime.js',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../jarvis-fs-bridge.js',import.meta.url),'utf8');
const begin=tools.indexOf('const JarvisGitWorkflowBridge =');
const match=/window\.JarvisGitWorkflowBridge\s*=\s*JarvisGitWorkflowBridge;/.exec(tools.slice(begin));
assert.ok(begin>=0&&match);
const end=begin+match.index+match[0].length;
const source=tools.slice(begin,end);
function client(host='fixgo-44e4d.web.app',protocol='https:'){
 const calls=[];
 const window={location:{hostname:host,protocol},
   JarvisLocalBridge:{requestJson:async(route,payload,options)=>{
    calls.push({route,payload,options});
    return {ok:true,status:'GIT_STATUS_OK',stdout:'## v142-official\\n',readOnly:true};
   }}};
 vm.runInNewContext(source,{window});
 return {request:window.JarvisGitWorkflowBridge.request,calls};
}
test('verified mobile HEAD is carried through the bounded status evidence, never inferred',()=>{
 const sha='a'.repeat(40);
 const receipt=compactGitPlannerEvidence({tool:'repo.gitStatus',ok:true,status:'GIT_STATUS_OK',
   stdout:'## v142-official\n',branchLine:'## v142-official',changedFiles:[],headSha:sha});
 assert.equal(receipt.kind,'git_worktree');
 assert.equal(receipt.headSha,sha);
 assert.equal(receipt.totalFiles,0);
 const missing=compactGitPlannerEvidence({tool:'repo.gitStatus',ok:true,status:'GIT_STATUS_OK',
   stdout:'## v142-official\n',branchLine:'## v142-official',headSha:'unknown'});
 assert.equal(Object.hasOwn(missing,'headSha'),false);
 assert.equal(compactGitPlannerEvidence({tool:'repo.gitStatus',ok:false,status:'GIT_STATUS_FAILED',headSha:sha}),null);
});
test('mobile git status uses only the existing owner-relay read-only route',async()=>{
 assert.ok(JARVIS_PRIVATE_RELAY.routes.includes('/repo/graph'));
 assert.equal(JARVIS_PRIVATE_RELAY.routes.includes('/git'),false);
 const a=client();
 const receipt=await a.request({action:'status',cwd:'.',timeoutMs:120000});
 assert.equal(receipt.status,'GIT_STATUS_OK');
 assert.equal(a.calls.length,1);
 assert.equal(a.calls[0].route,'/repo/graph');
 assert.equal(a.calls[0].payload.source,'repo_git_status_mobile_readonly_v142');
 assert.deepEqual(Object.keys(a.calls[0].payload),['source']);
 assert.equal(a.calls[0].options.timeoutMs,15000);
});
test('mobile git writes, unauthorized folders and arbitrary Git actions stay blocked',async()=>{
 const a=client();
 for(const action of ['push','commit','diff','history','checkout','reset','status --porcelain']){
  await assert.rejects(a.request({action,cwd:'.'}),/JARVIS_RELAY_LOCAL_OPERATION_REQUIRED/);
 }
 await assert.rejects(a.request({action:'status',cwd:'..'}),/JARVIS_RELAY_LOCAL_OPERATION_REQUIRED/);
 assert.equal(a.calls.length,0);
});
test('desktop Git workflow keeps its original route, not the mobile shortcut',async()=>{
 const a=client('127.0.0.1','http:');
 await a.request({action:'status',cwd:'.'});
 assert.equal(a.calls.length,1);
 assert.equal(a.calls[0].route,'/git');
});
test('bridge Git status envelope pins read-only arguments and refuses extra fields',()=>{
 const start=bridge.indexOf('if (req.body?.source === "repo_git_status_mobile_readonly_v142")');
 const end=bridge.indexOf('const maxFiles =',start);
 assert.ok(start>=0&&end>start);
 const body=bridge.slice(start,end);
 assert.match(body,/Object\.keys\(req\.body\)\.some\(key => key !== "source"\)/);
 assert.match(body,/args:\["status","--short","--branch"\],cwd:"\.",timeoutMs:10000,root/);
 assert.match(body,/args:\["rev-parse","HEAD"\],cwd:"\.",timeoutMs:10000,root/);
 assert.match(body,/headVerified/);
 assert.match(body,/headSha/);
 assert.match(body,/GIT_STATUS_HEAD_UNVERIFIED/);
 assert.doesNotMatch(body,/args:\["(?:push|commit|reset|checkout)"/);
 assert.match(body,/readOnly:true/);
});
