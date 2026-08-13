// v139 final certification trigger after materialized semantic-continuity fix.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { registerJarvisMultifunctionTools } from '../../gestia-core/jarvis/jarvis.multitool.pack.js';
import { registerJarvisActuatorTools } from '../../gestia-core/jarvis/jarvis.actuator.pack.js';
import { registerNexoRealMediaTools } from '../../gestia-core/nexo/nexo.real-media.tools.js';
import { runJarvisMission } from '../../gestia-core/jarvis/jarvis.mission.orchestrator.js';

const SOURCE = 'https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004';
const BRIDGE = 'http://127.0.0.1:3344';
const REQUIRED_BRIDGE_VERSION = '2.38.0-page-no-contact-route';
const expected = JSON.parse(fs.readFileSync('jarvis-runtime-contract.json', 'utf8'));

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

for (const required of ['reel.plan', 'speech.synthesize', 'web.media.collect', 'reel.create']) {
  if (!runtime.has(required)) throw new Error(`V139_REGISTERED_TOOL_REQUIRED:${required}`);
}

const planScenes = [
  {
    durationSeconds: 10,
    overlay: 'Taquería El Dorado',
    voiceover: 'En Cancún, el antojo tiene un nombre: Taquería El Dorado.',
    visual: 'Video real de la publicación de Taquería El Dorado mostrando el producto.',
    evidence: SOURCE,
    transition: 'fade'
  },
  {
    durationSeconds: 10,
    overlay: 'Sabor que se antoja',
    voiceover: 'Tacos preparados para convertir una visita en ese momento que quieres repetir.',
    visual: 'Continuación dinámica del video real, priorizando alimento y preparación.',
    evidence: SOURCE,
    transition: 'cut'
  },
  {
    durationSeconds: 10,
    overlay: 'Ven por los tuyos',
    voiceover: 'Guarda este lugar y ven a probar Taquería El Dorado en Cancún.',
    visual: 'Cierre con el mejor encuadre disponible del video real y llamado a la acción.',
    evidence: SOURCE,
    transition: 'fade'
  }
];
const renderScenes = planScenes.map(scene => ({
  durationSeconds: scene.durationSeconds,
  overlay: scene.overlay,
  subtitle: scene.voiceover,
  visualDescription: scene.visual,
  transition: scene.transition
}));

const instruction = `Usa exclusivamente medios verificables de esta publicación exacta ${SOURCE}. Crea un reel profesional vertical de 30 segundos para Taquería El Dorado en Cancún, con narración y archivo final físico. No publiques.`;
const mission = await runJarvisMission({
  instruction,
  initialToolCalls: [
    {
      name: 'reel.plan',
      args: {
        brandName: 'Taquería El Dorado',
        title: 'El antojo dorado de Cancún',
        cta: 'Ven por los tuyos',
        durationSeconds: 30,
        scenes: planScenes
      }
    },
    {
      name: 'reel.create',
      args: {
        brandName: 'Taquería El Dorado',
        title: 'El antojo dorado de Cancún',
        cta: 'Ven por los tuyos',
        durationSeconds: 30,
        scenes: renderScenes
      }
    }
  ],
  requiredToolNames: ['reel.plan', 'reel.create'],
  maximumSteps: 14,
  planner: async () => ({ missionComplete: true, toolCalls: [] }),
  execute: async (call, context) => runtime.execute(call.name, call.args, context)
});

console.log('V139_MISSION_STATUS', mission.status, mission.reason || '');
console.log('V139_EXECUTED_TOOLS', JSON.stringify(mission.executedTools));
console.log('V139_COMPLETED', JSON.stringify(mission.completedTasks.map(task => ({ name: task.name, status: task.observation?.status, artifact: task.observation?.artifact, evidence: task.observation?.evidence }))));
console.log('V139_BLOCKED', JSON.stringify(mission.blockedTasks.map(task => ({ name: task.name, reason: task.reason, status: task.observation?.status, evidence: task.observation?.evidence }))));

const completedNames = mission.completedTasks.map(task => task.name);
const expectedTools = ['reel.plan', 'speech.synthesize', 'web.media.collect', 'reel.create'];
for (const name of expectedTools) {
  if (!completedNames.includes(name)) throw new Error(`V139_COMPLETED_TOOL_REQUIRED:${name}`);
}
const order = expectedTools.map(name => mission.executedTools.indexOf(name));
if (!(order[0] >= 0 && order[1] > order[0] && order[2] > order[1] && order[3] > order[2])) {
  throw new Error(`V139_EXECUTION_ORDER_INVALID:${JSON.stringify(mission.executedTools)}`);
}
if (mission.blockedTasks.length > 0) throw new Error(`V139_BLOCKED_TASKS:${JSON.stringify(mission.blockedTasks)}`);

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

console.log('V139_EXACT_SOURCE_MEDIA=true');
console.log('V139_AUTOMATIC_SPEECH=true');
console.log('V139_AUTOMATIC_MEDIA_DEPENDENCY=true');
console.log('V139_FINAL_MP4_WITH_AUDIO=true');
console.log('V139_FINAL_SHA256_VERIFIED=true');
