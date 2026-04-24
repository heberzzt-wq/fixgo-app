/**
 * GESTIA BRAIN ENGINE v7.0 - FULL CONTEXT LINK
 * Reescritura enfocada en conectar Jarvis Cloud + contexto local Gestia.
 */

/**
 * ======================================================================================
 * GESTIA BRAIN ENGINE v7.1 - CORE BOOT BLOCK (STABLE IMPORTS)
 * ======================================================================================
 * Ajustado para rutas reales + carga segura + helpers blindados
 * ======================================================================================
 */

import { auth } from "../firebase.js";

import { JarvisMemory } from "./jarvis/jarvis.memory.js";

import {
  runCommandCenter,
  runSentinel,
  runLiveQuery,
  runPredictor,
  runCommander
} from "./jarvis/jarvis.firestore.engine.js";

/* =====================================================
   CONFIG GLOBAL
===================================================== */

const TENANT_BREAKERS = new Map();

const BRAIN_CONFIG = {
  ENDPOINT:
    "https://us-central1-fixgo-44e4d.cloudfunctions.net/gestiaArchitectV5",

  FETCH_TIMEOUT_MS: 35000,
  MAX_RETRIES: 2,
  BREAKER_COOLDOWN_MS: 15000,
  MAX_DEPTH: 8,
  MAX_STRING: 4000,
  MAX_ARRAY: 50
};

/* =====================================================
   TELEMETRÍA HUD
===================================================== */

function emit(
  step,
  details = "",
  severity = "INFO",
  opId = "SYS"
) {
  try {
    window.dispatchEvent(
      new CustomEvent(
        "gestia-terminal-state",
        {
          detail: {
            step: `BRAIN:${step}`,
            details,
            severity,
            opId,
            modulo: "BRAIN_ENGINE",
            timestamp: Date.now()
          }
        }
      )
    );
  } catch (err) {
    console.warn(
      "⚠️ [BRAIN_EMIT_FAIL]",
      err
    );
  }
}

/* =====================================================
   HELPERS
===================================================== */

function sleep(ms = 1000) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

/* =====================================================
   SANITIZER PROFUNDO
===================================================== */

function sanitize(
  obj,
  depth = 0
) {
  if (
    depth >
    BRAIN_CONFIG.MAX_DEPTH
  ) {
    return "[MAX_DEPTH]";
  }

  if (
    obj === null ||
    typeof obj === "undefined"
  ) {
    return undefined;
  }

  if (
    typeof obj === "function"
  ) {
    return undefined;
  }

  if (
    typeof obj === "string"
  ) {
    return obj.length >
      BRAIN_CONFIG.MAX_STRING
      ? obj.slice(
          0,
          BRAIN_CONFIG.MAX_STRING
        ) + "...[CUT]"
      : obj;
  }

  if (
    Array.isArray(obj)
  ) {
    return obj
      .slice(
        0,
        BRAIN_CONFIG.MAX_ARRAY
      )
      .map(item =>
        sanitize(
          item,
          depth + 1
        )
      )
      .filter(
        item =>
          typeof item !==
          "undefined"
      );
  }

  if (
    typeof obj === "object"
  ) {
    const clean = {};

    for (const [k, v] of Object.entries(obj)) {
      const safe =
        sanitize(
          v,
          depth + 1
        );

      if (
        typeof safe !==
        "undefined"
      ) {
        clean[k] = safe;
      }
    }

    return clean;
  }

  return obj;
}

/* =====================================================
   BOOT LOG
===================================================== */

console.log(
  "%c🧠 [BRAIN_ENGINE]: CORE BLOCK ONLINE",
  "color:#22c55e;font-weight:bold;"
);

async function buildLiveContext(prompt, contexto={}){
  const [board, alerts, live] = await Promise.all([
    runCommandCenter().catch(()=>null),
    runSentinel().catch(()=>null),
    runLiveQuery(prompt).catch(()=>null)
  ]);

  let predictor=null;
  let commander=null;
  if(String(prompt).toLowerCase().includes('riesgo')) predictor = await runPredictor().catch(()=>null);
  if(String(prompt).toLowerCase().includes('prioridad')) commander = await runCommander().catch(()=>null);

  return {
    ...contexto,
    tenantId: contexto?.tenantId || window?.KernelHeberto?.session?.tenantId || 'uxmal39',
    userId: contexto?.userId || window?.KernelHeberto?.session?.uid || null,
    kernelState: window?.KernelHeberto?.state || null,
    memory: JarvisMemory.getState(),
    board,
    alerts,
    live,
    predictor,
    commander,
    browser: {
      online: navigator.onLine,
      ram: navigator.deviceMemory || 'ND',
      cpu: navigator.hardwareConcurrency || 'ND'
    },
    ts: Date.now()
  };
}

export async function invocarArquitectoIA(prompt, contexto={}, operationId='SYS', maxTokens=3200, authToken=null, targetModuloId='jarvis', modo_operacion='modulo'){
  const tenantId = contexto?.tenantId || 'GLOBAL';
  const breaker = TENANT_BREAKERS.get(tenantId) || {count:0, openUntil:0};

  if(Date.now() < breaker.openUntil){
    throw new Error('BRAIN_BREAKER_OPEN');
  }

  const enriched = await buildLiveContext(prompt, contexto);
  const safeContext = sanitize(enriched);

  const payload = {
    id: operationId,
    data: {
      id: operationId,
      opId: operationId,
      prompt,
      contexto: safeContext,
      maxTokens,
      modulo_id: targetModuloId,
      modo_operacion,
      timestamp: Date.now()
    }
  };

  let forceRefresh=false;
  let lastError=null;

  for(let attempt=0; attempt<=MAX_RETRIES; attempt++){
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), FETCH_TIMEOUT_MS);
    try{
      let token = authToken;
      if(!token){
        if(!auth.currentUser) throw new Error('NO_AUTH');
        token = await auth.currentUser.getIdToken(forceRefresh);
      }

      emit('UPLINK','Conectando IA externa','INFO',operationId);

      const res = await fetch(ENDPOINT, {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timer);

      if(res.status===401 && !forceRefresh){ forceRefresh=true; throw new Error('RETRY_AUTH'); }
      if(!res.ok) throw new Error(`HTTP_${res.status}`);

      const json = await res.json();
      TENANT_BREAKERS.delete(tenantId);
      emit('SUCCESS','IA conectada','SUCCESS',operationId);
      return json;
    }catch(err){
      clearTimeout(timer);
      lastError=err;
      if(attempt < MAX_RETRIES){ await sleep((attempt+1)*2000); continue; }
    }
  }

  breaker.count += 1;
  if(breaker.count >= 3) breaker.openUntil = Date.now()+BREAKER_COOLDOWN_MS;
  TENANT_BREAKERS.set(tenantId, breaker);
  emit('FAIL', String(lastError?.message||lastError), 'ERROR', operationId);
  throw lastError;
}

console.log('🧠 BRAIN_ENGINE v7.0 FULL CONTEXT ONLINE');

window.invocarArquitectoIA = invocarArquitectoIA;