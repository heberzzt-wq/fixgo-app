/**
 * GESTIA PREMIUM - V5.18
 * MOTOR DE OPERACIONES B2B (Uxmal 39)
 * FIX: Sincronización de Colección y Funciones de Storage
 */

// 1. IMPORTAR DESDE TU FIREBASE.JS (SINGLE SOURCE OF TRUTH)
import { 
    auth, db, storage, observarAuth, 
    doc, updateDoc, collection, onSnapshot, query, where, addDoc, serverTimestamp 
} from "./firebase.js";

// 2. IMPORTAR STORAGE FUNCTIONS (Ya que no están en tu firebase.js export)
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// ESTADO GLOBAL
let ordenId = new URLSearchParams(window.location.search).get("id"); 
let canvas, ctx, isDrawing = false;
let MaterialesTemporales = [];
const EDIFICIO_ID = "uxmal-39";

// --- INICIALIZACIÓN BLINDADA ---
observarAuth((user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    
    console.log("Jonathan autenticado en Uxmal 39:", user.email);

    if (ordenId) {
        activarFlujoTrabajo();
    } else {
        cargarTareasProgramadas();
    }
});

// --- CARGA DE TAREAS ---
function cargarTareasProgramadas() {
    const contenedor = document.getElementById("contenedor-tareas-diarias");
    const hoy = new Date().toISOString().split('T')[0];

    // FIX: Usamos db importado para garantizar la instancia correcta de Firestore
    const q = query(
        collection(db, "servicios_b2b"),
        where("edificioId", "==", EDIFICIO_ID),
        where("fecha_programada", "==", hoy),
        where("status", "in", ["programado", "en_proceso"])
    );

    onSnapshot(q, (snapshot) => {
        contenedor.innerHTML = '';
        if (snapshot.empty) {
            contenedor.innerHTML = `<div class="p-8 text-center text-zinc-600 text-[10px] font-bold uppercase tracking-widest border border-dashed border-zinc-800 rounded-2xl">No hay mantenimientos hoy en Uxmal 39</div>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const tarea = docSnap.data();
            const id = docSnap.id;
            const div = document.createElement("div");
            div.className = "p-4 glass-card rounded-xl border border-white/5 flex justify-between items-center";
            div.innerHTML = `
                <div>
                    <h4 class="text-sm font-black italic text-emerald-500">${tarea.equipo_nombre || 'Mantenimiento'}</h4>
                    <p class="text-[9px] text-zinc-500 uppercase font-bold tracking-tighter">${tarea.ubicacion_especifica || 'General'}</p>
                </div>
                <button onclick="seleccionarTarea('${id}')" class="bg-emerald-500 text-black text-[9px] font-black px-4 py-2 rounded-lg shadow-lg shadow-emerald-500/20">EJECUTAR</button>
            `;
            contenedor.appendChild(div);
        });
    }, (error) => {
        console.error("Error en bitácora:", error);
    });
}

window.seleccionarTarea = (id) => {
    ordenId = id;
    activarFlujoTrabajo();
};

function activarFlujoTrabajo() {
    document.getElementById("listaTareasHoy").classList.add("hidden");
    document.getElementById("flujoTecnico").classList.remove("hidden");
}

// --- PASO 1: DIAGNÓSTICO ---
window.enviarDiagnostico = async () => {
    const diag = document.getElementById("diagInput").value.trim();
    const file = document.getElementById("fileAntes").files[0];

    if(!diag || !file) return alert("Jonathan, el diagnóstico y la foto son obligatorios.");

    try {
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

        document.getElementById("step1").classList.add("step-inactive");
        document.getElementById("step2").classList.remove("step-inactive");
    } catch (e) { alert("Error al conectar con la bitácora."); }
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
        <div class="flex justify-between items-center bg-zinc-900 p-2 rounded-lg border border-white/5 text-[9px] mb-1">
            <span>${m.cantidad}x <b>${m.nombre}</b></span>
            <button onclick="removerMaterial(${m.id})" class="text-red-500 px-2"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
}

window.removerMaterial = (id) => {
    MaterialesTemporales = MaterialesTemporales.filter(m => m.id !== id);
    renderizarMateriales();
};

window.confirmarMateriales = async () => {
    try {
        await updateDoc(doc(db, "servicios_b2b", ordenId), {
            materiales_utilizados: MaterialesTemporales
        });
        document.getElementById("step2").classList.add("step-inactive");
        document.getElementById("step3").classList.remove("step-inactive");
    } catch (e) { alert("Error al guardar materiales."); }
};

// --- PASO 3: CIERRE ---
window.subirEvidenciaFinal = async () => {
    const file = document.getElementById("fileDespues").files[0];
    const obs = document.getElementById("obs-finales").value.trim();

    if(!file || !obs) return alert("Falta la foto final y las observaciones.");

    try {
        const path = `evidencias/${ordenId}/despues_${Date.now()}.jpg`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const urlDespues = await getDownloadURL(storageRef);

        await updateDoc(doc(db, "servicios_b2b", ordenId), {
            foto_despues: urlDespues,
            observaciones_finales: obs
        });

        document.getElementById("step3").classList.add("step-inactive");
        document.getElementById("step4").classList.remove("step-inactive");
        initSignaturePad();
    } catch (e) { alert("Fallo al subir evidencia."); }
};

// --- PASO 4: FIRMA ---
function initSignaturePad() {
    canvas = document.getElementById("signaturePad");
    ctx = canvas.getContext("2d");
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width;
    canvas.height = r.height;

    const getP = (e) => {
        const rect = canvas.getBoundingClientRect();
        const ex = e.touches ? e.touches[0].clientX : e.clientX;
        const ey = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: ex - rect.left, y: ey - rect.top };
    };

    const start = (e) => { isDrawing = true; ctx.beginPath(); const p = getP(e); ctx.moveTo(p.x, p.y); e.preventDefault(); };
    const draw = (e) => { if(!isDrawing) return; const p = getP(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle = "#10b981"; ctx.lineWidth = 2; ctx.stroke(); e.preventDefault(); };
    const stop = () => isDrawing = false;

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", draw);
    window.addEventListener("mouseup", stop);
    canvas.addEventListener("touchstart", start, {passive:false});
    canvas.addEventListener("touchmove", draw, {passive:false});
    canvas.addEventListener("touchend", stop);
}

window.clearSignature = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

window.finalizarOrden = async () => {
    try {
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

        await addDoc(collection(db, "bitacora_edificios"), {
            edificioId: EDIFICIO_ID,
            servicioId: ordenId,
            fecha: new Date().toISOString(),
            tecnico: "Jonathan",
            resumen: document.getElementById("obs-finales").value,
            materiales: MaterialesTemporales.length
        });

        alert("🏆 BITÁCORA DE UXMAL 39 ACTUALIZADA CON ÉXITO.");
        window.location.reload();
    } catch (e) { alert("Error al cerrar bitácora."); }
};

// Utils: Preview de imagen
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
