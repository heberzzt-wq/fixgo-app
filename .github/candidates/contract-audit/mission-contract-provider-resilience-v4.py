from pathlib import Path
import re

path = Path('tests/jarvis-mission-contract-authority-closeout-v2.test.mjs')
text = path.read_text()

old_helper = '''function jsonResponse(status, body){
  return {
    ok:status>=200 && status<300,
    status,
    headers:{get(){return null;}},
    async text(){return JSON.stringify(body);}
  };
}'''
new_helper = '''function jsonResponse(status, body){
  return {
    ok:status>=200 && status<300,
    status,
    headers:{get(){return null;}},
    async text(){return JSON.stringify(body);},
    async json(){return body;}
  };
}'''
if text.count(old_helper) != 1:
    raise SystemExit(f'AUTHORITY_JSON_RESPONSE_HELPER_COUNT:{text.count(old_helper)}')
text = text.replace(old_helper, new_helper, 1)

pattern = re.compile(
    r"test\('audited cloud mission contract is primary and preserves the full research-marketing chain',async\(\)=>\{.*?\n\}\);\n\ntest\('browser coverage is used only after cloud contract failure'",
    re.S,
)
replacement = r'''test('audited cloud mission contract is primary only after the mandatory cloud policy audit',async()=>{
  const oldAuth=globalThis.auth;
  const oldFetch=globalThis.fetch;
  const urls=[];
  globalThis.auth={currentUser:{async getIdToken(){return 'token';}}};
  globalThis.fetch=async url=>{
    const value=String(url);
    urls.push(value);
    if(value.includes('jarvisSemanticPlan')){
      return jsonResponse(200,{result:{
        ok:true,
        status:'SEMANTIC_PLAN_READY',
        provider:'vertex-adc',
        model:'gemini-2.5-flash',
        planKind:'MISSION_CONTRACT_AUDITED',
        missionComplete:false,
        toolCalls:[
          {name:'web.research',args:{query:'Taquería El Dorado Cancún',researchGoal:'RESEARCH_1'}},
          {name:'web.media.collect',args:{url:exact}},
          {name:'media.analyze',args:{sourceOutput:'web.media.collect'}},
          {name:'marketing.plan',args:{productionRequested:false,factsOnly:true}}
        ]
      }});
    }
    if(value.includes('jarvisSemanticRespond')){
      return jsonResponse(200,{result:{
        ok:true,
        status:'SEMANTIC_RESPONSE_READY',
        provider:'vertex-adc',
        model:'gemini-2.5-flash',
        message:JSON.stringify({
          toolCalls:[
            {name:'web.research',args:{query:'Taquería El Dorado Cancún',researchGoal:'RESEARCH_1'}},
            {name:'web.media.collect',args:{url:exact}},
            {name:'media.analyze',args:{sourceOutput:'web.media.collect'}},
            {name:'marketing.plan',args:{productionRequested:false,factsOnly:true}}
          ],
          missionComplete:false,
          completionAssessment:{coverage:'complete'}
        })
      }});
    }
    throw new Error(`UNEXPECTED_URL:${value}`);
  };
  const catalog=[
    {name:'web.research',description:'Investigación web con fuentes',inputSchema:{type:'object',properties:{query:{type:'string'},researchGoal:{type:'string'}}}},
    {name:'web.media.collect',description:'Recolecta bytes exactos de una fuente web',inputSchema:{type:'object',properties:{url:{type:'string'}}}},
    {name:'media.analyze',description:'Analiza contenido multimedia real',inputSchema:{type:'object',properties:{sourceOutput:{type:'string'}}}},
    {name:'marketing.plan',description:'Crea estrategia basada en evidencia',inputSchema:{type:'object',properties:{productionRequested:{type:'boolean'},factsOnly:{type:'boolean'}}}}
  ];
  try{
    const plan=await plannerTest.callMissionContractCoverageAuthority(
      'Investiga la publicación exacta y después crea una propuesta de marketing basada únicamente en hechos verificados.',
      catalog,
      {phase:'MISSION_CONTRACT',existingInitialTools:['web.research']}
    );
    assert.deepEqual(plan.toolCalls.map(x=>x.name),['web.research','web.media.collect','media.analyze','marketing.plan']);
    assert.equal(urls.filter(url=>url.includes('jarvisSemanticPlan')).length,1);
    assert.equal(urls.filter(url=>url.includes('jarvisSemanticRespond')).length,1);
    assert.equal(urls.some(url=>url.includes('text.pollinations.ai')),false);
    assert.equal(plan.missionContractCapabilities?.policySource,'cloud-semantic-response-audit-v1');
  } finally {
    globalThis.auth=oldAuth;
    globalThis.fetch=oldFetch;
  }
});

test('browser coverage is used only after cloud contract failure' '''
# Preserve the opening async()=>{ that follows the matched test name.
replacement = replacement[:-1] + ",async()=>{"
text, count = pattern.subn(lambda _m: replacement, text, count=1)
if count != 1:
    raise SystemExit(f'LEGACY_CLOUD_PRIMARY_TEST_COUNT:{count}')

path.write_text(text)

print('LEGACY_AUTHORITY_TEST_REQUIRES_CLOUD_POLICY_AUDIT=true')
