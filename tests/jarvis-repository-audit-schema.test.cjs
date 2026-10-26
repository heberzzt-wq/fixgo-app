const test=require('node:test'),assert=require('node:assert/strict');
const {generateRepositoryAudit}=require('../functions/jarvis-repository-audit-codec.cjs');
function request(){
 const branch=s=>({properties:{objective:{enum:['Revisar commits reales']},requiredEvidenceKind:{enum:['repository_search']},
 evidenceTaskIndexes:{type:'array',items:{enum:[0,1]}},satisfied:{enum:[s]}}});
 return {config:{chatMessages:[{role:'user',content:'Revisa los commits reales.'}],responseJsonSchema:{properties:{
 completionAssessment:{properties:{objectives:{properties:{objective_0:{anyOf:[branch(false),branch(true)]}}}}},
 toolCalls:{type:'array',maxItems:0}}}}};
}

test('resolved objective audits isolate selected receipts without rewriting the literal goal or negative verdict',async()=>{
 const req=request();req.config.repositoryObjectiveScopes=[{objective:'Revisar commits reales',resolvedScope:'Revisar los commits reales de Git.'}];
 req.config.chatMessages.unshift(...[
  {index:0,name:'repo.gitHistory',observation:{ok:true,gitEvidence:{commits:[{sha:'a'.repeat(40)}]}}},
  {index:1,name:'repo.context',observation:{ok:true,contextPreview:{files:['aux.js']}}}
 ].map(t=>({role:'system',content:'OBSERVACION_EJECUTADA='+JSON.stringify(t)})));
 const before=JSON.stringify(req),stages=[];
 const result=await generateRepositoryAudit({enabled:true,request:req,ai:{models:{generateContent:async r=>{
  const stage=r.config.semanticStage;stages.push(stage);
  if(stage==='REPOSITORY_EVIDENCE_SELECTION')return{text:'{"objective_0":[0]}'};
  if(stage==='REPOSITORY_OBJECTIVE_AUDIT'){
   const input=JSON.parse(r.config.chatMessages.at(-1).content);
   assert.deepEqual(input.evidence.map(t=>t.index),[0],'unrelated context receipt cannot become Git evidence');
   assert.ok(!r.config.chatMessages.some(m=>m.content.startsWith('PEDIDO_ORIGINAL_PARA_RESOLVER_ALCANCE=')));
   assert.equal(input.objective,'Revisar commits reales');
   assert.deepEqual(r.config.responseJsonSchema.anyOf[0].properties.r.items.enum,[0]);
   return{text:'{"e":"Solo hay evidencia parcial.","s":false,"r":[0],"l":"Falta evidencia."}'};
  }
  return{text:'{"toolCalls":[],"explanation":"Pendiente."}'};
 }}}});
 const goal=JSON.parse(result.text).completionAssessment.objectives.objective_0;
 assert.equal(goal.objective,'Revisar commits reales');assert.equal(goal.satisfied,false);
 assert.deepEqual(goal.scopeTaskIndexes,[0]);assert.equal(JSON.stringify(req),before);
 assert.equal(stages[0],'REPOSITORY_EVIDENCE_SELECTION');
});

test('receipt selection cannot invent indexes or omit an objective',async()=>{
 for(const text of ['{"objective_0":[99]}','{}']){
  const req=request();req.config.repositoryObjectiveScopes=[{objective:'Revisar commits reales',resolvedScope:'Revisar Git.'}];
  req.config.chatMessages.unshift({role:'system',content:'OBSERVACION_EJECUTADA={"index":0,"name":"repo.gitHistory","observation":{"ok":true}}'});
  await assert.rejects(generateRepositoryAudit({enabled:true,request:req,ai:{models:{generateContent:async()=>({text})}}}),/REPOSITORY_EVIDENCE_SELECTION_INVALID/);
 }
});
test('scoped source audit retains AST evidence and correlated negative gates',async()=>{
 const req=request(),read={file:'a.js',content:'export const a=1;',partial:false,truncated:false,
  sourceStructure:{complete:false,reason:'Unsupported syntax'}};
 req.config.repositoryObjectiveScopes=[{objective:'Revisar commits reales',resolvedScope:'Revisar commits reales'}];
 for(const branch of req.config.responseJsonSchema.properties.completionAssessment.properties.objectives.properties.objective_0.anyOf)
  branch.properties.requiredEvidenceKind.enum=['repository_source'];
 req.config.chatMessages.unshift({role:'system',content:'OBSERVACION_EJECUTADA='+JSON.stringify({index:0,name:'repo.read',observation:{ok:true,verifiedRead:read}})});
 await assert.rejects(generateRepositoryAudit({enabled:true,request:req,ai:{models:{generateContent:async r=>{
  if(r.config.semanticStage==='REPOSITORY_EVIDENCE_SELECTION')return{text:'{"objective_0":[0]}'};
  const input=JSON.parse(r.config.chatMessages.at(-1).content);
  assert.deepEqual(input.evidence[0].observation.verifiedRead,read);
  const positive=r.config.responseJsonSchema.anyOf.find(b=>b.properties.s.enum[0]);
  assert.deepEqual(positive.properties.l.enum,['']);assert.equal(positive.properties.r.minItems,1);
  return{text:'{"e":"Contradiction","s":true,"r":[0],"l":"Missing source"}'};
 }}}}),/SEMANTIC_COMPLETION_EVIDENCE_INVALID/);
});
test('selected Git support retains actual commits but cannot substitute required source references',async()=>{
 const req=request(),history={index:0,name:'repo.gitHistory',observation:{ok:true,gitEvidence:{commits:[{sha:'a'.repeat(40),subject:'Actual change'}]}}};
 req.config.repositoryObjectiveScopes=[{objective:'Revisar commits reales',resolvedScope:'Revisar commits reales'}];
 for(const branch of req.config.responseJsonSchema.properties.completionAssessment.properties.objectives.properties.objective_0.anyOf){
  branch.properties.requiredEvidenceKind.enum=['repository_source'];branch.properties.evidenceTaskIndexes.items.enum=[1];
 }
 req.config.chatMessages.unshift(...[history,{index:1,name:'repo.read',observation:{ok:true,verifiedRead:{file:'a.js',content:'export const a=1;',partial:false}}}]
  .map(t=>({role:'system',content:'OBSERVACION_EJECUTADA='+JSON.stringify(t)})));
 await assert.rejects(generateRepositoryAudit({enabled:true,request:req,ai:{models:{generateContent:async r=>{
  if(r.config.semanticStage==='REPOSITORY_EVIDENCE_SELECTION')return{text:'{"objective_0":[0,1]}'};
  const input=JSON.parse(r.config.chatMessages.at(-1).content);
  assert.deepEqual(input.supportingEvidence,[history]);
  assert.deepEqual(r.config.responseJsonSchema.anyOf[0].properties.r.items.enum,[1]);
  return{text:'{"e":"Git alone","s":true,"r":[0],"l":""}'};
 }}}}),/SEMANTIC_COMPLETION_EVIDENCE_INVALID/);
});
test('native verdict grammar forbids the exact contradictory positive response observed on cd35faad',async()=>{
 let calls=0;
 const result=await generateRepositoryAudit({enabled:true,request:request(),ai:{models:{generateContent:async req=>{
  if(++calls===1){
   const branches=req.config.responseJsonSchema.anyOf;
   assert.ok(Array.isArray(branches),'native grammar must correlate satisfaction, receipts and limitation');
   const positive=branches.find(b=>b.properties.s.enum.includes(true));
   const negative=branches.find(b=>b.properties.s.enum.includes(false));
   assert.deepEqual(positive.properties.l.enum,['']);
   assert.equal(positive.properties.r.minItems,1);
   assert.deepEqual(positive.properties.r.items.enum,[0,1]);
   assert.equal(negative.properties.l.minLength,1);
   return{text:JSON.stringify({s:true,r:[0],l:''})};
  }
  return{text:JSON.stringify({toolCalls:[],explanation:'Recibos revisados.'})};
 }}}});
 assert.equal(JSON.parse(result.text).completionAssessment.objectives.objective_0.satisfied,true);
 assert.equal(calls,2);
});
test('decoder still rejects positive explanation in limitation instead of manufacturing success',async()=>{
 await assert.rejects(generateRepositoryAudit({enabled:true,request:request(),ai:{models:{generateContent:async()=>({
  text:JSON.stringify({s:true,r:[0,1],l:'Revision de commits recientes completada.'})
 })}}}),/SEMANTIC_COMPLETION_EVIDENCE_INVALID/);
});

test('repository continuation selects from metadata without repeating large audited receipts or dropping failures',()=>{
 const {compactRepositoryContinuation}=require('../functions/jarvis-repository-audit-codec.cjs');
 const task={index:2,name:'repo.read',args:{file:'jarvis-safe.js'},observation:{ok:true,executionOk:true,
  verifiedRead:{file:'jarvis-safe.js',sha256:'a'.repeat(64),startLine:1,endLine:20,partial:true},content:'x'.repeat(20000)}};
 const failure={name:'repo.context',args:{files:['jarvis-big.js']},observation:{errorCode:'REPO_CONTEXT_SOURCE_TOO_LARGE',
  errorDetails:{sourceDiscovery:{operationalEvidence:false,candidates:[{file:'jarvis-small.js'}]}}}};
 const messages=[{role:'system',content:'EVIDENCIA_OBTENIDA='+JSON.stringify(task)},
 {role:'system',content:'INTENTO_FALLIDO='+JSON.stringify(failure)},
 {role:'system',content:'OBJETIVOS_PENDIENTES=[{"objective":"Leer dos archivos","satisfied":false}]'},
 {role:'system',content:'DECISIONES_RECHAZADAS=[]'},{role:'user',content:'Lee dos archivos sin modificar.'}];
 const req={config:{semanticStage:'READ_ONLY_EVIDENCE_CONTINUATION',tools:[{functionDeclarations:[]}],chatMessages:messages}};
 const before=JSON.stringify(req),result=compactRepositoryContinuation(req);
 assert.equal(JSON.stringify(req),before);
 assert.equal(result.config.tools,req.config.tools,'same native authorization schema');
 const retained=JSON.parse(result.config.chatMessages[0].content.slice('EVIDENCIA_OBTENIDA='.length));
 assert.equal(retained.metadataOnly,true);assert.equal(retained.index,2);assert.deepEqual(retained.args,task.args);
 assert.deepEqual(retained.observation.verifiedRead,task.observation.verifiedRead);
 assert.equal(retained.observation.content,undefined);
 assert.ok(JSON.stringify(result).includes('REPO_CONTEXT_SOURCE_TOO_LARGE'));
 assert.equal(result.config.chatMessages.at(-1).content,messages.at(-1).content);
 assert.equal(result.config.chatMessages[2].content,messages[2].content);
 assert.equal(result.config.chatMessages[3].content,messages[3].content);
 assert.ok(JSON.stringify(result).length<3000);
});

test('repository recovery exposes its required source alternative in the native response contract',async()=>{
 const fs=require('node:fs'),{runJarvisSemanticPlanner}=require('../functions/jarvis-semantic-planner.js');
 const packet=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'v142-four-step-audit.fixture.json'),'utf8'));
 packet.missionState.modelContextTokens=8192;packet.missionState.blockedTasks=[];
 for(const tool of packet.catalog)if(['repo.gitHistory','repo.gitStatus'].includes(tool.name))tool.evidenceKinds=['repository_search'];
 const goals=[{objective:'Revisar Git',requiredEvidenceKind:'repository_search'},
 {objective:'Leer dos archivos',requiredEvidenceKind:'repository_source'}];
 packet.missionState.evidenceObjectives=goals;
 packet.missionState.completionAssessment={objectives:goals.map(g=>({...g,satisfied:false,evidenceTaskIndexes:[],limitation:'Pendiente.'}))};
 packet.missionState.completedTasks.push({name:'repo.context',args:{files:['jarvis-safe-a.js','jarvis-safe-b.js']},
 observation:{ok:true,executionOk:true,status:'REPO_CONTEXT_READY',contextPreview:{files:[{file:'jarvis-safe-a.js'},{file:'jarvis-safe-b.js'}]}}});
 let goal=0,reached=false;
 await assert.rejects(runJarvisSemanticPlanner({...packet,ai:{models:{generateContent:async req=>{
  if(req.config.semanticStage==='REPOSITORY_SOURCE_ACQUISITION')return {text:'{"toolCalls":[]}'};
  if(req.config.semanticStage==='REPOSITORY_OBJECTIVE_AUDIT')return{text:JSON.stringify(++goal===1?{s:true,r:[0],l:''}:{s:false,r:[2],l:'Falta segundo archivo.'})};
  if(req.config.semanticStage==='REPOSITORY_AUDIT_NEXT_ACTION')return{text:JSON.stringify({toolCalls:[{name:packet.missionState.completedTasks[0].name,args:packet.missionState.completedTasks[0].args}],explanation:'Repetida.'})};
  if(req.config.semanticStage==='CLOSURE_OBJECTIVE_VERIFICATION')return{text:'{"proven":true}'};
  if(req.config.semanticStage==='READ_ONLY_EVIDENCE_CONTINUATION'){
   reached=true;
   assert.ok(req.config.responseJsonSchema,'required sourceFallback cannot be requested only in prose with nativeToolChat');
   assert.equal(req.config.responseJsonSchema.properties.toolCalls.maxItems,1);
   assert.ok(req.config.responseJsonSchema.required.includes('sourceFallback'));
   const schema=req.config.responseJsonSchema;
   const expand=value=>!value||typeof value!=='object'?value:value.$ref?expand(schema.$defs[value.$ref.slice('#/$defs/'.length)]):Array.isArray(value)?value.map(expand):Object.fromEntries(Object.entries(value).map(([key,child])=>[key,expand(child)]));
   assert.ok(JSON.stringify(expand(schema.properties.sourceFallback)).includes('jarvis-safe-b.js'));
   assert.ok(req.config.chatMessages.filter(m=>m.content.startsWith('EVIDENCIA_OBTENIDA=')).every(m=>JSON.parse(m.content.slice('EVIDENCIA_OBTENIDA='.length)).metadataOnly));
   throw Error('RECOVERY_CONTRACT_VERIFIED');
  }
  throw Error('UNEXPECTED_STAGE_'+req.config.semanticStage);
 }}}}),/RECOVERY_CONTRACT_VERIFIED/);
 assert.equal(reached,true);
});

test('compacted positional receipts retain evidence identity at the objective model boundary',async()=>{
 const req=request();
 req.config.chatMessages.unshift(...[
  {name:'repo.gitHistory',observation:{ok:true,executionOk:true,gitEvidence:{commits:[{sha:'a'.repeat(40),subject:'Real change'}]}}},
  {name:'repo.context',observation:{ok:true,executionOk:true,status:'REPO_CONTEXT_READY',contextPreview:{files:[{file:'a.js'},{file:'b.js'}]}}}
 ].map(task=>({role:'system',content:'OBSERVACION_EJECUTADA='+JSON.stringify(task)})));
 const before=JSON.stringify(req);let calls=0;
 await generateRepositoryAudit({enabled:true,request:req,ai:{models:{generateContent:async r=>{
  const tasks=r.config.chatMessages.filter(m=>m.content.startsWith('OBSERVACION_EJECUTADA=')).map(m=>JSON.parse(m.content.slice('OBSERVACION_EJECUTADA='.length)));
  assert.deepEqual(tasks.map(t=>t.index),[0,1]);
  if(++calls===1){
   assert.equal(tasks[0].metadataOnly,undefined);
   assert.equal(tasks[0].observation.gitEvidence.commits[0].subject,'Real change');
   assert.equal(tasks[1].observation.status,'REPO_CONTEXT_READY');
   return {text:'{"s":true,"r":[0,1],"l":""}'};
  }
  return {text:'{"toolCalls":[],"explanation":"Evidence retained."}'};
 }}}});
 assert.equal(JSON.stringify(req),before);
});
test('duplicate valid evidence references normalize without changing an unsatisfied verdict',async()=>{
 let calls=0;
 const result=await generateRepositoryAudit({enabled:true,request:request(),ai:{models:{generateContent:async()=>{
  return {text:++calls===1?'{"s":false,"r":[1,0,1],"l":"Missing test evidence."}':'{"toolCalls":[],"explanation":"Still incomplete."}'};
 }}}});
 const goal=JSON.parse(result.text).completionAssessment.objectives.objective_0;
 assert.deepEqual(goal.evidenceTaskIndexes,[1,0]);assert.equal(goal.satisfied,false);
 assert.equal(goal.limitation,'Missing test evidence.');
});
test('invalid references cannot be hidden among duplicates',async()=>{
 await assert.rejects(generateRepositoryAudit({enabled:true,request:request(),ai:{models:{generateContent:async()=>({
  text:'{"s":true,"r":[0,99,0],"l":""}'
 })}}}),/SEMANTIC_COMPLETION_EVIDENCE_INVALID/);
});

test('source objective retains shared defaults even when their owner is metadata-only',async()=>{
 const req=request();for(const branch of req.config.responseJsonSchema.properties.completionAssessment.properties.objectives.properties.objective_0.anyOf){
  branch.properties.requiredEvidenceKind.enum=['repository_source'];branch.properties.evidenceTaskIndexes.items.enum=[1];
 }
 req.config.chatMessages.unshift(...[
  {name:'repo.gitHistory',sourceReadDefaults:{verifiedRead:{partial:true,truncated:true,contentTruncated:true}},toolEvidenceKinds:{'repo.read':['repository_source']},observation:{ok:true}},
  {name:'repo.read',args:{},readArgs:['file'],observation:{ok:true,verifiedRead:{file:'a.js',content:'partial window'}}}
 ].map(t=>({role:'system',content:'OBSERVACION_EJECUTADA='+JSON.stringify(t)})));
 const before=JSON.stringify(req);let calls=0;
 await generateRepositoryAudit({enabled:true,request:req,ai:{models:{generateContent:async r=>{
  if(++calls===1){
   const tasks=r.config.chatMessages.filter(m=>m.content.startsWith('OBSERVACION_EJECUTADA=')).map(m=>JSON.parse(m.content.slice('OBSERVACION_EJECUTADA='.length)));
   assert.equal(tasks[0].metadataOnly,true);
   assert.equal(tasks[1].observation.verifiedRead.partial,true);
   assert.equal(tasks[1].observation.verifiedRead.contentTruncated,true);
   assert.equal(tasks[1].args.file,'a.js');
   assert.deepEqual(tasks[1].allowedEvidenceKinds,['repository_source']);
   return {text:'{"s":false,"r":[1],"l":"Incomplete source."}'};
  }
  return {text:'{"toolCalls":[],"explanation":"Still incomplete."}'};
 }}}});assert.equal(JSON.stringify(req),before);
});

test('overlapping Git histories share exact commit bytes and decode without changing receipt coverage',()=>{
 const {packGitCommitEvidence,unpackGitCommitEvidence}=require('../functions/jarvis-repository-audit-codec.cjs');
 const commits=Array.from({length:8},(_,i)=>({sha:String(i).repeat(40),subject:'change '+i,files:Array.from({length:20},(_,j)=>'source/path/file'+j+'.js')}));
 const tasks=[8,5,1].map(limit=>({name:'repo.gitHistory',args:{limit},observation:{ok:true,executionOk:true,
  gitEvidence:{commits:commits.slice(0,limit),reportedCommits:limit,limit,detailsBounded:true}}}));
 tasks.push({name:'repo.gitHistory',args:{limit:1},observation:{ok:true,executionOk:true,gitEvidence:{commits:[{...commits[0],subject:'different evidence'}],limit:1}}});
 const before=JSON.stringify(tasks),packed=packGitCommitEvidence(tasks);
 assert.ok(JSON.stringify(packed).length<before.length-1000);
 assert.deepEqual(unpackGitCommitEvidence(packed),tasks);
 assert.equal(JSON.stringify(tasks),before);
 const corrupt=structuredClone(packed);corrupt[1].observation.gitEvidence.sharedCommitIndexes=[999];
 assert.throws(()=>unpackGitCommitEvidence(corrupt),/GIT_COMMIT_TRANSPORT_INVALID/);
});

test('semantic selection cannot hide receipts of tools explicitly required by the objective',async()=>{
 const req=request();req.config.repositoryObjectiveScopes=[{objective:'Revisar commits reales',resolvedScope:'Revisar commits reales',explicitTools:['repo.gitHistory','repo.gitStatus']}];
 req.config.chatMessages.unshift(...[
  {index:0,name:'repo.gitHistory',observation:{ok:true,gitEvidence:{commits:[{sha:'a'.repeat(40)}]}}},
  {index:1,name:'repo.gitStatus',observation:{ok:false,status:'DENIED',gitEvidence:null}}
 ].map(t=>({role:'system',content:'OBSERVACION_EJECUTADA='+JSON.stringify(t)})));
 let audited=false;
 const result=await generateRepositoryAudit({enabled:true,request:req,ai:{models:{generateContent:async r=>{
  if(r.config.semanticStage==='REPOSITORY_EVIDENCE_SELECTION')return {text:'{"objective_0":[0]}'};
  if(r.config.semanticStage==='REPOSITORY_OBJECTIVE_AUDIT'){
   const input=JSON.parse(r.config.chatMessages.find(m=>m.role==='user').content);
   assert.deepEqual(input.evidence.map(t=>t.name),['repo.gitHistory','repo.gitStatus']);
   assert.equal(input.evidence[1].observation.ok,false);audited=true;
   return {text:'{"e":"Status denied","s":false,"r":[0],"l":"Missing verified status"}'};
  }
  return {text:'{"toolCalls":[],"explanation":"Still blocked"}'};
 }}}});
 assert.equal(audited,true);assert.equal(JSON.parse(result.text).completionAssessment.objectives.objective_0.satisfied,false);
});

test('named source tool does not expand selected file scope to unrelated auxiliary reads',async()=>{
 const req=request();req.config.repositoryObjectiveScopes=[{objective:'Revisar commits reales',resolvedScope:'Revisar commits reales',explicitTools:['repo.read']}];
 for(const branch of req.config.responseJsonSchema.properties.completionAssessment.properties.objectives.properties.objective_0.anyOf)
  branch.properties.requiredEvidenceKind.enum=['repository_source'];
 req.config.chatMessages.unshift(...[
  {index:0,name:'repo.read',observation:{ok:true,verifiedRead:{file:'selected.js',content:'export const a=1;',partial:false}}},
  {index:1,name:'repo.read',observation:{ok:true,verifiedRead:{file:'auxiliary.json',content:'{"partial":',partial:true}}}
 ].map(t=>({role:'system',content:'OBSERVACION_EJECUTADA='+JSON.stringify(t)})));
 await generateRepositoryAudit({enabled:true,request:req,ai:{models:{generateContent:async r=>{
  if(r.config.semanticStage==='REPOSITORY_EVIDENCE_SELECTION')return {text:'{"objective_0":[0]}'};
  if(r.config.semanticStage==='REPOSITORY_OBJECTIVE_AUDIT'){
   const input=JSON.parse(r.config.chatMessages.find(m=>m.role==='user').content);
   assert.deepEqual(input.evidence.map(t=>t.observation.verifiedRead.file),['selected.js']);
   return {text:'{"e":"Selected source available","s":true,"r":[0],"l":""}'};
  }
  return {text:'{"toolCalls":[],"explanation":"Selected source reviewed"}'};
 }}}});
});

test('repository continuation restores compact read arguments and completeness before proposing a new action',()=>{
 const {compactRepositoryContinuation}=require('../functions/jarvis-repository-audit-codec.cjs');
 const tasks=[
  {name:'repo.gitStatus',sourceReadDefaults:{verifiedRead:{partial:true,truncated:true}},toolEvidenceKinds:{'repo.read':['repository_source']},observation:{ok:true}},
  {name:'repo.read',args:{},readArgs:['file','startLine'],observation:{ok:true,verifiedRead:{file:'report.json',startLine:250,endLine:300}}}
 ];
 const req={config:{chatMessages:tasks.map(t=>({role:'system',content:'EVIDENCIA_OBTENIDA='+JSON.stringify(t)}))}};
 const before=JSON.stringify(req),output=compactRepositoryContinuation(req);
 const read=JSON.parse(output.config.chatMessages[1].content.slice('EVIDENCIA_OBTENIDA='.length));
 assert.deepEqual(read.args,{file:'report.json',startLine:250});
 assert.equal(read.observation.verifiedRead.partial,true);
 assert.equal(read.index,1);assert.deepEqual(read.allowedEvidenceKinds,['repository_source']);
 assert.equal(JSON.stringify(req),before);
});

test('positive audit grammar requires references for both explicit tools and forbids success when a tool is missing',async()=>{
 for(const includeStatus of [true,false]){
  const req=request();req.config.repositoryObjectiveScopes=[{objective:'Revisar commits reales',resolvedScope:'Revisar commits reales y estado Git',explicitTools:['repo.gitHistory','repo.gitStatus']}];
  const tasks=[{index:0,name:'repo.gitHistory',observation:{ok:true,gitEvidence:{commits:[{sha:'a'.repeat(40)}]}}}];
  if(includeStatus)tasks.push({index:1,name:'repo.gitStatus',observation:{ok:true,gitEvidence:{clean:true}}});
  req.config.chatMessages.unshift(...tasks.map(t=>({role:'system',content:'OBSERVACION_EJECUTADA='+JSON.stringify(t)})));
  let checked=false;
  await generateRepositoryAudit({enabled:true,request:req,ai:{models:{generateContent:async r=>{
   if(r.config.semanticStage==='REPOSITORY_EVIDENCE_SELECTION')return {text:'{"objective_0":[0]}'};
   if(r.config.semanticStage==='REPOSITORY_OBJECTIVE_AUDIT'){
    const positive=r.config.responseJsonSchema.anyOf.find(b=>b.properties.s.enum[0]===true);
    if(includeStatus){assert.ok(positive);assert.equal(positive.properties.r.minItems,2);assert.equal(positive.properties.r.uniqueItems,true);assert.deepEqual(positive.properties.r.items.enum,[0,1]);}
    else assert.equal(positive,undefined);
    checked=true;return {text:includeStatus?'{"e":"Ambos recibos disponibles","s":true,"r":[0,1],"l":""}':'{"e":"Falta status","s":false,"r":[0],"l":"Falta status"}'};
   }
   return {text:'{"toolCalls":[],"explanation":"Review finished"}'};
  }}}});
  assert.equal(checked,true);
 }
});
test('empty routing inspects acquired compatible evidence without manufacturing a positive verdict',async()=>{
 const req=request();req.config.repositoryObjectiveScopes=[{objective:'Revisar commits reales',resolvedScope:'Revisar commits reales'}];
 for(const branch of req.config.responseJsonSchema.properties.completionAssessment.properties.objectives.properties.objective_0.anyOf)branch.properties.evidenceTaskIndexes.items.enum=[0];
 const tasks=[{index:0,name:'repo.gitHistory',observation:{ok:true,gitEvidence:{commits:[]}}},{index:1,name:'repo.read',observation:{ok:true,verifiedRead:{file:'unrelated.js',content:'do not count me'}}}];
 req.config.chatMessages.unshift(...tasks.map(task=>({role:'system',content:'OBSERVACION_EJECUTADA='+JSON.stringify(task)})));
 const before=JSON.stringify(req);const result=await generateRepositoryAudit({enabled:true,request:req,ai:{models:{generateContent:async r=>{
  if(r.config.semanticStage==='REPOSITORY_EVIDENCE_SELECTION')return{text:'{"objective_0":[]}'};
  if(r.config.semanticStage==='REPOSITORY_OBJECTIVE_AUDIT'){
   const data=JSON.parse(r.config.chatMessages.at(-1).content);assert.deepEqual(data.evidence,tasks.slice(0,1));assert.equal(data.supportingEvidence,undefined);
   return{text:'{"e":"El recibo disponible no demuestra commits.","s":false,"r":[0],"l":"No hay commits en el recibo."}'};
  }return{text:'{"toolCalls":[],"explanation":"Pendiente."}'};
 }}}});
 assert.equal(JSON.parse(result.text).completionAssessment.objectives.objective_0.satisfied,false);assert.equal(JSON.stringify(req),before);
});
test('objective evidence rehydrates only its routed original receipts after aggregate eviction',async()=>{
 const req=request();req.config.repositoryObjectiveScopes=[{objective:'Revisar commits reales',resolvedScope:'Revisar commits reales'}];
 for(const branch of req.config.responseJsonSchema.properties.completionAssessment.properties.objectives.properties.objective_0.anyOf){branch.properties.requiredEvidenceKind.enum=['repository_source'];branch.properties.evidenceTaskIndexes.items.enum=[0];}
 const original=[{index:0,name:'repo.read',args:{file:'a.js'},observation:{ok:true,verifiedRead:{file:'a.js',content:'export const a=1;',partial:false}}},{index:1,name:'repo.read',args:{file:'aux.js'},observation:{ok:true,verifiedRead:{file:'aux.js',content:'auxiliary',partial:false}}}];
 const transport=structuredClone(original);transport[0].observation.verifiedRead.content='';transport[0].observation.verifiedRead.partial=true;
 req.config.chatMessages.unshift(...transport.map(task=>({role:'system',content:'OBSERVACION_EJECUTADA='+JSON.stringify(task)})));
 req.config.repositoryOriginalTasks=original;let views=0;req.config.repositoryEvidenceView=tasks=>{views++;assert.deepEqual(tasks,[original[0]]);return structuredClone(tasks)};
 const result=await generateRepositoryAudit({enabled:true,request:req,ai:{models:{generateContent:async r=>{
  assert.equal(r.config.repositoryOriginalTasks,undefined);assert.equal(r.config.repositoryEvidenceView,undefined);
  if(r.config.semanticStage==='REPOSITORY_EVIDENCE_SELECTION')return{text:'{"objective_0":[0]}'};
  if(r.config.semanticStage==='REPOSITORY_OBJECTIVE_AUDIT'){const input=JSON.parse(r.config.chatMessages.at(-1).content);assert.equal(input.evidence[0].observation.verifiedRead.content,'export const a=1;');assert.equal(input.evidence[0].observation.verifiedRead.partial,false);return{text:'{"e":"No se afirma cobertura sin prueba.","s":false,"r":[0],"l":"Pendiente."}'};}
  return{text:'{"toolCalls":[],"explanation":"Pendiente."}'};
 }}}});assert.equal(views,1);assert.equal(JSON.parse(result.text).completionAssessment.objectives.objective_0.satisfied,false);assert.equal(transport[0].observation.verifiedRead.content,'');
});
