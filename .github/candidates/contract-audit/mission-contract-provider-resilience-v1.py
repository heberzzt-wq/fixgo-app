from pathlib import Path
import re

planner = Path('gestia-core/jarvis/jarvis.multifunction.planner.js')
text = planner.read_text()

helper_pattern = re.compile(
    r'function cloudMissionContractPolicyCertified\(plan = null\) \{.*?\n\}\n\nasync function callMissionContractCoverageAuthority\(input = "", catalog = \[\], missionState = null\) \{.*?\n\}\n\nasync function callBrowserSemanticPlan',
    re.S,
)

helper_replacement = r'''function cloudMissionContractPolicyCertified(plan = null) {
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

function missionContractPolicyAuditCatalog(catalog = []) {
    return (Array.isArray(catalog) ? catalog : [])
        .slice(0, 80)
        .map(tool => ({
            name: String(tool?.name || ""),
            description: String(tool?.description || "").slice(0, 500),
            mutates: tool?.mutates === true,
            requiresApproval: tool?.requiresApproval === true,
            userArtifact: tool?.userArtifact === true,
            inputSchema:
                tool?.inputSchema &&
                typeof tool.inputSchema === "object"
                    ? tool.inputSchema
                    : null
        }))
        .filter(tool => tool.name);
}

function missionContractPolicyAuditPrompt(
    input = "",
    catalog = [],
    cloudPlan = null
) {
    const instruction = String(input || "");
    const boundedInstruction = instruction.length <= 12000
        ? instruction
        : `${instruction.slice(0, 8000)}\n[PARTE_MEDIA_PERSISTIDA]\n${instruction.slice(-3500)}`;
    const draft = {
        toolCalls:
            Array.isArray(cloudPlan?.toolCalls)
                ? cloudPlan.toolCalls.slice(0, 20)
                : [],
        completionAssessment:
            cloudPlan?.completionAssessment ||
            null
    };

    return [
        "AUDITORIA SEMANTICA DE COBERTURA DEL CONTRATO DE MISION DE JARVIS.",
        GENERALIST_CURRENT_TURN_POLICY,
        "La INSTRUCCION_ORIGINAL_INMUTABLE es la autoridad primaria. No la reformules, no inventes entregables y no agregues capacidades adyacentes solo porque existan en el catalogo.",
        "Audita por significado, no por listas de palabras ni patrones lexicales. Conserva cada sujeto, pregunta y entregable independiente realmente solicitado.",
        "EVIDENCIA MULTIMEDIA: obtener, descargar, recolectar o conservar bytes de una fuente no equivale a analizar su contenido. Si un entregable posterior depende de hechos, atributos, escenas, audio, texto visible u otras afirmaciones sobre el contenido de una fuente multimedia, el contrato debe conservar en el orden correcto la herramienta especializada del catalogo que analiza ese contenido antes del entregable dependiente. Si el contenido no necesita interpretarse, no agregues analisis por rutina.",
        "ARTEFACTOS FISICOS: un plan, brief, storyboard, especificacion o archivo fuente no equivale a un archivo final creado. Si la instruccion pide producir o entregar un artefacto final real, conserva la herramienta de plan/composicion necesaria y tambien la herramienta de creacion correspondiente. Si la instruccion pide solamente estrategia, asesoria o un plan, no conviertas eso en produccion fisica.",
        "Distingue siempre evidencia de propuesta: una estrategia puede proponer ideas, pero hechos verificables y afirmaciones sobre una fuente deben estar sustentados por la evidencia realmente analizada o investigada.",
        "Devuelve un CONTRATO COMPLETO CORREGIDO, no solamente un delta. Conserva del BORRADOR_CLOUD toda llamada que siga justificada, agrega las faltantes y ordena las llamadas segun sus dependencias semanticas.",
        "Selecciona exclusivamente nombres exactos del CATALOGO. No autorices escrituras de repositorio, publicacion ni despliegue. Las herramientas userArtifact solo se incluyen cuando el usuario realmente pidio ese entregable.",
        "Devuelve solamente un objeto JSON valido con toolCalls, missionComplete=false y completionAssessment. Cada toolCall contiene name, args y reason.",
        `CATALOGO=${JSON.stringify(missionContractPolicyAuditCatalog(catalog))}`,
        `BORRADOR_CLOUD=${JSON.stringify(draft).slice(0, 18000)}`,
        `INSTRUCCION_ORIGINAL_INMUTABLE=${boundedInstruction}`
    ].join("\n");
}

async function callCloudMissionContractPolicyAudit(
    input = "",
    catalog = [],
    missionState = null,
    cloudPlan = null
) {
    const user =
        globalThis?.auth?.currentUser ||
        globalThis?.window?.auth?.currentUser ||
        null;
    if (!user) {
        throw new Error("MISSION_CONTRACT_POLICY_AUDIT_AUTH_REQUIRED");
    }

    const token = await user.getIdToken();
    const controller = new AbortController();
    const timer = setTimeout(
        () => controller.abort(),
        CLOUD_MISSION_CONTRACT_TIMEOUT_MS
    );

    try {
        const response = await fetch(
            "https://us-central1-fixgo-44e4d.cloudfunctions.net/jarvisSemanticRespond",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    data: {
                        input: missionContractPolicyAuditPrompt(
                            input,
                            catalog,
                            cloudPlan
                        ),
                        maxOutputTokens: 5000
                    }
                }),
                signal: controller.signal
            }
        );
        const payload = await response.json().catch(() => ({}));
        const result = payload?.result || payload?.data;
        if (!response.ok || !result?.ok) {
            throw new Error(
                payload?.error?.message ||
                result?.error ||
                `MISSION_CONTRACT_POLICY_AUDIT_HTTP_${response.status}`
            );
        }

        const auditPayload = extractJsonObject(
            String(result?.message || "")
        );
        if (!Array.isArray(auditPayload?.toolCalls)) {
            throw new Error("MISSION_CONTRACT_POLICY_AUDIT_TOOL_CALLS_REQUIRED");
        }

        const auditedCalls = trustedPlanCalls(
            {
                ...auditPayload,
                planKind: "MISSION_CONTRACT_AUDIT"
            },
            catalog,
            {
                originalInstruction:
                    String(input || "")
            }
        );

        if (
            auditedCalls.length === 0 &&
            Array.isArray(cloudPlan?.toolCalls) &&
            cloudPlan.toolCalls.length > 0
        ) {
            throw new Error("MISSION_CONTRACT_POLICY_AUDIT_EMPTY");
        }

        return {
            ...cloudPlan,
            toolCalls: auditedCalls,
            completionAssessment: {
                draft:
                    cloudPlan?.completionAssessment ||
                    null,
                currentPolicyCoverageAudit:
                    auditPayload?.completionAssessment ||
                    null
            },
            missionComplete: false,
            ok: true,
            status: "SEMANTIC_PLAN_READY",
            planKind: "MISSION_CONTRACT_AUDITED",
            missionContractCapabilities: {
                exactMediaEvidenceSemantics: true,
                physicalArtifactCompletionSemantics: true,
                policySource: "cloud-semantic-response-audit-v1"
            },
            policyAuditedCloudProvider:
                result?.provider ||
                cloudPlan?.provider ||
                null,
            policyAuditModel:
                result?.model ||
                null
        };
    }
    catch(error) {
        if (controller.signal.aborted) {
            throw new Error(
                `MISSION_CONTRACT_POLICY_AUDIT_TIMEOUT_${CLOUD_MISSION_CONTRACT_TIMEOUT_MS}`
            );
        }
        throw error;
    }
    finally {
        clearTimeout(timer);
    }
}

function browserMissionContractHttpStatus(error = null) {
    const match = String(error?.message || "")
        .match(/CLIENT_MISSION_CONTRACT_HTTP_(\d{3})/);
    return match ? Number(match[1]) : null;
}

async function continueAfterBrowserMissionContractFailure(
    error = null,
    attemptIndex = 0
) {
    const status = browserMissionContractHttpStatus(error);
    if (status === 402) {
        return false;
    }
    if (status === 429 || (Number.isFinite(status) && status >= 500)) {
        await new Promise(resolve =>
            setTimeout(
                resolve,
                Math.min(900, 300 * (Number(attemptIndex) + 1))
            )
        );
    }
    return true;
}

async function callMissionContractCoverageAuthority(input = "", catalog = [], missionState = null) {
    let cloudError = null;
    try {
        const cloudPlan = await callSemanticPlanner(
            input,
            catalog,
            missionState
        );

        if (cloudMissionContractPolicyCertified(cloudPlan)) {
            return cloudPlan;
        }

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

text, count = helper_pattern.subn(lambda _match: helper_replacement, text, count=1)
if count != 1:
    raise SystemExit(f'PROVIDER_AUTHORITY_HELPER_COUNT:{count}')

browser_start = text.index('async function callBrowserMissionContract(')
browser_end = text.index('\nasync function callBrowserSemanticPlan', browser_start)
browser = text[browser_start:browser_end]

loop_old = 'for (const seed of [84, 85, 86]) {'
loop_new = 'for (const [attemptIndex, seed] of [84, 85, 86].entries()) {'
if browser.count(loop_old) != 1:
    raise SystemExit(f'BROWSER_MISSION_LOOP_COUNT:{browser.count(loop_old)}')
browser = browser.replace(loop_old, loop_new, 1)

catch_pattern = re.compile(
    r'''            \} catch \(error\) \{\n                lastError = error;\n            \}\n        \}'''
)
catch_replacement = '''            } catch (error) {
                lastError = error;
                const shouldContinue =
                    await continueAfterBrowserMissionContractFailure(
                        error,
                        attemptIndex
                    );
                if (!shouldContinue) {
                    break;
                }
            }
        }'''
browser, catch_count = catch_pattern.subn(catch_replacement, browser, count=1)
if catch_count != 1:
    raise SystemExit(f'BROWSER_MISSION_CATCH_COUNT:{catch_count}')
text = text[:browser_start] + browser + text[browser_end:]
planner.write_text(text)

core = Path('gestia-core/gestia-core.js')
core_text = core.read_text()
old_return = '            return { status: "error", msg: error.message };'
new_return = '''            const missionContractFailClosed =
                String(error?.message || "")
                    .startsWith(
                        "MISSION_CONTRACT_COVERAGE_UNAVAILABLE_"
                    );

            if (missionContractFailClosed) {
                return {
                    status: "error",
                    msg: error.message,
                    finalResponse: {
                        ok: false,
                        status: "MISSION_CONTRACT_FAIL_CLOSED",
                        title: "ADJUNTO detuvo la misión antes de degradarla",
                        text: "La solicitud sigue siendo válida y no necesita reformulación. No estuvo disponible una autoridad semántica capaz de certificar el contrato completo de la misión, así que ADJUNTO se detuvo antes de ejecutar un contrato reducido o marcar el trabajo como completado.",
                        source: "MISSION_CONTRACT_FAIL_CLOSED"
                    }
                };
            }

            return { status: "error", msg: error.message };'''
if core_text.count(old_return) != 1:
    raise SystemExit(f'CORE_GENERIC_ERROR_RETURN_COUNT:{core_text.count(old_return)}')
core.write_text(core_text.replace(old_return, new_return, 1))

# Align the previous compatibility regression with the now stronger cloud-first
# architecture: an uncertified cloud draft is audited by the same authenticated
# cloud semantic provider before the external browser fallback is considered.
policy_test = Path('tests/jarvis-mission-contract-policy-compat-v3.test.mjs')
policy_test.write_text(r'''import test from 'node:test';
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
  {name:'web.media.collect',description:'Recolecta bytes de una fuente web sin analizar su contenido',inputSchema:{type:'object',properties:{url:{type:'string'},requireAnyVisual:{type:'boolean'}}}},
  {name:'media.analyze',description:'Analiza contenido multimedia real y extrae evidencia verificable',inputSchema:{type:'object',properties:{sourceOutput:{type:'string'}}}},
  {name:'marketing.plan',description:'Crea estrategia de marketing basada en evidencia',inputSchema:{type:'object',properties:{productionRequested:{type:'boolean'},productionArtifacts:{type:'array'}}}},
  {name:'reel.plan',description:'Planifica un reel',inputSchema:{type:'object',properties:{}}},
  {name:'reel.create',description:'Crea un archivo final de reel',userArtifact:true,inputSchema:{type:'object',properties:{}}}
];

test('uncertified cloud draft is policy-audited by the same authenticated cloud provider before browser fallback',async()=>{
  const oldAuth=globalThis.auth;
  const oldFetch=globalThis.fetch;
  let cloudPlanCalls=0;
  let cloudAuditCalls=0;
  let browserCalls=0;
  globalThis.auth={currentUser:{async getIdToken(){return 'token';}}};
  globalThis.fetch=async url=>{
    const value=String(url);
    if(value.includes('jarvisSemanticPlan')){
      cloudPlanCalls+=1;
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
          {name:'marketing.plan',args:{productionRequested:false}}
        ]
      }});
    }
    if(value.includes('jarvisSemanticRespond')){
      cloudAuditCalls+=1;
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
      'Investiga la publicación exacta y después crea una propuesta de marketing basada únicamente en hechos realmente encontrados.',
      catalog,
      {phase:'MISSION_CONTRACT',existingInitialTools:['web.research','web.media.collect','marketing.plan']}
    );
    assert.equal(cloudPlanCalls,1);
    assert.equal(cloudAuditCalls,1);
    assert.equal(browserCalls,0);
    assert.deepEqual(plan.toolCalls.map(item=>item.name),['web.research','web.media.collect','media.analyze','marketing.plan']);
    assert.equal(plan.missionContractCapabilities.exactMediaEvidenceSemantics,true);
    assert.equal(plan.missionContractCapabilities.physicalArtifactCompletionSemantics,true);
    assert.equal(plan.missionContractCapabilities.policySource,'cloud-semantic-response-audit-v1');
  } finally {
    globalThis.auth=oldAuth;
    globalThis.fetch=oldFetch;
  }
});

test('certified cloud contract remains primary without policy audit or browser fallback',async()=>{
  const oldAuth=globalThis.auth;
  const oldFetch=globalThis.fetch;
  let auditCalls=0;
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
    if(value.includes('jarvisSemanticRespond')) auditCalls+=1;
    if(value.includes('text.pollinations.ai')) browserCalls+=1;
    throw new Error(`UNEXPECTED_URL:${value}`);
  };
  try{
    const plan=await plannerTest.callMissionContractCoverageAuthority(
      'Investiga Taquería El Dorado y dame únicamente un plan de marketing.',
      catalog,
      {phase:'MISSION_CONTRACT',existingInitialTools:['web.research','marketing.plan']}
    );
    assert.equal(auditCalls,0);
    assert.equal(browserCalls,0);
    assert.deepEqual(plan.toolCalls.map(item=>item.name),['web.research','marketing.plan']);
  } finally {
    globalThis.auth=oldAuth;
    globalThis.fetch=oldFetch;
  }
});

test('authority remains semantic and never hardcodes a media or marketing route',()=>{
  const source=fs.readFileSync(new URL('../gestia-core/jarvis/jarvis.multifunction.planner.js',import.meta.url),'utf8');
  const a=source.indexOf('function cloudMissionContractPolicyCertified');
  const b=source.indexOf('async function callBrowserSemanticPlan',a);
  assert.ok(a>=0 && b>a);
  const block=source.slice(a,b);
  assert.match(block,/callSemanticPlanner/);
  assert.match(block,/callCloudMissionContractPolicyAudit/);
  assert.match(block,/callBrowserMissionContract/);
  assert.ok(block.indexOf('callSemanticPlanner') < block.indexOf('callCloudMissionContractPolicyAudit'));
  assert.ok(block.indexOf('callCloudMissionContractPolicyAudit') < block.indexOf('callBrowserMissionContract'));
  for(const forbidden of ['tiktok.com','Taquería El Dorado','web.research','web.media.collect','media.analyze','marketing.plan','reel.plan','reel.create']){
    assert.equal(block.includes(forbidden),false,`static routing leaked: ${forbidden}`);
  }
});
''')

regression = Path('tests/jarvis-mission-contract-provider-resilience-v1.test.mjs')
regression.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { __test as plannerTest } from '../gestia-core/jarvis/jarvis.multifunction.planner.js';

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
  {name:'research.lookup',description:'Busca fuentes públicas verificables',inputSchema:{type:'object',properties:{query:{type:'string'}}}},
  {name:'source.collect',description:'Recolecta bytes de la fuente sin interpretar contenido',inputSchema:{type:'object',properties:{url:{type:'string'}}}},
  {name:'content.inspect',description:'Analiza semánticamente contenido multimedia real',inputSchema:{type:'object',properties:{sourceOutput:{type:'string'}}}},
  {name:'strategy.compose',description:'Compone una estrategia usando evidencia verificada',inputSchema:{type:'object',properties:{factsOnly:{type:'boolean'}}}}
];

test('current-policy cloud audit corrects an incomplete draft without external browser provider',async()=>{
  const oldAuth=globalThis.auth;
  const oldFetch=globalThis.fetch;
  let browserCalls=0;
  globalThis.auth={currentUser:{async getIdToken(){return 'token';}}};
  globalThis.fetch=async url=>{
    const value=String(url);
    if(value.includes('jarvisSemanticPlan')){
      return response(200,{result:{ok:true,planKind:'MISSION_CONTRACT_AUDITED',missionComplete:false,toolCalls:[
        {name:'research.lookup',args:{query:'negocio'}},
        {name:'source.collect',args:{url:'https://example.test/post'}},
        {name:'strategy.compose',args:{factsOnly:true}}
      ]}});
    }
    if(value.includes('jarvisSemanticRespond')){
      return response(200,{result:{ok:true,provider:'vertex-adc',model:'gemini-2.5-flash',message:JSON.stringify({
        toolCalls:[
          {name:'research.lookup',args:{query:'negocio'}},
          {name:'source.collect',args:{url:'https://example.test/post'}},
          {name:'content.inspect',args:{sourceOutput:'source.collect'}},
          {name:'strategy.compose',args:{factsOnly:true}}
        ],
        missionComplete:false
      })}});
    }
    if(value.includes('text.pollinations.ai')) browserCalls+=1;
    throw new Error(`UNEXPECTED_URL:${value}`);
  };
  try{
    const plan=await plannerTest.callMissionContractCoverageAuthority(
      'Investiga una publicación exacta y crea la estrategia únicamente con hechos del contenido realmente verificado.',
      catalog,
      {phase:'MISSION_CONTRACT',existingInitialTools:['research.lookup','source.collect','strategy.compose']}
    );
    assert.deepEqual(plan.toolCalls.map(x=>x.name),['research.lookup','source.collect','content.inspect','strategy.compose']);
    assert.equal(browserCalls,0);
    assert.equal(plan.missionContractCapabilities.policySource,'cloud-semantic-response-audit-v1');
  } finally {
    globalThis.auth=oldAuth;
    globalThis.fetch=oldFetch;
  }
});

test('transient browser 429 backs off to the next semantic attempt when cloud audit is unavailable',async()=>{
  const oldAuth=globalThis.auth;
  const oldFetch=globalThis.fetch;
  let browserCalls=0;
  globalThis.auth={currentUser:{async getIdToken(){return 'token';}}};
  globalThis.fetch=async url=>{
    const value=String(url);
    if(value.includes('jarvisSemanticPlan')) return response(503,{error:{message:'cloud plan unavailable'}});
    if(value.includes('text.pollinations.ai')){
      browserCalls+=1;
      if(browserCalls===1) return response(429,{error:'rate'});
      if(browserCalls===2) return response(200,{toolCalls:[{name:'research.lookup',args:{query:'negocio'}}],missionComplete:false});
      return response(200,{toolCalls:[],missionComplete:false});
    }
    throw new Error(`UNEXPECTED_URL:${value}`);
  };
  try{
    const plan=await plannerTest.callMissionContractCoverageAuthority(
      'Investiga el negocio.',
      catalog,
      {phase:'MISSION_CONTRACT',existingInitialTools:['research.lookup']}
    );
    assert.equal(browserCalls,3);
    assert.deepEqual(plan.toolCalls.map(x=>x.name),['research.lookup']);
    assert.equal(plan.missionContractCapabilities.policySource,'current-browser-semantic-contract');
  } finally {
    globalThis.auth=oldAuth;
    globalThis.fetch=oldFetch;
  }
});

test('browser 402 fails fast instead of hammering an unavailable paid route',async()=>{
  const oldAuth=globalThis.auth;
  const oldFetch=globalThis.fetch;
  let browserCalls=0;
  globalThis.auth={currentUser:{async getIdToken(){return 'token';}}};
  globalThis.fetch=async url=>{
    const value=String(url);
    if(value.includes('jarvisSemanticPlan')) return response(503,{error:{message:'cloud unavailable'}});
    if(value.includes('text.pollinations.ai')){
      browserCalls+=1;
      return response(402,{error:'payment required'});
    }
    throw new Error(`UNEXPECTED_URL:${value}`);
  };
  try{
    await assert.rejects(
      plannerTest.callMissionContractCoverageAuthority(
        'Investiga el negocio.',
        catalog,
        {phase:'MISSION_CONTRACT',existingInitialTools:['research.lookup']}
      ),
      /CLIENT_MISSION_CONTRACT_HTTP_402/
    );
    assert.equal(browserCalls,1);
  } finally {
    globalThis.auth=oldAuth;
    globalThis.fetch=oldFetch;
  }
});

test('fail-closed contract errors are presentable and never masquerade as completed work',()=>{
  const core=fs.readFileSync(new URL('../gestia-core/gestia-core.js',import.meta.url),'utf8');
  assert.match(core,/MISSION_CONTRACT_FAIL_CLOSED/);
  assert.match(core,/finalResponse/);
  assert.match(core,/solicitud sigue siendo válida y no necesita reformulación/);
  assert.doesNotMatch(core,/MISSION_CONTRACT_RECOVERED_FROM_INITIAL_PLAN/);
});
''')

print('MISSION_CONTRACT_PROVIDER_RESILIENCE_V1_INJECTED=true')
