/**
 * ======================================================
 * FIXGO 2026 - PANEL MAESTRO DE CONTROL (LOGIC CORE)
 * Archivo: app-panel.js
 * Versión: 3.1 (Integración: Bolsa de Trabajo)
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

console.log("🧩 app-panel.js V3.1: Sistema cargado. Listo para asignaciones.");

// ======================================================
// 1. PANEL DE ADMINISTRADOR (Torre de Control)
// ======================================================
export async function iniciarPanelAdmin(user) {
    console.log("👮‍♂️ Iniciando lógica de ADMINISTRADOR...");

    const contenedorTecnicos = document.getElementById("listaTecnicos");
    
    // 1.A. LISTA DE APROBACIÓN
    if (contenedorTecnicos) {
        const qTecnicos = query(collection(db, "users"), where("rol", "==", "tecnico"));

        onSnapshot(qTecnicos, (snapshot) => {
            contenedorTecnicos.innerHTML = ""; 
            
            if (snapshot.empty) {
                contenedorTecnicos.innerHTML = '<p class="text-gray-500 italic p-4">No hay técnicos registrados.</p>';
                return;
            }

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const estadoReal = data.estado || data.status || "pendiente";
                const esPendiente = estadoReal === "pendiente";
                const uidReal = docSnap.id; 
                
                const card = document.createElement("div");
                card.className = `p-4 mb-3 rounded-xl border ${esPendiente ? 'bg-yellow-900/10 border-yellow-500/30' : 'bg-zinc-900 border-zinc-800'}`;
                
                card.innerHTML = `
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-bold text-white">${data.nombre}</h4>
                            <p class="text-xs text-gray-400">${data.email || 'Sin email'}</p>
                            <p class="text-xs text-gray-400">Tel: ${data.telefono || 'N/A'}</p>
                            <div class="mt-2 flex gap-2">
                                 <span class="text-[10px] px-2 py-0.5 rounded border ${
                                    estadoReal === 'activo' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                                 }">${estadoReal.toUpperCase()}</span>
                                 
                                 ${data.disponible === true ? '<span class="text-[10px] bg-emerald-500 text-black font-bold px-2 py-0.5 rounded animate-pulse">ONLINE</span>' : ''}
                                 
                                 <span class="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">${data.nivel || 'Bronce'}</span>
                            </div>
                        </div>
                        ${esPendiente ? `
                            <button class="btn-aprobar bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-3 py-2 rounded-lg transition-all" data-uid="${uidReal}">
                                <i class="fas fa-check-circle"></i> APROBAR
                            </button>
                        ` : `
                            <div class="text-zinc-600 text-xs text-right">
                                <i class="fas fa-check-circle text-emerald-800"></i><br>VERIFICADO
                            </div>
                        `}
                    </div>
                `;
                contenedorTecnicos.appendChild(card);
            });

            document.querySelectorAll(".btn-aprobar").forEach(btn => {
                btn.addEventListener("click", async (e) => {
                    const boton = e.target.closest("button");
                    const uid = boton.dataset.uid;
                    if(confirm("¿Aprobar técnico?")) await aprobarTecnico(uid);
                });
            });
        });
    }

    // 1.B. CONTADOR ONLINE
    const qOnline = query(collection(db, "users"), where("rol", "==", "tecnico"));
    onSnapshot(qOnline, (snapshot) => {
        let contOnline = 0;
        snapshot.forEach(doc => {
            if (doc.data().disponible === true) contOnline++;
        });
        const counterEl = document.getElementById("totalTecnicos");
        if (counterEl) {
            counterEl.innerText = contOnline;
            counterEl.style.color = contOnline > 0 ? "#10b981" : "white";
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
        alert("✅ Técnico aprobado correctamente.");
    } catch (error) {
        console.error("Error aprobando:", error);
        alert("Error: " + error.message);
    }
}


// ======================================================
// 2. PANEL DE TÉCNICO (Socio Operador)
// ======================================================
export async function iniciarPanelTecnico(user) {
    console.log("🔧 Iniciando lógica de TÉCNICO...", user);

    // Referencias al DOM (Técnico)
    const btnEnCamino = document.getElementById("btnEnCamino");
    const btnLlegue = document.getElementById("btnLlegue");
    const toggleONOFF = document.getElementById("toggleONOFF");
    const listaServicios = document.getElementById("listaServicios");
    const statusLabel = document.getElementById("statusLabel");
    const radarSection = document.getElementById("radarSection");
    
    // Referencias NUEVAS (Bolsa de Trabajo)
    const seccionBolsa = document.getElementById("seccionBolsa");
    const listaBolsa = document.getElementById("listaBolsa");

    // 2.A. INICIALIZAR ESTADO DEL USUARIO (ON/OFF)
    try {
        const tecnicoRef = doc(db, "users", user.uid);
        
        onSnapshot(tecnicoRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const estadoReal = data.estado || data.status || "pendiente";

                // Validación de Bloqueo
                if (estadoReal === "pendiente") {
                    if(statusLabel) statusLabel.innerText = "PENDIENTE DE APROBACIÓN";
                    if(toggleONOFF) {
                        toggleONOFF.disabled = true;
                        toggleONOFF.checked = false;
                    }
                    return; 
                }

                // Sincronizar UI Switch
                if(toggleONOFF) {
                    toggleONOFF.disabled = false;
                    toggleONOFF.checked = data.disponible === true;
                    actualizarUIEstado(data.disponible);
                }

                // LÓGICA PRINCIPAL: GPS + BOLSA DE TRABAJO
                if (data.disponible) {
                    iniciarTracking(user.uid);
                    // Si está disponible, mostramos la bolsa y escuchamos ofertas
                    if(seccionBolsa) seccionBolsa.classList.remove("hidden");
                    escucharBolsaDeTrabajo(user); 
                } else {
                    detenerTracking();
                    // Si está offline, ocultamos la bolsa
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
        console.error("Error obteniendo perfil técnico:", error);
    }

    // 2.B. BOLSA DE TRABAJO (MERCADO DE SOLICITUDES) 🎣
    // Esta función se activa solo cuando el técnico está ONLINE
    function escucharBolsaDeTrabajo(tecnico) {
        if(!listaBolsa) return;

        // Buscamos todas las solicitudes pendientes
        // (En el futuro filtraremos por categoría aquí)
        const qBolsa = query(
            collection(db, "services"), 
            where("estado", "==", "pendiente"),
            orderBy("created_at", "desc")
        );

        onSnapshot(qBolsa, (snap) => {
            listaBolsa.innerHTML = "";
            
            // Si no hay ofertas, podemos ocultar la sección o mostrar mensaje
            if(snap.empty) {
                listaBolsa.innerHTML = `<p class="text-gray-600 text-[10px] text-center italic">Escaneando zona... sin solicitudes.</p>`;
                return;
            }

            snap.forEach((docSnap) => {
                const servicio = docSnap.data();
                const id = docSnap.id;

                const card = document.createElement("div");
                card.className = "bg-zinc-900 border border-zinc-700 p-4 rounded-xl mb-2 hover:border-emerald-500 transition-colors";
                card.innerHTML = `
                    <div class="flex justify-between items-start mb-2">
                        <span class="bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-2 py-1 rounded border border-emerald-500/20 uppercase">
                            NUEVA OPORTUNIDAD
                        </span>
                        <span class="text-xs text-gray-400 font-bold">${servicio.categoria.toUpperCase()}</span>
                    </div>
                    <h4 class="text-white font-bold text-base mb-1">${servicio.zona || 'Ubicación Cliente'}</h4>
                    <p class="text-gray-400 text-xs mb-3 italic">"${servicio.descripcion}"</p>
                    
                    <button class="btn-tomar w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black py-3 rounded-lg text-xs uppercase tracking-wide transition-transform active:scale-95 shadow-lg shadow-emerald-500/20" data-id="${id}">
                        ¡TOMAR SERVICIO! ⚡
                    </button>
                `;
                listaBolsa.appendChild(card);
            });

            // Asignar eventos a los botones
            document.querySelectorAll(".btn-tomar").forEach(btn => {
                btn.addEventListener("click", async (e) => {
                    const servicioId = e.target.getAttribute("data-id");
                    await tomarServicio(servicioId, tecnico);
                });
            });
        });
    }

    // 2.C. ACCIÓN: TOMAR SERVICIO
    async function tomarServicio(servicioId, tecnico) {
        if(!confirm("¿Estás seguro de tomar este servicio?")) return;

        try {
            const servicioRef = doc(db, "services", servicioId);
            
            // Actualizamos el servicio: Cambia de pendiente -> asignado
            // Y le pegamos la info del técnico que lo tomó
            await updateDoc(servicioRef, {
                estado: "asignado",
                tecnico_id: tecnico.uid,
                tecnico_nombre: tecnico.nombre || "Técnico FixGo",
                tecnico_telefono: tecnico.telefono || "",
                asignado_at: serverTimestamp()
            });

            alert("✅ ¡Servicio Asignado! Revisa tus misiones activas.");
            
        } catch (error) {
            console.error("Error al tomar servicio:", error);
            alert("¡Ups! Alguien más ganó el servicio o hubo un error.");
        }
    }


    // 2.D. ESCUCHAR MIS MISIONES ACTIVAS (Lo que ya tenías)
    const qMisiones = query(
        collection(db, "services"),
        where("tecnico_id", "==", user.uid),
        where("estado", "in", ["asignado", "en_camino", "en_sitio", "trabajando"])
    );

    onSnapshot(qMisiones, (snap) => {
        if (!listaServicios) return;
        listaServicios.innerHTML = "";

        const panelAcciones = document.getElementById("panelAcciones");
        
        if (snap.empty) {
            // Solo mostramos "Esperando" si TAMPOCO hay ofertas en la bolsa
            if (listaBolsa && listaBolsa.innerHTML.includes("sin solicitudes")) {
                listaServicios.innerHTML = `
                    <div class="text-center py-10 opacity-50">
                        <i class="fas fa-mug-hot text-4xl mb-3"></i>
                        <p>Esperando asignaciones...</p>
                    </div>
                `;
            }
            if(panelAcciones) panelAcciones.classList.add("translate-y-full");
            return;
        }

        snap.forEach((docSnap) => {
            const servicio = docSnap.data();
            const servicioId = docSnap.id;
            
            if(panelAcciones) panelAcciones.classList.remove("translate-y-full");

            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-blue-500/50 p-6 rounded-2xl relative overflow-hidden mb-4 shadow-xl shadow-blue-900/10";
            card.innerHTML = `
                <div class="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase">
                    EN PROCESO: ${servicio.estado.replace('_', ' ')}
                </div>
                <h3 class="text-xl font-black text-white mb-1 uppercase">${servicio.categoria}</h3>
                <p class="text-gray-400 text-sm mb-4"><i class="fas fa-map-marker-alt text-blue-500"></i> ${servicio.direccion}</p>
                
                <div class="bg-black/50 p-4 rounded-xl mb-4">
                    <p class="text-xs text-gray-500 uppercase font-bold">Problema Reportado:</p>
                    <p class="text-sm text-white italic">"${servicio.descripcion}"</p>
                </div>

                <div class="flex gap-2">
                    <a href="https://waze.com/ul?q=${encodeURIComponent(servicio.direccion)}" target="_blank" class="flex-1 bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 rounded-xl text-center text-sm transition-all">
                        <i class="fab fa-waze"></i> IR CON WAZE
                    </a>
                    <a href="tel:${servicio.cliente_telefono || ''}" class="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-xl text-center transition-all">
                        <i class="fas fa-phone"></i>
                    </a>
                </div>
            `;
            listaServicios.appendChild(card);
            gestionarBotonesMision(servicio, servicioId);
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

    function gestionarBotonesMision(servicio, id) {
        if(btnEnCamino) btnEnCamino.classList.add("hidden");
        if(btnLlegue) btnLlegue.classList.add("hidden");

        if (servicio.estado === "asignado") {
            if(btnEnCamino) {
                btnEnCamino.classList.remove("hidden");
                btnEnCamino.onclick = () => actualizarEstadoServicio(id, "en_camino");
            }
        } else if (servicio.estado === "en_camino") {
            if(btnLlegue) {
                btnLlegue.classList.remove("hidden");
                btnLlegue.onclick = () => actualizarEstadoServicio(id, "en_sitio");
            }
        } else if (servicio.estado === "en_sitio") {
            if(btnLlegue) {
                btnLlegue.classList.remove("hidden");
                btnLlegue.innerText = "INICIAR TRABAJO";
                btnLlegue.className = "w-full bg-blue-600 text-white font-black py-4 rounded-xl";
                btnLlegue.onclick = () => alert("Aquí abriría el modal de Cotización/Inicio de trabajo (Próxima fase)");
            }
        }
    }

    async function actualizarEstadoServicio(id, nuevoEstado) {
        try {
            const servicioRef = doc(db, "services", id);
            await updateDoc(servicioRef, {
                estado: nuevoEstado,
                updated_at: serverTimestamp()
            });
            const rastreoRef = doc(db, "rastreo", "tecnicoActivo"); 
            await setDoc(rastreoRef, {
                estado: nuevoEstado === "en_camino" ? "En Ruta" : "En Sitio"
            }, { merge: true });

        } catch (error) {
            console.error("Error actualizando servicio:", error);
            alert("Error de conexión");
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

            if (!categoria) {
                alert("Por favor selecciona un tipo de servicio arriba (Road, Fix, Tech).");
                return;
            }

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
                    zona: "Cancún Centro", 
                    precio_estimado: 0 
                });
                alert("✅ Solicitud enviada. Un técnico aceptará pronto.");
                formulario.reset();
                tarjetas.forEach(c => c.classList.remove("border-emerald-500", "bg-zinc-800"));
                if(labelServicio) labelServicio.innerText = "SERVICIO";

            } catch (error) {
                console.error("Error creando solicitud:", error);
                alert("Error al solicitar servicio.");
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerText = "SOLICITAR AHORA";
            }
        });
    }

    const qHistorial = query(
        collection(db, "services"),
        where("cliente_id", "==", user.uid),
        orderBy("created_at", "desc")
    );

    onSnapshot(qHistorial, (snap) => {
        if(!contenedorSolicitudes) return;
        contenedorSolicitudes.innerHTML = "";

        if (snap.empty) {
            contenedorSolicitudes.innerHTML = '<p class="text-gray-500 text-sm italic">No tienes servicios activos.</p>';
            return;
        }

        snap.forEach(docSnap => {
            const data = docSnap.data();
            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-white/10 p-4 rounded-xl mb-3";
            let colorEstado = "text-yellow-500";
            if(data.estado === "finalizado") colorEstado = "text-emerald-500";
            if(data.estado === "asignado") colorEstado = "text-blue-500";

            card.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <span class="font-black text-white uppercase">${data.categoria}</span>
                    <span class="text-xs font-bold ${colorEstado}">${data.estado.toUpperCase()}</span>
                </div>
                <p class="text-xs text-gray-400 truncate">${data.direccion}</p>
                ${data.estado === 'en_camino' || data.estado === 'en_sitio' ? 
                    `<a href="rastreo.html?id=${docSnap.id}" class="block mt-3 text-center bg-zinc-800 text-white text-xs font-bold py-2 rounded-lg border border-white/10 hover:bg-emerald-500 hover:text-black transition-colors">
                        <i class="fas fa-map-marked-alt"></i> VER MAPA EN VIVO
                    </a>` : ''
                }
            `;
            contenedorSolicitudes.appendChild(card);
        });
    });
}
