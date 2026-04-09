/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - TERMINAL HEBERTO V7.1 "KERNEL TRANSACCIONAL"
 * ======================================================================================
 * Autor: Heber Mendoza (Arquitecto Supremo)
 * Versión: 7.1-ANTIFRAGILE
 * ======================================================================================
 */

// 1. IMPORTACIONES DESDE TU SSOT (FIREBASE.JS)
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

// Importación específica para Transacciones
import { 
    runTransaction 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 2. IMPORTACIONES DE MOTORES CORE (GESTIA-CORE)
import { resolveTenantContext } from './gestia-core/core_auth_tenant_v1.js';
import { ejecutarFirewallGlobal } from './gestia-core/firewall.engine.js';
import { sincronizarCorralSemantico } from './gestia-core/semantic.engine.js';
import { invocarArquitectoIA } from './gestia-core/brain.engine.js';
import { persistirEstructuraModulo } from './gestia-core/persistence.engine.js';

// 3. NUEVOS MOTORES V7 (ANÁLISIS Y EJECUCIÓN)
import { analizarDatosSistema } from './gestia-core/data-analyzer.engine.js';
import { generarPropuesta } from './gestia-core/propose.engine.js';
import { ejecutarCambios } from './gestia-core/operations-executor.engine.js';

/* =====================================================================================
   DEFINICIÓN DE ESTADOS DEL RUNTIME (LA MÁQUINA DE ESTADOS)
   ===================================================================================== */
const STATES = {
    IDLE: "IDLE",                // Esperando comando
    ANALYZE: "ANALYZE",          // Escaneando Realidad (Data + Schema)
    PROPOSE: "PROPOSE",          // Traduciendo hallazgos a cambios
    WAIT_APPROVAL: "WAIT_APPROVAL", // Bloqueo de seguridad: Esperando "Arre"
    APPLY: "APPLY",              // Fase transaccional activa
    DONE: "DONE",                // Ciclo completado
    ERROR: "ERROR"               // Fallo en el Kernel
};

// Diccionario de Autorización Humana
const APPROVAL_WORDS = ["si", "sí", "ok", "arre", "hazlo", "aplica", "dale", "proceder"];
/* ==========================================================
   2. CONFIGURACIÓN OMNIPOTENTE V7.1 (HERENCIA V5.51)
   ========================================================== */
const GESTIA_CONFIG = {
    VERSION: "7.1-MT-ANTIFRAGILE",
    MODO_DIOS: true,
    MODO_TACANO: {
        ACTIVO: true,
        MAX_TOKENS_IA: 3200,        // Limita el costo por mensaje
        MAX_READS_FIRESTORE: 15,    // Evita lecturas masivas en el corral
        MAX_CONTEXTO_HISTORY: 3,    // Solo envía las últimas 3 versiones a la IA
        CACHE_CORRAL_TTL: 300000    // 5 min de cache local para no leer DB
    },
    COLECCIONES: {
        ROOT: "tenants",            // Raíz multi-tenant
        MODULES: "gestia_system_modules",
        OPERATIONS: "gestia_operations",
        HISTORY: "gestia_history",
        LOGS: "gestia_logs",
        DYNAMIC: "gestia_dynamic_data" // Para el Data Analyzer
    }
};

/* ==========================================
   VARIABLES DE ESTADO GLOBAL (ADN V5.51-MT)
   ========================================== */

// 🛡️ SESSION: ADN de autoridad Zero-Trust.
let SESSION = { 
    authorized: false, 
    uid: null, 
    tenantId: null, 
    role: null,
    token: null // Almacén del JWT para el Firewall del Backend
}; 

// 🔗 PUENTES DE COMPATIBILIDAD V7
let CURRENT_TENANT_ID = null;
let CURRENT_USER_ROLE = null;
let traceIdActual = null; // Trazabilidad forense

// 📦 MEMORIA VOLÁTIL (Multimodalidad)
let contextoMultimodal = []; 
let esquemaCorral = "";      

// 🔒 CONTROL DE CONCURRENCIA
let versionLocalSnapshot = null; 

// ⚖️ LIMITADORES DE CONSUMO
let GESTIA_USAGE_COUNTER = 0;
/* ==========================================
   3. KIT DE IDENTIDAD GESTIA (CONSTITUCIÓN)
   ========================================== */

/**
 * GENERATE_MODULE_ID: Único punto de transformación permitido.
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

    if (!cleaned || cleaned.length < 3) {
        const suffix = Date.now().toString(36);
        return `mod_err_${suffix}`.substring(0, 50); 
    }
    return cleaned.substring(0, 50);
}

/**
 * IS_VALID_ID: El Cadenero Estricto.
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

/* ==========================================
   4. LOGGER Y CRIPTOGRAFÍA (AUDITORÍA)
   ========================================== */

function crearLogger() {
    const traceId = traceIdActual || `GOD_${Date.now()}`;
    return {
        log: (msg) => console.log(`%c[${traceId}]%c ${msg}`, "color: #3b82f6; font-weight: bold", "color: #cbd5e1"),
        // 🛠️ FIX V7.1: Se inyecta método warn para soporte de alertas y Modo Dios
        warn: (msg) => console.warn(`%c[${traceId}]%c ⚠️ ${msg}`, "color: #f59e0b; font-weight: bold", "color: #fde68a"),
        idFlow: (id) => console.log(`%c[ID_FLOW]%c ID_GENERADO: ${id}`, "color: #10b981; font-weight: bold", "color: #a7f3d0"),
        error: (msg) => console.error(`%c[${traceId}]%c ❌ ${msg}`, "color: #ef4444; font-weight: bold", "color: #fca5a5"),
        id: traceId
    };
}

/**
 * Genera un hash único (SHA-256) para el operation_id.
 */
async function generarHashSHA256(texto) {
    const encoder = new TextEncoder();
    const data = encoder.encode(texto);
    const buffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normaliza objetos para que el hash sea determinista.
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
 * Escapa HTML para prevenir XSS en las burbujas.
 */
function escaparHTML(str) {
    if (!str) return "";
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
/* =====================================================================================
   CLASE MAESTRA: TERMINAL HEBERTO V7.1
   ===================================================================================== */

export class TerminalHeberto {
    constructor() {
        // Máquina de Estados
        this.state = STATES.IDLE;
        
        // Sesión y Autoridad (ADN V5.51)
        this.session = { 
            authorized: false, 
            uid: null, 
            tenantId: null, 
            role: null,
            token: null 
        };

        // Contexto de Operación
        this.context = null;         // Contendrá operation_id y tenantId de la op activa
        this.pendingProposal = null;  // La propuesta del Propose Engine que espera el "Arre"
        this.log = [];                // Trazabilidad forense de estados
        
        this.logger = crearLogger();
    }

    /**
     * setState: Cambia el estado del Kernel y notifica al sistema/UI
     */
    setState(newState) {
        this.state = newState;
        const entry = { 
            state: newState, 
            time: new Date().toISOString(),
            traceId: this.logger.id 
        };
        this.log.push(entry);
        
        // Notificamos a la UI mediante un evento global
        window.dispatchEvent(new CustomEvent('gestia-terminal-state', { detail: entry }));
        
        console.log(`%c[KERNEL_STATE]: ${newState}`, "background: #1e293b; color: #38bdf8; padding: 2px 8px; border-radius: 4px; font-weight: bold;");
    }

    /**
     * inicializarAutoridad: Valida identidad y abre el búnker (Integración V5.51)
     */
    async inicializarAutoridad() {
        this.logger.log("🛡️ Kernel V7.1: Solicitando resolución de autoridad al Core...");
        
        try {
            // 1. Resolvemos el contexto inicial (Tenant + Rol)
            const resolvedSession = await resolveTenantContext();
            this.session = { ...this.session, ...resolvedSession };

            // 2. Obtención de Token JWT para Firewall Backend
            const currentUser = auth.currentUser;
            if (currentUser) {
                this.session.token = await currentUser.getIdToken(true); 
            } else {
                throw new Error("FALLO_DE_IDENTIDAD: Usuario no detectado en Firebase.");
            }

            // 🔑 BYPASS DE SOBERANÍA: Heber Mendoza (Arquitecto Supremo)
            if (this.session.uid === "nNhwy3Mx4pTvc8TZVh1tyTMFwhC2") { 
                this.session.authorized = true;
                this.session.role = "arquitecto_supremo";
                this.logger.warn("🔓 MODO DIOS ACTIVADO: Soberanía de Heber Mendoza confirmada.");
            }

            // 🛡️ VALIDACIÓN FINAL DE ENTRADA AL BÚNKER
            if (!this.session.authorized || !this.session.token) {
                throw new Error("FALLO_DE_AUTORIDAD_SaaS: Acceso denegado al búnker.");
            }

            // Inmortalizamos en globales para compatibilidad con motores V5
            SESSION = this.session;
            CURRENT_TENANT_ID = this.session.tenantId;
            CURRENT_USER_ROLE = this.session.role;

            console.log(`%c✅ Búnker abierto para: ${CURRENT_TENANT_ID} | Rol: ${this.session.role}`, "color: #10b981; font-weight: bold;");
            
            this.setState(STATES.IDLE);

        } catch (error) {
            this.setState(STATES.ERROR);
            this.logger.error(`BLOQUEO_DE_SEGURIDAD: ${error.message}`);
            
            // Si falla la identidad, lo sacamos por seguridad
            if (error.message.includes("FALLO_DE_AUTORIDAD") || error.message.includes("FALLO_DE_IDENTIDAD")) {
                alert("🚫 Acceso Denegado: Autoridad no validada.");
                window.location.href = "/login.html"; 
            }
        }
    }

    /**
     * isApproval: Valida si el input es una confirmación humana (Arre)
     */
    isApproval(input) {
        const clean = (input || "").toLowerCase().trim();
        return APPROVAL_WORDS.includes(clean);
    }

    /**
     * execute: El punto de entrada único para toda instrucción.
     * Orquesta el flujo: ANALYZE -> PROPOSE -> WAIT_APPROVAL -> APPLY
     */
    async execute(input) {
        const rawInput = (input || "").trim();

        try {
            // 🛡️ 1. FIREWALL UX (Rate Limit & Safety V5.51)
            await ejecutarFirewallGlobal({
                userId: this.session.uid,
                tenantId: this.session.tenantId,
                input: rawInput || "multimodal_payload",
                authToken: this.session.token
            });

            // 🔄 2. INTERCEPTOR DE APROBACIÓN (Fase APPLY)
            if (this.isApproval(rawInput) && this.state === STATES.WAIT_APPROVAL) {
                if (!this.pendingProposal) throw new Error("NO_PENDING_PROPOSAL");
                
                this.setState(STATES.APPLY);
                const result = await this.runExecutionPipeline(this.pendingProposal);
                
                this.setState(STATES.DONE);
                return result;
            }

            // 🔍 3. INICIO DE NUEVA OPERACIÓN (Fase ANALYZE)
            this.setState(STATES.ANALYZE);
            this.context = await this.buildContext(rawInput);
            esquemaCorral = await sincronizarCorralSemantico(rawInput);
            const analysis = await this.runDualAnalysis(this.context);

            // 💡 4. GENERACIÓN DE PROPUESTA (Fase PROPOSE)
            // Generamos primero para evaluar si el sistema requiere intervención humana
            const proposal = generarPropuesta(analysis);

            // 🛡️ CONTROL DE FLUJO ANTIFRAGILE (Fix V7.1)
            // Si el búnker está limpio (0 cambios), cerramos el ciclo sin bloquear
            if (!proposal.needs_approval) {
                this.logger.log("✨ Búnker en orden nominal. No se requiere intervención.");
                this.setState(STATES.DONE); // Saltamos directo a éxito
                
                return this.normalizeOutput({
                    intent: "info",
                    action: "no_changes_needed",
                    data: proposal,
                    ui: { type: "info_card" } 
                });
            }

            // Si hay cambios (Riesgo HIGH/MEDIUM), procedemos al rito de aprobación
            this.setState(STATES.PROPOSE);
            this.pendingProposal = {
                ...proposal,
                operation_id: this.context.operation_id,
                tenantId: this.context.tenantId,
                ejecutado_por: this.session.uid
            };

            // ⏳ 5. BLOQUEO DE SEGURIDAD (Fase WAIT_APPROVAL)
            // Aquí es donde el Kernel se detiene y espera el "Arre"
            this.setState(STATES.WAIT_APPROVAL);

            return this.normalizeOutput({
                intent: "proposal",
                action: "await_approval",
                data: this.pendingProposal,
                ui: { type: "proposal_card" }
            });

        } catch (error) {
            return this.handleKernelError(error);
        }
    }

   /**
     * buildContext: Crea el ID de operación y registra el inicio en Firestore.
     */
    async buildContext(input) {
        let opId;
        try {
            opId = await generarHashSHA256(
                input + Date.now() + this.session.uid + this.session.tenantId
            );
        } catch (e) {
            // Fallback Antifragile si falla el Crypto
            opId = `GOD_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        }

        const ctx = {
            operation_id: opId,
            tenantId: this.session.tenantId,
            ejecutado_por: this.session.uid,
            rawInput: input
        };

        // Registro silencioso de la operación (Auditoría Forense)
        const opRef = doc(db, GESTIA_CONFIG.COLECCIONES.OPERATIONS, opId);
        await setDoc(opRef, {
            operation_id: opId,
            tenantId: ctx.tenantId,
            ejecutado_por: ctx.ejecutado_por,
            input_original: input,
            status: "processing",
            tipo_cambio: "TERMINAL_ANALYSIS",
            version_core: GESTIA_CONFIG.VERSION,
            fecha: serverTimestamp()
        }, { merge: true });

        this.logger.log(`🆔 Operación Registrada: ${opId}`);
        return ctx;
    }

    /**
     * runDualAnalysis: El "Ojo de Dios". Escanea estructura y realidad.
     * ACTUALIZADO V7.3: Extracción de contexto manual para el Analyzer.
     */
    async runDualAnalysis(ctx) {
        this.logger.log("🔍 Iniciando Auditoría Dual (Schema + Data)...");
        const analysis = { schema: null, data: null, vip_scan: null };
        const inputLower = ctx.rawInput.toLowerCase();

        // 1. [CIRUJANO VIP] Búsqueda de ADN de Módulo
        const matchId = ctx.rawInput.match(/modulo(?:_|\s+)([a-z0-9_]+)/i);
        if (matchId) {
            const idPropuesto = matchId[1];
            this.logger.log(`🩺 [VIP SCAN] Extrayendo ADN del módulo: ${idPropuesto}`);
            try {
                const docRef = doc(db, GESTIA_CONFIG.COLECCIONES.MODULES, idPropuesto);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    analysis.vip_scan = { id: idPropuesto, dna: snap.data(), status: "found" };
                }
            } catch (e) { this.logger.warn(`⚠️ VIP Scanner: ${e.message}`); }
        }

        // 2. [MANUAL OVERRIDE] Extracción de contexto para el Analyzer
        // Buscamos nombres (Jonathan) o placas (UVZ343K) en el prompt
        const manualContext = {
            tecnico: inputLower.includes("jonathan") ? "jonathan" : null,
            placa: ctx.rawInput.match(/[A-Z]{3}[0-9]{3,4}[A-Z]?/i)?.[0] || null
        };

        try {
            this.logger.log("📊 Ejecutando Data Analyzer Engine V7.3...");
            // 💡 Inyectamos el contexto manual para que el Analyzer "vea" lo que la UI reporta
            analysis.data = await analizarDatosSistema(ctx.tenantId, manualContext);
        } catch (e) {
            this.logger.error(`❌ Fallo en Data Analyzer: ${e.message}`);
            analysis.data = { alerts: [], warnings: [], metrics: {} };
        }

        return analysis;
    }

    /**
     * runExecutionPipeline: El brazo mecánico (El ARRE).
     */
    async runExecutionPipeline(proposal) {
        this.logger.log(`🚀 [EJECUCIÓN] Aplicando cambios para OP: ${proposal.operation_id}`);
        try {
            const resultados = await ejecutarCambios({
                operation_id: proposal.operation_id,
                tenantId: proposal.tenantId,
                ejecutado_por: proposal.ejecutado_por,
                changes: proposal.changes
            });

            const total = Array.isArray(resultados) ? resultados.length : 0;
            this.logger.log(`✅ Pipeline finalizado. ${total} acciones impactadas.`);

            return this.normalizeOutput({
                intent: "apply_changes",
                action: "terminal_execution_success",
                data: {
                    applied: true,
                    operation_id: proposal.operation_id,
                    summary: resultados || []
                },
                ui: { type: "execution_success" }
            });
        } catch (error) {
            throw new Error(`FALLO_TRANSACCIONAL: ${error.message}`);
        }
    }

    normalizeOutput(result) {
        return {
            success: true,
            operation_id: this.context?.operation_id || null,
            intent: result.intent,
            action: result.action,
            data: result.data,
            ui: result.ui,
            audit: {
                tenantId: this.session.tenantId,
                state: this.state,
                timestamp: new Date().toISOString()
            },
            error: null
        };
    }

    resetContext() {
        this.context = null;
        this.pendingProposal = null;
        
        // 🛡️ FIX V7.1: Si no reseteas el estado, el Kernel puede ignorar el próximo input.
        this.setState(STATES.IDLE); 
        
        this.logger.log("🧹 Contexto liberado. Kernel IDLE y listo para nueva orden.");
    }
}

/* =====================================================================================
   7. INSTANCIACIÓN Y EXPOSICIÓN GLOBAL (EL NACIMIENTO)
   ===================================================================================== */
// Movemos esto arriba de los listeners para evitar el ReferenceError
const KernelHeberto = new TerminalHeberto();
window.KernelHeberto = KernelHeberto; // Lo anclamos al búnker global
window.GestiaTerminal = KernelHeberto; // Alias de compatibilidad

/* =====================================================================================
   8. UI BUILDERS - GRADO INDUSTRIAL V7.1
   ===================================================================================== */
window.renderProposalCard = function(proposal) {
    const data = { risk: "LOW", impact: "Sin cambios", changes: [], ...proposal };
    const output = document.getElementById('gestia-output');
    if (!output) return;

    const themes = {
        HIGH: { bg: "bg-red-600", border: "border-red-500/30", text: "text-red-400", icon: "fa-triangle-exclamation" },
        MEDIUM: { bg: "bg-amber-600", border: "border-amber-500/30", text: "text-amber-400", icon: "fa-shield-halved" },
        LOW: { bg: "bg-emerald-600", border: "border-emerald-500/30", text: "text-emerald-400", icon: "fa-shield-check" }
    };
    const theme = themes[data.risk] || themes.LOW;

    const div = document.createElement("div");
    div.className = "flex gap-5 animate-fade-in max-w-4xl mx-auto w-full mt-10 relative z-10";
    div.innerHTML = `
        <div class="w-14 h-14 rounded-full ${theme.bg} flex items-center justify-center shrink-0 shadow-lg relative z-20">
            <i class="fa-solid ${theme.icon} text-white text-xl"></i>
        </div>
        <div class="bg-slate-900/90 border ${theme.border} p-8 rounded-[2.5rem] rounded-tl-none flex-1 shadow-2xl backdrop-blur-md relative z-10">
            <div class="flex justify-between items-start mb-4">
                <h3 class="${theme.text} text-[11px] font-black uppercase tracking-[0.4em]">Propuesta V7.1</h3>
                <span class="${theme.text} text-[9px] font-bold">RIESGO: ${data.risk}</span>
            </div>
            <p class="text-slate-100 text-sm font-bold mb-4">${data.impact}</p>
            <div class="flex gap-4 pt-4 border-t border-slate-800">
                <button onclick="window.KernelHeberto.execute('arre')" class="bg-emerald-600 text-white text-[11px] font-black px-8 py-3 rounded-xl uppercase tracking-widest">
                    🚀 ARRE (APLICAR)
                </button>
                <button onclick="window.KernelHeberto.resetContext(); this.closest('.animate-fade-in').style.opacity='0.5'" class="bg-slate-800 text-slate-400 text-[11px] font-black px-6 py-3 rounded-xl uppercase tracking-widest">
                    CANCELAR
                </button>
            </div>
        </div>
    `;
    output.appendChild(div);
    window.hacerScrollAbajo?.();
};

/* =====================================================================================
   9. INTERACCIÓN Y DISPARO (THE GLUE)
   ===================================================================================== */
const form = document.getElementById('gestia-form');
const input = document.getElementById('gestia-input');
const btnGenerate = document.getElementById('btn-generate');

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 🛡️ USAMOS LA REFERENCIA GLOBAL PARA EVITAR EL REFERENCE_ERROR
        if (!window.KernelHeberto.session.authorized) {
            window.agregarBurbujaError?.("🚨 Bloqueo: Esperando autoridad del sistema.");
            return;
        }

        const instruccion = input.value.trim();
        if (!instruccion) return;

        btnGenerate.disabled = true;
        input.disabled = true;
        input.value = '';

        window.agregarBurbujaUsuario?.(instruccion);
        const idCarga = window.mostrarCargando?.();

        try {
            // 🚀 LLAMADA AL KERNEL GLOBAL
            const response = await window.KernelHeberto.execute(instruccion);

            const loadingElement = document.getElementById(idCarga);
            if (loadingElement) loadingElement.remove();

            if (response.success) {
                switch (response.ui?.type) {
                    case "proposal_card":
                        window.renderProposalCard?.(response.data);
                        break;
                    case "execution_success":
                        window.renderExecutionResult?.(response.data);
                        window.KernelHeberto.resetContext();
                        break;
                    default:
                        if (response.data?.mensaje_ceo) {
                            window.agregarBurbujaSistema?.(response.data.mensaje_ceo);
                        }
                }
            } else {
                throw new Error(response.error || "ERROR_KERNEL");
            }
        } catch (err) {
            const loadingElement = document.getElementById(idCarga);
            if (loadingElement) loadingElement.remove();
            window.agregarBurbujaError?.(err.message);
        } finally {
            btnGenerate.disabled = false;
            input.disabled = false;
            input.focus();
            window.hacerScrollAbajo?.();
        }
    });
}

// 🔐 OBSERVADOR DE AUTENTICACIÓN
onAuthStateChanged(auth, (user) => {
    if (user) {
        // El Kernel ya fue instanciado arriba, solo inicializamos autoridad
        window.KernelHeberto.inicializarAutoridad();
    } else {
        if (!window.location.pathname.includes("login.html")) {
            window.location.href = "/login.html";
        }
    }
});