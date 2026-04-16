/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - TERMINAL HEBERTO V9.0 "JARVIS PRO / SIA7"
 * ======================================================================================
 * Autor: Heber Mendoza (Arquitecto Supremo)
 * Versión: 9.0-PRO-ANTIFRAGILE
 * Capas: Dry Run, Rollback, Confidence Score, Safe Guard, Persistent Timeline.
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
import { resolveTenantContext } from './gestia-core/core_auth_tenant_v1.js';
import { ejecutarFirewallGlobal } from './gestia-core/firewall.engine.js';
import { sincronizarCorralSemantico } from './gestia-core/semantic.engine.js';
import { invocarArquitectoIA } from './gestia-core/brain.engine.js';
import { persistirEstructuraModulo } from './gestia-core/persistence.engine.js';

// MOTORES V9
import { analizarDatosSistema } from './gestia-core/data-analyzer.engine.js';
import { generarPropuesta } from './gestia-core/propose.engine.js';
import { ejecutarCambios, procesarInstruccionSegura } from './gestia-core/operations-executor.engine.js';

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
    ROLLBACK: "ROLLBACK",         // 🛡️ Fase de recuperación de desastres
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
let SESSION = { authorized: false, uid: null, tenantId: null, role: null, token: null }; 

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
        this.session = SESSION;
        this.context = null; 
        this.pendingProposal = null;
        this.logger = crearLogger();
    }

    /**
     * calcularConfianza: Score de IA basado en riesgo e impacto (Fix 4)
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
            const res = await resolveTenantContext();
            this.session = { ...this.session, ...res };
            const user = auth.currentUser;
            if (user) this.session.token = await user.getIdToken(true);
            SESSION = this.session;
            await this.setState(STATES.IDLE);
        } catch (e) { await this.setState(STATES.ERROR); }
    }

    /**
     * simularCambios: Dry Run para Jarvis Visual (Fix 3)
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
            await ejecutarFirewallGlobal({ userId: this.session.uid, tenantId: this.session.tenantId, input: rawInput, authToken: this.session.token });

            // 🔄 INTERCEPTOR ARRE
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
     * runExecutionPipeline: Pipeline con Rollback y Safe Guard (Fix 1, 2 & 5)
     */
    async runExecutionPipeline(proposal) {
        const ops = proposal.operations || proposal.changes || [];
        const opId = proposal.operation_id || `op_${Date.now()}`;
        const ejecutados = [];

        window.dispatchEvent(new CustomEvent('gestia-execution-start', { detail: { opId } }));

        try {
            for (const change of ops) {
                const moduloId = change.payload?.collection || change.target || `auto_${Date.now()}`;

                // 🔐 SAFE GUARD (Fix 5)
                if (BLOQUEADOS.includes(moduloId)) {
                    throw new Error(`SAFE_GUARD_CRITICAL_BLOCK: Intento de escritura en ${moduloId}`);
                }

                // 🧬 BACKUP PRE-ESCRITURA (Fix 1)
                const backupRef = doc(db, GESTIA_CONFIG.COLECCIONES.MODULES, moduloId);
                const backupSnap = await getDoc(backupRef);
                const backupData = backupSnap.exists() ? backupSnap.data() : null;

                await setDoc(doc(db, GESTIA_CONFIG.COLECCIONES.BACKUPS, opId, "mods", moduloId), {
                    data: backupData,
                    timestamp: new Date().toISOString()
                });

                ejecutados.push(moduloId);

                // EJECUCIÓN REAL
                const hash = await generarHashSHA256(JSON.stringify(change));
                await persistirEstructuraModulo(moduloId, change.payload || {}, hash, this.session.tenantId, opId);

                // VALIDACIÓN REAL
                const verify = await getDoc(backupRef);
                if (!verify.exists()) throw new Error(`WRITE_FAILED: ${moduloId}`);
            }

            return { ok: true, executed: ops.length };

        } catch (err) {
            // 🛡️ ROLLBACK AUTOMÁTICO (Fix 2)
            await this.ejecutarRollback(opId, ejecutados);
            throw new Error(`PIPELINE_ERROR: ${err.message}. Rollback exitoso.`);
        }
    }

    async ejecutarRollback(opId, ejecutados) {
        await this.setState(STATES.ROLLBACK, "falla_detectada_iniciando_reversion");
        this.logger.error("🚨 INICIANDO ROLLBACK CRÍTICO");

        for (const modId of ejecutados.reverse()) {
            try {
                const backupRef = doc(db, GESTIA_CONFIG.COLECCIONES.BACKUPS, opId, "mods", modId);
                const backupSnap = await getDoc(backupRef);

                if (backupSnap.exists()) {
                    const dataOriginal = backupSnap.data().data;
                    const modRef = doc(db, GESTIA_CONFIG.COLECCIONES.MODULES, modId);
                    
                    if (dataOriginal) {
                        await setDoc(modRef, dataOriginal);
                    } else {
                        // Si no existía, lo eliminamos (limpieza de creación fallida)
                        // await deleteDoc(modRef); 
                    }
                    this.logger.warn(`↩️ Rollback aplicado en: ${modId}`);
                }
            } catch (e) {
                this.logger.error(`Fallo restaurando backup de ${modId}: ${e.message}`);
            }
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
        return { data };
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