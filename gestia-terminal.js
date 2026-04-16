/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - TERMINAL HEBERTO V9.0 "JARVIS PRO / SIA7"
 * ======================================================================================
 * Autor: Heber Mendoza (Arquitecto Supremo)
 * Versión: 9.0-PRO-ANTIFRAGILE
 * Capas: Dry Run, Rollback (Engine), Confidence Score, Safe Guard, Persistent Timeline.
 * ======================================================================================
 */

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

// MOTORES CORE
import { resolveTenantContext } from '/gestia-core/core_auth_tenant_v1.js';
import { ejecutarFirewallGlobal } from '/gestia-core/firewall.engine.js';
import { sincronizarCorralSemantico } from '/gestia-core/semantic.engine.js';
import { invocarArquitectoIA } from '/gestia-core/brain.engine.js';
import { persistirEstructuraModulo } from '/gestia-core/persistence.engine.js';

// MOTORES V9 / V16
import { analizarDatosSistema } from '/gestia-core/data-analyzer.engine.js';
import { generarPropuesta } from '/gestia-core/propose.engine.js';
import { ejecutarCambios } from '/gestia-core/operations-executor.engine.js';

/* =====================================================================================
    DEFINICIÓN DE ESTADOS (PROTOCOLOS PRO)
   ===================================================================================== */
const STATES = {
    IDLE: "IDLE",
    ANALYZE: "ANALYZE",
    PROPOSE: "PROPOSE",
    DRY_RUN: "DRY_RUN",           // 🧬 Fase de simulación visual
    AUTO_APPLY_SAFE: "AUTO_APPLY_SAFE",
    WAIT_APPROVAL: "WAIT_APPROVAL",
    APPLY: "APPLY",
    ROLLBACK: "ROLLBACK",         // 🛡️ Fase delegada al Engine
    DONE: "DONE",
    ERROR: "ERROR"
};

const APPROVAL_WORDS = ["si", "sí", "ok", "arre", "hazlo", "aplica", "dale", "proceder"];
const BLOQUEADOS = ["users", "tenants", "gestia_operations", "billing"]; // 🔐 SAFE GUARD

const GESTIA_CONFIG = {
    VERSION: "9.0-SIA7-PRO",
    COLECCIONES: {
        MODULES: "gestia_system_modules",
        OPERATIONS: "gestia_operations",
        BACKUPS: "gestia_backups",
        LOGS: "gestia_logs"
    }
};

/* ==========================================
    VARIABLES DE ESTADO GLOBAL
   ========================================== */
/**
 * SESSION: Estado compartido de autoridad.
 * ✅ FIX: Inicializamos tenantId con el búnker base para evitar fallos de resolución.
 */
let SESSION = { 
    authorized: false, 
    uid: null, 
    tenantId: "uxmal39", // El ancla inmutable
    role: null, 
    token: null 
}; 

function crearLogger() {
    const traceId = `SIA7_PRO_${Date.now()}`;
    return {
        log: (msg) => console.log(`%c[${traceId}]%c ${msg}`, "color: #10b981; font-weight: bold", "color: #cbd5e1"),
        warn: (msg) => console.warn(`%c[${traceId}]%c ⚠️ ${msg}`, "color: #f59e0b; font-weight: bold", "color: #fde68a"),
        error: (msg) => console.error(`%c[${traceId}]%c ❌ ${msg}`, "color: #ef4444; font-weight: bold", "color: #fca5a5"),
        id: traceId
    };
}

async function generarHashSHA256(texto) {
    const encoder = new TextEncoder();
    const data = encoder.encode(texto);
    const buffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export class TerminalHeberto {
    constructor() {
        this.state = STATES.IDLE;
        
        /**
         * Sincronización de Sesión:
         * ✅ IMPORTANTE: Usamos la referencia a SESSION para que los cambios
         * en inicializarAutoridad se reflejen en toda la instancia.
         */
        this.session = SESSION; 
        
        this.context = null; 
        this.pendingProposal = null;
        this.logger = crearLogger();
    }

    /**
     * calcularConfianza: Score de IA basado en riesgo e impacto
     */
    calcularConfianza(proposal) {
        let score = 100;
        const changes = proposal.operations || proposal.changes || [];

        if (proposal.risk === "MEDIUM") score -= 20;
        if (proposal.risk === "HIGH") score -= 50;
        if (changes.length > 2) score -= 10;

        return Math.max(0, score);
    }

    async setState(newState, stepInfo = "status_update") {
        this.state = newState;
        const entry = { 
            state: newState, 
            step: stepInfo,
            timestamp: new Date().toISOString(),
            traceId: this.logger.id 
        };
        
        window.dispatchEvent(new CustomEvent('gestia-terminal-state', { detail: entry }));

        // 🧬 LOG TIPO BANCO (Timeline)
        if (this.context?.operation_id) {
            try {
                const logRef = doc(db, GESTIA_CONFIG.COLECCIONES.LOGS, `${this.context.operation_id}_${Date.now()}`);
                await setDoc(logRef, { ...entry, tenantId: this.session.tenantId }, { merge: true });
            } catch (e) { console.warn("Log timeline failed", e); }
        }
        
        console.log(`%c[JARVIS_PRO]: ${newState}`, "background: #020617; color: #10b981; padding: 2px 8px; border-radius: 4px; border: 1px solid #10b981");
    }

    clasificarRiesgo(proposal) {
        const risk = proposal?.risk || "LOW";
        const changes = proposal?.operations || proposal?.changes || [];
        const tieneCritico = changes.some(c => BLOQUEADOS.includes(c.target) || BLOQUEADOS.includes(c.payload?.collection));

        return {
            nivel: risk,
            requiereAprobacion: risk === "HIGH" || (risk === "MEDIUM" && tieneCritico),
            confianza: this.calcularConfianza(proposal)
        };
    }

   async inicializarAutoridad() {
    try {
        console.log("🧠 INIT AUTH START...");

        // 🛡️ PASO 1: EXTRAER USUARIO ANTES DE VALIDAR TENANT
        const user = auth.currentUser;
        
        if (!user) {
            console.warn("⚠️ [AUTH]: No hay usuario de Firebase detectado.");
            throw new Error("NO_FIREBASE_USER");
        }

        // 🛡️ PASO 2: LOG DE IDENTIDAD PRE-VALIDACIÓN
        // Esto se ejecutará SÍ O SÍ antes de que truene el resolver
        console.log("🔍 [DEBUG IDENTITY PRE-CHECK]:", {
            uid: user.uid,
            tenantId_Actual: this.session.tenantId, // Ver si viene vacío
            path_esperado: `tenants/${this.session.tenantId || "uxmal39"}/admins/${user.uid}`
        });

        // 🛡️ PASO 3: INTENTO DE RESOLUCIÓN
        const res = await resolveTenantContext();
        
        console.log("✅ TENANT RES:", res);

        this.session = { ...this.session, ...res };
        this.session.token = await user.getIdToken(true);
        SESSION = this.session;

        console.log("🔥 SESSION FINAL:", this.session);

        await this.setState(STATES.IDLE);

    } catch (e) {
        console.error("💥 ERROR REAL INIT:", e);
        // Si el error es USER_UNKNOWN, el log de arriba nos dirá por qué
        await this.setState(STATES.ERROR);
    }
}
    /**
     * simularCambios: Dry Run para Jarvis Visual
     */
    async simularCambios(proposal) {
        const ops = proposal.operations || proposal.changes || [];
        const simulacion = ops.map(c => ({
            tipo: c.type,
            destino: c.payload?.collection || c.target || "unknown",
            riesgo: proposal.risk || "LOW"
        }));

        window.dispatchEvent(new CustomEvent('gestia-dry-run', { detail: { simulacion } }));
        return simulacion;
    }

    async execute(input) {
        const rawInput = (input || "").trim();
        const isArre = APPROVAL_WORDS.includes(rawInput.toLowerCase());

        try {
            // 🔐 VALIDAR SESIÓN
            if (!this.session.uid || !this.session.tenantId) {
                throw new Error("SESSION_NOT_READY");
            }

            await ejecutarFirewallGlobal({ userId: this.session.uid, tenantId: this.session.tenantId, input: rawInput, authToken: this.session.token });

            // 🔄 INTERCEPTOR ARRE (SIA7 Unificado)
            if (isArre && this.state === STATES.WAIT_APPROVAL) {
                if (!this.pendingProposal) throw new Error("NO_PENDING_PROPOSAL");
                
                const proposal = this.pendingProposal;
                this.pendingProposal = null;

                await this.setState(STATES.DRY_RUN, "simulacion_pre_arre");
                await this.simularCambios(proposal);

                await this.setState(STATES.APPLY, "ejecucion_manual_iniciada");
                const result = await this.runExecutionPipeline(proposal);
                
                await this.setState(STATES.DONE);
                this.resetContext();
                return result;
            }

            // 🔍 ANALYZE -> PROPOSE
            await this.setState(STATES.ANALYZE);
            this.context = await this.buildContext(rawInput);
            
            const analysis = await this.runDualAnalysis(this.context);
            const proposal = generarPropuesta(analysis);
            proposal.operation_id = this.context.operation_id;

            const decision = this.clasificarRiesgo(proposal);

            window.dispatchEvent(new CustomEvent('gestia-proposal', { detail: { proposal, decision } }));

            // 🟢 AUTO APPLY (LOW RISK)
            if (!decision.requiereAprobacion) {
                await this.setState(STATES.DRY_RUN, "simulacion_auto_apply");
                await this.simularCambios(proposal);

                await this.setState(STATES.AUTO_APPLY_SAFE);
                const result = await this.runExecutionPipeline(proposal);
                
                await this.setState(STATES.DONE);
                this.resetContext();
                return result;
            }

            // 🟡 WAIT APPROVAL
            this.pendingProposal = { ...proposal, tenantId: this.session.tenantId, ejecutado_por: this.session.uid };
            await this.setState(STATES.WAIT_APPROVAL);

            return this.normalizeOutput({ intent: "proposal", action: "await_approval", data: this.pendingProposal, ui: { type: "proposal_card" } });

        } catch (error) { return this.handleKernelError(error); }
    }

    /**
     * runExecutionPipeline: DELEGACIÓN SOBERANA (Fix V16.1)
     * Centraliza toda la lógica de escritura, backup y rollback en el Engine.
     */
    async runExecutionPipeline(proposal) {
        const opId = proposal.operation_id || proposal.metadata?.analysis_id || `op_${Date.now()}`;

        window.dispatchEvent(new CustomEvent('gestia-execution-start', { detail: { opId } }));

        try {
            // El pipeline de ráfaga atómica del Executor gestiona la integridad
            const result = await ejecutarCambios({
                ...proposal,
                tenantId: this.session.tenantId,
                ejecutado_por: this.session.uid,
                operation_id: opId
            });

            return result;

        } catch (err) {
            // Si el motor falla, Jarvis entra en estado de error reportando el fallo del Ledger
            throw new Error(`PIPELINE_ERROR: ${err.message}`);
        }
    }

    async buildContext(input) {
        const opId = await generarHashSHA256(input + Date.now() + this.session.uid);
        const opRef = doc(db, GESTIA_CONFIG.COLECCIONES.OPERATIONS, opId);
        await setDoc(opRef, { operation_id: opId, tenantId: this.session.tenantId, status: "analyzing", input_original: input, fecha: serverTimestamp() });
        return { operation_id: opId, tenantId: this.session.tenantId, rawInput: input };
    }

    async runDualAnalysis(ctx) {
        const data = await analizarDatosSistema(ctx.tenantId);
        return data;
    }

    handleKernelError(error) {
        const msg = error.message || String(error);
        this.logger.error(msg);
        this.setState(STATES.ERROR, msg);
        window.dispatchEvent(new CustomEvent('gestia-execution-error', { detail: { error: msg } }));
        return { success: false, error: msg };
    }

    normalizeOutput(res) {
        return { success: true, operation_id: this.context?.operation_id, data: res.data, ui: res.ui };
    }

    resetContext() {
        this.context = null; this.pendingProposal = null;
        this.setState(STATES.IDLE);
    }
}

const KernelHeberto = new TerminalHeberto();
window.KernelHeberto = KernelHeberto;

onAuthStateChanged(auth, (u) => {
    if (u) window.KernelHeberto.inicializarAutoridad();
    else if (!window.location.pathname.includes("login.html")) window.location.href = "/login.html";
});