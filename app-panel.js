/**
 * ======================================================================================
 * FIXGO 2026 - PANEL MAESTRO DE CONTROL (LOGIC CORE) - ARQUITECTURA MAESTRA
 * ======================================================================================
 * Archivo: app-panel.js
 * Versión: 5.16.0 (FASE 0: UBER CASH MODEL + SHARK MODE BLINDADO + LOGISTICS SHIELD)
 * Autor: Heber (CEO & Lead Architect)
 * Fecha: Febrero 2026
 * REGLAS DE ARQUITECTURA: NO COMPACTAR. NO FRAGMENTAR. MANTENER LOGICA.
 * ======================================================================================
 */

import {
    db,
    auth,
    appCheck, // <-- BLINDAJE CONECTADO V5.2
    doc,
    updateDoc,
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    addDoc,
    serverTimestamp,
    setDoc,
    getDoc 
} from "./firebase.js";

// 🔥 INYECCIÓN NIVEL UBER: runTransaction (Atomicidad), limit (Escudo RAM) e increment (Contadores)
import { getDocs, arrayUnion, runTransaction, limit, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { iniciarTracking, detenerTracking } from "./gps-motor.js";
import { activarAlertas, alertaTecnico } from "./alert-engine.js";

/**
 * SANITIZADOR MAESTRO (PREVENCIÓN XSS)
 * Protege contra inyección de código en los innerHTML
 */
const escaparHTML = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

/**
 * 🦈 SISTEMA ANTIFRAUDE MILITAR (SHARK MODE)
 * Fórmula de Haversine para calcular distancia en metros entre dos coordenadas GPS
 */
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Radio de la Tierra en metros
    const rad = Math.PI / 180;
    const φ1 = lat1 * rad;
    const φ2 = lat2 * rad;
    const Δφ = (lat2 - lat1) * rad;
    const Δλ = (lon2 - lon1) * rad;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distancia en metros
}

/**
 * ACTIVADOR MAESTRO (UNLOCKER)
 */
document.addEventListener('click', () => {
    activarAlertas().then(() => {
        console.log("🔊 FIXGO AUDIO ENGINE: Desbloqueado y listo (Modo Sintetizador).");
    });
}, { once: true }); 

function sonarAlerta() {
    alertaTecnico();
}

// ======================================================================================
//  📄  CARGADOR DINÁMICO DE PDF (OPTIMIZACIÓN V5.7)
// ======================================================================================
async function cargarLibreriaPDF() {
    if (window.jspdf) return window.jspdf; 
    
    return new Promise((resolve, reject) => {
        console.log(" 📄  Cargando librería PDF bajo demanda...");
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.onload = () => {
            console.log(" 📄  Librería PDF cargada correctamente.");
            resolve(window.jspdf);
        };
        script.onerror = () => reject("Error crítico cargando la librería PDF desde CDN.");
        document.head.appendChild(script);
    });
}

console.log(" 🚀  FIXGO 5.16.0: UBER CASH MODEL (EFECTIVO) + SHARK MODE ACTIVATED.");

// ======================================================================================
// 1. PANEL DE ADMINISTRADOR (TORRE DE CONTROL PRO)
// ======================================================================================
export async function iniciarPanelAdmin(user) {
    console.log(" 🛡️  Iniciando Panel de Administrador (Modo BI V5.16.0 - Bootstrapping)...");
    
    // 🚨 CANDADO DE SEGURIDAD MAESTRO: Validación estricta de rol
    if (!user || user.rol !== "admin") {
        console.error("🛑 ALERTA DE SEGURIDAD FIXGO: Intento de acceso no autorizado al Panel Admin.");
        alert("🔒 ACCESO DENEGADO.");
        return;
    }

    const elementos = {
        lista: document.getElementById("listaTecnicos"),
        actividad: document.getElementById("listaTransacciones"),
        listaRetiros: document.getElementById("listaRetiros"),
        btnToggleHistorialRetiros: document.getElementById("btnToggleHistorialRetiros"),
        vistaRetirosPendientes: document.getElementById("vistaRetirosPendientes"),
        vistaHistorialRetiros: document.getElementById("vistaHistorialRetiros"),
        listaHistorialRetiros: document.getElementById("listaHistorialRetiros"),
        countServ: document.querySelector(".fa-bolt")?.closest(".uber-card")?.querySelector("h3"),
        countMoney: document.getElementById("countMoneyFixgo"), // Actualizado a ID directo
        countBovedaStripe: document.getElementById("countBovedaStripe"), // INYECCIÓN V5.14.0
        countOnline: document.getElementById("totalTecnicos"),
        listaFacturasPendientes: document.getElementById("listaFacturasPendientes"), // INYECCIÓN V5.14.0
        contadorFacturas: document.getElementById("contadorFacturas") // INYECCIÓN V5.14.0
    };

    // --- A. GESTIÓN DE TÉCNICOS ---
    if (elementos.lista) {
        const qTecnicos = query(collection(db, "users"), where("rol", "==", "tecnico"));

        onSnapshot(qTecnicos, (snap) => {
            elementos.lista.innerHTML = ""; 

            let contOnline = 0;
            let contTotal = 0;
            
            if (snap.empty) {
                elementos.lista.innerHTML = '<p class="text-gray-500 p-4 italic">No hay técnicos registrados en la base de datos.</p>';
            }
            
            snap.forEach((docSnap) => {
                const data = docSnap.data();
                contTotal++;

                if(data.disponible) {
                    contOnline++;
                }
                
                const esPendiente = (data.estado || "pendiente") === "pendiente";
                const ineCheck = data.documentos?.ine ? '<span class="text-emerald-400"> ✅ INE</span>' : '<span class="text-red-500"> ❌ INE</span>';
                const csfCheck = data.documentos?.csf ? '<span class="text-emerald-400"> ✅ CSF</span>' : '<span class="text-red-500"> ❌ CSF</span>';
                const skillsStr = data.skills ? data.skills.join(" • ").toUpperCase() : "GENERAL";
                
                // --- IDENTIDAD CONECTADA ---
                const fotoUrl = data.foto_perfil || data.fotoPerfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.nombre)}&background=random`;

                // --- SISTEMA DE REPUTACIÓN VISUAL ---
                const reputacion = data.reputacion || 5.0;
                const estrellas = "⭐".repeat(Math.round(reputacion));
                const nivel = data.nivel || "BRONCE";
                let colorNivel = "text-orange-500";
                if(nivel === "PLATA") colorNivel = "text-gray-300";
                if(nivel === "ORO") colorNivel = "text-yellow-400";

                const estadoDot = data.disponible
                    ? '<span class="text-emerald-500 font-bold text-[10px] animate-pulse">● ONLINE</span>'
                    : '<span class="text-gray-500 text-[10px]">● OFFLINE</span>';

                const card = document.createElement("div");
                card.className = `p-4 mb-3 rounded-xl border ${esPendiente ? 'bg-yellow-900/10 border-yellow-500' : 'bg-zinc-900 border-zinc-800'}`;

                card.innerHTML = `
                <div class="flex justify-between items-center">
                    <div class="flex items-start gap-3">
                        <img src="${fotoUrl}" class="w-12 h-12 rounded-full border border-zinc-700 object-cover shadow-lg" alt="Foto">
                        <div>
                            <h4 class="font-bold text-white text-sm">
                                ${escaparHTML(data.nombre)}
                                ${esPendiente ? '<span class="text-[9px] bg-yellow-500 text-black px-1 rounded ml-2 font-black">NUEVO</span>' : ''}
                            </h4>
                            <div class="flex items-center gap-2 text-[10px] mt-0.5">
                                <span class="${colorNivel} font-black">${nivel}</span>
                                <span class="text-yellow-500">${estrellas} (${reputacion.toFixed(1)})</span>
                            </div>
                            <p class="text-[9px] text-blue-400 font-bold mt-1 tracking-wide">SKILLS: ${escaparHTML(skillsStr)}</p>
                            <p class="text-xs text-gray-400">${escaparHTML(data.telefono || '')}</p>
                            
                            <div class="mt-2 text-[10px] bg-black/20 p-1 rounded inline-block border border-white/5">
                                ${ineCheck} | ${csfCheck}
                            </div>
                            
                            <div class="mt-1">
                                ${estadoDot}
                            </div>
                        </div>
                    </div>

                    <div class="flex flex-col gap-2">
                        ${esPendiente ? `
                        <button class="btn-aprobar bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-3 py-2 rounded shadow-lg transition-transform hover:scale-105" onclick="window.aprobarTecnico('${docSnap.id}')">
                            APROBAR ACCESO
                        </button>
                        ` : `
                        <button class="bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 text-[9px] font-bold px-2 py-1 rounded border border-blue-900/50 mb-1" onclick="window.verExpediente('${docSnap.id}')">
                            <i class="fas fa-folder-open"></i> EXPEDIENTE
                        </button>
                        <button class="bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400 text-[9px] font-bold px-2 py-1 rounded border border-emerald-900/50 mb-1" onclick="window.registrarPagoTecnico('${docSnap.id}', '${escaparHTML(data.nombre)}')">
                            <i class="fas fa-money-bill-wave"></i> REGISTRAR PAGO
                        </button>
                        <button class="bg-red-900/30 hover:bg-red-900/50 text-red-500 text-[9px] font-bold px-2 py-1 rounded border border-red-900/50" onclick="window.aplicarPenalizacionManual('${docSnap.id}')">
                            <i class="fas fa-gavel"></i> PENALIZAR
                        </button>
                        `}
                    </div>
                </div>
                `;
                elementos.lista.appendChild(card);
            });
            
            if(elementos.countOnline) {
                elementos.countOnline.innerHTML = `${contOnline} <span class="text-sm text-gray-500">/ ${contTotal}</span>`;
                elementos.countOnline.style.color = contOnline > 0 ? "#10b981" : "white";
            }
        });
    }

    // --- B. ACTIVIDAD RECIENTE (ESCUDO RAM) ---
    const qServicios = query(collection(db, "services"), orderBy("created_at", "desc"), limit(50));

    onSnapshot(qServicios, (snap) => {
        if(elementos.actividad) elementos.actividad.innerHTML = "";
        
        // 🔥 INYECCIÓN V5.14.0: BANDEJA DE FACTURACIÓN
        if(elementos.listaFacturasPendientes) elementos.listaFacturasPendientes.innerHTML = "";
        let facturasPendientesCount = 0;

        let activos = 0;
        
        if (snap.empty) {
            if(elementos.actividad) elementos.actividad.innerHTML = '<p class="text-gray-500 italic text-sm text-center mt-4">Sin actividad reciente en la plataforma.</p>';
        }
        
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const sid = docSnap.id;

            // Lógica Facturación
            if (data.factura_requerida && data.estado === "finalizado" && !data.factura_enviada) {
                facturasPendientesCount++;
                if (elementos.listaFacturasPendientes) {
                    const facCard = document.createElement("div");
                    facCard.className = "bg-zinc-900 border border-zinc-700 p-4 rounded-xl shadow-lg";
                    facCard.innerHTML = `
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <p class="text-emerald-500 font-bold text-[10px] uppercase tracking-widest mb-1"><i class="fas fa-file-invoice"></i> Folio: ${data.folio_fiscal || sid.substring(0,6)}</p>
                                <p class="text-white font-black text-sm">${escaparHTML(data.datos_facturacion?.razon_social || 'Desconocido')}</p>
                            </div>
                            <span class="text-white font-black bg-zinc-800 px-2 py-1 rounded text-xs">$${data.costo_final}</span>
                        </div>
                        <div class="bg-black p-2 rounded-lg text-[10px] text-gray-400 mb-3 space-y-1">
                            <p><span class="font-bold text-gray-300">RFC:</span> ${escaparHTML(data.datos_facturacion?.rfc || 'N/A')}</p>
                            <p><span class="font-bold text-gray-300">CP:</span> ${escaparHTML(data.datos_facturacion?.cp || 'N/A')}</p>
                            <p><span class="font-bold text-gray-300">Régimen:</span> ${escaparHTML(data.datos_facturacion?.regimen || 'N/A')}</p>
                        </div>
                        <button class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-[10px] transition-colors" onclick="window.marcarFacturaEnviada('${sid}')">
                            <i class="fas fa-check"></i> MARCAR COMO ENVIADA
                        </button>
                    `;
                    elementos.listaFacturasPendientes.appendChild(facCard);
                }
            }

            if (!["finalizado", "cancelado"].includes(data.estado)) {
                activos++;
            }

            if (elementos.actividad && elementos.actividad.children.length < 10) {
                const item = document.createElement("div");
                item.className = "flex justify-between items-start border-b border-white/5 py-3 last:border-0";

                let colorEstado = "text-gray-400";
                if(data.estado === "pendiente") colorEstado = "text-yellow-500";
                if(data.estado === "asignado") colorEstado = "text-blue-300";
                if(data.estado === "en_camino") colorEstado = "text-blue-400";
                if(data.estado === "en_sitio") colorEstado = "text-purple-400";
                if(data.estado === "cotizando") colorEstado = "text-orange-400";
                if(data.estado === "trabajando") colorEstado = "text-blue-500 animate-pulse font-bold";
                if(data.estado === "finalizado") colorEstado = "text-emerald-500";
                if(data.estado === "cancelado") colorEstado = "text-red-500 line-through";
                
                const labelServicio = escaparHTML(`${data.categoria} ${data.sub_servicio ? '• ' + data.sub_servicio : ''}`);

                // --- AUDITORÍA REAL ---
                let btnAuditar = '';
                if(data.estado === "finalizado") {
                    btnAuditar = `<button class="mt-2 text-[9px] bg-purple-600/30 text-purple-400 font-bold px-2 py-1 rounded border border-purple-500/50 transition-colors hover:bg-purple-600/50 block" onclick="window.auditarServicio('${sid}')"><i class="fas fa-camera"></i> AUDITAR</button>`;
                }

                item.innerHTML = `
                <div class="flex items-start gap-3">
                    <div class="bg-zinc-800 p-2 rounded-lg mt-1"><i class="fas fa-tools text-gray-400"></i></div>
                    <div>
                        <p class="text-xs font-bold text-white uppercase">${labelServicio}</p>
                        <p class="text-[10px] text-gray-500">${escaparHTML(data.cliente_nombre || 'Cliente')} • ${escaparHTML(data.zona || 'Cancún')}</p>
                        ${btnAuditar}
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-[10px] font-bold ${colorEstado} uppercase">${data.estado.replace('_', ' ')}</p>
                    <p class="text-[9px] text-gray-600">Hace un momento</p>
                </div>
                `;
                elementos.actividad.appendChild(item);
            }
        });
        
        if (elementos.contadorFacturas) {
            elementos.contadorFacturas.innerText = `${facturasPendientesCount} Solicitudes`;
        }
        if (facturasPendientesCount === 0 && elementos.listaFacturasPendientes) {
             elementos.listaFacturasPendientes.innerHTML = `<div class="col-span-full text-gray-500 italic text-sm text-center py-6"><i class="fas fa-check-circle text-2xl mb-2 text-zinc-700 block"></i>No hay solicitudes de facturas pendientes.</div>`;
        }

        if(elementos.countServ) {
            elementos.countServ.innerText = activos + (snap.size === 50 ? '+' : '');
            elementos.countServ.style.color = activos > 0 ? "#34d399" : "white";
        }
    });

    // Función Admin para marcar factura como enviada
    window.marcarFacturaEnviada = async (id) => {
        if(!confirm("¿Confirmas que ya enviaste el CFDI a este cliente a través de tu portal del SAT?")) return;
        try {
            await updateDoc(doc(db, "services", id), { factura_enviada: true });
        } catch(e) {
            console.error("Error al actualizar factura:", e);
            alert("Error al actualizar estado en la base de datos.");
        }
    };

    // --- C. DASHBOARD FINANCIERO PRO V5.14.0 (Business Intelligence & Real Split) ---
    const qFinanzas = query(collection(db, "transacciones"));
    onSnapshot(qFinanzas, (snap) => {
        // 🧮 VARIABLES DE LA ARQUITECTURA FINANCIERA
        let globalFixGo = 0;      // 32% del Total (Comisión Bruta)
        let globalIVA = 0;        // 16% sobre la comisión de FixGo
        let globalISR = 0;        // 30% sobre la utilidad de FixGo
        let globalGarantia = 0;   // 2% del Total (Fondo de Seguridad)
        let globalStripe = 0;     // 3.6% + $3.00 MXN (Costo Operativo)
        let globalTecnico = 0;    // El remanente líquido
        
        let totalFlujo = 0;       // Volumen Bruto Transaccional (GTV)
        let dineroRetenido = 0;   // Dinero en tránsito (Stripe < 24h)
        let dineroRetiradoTecnicos = 0; // Para calcular saldo real en bóveda

        const ahora = new Date();

        snap.forEach(docSnap => {
            const tx = docSnap.data();
            
            if (tx.tipo === "retiro_fondos") {
                 dineroRetiradoTecnicos += Math.abs(tx.pago_tecnico || 0);
            }

            if (tx.tipo === "ingreso_servicio") {
                const monto = tx.monto_total || 0;
                totalFlujo += monto;

                // --- 🧠 LÓGICA MAESTRA DE DISPERSIÓN ---
                const calcFixGo = monto * 0.32;               // 32% para FixGo
                const calcGarantia = monto * 0.02;            // 2% Fondo Garantía
                const calcStripe = (monto * 0.036) + 3.00;    // Costo Pasarela (3.6% + $3)
                
                // Impuestos Fiscales (Calculados sobre la parte de FixGo)
                const calcIVA = calcFixGo * 0.16;             // 16% de IVA sobre la comisión
                const calcISR = calcFixGo * 0.30;             // 30% de ISR sobre utilidad

                // El técnico recibe: Total - (FixGo + Garantía + Stripe)
                const calcTecnico = monto - calcFixGo - calcGarantia - calcStripe;

                globalFixGo += calcFixGo;
                globalIVA += calcIVA;
                globalISR += calcISR;
                globalGarantia += calcGarantia;
                globalStripe += calcStripe;
                globalTecnico += calcTecnico;

                // Cálculo de Dinero Retenido (Servicios Ingresados < 24h)
                if (tx.fecha && tx.fecha.toDate) {
                    const fechaTx = tx.fecha.toDate();
                    const diffHoras = Math.abs(ahora - fechaTx) / 36e5;
                    if (diffHoras < 24) {
                        dineroRetenido += calcTecnico; 
                    }
                }
            }
        });

        // 🔥 CÁLCULO FINAL: UTILIDAD NETA
        const utilidadNetaReal = globalFixGo - globalIVA - globalISR;
        // 🔥 CÁLCULO STRIPE: El total ingresado menos lo que ya se retiró (Simulación)
        const saldoBoveda = totalFlujo - dineroRetiradoTecnicos;

        if(elementos.countMoney) {
            // Mostramos Ganancia Neta FixGo
            elementos.countMoney.innerText = `$${globalFixGo.toFixed(2)}`;
            if(elementos.countBovedaStripe) elementos.countBovedaStripe.innerText = `$${saldoBoveda.toFixed(2)}`;
            
            const cardParent = elementos.countMoney.closest('.uber-card');
            let desgloseContainer = cardParent.querySelector('.finance-breakdown');
            
            if(!desgloseContainer) {
                desgloseContainer = document.createElement('div');
                desgloseContainer.className = "finance-breakdown mt-3 pt-3 border-t border-white/10 text-[9px] text-gray-400 space-y-1";
                // Insertamos antes del div de bóveda para que quede ordenado
                cardParent.insertBefore(desgloseContainer, cardParent.children[1]); 
            }

            // Renderizado del Dashboard BI 
            desgloseContainer.innerHTML = `
                <div class="flex justify-between text-gray-300"><span>COMISIÓN FIXGO (32%):</span> <span>$${globalFixGo.toFixed(2)}</span></div>
                <div class="flex justify-between text-red-400"><span>IVA (16% s/FixGo):</span> <span>-$${globalIVA.toFixed(2)}</span></div>
                <div class="flex justify-between text-red-400"><span>ISR (30% s/FixGo):</span> <span>-$${globalISR.toFixed(2)}</span></div>
                <div class="flex justify-between font-bold text-yellow-500"><span>FONDO GARANTÍA (2%):</span> <span>$${globalGarantia.toFixed(2)}</span></div>
                <div class="flex justify-between text-gray-500"><span>STRIPE FEES (3.6%+$3):</span> <span>-$${globalStripe.toFixed(2)}</span></div>
                
                <div class="flex justify-between font-black text-white bg-emerald-600/30 px-2 py-1 rounded border border-emerald-500/50 my-2">
                    <span>💵 UTILIDAD NETA FIXGO:</span> <span>$${utilidadNetaReal.toFixed(2)}</span>
                </div>

                <div class="flex justify-between"><span class="text-blue-400 font-bold">TECNICOS (LÍQUIDO):</span> <span>$${(globalTecnico - dineroRetenido).toFixed(2)}</span></div>
                <div class="flex justify-between italic text-zinc-500 bg-black/20 px-1 rounded mb-2">
                    <span>⏳ RETENIDO (24h):</span> <span>$${dineroRetenido.toFixed(2)}</span>
                </div>
            `;
        }
    });

    // --- D. FUNCIONES DE ADMINISTRACIÓN ---

    // 🔥 AUDITORÍA REAL (SHARK MODE PARA CALIDAD)
    window.auditarServicio = async (sid) => {
        if(document.getElementById("modalAuditoria")) return;
        try {
            const docSnap = await getDoc(doc(db, "services", sid));
            if(!docSnap.exists()) return alert("Servicio no encontrado.");
            const s = docSnap.data();
            
            const fotoAntes = s.evidencia?.antes || 'https://via.placeholder.com/300x400?text=SIN+FOTO+ANTES';
            const fotoDespues = s.evidencia?.despues || 'https://via.placeholder.com/300x400?text=SIN+FOTO+DESPUES';

            const html = `
            <div id="modalAuditoria" class="fixed inset-0 bg-black/95 z-[70] flex items-center justify-center p-4 animate-fade-in">
                <div class="bg-zinc-900 w-full max-w-2xl rounded-3xl p-6 border border-zinc-700 shadow-2xl overflow-y-auto max-h-[90vh]">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-white font-black text-xl"><i class="fas fa-search text-purple-500"></i> AUDITORÍA DE CALIDAD</h3>
                        <button onclick="document.getElementById('modalAuditoria').remove()" class="text-gray-500 hover:text-white"><i class="fas fa-times text-xl"></i></button>
                    </div>
                    <p class="text-xs text-gray-400 mb-4 border-b border-zinc-800 pb-2">Folio: ${s.folio_fiscal || sid.substring(0,6).toUpperCase()} | Técnico: ${escaparHTML(s.tecnico_nombre)}</p>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="text-center">
                            <span class="bg-red-900/30 text-red-500 border border-red-500/50 text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest block mb-2">ANTES</span>
                            <img src="${fotoAntes}" class="w-full h-auto rounded-xl border border-zinc-700 object-cover shadow-lg" alt="Antes">
                        </div>
                        <div class="text-center">
                            <span class="bg-emerald-900/30 text-emerald-500 border border-emerald-500/50 text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest block mb-2">DESPUÉS</span>
                            <img src="${fotoDespues}" class="w-full h-auto rounded-xl border border-zinc-700 object-cover shadow-lg" alt="Despues">
                        </div>
                    </div>
                    <div class="mt-6 flex justify-end">
                        <button onclick="document.getElementById('modalAuditoria').remove()" class="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 px-6 rounded-lg text-sm transition-colors">CERRAR</button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', html);
        } catch(e) {
            console.error(e);
            alert("Error al cargar la auditoría.");
        }
    };

    // 🔥 FUNCION ADMIN: CAMBIO FORZADO DE FOTO DE PERFIL
    window.adminCambiarFotoTecnico = async (uid) => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if(!file) return;
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    await updateDoc(doc(db, "users", uid), {
                        foto_perfil: event.target.result,
                        fotoPerfil: event.target.result // Compatibilidad
                    });
                    alert("✅ Foto del técnico actualizada exitosamente por el Administrador.");
                    
                    // Recargar el modal para ver los cambios de inmediato
                    const modal = document.getElementById('modalExpediente');
                    if(modal) modal.remove();
                    window.verExpediente(uid); 
                } catch(err) {
                    console.error("Error subiendo foto:", err);
                    alert("Error al actualizar la foto de perfil en el servidor.");
                }
            };
            reader.readAsDataURL(file);
        };
        fileInput.click();
    };

    // 🔥 EXPEDIENTES DESBLOQUEADOS Y BLINDADOS (ADMIN VIEW V5.16.0)
    window.verExpediente = async (uid) => {
        if(document.getElementById("modalExpediente")) return;
        try {
            const docSnap = await getDoc(doc(db, "users", uid));
            if(!docSnap.exists()) return alert("Técnico no encontrado.");
            const t = docSnap.data();

            const fotoUrl = t.foto_perfil || t.fotoPerfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.nombre)}&background=random`;
            
            // --- Validaciones de Identidad ---
            const ineCheck = t.documentos?.ine ? '<span class="text-emerald-400"><i class="fas fa-check-circle"></i> Cargado</span>' : '<span class="text-red-500"><i class="fas fa-times-circle"></i> Faltante</span>';
            const csfCheck = t.documentos?.csf ? '<span class="text-emerald-400"><i class="fas fa-check-circle"></i> Cargado</span>' : '<span class="text-red-500"><i class="fas fa-times-circle"></i> Faltante</span>';

            // --- Validaciones de Logística Operativa (Vehículo y Licencia) ---
            const vehiculo = t.vehiculo || {};
            const tipoVehiculo = vehiculo.tipo || 'NO REGISTRADO';
            const placas = vehiculo.placas || 'N/A';
            const licenciaCheck = t.documentos?.licencia ? '<span class="text-emerald-400"><i class="fas fa-check-circle"></i> Vigente</span>' : '<span class="text-red-500"><i class="fas fa-times-circle"></i> Faltante</span>';

            // --- Validaciones de Certificados Técnicos ---
            let certsHTML = '';
            if (t.documentos && t.documentos.certificados && t.documentos.certificados.length > 0) {
                certsHTML = t.documentos.certificados.map(c => `<span class="bg-emerald-900/30 text-emerald-400 text-[9px] font-bold px-2 py-1 rounded border border-emerald-500/50 mr-1 mb-1 inline-block"><i class="fas fa-award"></i> Validado</span>`).join('');
            } else {
                certsHTML = '<span class="text-red-500 text-xs font-bold"><i class="fas fa-times-circle"></i> Sin documentos de respaldo</span>';
            }

            const html = `
            <div id="modalExpediente" class="fixed inset-0 bg-black/95 z-[70] flex items-center justify-center p-4 animate-fade-in">
                <div class="bg-zinc-900 w-full max-w-md rounded-3xl p-6 border border-zinc-700 shadow-2xl overflow-y-auto max-h-[90vh]">
                    <div class="flex justify-between items-start mb-6 border-b border-zinc-800 pb-4">
                        <div class="flex items-center gap-4">
                            <div class="relative inline-block">
                                <img src="${fotoUrl}" class="w-16 h-16 rounded-full border-2 border-blue-500 object-cover shadow-lg" alt="Foto">
                                <button onclick="window.adminCambiarFotoTecnico('${uid}')" class="absolute -bottom-2 -right-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center border-2 border-zinc-900 transition-colors shadow-lg" title="Cambiar Foto">
                                    <i class="fas fa-camera text-[10px]"></i>
                                </button>
                            </div>
                            <div>
                                <h3 class="text-white font-black text-lg uppercase">${escaparHTML(t.nombre)}</h3>
                                <p class="text-blue-400 text-xs font-bold">EXPEDIENTE CONFIDENCIAL</p>
                            </div>
                        </div>
                        <button onclick="document.getElementById('modalExpediente').remove()" class="text-gray-500 hover:text-white"><i class="fas fa-times text-xl"></i></button>
                    </div>

                    <div class="space-y-4">
                        <div class="bg-black p-3 rounded-xl border border-zinc-800">
                            <p class="text-[10px] text-gray-500 font-bold uppercase mb-1"><i class="fas fa-university"></i> Datos Bancarios</p>
                            <p class="text-sm text-white font-mono">Banco: <span class="text-emerald-400">${escaparHTML(t.banco || 'NO REGISTRADO')}</span></p>
                            <p class="text-sm text-white font-mono">CLABE: <span class="text-emerald-400">${escaparHTML(t.clabe || 'NO REGISTRADA')}</span></p>
                        </div>

                        <div class="bg-black p-3 rounded-xl border border-zinc-800">
                            <p class="text-[10px] text-gray-500 font-bold uppercase mb-1"><i class="fas fa-id-card"></i> Identidad y Fiscal</p>
                            <div class="flex justify-between text-sm mb-1">
                                <span class="text-white">INE/ID:</span> ${ineCheck}
                            </div>
                            <div class="flex justify-between text-sm">
                                <span class="text-white">Constancia Fiscal (CSF):</span> ${csfCheck}
                            </div>
                        </div>

                        <div class="bg-black p-3 rounded-xl border border-zinc-800">
                            <p class="text-[10px] text-gray-500 font-bold uppercase mb-1"><i class="fas fa-motorcycle"></i> Logística Operativa</p>
                            <div class="flex justify-between items-center mb-1">
                                <span class="text-sm text-white">Vehículo:</span>
                                <span class="text-sm text-blue-400 font-bold uppercase">${escaparHTML(tipoVehiculo)}</span>
                            </div>
                            <div class="flex justify-between items-center mb-1">
                                <span class="text-sm text-white">Placas:</span>
                                <span class="text-sm text-blue-400 font-mono uppercase bg-blue-900/30 px-2 py-0.5 rounded border border-blue-500/30">${escaparHTML(placas)}</span>
                            </div>
                            <div class="flex justify-between text-sm mt-2 border-t border-zinc-800 pt-2">
                                <span class="text-white">Licencia de Conducir:</span> ${licenciaCheck}
                            </div>
                        </div>

                        <div class="bg-black p-3 rounded-xl border border-zinc-800">
                            <p class="text-[10px] text-gray-500 font-bold uppercase mb-2"><i class="fas fa-certificate"></i> Credenciales y Especialidades</p>
                            <div class="flex flex-wrap">
                                ${certsHTML}
                            </div>
                        </div>
                        
                        <div class="bg-black p-3 rounded-xl border border-zinc-800">
                            <p class="text-[10px] text-gray-500 font-bold uppercase mb-1"><i class="fas fa-phone"></i> Contacto</p>
                            <p class="text-sm text-white font-mono">${escaparHTML(t.telefono || 'Sin teléfono')}</p>
                            <p class="text-xs text-gray-400">${escaparHTML(t.email || 'Sin correo')}</p>
                        </div>
                    </div>

                    <div class="mt-6">
                        <button onclick="document.getElementById('modalExpediente').remove()" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-sm transition-colors shadow-lg">
                            CERRAR EXPEDIENTE
                        </button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', html);
        } catch(e) {
            console.error(e);
            alert("Error al cargar expediente.");
        }
    };

    window.aprobarTecnico = async (uid) => {
        if(!confirm("¿Estás seguro de aprobar a este técnico? Tendrá acceso inmediato a ver solicitudes y aceptar trabajos.")) return;
        try {
            await updateDoc(doc(db, "users", uid), {
                estado: "activo",
                status: "activo",
                verificado: true,
                nivel: "BRONCE",
                reputacion: 5.0,
                servicios_completados: 0,
                aprobadoEn: serverTimestamp()
            });
            alert(" ✅  Técnico Aprobado y Activado exitosamente.");
        } catch (error) {
            console.error(error);
            alert("Error al aprobar técnico en base de datos.");
        }
    };

    window.aplicarPenalizacionManual = async (uid) => {
        const motivo = prompt("Describe el motivo de la penalización:");
        if (!motivo) return;
        const monto = parseFloat(prompt("Monto a descontar de su Wallet ($):", "50"));
        if (isNaN(monto)) return;

        try {
            await addDoc(collection(db, "transacciones"), {
                tecnico_id: uid,
                pago_tecnico: -Math.abs(monto),
                monto_total: 0,
                tipo: "penalizacion",
                descripcion: `Admin: ${motivo}`,
                fecha: serverTimestamp()
            });
            
            // Bajamos reputación manualmente
            await updateDoc(doc(db, "users", uid), {
                reputacion: increment(-0.5)
            });

            alert(`⛔ Penalización de $${monto} aplicada al técnico.`);
        } catch (e) {
            console.error(e);
            alert("Error al aplicar penalización.");
        }
    };
    window.registrarPagoTecnico = async (uid, nombre) => {
        const monto = parseFloat(prompt(`¿Cuánto dinero te depositó / pagó ${nombre} para abonar a su deuda? ($):`, "0"));
        if (isNaN(monto) || monto <= 0) return;

        if(!confirm(`¿Confirmas que recibiste $${monto} de ${nombre}? Esto borrará o reducirá su deuda en el sistema.`)) return;

        try {
            await addDoc(collection(db, "transacciones"), {
                tecnico_id: uid,
                pago_tecnico: Math.abs(monto), // Inyecta saldo positivo para contrarrestar la deuda
                monto_total: 0,
                tipo: "abono_deuda",
                descripcion: `Admin: Abono de deuda recibido (SPEI/OXXO)`,
                fecha: serverTimestamp()
            });
            alert(`✅ Abono de $${monto} registrado con éxito. La billetera del técnico se ha liberado.`);
        } catch (e) {
            console.error(e);
            alert("Error al registrar el abono en la base de datos.");
        }
    };

    window.abrirGestorCatalogo = async () => {
        const modal = document.getElementById("modalCatalogo");
        const container = document.getElementById("gridConfiguracion");
        if (modal) modal.classList.remove("hidden");
        
        const docRef = doc(db, "configuracion", "catalogo_global");
        const docSnap = await getDoc(docRef);
        let config = {}; 
        if(docSnap.exists()) config = docSnap.data();

        const MASTER_STRUCTURE = {
            "ROAD (Auxilio Vial)": [
                { id: "road_llanta", label: "Llantera Móvil" },
                { id: "road_cerrajero", label: "Cerrajería" },
                { id: "road_grua", label: "Grúas" },
                { id: "road_mecanico", label: "Mecánico Gral." },
                { id: "road_corriente", label: "Paso Corriente" }
            ],
            "FIX (Hogar)": [
                { id: "fix_electricidad", label: "Electricidad" },
                { id: "fix_plomeria", label: "Plomería" },
                { id: "fix_ac", label: "Aires Acondicionad." },
                { id: "fix_jardin", label: "Jardinería" },
                { id: "fix_pintura", label: "Pintura" },
                { id: "fix_alberca", label: "Albercas" },
                { id: "fix_fumigacion", label: "Fumigación" }
            ],
            "MAINT (B2B)": [
                { id: "maint_general", label: "Mantenimiento Gral." }
            ],
            "TECH (Sistemas)": [
                { id: "tech_cctv", label: "CCTV" },
                { id: "tech_alarma", label: "Alarmas" },
                { id: "tech_acceso", label: "Accesos" },
                { id: "tech_elevador", label: "Elevadores" },
                { id: "tech_planta", label: "Plantas Eléc." },
                { id: "tech_solar", label: "Paneles Solares" }
            ]
        };

        if (container) {
            container.innerHTML = "";
            let html = "";
            
            for (const [categoria, servicios] of Object.entries(MASTER_STRUCTURE)) {
                html += `
                <div class="mb-4 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
                    <h4 class="text-emerald-500 font-bold text-xs uppercase mb-3 border-b border-zinc-700 pb-1">${categoria}</h4>
                    <div class="space-y-2">`;
                
                servicios.forEach(srv => {
                    const isChecked = config[srv.id] === true;
                    html += generarSwitchGranular(srv.id, srv.label, isChecked);
                });
                
                html += `</div></div>`;
            }
            container.innerHTML = html;
        }
    };

    window.guardarConfiguracionGlobal = async () => {
        const inputs = document.querySelectorAll('input[id^="cfg_"]');
        let nuevaConfig = {
            updatedAt: serverTimestamp() 
        };

        inputs.forEach(input => {
            const realId = input.id.replace("cfg_", "");
            nuevaConfig[realId] = input.checked;
        });
        
        try {
            await setDoc(doc(db, "configuracion", "catalogo_global"), nuevaConfig);
            alert("✅ Catálogo actualizado. Disponibilidad sincronizada con clientes en tiempo real.");
            document.getElementById("modalCatalogo").classList.add("hidden");
        } catch (e) {
            console.error(e);
            alert("Error al guardar configuración global.");
        }
    };

    if(elementos.btnToggleHistorialRetiros) {
        let mostrandoHistorial = false;
        elementos.btnToggleHistorialRetiros.onclick = () => {
            mostrandoHistorial = !mostrandoHistorial;
            if(mostrandoHistorial) {
                elementos.vistaRetirosPendientes.classList.add("hidden");
                elementos.vistaHistorialRetiros.classList.remove("hidden");
                elementos.btnToggleHistorialRetiros.innerHTML = '<i class="fas fa-arrow-left"></i> Volver a Pendientes';
                elementos.btnToggleHistorialRetiros.classList.replace("text-zinc-300", "text-emerald-400");
            } else {
                elementos.vistaRetirosPendientes.classList.remove("hidden");
                elementos.vistaHistorialRetiros.classList.add("hidden");
                elementos.btnToggleHistorialRetiros.innerHTML = '<i class="fas fa-history"></i> Historial';
                elementos.btnToggleHistorialRetiros.classList.replace("text-emerald-400", "text-zinc-300");
            }
        };
    }

    if (elementos.listaRetiros) {
        const qRetiros = query(collection(db, "retiros"), where("estado", "==", "pendiente"), orderBy("fecha_solicitud", "asc"));
        
        onSnapshot(qRetiros, (snap) => {
            elementos.listaRetiros.innerHTML = "";
            if(snap.empty) {
                elementos.listaRetiros.innerHTML = '<p class="text-gray-500 italic text-sm text-center mt-10">No hay retiros pendientes.</p>';
                return;
            }

            snap.forEach(docSnap => {
                const ret = docSnap.data();
                const id = docSnap.id;
                
                let fechaFormat = "";
                if(ret.fecha_solicitud) {
                    const dateObj = new Date(ret.fecha_solicitud.seconds * 1000);
                    fechaFormat = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                }

                const card = document.createElement("div");
                card.className = "p-4 bg-emerald-900/10 border border-emerald-500/30 rounded-xl mb-3 shadow-lg";
                card.innerHTML = `
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <p class="text-white font-bold text-sm uppercase">${escaparHTML(ret.tecnico_nombre)}</p>
                            <p class="text-[10px] text-gray-400">${fechaFormat}</p>
                        </div>
                        <span class="bg-yellow-500 text-black text-[9px] font-black px-2 py-1 rounded animate-pulse">PENDIENTE</span>
                    </div>
                    <p class="text-2xl font-black text-emerald-400 mb-3">$${ret.monto.toFixed(2)}</p>
                    <button id="btn_aprobar_${id}" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg text-xs shadow-lg transition-all transform hover:scale-105" onclick="window.aprobarRetiro('${id}', '${ret.tecnico_id}', ${ret.monto})">
                        <i class="fas fa-check-double"></i> MARCAR COMO PAGADO (SPEI)
                    </button>
                `;
                elementos.listaRetiros.appendChild(card);
            });
        });

        window.aprobarRetiro = async (retiroId, tecnicoId, monto) => {
            if(!confirm("¿Confirmas que ya realizaste la transferencia SPEI por $"+monto.toFixed(2)+"?\n\nEsto descontará el saldo de la wallet del técnico en automático.")) return;
            
            const btn = document.getElementById(`btn_aprobar_${retiroId}`);
            if(btn) {
                btn.disabled = true;
                btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> PROCESANDO...`;
                btn.classList.remove("hover:bg-emerald-500", "hover:scale-105");
                btn.classList.add("opacity-50", "cursor-not-allowed");
            }

            try {
                await updateDoc(doc(db, "retiros", retiroId), {
                    estado: "aprobado",
                    fecha_aprobacion: serverTimestamp()
                });

                await addDoc(collection(db, "transacciones"), {
                    servicio_id: "RETIRO_SPEI_" + retiroId.substring(0,5),
                    tecnico_id: tecnicoId,
                    monto_total: 0,
                    comision_fixgo: 0,
                    retencion_iva: 0,
                    retencion_isr: 0,
                    pago_tecnico: -Math.abs(monto), 
                    fecha: serverTimestamp(),
                    tipo: "retiro_fondos"
                });

                alert("✅ Retiro procesado exitosamente. Wallet del técnico actualizada.");
            } catch (error) {
                console.error("Error al procesar retiro:", error);
                alert("❌ Error de conexión al procesar el retiro en Firebase.");
                if(btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fas fa-check-double"></i> MARCAR COMO PAGADO (SPEI)`;
                    btn.classList.add("hover:bg-emerald-500", "hover:scale-105");
                    btn.classList.remove("opacity-50", "cursor-not-allowed");
                }
            }
        };
    }

    if (elementos.listaHistorialRetiros) {
        const qHistorialRetiros = query(
            collection(db, "retiros"), 
            where("estado", "==", "aprobado"), 
            orderBy("fecha_aprobacion", "desc")
        );
        
        onSnapshot(qHistorialRetiros, (snap) => {
            elementos.listaHistorialRetiros.innerHTML = "";
            if(snap.empty) {
                elementos.listaHistorialRetiros.innerHTML = '<p class="text-gray-500 italic text-xs text-center mt-4">Aún no hay retiros procesados.</p>';
                return;
            }

            snap.forEach(docSnap => {
                const ret = docSnap.data();
                
                let fechaFormat = "";
                if(ret.fecha_aprobacion) {
                    const dateObj = new Date(ret.fecha_aprobacion.seconds * 1000);
                    fechaFormat = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                }

                const card = document.createElement("div");
                card.className = "p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-xl mb-2 flex justify-between items-center";
                card.innerHTML = `
                    <div>
                        <p class="text-white font-bold text-xs uppercase">${escaparHTML(ret.tecnico_nombre)}</p>
                        <p class="text-[9px] text-gray-500"><i class="fas fa-check-double text-emerald-500"></i> ${fechaFormat}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm font-black text-emerald-400">$${ret.monto.toFixed(2)}</p>
                        <p class="text-[8px] text-zinc-500 uppercase tracking-widest">Liquidado</p>
                    </div>
                `;
                elementos.listaHistorialRetiros.appendChild(card);
            });
        }, (error) => {
            console.error("Error historial retiros (¿Falta índice?):", error);
            elementos.listaHistorialRetiros.innerHTML = '<p class="text-red-500 italic text-xs text-center mt-4">Construyendo índice en Firebase... (Recarga en 3 min)</p>';
        });
    }
}

function generarSwitchGranular(id, label, checked) {
    return `
    <div class="flex justify-between items-center bg-black p-2 rounded-lg border border-zinc-800">
        <span class="text-gray-300 text-xs">${label}</span>
        <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" id="cfg_${id}" class="sr-only peer" ${checked ? 'checked' : ''}>
            <div class="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
        </label>
    </div>`;
}
// ======================================================================================
// ======================================================================================
// 2. PANEL DE TÉCNICO (SOCIO OPERADOR + SISTEMA DE REPUTACIÓN V5.16.0 SHARK MODE)
// ======================================================================================
export async function iniciarPanelTecnico(user) {
    console.log(" 🔧  Iniciando Panel de Técnico (Modo Uber Cash / Billetera Negativa / Shark Blindaje)...");
    
    const elementos = {
        statusLabel: document.getElementById("statusLabel"),
        toggleONOFF: document.getElementById("toggleONOFF"),
        radarSection: document.getElementById("radarSection"),
        seccionBolsa: document.getElementById("seccionBolsa"),
        listaBolsa: document.getElementById("listaBolsa"),
        listaServicios: document.getElementById("listaServicios"),
        panelAcciones: document.getElementById("panelAcciones"),
        btnEnCamino: document.getElementById("btnEnCamino"),
        btnLlegue: document.getElementById("btnLlegue"),
        walletLabel: document.getElementById("walletSaldo"),
        btnRetiro: document.getElementById("btnRetiro"),
        contenedorHistorialRetiros: document.getElementById("contenedorHistorialRetiros"),
        listaMisRetiros: document.getElementById("listaMisRetiros"),
        listaMisTickets: document.getElementById("listaMisTickets"),
        badgeNivel: document.getElementById("badgeNivel"),
        contenedorEstrellas: document.getElementById("contenedorEstrellas"),
        txtServicios: document.getElementById("txtServicios"),
        fotoPerfil: document.getElementById("fotoPerfil"),
        fotoIcono: document.getElementById("fotoIcono")
    };

    const tecnicoRef = doc(db, "users", user.uid);
    onSnapshot(tecnicoRef, (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        const estado = data.estado || "pendiente";

        // --- 🌟 RENDERIZADO DE ESTRELLAS, NIVEL Y FOTO ---
        const reputacion = data.reputacion || 5.0;
        const estrellas = "⭐".repeat(Math.round(reputacion));
        const nivel = data.nivel || "BRONCE";
        
        let colorNivel = "text-orange-500 bg-orange-600/20 border-orange-500/30";
        if(nivel === "PLATA") colorNivel = "text-gray-300 bg-gray-600/20 border-gray-500/30";
        if(nivel === "ORO") colorNivel = "text-yellow-400 bg-yellow-600/20 border-yellow-500/30";

        if(elementos.badgeNivel) {
            elementos.badgeNivel.className = `${colorNivel} text-[10px] font-black px-2 py-0.5 rounded border`;
            elementos.badgeNivel.innerText = `NIVEL ${nivel}`;
        }
        if(elementos.contenedorEstrellas) {
            elementos.contenedorEstrellas.innerHTML = `${estrellas} <span class="text-[10px] text-gray-500 font-bold ml-1">(${reputacion.toFixed(1)})</span>`;
        }
        if(elementos.txtServicios) {
            elementos.txtServicios.classList.remove("hidden");
            elementos.txtServicios.innerText = `${data.servicios_completados || 0} SERVICIOS FINALIZADOS`;
        }
        if(elementos.fotoPerfil && elementos.fotoIcono) {
            if(data.foto_perfil || data.fotoPerfil) {
                elementos.fotoPerfil.src = data.foto_perfil || data.fotoPerfil;
                elementos.fotoPerfil.classList.remove("hidden");
                elementos.fotoIcono.classList.add("hidden");
            } else {
                elementos.fotoPerfil.classList.add("hidden");
                elementos.fotoIcono.classList.remove("hidden");
            }
        }

        if (estado === "pendiente") {
            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "EN REVISIÓN";
                elementos.statusLabel.className = "bg-yellow-500/20 text-yellow-500 status-badge font-bold";
            }
            if(elementos.toggleONOFF) {
                elementos.toggleONOFF.disabled = true;
                elementos.toggleONOFF.checked = false;
            }
            if(elementos.radarSection) elementos.radarSection.classList.add("hidden");
            if(elementos.seccionBolsa) {
                elementos.seccionBolsa.innerHTML = `
                <div class="p-6 bg-yellow-900/10 border border-yellow-500/30 rounded-2xl text-center">
                    <i class="fas fa-lock text-yellow-500 text-2xl mb-2"></i>
                    <p class="text-yellow-500 text-sm font-bold">Cuenta en Revisión</p>
                    <p class="text-gray-500 text-xs mt-1">El administrador está validando tus documentos.</p>
                </div>
                `;
            }
            return;
        }

        if (elementos.toggleONOFF) {
            elementos.toggleONOFF.disabled = false;
            elementos.toggleONOFF.checked = data.disponible === true;
        }

        if (data.disponible) {
            iniciarTracking(user.uid);
            elementos.seccionBolsa?.classList.remove("hidden");
            escucharBolsa(user, elementos.listaBolsa); 

            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "EN LÍNEA";
                elementos.statusLabel.className = "bg-emerald-500/20 text-emerald-500 status-badge font-bold animate-pulse";
            }
            elementos.radarSection?.classList.remove("opacity-50", "grayscale");
        } else {
            detenerTracking();
            elementos.seccionBolsa?.classList.add("hidden");

            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "OFFLINE";
                elementos.statusLabel.className = "bg-red-500/20 text-red-500 status-badge font-bold";
            }
            elementos.radarSection?.classList.add("opacity-50", "grayscale");
        }
    });

    const qWallet = query(collection(db, "transacciones"), where("tecnico_id", "==", user.uid));
    const qRetirosPendientes = query(collection(db, "retiros"), where("tecnico_id", "==", user.uid), where("estado", "==", "pendiente"));
    
    let saldoBrutoDisponible = 0;
    let saldoRetenido = 0;
    let retirosEnProceso = 0;

    onSnapshot(qWallet, (snap) => {
        saldoBrutoDisponible = 0;
        saldoRetenido = 0;
        const ahora = new Date();

        snap.forEach(docSnap => {
            const tx = docSnap.data();
            const monto = (tx.pago_tecnico || 0);
            
            // En V5.15.0 el pago_tecnico para servicios finalizados en efectivo es NEGATIVO.
            // Por lo tanto, se irá restando automáticamente de saldoBrutoDisponible.
            if (tx.tipo === "retiro_fondos" || tx.tipo === "penalizacion") { 
                saldoBrutoDisponible += monto; 
            } else {
                if (tx.fecha && tx.fecha.toDate) {
                    const fechaTx = tx.fecha.toDate();
                    const diffHoras = Math.abs(ahora - fechaTx) / 36e5;

                    if (diffHoras >= 24) {
                        saldoBrutoDisponible += monto;
                    } else {
                        saldoRetenido += monto;
                    }
                } else {
                    saldoRetenido += monto;
                }
            }
        });
        
        actualizarUIWallet();
    });

    onSnapshot(qRetirosPendientes, (snap) => {
        retirosEnProceso = 0;
        snap.forEach(docSnap => {
            retirosEnProceso += docSnap.data().monto;
        });
        actualizarUIWallet();
    });

    function actualizarUIWallet() {
        // En Modelo Efectivo, esto normalmente será un número negativo (Deuda)
        const saldoRealDisponible = saldoBrutoDisponible - retirosEnProceso;

        // Formateo para que se vea bonito (-$320.00 en lugar de $-320.00)
        let saldoFormat = saldoRealDisponible < 0 ? "-$" + Math.abs(saldoRealDisponible).toFixed(2) : "$" + saldoRealDisponible.toFixed(2);

        if(elementos.walletLabel) {
            elementos.walletLabel.innerHTML = `
                ${saldoFormat}
                <span class="text-[9px] text-gray-400 block font-normal">EN PROCESO: $${saldoRetenido.toFixed(2)}</span>
            `;
            
            // Si la deuda supera -$1000, parpadea agresivo
            if(saldoRealDisponible <= -1000) {
                 elementos.walletLabel.classList.add("animate-pulse"); 
            } else {
                 elementos.walletLabel.classList.remove("animate-pulse");
            }
        }

        // El botón de retiro original está oculto en el HTML V5.15.0, pero mantenemos la lógica base
        if(elementos.btnRetiro) {
            if(retirosEnProceso > 0) {
                elementos.btnRetiro.disabled = true;
                elementos.btnRetiro.onclick = null;
            } 
            else if(saldoRealDisponible > 0) {
                elementos.btnRetiro.disabled = false;
                elementos.btnRetiro.onclick = async () => {
                    if(!confirm(`¿Deseas solicitar el retiro de $${saldoRealDisponible.toFixed(2)} a tu cuenta vía SPEI?`)) return;
                    elementos.btnRetiro.disabled = true;
                    try {
                        await addDoc(collection(db, "retiros"), {
                            tecnico_id: user.uid,
                            tecnico_nombre: user.nombre || "Técnico",
                            monto: saldoRealDisponible,
                            estado: "pendiente",
                            fecha_solicitud: serverTimestamp()
                        });
                        alert("✅ Solicitud de retiro enviada con éxito.");
                    } catch (error) {
                        console.error("Error al solicitar retiro:", error);
                        alert("❌ Hubo un error al procesar tu solicitud. Intenta de nuevo.");
                        elementos.btnRetiro.disabled = false;
                    }
                };
            } else {
                elementos.btnRetiro.disabled = true;
                elementos.btnRetiro.onclick = null;
            }
        }
    }

    if (elementos.listaMisRetiros && elementos.contenedorHistorialRetiros) {
        const qMisRetiros = query(
            collection(db, "retiros"),
            where("tecnico_id", "==", user.uid),
            where("estado", "==", "aprobado"),
            orderBy("fecha_aprobacion", "desc")
        );

        onSnapshot(qMisRetiros, (snap) => {
            elementos.listaMisRetiros.innerHTML = "";
            if(snap.empty) {
                elementos.contenedorHistorialRetiros.classList.add("hidden");
                return;
            }

            elementos.contenedorHistorialRetiros.classList.remove("hidden");

            snap.forEach(docSnap => {
                const ret = docSnap.data();
                const id = docSnap.id;
                
                let fechaFormat = "";
                if(ret.fecha_aprobacion) {
                    const dateObj = new Date(ret.fecha_aprobacion.seconds * 1000);
                    fechaFormat = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                }

                const item = document.createElement("div");
                item.className = "flex justify-between items-center bg-zinc-900 border border-zinc-800 p-3 rounded-xl shadow-lg";
                item.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-emerald-900/30 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                            <i class="fas fa-check text-xs"></i>
                        </div>
                        <div>
                            <p class="text-white font-bold text-sm">$${ret.monto.toFixed(2)}</p>
                            <p class="text-[9px] text-gray-500">${fechaFormat} • LIQUIDADO</p>
                        </div>
                    </div>
                    <button onclick="window.generarPDFRetiro('${id}')" class="text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-2 rounded-lg text-[10px] font-bold transition-colors flex items-center gap-1 border border-emerald-500/30 shadow">
                        <i class="fas fa-download"></i> PDF
                    </button>
                `;
                elementos.listaMisRetiros.appendChild(item);
            });
        }, (error) => {
            console.warn("Falta índice compuesto para historial de retiros del técnico.", error);
            elementos.listaMisRetiros.innerHTML = '<p class="text-red-500 text-[10px] text-center p-2 border border-red-500/30 rounded-xl bg-red-900/10">Construyendo índice en Firebase... (Recarga en 3 min)</p>';
            elementos.contenedorHistorialRetiros.classList.remove("hidden");
        });
    }

    if (elementos.listaMisTickets) {
        const qMisTickets = query(
            collection(db, "services"),
            where("tecnico_id", "==", user.uid),
            where("estado", "==", "finalizado"),
            orderBy("finalizado_at", "desc")
        );

        onSnapshot(qMisTickets, (snap) => {
            elementos.listaMisTickets.innerHTML = "";
            if(snap.empty) {
                elementos.listaMisTickets.innerHTML = '<p class="text-gray-600 text-[10px] text-center italic py-4">Aún no tienes servicios finalizados.</p>';
                return;
            }

            snap.forEach(docSnap => {
                const s = docSnap.data();
                const id = docSnap.id;
                
                let fechaFormat = "";
                const ahora = new Date();
                let esRetenido = true;

                if(s.finalizado_at) {
                    const dateObj = new Date(s.finalizado_at.seconds * 1000);
                    fechaFormat = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    
                    const diffHoras = Math.abs(ahora - dateObj) / 36e5;
                    if (diffHoras >= 24) esRetenido = false;
                }

                // En Fase 0 ya no hay retención bancaria, el técnico tiene el dinero en su bolsa de inmediato.
                // Ajustamos el badge a "COBRADO"
                const badgeStatus = '<span class="bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 text-[8px] px-2 py-0.5 rounded font-black tracking-widest uppercase"><i class="fas fa-check-circle"></i> COBRADO</span>';

                const item = document.createElement("div");
                item.className = "bg-zinc-900 border border-zinc-800 p-3 rounded-xl shadow-lg";
                item.innerHTML = `
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-white font-bold text-xs uppercase">${escaparHTML(s.categoria)} | ${escaparHTML(s.sub_servicio || 'GRAL')}</span>
                        ${badgeStatus}
                    </div>
                    <div class="flex justify-between items-end">
                        <div>
                            <p class="text-[9px] text-gray-500 mb-1"><i class="fas fa-calendar-alt"></i> ${fechaFormat}</p>
                            <p class="text-[9px] text-gray-500"><i class="fas fa-hashtag"></i> Folio: ${s.folio_fiscal || id.substring(0,6).toUpperCase()}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-[10px] text-gray-500 mb-0.5 uppercase font-bold">Cobro en Efectivo:</p>
                            <p class="text-emerald-400 font-black text-sm">$${s.costo_final ? s.costo_final.toFixed(2) : '0.00'}</p>
                        </div>
                    </div>
                `;
                elementos.listaMisTickets.appendChild(item);
            });
        }, (error) => {
            console.warn("Falta índice compuesto para historial de tickets del técnico.", error);
            elementos.listaMisTickets.innerHTML = '<p class="text-red-500 text-[10px] text-center p-2 border border-red-500/30 rounded-xl bg-red-900/10">Construyendo índice de tickets en Firebase... (Recarga en 3 min)</p>';
        });
    }

    if (elementos.toggleONOFF) {
        elementos.toggleONOFF.addEventListener("change", async (e) => {
            await updateDoc(tecnicoRef, {
                disponible: e.target.checked,
                last_seen: serverTimestamp()
            });
        });
    }

    function escucharBolsa(tecnico, contenedor) {
        if(!contenedor) return;
        // 🛡️ ESCUDO RAM: Dibuja máximo 50 tickets en la bolsa a la vez
        const q = query(collection(db, "services"), where("estado", "==", "pendiente"), orderBy("created_at", "desc"), limit(50));

        onSnapshot(q, (snap) => {
            contenedor.innerHTML = "";
            let counter = 0;

            if(snap.empty) {
                contenedor.innerHTML = `<p class="text-gray-600 text-[10px] text-center italic py-4">Escaneando zona... esperando solicitudes.</p>`;
                return;
            }

            if(snap.docChanges().some(change => change.type === 'added')) {
                console.log(" 🔔  Nueva solicitud detectada en Bolsa: SONANDO ALERTA");
                sonarAlerta();
            }

            snap.forEach((docSnap) => {
                const s = docSnap.data();
                const id = docSnap.id;

                if (s.rejected_by && s.rejected_by.includes(tecnico.uid)) {
                    return; 
                }

                const misSkills = tecnico.skills || [];
                if (s.categoria && misSkills.length > 0 && !misSkills.includes(s.categoria)) {
                    return; 
                }

                counter++; 

                const card = document.createElement("div");
                card.className = "bg-zinc-900 border border-zinc-700 p-4 rounded-xl mb-3 animate-pulse border-emerald-500 shadow-lg shadow-emerald-900/20";

                card.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <span class="bg-emerald-500 text-black text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">NUEVA SOLICITUD</span>
                    <span class="text-white font-bold text-xs">${s.categoria ? escaparHTML(s.categoria.toUpperCase()) : 'GENERAL'}</span>
                </div>
                <h4 class="text-white font-bold text-base mb-1">${escaparHTML(s.zona || 'Cancún')}</h4>
                <p class="text-gray-300 text-sm mb-3 font-medium italic">"${escaparHTML(s.descripcion)}"</p>
                <div class="flex items-center gap-2 mb-3 text-xs text-gray-500">
                    <i class="fas fa-map-marker-alt"></i> ${escaparHTML(s.direccion)}
                </div>
                
                <div class="flex gap-2">
                    <button class="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 font-bold py-3 rounded-lg text-xs transition-colors" onclick="window.rechazarServicio('${id}', '${tecnico.uid}')">
                        <i class="fas fa-times"></i>
                    </button>
                    <button class="flex-[4] bg-emerald-500 hover:bg-emerald-400 text-black font-black py-3 rounded-lg text-xs uppercase transition-all transform active:scale-95" onclick="window.tomarServicio('${id}', '${tecnico.uid}', '${tecnico.nombre}')">
                        ACEPTAR (EFECTIVO)
                    </button>
                </div>
                `;
                contenedor.appendChild(card);
            });

            if (counter === 0) {
                contenedor.innerHTML = `<p class="text-gray-600 text-[10px] text-center italic py-4">No hay solicitudes disponibles para tu perfil.</p>`;
            }
        });
    }

    window.rechazarServicio = async (id, uid) => {
        if(!confirm("¿Estás seguro de ocultar esta solicitud?\n\nNo podrás verla nuevamente, pero seguirá disponible para otros técnicos.")) return;
        
        try {
            await updateDoc(doc(db, "services", id), {
                rejected_by: arrayUnion(uid)
            });
        } catch (error) {
            console.error(error);
            alert("Error al intentar rechazar el servicio. Intenta de nuevo.");
        }
    };

    // 🔥 BLINDAJE ANTI-COLISIÓN (TRANSACCIONES ATÓMICAS)
    window.tomarServicio = async (id, uid, nombre) => {
        const qCheck = query(
            collection(db, "services"), 
            where("tecnico_id", "==", uid),
            where("estado", "in", ["asignado", "en_camino", "en_sitio", "cotizando", "trabajando"])
        );
        
        const snapCheck = await getDocs(qCheck);
        if (!snapCheck.empty) {
            alert("⛔ BLOQUEO DE SEGURIDAD\n\nYa tienes un servicio activo. Debes finalizarlo antes de tomar otro.");
            return;
        }

        if(!confirm("¿Aceptar este servicio? \n\nRecuerda cobrar en efectivo al cliente al finalizar.")) return;
        
        try {
            const serviceRef = doc(db, "services", id);
            
            // EL TÚNEL CUÁNTICO: Garantiza que nadie más toque este documento al mismo tiempo
            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(serviceRef);
                
                if (!sfDoc.exists()) {
                    throw "ERROR_NO_EXISTE";
                }

                if (sfDoc.data().estado !== "pendiente") {
                    throw "ERROR_COLISION"; // ¡Otro técnico ganó la carrera!
                }

                transaction.update(serviceRef, {
                    estado: "asignado",
                    tecnico_id: uid,
                    tecnico_nombre: nombre,
                    tecnico_telefono: user.telefono || "",
                    asignado_at: serverTimestamp() // Importante para calcular penalización por tiempo
                });
            });
            
            console.log("🚀 Transacción Atómica Exitosa: Ticket asegurado.");
        } catch (error) {
            console.error(error);
            if (error === "ERROR_COLISION") {
                alert("💥 ¡COLISIÓN EVITADA!\n\nFuiste demasiado lento. Otro técnico aceptó este servicio milisegundos antes que tú.");
            } else {
                alert("Error al procesar la solicitud en el servidor. Intenta de nuevo.");
            }
        }
    };

    const qMisiones = query(
        collection(db, "services"),
        where("tecnico_id", "==", user.uid),
        where("estado", "in", ["asignado", "en_camino", "en_sitio", "cotizando", "trabajando"])
    );
    onSnapshot(qMisiones, (snap) => {
        const ls = elementos.listaServicios;
        const pa = elementos.panelAcciones;

        if (!ls) return;
        ls.innerHTML = "";

        if (snap.empty) {
            if(pa) pa.classList.add("translate-y-full");
            return;
        }

        if(pa) pa.classList.remove("translate-y-full");
        
        snap.forEach((docSnap) => {
            const s = docSnap.data();
            const id = docSnap.id;

            const destinoWaze = s.coords
                ? `${s.coords.lat},${s.coords.lng}`
                : encodeURIComponent(s.direccion);

            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-blue-500/50 p-6 rounded-2xl relative overflow-hidden mb-4 shadow-xl";
            card.innerHTML = `
            <div class="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase">
                ${s.estado.replace('_', ' ')}
            </div>
            <h3 class="text-xl font-black text-white mb-1 uppercase">${escaparHTML(s.categoria)}</h3>
            <p class="text-gray-400 text-sm mb-4">
                <i class="fas fa-map-marker-alt text-blue-500"></i> ${escaparHTML(s.direccion)}
            </p>
            <div class="bg-black/50 p-4 rounded-xl mb-4">
                <p class="text-xs text-gray-500 uppercase font-bold mb-1">Problema:</p>
                <p class="text-sm text-white italic">"${escaparHTML(s.descripcion)}"</p>
            </div>
            <div class="flex gap-2">
                <a href="https://waze.com/ul?q=${destinoWaze}" target="_blank" class="flex-1 bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 rounded-xl text-center text-sm transition-colors">
                    <i class="fab fa-waze"></i> IR CON WAZE
                </a>
                <a href="tel:${s.cliente_telefono}" class="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-xl text-center transition-colors">
                    <i class="fas fa-phone"></i>
                </a>
            </div>
            <div class="mt-4 border-t border-white/5 pt-4 text-center">
                <button onclick="window.cancelarMisionActiva('${id}')" class="text-red-500 text-xs font-bold underline hover:text-red-400">
                    CANCELAR SERVICIO (RIESGO PENALIZACIÓN)
                </button>
            </div>
            `;
            ls.appendChild(card);

            const btn1 = elementos.btnEnCamino;
            const btn2 = elementos.btnLlegue;

            btn1.classList.add("hidden");
            btn2.classList.add("hidden");

            if (s.estado === "asignado") {
                btn1.classList.remove("hidden");
                btn1.innerText = "VOY EN CAMINO";
                btn1.className = "w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg";
                btn1.onclick = () => actualizarEstado(id, "en_camino");
            }
            else if (s.estado === "en_camino") {
                // 🦈 INYECCIÓN SHARK MODE: Validación GPS Geocercada
                btn2.classList.remove("hidden");
                btn2.innerText = "YA LLEGUÉ AL SITIO";
                btn2.className = "w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg transition-all";
                
                btn2.onclick = () => {
                    const textoOriginal = btn2.innerHTML;
                    btn2.innerHTML = '<i class="fas fa-satellite text-white animate-spin"></i> VERIFICANDO GPS...';
                    btn2.disabled = true;

                    if (navigator.geolocation && s.coords) {
                        navigator.geolocation.getCurrentPosition((pos) => {
                            const dist = calcularDistancia(pos.coords.latitude, pos.coords.longitude, s.coords.lat, s.coords.lng);
                            if (dist > 1000) { // Tolerancia de 1 KM
                                alert(`🛑 ALERTA ANTIFRAUDE: El sistema detecta que estás a ${Math.round(dist)} metros del cliente.\n\nDebes estar físicamente en el lugar para cambiar el estado a "En Sitio".`);
                                btn2.innerHTML = textoOriginal;
                                btn2.disabled = false;
                            } else {
                                actualizarEstado(id, "en_sitio");
                            }
                        }, (err) => {
                            console.warn("Error GPS técnico:", err);
                            actualizarEstado(id, "en_sitio"); // Fallback si falla el GPS local
                        }, { enableHighAccuracy: true });
                    } else {
                        actualizarEstado(id, "en_sitio"); // Fallback si el cliente no dejó coordenadas
                    }
                };
            }
            else if (s.estado === "en_sitio") {
                btn2.classList.remove("hidden");
                btn2.innerText = "CREAR COTIZACIÓN";
                btn2.className = "w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg";
                btn2.onclick = () => mostrarModalCotizacionDetallada(id, s);
            }
            else if (s.estado === "cotizando") {
                btn2.classList.remove("hidden");
                btn2.innerText = "ESPERANDO AL CLIENTE...";
                btn2.disabled = true;
                btn2.className = "w-full bg-zinc-700 text-gray-400 font-bold py-4 rounded-xl cursor-not-allowed flex items-center justify-center gap-2";
            }
            else if (s.estado === "trabajando") {
                btn2.classList.remove("hidden");
                btn2.innerText = " 📸  FINALIZAR Y COBRAR";
                btn2.disabled = false;
                btn2.className = "w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg";
                btn2.onclick = () => mostrarModalEvidencia(id);
            }
        });
    });

    async function actualizarEstado(id, estado, extras = {}) {
        try {
            await updateDoc(doc(db, "services", id), { estado: estado, ...extras });

            let textoMapa = "En Ruta";
            if(estado === "en_sitio") textoMapa = "En Sitio";
            if(estado === "trabajando") textoMapa = "Trabajando";
            if(estado === "finalizado") textoMapa = "Disponible";
            const rastreoRef = doc(db, "rastreo", "tecnicoActivo");
            await setDoc(rastreoRef, { estado: textoMapa }, { merge: true });
        } catch (error) {
            console.error("Error actualizando estado:", error);
            alert("Error de conexión. Intenta de nuevo.");
        }
    }

    // --- LÓGICA DE CANCELACIÓN CON PENALIZACIÓN (V5.13.0) ---
    window.cancelarMisionActiva = async (serviceId) => {
        if(!confirm("⚠️ ADVERTENCIA: Cancelar un servicio aceptado afecta tu reputación.\n\nSi han pasado más de 5 minutos desde que aceptaste, se aplicará una penalización automática de $50 MXN.\n\n¿Estás seguro de cancelar?")) return;

        try {
            const snap = await getDoc(doc(db, "services", serviceId));
            if (!snap.exists()) return;
            
            const data = snap.data();
            const ahora = new Date();
            let aplicarMulta = false;

            if (data.asignado_at) {
                const tiempoAceptado = data.asignado_at.toDate();
                const diffMin = (ahora - tiempoAceptado) / 60000; // Diferencia en minutos
                if (diffMin > 5) aplicarMulta = true;
            }

            // Liberar el servicio
            await updateDoc(doc(db, "services", serviceId), { 
                estado: "pendiente", 
                tecnico_id: null,
                tecnico_nombre: null,
                tecnico_telefono: null,
                asignado_at: null,
                rejected_by: arrayUnion(user.uid) // Evita que lo vuelva a ver
            });

            if (aplicarMulta) {
                await addDoc(collection(db, "transacciones"), {
                    tecnico_id: user.uid,
                    pago_tecnico: -50,
                    monto_total: 0,
                    tipo: "penalizacion",
                    descripcion: "Cancelación tardía de servicio (> 5 min)",
                    fecha: serverTimestamp()
                });
                
                await updateDoc(doc(db, "users", user.uid), {
                    reputacion: increment(-0.2) // Baja reputación
                });

                alert("❌ Servicio cancelado. Se aplicó una penalización de $50 MXN por cancelación fuera de tiempo.");
            } else {
                alert("✅ Servicio cancelado sin penalización (dentro de los 5 min).");
            }

        } catch (e) {
            console.error(e);
            alert("Error al cancelar el servicio.");
        }
    };

    function mostrarModalCotizacionDetallada(id, servicioData) {
        if(document.getElementById("modalCot")) return;
        
        let items = []; 

        const html = `
        <div id="modalCot" class="fixed inset-0 bg-black/95 z-[60] flex flex-col p-4 animate-fade-in overflow-y-auto">
            <div class="bg-zinc-900 w-full max-w-lg mx-auto rounded-3xl p-6 border border-zinc-700 shadow-2xl flex-1 flex flex-col">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-white font-black text-xl">COTIZADOR PRO (ALAMO)</h3>
                    <button onclick="document.getElementById('modalCot').remove()" class="text-gray-500"><i class="fas fa-times"></i></button>
                </div>
                
                <div class="flex-1 overflow-y-auto mb-4 border border-zinc-800 rounded-xl bg-black/50 p-2" id="listaPartidas">
                    <p class="text-gray-600 text-xs text-center italic py-10">Agrega conceptos para cotizar.</p>
                </div>

                <div class="bg-zinc-800 p-3 rounded-xl mb-4 space-y-2 border border-zinc-700">
                    <div class="flex gap-2">
                        <input id="inCant" type="number" placeholder="Cant." class="w-16 bg-black text-white p-3 rounded-lg text-xs border border-zinc-600 focus:border-emerald-500 outline-none">
                        <input id="inUnidad" type="text" placeholder="Unidad" class="w-20 bg-black text-white p-3 rounded-lg text-xs border border-zinc-600 focus:border-emerald-500 outline-none">
                        <input id="inDesc" type="text" placeholder="Descripción (Ej: Cable 12)" class="flex-1 bg-black text-white p-3 rounded-lg text-xs border border-zinc-600 focus:border-emerald-500 outline-none">
                    </div>
                    <div class="flex gap-2 items-center">
                        <div class="flex-1 relative">
                            <span class="absolute left-3 top-3 text-gray-500 text-xs">$</span>
                            <input id="inPrecio" type="number" placeholder="Precio Unitario" class="w-full bg-black text-white p-3 pl-6 rounded-lg text-xs border border-zinc-600 focus:border-emerald-500 outline-none font-mono">
                        </div>
                        <button id="btnAddItem" class="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-bold text-xs transition-colors"><i class="fas fa-plus"></i> AGREGAR</button>
                    </div>
                </div>

                <div class="flex justify-between items-center bg-black p-4 rounded-xl border border-emerald-900 mb-4">
                    <span class="text-gray-400 text-xs font-bold uppercase">Total Cotización</span>
                    <span id="txtTotalCot" class="text-emerald-500 font-black text-xl">$0.00</span>
                </div>

                <button id="btnEnviarCot" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl text-sm shadow-lg shadow-blue-900/20 transition-transform active:scale-95">
                    ENVIAR AL CLIENTE
                </button>
            </div>
        </div>`;
        
        document.body.insertAdjacentHTML('beforeend', html);
        console.log(" 🛠️ Modal de Cotización Abierto");

        const renderItems = () => {
            const container = document.getElementById("listaPartidas");
            const txtTotal = document.getElementById("txtTotalCot");
            container.innerHTML = "";
            let grandTotal = 0;

            if(items.length === 0) {
                container.innerHTML = `<p class="text-gray-600 text-xs text-center italic py-4">Sin conceptos.</p>`;
            } else {
                items.forEach((item, index) => {
                    const importe = item.cantidad * item.precio;
                    grandTotal += importe;
                    const row = document.createElement("div");
                    row.className = "flex justify-between items-start border-b border-zinc-800 py-2 text-xs last:border-0 animate-fade-in";
                    row.innerHTML = `
                        <div class="flex-1">
                            <p class="text-white font-bold"><span class="text-emerald-500">${item.cantidad} ${escaparHTML(item.unidad)}</span> ${escaparHTML(item.descripcion)}</p>
                            <p class="text-gray-500 text-[10px]">$${item.precio} c/u</p>
                        </div>
                        <div class="text-right">
                            <p class="text-white font-mono">$${importe.toFixed(2)}</p>
                            <button class="text-red-500 text-[10px] underline btn-delete hover:text-red-400" data-idx="${index}">Eliminar</button>
                        </div>
                    `;
                    container.appendChild(row);
                });
            }
            txtTotal.innerText = `$${grandTotal.toFixed(2)}`;
            
            document.querySelectorAll(".btn-delete").forEach(btn => {
                btn.onclick = (e) => {
                    const idx = parseInt(e.target.dataset.idx);
                    items.splice(idx, 1);
                    renderItems();
                };
            });
        };

        setTimeout(() => {
            const btnAdd = document.getElementById("btnAddItem");
            const btnSend = document.getElementById("btnEnviarCot");

            if(btnAdd) {
                btnAdd.onclick = () => {
                    console.log("Click en Agregar Item");
                    const cant = parseFloat(document.getElementById("inCant").value);
                    const unidad = document.getElementById("inUnidad").value.trim();
                    const desc = document.getElementById("inDesc").value.trim();
                    const precio = parseFloat(document.getElementById("inPrecio").value);

                    if(!cant || !desc || !precio) return alert("Llena todos los campos del concepto.");

                    items.push({ cantidad: cant, unidad: unidad || 'pz', descripcion: desc, precio: precio });
                    
                    document.getElementById("inCant").value = "";
                    document.getElementById("inDesc").value = "";
                    document.getElementById("inPrecio").value = "";
                    renderItems();
                };
            }

            if(btnSend) {
                btnSend.onclick = async () => {
                    if(items.length === 0) return alert("Agrega al least un concepto para cotizar.");
                    
                    const totalFinal = items.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);

                    if(!confirm(`¿Enviar cotización por $${totalFinal.toFixed(2)}?`)) return;

                    try {
                        await updateDoc(doc(db, "services", id), {
                            estado: "cotizando",
                            detalles_cotizacion: items, 
                            costo_final: totalFinal,
                            cotizado_at: serverTimestamp(),
                            diagnostico: "Cotización Detallada" 
                        });
                        alert(`✅ Cotización con ${items.length} partidas enviada correctamente.`);
                    } catch (e) {
                        console.error(e);
                        alert("Error al guardar la cotización.");
                    }

                    const modal = document.getElementById("modalCot");
                    if(modal) modal.remove();
                };
            }
        }, 100); 
    }

    function mostrarModalEvidencia(id) {
        if(document.getElementById("modalEvidencia")) return;

        const html = `
        <div id="modalEvidencia" class="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div class="bg-zinc-900 w-full max-w-md rounded-3xl p-6 border border-zinc-700 shadow-2xl">
                <h3 class="text-white font-black text-xl mb-4 text-center">REPORTE FINAL OBLIGATORIO</h3>
                <p class="text-gray-400 text-xs mb-6 text-center">Toma tus fotos, cobra en efectivo y cierra la orden.</p>

                <div class="space-y-4">
                    <div class="bg-black p-4 rounded-xl border border-zinc-800 text-center">
                        <label class="block text-xs font-bold text-emerald-500 mb-2 uppercase">FOTO DEL ANTES</label>
                        <input type="file" id="fileAntes" accept="image/*" class="text-xs text-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700">
                    </div>
                    <div class="bg-black p-4 rounded-xl border border-zinc-800 text-center">
                        <label class="block text-xs font-bold text-emerald-500 mb-2 uppercase">FOTO DEL DESPUÉS</label>
                        <input type="file" id="fileDespues" accept="image/*" class="text-xs text-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700">
                    </div>
                </div>

                <div class="flex gap-3 mt-8">
                    <button onclick="document.getElementById('modalEvidencia').remove()" class="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-bold text-sm">CANCELAR</button>
                    <button id="btnSubirEvidencia" class="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black py-3 rounded-xl font-black text-sm transition-colors">ENVIAR Y CERRAR</button>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        
        document.getElementById("btnSubirEvidencia").onclick = async () => {
            const f1 = document.getElementById("fileAntes").files[0];
            const f2 = document.getElementById("fileDespues").files[0];
            if(!f1 || !f2) { alert(" ⚠  Ambas fotos son obligatorias para el reporte."); return; }

            const btn = document.getElementById("btnSubirEvidencia");
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PROTEGIENDO EVIDENCIA...';
            btn.disabled = true;
            
            try {
                const b64_1 = await toBase64(f1);
                const b64_2 = await toBase64(f2);
                
                // 🦈 INYECCIÓN SHARK MODE: Metadatos para trazabilidad legal de la evidencia
                const timestampMetadatos = new Date().toISOString();
                const userAgentCorto = navigator.userAgent.substring(0, 50);
                
                const servicioSnap = await getDoc(doc(db, "services", id));
                const servicioData = servicioSnap.data();
                const costoTotal = servicioData.costo_final || 0;

                // --- MATEMÁTICA FINANCIERA FASE 0 (EFECTIVO / DEUDA) ---
                // El cliente pagó en efectivo el 100% al técnico.
                // FixGo cobra su 32% de comisión total.
                const comisionFixGoPura = costoTotal * 0.30; 
                const aporteGarantia = costoTotal * 0.02;    
                
                // Retenciones de Ley calculadas solo para registro interno del Admin BI
                const retencionIVA = costoTotal * 0.08;      
                const retencionISR = costoTotal * 0.10;      
                
                // 🔥 LA DEUDA: El técnico se queda el efectivo, así que su "pago" en plataforma es negativo (lo que nos debe).
                const deudaTecnico = -(costoTotal * 0.32);

                await actualizarEstado(id, "finalizado", {
                    evidencia: { 
                        antes: b64_1, 
                        despues: b64_2,
                        metadatos: {
                            fecha_captura: timestampMetadatos,
                            dispositivo_tecnico: userAgentCorto,
                            certificacion_legal: true
                        }
                    },
                    finalizado_at: serverTimestamp(),
                    folio_fiscal: "FX-" + Math.random().toString(36).substr(2, 9).toUpperCase(),
                    desglose: {
                        subtotal: (costoTotal / 1.16).toFixed(2),
                        iva: (costoTotal - (costoTotal / 1.16)).toFixed(2),
                        total: costoTotal
                    }
                });

                await addDoc(collection(db, "transacciones"), {
                    servicio_id: id,
                    tecnico_id: user.uid, 
                    monto_total: costoTotal,
                    comision_fixgo: comisionFixGoPura, 
                    aporte_garantia: aporteGarantia, 
                    retencion_iva: retencionIVA,    
                    retencion_isr: retencionISR,    
                    // Fase 0: El técnico debe el 32% del efectivo que cobró
                    pago_tecnico: deudaTecnico, 
                    fecha: serverTimestamp(),
                    tipo: "ingreso_servicio",
                    metodo_pago: "efectivo"
                });

                // BONUS DE REPUTACIÓN AUTOMÁTICO
                await updateDoc(doc(db, "users", user.uid), {
                    reputacion: increment(0.1), // Sube reputación
                    servicios_completados: increment(1)
                });

                document.getElementById("modalEvidencia").remove();
                alert(" ✅  ¡Servicio Cerrado! Has cobrado en efectivo. La comisión de FixGo (32%) ha sido descontada de tu balance.");
            } catch (e) {
                console.error(e);
                alert("Error subiendo imágenes. Intenta fotos más pequeñas.");
                btn.innerText = "REINTENTAR";
                btn.disabled = false;
            }
        };
    }

    const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    window.generarPDFRetiro = async (retiroId) => {
        try {
            const docRef = doc(db, "retiros", retiroId);
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
                throw new Error("No se encontró la información del retiro.");
            }
            
            const data = { ...docSnap.data(), id: retiroId };
            
            const { jsPDF } = await cargarLibreriaPDF();
            const docPdf = new jsPDF();
            
            docPdf.setFillColor(18, 18, 18);
            docPdf.rect(0, 0, 215, 40, 'F');

            docPdf.setTextColor(255, 255, 255);
            docPdf.setFont("helvetica", "bold");
            docPdf.setFontSize(24);
            docPdf.text("FIXGO", 20, 22);
            docPdf.setFont("helvetica", "normal");
            docPdf.setTextColor(16, 185, 129); 
            docPdf.text("MÉXICO", 60, 22);

            docPdf.setTextColor(200, 200, 200);
            docPdf.setFontSize(10);
            docPdf.text("Comprobante de Liquidación (SPEI)", 20, 32);
            
            docPdf.setFontSize(8);
            docPdf.setTextColor(150, 150, 150);
            docPdf.text(`RFC EMISOR: FXG260211-H8A`, 20, 45);
            
            let fechaFormat = new Date().toLocaleDateString();
            if(data.fecha_aprobacion) {
                fechaFormat = new Date(data.fecha_aprobacion.seconds * 1000).toLocaleDateString();
            }
            
            docPdf.text(`FOLIO RETIRO: SPEI-${data.id.substring(0,6).toUpperCase()}`, 130, 45);
            docPdf.text(`FECHA APROBACIÓN: ${fechaFormat}`, 130, 50);

            let y = 70;
            docPdf.setTextColor(0, 0, 0);
            docPdf.setFontSize(14);
            docPdf.setFont("helvetica", "bold");
            docPdf.text("DETALLES DE LA TRANSFERENCIA", 20, y);

            y += 10;
            docPdf.setFont("helvetica", "normal");
            docPdf.setFontSize(11);
            docPdf.text(`Beneficiario (Socio Técnico): ${data.tecnico_nombre}`, 20, y);
            y += 8;
            docPdf.text(`Estado: LIQUIDADO / APROBADO`, 20, y);
            
            y += 20;
            
            docPdf.setFillColor(245, 245, 245);
            docPdf.rect(20, y, 170, 30, 'F');
            
            docPdf.setFont("helvetica", "bold");
            docPdf.setFontSize(12);
            docPdf.setTextColor(50, 50, 50);
            docPdf.text("MONTO TRANSFERIDO:", 30, y + 18);
            
            docPdf.setFontSize(20);
            docPdf.setTextColor(16, 185, 129); 
            docPdf.text(`$${data.monto.toFixed(2)} MXN`, 110, y + 20);

            y += 60;
            docPdf.setFontSize(9);
            docPdf.setTextColor(150, 150, 150);
            docPdf.setFont("helvetica", "normal");
            
            const notaLegal = "Este documento es un comprobante de liquidación digital emitido por la plataforma FixGo. Los fondos han sido transferidos a la cuenta bancaria registrada por el socio especialista. El tiempo de reflejo en cuenta puede variar dependiendo de la institución bancaria receptora.";
            const splitNota = docPdf.splitTextToSize(notaLegal, 170);
            docPdf.text(splitNota, 20, y);
            
            docPdf.save(`FixGo_Liquidacion_${data.id.substring(0,6)}.pdf`);

        } catch (error) {
            console.error("Error al generar PDF de retiro:", error);
            alert("Hubo un error al generar el comprobante. Intenta de nuevo.");
        }
    };

    // 🔥 IDENTIDAD CONECTADA (CAMBIO DE FOTO EN PANEL TÉCNICO)
    window.cambiarFotoPerfil = async (uid) => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if(!file) return;
            // Usamos Base64 para guardar en BD temporalmente mientras integramos Storage
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    await updateDoc(doc(db, "users", uid), {
                        foto_perfil: event.target.result,
                        fotoPerfil: event.target.result // Compatibilidad
                    });
                    alert("✅ Foto de perfil actualizada correctamente.");
                } catch(err) {
                    console.error("Error subiendo foto:", err);
                    alert("Error al actualizar la foto de perfil en el servidor.");
                }
            };
            reader.readAsDataURL(file);
        };
        fileInput.click();
    };
}

// ======================================================================================
// 3. PANEL DE CLIENTE (USUARIO FINAL) - V5.16.0
// ======================================================================================
export async function iniciarPanelCliente(user) {
    console.log(" 📱  Iniciando Panel de Cliente (Modo Bootstrapping / Efectivo / Shark Blindado)...");

    const el = {
        form: document.getElementById("nuevaSolicitudForm"),
        lista: document.getElementById("solicitudesCliente"),
        inputCat: document.getElementById("categoriaSeleccionada"),
        labelServicio: document.getElementById("btnLabel"),
        containerRoad: document.getElementById("content_road"),
        containerFix: document.getElementById("content_fix"),
        containerTech: document.getElementById("content_tech"),
        containerMaint: document.getElementById("content_maint"),
        // INYECCIÓN V5.14.0: Elementos de Facturación y Stripe
        stripeCard: document.getElementById("stripe_card"),
        toggleFactura: document.getElementById("toggleFactura"),
        facRfc: document.getElementById("fac_rfc"),
        facRazon: document.getElementById("fac_razon"),
        facCp: document.getElementById("fac_cp"),
        facRegimen: document.getElementById("fac_regimen")
    };

    // ----------------------------------------------------------------------------------
    // 3.1 CARGA DINÁMICA DE VERTICALES EN ACORDEÓN
    // ----------------------------------------------------------------------------------
    async function cargarServiciosCliente() {
        console.log("Cargando servicios en contenedores dinámicos...");

        onSnapshot(doc(db, "configuracion", "catalogo_global"), (docSnap) => {
            const dbConfig = docSnap.exists() ? docSnap.data() : {};
            
            const DEFINICION_VERTICALES = {
                road: [
                    { id: "road_llanta", label: "Llantera Móvil", icon: "fa-car-crash" },
                    { id: "road_cerrajero", label: "Cerrajería", icon: "fa-key" },
                    { id: "road_grua", label: "Grúas", icon: "fa-truck-pickup" },
                    { id: "road_mecanico", label: "Mecánico Gral.", icon: "fa-wrench" },
                    { id: "road_corriente", label: "Paso Corriente", icon: "fa-car-battery" }
                ],
                fix: [
                    { id: "fix_electricidad", label: "Electricidad", icon: "fa-plug" },
                    { id: "fix_plomeria", label: "Plomería", icon: "fa-faucet" },
                    { id: "fix_ac", label: "Aires Acondicionad.", icon: "fa-snowflake" },
                    { id: "fix_jardin", label: "Jardinería", icon: "fa-leaf" },
                    { id: "fix_pintura", label: "Pintura", icon: "fa-paint-roller" },
                    { id: "fix_alberca", label: "Albercas", icon: "fa-swimming-pool" },
                    { id: "fix_fumigacion", label: "Fumigación", icon: "fa-bug" }
                ],
                maint: [
                    { id: "maint_general", label: "Mantenimiento Gral.", icon: "fa-building" }
                ],
                tech: [
                    { id: "tech_cctv", label: "CCTV", icon: "fa-video" },
                    { id: "tech_alarma", label: "Alarmas", icon: "fa-bell" },
                    { id: "tech_acceso", label: "Accesos", icon: "fa-id-card" },
                    { id: "tech_elevador", label: "Elevadores", icon: "fa-elevator" },
                    { id: "tech_planta", label: "Plantas Eléc.", icon: "fa-charging-station" },
                    { id: "tech_solar", label: "Paneles Solares", icon: "fa-solar-panel" }
                ]
            };

            const renderizarCategoria = (categoriaClave, contenedor) => {
                if(!contenedor) return;
                contenedor.innerHTML = ""; 
                let html = '<div class="grid grid-cols-2 gap-2 p-3 bg-black/50 rounded-b-xl border-x border-b border-zinc-800">';
                
                DEFINICION_VERTICALES[categoriaClave].forEach(srv => {
                    const isActive = dbConfig[srv.id] !== false; 
                    
                    if (isActive) {
                        html += `
                        <div onclick="window.seleccionarServicio('${srv.id}', '${srv.label}')" 
                             class="bg-zinc-900 border border-zinc-700 p-3 rounded-xl flex flex-col items-center text-center transition-all duration-200 service-card-btn opacity-100 hover:scale-105 hover:border-emerald-500 active:scale-95 cursor-pointer" id="card_${srv.id}">
                            <div class="mb-2">
                                <div class="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_5px_#10b981]"></div>
                            </div>
                            <i class="fas ${srv.icon} text-lg mb-2 text-gray-300"></i>
                            <span class="text-white font-bold text-[10px] leading-tight uppercase">${srv.label}</span>
                            <span class="text-[8px] text-gray-500 mt-1 uppercase tracking-widest font-bold">DISPONIBLE</span>
                        </div>`;
                    } else {
                        html += `
                        <div class="bg-zinc-900/40 border border-zinc-800/40 p-3 rounded-xl flex flex-col items-center text-center opacity-40 grayscale cursor-not-allowed">
                            <div class="mb-2"><i class="fas fa-lock text-gray-600 text-xs"></i></div>
                            <i class="fas ${srv.icon} text-lg mb-2 text-zinc-600"></i>
                            <span class="text-white font-bold text-[10px] leading-tight uppercase">${srv.label}</span>
                            <span class="text-[8px] text-gray-500 mt-1 uppercase tracking-widest font-bold">PRÓXIMAMENTE</span>
                        </div>`;
                    }
                });
                
                html += '</div>';
                contenedor.innerHTML = html;
            };

            renderizarCategoria("road", el.containerRoad);
            renderizarCategoria("fix", el.containerFix);
            renderizarCategoria("tech", el.containerTech);
            renderizarCategoria("maint", el.containerMaint);

            window.seleccionarServicio = (id, label) => {
                document.querySelectorAll('.service-card-btn').forEach(btn => {
                    btn.classList.remove('bg-zinc-800', 'border-emerald-500', 'ring-1', 'ring-emerald-500');
                    btn.classList.add('bg-zinc-900', 'border-zinc-700');
                });

                const activeCard = document.getElementById(`card_${id}`);
                if(activeCard) {
                    activeCard.classList.remove('bg-zinc-900', 'border-zinc-700');
                    activeCard.classList.add('bg-zinc-800', 'border-emerald-500', 'ring-1', 'ring-emerald-500');
                }

                if(el.inputCat) el.inputCat.value = id;
                if(el.labelServicio) el.labelServicio.innerText = label.toUpperCase();

                const formContainer = document.getElementById("modalSolicitud");
                if(formContainer) formContainer.classList.remove("hidden");

                el.form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            };
        });
    }

    cargarServiciosCliente();

    // ----------------------------------------------------------------------------------
    // 3.2 ENVÍO DE SOLICITUD (SHARK MODE ANTI-SPAM)
    // ----------------------------------------------------------------------------------
    let lastSubmitTime = 0; // 🔥 INYECCIÓN ANTI-SPAM

    if (el.form) {
        el.form.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            // 🦈 REGLA ANTI-SPAM (30 segundos)
            const now = Date.now();
            if (now - lastSubmitTime < 30000) {
                alert("⏳ SISTEMA ANTI-SPAM: Por favor espera al menos 30 segundos antes de enviar una nueva solicitud de servicio.");
                return;
            }

            const cat = el.inputCat.value; 
            const dir = el.form.querySelector('[name="direccion"]').value;
            const desc = el.form.querySelector('[name="descripcion"]').value;
            
            if (!cat) { alert(" ⚠  Por favor selecciona un servicio habilitado de la lista."); return; }
            
            // 🔥 INYECCIÓN V5.14.0: RECOLECCIÓN DE DATOS DE FACTURACIÓN
            let requiereFactura = false;
            let datosFacturacion = null;

            if (el.toggleFactura && el.toggleFactura.checked) {
                requiereFactura = true;
                datosFacturacion = {
                    rfc: el.facRfc?.value.toUpperCase(),
                    razon_social: el.facRazon?.value,
                    cp: el.facCp?.value,
                    regimen: el.facRegimen?.value
                };
                if (!datosFacturacion.rfc || !datosFacturacion.razon_social) {
                    alert("⚠️ Si requieres factura, por favor completa RFC y Razón Social.");
                    return;
                }
            }

            const btn = el.form.querySelector("button");
            const textoOriginal = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> PROCESANDO CONEXIÓN...`;
            
            setTimeout(() => {
                btn.innerHTML = `<i class="fas fa-satellite-dish"></i> OBTENIENDO UBICACIÓN SATELITAL...`;
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        async (pos) => {
                            await enviarSolicitudFinal(cat, dir, desc, {
                                lat: pos.coords.latitude,
                                lng: pos.coords.longitude
                            }, requiereFactura, datosFacturacion);
                        },
                        async (err) => {
                            console.warn("GPS Cliente no disponible:", err);
                            await enviarSolicitudFinal(cat, dir, desc, null, requiereFactura, datosFacturacion);
                        },
                        { timeout: 15000, maximumAge: 10000, enableHighAccuracy: true }
                    );
                } else {
                    enviarSolicitudFinal(cat, dir, desc, null, requiereFactura, datosFacturacion);
                }
            }, 500); 
            
            async function enviarSolicitudFinal(categoriaFull, direccion, descripcion, coords, reqFac, datosFac) {
                const partes = categoriaFull.split('_');
                const vertical = partes[0].toUpperCase(); 
                const servicio = partes[1] ? partes[1].toUpperCase() : 'GENERAL';

                try {
                    await addDoc(collection(db, "services"), {
                        cliente_id: user.uid,
                        cliente_nombre: user.nombre || "Cliente",
                        cliente_telefono: user.telefono || "",
                        categoria: vertical,
                        sub_servicio: servicio,
                        categoria_id: categoriaFull,
                        direccion: direccion,
                        descripcion: descripcion,
                        estado: "pendiente",
                        zona: "Cancún",
                        created_at: serverTimestamp(),
                        retencion_inicial: 0, // No retenemos nada en Fase 0
                        costo_final: 0,
                        coords: coords,
                        factura_requerida: reqFac,
                        datos_facturacion: datosFac,
                        factura_enviada: false
                    });
                    
                    lastSubmitTime = Date.now(); // 🦈 Actualizamos reloj anti-spam al enviar éxito

                    alert(" ✅  ¡Solicitud Enviada!\n\nNuestro sistema está buscando al técnico certificado más cercano...");
                    el.form.reset();
                    if(el.toggleFactura) {
                        el.toggleFactura.checked = false;
                        document.getElementById('datosFacturacion').classList.add('hidden');
                    }
                    
                    const formContainer = document.getElementById("modalSolicitud");
                    if(formContainer) formContainer.classList.add("hidden");

                    if(el.labelServicio) el.labelServicio.innerText = "SERVICIO";
                    document.querySelectorAll('.service-card-btn').forEach(cardBtn => {
                        cardBtn.classList.remove('bg-zinc-800', 'border-emerald-500', 'ring-1', 'ring-emerald-500');
                        cardBtn.classList.add('bg-zinc-900', 'border-zinc-700');
                    });
                } catch (error) {
                    console.error(error);
                    alert("Error al enviar solicitud al servidor central.");
                }
                
                btn.disabled = false;
                btn.innerHTML = textoOriginal;
            }
        });
    }

    // ----------------------------------------------------------------------------------
    // 3.3 MONITOR DE HISTORIAL & WATCHDOG DE NOTIFICACIONES AL CLIENTE
    // ----------------------------------------------------------------------------------
    // 🛡️ ESCUDO RAM: Dibuja máximo 50 tickets en el historial del cliente
    onSnapshot(query(collection(db, "services"), where("cliente_id", "==", user.uid), orderBy("created_at", "desc"), limit(50)), (snap) => {
        if(!el.lista) return;
        
        // --- 🐶 WATCHDOG CLIENTE: DETECCIÓN DE CAMBIOS DE ESTADO ---
        snap.docChanges().forEach(change => {
            if (change.type === 'modified') {
                const newData = change.doc.data();
                console.log(" 🔔  Actualización de servicio:", newData.estado);
                sonarAlerta();

                // LA NOTIFICACIÓN TRIUNFAL DE COBRO
                if (newData.estado === 'finalizado') {
                    alert("✅ ¡Servicio terminado exitosamente!\n\nPor favor, realiza el pago en efectivo directamente al técnico. Revisa tu comprobante digital en pantalla.");
                }
            }
        });
        
        el.lista.innerHTML = "";

        if(snap.empty) {
            el.lista.innerHTML = `
            <div class="text-center py-8">
                <i class="fas fa-history text-gray-700 text-3xl mb-2"></i>
                <p class="text-gray-600 text-sm">Tus servicios aparecerán aquí.</p>
            </div>`;
            return;
        }

        snap.forEach(docSnap => {
            const s = docSnap.data();
            const id = docSnap.id;
            
            let contenido = `<div class="p-4 bg-yellow-900/10 rounded-xl border border-yellow-500/30 mb-2"><span class="text-xs font-bold text-yellow-500 animate-pulse"> 🔎  RASTREANDO TÉCNICO EN LA ZONA...</span></div>`;
            
            if (s.estado === "cotizando") {
                let htmlTabla = "";
                if (s.detalles_cotizacion && s.detalles_cotizacion.length > 0) {
                    const filas = s.detalles_cotizacion.map(item => `
                        <tr>
                            <td>${item.cantidad} ${escaparHTML(item.unidad)}</td>
                            <td>${escaparHTML(item.descripcion)}</td>
                            <td class="quote-num">$${item.precio}</td>
                            <td class="quote-num text-white">$${(item.cantidad * item.precio).toFixed(2)}</td>
                        </tr>
                    `).join('');
                    
                    htmlTabla = `
                        <div class="bg-black border border-zinc-700 rounded-lg overflow-hidden my-3">
                            <table class="quote-table" style="width: 100%; border-collapse: collapse; font-size: 10px; color: #ccc;">
                                <thead>
                                    <tr>
                                        <th style="background: #1f1f1f; color: #10b981; padding: 4px;">CANT</th>
                                        <th style="background: #1f1f1f; color: #10b981; padding: 4px;">DESC</th>
                                        <th style="background: #1f1f1f; color: #10b981; padding: 4px;">P.U.</th>
                                        <th style="background: #1f1f1f; color: #10b981; padding: 4px;">IMP.</th>
                                    </tr>
                                </thead>
                                <tbody>${filas}</tbody>
                                <tfoot>
                                    <tr class="quote-total-row" style="background: #1a1a1a; border-top: 2px solid #333;">
                                        <td colspan="3" class="text-right font-bold text-gray-400" style="padding: 4px;">TOTAL:</td>
                                        <td class="quote-num text-emerald-500 font-black text-sm" style="padding: 4px;">$${s.costo_final.toFixed(2)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    `;
                } else {
                    htmlTabla = `<p class="text-white text-2xl font-black mt-1">$${s.costo_final}</p><p class="text-gray-400 text-xs italic">"${escaparHTML(s.diagnostico)}"</p>`;
                }

                contenido = `
                <div class="bg-zinc-800 p-4 rounded-lg border border-yellow-500 mt-2">
                    <div class="flex justify-between items-center mb-2">
                        <p class="text-yellow-500 text-xs font-bold uppercase">PRESUPUESTO GENERADO</p>
                        <span class="bg-yellow-500/20 text-yellow-500 text-[9px] px-2 py-1 rounded">FOLIO: ${id.substring(0,6).toUpperCase()}</span>
                    </div>
                    ${htmlTabla}
                    <div class="mt-2 p-2 bg-black/50 rounded border border-white/5">
                        <p class="legal-note" style="font-size: 8px; color: #666;">* SI HUBIERA CANCELACION TOTAL O PARCIAL... PENALIZACION DEL 20%.</p>
                        <p class="legal-note" style="font-size: 8px; color: #666;">* GARANTIA POR ESCRITO MINIMO DE 6 MESES.</p>
                        <p class="legal-note mt-2 text-emerald-500 font-bold"><i class="fas fa-hand-holding-usd"></i> Pago en EFECTIVO directo al técnico al finalizar.</p>
                    </div>
                    <div class="flex gap-2 mt-4">
                        <button onclick="window.responderCotizacion('${id}', false)" class="flex-1 bg-red-900/50 hover:bg-red-900 text-red-200 text-xs py-3 rounded-lg font-bold transition-colors">
                            RECHAZAR
                        </button>
                        <button onclick="window.responderCotizacion('${id}', true)" class="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs py-3 rounded-lg transition-colors shadow-lg shadow-emerald-500/20">
                            APROBAR COSTO
                        </button>
                    </div>
                </div>
                `;
            } else if (s.estado === "finalizado") {
                contenido = `
                <div class="bg-emerald-900/10 border border-emerald-500/30 p-4 rounded-xl mt-2">
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-emerald-500 font-black text-xs uppercase tracking-widest">TICKET FINAL</span>
                        <span class="bg-emerald-500 text-black text-[9px] font-bold px-2 py-0.5 rounded">FINALIZADO</span>
                    </div>
                    <div class="space-y-2 mb-4">
                        <div class="flex justify-between text-lg text-white font-black">
                            <span>TOTAL PAGADO:</span>
                            <span>$${s.costo_final}</span>
                        </div>
                    </div>
                    <p class="text-[9px] text-gray-500 mb-2 font-bold uppercase">EVIDENCIA REGISTRADA:</p>
                    <div class="flex gap-2 mb-4">
                        ${s.evidencia?.antes ? `<div class="relative w-1/2 h-20"><img src="${s.evidencia.antes}" class="w-full h-full object-cover rounded-lg border border-zinc-700"><span class="absolute bottom-1 left-1 bg-black/70 text-white text-[8px] px-1 rounded">ANTES</span></div>` : ''}
                        ${s.evidencia?.despues ? `<div class="relative w-1/2 h-20"><img src="${s.evidencia.despues}" class="w-full h-full object-cover rounded-lg border border-zinc-700"><span class="absolute bottom-1 left-1 bg-black/70 text-white text-[8px] px-1 rounded">DESPUÉS</span></div>` : ''}
                    </div>
                    <button onclick="window.generarPDF('${id}')" class="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs py-3 rounded-lg font-bold border border-white/10 transition-all flex items-center justify-center gap-2">
                        <i class="fas fa-file-download text-red-500"></i> DESCARGAR REPORTE FISCAL
                    </button>
                    ${s.factura_requerida ? `<p class="text-[9px] text-center mt-3 text-emerald-400 italic">Factura CFDI solicitada. Te llegará por correo.</p>` : ''}
                </div>
                `;
            }

            let headerStatus = `<span class="text-[10px] font-bold text-yellow-500 animate-pulse">BUSCANDO...</span>`;
            let dotColor = "bg-yellow-500";
            if (s.estado !== "pendiente") {
                headerStatus = `<span class="text-[10px] font-bold text-blue-400 uppercase">${s.estado.replace('_', ' ')}</span>`;
                dotColor = "bg-blue-500";
                if(s.estado === "finalizado") { headerStatus = `<span class="text-[10px] font-bold text-emerald-500">FINALIZADO</span>`; dotColor = "bg-emerald-500"; }
                if(s.estado === "cancelado") { headerStatus = `<span class="text-[10px] font-bold text-red-500">CANCELADO</span>`; dotColor = "bg-red-500"; }
            }

            let fechaFormat = "";
            if(s.created_at) {
                const dateObj = new Date(s.created_at.seconds * 1000);
                fechaFormat = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }

            const card = document.createElement("div");
            card.className = "uber-card rounded-2xl overflow-hidden shadow-lg mb-3";

            card.innerHTML = `
            <div class="p-4 flex justify-between items-center cursor-pointer hover:bg-zinc-800/50 transition-colors" onclick="toggleAccordion('hist-${id}', 'icon-${id}')">
                <div class="flex items-center gap-4">
                    <div class="w-3 h-3 ${dotColor} rounded-full shadow-[0_0_8px_currentColor]"></div>
                    <div>
                        <h4 class="font-black text-white text-sm uppercase tracking-tight">${escaparHTML(s.categoria)} <span class="text-gray-500 font-normal ml-1">| ${escaparHTML(s.sub_servicio || '')}</span></h4>
                        <div class="flex items-center gap-2 mt-1">
                            ${headerStatus}
                            <span class="text-[9px] text-gray-500">• ${fechaFormat}</span>
                        </div>
                    </div>
                </div>
                <i id="icon-${id}" class="fas fa-chevron-down text-gray-400 chevron-icon"></i>
            </div>

            <div id="hist-${id}" class="expandable-content bg-zinc-900/40">
                <div class="p-4 border-t border-zinc-800/50">
                    <p class="text-xs text-gray-400 truncate mb-3"><i class="fas fa-map-marker-alt text-zinc-600"></i> ${escaparHTML(s.direccion)}</p>
                    
                    ${contenido}

                    ${(s.estado === 'en_camino' || s.estado === 'en_sitio') ? `
                    <button onclick="window.abrirMapaEnVivo('${id}')" class="w-full mt-4 text-center bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs py-3 rounded-xl border border-blue-500/30 transition-colors font-bold flex items-center justify-center gap-2">
                        <i class="fas fa-map-marked-alt"></i> SEGUIR TÉCNICO EN VIVO
                    </button>
                    ` : ''}
                </div>
            </div>
            `;
            el.lista.appendChild(card);
        });
    });

    // ----------------------------------------------------------------------------------
    // 3.4 ACCIONES GLOBALES DEL CLIENTE
    // ----------------------------------------------------------------------------------
    
    window.abrirMapaEnVivo = (id) => {
        const existingModal = document.getElementById('modalMapaVivo');
        if (existingModal) existingModal.remove();

        const html = `
        <div id="modalMapaVivo" class="fixed inset-0 bg-black/95 z-[70] flex flex-col p-4 animate-fade-in">
            <div class="flex justify-between items-center mb-4 mt-2">
                <h3 class="text-white font-black text-lg"><i class="fas fa-satellite-dish text-blue-500 animate-pulse"></i> RASTREO EN VIVO</h3>
                <button onclick="document.getElementById('modalMapaVivo').remove()" class="bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors">
                    <i class="fas fa-times"></i> CERRAR MAPA
                </button>
            </div>
            <div class="flex-1 rounded-2xl overflow-hidden border border-zinc-700 relative bg-zinc-900 flex items-center justify-center">
                <div class="absolute text-zinc-600 flex flex-col items-center z-0">
                    <i class="fas fa-spinner fa-spin text-3xl mb-2"></i>
                    <p class="text-xs font-bold uppercase tracking-widest">Conectando con GPS...</p>
                </div>
                <iframe src="rastreo.html?id=${id}" class="w-full h-full border-0 absolute inset-0 z-10"></iframe>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    };

    // 🔥 V5.12.8 - PROTECCIÓN ATÓMICA EN RESPUESTA DEL CLIENTE
    window.responderCotizacion = async (id, aceptado) => {
        const serviceRef = doc(db, "services", id);
        
        try {
            if (aceptado) {
                // TÚNEL CUÁNTICO: Aceptar Cotización
                await runTransaction(db, async (transaction) => {
                    const sfDoc = await transaction.get(serviceRef);
                    if (!sfDoc.exists()) throw "NO_EXISTE";
                    
                    if (sfDoc.data().estado !== "cotizando") throw "ESTADO_INVALIDO";
                    
                    transaction.update(serviceRef, { estado: "trabajando" });
                });
                alert(" ✅  ¡Costo aprobado! El técnico comenzará a trabajar ahora.");
            } else {
                if(confirm(" ⚠  ¿Estás seguro de cancelar?\n\nAl haber llegado el técnico, le deberás pagar el costo mínimo de visita ($550).")) {
                    // TÚNEL CUÁNTICO: Cancelar Servicio
                    await runTransaction(db, async (transaction) => {
                        const sfDoc = await transaction.get(serviceRef);
                        if (!sfDoc.exists()) throw "NO_EXISTE";
                        
                        const currentStatus = sfDoc.data().estado;
                        if (currentStatus === "cancelado" || currentStatus === "finalizado") {
                            throw "ESTADO_FINALIZADO";
                        }

                        transaction.update(serviceRef, {
                            estado: "cancelado",
                            costo_final: 550, 
                            cancelado_razon: "Cliente rechazó cotización"
                        });
                    });
                    alert(" 🚫  Servicio cancelado exitosamente. Por favor, liquida el costo de visita al técnico.");
                }
            }
        } catch (error) {
            console.error("Error en transacción del cliente:", error);
            if(error === "ESTADO_INVALIDO" || error === "ESTADO_FINALIZADO") {
                alert("⚠️ Error: El estado del servicio ya cambió (fue cancelado o finalizado) y no puede ser modificado.");
            } else {
                alert("❌ Error de red al procesar tu respuesta. Intenta de nuevo.");
            }
        }
    };

    window.generarPDF = async (serviceId) => {
        const btn = document.activeElement;
        const textoOrig = btn.innerText;
        btn.innerText = "OBTENIENDO DATOS...";
        btn.disabled = true;

        try {
            const docRef = doc(db, "services", serviceId);
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
                throw new Error("No se encontró el servicio en la base de datos.");
            }
            
            const data = { ...docSnap.data(), id: serviceId };
            const { jsPDF } = await cargarLibreriaPDF();
            const docPdf = new jsPDF();
            
            docPdf.setFillColor(18, 18, 18);
            docPdf.rect(0, 0, 215, 40, 'F');

            docPdf.setTextColor(255, 255, 255);
            docPdf.setFont("helvetica", "bold");
            docPdf.setFontSize(24);
            docPdf.text("FIXGO", 20, 22);
            docPdf.setFont("helvetica", "normal");
            docPdf.setTextColor(16, 185, 129); 
            docPdf.text("MÉXICO", 60, 22);

            docPdf.setTextColor(200, 200, 200);
            docPdf.setFontSize(10);
            docPdf.text("Comprobante de Servicio Digital", 20, 32);
            
            docPdf.setFontSize(8);
            docPdf.setTextColor(150, 150, 150);
            docPdf.text(`RFC EMISOR: FXG260211-H8A`, 20, 45);
            docPdf.text(`RÉGIMEN FISCAL: 626 - Simplificado de Confianza`, 20, 50);
            docPdf.text(`LUGAR EXPEDICIÓN: 77500, Cancún, Q.Roo`, 20, 55);
            
            if(data.folio_fiscal) docPdf.text(`FOLIO FISCAL: ${data.folio_fiscal}`, 150, 45);
            docPdf.text(`FECHA: ${new Date().toLocaleDateString()}`, 150, 50);

            let y = 70;
            docPdf.setTextColor(0, 0, 0);
            docPdf.setFontSize(12);
            docPdf.setFont("helvetica", "bold");
            docPdf.text("DETALLES DEL SERVICIO", 20, y);

            y += 10;
            docPdf.setFont("helvetica", "normal");
            docPdf.setFontSize(10);
            docPdf.text(`Cliente: ${data.cliente_nombre}`, 20, y);
            const servicioLabel = `${data.categoria} ${data.sub_servicio ? '- ' + data.sub_servicio : ''}`;
            docPdf.text(`Categoría: ${servicioLabel}`, 120, y);
            y += 8;
            docPdf.text(`Ubicación: ${data.direccion}`, 20, y);

            y += 15;
            docPdf.setDrawColor(200, 200, 200);
            docPdf.line(20, y, 190, y);

            y += 15;
            docPdf.setFont("helvetica", "bold");
            docPdf.setFontSize(12);
            docPdf.text("DIAGNÓSTICO TÉCNICO Y COSTOS", 20, y);

            y += 10;
            
            if (data.detalles_cotizacion && data.detalles_cotizacion.length > 0) {
                docPdf.setFontSize(9);
                docPdf.setTextColor(100, 100, 100);
                docPdf.setFont("helvetica", "bold");
                
                docPdf.text("CANT", 20, y);
                docPdf.text("DESCRIPCIÓN", 45, y); 
                docPdf.text("P.UNIT", 140, y);
                docPdf.text("IMPORTE", 170, y);
                
                y += 5;
                docPdf.setDrawColor(50, 50, 50);
                docPdf.setLineWidth(0.5);
                docPdf.line(20, y, 190, y);
                y += 7;

                docPdf.setFont("helvetica", "normal");
                docPdf.setTextColor(0, 0, 0);
                
                data.detalles_cotizacion.forEach(item => {
                    docPdf.text(`${item.cantidad} ${item.unidad}`, 20, y);
                    const desc = item.descripcion.substring(0, 50) + (item.descripcion.length > 50 ? '...' : '');
                    docPdf.text(desc, 45, y);
                    docPdf.text(`$${item.precio}`, 140, y);
                    docPdf.text(`$${(item.cantidad * item.precio).toFixed(2)}`, 170, y);
                    y += 7;
                });
                y += 5; 
            } else {
                docPdf.setFont("helvetica", "normal");
                docPdf.setFontSize(10);
                docPdf.setTextColor(50, 50, 50); 
                
                const diagText = data.diagnostico || "(Sin desglose registrado en base de datos)";
                const splitDiag = docPdf.splitTextToSize(diagText, 170);
                
                docPdf.text(splitDiag, 20, y);
                y += (splitDiag.length * 7) + 5;
            }

            docPdf.setFillColor(245, 245, 245);
            docPdf.rect(120, y, 70, 40, 'F'); 
            
            docPdf.setTextColor(0, 0, 0);
            docPdf.setFontSize(10);
            docPdf.text("IMPORTE TOTAL:", 125, y + 10);
            
            if (data.desglose) {
                docPdf.setFontSize(8);
                docPdf.text(`Subtotal: $${data.desglose.subtotal}`, 125, y + 18);
                docPdf.text(`IVA (16%): $${data.desglose.iva}`, 125, y + 23);
            }

            docPdf.setFont("helvetica", "bold");
            docPdf.setFontSize(16);
            docPdf.setTextColor(16, 185, 129); 
            docPdf.text(`$${data.costo_final} MXN`, 125, y + 35);

            y += 60;
            docPdf.setTextColor(0, 0, 0);
            docPdf.setFontSize(12);
            docPdf.text("EVIDENCIA FOTOGRÁFICA", 20, y);
            y += 10;
            if(data.evidencia?.antes) {
                try {
                    docPdf.addImage(data.evidencia.antes, "JPEG", 20, y, 80, 60);
                    docPdf.setFontSize(8);
                    docPdf.text("ESTADO INICIAL", 20, y + 65);
                } catch(e) {}
            }
            if(data.evidencia?.despues) {
                try {
                    docPdf.addImage(data.evidencia.despues, "JPEG", 110, y, 80, 60);
                    docPdf.setFontSize(8);
                    docPdf.text("TRABAJO FINALIZADO", 110, y + 65);
                } catch(e) {}
            }
            docPdf.setFontSize(8);
            docPdf.setTextColor(150, 150, 150);
            docPdf.text("Este documento es un comprobante digital emitido por la plataforma FixGo.", 60, 280);
            docPdf.save(`FixGo_Reporte_${data.id}.pdf`);
            
            btn.innerText = "DESCARGAR REPORTE OFICIAL";
            btn.disabled = false;

        } catch (error) {
            console.error(error);
            alert("Hubo un error generando el PDF. Intenta de nuevo.");
            btn.innerText = "ERROR - REINTENTAR";
            btn.disabled = false;
        }
    };
}

/**
 * 🔔 FIXGO AUDIO WATCHDOG (Vigilante de Alertas V5.12.8)
 */
function iniciarVigilanciaAudio() {
    console.log("👂 Audio Watchdog: Iniciando escucha de servicios pendientes...");

    // 🛡️ ESCUDO RAM: Solo carga 10 recientes para el ping de audio
    const qAudio = query(
        collection(db, "services"), 
        where("estado", "==", "pendiente"),
        limit(10)
    );

    onSnapshot(qAudio, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const datos = change.doc.data();
                console.log("🔔 ¡PING! Nuevo servicio detectado:", datos.categoria || "Servicio");
                alertaTecnico(); 
            }
        });
    });
}

iniciarVigilanciaAudio();
