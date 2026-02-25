/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - MOTOR DE INTELIGENCIA EMPRESARIAL Y CRM (BI ENGINE)
 * ======================================================================================
 * Archivo: app-bi.js
 * Versión: 1.0.6 (Integración Stripe Live Feed Desbloqueado + Facturación)
 * Autor: Heber (CEO & Lead Architect)
 * ======================================================================================
 */

import {
    db,
    collection,
    query,
    where,
    onSnapshot,
    doc,
    updateDoc,
    serverTimestamp,
    addDoc,
    orderBy,
    limit // Añadido límite para rendimiento
} from "./firebase.js";

// 🔥 INYECCIÓN DIRECTA DEL CDN PARA FUNCIONES PESADAS (Igual que en app-panel.js)
import { getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Utilidad de escape XSS
const escaparHTML = (str) => {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
};

// ======================================================================================
// 🧠 NÚCLEO DE INICIALIZACIÓN BI
// ======================================================================================
export async function iniciarMotorBI(contenedorId) {
    console.log(" 🧠 Iniciando Motor de Inteligencia Empresarial GestiaPremium (NOC Mode)...");
    
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) {
        console.error("No se encontró el contenedor para el Dashboard Analítico.");
        return;
    }

    // Estructura Maestra del NOC
    contenedor.innerHTML = `
        <div class="bg-black border border-zinc-800 rounded-3xl p-6 shadow-2xl mb-8">
            <div class="flex justify-between items-center mb-6 border-b border-zinc-800 pb-4">
                <div>
                    <h2 class="text-2xl font-black text-white flex items-center gap-3">
                        <img src="assets/gestiapremium-icon.svg" class="w-8 h-8 drop-shadow-[0_0_12px_rgba(59,130,246,0.6)]" alt="GestiaPremium Logo"> 
                        NOC GESTIAPREMIUM: INTELIGENCIA OPERATIVA
                    </h2>
                    <p class="text-xs text-gray-500 uppercase tracking-widest mt-1">Telemetría, SLA, Rendimiento y Control de Riesgos</p>
                </div>
                <div class="text-right flex items-center gap-3">
                    <button onclick="window.descargarBackupOperativo()" class="bg-red-900/30 hover:bg-red-900/80 text-red-500 hover:text-white border border-red-500/50 text-[10px] font-bold px-4 py-2 rounded-full transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] uppercase tracking-widest flex items-center gap-2">
                        <i class="fas fa-file-csv text-sm"></i> PLAN B: Exportar BD
                    </button>
                    <span class="bg-emerald-900/30 text-emerald-400 border border-emerald-500/50 text-[10px] font-bold px-3 py-1 rounded-full animate-pulse">
                        SISTEMA EN LÍNEA
                    </span>
                </div>
            </div>

            <div class="grid grid-cols-4 gap-4 mb-8" id="biSemaforos">
                <div class="bg-zinc-900 p-4 rounded-xl border border-zinc-700 animate-pulse text-center"><p class="text-xs text-gray-500">Procesando SLA...</p></div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-zinc-900 rounded-2xl border border-zinc-700 p-5">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-white font-bold text-sm uppercase tracking-wider"><i class="fas fa-motorcycle text-blue-500"></i> Rendimiento de Flota (Comisión Dinámica)</h3>
                        <button onclick="window.evaluarComisionesDinamicas()" class="bg-blue-600 hover:bg-blue-500 text-white text-[9px] px-3 py-1.5 rounded font-bold shadow transition-colors">
                            <i class="fas fa-sync-alt"></i> ACTUALIZAR NIVELES
                        </button>
                    </div>
                    <div id="biRankingFlota" class="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                        <p class="text-xs text-gray-500 text-center py-4">Analizando historial de técnicos...</p>
                    </div>
                </div>

                <div class="flex flex-col gap-6">
                    <div class="bg-zinc-900 rounded-2xl border border-zinc-700 p-5 flex-1">
                        <h3 class="text-white font-bold text-sm uppercase tracking-wider mb-4"><i class="fas fa-crown text-yellow-500"></i> Motor de Retención VIP (LTV)</h3>
                        <div id="biRankingClientes" class="space-y-3 max-h-[200px] overflow-y-auto pr-2">
                            <p class="text-xs text-gray-500 text-center py-4">Calculando Lifetime Value...</p>
                        </div>
                    </div>
                    
                    <div class="bg-zinc-900 rounded-2xl border border-zinc-700 p-5">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-white font-bold text-sm uppercase tracking-wider"><i class="fas fa-chart-pie text-emerald-500"></i> Inteligencia Comercial</h3>
                            <div id="stripeHealthIndicator" class="flex items-center gap-1 text-[8px] font-bold text-zinc-500 uppercase">
                                <span class="w-2 h-2 rounded-full bg-zinc-700"></span> Pasarela: Idle
                            </div>
                        </div>
                        <div id="biMétricasComerciales" class="grid grid-cols-2 gap-3 mb-4">
                            <p class="text-xs text-gray-500 text-center py-4 col-span-2">Agrupando verticales...</p>
                        </div>
                        <div id="biStripeMonitor" class="bg-black/40 border border-zinc-800 rounded-xl p-3">
                            <h4 class="text-[9px] text-zinc-500 font-black uppercase mb-2">Live Webhook Feed (Stripe)</h4>
                            <div id="biStripeFeed" class="text-[10px] text-zinc-400 font-mono space-y-1">
                                <span class="animate-pulse">Esperando señal de pago...</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="col-span-1 lg:col-span-2 bg-zinc-900 rounded-2xl border border-blue-900/50 p-5 mt-6 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                <div class="flex justify-between items-center mb-4 border-b border-zinc-800 pb-3">
                    <h3 class="text-white font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                        <i class="fas fa-money-bill-wave text-blue-400"></i> Control de Excepciones: Pagos en Efectivo
                    </h3>
                    <span class="bg-blue-900/30 text-blue-400 border border-blue-500/50 text-[9px] font-bold px-2 py-1 rounded uppercase tracking-widest">
                        Tickets Activos en Tiempo Real
                    </span>
                </div>
                <div id="biTicketsEfectivo" class="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                    <p class="text-xs text-gray-500 text-center py-4">Monitoreando operaciones en curso...</p>
                </div>
            </div>

        </div>
    `;

    iniciarEscuchaTelemetria();
    iniciarEscuchaFlota();
}

// ======================================================================================
// 📡 WATCHDOGS Y LISTENERS PRINCIPALES
// ======================================================================================
function iniciarEscuchaTelemetria() {
    const qServices = query(collection(db, "services"), orderBy("created_at", "desc"));
    // 🔥 INYECCIÓN CLAVE: Quitamos el "where" para poder escuchar TODO lo de Stripe (Feed + Ingresos)
    const qTrans = query(collection(db, "transacciones"), orderBy("fecha", "desc"), limit(100));

    let dataServicios = [];
    
    onSnapshot(qServices, (snap) => {
        dataServicios = [];
        snap.forEach(doc => dataServicios.push({ id: doc.id, ...doc.data() }));
        procesarSemaforosOperativos(dataServicios);
        renderizarControlEfectivo(dataServicios); 
    });

    onSnapshot(qTrans, (snap) => {
        let transaccionesIngreso = [];
        let transaccionesStripeFeed = [];

        snap.forEach(doc => {
            const t = { id: doc.id, ...doc.data() };
            // Filtramos en memoria para mantener el LTV intacto
            if (t.tipo === "ingreso_servicio") {
                transaccionesIngreso.push(t);
            }
            // Filtramos para el Webhook Feed
            if (t.metodo === "stripe") {
                transaccionesStripeFeed.push(t);
            }
        });

        procesarMotorComercialLTV(transaccionesIngreso, dataServicios);
        actualizarMonitorStripe(transaccionesStripeFeed);
    });
}

function iniciarEscuchaFlota() {
    const qUsers = query(collection(db, "users"), where("rol", "==", "tecnico"));
    onSnapshot(qUsers, (snap) => {
        let tecnicos = [];
        snap.forEach(doc => tecnicos.push({ id: doc.id, ...doc.data() }));
        procesarRankingYDisciplina(tecnicos);
    });
}

// NUEVA FUNCIÓN: Verificador de Hits de Stripe para el NOC
function actualizarMonitorStripe(transacciones) {
    const feed = document.getElementById("biStripeFeed");
    const health = document.getElementById("stripeHealthIndicator");
    if (!feed || !health) return;

    // Solo mostramos los últimos 3 eventos de Stripe
    const stripeTx = transacciones.slice(0, 3);

    if (stripeTx.length > 0) {
        health.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span> <span class="text-emerald-500">PASARELA ACTIVA</span>`;
        feed.innerHTML = stripeTx.map(t => {
            const hora = t.fecha ? t.fecha.toDate().toLocaleTimeString() : 'Ahora';
            const etiqueta = t.tipo === "webhook_feed" ? "WEBHOOK" : "SETTLEMENT";
            return `
                <div class="flex justify-between items-center border-b border-zinc-900 pb-1">
                    <span class="text-emerald-400 font-bold">$${(t.monto_total || 0).toFixed(2)}</span>
                    <span class="text-[8px] text-zinc-500">${hora} | ${etiqueta}</span>
                    <span class="text-[7px] bg-zinc-800 px-1 rounded text-white shadow shadow-emerald-500/20">SUCCESS</span>
                </div>
            `;
        }).join('');
    }
}

// ======================================================================================
// 🚦 1. PROCESADOR DE SEMÁFOROS OPERATIVOS (SLA)
// ======================================================================================
function procesarSemaforosOperativos(servicios) {
    const contenedor = document.getElementById("biSemaforos");
    if (!contenedor) return;

    // Métricas
    let totalAsignados = 0;
    let tiempoLlegadaTotalMinutos = 0;
    let totalCotizados = 0;
    let cotizacionesAprobadas = 0;
    let totalFinalizados = 0;
    let posiblesFugas = 0;
    
    // SLA Dinámico (Zona Hotelera vs General)
    let llegadaZonaHotelera = { sum: 0, count: 0 };
    let llegadaGeneral = { sum: 0, count: 0 };

    servicios.forEach(srv => {
        // SLA de Llegada (Diferencia entre asignado_at y cotizado_at/trabajando/finalizado)
        if (srv.asignado_at && srv.cotizado_at) {
            const tAsig = srv.asignado_at.toDate();
            const tCot = srv.cotizado_at.toDate();
            const diffMinutos = Math.abs(tCot - tAsig) / 60000;
            
            if (diffMinutos > 0 && diffMinutos < 180) { // Filtro de cordura (menos de 3h)
                totalAsignados++;
                tiempoLlegadaTotalMinutos += diffMinutos;

                const zonaLower = (srv.zona || "").toLowerCase();
                if (zonaLower.includes("hotelera") || zonaLower.includes("puerto cancun")) {
                    llegadaZonaHotelera.sum += diffMinutos;
                    llegadaZonaHotelera.count++;
                } else {
                    llegadaGeneral.sum += diffMinutos;
                    llegadaGeneral.count++;
                }
            }
        }

        // Tasa de Cierre de Cotizaciones
        if (srv.estado === "finalizado") {
            totalCotizados++;
            cotizacionesAprobadas++;
            totalFinalizados++;
        }
        if (srv.estado === "cancelado" && srv.cancelado_razon === "Cliente rechazó cotización") {
            totalCotizados++;
        }

        // Detección de Intentos de Fuga (Cancelación súbita después de cotizar o llegar)
        if (srv.estado === "cancelado" && srv.cotizado_at && srv.tecnico_id) {
            posiblesFugas++;
        }
    });

    // Cálculos
    const promLlegadaGeneral = llegadaGeneral.count > 0 ? (llegadaGeneral.sum / llegadaGeneral.count) : 0;
    const promLlegadaZH = llegadaZonaHotelera.count > 0 ? (llegadaZonaHotelera.sum / llegadaZonaHotelera.count) : 0;
    const tasaAprobacion = totalCotizados > 0 ? ((cotizacionesAprobadas / totalCotizados) * 100).toFixed(1) : 0;

    // Evaluadores de Semáforo (Renders)
    const renderSemaforo = (titulo, valor, unidad, evalColor) => {
        let colorClass = "border-zinc-700 text-white";
        let icon = "fa-check-circle text-gray-500";
        let bgClass = "bg-zinc-900";

        if (evalColor === "rojo") { colorClass = "border-red-500 text-red-500"; icon = "fa-exclamation-triangle text-red-500 animate-pulse"; bgClass = "bg-red-900/20"; }
        if (evalColor === "amarillo") { colorClass = "border-yellow-500 text-yellow-500"; icon = "fa-exclamation-circle text-yellow-500"; bgClass = "bg-yellow-900/20"; }
        if (evalColor === "verde") { colorClass = "border-emerald-500 text-emerald-400"; icon = "fa-check-double text-emerald-500"; bgClass = "bg-emerald-900/20"; }

        return `
            <div class="${bgClass} p-4 rounded-xl border ${colorClass} transition-all">
                <div class="flex justify-between items-start mb-2">
                    <h4 class="text-[10px] font-bold uppercase tracking-widest text-gray-400">${titulo}</h4>
                    <i class="fas ${icon}"></i>
                </div>
                <div class="flex items-end gap-1">
                    <span class="text-2xl font-black">${valor}</span>
                    <span class="text-xs mb-1 text-gray-500">${unidad}</span>
                </div>
            </div>
        `;
    };

    // Lógica Predictiva (Los rangos discutidos)
    let colorLlegadaGen = promLlegadaGeneral <= 25 ? "verde" : (promLlegadaGeneral <= 40 ? "amarillo" : "rojo");
    let colorLlegadaZH = promLlegadaZH <= 40 ? "verde" : (promLlegadaZH <= 60 ? "amarillo" : "rojo"); // Tolerancia ZH
    let colorTasaCierre = tasaAprobacion >= 75 ? "verde" : (tasaAprobacion >= 50 ? "amarillo" : "rojo");
    let colorFugas = posiblesFugas === 0 ? "verde" : (posiblesFugas === 1 ? "amarillo" : "rojo");

    contenedor.innerHTML = `
        ${renderSemaforo("SLA LLEGADA (RESIDENCIAL)", promLlegadaGeneral.toFixed(0), "min", colorLlegadaGen)}
        ${renderSemaforo("SLA LLEGADA (ZONA HOTELERA)", promLlegadaZH.toFixed(0), "min", colorLlegadaZH)}
        ${renderSemaforo("TASA APROBACIÓN COTIZACIÓN", tasaAprobacion, "%", colorTasaCierre)}
        ${renderSemaforo("ALERTAS DE FUGA / COLUSIÓN", posiblesFugas, "casos", colorFugas)}
    `;
}

// ======================================================================================
// 🏆 2. RANKING DE FLOTA Y MOTOR DISCIPLINARIO (3 STRIKES)
// ======================================================================================
function procesarRankingYDisciplina(tecnicos) {
    const contenedor = document.getElementById("biRankingFlota");
    if (!contenedor) return;

    // Ordenamos por reputación y servicios completados (Mejores arriba)
    const tecnicosOrdenados = tecnicos.sort((a, b) => {
        const scoreA = (a.reputacion || 0) * (a.servicios_completados || 0);
        const scoreB = (b.reputacion || 0) * (b.servicios_completados || 0);
        return scoreB - scoreA;
    });

    let html = "";

    tecnicosOrdenados.forEach((t) => {
        const strikes = t.strikes || 0;
        const nivel = t.nivel || "BRONCE";
        const comision = t.comision_asignada ? (t.comision_asignada * 100).toFixed(0) + "%" : "32%";
        
        let colorStrike = strikes === 0 ? "text-emerald-500" : (strikes === 1 ? "text-yellow-500" : "text-red-500");
        let iconNivel = "fa-medal text-orange-600";
        if (nivel === "PLATA") iconNivel = "fa-medal text-gray-300";
        if (nivel === "ORO") iconNivel = "fa-crown text-yellow-400";

        const suspendido = t.estado === "suspendido" || t.estado === "suspendido_grave" || t.estado === "baneado_permanente";

        html += `
            <div class="flex flex-col bg-black p-3 rounded-xl border ${suspendido ? 'border-red-900/50 opacity-70' : 'border-zinc-800'} mb-2">
                <div class="flex justify-between items-center mb-2">
                    <div class="flex items-center gap-2">
                        <img src="${t.foto_perfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.nombre)}`}" class="w-8 h-8 rounded-full border border-zinc-700">
                        <div>
                            <p class="text-white font-bold text-xs uppercase">${escaparHTML(t.nombre)}</p>
                            <div class="flex items-center gap-2 text-[9px] mt-0.5 font-bold">
                                <span><i class="fas ${iconNivel}"></i> ${nivel} (Fee: ${comision})</span>
                                <span class="text-gray-600">|</span>
                                <span class="${colorStrike}">STRIKES: ${strikes}/3</span>
                            </div>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-emerald-400 font-black text-xs">${t.servicios_completados || 0} TICKETS</p>
                        <p class="text-yellow-500 text-[9px]">⭐ ${(t.reputacion || 5).toFixed(1)}</p>
                    </div>
                </div>

                ${!suspendido ? `
                <div class="flex gap-1 mt-2 pt-2 border-t border-zinc-800">
                    <button onclick="window.aplicarStrike('${t.id}', 1, '${escaparHTML(t.nombre)}')" class="flex-1 bg-yellow-900/30 hover:bg-yellow-900/60 text-yellow-500 text-[8px] py-1.5 rounded font-bold border border-yellow-500/30 transition-colors">
                        <i class="fas fa-exclamation-triangle"></i> STRIKE 1 (24H)
                    </button>
                    <button onclick="window.aplicarStrike('${t.id}', 2, '${escaparHTML(t.nombre)}')" class="flex-1 bg-orange-900/30 hover:bg-orange-900/60 text-orange-500 text-[8px] py-1.5 rounded font-bold border border-orange-500/30 transition-colors">
                        <i class="fas fa-gavel"></i> STRIKE 2 (7 DÍAS)
                    </button>
                    <button onclick="window.aplicarStrike('${t.id}', 3, '${escaparHTML(t.nombre)}')" class="flex-[0.5] bg-red-900/50 hover:bg-red-600 text-white text-[8px] py-1.5 rounded font-bold border border-red-500/50 transition-colors">
                        <i class="fas fa-skull-crossbones"></i> BAN
                    </button>
                </div>
                ` : `
                <div class="mt-2 pt-2 border-t border-red-900/50 text-center">
                    <span class="bg-red-900 text-white text-[9px] font-black px-3 py-1 rounded uppercase tracking-widest">CUENTA SUSPENDIDA (${t.estado.replace('_', ' ')})</span>
                    <button onclick="window.levantarCastigo('${t.id}')" class="ml-2 text-emerald-500 underline text-[9px] hover:text-emerald-400">Restaurar</button>
                </div>
                `}
            </div>
        `;
    });

    contenedor.innerHTML = html || '<p class="text-gray-500 text-xs text-center py-4">No hay flota registrada.</p>';
}

// LÓGICA DE EJECUCIÓN DISCIPLINARIA (RESTAURADA LÍNEA POR LÍNEA)
window.aplicarStrike = async (uid, nivelStrike, nombre) => {
    let msg = "";
    let nuevoEstado = "";
    let penalizacionMonto = 0;
    
    if (nivelStrike === 1) {
        msg = `¿Aplicar STRIKE 1 a ${nombre}?\n\n- Se suspenderá 24 horas.\n- Retención preventiva de $200 MXN.\n- Se notifica baja de calidad.`;
        nuevoEstado = "suspendido";
        penalizacionMonto = 200;
    } else if (nivelStrike === 2) {
        msg = `¿Aplicar STRIKE 2 a ${nombre}?\n\n- Se suspenderá 7 DÍAS.\n- Retención fuerte de $500 MXN.\n- Queda al borde de la expulsión.`;
        nuevoEstado = "suspendido_grave";
        penalizacionMonto = 500;
    } else if (nivelStrike === 3) {
        msg = `🚨 ALERTA CRÍTICA 🚨\n\n¿BANEADO PERMANENTE a ${nombre}?\n\n- Se revoca acceso total.\n- Bloqueo de IP/Dispositivo.\n- Congelamiento final de fondos para revisión.`;
        nuevoEstado = "baneado_permanente";
        penalizacionMonto = 1000;
    }

    if (!confirm(msg)) return;

    try {
        // 1. Aplicar Strike en Perfil
        await updateDoc(doc(db, "users", uid), {
            estado: nuevoEstado,
            strikes: nivelStrike,
            disponible: false // Lo saca del mapa inmediatamente
        });

        // 2. Ejecutar Retención Financiera en Bóveda
        await addDoc(collection(db, "transacciones"), {
            tecnico_id: uid,
            pago_tecnico: -Math.abs(penalizacionMonto),
            monto_total: 0,
            tipo: "penalizacion",
            descripcion: `Sistema NOC: Strike Nivel ${nivelStrike} (Retención / Multa)`,
            fecha: serverTimestamp()
        });

        alert(`✅ Sanción de Strike ${nivelStrike} aplicada exitosamente a ${nombre}. Fondos retenidos.`);
    } catch (e) {
        console.error("Error aplicando disciplina:", e);
        alert("Error de conexión al aplicar la sanción.");
    }
};

window.levantarCastigo = async (uid) => {
    if(!confirm("¿Perdonar a este técnico y regresarlo a estatus Activo? Sus strikes no se borrarán, pero podrá trabajar.")) return;
    try {
        await updateDoc(doc(db, "users", uid), { estado: "activo" });
    } catch(e) { alert("Error."); }
};

// EVALUADOR DE COMISIONES DINÁMICAS (GAMIFICACIÓN)
window.evaluarComisionesDinamicas = async () => {
    if(!confirm("🤖 EL CEREBRO VA A EVALUAR A TODA LA FLOTA.\n\nEsto calculará el volumen, calificación y strikes de cada técnico para ascenderlos (Oro/27%) o degradarlos (Bronce/32%).\n\n¿Proceder con la auditoría mensual automática?")) return;
    
    try {
        const qUsers = query(collection(db, "users"), where("rol", "==", "tecnico"));
        const snap = await getDocs(qUsers);
        
        let ascensos = 0; let degradaciones = 0;

        for (const docSnap of snap.docs) {
            const t = docSnap.data();
            const rep = t.reputacion || 0;
            const svcs = t.servicios_completados || 0;
            const strikes = t.strikes || 0;

            let nuevoNivel = "BRONCE";
            let nuevaComision = 0.32;

            // Algoritmo de Gamificación
            if (rep >= 4.8 && svcs >= 50 && strikes === 0) {
                nuevoNivel = "ORO"; nuevaComision = 0.27; // Elite
            } else if (rep >= 4.5 && svcs >= 20 && strikes <= 1) {
                nuevoNivel = "PLATA"; nuevaComision = 0.30; // Intermedio
            } else {
                nuevoNivel = "BRONCE"; nuevaComision = 0.32; // Base / Castigado
            }

            if (t.nivel !== nuevoNivel) {
                if(nuevaComision < (t.comision_asignada || 0.32)) ascensos++; else degradaciones++;
                await updateDoc(doc(db, "users", docSnap.id), {
                    nivel: nuevoNivel,
                    comision_asignada: nuevaComision
                });
            }
        }
        alert(`✅ Cierre de Ciclo Exitoso.\n\nAscensos aplicados: ${ascensos}\nDegradaciones aplicadas: ${degradaciones}\n\nLos técnicos verán su nueva tasa de ganancia en su app.`);
    } catch(e) {
        console.error("Error evaluando comisiones:", e);
        alert("Error corriendo el algoritmo de comisiones.");
    }
};

// ======================================================================================
// 🐋 3. MOTOR COMERCIAL VIP (LTV & CHURN RATE)
// ======================================================================================
function procesarMotorComercialLTV(transacciones, servicios) {
    const contClientes = document.getElementById("biRankingClientes");
    const contMétricas = document.getElementById("biMétricasComerciales");
    if (!contClientes || !contMétricas) return;

    // 1. Construcción del Perfil de Valor del Cliente (LTV)
    let clientesHash = {}; 
    let verticalHash = {};

    transacciones.forEach(tx => {
        // Enlazar transacción con datos del servicio para obtener Cliente_ID y Vertical
        const srvRelacionado = servicios.find(s => s.id === tx.servicio_id);
        if (srvRelacionado && srvRelacionado.cliente_id) {
            const cid = srvRelacionado.cliente_id;
            const cName = srvRelacionado.cliente_nombre || "Usuario";
            const cPhone = srvRelacionado.cliente_telefono || "Sin teléfono";
            const vert = srvRelacionado.categoria || "GRAL";
            
            // LTV Cliente
            if(!clientesHash[cid]) {
                clientesHash[cid] = { nombre: cName, telefono: cPhone, total_gtv: 0, util_pura: 0, tickets: 0, ultimo_servicio: 0 };
            }
            clientesHash[cid].total_gtv += (tx.monto_total || 0);
            clientesHash[cid].util_pura += (tx.comision_fixgo || 0); // Lo que realmente gana GestiaPremium
            clientesHash[cid].tickets++;
            
            if (srvRelacionado.created_at) {
                const ms = srvRelacionado.created_at.seconds * 1000;
                if(ms > clientesHash[cid].ultimo_servicio) clientesHash[cid].ultimo_servicio = ms;
            }

            // Rentabilidad Vertical
            if(!verticalHash[vert]) verticalHash[vert] = { ingresos: 0, tickets: 0 };
            verticalHash[vert].ingresos += (tx.comision_fixgo || 0);
            verticalHash[vert].tickets++;
        }
    });

    // 2. Renderizado del Top VIP Clients (LTV)
    const arrayClientes = Object.values(clientesHash).sort((a, b) => b.total_gtv - a.total_gtv).slice(0, 10);
    
    let htmlVIP = "";
    const ahora = new Date().getTime();

    arrayClientes.forEach((c, idx) => {
        const diasInactivo = c.ultimo_servicio > 0 ? Math.floor((ahora - c.ultimo_servicio) / (1000 * 60 * 60 * 24)) : 0;
        
        let badgeRiesgo = "";
        let borderCard = "border-zinc-800";
        if (diasInactivo > 60) {
            badgeRiesgo = `<span class="bg-red-900/50 text-red-400 text-[8px] px-2 rounded ml-2 font-black border border-red-500/50">⚠️ RIESGO ABANDONO (${diasInactivo}d)</span>`;
            borderCard = "border-red-900/50";
        }

        htmlVIP += `
            <div class="flex justify-between items-center bg-black p-3 rounded-xl border ${borderCard} mb-2">
                <div class="flex items-center gap-3">
                    <div class="text-yellow-500 font-black text-xs w-4 text-center">#${idx + 1}</div>
                    <div>
                        <p class="text-white font-bold text-xs uppercase">${escaparHTML(c.nombre)} ${badgeRiesgo}</p>
                        <p class="text-[9px] text-gray-500 font-mono">${escaparHTML(c.telefono)} • ${c.tickets} Servicios</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-emerald-400 font-black text-sm">$${c.total_gtv.toFixed(2)}</p>
                    <p class="text-[8px] text-zinc-500 uppercase tracking-widest">LTV Neto: $${c.util_pura.toFixed(2)}</p>
                </div>
            </div>
        `;
    });
    contClientes.innerHTML = htmlVIP || '<p class="text-gray-500 text-xs text-center py-4">Faltan datos de transacciones para calcular el LTV.</p>';

    // 3. Renderizado de Rentabilidad por Vertical
    const arrayVerticales = Object.entries(verticalHash).map(([k, v]) => ({ nombre: k, ...v })).sort((a,b) => b.ingresos - a.ingresos);
    
    let htmlVert = "";
    arrayVerticales.forEach(v => {
        htmlVert += `
            <div class="bg-black p-3 rounded-xl border border-zinc-800 flex justify-between items-center">
                <div>
                    <p class="text-white font-bold text-[10px] uppercase">${escaparHTML(v.nombre)}</p>
                    <p class="text-[8px] text-gray-500">${v.tickets} Órdenes completadas</p>
                </div>
                <div class="text-right">
                    <p class="text-emerald-500 font-black text-xs">$${v.ingresos.toFixed(2)}</p>
                    <p class="text-[7px] text-zinc-600 uppercase">Utilidad Pura GestiaPremium</p>
                </div>
            </div>
        `;
    });
    contMétricas.innerHTML = htmlVert || '<p class="text-gray-500 text-xs text-center py-4 col-span-2">Sin datos de verticales.</p>';
}

// ======================================================================================
// 💵 4. NUEVO MÓDULO: RENDERIZADO Y CONTROL DE EXCEPCIONES (EFECTIVO)
// ======================================================================================
function renderizarControlEfectivo(servicios) {
    const contenedor = document.getElementById("biTicketsEfectivo");
    if (!contenedor) return;

    // Filtramos solo los servicios que están vivos/activos en este momento
    const estadosActivos = ['buscando_tecnico', 'asignado', 'en_camino', 'cotizando', 'trabajando', 'pago_pendiente'];
    const serviciosActivos = servicios.filter(s => estadosActivos.includes(s.estado));

    if (serviciosActivos.length === 0) {
        contenedor.innerHTML = '<p class="text-gray-500 text-xs text-center py-4"><i class="fas fa-check-double mb-2 text-xl block text-zinc-700"></i> No hay operaciones activas en este momento.</p>';
        return;
    }

    let html = "";
    serviciosActivos.forEach(s => {
        // Verificamos si este ticket ya tiene el permiso de efectivo
        const efectivoHabilitado = s.allowCashPayment === true;
        
        // Estilos condicionales
        const cardBorder = efectivoHabilitado ? 'border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'border-zinc-800';
        const statusBadge = `<span class="bg-zinc-800 text-zinc-400 text-[8px] px-2 py-0.5 rounded uppercase tracking-widest">${s.estado.replace('_', ' ')}</span>`;
        
        html += `
            <div class="bg-black p-4 rounded-xl border ${cardBorder} flex justify-between items-center mb-2 transition-all">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <p class="text-white font-bold text-xs uppercase"><i class="fas fa-user text-blue-500"></i> ${escaparHTML(s.cliente_nombre || 'Cliente')}</p>
                        ${statusBadge}
                    </div>
                    <p class="text-[9px] text-gray-500 font-mono">ID: ${s.id} | Servicio: ${escaparHTML(s.categoria || 'Gral')}</p>
                </div>
                
                <div class="text-right">
                    ${efectivoHabilitado ? `
                        <div class="flex items-center gap-2 text-emerald-400 text-[10px] font-bold bg-emerald-900/20 px-3 py-1.5 rounded-full border border-emerald-500/30">
                            <i class="fas fa-check-circle"></i> EFECTIVO HABILITADO
                        </div>
                    ` : `
                        <button onclick="window.habilitarCobroEfectivo('${s.id}', '${escaparHTML(s.cliente_nombre || '')}')" 
                                class="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-4 py-2 rounded-lg transition-colors shadow-lg shadow-blue-900/50 flex items-center gap-2">
                            <i class="fas fa-unlock-alt"></i> AUTORIZAR EFECTIVO
                        </button>
                    `}
                </div>
            </div>
        `;
    });

    contenedor.innerHTML = html;
}

// LOGICA DE ACCIÓN: Disparador del Switch Mágico en Firebase
window.habilitarCobroEfectivo = async (servicioId, clienteNombre) => {
    if(!confirm(`🔐 AUTORIZACIÓN DE EXCEPCIÓN\n\n¿Estás seguro de habilitar el pago en EFECTIVO para el cliente ${clienteNombre}?\n\nAl confirmar, el botón de "Pagar en Efectivo" aparecerá mágicamente en la app de este cliente de forma instantánea.`)) return;

    try {
        await updateDoc(doc(db, "services", servicioId), {
            allowCashPayment: true
        });
        alert(`✅ Permiso inyectado. El cliente ${clienteNombre} ya puede ver la opción de Efectivo.`);
    } catch (e) {
        console.error("Error al habilitar efectivo:", e);
        alert("Error de conexión al inyectar el permiso.");
    }
};

// ======================================================================================
// 🛡️ 5. MÓDULO DE CONTINGENCIA OPERATIVA (RESTAURADO COMPLETO)
// ======================================================================================
window.descargarBackupOperativo = async () => {
    if(!confirm("⚠️ PROTOCOLO DE CONTINGENCIA (PLAN B) ⚠️\n\n¿Estás seguro de que deseas exportar la Base de Datos completa (Clientes y Técnicos) para operación manual fuera de línea?")) return;
    
    try {
        console.log(" 🛡️ [NOC] Iniciando extracción masiva de datos de contingencia...");
        
        // Consultamos a todos los usuarios desde la raíz
        const qUsers = query(collection(db, "users"));
        const snap = await getDocs(qUsers);
        
        // Preparamos el contenido del CSV
        let csvContent = "data:text/csv;charset=utf-8,";
        // Cabeceras del archivo
        csvContent += "Rol,Nombre,Telefono,Email,Estado,Info_Extra\n";

        let contador = 0;

        snap.forEach(docSnap => {
            const u = docSnap.data();
            const rol = (u.rol || "desconocido").toUpperCase();
            
            // Sanitizamos el nombre quitando comas para no romper el formato CSV
            const nombre = escaparHTML(u.nombre || "Sin Nombre").replace(/,/g, " "); 
            const telefono = u.telefono || "Sin Teléfono";
            const email = u.email || "Sin Email";
            const estado = (u.estado || "activo").toUpperCase();
            
            let extra = "N/A";
            // Si es técnico, incluimos su vehículo y placas para la logística manual
            if(rol === "TECNICO" && u.vehiculo) {
                extra = `${u.vehiculo.tipo} - ${u.vehiculo.placas || 'Sin Placas'}`;
            }

            // Armamos la fila y la añadimos
            const fila = `${rol},"${nombre}","${telefono}","${email}",${estado},"${extra}"`;
            csvContent += fila + "\n";
            contador++;
        });

        // Codificamos el texto para descarga y creamos un enlace invisible
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        
        // Le damos un nombre profesional con la fecha actual
        const hoy = new Date();
        const fechaStr = hoy.toISOString().split('T')[0];
        link.setAttribute("download", `GestiaPremium_Contingencia_Operativa_${fechaStr}.csv`);
        
        // Disparamos la descarga
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        alert(`✅ Base de Datos Exportada con Éxito.\n\nSe descargaron ${contador} perfiles. El archivo CSV ya está en tu computadora listo para usarse en Excel y operar vía WhatsApp si es necesario.`);
        
    } catch(e) {
        console.error("❌ Error Crítico en Protocolo de Contingencia:", e);
        alert("🚨 Error al extraer la base de datos. Verifica tu conexión a internet.");
    }
};
