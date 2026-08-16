from pathlib import Path
import re

PLANNER = Path('gestia-core/jarvis/jarvis.multifunction.planner.js')
CORE = Path('gestia-core/gestia-core.js')
ORCHESTRATOR = Path('gestia-core/jarvis/jarvis.mission.orchestrator.js')
TERMINAL = Path('gestia-terminal.html')

planner = PLANNER.read_text()

# Strengthen the policy itself without routing on provider, brand, domain, or tool name.
media_rule = '        "EVIDENCIA MULTIMEDIA: obtener, descargar, recolectar o conservar bytes de una fuente no equivale a analizar su contenido. Si un entregable posterior depende de hechos, atributos, escenas, audio, texto visible u otras afirmaciones sobre el contenido de una fuente multimedia, el contrato debe conservar en el orden correcto la herramienta especializada del catalogo que analiza ese contenido antes del entregable dependiente. Si el contenido no necesita interpretarse, no agregues analisis por rutina.",\n'
media_rule_extra = media_rule + '''        "FUENTE EXTERNA EXACTA: cuando la instruccion senala una URL concreta cuyo contenido audiovisual es objeto de la investigacion, una busqueda web alrededor de la entidad, metadatos de la URL o snippets externos no prueban por si solos lo que aparece o se escucha en esa fuente. Si un entregable posterior queda limitado a hechos realmente encontrados en ese contenido, conserva primero la capacidad del catalogo que obtiene la fuente real y despues la capacidad que inspecciona su contenido antes de cualquier entregable dependiente.",\n        "CIERRE DE COBERTURA: no des por satisfecho un objetivo solo porque el borrador inicial o la lista previa de herramientas lo omita. Reconstruye la cadena de evidencia desde la instruccion original y verifica cada dependencia semantica de punta a punta.",\n'''
if planner.count(media_rule) != 1:
    raise SystemExit(f'CURRENT_MEDIA_POLICY_ANCHOR_COUNT:{planner.count(media_rule)}')
planner = planner.replace(media_rule, media_rule_extra, 1)

# Make explicit source anchors first-class evidence context for the semantic audit.
audit_anchor = '        `CATALOGO=${JSON.stringify(missionContractPolicyAuditCatalog(catalog))}`,\n'
audit_anchor_replacement = '''        `FUENTES_EXPLICITAS_USUARIO=${JSON.stringify(explicitHttpSourceUrls(instruction))}`,\n        `CATALOGO=${JSON.stringify(missionContractPolicyAuditCatalog(catalog))}`,\n'''
if planner.count(audit_anchor) != 1:
    raise SystemExit(f'POLICY_AUDIT_CATALOG_ANCHOR_COUNT:{planner.count(audit_anchor)}')
planner = planner.replace(audit_anchor, audit_anchor_replacement, 1)

# Replace the single-pass current-policy audit with a same-provider independent verification.
cloud_audit_pattern = re.compile(
    r'async function callCloudMissionContractPolicyAudit\(\n.*?\n\}\n\nfunction browserMissionContractHttpStatus',
    re.S,
)
cloud_audit_replacement = r'''async function callCloudCurrentPolicyJson(
    prompt = "",
    errorPrefix = "MISSION_CURRENT_POLICY"
) {
    const user =
        globalThis?.auth?.currentUser ||
        globalThis?.window?.auth?.currentUser ||
        null;
    if (!user) {
        throw new Error(`${errorPrefix}_AUTH_REQUIRED`);
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
                        input: String(prompt || "").slice(0, 120000),
                        maxOutputTokens: 6000
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
                `${errorPrefix}_HTTP_${response.status}`
            );
        }
        const semanticPayload = extractJsonObject(
            String(result?.message || "")
        );
        if (!semanticPayload || typeof semanticPayload !== "object") {
            throw new Error(`${errorPrefix}_JSON_REQUIRED`);
        }
        return {
            semanticPayload,
            provider: result?.provider || null,
            model: result?.model || null
        };
    }
    catch(error) {
        if (controller.signal.aborted) {
            throw new Error(
                `${errorPrefix}_TIMEOUT_${CLOUD_MISSION_CONTRACT_TIMEOUT_MS}`
            );
        }
        throw error;
    }
    finally {
        clearTimeout(timer);
    }
}

function missionContractPolicyVerificationPrompt(
    input = "",
    catalog = [],
    cloudPlan = null,
    firstAuditCalls = []
) {
    const instruction = String(input || "");
    const boundedInstruction = instruction.length <= 12000
        ? instruction
        : `${instruction.slice(0, 8000)}\n[PARTE_MEDIA_PERSISTIDA]\n${instruction.slice(-3500)}`;
    return [
        "VERIFICACION INDEPENDIENTE DE COBERTURA DEL CONTRATO DE MISION.",
        GENERALIST_CURRENT_TURN_POLICY,
        "Vuelve a resolver la cobertura desde la INSTRUCCION_ORIGINAL_INMUTABLE. No confies en que el borrador cloud ni la primera auditoria sean completos.",
        "Audita por significado, nunca por listas de palabras, marcas, dominios o rutas predeterminadas. Selecciona exclusivamente capacidades existentes en el catalogo y conserva solo las realmente necesarias.",
        "Una fuente externa exacta cuyo contenido audiovisual es objeto de la solicitud necesita evidencia de su contenido antes de que un resultado posterior pueda afirmar hechos extraidos de ella. Buscar alrededor de la entidad, leer metadatos o conservar una URL no equivale a inspeccionar el contenido. Obtener bytes tampoco equivale a analizarlos.",
        "Si el usuario limita un resultado posterior a hechos realmente encontrados en una fuente concreta, reconstruye la dependencia completa: acceso verificable a la fuente, inspeccion especializada de su contenido cuando corresponda y solo despues el resultado dependiente.",
        "Un plan, brief, storyboard o archivo fuente no equivale a un artefacto final creado. Incluye creacion fisica solo cuando el usuario realmente la solicite.",
        "Devuelve un CONTRATO COMPLETO FINAL, no un delta. Debe incluir todas las llamadas justificadas en orden de dependencia, incluso si ya estaban en la primera auditoria.",
        "Devuelve solamente JSON valido con toolCalls, missionComplete=false y completionAssessment.",
        `FUENTES_EXPLICITAS_USUARIO=${JSON.stringify(explicitHttpSourceUrls(instruction))}`,
        `CATALOGO=${JSON.stringify(missionContractPolicyAuditCatalog(catalog))}`,
        `BORRADOR_CLOUD=${JSON.stringify({toolCalls:Array.isArray(cloudPlan?.toolCalls)?cloudPlan.toolCalls.slice(0,20):[]}).slice(0,18000)}`,
        `PRIMERA_AUDITORIA=${JSON.stringify({toolCalls:Array.isArray(firstAuditCalls)?firstAuditCalls.slice(0,20):[]}).slice(0,18000)}`,
        `INSTRUCCION_ORIGINAL_INMUTABLE=${boundedInstruction}`
    ].join("\n");
}

async function callCloudMissionContractPolicyAudit(
    input = "",
    catalog = [],
    missionState = null,
    cloudPlan = null
) {
    const first = await callCloudCurrentPolicyJson(
        missionContractPolicyAuditPrompt(
            input,
            catalog,
            cloudPlan
        ),
        "MISSION_CONTRACT_POLICY_AUDIT"
    );
    if (!Array.isArray(first.semanticPayload?.toolCalls)) {
        throw new Error("MISSION_CONTRACT_POLICY_AUDIT_TOOL_CALLS_REQUIRED");
    }
    const firstAuditCalls = trustedPlanCalls(
        {
            ...first.semanticPayload,
            planKind: "MISSION_CONTRACT_AUDIT"
        },
        catalog,
        {
            originalInstruction: String(input || ""),
            missionState
        }
    );
    if (
        firstAuditCalls.length === 0 &&
        Array.isArray(cloudPlan?.toolCalls) &&
        cloudPlan.toolCalls.length > 0
    ) {
        throw new Error("MISSION_CONTRACT_POLICY_AUDIT_EMPTY");
    }

    const verification = await callCloudCurrentPolicyJson(
        missionContractPolicyVerificationPrompt(
            input,
            catalog,
            cloudPlan,
            firstAuditCalls
        ),
        "MISSION_CONTRACT_POLICY_VERIFY"
    );
    if (!Array.isArray(verification.semanticPayload?.toolCalls)) {
        throw new Error("MISSION_CONTRACT_POLICY_VERIFY_TOOL_CALLS_REQUIRED");
    }
    const verifiedCalls = trustedPlanCalls(
        {
            ...verification.semanticPayload,
            planKind: "MISSION_CONTRACT_AUDIT_VERIFIED"
        },
        catalog,
        {
            originalInstruction: String(input || ""),
            missionState
        }
    );
    if (
        verifiedCalls.length === 0 &&
        firstAuditCalls.length > 0
    ) {
        throw new Error("MISSION_CONTRACT_POLICY_VERIFY_EMPTY");
    }

    console.info(
        "[MISSION_CONTRACT_CURRENT_POLICY_AUDIT]",
        {
            draftTools: Array.isArray(cloudPlan?.toolCalls)
                ? cloudPlan.toolCalls.map(item => item?.name).filter(Boolean)
                : [],
            firstAuditTools: firstAuditCalls.map(item => item.name),
            verifiedTools: verifiedCalls.map(item => item.name),
            policySource: "cloud-semantic-response-audit-v2"
        }
    );

    return {
        ...cloudPlan,
        toolCalls: verifiedCalls,
        completionAssessment: {
            draft: cloudPlan?.completionAssessment || null,
            currentPolicyCoverageAudit: first.semanticPayload?.completionAssessment || null,
            independentCurrentPolicyVerification: verification.semanticPayload?.completionAssessment || null
        },
        missionComplete: false,
        ok: true,
        status: "SEMANTIC_PLAN_READY",
        planKind: "MISSION_CONTRACT_AUDITED",
        missionContractCapabilities: {
            exactMediaEvidenceSemantics: true,
            physicalArtifactCompletionSemantics: true,
            independentCoverageVerification: true,
            policySource: "cloud-semantic-response-audit-v2"
        },
        policyAuditedCloudProvider:
            verification.provider || first.provider || cloudPlan?.provider || null,
        policyAuditModel:
            verification.model || first.model || null
    };
}

function missionCompletionPolicyPrompt(
    input = "",
    catalog = [],
    missionState = null,
    priorVerdict = null
) {
    const instruction = String(input || "");
    const boundedInstruction = instruction.length <= 12000
        ? instruction
        : `${instruction.slice(0, 8000)}\n[PARTE_MEDIA_PERSISTIDA]\n${instruction.slice(-3500)}`;
    return [
        priorVerdict
            ? "VERIFICACION INDEPENDIENTE DEL CIERRE DE MISION."
            : "AUDITORIA SEMANTICA ACTUAL DE CIERRE DE MISION.",
        GENERALIST_CURRENT_TURN_POLICY,
        "La INSTRUCCION_ORIGINAL_INMUTABLE manda sobre requiredToolNames, el borrador inicial y cualquier declaracion previa de cobertura.",
        "Compara cada entregable y cada dependencia de evidencia contra las observaciones realmente completadas. No cierres por conteo de herramientas.",
        "Cuando una URL externa concreta es el objeto de una solicitud y un resultado posterior debe basarse solo en hechos realmente encontrados en su contenido audiovisual, una busqueda sobre la entidad, snippets o metadatos no demuestran ese contenido. Obtener o conservar bytes tampoco equivale a analizarlos. Exige la capacidad especializada faltante antes del resultado dependiente.",
        "Un plan, brief, storyboard o fuente no prueba la existencia de un artefacto final. Exige creacion fisica solamente si fue solicitada.",
        "Si falta algo, devuelve exactamente la siguiente herramienta ejecutable del catalogo con missionComplete=false. Si ya esta todo realmente satisfecho, devuelve toolCalls=[] y missionComplete=true.",
        "Si no puedes demostrar el cierre, no uses missionComplete=true. No inventes evidencia ni consideres la memoria como evidencia de esta mision.",
        "Devuelve solamente JSON valido con toolCalls, missionComplete y completionAssessment.",
        `FUENTES_EXPLICITAS_USUARIO=${JSON.stringify(explicitHttpSourceUrls(instruction))}`,
        `CATALOGO=${JSON.stringify(missionContractPolicyAuditCatalog(catalog))}`,
        `ESTADO_DE_MISION=${JSON.stringify(missionState || {}).slice(0,32000)}`,
        priorVerdict
            ? `VEREDICTO_PREVIO_A_REVISAR=${JSON.stringify(priorVerdict).slice(0,12000)}`
            : "",
        `INSTRUCCION_ORIGINAL_INMUTABLE=${boundedInstruction}`
    ].filter(Boolean).join("\n");
}

async function callCloudMissionCompletionPolicyAudit(
    input = "",
    catalog = [],
    missionState = null
) {
    const first = await callCloudCurrentPolicyJson(
        missionCompletionPolicyPrompt(
            input,
            catalog,
            missionState,
            null
        ),
        "MISSION_COMPLETION_POLICY_AUDIT"
    );
    if (!Array.isArray(first.semanticPayload?.toolCalls)) {
        throw new Error("MISSION_COMPLETION_POLICY_TOOL_CALLS_REQUIRED");
    }
    const firstCalls = trustedPlanCalls(
        {
            ...first.semanticPayload,
            planKind: "MISSION_CONTRACT_COMPLETION_AUDIT"
        },
        catalog,
        {
            originalInstruction: String(input || ""),
            missionState
        }
    );
    if (firstCalls.length > 0) {
        console.info(
            "[MISSION_COMPLETION_CURRENT_POLICY_AUDIT]",
            {
                missionComplete: false,
                nextTools: firstCalls.map(item => item.name),
                verifiedClosure: false
            }
        );
        return {
            ok: true,
            status: "SEMANTIC_PLAN_READY",
            planKind: "COMPLETION_AUDIT_CURRENT_POLICY",
            toolCalls: firstCalls.slice(0, 1),
            missionComplete: false,
            completionAssessment: first.semanticPayload?.completionAssessment || null,
            provider: first.provider,
            model: first.model
        };
    }
    if (first.semanticPayload?.missionComplete !== true) {
        throw new Error("MISSION_COMPLETION_POLICY_UNRESOLVED");
    }

    const verification = await callCloudCurrentPolicyJson(
        missionCompletionPolicyPrompt(
            input,
            catalog,
            missionState,
            {
                missionComplete: true,
                completionAssessment: first.semanticPayload?.completionAssessment || null
            }
        ),
        "MISSION_COMPLETION_POLICY_VERIFY"
    );
    if (!Array.isArray(verification.semanticPayload?.toolCalls)) {
        throw new Error("MISSION_COMPLETION_POLICY_VERIFY_TOOL_CALLS_REQUIRED");
    }
    const verificationCalls = trustedPlanCalls(
        {
            ...verification.semanticPayload,
            planKind: "MISSION_CONTRACT_COMPLETION_VERIFY"
        },
        catalog,
        {
            originalInstruction: String(input || ""),
            missionState
        }
    );
    if (verificationCalls.length > 0) {
        console.info(
            "[MISSION_COMPLETION_CURRENT_POLICY_AUDIT]",
            {
                missionComplete: false,
                nextTools: verificationCalls.map(item => item.name),
                verifiedClosure: false
            }
        );
        return {
            ok: true,
            status: "SEMANTIC_PLAN_READY",
            planKind: "COMPLETION_AUDIT_CURRENT_POLICY_VERIFIED",
            toolCalls: verificationCalls.slice(0, 1),
            missionComplete: false,
            completionAssessment: verification.semanticPayload?.completionAssessment || null,
            provider: verification.provider,
            model: verification.model
        };
    }
    if (verification.semanticPayload?.missionComplete !== true) {
        throw new Error("MISSION_COMPLETION_POLICY_VERIFY_UNRESOLVED");
    }

    console.info(
        "[MISSION_COMPLETION_CURRENT_POLICY_AUDIT]",
        {
            missionComplete: true,
            nextTools: [],
            verifiedClosure: true
        }
    );
    return {
        ok: true,
        status: "SEMANTIC_PLAN_READY",
        planKind: "COMPLETION_AUDIT_CURRENT_POLICY_VERIFIED",
        toolCalls: [],
        missionComplete: true,
        completionAssessment: {
            currentPolicyAudit: first.semanticPayload?.completionAssessment || null,
            independentClosureVerification: verification.semanticPayload?.completionAssessment || null
        },
        provider: verification.provider || first.provider,
        model: verification.model || first.model
    };
}

function browserMissionContractHttpStatus'''
planner, cloud_count = cloud_audit_pattern.subn(lambda _m: cloud_audit_replacement, planner, count=1)
if cloud_count != 1:
    raise SystemExit(f'CLOUD_AUDIT_REPLACEMENT_COUNT:{cloud_count}')

# Give the tertiary browser semantic path the same conceptual evidence policy.
browser_completion_anchor = '        missionState?.phase === "REEL_MEDIA_SOURCE_RECOVERY"\n'
browser_completion_policy = '''        "POLITICA ACTUAL DE EVIDENCIA MULTIMEDIA: una fuente externa concreta cuyo contenido audiovisual sea objeto de la solicitud necesita evidencia de ese contenido antes de afirmar hechos derivados de ella. Una busqueda alrededor de la entidad, metadatos o la mera obtencion de bytes no equivalen a analizar el contenido; conserva la capacidad especializada necesaria cuando un entregable dependa de ese analisis.",\n        "POLITICA ACTUAL DE CIERRE: requiredToolNames y borradores previos no prueban cobertura. missionComplete=true solo cuando cada entregable y dependencia de evidencia de la instruccion original esta realmente satisfecha.",\n        missionState?.phase === "REEL_MEDIA_SOURCE_RECOVERY"\n'''
if planner.count(browser_completion_anchor) != 1:
    raise SystemExit(f'BROWSER_CURRENT_POLICY_ANCHOR_COUNT:{planner.count(browser_completion_anchor)}')
planner = planner.replace(browser_completion_anchor, browser_completion_policy, 1)

# Route both contract creation and completion through current Hosting policy.
authority_pattern = re.compile(
    r'        const contractPlanner = context\?\.missionState\?\.phase === "MISSION_CONTRACT" &&\n.*?            : context\.semanticPlanner;\n        const plan = await resolveSemanticPlan\(\n            instruction,\n            catalog,\n            contractPlanner,',
    re.S,
)
authority_replacement = r'''        const missionPhase =
            String(context?.missionState?.phase || "");
        const missionSemanticPlanner =
            typeof context.semanticPlanner === "function"
                ? context.semanticPlanner
                : missionPhase === "MISSION_CONTRACT"
                    ? async ({ input: contractInput, catalog: contractCatalog, missionState }) =>
                        callMissionContractCoverageAuthority(
                            contractInput,
                            contractCatalog,
                            missionState
                        )
                    : missionPhase === "COMPLETION_AUDIT"
                        ? async ({ input: auditInput, catalog: auditCatalog, missionState }) => {
                            let cloudError = null;
                            try {
                                return await callCloudMissionCompletionPolicyAudit(
                                    auditInput,
                                    auditCatalog,
                                    missionState
                                );
                            }
                            catch(error) {
                                cloudError = error;
                            }
                            try {
                                const browserPlan = await callBrowserSemanticPlan(
                                    auditInput,
                                    auditCatalog,
                                    missionState
                                );
                                return {
                                    ...browserPlan,
                                    recoveredFromCloudError:
                                        cloudError?.message ||
                                        "MISSION_COMPLETION_POLICY_UNAVAILABLE"
                                };
                            }
                            catch(browserError) {
                                throw new Error(
                                    `MISSION_COMPLETION_COVERAGE_UNAVAILABLE_CLOUD_${cloudError?.message || "FAILED"}__BROWSER_${browserError?.message || "FAILED"}`
                                );
                            }
                        }
                        : null;
        const plan = await resolveSemanticPlan(
            instruction,
            catalog,
            missionSemanticPlanner,'''
planner, authority_count = authority_pattern.subn(lambda _m: authority_replacement, planner, count=1)
if authority_count != 1:
    raise SystemExit(f'MISSION_SEMANTIC_AUTHORITY_REPLACEMENT_COUNT:{authority_count}')

# Expose only for regression tests, not as another runtime authority.
export_anchor = '    callBrowserMissionContract,\n'
export_replacement = '''    callMissionContractCoverageAuthority,\n    callCloudMissionContractPolicyAudit,\n    callCloudMissionCompletionPolicyAudit,\n    callBrowserMissionContract,\n'''
# Some reconstructed carriers already export one or two helpers. Normalize instead of duplicating.
for name in [
    '    callMissionContractCoverageAuthority,\n',
    '    callCloudMissionContractPolicyAudit,\n',
    '    callCloudMissionCompletionPolicyAudit,\n'
]:
    planner = planner.replace(name, '')
if planner.count(export_anchor) != 1:
    raise SystemExit(f'PLANNER_TEST_EXPORT_ANCHOR_COUNT:{planner.count(export_anchor)}')
planner = planner.replace(export_anchor, export_replacement, 1)

PLANNER.write_text(planner)

# Require the semantic completion verdict in production while preserving the orchestrator's
# generic backwards-compatible default for direct consumers.
orch = ORCHESTRATOR.read_text()
signature_old = '''    continuationContext = {},
    memoryContext = null
} = {}) {'''
signature_new = '''    continuationContext = {},
    memoryContext = null,
    requireSemanticCompletionAudit = false
} = {}) {'''
if orch.count(signature_old) != 1:
    raise SystemExit(f'ORCHESTRATOR_SIGNATURE_COUNT:{orch.count(signature_old)}')
orch = orch.replace(signature_old, signature_new, 1)

closure_old = '''                mission.reason = (
                    plan?.missionComplete === true ||
                    verifiedContractSatisfied
                ) && contractSatisfied
                    ? mission.blockedTasks.length > 0
                        ? "PARTIAL_CAPABILITY_BLOCKED"
                        : "ALL_EXECUTABLE_TASKS_COMPLETED"
                    : contractSatisfied
                        ? "PLANNER_NO_EXECUTABLE_PLAN"
                        : "MISSION_CONTRACT_INCOMPLETE";'''
closure_new = '''                const semanticClosureSatisfied =
                    plan?.missionComplete === true ||
                    (
                        requireSemanticCompletionAudit !== true &&
                        verifiedContractSatisfied
                    );
                mission.reason =
                    semanticClosureSatisfied && contractSatisfied
                        ? mission.blockedTasks.length > 0
                            ? "PARTIAL_CAPABILITY_BLOCKED"
                            : "ALL_EXECUTABLE_TASKS_COMPLETED"
                        : contractSatisfied
                            ? "PLANNER_NO_EXECUTABLE_PLAN"
                            : "MISSION_CONTRACT_INCOMPLETE";'''
if orch.count(closure_old) != 1:
    raise SystemExit(f'ORCHESTRATOR_CLOSURE_COUNT:{orch.count(closure_old)}')
orch = orch.replace(closure_old, closure_new, 1)
ORCHESTRATOR.write_text(orch)

core = CORE.read_text()
core_call_anchor = '''            memoryContext: semanticMemoryContext,
            maximumSteps:
                20,'''
core_call_replacement = '''            memoryContext: semanticMemoryContext,
            requireSemanticCompletionAudit: true,
            maximumSteps:
                20,'''
if core.count(core_call_anchor) != 1:
    raise SystemExit(f'CORE_SEMANTIC_COMPLETION_FLAG_COUNT:{core.count(core_call_anchor)}')
core = core.replace(core_call_anchor, core_call_replacement, 1)

# Force a fresh ESM module graph in browsers for this closure correction.
core = core.replace(
    '/gestia-core/jarvis/jarvis.multifunction.planner.js?v=v136-reel-media-source-recovery-20260812',
    '/gestia-core/jarvis/jarvis.multifunction.planner.js?v=v142-current-policy-closure-20260816',
    1
)
CORE.write_text(core)

terminal = TERMINAL.read_text()
old_core_src = '/gestia-core/gestia-core.js?v=v139-real-reel-e2e-20260812'
new_core_src = '/gestia-core/gestia-core.js?v=v142-current-policy-closure-20260816'
if terminal.count(old_core_src) < 1:
    raise SystemExit('TERMINAL_CORE_CACHE_BUST_ANCHOR_MISSING')
terminal = terminal.replace(old_core_src, new_core_src)
TERMINAL.write_text(terminal)

# Align the old architecture regression with mandatory current-policy completion in production.
legacy = Path('tests/jarvis-mission-contract-authority-closeout-v2.test.mjs')
if legacy.exists():
    value = legacy.read_text()
    old = '''test('existing completion compatibility remains intact after authority correction',()=>{
  const orchestrator=fs.readFileSync(new URL('../gestia-core/jarvis/jarvis.mission.orchestrator.js',import.meta.url),'utf8');
  assert.match(orchestrator,/verifiedContractSatisfied/);
  assert.match(orchestrator,/PLANNER_NO_EXECUTABLE_PLAN/);
});'''
    new = '''test('production can require semantic completion instead of count-based auto-close',()=>{
  const orchestrator=fs.readFileSync(new URL('../gestia-core/jarvis/jarvis.mission.orchestrator.js',import.meta.url),'utf8');
  const core=fs.readFileSync(new URL('../gestia-core/gestia-core.js',import.meta.url),'utf8');
  assert.match(orchestrator,/requireSemanticCompletionAudit/);
  assert.match(orchestrator,/semanticClosureSatisfied/);
  assert.match(orchestrator,/PLANNER_NO_EXECUTABLE_PLAN/);
  assert.match(core,/requireSemanticCompletionAudit:\s*true/);
});'''
    if value.count(old) != 1:
        raise SystemExit(f'LEGACY_COMPLETION_COMPAT_TEST_COUNT:{value.count(old)}')
    legacy.write_text(value.replace(old, new, 1))

# Align the flow architecture test if it still looks for the old variable name.
flow = Path('tests/jarvis-mission-flow-contract-closeout.test.mjs')
if flow.exists():
    value = flow.read_text()
    pattern = re.compile(
        r"test\('MISSION_CONTRACT keeps audited cloud authority primary with browser coverage as fallback',\(\)=>\{.*?\n\}\);",
        re.S,
    )
    replacement = r'''test('mission semantic authority covers contract creation and completion before browser fallback',()=>{
  const source=fs.readFileSync(new URL('../gestia-core/jarvis/jarvis.multifunction.planner.js',import.meta.url),'utf8');
  const start=source.indexOf('const missionSemanticPlanner');
  const end=source.indexOf('const plan = await resolveSemanticPlan',start);
  assert.ok(start>=0 && end>start);
  const block=source.slice(start,end);
  assert.match(block,/callMissionContractCoverageAuthority/);
  assert.match(block,/callCloudMissionCompletionPolicyAudit/);
  assert.match(block,/callBrowserSemanticPlan/);
  assert.ok(block.indexOf('callCloudMissionCompletionPolicyAudit') < block.indexOf('callBrowserSemanticPlan'));
});'''
    value, count = pattern.subn(lambda _m: replacement, value, count=1)
    if count != 1:
        raise SystemExit(f'FLOW_AUTHORITY_TEST_COUNT:{count}')
    flow.write_text(value)

regression = Path('tests/jarvis-current-policy-closure-v5.test.mjs')
regression.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { __test as plannerTest } from '../gestia-core/jarvis/jarvis.multifunction.planner.js';
import { runJarvisMission } from '../gestia-core/jarvis/jarvis.mission.orchestrator.js';

const exact='https://example.test/@local/video/123456';
const catalog=[
  {name:'web.research',description:'Investiga fuentes web',inputSchema:{type:'object',properties:{query:{type:'string'},researchGoal:{type:'string'},seedUrl:{type:'string'},allowedDomain:{type:'string'}}}},
  {name:'web.media.collect',description:'Obtiene bytes de una fuente multimedia sin interpretar su contenido',inputSchema:{type:'object',properties:{url:{type:'string'},requireAnyVisual:{type:'boolean'}}}},
  {name:'media.analyze',description:'Inspecciona contenido multimedia real y produce evidencia',inputSchema:{type:'object',properties:{sourceOutput:{type:'string'}}}},
  {name:'marketing.plan',description:'Crea una estrategia usando evidencia disponible',inputSchema:{type:'object',properties:{productionRequested:{type:'boolean'}}}}
];

function response(status,body){
  return {ok:status>=200&&status<300,status,headers:{get(){return null;}},async text(){return JSON.stringify(body);},async json(){return body;}};
}

function semanticResponse(message){
  return response(200,{result:{ok:true,status:'SEMANTIC_RESPONSE_READY',provider:'vertex-adc',model:'gemini-2.5-flash',message:JSON.stringify(message)}});
}

test('independent current-policy verification repairs a reduced first audit before execution',async()=>{
  const oldAuth=globalThis.auth;
  const oldFetch=globalThis.fetch;
  let plannerCalls=0;
  let policyCalls=0;
  let browserCalls=0;
  globalThis.auth={currentUser:{async getIdToken(){return 'token';}}};
  globalThis.fetch=async url=>{
    const value=String(url);
    if(value.includes('jarvisSemanticPlan')){
      plannerCalls+=1;
      return response(200,{result:{ok:true,status:'SEMANTIC_PLAN_READY',provider:'vertex-adc',model:'gemini-2.5-flash',planKind:'MISSION_CONTRACT_AUDITED',missionComplete:false,toolCalls:[
        {name:'web.research',args:{query:'local',researchGoal:'RESEARCH_1',seedUrl:exact,allowedDomain:'example.test'}},
        {name:'marketing.plan',args:{productionRequested:false}}
      ]}});
    }
    if(value.includes('jarvisSemanticRespond')){
      policyCalls+=1;
      if(policyCalls===1){
        return semanticResponse({toolCalls:[
          {name:'web.research',args:{query:'local',researchGoal:'RESEARCH_1',seedUrl:exact,allowedDomain:'example.test'}},
          {name:'marketing.plan',args:{productionRequested:false}}
        ],missionComplete:false,completionAssessment:{pass:'first'}});
      }
      return semanticResponse({toolCalls:[
        {name:'web.research',args:{query:'local',researchGoal:'RESEARCH_1',seedUrl:exact,allowedDomain:'example.test'}},
        {name:'web.media.collect',args:{url:exact,requireAnyVisual:true}},
        {name:'media.analyze',args:{sourceOutput:'web.media.collect'}},
        {name:'marketing.plan',args:{productionRequested:false}}
      ],missionComplete:false,completionAssessment:{pass:'independent'}});
    }
    if(value.includes('text.pollinations.ai')){browserCalls+=1;throw new Error('BROWSER_SHOULD_NOT_RUN');}
    throw new Error(`UNEXPECTED_URL:${value}`);
  };
  try{
    const plan=await plannerTest.callMissionContractCoverageAuthority(
      `Investiga el contenido de esta fuente exacta ${exact} y prepara una propuesta basada unicamente en hechos realmente encontrados en ese contenido.`,
      catalog,
      {phase:'MISSION_CONTRACT',existingInitialTools:['web.research','marketing.plan']}
    );
    assert.equal(plannerCalls,1);
    assert.equal(policyCalls,2);
    assert.equal(browserCalls,0);
    assert.deepEqual(plan.toolCalls.map(item=>item.name),['web.research','web.media.collect','media.analyze','marketing.plan']);
    assert.equal(plan.missionContractCapabilities.independentCoverageVerification,true);
    assert.equal(plan.missionContractCapabilities.policySource,'cloud-semantic-response-audit-v2');
  }finally{globalThis.auth=oldAuth;globalThis.fetch=oldFetch;}
});

test('current-policy completion audit rejects count-based closure and requests missing evidence capability',async()=>{
  const oldAuth=globalThis.auth;
  const oldFetch=globalThis.fetch;
  let calls=0;
  globalThis.auth={currentUser:{async getIdToken(){return 'token';}}};
  globalThis.fetch=async url=>{
    if(!String(url).includes('jarvisSemanticRespond')) throw new Error(`UNEXPECTED_URL:${url}`);
    calls+=1;
    return semanticResponse({toolCalls:[{name:'web.media.collect',args:{url:exact,requireAnyVisual:true}}],missionComplete:false,completionAssessment:{missing:'source content evidence'}});
  };
  try{
    const plan=await plannerTest.callCloudMissionCompletionPolicyAudit(
      `Investiga el contenido exacto ${exact} y prepara una propuesta basada solo en hechos realmente encontrados en ese contenido.`,
      catalog,
      {phase:'COMPLETION_AUDIT',requiredToolNames:['web.research','marketing.plan'],completedTasks:[
        {name:'web.research',args:{},observation:{ok:true,objectiveSatisfied:true,status:'ENTITY_NOT_VERIFIED',summary:'Sin contenido de la fuente exacta'}},
        {name:'marketing.plan',args:{},observation:{ok:true,objectiveSatisfied:true,status:'MARKETING_PACKAGE_READY'}}
      ],blockedTasks:[],pendingTasks:[]}
    );
    assert.equal(calls,1);
    assert.equal(plan.missionComplete,false);
    assert.deepEqual(plan.toolCalls.map(item=>item.name),['web.media.collect']);
  }finally{globalThis.auth=oldAuth;globalThis.fetch=oldFetch;}
});

test('semantic closure requires independent verification before missionComplete true',async()=>{
  const oldAuth=globalThis.auth;
  const oldFetch=globalThis.fetch;
  let calls=0;
  globalThis.auth={currentUser:{async getIdToken(){return 'token';}}};
  globalThis.fetch=async url=>{
    if(!String(url).includes('jarvisSemanticRespond')) throw new Error(`UNEXPECTED_URL:${url}`);
    calls+=1;
    return semanticResponse({toolCalls:[],missionComplete:true,completionAssessment:{pass:calls}});
  };
  try{
    const plan=await plannerTest.callCloudMissionCompletionPolicyAudit(
      'Resume una investigacion ya sustentada.',
      catalog,
      {phase:'COMPLETION_AUDIT',requiredToolNames:['web.research'],completedTasks:[{name:'web.research',args:{},observation:{ok:true,objectiveSatisfied:true,status:'GROUNDED'}}],blockedTasks:[],pendingTasks:[]}
    );
    assert.equal(calls,2);
    assert.equal(plan.missionComplete,true);
    assert.deepEqual(plan.toolCalls,[]);
  }finally{globalThis.auth=oldAuth;globalThis.fetch=oldFetch;}
});

test('production-style orchestrator cannot auto-close when semantic completion says unresolved',async()=>{
  const mission=await runJarvisMission({
    instruction:'Investiga y prepara un resultado sustentado.',
    initialToolCalls:[{name:'web.research',args:{query:'x'}}],
    requiredToolNames:['web.research'],
    requireSemanticCompletionAudit:true,
    planner:async()=>({toolCalls:[],missionComplete:false,completionAssessment:{status:'UNRESOLVED'}}),
    execute:async()=>({ok:true,objectiveSatisfied:true,status:'GROUNDED'}),
    storage:{values:new Map(),getItem(key){return this.values.get(key)||null;},setItem(key,value){this.values.set(key,String(value));}}
  });
  assert.notEqual(mission.status,'COMPLETED');
  assert.equal(mission.reason,'PLANNER_NO_EXECUTABLE_PLAN');
});

test('runtime authority is semantic and cache-busted without a static source-specific route',()=>{
  const planner=fs.readFileSync(new URL('../gestia-core/jarvis/jarvis.multifunction.planner.js',import.meta.url),'utf8');
  const core=fs.readFileSync(new URL('../gestia-core/gestia-core.js',import.meta.url),'utf8');
  const terminal=fs.readFileSync(new URL('../gestia-terminal.html',import.meta.url),'utf8');
  assert.match(planner,/MISSION_CONTRACT_CURRENT_POLICY_AUDIT/);
  assert.match(planner,/MISSION_COMPLETION_CURRENT_POLICY_AUDIT/);
  assert.match(planner,/cloud-semantic-response-audit-v2/);
  assert.match(core,/requireSemanticCompletionAudit:\s*true/);
  assert.match(core,/v142-current-policy-closure-20260816/);
  assert.match(terminal,/gestia-core\/gestia-core\.js\?v=v142-current-policy-closure-20260816/);
  const a=planner.indexOf('async function callMissionContractCoverageAuthority');
  const b=planner.indexOf('async function callBrowserSemanticPlan',a);
  const authority=planner.slice(a,b);
  for(const forbidden of ['tiktok.com','Taquería El Dorado']) assert.equal(authority.includes(forbidden),false);
});
''')

print('MISSION_CONTRACT_CURRENT_POLICY_TWO_PASS_V5=true')
print('MISSION_COMPLETION_CURRENT_POLICY_VERIFIED_V5=true')
print('PRODUCTION_SEMANTIC_CLOSURE_REQUIRED_V5=true')
print('BROWSER_MODULE_GRAPH_CACHE_BUST_V142=true')
