/**
 * ======================================================
 * FIXGO 2026 - PANEL MAESTRO DE CONTROL (LOGIC CORE)
 * Archivo: app-panel.js
 * Versión: 2.2 (Corrección Final: Users + CreadoEn)
 * * DESCRIPCIÓN:
 * Lógica unificada para Admins, Técnicos y Clientes.
 * Ahora apunta exclusivamente a la colección maestra 'users'.
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

console.log("🧩 app-panel.js: Módulo de Paneles cargado correctamente.");

// ======================================================
// 1. PANEL DE ADMINISTRADOR (Torre de Control)
// ======================================================
export async function iniciarPanelAdmin(user) {
    console.log("👮‍♂️ Iniciando lógica de ADMINISTRADOR...");

    // Referencias al DOM (Admin)
    const contenedorTecnicos = document.getElementById("listaTecnicos");
    const contenedorTransacciones = document.getElementById("listaTransacciones");
    const contenedorLogs = document.getElementById("logsActividad");

    if (!contenedorTecnicos) return; // Protección si no estamos en admin.html

    // 1.A. ESCUCHAR TÉCNICOS EN LA COLECCIÓN 'USERS'
    // CORRECCIÓN 1: Buscamos en 'users' filtrando por rol.
    // CORRECCIÓN 2: Usamos 'creadoEn' que es como lo guarda firebase.js
    const qTecnicos = query(
        collection(db, "users"), 
        where("rol", "==", "tecnico"),
        orderBy("creadoEn", "desc")
    );

    onSnapshot(qTecnicos, (snapshot) => {
        contenedorTecnicos.innerHTML = ""; // Limpiar lista
        
        if (snapshot.empty) {
            contenedorTecnicos.innerHTML = '<p class="text-gray-500 italic p-4">No hay técnicos registrados en la base "users".</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const esPendiente = data.estado === "pendiente";
            
            // Renderizado de tarjeta de técnico
            const card = document.createElement("div");
            card.className = `p-4 mb-3 rounded-xl border ${esPendiente ? 'bg-yellow-900/10 border-yellow-500/30' : 'bg-zinc-900 border-zinc-800'}`;
            
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-white">${data.nombre}</h4>
                        <p class="text-xs text-gray-400">${data.email}</p>
                        <p class="text-xs text-gray-400">Tel: ${data.telefono || 'N/A'}</p>
                        <div class="mt-2 flex gap-2">
                             <span class="text-[10px] px-2 py-0.5 rounded border ${
                                data.estado === 'activo' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                             }">${data.estado ? data.estado.toUpperCase() : 'PENDIENTE'}</span>
                             <span class="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">${data.nivel || 'Bronce'}</span>
                        </div>
                    </div>
                    ${esPendiente ? `
                        <button class="btn-aprobar bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-3 py-2 rounded-lg transition-all" data-uid="${data.uid}">
                            <i class="fas fa-check-circle"></i> APROBAR
                        </button>
                    ` : `
                        <button class="bg-zinc-800 text-zinc-500 text-xs px-3 py-2 rounded-lg cursor-not-allowed">
                            <i class="fas fa-user-check"></i> VERIFICADO
                        </button>
                    `}
                </div>
                ${data.vehiculo ? `<p class="text-[10px] text-gray-500 mt-2"><i class="fas fa-car"></i> ${data.vehiculo}</p>` : ''}
            `;

            contenedorTecnicos.appendChild(card);
        });

        // Asignar eventos a botones de aprobar generados dinámicamente
        document.querySelectorAll(".btn-aprobar").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const uid = e.target.closest("button").dataset.uid;
                if(confirm("¿Estás seguro de APROBAR a este técnico? Podrá recibir servicios inmediatamente.")) {
                    await aprobarTecnico(uid);
                }
            });
        });
    });

    // 1.B. ESCUCHAR SERVICIOS ACTIVOS (SOLICITUDES)
    // Escuchamos la colección 'services'
    const qServicios = query(collection(db, "services"), orderBy("created_at", "desc"));
    
    // (Opcional) Renderizar servicios en otro contenedor si existiera en el HTML
}

// FUNCION AUXILIAR: Aprobar Técnico
async function aprobarTecnico(uid) {
    try {
        // CORRECCIÓN: Actualizamos directamente en 'users'
        const ref = doc(db, "users", uid);
        await updateDoc(ref, {
            estado: "activo",
            verificado: true,
            aprobadoEn: serverTimestamp()
        });
        
        alert("✅ Técnico aprobado correctamente.");
    } catch (error) {
        console.error("Error aprobando técnico:", error);
        alert("Error al aprobar: " + error.message);
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

    // 2.A. INICIALIZAR ESTADO DEL USUARIO (ON/OFF)
    // CORRECCIÓN: Leemos el estado desde 'users'
    try {
        const tecnicoRef = doc(db, "users", user.uid);
        const snapshot = await getDoc(tecnicoRef);
        
        if (snapshot.exists()) {
            const data = snapshot.data();
            
            // Validación de Bloqueo Administrativo
            if (data.estado === "pendiente") {
                alert("⚠️ TU CUENTA ESTÁ EN REVISIÓN.\n\nEl administrador debe aprobar tus documentos antes de poder recibir servicios.");
                if(toggleONOFF) toggleONOFF.disabled = true;
                if(statusLabel) statusLabel.innerText = "PENDIENTE DE APROBACIÓN";
                return; // Detenemos ejecución crítica
            }

            // Configurar Switch UI
            if (toggleONOFF) {
                toggleONOFF.checked = data.disponible || false;
                actualizarUIEstado(data.disponible);
                
                // Listener del Switch
                toggleONOFF.addEventListener("change", async (e) => {
                    const estaDisponible = e.target.checked;
                    // Actualizamos disponibilidad en 'users'
                    await updateDoc(tecnicoRef, { disponible: estaDisponible });
                    actualizarUIEstado(estaDisponible);
                    
                    if (estaDisponible) {
                        iniciarTracking(user.uid); // GPS ON
                    } else {
                        detenerTracking(); // GPS OFF
                    }
                });
            }

            // Iniciar GPS si ya estaba activo
            if (data.disponible) {
                iniciarTracking(user.uid);
            }
        }
    } catch (error) {
        console.error("Error obteniendo perfil técnico:", error);
    }

    // 2.B. ESCUCHAR ASIGNACIONES DE SERVICIO
    // Buscamos servicios donde tecnico_id == user.uid Y estado != finalizado
    const qMisiones = query(
        collection(db, "services"),
        where("tecnico_id", "==", user.uid),
        where("estado", "in", ["asignado", "en_camino", "en_sitio", "trabajando"])
    );

    onSnapshot(qMisiones, (snap) => {
        if (!listaServicios) return;
        listaServicios.innerHTML = "";

        if (snap.empty) {
            listaServicios.innerHTML = `
                <div class="text-center py-10 opacity-50">
                    <i class="fas fa-mug-hot text-4xl mb-3"></i>
                    <p>Esperando asignaciones...</p>
                </div>
            `;
            // Ocultar botones de acción si no hay misión activa
            if(document.getElementById("panelAcciones")) {
                document.getElementById("panelAcciones").classList.add("translate-y-full"); // Ocultar panel flotante
            }
            return;
        }

        // Si hay misión activa
        snap.forEach((docSnap) => {
            const servicio = docSnap.data();
            const servicioId = docSnap.id;
            
            // Mostrar Panel Flotante de Acciones
            const panelAcciones = document.getElementById("panelAcciones");
            if(panelAcciones) panelAcciones.classList.remove("translate-y-full");

            // Renderizar Tarjeta de Misión
            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-emerald-500/50 p-6 rounded-2xl relative overflow-hidden";
            card.innerHTML = `
                <div class="absolute top-0 right-0 bg-emerald-500 text-black text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase">
                    ${servicio.estado.replace('_', ' ')}
                </div>
                <h3 class="text-xl font-black text-white mb-1 uppercase">${servicio.categoria}</h3>
                <p class="text-gray-400 text-sm mb-4"><i class="fas fa-map-marker-alt text-emerald-500"></i> ${servicio.direccion}</p>
                
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

            // 2.C. LÓGICA DE BOTONES DE ESTADO (FLOW HAPPY PATH)
            gestionarBotonesMision(servicio, servicioId);
        });
    });

    // Sub-función: Actualizar UI Visual del estado
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

    // Sub-función: Gestión de Botones de Misión
    function gestionarBotonesMision(servicio, id) {
        // Reset botones
        if(btnEnCamino) btnEnCamino.classList.add("hidden");
        if(btnLlegue) btnLlegue.classList.add("hidden");

        if (servicio.estado === "asignado") {
            // Mostrar botón "Voy en Camino"
            if(btnEnCamino) {
                btnEnCamino.classList.remove("hidden");
                btnEnCamino.onclick = () => actualizarEstadoServicio(id, "en_camino");
            }
        } else if (servicio.estado === "en_camino") {
            // Mostrar botón "Ya Llegué"
            if(btnLlegue) {
                btnLlegue.classList.remove("hidden");
                btnLlegue.onclick = () => actualizarEstadoServicio(id, "en_sitio");
            }
        } else if (servicio.estado === "en_sitio") {
            // Aquí iría lógica para iniciar trabajo / cotizar
            // Por ahora mostramos texto informativo
            if(btnLlegue) {
                btnLlegue.classList.remove("hidden");
                btnLlegue.innerText = "EN SITIO - INICIAR TRABAJO";
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
            
            // También actualizamos el estado del rastreo para el mapa del cliente
            // Usamos setDoc con merge por si no existe
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

    // Referencias al DOM
    const gridServicios = document.getElementById("gridServicios"); 
    const formulario = document.getElementById("nuevaSolicitudForm");
    const contenedorSolicitudes = document.getElementById("solicitudesCliente");
    const inputCategoria = document.getElementById("categoriaSeleccionada");
    const labelServicio = document.getElementById("btnLabel");

    // 3.A. SELECCIÓN DE SERVICIOS (UI)
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

    // 3.B. CREAR SOLICITUD
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
                // Crear documento en colección 'services'
                await addDoc(collection(db, "services"), {
                    cliente_id: user.uid,
                    cliente_nombre: user.nombre || "Cliente",
                    cliente_telefono: user.telefono || "",
                    categoria: categoria,
                    direccion: direccion,
                    descripcion: descripcion,
                    estado: "pendiente", // El admin o algoritmo asignará
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

    // 3.C. MONITORIZAR SOLICITUDES ACTIVAS
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
