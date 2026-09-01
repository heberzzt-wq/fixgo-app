/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - MOTOR DE INTELIGENCIA EMPRESARIAL Y CRM (BI ENGINE)
 * ======================================================================================
 * Archivo: app-bi.js
 * Versión: 1.0.9 (Ajedrez 4D: Full Profitability Audit + NOC Telemetry)
 * Autor: Heber (CEO & Lead Architect)
 * REGLAS: PROHIBICIÓN DE COMPACTACIÓN. INTEGRIDAD ABSOLUTA. REEMPLAZO DIRECTO.
 * ======================================================================================
 */

import {
    db,
    collection,
    query,
    where,
    onSnapshot,
    doc,
    orderBy,
    limit,
    actualizarGatewaysPagoB2C,
    ejecutarAccionNocB2C
} from "./firebase.js";

// 🔥 INYECCIÓN DIRECTA DEL CDN PARA FUNCIONES PESADAS 
import { getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * ======================================================================================
 * 🛠️ UTILIDADES DE SEGURIDAD Y FORMATEO SENIOR
 * ======================================================================================
 */

const escaparHTML = (str) => {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
};

// Cálculo de utilidad neta para la empresa:
// $Utilidad = \sum (MontoTotal \times FeeVigente)$
const fMoneda = (num) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num || 0);

/**
 * ======================================================================================
 * 🧠 NÚCLEO DE INICIALIZACIÓN BI (NETWORK OPERATIONS CENTER)
 * ======================================================================================
 */
export async function iniciarMotorBI(contenedorId) {
    console.log(" 🧠 [NOC] Iniciando Motor de Inteligencia Empresarial GestiaPremium (Ajedrez 4D Mode)...");
    
    // 🔥 INYECCIÓN QUIRÚRGICA: Obligar al Motor BI a esperar a que el HTML exista
    await new Promise(resolve => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', resolve);
        } else {
            resolve();
        }
    });

    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) {
        console.error("🚨 CRITICAL ERROR: No se encontró el contenedor para el Dashboard Analítico.");
        throw new Error("BI_CONTAINER_NOT_FOUND");
    }

    console.info("[BI_CONTAINER_FOUND]");

    // Estructura Maestra del NOC (Visualización Táctica Premium)
    contenedor.innerHTML = `
        <div class="bg-black border border-zinc-800 rounded-3xl p-8 shadow-2xl mb-8 animate-fade-in">
            
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-zinc-800 pb-6 gap-4">
                <div>
                    <h2 class="text-3xl font-black text-white flex items-center gap-3 tracking-tighter">
                        <img src="assets/gestiapremium-icon.svg" class="w-10 h-10 drop-shadow-[0_0_15px_rgba(59,130,246,0.7)]" alt="GestiaPremium Logo"> 
                        NOC GESTIAPREMIUM: MÓDULO BI
                    </h2>
                    <p class="text-xs text-zinc-500 uppercase tracking-[0.2em] mt-1 font-bold">Inteligencia en Tiempo Real • Algoritmos Ajedrez 4D</p>
                </div>
                <div class="flex flex-wrap items-center gap-4">
                    <div class="flex flex-col text-right mr-4 hidden lg:block">
                        <span class="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Estado del Motor</span>
                        <span class="text-emerald-500 font-black text-xs animate-pulse">SISTEMA EN LÍNEA • V5.1.0</span>
                    </div>
                    <button id="btnBackupBI" onclick="window.descargarBackupOperativo()" class="bg-red-900/20 hover:bg-red-900/80 text-red-500 hover:text-white border border-red-500/40 text-[10px] font-black px-5 py-2.5 rounded-full transition-all shadow-[0_0_20px_rgba(239,68,68,0.15)] uppercase tracking-widest flex items-center gap-2">
                        <i class="fas fa-file-csv text-sm"></i> PLAN B: EXPORTAR DATA
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10" id="biSemaforos">
                <div class="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 animate-pulse text-center">
                    <div class="w-8 h-8 bg-zinc-800 rounded-full mx-auto mb-3"></div>
                    <p class="text-xs text-zinc-500 font-bold uppercase">SLA Residencial</p>
                </div>
                <div class="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 animate-pulse text-center">
                    <div class="w-8 h-8 bg-zinc-800 rounded-full mx-auto mb-3"></div>
                    <p class="text-xs text-zinc-500 font-bold uppercase">SLA Zona Hotelera</p>
                </div>
                <div class="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 animate-pulse text-center">
                    <div class="w-8 h-8 bg-zinc-800 rounded-full mx-auto mb-3"></div>
                    <p class="text-xs text-zinc-500 font-bold uppercase">Conversión</p>
                </div>
                <div class="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 animate-pulse text-center">
                    <div class="w-8 h-8 bg-zinc-800 rounded-full mx-auto mb-3"></div>
                    <p class="text-xs text-zinc-500 font-bold uppercase">Riesgo de Fuga</p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                <div class="bg-zinc-900/30 rounded-[2rem] border border-zinc-800 p-6 flex flex-col h-[700px] shadow-inner">
                    <div class="flex justify-between items-center mb-6 border-b border-zinc-800 pb-4">
                        <h3 class="text-white font-black text-sm uppercase tracking-widest flex items-center gap-3">
                            <i class="fas fa-motorcycle text-blue-500 text-lg"></i> 
                            Monitor de Flota (Profitability)
                        </h3>
                        <button onclick="window.evaluarComisionesDinamicas()" class="bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-4 py-2 rounded-xl font-black shadow-lg shadow-blue-900/40 transition-all active:scale-95 uppercase">
                            <i class="fas fa-sync-alt mr-1"></i> Auditoría
                        </button>
                    </div>
                    <div id="biRankingFlota" class="flex-1 overflow-y-auto pr-3 custom-scrollbar space-y-4">
                        <div class="flex flex-col items-center justify-center h-full text-zinc-600 italic">
                            <i class="fas fa-satellite-dish mb-4 text-4xl opacity-20"></i>
                            <p class="text-sm tracking-widest font-bold">ESPERANDO SEÑALES DE LA FLOTA...</p>
                        </div>
                    </div>
                </div>

                <div class="flex flex-col gap-8">
                    
                    <div class="bg-zinc-900/30 rounded-[2rem] border border-zinc-800 p-6 h-[330px] flex flex-col shadow-inner">
                        <div class="flex justify-between items-center mb-5 border-b border-zinc-800 pb-3">
                            <h3 class="text-white font-black text-sm uppercase tracking-widest flex items-center gap-3">
                                <i class="fas fa-crown text-yellow-500"></i> 
                                Radar de Valor (LTV)
                            </h3>
                            <span class="text-[9px] text-zinc-500 font-bold uppercase">Top 10 Clientes</span>
                        </div>
                        <div id="biRankingClientes" class="flex-1 overflow-y-auto pr-3 custom-scrollbar space-y-3">
                            <p class="text-xs text-zinc-600 text-center py-10 font-bold tracking-widest animate-pulse">PROCESANDO HISTORIAL TRANSACCIONAL...</p>
                        </div>
                    </div>
                    
                    <div class="bg-zinc-900/30 rounded-[2rem] border border-zinc-800 p-6 flex-1 flex flex-col shadow-inner">
                        <div class="flex justify-between items-center mb-5">
                            <h3 class="text-white font-black text-sm uppercase tracking-widest flex items-center gap-3">
                                <i class="fas fa-chart-pie text-emerald-500"></i> 
                                Inteligencia Comercial
                            </h3>
                            <div id="stripeHealthIndicator" class="flex items-center gap-2 bg-black/50 px-3 py-1.5 rounded-full border border-zinc-800">
                                <span class="w-2 h-2 rounded-full bg-zinc-700 shadow-[0_0_10px_rgba(113,113,122,0.5)]"></span> 
                                <span class="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Stripe: IDLE</span>
                            </div>
                        </div>
                        <div id="biMétricasComerciales" class="grid grid-cols-2 gap-4 mb-6">
                            </div>
                        <div id="biStripeMonitor" class="bg-black/60 border border-zinc-800 rounded-2xl p-4 mt-auto shadow-2xl">
                            <h4 class="text-[9px] text-zinc-500 font-black uppercase mb-3 flex justify-between items-center tracking-widest">
                                Live Transaction Feed
                                <i class="fab fa-stripe text-lg text-[#635BFF]"></i>
                            </h4>
                            <div id="biStripeFeed" class="text-[10px] text-zinc-400 font-mono space-y-2 h-[80px] overflow-hidden">
                                <span class="animate-pulse text-zinc-700">Esperando señal de pago encriptada...</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="bg-zinc-900/20 rounded-[2.5rem] border border-emerald-900/40 p-8 mt-10 shadow-[0_0_30px_rgba(16,185,129,0.05)]">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-zinc-800 pb-4 gap-4">
                    <div>
                        <h3 class="text-white font-black text-lg uppercase tracking-tight flex items-center gap-3">
                            <i class="fas fa-toggle-on text-emerald-400"></i> 
                            Feature Flags: Gateways de Pago
                        </h3>
                        <p class="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Control maestro de flujo de caja en la aplicación del cliente</p>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    <div class="bg-black p-6 rounded-3xl border border-zinc-800 flex justify-between items-center transition-all" id="cardGatewayStripe">
                        <div class="flex items-center gap-4">
                            <div class="bg-[#635BFF]/20 p-4 rounded-xl text-[#635BFF]"><i class="fab fa-stripe-s text-2xl"></i></div>
                            <div>
                                <p class="text-white font-black uppercase tracking-widest">Motor Stripe</p>
                                <p class="text-[10px] text-zinc-500 font-bold mt-1">Tarjetas y Retenciones</p>
                                <p id="gatewayStripeStatus" class="text-[9px] text-zinc-500 font-black mt-2">Global: CARGANDO</p>
                                <p id="gatewayStripeAudit" class="text-[8px] text-zinc-600 mt-1">Auditoría: pendiente</p>
                            </div>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="toggleStripeGW" class="sr-only peer" onchange="window.toggleGateway('stripe_activo', this.checked)">
                            <div class="w-14 h-7 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-300 after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[#635BFF]"></div>
                        </label>
                    </div>
                    
                    <div class="bg-black p-6 rounded-3xl border border-zinc-800 flex justify-between items-center transition-all" id="cardGatewayEfectivo">
                        <div class="flex items-center gap-4">
                            <div class="bg-emerald-500/20 p-4 rounded-xl text-emerald-500"><i class="fas fa-hand-holding-usd text-2xl"></i></div>
                            <div>
                                <p class="text-white font-black uppercase tracking-widest">Modo Bootstrapping</p>
                                <p class="text-[10px] text-zinc-500 font-bold mt-1">Pago 100% en Domicilio</p>
                                <p id="gatewayEfectivoStatus" class="text-[9px] text-zinc-500 font-black mt-2">Global: CARGANDO</p>
                                <p id="gatewayEfectivoAudit" class="text-[8px] text-zinc-600 mt-1">Auditoría: pendiente</p>
                            </div>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="toggleEfectivoGW" class="sr-only peer" onchange="window.toggleGateway('efectivo_activo', this.checked)">
                            <div class="w-14 h-7 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-300 after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                    </div>
                </div>
            </div>

            <div class="bg-zinc-900/20 rounded-[2.5rem] border border-blue-900/40 p-8 mt-10 shadow-[0_0_30px_rgba(59,130,246,0.05)]">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-zinc-800 pb-4 gap-4">
                    <div>
                        <h3 class="text-white font-black text-lg uppercase tracking-tight flex items-center gap-3">
                            <i class="fas fa-money-bill-wave text-blue-400"></i> 
                            Estado de Autoridad B2C
                        </h3>
                        <p class="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Lectura del método y payment_authority canónicos; sin overrides del navegador</p>
                    </div>
                    <span class="bg-blue-900/30 text-blue-400 border border-blue-500/30 text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-tighter shadow-lg">
                        Monitor sin bypass
                    </span>
                </div>
                <div id="biTicketsEfectivo" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
                    <div class="col-span-full py-16 text-center">
                        <i class="fas fa-shield-alt text-4xl text-zinc-800 mb-4 block"></i>
                        <p class="text-zinc-600 text-xs font-black uppercase tracking-widest">Sin solicitudes de autorización pendientes</p>
                    </div>
                </div>
            </div>

        </div>
    `;

    console.info("[BI_HTML_RENDERED]");
    const subsystems = [
        ["telemetry", iniciarEscuchaTelemetria],
        ["fleet", iniciarEscuchaFlota],
        ["gateways", iniciarEscuchaGateways]
    ].map(async ([name, start]) => {
        try {
            return { name, ok: true, value: await start() };
        } catch (error) {
            console.error(`[BI_${String(name).toUpperCase()}_FAILED]`, error);
            return { name, ok: false, error };
        }
    });
    const results = await Promise.all(subsystems);
    console.info("[BI_LISTENERS_READY]", results.map(({ name, ok }) => ({ name, ok })));
    console.info("[BI_DONE]");
    return { ok: results.every(result => result.ok), modules: results };
}

function renderBiError(targetId, message) {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.innerHTML = `<div class="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-xs font-bold text-red-300">${escaparHTML(message)}</div>`;
}

function subscribeBi(name, sourceFactory, onData, onFailure) {
    const fail = (error) => {
        console.error(`[BI_${name.toUpperCase()}_LISTENER_FAILED]`, error);
        onFailure?.(error);
    };
    try {
        return onSnapshot(sourceFactory(), onData, fail);
    } catch (error) {
        fail(error);
        return () => {};
    }
}

/**
 * ======================================================================================
 * 📡 WATCHDOGS: LISTENERS EN TIEMPO REAL
 * ======================================================================================
 */
function iniciarEscuchaTelemetria() {
    let dataServicios = [];

    const unsubscribeServices = subscribeBi("services", () => (
        query(collection(db, "services"), orderBy("created_at", "desc"), limit(250))
    ), (snap) => {
        dataServicios = [];
        snap.forEach(doc => dataServicios.push({ id: doc.id, ...doc.data() }));
        procesarSemaforosOperativos(dataServicios);
        renderizarControlEfectivo(dataServicios); 
    }, () => {
        renderBiError("biSemaforos", "No fue posible cargar servicios. Verifica reglas o índices de Firestore.");
        renderBiError("biTicketsEfectivo", "No fue posible cargar la autoridad de servicios B2C.");
    });

    const unsubscribeTransactions = subscribeBi("transactions", () => (
        query(collection(db, "transacciones"), orderBy("fecha", "desc"), limit(100))
    ), (snap) => {
        let transaccionesIngreso = [];
        let transaccionesStripeFeed = [];

        snap.forEach(doc => {
            const t = { id: doc.id, ...doc.data() };
            if (t.tipo === "ingreso_servicio") {
                transaccionesIngreso.push(t);
            }
            if (t.metodo === "stripe") {
                transaccionesStripeFeed.push(t);
            }
        });

        procesarMotorComercialLTV(transaccionesIngreso, dataServicios);
        actualizarMonitorStripe(transaccionesStripeFeed);
    }, () => {
        renderBiError("biRankingClientes", "No fue posible cargar Radar LTV.");
        renderBiError("biStripeFeed", "No fue posible cargar el flujo transaccional.");
    });
    return () => {
        unsubscribeServices();
        unsubscribeTransactions();
    };
}

function iniciarEscuchaFlota() {
    let technicians = [];
    let transactions = [];
    const render = () => {
        const profitMap = {};
        const volumeMap = {};
        const countMap = {};
        transactions.forEach(tx => {
            if (tx.tecnico_id) {
                profitMap[tx.tecnico_id] = (profitMap[tx.tecnico_id] || 0) + (tx.comision_fixgo || 0);
                volumeMap[tx.tecnico_id] = (volumeMap[tx.tecnico_id] || 0) + (tx.monto_total || 0);
                countMap[tx.tecnico_id] = (countMap[tx.tecnico_id] || 0) + 1;
            }
        });
        procesarRankingYDisciplina(technicians.map(technician => ({
                    ...technician,
                    generated_profit: profitMap[technician.id] || 0,
                    total_volume: volumeMap[technician.id] || 0,
                    real_count: countMap[technician.id] || 0
                })));
    };

    const unsubscribeTransactions = subscribeBi("fleet_profit", () => (
        query(collection(db, "transacciones"), where("tipo", "==", "ingreso_servicio"))
    ), (snap) => {
        transactions = snap.docs.map(document => ({ id: document.id, ...document.data() }));
        render();
    }, () => renderBiError("biRankingTecnicos", "No fue posible calcular la rentabilidad de flota."));

    const unsubscribeTechnicians = subscribeBi("fleet_users", () => (
        query(collection(db, "users"), where("rol", "==", "tecnico"))
    ), (snap) => {
        technicians = snap.docs.map(document => ({
                    id: document.id,
                    ...document.data()
                }));
        render();
    }, () => renderBiError("biRankingTecnicos", "No fue posible cargar la flota técnica."));

    return () => {
        unsubscribeTransactions();
        unsubscribeTechnicians();
    };
}

// 🔥 INYECCIÓN: Lector de Switches de Gateways de Pago
function iniciarEscuchaGateways() {
    return subscribeBi("gateways", () => doc(db, "configuracion", "pagos"), (docSnap) => {
        const cbStripe = document.getElementById("toggleStripeGW");
        const cbEfectivo = document.getElementById("toggleEfectivoGW");
        const cardStripe = document.getElementById("cardGatewayStripe");
        const cardEfectivo = document.getElementById("cardGatewayEfectivo");
        const statusStripe = document.getElementById("gatewayStripeStatus");
        const statusEfectivo = document.getElementById("gatewayEfectivoStatus");
        const auditStripe = document.getElementById("gatewayStripeAudit");
        const auditEfectivo = document.getElementById("gatewayEfectivoAudit");

        const data = docSnap.exists() ? docSnap.data() : {};
        const stripeActive = data.stripe_activo === true;
        const cashActive = data.efectivo_activo === true;
        if(cbStripe) cbStripe.checked = stripeActive;
        if(cbEfectivo) cbEfectivo.checked = cashActive;
        if(statusStripe) statusStripe.textContent = `Global: ${stripeActive ? "ACTIVO" : "INACTIVO"}`;
        if(statusEfectivo) statusEfectivo.textContent = `Global: ${cashActive ? "ACTIVO" : "INACTIVO"}`;
        const updatedAt = data.actualizado_at?.toDate?.();
        const auditText = updatedAt
            ? `${updatedAt.toLocaleString("es-MX", { timeZone: "America/Cancun" })} • ${data.actualizado_por || "backend"}`
            : "sin timestamp administrativo";
        if(auditStripe) auditStripe.textContent = `Auditoría: ${auditText}`;
        if(auditEfectivo) auditEfectivo.textContent = `Auditoría: ${auditText}`;
            
        if(cardStripe) {
            if(stripeActive) cardStripe.classList.replace("border-zinc-800", "border-[#635BFF]/50");
            else cardStripe.classList.replace("border-[#635BFF]/50", "border-zinc-800");
        }
        if(cardEfectivo) {
            if(cashActive) cardEfectivo.classList.replace("border-zinc-800", "border-emerald-500/50");
            else cardEfectivo.classList.replace("border-emerald-500/50", "border-zinc-800");
        }
    }, () => {
        const statusStripe = document.getElementById("gatewayStripeStatus");
        const statusEfectivo = document.getElementById("gatewayEfectivoStatus");
        if (statusStripe) statusStripe.textContent = "Global: ERROR DE LECTURA";
        if (statusEfectivo) statusEfectivo.textContent = "Global: ERROR DE LECTURA";
    });
}

window.toggleGateway = async (campo, estado) => {
    const cbStripe = document.getElementById("toggleStripeGW");
    const cbEfectivo = document.getElementById("toggleEfectivoGW");
    const previous = !estado;
    if (cbStripe) cbStripe.disabled = true;
    if (cbEfectivo) cbEfectivo.disabled = true;
    try {
        const stripe = campo === "stripe_activo" ? estado : cbStripe?.checked === true;
        const efectivo = campo === "efectivo_activo" ? estado : cbEfectivo?.checked === true;
        await actualizarGatewaysPagoB2C(stripe, efectivo);
        console.log(`✅ Gateway ${campo} actualizado a: ${estado}`);
    } catch (error) {
        if (campo === "stripe_activo" && cbStripe) cbStripe.checked = previous;
        if (campo === "efectivo_activo" && cbEfectivo) cbEfectivo.checked = previous;
        console.error("Error al actualizar Gateway:", error);
        alert("No fue posible actualizar los gateways mediante la autoridad administrativa.");
    } finally {
        if (cbStripe) cbStripe.disabled = false;
        if (cbEfectivo) cbEfectivo.disabled = false;
    }
};

/**
 * ======================================================================================
 * 🚦 1. PROCESADOR DE SEMÁFOROS OPERATIVOS (SLA)
 * ======================================================================================
 */
function actualizarMonitorStripe(transacciones) {
    const feed = document.getElementById("biStripeFeed");
    const health = document.getElementById("stripeHealthIndicator");
    if (!feed || !health) return;

    const stripeTx = transacciones.slice(0, 4);

    if (stripeTx.length > 0) {
        health.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span> <span class="text-emerald-500 font-black tracking-widest text-[9px]">STRIPE LIVE: ACTIVA</span>`;
        feed.innerHTML = stripeTx.map(t => {
            const hora = t.fecha ? t.fecha.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Justo ahora';
            const etiqueta = t.tipo === "webhook_feed" ? "WEBHOOK" : "SETTLEMENT";
            return `
                <div class="flex justify-between items-center border-b border-zinc-900 pb-2 mb-2 hover:bg-zinc-800/20 transition-all px-1">
                    <span class="text-emerald-400 font-black">${fMoneda(t.monto_total)}</span>
                    <span class="text-[8px] text-zinc-500 font-bold uppercase tracking-tight">${hora} • ${etiqueta}</span>
                    <span class="text-[7px] bg-emerald-900/30 px-2 py-0.5 rounded-full text-emerald-400 border border-emerald-500/20 shadow-md font-black">SUCCESS</span>
                </div>
            `;
        }).join('');
    } else {
        health.innerHTML = `<span class="w-2 h-2 rounded-full bg-zinc-700"></span> <span class="text-zinc-500 font-black tracking-widest text-[9px]">STRIPE: IDLE</span>`;
    }
}

function procesarSemaforosOperativos(servicios) {
    const contenedor = document.getElementById("biSemaforos");
    if (!contenedor) return;

    let totalAsignados = 0;
    let totalCotizados = 0;
    let cotizacionesAprobadas = 0;
    let posiblesFugas = 0;
    
    let llegadaZH = { sum: 0, count: 0 };
    let llegadaGen = { sum: 0, count: 0 };

    servicios.forEach(srv => {
        // Lógica de SLA de llegada
        if (srv.asignado_at && srv.cotizado_at) {
            const tAsig = srv.asignado_at.toDate();
            const tCot = srv.cotizado_at.toDate();
            const diffMinutos = Math.abs(tCot - tAsig) / 60000;
            
            if (diffMinutos > 0 && diffMinutos < 240) { // Filtro de promedios coherentes
                totalAsignados++;
                const zonaLower = (srv.zona || "").toLowerCase();
                if (zonaLower.includes("hotelera") || zonaLower.includes("puerto cancun")) {
                    llegadaZH.sum += diffMinutos;
                    llegadaZH.count++;
                } else {
                    llegadaGen.sum += diffMinutos;
                    llegadaGen.count++;
                }
            }
        }

        // Tasa de Cierre Operativa
        if (srv.estado === "finalizado") {
            totalCotizados++;
            cotizacionesAprobadas++;
        }
        if (srv.estado === "cancelado" && srv.cancelado_razon === "Cliente rechazó cotización") {
            totalCotizados++;
        }

        // Detector de Fugas (Cancelación tras cotizar o llegar)
        if (srv.estado === "cancelado" && srv.cotizado_at && srv.tecnico_id) {
            posiblesFugas++;
        }
    });

    const promGen = llegadaGen.count > 0 ? (llegadaGen.sum / llegadaGen.count) : 0;
    const promZH = llegadaZH.count > 0 ? (llegadaZH.sum / llegadaZH.count) : 0;
    const tasaCierre = totalCotizados > 0 ? ((cotizacionesAprobadas / totalCotizados) * 100).toFixed(1) : 0;
     /* FIXGO_SAFE_EDIT_START */
    const renderCard = (titulo, valor, unidad, evalColor) => {
        let border = "border-zinc-800 text-white";
        let icon = "fa-check-circle text-zinc-700";
        let bg = "bg-zinc-900/50";
        let glow = "";

        if (evalColor === "rojo") { border = "border-red-600 text-red-500"; icon = "fa-exclamation-triangle animate-pulse"; bg = "bg-red-900/10"; glow = "shadow-[0_0_20px_rgba(220,38,38,0.1)]"; }
        if (evalColor === "amarillo") { border = "border-yellow-600 text-yellow-500"; icon = "fa-exclamation-circle"; bg = "bg-yellow-900/10"; }
        if (evalColor === "verde") { border = "border-emerald-600 text-emerald-400"; icon = "fa-check-double"; bg = "bg-emerald-900/10"; }

        return `
       
            <div class="${bg} p-6 rounded-2xl border ${border} transition-all ${glow} flex flex-col justify-between h-[120px]">
                <div class="flex justify-between items-start">
                    <h4 class="text-[9px] font-black uppercase tracking-widest text-zinc-500">${titulo}</h4>
                    <i class="fas ${icon} text-lg"></i>
                </div>
                <div class="flex items-end gap-1">
                    <span class="text-4xl font-black">${valor}</span>
                    <span class="text-[10px] mb-2 text-zinc-500 font-black uppercase tracking-tighter">${unidad}</span>
                </div>
            </div>
        `;
    };
     /* FIXGO_SAFE_EDIT_END */
    contenedor.innerHTML = `
        ${renderCard("SLA RESIDENCIAL", promGen.toFixed(0), "min", promGen <= 30 ? "verde" : (promGen <= 45 ? "amarillo" : "rojo"))}
        ${renderCard("SLA ZONA HOTELERA", promZH.toFixed(0), "min", promZH <= 45 ? "verde" : (promZH <= 60 ? "amarillo" : "rojo"))}
        ${renderCard("CONVERSIÓN CIERRE", tasaCierre, "%", tasaCierre >= 80 ? "verde" : (tasaCierre >= 60 ? "amarillo" : "rojo"))}
        ${renderCard("AUDITORÍA DE FUGAS", posiblesFugas, "casos", posiblesFugas === 0 ? "verde" : (posiblesFugas <= 2 ? "amarillo" : "rojo"))}
    `;
}

/**
 * ======================================================================================
 * 🏆 2. RANKING DE FLOTA Y MOTOR DISCIPLINARIO (AJEDREZ 4D FULL)
 * ======================================================================================
 */
function procesarRankingYDisciplina(tecnicos) {
    const contenedor = document.getElementById("biRankingFlota");
    if (!contenedor) return;

    const tecnicosOrdenados = tecnicos.sort((a, b) => b.generated_profit - a.generated_profit);

    let html = "";
    tecnicosOrdenados.forEach((t) => {
        const strikes = t.strikes || 0;
        const nivel = (t.nivel || "BRONCE").toUpperCase();
        const comision = t.comision_asignada ? (t.comision_asignada * 100).toFixed(0) + "%" : "30%";
        const suspendido = ["suspendido", "suspendido_grave", "baneado_permanente"].includes(t.estado);
        
        let colorStrike = strikes === 0 ? "text-emerald-500" : (strikes === 1 ? "text-yellow-500" : "text-red-500");
        let iconNivel = nivel === "ORO" ? "fa-crown text-yellow-400 shadow-yellow-500/50" : (nivel === "PLATA" ? "fa-medal text-zinc-300" : "fa-medal text-orange-600");

        html += `
            <div class="flex flex-col bg-black p-5 rounded-3xl border ${suspendido ? 'border-red-900/50 opacity-60 shadow-none' : 'border-zinc-800 shadow-2xl hover:border-zinc-600'} mb-4 transition-all">
                
                <div class="flex justify-between items-center mb-4">
                    <div class="flex items-center gap-4">
                        <div class="relative group">
                            <img src="${t.foto_perfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.nombre)}&background=random`}" class="w-12 h-12 rounded-full border-2 border-zinc-800 object-cover shadow-lg transition-transform group-hover:scale-105">
                            ${!suspendido && t.disponible ? '<span class="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-[3px] border-black rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span>' : ''}
                        </div>
                        <div>
                            <p class="text-white font-black text-sm uppercase tracking-tight leading-none mb-1">${escaparHTML(t.nombre)}</p>
                            <div class="flex items-center gap-2 text-[10px] font-black uppercase">
                                <span class="text-blue-500 flex items-center gap-1"><i class="fas ${iconNivel}"></i> ${nivel}</span>
                                <span class="text-zinc-700">•</span>
                                <span class="text-zinc-400">FEE: ${comision}</span>
                                <span class="text-zinc-700">•</span>
                                <span class="${colorStrike}">STRIKES: ${strikes}/3</span>
                            </div>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-emerald-400 font-black text-base leading-none">${fMoneda(t.generated_profit)}</p>
                        <p class="text-[7px] text-zinc-600 uppercase font-black tracking-widest mt-1">Utilidad Neta FixGo</p>
                    </div>
                </div>

                <div class="grid grid-cols-3 gap-3 mb-5">
                    <div class="bg-zinc-900/50 p-3 rounded-2xl border border-zinc-800/50">
                        <p class="text-[7px] text-zinc-500 uppercase font-black tracking-tighter mb-1">GTV Acumulado</p>
                        <p class="text-[11px] text-white font-black font-mono">${fMoneda(t.total_volume)}</p>
                    </div>
                    <div class="bg-zinc-900/50 p-3 rounded-2xl border border-zinc-800/50">
                        <p class="text-[7px] text-zinc-500 uppercase font-black tracking-tighter mb-1">Servicios Pagados</p>
                        <p class="text-[11px] text-white font-black">${t.real_count || 0} Tx</p>
                    </div>
                    <div class="bg-zinc-900/50 p-3 rounded-2xl border border-zinc-800/50">
                        <p class="text-[7px] text-zinc-500 uppercase font-black tracking-tighter mb-1">Reputación</p>
                        <p class="text-[11px] text-yellow-500 font-black">⭐ ${(t.reputacion || 5).toFixed(1)}</p>
                    </div>
                </div>

                ${!suspendido ? `
                <div class="flex gap-2 pt-4 border-t border-zinc-800/50">
                    <button onclick="window.aplicarStrike('${t.id}', 1, '${escaparHTML(t.nombre)}')" class="flex-1 bg-yellow-900/10 hover:bg-yellow-900/40 text-yellow-600 text-[8px] py-2.5 rounded-xl font-black border border-yellow-600/20 transition-all uppercase tracking-widest active:scale-95 shadow-lg">Strike 1 (24H)</button>
                    <button onclick="window.aplicarStrike('${t.id}', 2, '${escaparHTML(t.nombre)}')" class="flex-1 bg-orange-900/10 hover:bg-orange-900/40 text-orange-600 text-[8px] py-2.5 rounded-xl font-black border border-orange-600/20 transition-all uppercase tracking-widest active:scale-95 shadow-lg">Strike 2 (7D)</button>
                    <button onclick="window.aplicarStrike('${t.id}', 3, '${escaparHTML(t.nombre)}')" class="flex-1 bg-red-900/30 hover:bg-red-600 text-white text-[8px] py-2.5 rounded-xl font-black border border-red-500/30 transition-all uppercase tracking-widest active:scale-95 shadow-lg">BAN TOTAL</button>
                </div>
                ` : `
                <div class="mt-2 pt-3 border-t border-red-900/50 text-center flex justify-between items-center bg-red-900/10 p-3 rounded-2xl border border-red-500/20">
                    <span class="text-red-500 text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                        <i class="fas fa-user-slash animate-pulse"></i> TERMINAL BLOQUEADA: ${t.estado.toUpperCase()}
                    </span>
                    <button onclick="window.levantarCastigo('${t.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black px-4 py-2 rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]">RESTAURAR ACCESO</button>
                </div>
                `}
            </div>
        `;
    });

    contenedor.innerHTML = html || '<div class="flex flex-col items-center justify-center h-full text-zinc-700 py-20"><i class="fas fa-radar text-4xl mb-4 opacity-20"></i><p class="font-black text-xs uppercase tracking-widest">Sincronizando con la red de servicios...</p></div>';
}

/**
 * ======================================================================================
 * 🐋 3. MOTOR COMERCIAL VIP (LTV & CHURN RISK MANAGEMENT)
 * ======================================================================================
 */
function procesarMotorComercialLTV(transacciones, servicios) {
    const contClientes = document.getElementById("biRankingClientes");
    const contMétricas = document.getElementById("biMétricasComerciales");
    if (!contClientes || !contMétricas) return;

    let clientesHash = {}; 
    let verticalHash = {};

    transacciones.forEach(tx => {
        const srv = servicios.find(s => s.id === tx.servicio_id);
        if (srv && srv.cliente_id) {
            const cid = srv.cliente_id;
            const vert = srv.categoria || "GRAL";
            
            if(!clientesHash[cid]) {
                clientesHash[cid] = { nombre: srv.cliente_nombre, telf: srv.cliente_telefono, gtv: 0, ltv: 0, count: 0, last: 0 };
            }
            clientesHash[cid].gtv += (tx.monto_total || 0);
            clientesHash[cid].ltv += (tx.comision_fixgo || 0); 
            clientesHash[cid].count++;
            
            if (srv.created_at) {
                const ms = srv.created_at.seconds * 1000;
                if(ms > clientesHash[cid].last) clientesHash[cid].last = ms;
            }

            if(!verticalHash[vert]) verticalHash[vert] = { rev: 0, count: 0 };
            verticalHash[vert].rev += (tx.comision_fixgo || 0);
            verticalHash[vert].count++;
        }
    });

    const arrayVips = Object.values(clientesHash).sort((a, b) => b.gtv - a.gtv).slice(0, 10);
    let htmlVIP = "";
    const ahora = Date.now();

    arrayVips.forEach((c, idx) => {
        const diasInactivo = c.last > 0 ? Math.floor((ahora - c.last) / 86400000) : 0;
        let badgeRiesgo = diasInactivo > 45 ? `<span class="bg-red-900/50 text-red-500 text-[8px] px-3 py-0.5 rounded-full ml-2 border border-red-500/20 font-black uppercase animate-pulse shadow-sm">⚠️ RIESGO CHURN</span>` : "";

        htmlVIP += `
            <div class="flex justify-between items-center bg-black p-4 rounded-2xl border border-zinc-800 mb-3 hover:bg-zinc-900 transition-all group cursor-default">
                <div class="flex items-center gap-4">
                    <span class="text-zinc-800 font-black text-xs w-5 text-center group-hover:text-blue-600 transition-colors">#${idx + 1}</span>
                    <div>
                        <p class="text-white font-black text-xs uppercase tracking-tight">${escaparHTML(c.nombre)} ${badgeRiesgo}</p>
                        <p class="text-[9px] text-zinc-500 font-mono font-bold mt-1 tracking-tight">${c.count} TX • LTV NETO EMPRESA: <span class="text-emerald-500">${fMoneda(c.ltv)}</span></p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-emerald-400 font-black text-sm tracking-tighter">${fMoneda(c.gtv)}</p>
                    <p class="text-[7px] text-zinc-600 uppercase font-black tracking-widest mt-0.5">GTV Total</p>
                </div>
            </div>
        `;
    });
    contClientes.innerHTML = htmlVIP || '<p class="text-zinc-600 text-xs text-center py-10 font-black uppercase tracking-widest">Iniciando auditoría comercial...</p>';

    const arrayVert = Object.entries(verticalHash).map(([k, v]) => ({ n: k, ...v })).sort((a,b) => b.rev - a.rev);
    contMétricas.innerHTML = arrayVert.map(v => `
        <div class="bg-black p-4 rounded-2xl border border-zinc-800 hover:border-emerald-500/40 transition-all group h-[85px] flex flex-col justify-between">
            <p class="text-white font-black text-[10px] uppercase truncate tracking-[0.1em] border-b border-zinc-900 pb-2 mb-2">${escaparHTML(v.n)}</p>
            <div class="flex justify-between items-end">
                <div class="flex flex-col">
                    <span class="text-[12px] text-zinc-400 font-black leading-none">${v.count}</span>
                    <span class="text-[7px] text-zinc-600 uppercase font-black tracking-tighter">Tickets</span>
                </div>
                <div class="text-right">
                    <span class="text-emerald-500 font-black text-sm leading-none">${fMoneda(v.rev)}</span>
                    <p class="text-[7px] text-zinc-700 uppercase font-black mt-1">Utility</p>
                </div>
            </div>
        </div>
    `).join('') || '<p class="text-zinc-600 text-xs text-center py-5 col-span-full uppercase font-black opacity-30">Cargando Mix de Revenue...</p>';
}

/**
 * ======================================================================================
 * 💵 4. PROTOCOLOS DE EXCEPCIÓN Y ACCIONES (WINDOW SCOPE)
 * ======================================================================================
 */
function renderizarControlEfectivo(servicios) {
    const contenedor = document.getElementById("biTicketsEfectivo");
    if (!contenedor) return;

    const vivos = servicios.filter(s => ['buscando_tecnico', 'asignado', 'en_camino', 'cotizando', 'trabajando', 'pago_pendiente'].includes(s.estado));

    if (vivos.length === 0) {
        contenedor.innerHTML = `
            <div class="col-span-full py-16 text-center">
                <div class="bg-zinc-900/30 border border-zinc-800/50 rounded-3xl p-10">
                    <i class="fas fa-check-double text-4xl text-zinc-800 mb-4 block opacity-30"></i>
                    <p class="text-zinc-600 text-xs font-black uppercase tracking-[0.3em]">No hay servicios B2C activos que auditar</p>
                </div>
            </div>`;
        return;
    }

    contenedor.innerHTML = vivos.map(s => {
        const authority = s.payment_authority && typeof s.payment_authority === "object"
            ? s.payment_authority
            : {};
        const effective = authority.effective === true;
        const method = String(s.metodo_pago || "sin_metodo").toUpperCase();
        return `
            <div class="bg-black p-5 rounded-[2rem] border ${effective ? 'border-emerald-500/50 shadow-2xl shadow-emerald-900/10' : 'border-amber-500/40'} flex flex-col justify-between transition-all">
                <div class="mb-4">
                    <div class="flex justify-between items-start mb-2">
                        <p class="text-white font-black text-sm uppercase tracking-tight leading-none mb-1"><i class="fas fa-user text-blue-500 text-[10px] mr-2"></i> ${escaparHTML(s.cliente_nombre || 'S/N')}</p>
                        <span class="bg-zinc-800 text-zinc-400 text-[8px] px-3 py-1 rounded-full font-black uppercase tracking-[0.1em] border border-zinc-700">${s.estado.replace('_', ' ')}</span>
                    </div>
                    <p class="text-[10px] text-zinc-500 font-mono font-bold mt-1 overflow-hidden truncate">ID: ${s.id.toUpperCase()}</p>
                    <p class="text-[9px] text-zinc-600 font-black uppercase mt-1 tracking-widest italic">${escaparHTML(s.categoria || 'Gral')}</p>
                </div>
                
                <div class="pt-5 border-t border-zinc-800/50">
                    <div class="${effective ? 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30' : 'text-amber-300 bg-amber-950/20 border-amber-500/30'} text-[10px] font-black px-4 py-4 rounded-2xl border shadow-inner space-y-1">
                        <p>Método: ${escaparHTML(method)}</p>
                        <p>Global: ${authority.global_enabled === true ? 'ACTIVO' : 'INACTIVO'}</p>
                        <p>Cliente: ${authority.individual_authorized === true ? 'AUTORIZADO' : 'NO AUTORIZADO'}</p>
                        <p>Resultado: ${effective ? 'DISPONIBLE' : 'BLOQUEADO'}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * ======================================================================================
 * ⚡ DISPARADORES DE ACCIÓN Y SEGURIDAD
 * ======================================================================================
 */
window.aplicarStrike = async (uid, nivel, nombre) => {
    const sanciones = {
        1: { msg: "STRIKE 1: Suspensión 24h + Retención $200 MXN", estado: "suspendido", multa: 200, label: "ADVERTENCIA TIPO 1" },
        2: { msg: "STRIKE 2: Suspensión 7 DÍAS + Retención $500 MXN", estado: "suspendido_grave", multa: 500, label: "BLOQUEO TIPO 2" },
        3: { msg: "🚨 BAN PERMANENTE 🚨: Expulsión Total + Congelación $1000 MXN", estado: "baneado_permanente", multa: 1000, label: "TERMINACIÓN DE CONTRATO" }
    };

    const s = sanciones[nivel];
    if (!confirm(`⚠️ PROTOCOLO DISCIPLINARIO NOC\n\n¿Estás 100% seguro de aplicar el ${s.msg} al técnico ${nombre}?\n\nEsta acción es auditable e irreversible en el historial del trabajador.`)) return;

    try {
        await ejecutarAccionNocB2C({ action: "apply_strike", technicianId: uid, strikeLevel: nivel });

        alert(`✅ SANCIONADOR EJECUTADO: ${nombre} ha sido desconectado. Estado: ${s.estado.toUpperCase()}.`);
    } catch (e) { 
        console.error("🚨 NOC ERROR:", e); 
        alert("❌ ERROR CRÍTICO: Falló la ejecución de la sanción."); 
    }
};

window.levantarCastigo = async (uid) => {
    if(!confirm("🔓 ¿Solicitar restauración de terminal a estatus ACTIVO?\n\n(Nota: Los strikes anteriores permanecerán en el expediente como historial de riesgo)")) return;
    try {
        await ejecutarAccionNocB2C({ action: "restore_technician", technicianId: uid });
        alert("✅ OPERACIÓN EXITOSA: Terminal restaurada y sincronizada.");
    } catch(e) { alert("Error de comunicación con Firebase."); }
};

/**
 * ======================================================================================
 * 🤖 ALGORITMO DE GAMIFICACIÓN (AJEDREZ 4D - AUDITORÍA MENSUAL)
 * ======================================================================================
 */
window.evaluarComisionesDinamicas = async () => {
    if(!confirm("🤖 INICIANDO MOTOR DE GAMIFICACIÓN AJEDREZ 4D\n\nEste proceso ejecutará un escaneo masivo de la flota para reasignar beneficios económicos:\n\n- ORO: 24% GP Fee (Elite)\n- PLATA: 27% GP Fee (Senior)\n- BRONCE: 30% GP Fee (Junior/Riesgo)\n\n¿Proceder con el recalculo de rentabilidad?")) return;
    
    try {
        const result = await ejecutarAccionNocB2C({ action: "recalculate_commissions" });
        alert(`✅ AUDITORÍA DE CICLO FINALIZADA\n\n- Promovidos: ${result.promoted}\n- Degradados: ${result.demoted}\n- Sin cambios: ${result.stable}\n\nLos cambios fueron aplicados por backend autoritativo.`);
    } catch(e) { console.error("🚨 MOTOR ERROR:", e); alert("❌ FALLO CRÍTICO: El algoritmo de comisiones falló."); }
};

/**
 * ======================================================================================
 * 🛡️ PROTOCOLO DE CONTINGENCIA (BACKUP CSV MAESTRO)
 * ======================================================================================
 */
window.descargarBackupOperativo = async () => {
    if(!confirm("⚠️ PROTOCOLO DE CONTINGENCIA ACTIVADO (PLAN B) ⚠️\n\n¿Exportar toda la base de datos maestra para operación fuera de línea vía WhatsApp?\n\nEsta acción descarga:\n- Directorio de Técnicos\n- Cartera de Clientes\n- Estados de Cuenta")) return;
    
    try {
        const snap = await getDocs(query(collection(db, "users")));
        let csv = "Rol,Nombre,Telefono,Email,Estado,Nivel,FEE_GP,Info_Logistica\n";

        snap.forEach(d => {
            const u = d.data();
            const n = escaparHTML(u.nombre || "S/N").replace(/,/g, " "); 
            const r = (u.rol || "N/D").toUpperCase();
            const t = u.telefono || "N/D";
            const m = u.email || "N/D";
            const e = (u.estado || "activo").toUpperCase();
            const niv = (u.nivel || "BRONCE").toUpperCase();
            const fee = u.comision_asignada ? (u.comision_asignada * 100) + "%" : "30%";
            const log = u.vehiculo ? `${u.vehiculo.tipo}-${u.vehiculo.placas}` : "Peatonal";
            
            csv += `${r},"${n}","${t}","${m}",${e},${niv},${fee},"${log}"\n`;
        });

        const fecha = new Date().toISOString().split('T')[0];
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI("data:text/csv;charset=utf-8," + csv));
        link.setAttribute("download", `GestiaPremium_MASTER_BACKUP_${fecha}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        alert(`✅ OPERACIÓN EXITOSA: Backup Maestro generado. Guárdalo en un lugar seguro.`);
    } catch(e) { console.error("🚨 BACKUP FAIL:", e); alert("❌ ERROR: No se pudo extraer la base de datos."); }
};
