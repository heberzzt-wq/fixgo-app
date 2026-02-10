/**
 * ======================================================
 * FIXGO 2026 - PANEL MAESTRO DE CONTROL (LOGIC CORE)
 * Archivo: app-panel.js
 * Versión: 5.4 (FULL UNCOMPRESSED: GPS + AUDIO + PDF PRO)
 * ======================================================
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
    setDoc 
} from "./firebase.js";

import { iniciarTracking, detenerTracking } from "./gps-motor.js";

// ======================================================
// 🔔 SISTEMA DE SONIDO CENTRALIZADO (ROBUSTO)
// ======================================================
const audioNotificacion = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');

// Truco para "desbloquear" el audio en navegadores modernos (Chrome/Safari)
// Se activa con el primer clic que haga el usuario en cualquier parte
document.body.addEventListener('click', () => {
    audioNotificacion.play().then(() => {
        audioNotificacion.pause();
        audioNotificacion.currentTime = 0;
    }).catch(e => {
        // Ignoramos errores si el usuario no ha interactuado aún
    });
}, { once: true });

function sonarAlerta() {
    audioNotificacion.currentTime = 0;
    audioNotificacion.play().catch(e => console.log("🔊 Alerta visual: Audio bloqueado por el navegador."));
}

// ======================================================
// 📄 CARGADOR DINÁMICO DE PDF (SIN ROMPER INICIO)
// ======================================================
async function cargarLibreriaPDF() {
    if (window.jspdf) return window.jspdf;
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.onload = () => resolve(window.jspdf);
        script.onerror = () => reject("Error cargando la librería PDF");
        document.head.appendChild(script);
    });
}

console.log("🚀 FIXGO 5.4: Código Extendido y Restaurado.");


// ======================================================
// 1. PANEL DE ADMINISTRADOR (Torre de Control)
// ======================================================
export async function iniciarPanelAdmin(user) {
    const elementos = {
        lista: document.getElementById("listaTecnicos"),
        actividad: document.getElementById("listaTransacciones"),
        countServ: document.querySelector(".fa-bolt")?.closest(".uber-card")?.querySelector("h3"),
        countMoney: document.querySelector(".fa-wallet")?.closest(".uber-card")?.querySelector("h3"),
        countOnline: document.getElementById("totalTecnicos")
    };

    // 1.A. TÉCNICOS Y APROBACIÓN (LÓGICA DETALLADA)
    if (elementos.lista) {
        const qTecnicos = query(collection(db, "users"), where("rol", "==", "tecnico"));
        
        onSnapshot(qTecnicos, (snap) => {
            elementos.lista.innerHTML = ""; 
            
            let contOnline = 0;
            let contTotal = 0;

            if (snap.empty) { 
                elementos.lista.innerHTML = '<p class="text-gray-500 p-4 italic">No hay técnicos registrados.</p>'; 
            }

            snap.forEach((docSnap) => {
                const data = docSnap.data();
                contTotal++;
                
                // Contamos si está disponible para el Dashboard
                if(data.disponible === true) contOnline++;

                const esPendiente = (data.estado || "pendiente") === "pendiente";
                const ineCheck = data.documentos?.ine ? '<span class="text-emerald-400">✅ INE</span>' : '<span class="text-red-500">❌ INE</span>';
                const csfCheck = data.documentos?.csf ? '<span class="text-emerald-400">✅ CSF</span>' : '<span class="text-red-500">❌ CSF</span>';
                
                // Indicador visual
                const estadoDot = data.disponible 
                    ? '<span class="text-emerald-500 font-bold text-[10px] animate-pulse">● ONLINE</span>' 
                    : '<span class="text-gray-500 text-[10px]">● OFFLINE</span>';

                const card = document.createElement("div");
                card.className = `p-4 mb-3 rounded-xl border ${esPendiente ? 'bg-yellow-900/10 border-yellow-500' : 'bg-zinc-900 border-zinc-800'}`;
                
                card.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div>
                            <h4 class="font-bold text-white text-sm">
                                ${data.nombre} 
                                ${esPendiente ? '<span class="text-[9px] bg-yellow-500 text-black px-1 rounded ml-2">NUEVO</span>' : ''}
                            </h4>
                            <p class="text-xs text-gray-400">${data.email}</p>
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
                                <i class="fas fa-check-circle text-emerald-800 text-2xl"></i>
                            `}
                        </div>
                    </div>
                `;
                elementos.lista.appendChild(card);
            });

            // Actualizamos el contador del Dashboard principal
            if(elementos.countOnline) {
                elementos.countOnline.innerHTML = `${contOnline} <span class="text-sm text-gray-500">/ ${contTotal}</span>`;
                elementos.countOnline.style.color = contOnline > 0 ? "#10b981" : "white";
            }
        });
    }

    // 1.B. MONITOREO DE SERVICIOS Y FINANZAS
    const qServicios = query(collection(db, "services"), orderBy("created_at", "desc"));
    
    onSnapshot(qServicios, (snap) => {
        if(elementos.actividad) elementos.actividad.innerHTML = "";
        
        let activos = 0;
        let ingresos = 0;

        if (snap.empty) {
            if(elementos.actividad) elementos.actividad.innerHTML = '<p class="text-gray-500 italic text-sm text-center mt-4">Sin actividad reciente.</p>';
        }

        snap.forEach(docSnap => {
            const data = docSnap.data();
            
            // Calculo de Activos (Excluyendo finalizados y cancelados)
            if (!["finalizado", "cancelado"].includes(data.estado)) {
                activos++;
            }
            
            // Calculo de Ingresos (Comisión del 32%)
            if (data.costo_final) {
                ingresos += (parseFloat(data.costo_final) * 0.32);
            }

            // Renderizar solo los últimos 10 para no saturar el DOM
            if (elementos.actividad && elementos.actividad.children.length < 10) {
                const item = document.createElement("div");
                item.className = "flex justify-between items-center border-b border-white/5 py-3 last:border-0";
                
                let colorEstado = "text-gray-400";
                if(data.estado === "pendiente") colorEstado = "text-yellow-500";
                if(data.estado === "trabajando") colorEstado = "text-blue-400 animate-pulse";
                if(data.estado === "finalizado") colorEstado = "text-emerald-500";

                item.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="bg-zinc-800 p-2 rounded-lg"><i class="fas fa-tools text-gray-400"></i></div>
                        <div>
                            <p class="text-xs font-bold text-white uppercase">${data.categoria}</p>
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
        if(elementos.countMoney) {
            elementos.countMoney.innerText = `$${ingresos.toFixed(2)}`;
        }
    });

    // Función global para el botón onclick del HTML inyectado
    window.aprobarTecnico = async (uid) => {
        if(!confirm("¿Estás seguro de aprobar a este técnico? Tendrá acceso inmediato a solicitudes.")) return;
        try {
            await updateDoc(doc(db, "users", uid), { 
                estado: "activo", 
                status: "activo", 
                verificado: true,
                aprobadoEn: serverTimestamp()
            });
            alert("✅ Técnico Aprobado y Activado.");
        } catch (error) {
            console.error(error);
            alert("Error al aprobar.");
        }
    };
}


// ======================================================
// 2. PANEL DE TÉCNICO (Socio Operador)
// ======================================================
export async function iniciarPanelTecnico(user) {
    const elementos = {
        statusLabel: document.getElementById("statusLabel"),
        toggleONOFF: document.getElementById("toggleONOFF"),
        radarSection: document.getElementById("radarSection"),
        seccionBolsa: document.getElementById("seccionBolsa"),
        listaBolsa: document.getElementById("listaBolsa"),
        listaServicios: document.getElementById("listaServicios"),
        panelAcciones: document.getElementById("panelAcciones"),
        btnEnCamino: document.getElementById("btnEnCamino"),
        btnLlegue: document.getElementById("btnLlegue")
    };

    // 2.A. ESTADO DEL TÉCNICO Y PERFIL
    const tecnicoRef = doc(db, "users", user.uid);
    onSnapshot(tecnicoRef, (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        const estado = data.estado || "pendiente";

        // Caso: Pendiente de Aprobación
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

        // Caso: Activo
        if (elementos.toggleONOFF) {
            elementos.toggleONOFF.disabled = false;
            elementos.toggleONOFF.checked = data.disponible === true;
        }
        
        if (data.disponible) {
            // ENCENDIDO
            iniciarTracking(user.uid);
            elementos.seccionBolsa?.classList.remove("hidden");
            escucharBolsa(user, elementos.listaBolsa);
            
            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "EN LÍNEA";
                elementos.statusLabel.className = "bg-emerald-500/20 text-emerald-500 status-badge font-bold animate-pulse";
            }
            elementos.radarSection?.classList.remove("opacity-50", "grayscale");
        } else {
            // APAGADO
            detenerTracking();
            elementos.seccionBolsa?.classList.add("hidden");
            
            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "OFFLINE";
                elementos.statusLabel.className = "bg-red-500/20 text-red-500 status-badge font-bold";
            }
            elementos.radarSection?.classList.add("opacity-50", "grayscale");
        }
    });

    // Listener para el Switch ON/OFF
    if (elementos.toggleONOFF) {
        elementos.toggleONOFF.addEventListener("change", async (e) => {
            await updateDoc(tecnicoRef, { 
                disponible: e.target.checked,
                last_seen: serverTimestamp()
            });
        });
    }

    // 2.B. BOLSA DE TRABAJO (CON SONIDO)
    function escucharBolsa(tecnico, contenedor) {
        if(!contenedor) return;
        const q = query(collection(db, "services"), where("estado", "==", "pendiente"), orderBy("created_at", "desc"));
        
        onSnapshot(q, (snap) => {
            contenedor.innerHTML = "";
            if(snap.empty) { 
                contenedor.innerHTML = `<p class="text-gray-600 text-[10px] text-center italic py-4">Escaneando zona... esperando solicitudes.</p>`; 
                return; 
            }
            
            // 🔔 SONIDO: Si llega una nueva solicitud (added)
            if(snap.docChanges().some(change => change.type === 'added')) {
                console.log("🔔 Nueva solicitud detectada: SONANDO ALERTA");
                sonarAlerta();
            }

            snap.forEach((docSnap) => {
                const s = docSnap.data();
                const id = docSnap.id;
                
                const card = document.createElement("div");
                card.className = "bg-zinc-900 border border-zinc-700 p-4 rounded-xl mb-3 animate-pulse border-emerald-500 shadow-lg shadow-emerald-900/20";
                
                card.innerHTML = `
                    <div class="flex justify-between items-center mb-2">
                        <span class="bg-emerald-500 text-black text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">NUEVA SOLICITUD</span>
                        <span class="text-white font-bold text-xs">${s.categoria.toUpperCase()}</span>
                    </div>
                    <h4 class="text-white font-bold text-base mb-1">${s.zona || 'Cancún'}</h4>
                    <p class="text-gray-300 text-sm mb-3 font-medium italic">"${s.descripcion}"</p>
                    <div class="flex items-center gap-2 mb-3 text-xs text-gray-500">
                        <i class="fas fa-map-marker-alt"></i> ${s.direccion}
                    </div>
                    <button class="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black py-3 rounded-lg text-xs uppercase transition-all transform active:scale-95" onclick="window.tomarServicio('${id}', '${tecnico.uid}', '${tecnico.nombre}')">
                        ACEPTAR (BLOQUEAR $550)
                    </button>
                `;
                contenedor.appendChild(card);
            });
        });
    }

    // Función global para aceptar servicio
    window.tomarServicio = async (id, uid, nombre) => {
        if(!confirm("¿Aceptar este servicio? \n\nSe notificará al cliente y se bloqueará la garantía.")) return;
        try {
            await updateDoc(doc(db, "services", id), {
                estado: "asignado",
                tecnico_id: uid,
                tecnico_nombre: nombre,
                tecnico_telefono: user.telefono || "",
                asignado_at: serverTimestamp()
            });
            // El propio onSnapshot del flujo activo actualizará la UI
        } catch (error) {
            console.error(error);
            alert("Error: El servicio ya fue tomado por otro técnico.");
        }
    };

    // 2.C. FLUJO ACTIVO (MISIONES Y BOTONES)
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
        
        // Si no hay misiones, escondemos el panel inferior
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
            // Si el cliente dio coordenadas, usamos esas. Si no, la dirección.
            const destinoWaze = s.coords 
                ? `${s.coords.lat},${s.coords.lng}` 
                : encodeURIComponent(s.direccion);

            // Render Tarjeta
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

            // GESTIÓN DE BOTONES INFERIORES POR ESTADO
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
                    // AQUÍ IRÍA LA VALIDACIÓN DE GEOCERCA (100m)
                    // (Omitida por ahora para facilitar pruebas, pero lista para conectar con gps-motor)
                    actualizarEstado(id, "en_sitio");
                };
            }
            else if (s.estado === "en_sitio") {
                btn2.classList.remove("hidden");
                btn2.innerText = "INICIAR COTIZACIÓN";
                btn2.className = "w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg";
                btn2.onclick = () => mostrarModalCotizacion(id);
            }
            else if (s.estado === "cotizando") {
                btn2.classList.remove("hidden");
                btn2.innerText = "ESPERANDO AL CLIENTE...";
                btn2.disabled = true;
                btn2.className = "w-full bg-zinc-700 text-gray-400 font-bold py-4 rounded-xl cursor-not-allowed flex items-center justify-center gap-2";
            }
            else if (s.estado === "trabajando") {
                btn2.classList.remove("hidden");
                btn2.innerText = "📸 FINALIZAR Y EVIDENCIA";
                btn2.disabled = false;
                btn2.className = "w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg";
                btn2.onclick = () => mostrarModalEvidencia(id);
            }
        });
    });

    // Función auxiliar para actualizar estado en Servicios y en Rastreo
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

    // 📸 MODAL EVIDENCIA (REAL CON BASE64)
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

            if(!f1 || !f2) { alert("⚠️ Ambas fotos son obligatorias para el reporte."); return; }
            
            const btn = document.getElementById("btnSubirEvidencia");
            btn.innerText = "SUBIENDO EVIDENCIA..."; 
            btn.disabled = true;

            try {
                // Conversión a Base64 para evitar problemas de Storage
                const b64_1 = await toBase64(f1);
                const b64_2 = await toBase64(f2);

                await actualizarEstado(id, "finalizado", {
                    evidencia: { antes: b64_1, despues: b64_2 },
                    finalizado_at: serverTimestamp()
                });
                
                document.getElementById("modalEvidencia").remove();
                alert("✅ ¡Servicio Cerrado Exitosamente! El reporte se ha generado.");
            } catch (e) {
                console.error(e);
                alert("Error subiendo imágenes. Intenta fotos más pequeñas.");
                btn.innerText = "REINTENTAR";
                btn.disabled = false;
            }
        };
    }

    // 💰 MODAL COTIZACIÓN
    function mostrarModalCotizacion(id) {
        if(document.getElementById("modalCot")) return;
        
        const html = `
            <div id="modalCot" class="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
                <div class="bg-zinc-900 w-full max-w-md rounded-3xl p-6 border border-zinc-700 shadow-2xl">
                    <h3 class="text-white font-black text-xl mb-1 text-center">COTIZAR SERVICIO</h3>
                    <p class="text-gray-500 text-xs mb-6 text-center">El cliente debe aprobar este monto en su App.</p>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="text-[10px] font-bold text-emerald-500 uppercase ml-1">Diagnóstico Técnico</label>
                            <input id="inDiag" class="w-full bg-black p-4 text-white rounded-xl text-sm border border-zinc-700 focus:border-emerald-500 outline-none transition-colors" placeholder="Ej: Cambio de capacitor...">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-emerald-500 uppercase ml-1">Costo Total Final ($MXN)</label>
                            <input id="inCosto" type="number" class="w-full bg-black p-4 text-white rounded-xl text-2xl font-bold border border-zinc-700 focus:border-emerald-500 outline-none transition-colors" placeholder="0.00">
                        </div>
                    </div>

                    <div class="flex gap-2 mt-8">
                        <button onclick="document.getElementById('modalCot').remove()" class="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-bold text-sm">CANCELAR</button>
                        <button id="btnEnviarCot" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-sm transition-colors">ENVIAR A CLIENTE</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        
        document.getElementById("btnEnviarCot").onclick = async () => {
            const diag = document.getElementById("inDiag").value;
            const costo = document.getElementById("inCosto").value;
            
            if(!diag || !costo) return alert("⚠️ Debes llenar diagnóstico y costo.");
            
            await actualizarEstado(id, "cotizando", { 
                diagnostico: diag, 
                costo_final: parseFloat(costo),
                cotizado_at: serverTimestamp()
            });
            
            document.getElementById("modalCot").remove();
            alert("⏳ Cotización enviada. Esperando aprobación del cliente...");
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


// ======================================================
// 3. PANEL DE CLIENTE (Usuario Final)
// ======================================================
export async function iniciarPanelCliente(user) {
    const el = {
        form: document.getElementById("nuevaSolicitudForm"),
        lista: document.getElementById("solicitudesCliente"),
        inputCat: document.getElementById("categoriaSeleccionada"),
        labelServicio: document.getElementById("btnLabel"),
        tarjetas: document.querySelectorAll(".service-card")
    };

    // Selección Visual de Categoría
    el.tarjetas.forEach(card => {
        card.addEventListener("click", () => {
            el.tarjetas.forEach(c => c.classList.remove("border-emerald-500", "bg-zinc-800"));
            card.classList.add("border-emerald-500", "bg-zinc-800");
            el.inputCat.value = card.dataset.category;
            if(el.labelServicio) el.labelServicio.innerText = card.dataset.category.toUpperCase();
        });
    });

    // Envío de Solicitud con GPS Oculto
    if (el.form) {
        el.form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const cat = el.inputCat.value;
            const dir = el.form.querySelector('[name="direccion"]').value;
            const desc = el.form.querySelector('[name="descripcion"]').value;

            if (!cat) { alert("⚠️ Por favor selecciona un tipo de servicio (Iconos arriba)."); return; }

            const btn = el.form.querySelector("button");
            const textoOriginal = btn.innerText;
            btn.disabled = true; 
            btn.innerText = "OBTENIENDO UBICACIÓN...";

            // 🔥 NUEVO: INTENTO DE OBTENER GPS EXACTO DEL CLIENTE
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    async (pos) => {
                        // Éxito GPS
                        await enviarSolicitudFinal(cat, dir, desc, { 
                            lat: pos.coords.latitude, 
                            lng: pos.coords.longitude 
                        });
                    }, 
                    async (err) => {
                        // Fallo GPS (Permiso denegado), enviamos sin coords
                        console.warn("GPS Cliente no disponible:", err);
                        await enviarSolicitudFinal(cat, dir, desc, null);
                    },
                    { timeout: 5000, enableHighAccuracy: true }
                );
            } else {
                // Navegador viejo
                await enviarSolicitudFinal(cat, dir, desc, null);
            }

            async function enviarSolicitudFinal(categoria, direccion, descripcion, coords) {
                if(confirm("Se realizará una retención temporal de garantía ($550 MXN).\n\n¿Autorizar solicitud?")) {
                    try {
                        await addDoc(collection(db, "services"), {
                            cliente_id: user.uid, 
                            cliente_nombre: user.nombre || "Cliente", 
                            cliente_telefono: user.telefono || "",
                            categoria: categoria, 
                            direccion: direccion, 
                            descripcion: descripcion,
                            estado: "pendiente", 
                            created_at: serverTimestamp(), 
                            retencion_inicial: 550, 
                            costo_final: 0,
                            coords: coords // Guardamos las coordenadas para el Waze del técnico
                        });
                        alert("✅ ¡Solicitud Enviada! Buscando técnico cercano...");
                        el.form.reset();
                        // Reset visual
                        el.tarjetas.forEach(c => c.classList.remove("border-emerald-500", "bg-zinc-800"));
                        if(el.labelServicio) el.labelServicio.innerText = "SERVICIO";
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

    // Monitor de Servicios en Tiempo Real
    onSnapshot(query(collection(db, "services"), where("cliente_id", "==", user.uid), orderBy("created_at", "desc")), (snap) => {
        if(!el.lista) return;
        el.lista.innerHTML = "";

        // 🔔 SONIDO: Si hay cambios en mi servicio (ej: técnico llega)
        if(snap.docChanges().some(change => change.type === 'modified')) {
            console.log("🔔 Actualización de servicio: SONANDO ALERTA");
            sonarAlerta();
        }

        snap.forEach(docSnap => {
            const s = docSnap.data();
            const id = docSnap.id;
            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-white/10 p-4 rounded-xl mb-3";

            let contenido = `<span class="text-xs font-bold text-yellow-500 animate-pulse">🔎 BUSCANDO TÉCNICO...</span>`;
            if (s.estado !== "pendiente") contenido = `<span class="text-xs font-bold text-blue-400">${s.estado.toUpperCase().replace('_', ' ')}</span>`;

            // LÓGICA DE INTERACCIÓN CLIENTE
            if (s.estado === "cotizando") {
                contenido = `
                    <div class="bg-zinc-800 p-4 rounded-lg border border-yellow-500 mt-2">
                        <div class="flex justify-between items-start">
                            <div>
                                <p class="text-yellow-500 text-xs font-bold uppercase">Requiere Aprobación</p>
                                <p class="text-white text-2xl font-black mt-1">$${s.costo_final}</p>
                            </div>
                            <i class="fas fa-file-invoice-dollar text-yellow-500 text-2xl"></i>
                        </div>
                        <p class="text-gray-400 text-xs italic mt-2 border-t border-white/10 pt-2">"${s.diagnostico}"</p>
                        
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
                // REPORTE CON FOTOS Y BOTÓN PDF
                const safeData = encodeURIComponent(JSON.stringify({...s, id: id}));
                
                contenido = `
                    <div class="bg-emerald-900/10 border border-emerald-500/30 p-4 rounded-xl mt-2">
                        <div class="flex justify-between items-center mb-3">
                            <span class="text-emerald-500 font-black text-xs uppercase tracking-widest">TICKET FINAL</span>
                            <span class="bg-emerald-500 text-black text-[9px] font-bold px-2 py-0.5 rounded">PAGADO</span>
                        </div>
                        
                        <div class="space-y-2 mb-4">
                            <div class="flex justify-between text-xs text-gray-300">
                                <span>Servicio Base:</span>
                                <span>$550.00</span>
                            </div>
                            <div class="flex justify-between text-xs text-gray-300">
                                <span>Ajustes/Extras:</span>
                                <span>$${(s.costo_final - 550).toFixed(2)}</span>
                            </div>
                            <div class="h-px bg-white/10 my-1"></div>
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
                        
                        <button onclick="window.generarPDF('${safeData}')" class="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs py-3 rounded-lg font-bold border border-white/10 transition-all flex items-center justify-center gap-2">
                            <i class="fas fa-file-download text-red-500"></i> DESCARGAR REPORTE PDF
                        </button>
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="flex justify-between items-center mb-1">
                    <span class="font-black text-white uppercase tracking-tight">${s.categoria}</span>
                    <span class="text-[10px] text-gray-500">${new Date(s.created_at?.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <p class="text-xs text-gray-400 truncate mb-2"><i class="fas fa-map-marker-alt text-zinc-600"></i> ${s.direccion}</p>
                
                <div class="mt-2">${contenido}</div>
                
                ${(s.estado === 'en_camino' || s.estado === 'en_sitio') ? `
                    <a href="rastreo.html?id=${id}" class="block mt-3 text-center bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs py-2.5 rounded-lg border border-blue-500/30 transition-colors font-bold flex items-center justify-center gap-2">
                        <i class="fas fa-map-marked-alt"></i> SEGUIR TÉCNICO EN VIVO
                    </a>
                ` : ''}
            `;
            el.lista.appendChild(card);
        });
    });

    // Respuestas globales del cliente
    window.responderCotizacion = async (id, aceptado) => {
        if (aceptado) {
            await updateDoc(doc(db, "services", id), { estado: "trabajando" });
            alert("✅ ¡Costo aprobado! El técnico comenzará a trabajar ahora.");
        } else {
            if(confirm("⚠️ ¿Estás seguro de cancelar?\n\nAl haber llegado el técnico, se cobrará la visita mínima ($550).")) {
                await updateDoc(doc(db, "services", id), { 
                    estado: "cancelado",
                    costo_final: 550, // Cobro mínimo por cancelación en sitio
                    cancelado_razon: "Cliente rechazó cotización"
                });
            }
        }
    };

    // GENERADOR PDF (CLIENTE)
    window.generarPDF = async (encodedData) => {
        const data = JSON.parse(decodeURIComponent(encodedData));
        const btn = document.activeElement;
        const textoOrig = btn.innerText;
        btn.innerText = "GENERANDO...";
        
        try {
            const { jsPDF } = await cargarLibreriaPDF();
            const doc = new jsPDF();

            // --- DISEÑO DEL PDF ---
            // Header Negro
            doc.setFillColor(18, 18, 18);
            doc.rect(0, 0, 215, 40, 'F');
            
            // Logo y Título
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(24);
            doc.text("FIXGO", 20, 22);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(16, 185, 129); // Verde Emerald
            doc.text("MÉXICO", 60, 22);
            
            doc.setTextColor(200, 200, 200);
            doc.setFontSize(10);
            doc.text("Comprobante de Servicio Digital", 20, 32);
            doc.text(`FOLIO: #${data.id.substring(0,8).toUpperCase()}`, 150, 22);
            doc.text(`FECHA: ${new Date().toLocaleDateString()}`, 150, 32);

            // Información del Cliente
            let y = 60;
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text("DETALLES DEL SERVICIO", 20, y);
            
            y += 10;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(`Cliente: ${data.cliente_nombre}`, 20, y);
            doc.text(`Categoría: ${data.categoria.toUpperCase()}`, 120, y);
            y += 8;
            doc.text(`Ubicación: ${data.direccion}`, 20, y);
            
            // Línea divisora
            y += 15;
            doc.setDrawColor(200, 200, 200);
            doc.line(20, y, 190, y);
            
            // Diagnóstico y Costos
            y += 15;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text("DIAGNÓSTICO TÉCNICO Y COSTOS", 20, y);
            
            y += 10;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            const splitDiag = doc.splitTextToSize(data.diagnostico || "Servicio estándar sin observaciones.", 170);
            doc.text(splitDiag, 20, y);
            y += (splitDiag.length * 7) + 10;

            // Caja de Totales
            doc.setFillColor(245, 245, 245);
            doc.rect(120, y, 70, 30, 'F');
            doc.text("IMPORTE TOTAL:", 125, y + 10);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(16);
            doc.setTextColor(16, 185, 129); // Verde
            doc.text(`$${data.costo_final} MXN`, 125, y + 22);
            
            // Evidencia Fotográfica
            y += 50;
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(12);
            doc.text("EVIDENCIA FOTOGRÁFICA", 20, y);
            y += 10;

            if(data.evidencia?.antes) {
                try {
                    doc.addImage(data.evidencia.antes, "JPEG", 20, y, 80, 60);
                    doc.setFontSize(8);
                    doc.text("ESTADO INICIAL", 20, y + 65);
                } catch(e) {}
            }
            if(data.evidencia?.despues) {
                try {
                    doc.addImage(data.evidencia.despues, "JPEG", 110, y, 80, 60);
                    doc.setFontSize(8);
                    doc.text("TRABAJO FINALIZADO", 110, y + 65);
                } catch(e) {}
            }

            // Footer
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text("Este documento es un comprobante digital emitido por la plataforma FixGo.", 60, 280);

            doc.save(`FixGo_Reporte_${data.id}.pdf`);
            btn.innerText = "DESCARGAR REPORTE OFICIAL";
        } catch (error) {
            console.error(error);
            alert("Hubo un error generando el PDF. Intenta de nuevo.");
            btn.innerText = "ERROR - REINTENTAR";
        }
    };
}
