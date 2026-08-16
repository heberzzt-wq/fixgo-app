from pathlib import Path
import re

planner = Path('gestia-core/jarvis/jarvis.multifunction.planner.js')
text = planner.read_text()

cert_pattern = re.compile(
    r'function cloudMissionContractPolicyCertified\(plan = null\) \{.*?\n\}\n\n',
    re.S,
)
text, cert_count = cert_pattern.subn('', text, count=1)
if cert_count != 1:
    raise SystemExit(f'CLOUD_SELF_CERT_HELPER_COUNT:{cert_count}')

authority_pattern = re.compile(
    r'async function callMissionContractCoverageAuthority\(input = "", catalog = \[\], missionState = null\) \{.*?\n\}\n\nasync function callBrowserSemanticPlan',
    re.S,
)
authority_replacement = r'''async function callMissionContractCoverageAuthority(input = "", catalog = [], missionState = null) {
    let cloudError = null;
    try {
        const cloudPlan = await callSemanticPlanner(
            input,
            catalog,
            missionState
        );

        try {
            return await callCloudMissionContractPolicyAudit(
                input,
                catalog,
                missionState,
                cloudPlan
            );
        }
        catch(policyAuditError) {
            throw new Error(
                `MISSION_CONTRACT_CLOUD_POLICY_UNVERIFIED__AUDIT_${policyAuditError?.message || "FAILED"}`
            );
        }
    }
    catch (error) {
        cloudError = error;
    }

    try {
        const browserPlan = await callBrowserMissionContract(
            input,
            catalog,
            missionState
        );
        return {
            ...browserPlan,
            missionContractCapabilities: {
                exactMediaEvidenceSemantics: true,
                physicalArtifactCompletionSemantics: true,
                policySource: "current-browser-semantic-contract"
            },
            recoveredFromCloudError:
                cloudError?.message ||
                "SEMANTIC_PLANNER_UNAVAILABLE"
        };
    }
    catch (browserError) {
        throw new Error(
            `MISSION_CONTRACT_COVERAGE_UNAVAILABLE_CLOUD_${cloudError?.message || "FAILED"}__BROWSER_${browserError?.message || "FAILED"}`
        );
    }
}

async function callBrowserSemanticPlan'''
text, authority_count = authority_pattern.subn(
    lambda _match: authority_replacement,
    text,
    count=1,
)
if authority_count != 1:
    raise SystemExit(f'ALWAYS_AUDITED_AUTHORITY_COUNT:{authority_count}')

planner.write_text(text)

policy_test = Path('tests/jarvis-mission-contract-policy-compat-v3.test.mjs')
policy = policy_test.read_text()
old_title = "test('certified cloud contract remains primary without policy audit or browser fallback',async()=>{"
new_title = "test('every cloud mission-contract draft is policy-audited before execution',async()=>{"
if policy.count(old_title) != 1:
    raise SystemExit(f'POLICY_SELF_CERT_TEST_TITLE_COUNT:{policy.count(old_title)}')
policy = policy.replace(old_title, new_title, 1)

old_audit = "    if(value.includes('jarvisSemanticRespond')) auditCalls+=1;"
new_audit = """    if(value.includes('jarvisSemanticRespond')){\n      auditCalls+=1;\n      return response(200,{result:{\n        ok:true,\n        status:'SEMANTIC_RESPONSE_READY',\n        provider:'vertex-adc',\n        model:'gemini-2.5-flash',\n        message:JSON.stringify({\n          toolCalls:[\n            {name:'web.research',args:{query:'Taquería El Dorado',researchGoal:'RESEARCH_1'}},\n            {name:'marketing.plan',args:{productionRequested:false}}\n          ],\n          missionComplete:false,\n          completionAssessment:{coverage:'complete'}\n        })\n      }});\n    }"""
if policy.count(old_audit) != 1:
    raise SystemExit(f'POLICY_AUDIT_BRANCH_COUNT:{policy.count(old_audit)}')
policy = policy.replace(old_audit, new_audit, 1)

old_assert = '    assert.equal(auditCalls,0);'
new_assert = '    assert.equal(auditCalls,1);'
if policy.count(old_assert) != 1:
    raise SystemExit(f'POLICY_AUDIT_ASSERT_COUNT:{policy.count(old_assert)}')
policy = policy.replace(old_assert, new_assert, 1)
policy_test.write_text(policy)

regression = Path('tests/jarvis-mission-contract-no-self-certification-v3.test.mjs')
regression.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { __test as plannerTest } from '../gestia-core/jarvis/jarvis.multifunction.planner.js';

const exact='https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004';

function response(status, body){
  return {
    ok:status>=200 && status<300,
    status,
    headers:{get(){return null;}},
    async text(){return JSON.stringify(body);},
    async json(){return body;}
  };
}

const catalog=[
  {name:'web.research',description:'Investigación web con fuentes',inputSchema:{type:'object',properties:{query:{type:'string'},researchGoal:{type:'string'},seedUrl:{type:'string'},allowedDomain:{type:'string'}}}},
  {name:'web.media.collect',description:'Recolecta bytes exactos de una fuente web sin analizar contenido',inputSchema:{type:'object',properties:{url:{type:'string'},requireAnyVisual:{type:'boolean'}}}},
  {name:'media.analyze',description:'Analiza contenido multimedia real y extrae evidencia verificable',inputSchema:{type:'object',properties:{sourceOutput:{type:'string'}}}},
  {name:'marketing.plan',description:'Crea estrategia de marketing basada en evidencia',inputSchema:{type:'object',properties:{productionRequested:{type:'boolean'}}}},
  {name:'reel.plan',description:'Planifica un reel',inputSchema:{type:'object',properties:{}}},
  {name:'reel.create',description:'Crea un archivo final de reel',userArtifact:true,inputSchema:{type:'object',properties:{}}}
];

test('a reduced cloud draft cannot self-certify and bypass the semantic policy audit',async()=>{
  const oldAuth=globalThis.auth;
  const oldFetch=globalThis.fetch;
  let plannerCalls=0;
  let auditCalls=0;
  let browserCalls=0;
  globalThis.auth={currentUser:{async getIdToken(){return 'token';}}};
  globalThis.fetch=async url=>{
    const value=String(url);
    if(value.includes('jarvisSemanticPlan')){
      plannerCalls+=1;
      return response(200,{result:{
        ok:true,
        status:'SEMANTIC_PLAN_READY',
        provider:'vertex-adc',
        model:'gemini-2.5-flash',
        planKind:'MISSION_CONTRACT_AUDITED',
        missionContractCapabilities:{
          exactMediaEvidenceSemantics:true,
          physicalArtifactCompletionSemantics:true
        },
        missionComplete:false,
        toolCalls:[
          {name:'web.research',args:{query:'Taquería El Dorado',researchGoal:'RESEARCH_1',seedUrl:exact,allowedDomain:'tiktok.com'}},
          {name:'marketing.plan',args:{productionRequested:false}}
        ]
      }});
    }
    if(value.includes('jarvisSemanticRespond')){
      auditCalls+=1;
      return response(200,{result:{
        ok:true,
        status:'SEMANTIC_RESPONSE_READY',
        provider:'vertex-adc',
        model:'gemini-2.5-flash',
        message:JSON.stringify({
          toolCalls:[
            {name:'web.research',args:{query:'Taquería El Dorado',researchGoal:'RESEARCH_1',seedUrl:exact,allowedDomain:'tiktok.com'}},
            {name:'web.media.collect',args:{url:exact,requireAnyVisual:true}},
            {name:'media.analyze',args:{sourceOutput:'web.media.collect'}},
            {name:'marketing.plan',args:{productionRequested:false}}
          ],
          missionComplete:false,
          completionAssessment:{coverage:'complete'}
        })
      }});
    }
    if(value.includes('text.pollinations.ai')){
      browserCalls+=1;
      throw new Error('BROWSER_SHOULD_NOT_RUN');
    }
    throw new Error(`UNEXPECTED_URL:${value}`);
  };
  try{
    const plan=await plannerTest.callMissionContractCoverageAuthority(
      'Investiga esta publicación exacta de TikTok y prepara marketing usando únicamente hechos realmente encontrados.',
      catalog,
      {phase:'MISSION_CONTRACT',existingInitialTools:['web.research','marketing.plan']}
    );
    assert.equal(plannerCalls,1);
    assert.equal(auditCalls,1);
    assert.equal(browserCalls,0);
    assert.deepEqual(
      plan.toolCalls.map(item=>item.name),
      ['web.research','web.media.collect','media.analyze','marketing.plan']
    );
    assert.equal(plan.missionContractCapabilities.policySource,'cloud-semantic-response-audit-v1');
  } finally {
    globalThis.auth=oldAuth;
    globalThis.fetch=oldFetch;
  }
});

test('mission contract authority has no cloud-draft self-certification bypass',()=>{
  const source=fs.readFileSync(new URL('../gestia-core/jarvis/jarvis.multifunction.planner.js',import.meta.url),'utf8');
  assert.equal(source.includes('cloudMissionContractPolicyCertified'),false);
  const a=source.indexOf('async function callMissionContractCoverageAuthority');
  const b=source.indexOf('async function callBrowserSemanticPlan',a);
  assert.ok(a>=0 && b>a);
  const block=source.slice(a,b);
  const p=block.indexOf('callSemanticPlanner');
  const q=block.indexOf('callCloudMissionContractPolicyAudit');
  const r=block.indexOf('callBrowserMissionContract');
  assert.ok(p>=0 && q>p && r>q);
  assert.equal(block.includes('return cloudPlan'),false);
  for(const forbidden of ['tiktok.com','Taquería El Dorado','web.research','web.media.collect','media.analyze','marketing.plan','reel.plan','reel.create']){
    assert.equal(block.includes(forbidden),false,`static routing leaked: ${forbidden}`);
  }
});
''')

print('MISSION_CONTRACT_CLOUD_DRAFT_ALWAYS_AUDITED=true')
print('MISSION_CONTRACT_SELF_CERTIFICATION_BYPASS_REMOVED=true')
