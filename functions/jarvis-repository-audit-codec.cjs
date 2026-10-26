'use strict';
// Repository closure is reviewed in bounded objective windows. Original receipts
// and the independent proof validation remain owned by the caller.
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
 const encoded=messages.filter(m=>m.content.startsWith(observationPrefix)).map(m=>JSON.parse(m.content.slice(observationPrefix.length)));
 const defaults=encoded[0]?.sourceReadDefaults,kinds=encoded[0]?.toolEvidenceKinds;
 const tasks=encoded.map((task,index)=>{
  const read=task.observation?.verifiedRead;
  const decodedRead=read?{...defaults?.verifiedRead,...read,
   ...(read.sourceStructure?.dataBindings?{sourceStructure:{...read.sourceStructure,
    dataBindings:{...defaults?.dataBindings,...read.sourceStructure.dataBindings}}}:{})}:null;
  return {index,...task,
   ...(task.allowedEvidenceKinds?{}:kinds?.[task.name]?{allowedEvidenceKinds:kinds[task.name]}:{}),
   ...(decodedRead?{args:{...Object.fromEntries((task.readArgs||[]).filter(k=>Object.hasOwn(decodedRead,k)).map(k=>[k,decodedRead[k]])),...task.args},
    observation:{...task.observation,verifiedRead:decodedRead}}:{})};
 });
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
  const response=await ai.models.generateContent({...request,config:{...request.config,
   semanticStage:'REPOSITORY_OBJECTIVE_AUDIT',maxOutputTokens:192,temperature:0,
   chatMessages:scopedMessages||[
    {role:'system',content:'Verifica SOLO el objetivo indicado contra recibos reales. s=true exige TODO su alcance, indices pertinentes y l vacio. Si falta algo: s=false y l breve. Una operacion exitosa no acredita otros archivos, cantidades, pruebas o contenido omitido. repo.context ok con REPO_CONTEXT_READY y contextPreview.files acredita la PREPARACION de esas fuentes; independentlyCertified=false significa que ese resumen no sustituye la verificacion de contenido por repo.read, no que la preparacion haya fallado. sourceCount cuenta fuentes genericas, no los archivos de contextPreview.files. Evalua solo el alcance del pedido original: una lectura auxiliar parcial no crea por si misma una obligacion de leer completamente ese archivo. Conserva las relaciones entre operaciones pedidas y no conviertas todas las tareas auxiliares en objetivos nuevos. Git history acredita commits, no pruebas ejecutadas por existir un mensaje. No mezcles objetivos ni inventes resultados. Metadatos de tareas no pertinentes solo ubican archivos: no prueban contenido. Indices compartidos remiten al recibo original. No selecciones herramientas en esta evaluacion. Esta auditoria decide si la evidencia necesaria para responder ya fue adquirida. Para objetivos de explicar o reportar, comprueba si los recibos permiten redactar una respuesta fundamentada; no exijas que la explicacion final ya se haya emitido. Eso no autoriza afirmar pruebas aprobadas sin sus resultados.'},
    ...selected.map(task=>({role:'system',content:observationPrefix+JSON.stringify(allowed.includes(task.index)?task:metadata(task))})),
    ...failures,
    ...(!contract?[{role:'system',content:'PEDIDO_ORIGINAL_PARA_RESOLVER_ALCANCE='+JSON.stringify(user.content)}]:[]),
    {role:'system',content:'El pedido original conserva el alcance y restricciones. Tu unica tarea es evaluar el objetivo indicado en el siguiente mensaje, no la mision entera. Los recibos no pertinentes se muestran como metadatos; no marques falso por evidencia que corresponde a otro objetivo.'},
    {role:'user',content:(contract?'ALCANCE_A_EVALUAR=':'OBJETIVO_INMUTABLE=')+JSON.stringify({objective:contract?.resolvedScope||template.objective.enum[0],requiredEvidenceKind:template.requiredEvidenceKind.enum[0]})}
   ],responseJsonSchema:{anyOf:entry.anyOf.filter(branch=>allowed.length||branch.properties.satisfied.enum[0]===false).map(branch=>{
    const satisfied=branch.properties.satisfied.enum[0];
    return {type:'object',properties:{
     ...(contract?{e:{type:'string',minLength:1,maxLength:180}}:{}),
     s:{type:'boolean',enum:[satisfied]},
     r:{type:'array',minItems:satisfied?1:0,maxItems:allowed.length,
      items:allowed.length?{type:'integer',enum:allowed}:{type:'integer'}},
     l:satisfied?{type:'string',enum:['']}:{type:'string',minLength:1,maxLength:100}
    },required:[...(contract?['e']:[]),'s','r','l'],additionalProperties:false};
   })}
  }});
  const v=parse(response),branch=entry.anyOf.find(b=>b.properties.satisfied.enum.includes(v.s));
  if(!branch || Object.keys(v).some(k=>![...(contract?['e']:[]),'s','r','l'].includes(k)) || !Array.isArray(v.r) || typeof v.l!=='string' ||
   contract&&(typeof v.e!=='string'||!v.e.trim()||v.e.length>180) ||
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
 return {...request,config:{...request.config,chatMessages:request.config.chatMessages.map(message=>{
  if(!message.content.startsWith(prefix))return message;
  const task=JSON.parse(message.content.slice(prefix.length));
  return {...message,content:prefix+JSON.stringify(metadata(task))};
 })}};
}
module.exports={generateRepositoryAudit,compactRepositoryContinuation};
