/**
 * ======================================================
 * FIXGO 2026 - PANEL MAESTRO DE CONTROL (LOGIC CORE)
 * Archivo: app-panel.js
 * Versión: 5.2 (FIX: AUDIO RESTORED + ADMIN COUNTER)
 * ======================================================
 */

import { 
    db, auth, doc, updateDoc, collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, setDoc 
} from "./firebase.js";

import { iniciarTracking, detenerTracking } from "./gps-motor.js";

// ======================================================
// 🔔 SISTEMA DE SONIDO (REFORZADO)
// ======================================================
const audioNotificacion = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');

// Desbloqueo inicial del audio (Necesario en Chrome/Safari)
document.body.addEventListener('click', () => {
    audioNotificacion.play().then(() => {
        audioNotificacion.pause();
        audioNotificacion.currentTime = 0;
    }).catch(e => {});
}, { once: true });

function sonarAlerta() {
    audioNotificacion.currentTime = 0;
    audioNotificacion.play().catch(e => console.log("🔊 Alerta visual (Audio bloqueado)."));
}

// ======================================================
// 📄 CARGADOR PDF (Mantenemos la V5.1 que funciona)
// ======================================================
async function cargarLibreriaPDF() {
    if (window.jspdf) return window.jspdf;
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.onload = () => resolve(window.jspdf);
        script.onerror = () => reject("Error cargando PDF lib");
        document.head.appendChild(script);
    });
}

console.log("🚀 FIXGO 5.2: Audio y Contadores Corregidos.");


// ======================================================
// 1. PANEL DE ADMINISTRADOR
// ======================================================
export async function iniciarPanelAdmin(user) {
    const elementos = {
        lista: document.getElementById("listaTecnicos"),
        actividad: document.getElementById("listaTransacciones"),
        countServ: document.querySelector(".fa-bolt")?.closest(".uber-card")?.querySelector("h3"),
        countMoney: document.querySelector(".fa-wallet")?.closest(".uber-card")?.querySelector("h3"),
        countOnline: document.getElementById("totalTecnicos") // RECUPERADO
    };

    // 1.A. TÉCNICOS (LISTA + CONTADOR ONLINE RESTAURADO)
    if (elementos.lista) {
        onSnapshot(query(collection(db, "users"), where("rol", "==", "tecnico")), (snap) => {
            elementos.lista.innerHTML = ""; 
            
            let contOnline = 0;
            let contTotal = 0;

            if (snap.empty) { elementos.lista.innerHTML = '<p class="text-gray-500 p-4">Sin técnicos.</p>'; }

            snap.forEach((docSnap) => {
                const data = docSnap.data();
                contTotal++;
                if(data.disponible) contOnline++; // SUMAMOS SI ESTÁ ONLINE

                const esPendiente = (data.estado || "pendiente") === "pendiente";
                const ineCheck = data.documentos?.ine ? '✅' : '❌';
                const csfCheck = data.documentos?.csf ? '✅' : '❌';

                const card = document.createElement("div");
                card.className = `p-4 mb-3 rounded-xl border ${esPendiente ? 'bg-yellow-900/10 border-yellow-500' : 'bg-zinc-900 border-zinc-800'}`;
                
                // Indicador visual de estado en la tarjeta
                const estadoDot = data.disponible ? '<span class="text-emerald-500 font-bold text-[10px] animate-pulse">● ONLINE</span>' : '<span class="text-gray-500 text-[10px]">● OFFLINE</span>';

                card.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div>
                            <h4 class="font-bold text-white text-sm">
                                ${data.nombre} ${esPendiente ? '<span class="text-[9px] bg-yellow-500 text-black px-1 rounded">NUEVO</span>' : ''}
                            </h4>
                            <p class="text-xs text-gray-400">${data.email}</p>
                            <div class="flex gap-2 mt-1 items-center">
                                <span class="text-[10px] text-gray-500">INE: ${ineCheck}</span>
                                ${estadoDot}
                            </div>
                        </div>
                        ${esPendiente ? `<button class="bg-emerald-500 text-black font-bold text-xs px-3 py-1 rounded hover:scale-105 transition-transform" onclick="window.aprobarTecnico('${docSnap.id}')">APROBAR</button>` : `<i class="fas fa-check-circle text-emerald-500"></i>`}
                    </div>
                `;
                elementos.lista.appendChild(card);
            });

            // ACTUALIZAR CONTADOR DE TÉCNICOS (LO QUE FALTABA)
            if(elementos.countOnline) {
                elementos.countOnline.innerHTML = `${contOnline} <span class="text-sm text-gray-500">/ ${contTotal}</span>`;
                elementos.countOnline.style.color = contOnline > 0 ? "#10b981" : "white";
            }
        });
    }

    // 1.B. ACTIVIDAD GLOBAL (Sin cambios, funciona bien)
    onSnapshot(query(collection(db, "services"), orderBy("created_at", "desc")), (snap) => {
        if(elementos.actividad) elementos.actividad.innerHTML = "";
        let activos = 0, ingresos = 0;

        snap.forEach(docSnap => {
            const data = docSnap.data();
            if (!["finalizado", "cancelado"].includes(data.estado)) activos++;
            if (data.costo_final) ingresos += (data.costo_final * 0.32);

            if (elementos.actividad && elementos.actividad.children.length < 10) {
                const item = document.createElement("div");
                item.className = "flex justify-between items-center border-b border-white/5 py-3";
                item.innerHTML = `
                    <div><p class="text-xs font-bold text-white uppercase">${data.categoria}</p><p class="text-[10px] text-gray-500">${data.cliente_nombre || 'Cliente'}</p></div>
                    <div class="text-right"><p class="text-[10px] font-bold text-emerald-500 uppercase">${data.estado}</p></div>
                `;
                elementos.actividad.appendChild(item);
            }
        });
        if(elementos.countServ) elementos.countServ.innerText = activos;
        if(elementos.countMoney) elementos.countMoney.innerText = `$${ingresos.toFixed(2)}`;
    });

    window.aprobarTecnico = async (uid) => {
        await updateDoc(doc(db, "users", uid), { estado: "activo", status: "activo", verificado: true });
        alert("✅ Técnico Aprobado");
    };
}


// ======================================================
// 2. PANEL DE TÉCNICO (Socio Operador)
// ======================================================
export async function iniciarPanelTecnico(user) {
    const el = {
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

    // 2.A. PERFIL Y ESTADO
    onSnapshot(doc(db, "users", user.uid), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        const estado = data.estado || "pendiente";

        if (estado === "pendiente") {
            el.statusLabel.innerText = "EN REVISIÓN";
            if(el.toggleONOFF) { el.toggleONOFF.disabled = true; el.toggleONOFF.checked = false; }
            if(el.seccionBolsa) el.seccionBolsa.innerHTML = '<div class="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-xl text-center text-yellow-500 text-xs">🔒 Esperando aprobación de Admin.</div>';
            return;
        }

        if (el.toggleONOFF) {
            el.toggleONOFF.disabled = false;
            el.toggleONOFF.checked = data.disponible;
        }

        if (data.disponible) {
            iniciarTracking(user.uid);
            el.seccionBolsa?.classList.remove("hidden");
            escucharBolsa(user, el.listaBolsa);
            el.statusLabel.innerText = "EN LÍNEA";
            el.statusLabel.className = "bg-emerald-500/20 text-emerald-500 status-badge font-bold animate-pulse";
            el.radarSection?.classList.remove("opacity-50", "grayscale");
        } else {
            detenerTracking();
            el.seccionBolsa?.classList.add("hidden");
            el.statusLabel.innerText = "OFFLINE";
            el.statusLabel.className = "bg-red-500/20 text-red-500 status-badge font-bold";
            el.radarSection?.classList.add("opacity-50", "grayscale");
        }
    });

    if (el.toggleONOFF) {
        el.toggleONOFF.addEventListener("change", (e) => updateDoc(doc(db, "users", user.uid), { disponible: e.target.checked }));
    }

    // 2.B. BOLSA DE TRABAJO (CON SONIDO RESTAURADO)
    function escucharBolsa(tecnico, contenedor) {
        if(!contenedor) return;
        onSnapshot(query(collection(db, "services"), where("estado", "==", "pendiente"), orderBy("created_at", "desc")), (snap) => {
            contenedor.innerHTML = "";
            if(snap.empty) { contenedor.innerHTML = `<p class="text-gray-600 text-[10px] text-center italic">Escaneando zona...</p>`; return; }
            
            // 🔔 SONIDO ACTIVADO: Si llega algo nuevo a la bolsa
            if(snap.docChanges().some(change => change.type === 'added')) {
                console.log("🔔 Nueva solicitud detectada: SONANDO ALERTA");
                sonarAlerta();
            }

            snap.forEach((docSnap) => {
                const s = docSnap.data();
                const card = document.createElement("div");
                card.className = "bg-zinc-900 border border-zinc-700 p-4 rounded-xl mb-2 animate-pulse border-emerald-500";
                card.innerHTML = `
                    <div class="flex justify-between items-center mb-2"><span class="bg-emerald-500 text-black text-[10px] font-black px-2 rounded">NUEVA SOLICITUD</span><span class="text-white font-bold text-xs">${s.categoria.toUpperCase()}</span></div>
                    <p class="text-gray-300 text-sm mb-3 font-medium">"${s.descripcion}"</p>
                    <p class="text-gray-500 text-xs mb-3"><i class="fas fa-map-marker-alt"></i> ${s.zona || 'Cancún Centro'}</p>
                    <button class="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black py-3 rounded-lg text-xs uppercase" onclick="window.aceptarServicio('${docSnap.id}', '${tecnico.uid}', '${tecnico.nombre}')">ACEPTAR (BLOQUEAR $550)</button>
                `;
                contenedor.appendChild(card);
            });
        });
    }

    window.aceptarServicio = async (id, uid, nombre) => {
        if(!confirm("¿Aceptar servicio?")) return;
        await updateDoc(doc(db, "services", id), { estado: "asignado", tecnico_id: uid, tecnico_nombre: nombre, asignado_at: serverTimestamp() });
    };

    // 2.C. FLUJO ACTIVO
    onSnapshot(query(collection(db, "services"), where("tecnico_id", "==", user.uid), where("estado", "in", ["asignado", "en_camino", "en_sitio", "cotizando", "trabajando"])), (snap) => {
        const ls = el.listaServicios;
        const pa = el.panelAcciones;
        if (!ls) return;
        ls.innerHTML = "";
        
        if (snap.empty) { pa?.classList.add("translate-y-full"); return; }
        pa?.classList.remove("translate-y-full");

        snap.forEach((docSnap) => {
            const s = docSnap.data();
            const id = docSnap.id;
            
            // Tarjeta Info
            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-blue-500/50 p-6 rounded-2xl relative overflow-hidden mb-4 shadow-xl";
            card.innerHTML = `
                <div class="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase">${s.estado.replace('_', ' ')}</div>
                <h3 class="text-xl font-black text-white mb-1 uppercase">${s.categoria}</h3>
                <p class="text-gray-400 text-sm mb-4"><i class="fas fa-map-marker-alt text-blue-500"></i> ${s.direccion}</p>
                <div class="flex gap-2">
                    <a href="https://waze.com/ul?q=${encodeURIComponent(s.direccion)}" target="_blank" class="flex-1 bg-blue-500 text-white font-bold py-3 rounded-xl text-center text-sm">WAZE</a>
                    <a href="tel:${s.cliente_telefono}" class="bg-zinc-800 text-white font-bold py-3 px-4 rounded-xl"><i class="fas fa-phone"></i></a>
                </div>
            `;
            ls.appendChild(card);

            const btn1 = el.btnEnCamino;
            const btn2 = el.btnLlegue;
            btn1.classList.add("hidden"); btn2.classList.add("hidden");

            if (s.estado === "asignado") {
                btn1.classList.remove("hidden");
                btn1.innerText = "VOY EN CAMINO";
                btn1.onclick = () => updateDoc(doc(db, "services", id), { estado: "en_camino" });
            } 
            else if (s.estado === "en_camino") {
                btn2.classList.remove("hidden");
                btn2.innerText = "YA LLEGUÉ";
                btn2.onclick = () => updateDoc(doc(db, "services", id), { estado: "en_sitio" });
            }
            else if (s.estado === "en_sitio") {
                btn2.classList.remove("hidden");
                btn2.innerText = "INICIAR COTIZACIÓN";
                btn2.className = "w-full bg-blue-600 text-white font-black py-4 rounded-xl text-lg";
                btn2.onclick = () => mostrarModalCotizacion(id);
            }
            else if (s.estado === "cotizando") {
                btn2.classList.remove("hidden");
                btn2.innerText = "ESPERANDO AL CLIENTE...";
                btn2.disabled = true;
                btn2.className = "w-full bg-zinc-700 text-gray-400 font-bold py-4 rounded-xl cursor-not-allowed";
            }
            else if (s.estado === "trabajando") {
                btn2.classList.remove("hidden");
                btn2.innerText = "📸 FINALIZAR Y EVIDENCIA";
                btn2.disabled = false;
                btn2.className = "w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl text-lg";
                btn2.onclick = () => mostrarModalEvidencia(id);
            }
        });
    });

    // 📸 MODAL EVIDENCIA (REAL CON BASE64)
    function mostrarModalEvidencia(id) {
        if(document.getElementById("modalEvidencia")) return;
        const html = `
            <div id="modalEvidencia" class="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4">
                <div class="bg-zinc-900 w-full max-w-md rounded-3xl p-6 border border-zinc-700">
                    <h3 class="text-white font-black text-xl mb-4">REPORTE FINAL</h3>
                    <div class="space-y-4">
                        <div class="bg-black p-4 rounded-xl border border-zinc-800 text-center">
                            <label class="block text-xs font-bold text-emerald-500 mb-2">FOTO ANTES</label>
                            <input type="file" id="fileAntes" accept="image/*" class="text-xs text-white">
                        </div>
                        <div class="bg-black p-4 rounded-xl border border-zinc-800 text-center">
                            <label class="block text-xs font-bold text-emerald-500 mb-2">FOTO DESPUÉS</label>
                            <input type="file" id="fileDespues" accept="image/*" class="text-xs text-white">
                        </div>
                    </div>
                    <div class="flex gap-3 mt-6">
                        <button onclick="document.getElementById('modalEvidencia').remove()" class="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-bold">CANCELAR</button>
                        <button id="btnSubirEvidencia" class="flex-1 bg-emerald-500 text-black py-3 rounded-xl font-black">FINALIZAR</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        document.getElementById("btnSubirEvidencia").onclick = async () => {
            const f1 = document.getElementById("fileAntes").files[0];
            const f2 = document.getElementById("fileDespues").files[0];
            if(!f1 || !f2) { alert("⚠️ Faltan fotos."); return; }
            
            const btn = document.getElementById("btnSubirEvidencia");
            btn.innerText = "SUBIENDO..."; btn.disabled = true;

            const b64_1 = await toBase64(f1);
            const b64_2 = await toBase64(f2);

            await updateDoc(doc(db, "services", id), {
                estado: "finalizado",
                evidencia: { antes: b64_1, despues: b64_2 },
                finalizado_at: serverTimestamp()
            });
            document.getElementById("modalEvidencia").remove();
            alert("✅ ¡Servicio Cerrado Exitosamente!");
        };
    }

    function mostrarModalCotizacion(id) {
        if(document.getElementById("modalCot")) return;
        const html = `
            <div id="modalCot" class="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4">
                <div class="bg-zinc-900 w-full max-w-md rounded-3xl p-6 border border-zinc-700">
                    <h3 class="text-white font-black text-xl mb-2">COTIZAR SERVICIO</h3>
                    <input id="inDiag" class="w-full bg-black p-3 text-white rounded-xl mb-2 text-sm border border-zinc-700" placeholder="Diagnóstico...">
                    <input id="inCosto" type="number" class="w-full bg-black p-3 text-white rounded-xl mb-4 text-xl font-bold border border-zinc-700" placeholder="$0.00">
                    <div class="flex gap-2">
                        <button onclick="document.getElementById('modalCot').remove()" class="flex-1 bg-zinc-800 text-white py-3 rounded-xl">CANCELAR</button>
                        <button id="btnEnviarCot" class="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl">ENVIAR</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        document.getElementById("btnEnviarCot").onclick = async () => {
            const diag = document.getElementById("inDiag").value;
            const costo = document.getElementById("inCosto").value;
            if(!diag || !costo) return alert("Llena todo");
            await updateDoc(doc(db, "services", id), { estado: "cotizando", diagnostico: diag, costo_final: parseFloat(costo) });
            document.getElementById("modalCot").remove();
        };
    }

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

    el.tarjetas.forEach(card => {
        card.addEventListener("click", () => {
            el.tarjetas.forEach(c => c.classList.remove("border-emerald-500", "bg-zinc-800"));
            card.classList.add("border-emerald-500", "bg-zinc-800");
            el.inputCat.value = card.dataset.category;
            if(el.labelServicio) el.labelServicio.innerText = card.dataset.category.toUpperCase();
        });
    });

    if (el.form) {
        el.form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const cat = el.inputCat.value;
            const dir = el.form.querySelector('[name="direccion"]').value;
            const desc = el.form.querySelector('[name="descripcion"]').value;
            if (!cat) { alert("Selecciona un servicio."); return; }

            const btn = el.form.querySelector("button");
            btn.disabled = true; btn.innerText = "PROCESANDO...";

            if(confirm("Se retendrán $550 MXN. ¿Continuar?")) {
                await addDoc(collection(db, "services"), {
                    cliente_id: user.uid, cliente_nombre: user.nombre || "Cliente", cliente_telefono: user.telefono || "",
                    categoria: cat, direccion: dir, descripcion: desc,
                    estado: "pendiente", created_at: serverTimestamp(), retencion_inicial: 550, costo_final: 0
                });
                alert("✅ Solicitud enviada.");
                el.form.reset();
            }
            btn.disabled = false; btn.innerText = "SOLICITAR AHORA";
        });
    }

    onSnapshot(query(collection(db, "services"), where("cliente_id", "==", user.uid), orderBy("created_at", "desc")), (snap) => {
        if(!el.lista) return;
        el.lista.innerHTML = "";

        // 🔔 SONIDO ACTIVADO: Si el técnico avanza, cambia estado
        if(snap.docChanges().some(change => change.type === 'modified')) {
            console.log("🔔 Cambio de estado servicio: SONANDO ALERTA");
            sonarAlerta();
        }

        snap.forEach(docSnap => {
            const s = docSnap.data();
            const id = docSnap.id;
            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-white/10 p-4 rounded-xl mb-3";

            let contenido = `<span class="text-xs font-bold text-yellow-500">${s.estado.toUpperCase()}</span>`;

            if (s.estado === "cotizando") {
                contenido = `
                    <div class="bg-zinc-800 p-3 rounded-lg border border-yellow-500 mt-2">
                        <p class="text-yellow-500 text-xs font-bold">NUEVA COTIZACIÓN</p>
                        <p class="text-white text-xl font-black">$${s.costo_final}</p>
                        <p class="text-gray-400 text-xs italic mb-2">"${s.diagnostico}"</p>
                        <div class="flex gap-2">
                            <button onclick="window.responder('${id}', false)" class="flex-1 bg-red-900 text-red-200 text-xs py-2 rounded">RECHAZAR</button>
                            <button onclick="window.responder('${id}', true)" class="flex-1 bg-emerald-500 text-black font-bold text-xs py-2 rounded">APROBAR</button>
                        </div>
                    </div>
                `;
            } else if (s.estado === "finalizado") {
                // REPORTE CON FOTOS Y BOTÓN PDF ACTIVO
                const safeData = encodeURIComponent(JSON.stringify({...s, id: id}));
                
                contenido = `
                    <div class="bg-emerald-900/20 border border-emerald-500/50 p-4 rounded-xl mt-2">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-emerald-500 font-black text-sm">REPORTE FINAL</span>
                            <span class="bg-emerald-500 text-black text-[10px] font-bold px-2 rounded">PAGADO</span>
                        </div>
                        <div class="flex justify-between text-xs text-gray-300 mb-1"><span>Diagnóstico:</span><span>${s.diagnostico}</span></div>
                        <div class="flex justify-between text-lg text-white font-black mb-3"><span>TOTAL:</span><span>$${s.costo_final}</span></div>
                        <p class="text-[10px] text-gray-500 mb-1 font-bold">EVIDENCIA FOTOGRÁFICA:</p>
                        <div class="flex gap-2">
                            ${s.evidencia?.antes ? `<img src="${s.evidencia.antes}" class="w-1/2 h-20 object-cover rounded-lg border border-gray-700">` : ''}
                            ${s.evidencia?.despues ? `<img src="${s.evidencia.despues}" class="w-1/2 h-20 object-cover rounded-lg border border-gray-700">` : ''}
                        </div>
                        <button onclick="window.generarPDF('${safeData}')" class="w-full mt-3 bg-zinc-800 hover:bg-zinc-700 text-white text-xs py-2 rounded font-bold border border-white/20 transition-all flex items-center justify-center gap-2">
                            <i class="fas fa-file-pdf text-red-500"></i> DESCARGAR REPORTE OFICIAL
                        </button>
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="flex justify-between items-center mb-1"><span class="font-black text-white uppercase">${s.categoria}</span></div>
                <p class="text-xs text-gray-400 truncate">${s.direccion}</p>
                <div class="mt-2">${contenido}</div>
            `;
            el.lista.appendChild(card);
        });
    });

    window.responder = async (id, acepta) => {
        if(acepta) await updateDoc(doc(db, "services", id), { estado: "trabajando" });
        else if(confirm("¿Cancelar? Se cobrará visita.")) await updateDoc(doc(db, "services", id), { estado: "cancelado" });
    };

    // GENERADOR DE PDF
    window.generarPDF = async (encodedData) => {
        const data = JSON.parse(decodeURIComponent(encodedData));
        
        try {
            // CARGA DINÁMICA SEGURA
            const { jsPDF } = await cargarLibreriaPDF();
            const doc = new jsPDF();

            // Estilos
            doc.setFillColor(0, 0, 0); // Fondo Negro Header
            doc.rect(0, 0, 210, 40, 'F');
            
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(22);
            doc.text("FIXGO MÉXICO", 20, 20);
            doc.setFontSize(10);
            doc.text("Reporte de Servicio Técnico", 20, 30);
            doc.text(`ID: ${data.id}`, 150, 30);

            doc.setTextColor(0, 0, 0);
            doc.setFontSize(12);
            
            let y = 60;
            doc.text(`Cliente: ${data.cliente_nombre}`, 20, y);
            doc.text(`Fecha: ${new Date(data.created_at.seconds * 1000).toLocaleDateString()}`, 120, y);
            y+=10;
            doc.text(`Dirección: ${data.direccion}`, 20, y);
            y+=10;
            doc.text(`Categoría: ${data.categoria.toUpperCase()}`, 20, y);
            
            y+=20;
            doc.setDrawColor(0);
            doc.line(20, y, 190, y);
            y+=10;

            doc.setFontSize(14);
            doc.text("DIAGNÓSTICO Y COSTOS", 20, y);
            y+=10;
            doc.setFontSize(12);
            doc.text(`Detalle: ${data.diagnostico}`, 20, y);
            y+=10;
            doc.setFont(undefined, 'bold');
            doc.text(`TOTAL COBRADO: $${data.costo_final} MXN`, 20, y);
            
            y+=20;
            doc.text("EVIDENCIA FOTOGRÁFICA:", 20, y);
            y+=10;

            if(data.evidencia?.antes) {
                doc.addImage(data.evidencia.antes, "JPEG", 20, y, 80, 60);
                doc.text("ANTES", 55, y+65);
            }
            if(data.evidencia?.despues) {
                doc.addImage(data.evidencia.despues, "JPEG", 110, y, 80, 60);
                doc.text("DESPUÉS", 145, y+65);
            }

            doc.save(`Reporte_FixGo_${data.id}.pdf`);
        } catch (error) {
            console.error(error);
            alert("Error generando PDF. Intenta de nuevo.");
        }
    };
}
