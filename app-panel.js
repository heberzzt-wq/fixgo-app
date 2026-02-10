/**
 * ======================================================
 * FIXGO 2026 - PANEL MAESTRO DE CONTROL (LOGIC CORE)
 * Archivo: app-panel.js
 * Versión: 3.4 (Production Fix: Admin Vision & Tech Buttons)
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

console.log("🧩 app-panel.js V3.4: Admin Visión Total + Botones Técnico Fix.");

// ======================================================
// 1. PANEL DE ADMINISTRADOR (Torre de Control)
// ======================================================
export async function iniciarPanelAdmin(user) {
    console.log("👮‍♂️ Iniciando lógica de ADMINISTRADOR...");

    const contenedorTecnicos = document.getElementById("listaTecnicos");
    const contenedorActividad = document.getElementById("listaTransacciones");
    const contadorServicios = document.querySelector(".fa-bolt").closest(".uber-card").querySelector("h3"); // Busca el h3 cerca del icono de rayo
    const contadorIngresos = document.querySelector(".fa-wallet").closest(".uber-card").querySelector("h3");
    
    // ------------------------------------------------------
    // 1.A. LISTA DE APROBACIÓN DE TÉCNICOS (Ya funcionaba)
    // ------------------------------------------------------
    if (contenedorTecnicos) {
        const qTecnicos = query(collection(db, "users"), where("rol", "==", "tecnico"));

        onSnapshot(qTecnicos, (snapshot) => {
            contenedorTecnicos.innerHTML = ""; 
            
            if (snapshot.empty) {
                contenedorTecnicos.innerHTML = '<p class="text-gray-500 italic p-4">No hay técnicos en el sistema.</p>';
                return;
            }

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const estadoReal = data.estado || data.status || "pendiente";
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
                                ${data.nombre} 
                                ${esPendiente ? '<span class="text-[9px] bg-yellow-500 text-black px-1 rounded">REV</span>' : ''}
                            </h4>
                            <p class="text-xs text-gray-400">${data.email}</p>
                            <p class="text-xs text-gray-400">Tel: ${data.telefono || 'N/A'}</p>
                            
                            <div class="mt-2 text-[10px] font-mono bg-black/30 p-2 rounded border border-white/5">
                                ${tieneINE} | ${tieneCSF}
                            </div>

                            <div class="mt-2 flex gap-2">
                                 <span class="text-[10px] px-2 py-0.5 rounded border ${
                                     estadoReal === 'activo' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                                 }">${estadoReal.toUpperCase()}</span>
                            </div>
                        </div>
                        
                        <div class="flex flex-col gap-2">
                            ${esPendiente ? `
                                <button class="btn-aprobar bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-lg shadow-emerald-500/20" data-uid="${uidReal}">
                                    APROBAR
                                </button>
                            ` : `
                                <div class="text-zinc-600 text-xs text-right">
                                    <i class="fas fa-check-circle text-emerald-800 text-2xl"></i>
                                </div>
                            `}
                        </div>
                    </div>
                `;
                contenedorTecnicos.appendChild(card);
            });

            document.querySelectorAll(".btn-aprobar").forEach(btn => {
                btn.addEventListener("click", async (e) => {
                    const uid = e.target.getAttribute("data-uid");
                    if(confirm("¿Aprobar técnico y permitirle trabajar?")) {
                        await aprobarTecnico(uid);
                    }
                });
            });
        });
    }

    // ------------------------------------------------------
    // 1.B. CONTADOR DE TÉCNICOS ONLINE
    // ------------------------------------------------------
    const qOnline = query(collection(db, "users"), where("rol", "==", "tecnico"));
    onSnapshot(qOnline, (snapshot) => {
        let contOnline = 0;
        let contTotal = 0;
        snapshot.forEach(doc => {
            contTotal++;
            if (doc.data().disponible === true) contOnline++;
        });
        const counterEl = document.getElementById("totalTecnicos");
        if (counterEl) {
            counterEl.innerHTML = `${contOnline} <span class="text-sm text-gray-500">/ ${contTotal}</span>`;
            counterEl.style.color = contOnline > 0 ? "#10b981" : "white";
        }
    });

    // ------------------------------------------------------
    // 1.C. ACTIVIDAD RECIENTE Y SERVICIOS (NUEVO CABLEADO)
    // ------------------------------------------------------
    // Aquí conectamos el panel a la colección 'services'
    const qServicios = query(collection(db, "services"), orderBy("created_at", "desc"));
    
    onSnapshot(qServicios, (snapshot) => {
        // 1. Actualizar Actividad Reciente
        if(contenedorActividad) contenedorActividad.innerHTML = "";
        
        if (snapshot.empty) {
            if(contenedorActividad) contenedorActividad.innerHTML = '<p class="text-gray-500 italic text-sm text-center mt-10">Sin actividad reciente.</p>';
            if(contadorServicios) contadorServicios.innerText = "0";
            return;
        }

        let activos = 0;
        let totalIngresos = 0;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            
            // Calculo de Activos
            if (["pendiente", "asignado", "en_camino", "en_sitio", "trabajando"].includes(data.estado)) {
                activos++;
            }

            // Calculo de Ingresos (Simulado con precio base si no existe)
            const precio = data.precio_final || 0; 
            totalIngresos += (precio * 0.32); // 32% Comisión FixGo

            // Renderizar Lista (Solo los últimos 10 para no saturar)
            // (En un escenario real limitaríamos la query, aquí lo hacemos visual)
            if (contenedorActividad && contenedorActividad.children.length < 10) {
                const item = document.createElement("div");
                item.className = "flex justify-between items-center border-b border-white/5 py-3 last:border-0";
                
                let colorEstado = "text-gray-400";
                if(data.estado === "pendiente") colorEstado = "text-yellow-500";
                if(data.estado === "finalizado") colorEstado = "text-emerald-500";
                if(data.estado === "asignado") colorEstado = "text-blue-500";

                item.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="bg-zinc-800 p-2 rounded-lg">
                            <i class="fas fa-tools text-gray-400"></i>
                        </div>
                        <div>
                            <p class="text-sm font-bold text-white uppercase">${data.categoria}</p>
                            <p class="text-[10px] text-gray-500">${data.zona || 'Cancún'} • ${data.cliente_nombre || 'Cliente'}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-xs font-bold ${colorEstado} uppercase">${data.estado.replace('_', ' ')}</p>
                        <p class="text-[10px] text-gray-600">Hace un momento</p>
                    </div>
                `;
                contenedorActividad.appendChild(item);
            }
        });

        // 2. Actualizar Contadores Dashboard
        if(contadorServicios) {
            contadorServicios.innerText = activos;
            contadorServicios.style.color = activos > 0 ? "#34d399" : "white"; // Verde si hay activos
        }
        
        if(contadorIngresos) {
            contadorIngresos.innerText = `$${totalIngresos.toFixed(2)}`;
        }
    });
}

// FUNCION AUXILIAR: Aprobar Técnico
async function aprobarTecnico(uid) {
    try {
        await updateDoc(doc(db, "users", uid), {
            estado: "activo",
            status: "activo", 
            verificado: true,
            aprobadoEn: serverTimestamp()
        });
        alert("✅ Técnico activado. Ahora puede recibir alertas.");
    } catch (error) {
        console.error("Error aprobando:", error);
        alert("Error de permisos o red.");
    }
}


// ======================================================
// 2. PANEL DE TÉCNICO (Socio Operador)
// ======================================================
export async function iniciarPanelTecnico(user) {
    console.log("🔧 Iniciando lógica de TÉCNICO...", user);

    // Referencias DOM
    const btnEnCamino = document.getElementById("btnEnCamino");
    const btnLlegue = document.getElementById("btnLlegue");
    const panelAcciones = document.getElementById("panelAcciones"); // El contenedor negro de abajo
    const toggleONOFF = document.getElementById("toggleONOFF");
    const listaServicios = document.getElementById("listaServicios");
    const statusLabel = document.getElementById("statusLabel");
    const radarSection = document.getElementById("radarSection");
    
    // Bolsa de Trabajo
    const seccionBolsa = document.getElementById("seccionBolsa");
    const listaBolsa = document.getElementById("listaBolsa");

    try {
        const tecnicoRef = doc(db, "users", user.uid);
        
        onSnapshot(tecnicoRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const estadoReal = data.estado || data.status || "pendiente";

                // A. ESTADO PENDIENTE (BLOQUEO)
                if (estadoReal === "pendiente") {
                    if(statusLabel) {
                        statusLabel.innerText = "EN REVISIÓN";
                        statusLabel.className = "bg-yellow-500/20 text-yellow-500 status-badge font-bold";
                    }
                    if(toggleONOFF) {
                        toggleONOFF.disabled = true;
                        toggleONOFF.checked = false;
                        radarSection.classList.add("hidden");
                    }
                    if(seccionBolsa) seccionBolsa.innerHTML = '<div class="p-4 bg-yellow-900/20 text-yellow-500 text-xs rounded-xl text-center border border-yellow-500/30">🔒 Tu cuenta está bajo revisión.<br>Sube tus documentos si no lo has hecho.</div>';
                    return; 
                }

                // B. ESTADO ACTIVO
                if(statusLabel && estadoReal === "activo") {
                    radarSection.classList.remove("hidden");
                    toggleONOFF.disabled = false;
                }

                // Sincronizar Switch
                if(toggleONOFF) {
                    toggleONOFF.checked = data.disponible === true;
                    actualizarUIEstado(data.disponible);
                }

                // Lógica de Disponibilidad
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
                const estaDisponible = e.target.checked;
                await updateDoc(tecnicoRef, { 
                    disponible: estaDisponible,
                    last_seen: serverTimestamp()
                });
            });
        }

    } catch (error) {
        console.error("Error perfil técnico:", error);
    }

    // 2.B. BOLSA DE TRABAJO
    function escucharBolsaDeTrabajo(tecnico) {
        if(!listaBolsa) return;
        const qBolsa = query(
            collection(db, "services"), 
            where("estado", "==", "pendiente"),
            orderBy("created_at", "desc")
        );

        onSnapshot(qBolsa, (snap) => {
            listaBolsa.innerHTML = "";
            if(snap.empty) {
                listaBolsa.innerHTML = `<p class="text-gray-600 text-[10px] text-center italic">Buscando solicitudes cercanas...</p>`;
                return;
            }
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
                btn.addEventListener("click", async (e) => {
                    await tomarServicio(e.target.getAttribute("data-id"), tecnico);
                });
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
            alert("✅ ¡Servicio Asignado!");
        } catch (error) {
            alert("Error: Alguien más lo tomó.");
        }
    }

    // 2.C. ESCUCHAR MIS MISIONES Y ACTIVAR BOTONES (FIXED)
    const qMisiones = query(
        collection(db, "services"),
        where("tecnico_id", "==", user.uid),
        where("estado", "in", ["asignado", "en_camino", "en_sitio", "trabajando"])
    );

    onSnapshot(qMisiones, (snap) => {
        if (!listaServicios) return;
        listaServicios.innerHTML = "";
        
        // Si no hay misiones, bajamos el panel de botones
        if (snap.empty) {
            if(panelAcciones) panelAcciones.classList.add("translate-y-full");
            return;
        }

        // Si hay misiones, iteramos (normalmente solo hay 1 activa)
        snap.forEach((docSnap) => {
            const servicio = docSnap.data();
            const servicioId = docSnap.id;
            
            // 1. DIBUJAR LA TARJETA DEL SERVICIO
            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-blue-500/50 p-6 rounded-2xl relative overflow-hidden mb-4 shadow-xl";
            card.innerHTML = `
                <div class="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase">${servicio.estado.replace('_', ' ')}</div>
                <h3 class="text-xl font-black text-white mb-1 uppercase">${servicio.categoria}</h3>
                <p class="text-gray-400 text-sm mb-4"><i class="fas fa-map-marker-alt text-blue-500"></i> ${servicio.direccion}</p>
                <div class="bg-black/50 p-4 rounded-xl mb-4"><p class="text-sm text-white italic">"${servicio.descripcion}"</p></div>
                <div class="flex gap-2">
                    <a href="https://waze.com/ul?q=${encodeURIComponent(servicio.direccion)}" target="_blank" class="flex-1 bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 rounded-xl text-center text-sm"><i class="fab fa-waze"></i> WAZE</a>
                    <a href="tel:${servicio.cliente_telefono}" class="bg-zinc-800 text-white font-bold py-3 px-4 rounded-xl"><i class="fas fa-phone"></i></a>
                </div>
            `;
            listaServicios.appendChild(card);

            // 2. GESTIONAR LOS BOTONES INFERIORES (LÓGICA CORREGIDA)
            // Forzamos que el panel suba
            if(panelAcciones) panelAcciones.classList.remove("translate-y-full");

            // Reseteamos botones (ocultamos todos primero)
            if(btnEnCamino) btnEnCamino.classList.add("hidden");
            if(btnLlegue) btnLlegue.classList.add("hidden");

            // Mostramos el correcto según el estado
            if (servicio.estado === "asignado") {
                if(btnEnCamino) {
                    btnEnCamino.classList.remove("hidden");
                    // Limpiamos onclicks anteriores para evitar duplicados
                    const nuevoBtn = btnEnCamino.cloneNode(true);
                    btnEnCamino.parentNode.replaceChild(nuevoBtn, btnEnCamino);
                    nuevoBtn.onclick = () => actualizarEstadoServicio(servicioId, "en_camino");
                }
            } else if (servicio.estado === "en_camino") {
                if(btnLlegue) {
                    btnLlegue.classList.remove("hidden");
                    const nuevoBtn = btnLlegue.cloneNode(true);
                    btnLlegue.parentNode.replaceChild(nuevoBtn, btnLlegue);
                    nuevoBtn.onclick = () => actualizarEstadoServicio(servicioId, "en_sitio");
                }
            } else if (servicio.estado === "en_sitio") {
                // Aquí iría el botón de "Iniciar Trabajo" (Próxima fase)
                if(btnLlegue) {
                    btnLlegue.classList.remove("hidden");
                    btnLlegue.innerText = "INICIAR TRABAJO";
                    btnLlegue.classList.remove("bg-emerald-600");
                    btnLlegue.classList.add("bg-blue-600");
                    const nuevoBtn = btnLlegue.cloneNode(true);
                    btnLlegue.parentNode.replaceChild(nuevoBtn, btnLlegue);
                    nuevoBtn.onclick = () => alert("Fase de cotización: Próximamente");
                }
            }
        });
    });

    function actualizarUIEstado(activo) {
        if (!statusLabel || !radarSection) return;
        if (activo) {
            statusLabel.innerText = "EN LÍNEA";
            statusLabel.className = "bg-emerald-500/20 text-emerald-500 status-badge font-bold animate-pulse";
            radarSection.classList.remove("opacity-50", "grayscale");
        } else {
            statusLabel.innerText = "OFFLINE";
            statusLabel.className = "bg-red-500/20 text-red-500 status-badge font-bold";
            radarSection.classList.add("opacity-50", "grayscale");
        }
    }

    async function actualizarEstadoServicio(id, nuevoEstado) {
        try {
            // Actualizar Servicio
            await updateDoc(doc(db, "services", id), { estado: nuevoEstado, updated_at: serverTimestamp() });
            
            // Actualizar Rastreo
            const rastreoRef = doc(db, "rastreo", "tecnicoActivo"); 
            await setDoc(rastreoRef, { estado: nuevoEstado === "en_camino" ? "En Ruta" : "En Sitio" }, { merge: true });

        } catch (error) {
            console.error(error);
            alert("Error al actualizar estado. Revisa tu conexión.");
        }
    }
}


// ======================================================
// 3. PANEL DE CLIENTE (Usuario Final)
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

            if (!categoria) { alert("Selecciona un servicio (Road/Fix/Tech)."); return; }

            const btnSubmit = formulario.querySelector("button[type='submit']");
            btnSubmit.disabled = true;
            btnSubmit.innerText = "BUSCANDO TÉCNICOS...";

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
                alert("✅ Solicitud enviada. Esperando técnico...");
                formulario.reset();
                tarjetas.forEach(c => c.classList.remove("border-emerald-500", "bg-zinc-800"));
                labelServicio.innerText = "SERVICIO";
            } catch (error) {
                console.error(error);
                alert("Error creando solicitud.");
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerText = "SOLICITAR AHORA";
            }
        });
    }

    const qHistorial = query(collection(db, "services"), where("cliente_id", "==", user.uid), orderBy("created_at", "desc"));
    onSnapshot(qHistorial, (snap) => {
        if(!contenedorSolicitudes) return;
        contenedorSolicitudes.innerHTML = "";
        if (snap.empty) {
            contenedorSolicitudes.innerHTML = '<p class="text-gray-500 text-sm italic">Sin servicios activos.</p>';
            return;
        }
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-white/10 p-4 rounded-xl mb-3";
            let colorEstado = data.estado === "finalizado" ? "text-emerald-500" : (data.estado === "asignado" ? "text-blue-500" : "text-yellow-500");
            
            card.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <span class="font-black text-white uppercase">${data.categoria}</span>
                    <span class="text-xs font-bold ${colorEstado}">${data.estado.toUpperCase()}</span>
                </div>
                <p class="text-xs text-gray-400 truncate">${data.direccion}</p>
                ${(data.estado === 'en_camino' || data.estado === 'en_sitio') ? 
                    `<a href="rastreo.html?id=${docSnap.id}" class="block mt-3 text-center bg-zinc-800 text-white text-xs font-bold py-2 rounded-lg border border-white/10 hover:bg-emerald-500 hover:text-black transition-colors"><i class="fas fa-map-marked-alt"></i> VER EN TIEMPO REAL</a>` : ''
                }
            `;
            contenedorSolicitudes.appendChild(card);
        });
    });
}
