import test from 'node:test';
import assert from 'node:assert/strict';
import planner from '../functions/jarvis-semantic-planner.js';
import {completeJarvisPlanningArguments} from '../gestia-core/jarvis/jarvis.multifunction.planner.js';

const instruction='Ejecuta repo.audit sobre el repositorio activo, únicamente en modo lectura. Entrega el total de archivos y las primeras diez rutas.';
const schema={type:'object',additionalProperties:false,properties:{
 target:{type:'string',default:'',description:'OMITIR para auditar el repositorio activo'},
 refresh:{type:'boolean'}
}};

test('production handoff binds optional active repo audit arguments without a fake second Qwen inference',async()=>{
 let modelCalls=0;
 const actual=await completeJarvisPlanningArguments({
  toolName:'repo.audit',instruction,operation:'inventariar el repositorio activo',inputSchema:schema,
  semanticPlanner:async()=>{modelCalls++;throw Error('UNNECESSARY_MODEL_CALL');}
 });
 assert.deepEqual(actual.args,{});
 assert.equal(actual.status,'GROUNDED_ARGUMENTS_READY');
 assert.equal(actual.model,null);
 assert.equal(actual.provider,'registered-optional-schema-after-tool-selection');
 assert.equal(modelCalls,0);
});

test('external repository and nonoptional contracts still use the semantic grounded-argument provider',async()=>{
 for(const variant of [
  {toolName:'repo.audit',instruction:'Ejecuta repo.audit sobre el repositorio activo https://example.org/another',inputSchema:schema},
  {toolName:'repo.audit',instruction:'Ejecuta repo.audit sobre otro repositorio activo',inputSchema:schema},
  {toolName:'repo.audit',instruction,inputSchema:{...schema,required:['target']}},
  {toolName:'repo.read',instruction,inputSchema:schema},
  {toolName:'repo.audit',instruction,inputSchema:{...schema,properties:{target:{type:'string'},requiredSource:{type:'string'}}}}
 ]){
  let calls=0;
  const actual=await completeJarvisPlanningArguments({...variant,operation:'verify requested repository target',
   semanticPlanner:async()=>{calls++;return{toolCalls:[{name:variant.toolName,args:{target:'observed-other-repository'}}],missionComplete:false};}
  });
  assert.equal(calls,1);
  assert.equal(actual.args.target,'observed-other-repository');
 }
});

test('even with active checkout, prior validation failure is not bypassed',async()=>{
 let calls=0;
 const result=await completeJarvisPlanningArguments({toolName:'repo.audit',instruction,inputSchema:schema,
  validationFeedback:{status:'DENIED'},semanticPlanner:async()=>{
   calls++;return{toolCalls:[{name:'repo.audit',args:{}}],missionComplete:false};
  }
 });
 assert.equal(calls,1);
 assert.deepEqual(result.args,{});
});

test('grounded argument phase without model results cannot invent an authenticated local semantic receipt',async()=>{
 const tool={name:'repo.audit',description:'Read-only audit',inputSchema:schema};
 let calls=0;
 const answer=await planner.runJarvisSemanticPlanner({input:instruction,catalog:[tool],
  missionState:{phase:'GROUNDED_ARGUMENT_COMPLETION'},
  ai:{models:{generateContent:async()=>{calls++;return{text:JSON.stringify({toolCalls:[{name:'repo.audit',args:{}}],missionComplete:false})};}}}
 });
 assert.equal(calls,1);
 assert.deepEqual(answer.toolCalls.map(x=>x.args),[{}]);
 assert.notEqual(answer.provider,'host-schema-default-after-qwen-selection');
});
