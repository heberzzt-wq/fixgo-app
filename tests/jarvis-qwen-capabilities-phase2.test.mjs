import test from 'node:test';import assert from 'node:assert/strict';
import {generalObjectives,verifyGeneralMission} from '../modules/terminal/qwen-general-evidence.js';
import {groundGeneralCatalog} from '../modules/terminal/qwen-general-pilot.js';
import {createLocalQwenActionSelector} from '../jarvis-qwen-local-action.js';
test('inventory certification requires live health and individual structured statuses',async()=>{
 const instruction='Consulta system.capabilities',objectives=generalObjectives(instruction);
 const receipt={name:'system.capabilities',ok:true,observation:{ok:true,totalTools:1,workstation:{ok:false},inventory:[{name:'example.read',registered:true,executionStatus:'ELIGIBLE_UNVERIFIED',physicallyVerified:false}]}};
 const verify=()=>verifyGeneralMission({instruction,objectives,receipts:[receipt],proposedReport:'One registered tool, execution unverified.'});
 assert.equal((await verify()).ok,false);receipt.observation.workstation.ok=true;assert.equal((await verify()).ok,true);
 receipt.observation.inventory[0].physicallyVerified=true;assert.equal((await verify()).ok,false);
});
test('completed no-argument capability call leaves report generation, never a repeated call',async()=>{
 const receipt={name:'system.capabilities',ok:true,observation:{ok:true,workstation:{ok:true}}};
 const tools=groundGeneralCatalog([{name:'system.capabilities',inputSchema:{type:'object',properties:{}}}],[receipt]);assert.deepEqual(tools,[]);
 let schema;
 const select=createLocalQwenActionSelector({fetchImpl:async(_url,request)=>{schema=JSON.parse(request.body).format;return {ok:true,json:async()=>({message:{content:JSON.stringify({action:'FINISH',name:'',args:{},report:'Inventory received; tools not certified.'})},prompt_eval_count:1,eval_count:1})};}});
 const result=await select({instruction:'Inventory',tools,observations:[receipt],evidenceSummary:{finishEligible:true}});
 assert.ok(result);assert.equal(schema.anyOf.length,1);assert.equal(schema.anyOf[0].properties.action.const,'FINISH');
});
test('advertising missions begin with the existing material and research prerequisite',()=>{
 for(const text of ['TikTok publicitario ficticio','Campaña publicitaria completa']){
  assert.equal(generalObjectives(text).advertising,true);
  assert.equal(generalObjectives(text).unsupported,true);
 }
 const catalog=[{name:'advertising.research'},{name:'page.create'},{name:'system.capabilities'}];
 assert.deepEqual(groundGeneralCatalog(catalog,[]).map(t=>t.name),['advertising.research']);
});
