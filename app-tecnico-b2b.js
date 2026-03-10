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
    updateDoc,
    serverTimestamp,
    collection,
    query,
    where,
    onSnapshot,
    addDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ESTADO GLOBAL
let ordenId = new URLSearchParams(window.location.search).get("id");
let canvas, ctx, isDrawing = false;
let MaterialesTemporales = [];
// REFACTOR 1: La ID del edificio ahora es dinámica y se carga desde el perfil.
let edificioIdGlobal = null;

// --- INICIALIZACIÓN ---
auth.onAuthStateChanged(async (user) => {
    if(!user) return window.location.href = "login.html";

    // REFACTOR 1: Al inicio, obtenemos el ID del edificio desde el perfil del técnico.
    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().edificioId) {
            edificioIdGlobal = userDoc.data().edificioId;
            console.log(`🏢 Técnico autenticado para el edificio: ${edificioIdGlobal}`);
        } else {
            document.body.innerHTML = `<div class="p-8 text-center text-red-500 text-lg font-black">ERROR DE ACCESO: Tu perfil no está asignado a ningún edificio. Contacta a tu administrador.</div>`;
            alert("Error de perfil: No tienes un edificio B2B asignado.");
            return;
        }
    } catch (error) {
        console.error("Error crítico al obtener perfil:", error);
        alert("Error de conexión al verificar tu perfil. No se puede continuar.");
        return;
    }

    if(ordenId) {
        document.getElementById("listaTareasHoy").classList.add("hidden");
        document.getElementById("flujoTecnico").classList.remove("hidden");
    } else {
        cargarTareasProgramadas();
    }
});

// --- CARGA DE DATOS ---
function cargarTareasProgramadas() {
    const contenedor = document.getElementById("contenedor-tareas-diarias");
    const hoy = new Date().toISOString().split('T')[0];

    // REFACTOR 1: La consulta ahora usa la variable global dinámica.
    const q = query(
        collection(db, "servicios_b2b"),
        where("edificioId", "==", edificioIdGlobal),
        where("fecha_programada", "==", hoy),
        where("status", "in", ["programado", "en_proceso"])
    );

    onSnapshot(q, (snapshot) => {
        contenedor.innerHTML = '';
        if (snapshot.empty) {
            contenedor.innerHTML = `<div class="p-8 text-center text-zinc-600 text-[10px] font-bold uppercase tracking-widest border border-dashed border-zinc-800 rounded-2xl">${edificioIdGlobal.replace('-', ' ').toUpperCase()}: Sin pendientes hoy</div>`;
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
                    <p class="text-[9px] text-zinc-500 uppercase font-bold">${tarea.ubicacion_especifica || 'General'}</p>
                </div>
                <button onclick="seleccionarTarea('${id}')" class="bg-emerald-500 text-black text-[9px] font-black px-3 py-2 rounded-lg">INICIAR</button>
            `;
            contenedor.appendChild(div);
        });
    }, (error) => {
        console.error("Error en Snapshot:", error);
        contenedor.innerHTML = `<div class="p-4 text-red-500 text-center text-[10px]">Error de conexión con la bitácora</div>`;
    });
}

window.seleccionarTarea = (id) => {
    ordenId = id;
    document.getElementById("listaTareasHoy").classList.add("hidden");
    document.getElementById("flujoTecnico").classList.remove("hidden");
};

// --- PASO 1: DIAGNÓSTICO ---
window.enviarDiagnostico = async () => {
    const diag = document.getElementById("diagInput").value.trim();
    const file = document.getElementById("fileAntes").files[0];

    if(!diag || !file) return alert("Jonathan, falta diagnóstico o foto inicial.");

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
    } catch (e) {
        alert("Error al subir diagnóstico. Reintenta.");
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
    try {
        // REGLA 3: El nombre del campo es 'materiales_utilizados'
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

    if(!file || !obs) return alert("Falta la foto final o las notas de cierre.");

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
    } catch (e) { alert("Error al subir reporte final."); }
};

// --- PASO 4: FIRMA ---
function initSignaturePad() {
    canvas = document.getElementById("signaturePad");
    ctx = canvas.getContext("2d");
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width;
    canvas.height = r.height;

    const start = (e) => { isDrawing = true; ctx.beginPath(); const p = getP(e); ctx.moveTo(p.x, p.y); };
    const draw = (e) => { if(!isDrawing) return; const p = getP(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle = "#10b981"; ctx.lineWidth = 2; ctx.stroke(); };
    const stop = () => isDrawing = false;
    const getP = (e) => {
        const rect = canvas.getBoundingClientRect();
        const ex = e.touches ? e.touches[0].clientX : e.clientX;
        const ey = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: ex - rect.left, y: ey - rect.top };
    };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", draw);
    window.addEventListener("mouseup", stop);
    canvas.addEventListener("touchstart", start);
    canvas.addEventListener("touchmove", draw);
    canvas.addEventListener("touchend", stop);
}

window.clearSignature = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

window.finalizarOrden = async () => {
    try {
        const uid = auth.currentUser?.uid;
        if (!uid) return alert("❌ Error: Usuario no autenticado.");


        const userDoc = await getDoc(doc(db, "users", uid));
        if (!userDoc.exists()) {
            alert("❌ Error: Perfil de usuario no encontrado.");
            return;
        }

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

        alert(`🏆 BITÁCORA DE ${edificioIdGlobal.toUpperCase()} ACTUALIZADA.\n\nTécnico: ${nombreTecnico}\nPresione OK para continuar.`);
        window.location.reload();
    } catch (e) {
        console.error("❌ Error al cerrar bitácora:", e);
        alert("Error al cerrar bitácora. Reintenta.");
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
