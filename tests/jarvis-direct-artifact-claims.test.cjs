const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runJarvisSemanticPlanner}=require('../functions/jarvis-semantic-planner.js');
test('an invented download in direct chat returns to actual tool selection',async()=>{
 const input='Crea un Excel descargable con cable 120, tornillos 80 y transporte 50; total 250 pesos.';
 const sheet={name:'spreadsheet.compose',description:'Crea una hoja de calculo descargable.',mutates:false,userArtifact:true,inputSchema:{type:'object',properties:{prompt:{type:'string'}},required:['prompt']}};
 let calls=0;
 const result=await runJarvisSemanticPlanner({input,catalog:[{name:'conversation.respond',mutates:false},sheet],
  missionState:{phase:'CURRENT_TURN',conversationalGate:true},retrieveToolCandidates:async()=>[sheet],
  ai:{models:{generateContent:async req=>{
   calls++;
   if(calls===1)return {text:'{"mode":"chat","missing":"","question":"","action":""}'};
   if(calls===2)return {text:'Aquí tienes tu Excel: [Descargar](sandbox:/gastos_prueba.xlsx)'};
   if(req.config.semanticStage==='CURRENT_TURN_ACTION_DESCRIPTION')return {text:'{"action":"create downloadable spreadsheet"}'};
   return {text:JSON.stringify({name:'jarvis_tool_0',arguments:{prompt:input}})};
  }}}
 });
 assert.equal(result.toolCalls[0].name,'spreadsheet.compose');
 assert.equal(result.toolCalls[0].args.prompt,input);
 assert.notEqual(result.planKind,'CURRENT_TURN_CONVERSATION_GATE_DIRECT');
});
