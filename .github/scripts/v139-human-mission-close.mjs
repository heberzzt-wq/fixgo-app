import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { registerJarvisMultifunctionTools } from '../../gestia-core/jarvis/jarvis.multitool.pack.js';
import { registerJarvisActuatorTools } from '../../gestia-core/jarvis/jarvis.actuator.pack.js';
import { registerNexoRealMediaTools } from '../../gestia-core/nexo/nexo.real-media.tools.js';
import { runJarvisMission } from '../../gestia-core/jarvis/jarvis.mission.orchestrator.js';

const SOURCE = 'https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004';
const BRIDGE = 'http://127.0.0.1:3344';
const expected = JSON.parse(fs.readFileSync('jarvis-runtime-contract.json', 'utf8'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const healthResponse = await fetch(`${BRIDGE}/health`, { cache: 'no-store' });
const health = await healthResponse.json();
if (!healthResponse.ok || health?.identity?.ok !== true) {
  throw new Error(`HUMAN_BRIDGE_HEALTH_FAILED:${JSON.stringify(health)}`);
}
if (health.identity?.contract?.projectId !== expected.projectId || health.identity?.contract?.branch !== expected.branch || health.identity?.git?.branch !== expected.branch) {
  throw new Error(`HUMAN_BRIDGE_LINEAGE_MISMATCH:${JSON.stringify({ expected, actual: health.identity })}`);
}

const bridgeReleaseId = String(health.identity?.contract?.releaseId || '').trim();
if (!bridgeReleaseId) throw new Error('HUMAN_BRIDGE_RELEASE_ID_REQUIRED');

globalThis.JarvisLocalBridge = {
  async verifyIdentity() {
    return {
      ok: health.identity?.contract?.releaseId === expected.releaseId,
      status: health.identity?.contract?.releaseId === expected.releaseId ? 'BRIDGE_IDENTITY_OK' : 'BRIDGE_IDENTITY_MISMATCH',
      expected,
      actual: health.identity,
      bridgeVersion: health.version,
      lineageCompatible: true,
      releaseCompatible: health.identity?.contract?.releaseId === expected.releaseId,
      releaseSkewBridgeVersionCompatible: true
    };
  },
  async requestJson(endpoint, payload = {}, options = {}) {
    const timeoutMs = Math.max(5000, Number(options.timeoutMs || payload.timeoutMs || 45000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${BRIDGE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Jarvis-Release-Id': bridgeReleaseId
        },
        body: JSON.stringify(payload || {}),
        signal: controller.signal
      });
      const text = await response.text();
      let result;
      try { result = JSON.parse(text); }
      catch { result = { ok: false, status: 'BRIDGE_BAD_JSON', error: text.slice(0, 500) }; }
      return { ...result, httpOk: response.ok, httpStatus: response.status };
    } finally {
      clearTimeout(timer);
    }
  }
};

const registry = new Map();
const runtime = {
  register(tool) { registry.set(tool.name, tool); return { ok: true, tool: tool.name }; },
  get(name) { return registry.get(name); },
  has(name) { return registry.has(name); },
  list() { return [...registry.values()]; },
  async execute(name, args = {}, context = {}) {
    let result;
    if (name === 'web.research') {
      const local = await globalThis.JarvisLocalBridge.requestJson('/research', {
        query: args.query,
        allowedDomain: args.allowedDomain,
        exactEntity: args.exactEntity,
        seedUrl: args.seedUrl,
        timeoutMs: 30000
      }, { timeoutMs: 35000 });
      const sources = Array.isArray(local?.sources) ? local.sources.filter(Boolean) : [];
      const grounded = local?.ok === true && sources.length > 0;
      result = {
        ...local,
        ok: grounded,
        executionOk: true,
        objectiveSatisfied: grounded,
        blocked: !grounded,
        retryable: false,
        requiresInput: false,
        status: grounded ? 'WEB_RESEARCH_COMPLETED' : (local?.status || 'WEB_RESEARCH_UNAVAILABLE'),
        sources,
        validSources: sources,
        fallbackUsed: true,
        fallbackMode: 'LOCAL_GROUNDED_RESEARCH'
      };
    } else {
      const tool = registry.get(name);
      if (!tool?.execute) throw new Error(`HUMAN_TOOL_NOT_FOUND:${name}`);
      result = await tool.execute(args, context);
      if (
        name === 'web.media.collect' &&
        String(args?.url || '') === SOURCE &&
        result?.objectiveSatisfied !== true &&
        result?.status === 'WEB_REAL_MEDIA_REQUIREMENTS_UNMET'
      ) {
        console.log('HUMAN_MEDIA_RECOVERY_RETRY=1');
        await sleep(1500);
        result = await tool.execute(args, context);
        result = { ...result, boundedRecoveryAttempted: true };
      }
    }
    console.log('HUMAN_TOOL', name, JSON.stringify({
      ok: result?.ok,
      objectiveSatisfied: result?.objectiveSatisfied,
      blocked: result?.blocked,
      status: result?.status,
      error: result?.error,
      sourceCount: Array.isArray(result?.sources) ? result.sources.length : undefined,
      fallbackMode: result?.fallbackMode,
      boundedRecoveryAttempted: result?.boundedRecoveryAttempted,
      output: result?.output,
      mimeType: result?.mimeType,
      bytes: result?.bytes,
      sha256: result?.sha256
    }));
    return result;
  }
};

globalThis.JarvisToolRuntime = runtime;
registerJarvisMultifunctionTools(runtime);
registerJarvisActuatorTools(runtime);
registerNexoRealMediaTools(runtime);

for (const required of ['web.research', 'reel.plan', 'speech.synthesize', 'web.media.collect', 'reel.create']) {
  if (!runtime.has(required)) throw new Error(`HUMAN_REGISTERED_TOOL_REQUIRED:${required}`);
}

const scenes = [
  { durationSeconds: 10, overlay: 'Taquería El Dorado', voiceover: 'En Cancún, el antojo tiene un nombre: Taquería El Dorado.', visual: 'Video real de la publicación indicada.', evidence: SOURCE, transition: 'fade' },
  { durationSeconds: 10, overlay: 'Sabor que se antoja', voiceover: 'Mira el producto real de la publicación y deja que el antojo haga lo suyo.', visual: 'Continuación dinámica del medio real verificado.', evidence: SOURCE, transition: 'cut' },
  { durationSeconds: 10, overlay: 'Ven por los tuyos', voiceover: 'Guarda este lugar y visita Taquería El Dorado en Cancún.', visual: 'Cierre con el mejor encuadre real disponible.', evidence: SOURCE, transition: 'fade' }
];
const renderScenes = scenes.map(scene => ({
  durationSeconds: scene.durationSeconds,
  overlay: scene.overlay,
  subtitle: scene.voiceover,
  visualDescription: scene.visual,
  transition: scene.transition
}));

const instruction = `Investiga Taquería El Dorado, Cancún usando esta publicación exacta ${SOURCE}. La capa cloud se considera no disponible en este runner sin sesión; usa el fallback local verificable que recupera el 500. Después usa medios reales de esa publicación, sintetiza narración y crea un reel vertical profesional de 30 segundos. Si la captura dinámica de medios falla temporalmente, haz una sola recuperación razonable. No publiques.`;

const mission = await runJarvisMission({
  instruction,
  initialToolCalls: [
    {
      name: 'web.research',
      args: {
        query: 'Taquería El Dorado Cancún @taqueria.eldorado 7629216747131850004',
        researchGoal: 'RESEARCH_1',
        exactEntity: 'Taquería El Dorado',
        allowedDomain: 'tiktok.com',
        seedUrl: SOURCE
      }
    },
    {
      name: 'reel.plan',
      args: {
        brandName: 'Taquería El Dorado',
        title: 'El antojo dorado de Cancún',
        cta: 'Ven por los tuyos',
        durationSeconds: 30,
        scenes
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
  requiredToolNames: ['web.research', 'reel.plan', 'reel.create'],
  maximumSteps: 16,
  planner: async () => ({ missionComplete: true, toolCalls: [] }),
  execute: async (call, context) => runtime.execute(call.name, call.args, context)
});

console.log('HUMAN_MISSION_STATUS', mission.status, mission.reason || '');
console.log('HUMAN_EXECUTED', JSON.stringify(mission.executedTools));
console.log('HUMAN_BLOCKED', JSON.stringify(mission.blockedTasks.map(task => ({ name: task.name, reason: task.reason, status: task.observation?.status, error: task.observation?.error }))));

if (mission.status !== 'COMPLETED') throw new Error(`HUMAN_MISSION_NOT_COMPLETED:${mission.status}:${mission.reason || ''}`);
if (mission.blockedTasks.length) throw new Error(`HUMAN_MISSION_BLOCKED:${JSON.stringify(mission.blockedTasks)}`);
const completedNames = mission.completedTasks.map(task => task.name);
for (const name of ['web.research', 'reel.plan', 'speech.synthesize', 'web.media.collect', 'reel.create']) {
  if (!completedNames.includes(name)) throw new Error(`HUMAN_COMPLETED_TOOL_REQUIRED:${name}`);
}

const research = [...mission.completedTasks].reverse().find(task => task.name === 'web.research');
const researchObservation = research?.observation || {};
const researchText = JSON.stringify(researchObservation);
if (researchObservation?.fallbackMode !== 'LOCAL_GROUNDED_RESEARCH' && !researchText.includes('LOCAL_GROUNDED_RESEARCH')) throw new Error('HUMAN_RESEARCH_LOCAL_FALLBACK_REQUIRED');
if (!/tiktok\.com/i.test(researchText)) throw new Error(`HUMAN_RESEARCH_TIKTOK_SOURCE_REQUIRED:${researchText.slice(0, 1500)}`);

const speech = [...mission.completedTasks].reverse().find(task => task.name === 'speech.synthesize');
const speechOutput = String(speech?.observation?.artifact || speech?.observation?.evidence?.output || '');
if (!speechOutput.endsWith('.wav')) throw new Error(`HUMAN_WAV_REQUIRED:${speechOutput}`);
const wav = fs.readFileSync(path.join(process.cwd(), speechOutput));
if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('HUMAN_WAV_SIGNATURE_INVALID');

const media = [...mission.completedTasks].reverse().find(task => task.name === 'web.media.collect');
const mediaText = JSON.stringify(media?.observation?.evidence || media?.observation || {});
if (!mediaText.includes('@taqueria.eldorado') && !mediaText.includes('7629216747131850004')) throw new Error('HUMAN_MEDIA_EXACT_TIKTOK_PROVENANCE_REQUIRED');
if (!mediaText.includes('video/mp4')) throw new Error('HUMAN_MEDIA_MP4_REQUIRED');

const reel = [...mission.completedTasks].reverse().find(task => task.name === 'reel.create');
const reelEvidence = reel?.observation?.evidence || {};
const reelOutput = String(reel?.observation?.artifact || reelEvidence?.output || '');
const reelMime = String(reelEvidence?.mimeType || '');
const reelSha = String(reelEvidence?.sha256 || '');
if (!reelOutput.endsWith('.mp4')) throw new Error(`HUMAN_FINAL_MP4_REQUIRED:${reelOutput}`);
if (!reelMime.startsWith('video/mp4')) throw new Error(`HUMAN_FINAL_MP4_MIME_REQUIRED:${reelMime}`);
if (!/^[a-f0-9]{64}$/.test(reelSha)) throw new Error(`HUMAN_FINAL_SHA_REQUIRED:${reelSha}`);
const reelBytes = fs.readFileSync(path.join(process.cwd(), reelOutput));
if (reelBytes.toString('ascii', 4, 8) !== 'ftyp') throw new Error('HUMAN_FINAL_MP4_SIGNATURE_INVALID');
if (createHash('sha256').update(reelBytes).digest('hex') !== reelSha) throw new Error('HUMAN_FINAL_SHA_MISMATCH');
if (!/"audioTracksAdded"\s*:\s*[1-9]/.test(JSON.stringify(reelEvidence))) throw new Error('HUMAN_FINAL_AUDIO_TRACK_REQUIRED');

console.log('HUMAN_RESEARCH_LOCAL_FALLBACK=true');
console.log('HUMAN_EXACT_TIKTOK_MEDIA=true');
console.log('HUMAN_SPEECH_WAV=true');
console.log('HUMAN_FINAL_MP4_WITH_AUDIO=true');
console.log('HUMAN_FINAL_SHA_VERIFIED=true');
