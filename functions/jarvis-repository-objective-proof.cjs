'use strict';
// Independent proof receives the exact local clause and its antecedents, not
// unrelated mission goals. Neither the planner's verdict nor its explanation is proof.
async function reviewRepositoryObjective({ai,model,objective,contract,tasks}) {
 const deny=reason=>({proven:false,reason});
 const indexes=objective.evidenceTaskIndexes;
 if(objective.resolvedScope!==contract?.resolvedScope || !Array.isArray(indexes) || !indexes.length ||
  indexes.some(index=>!Number.isInteger(index)||index<0||!tasks[index]))return deny('INVALID_SCOPE_OR_RECEIPT');
 const cited=indexes.map(index=>{
  const task=tasks[index],{objectiveSatisfied,...observation}=task.observation||{};
  return {index,name:task.name,args:task.args,observation};
 });
 if(cited.some(t=>t.observation.ok!==true||t.observation.executionOk===false||t.observation.blocked===true||t.observation.requiresInput===true))
  return deny('UNSUCCESSFUL_RECEIPT');
 if((contract.explicitTools||[]).some(name=>!cited.some(t=>t.name===name)))return deny('EXPLICIT_TOOL_EVIDENCE_MISSING');
 const files=value=>Array.isArray(value)?value.map(item=>typeof item==='string'?item:item?.file):null;
 const signature=value=>JSON.stringify([...value].sort());
 for(const task of cited){
  const o=task.observation;
  if(o.contextPreview){
   const actual=files(o.contextPreview.files),requested=files(task.args?.files),reported=files(o.files);
   if(!actual?.length||actual.some(file=>typeof file!=='string')||new Set(actual).size!==actual.length||
    requested&&signature(requested)!==signature(actual)||reported&&signature(reported)!==signature(actual))
    return deny('CONTEXT_FILE_IDENTITY_MISMATCH');
  }
  if(o.verifiedRead && task.args?.file && o.verifiedRead.file!==task.args.file)return deny('SOURCE_FILE_IDENTITY_MISMATCH');
 }
 const selected=new Set(objective.scopeTaskIndexes||[]);
 if(cited.some(t=>t.observation.verifiedRead))tasks.forEach((task,index)=>{
  if(task.observation?.ok===true&&task.observation.contextPreview?.files)selected.add(index);
 });
 const dependencies=[...selected].filter(index=>!indexes.includes(index)&&Number.isInteger(index)&&tasks[index]).map(index=>{
  const task=tasks[index];return {index,name:task.name,args:task.args,metadataOnly:true,
   contextFiles:task.observation?.contextPreview?.files,sourceFile:task.observation?.verifiedRead?.file};
 });
 const supportingEvidence=[...new Set(objective.scopeTaskIndexes||[])].filter(index=>!indexes.includes(index)&&Number.isInteger(index)&&tasks[index]).map(index=>{
  const task=tasks[index],{objectiveSatisfied,...observation}=task.observation||{};
  return {index,name:task.name,args:task.args,observation};
 });
 const input={objective:contract.objective,scopeContext:contract.scopeContext||contract.objective,
  resolvedScope:contract.resolvedScope,requiredEvidenceKind:contract.requiredEvidenceKind,explicitTools:contract.explicitTools||[],dependencies,evidence:cited,
  ...(supportingEvidence.length?{supportingEvidence}:{})};
 const response=await ai.models.generateContent({model,contents:JSON.stringify(input),config:{
  semanticStage:'CLOSURE_OBJECTIVE_VERIFICATION',temperature:0,maxOutputTokens:192,
  responseMimeType:'application/json',responseJsonSchema:{type:'object',properties:{
   reason:{type:'string',minLength:1,maxLength:180},proven:{type:'boolean'}},required:['reason','proven'],additionalProperties:false},
  chatMessages:[{role:'system',content:'Revisor independiente de UN objetivo. Compara el objetivo literal con los recibos, usando scopeContext SOLO para resolver antecedentes y cantidades, no para evaluar otros objetivos de esa frase. resolvedScope es una interpretacion a comprobar, no evidencia: si omite o cambia un requisito, proven=false. Explica en reason la cobertura o brecha concreta de ESTE objetivo y luego decide proven. Necesitas todo el alcance y todos los archivos/cantidades pedidos. Dependencias metadataOnly identifican archivos preparados, no prueban su lectura. repo.context ok con REPO_CONTEXT_READY acredita PREPARACION de contextPreview.files; independentlyCertified=false y evidenceOnly=true limitan usar el resumen como contenido, no invalidan la preparacion. sourceCount es un contador generico, no la cantidad de archivos preparados/leidos. Una lectura parcial no acredita contenido completo; un archivo equivocado no sustituye al solicitado. Commits no prueban tests aprobados. Para explicar/reportar comprueba si hay evidencia suficiente para redactar, no exijas un informe ya emitido. No aceptes afirmaciones de cumplimiento del planner ni inventes resultados.'},
   ...(supportingEvidence.length?[{role:'system',content:'supportingEvidence contiene recibos de apoyo seleccionados, no reemplaza la evidencia citada requerida en evidence. Un historial Git no sustituye contenido leido ni resultados de pruebas; conserva diferencias de tipo, integridad e identidad.'}]:[]),
   {role:'user',content:JSON.stringify(input)}]
 }});
 if(response?.providerResponse?.finishReason==='length')return deny('INDEPENDENT_PROOF_TRUNCATED');
 let value;try{value=JSON.parse(response.text);}catch{return deny('INDEPENDENT_PROOF_INVALID_JSON');}
 if(!value||Object.keys(value).some(key=>!['reason','proven'].includes(key))||typeof value.proven!=='boolean'||
  typeof value.reason!=='string'||!value.reason.trim()||value.reason.length>180)return deny('INDEPENDENT_PROOF_INVALID');
 return value;
}
module.exports={reviewRepositoryObjective};
