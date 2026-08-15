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

orchestrator = Path('gestia-core/jarvis/jarvis.mission.orchestrator.js')
text = orchestrator.read_text()
pattern = re.compile(
    r'\s*const verifiedContractSatisfied =\s*contractSatisfied &&\s*mission\.requiredToolNames\.length > 0 &&\s*mission\.completedTasks\.length > 0;\s*'
    r'mission\.reason = \(\s*plan\?\.missionComplete === true \|\|\s*verifiedContractSatisfied\s*\) && contractSatisfied\s*'
    r'\? mission\.blockedTasks\.length > 0\s*\? "PARTIAL_CAPABILITY_BLOCKED"\s*:\s*"ALL_EXECUTABLE_TASKS_COMPLETED"\s*'
    r': contractSatisfied\s*\? "PLANNER_NO_EXECUTABLE_PLAN"\s*:\s*"MISSION_CONTRACT_INCOMPLETE";',
    re.S,
)
replacement = '''
                mission.reason =
                    plan?.missionComplete === true &&
                    contractSatisfied
                        ? mission.blockedTasks.length > 0
                            ? "PARTIAL_CAPABILITY_BLOCKED"
                            : "ALL_EXECUTABLE_TASKS_COMPLETED"
                        : contractSatisfied
                            ? "SEMANTIC_COMPLETION_AUDIT_REQUIRED"
                            : "MISSION_CONTRACT_INCOMPLETE";'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('VERIFIED_CONTRACT_SHORTCUT_NOT_FOUND')
orchestrator.write_text(text)

test = Path('tests/jarvis-mission-contract-authority-closeout.test.mjs')
test.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { __test as plannerTest } from '../gestia-core/jarvis/jarvis.multifunction.planner.js';
import { runJarvisMission } from '../gestia-core/jarvis/jarvis.mission.orchestrator.js';

const exact='https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004';

function jsonResponse(status, body){
  return {
    ok:status>=200 && status<300,
    status,
    headers:{get(){return null;}},
    async text(){return JSON.stringify(body);}
  };
}

test('MISSION_CONTRACT uses the audited cloud planner before browser fallback',async()=>{
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
        {name:'marketing.plan',args:{productionRequested:false}}
      ]
    }});
  };
  try{
    const plan=await plannerTest.callMissionContractCoverageAuthority(
      'Investiga la publicación exacta y después crea una propuesta de marketing basada únicamente en hechos verificados.',
      [],
      {phase:'MISSION_CONTRACT',existingInitialTools:['web.research']}
    );
    assert.deepEqual(plan.toolCalls.map(x=>x.name),['web.research','web.media.collect','marketing.plan']);
    assert.equal(urls.length,1);
    assert.equal(urls.some(url=>url.includes('text.pollinations.ai')),false);
  } finally {
    globalThis.auth=oldAuth;
    globalThis.fetch=oldFetch;
  }
});

test('browser planner is only fallback when audited cloud planner is unavailable',async()=>{
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

test('finishing a reduced required list cannot self-certify the original mission',async()=>{
  const result=await runJarvisMission({
    instruction:'Investigación compleja que necesita auditoría semántica final.',
    initialToolCalls:[{name:'web.research',args:{query:'entidad',researchGoal:'RESEARCH_1'}}],
    requiredToolNames:['web.research'],
    maximumSteps:4,
    timeoutMs:5000,
    execute:async()=>({
      ok:true,
      executionOk:true,
      objectiveSatisfied:true,
      blocked:false,
      retryable:false,
      requiresInput:false,
      requiresApproval:false,
      status:'GROUNDED',
      validSources:[{title:'Fuente',url:'https://example.com'}]
    }),
    planner:async()=>({toolCalls:[],missionComplete:false})
  });
  assert.equal(result.status,'PARTIAL');
  assert.equal(result.reason,'SEMANTIC_COMPLETION_AUDIT_REQUIRED');
});

test('semantic completion audit can explicitly certify a satisfied contract',async()=>{
  const result=await runJarvisMission({
    instruction:'Investigación simple certificada semánticamente.',
    initialToolCalls:[{name:'web.research',args:{query:'entidad',researchGoal:'RESEARCH_1'}}],
    requiredToolNames:['web.research'],
    maximumSteps:4,
    timeoutMs:5000,
    execute:async()=>({
      ok:true,
      executionOk:true,
      objectiveSatisfied:true,
      blocked:false,
      retryable:false,
      requiresInput:false,
      requiresApproval:false,
      status:'GROUNDED',
      validSources:[{title:'Fuente',url:'https://example.com'}]
    }),
    planner:async()=>({toolCalls:[],missionComplete:true})
  });
  assert.equal(result.status,'COMPLETED');
  assert.equal(result.reason,'ALL_EXECUTABLE_TASKS_COMPLETED');
});

test('runtime no longer recovers a failed mission contract from the initial seed',()=>{
  const core=fs.readFileSync(new URL('../gestia-core/gestia-core.js',import.meta.url),'utf8');
  assert.doesNotMatch(core,/MISSION_CONTRACT_RECOVERED_FROM_INITIAL_PLAN/);
  assert.match(core,/MISSION_CONTRACT_UNAVAILABLE/);
  const orchestrator=fs.readFileSync(new URL('../gestia-core/jarvis/jarvis.mission.orchestrator.js',import.meta.url),'utf8');
  assert.doesNotMatch(orchestrator,/verifiedContractSatisfied/);
  assert.match(orchestrator,/SEMANTIC_COMPLETION_AUDIT_REQUIRED/);
});
''')

print('MISSION_CONTRACT_AUTHORITY_INJECTED=true')
