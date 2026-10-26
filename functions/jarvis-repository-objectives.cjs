'use strict';
function parse(response) {
 if(response?.providerResponse?.finishReason==='length')throw Error('REPOSITORY_OBJECTIVES_TRUNCATED');
 try{return JSON.parse(response.text);}catch{throw Error('REPOSITORY_OBJECTIVES_INVALID_JSON');}
}
function validateContract(value,instruction,kinds){
 const goals=value?.objectives, constraints=value?.constraints||[];
 if(!Array.isArray(goals)||!goals.length||goals.length>8||!Array.isArray(constraints)||
  new Set(goals.map(g=>g?.requestQuote)).size!==goals.length||
  goals.some(g=>typeof g?.requestQuote!=='string'||!g.requestQuote.trim()||!instruction.includes(g.requestQuote)||!kinds.includes(g.requiredEvidenceKind))||
  constraints.some(q=>typeof q!=='string'||!q.trim()||!instruction.includes(q)))
  throw Error('REPOSITORY_OBJECTIVES_UNGROUNDED');
 // Coverage is lexical only; it never determines intent or proves completion.
 // Literal scopes prevent a free paraphrase from replacing the owner's request.
 const covered=new Uint8Array(instruction.length);
 for(const quote of [...goals.map(g=>g.requestQuote),...constraints]){
  let start=instruction.indexOf(quote);
  while(start!==-1){covered.fill(1,start,start+quote.length);start=instruction.indexOf(quote,start+1);}
 }
 const missing=[...instruction.matchAll(/[\p{L}\p{N}]+/gu)]
  .filter(m=>covered.subarray(m.index,m.index+m[0].length).some(value=>value===0)).map(m=>m[0]);
 if(missing.length)throw Object.assign(Error('REPOSITORY_OBJECTIVES_INCOMPLETE'),{missing});
 return goals.map(g=>({objective:g.requestQuote,requestQuote:g.requestQuote,requiredEvidenceKind:g.requiredEvidenceKind,
  satisfied:false,evidenceTaskIndexes:[],limitation:'Evidencia pendiente de ejecución y validación.'}));
}
async function extractRepositoryObjectives({ai,model,instruction,catalog}) {
 const kinds=[...new Set(catalog.flatMap(t=>t.evidenceKinds||['tool_result']))];
 const messages=[{role:'system',content:'Divide la solicitud en objetivos y restricciones mediante citas LITERALES exactas, sin paráfrasis. Cubre todas las palabras del pedido entre requestQuote y constraints; solo las prohibiciones o límites van en constraints. Conserva cantidades, relaciones, herramientas y condiciones. Si una cita usa un pronombre, incluye su antecedente literal completo; las citas pueden solaparse. Separa requisitos de evidencia distintos. Clasifica por la evidencia necesaria: repository_search para localización, metadatos Git o preparación de contexto; repository_source para contenido leído y fuentes de resultados de pruebas. Un nombre de commit no prueba tests aprobados. Usa SOLO tipos del catálogo. No evalúes cumplimiento ni inventes objetivos.'},
 {role:'system',content:JSON.stringify(catalog.map(t=>({name:t.name,evidenceKinds:t.evidenceKinds})))},{role:'user',content:instruction}];
 for(let attempt=0;attempt<2;attempt++){
  const response=await ai.models.generateContent({model,contents:instruction,config:{
   semanticStage:'REPOSITORY_OBJECTIVE_CONTRACT',temperature:0,maxOutputTokens:768,chatMessages:messages,
   responseMimeType:'application/json',responseJsonSchema:{type:'object',properties:{
    objectives:{type:'array',minItems:1,maxItems:8,items:{type:'object',properties:{
     requestQuote:{type:'string',minLength:1,maxLength:1200},requiredEvidenceKind:{type:'string',enum:kinds}},
     required:['requestQuote','requiredEvidenceKind'],additionalProperties:false}},
    constraints:{type:'array',maxItems:8,items:{type:'string',minLength:1,maxLength:1200}}
   },required:['objectives','constraints'],additionalProperties:false}}});
  const value=parse(response);
  try{return validateContract(value,instruction,kinds);}catch(error){
   if(attempt || !['REPOSITORY_OBJECTIVES_INCOMPLETE','REPOSITORY_OBJECTIVES_UNGROUNDED'].includes(error.message))throw error;
   messages.splice(messages.length-1,0,{role:'system',content:'CONTRATO_RECHAZADO='+JSON.stringify({reason:error.message,
    missingWords:error.missing||[],previous:value})+'. Corrige las citas y cubre el pedido completo; no cambies el pedido ni declares éxito.'});
  }
 }
}
module.exports={extractRepositoryObjectives};
