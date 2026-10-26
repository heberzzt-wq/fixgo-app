const test=require('node:test'),assert=require('node:assert/strict'),codec=require('../functions/jarvis-repository-audit-codec.cjs');
const commit={sha:'a'.repeat(40),subject:'Document recorded checks',files:['M\tdocs/platform-master-manifest-v142.json','D\tremoved.js','R100\told.js\tnew.js']};
const task={index:0,name:'repo.gitHistory',args:{limit:8},observation:{ok:true,gitEvidence:{kind:'git_committed_history',source:'LOCAL_GIT_LOG',commits:[commit]}}};
test('historical navigation is bounded provenance only and preserves literal deleted/renamed paths',()=>{
 const tasks=[task,{...task,index:1}],before=JSON.stringify(tasks);const h=codec.historicalRepositoryNavigation(tasks);
 assert.equal(h.navigationOnly,true);assert.equal(h.currentExistenceVerified,false);assert.equal(h.testsExecuted,false);assert.equal(h.operationalEvidence,false);
 assert.deepEqual(h.paths,commit.files);assert.equal(h.commits.length,1);assert.deepEqual(h.commits[0].taskIndexes,[0,1]);assert.equal(JSON.stringify(tasks),before);
 const distinct=structuredClone(task);distinct.index=2;distinct.observation.gitEvidence.commits[0].subject='Different subject';assert.equal(codec.historicalRepositoryNavigation([...tasks,distinct]).commits.length,2);
});
test('navigation excludes failed or ungrounded histories and truncates only whole entries',()=>{
 for(const mutate of [t=>t.observation.ok=false,t=>t.observation.blocked=true,t=>t.observation.executionOk=false,t=>t.index=-1,t=>t.index='0',t=>t.observation.gitEvidence.source='other',t=>t.name='repo.read']){const t=structuredClone(task);mutate(t);assert.equal(codec.historicalRepositoryNavigation([t]),null);}
 const tasks=Array.from({length:30},(_,index)=>({index,...structuredClone(task),observation:{ok:true,gitEvidence:{kind:'git_committed_history',source:'LOCAL_GIT_LOG',commits:[{...commit,sha:String(index),subject:'s'.repeat(300),files:['M\t'+String(index)+'x'.repeat(500)]}]}}}));
 const h=codec.historicalRepositoryNavigation(tasks);assert.ok(JSON.stringify(h).length<=2900);assert.ok(h.omittedCommits>0);assert.equal(h.commits.length+h.omittedCommits,30);assert.equal(h.paths.every(p=>p.endsWith('x'.repeat(500))),true);
});
function request(){const branch=s=>({properties:{objective:{enum:['Review history']},requiredEvidenceKind:{enum:['repository_search']},evidenceTaskIndexes:{type:'array',items:{enum:[0]}},satisfied:{enum:[s]}}});return {config:{chatMessages:[{role:'system',content:'OBSERVACION_EJECUTADA='+JSON.stringify(task)},{role:'user',content:'Review history'}],responseJsonSchema:{properties:{completionAssessment:{properties:{objectives:{properties:{objective_0:{anyOf:[branch(false),branch(true)]}}}}},toolCalls:{type:'array',maxItems:0}}}}};}
async function run(implementation){const requests=[];await implementation.generateRepositoryAudit({enabled:true,request:request(),ai:{models:{generateContent:async r=>{requests.push(r);return {text:r.config.semanticStage==='REPOSITORY_EVIDENCE_SELECTION'?'{"objective_0":[0]}':r.config.semanticStage==='REPOSITORY_OBJECTIVE_AUDIT'?'{"s":false,"r":[0],"l":"Incomplete"}':'{"toolCalls":[],"explanation":"Incomplete"}'};}}}});return requests;}
test('only next-action receives navigation; selector and audit receive no navigation',async()=>{
 const current=await run(codec);
 for(const req of current)if(req.config.semanticStage!=='REPOSITORY_AUDIT_NEXT_ACTION')assert.equal(req.config.chatMessages.some(m=>m.content.startsWith('HISTORICAL_REPOSITORY_NAVIGATION=')),false);
 const next=current.find(r=>r.config.semanticStage==='REPOSITORY_AUDIT_NEXT_ACTION');
 const hint=next.config.chatMessages.filter(m=>m.content.startsWith('HISTORICAL_REPOSITORY_NAVIGATION='));assert.equal(hint.length,1);assert.ok(hint[0].content.includes('platform-master-manifest-v142.json'));assert.deepEqual(next.config.responseJsonSchema.properties.toolCalls,request().config.responseJsonSchema.properties.toolCalls);
});
test('continuation receives no historical navigation or schema expansion',()=>{
 const req={config:{responseJsonSchema:{type:'object'},chatMessages:[{role:'system',content:'EVIDENCIA_OBTENIDA='+JSON.stringify(task)},{role:'user',content:'Find source'}]}};const before=JSON.stringify(req),out=codec.compactRepositoryContinuation(req);
 assert.equal(out.config.chatMessages.filter(m=>m.content.startsWith('HISTORICAL_REPOSITORY_NAVIGATION=')).length,0);assert.deepEqual(out.config.chatMessages.at(-1),req.config.chatMessages.at(-1));assert.deepEqual(out.config.responseJsonSchema,req.config.responseJsonSchema);assert.equal(JSON.stringify(req),before);
});
