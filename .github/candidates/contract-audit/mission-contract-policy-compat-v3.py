from pathlib import Path
import re

planner = Path('gestia-core/jarvis/jarvis.multifunction.planner.js')
text = planner.read_text()

old = '''async function callMissionContractCoverageAuthority(input = "", catalog = [], missionState = null) {
    let cloudError = null;
    try {
        return await callSemanticPlanner(
            input,
            catalog,
            missionState
        );
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
'''

new = '''function cloudMissionContractPolicyCertified(plan = null) {
    const capabilities =
        plan?.missionContractCapabilities &&
        typeof plan.missionContractCapabilities === "object"
            ? plan.missionContractCapabilities
            : null;

    return (
        plan?.planKind === "MISSION_CONTRACT_AUDITED" &&
        capabilities?.exactMediaEvidenceSemantics === true &&
        capabilities?.physicalArtifactCompletionSemantics === true
    );
}

async function callMissionContractCoverageAuthority(input = "", catalog = [], missionState = null) {
    let cloudError = null;
    try {
        const cloudPlan = await callSemanticPlanner(
            input,
            catalog,
            missionState
        );

        if (!cloudMissionContractPolicyCertified(cloudPlan)) {
            throw new Error(
                "MISSION_CONTRACT_CLOUD_POLICY_UNVERIFIED"
            );
        }

        return cloudPlan;
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
'''

if text.count(old) != 1:
    raise SystemExit(f'AUTHORITY_HELPER_EXPECTED_ONCE:{text.count(old)}')
text = text.replace(old, new, 1)
planner.write_text(text)

# Cloud-primary remains valid when the backend explicitly certifies support for
# the same semantic policy that Hosting is enforcing. The certificate is a
# capability handshake, not a new mission-contract version.
test = Path('tests/jarvis-mission-contract-authority-closeout-v2.test.mjs')
t = test.read_text()
needle = '''      planKind:'MISSION_CONTRACT_AUDITED',
      missionComplete:false,
      toolCalls:['''
replacement = '''      planKind:'MISSION_CONTRACT_AUDITED',
      missionContractCapabilities:{
        exactMediaEvidenceSemantics:true,
        physicalArtifactCompletionSemantics:true
      },
      missionComplete:false,
      toolCalls:['''
if t.count(needle) != 1:
    raise SystemExit(f'CLOUD_PRIMARY_TEST_ANCHOR_COUNT:{t.count(needle)}')
t = t.replace(needle, replacement, 1)
test.write_text(t)

regression = Path('tests/jarvis-mission-contract-policy-compat-v3.test.mjs')
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
    async text(){return JSON.stringify(body);}
  };
}

const catalog=[
  {name:'web.research',inputSchema:{type:'object',properties:{query:{type:'string'},researchGoal:{type:'string'},seedUrl:{type:'string'},allowedDomain:{type:'string'}}}},
  {name:'web.media.collect',inputSchema:{type:'object',properties:{url:{type:'string'},requireAnyVisual:{type:'boolean'}}}},
  {name:'media.analyze',inputSchema:{type:'object',properties:{sourceOutput:{type:'string'}}}},
  {name:'marketing.plan',inputSchema:{type:'object',properties:{productionRequested:{type:'boolean'},productionArtifacts:{type:'array'}}}},
  {name:'reel.plan',inputSchema:{type:'object',properties:{}}},
  {name:'reel.create',userArtifact:true,inputSchema:{type:'object',properties:{}}}
];

test('cloud success without current semantic-policy certificate falls through to browser coverage',async()=>{
  const oldAuth=globalThis.auth;
  const oldFetch=globalThis.fetch;
  let cloudCalls=0;
  let browserCalls=0;
  globalThis.auth={currentUser:{async getIdToken(){return 'token';}}};
  globalThis.fetch=async url=>{
    const value=String(url);
    if(value.includes('jarvisSemanticPlan')){
      cloudCalls+=1;
      return response(200,{result:{
        ok:true,
        status:'SEMANTIC_PLAN_READY',
        provider:'vertex-adc',
        model:'gemini-2.5-flash',
        planKind:'MISSION_CONTRACT_AUDITED',
        missionComplete:false,
        toolCalls:[
          {name:'web.research',args:{query:'Taquería El Dorado',researchGoal:'RESEARCH_1',seedUrl:exact,allowedDomain:'tiktok.com'}},
          {name:'web.media.collect',args:{url:exact,requireAnyVisual:true}},
          {name:'marketing.plan',args:{productionRequested:true}}
        ]
      }});
    }
    if(value.includes('text.pollinations.ai')){
      browserCalls+=1;
      if(browserCalls===1){
        return response(200,{
          toolCalls:[
            {name:'web.research',args:{query:'Taquería El Dorado',researchGoal:'RESEARCH_1',seedUrl:exact,allowedDomain:'tiktok.com'}},
            {name:'web.media.collect',args:{url:exact,requireAnyVisual:true}},
            {name:'media.analyze',args:{}},
            {name:'marketing.plan',args:{productionRequested:true,productionArtifacts:[{type:'reel',toolName:'reel.create',label:'Reel final'}]}},
            {name:'reel.plan',args:{}},
            {name:'reel.create',args:{}}
          ],
          missionComplete:false
        });
      }
      return response(200,{toolCalls:[],missionComplete:false});
    }
    throw new Error(`UNEXPECTED_URL:${value}`);
  };

  try{
    const plan=await plannerTest.callMissionContractCoverageAuthority(
      'Investiga la publicación exacta, sustenta la campaña en el contenido verificado y entrega el reel final.',
      catalog,
      {phase:'MISSION_CONTRACT',existingInitialTools:['web.research','web.media.collect','marketing.plan']}
    );
    assert.equal(cloudCalls,1);
    assert.equal(browserCalls,2);
    assert.deepEqual(
      plan.toolCalls.map(item=>item.name),
      ['web.research','web.media.collect','media.analyze','marketing.plan','reel.plan','reel.create']
    );
    assert.match(plan.recoveredFromCloudError,/MISSION_CONTRACT_CLOUD_POLICY_UNVERIFIED/);
    assert.equal(plan.missionContractCapabilities.exactMediaEvidenceSemantics,true);
    assert.equal(plan.missionContractCapabilities.physicalArtifactCompletionSemantics,true);
  } finally {
    globalThis.auth=oldAuth;
    globalThis.fetch=oldFetch;
  }
});

test('certified cloud contract remains primary without touching browser fallback',async()=>{
  const oldAuth=globalThis.auth;
  const oldFetch=globalThis.fetch;
  let browserCalls=0;
  globalThis.auth={currentUser:{async getIdToken(){return 'token';}}};
  globalThis.fetch=async url=>{
    const value=String(url);
    if(value.includes('jarvisSemanticPlan')){
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
          {name:'web.research',args:{query:'Taquería El Dorado',researchGoal:'RESEARCH_1'}},
          {name:'marketing.plan',args:{productionRequested:false}}
        ]
      }});
    }
    if(value.includes('text.pollinations.ai')) browserCalls+=1;
    throw new Error(`UNEXPECTED_URL:${value}`);
  };

  try{
    const plan=await plannerTest.callMissionContractCoverageAuthority(
      'Investiga Taquería El Dorado y dame únicamente un plan de marketing.',
      catalog,
      {phase:'MISSION_CONTRACT',existingInitialTools:['web.research','marketing.plan']}
    );
    assert.equal(browserCalls,0);
    assert.deepEqual(plan.toolCalls.map(item=>item.name),['web.research','marketing.plan']);
  } finally {
    globalThis.auth=oldAuth;
    globalThis.fetch=oldFetch;
  }
});

test('policy compatibility gate is semantic metadata only, never static tool routing',()=>{
  const source=fs.readFileSync(new URL('../gestia-core/jarvis/jarvis.multifunction.planner.js',import.meta.url),'utf8');
  const a=source.indexOf('function cloudMissionContractPolicyCertified');
  const b=source.indexOf('async function callBrowserSemanticPlan',a);
  assert.ok(a>=0 && b>a);
  const block=source.slice(a,b);
  assert.match(block,/missionContractCapabilities/);
  assert.match(block,/exactMediaEvidenceSemantics/);
  assert.match(block,/physicalArtifactCompletionSemantics/);
  for(const forbidden of ['tiktok.com','Taquería El Dorado','web.research','web.media.collect','media.analyze','marketing.plan','reel.plan','reel.create']){
    assert.equal(block.includes(forbidden),false,`static routing leaked: ${forbidden}`);
  }
});
''')

print('MISSION_CONTRACT_POLICY_COMPAT_V3_INJECTED=true')
