import { auth, db, storage, doc, updateDoc, ref, uploadBytes, getDownloadURL, serverTimestamp, collection, query, where, onSnapshot, addDoc } from "./firebase.js";

/**
 * GESTIA PREMIUM - V5.18
 * MOTOR DE OPERACIONES B2B (Uxmal 39)
 * REESCRITURA: Integración de Bitácora y Gestión de Insumos
 */

let ordenId = new URLSearchParams(window.location.search).get("id"); 
let canvas, ctx, isDrawing = false;
let MaterialesTemporales = [];
const EDIFICIO_ID = "uxmal-39"; // Contexto Uxmal 39 para Jonathan

// 1. INICIALIZAR APP Y OBSERVAR ESTADO
auth.onAuthStateChanged(user => {
    if(!user) return window.location.href = "login.html";
    
    // Si viene de un link directo (QR o Notificación)
    if(ordenId) {
        document.getElementById("listaTareasHoy").classList.add("hidden");
        document.getElementById("flujoTecnico").classList.remove("hidden");
        cargarDetallesOrden();
    } else {
        // Si entra al panel general, cargar tareas de Jorge
        cargarTareasProgramadas();
    }
});

// 2. CARGAR TAREAS DEL PROGRAMA ANUAL (PARA JONATHAN)
function cargarTareasProgramadas() {
    const contenedor = document.getElementById("contenedor-tareas-diarias");
    const hoy = new Date().toISOString().split('T')[0];

    const q = query(
        collection(db, "servicios_b2b"),
        where("edificioId", "==", EDIFICIO_ID),
        where("fecha_programada", "==", hoy),
        where("status", "in", ["programado", "en_proceso"])
    );

    onSnapshot(q, (snapshot) => {
        contenedor.innerHTML = '';
        if (snapshot.empty) {
            contenedor.innerHTML = `<div class="p-8 text-center text-zinc-600 text-xs font-bold uppercase tracking-widest border border-dashed border-zinc-800 rounded-2xl">No hay tareas pendientes para hoy</div>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const tarea = docSnap.data();
            const id = docSnap.id;
            const div = document.createElement("div");
            div.className = "p-4 glass-card rounded-xl border border-white/5 flex justify-between items-center";
            div.innerHTML = `
                <div>
                    <h4 class="text-sm font-black italic">${tarea.equipo_nombre || 'Mantenimiento'}</h4>
                    <p class="text-[10px] text-zinc-500 uppercase">${tarea.ubicacion_especifica || 'Área Común'}</p>
                </div>
                <button onclick="seleccionarTarea('${id}')" class="bg-emerald-500 text-black text-[10px] font-black px-4 py-2 rounded-lg">EJECUTAR</button>
            `;
            contenedor.appendChild(div);
        });
    });
}

window.seleccionarTarea = (id) => {
    ordenId = id;
    document.getElementById("listaTareasHoy").classList.add("hidden");
    document.getElementById("flujoTecnico").classList.remove("hidden");
    cargarDetallesOrden();
};

async function cargarDetallesOrden() {
    console.log("Iniciando flujo para orden:", ordenId);
    // Aquí se podrían pintar datos dinámicos en el Header si fuera necesario
}

// 3. PASO 1: ENVIAR DIAGNÓSTICO (Con validación de foto inicial)
window.enviarDiagnostico = async () => {
    const diag = document.getElementById("diagInput").value.trim();
    const file = document.getElementById("fileAntes").files[0];

    if(!diag) return alert("Jonathan, describe el estado del equipo para la bitácora.");
    if(!file) return alert("La foto de diagnóstico es obligatoria para Jorge.");

    try {
        // Subir foto inicial primero
        const path = `evidencias/${ordenId}/antes_${Date.now()}.jpg`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const urlAntes = await getDownloadURL(storageRef);

        await updateDoc(doc(db, "servicios_b2b", ordenId), {
            diagnostico_inicial: diag,
            foto_antes: urlAntes,
            status: "en_diagnostico",
            fecha_diagnostico: serverTimestamp()
        });

        document.getElementById("step1").classList.add("step-inactive");
        document.getElementById("step2").classList.remove("step-inactive");
        alert("📋 Diagnóstico y Foto registrados. Procede con los insumos.");
    } catch (e) { 
        console.error(e);
        alert("Error al subir diagnóstico. Revisa tu conexión."); 
    }
};

// 4. PASO 2: GESTIÓN DE INSUMOS Y REFACCIONES
window.agregarMaterial = () => {
    const nombre = document.getElementById("mat-nombre").value.trim();
    const cantidad = document.getElementById("mat-cantidad").value;

    if(!nombre || !cantidad) return alert("Ingresa material y cantidad.");

    const item = { nombre, cantidad, id: Date.now() };
    MaterialesTemporales.push(item);
    renderizarMateriales();

    // Limpiar campos
    document.getElementById("mat-nombre").value = "";
    document.getElementById("mat-cantidad").value = "";
};

function renderizarMateriales() {
    const lista = document.getElementById("lista-materiales-acumulados");
    if(MaterialesTemporales.length === 0) {
        lista.innerHTML = `<p class="text-[10px] text-zinc-600 italic text-center">Sin materiales registrados aún</p>`;
        return;
    }

    lista.innerHTML = MaterialesTemporales.map(m => `
        <div class="flex justify-between items-center bg-zinc-900/50 p-2 rounded-lg border border-white/5 text-[10px]">
            <span class="text-zinc-300 font-bold">${m.cantidad}x <span class="text-white">${m.nombre}</span></span>
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
            materiales_utilizados: MaterialesTemporales,
            status: "en_ejecucion"
        });
        document.getElementById("step2").classList.add("step-inactive");
        document.getElementById("step3").classList.remove("step-inactive");
    } catch (e) { alert("Error al guardar materiales."); }
};

// 5. PASO 3: SUBIR EVIDENCIA FINAL (DESPUÉS)
window.subirEvidenciaFinal = async () => {
    const file = document.getElementById("fileDespues").files[0];
    const obs = document.getElementById("obs-finales").value.trim();

    if(!file) return alert("Captura el resultado final del trabajo.");
    if(!obs) return alert("Añade una nota final para la bitácora del edificio.");

    const btn = document.getElementById("btnUploadDespues");
    btn.innerText = "SUBIENDO REPORTE...";
    btn.disabled = true;

    try {
        const path = `evidencias/${ordenId}/despues_${Date.now()}.jpg`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const urlDespues = await getDownloadURL(storageRef);

        await updateDoc(doc(db, "servicios_b2b", ordenId), {
            foto_despues: urlDespues,
            observaciones_finales: obs,
            status: "esperando_firma"
        });

        document.getElementById("step3").classList.add("step-inactive");
        document.getElementById("step4").classList.remove("step-inactive");
        initSignaturePad();
    } catch (e) { 
        alert("Fallo al subir evidencia final."); 
        btn.innerText = "VALIDAR TRABAJO";
        btn.disabled = false;
    }
};

// 6. PASO 4: FIRMA DIGITAL Y CIERRE DE BITÁCORA
function initSignaturePad() {
    canvas = document.getElementById("signaturePad");
    ctx = canvas.getContext("2d");
    
    // Ajuste de resolución para móviles
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - r.left, y: clientY - r.top };
    };

    const start = (e) => { isDrawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); e.preventDefault(); };
    const draw = (e) => { if(!isDrawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle = "#10b981"; ctx.lineWidth = 2; ctx.stroke(); e.preventDefault(); };
    const stop = () => isDrawing = false;

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", draw);
    window.addEventListener("mouseup", stop);
    canvas.addEventListener("touchstart", start, {passive: false});
    canvas.addEventListener("touchmove", draw, {passive: false});
    canvas.addEventListener("touchend", stop);
}

window.clearSignature = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

window.finalizarOrden = async () => {
    const firmaData = canvas.toDataURL("image/png");
    
    try {
        const storageRef = ref(storage, `firmas/${ordenId}.png`);
        const blob = await (await fetch(firmaData)).blob();
        await uploadBytes(storageRef, blob);
        const firmaUrl = await getDownloadURL(storageRef);

        const fechaCierre = serverTimestamp();

        // 1. Cerrar la orden principal
        await updateDoc(doc(db, "servicios_b2b", ordenId), {
            status: "finalizado",
            firma_conformidad: firmaUrl,
            fecha_cierre: fechaCierre
        });

        // 2. Inyectar en la Bitácora Maestra del Edificio (Para Jorge)
        await addDoc(collection(db, "bitacora_edificios"), {
            edificioId: EDIFICIO_ID,
            servicioId: ordenId,
            fecha: new Date().toISOString(),
            tecnico: "Jonathan",
            tipo: "Mantenimiento Programado",
            resumen: document.getElementById("obs-finales").value,
            materiales_count: MaterialesTemporales.length
        });

        alert("🏆 ORDEN CERRADA Y BITÁCORA ACTUALIZADA. ¡Excelente labor!");
        window.location.reload(); // Reiniciar para nueva tarea
    } catch (e) { alert("Error crítico al cerrar bitácora."); }
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
