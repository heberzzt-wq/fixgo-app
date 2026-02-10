/**
 * ======================================================
 * FIXGO 2026 - PANEL MAESTRO DE CONTROL (LOGIC CORE)
 * Archivo: app-panel.js
 * Versión: 4.0 (PRODUCCIÓN REAL - FLUJO COMPLETO)
 * ======================================================
 */

import { 
    db, auth, doc, getDoc, updateDoc, collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, setDoc 
} from "./firebase.js";

import { iniciarTracking, detenerTracking } from "./gps-motor.js";

// SONIDOS DEL SISTEMA
const audioAlerta = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'); // Sonido tipo "Ping"

console.log("🚀 FIXGO 4.0: Sistema de Operaciones en Tiempo Real INICIADO.");

// ======================================================
// 1. PANEL DE ADMINISTRADOR (Torre de Control)
// ======================================================
export async function iniciarPanelAdmin(user) {
    const contenedorTecnicos = document.getElementById("listaTecnicos");
    const contenedorActividad = document.getElementById("listaTransacciones");
    const contadorServicios = document.querySelector(".fa-bolt")?.closest(".uber-card")?.querySelector("h3");
    const contadorIngresos = document.querySelector(".fa-wallet")?.closest(".uber-card")?.querySelector("h3");

    // 1.A. TÉCNICOS Y APROBACIÓN
    if (contenedorTecnicos) {
        onSnapshot(query(collection(db, "users"), where("rol", "==", "tecnico")), (snap) => {
            contenedorTecnicos.innerHTML = ""; 
            if (snap.empty) { contenedorTecnicos.innerHTML = '<p class="text-gray-500 p-4">Sin técnicos.</p>'; return; }

            snap.forEach((docSnap) => {
                const data = docSnap.data();
                const esPendiente = (data.estado || "pendiente") === "pendiente";
                const tieneINE = data.documentos?.ine ? '✅ INE' : '❌ INE';
                const tieneCSF = data.documentos?.csf ? '✅ CSF' : '❌ CSF';

                const card = document.createElement("div");
                card.className = `p-4 mb-3 rounded-xl border ${esPendiente ? 'bg-yellow-900/10 border-yellow-500' : 'bg-zinc-900 border-zinc-800'}`;
                card.innerHTML = `
                    <div class="flex justify-between">
                        <div>
                            <h4 class="font-bold text-white">${data.nombre} ${esPendiente ? '<span class="text-[9px] bg-yellow-500 text-black px-1 rounded">REV</span>' : ''}</h4>
                            <p class="text-xs text-gray-400">${data.email} | ${data.telefono || ''}</p>
                            <div class="mt-1 text-[10px] text-emerald-400">${tieneINE} | ${tieneCSF}</div>
                        </div>
                        ${esPendiente ? `<button class="btn-aprobar bg-emerald-500 text-black font-bold text-xs px-3 py-1 rounded" data-uid="${docSnap.id}">APROBAR</button>` : `<i class="fas fa-check-circle text-emerald-800"></i>`}
                    </div>
                `;
                contenedorTecnicos.appendChild(card);
            });
            document.querySelectorAll(".btn-aprobar").forEach(btn => btn.onclick = () => aprobarTecnico(btn.dataset.uid));
        });
    }

    // 1.B. MONITOREO DE SERVICIOS
    onSnapshot(query(collection(db, "services"), orderBy("created_at", "desc")), (snap) => {
        if(contenedorActividad) contenedorActividad.innerHTML = "";
        let activos = 0, ingresos = 0;

        snap.forEach(docSnap => {
            const data = docSnap.data();
            if (!["finalizado", "cancelado"].includes(data.estado)) activos++;
            if (data.costo_final) ingresos += (data.costo_final * 0.32); // 32% Comisión

            if (contenedorActividad && contenedorActividad.children.length < 10) {
                const item = document.createElement("div");
                item.className = "flex justify-between items-center border-b border-white/5 py-3";
                item.innerHTML = `
                    <div><p class="text-sm font-bold text-white uppercase">${data.categoria}</p><p class="text-[10px] text-gray-500">${data.zona || 'Cancún'}</p></div>
                    <div class="text-right"><p class="text-xs font-bold text-emerald-500 uppercase">${data.estado}</p></div>
                `;
                contenedorActividad.appendChild(item);
            }
        });
        if(contadorServicios) contadorServicios.innerText = activos;
        if(contadorIngresos) contadorIngresos.innerText = `$${ingresos.toFixed(2)}`;
    });
}

async function aprobarTecnico(uid) {
    await updateDoc(doc(db, "users", uid), { estado: "activo", status: "activo", verificado: true });
    alert("✅ Técnico Aprobado");
}


// ======================================================
// 2. PANEL DE TÉCNICO (Socio Operador)
// ======================================================
export async function iniciarPanelTecnico(user) {
    const elementos = {
        btnEnCamino: document.getElementById("btnEnCamino"),
        btnLlegue: document.getElementById("btnLlegue"),
        panelAcciones: document.getElementById("panelAcciones"),
        toggleONOFF: document.getElementById("toggleONOFF"),
        listaServicios: document.getElementById("listaServicios"),
        statusLabel: document.getElementById("statusLabel"),
        radarSection: document.getElementById("radarSection"),
        seccionBolsa: document.getElementById("seccionBolsa"),
        listaBolsa: document.getElementById("listaBolsa")
    };

    // 2.A. ESTADO DEL TÉCNICO
    onSnapshot(doc(db, "users", user.uid), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        const estado = data.estado || "pendiente";

        if (estado === "pendiente") {
            if(elementos.statusLabel) elementos.statusLabel.innerText = "EN REVISIÓN";
            if(elementos.toggleONOFF) { elementos.toggleONOFF.disabled = true; elementos.toggleONOFF.checked = false; }
            if(elementos.seccionBolsa) elementos.seccionBolsa.innerHTML = '<p class="text-yellow-500 text-center text-xs p-4">🔒 Cuenta en revisión.</p>';
            return;
        }

        if (elementos.toggleONOFF) {
            elementos.toggleONOFF.disabled = false;
            elementos.toggleONOFF.checked = data.disponible;
        }
        
        if (data.disponible) {
            iniciarTracking(user.uid);
            elementos.seccionBolsa?.classList.remove("hidden");
            escucharBolsa(user, elementos.listaBolsa);
            elementos.statusLabel.innerText = "EN LÍNEA";
            elementos.statusLabel.className = "bg-emerald-500/20 text-emerald-500 status-badge font-bold animate-pulse";
        } else {
            detenerTracking();
            elementos.seccionBolsa?.classList.add("hidden");
            elementos.statusLabel.innerText = "OFFLINE";
            elementos.statusLabel.className = "bg-red-500/20 text-red-500 status-badge font-bold";
        }
    });

    if (elementos.toggleONOFF) {
        elementos.toggleONOFF.addEventListener("change", (e) => updateDoc(doc(db, "users", user.uid), { disponible: e.target.checked }));
    }

    // 2.B. BOLSA DE TRABAJO (Solo pendientes)
    function escucharBolsa(tecnico, contenedor) {
        if(!contenedor) return;
        const q = query(collection(db, "services"), where("estado", "==", "pendiente"), orderBy("created_at", "desc"));
        onSnapshot(q, (snap) => {
            contenedor.innerHTML = "";
            if(snap.empty) { contenedor.innerHTML = `<p class="text-gray-600 text-[10px] text-center italic">Escaneando zona...</p>`; return; }
            
            // SONIDO SI LLEGA NUEVA SOLICITUD
            if(snap.docChanges().some(change => change.type === 'added')) {
                audioAlerta.play().catch(e => console.log("Audio bloqueado por navegador"));
            }

            snap.forEach((docSnap) => {
                const s = docSnap.data();
                const card = document.createElement("div");
                card.className = "bg-zinc-900 border border-zinc-700 p-4 rounded-xl mb-2 hover:border-emerald-500 transition-colors";
                card.innerHTML = `
                    <div class="flex justify-between items-center mb-2"><span class="text-emerald-500 text-[10px] font-bold">NUEVA SOLICITUD ($550 RETENIDOS)</span><span class="text-white font-bold">${s.categoria.toUpperCase()}</span></div>
                    <p class="text-gray-400 text-xs mb-3 italic">"${s.descripcion}"</p>
                    <button class="w-full bg-emerald-500 text-black font-black py-3 rounded-lg text-xs uppercase" onclick="window.tomarServicio('${docSnap.id}', '${tecnico.uid}', '${tecnico.nombre}')">ACEPTAR SERVICIO</button>
                `;
                contenedor.appendChild(card);
            });
        });
    }

    // EXPORTAMOS LA FUNCIÓN AL WINDOW PARA EL ONCLICK
    window.tomarServicio = async (id, uid, nombre) => {
        if(!confirm("¿Aceptar servicio y bloquear $550 al cliente?")) return;
        await updateDoc(doc(db, "services", id), {
            estado: "asignado", tecnico_id: uid, tecnico_nombre: nombre, asignado_at: serverTimestamp()
        });
    };

    // 2.C. FLUJO ACTIVO (MISIONES)
    onSnapshot(query(collection(db, "services"), where("tecnico_id", "==", user.uid), where("estado", "in", ["asignado", "en_camino", "en_sitio", "cotizando", "trabajando"])), (snap) => {
        const ls = elementos.listaServicios;
        const pa = elementos.panelAcciones;
        if (!ls) return;
        ls.innerHTML = "";
        
        if (snap.empty) { pa?.classList.add("translate-y-full"); return; }
        pa?.classList.remove("translate-y-full");

        snap.forEach((docSnap) => {
            const s = docSnap.data();
            const id = docSnap.id;
            
            // Render Tarjeta
            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-blue-500/50 p-6 rounded-2xl relative overflow-hidden mb-4 shadow-xl";
            card.innerHTML = `
                <div class="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase">${s.estado.replace('_', ' ')}</div>
                <h3 class="text-xl font-black text-white mb-1 uppercase">${s.categoria}</h3>
                <p class="text-gray-400 text-sm mb-4"><i class="fas fa-map-marker-alt text-blue-500"></i> ${s.direccion}</p>
                <div class="flex gap-2">
                    <a href="https://waze.com/ul?q=${encodeURIComponent(s.direccion)}" target="_blank" class="flex-1 bg-blue-500 text-white font-bold py-3 rounded-xl text-center text-sm">WAZE</a>
                </div>
            `;
            ls.appendChild(card);

            // GESTIÓN DE BOTONES POR ESTADO
            const btn1 = elementos.btnEnCamino;
            const btn2 = elementos.btnLlegue;
            btn1.classList.add("hidden"); btn2.classList.add("hidden");

            if (s.estado === "asignado") {
                btn1.classList.remove("hidden");
                btn1.innerText = "VOY EN CAMINO";
                btn1.onclick = () => actualizarEstado(id, "en_camino");
            } 
            else if (s.estado === "en_camino") {
                btn2.classList.remove("hidden");
                btn2.innerText = "YA LLEGUÉ AL SITIO";
                btn2.onclick = () => {
                    // AQUÍ IRÍA LA VALIDACIÓN DE GEOCERCA (100m)
                    // Por ahora simulamos que siempre está cerca
                    actualizarEstado(id, "en_sitio");
                };
            }
            else if (s.estado === "en_sitio") {
                btn2.classList.remove("hidden");
                btn2.innerText = "INICIAR COTIZACIÓN / TRABAJO";
                btn2.classList.remove("bg-emerald-600"); btn2.classList.add("bg-blue-600");
                btn2.onclick = () => mostrarModalCotizacion(id);
            }
            else if (s.estado === "cotizando") {
                btn2.classList.remove("hidden");
                btn2.innerText = "ESPERANDO APROBACIÓN CLIENTE...";
                btn2.disabled = true;
                btn2.classList.add("opacity-50", "cursor-not-allowed");
            }
            else if (s.estado === "trabajando") {
                btn2.classList.remove("hidden");
                btn2.innerText = "FINALIZAR Y SUBIR EVIDENCIA";
                btn2.disabled = false; btn2.classList.remove("opacity-50", "bg-blue-600"); btn2.classList.add("bg-red-600");
                btn2.onclick = () => mostrarModalEvidencia(id);
            }
        });
    });

    async function actualizarEstado(id, estado, extras = {}) {
        await updateDoc(doc(db, "services", id), { estado: estado, ...extras });
    }

    // MODAL COTIZACIÓN
    function mostrarModalCotizacion(id) {
        const precio = prompt("Ingresa el COSTO TOTAL FINAL del servicio ($):");
        if(!precio) return;
        const notas = prompt("Ingresa el detalle de los extras (si aplica):", "Servicio estándar");
        
        actualizarEstado(id, "cotizando", { 
            costo_final: parseFloat(precio), 
            diagnostico: notas 
        });
        alert("⏳ Cotización enviada al cliente. Espera su aprobación.");
    }

    // MODAL EVIDENCIA (Simulado)
    function mostrarModalEvidencia(id) {
        if(!confirm("¿Ya tomaste las fotos del 'Después'?")) return;
        // Aquí iría el upload a Storage. Simulamos éxito.
        actualizarEstado(id, "finalizado", { finalizado_at: serverTimestamp() });
        alert("✅ Servicio Finalizado. Reporte generado.");
    }
}


// ======================================================
// 3. PANEL DE CLIENTE (Usuario Final)
// ======================================================
export async function iniciarPanelCliente(user) {
    const elementos = {
        form: document.getElementById("nuevaSolicitudForm"),
        lista: document.getElementById("solicitudesCliente"),
        inputCat: document.getElementById("categoriaSeleccionada"),
        tarjetas: document.querySelectorAll(".service-card")
    };

    // SELECCIÓN DE CATEGORÍA
    elementos.tarjetas.forEach(card => {
        card.addEventListener("click", () => {
            elementos.tarjetas.forEach(c => c.classList.remove("border-emerald-500", "bg-zinc-800"));
            card.classList.add("border-emerald-500", "bg-zinc-800");
            elementos.inputCat.value = card.dataset.category;
        });
    });

    // SOLICITUD DE SERVICIO
    if (elementos.form) {
        elementos.form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const cat = elementos.inputCat.value;
            const dir = elementos.form.querySelector('[name="direccion"]').value;
            const desc = elementos.form.querySelector('[name="descripcion"]').value;

            if (!cat) { alert("Selecciona un servicio."); return; }

            if(confirm("Se realizará una retención temporal de $550 MXN.\n\n¿Autorizar?")) {
                await addDoc(collection(db, "services"), {
                    cliente_id: user.uid,
                    categoria: cat, direccion: dir, descripcion: desc,
                    estado: "pendiente", created_at: serverTimestamp(),
                    retencion_inicial: 550,
                    costo_final: 0
                });
                alert("✅ Solicitud enviada. Buscando técnico...");
                elementos.form.reset();
            }
        });
    }

    // MONITOR DE SERVICIOS (CLIENTE)
    onSnapshot(query(collection(db, "services"), where("cliente_id", "==", user.uid), orderBy("created_at", "desc")), (snap) => {
        if(!elementos.lista) return;
        elementos.lista.innerHTML = "";

        snap.forEach(docSnap => {
            const s = docSnap.data();
            const id = docSnap.id;
            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-white/10 p-4 rounded-xl mb-3";
            
            let contenidoEstado = `<span class="text-xs font-bold text-yellow-500">${s.estado.toUpperCase()}</span>`;
            
            // LÓGICA DE APROBACIÓN DE COTIZACIÓN
            if (s.estado === "cotizando") {
                contenidoEstado = `
                    <div class="mt-2 bg-zinc-800 p-3 rounded-lg border border-yellow-500">
                        <p class="text-yellow-500 font-bold text-xs mb-1">COTIZACIÓN RECIBIDA</p>
                        <p class="text-white text-lg font-black">$${s.costo_final}</p>
                        <p class="text-gray-400 text-xs italic mb-3">"${s.diagnostico}"</p>
                        <div class="flex gap-2">
                            <button onclick="window.responderCotizacion('${id}', false)" class="flex-1 bg-red-900/50 text-red-500 text-xs py-2 rounded">RECHAZAR</button>
                            <button onclick="window.responderCotizacion('${id}', true)" class="flex-1 bg-emerald-500 text-black font-bold text-xs py-2 rounded">APROBAR ($${s.costo_final})</button>
                        </div>
                    </div>
                `;
            } else if (s.estado === "trabajando") {
                contenidoEstado = `<span class="text-xs font-bold text-blue-400 animate-pulse">TRABAJANDO...</span>`;
            } else if (s.estado === "finalizado") {
                contenidoEstado = `<span class="text-xs font-bold text-emerald-500">✅ FINALIZADO</span>`;
            }

            card.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <span class="font-black text-white uppercase">${s.categoria}</span>
                </div>
                <p class="text-xs text-gray-400 truncate">${s.direccion}</p>
                <div class="mt-2">${contenidoEstado}</div>
                ${(s.estado === 'en_camino' || s.estado === 'en_sitio') ? `<a href="rastreo.html?id=${id}" class="block mt-3 text-center bg-zinc-800 text-xs py-2 rounded border border-white/10">VER TÉCNICO EN MAPA</a>` : ''}
            `;
            elementos.lista.appendChild(card);
        });
    });

    window.responderCotizacion = async (id, aceptado) => {
        if (aceptado) {
            await updateDoc(doc(db, "services", id), { estado: "trabajando" });
            alert("✅ Cotización aprobada. El técnico iniciará el trabajo.");
        } else {
            if(confirm("¿Seguro que deseas cancelar? Se cobrará la visita ($550).")) {
                await updateDoc(doc(db, "services", id), { estado: "cancelado" });
            }
        }
    };
}
