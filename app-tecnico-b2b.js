/**
 * GESTIA PREMIUM - V5.18
 * MOTOR DE OPERACIONES B2B (Uxmal 39)
 * FIX: Importaciones desacopladas para evitar SyntaxError de export
 * Lead Architect: Heberto Mendoza
 */

// 1. IMPORTAR INSTANCIAS LOCALES
import { auth, db, storage } from "./firebase.js";

// 2. IMPORTAR FUNCIONES DESDE LA LIBRERÍA (CDN)
import {
    doc,
    getDoc,
    getDocs,
    updateDoc,
    serverTimestamp,
    collection,
    query,
    where,
    onSnapshot,
    addDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// ESTADO GLOBAL
let ordenId = new URLSearchParams(window.location.search).get("id");
let canvas, ctx, isDrawing = false;
let MaterialesTemporales = [];
// REFACTOR 1: La ID del edificio ahora es dinámica y se carga desde el perfil.
let edificioIdGlobal = null;
let rutinaDiariaTareas = []; // TAREA 2: To keep track of tasks for the day
let rutinaCompletadaIds = new Set(); // TAREA 2: To track completed tasks

// --- UTILIDADES DE UI ---
function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-24 left-1/2 -translate-x-1/2 p-3 rounded-lg text-white text-xs font-bold shadow-lg z-50 transition-opacity duration-300 ${isError ? 'bg-red-600' : 'bg-emerald-600'}`;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function setButtonLoading(button, isLoading, originalText = 'Acción') {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> PROCESANDO...`;
    } else {
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

// 🛡️ REGLA 2: EL CANDADO JONATHAN
async function validarPaseCaseta() {
    const user = auth.currentUser;
    if (!user) return false;
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const data = userDoc.data();
    
    if (!data.tecnico_placas || data.tecnico_placas === "000-000" || data.tecnico_placas.trim() === "") {
        alert("🚨 BLOQUEO DE SEGURIDAD: No tienes placas registradas. Jonathan, no puedes iniciar servicios sin datos de vehículo para el pase de caseta.");
        return false;
    }
    return true;
}

// --- INICIALIZACIÓN ---
auth.onAuthStateChanged(async (user) => {
    if(!user) return window.location.href = "login.html";

    // REFACTOR 1: Al inicio, obtenemos el ID del edificio desde el perfil del técnico.
    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (userDoc.exists()) {
            const data = userDoc.data();

            // 🔥 CIRUGÍA VISUAL B2B: Ocultar Wallet y Documentos a técnicos B2B
            if (data.tipo_cuenta === "B2B") {
                console.log("🛠️ Perfil B2B detectado. Despejando panel visual...");
                
                // Escáner de IDs comunes para ocultarlos
                const elementosOcultar = [
                    "wallet", "billetera", "seccion-wallet", "contenedor-wallet", "caja-wallet",
                    "documentos", "seccion-documentos", "contenedor-documentos", "documentos_requeridos"
                ];
                
                elementosOcultar.forEach(id => {
                    const elemento = document.getElementById(id);
                    if (elemento) {
                        elemento.classList.add("hidden");
                        elemento.style.display = "none"; // Seguro de doble candado
                    }
                });
            }

            if (data.edificioId) {
                edificioIdGlobal = data.edificioId;
                console.log(`🏢 Técnico autenticado para el edificio: ${edificioIdGlobal}`);
            } else {
                document.body.innerHTML = `<div class="p-8 text-center text-red-500 text-lg font-black">ERROR DE ACCESO: Tu perfil no está asignado a ningún edificio. Contacta a tu administrador.</div>`;
                showToast("Error de perfil: No tienes un edificio B2B asignado.", true);
                return;
            }
        }
    } catch (error) {
        console.error("Error crítico al obtener perfil:", error);
        showToast("Error de conexión al verificar tu perfil. No se puede continuar.", true);
        return;
    }

    if(ordenId) {
        document.getElementById("listaTareasHoy").classList.add("hidden");
        document.getElementById("flujoTecnico").classList.remove("hidden");
    } else {
        cargarTareasProgramadas();
        cargarRutinaPreventiva(); // TAREA 2: NEW
    }
});

// --- CARGA DE DATOS ---
function cargarTareasProgramadas() {

    const contenedor = document.getElementById("contenedor-tareas-diarias");

    if (!contenedor || !edificioIdGlobal) return;

    const q = query(
        collection(db, "servicios_b2b"),
        where("edificioId", "==", edificioIdGlobal),
        where("status", "in", ["pendiente", "programado", "en_proceso"])
    );

    onSnapshot(q, (snapshot) => {

        contenedor.innerHTML = "";

        if (snapshot.empty) {

            contenedor.innerHTML = `
            <div class="p-8 text-center text-zinc-600 text-[10px] font-bold uppercase tracking-widest border border-dashed border-zinc-800 rounded-2xl">
                ${edificioIdGlobal.replace('-', ' ').toUpperCase()} : SIN SERVICIOS ACTIVOS
            </div>`;

            return;
        }

        snapshot.forEach((docSnap) => {

            const tarea = docSnap.data();
            const id = docSnap.id;

            const div = document.createElement("div");

            div.className =
                "p-4 glass-card rounded-xl border border-white/5 flex justify-between items-center";

            div.innerHTML = `
                <div>
                    <h4 class="text-sm font-black italic text-emerald-500">
                        ${tarea.descripcion || tarea.equipo || "Mantenimiento"}
                    </h4>

                    <p class="text-[9px] text-zinc-500 uppercase font-bold">
                        ${tarea.ubicacion_especifica || tarea.direccion || "General"}
                    </p>
                </div>

                <button
                    onclick="seleccionarTarea('${id}')"
                    class="bg-emerald-500 text-black text-[9px] font-black px-3 py-2 rounded-lg">
                    INICIAR
                </button>
            `;

            contenedor.appendChild(div);

        });

    }, (error) => {

        console.error("Error en Snapshot:", error);

        contenedor.innerHTML =
            `<div class="p-4 text-red-500 text-center text-[10px]">
                Error de conexión con la bitácora
            </div>`;
    });
}

window.seleccionarTarea = async (id) => {

    const tienePase = await validarPaseCaseta();

    if (!tienePase) return;

    ordenId = id;

    document.getElementById("listaTareasHoy").classList.add("hidden");
    document.getElementById("flujoTecnico").classList.remove("hidden");

};
// --- TAREA 2 (V5.19): MOTOR DE RUTINAS PREVENTIVAS ---
async function cargarRutinaPreventiva() {
    if (!edificioIdGlobal) return;

    const rutinaContainer = document.getElementById("rutinaPreventiva");
    const checklistContainer = document.getElementById("checklist-rutinas");
    if (!rutinaContainer || !checklistContainer) return;

    try {
        // 1. Get the master routine config
        const rutinaRef = doc(db, "config_rutinas", edificioIdGlobal);
        const rutinaSnap = await getDoc(rutinaRef);

        if (!rutinaSnap.exists()) {
            rutinaContainer.classList.add("hidden");
            return;
        }
        rutinaContainer.classList.remove("hidden");

        const rutinaMaster = rutinaSnap.data();
        let tareasDelDia = [];

        // 2. Logic for frequency
        const hoy = new Date();
        const diaSemana = hoy.getDay(); // 0=Domingo, 1=Lunes
        const diaMes = hoy.getDate();

        // Always add Daily tasks
        if (rutinaMaster.Diaria) tareasDelDia.push(...rutinaMaster.Diaria);

        // Add Weekly tasks on Mondays
        if (diaSemana === 1 && rutinaMaster.Semanal_Quincenal) {
            tareasDelDia.push(...rutinaMaster.Semanal_Quincenal);
        }

        // Add Monthly tasks on the 1st
        if (diaMes === 1 && rutinaMaster.Mensual) {
            tareasDelDia.push(...rutinaMaster.Mensual);
        }
        
        // Add Annual tasks on Jan 1st
        if (diaMes === 1 && hoy.getMonth() === 0 && rutinaMaster.Semestral_Anual) {
            tareasDelDia.push(...rutinaMaster.Semestral_Anual);
        }

        rutinaDiariaTareas = tareasDelDia; // Store for later checks

        // 3. Get today's completed tasks to pre-fill checkboxes
        const fechaHoyStr = hoy.toISOString().split('T')[0];
        const qLogs = query(
            collection(db, "log_rutinas"),
            where("edificioId", "==", edificioIdGlobal),
            where("fechaCompletado", "==", fechaHoyStr)
        );
        const logSnapshot = await getDocs(qLogs);
        rutinaCompletadaIds = new Set(logSnapshot.docs.map(d => d.data().tareaId));

        // 4. Render the checklist
        renderizarChecklist();

    } catch (error) {
        console.error("Error cargando rutina preventiva:", error);
        checklistContainer.innerHTML = `<p class="text-red-500 text-xs">Error al cargar rutina.</p>`;
    }
}

function renderizarChecklist() {
    const checklistContainer = document.getElementById("checklist-rutinas");
    if (!checklistContainer) return;

    if (rutinaDiariaTareas.length === 0) {
        checklistContainer.innerHTML = `<p class="text-zinc-500 text-xs italic">No hay tareas de rutina programadas para hoy.</p>`;
        return;
    }

    checklistContainer.innerHTML = rutinaDiariaTareas.map(tarea => {
        const isCompleted = rutinaCompletadaIds.has(tarea.id_tarea);
        return `
            <div class="glass-card p-3 rounded-lg border ${isCompleted ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-zinc-800'} flex items-center justify-between gap-3">
                <div class="flex-1">
                    <p class="text-xs font-bold ${isCompleted ? 'text-emerald-400 line-through' : 'text-white'}">${tarea.descripcion}</p>
                    <p class="text-[9px] text-zinc-500 uppercase">${tarea.sistema} - ${tarea.equipo}</p>
                </div>
                <div class="flex items-center gap-2">
                    ${!isCompleted ? `
                    <button onclick="window.reportarHallazgoEnRutina('${encodeURIComponent(JSON.stringify(tarea))}')" class="bg-red-600/20 text-red-400 text-[9px] font-bold px-2 py-2 rounded-lg border border-red-500/30 hover:bg-red-500 hover:text-white transition-all">
                        <i class="fas fa-exclamation-triangle"></i>
                    </button>
                    <button onclick="window.marcarRutinaOK('${tarea.id_tarea}', this)" class="bg-zinc-700 text-white text-[9px] font-bold px-3 py-2 rounded-lg border border-zinc-600 hover:bg-emerald-600 transition-all">
                        OK
                    </button>
                    ` : `
                    <span class="text-emerald-500 text-lg"><i class="fas fa-check-circle"></i></span>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

window.marcarRutinaOK = async (tareaId, button) => {
    if (rutinaCompletadaIds.has(tareaId)) return;

    setButtonLoading(button, true, 'OK');
    try {
        const fechaHoyStr = new Date().toISOString().split('T')[0];
        await addDoc(collection(db, "log_rutinas"), {
            edificioId: edificioIdGlobal,
            tecnicoId: auth.currentUser.uid,
            tecnicoNombre: auth.currentUser.displayName || "Técnico",
            tareaId: tareaId,
            fechaCompletado: fechaHoyStr,
            timestamp: serverTimestamp(),
            status: 'ok',
            novedad: false
        });

        rutinaCompletadaIds.add(tareaId);
        renderizarChecklist(); // Re-render to show completion
        showToast("Tarea de rutina completada.", false);

    } catch (error) {
        console.error("Error al marcar rutina:", error);
        showToast("Error al guardar. Intenta de nuevo.", true);
        setButtonLoading(button, false, 'OK');
    }
};

// --- PASO 1: DIAGNÓSTICO ---
window.enviarDiagnostico = async () => {
    const diag = document.getElementById("diagInput").value.trim();
    const file = document.getElementById("fileAntes").files[0];
    const btn = document.querySelector('#step1 button[onclick="enviarDiagnostico()"]');
    const originalText = btn.innerHTML;

    if(!diag || !file) return showToast("Falta diagnóstico o foto inicial.", true);

    setButtonLoading(btn, true);
    try {
        showToast("Subiendo diagnóstico...");
        const path = `evidencias/${ordenId}/antes_${Date.now()}.jpg`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const urlAntes = await getDownloadURL(storageRef);

        await updateDoc(doc(db, "servicios_b2b", ordenId), {
            diagnostico_inicial: diag,
            foto_antes: urlAntes,
            status: "en_proceso",
            fecha_diagnostico: serverTimestamp()
        });

        showToast("Diagnóstico subido con éxito.", false);
        document.getElementById("step1").classList.add("step-inactive");
        document.getElementById("step2").classList.remove("step-inactive");
    } catch (e) {
        showToast("Error al subir diagnóstico. Reintenta.", true);
    } finally {
        setButtonLoading(btn, false, originalText);
    }
};

// --- PASO 2: INSUMOS ---
window.agregarMaterial = () => {
    const nombre = document.getElementById("mat-nombre").value.trim();
    const cantidad = document.getElementById("mat-cantidad").value;

    if(!nombre || !cantidad) return;

    const item = { nombre, cantidad, id: Date.now() };
    MaterialesTemporales.push(item);
    renderizarMateriales();
    document.getElementById("mat-nombre").value = "";
    document.getElementById("mat-cantidad").value = "";
};

function renderizarMateriales() {
    const lista = document.getElementById("lista-materiales-acumulados");
    lista.innerHTML = MaterialesTemporales.map(m => `
        <div class="flex justify-between items-center bg-zinc-900 p-2 rounded-lg border border-white/5 text-[9px]">
            <span>${m.cantidad}x <b>${m.nombre}</b></span>
            <button onclick="removerMaterial(${m.id})" class="text-red-500"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
}

window.removerMaterial = (id) => {
    MaterialesTemporales = MaterialesTemporales.filter(m => m.id !== id);
    renderizarMateriales();
};

window.confirmarMateriales = async () => {
    const btn = document.querySelector('#step2 button[onclick="confirmarMateriales()"]');
    const originalText = btn.innerHTML;
    setButtonLoading(btn, true);

    try {
        showToast("Guardando insumos...");
        // REGLA 3: El nombre del campo es 'materiales_utilizados'
        await updateDoc(doc(db, "servicios_b2b", ordenId), {
            materiales_utilizados: MaterialesTemporales
        });
        showToast("Insumos confirmados.", false);
        document.getElementById("step2").classList.add("step-inactive");
        document.getElementById("step3").classList.remove("step-inactive");
    } catch (e) { 
        showToast("Error al guardar materiales.", true);
    } finally {
        setButtonLoading(btn, false, originalText);
    }
};

// --- PASO 3: CIERRE ---
window.subirEvidenciaFinal = async () => {
    const file = document.getElementById("fileDespues").files[0];
    const obs = document.getElementById("obs-finales").value.trim();

    if(!file || !obs) return showToast("Falta la foto final o las notas de cierre.", true);

    const btn = document.getElementById("btnUploadDespues");
    const originalText = btn.innerHTML;
    setButtonLoading(btn, true);

    try {
        showToast("Subiendo evidencia final...");
        const path = `evidencias/${ordenId}/despues_${Date.now()}.jpg`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const urlDespues = await getDownloadURL(storageRef);

        await updateDoc(doc(db, "servicios_b2b", ordenId), {
            foto_despues: urlDespues,
            observaciones_finales: obs
        });

        showToast("Evidencia validada.", false);
        document.getElementById("step3").classList.add("step-inactive");
        document.getElementById("step4").classList.remove("step-inactive");
        initSignaturePad();
    } catch (e) { 
        showToast("Error al subir reporte final.", true);
    } finally {
        setButtonLoading(btn, false, originalText);
    }
};

// --- PASO 4: FIRMA ---
let hasFirmaDrawn = false; // Nueva bandera para optimizar la validación de la firma

function initSignaturePad() {
    canvas = document.getElementById("signaturePad");
    // Agregamos willReadFrequently para eliminar el warning de lectura de Canvas2D
    ctx = canvas.getContext("2d", { willReadFrequently: true });
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width;
    canvas.height = r.height;

    const start = (e) => { isDrawing = true; ctx.beginPath(); const p = getP(e); ctx.moveTo(p.x, p.y); };
    const draw = (e) => { 
        if(!isDrawing) return; 
        hasFirmaDrawn = true; // El técnico hizo un trazo, actualizamos la bandera
        const p = getP(e); 
        ctx.lineTo(p.x, p.y); 
        ctx.strokeStyle = "#10b981"; 
        ctx.lineWidth = 2; 
        ctx.stroke(); 
    };
    const stop = () => isDrawing = false;
    const getP = (e) => {
        const rect = canvas.getBoundingClientRect();
        const ex = e.touches ? e.touches[0].clientX : e.clientX;
        const ey = e.touches ? e.touches[0].clientY : e.clientY;
        // CORRECCIÓN: Cambiamos 'top' por 'rect.top'
        return { x: ex - rect.left, y: ey - rect.top };
    };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", draw);
    window.addEventListener("mouseup", stop);
    canvas.addEventListener("touchstart", start);
    canvas.addEventListener("touchmove", draw);
    canvas.addEventListener("touchend", stop);
}

window.clearSignature = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasFirmaDrawn = false; // Reseteamos la bandera si limpian el lienzo
};

window.finalizarOrden = async () => {
    const btn = document.querySelector('#step4 button[onclick="finalizarOrden()"]');
    const originalText = btn.innerHTML;
    setButtonLoading(btn, true);

    try {
        // Validamos usando la bandera en lugar de escanear los pixeles
        if (!hasFirmaDrawn) {
            throw new Error("La firma de conformidad es obligatoria.");
        }

        const uid = auth.currentUser?.uid;
        if (!uid) throw new Error("Usuario no autenticado.");
        const userDoc = await getDoc(doc(db, "users", uid));
        if (!userDoc.exists()) throw new Error("Perfil de usuario no encontrado.");

        const nombreTecnico = userDoc.data().nombre || "Técnico";

        const firmaData = canvas.toDataURL("image/png");
        const storageRef = ref(storage, `firmas/${ordenId}.png`);
        const blob = await (await fetch(firmaData)).blob();
        await uploadBytes(storageRef, blob);
        const firmaUrl = await getDownloadURL(storageRef);

        await updateDoc(doc(db, "servicios_b2b", ordenId), {
            status: "finalizado",
            firma_conformidad: firmaUrl,
            fecha_cierre: serverTimestamp()
        });

        // 📊 INYECCIÓN A BITÁCORA CON REGLAS DE NEGOCIO
        await addDoc(collection(db, "bitacora_edificios"), {
            edificioId: edificioIdGlobal, // REFACTOR 1: Usar ID dinámico
            servicioId: ordenId,
            fecha: serverTimestamp(), // REFACTOR 2: Usar Sello de Tiempo del Servidor
            tecnico: nombreTecnico,
            tecnico_uid: uid,
            resumen: document.getElementById("obs-finales").value,
            materiales_utilizados: MaterialesTemporales // REFACTOR 3: Añadir consistencia de insumos
        });

        showToast(`Bitácora de ${edificioIdGlobal.toUpperCase()} actualizada.`);
        window.location.reload();
    } catch (e) {
        console.error("Error al cerrar bitácora:", e);
        showToast(e.message || "Error al cerrar bitácora. Reintenta.", true);
    } finally {
        setButtonLoading(btn, false, originalText);
    }
};

window.previewImg = (input, divId) => {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById(divId).innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover rounded-xl">`;
        };
        reader.readAsDataURL(file);
    }
};

window.reportarHallazgoEnRutina = async (tareaString) => {
    const tarea = JSON.parse(decodeURIComponent(tareaString));
    if (!confirm(`¿Deseas reportar un hallazgo para la tarea "${tarea.descripcion}"?\n\nEsto creará una nueva orden de trabajo correctiva que deberás atender.`)) return;

    try {
        // Create a new reactive ticket from the routine task
        const newTicket = {
            edificioId: edificioIdGlobal,
            edificioNombre: "Uxmal 39", // This should be dynamic if possible
            ubicacion_especifica: tarea.ubicacion,
            descripcion: `HALLAZGO EN RUTINA: ${tarea.descripcion}`,
            prioridad: tarea.prioridad || 'media',
            tecnicoId: auth.currentUser.uid, // Pre-assign to self
            status: "en_proceso", // Start directly in process
            fecha_programada: new Date().toISOString().split('T')[0],
            equipo_nombre: tarea.equipo,
            tipo: "correctivo_de_rutina",
            fecha_creacion: serverTimestamp(),
            creado_por: auth.currentUser.uid,
            origen_rutina_id: tarea.id_tarea
        };

        const docRef = await addDoc(collection(db, "servicios_b2b"), newTicket);
        showToast("Orden correctiva creada. Completa el diagnóstico.", false);

        // Mark the routine task as "reported"
        const fechaHoyStr = new Date().toISOString().split('T')[0];
        await addDoc(collection(db, "log_rutinas"), {
            edificioId: edificioIdGlobal,
            tecnicoId: auth.currentUser.uid,
            tecnicoNombre: auth.currentUser.displayName || "Técnico",
            tareaId: tarea.id_tarea,
            fechaCompletado: fechaHoyStr,
            timestamp: serverTimestamp(),
            status: 'reportado',
            novedada: true,
            servicio_b2b_id: docRef.id
        });

        // Redirect to the new ticket flow
        window.location.href = `?id=${docRef.id}`;

    } catch (error) {
        console.error("Error reportando hallazgo:", error);
        showToast("Error al crear la orden correctiva.", true);
    }
};

window.finalizarRutinaDiaria = async () => {
    const totalTareas = rutinaDiariaTareas.length;
    const completadas = rutinaCompletadaIds.size;

    if (completadas < totalTareas) {
        alert(`Aún no has completado toda la rutina. Faltan ${totalTareas - completadas} tareas.`);
        return;
    }

    if (!confirm("¿Confirmas el cierre de la bitácora de rutina preventiva de hoy?")) return;

    const btn = document.getElementById('btnFinalizarRutina');
    setButtonLoading(btn, true, 'FINALIZAR...');

    try {
        // TAREA 3: Generate logbook entry
        await addDoc(collection(db, "bitacora_edificios"), {
            edificioId: edificioIdGlobal,
            servicioId: `RUTINA-${new Date().toISOString().split('T')[0]}`,
            fecha: serverTimestamp(),
            tecnico: auth.currentUser.displayName || "Técnico",
            tecnico_uid: auth.currentUser.uid,
            resumen: `Rutina Preventiva Diaria completada al 100% (${completadas}/${totalTareas}). Sin novedades reportadas directamente desde el checklist.`,
            tipo: "RUTINA_PREVENTIVA"
        });

        showToast("Bitácora de rutina cerrada con éxito.", false);
        btn.innerHTML = '<i class="fas fa-check-circle"></i> RUTINA CERRADA';
        btn.disabled = true;

    } catch (error) {
        console.error("Error al finalizar rutina:", error);
        showToast("Error al cerrar la bitácora de rutina.", true);
        setButtonLoading(btn, false, 'FINALIZAR Y CERRAR BITÁCORA DE RUTINA');
    }
};
