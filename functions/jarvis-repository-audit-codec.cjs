'use strict';
// Repository closure is reviewed in bounded objective windows. Original receipts
// and the independent proof validation remain owned by the caller.
// Share only byte-identical commit objects; every receipt retains its own
// arguments, order, count, scope and completeness. Raw receipts are untouched.
function packGitCommitEvidence(tasks) {
 if(!tasks.length || tasks.some(t=>Object.hasOwn(t,'sharedGitCommits') ||
  Object.hasOwn(t,'sharedGitCommitEncoding') || Object.hasOwn(t.observation?.gitEvidence||{},'sharedCommitIndexes')))return tasks;
 const dictionary=[],ids=new Map();
 const packed=tasks.map(task=>{
  const o=task.observation,g=o?.gitEvidence;
  if(task.name!=='repo.gitHistory'||o.ok!==true||o.executionOk===false||o.blocked===true||!Array.isArray(g?.commits))return task;
  const indexes=g.commits.map(commit=>{const key=JSON.stringify(commit);
   if(!ids.has(key)){ids.set(key,dictionary.length);dictionary.push(commit);}return ids.get(key);});
  const {commits,...rest}=g;
  return {...task,observation:{...o,gitEvidence:{...rest,sharedCommitIndexes:indexes}}};
 });
 if(!dictionary.length)return tasks;
 packed[0]={...packed[0],sharedGitCommits:dictionary,sharedGitCommitEncoding:
  'gitEvidence.sharedCommitIndexes indexes sharedGitCommits in original order. Expand to commits before auditing; each call keeps its own limits, scope and completeness. No new evidence.'};
 return JSON.stringify(packed).length<JSON.stringify(tasks).length?packed:tasks;
}
function unpackGitCommitEvidence(tasks) {
 const dictionary=tasks[0]?.sharedGitCommits;
 if(dictionary===undefined)return tasks;
 if(!Array.isArray(dictionary))throw Error('GIT_COMMIT_TRANSPORT_INVALID');
 return tasks.map((task,index)=>{
  const {sharedGitCommits,sharedGitCommitEncoding,...rest}=task;
  if(index>0&&(sharedGitCommits!==undefined||sharedGitCommitEncoding!==undefined))throw Error('GIT_COMMIT_TRANSPORT_INVALID');
  const g=task.observation?.gitEvidence,ids=g?.sharedCommitIndexes;
  if(ids===undefined)return rest;
  if(task.name!=='repo.gitHistory'||Object.hasOwn(g,'commits')||!Array.isArray(ids)||ids.some(i=>!Number.isInteger(i)||i<0||i>=dictionary.length))throw Error('GIT_COMMIT_TRANSPORT_INVALID');
  const {sharedCommitIndexes,...fields}=g;
  return {...rest,observation:{...task.observation,gitEvidence:{...fields,commits:ids.map(i=>dictionary[i])}}};
 });
}
// Exact local aliases only: source previews remain unverified and unchanged.
function packRepositoryContextMetadata(tasks) {
 if(tasks.some(task=>Object.hasOwn(task,'contextMetadataFromPreview')))return tasks;
 let changed=false;
 const packed=tasks.map(task=>{
  const o=task.observation,p=o?.contextPreview;
  if(task.name!=='repo.context'||!Array.isArray(p?.files)||p.files.some(item=>typeof item?.file!=='string'||!item.file))return task;
  const files=p.files.map(item=>item.file),args=task.args,fields=[];
  const out={...task,args:args?{...args}:args,observation:{...o}};
  for(const [object,key,value,marker]of [[out.args,'files',files,'a'],[out.observation,'files',files,'f'],[out.observation,'sha256',p.sha256,'s']]) {
   if(!object||Array.isArray(object)||!Object.hasOwn(object,key)||(marker==='s'&&(typeof value!=='string'||!value)))continue;
   if(JSON.stringify(object[key])===JSON.stringify(value)){delete object[key];fields.push(marker);}
  }
  if(!fields.length)return task;
  out.contextMetadataFromPreview=fields;
  if(JSON.stringify(out).length>=JSON.stringify(task).length)return task;
  changed=true;return out;
 });
 return changed?packed:tasks;
}
function unpackRepositoryContextMetadata(tasks) {
 return tasks.map(task=>{
  if(!Object.hasOwn(task,'contextMetadataFromPreview'))return task;
  const keys=task.contextMetadataFromPreview,o=task.observation,p=o?.contextPreview;
  const fail=()=>{throw Error('CONTEXT_METADATA_TRANSPORT_INVALID');};
  if(task.name!=='repo.context'||!Array.isArray(keys)||!keys.length||new Set(keys).size!==keys.length||keys.some(k=>!['a','f','s'].includes(k))||!p)fail();
  if(keys.some(k=>k==='a'||k==='f')&&(!Array.isArray(p.files)||p.files.some(item=>typeof item?.file!=='string'||!item.file)))fail();
  if(keys.includes('s')&&(typeof p.sha256!=='string'||!p.sha256))fail();
  if(keys.includes('a')&&(!task.args||typeof task.args!=='object'||Array.isArray(task.args)||Object.hasOwn(task.args,'files')))fail();
  if(keys.includes('f')&&Object.hasOwn(o,'files')||keys.includes('s')&&Object.hasOwn(o,'sha256'))fail();
  const {contextMetadataFromPreview,...rest}=task;
  return {...rest,...(keys.includes('a')?{args:{...task.args,files:p.files.map(item=>item.file)}}:{}),
   observation:{...o,...(keys.includes('f')?{files:p.files.map(item=>item.file)}:{}),...(keys.includes('s')?{sha256:p.sha256}:{})}};
 });
}
function parse(response) {
 if(response?.providerResponse?.finishReason==='length')throw Error('SEMANTIC_COMPLETION_AUDIT_INCOMPLETE');
 try{return JSON.parse(response.text);}catch{throw Error('SEMANTIC_COMPLETION_AUDIT_INVALID_JSON');}
}
function metadata(task) {
 const o=task.observation||{},r=o.verifiedRead,p=o.contextPreview;
 return {index:task.index,name:task.name,args:task.args,allowedEvidenceKinds:task.allowedEvidenceKinds,
  observation:{ok:o.ok,executionOk:o.executionOk,status:o.status,blocked:o.blocked,requiresInput:o.requiresInput,
   ...(r?{verifiedRead:{file:r.file,sha256:r.sha256,startLine:r.startLine,endLine:r.endLine,partial:r.partial}}:{}),
   ...(p?{contextPreview:{files:p.files,independentlyCertified:p.independentlyCertified,evidenceOnly:p.evidenceOnly}}:{}),
   ...(o.sharedGitEvidenceTaskIndex!==undefined?{sharedGitEvidenceTaskIndex:o.sharedGitEvidenceTaskIndex}:{})},
  metadataOnly:true};
}
function decodeRepositoryTasks(encoded) {
 encoded=unpackRepositoryContextMetadata(encoded);
 const defaults=encoded[0]?.sourceReadDefaults,kinds=encoded[0]?.toolEvidenceKinds;
 return encoded.map((task,index)=>{
  const read=task.observation?.verifiedRead;
  const decodedRead=read?{...defaults?.verifiedRead,...read,
   ...(read.sourceStructure?.dataBindings?{sourceStructure:{...read.sourceStructure,
    dataBindings:{...defaults?.dataBindings,...read.sourceStructure.dataBindings}}}:{})}:null;
  // Remove only transport declarations fully resolved here. Shared AST schema
  // references and other encodings still need their original instructions.
  const resolved={...task};
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const defaultsResolved=object(defaults)&&Object.entries(defaults).every(([key,value])=>
   ['verifiedRead','dataBindings'].includes(key)&&object(value));
  const kindsResolved=object(kinds)&&Object.values(kinds).every(value=>Array.isArray(value)&&value.every(kind=>typeof kind==='string'));
  if(index===0) {
   if(defaultsResolved)delete resolved.sourceReadDefaults;
   if(kindsResolved)delete resolved.toolEvidenceKinds;
   if((defaultsResolved||kindsResolved)&&(!Object.hasOwn(task,'sourceReadDefaults')||defaultsResolved)&&
    (!Object.hasOwn(task,'toolEvidenceKinds')||kindsResolved))delete resolved.evidenceMetadataEncoding;
  }
  if(decodedRead&&Array.isArray(task.readArgs)&&task.readArgs.every(key=>typeof key==='string'&&Object.hasOwn(decodedRead,key)))delete resolved.readArgs;
  return {index,...resolved,
   ...(task.allowedEvidenceKinds?{}:kinds?.[task.name]?{allowedEvidenceKinds:kinds[task.name]}:{}),
   ...(decodedRead?{args:{...Object.fromEntries((task.readArgs||[]).filter(k=>Object.hasOwn(decodedRead,k)).map(k=>[k,decodedRead[k]])),...task.args},
    observation:{...task.observation,verifiedRead:decodedRead}}:{})};
 });
}
async function generateRepositoryAudit({ai,request,enabled=false}) {
 const original=request.config.responseJsonSchema,goals=original?.properties?.completionAssessment?.properties?.objectives;
 if(!enabled || !goals?.properties)return ai.models.generateContent(request);
 const entries=Object.entries(goals.properties);
 if(!entries.length || entries.some(([,entry])=>!entry.anyOf?.length ||
  new Set(entry.anyOf.map(b=>b.properties?.requiredEvidenceKind?.enum?.[0])).size!==1))
  return ai.models.generateContent(request);
 const messages=request.config.chatMessages,observationPrefix='OBSERVACION_EJECUTADA=';
 // The bounded transport omits indexes equal to their position. Decode before
 // selecting objective evidence; otherwise every receipt becomes metadata-only.
 const encoded=unpackGitCommitEvidence(messages.filter(m=>m.content.startsWith(observationPrefix)).map(m=>JSON.parse(m.content.slice(observationPrefix.length))));
 const tasks=decodeRepositoryTasks(encoded);
 const user=messages.findLast(m=>m.role==='user');
 const failures=messages.filter(m=>m.content.startsWith('INTENTO_FALLIDO_NO_ACREDITA_CUMPLIMIENTO=')).map(m=>{
  const prefix='INTENTO_FALLIDO_NO_ACREDITA_CUMPLIMIENTO=';
  try{const text=m.content.slice(prefix.length),task=JSON.parse(text.slice(0,text.lastIndexOf('}')+1));
   if(task.observation?.errorDetails?.sourceDiscovery?.operationalEvidence===false){
    delete task.observation.errorDetails.sourceDiscovery;task.observation.errorDetails.discoveryMetadataOmitted=true;
   }return {...m,content:prefix+JSON.stringify(task)};
  }catch{return m;}
 });
 const objectives={};
 const contracts=request.config.repositoryObjectiveScopes;
 let selection=null;
 if(Array.isArray(contracts) && contracts.length===entries.length && contracts.every((c,i)=>
  c.objective===entries[i][1].anyOf[0].properties.objective.enum[0] && typeof c.resolvedScope==='string' && c.resolvedScope.trim())){
  const indexes=tasks.map(t=>t.index),keys=entries.map(([key])=>key);
  const response=await ai.models.generateContent({...request,config:{...request.config,
   semanticStage:'REPOSITORY_EVIDENCE_SELECTION',maxOutputTokens:192,temperature:0,
   chatMessages:[{role:'system',content:'Selecciona recibos pertinentes para CADA objetivo y sus dependencias de alcance. Incluye evidencia parcial y fallida pertinente; no selecciones archivos auxiliares ajenos. Los indices solo seleccionan datos para una auditoria posterior: no certifican cumplimiento. Para leer archivos preparados por contexto incluye la preparacion y sus lecturas. Conserva todos los objetivos.'},
    {role:'user',content:JSON.stringify({request:user.content,objectives:Object.fromEntries(keys.map((key,i)=>[key,contracts[i]])),tasks:tasks.map(metadata)})}],
   responseJsonSchema:{type:'object',properties:Object.fromEntries(keys.map(key=>[key,{type:'array',maxItems:indexes.length,
    items:indexes.length?{type:'integer',enum:indexes}:{type:'integer'},...(indexes.length?{}:{maxItems:0})}])),required:keys,additionalProperties:false}
  }});
  selection=parse(response);
  if(!selection || Array.isArray(selection) || Object.keys(selection).length!==keys.length || keys.some(key=>
   !Array.isArray(selection[key]) || selection[key].some(index=>!Number.isInteger(index)||!indexes.includes(index))))
   throw Error('REPOSITORY_EVIDENCE_SELECTION_INVALID');
  // An empty routing choice is not proof that acquired evidence is absent.
  // Let the objective auditor inspect compatible receipts; it still decides
  // relevance and coverage, and independent proof uses the unchanged originals.
  keys.forEach((key,i)=>{
   if(selection[key].length)return;
   const compatible=new Set(entries[i][1].anyOf.flatMap(branch=>branch.properties.evidenceTaskIndexes.items.enum||[]));
   selection[key]=tasks.filter(task=>compatible.has(task.index)).map(task=>task.index);
  });
  // Selection is context routing, not authority to hide a named tool's
  // receipt. Include failed receipts too; audit/proof still decide validity.
  keys.forEach((key,i)=>{
   const missing=(contracts[i].explicitTools||[]).filter(name=>
    !tasks.some(t=>selection[key].includes(t.index)&&t.name===name));
   selection[key]=[...new Set([...selection[key],...tasks.filter(t=>missing.includes(t.name)).map(t=>t.index)])];
  });
 }
 for(const [key,entry] of entries){
  const template=entry.anyOf[0].properties;
  const contract=selection?contracts[entries.findIndex(([id])=>id===key)]:null;
  const selected=selection?tasks.filter(task=>selection[key].includes(task.index)):tasks;
  const allowed=[...new Set(entry.anyOf.flatMap(b=>b.properties.evidenceTaskIndexes.items.enum||[]))]
   .filter(index=>!selection||selected.some(task=>task.index===index));
  const selectedFiles=new Set(selected.flatMap(task=>task.observation?.verifiedRead?.file?[task.observation.verifiedRead.file]:[]));
  const dependencies=tasks.filter(task=>!allowed.includes(task.index) && (selected.includes(task)||
   task.observation?.contextPreview?.files?.some(file=>selectedFiles.has(typeof file==='string'?file:file.file)))).map(metadata);
  const scopedMessages=contract?[
   {role:'system',content:'Audita SOLO el objetivo literal. scopeContext conserva antecedentes y cantidades, no agrega otros objetivos de esa frase. Compara el alcance completo con los recibos; e explica la cobertura o brecha concreta ANTES de decidir s. r cita indices pertinentes de evidence, nunca metadatos de dependencies. s=true exige TODO el alcance, referencias validas y l=""; si falta evidencia s=false y l describe solo lo que falta. Dependencias metadataOnly identifican archivos preparados, no prueban su lectura. repo.context ok acredita PREPARACION de contextPreview.files; independentlyCertified=false y evidenceOnly=true limitan usar el resumen como contenido, no invalidan la preparacion. sourceCount no cuenta archivos preparados/leidos. Un archivo faltante, distinto o truncado no acredita todos los contenidos. Commits no prueban tests aprobados. Para explicar/reportar verifica evidencia suficiente para redactar, no exijas una respuesta final ya emitida. No inventes resultados ni cumplimiento.'},
   {role:'user',content:JSON.stringify({objective:template.objective.enum[0],scopeContext:contract.scopeContext||contract.objective,
    requiredEvidenceKind:template.requiredEvidenceKind.enum[0],explicitTools:contract.explicitTools||[],
    evidence:selected.filter(task=>allowed.includes(task.index)),
    ...(selected.some(task=>!allowed.includes(task.index))?{supportingEvidence:selected.filter(task=>!allowed.includes(task.index))}:{}),
    dependencies,failedAttempts:failures.map(m=>m.content)})}
  ]:null;
  if(scopedMessages && selected.some(task=>!allowed.includes(task.index)))
   scopedMessages[0].content+=' supportingEvidence conserva recibos seleccionados de otros tipos para interpretar cambios y antecedentes. No sustituye evidence del tipo requerido ni admite sus indices en r; los metadatos y afirmaciones sin recibo no prueban resultados.';
  // Explain receipt semantics without removing AST evidence or changing verdict gates.
  // Context preparation has its own contract and must not inherit content-read requirements.
  if(scopedMessages && selected.some(task=>allowed.includes(task.index) &&
   (task.observation?.verifiedRead || task.name==='repo.gitHistory' || task.name==='repo.gitStatus')))
   scopedMessages[0].content+=' sourceStructure describe cobertura de analisis estatico AST, distinta de la integridad de lectura. Conserva ese dato para evaluar afirmaciones estructurales. Para verificar contenido leido examina content, partial, truncated, contentTruncated y rangos reales; si falta un archivo del conjunto preparado, rechaza. gitStatus con cero cambios es evidencia de estado limpio, no ausencia de recibo. No deduzcas aprobacion de pruebas de ese estado.';
  // Use the named tools' evidence contract without importing requirements from
  // source-reading objectives into a Git-history objective.
  if(scopedMessages && contract.explicitTools?.length &&
   contract.explicitTools.every(name=>['repo.gitHistory','repo.gitStatus','repo.gitDiff'].includes(name)))
   scopedMessages[0].content='Evalua SOLO objective contra los recibos de evidence. Repo.gitHistory aporta commits reales y repo.gitStatus aporta el estado del arbol de trabajo. committedHistory=false en git_worktree distingue el tipo de recibo; no niega el historial separado. scopeContext no añade tareas. Explica en e si estos resultados permiten responder al objetivo. s=true requiere todo lo pedido, r con indices de cada herramienta exigida, l vacio. Si falta algo s=false y l concreto. No exijas leer todos los archivos cambiados para revisar Git ni inventes tests aprobados.';
  if(scopedMessages && contract.explicitTools?.length===1 && contract.explicitTools[0]==='repo.context')
   scopedMessages[0].content='Evalua exclusivamente la preparacion de contexto solicitada en objective. scopeContext resuelve que archivos/cantidad, pero leer contenido es otra operacion y no condiciona PREPARAR contexto. Compara args.files con contextPreview.files, cantidad, identidad y exito de repo.context. excerpt truncado/evidenceOnly/independentlyCertified=false significan que el resumen no prueba contenido, no que falte preparar el contexto. Si el objetivo pide verificar contenido tambien, ese requisito si requiere lecturas. s=true requiere todo el objetivo literal y r con sus recibos; si falta algo, s=false y l concreta. e explica la cobertura antes del veredicto. No inventes archivos, pruebas ni resultados.';
  const requiredToolReceipts=(contract?.explicitTools||[]).map(name=>selected.filter(task=>allowed.includes(task.index)&&task.name===name));
  const response=await ai.models.generateContent({...request,config:{...request.config,
   semanticStage:'REPOSITORY_OBJECTIVE_AUDIT',maxOutputTokens:512,temperature:0,
   chatMessages:scopedMessages||[
    {role:'system',content:'Verifica SOLO el objetivo indicado contra recibos reales. s=true exige TODO su alcance, indices pertinentes y l vacio. Si falta algo: s=false y l breve. Una operacion exitosa no acredita otros archivos, cantidades, pruebas o contenido omitido. repo.context ok con REPO_CONTEXT_READY y contextPreview.files acredita la PREPARACION de esas fuentes; independentlyCertified=false significa que ese resumen no sustituye la verificacion de contenido por repo.read, no que la preparacion haya fallado. sourceCount cuenta fuentes genericas, no los archivos de contextPreview.files. Evalua solo el alcance del pedido original: una lectura auxiliar parcial no crea por si misma una obligacion de leer completamente ese archivo. Conserva las relaciones entre operaciones pedidas y no conviertas todas las tareas auxiliares en objetivos nuevos. Git history acredita commits, no pruebas ejecutadas por existir un mensaje. No mezcles objetivos ni inventes resultados. Metadatos de tareas no pertinentes solo ubican archivos: no prueban contenido. Indices compartidos remiten al recibo original. No selecciones herramientas en esta evaluacion. Esta auditoria decide si la evidencia necesaria para responder ya fue adquirida. Para objetivos de explicar o reportar, comprueba si los recibos permiten redactar una respuesta fundamentada; no exijas que la explicacion final ya se haya emitido. Eso no autoriza afirmar pruebas aprobadas sin sus resultados.'},
    ...selected.map(task=>({role:'system',content:observationPrefix+JSON.stringify(allowed.includes(task.index)?task:metadata(task))})),
    ...failures,
    ...(!contract?[{role:'system',content:'PEDIDO_ORIGINAL_PARA_RESOLVER_ALCANCE='+JSON.stringify(user.content)}]:[]),
    {role:'system',content:'El pedido original conserva el alcance y restricciones. Tu unica tarea es evaluar el objetivo indicado en el siguiente mensaje, no la mision entera. Los recibos no pertinentes se muestran como metadatos; no marques falso por evidencia que corresponde a otro objetivo.'},
    {role:'user',content:(contract?'ALCANCE_A_EVALUAR=':'OBJETIVO_INMUTABLE=')+JSON.stringify({objective:contract?.resolvedScope||template.objective.enum[0],requiredEvidenceKind:template.requiredEvidenceKind.enum[0]})}
   ],responseJsonSchema:{anyOf:entry.anyOf.filter(branch=>branch.properties.satisfied.enum[0]===false || allowed.length&&requiredToolReceipts.every(group=>group.length)).map(branch=>{
    const satisfied=branch.properties.satisfied.enum[0];
    return {type:'object',properties:{
     ...(contract?{e:{type:'string',minLength:1,maxLength:600}}:{}),
     s:{type:'boolean',enum:[satisfied]},
     r:{type:'array',minItems:satisfied?Math.max(1,requiredToolReceipts.length):0,maxItems:allowed.length,uniqueItems:true,
      items:allowed.length?{type:'integer',enum:allowed}:{type:'integer'}},
     l:satisfied?{type:'string',enum:['']}:{type:'string',minLength:1,maxLength:100}
    },required:[...(contract?['e']:[]),'s','r','l'],additionalProperties:false};
   })}
  }});
  const v=parse(response),branch=entry.anyOf.find(b=>b.properties.satisfied.enum.includes(v.s));
  if(!branch || Object.keys(v).some(k=>![...(contract?['e']:[]),'s','r','l'].includes(k)) || !Array.isArray(v.r) || typeof v.l!=='string' ||
   contract&&(typeof v.e!=='string'||!v.e.trim()||v.e.length>600) ||
   v.l.length>100 || (v.s ? !v.r.length || v.l!=='' : !v.l.trim()) ||
   v.r.some(i=>!Number.isInteger(i)||!allowed.includes(i)))
   throw Error('SEMANTIC_COMPLETION_EVIDENCE_INVALID');
  objectives[key]={objective:template.objective.enum[0],requiredEvidenceKind:template.requiredEvidenceKind.enum[0],
   ...(contract?{resolvedScope:contract.resolvedScope,scopeTaskIndexes:[...new Set(selection[key])],assessmentReason:v.e}:{}),
   // References form a set. Removing repeats adds no proof and never changes the verdict.
   satisfied:v.s,evidenceTaskIndexes:[...new Set(v.r)],limitation:v.l};
 }
 // Selecting a continuation is separate from proving a goal. The same catalog
 // schema, denied-call guards and final validator still constrain any action.
 const next=await ai.models.generateContent({...request,config:{...request.config,
  semanticStage:'REPOSITORY_AUDIT_NEXT_ACTION',maxOutputTokens:320,temperature:0,
  chatMessages:[
   {role:'system',content:'Los objetivos ya fueron evaluados individualmente contra evidencia. No cambies sus veredictos. Si falta evidencia elige UNA siguiente lectura nueva del schema que avance la brecha con rutas fundamentadas. No repitas llamadas exitosas ni fallos, no amplíes permisos ni inventes pruebas. Si todos estan satisfechos o no existe una lectura pertinente, toolCalls=[]. Explica brevemente el estado.'},
   {role:'system',content:'OBJETIVOS_EVALUADOS='+JSON.stringify(objectives)},
   ...tasks.map(task=>({role:'system',content:observationPrefix+JSON.stringify(metadata(task))})),
   ...failures,...messages.filter(m=>m.content.startsWith('DECISIONES_RECHAZADAS=')),user
  ],responseJsonSchema:{type:'object',properties:{toolCalls:original.properties.toolCalls,
   explanation:{type:'string',minLength:1,maxLength:160}},required:['toolCalls','explanation'],additionalProperties:false}
 }});
 const value=parse(next);
 return {...next,text:JSON.stringify({completionAssessment:{objectives},toolCalls:value.toolCalls,explanation:value.explanation})};
}
// Continuation chooses an action; it cannot certify objectives. Full receipts
// already fed the objective auditors and remain unchanged in missionState.
function compactRepositoryContinuation(request) {
 const prefix='EVIDENCIA_OBTENIDA=';
 const decoded=decodeRepositoryTasks(unpackGitCommitEvidence(request.config.chatMessages
  .filter(m=>m.content.startsWith(prefix)).map(m=>JSON.parse(m.content.slice(prefix.length)))));
 let index=0;
 return {...request,config:{...request.config,chatMessages:request.config.chatMessages.map(message=>{
  if(!message.content.startsWith(prefix))return message;
  const task=decoded[index++];
  return {...message,content:prefix+JSON.stringify(metadata(task))};
 })}};
}
module.exports={packRepositoryContextMetadata,unpackRepositoryContextMetadata,generateRepositoryAudit,compactRepositoryContinuation,packGitCommitEvidence,unpackGitCommitEvidence};
