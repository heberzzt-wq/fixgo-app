import { auth, db, storage, doc, updateDoc, ref, uploadBytes, getDownloadURL, serverTimestamp } from "./firebase.js";

let ordenId = new URLSearchParams(window.location.search).get("id"); // El ID llega por URL
let canvas, ctx, isDrawing = false;

// 1. INICIALIZAR APP
auth.onAuthStateChanged(user => {
    if(!user) return window.location.href = "login.html";
    if(ordenId) cargarDetallesOrden();
});

// 2. CARGAR DATOS DE LA ORDEN
async function cargarDetallesOrden() {
    // Aquí podrías usar onSnapshot para ver si el admin cancela la orden
    console.log("Cargando orden:", ordenId);
    // Lógica para pintar header...
}

// 3. PASO 1: ENVIAR DIAGNÓSTICO (Notifica al Cliente/Admin)
window.enviarDiagnostico = async () => {
    const diag = document.getElementById("diagInput").value.trim();
    if(!diag) return alert("Debes ingresar un diagnóstico.");

    try {
        await updateDoc(doc(db, "services", ordenId), {
            diagnostico: diag,
            status: "diagnostico_completado",
            fecha_diagnostico: serverTimestamp()
        });
        document.getElementById("step1").classList.add("step-inactive");
        document.getElementById("step2").classList.remove("step-inactive");
        alert("📋 Diagnóstico enviado. Procede con la foto ANTES.");
    } catch (e) { alert("Error al conectar con la red."); }
};

// 4. PASO 2 y 3: SUBIR EVIDENCIAS
window.subirEvidencia = async (tipo) => {
    const file = tipo === 'antes' ? 
        document.getElementById("fileAntes").files[0] : 
        document.getElementById("fileDespues").files[0];

    if(!file) return;

    const btn = tipo === 'antes' ? 
        document.getElementById("btnUploadAntes") : 
        document.getElementById("btnUploadDespues");

    btn.innerText = "SUBIENDO...";
    
    try {
        const path = `evidencias/${ordenId}/${tipo}_${Date.now()}.jpg`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        const updateData = {};
        updateData[`foto_${tipo}`] = url;
        if(tipo === 'despues') updateData.status = 'esperando_firma';

        await updateDoc(doc(db, "services", ordenId), updateData);

        if(tipo === 'antes') {
            document.getElementById("step2").classList.add("step-inactive");
            document.getElementById("step3").classList.remove("step-inactive");
        } else {
            document.getElementById("step3").classList.add("step-inactive");
            document.getElementById("step4").classList.remove("step-inactive");
            initSignaturePad();
        }
    } catch (e) { alert("Fallo al subir imagen."); }
};

// 5. PASO 4: FIRMA DIGITAL
function initSignaturePad() {
    canvas = document.getElementById("signaturePad");
    ctx = canvas.getContext("2d");
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX || e.touches[0].clientX) - rect.left,
            y: (e.clientY || e.touches[0].clientY) - rect.top
        };
    };

    const start = (e) => { isDrawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); };
    const draw = (e) => { if(!isDrawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle = "#10b981"; ctx.lineWidth = 3; ctx.stroke(); };
    const stop = () => isDrawing = false;

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", draw);
    window.addEventListener("mouseup", stop);
    canvas.addEventListener("touchstart", start);
    canvas.addEventListener("touchmove", draw);
    canvas.addEventListener("touchend", stop);
}

window.clearSignature = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

window.finalizarOrden = async () => {
    const firmaData = canvas.toDataURL("image/png");
    
    try {
        // Subir firma a Storage
        const storageRef = ref(storage, `firmas/${ordenId}.png`);
        const blob = await (await fetch(firmaData)).blob();
        await uploadBytes(storageRef, blob);
        const firmaUrl = await getDownloadURL(storageRef);

        await updateDoc(doc(db, "services", ordenId), {
            status: "finalizado",
            firma_cliente: firmaUrl,
            fecha_cierre: serverTimestamp()
        });

        alert("🏆 ORDEN CERRADA EXITOSAMENTE. ¡Buen trabajo!");
        window.location.href = "panel-tecnico.html";
    } catch (e) { alert("Error al cerrar orden."); }
};

// Utils: Preview de imagen
window.previewImg = (input, divId) => {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById(divId).innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">`;
            const btnId = divId === 'previewAntes' ? 'btnUploadAntes' : 'btnUploadDespues';
            document.getElementById(btnId).classList.remove("hidden");
        };
        reader.readAsDataURL(file);
    }
};
