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
 const tasks=messages.filter(m=>m.content.startsWith(observationPrefix)).map(m=>JSON.parse(m.content.slice(observationPrefix.length)));
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
 for(const [key,entry] of entries){
  const template=entry.anyOf[0].properties;
  const allowed=[...new Set(entry.anyOf.flatMap(b=>b.properties.evidenceTaskIndexes.items.enum||[]))];
  const response=await ai.models.generateContent({...request,config:{...request.config,
   semanticStage:'REPOSITORY_OBJECTIVE_AUDIT',maxOutputTokens:192,temperature:0,
   chatMessages:[
    {role:'system',content:'Verifica SOLO el objetivo indicado contra recibos reales. s=true exige TODO su alcance, indices pertinentes y l vacio. Si falta algo: s=false y l breve. Una operacion exitosa no acredita otros archivos, cantidades, pruebas o contenido omitido. Repomix es contexto previo no certificado; no sustituye repo.read. Git history acredita commits, no pruebas ejecutadas por existir un mensaje. No mezcles objetivos ni inventes resultados. Metadatos de tareas no pertinentes solo ubican archivos: no prueban contenido. Indices compartidos remiten al recibo original. No selecciones herramientas en esta evaluacion.'},
    {role:'system',content:'OBJETIVO_INMUTABLE='+JSON.stringify({objective:template.objective.enum[0],requiredEvidenceKind:template.requiredEvidenceKind.enum[0]})},
    ...tasks.map(task=>({role:'system',content:observationPrefix+JSON.stringify(allowed.includes(task.index)?task:metadata(task))})),
    ...failures,user
   ],responseJsonSchema:{anyOf:entry.anyOf.map(branch=>{
    const satisfied=branch.properties.satisfied.enum[0];
    return {type:'object',properties:{
     s:{type:'boolean',enum:[satisfied]},
     r:{type:'array',minItems:satisfied?1:0,maxItems:allowed.length,
      items:allowed.length?{type:'integer',enum:allowed}:{type:'integer'}},
     l:satisfied?{type:'string',enum:['']}:{type:'string',minLength:1,maxLength:100}
    },required:['s','r','l'],additionalProperties:false};
   })}
  }});
  const v=parse(response),branch=entry.anyOf.find(b=>b.properties.satisfied.enum.includes(v.s));
  if(!branch || Object.keys(v).some(k=>!['s','r','l'].includes(k)) || !Array.isArray(v.r) || typeof v.l!=='string' ||
   v.l.length>100 || (v.s ? !v.r.length || v.l!=='' : !v.l.trim()) ||
   v.r.some(i=>!Number.isInteger(i)||!allowed.includes(i)) || new Set(v.r).size!==v.r.length)
   throw Error('SEMANTIC_COMPLETION_EVIDENCE_INVALID');
  objectives[key]={objective:template.objective.enum[0],requiredEvidenceKind:template.requiredEvidenceKind.enum[0],
   satisfied:v.s,evidenceTaskIndexes:v.r,limitation:v.l};
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
