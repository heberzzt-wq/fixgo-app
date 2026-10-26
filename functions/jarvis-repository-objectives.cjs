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
 return scopes.map((text,index)=>({id:'scope_'+index,text}));
}
function validateContract(value,scopes,kinds){
 const assignments=value?.scopes,keys=scopes.map(scope=>scope.id);
 if(!assignments||typeof assignments!=='object'||Array.isArray(assignments)||
  Object.keys(value).some(key=>key!=='scopes')||Object.keys(assignments).some(key=>!keys.includes(key)))
  throw failure('REPOSITORY_OBJECTIVES_UNGROUNDED',{receivedKeys:Object.keys(value||{})});
 const missing=keys.filter(key=>!Object.hasOwn(assignments,key));
 if(missing.length)throw failure('REPOSITORY_OBJECTIVES_INCOMPLETE',{missingScopes:missing});
 const invalid=keys.filter(key=>!kinds.includes(assignments[key])&&assignments[key]!=='constraint');
 if(invalid.length)throw failure('REPOSITORY_OBJECTIVES_UNGROUNDED',{invalidScopes:invalid});
 const goals=scopes.filter(scope=>assignments[scope.id]!=='constraint');
 if(!goals.length)throw failure('REPOSITORY_OBJECTIVES_UNGROUNDED',{reason:'NO_EVIDENCE_OBJECTIVE'});
 return goals.map(scope=>({objective:scope.text,requestQuote:scope.text,requiredEvidenceKind:assignments[scope.id],
  satisfied:false,evidenceTaskIndexes:[],limitation:'Evidencia pendiente de ejecución y validación.'}));
}
async function extractRepositoryObjectives({ai,model,instruction,catalog}) {
 const kinds=[...new Set(catalog.flatMap(t=>t.evidenceKinds||['tool_result']))],scopes=literalScopes(instruction);
 if(!scopes.length)throw failure('REPOSITORY_OBJECTIVES_UNGROUNDED',{reason:'EMPTY_REQUEST'});
 const messages=[{role:'system',content:'Clasifica CADA fragmento literal por la evidencia necesaria para cumplirlo, o constraint si solo contiene prohibiciones o límites. Los IDs conservan el texto original: no lo reescribas ni omitas fragmentos. Usa el pedido completo para resolver pronombres, cantidades y relaciones. repository_search acredita localización, metadatos Git o preparación de contexto; repository_source acredita contenido leído y fuentes de resultados de pruebas. Un nombre de commit no prueba tests aprobados. No evalúes cumplimiento ni inventes resultados.'},
 {role:'system',content:'FRAGMENTOS_ORIGINALES='+JSON.stringify(scopes)},
 {role:'system',content:JSON.stringify(catalog.map(t=>({name:t.name,evidenceKinds:t.evidenceKinds})))},{role:'user',content:instruction}];
 for(let attempt=0;attempt<2;attempt++){
  const response=await ai.models.generateContent({model,contents:instruction,config:{
   semanticStage:'REPOSITORY_OBJECTIVE_CONTRACT',temperature:0,maxOutputTokens:256,chatMessages:messages,
   responseMimeType:'application/json',responseJsonSchema:{type:'object',properties:{scopes:{type:'object',
    properties:Object.fromEntries(scopes.map(scope=>[scope.id,{type:'string',enum:[...kinds,'constraint']}])),
    required:scopes.map(scope=>scope.id),additionalProperties:false}},required:['scopes'],additionalProperties:false}}});
  try{return validateContract(parse(response),scopes,kinds);}catch(error){
   if(attempt || !['REPOSITORY_OBJECTIVES_INCOMPLETE','REPOSITORY_OBJECTIVES_UNGROUNDED'].includes(error.message))throw error;
   messages.splice(messages.length-1,0,{role:'system',content:'CLASIFICACION_RECHAZADA='+JSON.stringify(error.evidence)+'. Clasifica todos los IDs del contrato nativo sin alterar texto ni permisos.'});
  }
 }
}
module.exports={extractRepositoryObjectives};
