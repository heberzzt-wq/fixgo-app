import test from 'node:test';
import assert from 'node:assert/strict';
import planner from '../functions/jarvis-semantic-planner.js';
import {shouldCompleteJarvisPlanningArguments} from '../gestia-core/jarvis/jarvis.multifunction.planner.js';

const schema={type:'object',additionalProperties:false,properties:{
 target:{type:'string',default:'',description:'OMITIR para el repositorio activo'},
 refresh:{type:'boolean'}
}};
const tool={name:'repo.audit',investigationReadOnly:true,mutates:false,requiresApproval:false,
 evidenceKinds:['repository_inventory'],inputSchema:schema};
const selected={name:'repo.audit',args:{},deferred:true,reason:'Inventario del repositorio activo'};

test('deferred Qwen-selected repo.audit with no required args does not call second semantic planner',()=>{
 assert.equal(shouldCompleteJarvisPlanningArguments(selected,tool,[]),false);
 assert.equal(shouldCompleteJarvisPlanningArguments({...selected,deferred:false},tool,[]),false);
 assert.equal(shouldCompleteJarvisPlanningArguments(selected,{...tool,inputSchema:{...schema,required:[]}},[]),false);
});

test('different or unsafe tools retain normal second-stage argument validation',()=>{
 const cases=[
  [selected,{...tool,inputSchema:{...schema,required:['target']}}],
  [selected,{...tool,mutates:true}],
  [selected,{...tool,requiresApproval:true}],
  [selected,{...tool,userArtifact:true}],
  [selected,{...tool,investigationReadOnly:false}],
  [selected,{...tool,inputSchema:{...schema,properties:{target:{type:'string'},another:{type:'string'}}}}],
  [selected,{...tool,inputSchema:{...schema,anyOf:[{properties:{target:{type:'string'}},required:['target']} ]}}],
  [{...selected,name:'repo.read'},{...tool,name:'repo.read'}],
  [{...selected,args:{target:'externally-named-repo'}},tool]
 ];
 for(const [call,registered] of cases){
  assert.equal(shouldCompleteJarvisPlanningArguments(call,registered,[]),true,
   JSON.stringify({call,registered}));
 }
});

test('the planner must not label a host shortcut as an authenticated Qwen inference',async()=>{
 let calls=0;
 const out=await planner.runJarvisSemanticPlanner({
  input:'Ejecuta repo.audit sobre el repositorio activo, únicamente en modo lectura.',
  catalog:[tool],missionState:{phase:'GROUNDED_ARGUMENT_COMPLETION'},
  ai:{models:{generateContent:async()=>{calls++;return{text:JSON.stringify({
   toolCalls:[{name:'repo.audit',args:{}}],missionComplete:false
  })};}}}
 });
 assert.equal(calls,1);
 assert.deepEqual(out.toolCalls.map(x=>x.args),[{}]);
 assert.notEqual(out.provider,'host-schema-default-after-qwen-selection');
});

test('native production audit schema is optional, and selected empty arguments remain executable',()=>{
 assert.equal(schema.required,undefined);
 assert.equal(schema.additionalProperties,false);
 assert.deepEqual(Object.keys(schema.properties).sort(),['refresh','target']);
 assert.equal(shouldCompleteJarvisPlanningArguments(selected,tool,[{name:'repo.search',observation:{ok:true}}]),false);
});
