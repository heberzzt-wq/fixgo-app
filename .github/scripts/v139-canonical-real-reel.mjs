// Canonical human-path certification for the exact Taquería El Dorado mission.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { registerJarvisMultifunctionTools } from '../../gestia-core/jarvis/jarvis.multitool.pack.js';
import { registerJarvisActuatorTools } from '../../gestia-core/jarvis/jarvis.actuator.pack.js';
import { registerNexoRealMediaTools } from '../../gestia-core/nexo/nexo.real-media.tools.js';
import { buildJarvisMultifunctionToolCalls } from '../../gestia-core/jarvis/jarvis.multifunction.planner.js';
import { ensureExecutableArtifactDependencies } from '../../gestia-core/jarvis/jarvis.mission.dependencies.js';
import { runJarvisMission } from '../../gestia-core/jarvis/jarvis.mission.orchestrator.js';

const require = createRequire(import.meta.url);
const { runJarvisSemanticPlanner } = require('../../functions/jarvis-semantic-planner.js');

const SOURCE = 'https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004';
const BRIDGE = 'http://127.0.0.1:3344';
const REQUIRED_BRIDGE_VERSION = '2.38.0-page-no-contact-route';
const expected = JSON.parse(fs.readFileSync('jarvis-runtime-contract.json', 'utf8'));

const canonicalSemanticPlanner = ({ input, catalog, missionState }) =>
  runJarvisSemanticPlanner({
    fetchImpl: fetch,
    simpleFetchImpl: null,
    input,
    catalog,
    missionState,
    timeoutMs: 60000
  });

function versionTuple(value = '') {
  const parts = String(value || '').trim().split('-')[0].split('.').slice(0, 3).map(Number);
  return parts.length === 3 && parts.every(part => Number.isInteger(part) && part >= 0) ? parts : null;
}

function versionAtLeast(actual = '', required = REQUIRED_BRIDGE_VERSION) {
  const a = versionTuple(actual);
  const r = versionTuple(required);
  if (!a || !r) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > r[i]) return true;
    if (a[i] < r[i]) return false;
  }
  return true;
}

const healthResponse = await fetch(`${BRIDGE}/health`, { cache: 'no-store' });
const bridgeHealth = await healthResponse.json();
const actual = bridgeHealth?.identity || null;
const bridgeVersion = String(bridgeHealth?.version || '').trim();
const identityCompatible =
  healthResponse.ok === true &&
  actual?.ok === true &&
  actual?.contract?.projectId === expected.projectId &&
  actual?.contract?.releaseId === expected.releaseId &&
  actual?.contract?.branch === expected.branch &&
  actual?.git?.branch === expected.branch;
if (!identityCompatible) {
  throw new Error(`V139_BRIDGE_IDENTITY_MISMATCH:${JSON.stringify({ expected, actual, bridgeVersion })}`);
}
if (!versionAtLeast(bridgeVersion)) {
  throw new Error(`V139_BRIDGE_VERSION_MISMATCH:${bridgeVersion}`);
}
const identity = {
  ok: true,
  status: 'BRIDGE_IDENTITY_OK',
  expected,
  actual,
  bridgeVersion,
  requiredBridgeVersion: REQUIRED_BRIDGE_VERSION,
  bridgeVersionCompatible: true
};
console.log('V139_BRIDGE_IDENTITY', JSON.stringify(identity));

globalThis.JarvisLocalBridge = {
  async verifyIdentity() { return identity; },
  async requestJson(endpoint, payload = {}, options = {}) {
    const verified = await this.verifyIdentity();
    const timeoutMs = Math.max(5000, Number(options.timeoutMs || payload.timeoutMs || 30000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${BRIDGE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Jarvis-Release-Id': verified.expected.releaseId
        },
        body: JSON.stringify(payload || {}),
        signal: controller.signal
      });
      const rawText = await response.text();
      let result;
      try { result = JSON.parse(rawText); }
      catch (error) {
        result = {
          ok: false,
          status: 'BRIDGE_BAD_JSON',
          error: 'BRIDGE_ENDPOINT_DID_NOT_RETURN_JSON',
          raw: rawText.slice(0, 1000),
          parseError: error?.message || String(error)
        };
      }
      return {
        ...result,
        httpOk: response.ok,
        httpStatus: response.status,
        bridgeIdentity: verified
      };
    }
    catch (error) {
      return {
        ok: false,
        success: false,
        status: error?.name === 'AbortError' ? 'BRIDGE_REQUEST_TIMEOUT' : 'BRIDGE_REQUEST_FAILED',
        error: error?.message || String(error),
        timeoutMs,
        path: endpoint,
        bridgeIdentity: verified
      };
    }
    finally { clearTimeout(timer); }
  }
};

function summarize(name, result) {
  return {
    name,
    ok: result?.ok,
    executionOk: result?.executionOk,
    objectiveSatisfied: result?.objectiveSatisfied,
    blocked: result?.blocked,
    status: result?.status,
    error: result?.error,
    output: result?.output,
    mimeType: result?.mimeType,
    bytes: result?.bytes,
    sha256: result?.sha256,
    audioTracksAdded: result?.audioTracksAdded,
    sourceCount: result?.sourceCount,
    validSources: Array.isArray(result?.validSources)
      ? result.validSources.slice(0, 8).map(item => ({ title: item?.title, url: item?.url }))
      : [],
    mediaAssets: Array.isArray(result?.mediaAssets)
      ? result.mediaAssets.slice(0, 4).map(item => ({
          kind: item?.kind,
          output: item?.output,
          mimeType: item?.mimeType,
          bytes: item?.bytes,
          sha256: item?.sha256,
          sourceUrl: item?.sourceUrl,
          sourceTag: item?.sourceTag
        }))
      : []
  };
}

const registry = new Map();
const runtime = {
  _registry: registry,
  register(tool) { registry.set(tool.name, tool); return { ok: true, tool: tool.name }; },
  get(name) { return registry.get(name); },
  has(name) { return registry.has(name); },
  list() { return [...registry.values()]; },
  async execute(name, args = {}, context = {}) {
    const tool = registry.get(name);
    if (!tool?.execute) throw new Error(`TOOL_NOT_FOUND:${name}`);
    const result = await tool.execute(args, context);
    console.log('V139_TOOL_RESULT', JSON.stringify(summarize(name, result)));
    return result;
  }
};
globalThis.JarvisToolRuntime = runtime;
registerJarvisMultifunctionTools(runtime);
registerJarvisActuatorTools(runtime);
registerNexoRealMediaTools(runtime);

for (const required of ['web.research', 'marketing.plan', 'reel.plan', 'speech.synthesize', 'web.media.collect', 'reel.create']) {
  if (!runtime.has(required)) throw new Error(`V139_REGISTERED_TOOL_REQUIRED:${required}`);
}

const instruction = `Investiga esta publicación exacta de TikTok:

https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004

La empresa es Taquería El Dorado, Cancún.

Quiero que ejecutes la misión completa, no sólo que me expliques cómo hacerlo.

Primero investiga la publicación y el negocio utilizando únicamente información que puedas verificar.

Identifica correctamente qué negocio corresponde a la publicación y evita confundirlo con otros establecimientos de nombre parecido.

Investiga por tu cuenta toda la información pública útil que encuentres: ubicación, teléfono, horarios, redes sociales, servicios, productos, promociones u otros datos relevantes.

Si algún dato importante no aparece inicialmente, intenta investigarlo por otros medios antes de darte por vencido.

Si después de investigar realmente no puedes verificar algún dato importante, dime exactamente cuál falta y pregúntame si puedo proporcionártelo. No lo inventes.

Separa claramente:

información verificada;
información que no pudiste verificar;
inferencias o recomendaciones.

Conserva las fuentes y la procedencia de la información.

Después de investigar, crea una propuesta de marketing basada únicamente en los hechos realmente encontrados.

Luego crea un reel vertical profesional de aproximadamente 30 segundos para promocionar Taquería El Dorado.

El reel debe:

utilizar medios reales y verificables de la publicación indicada;
tener formato vertical;
incluir apertura, desarrollo y llamada a la acción;
incluir textos/overlays;
incluir narración de voz;
producir un archivo final de video reproducible;
no inventar teléfono, dirección, precios, promociones, horarios ni características;
no sustituir silenciosamente el contenido real por imágenes inventadas;
no publicar nada en ninguna red social.

No quiero solamente un storyboard, un guion ni instrucciones para producirlo.

Quiero que ejecutes realmente las herramientas disponibles hasta obtener el artefacto final.

Si una herramienta falla temporalmente, intenta una recuperación razonable antes de abandonar la misión.

Al terminar entrégame:

resumen de la investigación;
datos confirmados;
datos que no pudiste verificar;
fuentes utilizadas;
herramientas ejecutadas;
estrategia breve del reel;
archivo final generado;
confirmación de que contiene narración;
confirmación de que utilizó medios verificables de la publicación;
cualquier limitación real encontrada.

No declares éxito si el archivo final no existe realmente.`;

const missionToolCatalog = runtime.list().filter(tool =>
  tool?.name !== 'conversation.respond' &&
  (
    tool?.mutates !== true ||
    (tool?.userArtifact === true && tool?.requiresApproval !== true)
  )
);

const plannedInitialCalls = await buildJarvisMultifunctionToolCalls(
  instruction,
  {
    throwOnUnavailable: true,
    semanticPlanner: canonicalSemanticPlanner,
    toolCatalog: missionToolCatalog,
    missionState: {
      phase: 'CURRENT_TURN',
      writeAllowed: false,
      userArtifactAllowed: true
    }
  }
);
console.log('V139_EXACT_PROMPT_INITIAL_PLAN', JSON.stringify(plannedInitialCalls.map(call => ({ name: call.name, args: call.args }))));
if (plannedInitialCalls.length === 0) {
  throw new Error('V139_EXACT_PROMPT_NO_EXECUTABLE_PLAN');
}

const initialToolCalls = ensureExecutableArtifactDependencies({
  toolCalls: plannedInitialCalls,
  catalog: missionToolCatalog
});
if (!Array.isArray(initialToolCalls) || initialToolCalls.length === 0) {
  throw new Error('V139_EXACT_PROMPT_NO_INITIAL_TOOLS_AFTER_EXISTING_DEPENDENCIES');
}

function compactObservation(observation = {}) {
  return {
    status: observation?.status || null,
    objectiveSatisfied: observation?.objectiveSatisfied === true,
    artifact: observation?.artifact || null,
    output: observation?.output || observation?.evidence?.output || null,
    sourceCount: Number(observation?.sourceCount || 0),
    validSources: Array.isArray(observation?.validSources)
      ? observation.validSources.slice(0, 8).map(item => ({ title: item?.title, url: item?.url }))
      : []
  };
}

const mission = await runJarvisMission({
  instruction,
  initialToolCalls,
  requiredToolNames: [...new Set(initialToolCalls.map(call => call.name))],
  maximumSteps: 20,
  maximumRetries: 2,
  timeoutMs: 360000,
  planner: async ({ originalInstruction, mission: missionState }) => {
    const resolvedSignatures = new Set(
      [...missionState.completedTasks, ...missionState.blockedTasks].map(item =>
        `${item.name}:${JSON.stringify(item.args || {})}`
      )
    );
    const requiredResolved = missionState.requiredToolNames.every(name =>
      missionState.completedTasks.some(item => item.name === name) ||
      missionState.blockedTasks.some(item => item.name === name)
    );
    const phase = requiredResolved ? 'COMPLETION_AUDIT' : 'MISSION_CONTRACT';
    const nextCalls = await buildJarvisMultifunctionToolCalls(
      originalInstruction,
      {
        throwOnUnavailable: true,
        semanticPlanner: canonicalSemanticPlanner,
        toolCatalog: missionToolCatalog,
        missionState: {
          phase,
          missionId: missionState.missionId,
          caseId: missionState.caseId,
          objectiveId: missionState.objectiveId,
          requiredToolNames: missionState.requiredToolNames,
          completedTasks: missionState.completedTasks.map(item => ({
            name: item.name,
            args: item.args,
            observation: compactObservation(item.observation)
          })),
          pendingTasks: missionState.pendingTasks.map(item => ({ name: item.name, args: item.args })),
          blockedTasks: missionState.blockedTasks.map(item => ({
            name: item.name,
            args: item.args,
            reason: item.reason,
            observation: compactObservation(item.observation)
          })),
          iterations: missionState.iterations,
          writeAllowed: false,
          userArtifactAllowed: true
        }
      }
    );
    const unresolvedCall = nextCalls.find(call =>
      !resolvedSignatures.has(`${call.name}:${JSON.stringify(call.args || {})}`)
    ) || null;
    console.log('V139_EXACT_PROMPT_NEXT_PLAN', JSON.stringify({
      phase,
      missionComplete: nextCalls.missionComplete === true,
      next: unresolvedCall ? { name: unresolvedCall.name, args: unresolvedCall.args } : null
    }));
    if (unresolvedCall) {
      return {
        toolCalls: ensureExecutableArtifactDependencies({
          toolCalls: [unresolvedCall],
          catalog: missionToolCatalog
        }),
        missionComplete: false,
        completionAssessment: nextCalls.completionAssessment || null
      };
    }
    if (nextCalls.missionComplete === true) {
      return {
        toolCalls: [],
        missionComplete: true,
        completionAssessment: nextCalls.completionAssessment || null
      };
    }
    throw new Error(`V139_EXACT_PROMPT_PLANNER_NO_NEXT_EXECUTABLE_CALL:${phase}`);
  },
  execute: async (call, context) => runtime.execute(call.name, call.args, context)
});

console.log('V139_MISSION_STATUS', mission.status, mission.reason || '');
console.log('V139_EXECUTED_TOOLS', JSON.stringify(mission.executedTools));
console.log('V139_COMPLETED', JSON.stringify(mission.completedTasks.map(task => ({ name: task.name, status: task.observation?.status, artifact: task.observation?.artifact, evidence: task.observation?.evidence }))));
console.log('V139_BLOCKED', JSON.stringify(mission.blockedTasks.map(task => ({ name: task.name, reason: task.reason, status: task.observation?.status, evidence: task.observation?.evidence }))));

if (mission.status !== 'COMPLETED') {
  throw new Error(`V139_EXACT_PROMPT_MISSION_NOT_COMPLETED:${mission.status}:${mission.reason || ''}`);
}
if (mission.blockedTasks.length > 0) {
  throw new Error(`V139_BLOCKED_TASKS:${JSON.stringify(mission.blockedTasks)}`);
}

const completedNames = mission.completedTasks.map(task => task.name);
const expectedTools = ['web.research', 'marketing.plan', 'reel.plan', 'speech.synthesize', 'web.media.collect', 'reel.create'];
for (const name of expectedTools) {
  if (!completedNames.includes(name)) throw new Error(`V139_COMPLETED_TOOL_REQUIRED:${name}`);
}

const researchTasks = mission.completedTasks.filter(task => task.name === 'web.research');
const researchEvidenceText = JSON.stringify(researchTasks.map(task => ({
  args: task.args,
  observation: task.observation
})));
if (!researchEvidenceText.includes('@taqueria.eldorado') && !researchEvidenceText.includes('7629216747131850004')) {
  throw new Error('V139_EXACT_TIKTOK_RESEARCH_PROVENANCE_REQUIRED');
}

const order = ['reel.plan', 'speech.synthesize', 'web.media.collect', 'reel.create'].map(name => mission.executedTools.indexOf(name));
if (!(order[0] >= 0 && order[1] > order[0] && order[2] > order[1] && order[3] > order[2])) {
  throw new Error(`V139_EXECUTION_ORDER_INVALID:${JSON.stringify(mission.executedTools)}`);
}

const speech = [...mission.completedTasks].reverse().find(task => task.name === 'speech.synthesize');
const speechOutput = String(speech?.observation?.artifact || speech?.observation?.evidence?.output || '');
if (!speechOutput.endsWith('.wav')) throw new Error(`V139_WAV_REQUIRED:${speechOutput}`);
const speechBytes = fs.readFileSync(path.join(process.cwd(), speechOutput));
if (speechBytes.toString('ascii', 0, 4) !== 'RIFF' || speechBytes.toString('ascii', 8, 12) !== 'WAVE') {
  throw new Error('V139_WAV_SIGNATURE_INVALID');
}

const media = [...mission.completedTasks].reverse().find(task => task.name === 'web.media.collect');
const mediaText = JSON.stringify(media?.observation?.evidence || {});
if (!mediaText.includes('@taqueria.eldorado') && !mediaText.includes('7629216747131850004')) {
  throw new Error('V139_EXACT_TIKTOK_PROVENANCE_REQUIRED');
}
if (!mediaText.includes('video/mp4')) throw new Error('V139_REAL_MP4_SOURCE_MEDIA_REQUIRED');

const reel = [...mission.completedTasks].reverse().find(task => task.name === 'reel.create');
const reelOutput = String(reel?.observation?.artifact || reel?.observation?.evidence?.output || '');
const reelMime = String(reel?.observation?.evidence?.mimeType || '');
const reelSha = String(reel?.observation?.evidence?.sha256 || '');
if (!reelOutput.endsWith('.mp4')) throw new Error(`V139_FINAL_MP4_REQUIRED:${reelOutput}`);
if (!reelMime.startsWith('video/mp4')) throw new Error(`V139_FINAL_MP4_MIME_REQUIRED:${reelMime}`);
if (!/^[a-f0-9]{64}$/.test(reelSha)) throw new Error(`V139_FINAL_SHA_REQUIRED:${reelSha}`);
const reelBytes = fs.readFileSync(path.join(process.cwd(), reelOutput));
if (reelBytes.toString('ascii', 4, 8) !== 'ftyp') throw new Error('V139_FINAL_MP4_SIGNATURE_INVALID');
if (createHash('sha256').update(reelBytes).digest('hex') !== reelSha) throw new Error('V139_FINAL_SHA_MISMATCH');
const reelEvidenceText = JSON.stringify(reel?.observation?.evidence || {});
if (!/"audioTracksAdded"\s*:\s*[1-9]/.test(reelEvidenceText)) {
  throw new Error(`V139_FINAL_AUDIO_TRACK_REQUIRED:${reelEvidenceText.slice(0, 2000)}`);
}

console.log('V139_EXACT_HUMAN_PROMPT=true');
console.log('V139_SEMANTIC_PLAN_NOT_PRESEEDED=true');
console.log('V139_RESEARCH_EXECUTED=true');
console.log('V139_MARKETING_PLAN_EXECUTED=true');
console.log('V139_EXACT_SOURCE_MEDIA=true');
console.log('V139_AUTOMATIC_SPEECH=true');
console.log('V139_AUTOMATIC_MEDIA_DEPENDENCY=true');
console.log('V139_FINAL_MP4_WITH_AUDIO=true');
console.log('V139_FINAL_SHA256_VERIFIED=true');