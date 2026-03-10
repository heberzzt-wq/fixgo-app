/**
 * GESTIA PREMIUM - V5.18
 * PROYECTO: Uxmal 39
 * TÉCNICO: Jonathan
 * ENTRELAZADO: Bitácora Maestra + Insumos + Historial de Activo
 */

import { 
    auth, db, storage, observarAuth,
    doc, updateDoc, collection, onSnapshot, query, where, addDoc, serverTimestamp, getDoc, getDocs, orderBy, limit 
} from "./firebase.js";

// Funciones de Storage desde CDN para evitar colisiones con tu firebase.js modular
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

let ordenId = new URLSearchParams(window.location.search).get("id"); 
let userGlobal = null;
let canvas, ctx, isDrawing = false;
let MaterialesTemporales = [];
const EDIFICIO_ID = "uxmal-39";

// --- 1. ENTRELAZADO INICIAL (VALIDACIÓN DE PERMISOS) ---
observarAuth((user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    
    // El "Permission Error" ocurre si intentamos leer sin validar el rol de Jonathan
    if (user.rol !== 'tecnico' && user.rol !== 'admin') {
        alert("Acceso restringido: Solo técnicos certificados.");
        window.location.href = "index.html";
        return;
    }

    userGlobal = user;
    console.log("Jonathan validado:", userGlobal.email);

    if (ordenId) {
        activarFlujo(ordenId);
    } else {
        cargarTareasUxmal();
    }
});

// --- 2. MOTOR DE BITÁCORA (QUERY AL PLAN ANUAL) ---
function cargarTareasUxmal() {
    const contenedor = document.getElementById("contenedor-tareas-diarias");
    const hoy = new Date().toISOString().split('T')[0];

    // Consulta alineada con las reglas de seguridad: filtro por edificio y estatus
    const q = query(
        collection(db, "servicios_b2b"),
        where("edificioId", "==", EDIFICIO_ID),
        where("fecha_programada", "==", hoy),
        where("status", "in", ["programado", "en_proceso"])
    );

    onSnapshot(q, (snapshot) => {
        contenedor.innerHTML = '';
        document.getElementById("contadorTareas").innerText = `${snapshot.size} PENDIENTES`;

        if (snapshot.empty) {
            contenedor.innerHTML = `
                <div class="p-10 text-center glass-card rounded-2xl border border-dashed border-zinc-800">
                    <p class="text-[10px] text-zinc-500 font-bold uppercase tracking-widest text-balance">
                        No hay mantenimientos programados para Uxmal 39 en esta fecha.
                    </p>
                </div>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;
            const card = document.createElement("div");
            card.className = "p-5 glass-card rounded-2xl border border-white/5 flex justify-between items-center animate-in slide-in-from-right duration-300";
            card.innerHTML = `
                <div>
                    <h4 class="text-sm font-black italic text-emerald-500">${t.equipo_nombre}</h4>
                    <p class="text-[10px] text-zinc-500 font-bold uppercase">${t.ubicacion_especifica}</p>
                    <div class="mt-2 flex gap-1">
                        <span class="text-[8px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded font-black uppercase tracking-tighter">${t.tipo_mantenimiento || 'Preventivo'}</span>
                    </div>
                </div>
                <button onclick="seleccionarTarea('${id}')" class="bg-emerald-500 text-black text-[10px] font-black px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">INICIAR</button>
            `;
            contenedor.appendChild(card);
        });
    }, (error) => {
        console.error("Error en bitácora:", error);
        // Si el error persiste, es una regla de Firestore que bloquea la lectura
        if(error.code === 'permission-denied') {
            contenedor.innerHTML = `<p class="text-[9px] text-red-400 p-4 text-center">Error de Permisos: Verifica el rol en la DB.</p>`;
        }
    });
}

window.seleccionarTarea = (id) => {
    ordenId = id;
    activarFlujo(id);
};

async function activarFlujo(id) {
    document.getElementById("listaTareasHoy").classList.add("hidden");
    document.getElementById("flujoTecnico").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // CARGAR HISTORIAL DEL ACTIVO (Entrelazado de Bitácoras)
    cargarHistorialActivo(id);
}

// --- 3. HISTORIAL DE FALLAS Y REPARACIONES (PARA JONATHAN) ---
async function cargarHistorialActivo(id) {
    const histDiv = document.getElementById("logPrevio");
    try {
        const servDoc = await getDoc(doc(db, "servicios_b2b", id));
        if (servDoc.exists()) {
            const equipoId = servDoc.data().equipo_id;
            // Buscamos los últimos 3 servicios de este mismo equipo
            const q = query(
                collection(db, "bitacora_edificios"),
                where("equipoId", "==", equipoId),
                orderBy("fecha", "desc"),
                limit(3)
            );
            const snap = await getDocs(q);
            if (snap.empty) {
                histDiv.innerHTML = "Sin registros previos. Equipo nuevo o primera vez en sistema.";
            } else {
                histDiv.innerHTML = snap.docs.map(d => `• ${d.data().resumen}`).join('<br>');
            }
        }
    } catch (e) { console.warn("No se pudo cargar historial:", e); }
}

// --- 4. PASO 1: ENVIAR DIAGNÓSTICO ---
window.enviarDiagnostico = async () => {
    const diag = document.getElementById("diagInput").value.trim();
    const file = document.getElementById("fileAntes").files[0];

    if(!diag || !file) return alert("Jonathan, falta el reporte visual o escrito.");

    try {
        const path = `evidencias/uxmal39/${ordenId}/antes.jpg`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        await updateDoc(doc(db, "servicios_b2b", ordenId), {
            diagnostico_inicial: diag,
            foto_antes: url,
            status: "en_diagnostico",
            tecnico_nombre: userGlobal.nombre,
            fecha_inicio: serverTimestamp()
        });

        document.getElementById("step1").classList.add("step-inactive");
        document.getElementById("step2").classList.remove("step-inactive");
    } catch (e) { alert("Error al subir diagnóstico."); }
};

// --- 5. PASO 2: GESTIÓN DE MATERIALES ---
window.agregarMaterial = () => {
    const nom = document.getElementById("mat-nombre").value.trim();
    const cant = document.getElementById("mat-cantidad").value;
    if(!nom || !cant) return;

    const item = { nombre: nom, cantidad: cant, id: Date.now() };
    MaterialesTemporales.push(item);
    renderMateriales();
    document.getElementById("mat-nombre").value = "";
    document.getElementById("mat-cantidad").value = "";
};

function renderMateriales() {
    const lista = document.getElementById("lista-materiales-acumulados");
    lista.innerHTML = MaterialesTemporales.map(m => `
        <div class="flex justify-between items-center bg-zinc-900 p-3 rounded-xl border border-white/5 text-[10px] animate-in zoom-in duration-200">
            <span><b class="text-emerald-500">${m.cantidad}x</b> ${m.nombre}</span>
            <button onclick="removerMaterial(${m.id})" class="text-red-400 px-2"><i class="fas fa-trash-alt"></i></button>
        </div>
    `).join('');
}

window.removerMaterial = (id) => {
    MaterialesTemporales = MaterialesTemporales.filter(m => m.id !== id);
    renderMateriales();
};

window.confirmarMateriales = async () => {
    try {
        await updateDoc(doc(db, "servicios_b2b", ordenId), {
            insumos_bitacora: MaterialesTemporales
        });
        document.getElementById("step2").classList.add("step-inactive");
        document.getElementById("step3").classList.remove("step-inactive");
    } catch (e) { alert("Error en el registro de insumos."); }
};

// --- 6. PASO 3: REPORTE FINAL ---
window.subirEvidenciaFinal = async () => {
    const file = document.getElementById("fileDespues").files[0];
    const obs = document.getElementById("obs-finales").value.trim();

    if(!file || !obs) return alert("Captura el resultado y añade observaciones.");

    try {
        const path = `evidencias/uxmal39/${ordenId}/despues.jpg`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        await updateDoc(doc(db, "servicios_b2b", ordenId), {
            foto_despues: url,
            observaciones_finales: obs,
            status: "esperando_firma"
        });

        document.getElementById("step3").classList.add("step-inactive");
        document.getElementById("step4").classList.remove("step-inactive");
        initSignature();
    } catch (e) { alert("Error al subir reporte final."); }
};

// --- 7. PASO 4: FIRMA Y CIERRE ---
function initSignature() {
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
        const storageRef = ref(storage, `firmas/uxmal39/${ordenId}.png`);
        const blob = await (await fetch(firmaData)).blob();
        await uploadBytes(storageRef, blob);
        const firmaUrl = await getDownloadURL(storageRef);

        // Actualización de la orden
        await updateDoc(doc(db, "servicios_b2b", ordenId), {
            status: "completado",
            firma_tecnico: firmaUrl,
            fecha_finalizacion: serverTimestamp()
        });

        // INYECCIÓN EN BITÁCORA MAESTRA (PARA JORGE)
        await addDoc(collection(db, "bitacora_edificios"), {
            edificioId: EDIFICIO_ID,
            servicioId: ordenId,
            fecha: new Date().toISOString(),
            tecnico: userGlobal.nombre,
            resumen: document.getElementById("obs-finales").value,
            materiales_usados: MaterialesTemporales.length
        });

        alert("🏆 BITÁCORA DE UXMAL 39 CERRADA. ¡Buen trabajo Jonathan!");
        window.location.reload();
    } catch (e) { alert("Error al cerrar bitácora."); }
};

// Utils: Preview
window.previewImg = (input, divId) => {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById(divId).innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">`;
        };
        reader.readAsDataURL(file);
    }
};
