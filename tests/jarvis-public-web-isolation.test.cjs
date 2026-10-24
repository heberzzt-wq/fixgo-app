'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {runJarvisSemanticPlanner} = require('../functions/jarvis-semantic-planner');
const catalog = [
  {name:'web.research',description:'Research public web pages',investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}},
  {name:'repo.audit',description:'Audit a local repository',investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{target:{type:'string'}},required:['target']}},
  {name:'repo.read',description:'Read repository source',investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}},
  {name:'platform.query',description:'Query operational Firestore records',investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{collection:{type:'string'}},required:['collection']}},
  {name:'conversation.respond',description:'Explain directly',mutates:false,inputSchema:{type:'object',properties:{prompt:{type:'string'}},required:['prompt']}}
];
for(const wantsCode of [false,true]) test('CURRENT_TURN web research respects repository intent: '+wantsCode,async()=>{
  const offered=[];
  const input=wantsCode
    ? 'Busca documentación en internet y revisa el código del repositorio para comprobar el API.'
    : 'Busca en internet la malla curricular y módulos de ingeniería de sistemas de una universidad.';
  await assert.rejects(runJarvisSemanticPlanner({
    input,catalog,missionState:{phase:'CURRENT_TURN'},
    retrieveToolCandidates:async()=>[catalog[1],catalog[0]],
    ai:{models:{generateContent:async request=>{
      if(request.config.semanticStage==='CURRENT_TURN_ACTION_DESCRIPTION')
        return {text:'{"action":"search web for public university program information"}'};
      offered.push(...(request.config.tools?.[0]?.functionDeclarations||[]).map(t=>t.name));
      throw Error('OFFER_OBSERVED');
    }}}
  }),/OFFER_OBSERVED/);
  assert.ok(offered.includes('web.research'),'public web evidence remains available');
  assert.equal(offered.includes('repo.audit'),wantsCode,'repo.audit only when code requested');
  assert.equal(offered.includes('repo.read'),wantsCode,'repository discovery only when code requested');
  assert.equal(offered.includes('platform.query'),wantsCode,'operational records not substituted for public evidence');
});

for(const repoResearch of [false,true]) test('MISSION_CONTRACT isolates source review kind: '+(repoResearch?'repository':'web'),async()=>{
  const offered=[];
  const input=repoResearch
    ? 'Audita el repositorio y lee su código fuente.'
    : 'Investiga en fuentes web el plan de estudios y sus módulos.';
  const result=await runJarvisSemanticPlanner({
    input,catalog,missionState:{phase:'MISSION_CONTRACT'},
    retrieveToolCandidates:async()=>[catalog[1],catalog[0],catalog[2],catalog[3]],
    ai:{lastProvider:'ollama-openai-compatible-local',models:{generateContent:async request=>{
      if(request.config.semanticStage==='MISSION_CONTRACT_OPERATIONS')
        return {text:JSON.stringify({sourceReview:repoResearch?'auditar repositorio':'investigar fuentes web',sourceKind:repoResearch?'repository':'web',work:'',workKind:'none',verification:'',delivery:''})};
      if(request.config.semanticStage==='MISSION_CONTRACT_TOOL_SELECTION'){
        offered.push(...request.config.tools[0].functionDeclarations.map(t=>t.name));
        return {functionCalls:[{name:repoResearch?'repo.audit':'web.research'}]};
      }
      throw Error('UNEXPECTED_STAGE_'+request.config.semanticStage);
    }}}
  });
  assert.ok(offered.includes(repoResearch?'repo.audit':'web.research'));
  assert.equal(offered.includes('repo.audit'),repoResearch);
  if(!repoResearch) assert.equal(offered.includes('platform.query'),false);
  assert.equal(result.planKind,'MISSION_CONTRACT_COMPACT_LOCAL');
});

test('physical grep compaction retains later distinct source candidates',async()=>{
  const {compactRepositoryMatches}=await import('../gestia-core/jarvis/jarvis.mission.planner-state.js');
  const hits=Array.from({length:32},(_,i)=>({file:'module-'+String(i).padStart(2,'0')+'.js',line:i+1,snippet:'observed matching source'}));
  const compact=compactRepositoryMatches(hits);
  assert.equal(compact.length,24);
  assert.ok(compact.some(item=>item.file==='module-16.js'),'the seventeenth observed file is retained');
  assert.equal(compact.some(item=>item.file==='module-25.js'),false,'the compaction budget remains bounded');
});
