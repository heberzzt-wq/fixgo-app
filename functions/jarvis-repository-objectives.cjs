'use strict';
function failure(code,evidence={}){
 return Object.assign(Error(code),{retryable:false,evidence:{stage:'REPOSITORY_OBJECTIVE_CONTRACT',retryable:false,...evidence}});
}
function parse(response) {
 if(response?.providerResponse?.finishReason==='length')throw failure('REPOSITORY_OBJECTIVES_TRUNCATED');
 try{return JSON.parse(response.text);}catch{throw failure('REPOSITORY_OBJECTIVES_INVALID_JSON');}
}
function literalScopes(instruction){
 const spans=[];let start=0;
 const add=(from,to)=>{const text=instruction.slice(from,to),trimmed=text.trim();if(trimmed){const offset=text.indexOf(trimmed);spans.push({start:from+offset,end:from+offset+trimmed.length});}};
 // Formatting boundaries only. The model still assigns meaning and evidence.
 // Periods inside repo.read, URLs or versions do not split a scope.
 for(const match of instruction.matchAll(/[.!?;,]\s+|\n+/gu)){
  add(start,match.index+(match[0].startsWith('\n')?0:1));start=match.index+match[0].length;
 }
 add(start,instruction.length);
 const width=Math.max(1,Math.ceil(spans.length/8)),scopes=[];
 for(let i=0;i<spans.length;i+=width)scopes.push(instruction.slice(spans[i].start,spans[Math.min(i+width,spans.length)-1].end));
 const boundaries=[0,...Array.from(instruction.matchAll(/[.!?](?=\s|$)|\n/gu),m=>m.index+1),instruction.length];
 let cursor=0;
 return scopes.map((text,index)=>{
  const position=instruction.indexOf(text,cursor);cursor=position+text.length;
  const from=boundaries.filter(n=>n<=position).at(-1),to=boundaries.find(n=>n>=cursor);
  return {id:'scope_'+index,text,context:instruction.slice(from,to).trim()};
 });
}
function validateContract(value,scopes,kinds,catalog=[],allowConstraintsOnly=false){
 const assignments=value?.scopes,keys=scopes.map(scope=>scope.id);
 if(!assignments||typeof assignments!=='object'||Array.isArray(assignments)||
  Object.keys(value).some(key=>key!=='scopes')||Object.keys(assignments).some(key=>!keys.includes(key)))
  throw failure('REPOSITORY_OBJECTIVES_UNGROUNDED',{receivedKeys:Object.keys(value||{})});
 const missing=keys.filter(key=>!Object.hasOwn(assignments,key));
 if(missing.length)throw failure('REPOSITORY_OBJECTIVES_INCOMPLETE',{missingScopes:missing});
 const kindOf=value=>typeof value==='string'?value:value?.kind;
 const invalid=keys.filter(key=>{
  const value=assignments[key],kind=kindOf(value);
  return (!kinds.includes(kind)&&kind!=='constraint') || (typeof value!=='string' &&
   (!value || typeof value!=='object' || Array.isArray(value) ||
    Object.keys(value).some(k=>!['scope','kind'].includes(k)) ||
    typeof value.scope!=='string' || !value.scope.trim() || value.scope.length>240));
 });
 if(invalid.length)throw failure('REPOSITORY_OBJECTIVES_UNGROUNDED',{invalidScopes:invalid});
 const rewritten=scopes.filter(scope=>typeof assignments[scope.id]==='object'&&assignments[scope.id].scope!==scope.text);
 if(rewritten.length)throw failure('REPOSITORY_OBJECTIVES_UNGROUNDED',{reason:'LITERAL_SCOPE_REWRITTEN',invalidScopes:rewritten.map(scope=>scope.id)});
 const lostTools=scopes.flatMap(scope=>{
  const value=assignments[scope.id];if(typeof value==='string')return [];
  return catalog.filter(tool=>scope.text.includes(tool.name)&&!value.scope.includes(tool.name))
   .map(tool=>({scope:scope.id,tool:tool.name}));
 });
 if(lostTools.length)throw failure('REPOSITORY_OBJECTIVES_UNGROUNDED',{reason:'EXPLICIT_TOOL_REFERENCE_LOST',lostTools});
 const goals=scopes.filter(scope=>kindOf(assignments[scope.id])!=='constraint');
 if(!goals.length&&!allowConstraintsOnly)throw failure('REPOSITORY_OBJECTIVES_UNGROUNDED',{reason:'NO_EVIDENCE_OBJECTIVE'});
 return goals.map(scope=>({objective:scope.text,requestQuote:scope.text,requiredEvidenceKind:kindOf(assignments[scope.id]),
  scopeContext:scope.context,
  explicitTools:catalog.filter(tool=>scope.text.includes(tool.name)).map(tool=>tool.name),
  ...(typeof assignments[scope.id]==='object'?{resolvedScope:assignments[scope.id].scope}:{}),
  satisfied:false,evidenceTaskIndexes:[],limitation:'Evidencia pendiente de ejecución y validación.'}));
}
async function extractRepositoryObjectives({ai,model,instruction,catalog}) {
 const kinds=[...new Set(catalog.flatMap(t=>t.evidenceKinds||['tool_result']))],scopes=literalScopes(instruction);
 if(!scopes.length)throw failure('REPOSITORY_OBJECTIVES_UNGROUNDED',{reason:'EMPTY_REQUEST'});
 const assignments={};
 for(const scope of scopes){
 const messages=[{role:'system',content:'Clasifica SOLO el fragmento actual. scope conserva exactamente su texto; context contiene la frase literal para resolver antecedentes y cantidades sin cambiar objetivos. kind clasifica la FUENTE necesaria para probar ese fragmento, no la modalidad de respuesta. repository_search acredita metadatos Git o preparacion de contexto; repository_source acredita contenido leido o resultados documentados de pruebas. Explicar tests aprobados necesita repository_source; mensajes de commits no prueban tests. Una explicacion requiere evidencia suficiente para redactar, no una respuesta final ya emitida. Usa constraint para prohibiciones. No muevas requisitos entre fragmentos ni evalues cumplimiento.'},
 {role:'system',content:'FRAGMENTOS_ORIGINALES='+JSON.stringify(scopes)},
 {role:'system',content:JSON.stringify(catalog.map(t=>({name:t.name,evidenceKinds:t.evidenceKinds})))},
 {role:'system',content:'PEDIDO_ORIGINAL='+JSON.stringify(instruction)},
 {role:'user',content:'FRAGMENTO_ACTUAL='+JSON.stringify(scope)}];
 for(let attempt=0;attempt<2;attempt++){
  const response=await ai.models.generateContent({model,contents:instruction,config:{
   semanticStage:'REPOSITORY_OBJECTIVE_CONTRACT',temperature:0,maxOutputTokens:192,chatMessages:messages,
   responseMimeType:'application/json',responseJsonSchema:{type:'object',properties:{scopes:{type:'object',
    properties:Object.fromEntries([scope].map(scope=>[scope.id,{type:'object',properties:{
     scope:{type:'string',enum:[scope.text]},kind:{type:'string',enum:[...kinds,'constraint']}},
     required:['scope','kind'],additionalProperties:false}])),
    required:[scope.id],additionalProperties:false}},required:['scopes'],additionalProperties:false}}});
  try{const value=parse(response);validateContract(value,[scope],kinds,catalog,true);assignments[scope.id]=value.scopes[scope.id];break;}catch(error){
   if(attempt || !['REPOSITORY_OBJECTIVES_INCOMPLETE','REPOSITORY_OBJECTIVES_UNGROUNDED'].includes(error.message))throw error;
   messages.splice(messages.length-1,0,{role:'system',content:'CLASIFICACION_RECHAZADA='+JSON.stringify(error.evidence)+'. Clasifica todos los IDs del contrato nativo sin alterar texto ni permisos.'});
  }
 }
 }
 return validateContract({scopes:assignments},scopes,kinds,catalog);
}
module.exports={extractRepositoryObjectives};
