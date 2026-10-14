"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {qualifyRecordObjectiveCoverage:qualify,eligibleEvidenceActionCatalog}=require('../functions/jarvis-semantic-planner');

function fixture(){
 const template='workspaces/{workspaceId}/entries',resolved='workspaces/alpha/entries',file='registry.js';
 const tasks=[{name:'repo.read',observation:{ok:true,verifiedRead:{file,sourceStructure:{dataBindings:{collections:[template]}}}}},
  {name:'platform.query',args:{sourceFile:file,collection:template},observation:{ok:true,recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,
   scope:{sourceFile:file,collection:resolved,mode:'query',fields:['kind'],filters:[],orderBy:[{field:'__name__',direction:'asc'}]},
   totalCount:1,returnedCount:1,rows:[{id:'a',values:{kind:'entry'}}],hasMore:false,queryExhausted:true,completeForQuery:true}}}];
 const contract={objective:'Count entries',requestQuote:'Count entries',coverageMode:'population',scope:'all_sources',groups:['entries']};
 const objective={objective:contract.objective,evidenceTaskIndexes:[1],coverageProof:{proven:true,missing:[],groups:[{group:'entries',proven:true,evidence:[{taskIndex:1,fields:['kind']}]}],
  sources:[template,resolved].map(collection=>({collection,relevant:true,reason:'Authenticated query of this exact source',taskIndexes:[1]}))}};
 return {tasks,contract,objective,template,resolved};
}

test('coverage recognizes only a template actually resolved by its cited authenticated query',()=>{
 const f=fixture();
 assert.equal(qualify(f.objective,f.contract,f.tasks).status,'complete');
 for(const change of [
  x=>{x.tasks[1].args.collection='workspaces/beta/entries';},
  x=>{x.tasks[1].args.sourceFile='different.js';},
  x=>{x.tasks[1].observation.recordEvidence.scope.collection='other/alpha/entries';}
 ]){const x=fixture();change(x);assert.equal(qualify(x.objective,x.contract,x.tasks).status,'partial');}
});

test('resolving one template does not cover another observed instance or credit an exhausted query as a goal',()=>{
 const f=fixture();
 f.tasks[0].observation.verifiedRead.sourceStructure.dataBindings.collections.push('workspaces/beta/entries');
 f.tasks.push({...structuredClone(f.tasks[1]),args:{sourceFile:'registry.js',collection:'workspaces/beta/entries'},observation:{ok:true,recordEvidence:{...structuredClone(f.tasks[1].observation.recordEvidence),scope:{...f.tasks[1].observation.recordEvidence.scope,collection:'workspaces/beta/entries'}}}});
 assert.equal(qualify(f.objective,f.contract,f.tasks).status,'partial');
 const empty=fixture();empty.tasks[1].observation.recordEvidence.rows=[];empty.tasks[1].observation.recordEvidence.returnedCount=0;empty.tasks[1].observation.recordEvidence.totalCount=0;
 empty.objective.coverageProof.proven=false;empty.objective.coverageProof.groups[0].proven=false;
 assert.equal(qualify(empty.objective,empty.contract,empty.tasks).status,'partial');
});

test('engine-reviewed irrelevance removes a query only when every objective excludes its route',()=>{
 const tool={name:'platform.query',evidenceKinds:['platform_records'],inputSchema:{type:'object',properties:{sourceFile:{type:'string',enum:['registry.js']},collection:{type:'string',enum:['entries','accounts']}},required:['sourceFile','collection']}};
 const read={name:'repo.read',evidenceKinds:['repository_source'],inputSchema:{type:'object',properties:{file:{type:'string',enum:['next.js']}}}};
 const tasks=[{name:'platform.query',args:{collection:'accounts'},observation:{ok:true,recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{collection:'accounts'},rows:[{id:'a',values:{label:'A'}}]}}}];
 const proof={sources:[{collection:'accounts',relevant:false,reason:'Not a source for this objective'}]};
 const allowed=proofs=>eligibleEvidenceActionCatalog([tool,read],tasks,[],[tool,read],proofs);
 assert.deepEqual(allowed([proof,structuredClone(proof)])[0].inputSchema.properties.collection.enum,['entries']);
 assert.equal(allowed([proof,structuredClone(proof)])[1].name,'repo.read');
 for(const other of [{sources:[]},{sources:[{collection:'accounts',relevant:null,reason:'Unknown'}]},{sources:[{collection:'accounts',relevant:true,reason:'Needed'}]}])
  assert.deepEqual(allowed([proof,other])[0].inputSchema.properties.collection.enum,['entries','accounts']);
 assert.deepEqual(allowed([])[0].inputSchema.properties.collection.enum,['entries','accounts']);
});
