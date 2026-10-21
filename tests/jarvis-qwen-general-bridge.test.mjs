import test from 'node:test';import assert from 'node:assert/strict';
import {createQwenAuthenticatedToolBridge} from '../jarvis-qwen-tool-bridge.js';
import {createGeneralToolPolicy} from '../jarvis-qwen-general-policy.js';
test('artifact extension reuses ToolsBridge and keeps general repository/database writes disabled',async()=>{
 const policy=createGeneralToolPolicy({location:{protocol:'http:',hostname:'localhost',port:'5000',search:'?qwenPilot=general-v1'},missionId:'general-12345678'});
 const calls=[],page={name:'page.create',mutates:true,userArtifact:true,requiresApproval:false};
 const identity={ok:true,principalId:'owner',tenantId:'tenant',role:'admin'};
 const adapter=createQwenAuthenticatedToolBridge({toolRuntime:{list:()=>[page,{name:'repo.write',mutates:true}]},hostToolPolicy:policy,
  toolsBridge:{executeMany:async(c,ctx)=>{calls.push({c,ctx});return [{ok:true,output:c[0].args.output}];}},sessionContext:{},
  validateAuthenticatedContext:async()=>identity,verifyObjectives:async()=>({ok:false})});
 const call={name:'page.create',args:{output:policy.artifactRoot+'test.html'}};
 const authorization=await adapter.authorize({call});
 const result=await adapter.execute(call,{authorization,instruction:'Create demo',receipts:[]});
 assert.equal(result.ok,true);assert.equal(calls.length,1);
 assert.equal(calls[0].ctx.writeAllowed,false);assert.equal(calls[0].ctx.writeAuthorization,false);
 assert.equal(calls[0].ctx.userId,'owner');assert.equal(calls[0].c[0].approved,false);
 assert.equal(result.url,policy.preview(call.args.output));
 assert.equal((await adapter.authorize({call:{name:'repo.write',args:{}}})).ok,false);
 assert.equal((await adapter.authorize({call:{...call,args:{...call.args,approved:true}}})).ok,false);
 identity.tenantId='other';
 assert.equal((await adapter.execute(call,{authorization,instruction:'Create demo'})).ok,false);
 assert.equal(calls.length,1);
});
import {runQwenAuthorizedCycle} from '../jarvis-qwen-direct-cycle.js';
test('general pilot feeds independent missing goals back without weakening completion',async()=>{
 const actions=[{toolCall:{name:'read',args:{id:'one'}}},{finish:true,report:'premature'},{toolCall:{name:'read',args:{id:'two'}}},{finish:true,report:'two receipts'}];
 let feedback=false;
 const result=await runQwenAuthorizedCycle({instruction:'Read two',catalog:[{name:'read',inputSchema:{type:'object',properties:{id:{type:'string'}}}}],repairIncomplete:true,maximumSteps:5,
 selectNextAction:async({missionLedger})=>{if(missionLedger.certificationFailures?.length)feedback=true;return actions.shift();},authorize:async()=>({ok:true}),execute:async()=>({ok:true}),verifyCompletion:async({receipts})=>({ok:receipts.length===2,reason:'SECOND_RECEIPT_REQUIRED',objectives:[{satisfied:receipts.length===2}]})});
 assert.equal(result.status,'SUCCESS');assert.equal(result.receipts.length,2);assert.equal(feedback,true);
});
import {generalToolCatalog} from '../modules/terminal/qwen-general-pilot.js';
test('general browser schemas require explicit URL and never expose viewport replay for remote inspection',()=>{
 const policy=createGeneralToolPolicy({location:{protocol:'http:',hostname:'localhost',port:'5000',search:'?qwenPilot=general-v1'},missionId:'general-12345678'});
 const tools=generalToolCatalog({list:()=>[{name:'browser.inspect',inputSchema:{url:'string',viewports:'array'}},{name:'browser.screenshot',requiresApproval:true,inputSchema:{output:'string'}}]},policy,{research:true,page:true});
 for(const t of tools){assert.ok(t.inputSchema.required.includes('url'));assert.equal(t.inputSchema.properties.url.type,'string');assert.equal(t.inputSchema.properties.viewports,undefined);}
 assert.equal(tools.length,2);
});
import {groundGeneralCatalog,compactGeneralObservation} from '../modules/terminal/qwen-general-pilot.js';
test('query catalog waits for observed collection and filter field; compaction retains schema but no source body',()=>{
 const catalog=[{name:'platform.query',inputSchema:{properties:{}}},{name:'repo.read',inputSchema:{properties:{}}}];
 const receipt={ok:true,name:'repo.read',observation:{ok:true,verifiedRead:{file:'app.js',content:'huge source',sourceStructure:{dataBindings:{collections:['users'],writeShapes:[{collection:'users',fields:['name'],content:'huge write source'}]}}}}};
 assert.equal(groundGeneralCatalog(catalog,[receipt]).some(t=>t.name==='platform.query'),false);
 receipt.observation.verifiedRead.sourceStructure.dataBindings.writeShapes[0].fields.push('rol');
 assert.deepEqual(groundGeneralCatalog(catalog,[receipt])[0].inputSchema.properties.sourceFile.enum,['app.js']);
 assert.equal(JSON.stringify(compactGeneralObservation(receipt.observation)).includes('huge'),false);
});
import {createLocalQwenActionSelector} from '../jarvis-qwen-local-action.js';
test('missing physical deliverables remove FINISH from local model grammar without executing a tool',async()=>{
 const select=createLocalQwenActionSelector({fetchImpl:async(_url,options)=>{const body=JSON.parse(options.body);assert.ok(body.format.anyOf.every(x=>x.properties.action.const==='CALL'));return {ok:true,json:async()=>({message:{content:JSON.stringify({action:'CALL',name:'document.create',args:{},report:''})}})};}});
 const result=await select({instruction:'Export a verified file',tools:[{name:'document.create',inputSchema:{type:'object',properties:{}}}],evidenceSummary:{finishEligible:false}});
 assert.equal(result.toolCall.name,'document.create');
});
import {generalFailureReason} from '../modules/terminal/qwen-general-pilot.js';
test('terminal preserves a concrete nested bridge failure instead of FAILED',()=>{
 assert.equal(generalFailureReason({receipts:[{ok:false,observation:{status:'ERROR',error:{code:'FAILED',message:'JARVIS_LOCAL_BRIDGE_INVALID_JSON_404',context:{runtimeResult:{error:'JARVIS_LOCAL_BRIDGE_INVALID_JSON_404'}}}}}]}),'JARVIS_LOCAL_BRIDGE_INVALID_JSON_404');
});
