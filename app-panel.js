/**
 * ============================================================================
 * FIXGO 2026 - PANEL MAESTRO DE CONTROL | app-panel.js | V 5.12.1
 * Autor: Heber (CEO & Lead Architect) | Fecha: Febrero 2026
 * ============================================================================
 * CORE: Gestión de los 3 paneles (Admin, Técnico, Cliente). Flujos de estado, 
 * Verticales, Finanzas blindadas (Bridge), Wallet SPEI, Evidencia GPS y PDFs.
 * REGLAS MAESTRAS: NO COMPACTAR. NO FRAGMENTAR. MANTENER LÓGICA COMPLETA.
 * ======================================================================================
 */

import {
    db,
    auth,
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
    getDoc // Importación necesaria para leer configuraciones y PDF Fetch
} from "./firebase.js";

// Importamos getDocs y arrayUnion manualmente para validaciones de seguridad y operaciones atómicas
import { getDocs, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Importamos el motor GPS para el rastreo en tiempo real (CORE)
import { iniciarTracking, detenerTracking } from "./gps-motor.js";

// Importamos el diccionario de plantillas para adelgazar el panel principal
import { MODAL_TEMPLATES } from "./fixgo-modals.js";
// ======================================================================================
// ======================================================================================
// 🔔 SISTEMA DE SONIDO CENTRALIZADO (V5.12 - MACGYVER ENGINE)
// ======================================================================================
// Reemplaza al sistema V5.6. Ya no usa archivos externos (Mixkit).
// Importamos el motor sintetizador que creamos en alert-engine.js

import { activarAlertas, alertaTecnico } from "./alert-engine.js";

/**
 * ACTIVADOR MAESTRO (UNLOCKER)
 * El navegador bloquea el audio hasta que el usuario toca la pantalla.
 * Esto prepara el sintetizador con el primer clic que hagas en el panel.
 */
document.addEventListener('click', () => {
    activarAlertas().then(() => {
        console.log("🔊 FIXGO AUDIO ENGINE: Desbloqueado y listo (Modo Sintetizador).");
    });
}, { once: true }); // "once: true" asegura que solo se ejecute una vez y limpie memoria.

/**
 * WRAPPER DE COMPATIBILIDAD
 * Si tienes alguna parte vieja de tu código que llame a "sonarAlerta()",
 * esto la redirige al nuevo motor para que no se rompa nada.
 */
function sonarAlerta() {
    alertaTecnico();
}
// ======================================================================================
//  📄  CARGADOR DINÁMICO DE PDF (OPTIMIZACIÓN V5.7)
// ======================================================================================
// Carga la librería jsPDF bajo demanda solo cuando se necesita generar un recibo.
// Evita cargar 300KB de librería en el inicio de la app si no se va a usar.
async function cargarLibreriaPDF() {
    if (window.jspdf) return window.jspdf; // Si ya está cargada, la reutilizamos
    
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

console.log(" 🚀  FIXGO 5.12.1: Sistema Full Cargado (Tech SPEI History & Receipts).");

// ======================================================================================
// 1. PANEL DE ADMINISTRADOR (TORRE DE CONTROL)
// ======================================================================================
// Gestiona la vista del admin.html, aprobación de técnicos, monitoreo global y configuración de catálogo.
export async function iniciarPanelAdmin(user) {
    console.log(" 🛡️  Iniciando Panel de Administrador...");
    
    const elementos = {
        lista: document.getElementById("listaTecnicos"),
        actividad: document.getElementById("listaTransacciones"),
        listaRetiros: document.getElementById("listaRetiros"),
        // NUEVOS ELEMENTOS PARA EL HISTORIAL DE RETIROS V5.11.6
        btnToggleHistorialRetiros: document.getElementById("btnToggleHistorialRetiros"),
        vistaRetirosPendientes: document.getElementById("vistaRetirosPendientes"),
        vistaHistorialRetiros: document.getElementById("vistaHistorialRetiros"),
        listaHistorialRetiros: document.getElementById("listaHistorialRetiros"),

        countServ: document.querySelector(".fa-bolt")?.closest(".uber-card")?.querySelector("h3"),
        countMoney: document.querySelector(".fa-wallet")?.closest(".uber-card")?.querySelector("h3"),
        countOnline: document.getElementById("totalTecnicos")
    };

    // ----------------------------------------------------------------------------------
    // 1.A. GESTIÓN DE TÉCNICOS Y APROBACIÓN (LÓGICA DETALLADA V5.6)
    // ----------------------------------------------------------------------------------
    if (elementos.lista) {
        const qTecnicos = query(collection(db, "users"), where("rol", "==", "tecnico"));

        onSnapshot(qTecnicos, (snap) => {
            elementos.lista.innerHTML = ""; // Limpiamos la lista para repintar

            let contOnline = 0;
            let contTotal = 0;
            
            if (snap.empty) {
                elementos.lista.innerHTML = '<p class="text-gray-500 p-4 italic">No hay técnicos registrados en la base de datos.</p>';
            }
            
            snap.forEach((docSnap) => {
                const data = docSnap.data();
                contTotal++;

                // Detección de "online" basado en el booleano 'disponible'
                if(data.disponible) {
                    contOnline++;
                }
                
                const esPendiente = (data.estado || "pendiente") === "pendiente";
                
                // Validación visual de documentos (Mockup visual por ahora)
                const ineCheck = data.documentos?.ine ? '<span class="text-emerald-400"> ✅  INE</span>' : '<span class="text-red-500"> ❌  INE</span>';
                const csfCheck = data.documentos?.csf ? '<span class="text-emerald-400"> ✅  CSF</span>' : '<span class="text-red-500"> ❌  CSF</span>';

                // Mostrar Skills (NUEVO V5.7 - Array de habilidades)
                const skillsStr = data.skills ? data.skills.join(" • ").toUpperCase() : "GENERAL";

                // Indicador visual de estado (Punto verde/gris)
                const estadoDot = data.disponible
                    ? '<span class="text-emerald-500 font-bold text-[10px] animate-pulse">● ONLINE</span>'
                    : '<span class="text-gray-500 text-[10px]">● OFFLINE</span>';

                // Renderizado de la tarjeta del técnico
                const card = document.createElement("div");
                // Si es pendiente, le damos un borde amarillo para resaltar
                card.className = `p-4 mb-3 rounded-xl border ${esPendiente ? 'bg-yellow-900/10 border-yellow-500' : 'bg-zinc-900 border-zinc-800'}`;

                card.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-bold text-white text-sm">
                            ${data.nombre}
                            ${esPendiente ? '<span class="text-[9px] bg-yellow-500 text-black px-1 rounded ml-2 font-black">NUEVO</span>' : ''}
                        </h4>
                        <p class="text-xs text-gray-400">${data.email}</p>
                        <p class="text-[9px] text-blue-400 font-bold mt-1 tracking-wide">SKILLS: ${skillsStr}</p>
                        <p class="text-xs text-gray-400">${data.telefono || ''}</p>
                        
                        <div class="mt-2 text-[10px] bg-black/20 p-1 rounded inline-block border border-white/5">
                            ${ineCheck} | ${csfCheck}
                        </div>
                        
                        <div class="mt-1">
                            ${estadoDot}
                        </div>
                    </div>

                    <div class="flex flex-col gap-2">
                        ${esPendiente ? `
                        <button class="btn-aprobar bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-3 py-2 rounded shadow-lg transition-transform hover:scale-105" onclick="window.aprobarTecnico('${docSnap.id}')">
                            APROBAR ACCESO
                        </button>
                        ` : `
                        <div class="text-center">
                            <i class="fas fa-check-circle text-emerald-800 text-2xl"></i>
                            <p class="text-[8px] text-emerald-800 font-bold mt-1">VERIFICADO</p>
                        </div>
                        `}
                    </div>
                </div>
                `;
                elementos.lista.appendChild(card);
            });
            
            // Actualizamos el contador del Dashboard principal (Header Widget)
            if(elementos.countOnline) {
                elementos.countOnline.innerHTML = `${contOnline} <span class="text-sm text-gray-500">/ ${contTotal}</span>`;
                elementos.countOnline.style.color = contOnline > 0 ? "#10b981" : "white";
            }
        });
    }

    // ----------------------------------------------------------------------------------
    // 1.B. MONITOREO DE SERVICIOS EN TIEMPO REAL (FEED DE ACTIVIDAD)
    // ----------------------------------------------------------------------------------
    const qServicios = query(collection(db, "services"), orderBy("created_at", "desc"));

    onSnapshot(qServicios, (snap) => {
        if(elementos.actividad) elementos.actividad.innerHTML = "";

        let activos = 0;
        
        if (snap.empty) {
            if(elementos.actividad) elementos.actividad.innerHTML = '<p class="text-gray-500 italic text-sm text-center mt-4">Sin actividad reciente en la plataforma.</p>';
        }
        
        snap.forEach(docSnap => {
            const data = docSnap.data();

            // Calculo de Activos (Excluyendo finalizados y cancelados) para el widget de "Rayo"
            if (!["finalizado", "cancelado"].includes(data.estado)) {
                activos++;
            }

            // Renderizar solo los últimos 10 para no saturar el DOM del admin
            if (elementos.actividad && elementos.actividad.children.length < 10) {
                const item = document.createElement("div");
                item.className = "flex justify-between items-center border-b border-white/5 py-3 last:border-0";

                let colorEstado = "text-gray-400";
                if(data.estado === "pendiente") colorEstado = "text-yellow-500";
                if(data.estado === "asignado") colorEstado = "text-blue-300";
                if(data.estado === "en_camino") colorEstado = "text-blue-400";
                if(data.estado === "en_sitio") colorEstado = "text-purple-400";
                if(data.estado === "cotizando") colorEstado = "text-orange-400";
                if(data.estado === "trabajando") colorEstado = "text-blue-500 animate-pulse font-bold";
                if(data.estado === "finalizado") colorEstado = "text-emerald-500";
                if(data.estado === "cancelado") colorEstado = "text-red-500 line-through";
                
                // Formateo de la vertical y subservicio
                const labelServicio = `${data.categoria} ${data.sub_servicio ? '• ' + data.sub_servicio : ''}`;

                item.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="bg-zinc-800 p-2 rounded-lg"><i class="fas fa-tools text-gray-400"></i></div>
                    <div>
                        <p class="text-xs font-bold text-white uppercase">${labelServicio}</p>
                        <p class="text-[10px] text-gray-500">${data.cliente_nombre || 'Cliente'} • ${data.zona || 'Cancún'}</p>
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
        
        // Actualizar Widgets Superiores
        if(elementos.countServ) {
            elementos.countServ.innerText = activos;
            elementos.countServ.style.color = activos > 0 ? "#34d399" : "white";
        }
    });

    // ----------------------------------------------------------------------------------
    // 1.C. MONITOREO DE FINANZAS REALES (V5.11 - DETALLE FISCAL COMPLETO)
    // ----------------------------------------------------------------------------------
    // Ahora calculamos FixGo, IVA, ISR y Neto Técnico
    const qFinanzas = query(collection(db, "transacciones"));
    onSnapshot(qFinanzas, (snap) => {
        let globalFixGo = 0;
        let globalIVA = 0;
        let globalISR = 0;
        let globalTecnico = 0;
        let totalFlujo = 0;

        snap.forEach(docSnap => {
            const tx = docSnap.data();
            // Validamos que existan los campos (para compatibilidad con versiones viejas)
            const fixgo = tx.comision_fixgo || 0;
            const iva = tx.retencion_iva || 0;
            const isr = tx.retencion_isr || 0;
            const tecnico = tx.pago_tecnico || 0;
            const total = tx.monto_total || 0;

            globalFixGo += fixgo;
            globalIVA += iva;
            globalISR += isr;
            globalTecnico += tecnico;
            totalFlujo += total;
        });

        if(elementos.countMoney) {
            // Muestra solo la comisión FIXGO en grande (Tu ganancia)
            elementos.countMoney.innerText = `$${globalFixGo.toFixed(2)}`;
            
            // INYECTAR DESGLOSE DETALLADO (V5.11)
            // Buscamos si ya existe el contenedor de desglose, si no lo creamos
            const cardParent = elementos.countMoney.closest('.uber-card');
            let desgloseContainer = cardParent.querySelector('.finance-breakdown');
            
            if(!desgloseContainer) {
                desgloseContainer = document.createElement('div');
                desgloseContainer.className = "finance-breakdown mt-3 pt-3 border-t border-white/10 text-[9px] text-gray-400 space-y-1";
                cardParent.appendChild(desgloseContainer);
            }

            desgloseContainer.innerHTML = `
                <div class="flex justify-between"><span class="text-blue-400">IVA (8%):</span> <span>$${globalIVA.toFixed(2)}</span></div>
                <div class="flex justify-between"><span class="text-orange-400">ISR (10%):</span> <span>$${globalISR.toFixed(2)}</span></div>
                <div class="flex justify-between"><span class="text-emerald-400">TECNICOS:</span> <span>$${globalTecnico.toFixed(2)}</span></div>
                <div class="flex justify-between font-bold mt-1 text-white border-t border-white/5 pt-1"><span>TOTAL FLUJO:</span> <span>$${totalFlujo.toFixed(2)}</span></div>
            `;
        }
    });

    // Función global para el botón onclick del HTML inyectado (Aprobar Técnico)
    window.aprobarTecnico = async (uid) => {
        if(!confirm("¿Estás seguro de aprobar a este técnico? Tendrá acceso inmediato a ver solicitudes y aceptar trabajos.")) return;
        try {
            await updateDoc(doc(db, "users", uid), {
                estado: "activo",
                status: "activo",
                verificado: true,
                aprobadoEn: serverTimestamp()
            });
            alert(" ✅  Técnico Aprobado y Activado exitosamente.");
        } catch (error) {
            console.error(error);
            alert("Error al aprobar técnico en base de datos.");
        }
    };

    // ----------------------------------------------------------------------------------
    // 1.D. NUEVO: GESTOR DE CATÁLOGO GRANULAR (V5.9) - CONTROL TOTAL
    // ----------------------------------------------------------------------------------
    // Esta función ahora construye la UI completa de las 4 Verticales para el Admin
    // permitiendo apagar/encender servicios específicos (ej: Solo Grúas).
    window.abrirGestorCatalogo = async () => {
        const modal = document.getElementById("modalCatalogo");
        const container = document.getElementById("gridConfiguracion");
        if (modal) modal.classList.remove("hidden");
        
        // Obtenemos la configuración actual de la nube
        const docRef = doc(db, "configuracion", "catalogo_global");
        const docSnap = await getDoc(docRef);
        let config = {}; 
        if(docSnap.exists()) config = docSnap.data();

        // Estructura Maestra (Debe coincidir con la del Cliente para que los IDs funcionen)
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
            
            // Iteramos sobre las categorías maestras para pintar la UI del Admin
            for (const [categoria, servicios] of Object.entries(MASTER_STRUCTURE)) {
                html += `
                <div class="mb-4 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
                    <h4 class="text-emerald-500 font-bold text-xs uppercase mb-3 border-b border-zinc-700 pb-1">${categoria}</h4>
                    <div class="space-y-2">`;
                
                servicios.forEach(srv => {
                    // Si no existe en la BD, asumimos false por seguridad (Próximamente por defecto)
                    const isChecked = config[srv.id] === true;
                    
                    html += generarSwitchGranular(srv.id, srv.label, isChecked);
                });
                
                html += `</div></div>`;
            }
            container.innerHTML = html;
        }
    };

    // Función modificada para guardar TODOS los switches granulares en Firestore
    window.guardarConfiguracionGlobal = async () => {
        // Recolectamos todos los inputs que empiecen con "cfg_"
        const inputs = document.querySelectorAll('input[id^="cfg_"]');
        let nuevaConfig = {
            updatedAt: serverTimestamp() // Audit log
        };

        inputs.forEach(input => {
            // Extraemos el ID real (quitando el prefijo cfg_)
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

    // ----------------------------------------------------------------------------------
    // 1.E. NUEVO: CONTROL DE RETIROS SPEI (V5.12 - LÓGICA BRIDGE BLINDADA)
    // ----------------------------------------------------------------------------------
    
    // Toggle para cambiar entre Retiros Pendientes e Historial
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

    // Llenado de Retiros Pendientes
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
                            <p class="text-white font-bold text-sm uppercase">${ret.tecnico_nombre}</p>
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

        // --- FUNCIÓN GLOBAL REDEFINIDA (QUIRÚRGICA) ---
        window.aprobarRetiro = async (retiroId, tecnicoId, monto) => {
            if(!confirm("¿Confirmas que ya realizaste la transferencia SPEI por $"+monto.toFixed(2)+"?\n\nEsto descontará el saldo de la wallet mediante protocolo seguro Bridge.")) return;
            
            // ESCUDO ANTI-DEDO NERVIOSO
            const btn = document.getElementById(`btn_aprobar_${retiroId}`);
            if(btn) {
                btn.disabled = true;
                btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> PROCESANDO ATÓMICO...`;
                btn.classList.add("opacity-50", "cursor-not-allowed");
            }

            try {
                // MODIFICACIÓN MAESTRA: LLAMADA AL BRIDGE
                const { ejecutarRetiroSeguro } = await import('./fixgo-bridge.js');
                await ejecutarRetiroSeguro(retiroId, tecnicoId, monto);

                alert("✅ Retiro procesado exitosamente. Wallet del técnico actualizada mediante transacción segura.");
            } catch (error) {
                console.error("Error al procesar retiro:", error);
                alert("❌ Error de seguridad al procesar el retiro en el Bridge.");
                // Si falla, liberamos el botón
                if(btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fas fa-check-double"></i> MARCAR COMO PAGADO (SPEI)`;
                    btn.classList.remove("opacity-50", "cursor-not-allowed");
                }
            }
        };
    }

    // 1.F NUEVO: Llenado del Historial de Retiros Aprobados (V5.11.6)
    if (elementos.listaHistorialRetiros) {
        // Requiere índice compuesto en Firebase: estado ASC, fecha_aprobacion DESC
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
                        <p class="text-white font-bold text-xs uppercase">${ret.tecnico_nombre}</p>
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

// Helper para generar el HTML de switches individuales (V5.9)
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
// 2. PANEL DE TÉCNICO (SOCIO OPERADOR)
// ======================================================================================
// Gestiona la vista del tecnico.html, toggle On/Off, Radar, Bolsa de Trabajo y Flujo de Servicio.
export async function iniciarPanelTecnico(user) {
    console.log(" 🔧  Iniciando Panel de Técnico...");
    
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
        // NUEVOS ELEMENTOS V5.11.7: Historial de Retiros del Técnico
        contenedorHistorialRetiros: document.getElementById("contenedorHistorialRetiros"),
        listaMisRetiros: document.getElementById("listaMisRetiros")
    };

    // ----------------------------------------------------------------------------------
    // 2.A. ESTADO DEL TÉCNICO Y PERFIL (VERIFICACIÓN)
    // ----------------------------------------------------------------------------------
    const tecnicoRef = doc(db, "users", user.uid);
    onSnapshot(tecnicoRef, (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        const estado = data.estado || "pendiente";

        // Caso: Pendiente de Aprobación (Cuenta bloqueada)
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

        // Caso: Activo (Puede operar)
        if (elementos.toggleONOFF) {
            elementos.toggleONOFF.disabled = false;
            elementos.toggleONOFF.checked = data.disponible === true;
        }

        if (data.disponible) {
            // ENCENDIDO: Inicia GPS y Escucha Bolsa
            iniciarTracking(user.uid);
            elementos.seccionBolsa?.classList.remove("hidden");
            escucharBolsa(user, elementos.listaBolsa); // Le pasamos el user para ver sus Skills

            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "EN LÍNEA";
                elementos.statusLabel.className = "bg-emerald-500/20 text-emerald-500 status-badge font-bold animate-pulse";
            }
            elementos.radarSection?.classList.remove("opacity-50", "grayscale");
        } else {
            // APAGADO: Detiene GPS y Oculta Bolsa
            detieneTracking();
            elementos.seccionBolsa?.classList.add("hidden");

            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "OFFLINE";
                elementos.statusLabel.className = "bg-red-500/20 text-red-500 status-badge font-bold";
            }
            elementos.radarSection?.classList.add("opacity-50", "grayscale");
        }
    });

    // ----------------------------------------------------------------------------------
    // 2.D. WALLET & GANANCIAS (V5.11.4 - LOGICA 24 HORAS + MATEMATICA DE RETIROS)
    // ----------------------------------------------------------------------------------
    const qWallet = query(collection(db, "transacciones"), where("tecnico_id", "==", user.uid));
    const qRetirosPendientes = query(collection(db, "retiros"), where("tecnico_id", "==", user.uid), where("estado", "==", "pendiente"));
    
    // Usamos variables globales para el estado financiero del técnico
    let saldoBrutoDisponible = 0;
    let saldoRetenido = 0;
    let retirosEnProceso = 0;

    // Escuchador 1: Transacciones (El dinero ganado y los retiros ya aprobados)
    onSnapshot(qWallet, (snap) => {
        saldoBrutoDisponible = 0;
        saldoRetenido = 0;
        const ahora = new Date();

        snap.forEach(docSnap => {
            const tx = docSnap.data();
            const monto = (tx.pago_tecnico || 0);
            
            // Si la transacción es un retiro (monto negativo), se descuenta INMEDIATAMENTE
            if (tx.tipo === "retiro_fondos") {
                saldoBrutoDisponible += monto; 
            } else {
                // Lógica normal de 24 horas para ingresos por servicios
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

    // Escuchador 2: Retiros Pendientes
    onSnapshot(qRetirosPendientes, (snap) => {
        retirosEnProceso = 0;
        snap.forEach(docSnap => {
            retirosEnProceso += docSnap.data().monto;
        });
        actualizarUIWallet();
    });

    function actualizarUIWallet() {
        const saldoRealDisponible = saldoBrutoDisponible - retirosEnProceso;

        if(elementos.walletLabel) {
            elementos.walletLabel.innerHTML = `
                $${saldoRealDisponible.toFixed(2)}
                <span class="text-[9px] text-gray-400 block font-normal">PROCESANDO: $${saldoRetenido.toFixed(2)}</span>
            `;
            
            if(saldoRetenido > 0 || retirosEnProceso > 0) {
                 elementos.walletLabel.classList.add("animate-pulse"); 
            } else {
                 elementos.walletLabel.classList.remove("animate-pulse");
            }
        }

        // Lógica del Botón de Retiro
        if(elementos.btnRetiro) {
            if(retirosEnProceso > 0) {
                elementos.btnRetiro.disabled = true;
                elementos.btnRetiro.className = "w-full py-4 bg-emerald-900/40 text-emerald-500 font-black rounded-xl cursor-not-allowed text-sm animate-pulse border border-emerald-500/30";
                elementos.btnRetiro.onclick = null;
                elementos.btnRetiro.innerText = "RETIRO EN PROCESO ($" + retirosEnProceso.toFixed(2) + ")";
            } 
            else if(saldoRealDisponible > 0) {
                elementos.btnRetiro.disabled = false;
                elementos.btnRetiro.className = "w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-sm shadow-lg shadow-emerald-500/20 transition-all transform active:scale-95";
                elementos.btnRetiro.innerText = "SOLICITAR RETIRO (SPEI)";
                
                elementos.btnRetiro.onclick = async () => {
                    if(!confirm(`¿Deseas solicitar el retiro de $${saldoRealDisponible.toFixed(2)} a tu cuenta vía SPEI?`)) return;
                    
                    elementos.btnRetiro.innerText = "SOLICITANDO...";
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
                        alert("❌ Hubo un error al procesar tu solicitud.");
                        elementos.btnRetiro.innerText = "SOLICITAR RETIRO (SPEI)";
                        elementos.btnRetiro.disabled = false;
                    }
                };
            } else {
                elementos.btnRetiro.disabled = true;
                elementos.btnRetiro.className = "w-full py-4 bg-emerald-600/20 text-emerald-500 font-black rounded-xl cursor-not-allowed text-sm";
                elementos.btnRetiro.onclick = null;
                elementos.btnRetiro.innerText = "SOLICITAR RETIRO (SPEI)";
            }
        }
    }

    // ----------------------------------------------------------------------------------
    // 2.E. NUEVO: HISTORIAL DE RETIROS DEL TÉCNICO (V5.11.7)
    // ----------------------------------------------------------------------------------
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
            console.warn("Error historial retiros técnico.", error);
            elementos.listaMisRetiros.innerHTML = '<p class="text-red-500 text-[10px] text-center p-2">Sincronizando índices...</p>';
            elementos.contenedorHistorialRetiros.classList.remove("hidden");
        });
    }

    // Switch ON/OFF
    if (elementos.toggleONOFF) {
        elementos.toggleONOFF.addEventListener("change", async (e) => {
            await updateDoc(tecnicoRef, {
                disponible: e.target.checked,
                last_seen: serverTimestamp()
            });
        });
    }

    // ----------------------------------------------------------------------------------
    // 2.B. BOLSA DE TRABAJO (CON SONIDO Y FILTRO DE SKILLS + RECHAZO V5.10)
    // ----------------------------------------------------------------------------------
    function escucharBolsa(tecnico, contenedor) {
        if(!contenedor) return;
        const q = query(collection(db, "services"), where("estado", "==", "pendiente"), orderBy("created_at", "desc"));

        onSnapshot(q, (snap) => {
            contenedor.innerHTML = "";
            let counter = 0;

            if(snap.empty) {
                contenedor.innerHTML = `<p class="text-gray-600 text-[10px] text-center italic py-4">Escaneando zona... esperando solicitudes.</p>`;
                return;
            }

            if(snap.docChanges().some(change => change.type === 'added')) {
                sonarAlerta();
            }

            snap.forEach((docSnap) => {
                const s = docSnap.data();
                const id = docSnap.id;

                if (s.rejected_by && s.rejected_by.includes(tecnico.uid)) return;

                const misSkills = tecnico.skills || [];
                if (s.categoria && misSkills.length > 0 && !misSkills.includes(s.categoria)) return;

                counter++; 

                const card = document.createElement("div");
                card.className = "bg-zinc-900 border border-zinc-700 p-4 rounded-xl mb-3 animate-pulse border-emerald-500 shadow-lg shadow-emerald-900/20";

                card.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <span class="bg-emerald-500 text-black text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">NUEVA SOLICITUD</span>
                    <span class="text-white font-bold text-xs">${s.categoria || 'GENERAL'}</span>
                </div>
                <h4 class="text-white font-bold text-base mb-1">${s.zona || 'Cancún'}</h4>
                <p class="text-gray-300 text-sm mb-3 font-medium italic">"${s.descripcion}"</p>
                <div class="flex gap-2">
                    <button class="flex-1 bg-red-900/30 text-red-400 font-bold py-3 rounded-lg text-xs" onclick="window.rechazarServicio('${id}', '${tecnico.uid}')"><i class="fas fa-times"></i></button>
                    <button class="flex-[4] bg-emerald-500 text-black font-black py-3 rounded-lg text-xs uppercase" onclick="window.tomarServicio('${id}', '${tecnico.uid}', '${tecnico.nombre}')">ACEPTAR (BLOQUEAR $550)</button>
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
        if(!confirm("¿Ocultar esta solicitud?")) return;
        try {
            await updateDoc(doc(db, "services", id), { rejected_by: arrayUnion(uid) });
        } catch (error) { console.error(error); }
    };

    window.tomarServicio = async (id, uid, nombre) => {
        const qCheck = query(
            collection(db, "services"), 
            where("tecnico_id", "==", uid),
            where("estado", "in", ["asignado", "en_camino", "en_sitio", "cotizando", "trabajando"])
        );
        
        const snapCheck = await getDocs(qCheck);
        if (!snapCheck.empty) {
            alert("⛔ BLOQUEO DE SEGURIDAD\n\nYa tienes un servicio activo.");
            return;
        }

        if(!confirm("¿Aceptar este servicio?")) return;
        try {
            await updateDoc(doc(db, "services", id), {
                estado: "asignado",
                tecnico_id: uid,
                tecnico_nombre: nombre,
                tecnico_telefono: user.telefono || "",
                asignado_at: serverTimestamp()
            });
        } catch (error) { console.error(error); }
    };

    // ----------------------------------------------------------------------------------
 // 2.C. FLUJO ACTIVO (MISIONES Y MODAL EVIDENCIA BLINDADO V5.12)
    // ----------------------------------------------------------------------------------
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
            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-blue-500/50 p-6 rounded-2xl mb-4";
            card.innerHTML = `
            <h3 class="text-xl font-black text-white mb-1 uppercase">${s.categoria}</h3>
            <p class="text-gray-400 text-sm mb-4"><i class="fas fa-map-marker-alt text-blue-500"></i> ${s.direccion}</p>
            <div class="flex gap-2">
                <a href="tel:${s.cliente_telefono}" class="flex-1 bg-zinc-800 text-white font-bold py-3 rounded-xl text-center"><i class="fas fa-phone"></i> LLAMAR CLIENTE</a>
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
                btn1.onclick = () => actualizarEstado(id, "en_camino");
            }
            else if (s.estado === "en_camino") {
                btn2.classList.remove("hidden");
                btn2.innerText = "YA LLEGUÉ AL SITIO";
                btn2.onclick = () => actualizarEstado(id, "en_sitio");
            }
            else if (s.estado === "en_sitio") {
                btn2.classList.remove("hidden");
                btn2.innerText = "CREAR COTIZACIÓN";
                btn2.onclick = () => mostrarModalCotizacionDetallada(id, s);
            }
            else if (s.estado === "trabajando") {
                btn2.classList.remove("hidden");
                btn2.innerText = " 📸  FINALIZAR Y EVIDENCIA";
                btn2.onclick = () => mostrarModalEvidencia(id);
            }
        });
    });

    async function actualizarEstado(id, estado, extras = {}) {
        await updateDoc(doc(db, "services", id), { estado: estado, ...extras });
        const rastreoRef = doc(db, "rastreo", "tecnicoActivo");
        await setDoc(rastreoRef, { estado: estado }, { merge: true });
    }

    // MODAL DE COTIZACIÓN DETALLADA (V5.12 - MODULAR)
    function mostrarModalCotizacionDetallada(id, servicioData) {
        if(document.getElementById("modalCot")) return;
        let items = []; 

        // Inyección dinámica desde el diccionario de plantillas
        const html = MODAL_TEMPLATES.COTIZACION(id);
        document.body.insertAdjacentHTML('beforeend', html);

        const renderItems = () => {
            const container = document.getElementById("listaPartidas");
            container.innerHTML = items.map((it, idx) => `<div class="text-white text-xs border-b border-zinc-800 py-1">${it.cantidad} - ${it.descripcion} - $${it.precio}</div>`).join('');
        };

        setTimeout(() => {
            document.getElementById("btnAddItem").onclick = () => {
                const cant = parseFloat(document.getElementById("inCant").value);
                const desc = document.getElementById("inDesc").value;
                const precio = parseFloat(document.getElementById("inPrecio").value);
                if(!cant || !desc || !precio) return alert("Llena campos.");
                items.push({ cantidad: cant, descripcion: desc, precio: precio, unidad: 'pz' });
                renderItems();
            };
            document.getElementById("btnEnviarCot").onclick = async () => {
                if(items.length === 0) return alert("Agrega partidas.");
                const total = items.reduce((sum, it) => sum + (it.cantidad * it.precio), 0);
                await updateDoc(doc(db, "services", id), {
                    estado: "cotizando",
                    detalles_cotizacion: items,
                    costo_final: total,
                    cotizado_at: serverTimestamp()
                });
                document.getElementById("modalCot").remove();
            };
        }, 100);
    }

    // 📸 MODAL EVIDENCIA (REAL CON BASE64 Y LLAMADA BRIDGE BLINDADA V5.12 - MODULAR)
    function mostrarModalEvidencia(id) {
        if(document.getElementById("modalEvidencia")) return;

        // Inyección dinámica desde el diccionario de plantillas
        const html = MODAL_TEMPLATES.EVIDENCIA;
        document.body.insertAdjacentHTML('beforeend', html);
        
        document.getElementById("btnSubirEvidencia").onclick = async () => {
            const f1 = document.getElementById("fileAntes").files[0];
            const f2 = document.getElementById("fileDespues").files[0];
            if(!f1 || !f2) { alert(" ⚠ ️ Ambas fotos son obligatorias."); return; }

            const btn = document.getElementById("btnSubirEvidencia");
            btn.innerText = "BRIDGE PROCESANDO PAGO...";
            btn.disabled = true;
            
            try {
                // Conversión a Base64
                const b64_1 = await toBase64(f1);
                const b64_2 = await toBase64(f2);
                
                // MODIFICACIÓN MAESTRA: LLAMADA AL BRIDGE (CEREBRO UNICORNIO)
                const { finalizarServicioBlindado } = await import('./fixgo-bridge.js');
                const respuesta = await finalizarServicioBlindado(id, user.uid, b64_1, b64_2);

                if(respuesta.success) {
                    document.getElementById("modalEvidencia").remove();
                    alert(" ✅ ¡Servicio Cerrado! El servidor procesó el pago de forma blindada.");
                }
            } catch (e) {
                console.error(e);
                alert("Error de seguridad en el cierre.");
                btn.innerText = "REINTENTAR";
                btn.disabled = false;
            }
        };
    }

    // Helper: Convertir archivo a texto Base64
    const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
    // 📄 PDF DE RETIRO (V5.11.7)
    window.generarPDFRetiro = async (retiroId) => {
        const { jsPDF } = await cargarLibreriaPDF();
        const docPdf = new jsPDF();
        docPdf.text("FIXGO - COMPROBANTE DE RETIRO", 10, 10);
        docPdf.save(`Retiro_${retiroId}.pdf`);
    };
}

// ======================================================================================
// 3. PANEL DE CLIENTE (USUARIO FINAL) - V5.12.1
// ======================================================================================
export async function iniciarPanelCliente(user) {
    console.log(" 📱  Iniciando Panel de Cliente...");

    const el = {
        form: document.getElementById("nuevaSolicitudForm"),
        lista: document.getElementById("solicitudesCliente"),
        inputCat: document.getElementById("categoriaSeleccionada"),
        labelServicio: document.getElementById("btnLabel"),
        // Estos IDs asumen que tus contenedores HTML dentro de cada acordeón se llaman así.
        // Verifícalos en tu archivo cliente.html
        containerRoad: document.getElementById("content_road"),
        containerFix: document.getElementById("content_fix"),
        containerTech: document.getElementById("content_tech"),
        containerMaint: document.getElementById("content_maint")
    };

    // Estructura Maestra (Debe coincidir con la de tu Admin)
    const MASTER_STRUCTURE = {
        "road": [
            { id: "road_llanta", label: "Llantera Móvil", icon: "fa-car-crash" },
            { id: "road_cerrajero", label: "Cerrajería", icon: "fa-key" },
            { id: "road_grua", label: "Grúas", icon: "fa-truck-pickup" },
            { id: "road_mecanico", label: "Mecánico Gral.", icon: "fa-wrench" },
            { id: "road_corriente", label: "Paso Corriente", icon: "fa-car-battery" }
        ],
        "fix": [
            { id: "fix_electricidad", label: "Electricidad", icon: "fa-plug" },
            { id: "fix_plomeria", label: "Plomería", icon: "fa-faucet" },
            { id: "fix_ac", label: "Aires Acondicionad.", icon: "fa-snowflake" },
            { id: "fix_jardin", label: "Jardinería", icon: "fa-leaf" },
            { id: "fix_pintura", label: "Pintura", icon: "fa-paint-roller" },
            { id: "fix_alberca", label: "Albercas", icon: "fa-swimming-pool" },
            { id: "fix_fumigacion", label: "Fumigación", icon: "fa-bug" }
        ],
        "maint": [
            { id: "maint_general", label: "Mantenimiento Gral.", icon: "fa-building" }
        ],
        "tech": [
            { id: "tech_cctv", label: "CCTV", icon: "fa-video" },
            { id: "tech_alarma", label: "Alarmas", icon: "fa-bell" },
            { id: "tech_acceso", label: "Accesos", icon: "fa-id-card" },
            { id: "tech_elevador", label: "Elevadores", icon: "fa-elevator" },
            { id: "tech_planta", label: "Plantas Eléc.", icon: "fa-charging-station" },
            { id: "tech_solar", label: "Paneles Solares", icon: "fa-solar-panel" }
        ]
    };

    // 3.A. CARGAR CATÁLOGO DINÁMICO DESDE FIRESTORE
    const docRef = doc(db, "configuracion", "catalogo_global");
    onSnapshot(docRef, (docSnap) => {
        let config = {}; 
        if(docSnap.exists()) config = docSnap.data();

        // Función interna para inyectar HTML de forma dinámica
        const renderizarCategoria = (categoriaClave, contenedor) => {
            if(!contenedor) return;
            contenedor.innerHTML = ""; // Limpiar antes de pintar
            let html = '<div class="grid grid-cols-2 gap-2 p-3 bg-black/50 rounded-b-xl border-x border-b border-zinc-800">';
            
            MASTER_STRUCTURE[categoriaClave].forEach(srv => {
                // Validar si el admin lo tiene encendido. 
                const isActivo = config[srv.id] !== false; // Asumimos true por defecto si no ha sido configurado
                
                if (isActivo) {
                    html += `
                    <button onclick="window.seleccionarServicio('${srv.id}', '${srv.label}')" 
                            class="flex flex-col items-center justify-center p-3 bg-zinc-900 border border-zinc-700 rounded-xl hover:bg-emerald-900/30 hover:border-emerald-500 transition-all text-gray-300 hover:text-emerald-400 active:scale-95">
                        <i class="fas ${srv.icon} text-lg mb-2"></i>
                        <span class="text-[10px] font-bold text-center leading-tight uppercase">${srv.label}</span>
                    </button>`;
                }
            });
            
            html += '</div>';
            contenedor.innerHTML = html;
        };

        // Renderizamos cada sección del catálogo
        renderizarCategoria("road", el.containerRoad);
        renderizarCategoria("fix", el.containerFix);
        renderizarCategoria("tech", el.containerTech);
        renderizarCategoria("maint", el.containerMaint);
    });

    // 3.B. SELECCIÓN DE SERVICIO Y APERTURA DE FORMULARIO
    window.seleccionarServicio = (id, label) => {
        if(el.inputCat) el.inputCat.value = id;
        if(el.labelServicio) el.labelServicio.innerText = "SOLICITAR " + label.toUpperCase();
        
        // Abre tu modal de solicitud
        const modal = document.getElementById("modalSolicitud");
        if(modal) {
            modal.classList.remove("hidden");
            if(el.form) el.form.reset();
        } else {
            console.warn("No se encontró el modal de solicitud (modalSolicitud).");
        }
    };

    // 3.C. ESCUCHA DE SOLICITUDES ACTIVAS DEL CLIENTE
    onSnapshot(query(collection(db, "services"), where("cliente_id", "==", user.uid), orderBy("created_at", "desc")), (snap) => {
        if(!el.lista) return;
        el.lista.innerHTML = "";
        
        if(snap.empty) {
            el.lista.innerHTML = '<p class="text-gray-500 italic text-xs text-center py-4">No tienes solicitudes activas.</p>';
            return;
        }

        snap.forEach(docSnap => {
            const s = docSnap.data();
            const id = docSnap.id;
            
            let colorEstado = "text-gray-400";
            if(s.estado === "pendiente") colorEstado = "text-yellow-500 animate-pulse";
            if(s.estado === "asignado") colorEstado = "text-blue-300";
            if(s.estado === "en_camino") colorEstado = "text-blue-400";
            if(s.estado === "en_sitio") colorEstado = "text-purple-400";
            if(s.estado === "cotizando") colorEstado = "text-orange-400 animate-pulse";
            if(s.estado === "trabajando") colorEstado = "text-emerald-400 font-bold";
            if(s.estado === "finalizado") colorEstado = "text-emerald-500";
            
            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-zinc-700 rounded-xl p-4 mb-3 shadow-lg flex justify-between items-center";
            card.innerHTML = `
            <div>
                <h4 class="font-black text-white text-xs uppercase">${s.categoria}</h4>
                <p class="text-[10px] text-gray-400 truncate max-w-[150px]">${s.descripcion || 'Sin descripción'}</p>
            </div>
            <div class="text-right">
                <p class="text-[10px] font-black ${colorEstado} uppercase tracking-widest">${s.estado.replace('_', ' ')}</p>
                ${s.estado === 'cotizando' ? `<button onclick="window.verCotizacion('${id}')" class="mt-1 text-[9px] bg-orange-500/20 text-orange-400 border border-orange-500 px-2 py-1 rounded">VER COTIZACIÓN</button>` : ''}
            </div>
            `;
            el.lista.appendChild(card);
        });
    });

    window.generarPDF = async (serviceId) => {
        const { jsPDF } = await cargarLibreriaPDF();
        const docPdf = new jsPDF();
        docPdf.text("FIXGO - REPORTE DE SERVICIO", 10, 10);
        docPdf.save(`Reporte_${serviceId}.pdf`);
    };
}

/**
 * 🔔 FIXGO AUDIO WATCHDOG (Vigilante de Alertas V5.12)
 */
function iniciarVigilanciaAudio() {
    console.log("👂 Audio Watchdog: Iniciando escucha...");
    const qAudio = query(collection(db, "services"), where("estado", "==", "pendiente"));
    onSnapshot(qAudio, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                alertaTecnico(); 
            }
        });
    });
}

// Ejecutamos el vigilante
iniciarVigilanciaAudio();
