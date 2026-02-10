/**
 * ======================================================
 * FIXGO 2026 - PANEL MAESTRO DE CONTROL (LOGIC CORE)
 * Archivo: app-panel.js
 * Versión: 3.7 (Full Flow: Cotización & Billing Real)
 * ======================================================
 */

import { 
    db, 
    auth,
    doc, 
    getDoc, 
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

console.log("🧩 app-panel.js V3.7: Flujo Completo con Cotizador.");

// ======================================================
// 1. PANEL DE ADMINISTRADOR (Torre de Control)
// ======================================================
export async function iniciarPanelAdmin(user) {
    console.log("👮‍♂️ Iniciando lógica de ADMINISTRADOR...");

    const contenedorTecnicos = document.getElementById("listaTecnicos");
    const contenedorActividad = document.getElementById("listaTransacciones");
    const contadorServicios = document.querySelector(".fa-bolt")?.closest(".uber-card")?.querySelector("h3");
    const contadorIngresos = document.querySelector(".fa-wallet")?.closest(".uber-card")?.querySelector("h3");
    
    // 1.A. LISTA DE APROBACIÓN
    if (contenedorTecnicos) {
        const qTecnicos = query(collection(db, "users"), where("rol", "==", "tecnico"));

        onSnapshot(qTecnicos, (snapshot) => {
            contenedorTecnicos.innerHTML = ""; 
            if (snapshot.empty) { contenedorTecnicos.innerHTML = '<p class="text-gray-500 italic p-4">No hay técnicos.</p>'; return; }

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const estadoReal = data.estado || "pendiente";
                const esPendiente = estadoReal === "pendiente";
                const uidReal = docSnap.id; 
                
                const tieneINE = data.documentos?.ine ? '<span class="text-emerald-400">✅ INE</span>' : '<span class="text-red-500">❌ INE</span>';
                const tieneCSF = data.documentos?.csf ? '<span class="text-emerald-400">✅ CSF</span>' : '<span class="text-red-500">❌ CSF</span>';

                const card = document.createElement("div");
                card.className = `p-4 mb-3 rounded-xl border ${esPendiente ? 'bg-yellow-900/10 border-yellow-500/30' : 'bg-zinc-900 border-zinc-800'}`;
                
                card.innerHTML = `
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-bold text-white flex items-center gap-2">
                                ${data.nombre} ${esPendiente ? '<span class="text-[9px] bg-yellow-500 text-black px-1 rounded">REV</span>' : ''}
                            </h4>
                            <p class="text-xs text-gray-400">${data.email}</p>
                            <div class="mt-2 text-[10px] font-mono bg-black/30 p-2 rounded border border-white/5">${tieneINE} | ${tieneCSF}</div>
                        </div>
                        <div class="flex flex-col gap-2">
                            ${esPendiente ? `<button class="btn-aprobar bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-lg shadow-emerald-500/20" data-uid="${uidReal}">APROBAR</button>` : `<div class="text-zinc-600 text-xs text-right"><i class="fas fa-check-circle text-emerald-800 text-2xl"></i></div>`}
                        </div>
                    </div>
                `;
                contenedorTecnicos.appendChild(card);
            });

            document.querySelectorAll(".btn-aprobar").forEach(btn => {
                btn.addEventListener("click", async (e) => {
                    const uid = e.target.getAttribute("data-uid");
                    if(confirm("¿Aprobar técnico?")) await aprobarTecnico(uid);
                });
            });
        });
    }

    // 1.B. CONTADOR ONLINE
    const qOnline = query(collection(db, "users"), where("rol", "==", "tecnico"));
    onSnapshot(qOnline, (snapshot) => {
        let contOnline = 0; let contTotal = 0;
        snapshot.forEach(doc => { contTotal++; if (doc.data().disponible === true) contOnline++; });
        const counterEl = document.getElementById("totalTecnicos");
        if (counterEl) {
            counterEl.innerHTML = `${contOnline} <span class="text-sm text-gray-500">/ ${contTotal}</span>`;
            counterEl.style.color = contOnline > 0 ? "#10b981" : "white";
        }
    });

    // 1.C. SERVICIOS ACTIVOS Y FINANZAS
    const qServicios = query(collection(db, "services"), orderBy("created_at", "desc"));
    onSnapshot(qServicios, (snapshot) => {
        if(contenedorActividad) contenedorActividad.innerHTML = "";
        let activos = 0; let ingresos = 0;

        if (snapshot.empty) {
            if(contenedorActividad) contenedorActividad.innerHTML = '<p class="text-gray-500 italic text-sm text-center">Sin actividad.</p>';
            if(contadorServicios) contadorServicios.innerText = "0";
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (["pendiente", "asignado", "en_camino", "en_sitio", "trabajando"].includes(data.estado)) activos++;
            if (data.costo_final) ingresos += (parseFloat(data.costo_final) * 0.32); // 32% Comisión

            if (contenedorActividad && contenedorActividad.children.length < 10) {
                const item = document.createElement("div");
                item.className = "flex justify-between items-center border-b border-white/5 py-3";
                let color = "text-gray-400";
                if(data.estado === "pendiente") color = "text-yellow-500";
                if(data.estado === "finalizado") color = "text-emerald-500";
                if(data.estado === "asignado") color = "text-blue-500";
                if(data.estado === "trabajando") color = "text-orange-500";

                item.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="bg-zinc-800 p-2 rounded-lg"><i class="fas fa-tools text-gray-400"></i></div>
                        <div>
                            <p class="text-sm font-bold text-white uppercase">${data.categoria}</p>
                            <p class="text-[10px] text-gray-500">${data.zona || 'Cancún'}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-xs font-bold ${color} uppercase">${data.estado.replace('_', ' ')}</p>
                        ${data.costo_final ? `<p class="text-[10px] text-emerald-400 font-mono">$${data.costo_final}</p>` : ''}
                    </div>
                `;
                contenedorActividad.appendChild(item);
            }
        });

        if(contadorServicios) { contadorServicios.innerText = activos; contadorServicios.style.color = activos > 0 ? "#34d399" : "white"; }
        if(contadorIngresos) contadorIngresos.innerText = `$${ingresos.toFixed(2)}`;
    });
}

async function aprobarTecnico(uid) {
    try {
        await updateDoc(doc(db, "users", uid), { estado: "activo", status: "activo", verificado: true, aprobadoEn: serverTimestamp() });
        alert("✅ Técnico aprobado.");
    } catch (error) { console.error(error); alert("Error al aprobar."); }
}


// ======================================================
// 2. PANEL DE TÉCNICO (Socio Operador)
// ======================================================
export async function iniciarPanelTecnico(user) {
    console.log("🔧 Iniciando lógica de TÉCNICO...", user);

    const btnEnCamino = document.getElementById("btnEnCamino");
    const btnLlegue = document.getElementById("btnLlegue");
    const panelAcciones = document.getElementById("panelAcciones");
    const toggleONOFF = document.getElementById("toggleONOFF");
    const listaServicios = document.getElementById("listaServicios");
    const statusLabel = document.getElementById("statusLabel");
    const radarSection = document.getElementById("radarSection");
    const seccionBolsa = document.getElementById("seccionBolsa");
    const listaBolsa = document.getElementById("listaBolsa");

    // 2.A. ESTADO Y PERFIL
    try {
        const tecnicoRef = doc(db, "users", user.uid);
        onSnapshot(tecnicoRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const estadoReal = data.estado || "pendiente";

                if (estadoReal === "pendiente") {
                    if(statusLabel) statusLabel.innerText = "EN REVISIÓN";
                    if(toggleONOFF) { toggleONOFF.disabled = true; toggleONOFF.checked = false; }
                    if(radarSection) radarSection.classList.add("hidden");
                    if(seccionBolsa) seccionBolsa.innerHTML = '<div class="p-4 bg-yellow-900/20 text-yellow-500 text-xs rounded-xl text-center border border-yellow-500/30">🔒 Cuenta en revisión.</div>';
                    return; 
                }

                if(estadoReal === "activo") {
                    if(radarSection) radarSection.classList.remove("hidden");
                    if(toggleONOFF) toggleONOFF.disabled = false;
                }

                if(toggleONOFF) toggleONOFF.checked = data.disponible === true;
                actualizarUIEstado(data.disponible);

                if (data.disponible) {
                    iniciarTracking(user.uid);
                    if(seccionBolsa) seccionBolsa.classList.remove("hidden");
                    escucharBolsaDeTrabajo(user); 
                } else {
                    detenerTracking();
                    if(seccionBolsa) seccionBolsa.classList.add("hidden");
                }
            }
        });

        if (toggleONOFF) {
            toggleONOFF.addEventListener("change", async (e) => {
                await updateDoc(tecnicoRef, { disponible: e.target.checked, last_seen: serverTimestamp() });
            });
        }
    } catch (error) { console.error(error); }

    // 2.B. BOLSA DE TRABAJO
    function escucharBolsaDeTrabajo(tecnico) {
        if(!listaBolsa) return;
        const qBolsa = query(collection(db, "services"), where("estado", "==", "pendiente"), orderBy("created_at", "desc"));
        onSnapshot(qBolsa, (snap) => {
            listaBolsa.innerHTML = "";
            if(snap.empty) { listaBolsa.innerHTML = `<p class="text-gray-600 text-[10px] text-center italic">Escaneando zona...</p>`; return; }
            snap.forEach((docSnap) => {
                const servicio = docSnap.data();
                const id = docSnap.id;
                const card = document.createElement("div");
                card.className = "bg-zinc-900 border border-zinc-700 p-4 rounded-xl mb-2 hover:border-emerald-500 transition-colors";
                card.innerHTML = `
                    <div class="flex justify-between items-start mb-2">
                        <span class="bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-2 py-1 rounded border border-emerald-500/20 uppercase">NUEVA SOLICITUD</span>
                        <span class="text-xs text-gray-400 font-bold">${servicio.categoria.toUpperCase()}</span>
                    </div>
                    <h4 class="text-white font-bold text-base mb-1">${servicio.zona || 'Cancún'}</h4>
                    <p class="text-gray-400 text-xs mb-3 italic">"${servicio.descripcion}"</p>
                    <button class="btn-tomar w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black py-3 rounded-lg text-xs uppercase tracking-wide transition-transform active:scale-95 shadow-lg shadow-emerald-500/20" data-id="${id}">¡TOMAR SERVICIO!</button>
                `;
                listaBolsa.appendChild(card);
            });
            document.querySelectorAll(".btn-tomar").forEach(btn => {
                btn.onclick = async (e) => await tomarServicio(e.target.getAttribute("data-id"), tecnico);
            });
        });
    }

    async function tomarServicio(servicioId, tecnico) {
        if(!confirm("¿Aceptar servicio?")) return;
        try {
            await updateDoc(doc(db, "services", servicioId), {
                estado: "asignado",
                tecnico_id: tecnico.uid,
                tecnico_nombre: tecnico.nombre,
                tecnico_telefono: tecnico.telefono || "",
                asignado_at: serverTimestamp()
            });
            alert("✅ Servicio Asignado");
        } catch (error) { alert("Error: Ya fue tomado."); }
    }

    // 2.C. MISIONES ACTIVAS (FLUJO COMPLETO)
    const qMisiones = query(collection(db, "services"), where("tecnico_id", "==", user.uid), where("estado", "in", ["asignado", "en_camino", "en_sitio", "trabajando"]));

    onSnapshot(qMisiones, (snap) => {
        if (!listaServicios) return;
        listaServicios.innerHTML = "";
        if (snap.empty) { if(panelAcciones) panelAcciones.classList.add("translate-y-full"); return; }
        if(panelAcciones) panelAcciones.classList.remove("translate-y-full");

        snap.forEach((docSnap) => {
            const servicio = docSnap.data();
            const servicioId = docSnap.id;
            
            // Tarjeta de Info
            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-blue-500/50 p-6 rounded-2xl relative overflow-hidden mb-4 shadow-xl";
            card.innerHTML = `
                <div class="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase">${servicio.estado.replace('_', ' ')}</div>
                <h3 class="text-xl font-black text-white mb-1 uppercase">${servicio.categoria}</h3>
                <p class="text-gray-400 text-sm mb-4"><i class="fas fa-map-marker-alt text-blue-500"></i> ${servicio.direccion}</p>
                <div class="bg-black/50 p-4 rounded-xl mb-4">
                    <p class="text-xs text-gray-500 mb-1">REPORTE CLIENTE:</p>
                    <p class="text-sm text-white italic">"${servicio.descripcion}"</p>
                    ${servicio.diagnostico ? `<hr class="border-white/10 my-2"><p class="text-xs text-emerald-500 mb-1">DIAGNÓSTICO TÉCNICO:</p><p class="text-sm text-white italic">"${servicio.diagnostico}"</p><p class="text-right text-emerald-400 font-bold mt-1">Total: $${servicio.costo_final}</p>` : ''}
                </div>
                <div class="flex gap-2">
                    <a href="https://waze.com/ul?q=${encodeURIComponent(servicio.direccion)}" target="_blank" class="flex-1 bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 rounded-xl text-center text-sm"><i class="fab fa-waze"></i> WAZE</a>
                    <a href="tel:${servicio.cliente_telefono}" class="bg-zinc-800 text-white font-bold py-3 px-4 rounded-xl"><i class="fas fa-phone"></i></a>
                </div>
            `;
            listaServicios.appendChild(card);

            // GESTIÓN DE BOTONES
            if(btnEnCamino) btnEnCamino.classList.add("hidden");
            if(btnLlegue) btnLlegue.classList.add("hidden");

            if (servicio.estado === "asignado") {
                if(btnEnCamino) {
                    btnEnCamino.classList.remove("hidden");
                    btnEnCamino.innerText = "VOY EN CAMINO";
                    btnEnCamino.className = "w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black py-4 rounded-xl text-lg flex items-center justify-center gap-3 shadow-lg transition-all";
                    btnEnCamino.onclick = () => actualizarEstadoServicio(servicioId, "en_camino");
                }
            } 
            else if (servicio.estado === "en_camino") {
                if(btnLlegue) {
                    btnLlegue.classList.remove("hidden");
                    btnLlegue.innerText = "YA LLEGUÉ AL SITIO";
                    btnLlegue.className = "w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-3 shadow-lg transition-all";
                    btnLlegue.onclick = () => actualizarEstadoServicio(servicioId, "en_sitio");
                }
            }
            else if (servicio.estado === "en_sitio") {
                if(btnLlegue) {
                    btnLlegue.classList.remove("hidden");
                    btnLlegue.innerText = "INICIAR COTIZACIÓN";
                    btnLlegue.className = "w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-3 shadow-lg transition-all";
                    // AQUÍ ESTÁ EL CAMBIO IMPORTANTE: LANZA EL MODAL
                    btnLlegue.onclick = () => mostrarModalCotizacion(servicioId);
                }
            }
            else if (servicio.estado === "trabajando") {
                if(btnLlegue) {
                    btnLlegue.classList.remove("hidden");
                    btnLlegue.innerText = "FINALIZAR Y COBRAR";
                    btnLlegue.className = "w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-3 shadow-lg transition-all";
                    btnLlegue.onclick = () => { 
                        if(confirm("¿El servicio ha concluido?")) actualizarEstadoServicio(servicioId, "finalizado"); 
                    };
                }
            }
        });
    });

    // --- FUNCIONES AUXILIARES ---

    function actualizarUIEstado(activo) {
        if (!statusLabel || !radarSection) return;
        if (activo) {
            statusLabel.innerText = "EN LÍNEA"; statusLabel.className = "bg-emerald-500/20 text-emerald-500 status-badge font-bold animate-pulse"; radarSection.classList.remove("opacity-50", "grayscale");
        } else {
            statusLabel.innerText = "OFFLINE"; statusLabel.className = "bg-red-500/20 text-red-500 status-badge font-bold"; radarSection.classList.add("opacity-50", "grayscale");
        }
    }

    async function actualizarEstadoServicio(id, nuevoEstado, datosExtra = {}) {
        try {
            await updateDoc(doc(db, "services", id), { estado: nuevoEstado, updated_at: serverTimestamp(), ...datosExtra });
            
            let estadoTexto = "En Sitio";
            if(nuevoEstado === "en_camino") estadoTexto = "En Ruta";
            if(nuevoEstado === "trabajando") estadoTexto = "Trabajando";
            if(nuevoEstado === "finalizado") estadoTexto = "Disponible";

            const rastreoRef = doc(db, "rastreo", "tecnicoActivo"); 
            await setDoc(rastreoRef, { estado: estadoTexto }, { merge: true });

            if(nuevoEstado === "finalizado") alert("✅ ¡Misión Cumplida! Comisión registrada.");
        } catch (error) { console.error(error); alert("Error de red"); }
    }

    // --- NUEVO: MODAL DE COTIZACIÓN (INYECCIÓN HTML) ---
    function mostrarModalCotizacion(servicioId) {
        // Verificar si ya existe para no duplicar
        if(document.getElementById("modalCotizacion")) return;

        const modalHTML = `
            <div id="modalCotizacion" class="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div class="bg-zinc-900 border border-zinc-700 w-full max-w-md rounded-3xl p-6 shadow-2xl relative">
                    <h3 class="text-xl font-black text-white mb-1">COTIZACIÓN DE SERVICIO</h3>
                    <p class="text-xs text-gray-400 mb-4">Ingresa el diagnóstico y costo final para el cliente.</p>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="text-[10px] font-bold text-emerald-500 uppercase">Diagnóstico Técnico</label>
                            <textarea id="inputDiagnostico" rows="3" class="w-full bg-black border border-zinc-700 rounded-xl p-3 text-white text-sm focus:border-emerald-500 outline-none" placeholder="Ej: Fuga de gas en compresor..."></textarea>
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-emerald-500 uppercase">Costo Total ($MXN)</label>
                            <input type="number" id="inputCosto" class="w-full bg-black border border-zinc-700 rounded-xl p-3 text-white text-xl font-bold focus:border-emerald-500 outline-none" placeholder="0.00">
                        </div>
                        
                        <div class="flex gap-3 mt-6">
                            <button id="btnCancelarCotizacion" class="flex-1 bg-zinc-800 text-white font-bold py-3 rounded-xl text-sm">CANCELAR</button>
                            <button id="btnEnviarCotizacion" class="flex-1 bg-emerald-500 text-black font-black py-3 rounded-xl text-sm hover:bg-emerald-400">CONFIRMAR E INICIAR</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Lógica del Modal
        document.getElementById("btnCancelarCotizacion").onclick = () => {
            document.getElementById("modalCotizacion").remove();
        };

        document.getElementById("btnEnviarCotizacion").onclick = async () => {
            const diag = document.getElementById("inputDiagnostico").value;
            const costo = document.getElementById("inputCosto").value;

            if(!diag || !costo) { alert("⚠️ Debes llenar diagnóstico y costo."); return; }

            const btn = document.getElementById("btnEnviarCotizacion");
            btn.innerText = "PROCESANDO...";
            btn.disabled = true;

            // Actualizamos y pasamos a 'trabajando'
            await actualizarEstadoServicio(servicioId, "trabajando", {
                diagnostico: diag,
                costo_final: parseFloat(costo),
                cotizado_at: serverTimestamp()
            });

            document.getElementById("modalCotizacion").remove();
            alert("✅ Cotización registrada. Iniciando cronómetro de trabajo.");
        };
    }
}


// ======================================================
// 3. PANEL DE CLIENTE
// ======================================================
export async function iniciarPanelCliente(user) {
    console.log("👤 Iniciando lógica de CLIENTE...");
    const formulario = document.getElementById("nuevaSolicitudForm");
    const contenedorSolicitudes = document.getElementById("solicitudesCliente");
    const inputCategoria = document.getElementById("categoriaSeleccionada");
    const labelServicio = document.getElementById("btnLabel");
    const tarjetas = document.querySelectorAll(".service-card");

    tarjetas.forEach(card => {
        card.addEventListener("click", () => {
            tarjetas.forEach(c => c.classList.remove("border-emerald-500", "bg-zinc-800"));
            card.classList.add("border-emerald-500", "bg-zinc-800");
            const categoria = card.dataset.category;
            if(inputCategoria) inputCategoria.value = categoria;
            if(labelServicio) labelServicio.innerText = categoria.toUpperCase();
        });
    });

    if (formulario) {
        formulario.addEventListener("submit", async (e) => {
            e.preventDefault();
            const categoria = inputCategoria ? inputCategoria.value : null;
            const direccion = formulario.querySelector('[name="direccion"]').value;
            const descripcion = formulario.querySelector('[name="descripcion"]').value;

            if (!categoria) { alert("Selecciona un servicio."); return; }
            const btnSubmit = formulario.querySelector("button[type='submit']");
            btnSubmit.disabled = true; btnSubmit.innerText = "BUSCANDO...";

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
                    zona: "Cancún"
                });
                alert("✅ Solicitud enviada.");
                formulario.reset();
            } catch (error) { console.error(error); alert("Error."); } 
            finally { btnSubmit.disabled = false; btnSubmit.innerText = "SOLICITAR AHORA"; }
        });
    }

    const qHistorial = query(collection(db, "services"), where("cliente_id", "==", user.uid), orderBy("created_at", "desc"));
    onSnapshot(qHistorial, (snap) => {
        if(!contenedorSolicitudes) return;
        contenedorSolicitudes.innerHTML = "";
        if (snap.empty) { contenedorSolicitudes.innerHTML = '<p class="text-gray-500 text-sm italic">Sin servicios.</p>'; return; }
        
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-white/10 p-4 rounded-xl mb-3";
            let color = data.estado === "finalizado" ? "text-emerald-500" : (data.estado === "asignado" ? "text-blue-500" : "text-yellow-500");
            
            card.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <span class="font-black text-white uppercase">${data.categoria}</span>
                    <span class="text-xs font-bold ${color}">${data.estado.toUpperCase()}</span>
                </div>
                <p class="text-xs text-gray-400 truncate">${data.direccion}</p>
                ${(data.estado === 'en_camino' || data.estado === 'en_sitio') ? `<a href="rastreo.html?id=${docSnap.id}" class="block mt-3 text-center bg-zinc-800 text-white text-xs font-bold py-2 rounded-lg border border-white/10 hover:bg-emerald-500 hover:text-black transition-colors">VER MAPA</a>` : ''}
            `;
            contenedorSolicitudes.appendChild(card);
        });
    });
}
