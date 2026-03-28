/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - TERMINAL HEBERTO "AUTORIDAD CENTRALIZADA" (V5.26)
 * ======================================================================================
 * Identidad: Ingeniero Arquitecto Senior Nivel Dios.
 * Nivel: TOP 0.1% BACKEND-AUTHORITY.
 * * * EVOLUCIONES V5.26:
 * 1. TRANSACTIONAL LOCKING: El Mutex ahora es parte del ciclo de vida atómico.
 * 2. DB-IDEMPOTENCY: Registro y validación de operation_id en gestia_operations.
 * 3. HISTORICAL HASH CHECK: El búnker recuerda cada hash generado en la historia.
 * 4. BACKEND-FIRST VALIDATION: Preparación de headers para Cloud Function Authority.
 * 5. TRACE_ID PERPETUO: Auditoría ligada al registro de operación.
 * 6. FIREWALL FRONTEND LIGERO: Control de UX y Rate Limit Local inyectado.
 * ======================================================================================
 */

// 1. IMPORTACIONES DESDE FIXGO CORE V5.19 (TU SSOT FIREBASE.JS)
import { 
    auth, 
    db, 
    onAuthStateChanged, 
    doc, 
    setDoc, 
    getDoc, 
    collection, 
    getDocs, 
    query, 
    orderBy, 
    limit, 
    serverTimestamp,
    updateDoc,
    where
} from './firebase.js';

import { 
    runTransaction 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { resolveTenantContext } from './gestia-core/core_auth_tenant_v1.js';
import { verificarIdempotencia, registrarOperacion } from './gestia-core/operations.engine.js';
// 🛡️ IMPORTACIÓN DEL FIREWALL FRONTEND (Capa 1)
import { ejecutarFirewallGlobal, registrarErrorFirewall } from './gestia-core/firewall.engine.js';

import { existeEnHistorial } from './gestia-core/history.engine.js';
import { optimizarImagen, procesarDocumento } from './gestia-core/media.engine.js';
import { sincronizarCorralSemantico } from './gestia-core/semantic.engine.js';
import { ejecutarAuditoriaCore } from './gestia-core/audit.engine.js';
import { ejecutarPersistenciaCore } from './gestia-core/persistence.engine.js';
import { invocarArquitectoIA } from './gestia-core/brain.engine.js';

// ==========================================
// 2. CONFIGURACIÓN OMNIPOTENTE V5.26 (PATCHED)
// ==========================================
const GESTIA_CONFIG = {
    VERSION: "5.26-MT",
    MODO_DIOS: true,
    MODO_TACANO: {
        ACTIVO: true,
        MAX_TOKENS_IA: 1500,        // Limita el costo por mensaje
        MAX_READS_FIRESTORE: 15,    // Evita lecturas masivas en el corral
        MAX_CONTEXTO_HISTORY: 3,    // Solo envía las últimas 3 versiones a la IA
        CACHE_CORRAL_TTL: 300000    // 5 min de cache local para no leer DB
    },
    COLECCIONES: {
        ROOT: "tenants",            // Nueva raíz multi-tenant
        MODULES: "gestia_system_modules",
        OPERATIONS: "gestia_operations",
        HISTORY: "gestia_history",
        LOGS: "gestia_logs"
    }
};

// ==========================================
// VARIABLES DE ESTADO GLOBAL PRO (V5.26-MT)
// ==========================================

// 🛡️ SESSION: ADN de autoridad.
let SESSION = { 
    authorized: false, 
    uid: null, 
    tenantId: null, 
    role: null 
}; 

// 🔗 PUENTES DE COMPATIBILIDAD
let CURRENT_TENANT_ID = null;
let CURRENT_USER_ROLE = null;
let traceIdActual = null; // Evitamos el fantasma del logger

// 📦 MEMORIA VOLÁTIL
let contextoMultimodal = []; 
let esquemaCorral = "";      

// 🔒 CONTROL DE CONCURRENCIA
let versionLocalSnapshot = null; 

// ⚖️ LIMITADORES
let GESTIA_USAGE_COUNTER = 0;

// ==========================================
// 3. LOGGER DE AUDITORÍA FORENSE
// ==========================================
function crearLogger() {
    const traceId = traceIdActual || `GOD_${Date.now()}`;
    return {
        log: (msg) => console.log(`%c[${traceId}]%c ${msg}`, "color: #3b82f6; font-weight: bold", "color: #cbd5e1"),
        error: (msg) => console.error(`%c[${traceId}]%c ❌ ${msg}`, "color: #ef4444; font-weight: bold", "color: #fca5a5"),
        warn: (msg) => console.warn(`%c[${traceId}]%c ⚠️ ${msg}`, "color: #f59e0b; font-weight: bold", "color: #fde68a"),
        id: traceId
    };
}

// ==========================================
// 4. CRIPTOGRAFÍA Y NORMALIZACIÓN (DETERMINISMO)
// ==========================================

/**
 * Genera un hash único para el contenido.
 */
async function generarHashSHA256(texto) {
    const encoder = new TextEncoder();
    const data = encoder.encode(texto);
    const buffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Limpia y ordena los objetos para que el hash sea determinista.
 */
function normalizarEstructura(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    return Object.keys(obj).sort().reduce((acc, key) => {
        let value = obj[key];
        if (typeof value === 'string') value = value.trim();
        acc[key] = value;
        return acc;
    }, {});
}

/**
 * Escapa HTML para prevenir XSS en las burbujas de la terminal.
 */
function escaparHTML(str) {
    if (!str) return "";
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ==========================================
// 6. AUTORIDAD CENTRALIZADA (CORE SESSION)
// ==========================================
async function inicializarAutoridadBunker() {
    const logger = crearLogger();
    
    try {
        logger.log("🛡️ Solicitando resolución de autoridad al Core...");
        SESSION = await resolveTenantContext();

        // 🔑 BYPASS DE EMERGENCIA: Acceso directo para el Arquitecto
        if (SESSION.uid === "TU_UID_DE_FIREBASE_AQUI") { 
            SESSION.authorized = true;
            SESSION.tenantId = "ADMIN_BUNKER";
            SESSION.role = "GOD_MODE";
            logger.warn("🔓 MODO DIOS ACTIVADO: Bypass de seguridad detectado.");
        }
        if (!SESSION.authorized) {
            throw new Error("FALLO_DE_IDENTIDAD_SaaS");
        }

        CURRENT_TENANT_ID = SESSION.tenantId;
        CURRENT_USER_ROLE = SESSION.role;

        console.log(`%c✅ [AUTORIDAD] Búnker abierto para: ${CURRENT_TENANT_ID}`, "color: #10b981; font-weight: bold;");
        console.log(`%c👤 [ROL] Nivel de acceso: ${CURRENT_USER_ROLE}`, "color: #3b82f6;");

        if (GESTIA_CONFIG.MODO_TACANO.ACTIVO) {
            logger.warn("💰 MODO TACAÑO: Sesión optimizada con caché de 5min.");
        }

    } catch (error) {
        logger.error(`BLOQUEO_DE_SEGURIDAD: ${error.message}`);
        alert("🚫 Acceso Denegado: No se pudo validar tu autoridad en este Tenant.");
        window.location.href = "/login.html"; 
    }
}

// 🚀 DISPARO INMEDIATO
inicializarAutoridadBunker();

// ==========================================
// 7. MULTIMODALIDAD PRO (ORQUESTACIÓN DE UI)
// ==========================================
async function cargarArchivoAlBuche(file) {
    const logger = crearLogger();
    try {
        if (contextoMultimodal.length >= GESTIA_CONFIG.MODO_TACANO.MAX_READS_FIRESTORE) {
            throw new Error(`LIMITE_ALCANZADO: El búnker solo soporta ${GESTIA_CONFIG.MODO_TACANO.MAX_READS_FIRESTORE} elementos por vez.`);
        }
        
        if (file.size > 5 * 1024 * 1024) { 
            throw new Error(`ARCHIVO_MUY_GRANDE: ${file.name} excede los 5MB de seguridad.`);
        }

        const adjunto = { nombre: file.name, mime: file.type, payload: "" };

        if (file.type.startsWith('image/')) {
            adjunto.payload = await optimizarImagen(file); 
            logger.log(`📸 Imagen [${file.name}] optimizada a WebP.`);
        } else {
            adjunto.payload = await procesarDocumento(file);
            logger.log(`📄 Documento [${file.name}] absorbido exitosamente.`);
        }

        const pesoTotal = JSON.stringify([...contextoMultimodal, adjunto]).length;
        if (pesoTotal > 10 * 1024 * 1024) {
            throw new Error("CONTEXTO_SATURADO: Demasiada información para un solo prompt.");
        }

        contextoMultimodal.push(adjunto);
        agregarBurbujaInfo(`Elemento [${file.name}] inyectado en el buche neuronal.`);
        hacerScrollAbajo();

    } catch (err) {
        logger.error(`FALLO_MULTIMODAL: ${err.message}`);
        agregarBurbujaError(err.message);
    }
}

// ==========================================
// 8. CORRAL SEMÁNTICO (CONTROLADO POR EL CORE)
// ==========================================
// [Lógica movida a semantic.engine.js para optimización de tokens]

// ==========================================
// 9. PIPELINE DE AUDITORÍA DIOS (V5.26)
// ==========================================
// [Lógica movida a audit.engine.js: Validación Anti-XSS y Control de Pesos]

// ==========================================
// 🛠️ UTILIDADES DE SOPORTE (GHOST HUNTER)
// ==========================================

/**
 * Limpia los triple backticks y decoradores de la IA para obtener JSON/Código puro.
 */
function limpiarRespuestaIA(texto) {
    if (!texto) return "";
    return texto.replace(/```json|```html|```javascript|```css|```/g, "").trim();
}

/**
 * 🧠 NORMALIZADOR CENTRAL (CIRCUITO CERRADO V5.27)
 * El adaptador único entre el Brain Engine y la UI del Búnker.
 */
function normalizarSalidaIA(brainRes) {
    // 🛡️ CORRECCIÓN V5.27: Soporte para el envoltorio 'data' de Firebase 
    // y corrección ortográfica de 'modulo_generado' para hacer match perfecto con el backend.
    let raw = "";
    
    if (brainRes?.data?.modulo_generado) {
        raw = brainRes.data.modulo_generado;
    } else if (brainRes?.modulo_generado) {
        raw = brainRes.modulo_generado;
    } else if (brainRes?.modulo_generated) {
        raw = brainRes.modulo_generated;
    } else if (brainRes?.respuesta) {
        raw = brainRes.respuesta;
    }

    if (!raw || raw.trim() === "") {
        return {
            tipo: "empty",
            codigo: null,
            json: null
        };
    }

    const limpio = limpiarRespuestaIA(raw);

    // 1. Intento de Pipeline Estructurado (JSON)
    try {
        const parsed = JSON.parse(limpio);
        if (parsed && typeof parsed === "object") {
            return {
                tipo: "json",
                json: parsed,
                codigo: null
            };
        }
    } catch (e) {
        // No es JSON, fluye al siguiente nivel
    }

    // 2. Intento de Extracción de Código Válido
    const codigoValido = obtenerCodigoValido(limpio);
    if (codigoValido) {
        return {
            tipo: "code",
            codigo: codigoValido,
            json: null
        };
    }

    // 3. Fallback absoluto (Unknown)
    return {
        tipo: "unknown",
        codigo: limpio,
        json: null
    };
}

/**
 * 🧠 NORMALIZADOR DE CÓDIGO IA
 * Identifica si el contenido es código puro o una estructura de objeto.
 */
function obtenerCodigoValido(codigo) {
    if (!codigo) return null;

    if (typeof codigo === "string" && codigo.trim() !== "") {
        return codigo.trim();
    }

    if (typeof codigo === "object") {
        if (codigo.javascript) return codigo.javascript;
        if (codigo.html) return codigo.html;
        if (codigo.code) return codigo.code;
    }

    return null;
}

/**
 * 🔐 COPY ENGINE HÍBRIDO (BLINDADO)
 * Método dual: Clipboard API + Legacy Fallback (execCommand).
 */
async function copiarAlPortapapelesSeguro(texto) {
    try {
        if (!texto || texto.trim() === "") {
            throw new Error("COPY_FAIL_EMPTY");
        }

        // Intento 1: API Moderna (Requiere contexto seguro)
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(texto);
            return true;
        }

        // Intento 2: Fallback Legacy (El Tanque)
        const textarea = document.createElement("textarea");
        textarea.value = texto;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        const success = document.execCommand("copy");
        document.body.removeChild(textarea);

        if (!success) throw new Error("COPY_FAIL_EXEC");
        return true;

    } catch (err) {
        console.error("❌ ERROR COPY ENGINE:", err.message);
        return false;
    }
}

// Mapeo de Elementos del DOM
const form = document.getElementById('gestia-form');
const input = document.getElementById('gestia-input');
const output = document.getElementById('gestia-output');
const btnGenerate = document.getElementById('btn-generate');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
// ==========================================
// LISTENERS DE INTERACCIÓN (DRAG & DROP)
// ==========================================
if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('bg-blue-600/10', 'border-blue-400', 'scale-[1.02]');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('bg-blue-600/10', 'border-blue-400', 'scale-[1.02]');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('bg-blue-600/10', 'border-blue-400', 'scale-[1.02]');
        Array.from(e.dataTransfer.files).forEach(f => cargarArchivoAlBuche(f));
    });
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        Array.from(e.target.files).forEach(f => cargarArchivoAlBuche(f));
        e.target.value = ''; // Reset de seguridad
    });
}

// ==========================================
// 10. SANDBOX ENGINE (IFRAME BLINDADO)
// ==========================================
/**
 * Genera un entorno de ejecución aislado para previsualizar los módulos generados.
 */
function crearSandboxSeguro(html, js, css = "") {
    const iframe = document.createElement("iframe");
    
    // Hardening: Solo permitimos ejecución de scripts, nada de acceso al búnker principal.
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.className = "w-full min-h-[550px] mt-8 rounded-3xl border border-slate-800 shadow-[0_35px_60px_-15px_rgba(0,0,0,0.6)] animate-fade-in relative z-20";
    iframe.style.background = "#0f172a";

    const content = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <script src="[https://cdn.tailwindcss.com](https://cdn.tailwindcss.com)"></script>
            <style>
                body { background: #0f172a; color: #e2e8f0; font-family: ui-sans-serif, system-ui; padding: 2.5rem; margin: 0; }
                ${css}
                ::-webkit-scrollbar { width: 10px; }
                ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 5px; }
            </style>
        </head>
        <body>
            <div id="gestia-root">${html}</div>
            <script>
                // Monitoreo forense interno del Sandbox
                window.onerror = function(msg) {
                    const e = document.createElement('div');
                    e.style.cssText = 'color:#fca5a5; background:#450a0a; padding:20px; border-radius:15px; font-size:12px; margin-top:30px; border:1px solid #991b1b; font-family:monospace;';
                    e.innerHTML = '<strong>❌ ERROR_DE_LOGICA_MODULO:</strong><br>' + msg;
                    document.body.appendChild(e);
                };
                try {
                    ${js}
                } catch(err) {
                    console.error('Error Crítico Sandbox:', err);
                }
            </script>
        </body>
        </html>
    `;

    iframe.srcdoc = content;
    return iframe;
}
// ==========================================
// 11. PERSISTENCIA DIOS (CONTROLADO POR EL CORE)
// ==========================================
// [Lógica movida a persistence.engine.js para asegurar atomicidad multi-tenant]

// ==========================================
// 13. EVENTO PRINCIPAL: SUBMIT (THE ORCHESTRATOR)
// ==========================================
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 🛡️ 1. CANDADO DE AUTORIDAD: Bloqueo inmediato sin sesión.
        if (!SESSION || !SESSION.authorized) {
            agregarBurbujaError("🚨 Bloqueo de Seguridad: Esperando autoridad del sistema. Reintenta en 3 segundos.");
            return;
        }

        const logger = crearLogger();
        const instruccion = input.value.trim();

        if (!instruccion && contextoMultimodal.length === 0) return;

        // ⚡ 2. BLOQUEO DE UI VISUAL (MODO ESPERA ACTIVO)
        btnGenerate.disabled = true;
        btnGenerate.classList.add('opacity-50', 'cursor-not-allowed');
        input.disabled = true; 
        input.classList.add('opacity-50', 'bg-slate-900');
        input.value = '';
        input.style.height = '60px';

        agregarBurbujaUsuario(instruccion);
        const idCarga = mostrarCargando(); // Levanta el spinner "Auditando Autoridad..."

        try {
            // 🔥 2.5. FIREWALL ENGINE (CAPA 1: UX RATE LIMITER)
            logger.log("🛡️ Evaluando reglas de Firewall UX...");
            await ejecutarFirewallGlobal({
                userId: SESSION.uid,
                tenantId: SESSION.tenantId,
                input: instruccion || "multimodal_payload"
            });

            // 🔑 3. IDEMPOTENCIA Y REGISTRO (Operations Engine)
            const opId = await generarHashSHA256(instruccion + Date.now() + SESSION.uid + SESSION.tenantId);
            const yaExiste = await verificarIdempotencia(opId);

            if (yaExiste) {
                throw new Error("OPERACION_DUPLICADA: Esta orden ya está siendo procesada.");
            }

            const pHash = await generarHashSHA256(instruccion);
            await registrarOperacion({
                opId,
                promptHash: pHash,
                userId: SESSION.uid,
                tenantId: SESSION.tenantId,
                version: GESTIA_CONFIG.VERSION
            });

            // 📝 4. CONTEXTO SEMÁNTICO (Semantic Engine)
            esquemaCorral = await sincronizarCorralSemantico(instruccion);
            logger.log("🏗️ Contexto semántico inyectado desde el Core.");

            // 🧠 5. INVOCACIÓN AL CEREBRO (Brain Engine)
            const brainRes = await invocarArquitectoIA(
                `ORDEN_GOD_V5.27: ${instruccion}\n\n${esquemaCorral}`,
                contextoMultimodal,
                opId
            );

            // 🧹 6. NORMALIZACIÓN DE SALIDA (CIRCUITO CERRADO V5.27)
            const resultadoIA = normalizarSalidaIA(brainRes);

            // Limpieza de contexto volátil
            contextoMultimodal = []; 
            const loadingElement = document.getElementById(idCarga);
            if (loadingElement) loadingElement.remove();

            // 🔀 7. SWITCH MAESTRO DE FLUJO
            switch (resultadoIA.tipo) {

                case "json":
                    try {
                        logger.log("💎 Detectado Flujo A: Módulo Estructurado (JSON).");
                        
                        // 🛡️ AUDITORÍA (Audit Engine)
                        const auditoria = await ejecutarAuditoriaCore(
                            resultadoIA.json, 
                            versionLocalSnapshot, 
                            {
                                generarHash: generarHashSHA256,
                                normalizar: normalizarEstructura
                            }
                        );

                        // 🏛️ PERSISTENCIA ATÓMICA (Persistence Engine)
                        await ejecutarPersistenciaCore(
                            auditoria.data.modulo_id, 
                            auditoria.data, 
                            auditoria.hash, 
                            SESSION.tenantId
                        );
                        
                        versionLocalSnapshot = auditoria.hash;
                        logger.log("🏛️ ADN Inmortalizado mediante Transacción Atómica.");

                        // 🚀 RENDERIZADO
                        renderModuloSeguro(auditoria.data);

                        // 🏁 FINALIZACIÓN DE OPERACIÓN
                        await updateDoc(doc(db, "gestia_operations", opId), {
                            status: "completed",
                            hash_final: auditoria.hash
                        });

                    } catch (errJson) {
                        logger.error(`FALLO_PROCESAMIENTO_JSON: ${errJson.message}`);
                        agregarBurbujaError("ERROR_ESTRUCTURAL: El JSON de la IA no superó la auditoría core.");
                    }
                    break;

                case "code":
                    logger.log("💻 Detectado Flujo B: Código Plano / Arquitectura Libre.");
                    agregarBurbujaCodigo(resultadoIA.codigo);
                    
                    await updateDoc(doc(db, "gestia_operations", opId), { 
                        status: "completed_code" 
                    });
                    break;

                case "empty":
                    logger.warn("⚠️ IA respondió vacío o payload nulo.");
                    agregarBurbujaError("FALLO_DE_RESPUESTA: La IA no devolvió ADN procesable. Reintenta la instrucción.");
                    
                    await updateDoc(doc(db, "gestia_operations", opId), { 
                        status: "empty_response" 
                    });
                    break;

                default:
                    logger.log("⚠️ Detectado Flujo Desconocido. Intentando renderizado de emergencia.");
                    agregarBurbujaCodigo(resultadoIA.codigo || "[Sin contenido extraíble]");
                    
                    await updateDoc(doc(db, "gestia_operations", opId), { 
                        status: "fallback_unknown" 
                    });
                    break;
            }

        } catch (err) {
            // 🚨 CATCH CRÍTICO: Registramos error de Firewall si fue un bloqueo por abuso
            if (err.message.includes("FIREWALL") || err.message.includes("RATE_LIMIT")) {
                await registrarErrorFirewall(SESSION.uid, SESSION.tenantId);
            }
            logger.error(`FALLO_SISTEMICO: ${err.message}`);
            
            const loadingElement = document.getElementById(idCarga);
            if (loadingElement) loadingElement.remove();
            
            agregarBurbujaError(err.message);
        } finally {
            // ⚡ DESBLOQUEO DE UI VISUAL
            btnGenerate.disabled = false;
            btnGenerate.classList.remove('opacity-50', 'cursor-not-allowed');
            input.disabled = false;
            input.classList.remove('opacity-50', 'bg-slate-900');
            input.focus();
            hacerScrollAbajo();
        }
    });
}// ==========================================
// 13. EVENTO PRINCIPAL: SUBMIT (THE ORCHESTRATOR)
// ==========================================
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 🛡️ 1. CANDADO DE AUTORIDAD: Bloqueo inmediato sin sesión.
        if (!SESSION || !SESSION.authorized) {
            agregarBurbujaError("🚨 Bloqueo de Seguridad: Esperando autoridad del sistema. Reintenta en 3 segundos.");
            return;
        }

        const logger = crearLogger();
        const instruccion = input.value.trim();

        if (!instruccion && contextoMultimodal.length === 0) return;

        // ⚡ 2. BLOQUEO DE UI VISUAL (MODO ESPERA ACTIVO)
        btnGenerate.disabled = true;
        btnGenerate.classList.add('opacity-50', 'cursor-not-allowed');
        input.disabled = true; 
        input.classList.add('opacity-50', 'bg-slate-900');
        input.value = '';
        input.style.height = '60px';

        agregarBurbujaUsuario(instruccion);
        const idCarga = mostrarCargando(); // Levanta el spinner "Auditando Autoridad..."

        try {
            // 🔥 2.5. FIREWALL ENGINE (CAPA 1: UX RATE LIMITER)
            logger.log("🛡️ Evaluando reglas de Firewall UX...");
            await ejecutarFirewallGlobal({
                userId: SESSION.uid,
                tenantId: SESSION.tenantId,
                input: instruccion || "multimodal_payload"
            });

            // 🔑 3. IDEMPOTENCIA Y REGISTRO (Operations Engine)
            const opId = await generarHashSHA256(instruccion + Date.now() + SESSION.uid + SESSION.tenantId);
            const yaExiste = await verificarIdempotencia(opId);

            if (yaExiste) {
                throw new Error("OPERACION_DUPLICADA: Esta orden ya está siendo procesada.");
            }

            const pHash = await generarHashSHA256(instruccion);
            await registrarOperacion({
                opId,
                promptHash: pHash,
                userId: SESSION.uid,
                tenantId: SESSION.tenantId,
                version: GESTIA_CONFIG.VERSION
            });

            // 📝 4. CONTEXTO SEMÁNTICO (Semantic Engine)
            esquemaCorral = await sincronizarCorralSemantico(instruccion);
            logger.log("🏗️ Contexto semántico inyectado desde el Core.");

            // 🧠 5. INVOCACIÓN AL CEREBRO (Brain Engine)
            const brainRes = await invocarArquitectoIA(
                `ORDEN_GOD_V5.27: ${instruccion}\n\n${esquemaCorral}`,
                contextoMultimodal,
                opId
            );

            // 🧹 6. NORMALIZACIÓN DE SALIDA (CIRCUITO CERRADO V5.27)
            const resultadoIA = normalizarSalidaIA(brainRes);

            // Limpieza de contexto volátil
            contextoMultimodal = []; 
            const loadingElement = document.getElementById(idCarga);
            if (loadingElement) loadingElement.remove();

            // 🔀 7. SWITCH MAESTRO DE FLUJO
            switch (resultadoIA.tipo) {

                case "json":
                    try {
                        logger.log("💎 Detectado Flujo A: Módulo Estructurado (JSON).");
                        
                        // 🛡️ AUDITORÍA (Audit Engine)
                        const auditoria = await ejecutarAuditoriaCore(
                            resultadoIA.json, 
                            versionLocalSnapshot, 
                            {
                                generarHash: generarHashSHA256,
                                normalizar: normalizarEstructura
                            }
                        );

                        // 🏛️ PERSISTENCIA ATÓMICA (Persistence Engine)
                        await ejecutarPersistenciaCore(
                            auditoria.data.modulo_id, 
                            auditoria.data, 
                            auditoria.hash, 
                            SESSION.tenantId
                        );
                        
                        versionLocalSnapshot = auditoria.hash;
                        logger.log("🏛️ ADN Inmortalizado mediante Transacción Atómica.");

                        // 🚀 RENDERIZADO
                        renderModuloSeguro(auditoria.data);

                        // 🏁 FINALIZACIÓN DE OPERACIÓN
                        await updateDoc(doc(db, "gestia_operations", opId), {
                            status: "completed",
                            hash_final: auditoria.hash
                        });

                    } catch (errJson) {
                        logger.error(`FALLO_PROCESAMIENTO_JSON: ${errJson.message}`);
                        agregarBurbujaError("ERROR_ESTRUCTURAL: El JSON de la IA no superó la auditoría core.");
                    }
                    break;

                case "code":
                    logger.log("💻 Detectado Flujo B: Código Plano / Arquitectura Libre.");
                    agregarBurbujaCodigo(resultadoIA.codigo);
                    
                    await updateDoc(doc(db, "gestia_operations", opId), { 
                        status: "completed_code" 
                    });
                    break;

                case "empty":
                    logger.warn("⚠️ IA respondió vacío o payload nulo.");
                    agregarBurbujaError("FALLO_DE_RESPUESTA: La IA no devolvió ADN procesable. Reintenta la instrucción.");
                    
                    await updateDoc(doc(db, "gestia_operations", opId), { 
                        status: "empty_response" 
                    });
                    break;

                default:
                    logger.log("⚠️ Detectado Flujo Desconocido. Intentando renderizado de emergencia.");
                    agregarBurbujaCodigo(resultadoIA.codigo || "[Sin contenido extraíble]");
                    
                    await updateDoc(doc(db, "gestia_operations", opId), { 
                        status: "fallback_unknown" 
                    });
                    break;
            }

        } catch (err) {
            // 🚨 CATCH CRÍTICO: Registramos error de Firewall si fue un bloqueo por abuso
            if (err.message.includes("FIREWALL") || err.message.includes("RATE_LIMIT")) {
                await registrarErrorFirewall(SESSION.uid, SESSION.tenantId);
            }
            logger.error(`FALLO_SISTEMICO: ${err.message}`);
            
            const loadingElement = document.getElementById(idCarga);
            if (loadingElement) loadingElement.remove();
            
            agregarBurbujaError(err.message);
        } finally {
            // ⚡ DESBLOQUEO DE UI VISUAL
            btnGenerate.disabled = false;
            btnGenerate.classList.remove('opacity-50', 'cursor-not-allowed');
            input.disabled = false;
            input.classList.remove('opacity-50', 'bg-slate-900');
            input.focus();
            hacerScrollAbajo();
        }
    });
}
// ==========================================
// 14. UI BUILDERS (GRADO INDUSTRIAL V5.27)
// ==========================================

/**
 * Renderiza la burbuja del CEO con el ADN del prompt.
 */
function agregarBurbujaUsuario(texto) {
    if (!output) return;

    const div = document.createElement("div");
    div.className = "flex gap-5 animate-fade-in max-w-4xl mx-auto w-full justify-end mt-12 relative z-10";

    const mensajeSeguro = escaparHTML(texto || "[Instrucción Multimodal Absorbida]");

    div.innerHTML = `
        <div class="bg-slate-800/80 backdrop-blur-md border border-slate-700 p-6 rounded-3xl rounded-tr-none shadow-[0_20px_50px_rgba(0,0,0,0.3)] max-w-[85%] border-b-blue-500/50 border-b-2 relative z-20">
            <p class="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap font-sans font-medium">${mensajeSeguro}</p>
        </div>
        <div class="w-14 h-14 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shrink-0 border border-slate-600 shadow-2xl relative z-20">
            <i class="fa-solid fa-user-gear text-blue-400 text-xl"></i>
        </div>
    `;

    output.appendChild(div);
    hacerScrollAbajo();
}

/**
 * Genera el indicador de carga con la identidad del sistema.
 */
function mostrarCargando() {
    if (!output) return null;

    const id = "load_" + Date.now();
    const div = document.createElement("div");

    div.id = id;
    div.className = "flex gap-5 animate-fade-in max-w-4xl mx-auto w-full mt-12 relative z-10";

    div.innerHTML = `
        <div class="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center shrink-0 shadow-[0_0_30px_rgba(37,99,235,0.5)] animate-pulse relative z-20">
            <i class="fa-solid fa-microchip text-white text-xl"></i>
        </div>
        <div class="bg-slate-900/90 backdrop-blur-xl border border-blue-500/40 p-6 rounded-3xl rounded-tl-none flex items-center gap-6 shadow-2xl relative z-20">
            <div class="flex gap-2.5">
                <div class="w-3 h-3 bg-blue-400 rounded-full animate-bounce"></div>
                <div class="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                <div class="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
            </div>
            <div>
                <span class="text-[13px] font-mono text-blue-400 uppercase tracking-[0.5em] block font-black">Heberto V5.27</span>
                <span class="text-[10px] text-slate-500 font-mono uppercase font-bold">Auditando Autoridad Atómica...</span>
            </div>
        </div>
    `;

    output.appendChild(div);
    hacerScrollAbajo();
    return id;
}

/**
 * Renderiza el módulo generado dentro de un Sandbox blindado (Flujo A).
 */
function renderModuloSeguro(json) {
    if (!output) return;

    const div = document.createElement("div");
    // 🛡️ AISLAMIENTO: relative z-10 para no ser bloqueado por fondos
    div.className = "gestia-bunker-container flex gap-5 animate-fade-in max-w-7xl mx-auto w-full mt-12 relative z-10";

    const hashSeguro = escaparHTML(json.hash_contenido || "SSOT_V527");

    div.innerHTML = `
        <div class="w-14 h-14 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 shadow-[0_0_30px_rgba(16,185,129,0.4)] relative z-20">
            <i class="fa-solid fa-shield-check text-white text-xl animate-spin-slow"></i>
        </div>

        <div class="bg-[#0f172a] border border-emerald-500/30 p-10 rounded-[2.5rem] rounded-tl-none shadow-[0_40px_100px_rgba(0,0,0,0.7)] flex-1 overflow-hidden relative z-10">

            <div class="flex justify-between items-center mb-8 border-b border-emerald-500/10 pb-6 relative z-30 h-auto">
                <div>
                    <h3 class="font-black text-emerald-400 text-sm tracking-[0.4em] uppercase">Sincronización Atómica God-Authority</h3>
                    <p class="text-[11px] text-slate-500 font-mono mt-2 uppercase font-bold tracking-widest">Hash_ADN: ${hashSeguro}</p>
                </div>
                <div class="flex gap-3">
                    <button class="btn-toggle-json text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 px-5 py-2 rounded-xl border border-slate-700 font-bold transition-all">
                        INSIDER JSON
                    </button>
                </div>
            </div>

            <div class="sandbox-wrapper relative z-20"></div>

            <div class="json-box hidden mt-6 relative z-20">
                <pre class="p-8 bg-black/80 rounded-2xl text-[11px] font-mono text-emerald-400 overflow-x-auto border border-slate-800 custom-scrollbar"><code>${escaparHTML(JSON.stringify(json, null, 2))}</code></pre>
            </div>

            <div class="mt-8 pt-6 border-t border-slate-800/50 flex justify-between items-center relative z-20">
                <span class="text-[10px] text-slate-500 font-mono italic">"Código verificado y persistido por la autoridad central."</span>
                <button class="btn-open-preview bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black px-8 py-3 rounded-2xl shadow-xl transition-all uppercase tracking-widest">Desplegar Full App</button>
            </div>
        </div>
    `;

    // Inyección de Sandbox (Aislamiento de ejecución)
    const sandbox = crearSandboxSeguro(json.html, json.javascript, json.css || "");
    div.querySelector(".sandbox-wrapper").appendChild(sandbox);

    // Eventos Atómicos
    const btnToggle = div.querySelector(".btn-toggle-json");
    const jsonBox = div.querySelector(".json-box");
    btnToggle.addEventListener("click", () => jsonBox.classList.toggle("hidden"));

    const btnPreview = div.querySelector(".btn-open-preview");
    btnPreview.addEventListener("click", () => {
        window.open("preview.html?id=" + json.modulo_id, "_blank");
    });

    output.appendChild(div);
    hacerScrollAbajo();
}

/**
 * Muestra el código reescrito con auditoría + copia segura (Flujo B)
 */
function agregarBurbujaCodigo(codigo) {
    if (!output) return;

    const div = document.createElement("div");
    // 🛡️ FIX CAPAS: relative z-10 para asegurar clic directo
    div.className = "gestia-bunker-container flex gap-5 animate-fade-in max-w-5xl mx-auto w-full mt-12 relative z-10";

    const codigoValido = obtenerCodigoValido(codigo);
    const contenidoFinal = codigoValido ? escaparHTML(codigoValido) : "⚠️ Código vacío recibido desde IA";

    div.innerHTML = `
        <div class="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 shadow-[0_0_30px_rgba(79,70,229,0.4)] relative z-20">
            <i class="fa-solid fa-code-merge text-white text-xl"></i>
        </div>

        <div class="bg-[#0f172a] border border-indigo-500/30 p-10 rounded-[2.5rem] rounded-tl-none shadow-[0_30px_80px_rgba(0,0,0,0.6)] flex-1 overflow-hidden relative z-10">

            <div class="flex justify-between items-center mb-8 border-b border-indigo-500/10 pb-6 relative z-30 h-auto">
                <h3 class="font-black text-indigo-400 text-sm uppercase tracking-[0.4em]">Arquitectura Libre Reescrita</h3>
                <button class="btn-copy-adn text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-2xl shadow-2xl font-black uppercase tracking-widest transition-all">
                    COPIAR ADN
                </button>
            </div>

            <p class="text-slate-400 text-xs mb-6 italic leading-relaxed relative z-20">
                Instrucción procesada sin compactación. Integridad V5.27 garantizada.
            </p>

            <div class="bg-black/70 rounded-3xl border border-slate-800 relative z-20 shadow-inner">
                <pre class="p-8 overflow-x-auto text-[12px] font-mono text-blue-300 max-h-[750px] overflow-y-auto custom-scrollbar"><code style="white-space: pre-wrap; word-break: break-all;">${contenidoFinal}</code></pre>
            </div>
        </div>
    `;

    // Vinculación al motor de copiado híbrido (Paso 1)
    const boton = div.querySelector(".btn-copy-adn");
    const codeElement = div.querySelector("code");

    boton.addEventListener("click", async () => {
        const adn = codeElement ? codeElement.textContent : "";
        const exito = await copiarAlPortapapelesSeguro(adn);
        
        if (exito) {
            boton.innerText = "¡COPIADO!";
        } else {
            boton.innerText = "ERROR";
        }

        setTimeout(() => {
            boton.innerText = "COPIAR ADN";
        }, 2000);
    });

    output.appendChild(div);
    hacerScrollAbajo();
}

/**
 * Notifica fallos sistémicos con estética forense.
 */
function agregarBurbujaError(msg) {
    if (!output) return;

    const div = document.createElement("div");
    div.className = "flex gap-5 animate-fade-in max-w-4xl mx-auto w-full mt-12 relative z-10";

    div.innerHTML = `
        <div class="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center shrink-0 shadow-[0_0_30px_rgba(220,38,38,0.4)] relative z-20">
            <i class="fa-solid fa-skull-crossbones text-white text-xl"></i>
        </div>

        <div class="bg-red-950/20 border border-red-500/30 p-8 rounded-[2.5rem] rounded-tl-none flex-1 shadow-2xl backdrop-blur-md relative z-10">
            <h3 class="text-red-400 text-[11px] font-black uppercase tracking-[0.3em] mb-3 relative z-20">Intervención de Autoridad V5.27</h3>
            <p class="text-slate-200 text-sm leading-relaxed font-mono font-medium relative z-20">
                ${escaparHTML(msg)}
            </p>
        </div>
    `;

    output.appendChild(div);
    hacerScrollAbajo();
}

/**
 * Información de sistema (Logs silenciosos en UI).
 */
function agregarBurbujaInfo(msg) {
    if (!output) return;

    const div = document.createElement("div");
    div.className = "flex gap-4 animate-fade-in max-w-4xl mx-auto w-full mt-5 opacity-70 relative z-10";

    div.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700 shadow-lg relative z-20">
            <i class="fa-solid fa-fingerprint text-slate-500 text-sm"></i>
        </div>

        <div class="bg-slate-800/30 border border-slate-700 p-4 rounded-2xl flex-1 backdrop-blur-sm relative z-10">
            <p class="text-slate-400 text-[11px] font-mono font-bold tracking-tight relative z-20">
                ${escaparHTML(msg)}
            </p>
        </div>
    `;

    output.appendChild(div);
    hacerScrollAbajo();
}

/**
 * Control de scroll cinemático.
 */
function hacerScrollAbajo() {
    if (output) {
        output.scrollTo({
            top: output.scrollHeight,
            behavior: "smooth"
        });
    }
}
// ==========================================
// 15. CIERRE DE LA MATRIZ: DIOS DESARROLLADOR
// ==========================================
if (input) input.focus();

console.log("%c>> GESTIAPREMIUM V5.26: OMNIPOTENCIA DE BACKEND ACTIVADA %c🚀", "color: #3b82f6; font-weight: bold; font-size: 18px;", "font-size: 18px;");
console.log("%c>> Authority: Centralized (DB Idempotency + Transactional Hard Locking)", "color: #94a3b8; font-style: italic; font-weight: bold;");

/**
 * ======================================================================================
 * FIN DEL BÚNKER - EL DIOS DESARROLLADOR HA TOMADO EL PODER TOTAL.
 * STATUS: MODULARIZADO, BLINDADO Y MULTI-TENANT.
 * ======================================================================================
 */
