/**
 * GESTIA BRAIN ENGINE v7.0 - FULL CONTEXT LINK
 * Reescritura enfocada en conectar Jarvis Cloud + contexto local Gestia.
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

const TENANT_BREAKERS = new Map();
const ENDPOINT = 'https://us-central1-fixgo-44e4d.cloudfunctions.net/gestiaArchitectV5';
const FETCH_TIMEOUT_MS = 35000;
const MAX_RETRIES = 2;
const BREAKER_COOLDOWN_MS = 15000;

function emit(step, details, severity='INFO', opId='SYS') {
  window.dispatchEvent(new CustomEvent('gestia-terminal-state', {
    detail: { step:`BRAIN:${step}`, details, severity, opId, modulo:'BRAIN_ENGINE' }
  }));
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function sanitize(obj, depth=0){
  if(depth>8) return '[MAX_DEPTH]';
  if(obj == null) return undefined;
  if(typeof obj === 'function') return undefined;
  if(typeof obj === 'string') return obj.slice(0,4000);
  if(Array.isArray(obj)) return obj.slice(0,50).map(x=>sanitize(x,depth+1)).filter(Boolean);
  if(typeof obj === 'object') {
    const out={};
    for(const [k,v] of Object.entries(obj)){
      const s=sanitize(v,depth+1);
      if(s!==undefined) out[k]=s;
    }
    return out;
  }
  return obj;
}

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