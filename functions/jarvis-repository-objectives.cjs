'use strict';
function parse(response) {
 if(response?.providerResponse?.finishReason==='length')throw Error('REPOSITORY_OBJECTIVES_TRUNCATED');
 try{return JSON.parse(response.text);}catch{throw Error('REPOSITORY_OBJECTIVES_INVALID_JSON');}
}
async function extractRepositoryObjectives({ai,model,instruction,catalog}) {
 const kinds=[...new Set(catalog.flatMap(t=>t.evidenceKinds||['tool_result']))];
 const response=await ai.models.generateContent({model,contents:instruction,config:{
 semanticStage:'REPOSITORY_OBJECTIVE_CONTRACT',temperature:0,maxOutputTokens:768,
 chatMessages:[{role:'system',content:'Extrae objetivos independientes de la solicitud. Conserva cantidades, relaciones y condiciones. requestQuote debe ser una cita literal exacta de la solicitud. No inventes objetivos ni resultados. Clasifica evidencia usando SOLO los tipos del catalogo. No evalúes cumplimiento.'},
 {role:'system',content:JSON.stringify(catalog.map(t=>({name:t.name,evidenceKinds:t.evidenceKinds})))},{role:'user',content:instruction}],
 responseMimeType:'application/json',responseJsonSchema:{type:'object',properties:{objectives:{type:'array',minItems:1,maxItems:8,items:{type:'object',properties:{
 objective:{type:'string',minLength:1,maxLength:240},requestQuote:{type:'string',minLength:1,maxLength:600},
 requiredEvidenceKind:{type:'string',enum:kinds}},required:['objective','requestQuote','requiredEvidenceKind'],additionalProperties:false}}},required:['objectives'],additionalProperties:false}}});
 const goals=parse(response).objectives;
 if(!Array.isArray(goals)||!goals.length||goals.length>8||new Set(goals.map(g=>g.objective)).size!==goals.length||
 goals.some(g=>!g.objective?.trim()||!g.requestQuote?.trim()||!instruction.includes(g.requestQuote)||!kinds.includes(g.requiredEvidenceKind)))
 throw Error('REPOSITORY_OBJECTIVES_UNGROUNDED');
 return goals.map(g=>({...g,satisfied:false,evidenceTaskIndexes:[],limitation:'Evidencia pendiente de ejecución y validación.'}));
}
module.exports={extractRepositoryObjectives};
