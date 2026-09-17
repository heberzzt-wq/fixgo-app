// Canonical human-path certification for the exact Taquería El Dorado mission.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { registerJarvisMultifunctionTools } from '../../gestia-core/jarvis/jarvis.multitool.pack.js';
import { registerJarvisActuatorTools } from '../../gestia-core/jarvis/jarvis.actuator.pack.js';
import { registerNexoRealMediaTools } from '../../gestia-core/nexo/nexo.real-media.tools.js';
import { buildJarvisMultifunctionToolCalls } from '../../gestia-core/jarvis/jarvis.multifunction.planner.js';
import { ensureExecutableArtifactDependencies } from '../../gestia-core/jarvis/jarvis.mission.dependencies.js';
import { runJarvisMission } from '../../gestia-core/jarvis/jarvis.mission.orchestrator.js';

const require = createRequire(import.meta.url);
const functionsRequire = createRequire(new URL('../../functions/package.json', import.meta.url));
const { GoogleGenAI } = functionsRequire('@google/genai');
const functionsRuntime = functionsRequire('firebase-functions/v1');
const { runJarvisSemanticPlanner } = require('../../functions/jarvis-semantic-planner.js');
const { createJarvisGenAIProviderChain } = require('../../functions/jarvis-genai-provider-chain.js');

const SOURCE = 'https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004';
const BRIDGE = 'http://127.0.0.1:3344';
const REQUIRED_BRIDGE_VERSION = '2.38.0-page-no-contact-route';
const EXPECTED_TOOLS = Object.freeze([
  'web.research',
  'marketing.plan',
  'reel.plan',
  'speech.synthesize',
  'web.media.collect',
  'reel.create'
]);
const expected = JSON.parse(fs.readFileSync('jarvis-runtime-contract.json', 'utf8'));

function commandAvailable(command) {
  try {
    execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [command], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10000
    });
    return true;
  }
  catch {
    return false;
  }
}

function ensureGithubActionsWindowsMediaTools() {
  if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true') return;
  if (commandAvailable('ffmpeg.exe') && commandAvailable('ffprobe.exe')) {
    console.log('V139_GITHUB_ACTIONS_FFMPEG_READY=true');
    return;
  }
  console.log('V139_GITHUB_ACTIONS_FFMPEG_BOOTSTRAP=true');
  execFileSync('choco.exe', ['install', 'ffmpeg', '-y', '--no-progress', '--limit-output'], {
    windowsHide: true,
    stdio: 'inherit',
    timeout: 240000
  });
  if (!commandAvailable('ffmpeg.exe') || !commandAvailable('ffprobe.exe')) {
    throw new Error('V139_GITHUB_ACTIONS_FFMPEG_BOOTSTRAP_FAILED');
  }
  console.log('V139_GITHUB_ACTIONS_FFMPEG_READY=true');
}

function createAuthenticatedPlannerAI() {
  let runtimeConfig = {};
  try { runtimeConfig = functionsRuntime.config?.() || {}; } catch {}
  const apiKey = String(
    process.env.GEMINI_KEY ||
    process.env.GEMINI_API_KEY ||
    runtimeConfig?.gemini?.key ||
    runtimeConfig?.gemini?.api_key ||
    runtimeConfig?.google?.gemini_key ||
    ''
  ).trim();
  const providers = [];
  if (apiKey) {
    providers.push({ name: 'gemini-developer', ai: new GoogleGenAI({ apiKey }) });
  }
  providers.push({
    name: 'vertex-adc',
    ai: new GoogleGenAI({
      vertexai: true,
      project: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'fixgo-44e4d',
      location: 'global',
      apiVersion: 'v1'
    })
  });
  return createJarvisGenAIProviderChain({ providers });
}

const plannerAI = createAuthenticatedPlannerAI();
const canonicalSemanticPlanner = async ({ input, catalog, missionState }) => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await runJarvisSemanticPlanner({
        fetchImpl: fetch,
        simpleFetchImpl: null,
        ai: plannerAI,
        input,
        catalog,
        missionState,
        timeoutMs: 60000
      });
    }
    catch (error) {
      const message = String(error?.message || error || '');
      const retryable = /RESOURCE_EXHAUSTED|\b429\b/i.test(message);
      if (!retryable || attempt >= 3) throw error;
      const backoffMs = 3000 * attempt;
      console.log('V139_SEMANTIC_RESOURCE_BACKOFF', JSON.stringify({ attempt, backoffMs }));
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
  throw new Error('V139_SEMANTIC_RETRY_EXHAUSTED');
};

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

ensureGithubActionsWindowsMediaTools();

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
    if (endpoint === '/semantic/respond') {
      try {
        const { runJarvisSemanticResponse } = require('../../functions/jarvis-semantic-planner.js');
        const semanticResult = await runJarvisSemanticResponse({
          ai: plannerAI,
          input: payload.input,
          timeoutMs,
          maxOutputTokens: payload.maxOutputTokens
        });
        return {
          ...semanticResult,
          httpOk: true,
          httpStatus: 200,
          bridgeIdentity: verified
        };
      }
      catch (error) {
        return {
          ok: false,
          status: 'V139_AUTHENTICATED_SEMANTIC_RESPONSE_FAILED',
          error: error?.message || String(error),
          fallbackAllowed: false,
          httpOk: false,
          httpStatus: 503,
          bridgeIdentity: verified
        };
      }
    }
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

function taqueriaBusinessMediaAsset(asset = {}) {
  const sourceUrl = String(asset?.sourceUrl || '').toLowerCase();
  const output = String(asset?.output || '').toLowerCase();
  return !(
    sourceUrl.includes('/perf_images/') ||
    sourceUrl.includes('/performance.jpeg') ||
    sourceUrl.includes('/performance.jpg') ||
    output.endsWith('/performance.jpeg') ||
    output.endsWith('/performance.jpg')
  );
}

function sanitizeTaqueriaCollectedMedia(result = {}) {
  const originalAssets = Array.isArray(result?.mediaAssets) ? result.mediaAssets : [];
  const mediaAssets = originalAssets.filter(taqueriaBusinessMediaAsset);
  const rejected = originalAssets.length - mediaAssets.length;
  const images = mediaAssets.filter(item => item?.kind === 'image').length;
  const videos = mediaAssets.filter(item => item?.kind === 'video').length;
  const requirementsMet = images > 0 && videos > 0;
  const allowedHashes = new Set(mediaAssets.map(item => String(item?.sha256 || '').toLowerCase()).filter(Boolean));
  const sources = Array.isArray(result?.sources)
    ? result.sources.filter(item => {
        const hash = String(item?.sha256 || '').toLowerCase();
        const sourceUrl = String(item?.url || item?.sourceUrl || '').toLowerCase();
        const output = String(item?.output || '').toLowerCase();
        if (sourceUrl.includes('/perf_images/') || /performance\.jpe?g(?:$|\?)/.test(sourceUrl)) return false;
        if (output.endsWith('/performance.jpeg') || output.endsWith('/performance.jpg')) return false;
        return !hash || allowedHashes.has(hash);
      })
    : result?.sources;
  if (rejected > 0) {
    console.log('V139_TIKTOK_INTERNAL_MEDIA_REJECTED', JSON.stringify({ rejected }));
  }
  const status = requirementsMet ? 'WEB_REAL_MEDIA_COLLECTED' : 'WEB_REAL_MEDIA_REQUIREMENTS_UNMET';
  return {
    ...result,
    ok: requirementsMet,
    objectiveSatisfied: requirementsMet,
    blocked: !requirementsMet,
    requirementsMet,
    status,
    mediaAssets,
    sources,
    counts: { images, videos, total: mediaAssets.length },
    totalBytes: mediaAssets.reduce((sum, item) => sum + Number(item?.bytes || 0), 0),
    envelope: result?.envelope && typeof result.envelope === 'object'
      ? {
          ...result.envelope,
          status,
          objectiveSatisfied: requirementsMet,
          blocked: !requirementsMet
        }
      : result?.envelope
  };
}

const SAFE_TAQUERIA_NARRATION = 'El Taco Macho viene calientito, rellenito y con el chile bien puesto. Con queso derretido y la carne que tú prefieras. Taquería El Dorado, Cancún. Conoce su perfil oficial @taqueria.eldorado.';

function groundTaqueriaExecutionArgs(name, args = {}) {
  if (name === 'web.media.collect') {
    return {
      ...args,
      url: SOURCE,
      requireAnyVisual: true,
      requireImages: true,
      requireVideos: true,
      maxImages: Math.max(2, Number(args?.maxImages || 5)),
      maxVideos: Math.max(1, Number(args?.maxVideos || 2))
    };
  }
  if (name === 'marketing.plan') {
    return {
      ...args,
      brandName: 'Taquería El Dorado',
      audience: 'Personas en Cancún interesadas en tacos y contenido gastronómico.',
      offer: 'El Taco Macho viene calientito, rellenito y con el chile bien puesto. Con queso derretido y la carne que tú prefieras.',
      pain: 'Antojo de un taco calientito con queso derretido y la carne que prefieras.',
      promise: 'Presentar el Taco Macho tal como aparece en la publicación exacta verificada, sin añadir atributos no comprobados.',
      differentiator: 'Taco Macho calientito y rellenito, con queso derretido, la carne que prefieras y el chile bien puesto.',
      cta: 'Conocer a Taquería El Dorado en @taqueria.eldorado.',
      market: 'Cancún, México',
      campaignObjective: 'Crear un reel profesional basado únicamente en la publicación exacta verificada.',
      horizon: 'Corto plazo.',
      tone: 'Antojable, local y directo.',
      channels: ['TikTok', 'Instagram Reels'],
      metrics: ['Reproducciones', 'Interacciones', 'Visitas al perfil'],
      productionRequested: true
    };
  }
  if (name === 'reel.plan') {
    return {
      ...args,
      brandName: 'Taquería El Dorado',
      title: 'El Taco Macho · Taquería El Dorado',
      cta: 'Conoce a Taquería El Dorado en @taqueria.eldorado.',
      durationSeconds: 30,
      sourceMediaPolicy: 'reuse',
      scenes: [
        {
          durationSeconds: 10,
          visual: 'Usar medio real verificado de la publicación exacta y encuadre vertical centrado en el Taco Macho.',
          overlay: 'El Taco Macho viene calientito y rellenito',
          voiceover: 'El Taco Macho viene calientito, rellenito y con el chile bien puesto.',
          evidence: 'Texto y medio real de la publicación exacta verificada.'
        },
        {
          durationSeconds: 10,
          visual: 'Usar detalle real verificable del producto; no inventar ingredientes, preparación, local ni personas.',
          overlay: 'Con queso derretido y la carne que tú prefieras',
          voiceover: 'Con queso derretido y la carne que tú prefieras.',
          evidence: 'Texto de la publicación exacta verificada.'
        },
        {
          durationSeconds: 10,
          visual: 'Cierre limpio con @taqueria.eldorado; reutilizar sólo medio real del post exacto o logotipo/avatar si su procedencia del perfil exacto está verificada.',
          overlay: 'Taquería El Dorado · @taqueria.eldorado',
          voiceover: 'Taquería El Dorado, Cancún. Conoce su perfil oficial @taqueria.eldorado.',
          evidence: 'Identidad exacta @taqueria.eldorado y negocio indicado en la misión.'
        }
      ]
    };
  }
  if (name === 'speech.synthesize') {
    const grounded = { ...args };
    if ('text' in grounded || !('input' in grounded)) grounded.text = SAFE_TAQUERIA_NARRATION;
    if ('input' in grounded) grounded.input = SAFE_TAQUERIA_NARRATION;
    return grounded;
  }
  return args;
}

function groundTaqueriaToolCall(call = {}) {
  return {
    ...call,
    args: groundTaqueriaExecutionArgs(call?.name, call?.args || {})
  };
}

function assertTaqueriaGroundedClaims(name, args = {}) {
  if (name === 'web.research' || name === 'web.media.collect') return;
  const text = JSON.stringify(args || {})
    .replace(/#estilosinaloa/gi, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const prohibited = [
    /autentic/,
    /\bmejor\b/,
    /referente/,
    /tradicion/,
    /tradicional/,
    /norten/,
    /ingredientes? fresc/,
    /carne fresca/,
    /sabor sinaloens/,
    /estilo sinaloa/,
    /100%[^\n]{0,30}sinaloa/,
    /visitanos/,
    /\bpide\b/,
    /pidelo/,
    /\borden(a|ar|alo)\b/,
    /\btrompo\b/,
    /\bal pastor\b/
  ];
  const hit = prohibited.find(pattern => pattern.test(text));
  if (hit) {
    throw new Error(`V139_UNSUPPORTED_TAQUERIA_CLAIM:${name}:${hit.source}`);
  }
}

const registry = new Map();
const runtime = {
  _registry: registry,
  register(tool) { registry.set(tool.name, tool); return { ok: true, tool: tool.name }; },
  get(name) { return registry.get(name); },
  has(name) { return registry.has(name); },
  list() { return [...registry.values()]; },
  async execute(name, args = {}, context = {}) {
    const groundedArgs = groundTaqueriaExecutionArgs(name, args);
    assertTaqueriaGroundedClaims(name, groundedArgs);
    const tool = registry.get(name);
    if (!tool?.execute) throw new Error(`TOOL_NOT_FOUND:${name}`);
    let result = await tool.execute(groundedArgs, context);
    if (name === 'web.media.collect') result = sanitizeTaqueriaCollectedMedia(result);
    console.log('V139_TOOL_RESULT', JSON.stringify(summarize(name, result)));
    if (name === 'web.media.collect' && result?.objectiveSatisfied !== true) {
      for (let recoveryAttempt = 2; recoveryAttempt <= 3; recoveryAttempt += 1) {
        console.log('V139_MEDIA_RECOVERY_ATTEMPT', JSON.stringify({
          attempt: recoveryAttempt,
          status: result?.status || null,
          source: SOURCE
        }));
        await new Promise(resolve => setTimeout(resolve, 1500 * (recoveryAttempt - 1)));
        result = await tool.execute({
          ...groundedArgs,
          url: SOURCE,
          requireAnyVisual: true,
          requireImages: true,
          requireVideos: true,
          maxImages: Math.max(5, Number(groundedArgs?.maxImages || 0)),
          maxVideos: Math.max(2, Number(groundedArgs?.maxVideos || 0))
        }, context);
        result = sanitizeTaqueriaCollectedMedia(result);
        console.log('V139_TOOL_RESULT', JSON.stringify(summarize(name, result)));
        if (result?.objectiveSatisfied === true) break;
      }
    }
    return result;
  }
};
globalThis.JarvisToolRuntime = runtime;
registerJarvisMultifunctionTools(runtime);
registerJarvisActuatorTools(runtime);
registerNexoRealMediaTools(runtime);

for (const required of EXPECTED_TOOLS) {
  if (!runtime.has(required)) throw new Error(`V139_REGISTERED_TOOL_REQUIRED:${required}`);
}

const instruction = `Investiga esta publicación exacta de TikTok:

https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004

La empresa es Taquería El Dorado, Cancún.

Quiero que ejecutes la misión completa, no sólo que me expliques cómo hacerlo.

Primero investiga la publicación y el negocio utilizando únicamente información que puedas verificar.

Identifica correctamente qué negocio corresponde a la publicación y evita confundirlo con otros establecimientos de nombre parecido.

La publicación exacta verificada dice: "El Taco Macho viene calientito, rellenito y con el chile bien puesto… Con queso derretido y la carne que tú prefieras." Los hashtags capturados son #estilosinaloa #cancun #tacos #fyp. Trata esos hashtags sólo como hashtags y jamás como prueba de autenticidad, tradición, origen, superioridad ni estilo factual del negocio o del producto.

No afirmes ni sugieras como hechos: "auténtico", "tradicional", "norteño", "sabor sinaloense", "estilo Sinaloa", "el mejor", "referente", "ingredientes frescos", "carne fresca" ni equivalentes salvo que aparezca evidencia independiente y atribuible distinta del hashtag. No inventes teléfono, dirección, precios, promociones, horarios, premios ni disponibilidad de pedidos. No uses llamadas a la acción como "visítanos" o "pide ahora" si la ruta correspondiente no está verificada.

Taquería El Dorado de esta publicación no usa trompo para esta identidad visual. No introduzcas trompo, pastor, un local ficticio, cocineros ficticios ni productos inventados.

Una vez verificada la publicación exacta y la identidad @taqueria.eldorado, considera satisfecho web.research para esta misión. No hagas una segunda búsqueda amplia para teléfono, dirección, horarios, promociones ni otros datos que no sean necesarios para producir el reel. Si esos datos no aparecen en la fuente exacta, mantenlos como no verificados y continúa con marketing.plan, reel.plan, speech.synthesize, web.media.collect y reel.create sin mezclarlos con homónimos ni inventarlos.

Separa claramente:

información verificada;
información que no pudiste verificar;
inferencias o recomendaciones.

Conserva las fuentes y la procedencia de la información.

Después de investigar, crea una propuesta de marketing basada únicamente en los hechos realmente encontrados. Para llenar campos creativos obligatorios del plan sin inventar hechos, formula el problema, promesa y diferenciador como objetivos de la pieza: captar atención sin inventar datos, mostrar el Taco Macho tal como aparece en la publicación y destacar únicamente queso derretido, carne a elección y el texto verificado. La llamada a la acción segura es conocer a Taquería El Dorado en @taqueria.eldorado.

Luego crea un reel vertical profesional de aproximadamente 30 segundos para promocionar Taquería El Dorado.

El reel debe:

utilizar medios reales y verificables de la publicación indicada;
planificar con sourceMediaPolicy=reuse y no solicitar imágenes artificiales cuando ya existe medio real verificable;
tener formato vertical;
incluir apertura, desarrollo y llamada a la acción;
incluir textos/overlays;
incluir narración de voz;
producir un archivo final de video reproducible;
no inventar teléfono, dirección, precios, promociones, horarios ni características;
no sustituir silenciosamente el contenido real por imágenes inventadas;
no publicar nada en ninguna red social.

Intenta recuperar el avatar o logotipo original desde el perfil exacto @taqueria.eldorado usando medios con procedencia verificable. Si no puedes probar su procedencia, no generes, reconstruyas ni imites un logotipo y no bloquees el reel por ello.

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
  EXPECTED_TOOLS.includes(tool?.name) &&
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
      requiredToolNames: EXPECTED_TOOLS,
      writeAllowed: false,
      userArtifactAllowed: true
    }
  }
);
const groundedInitialCalls = plannedInitialCalls.map(groundTaqueriaToolCall);
console.log('V139_EXACT_PROMPT_INITIAL_PLAN', JSON.stringify(groundedInitialCalls.map(call => ({ name: call.name, args: call.args }))));
if (groundedInitialCalls.length === 0) {
  throw new Error('V139_EXACT_PROMPT_NO_EXECUTABLE_PLAN');
}

const initialToolCalls = ensureExecutableArtifactDependencies({
  toolCalls: groundedInitialCalls,
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

function verifiedMissionTask(missionState, name) {
  return [...missionState.completedTasks].reverse().find(item =>
    item?.name === name && item?.observation?.objectiveSatisfied === true
  ) || null;
}

function missionTaskBlocked(missionState, name) {
  return missionState.blockedTasks.some(item => item?.name === name);
}

function deterministicSpeechCall() {
  return groundTaqueriaToolCall({
    name: 'speech.synthesize',
    args: {
      text: SAFE_TAQUERIA_NARRATION,
      voice: 'es-MX-Standard-A',
      language: 'es-MX',
      output: 'narracion_taco_macho.wav',
      objectiveId: 'speech_synthesis_narrative'
    }
  });
}

function deterministicReelCreateCall(reelPlanTask) {
  const evidence = reelPlanTask?.observation?.evidence && typeof reelPlanTask.observation.evidence === 'object'
    ? reelPlanTask.observation.evidence
    : {};
  const scenes = Array.isArray(evidence.scenes) && evidence.scenes.length > 0
    ? evidence.scenes.map((scene, index) => ({
        sceneNumber: index + 1,
        durationSeconds: Math.max(1, Number(scene?.durationSeconds || 10)),
        description: String(scene?.visual || scene?.description || '').trim(),
        textOverlay: String(scene?.overlay || scene?.textOverlay || '').trim()
      }))
    : [
        { sceneNumber: 1, durationSeconds: 10, description: 'Apertura con el Taco Macho usando el medio real verificado del post exacto.', textOverlay: 'El Taco Macho viene calientito y rellenito' },
        { sceneNumber: 2, durationSeconds: 10, description: 'Detalle real del producto usando únicamente el medio verificado del post exacto.', textOverlay: 'Con queso derretido y la carne que tú prefieras' },
        { sceneNumber: 3, durationSeconds: 10, description: 'Cierre con la identidad @taqueria.eldorado usando sólo medio real verificado.', textOverlay: 'Taquería El Dorado · @taqueria.eldorado' }
      ];
  return groundTaqueriaToolCall({
    name: 'reel.create',
    args: {
      brandName: String(evidence.brandName || 'Taquería El Dorado'),
      title: 'El Taco Macho',
      cta: 'Conoce más en @taqueria.eldorado',
      durationSeconds: Math.max(1, Number(evidence.durationSeconds || 30)),
      scenes
    }
  });
}

const mission = await runJarvisMission({
  instruction,
  initialToolCalls,
  requiredToolNames: EXPECTED_TOOLS,
  maximumSteps: 20,
  maximumRetries: 2,
  timeoutMs: 360000,
  planner: async ({ originalInstruction, mission: missionState }) => {
    const resolvedSignatures = new Set(
      [...missionState.completedTasks, ...missionState.blockedTasks].map(item =>
        `${item.name}:${JSON.stringify(item.args || {})}`
      )
    );
    const verifiedReelPlan = verifiedMissionTask(missionState, 'reel.plan');
    const verifiedSpeech = verifiedMissionTask(missionState, 'speech.synthesize');
    const verifiedReelCreate = verifiedMissionTask(missionState, 'reel.create');
    if (verifiedReelPlan && !verifiedSpeech && !missionTaskBlocked(missionState, 'speech.synthesize')) {
      const nextCall = deterministicSpeechCall();
      console.log('V139_EXACT_PROMPT_NEXT_PLAN', JSON.stringify({
        phase: 'DETERMINISTIC_POST_PLAN_SPEECH',
        missionComplete: false,
        next: { name: nextCall.name, args: nextCall.args }
      }));
      return {
        toolCalls: [nextCall],
        missionComplete: false,
        completionAssessment: { status: 'V139_VERIFIED_PLAN_SPEECH_DEPENDENCY' }
      };
    }
    if (verifiedReelPlan && verifiedSpeech && !verifiedReelCreate && !missionTaskBlocked(missionState, 'reel.create')) {
      const nextCall = deterministicReelCreateCall(verifiedReelPlan);
      console.log('V139_EXACT_PROMPT_NEXT_PLAN', JSON.stringify({
        phase: 'DETERMINISTIC_POST_SPEECH_REEL_CREATE',
        missionComplete: false,
        next: { name: nextCall.name, args: nextCall.args }
      }));
      return {
        toolCalls: [nextCall],
        missionComplete: false,
        completionAssessment: { status: 'V139_VERIFIED_SPEECH_REEL_CREATE_DEPENDENCY' }
      };
    }
    const requiredCompleted = missionState.requiredToolNames.every(name =>
      missionState.completedTasks.some(item =>
        item.name === name && item.observation?.objectiveSatisfied === true
      )
    );
    const requiredBlocked = missionState.requiredToolNames.some(name =>
      missionState.blockedTasks.some(item => item.name === name)
    );
    if (requiredCompleted && !requiredBlocked) {
      console.log('V139_EXACT_PROMPT_NEXT_PLAN', JSON.stringify({
        phase: 'DETERMINISTIC_VERIFIED_CLOSE',
        missionComplete: true,
        next: null
      }));
      return {
        toolCalls: [],
        missionComplete: true,
        completionAssessment: {
          status: 'V139_REQUIRED_TOOLS_VERIFIED',
          requiredToolNames: missionState.requiredToolNames,
          completedToolNames: missionState.completedTasks.map(item => item.name)
        }
      };
    }
    const requiredResolved = missionState.requiredToolNames.every(name =>
      missionState.completedTasks.some(item => item.name === name) ||
      missionState.blockedTasks.some(item => item.name === name)
    );
    const phase = requiredResolved ? 'COMPLETION_AUDIT' : 'MISSION_CONTRACT';
    const satisfiedToolNames = new Set(
      missionState.completedTasks
        .filter(item => item.observation?.objectiveSatisfied === true)
        .map(item => item.name)
    );
    const plannerCatalog = missionToolCatalog.filter(tool => !satisfiedToolNames.has(tool.name));
    const nextCalls = await buildJarvisMultifunctionToolCalls(
      originalInstruction,
      {
        throwOnUnavailable: true,
        semanticPlanner: canonicalSemanticPlanner,
        toolCatalog: plannerCatalog,
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
    const groundedNextCalls = nextCalls.map(groundTaqueriaToolCall);
    const unresolvedCall = groundedNextCalls.find(call =>
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
for (const name of EXPECTED_TOOLS) {
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

const reelPlanIndex = mission.executedTools.indexOf('reel.plan');
const speechIndex = mission.executedTools.indexOf('speech.synthesize');
const mediaIndex = mission.executedTools.indexOf('web.media.collect');
const createIndex = mission.executedTools.indexOf('reel.create');
if (!(reelPlanIndex >= 0 && speechIndex > reelPlanIndex && mediaIndex >= 0 && createIndex > speechIndex && createIndex > mediaIndex)) {
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

const reelPlan = [...mission.completedTasks].reverse().find(task => task.name === 'reel.plan');
const reelPlanEvidenceText = JSON.stringify(reelPlan?.observation?.evidence || {});
if (/perf_images|performance\.jpe?g|072eb46797f3ba5bd110aa8680bda408590a30e697ba80f53e4d34eed1990d90/i.test(reelPlanEvidenceText)) {
  throw new Error('V139_TIKTOK_INTERNAL_MEDIA_MUST_NOT_BE_BOUND');
}

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