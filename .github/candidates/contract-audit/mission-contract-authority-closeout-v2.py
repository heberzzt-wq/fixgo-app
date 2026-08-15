from pathlib import Path
import re

planner = Path('gestia-core/jarvis/jarvis.multifunction.planner.js')
text = planner.read_text()
pattern = re.compile(
    r'async function callMissionContractCoverageAuthority\(input = "", catalog = \[\], missionState = null\) \{.*?\n\}\n\nasync function callBrowserSemanticPlan',
    re.S,
)
replacement = '''async function callMissionContractCoverageAuthority(input = "", catalog = [], missionState = null) {
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

async function callBrowserSemanticPlan'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('MISSION_CONTRACT_AUTHORITY_HELPER_NOT_FOUND')
planner.write_text(text)

core = Path('gestia-core/gestia-core.js')
text = core.read_text()
pattern = re.compile(
    r'\s*\} catch \(contractError\) \{\s*console\.warn\("\[MISSION_CONTRACT_RECOVERED_FROM_INITIAL_PLAN\]", contractError\);\s*'
    r'const allowedMissionTools = new Set\(missionToolCatalog\.map\(tool => tool\.name\)\);\s*'
    r'missionContractToolCalls = operationalInitialToolCalls\.filter\(\s*call => allowedMissionTools\.has\(call\?\.name\)\s*\);\s*'
    r'if \(missionContractToolCalls\.length === 0\) throw contractError;\s*\}',
    re.S,
)
replacement = '''
    } catch (contractError) {
        console.error("[MISSION_CONTRACT_UNAVAILABLE]", contractError);
        throw contractError;
    }'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('INITIAL_PLAN_RECOVERY_BLOCK_NOT_FOUND')
core.write_text(text)

# The prior mission-flow regression encoded the temporary architecture where
# browser coverage replaced the cloud audited contract. The real server already
# performs MISSION_CONTRACT + coverage audit, so update that regression to the
# correct authority order instead of treating cloud planning as stale.
flow_test = Path('tests/jarvis-mission-flow-contract-closeout.test.mjs')
text = flow_test.read_text()
pattern = re.compile(
    r"test\('MISSION_CONTRACT path cannot silently fall back to the stale cloud contract',\(\)=>\{.*?\n\}\);",
    re.S,
)
replacement = r'''test('MISSION_CONTRACT keeps audited cloud authority primary with browser coverage as fallback',()=>{
  const source=fs.readFileSync(new URL('../gestia-core/jarvis/jarvis.multifunction.planner.js',import.meta.url),'utf8');
  const helperStart=source.indexOf('async function callMissionContractCoverageAuthority');
  const helperEnd=source.indexOf('async function callBrowserSemanticPlan',helperStart);
  const helper=source.slice(helperStart,helperEnd);
  assert.ok(helperStart>=0 && helperEnd>helperStart);
  assert.match(helper,/callSemanticPlanner/);
  assert.match(helper,/callBrowserMissionContract/);
  assert.ok(helper.indexOf('callSemanticPlanner') < helper.indexOf('callBrowserMissionContract'));
  const plannerStart=source.indexOf('const contractPlanner = context?.missionState?.phase === "MISSION_CONTRACT"');
  const plannerEnd=source.indexOf(': context.semanticPlanner;',plannerStart)+': context.semanticPlanner;'.length;
  const block=source.slice(plannerStart,plannerEnd);
  assert.match(block,/callMissionContractCoverageAuthority/);
});'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('STALE_FLOW_AUTHORITY_TEST_NOT_FOUND')
flow_test.write_text(text)

test = Path('tests/jarvis-mission-contract-authority-closeout-v2.test.mjs')
test.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { __test as plannerTest } from '../gestia-core/jarvis/jarvis.multifunction.planner.js';

const exact='https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004';

function jsonResponse(status, body){
  return {
    ok:status>=200 && status<300,
    status,
    headers:{get(){return null;}},
    async text(){return JSON.stringify(body);}
  };
}

test('audited cloud mission contract is primary and preserves the full research-marketing chain',async()=>{
  const oldAuth=globalThis.auth;
  const oldFetch=globalThis.fetch;
  const urls=[];
  globalThis.auth={currentUser:{async getIdToken(){return 'token';}}};
  globalThis.fetch=async url=>{
    urls.push(String(url));
    assert.match(String(url),/jarvisSemanticPlan/);
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
        {name:'media.analyze',args:{}},
        {name:'marketing.plan',args:{productionRequested:false,factsOnly:true}}
      ]
    }});
  };
  try{
    const plan=await plannerTest.callMissionContractCoverageAuthority(
      'Investiga la publicación exacta y después crea una propuesta de marketing basada únicamente en hechos verificados.',
      [],
      {phase:'MISSION_CONTRACT',existingInitialTools:['web.research']}
    );
    assert.deepEqual(plan.toolCalls.map(x=>x.name),['web.research','web.media.collect','media.analyze','marketing.plan']);
    assert.equal(urls.length,1);
    assert.equal(urls.some(url=>url.includes('text.pollinations.ai')),false);
  } finally {
    globalThis.auth=oldAuth;
    globalThis.fetch=oldFetch;
  }
});

test('browser coverage is used only after cloud contract failure',async()=>{
  const oldAuth=globalThis.auth;
  const oldFetch=globalThis.fetch;
  let cloudCalls=0;
  let browserCalls=0;
  globalThis.auth={currentUser:{async getIdToken(){return 'token';}}};
  globalThis.fetch=async url=>{
    const value=String(url);
    if(value.includes('jarvisSemanticPlan')){
      cloudCalls+=1;
      return jsonResponse(400,{error:{message:'cloud unavailable'}});
    }
    if(value.includes('text.pollinations.ai')){
      browserCalls+=1;
      if(browserCalls===1){
        return jsonResponse(200,{
          toolCalls:[
            {name:'web.research',args:{query:'Taquería El Dorado Cancún',researchGoal:'RESEARCH_1'}},
            {name:'web.media.collect',args:{url:exact}},
            {name:'marketing.plan',args:{productionRequested:false}}
          ],
          missionComplete:false
        });
      }
      return jsonResponse(200,{toolCalls:[],missionComplete:false});
    }
    throw new Error(`UNEXPECTED_URL:${value}`);
  };
  const catalog=[
    {name:'web.research',inputSchema:{type:'object',required:['query','researchGoal'],properties:{query:{type:'string'},researchGoal:{type:'string'}}}},
    {name:'web.media.collect',inputSchema:{type:'object',properties:{url:{type:'string'}}}},
    {name:'marketing.plan',inputSchema:{type:'object',properties:{productionRequested:{type:'boolean'}}}}
  ];
  try{
    const plan=await plannerTest.callMissionContractCoverageAuthority(
      'Investiga la publicación exacta y crea una propuesta de marketing.',
      catalog,
      {phase:'MISSION_CONTRACT',existingInitialTools:['web.research']}
    );
    assert.equal(cloudCalls,1);
    assert.equal(browserCalls,2);
    assert.deepEqual(plan.toolCalls.map(x=>x.name),['web.research','web.media.collect','marketing.plan']);
    assert.match(plan.recoveredFromCloudError,/cloud unavailable/i);
  } finally {
    globalThis.auth=oldAuth;
    globalThis.fetch=oldFetch;
  }
});

test('failed mission contract can never degrade to the initial web.research seed',()=>{
  const core=fs.readFileSync(new URL('../gestia-core/gestia-core.js',import.meta.url),'utf8');
  assert.doesNotMatch(core,/MISSION_CONTRACT_RECOVERED_FROM_INITIAL_PLAN/);
  assert.doesNotMatch(core,/allowedMissionTools = new Set\(missionToolCatalog/);
  assert.match(core,/MISSION_CONTRACT_UNAVAILABLE/);
});

test('existing completion compatibility remains intact after authority correction',()=>{
  const orchestrator=fs.readFileSync(new URL('../gestia-core/jarvis/jarvis.mission.orchestrator.js',import.meta.url),'utf8');
  assert.match(orchestrator,/verifiedContractSatisfied/);
  assert.match(orchestrator,/PLANNER_NO_EXECUTABLE_PLAN/);
});
''')

print('MISSION_CONTRACT_AUTHORITY_V2_INJECTED=true')
