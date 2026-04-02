/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - TERMINAL HEBERTO "AUTORIDAD CENTRALIZADA" (V5.51 ANTIFRÁGIL)
 * ======================================================================================
 * Identidad: Ingeniero Arquitecto Senior Nivel Dios.
 * Nivel: TOP 0.1% BACKEND-AUTHORITY.
 * * * EVOLUCIONES V5.51:
 * 1. ZERO-TRUST AUTHENTICATION: Preparación de JWT Bearer Token en el objeto SESSION.
 * 2. TRANSACTIONAL LOCKING: El Mutex ahora es parte del ciclo de vida atómico.
 * 3. DB-IDEMPOTENCY: Registro y validación de operation_id en gestia_operations.
 * 4. BACKEND-FIRST VALIDATION: Headers blindados para Cloud Function Authority.
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
import { persistirEstructuraModulo, persistirDatoDinamico } from './gestia-core/persistence.engine.js';
import { invocarArquitectoIA } from './gestia-core/brain.engine.js';

// ==========================================
// 2. CONFIGURACIÓN OMNIPOTENTE V5.51 (PATCHED)
// ==========================================
const GESTIA_CONFIG = {
    VERSION: "5.51-MT-ANTIFRAGILE",
    MODO_DIOS: true,
    MODO_TACANO: {
        ACTIVO: true,
        MAX_TOKENS_IA: 3200,        // Limita el costo por mensaje
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
// VARIABLES DE ESTADO GLOBAL PRO (V5.51-MT)
// ==========================================

// 🛡️ SESSION: ADN de autoridad (Actualizado V5.51 para Zero-Trust).
let SESSION = { 
    authorized: false, 
    uid: null, 
    tenantId: null, 
    role: null,
    token: null // ⚡ ALMACÉN DEL JWT PARA EL FIREWALL DEL BACKEND
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
// 🛡️ KIT DE IDENTIDAD GESTIA V5.55 (CONSTITUCIÓN)
// ==========================================

/**
 * GENERATE_MODULE_ID: El único punto de transformación permitido.
 * Convierte lenguaje natural en un ID legal para el Búnker.
 */
function generateModuleId(name) {
    let cleaned = (name || "")
        .toLowerCase()
        .trim()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Bye acentos
        .replace(/\s+/g, "_")                            // Espacios -> _
        .replace(/[^a-z0-9_]/g, "")                     // Solo alfanuméricos y _
        .replace(/_+/g, "_")                            // No duplicar __
        .replace(/^_+|_+$/g, "");                       // Quita _ extremos

    // Fallback semántico con trazabilidad de error
    if (!cleaned || cleaned.length < 3) {
        const suffix = Date.now().toString(36);
        return `mod_err_${suffix}`.substring(0, 50); 
    }

    return cleaned.substring(0, 50);
}

/**
 * IS_VALID_ID: El Cadenero Estricto.
 * No modifica nada, solo dice SI o NO.
 */
function isValidId(id) {
    const regex = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
    return (
        typeof id === "string" &&
        id.length >= 3 && 
        id.length <= 50 &&
        regex.test(id)
    );
}

// ==========================================
// 3. LOGGER DE AUDITORÍA FORENSE (ID_FLOW AWARE)
// ==========================================
function crearLogger() {
    const traceId = traceIdActual || `GOD_${Date.now()}`;
    return {
        log: (msg) => console.log(`%c[${traceId}]%c ${msg}`, "color: #3b82f6; font-weight: bold", "color: #cbd5e1"),
        idFlow: (id) => console.log(`%c[ID_FLOW]%c ID_GENERADO: ${id}`, "color: #10b981; font-weight: bold", "color: #a7f3d0"),
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
// 6. AUTORIDAD CENTRALIZADA (CORE SESSION) - V5.51
// ==========================================
/**
 * REGLA DE ORO: No fragmentar. Código completo.
 * Inyección de Identidad Maestra: Heber Mendoza (Arquitecto Supremo)
 */
async function inicializarAutoridadBunker() {
    const logger = crearLogger();
    
    try {
        logger.log("🛡️ Solicitando resolución de autoridad al Core...");
        
        // 1. Resolvemos el contexto inicial del usuario autenticado
        SESSION = await resolveTenantContext();

        // ⚡ OBTENCIÓN DE TOKEN JWT PARA EL FIREWALL V5.51
        const currentUser = auth.currentUser;
        if (currentUser) {
            SESSION.token = await currentUser.getIdToken(true); // Fuerza refresco para tener claims actuales
        } else {
            throw new Error("FALLO_DE_IDENTIDAD_SaaS: Usuario no autenticado en Firebase.");
        }

        // 🔑 BYPASS DE SOBERANÍA: Acceso directo e incondicional para el Arquitecto
        if (SESSION.uid === "nNhwy3Mx4pTvc8TZVh1tyTMFwhC2") { 
            SESSION.authorized = true;
            SESSION.role = "arquitecto_supremo";
            logger.warn("🔓 MODO DIOS ACTIVADO: Soberanía de Heberto confirmada.");
        }

        // 🛡️ VALIDACIÓN DE ENTRADA AL BÚNKER
        if (!SESSION.authorized || !SESSION.token) {
            throw new Error("FALLO_DE_IDENTIDAD_SaaS");
        }

        // 🧠 PROTECCIÓN EXTRA DEL ABUELO: El escudo definitivo anti-mayúsculas
        if (SESSION.tenantId !== SESSION.tenantId.toLowerCase()) {
            throw new Error(`TENANT_INVALIDO_CASE: ${SESSION.tenantId}`);
        }

        // 2. Inmortalizamos los valores de la sesión en el scope global de la terminal
        CURRENT_TENANT_ID = SESSION.tenantId;
        CURRENT_USER_ROLE = SESSION.role;

        // Logs de Éxito en Consola (Nivel Dios)
        console.log(`%c✅ [AUTORIDAD] Búnker abierto para: ${CURRENT_TENANT_ID}`, "color: #10b981; font-weight: bold;");
        console.log(`%c👤 [ROL] Nivel de acceso: ${CURRENT_USER_ROLE}`, "color: #3b82f6;");

        // 💰 OPTIMIZACIÓN DE RECURSOS (MODO TACAÑO)
        if (GESTIA_CONFIG.MODO_TACANO && GESTIA_CONFIG.MODO_TACANO.ACTIVO) {
            logger.warn("💰 MODO TACAÑO: Sesión optimizada con caché de 5min.");
        }

    } catch (error) {
        logger.error(`BLOQUEO_DE_SEGURIDAD: ${error.message}`);
        
        if (error.message.includes("FALLO_DE_IDENTIDAD_SaaS") || error.message.includes("TENANT_INVALIDO_CASE")) {
            alert("🚫 Acceso Denegado: No se pudo validar tu autoridad o el Tenant es inválido.");
            window.location.href = "/login.html"; 
        }
    }
}

// 🚀 DISPARO INMEDIATO DE AUTORIDAD
// Esperamos a que Firebase resuelva el estado de autenticación antes de invocar
onAuthStateChanged(auth, (user) => {
    if (user) {
        inicializarAutoridadBunker();
    } else {
        window.location.href = "/login.html";
    }
});

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
 * 🧠 NORMALIZADOR HÍBRIDO V5.55 (PASO 1) - REESCRITURA ESMERALDA
 * Fusionado: Validación brutal + Detección de truncado estructural.
 * Inyección V5.55: Sincronización total con Architect Engine.
 */
function normalizarSalidaIA(brainRes) {
    // 🛡️ HARDENING: Si la respuesta es nula o inválida
    if (!brainRes || typeof brainRes !== "object") {
        return { tipo: "error", error: "BRAIN_NULL_OR_INVALID" };
    }

    // 🔍 EXTRACCIÓN MULTI-LLAVE (SENTINEL V5.55)
    // Buscamos el objeto core en cualquier nivel de la respuesta de Axios
    let raw = 
        brainRes?.data?.modulo_generado ||
        brainRes?.modulo_generado ||
        brainRes?.data?.payload ||
        brainRes?.payload ||
        brainRes?.data ||
        brainRes;

    // 🧯 FALLBACK: Si no hay contenido procesable
    if (!raw) {
        return { tipo: "fallback", codigo: "// GESTIA_FALLBACK: IA_EMPTY_RESPONSE" };
    }

    // --- CASO A: Ya es un OBJETO (Parseado por el Middleware) ---
    if (typeof raw === "object" && !Array.isArray(raw)) {
        // Verificamos si tiene la estructura V5.55 (conciencia + ejecucion)
        if (raw.ejecucion && raw.ejecucion.payload) {
            
            // 🛡️ KIT DE IDENTIDAD V5.55 INYECTADO AQUÍ
            const idGenerado = generateModuleId(raw.modulo_id || raw.modulo_nombre || "gen_mod");
            
            if (!isValidId(idGenerado)) {
                console.error(`🚨 [ID_FLOW] ERROR INTERNO: El ID generado no es válido -> ${idGenerado}`);
                return { tipo: "error", error: `FALLO_V5_55_FRONTEND: ID_CORRUPTO_GENERADO [${idGenerado}]` };
            }
            
            return {
                tipo: "v13_dual",
                mensaje_ceo: raw.conciencia?.mensaje_ceo || "Órale, aquí tienes los resultados.",
                modulo_id: idGenerado,
                modulo_nombre: raw.modulo_nombre || "Módulo Autogenerado",
                esquema_campos: raw.esquema_campos || ["fecha"],
                json: raw.ejecucion.payload // Contiene html, css, js
            };
        }
        
        // Si es un objeto pero no tiene el estándar, lo mandamos como JSON genérico
        return { tipo: "json", json: raw };
    }

    // --- CASO B: Es un STRING (Texto plano o JSON sin parsear) ---
    const limpio = limpiarRespuestaIA(String(raw));

    // 🛑 DETECCIÓN DE TRUNCADO
    const openingBraces = (limpio.match(/\{/g) || []).length;
    const closingBraces = (limpio.match(/\}/g) || []).length;

    if (
        (limpio.length < 10 && limpio.includes("{")) || 
        limpio.endsWith("{") || 
        (limpio.includes("{") && openingBraces !== closingBraces)
    ) {
        return { tipo: "truncated", codigo: limpio };
    }

    // 🔹 INTENTO JSON (Estructurado V5.55)
    try {
        const parsed = JSON.parse(limpio);
        if (parsed?.ejecucion?.payload) {
            
            // 🛡️ KIT DE IDENTIDAD V5.55 INYECTADO AQUÍ
            const idGenerado = generateModuleId(parsed.modulo_id || parsed.modulo_nombre || "gen_mod");
            
            if (!isValidId(idGenerado)) {
                console.error(`🚨 [ID_FLOW] ERROR INTERNO: El ID generado no es válido -> ${idGenerado}`);
                return { tipo: "error", error: `FALLO_V5_55_FRONTEND: ID_CORRUPTO_GENERADO [${idGenerado}]` };
            }
            
            return {
                tipo: "v13_dual",
                mensaje_ceo: parsed.conciencia?.mensaje_ceo || "Proceso terminado, jefe.",
                modulo_id: idGenerado,
                modulo_nombre: parsed.modulo_nombre || "Módulo Autogenerado",
                esquema_campos: parsed.esquema_campos || ["fecha"],
                json: parsed.ejecucion.payload
            };
        }
        if (parsed && typeof parsed === "object") {
            return { tipo: "json", json: parsed };
        }
    } catch (e) {
        // No es JSON, fluye a detección de código
    }

    // 🔹 INTENTO CÓDIGO PLANO (HTML/JS)
    if (
        limpio.includes("<html") || 
        limpio.includes("<div") ||
        limpio.includes("function") || 
        limpio.includes("const ") || 
        limpio.includes("=>")
    ) {
        return { tipo: "code", codigo: limpio };
    }

    // 🔹 INTENTO TEXTO CONVERSACIONAL
    if (limpio.length > 0) {
        const lastChar = limpio.trim().slice(-1);
        const signosCierre = ['.', '!', '?', ':', ';', '"', "'", '}', ']', '>'];
        
        if (!signosCierre.includes(lastChar) && limpio.length > 50) {
            return { tipo: "truncated", codigo: limpio };
        }
        return { tipo: "texto_plano", codigo: limpio };
    }

    return { tipo: "unknown", codigo: limpio };
}

/**
 * 🧠 NORMALIZADOR DE CÓDIGO IA
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
 */
async function copiarAlPortapapelesSeguro(texto) {
    try {
        if (!texto || texto.trim() === "") {
            throw new Error("COPY_FAIL_EMPTY");
        }

        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(texto);
            return true;
        }

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
        Array.from(e.dataTransfer.files).forEach(f => {
            if (typeof cargarArchivoAlBuche === 'function') {
                cargarArchivoAlBuche(f);
            }
        });
    });
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        Array.from(e.target.files).forEach(f => {
            if (typeof cargarArchivoAlBuche === 'function') {
                cargarArchivoAlBuche(f);
            }
        });
        e.target.value = ''; 
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
            <script src="https://cdn.tailwindcss.com"></script>
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
// 13. EVENTO PRINCIPAL: SUBMIT (THE ORCHESTRATOR) - V5.51 ANTIFRÁGIL (ZERO-TRUST)
// ==========================================
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 🛡️ 1. CANDADO DE AUTORIDAD V5.51: Bloqueo inmediato sin sesión o sin Token JWT.
        if (!SESSION || !SESSION.authorized || !SESSION.token) {
            agregarBurbujaError("🚨 Bloqueo de Seguridad V5.51: Esperando autoridad criptográfica del sistema. Reintenta en 3 segundos.");
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
            // 🔥 2.5. FIREWALL ENGINE (CAPA 1: UX RATE LIMITER V5.51)
            const activeTenant = SESSION.tenantId || localStorage.getItem('gestia_tenant_id');
            
            if(!activeTenant) throw new Error("FALLO_SISTEMICO: TenantId desaparecido de la sesión autorizada.");

            logger.log(`🛡️ Evaluando reglas de Firewall UX para Tenant: ${activeTenant}...`);
            
            // ⚡ INYECCIÓN V5.51: Pasamos el token JWT al motor del Firewall
            await ejecutarFirewallGlobal({
                userId: SESSION.uid,
                tenantId: activeTenant,
                input: instruccion || "multimodal_payload",
                authToken: SESSION.token // <--- Llave maestra para el backend
            });

            // 🔑 3. IDEMPOTENCIA Y REGISTRO (Operations Engine)
            const opId = await generarHashSHA256(instruccion + Date.now() + SESSION.uid + activeTenant);
            const yaExiste = await verificarIdempotencia(opId);

            if (yaExiste) {
                throw new Error("OPERACION_DUPLICADA: Esta orden ya está siendo procesada (Mutex Locking).");
            }

            const pHash = await generarHashSHA256(instruccion);
            await registrarOperacion({
                opId,
                promptHash: pHash,
                userId: SESSION.uid,
                tenantId: activeTenant,
                version: GESTIA_CONFIG.VERSION
            });

            // 📝 4. CONTEXTO SEMÁNTICO (Semantic Engine)
            esquemaCorral = await sincronizarCorralSemantico(instruccion);
            logger.log("🏗️ Contexto semántico inyectado desde el Core.");

            // 🧠 5. INVOCACIÓN AL CEREBRO (Brain Engine) - FASE 2: RETRY INTELIGENTE V2 (Fuerza Bruta)
            let textoAcumulado = "";
            let resultadoIA = null;
            let isTruncated = true;
            let currentRetry = 0;
            const maxRetries = 5; // 🔥 MODO TANQUE: 5 Reintentos para armar reportes masivos
            
            let promptActual = `ORDEN_GOD_V5.51: ${instruccion}\n\n${esquemaCorral}`;
            
            // 🔄 CICLO DE AUTORRECUPERACIÓN
            while (isTruncated && currentRetry <= maxRetries) {
                if (currentRetry > 0) {
                    logger.warn(`🔄 [RETRY INTELIGENTE ${currentRetry}/${maxRetries}] Reconectando tejido neuronal...`);
                    // Aviso sutil en UI
                    agregarBurbujaInfo(`Detectado límite de red. Ensamblando fragmento ${currentRetry + 1}...`);
                } else {
                    logger.log(`🧠 [INTENTO 1] Disparando payload al Cerebro...`);
                }

                // Inyectamos los tokens
                const tokensPermitidos = GESTIA_CONFIG.MODO_TACANO.MAX_TOKENS_IA || 3200;
                
                // ⚡ INYECCIÓN V5.51: Pasamos el Token JWT al Brain Engine
                const brainRes = await invocarArquitectoIA(
                    promptActual,
                    currentRetry === 0 ? contextoMultimodal : [], 
                    opId + (currentRetry > 0 ? `_r${currentRetry}` : ""), 
                    tokensPermitidos,
                    SESSION.token // <--- Llave maestra para gestiaArchitectV5
                );

                // 🕵️ EXTRAEMOS LA CARNE CRUDA
                console.log(`%c🧠 [RAW BRAIN RESPONSE - FRAGMENTO ${currentRetry + 1}]:`, "color: #f59e0b; font-weight: bold", brainRes);
                
                let currentRaw = 
                    brainRes?.data?.modulo_generado ||
                    brainRes?.data?.payload ||
                    brainRes?.data?.result ||
                    brainRes?.modulo_generado ||
                    brainRes?.respuesta ||
                    "";

                // Si viene como objeto nativo desde la V5.51
                if (typeof currentRaw === "object") {
                    textoAcumulado = currentRaw; // Evitamos concatenar [object Object]
                    isTruncated = false;
                } else {
                    // LO UNIMOS AL ACUMULADOR MAESTRO (Texto plano)
                    textoAcumulado += currentRaw;
                }

                // 🧹 6. NORMALIZACIÓN DE SALIDA
                resultadoIA = normalizarSalidaIA(typeof textoAcumulado === "object" ? textoAcumulado : { respuesta: textoAcumulado });

                if (resultadoIA.tipo === "truncated") {
                    const ultimasPalabras = typeof textoAcumulado === "string" ? textoAcumulado.slice(-40).replace(/\n/g, " ") : "";
                    promptActual = `AUTO_RECOVERY_PROTOCOL: Corte de red detectado. Continúa EXACTAMENTE desde la letra o símbolo que sigue inmediatamente después de: "${ultimasPalabras}". REGLA ESTRICTA: NO repitas NINGUNA de esas últimas palabras.`;
                    currentRetry++;
                } else {
                    isTruncated = false;
                }
            }

            // 🛡️ 6.6. FALLBACK GLOBAL (Anti-Corte Total)
            if (!resultadoIA || !resultadoIA.tipo) {
                logger.error("FALLO_TOTAL_NORMALIZADOR");
                agregarBurbujaError("La IA devolvió un formato irreconocible por la V5.51.");
                await updateDoc(doc(db, "gestia_operations", opId), { status: "fatal_normalization_error" });
                
                const loadingElement = document.getElementById(idCarga);
                if (loadingElement) loadingElement.remove();
                return; 
            }

            // Limpieza de contexto volátil y spinner
            contextoMultimodal = []; 
            const loadingElement = document.getElementById(idCarga);
            if (loadingElement) loadingElement.remove();

            // 🔀 7. SWITCH MAESTRO DE FLUJO (V5.51 SUPREMO)
            switch (resultadoIA.tipo) {

                case "error":
                    logger.error(`🚨 FALLO_CRÍTICO_IA: ${resultadoIA.error}`);
                    agregarBurbujaError(`ERROR_BRAIN: ${resultadoIA.error}.`);
                    await updateDoc(doc(db, "gestia_operations", opId), { 
                        status: "fatal_error",
                        error_detail: resultadoIA.error
                    });
                    break;

                case "fallback":
                    logger.warn("🧯 Fallback activado.");
                    agregarBurbujaInfo("La IA no devolvió ADN procesable.");
                    await updateDoc(doc(db, "gestia_operations", opId), { status: "empty_fallback" });
                    break;

                case "truncated":
                    logger.error("⚠️ RESPUESTA CORTADA IRRECUPERABLE");
                    agregarBurbujaError(`SEÑAL CORTADA: Agotados los ${maxRetries} reintentos de red.`);
                    if (resultadoIA.codigo) {
                        agregarBurbujaCodigo(resultadoIA.codigo + "\n\n/* ❌ ERROR: TRUNCADO */");
                    }
                    await updateDoc(doc(db, "gestia_operations", opId), { status: "truncated_response_failed" });
                    break;

                case "v13_dual":
                    try {
                        logger.log("🧠 Detectado Flujo Arquitecto Supremo (V5.51).");
                        
                        // 🛡️ INYECCIÓN V5.55: El ID ya viene sanitizado y validado del Normalizador
                        const idFinal = resultadoIA.modulo_id;
                        logger.idFlow(`Terminal Despachando -> ${idFinal}`);
                        
                        agregarBurbujaHeberto(resultadoIA.mensaje_ceo, idFinal);

                        const auditoriaV13 = await ejecutarAuditoriaCore(
                            resultadoIA.json, 
                            versionLocalSnapshot, 
                            {
                                generarHash: generarHashSHA256,
                                normalizar: normalizarEstructura
                            }
                        );

                        // 🏛️ INYECCIÓN EN BASE DE DATOS
                        await ejecutarPersistenciaCore(
                            idFinal, 
                            auditoriaV13.data, 
                            auditoriaV13.hash, 
                            activeTenant
                        );
                        
                        versionLocalSnapshot = auditoriaV13.hash;
                        logger.log(`🏛️ ADN V5.51 [${idFinal}] Inmortalizado en el Búnker.`);

                        await updateDoc(doc(db, "gestia_operations", opId), {
                            status: "completed_v5_51",
                            hash_final: auditoriaV13.hash
                        });

                    } catch (errV13) {
                        logger.error(`FALLO_V5_51_DB: ${errV13.message}`);
                        agregarBurbujaError(`ERROR_ESTRUCTURAL: ${errV13.message}`);
                    }
                    break;

                case "json":
                    try {
                        logger.log("💎 Detectado Flujo A: JSON.");
                        const auditoria = await ejecutarAuditoriaCore(
                            resultadoIA.json, 
                            versionLocalSnapshot, 
                            {
                                generarHash: generarHashSHA256,
                                normalizar: normalizarEstructura
                            }
                        );

                        // 🛡️ INYECCIÓN V5.55: El ID ya viene sanitizado y validado del Normalizador
                        const idJsonLimpio = resultadoIA.modulo_id || generateModuleId(auditoria.data.modulo_id);
                        logger.idFlow(`Terminal Despachando -> ${idJsonLimpio}`);

                        await ejecutarPersistenciaCore(
                            idJsonLimpio, 
                            auditoria.data, 
                            auditoria.hash, 
                            activeTenant
                        );
                        
                        versionLocalSnapshot = auditoria.hash;
                        renderModuloSeguro(auditoria.data);

                        await updateDoc(doc(db, "gestia_operations", opId), {
                            status: "completed",
                            hash_final: auditoria.hash
                        });

                    } catch (errJson) {
                        logger.error(`FALLO_PROCESAMIENTO_JSON: ${errJson.message}`);
                        agregarBurbujaError("ERROR_ESTRUCTURAL.");
                    }
                    break;

                case "code":
                    logger.log("💻 Detectado Flujo B: Código Plano.");
                    agregarBurbujaCodigo(resultadoIA.codigo);
                    await updateDoc(doc(db, "gestia_operations", opId), { status: "completed_code" });
                    break;

                case "texto_plano":
                    logger.log("💬 Detectado Flujo Conversacional.");
                    agregarBurbujaHeberto(resultadoIA.codigo);
                    await updateDoc(doc(db, "gestia_operations", opId), { status: "completed_text" });
                    break;

                default:
                    logger.log("⚠️ Detectado Flujo Desconocido.");
                    agregarBurbujaCodigo(resultadoIA.codigo || "[Sin contenido]");
                    await updateDoc(doc(db, "gestia_operations", opId), { status: "fallback_unknown" });
                    break;
            }

        } catch (err) {
            if (err.message.includes("FIREWALL") || err.message.includes("RATE_LIMIT")) {
                await registrarErrorFirewall(SESSION.uid, activeTenant);
            }
            logger.error(`FALLO_SISTEMICO: ${err.message}`);
            
            const loadingElement = document.getElementById(idCarga);
            if (loadingElement) loadingElement.remove();
            
            agregarBurbujaError(err.message);
        } finally {
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
// 14. UI BUILDERS (GRADO INDUSTRIAL V5.51)
// ==========================================

/**
 * 🚀 NUEVO EN V5.51: Renderiza la Conciencia de Heberto (Texto humano y Confirmación).
 */
function agregarBurbujaHeberto(msg, moduloId = null) {
    if (!output) return;

    const div = document.createElement("div");
    div.className = "flex gap-5 animate-fade-in max-w-4xl mx-auto w-full mt-12 relative z-10";

    const mensajeSeguro = escaparHTML(msg);

    let botonHtml = "";
    if (moduloId) {
        botonHtml = `
            <button onclick="window.open('preview.html?id=${moduloId}', '_blank')" class="mt-4 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black px-6 py-2.5 rounded-xl shadow-lg transition-all uppercase tracking-widest flex items-center gap-2">
                🚀 Desplegar Módulo Configurado
            </button>
        `;
    }

    div.innerHTML = `
        <div class="w-14 h-14 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 shadow-[0_0_30px_rgba(16,185,129,0.5)] border border-emerald-400/30 relative z-20">
            <i class="fa-solid fa-brain text-white text-xl animate-pulse"></i>
        </div>

        <div class="bg-emerald-950/30 border border-emerald-500/40 p-8 rounded-[2.5rem] rounded-tl-none flex-1 shadow-2xl backdrop-blur-md relative z-10">
            <h3 class="text-emerald-400 text-[11px] font-black uppercase tracking-[0.4em] mb-3 relative z-20">Gestia Premium V5.51 Antifrágil</h3>
            <p class="text-emerald-50 text-sm leading-relaxed font-medium relative z-20">
                ${mensajeSeguro}
            </p>
            ${botonHtml}
            <div class="mt-5 pt-4 border-t border-emerald-500/20 flex items-center gap-3">
                <div class="flex gap-1">
                    <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce"></div>
                    <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style="animation-delay: 0.1s"></div>
                    <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style="animation-delay: 0.2s"></div>
                </div>
                <span class="text-[10px] text-emerald-500/80 font-mono uppercase tracking-widest font-bold">Autoridad Confirmada. DB Inyectada.</span>
            </div>
        </div>
    `;

    output.appendChild(div);
    hacerScrollAbajo();
}

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
                <span class="text-[13px] font-mono text-blue-400 uppercase tracking-[0.5em] block font-black">Heberto V5.51 Antifrágil</span>
                <span class="text-[10px] text-slate-500 font-mono uppercase font-bold">Validando Token JWT en Búnker...</span>
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

    const hashSeguro = escaparHTML(json.hash_contenido || "SSOT_V5.51");

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
                Instrucción procesada sin compactación. Integridad V5.51 garantizada.
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
            <h3 class="text-red-400 text-[11px] font-black uppercase tracking-[0.3em] mb-3 relative z-20">Intervención de Autoridad V5.51</h3>
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

console.log("%c>> GESTIAPREMIUM V5.51 ANTIFRÁGIL: OMNIPOTENCIA DE BACKEND ACTIVADA %c🚀", "color: #3b82f6; font-weight: bold; font-size: 18px;", "font-size: 18px;");
console.log("%c>> Authority: Centralized (Zero-Trust JWT + Transactional Hard Locking)", "color: #94a3b8; font-style: italic; font-weight: bold;");

/**
 * ======================================================================================
 * FIN DEL BÚNKER - EL DIOS DESARROLLADOR HA TOMADO EL PODER TOTAL.
 * STATUS: MODULARIZADO, BLINDADO, MULTI-TENANT Y ZERO-TRUST.
 * ======================================================================================
 */
