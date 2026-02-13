/**
 * ======================================================================================
 * FIXGO 2026 - PANEL MAESTRO DE CONTROL (LOGIC CORE) - ARQUITECTURA MAESTRA
 * ======================================================================================
 * Archivo: app-panel.js
 * Versión: 5.11.0 (FINANCE LOGIC + ACCORDION UI CLIENT)
 * Base: V5.10.0
 * Autor: Heber (CEO & Lead Architect)
 * Fecha: Febrero 2026
 * * DESCRIPCIÓN TÉCNICA:
 * Este archivo gestiona la lógica de negocio central de los 3 paneles (Admin, Técnico, Cliente).
 * Controla:
 * 1. Flujos de estado (Pendiente -> Asignado -> En Camino -> En Sitio -> Cotizando -> Trabajando -> Finalizado).
 * 2. Sistema de Verticales (ROAD, FIX, MAINT, TECH) con activación granular y UI Acordeón.
 * 3. Gestión Financiera AVANZADA (Desglose Fiscal: FixGo 32%, IVA 8%, ISR 10%).
 * 4. Wallet Inteligente (Liberación de fondos 24 horas).
 * 5. Evidencia y Seguridad (Bloqueo de garantías, fotos antes/después, coordenadas GPS).
 * 6. Generación de Documentos (PDF Fiscal Simulado).
 * * REGLAS DE ARQUITECTURA:
 * - NO COMPACTAR.
 * - NO FRAGMENTAR.
 * - MANTENER LOGICA DE 1600+ LÍNEAS.
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

console.log(" 🚀  FIXGO 5.11.0: Sistema Full Cargado (Finance Core: 24h Release + Tax Splits).");

// ======================================================================================
// 1. PANEL DE ADMINISTRADOR (TORRE DE CONTROL)
// ======================================================================================
// Gestiona la vista del admin.html, aprobación de técnicos, monitoreo global y configuración de catálogo.
export async function iniciarPanelAdmin(user) {
    console.log(" 🛡️  Iniciando Panel de Administrador...");
    
    const elementos = {
        lista: document.getElementById("listaTecnicos"),
        actividad: document.getElementById("listaTransacciones"),
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
        walletLabel: document.getElementById("walletSaldo") // ELEMENTO NUEVO V5.7.4
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
    // 2.D. WALLET & GANANCIAS (V5.11 - LOGICA 24 HORAS DE LIBERACIÓN)
    // ----------------------------------------------------------------------------------
    const qWallet = query(collection(db, "transacciones"), where("tecnico_id", "==", user.uid));
    
    onSnapshot(qWallet, (snap) => {
        let saldoDisponible = 0;
        let saldoRetenido = 0;
        const ahora = new Date();

        snap.forEach(docSnap => {
            const tx = docSnap.data();
            const monto = (tx.pago_tecnico || 0);
            
            // Verificamos fecha de la transacción
            // Si tiene fecha, calculamos antiguedad. Si no, asumimos retenido por seguridad.
            if (tx.fecha && tx.fecha.toDate) {
                const fechaTx = tx.fecha.toDate();
                const diffHoras = Math.abs(ahora - fechaTx) / 36e5; // Diferencia en horas

                if (diffHoras >= 24) {
                    saldoDisponible += monto; // Ya pasaron 24h, es libre
                } else {
                    saldoRetenido += monto; // Menos de 24h, retenido
                }
            } else {
                saldoRetenido += monto; // Fallback
            }
        });
        
        // Actualizamos la UI
        if(elementos.walletLabel) {
            // Formato: $Disponible (En Proceso: $Retenido)
            elementos.walletLabel.innerHTML = `
                $${saldoDisponible.toFixed(2)}
                <span class="text-[9px] text-gray-400 block font-normal">PROCESANDO: $${saldoRetenido.toFixed(2)}</span>
            `;
            
            // Añadimos indicador de "Candado" si hay saldo retenido
            if(saldoRetenido > 0) {
                 elementos.walletLabel.classList.add("animate-pulse"); // Visual cue
            } else {
                 elementos.walletLabel.classList.remove("animate-pulse");
            }
        } else {
            console.log("💰 Wallet Técnico (Debug): Disp:", saldoDisponible, "Ret:", saldoRetenido);
        }
    });

    // Listener para el Switch ON/OFF principal
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

            //  🔔  SONIDO: Si llega una nueva solicitud (evento 'added')
            if(snap.docChanges().some(change => change.type === 'added')) {
                console.log(" 🔔  Nueva solicitud detectada en Bolsa: SONANDO ALERTA");
                sonarAlerta();
            }

            snap.forEach((docSnap) => {
                const s = docSnap.data();
                const id = docSnap.id;

                // --- NUEVO V5.10: FILTRO DE RECHAZADOS (OCULTAR PARA MÍ) ---
                // Si mi UID está en el array 'rejected_by', no pinto este servicio.
                if (s.rejected_by && s.rejected_by.includes(tecnico.uid)) {
                    return; // Saltamos este servicio
                }

                // --- FILTRO DE SKILLS (V5.7) ---
                // Si el técnico no tiene la skill requerida para la categoría, no se le muestra
                const misSkills = tecnico.skills || [];
                // Si la categoría del servicio no está en mis skills, lo salto (y tengo al menos 1 skill)
                if (s.categoria && misSkills.length > 0 && !misSkills.includes(s.categoria)) {
                    return; // No mostrar este servicio
                }

                counter++; // Contamos los servicios que realmente se mostraron

                const card = document.createElement("div");
                card.className = "bg-zinc-900 border border-zinc-700 p-4 rounded-xl mb-3 animate-pulse border-emerald-500 shadow-lg shadow-emerald-900/20";

                card.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <span class="bg-emerald-500 text-black text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">NUEVA SOLICITUD</span>
                    <span class="text-white font-bold text-xs">${s.categoria ? s.categoria.toUpperCase() : 'GENERAL'}</span>
                </div>
                <h4 class="text-white font-bold text-base mb-1">${s.zona || 'Cancún'}</h4>
                <p class="text-gray-300 text-sm mb-3 font-medium italic">"${s.descripcion}"</p>
                <div class="flex items-center gap-2 mb-3 text-xs text-gray-500">
                    <i class="fas fa-map-marker-alt"></i> ${s.direccion}
                </div>
                
                <div class="flex gap-2">
                    <button class="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 font-bold py-3 rounded-lg text-xs transition-colors" onclick="window.rechazarServicio('${id}', '${tecnico.uid}')">
                        <i class="fas fa-times"></i>
                    </button>
                    <button class="flex-[4] bg-emerald-500 hover:bg-emerald-400 text-black font-black py-3 rounded-lg text-xs uppercase transition-all transform active:scale-95" onclick="window.tomarServicio('${id}', '${tecnico.uid}', '${tecnico.nombre}')">
                        ACEPTAR (BLOQUEAR $550)
                    </button>
                </div>
                `;
                contenedor.appendChild(card);
            });

            // Si después de filtrar no quedó nada, mostramos mensaje
            if (counter === 0) {
                contenedor.innerHTML = `<p class="text-gray-600 text-[10px] text-center italic py-4">No hay solicitudes disponibles para tu perfil.</p>`;
            }
        });
    }

    // --- NUEVO V5.10: FUNCIÓN GLOBAL PARA RECHAZAR (OCULTAR) SERVICIO ---
    window.rechazarServicio = async (id, uid) => {
        if(!confirm("¿Estás seguro de ocultar esta solicitud?\n\nNo podrás verla nuevamente, pero seguirá disponible para otros técnicos.")) return;
        
        try {
            // Usamos arrayUnion para agregar el ID sin sobrescribir el array existente
            await updateDoc(doc(db, "services", id), {
                rejected_by: arrayUnion(uid)
            });
            // El onSnapshot detectará el cambio y filtrará la tarjeta automáticamente
        } catch (error) {
            console.error(error);
            alert("Error al intentar rechazar el servicio. Intenta de nuevo.");
        }
    };

    // Función global para aceptar servicio (CON BLOQUEO DE MULTITASKING V5.7)
    window.tomarServicio = async (id, uid, nombre) => {
        // 1. VALIDACIÓN DE UNICIDAD (No Multitasking)
        // Verificamos si el técnico ya tiene un servicio activo en cualquier estado de progreso
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

        if(!confirm("¿Aceptar este servicio? \n\nSe notificará al cliente y se bloqueará la garantía.")) return;
        try {
            // Asignación Atómica
            await updateDoc(doc(db, "services", id), {
                estado: "asignado",
                tecnico_id: uid,
                tecnico_nombre: nombre,
                tecnico_telefono: user.telefono || "",
                asignado_at: serverTimestamp()
            });
            // El propio onSnapshot del flujo activo actualizará la UI automáticamente
        } catch (error) {
            console.error(error);
            alert("Error: El servicio ya fue tomado por otro técnico hace un momento.");
        }
    };

    // ----------------------------------------------------------------------------------
    // 2.C. FLUJO ACTIVO (MISIONES Y BOTONES DE ESTADO)
    // ----------------------------------------------------------------------------------
    // Escuchamos servicios donde soy el técnico y el estado es activo
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

        // Si no hay misiones, escondemos el panel inferior deslizante
        if (snap.empty) {
            if(pa) pa.classList.add("translate-y-full");
            return;
        }

        // Si hay misiones, mostramos el panel
        if(pa) pa.classList.remove("translate-y-full");
        
        snap.forEach((docSnap) => {
            const s = docSnap.data();
            const id = docSnap.id;

            // Construcción inteligente del link de Waze
            // Si el cliente dio coordenadas GPS (V5.8+), usamos esas. Si no, la dirección texto.
            const destinoWaze = s.coords
                ? `${s.coords.lat},${s.coords.lng}`
                : encodeURIComponent(s.direccion);

            // Render Tarjeta de Misión Activa
            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-blue-500/50 p-6 rounded-2xl relative overflow-hidden mb-4 shadow-xl";
            card.innerHTML = `
            <div class="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase">
                ${s.estado.replace('_', ' ')}
            </div>
            <h3 class="text-xl font-black text-white mb-1 uppercase">${s.categoria}</h3>
            <p class="text-gray-400 text-sm mb-4">
                <i class="fas fa-map-marker-alt text-blue-500"></i> ${s.direccion}
            </p>
            <div class="bg-black/50 p-4 rounded-xl mb-4">
                <p class="text-xs text-gray-500 uppercase font-bold mb-1">Problema:</p>
                <p class="text-sm text-white italic">"${s.descripcion}"</p>
            </div>
            <div class="flex gap-2">
                <a href="https://waze.com/ul?q=${destinoWaze}" target="_blank" class="flex-1 bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 rounded-xl text-center text-sm transition-colors">
                    <i class="fab fa-waze"></i> IR CON WAZE
                </a>
                <a href="tel:${s.cliente_telefono}" class="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-xl text-center transition-colors">
                    <i class="fas fa-phone"></i>
                </a>
            </div>
            `;
            ls.appendChild(card);

            // GESTIÓN DE BOTONES INFERIORES POR ESTADO (MAQUINA DE ESTADOS)
            const btn1 = elementos.btnEnCamino;
            const btn2 = elementos.btnLlegue;

            // Reset visual
            btn1.classList.add("hidden");
            btn2.classList.add("hidden");

            // Lógica de Estados
            if (s.estado === "asignado") {
                btn1.classList.remove("hidden");
                btn1.innerText = "VOY EN CAMINO";
                btn1.className = "w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg";
                btn1.onclick = () => actualizarEstado(id, "en_camino");
            }
            else if (s.estado === "en_camino") {
                btn2.classList.remove("hidden");
                btn2.innerText = "YA LLEGUÉ AL SITIO";
                btn2.className = "w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg";
                btn2.onclick = () => {
                    actualizarEstado(id, "en_sitio");
                };
            }
            else if (s.estado === "en_sitio") {
                btn2.classList.remove("hidden");
                // CAMBIO V5.7: LLAMA AL NUEVO COTIZADOR ALAMO (Detallado)
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
                btn2.innerText = " 📸  FINALIZAR Y EVIDENCIA";
                btn2.disabled = false;
                btn2.className = "w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg";
                btn2.onclick = () => mostrarModalEvidencia(id);
            }
        });
    });

    // Función auxiliar para actualizar estado en Servicios y en Rastreo Global
    async function actualizarEstado(id, estado, extras = {}) {
        try {
            // 1. Actualizar el documento del servicio
            await updateDoc(doc(db, "services", id), { estado: estado, ...extras });

            // 2. Actualizar el estado público para el mapa (Rastreo)
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

    // ==========================================================
    // NUEVO MODAL: COTIZACIÓN DETALLADA (V5.7 ALAMO STYLE)
    // ==========================================================
    // Esta función reemplaza a la antigua "mostrarModalCotizacion" simple.
    // Permite agregar múltiples partidas (Items) con cantidad, precio y descripción.
    function mostrarModalCotizacionDetallada(id, servicioData) {
        if(document.getElementById("modalCot")) return;
        
        let items = []; // Array temporal para guardar partidas en memoria

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
                            <p class="text-white font-bold"><span class="text-emerald-500">${item.cantidad} ${item.unidad}</span> ${item.descripcion}</p>
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

        // Asignación de eventos robusta (V5.7.1)
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
                    
                    // Limpiar inputs
                    document.getElementById("inCant").value = "";
                    document.getElementById("inDesc").value = "";
                    document.getElementById("inPrecio").value = "";
                    renderItems();
                };
            }

            if(btnSend) {
                btnSend.onclick = async () => {
                    if(items.length === 0) return alert("Agrega al menos un concepto para cotizar.");
                    
                    const totalFinal = items.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);

                    if(!confirm(`¿Enviar cotización por $${totalFinal.toFixed(2)}?`)) return;

                    // GUARDAR DETALLES EN FIRESTORE
                    // Esta estructura es la que el panel del cliente leerá para armar la tabla
                    try {
                        await updateDoc(doc(db, "services", id), {
                            estado: "cotizando",
                            detalles_cotizacion: items, // Array estructurado
                            costo_final: totalFinal,
                            cotizado_at: serverTimestamp(),
                            diagnostico: "Cotización Detallada" // Fallback
                        });
                        // CONFIRMACIÓN VISUAL (V5.7.3)
                        alert(`✅ Cotización con ${items.length} partidas enviada correctamente.`);
                    } catch (e) {
                        console.error(e);
                        alert("Error al guardar la cotización.");
                    }

                    const modal = document.getElementById("modalCot");
                    if(modal) modal.remove();
                };
            }
        }, 100); // Pequeño delay para asegurar renderizado
    }

    //  📸  MODAL EVIDENCIA (REAL CON BASE64 Y CÁLCULO FINANCIERO V5.11)
    // Calcula la comisión del 32%, IVA 8%, ISR 10% y Neto Técnico
    function mostrarModalEvidencia(id) {
        if(document.getElementById("modalEvidencia")) return;

        const html = `
        <div id="modalEvidencia" class="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div class="bg-zinc-900 w-full max-w-md rounded-3xl p-6 border border-zinc-700 shadow-2xl">
                <h3 class="text-white font-black text-xl mb-4 text-center">REPORTE FINAL OBLIGATORIO</h3>
                <p class="text-gray-400 text-xs mb-6 text-center">Para liberar el pago, sube la evidencia fotográfica.</p>

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
            if(!f1 || !f2) { alert(" ⚠ ️ Ambas fotos son obligatorias para el reporte."); return; }

            const btn = document.getElementById("btnSubirEvidencia");
            btn.innerText = "SUBIENDO EVIDENCIA...";
            btn.disabled = true;
            
            try {
                // Conversión a Base64
                const b64_1 = await toBase64(f1);
                const b64_2 = await toBase64(f2);
                
                // CÁLCULO FINANCIERO AVANZADO (V5.11)
                const servicioSnap = await getDoc(doc(db, "services", id));
                const servicioData = servicioSnap.data();
                const costoTotal = servicioData.costo_final || 0;

                // Definición de Porcentajes del Total
                const comisionFixGo = costoTotal * 0.32; // 32%
                const retencionIVA = costoTotal * 0.08;  // 8%
                const retencionISR = costoTotal * 0.10;  // 10%
                
                // Lo que sobra es para el técnico (Aprox 50%)
                const pagoNetoTecnico = costoTotal - (comisionFixGo + retencionIVA + retencionISR);

                // 1. Actualizar Servicio con Evidencia y Datos Fiscales Simulados
                await actualizarEstado(id, "finalizado", {
                    evidencia: { antes: b64_1, despues: b64_2 },
                    finalizado_at: serverTimestamp(),
                    folio_fiscal: "FX-" + Math.random().toString(36).substr(2, 9).toUpperCase(),
                    desglose: {
                        subtotal: (costoTotal / 1.16).toFixed(2),
                        iva: (costoTotal - (costoTotal / 1.16)).toFixed(2),
                        total: costoTotal
                    }
                });

                // 2. NUEVO: REGISTRAR TRANSACCIÓN CON DESGLOSE COMPLETO
                await addDoc(collection(db, "transacciones"), {
                    servicio_id: id,
                    tecnico_id: user.uid, 
                    monto_total: costoTotal,
                    comision_fixgo: comisionFixGo, // 32%
                    retencion_iva: retencionIVA,   // 8%
                    retencion_isr: retencionISR,   // 10%
                    pago_tecnico: pagoNetoTecnico, // Restante
                    fecha: serverTimestamp(),
                    tipo: "ingreso_servicio"
                });

                document.getElementById("modalEvidencia").remove();
                alert(" ✅  ¡Servicio Cerrado Exitosamente! Comisión y Retenciones aplicadas.");
            } catch (e) {
                console.error(e);
                alert("Error subiendo imágenes. Intenta fotos más pequeñas.");
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
}

// ======================================================================================
// 3. PANEL DE CLIENTE (USUARIO FINAL) - V5.11.0 (ACCORDION UI & REALTIME)
// ======================================================================================
export async function iniciarPanelCliente(user) {
    console.log(" 📱  Iniciando Panel de Cliente...");

    const el = {
        form: document.getElementById("nuevaSolicitudForm"),
        lista: document.getElementById("solicitudesCliente"),
        inputCat: document.getElementById("categoriaSeleccionada"),
        labelServicio: document.getElementById("btnLabel")
    };

    // ----------------------------------------------------------------------------------
    // 3.1 CARGA DINÁMICA DE VERTICALES EN ACORDEÓN (CONECTADA A FIRESTORE - V5.9 REALTIME)
    // ----------------------------------------------------------------------------------
    async function cargarServiciosCliente() {
        console.log("Cargando servicios en contenedores dinámicos...");

        // ESCUCHA EN TIEMPO REAL
        onSnapshot(doc(db, "configuracion", "catalogo_global"), (docSnap) => {
            const dbConfig = docSnap.exists() ? docSnap.data() : {};
            
            // DEFINICIÓN MAESTRA (Alineada con los IDs de cliente.html)
            const DEFINICION_VERTICALES = {
                road: [
                    { id: "road_llanta", label: "Llantera Móvil" },
                    { id: "road_cerrajero", label: "Cerrajería 24/7" },
                    { id: "road_grua", label: "Grúas" },
                    { id: "road_mecanico", label: "Mecánico Gral." },
                    { id: "road_corriente", label: "Paso Corriente" }
                ],
                fix: [
                    { id: "fix_electricidad", label: "Electricidad" },
                    { id: "fix_plomeria", label: "Plomería" },
                    { id: "fix_ac", label: "Aires Acond. (A/C)" },
                    { id: "fix_jardin", label: "Jardinería" },
                    { id: "fix_pintura", label: "Pintura" },
                    { id: "fix_alberca", label: "Albercas" },
                    { id: "fix_fumigacion", label: "Fumigación" }
                ],
                maint: [
                    { id: "maint_general", label: "Mantenimiento Gral." }
                ],
                tech: [
                    { id: "tech_cctv", label: "CCTV" },
                    { id: "tech_alarma", label: "Sistemas Alarma" },
                    { id: "tech_acceso", label: "Control Accesos" },
                    { id: "tech_elevador", label: "Elevadores" },
                    { id: "tech_planta", label: "Plantas Eléc." },
                    { id: "tech_solar", label: "Paneles Solares" }
                ]
            };

            // Inyectamos los sub-servicios en cada tarjeta maestra expansible
            Object.keys(DEFINICION_VERTICALES).forEach(verticalKey => {
                const container = document.getElementById(`contenido-${verticalKey}`);
                if (!container) return; // Si no existe en el HTML, lo salta seguro

                let htmlContent = "";
                DEFINICION_VERTICALES[verticalKey].forEach(srv => {
                    const isActive = dbConfig[srv.id] === true;
                    
                    const opacity = isActive ? "opacity-100 hover:scale-105 active:scale-95 cursor-pointer" : "opacity-40 grayscale cursor-not-allowed";
                    const border = isActive ? "border-zinc-700 hover:border-emerald-500" : "border-zinc-800 border-dashed";
                    const clickAction = isActive ? `onclick="window.seleccionarServicio('${srv.id}', '${srv.label}')"` : "";
                    
                    htmlContent += `
                    <div class="bg-zinc-900 border ${border} p-3 rounded-xl flex flex-col items-center text-center transition-all duration-200 service-card-btn ${opacity}" ${clickAction} id="card_${srv.id}">
                        <div class="mb-2">
                            ${isActive ? '<div class="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_5px_#10b981]"></div>' : '<i class="fas fa-lock text-gray-600 text-xs"></i>'}
                        </div>
                        <span class="text-white font-bold text-xs leading-tight">${srv.label}</span>
                        <span class="text-[8px] text-gray-500 mt-1 uppercase tracking-widest font-bold">${isActive ? 'DISPONIBLE' : 'PRÓXIMAMENTE'}</span>
                    </div>
                    `;
                });
                container.innerHTML = htmlContent;
            });

            // Función Global para la selección de servicio
            window.seleccionarServicio = (id, label) => {
                // Reset visual
                document.querySelectorAll('.service-card-btn').forEach(btn => {
                    btn.classList.remove('bg-zinc-800', 'border-emerald-500', 'ring-1', 'ring-emerald-500');
                    btn.classList.add('bg-zinc-900', 'border-zinc-700');
                });

                // Activar visualmente la card seleccionada
                const activeCard = document.getElementById(`card_${id}`);
                if(activeCard) {
                    activeCard.classList.remove('bg-zinc-900', 'border-zinc-700');
                    activeCard.classList.add('bg-zinc-800', 'border-emerald-500', 'ring-1', 'ring-emerald-500');
                }

                if(el.inputCat) el.inputCat.value = id;
                if(el.labelServicio) el.labelServicio.innerText = label.toUpperCase();

                // Mostrar el formulario (estaba oculto en el HTML base)
                const formContainer = document.getElementById("solicitudContainer");
                if(formContainer) formContainer.classList.remove("hidden");

                el.form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            };
        });
    }

    // Iniciar carga
    cargarServiciosCliente();

    // ----------------------------------------------------------------------------------
    // 3.2 ENVÍO DE SOLICITUD (CON GPS OCULTO V5.8)
    // ----------------------------------------------------------------------------------
    if (el.form) {
        el.form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const cat = el.inputCat.value; 
            const dir = el.form.querySelector('[name="direccion"]').value;
            const desc = el.form.querySelector('[name="descripcion"]').value;
            
            if (!cat) { alert(" ⚠ ️ Por favor selecciona un servicio habilitado de la lista."); return; }
            
            const btn = el.form.querySelector("button");
            const textoOriginal = btn.innerText;
            btn.disabled = true;
            btn.innerText = "OBTENIENDO UBICACIÓN...";
            
            // INTENTO DE OBTENER GPS EXACTO DEL CLIENTE
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    async (pos) => {
                        await enviarSolicitudFinal(cat, dir, desc, {
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude
                        });
                    },
                    async (err) => {
                        console.warn("GPS Cliente no disponible:", err);
                        await enviarSolicitudFinal(cat, dir, desc, null);
                    },
                    { timeout: 5000, enableHighAccuracy: true }
                );
            } else {
                await enviarSolicitudFinal(cat, dir, desc, null);
            }
            
            async function enviarSolicitudFinal(categoriaFull, direccion, descripcion, coords) {
                const partes = categoriaFull.split('_');
                const vertical = partes[0].toUpperCase(); 
                const servicio = partes[1] ? partes[1].toUpperCase() : 'GENERAL';

                if(confirm("Se realizará una retención temporal de garantía ($550 MXN).\n\n¿Autorizar solicitud?")) {
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
                            created_at: serverTimestamp(),
                            retencion_inicial: 550,
                            costo_final: 0,
                            coords: coords 
                        });
                        alert(" ✅  ¡ Solicitud Enviada! Buscando técnico cercano...");
                        el.form.reset();
                        
                        // Ocultar formulario de nuevo
                        const formContainer = document.getElementById("solicitudContainer");
                        if(formContainer) formContainer.classList.add("hidden");

                        if(el.labelServicio) el.labelServicio.innerText = "SERVICIO";
                        document.querySelectorAll('.service-card-btn').forEach(btn => {
                            btn.classList.remove('bg-zinc-800', 'border-emerald-500', 'ring-1', 'ring-emerald-500');
                            btn.classList.add('bg-zinc-900', 'border-zinc-700');
                        });
                    } catch (error) {
                        console.error(error);
                        alert("Error al enviar solicitud.");
                    }
                }
                btn.disabled = false;
                btn.innerText = textoOriginal;
            }
        });
    }

    // ----------------------------------------------------------------------------------
    // 3.3 MONITOR DE HISTORIAL (TARJETAS EXPANSIBLES)
    // ----------------------------------------------------------------------------------
    onSnapshot(query(collection(db, "services"), where("cliente_id", "==", user.uid), orderBy("created_at", "desc")), (snap) => {
        if(!el.lista) return;
        el.lista.innerHTML = "";
        
        if(snap.docChanges().some(change => change.type === 'modified')) {
            console.log(" 🔔  Actualización de servicio: SONANDO ALERTA");
            sonarAlerta();
        }
        
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
            
            // --- GENERACIÓN DEL CONTENIDO INTERNO ---
            let contenido = `<div class="p-4 bg-yellow-900/10 rounded-xl border border-yellow-500/30 mb-2"><span class="text-xs font-bold text-yellow-500 animate-pulse"> 🔎  BUSCANDO TÉCNICO...</span></div>`;
            
            if (s.estado === "cotizando") {
                let htmlTabla = "";
                if (s.detalles_cotizacion && s.detalles_cotizacion.length > 0) {
                    const filas = s.detalles_cotizacion.map(item => `
                        <tr>
                            <td>${item.cantidad} ${item.unidad}</td>
                            <td>${item.descripcion}</td>
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
                    htmlTabla = `<p class="text-white text-2xl font-black mt-1">$${s.costo_final}</p><p class="text-gray-400 text-xs italic">"${s.diagnostico}"</p>`;
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
                        <span class="bg-emerald-500 text-black text-[9px] font-bold px-2 py-0.5 rounded">PAGADO</span>
                    </div>
                    <div class="space-y-2 mb-4">
                        <div class="flex justify-between text-lg text-white font-black">
                            <span>TOTAL:</span>
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
                </div>
                `;
            }

            // Lógica de Indicadores Visuales para el Acordeón
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

            // --- MAQUETADO DE LA TARJETA EXPANSIBLE DEL HISTORIAL ---
            const card = document.createElement("div");
            card.className = "uber-card rounded-2xl overflow-hidden shadow-lg mb-3";

            card.innerHTML = `
            <div class="p-4 flex justify-between items-center cursor-pointer hover:bg-zinc-800/50 transition-colors" onclick="toggleAccordion('hist-${id}', 'icon-${id}')">
                <div class="flex items-center gap-4">
                    <div class="w-3 h-3 ${dotColor} rounded-full shadow-[0_0_8px_currentColor]"></div>
                    <div>
                        <h4 class="font-black text-white text-sm uppercase tracking-tight">${s.categoria} <span class="text-gray-500 font-normal ml-1">| ${s.sub_servicio || ''}</span></h4>
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
                    <p class="text-xs text-gray-400 truncate mb-3"><i class="fas fa-map-marker-alt text-zinc-600"></i> ${s.direccion}</p>
                    
                    ${contenido}

                    ${(s.estado === 'en_camino' || s.estado === 'en_sitio') ? `
                    <a href="rastreo.html?id=${id}" class="block mt-4 text-center bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs py-3 rounded-xl border border-blue-500/30 transition-colors font-bold flex items-center justify-center gap-2">
                        <i class="fas fa-map-marked-alt"></i> SEGUIR TÉCNICO EN VIVO
                    </a>
                    ` : ''}
                </div>
            </div>
            `;
            el.lista.appendChild(card);
        });
    });

    // ----------------------------------------------------------------------------------
    // 3.4 ACCIONES GLOBALES DEL CLIENTE (SIN CAMBIOS ESTRUCTURALES)
    // ----------------------------------------------------------------------------------
    window.responderCotizacion = async (id, aceptado) => {
        if (aceptado) {
            await updateDoc(doc(db, "services", id), { estado: "trabajando" });
            alert(" ✅  ¡ Costo aprobado! El técnico comenzará a trabajar ahora.");
        } else {
            if(confirm(" ⚠ ️ ¿Estás seguro de cancelar?\n\nAl haber llegado el técnico, se cobrará la visita mínima ($550).")) {
                await updateDoc(doc(db, "services", id), {
                    estado: "cancelado",
                    costo_final: 550, 
                    cancelado_razon: "Cliente rechazó cotización"
                });
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
 * ======================================================
 * 🔔 FIXGO AUDIO WATCHDOG (Vigilante de Alertas V5.12)
 * Se coloca al final del archivo para no estorbar.
 * ======================================================
 */
function iniciarVigilanciaAudio() {
    console.log("👂 Audio Watchdog: Iniciando escucha de servicios pendientes...");

    // Aseguramos que 'db', 'collection', 'query', 'where' existen (vienen de tus imports arriba)
    const qAudio = query(
        collection(db, "servicios"), 
        where("status", "==", "pendiente")
    );

    onSnapshot(qAudio, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            // Si se AGREGÓ un documento nuevo a la lista de pendientes...
            if (change.type === "added") {
                const datos = change.doc.data();
                
                console.log("🔔 ¡PING! Nuevo servicio detectado:", datos.titulo || "Servicio");
                
                // ¡FUEGO! Disparamos el sonido "Ti-Ti-Ti"
                alertaTecnico(); 
            }
        });
    });
}

// Ejecutamos el vigilante
iniciarVigilanciaAudio();
