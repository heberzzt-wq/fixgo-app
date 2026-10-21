import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOfferedArguments} from '../jarvis-qwen-argument-schema.js';
import {runQwenAuthorizedCycle} from '../jarvis-qwen-direct-cycle.js';
const schema={type:'object',required:['sourceOutput','composition','variants'],additionalProperties:false,
 properties:{sourceOutput:{type:'string'},composition:{type:'object'},variants:{type:'array'}},
 anyOf:[{properties:{sourceOutput:{type:'string',const:'library:stock1'},
 composition:{type:'object',required:['brandName','contact','headline'],additionalProperties:false,
 properties:{brandName:{const:'Summit Consulting Group'},contact:{enum:['','www.summ.com.mx']},headline:{const:'Summit. Asesoría fiscal y legal.'}}},
 variants:{type:'array',minItems:1,items:{type:'object',required:['id','width','height','mimeType'],additionalProperties:false,
 properties:{id:{pattern:'^w[0-9]+-h[0-9]+$'},width:{const:1080},height:{const:1080},mimeType:{const:'image/png'}}}}}}]};
const good={sourceOutput:'library:stock1',
 composition:{brandName:'Summit Consulting Group',contact:'www.summ.com.mx',
 headline:'Summit. Asesoría fiscal y legal.'},
 variants:[{id:'w1080-h1080',width:1080,height:1080,mimeType:'image/png'}]};
test('actual offered schema checks nested brand/contact, variants and strict extra fields',()=>{
 assert.equal(validateOfferedArguments(schema,good),null);
 const withValue=v=>({...good,composition:{...good.composition,...v}});
 assert.equal(validateOfferedArguments(schema,withValue({contact:'info@summit.com.mx'})),
  'ARGUMENT_OUTSIDE_SCHEMA:composition.contact');
 assert.equal(validateOfferedArguments(schema,withValue({headline:'Guía de marketing jurídico'})),
  'ARGUMENT_OUTSIDE_SCHEMA:composition.headline');
 assert.equal(validateOfferedArguments(schema,{...good,sourceOutput:'other'}),
  'ARGUMENT_OUTSIDE_SCHEMA:sourceOutput');
 assert.equal(validateOfferedArguments(schema,{...good,variants:[{...good.variants[0],width:1200}]}),
  'ARGUMENT_OUTSIDE_SCHEMA:variants.0.width');
 assert.equal(validateOfferedArguments(schema,withValue({role:'admin'})),
  'ARGUMENT_UNDECLARED:composition.role');
});
test('model invented contact is rejected before authorization and no tool executes',async()=>{
 let called=0,executed=0;
 const r=await runQwenAuthorizedCycle({
  instruction:'Summit campaign',catalog:[{name:'image.adapt',inputSchema:schema}],
  maximumSteps:1,selectNextAction:async()=>({toolCall:{name:'image.adapt',args:{...good,
   composition:{...good.composition,contact:'info@summit.com.mx'}}}}),
  authorize:async()=>{called++;return {ok:true};},
  execute:async()=>{executed++;return {ok:true};},
  verifyCompletion:async()=>({ok:false})
 });
 assert.equal(called,0);assert.equal(executed,0);
 assert.equal(r.reason,'ARGUMENT_OUTSIDE_SCHEMA:composition.contact');
});
test('one bounded invalid-argument retry can recover without recording fake executed receipts',async()=>{
 let i=0,authorized=0,executed=0;
 const r=await runQwenAuthorizedCycle({
  instruction:'Summit campaign',catalog:[{name:'image.adapt',inputSchema:schema}],
  maximumSteps:3,repairIncomplete:true,
  catalogForEvidence:c=>c,
  selectNextAction:async({missionLedger})=>{
   i++;if(i===2)assert.equal(missionLedger.rejectedToolChoices[0].reason,'SCHEMA_ARGUMENT:ARGUMENT_OUTSIDE_SCHEMA:composition.contact');
   return i===1?{toolCall:{name:'image.adapt',args:{...good,composition:{...good.composition,contact:'info@summit.com.mx'}}}}:
    i===2?{toolCall:{name:'image.adapt',args:good}}:{finish:true,report:'Rendered valid artifact'};
  },
  authorize:async()=>{authorized++;return {ok:true};},
  execute:async()=>{executed++;return {ok:true};},
  summarizeEvidence:rs=>({finishEligible:rs.length>0}),
  verifyCompletion:async({receipts})=>({ok:receipts.length===1&&receipts[0].ok})
 });
 assert.equal(r.status,'SUCCESS');assert.equal(i,3);assert.equal(authorized,1);
 assert.equal(executed,1);assert.equal(r.receipts.length,1);
});
