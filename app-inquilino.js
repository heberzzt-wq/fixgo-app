/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - MÓDULO INQUILINO VIP (B2B)
 * ======================================================================================
 * Archivo: app-inquilino.js
 * Descripción: Comunicación directa entre el inquilino y el Staff de Uxmal 39.
 * REGLAS: NO COMPACTAR. CONSULTAS FILTRADAS POR EDIFICIOID PARA EVITAR BLOQUEOS.
 * ======================================================================================
 */

import { 
    auth, 
    db, 
    storage, // 📦 Mandamos llamar al Storage que ya exportas desde tu core
    doc, 
    getDoc, 
    onSnapshot, 
    collection, 
    addDoc, 
    serverTimestamp, 
    query, 
    where, 
    orderBy, 
    limit 
} from "./firebase.js";

// 🚀 Importamos las funciones tácticas de subida directo del CDN (Versión 10.8.0)
import { 
    ref, 
    uploadBytesResumable, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

let inquilinoContext = null;

// ======================================================
// 1. INICIALIZACIÓN Y SEGURIDAD DE ROL
// ======================================================
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    // Leemos el perfil para obtener el edificioId (Uxmal 39)
    const docSnap = await getDoc(doc(db, "users", user.uid));
    
    if (docSnap.exists()) {
        inquilinoContext = docSnap.data();
        
        // Verificación de seguridad: Si no es inquilino_b2b, lo sacamos por protección de datos
        if (inquilinoContext.rol !== "inquilino_b2b") {
            console.error("🛑 ACCESO NO AUTORIZADO: Este panel es exclusivo para Inquilinos B2B.");
            window.location.href = "index.html";
            return;
        }

        // Pintamos los datos básicos en la UI
        document.getElementById("lblNombreEdificio").innerText = (inquilinoContext.edificioNombre || "UXMAL 39").toUpperCase();
        document.getElementById("lblUnidad").innerText = inquilinoContext.unidad || "Oficina / Depto";

        // Activamos los radares de información
        escucharAnunciosEdificio(inquilinoContext.edificioId);
        escucharMisReportes(user.uid, inquilinoContext.edificioId);
    } else {
        console.warn("⚠️ Perfil no encontrado en Firestore.");
    }
});

// ======================================================
// 2. RADAR DE ANUNCIOS (ADMIN -> INQUILINO)
// ======================================================
function escucharAnunciosEdificio(edificioId) {
    const feed = document.getElementById("feedAnuncios");
    
    // Normalización B2B (Misma sintonía que usa el Megáfono del Staff)
    const edificioIdNormalizado = edificioId.toLowerCase().trim().replace(/\s+/g, '');
    
    // 📡 AJUSTE V5.32: Escuchar la colección correcta (anuncios_b2b) y ordenar por (fecha_publicacion)
    const q = query(
        collection(db, "anuncios_b2b"),
        where("edificioId", "==", edificioIdNormalizado),
        orderBy("fecha_publicacion", "desc"),
        limit(5)
    );

    onSnapshot(q, (snap) => {
        feed.innerHTML = "";
        
        if (snap.empty) {
            feed.innerHTML = `
                <div class="glass-card p-4 rounded-2xl">
                    <p class="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Sin avisos hoy</p>
                    <p class="text-xs text-zinc-500">Todo opera con normalidad en el edificio.</p>
                </div>`;
            return;
        }

        snap.forEach(docSnap => {
            const aviso = docSnap.data();
            const card = document.createElement("div");
            card.className = "glass-card p-4 rounded-2xl animate-feed mb-2 border-l-2 border-blue-500";
            
            let fecha = "Reciente";
            // AJUSTE: Leer el campo de tiempo correcto que genera el Megáfono
            if (aviso.fecha_publicacion) {
                fecha = new Date(aviso.fecha_publicacion.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            card.innerHTML = `
                <div class="flex justify-between items-start mb-1">
                    <p class="text-[9px] text-blue-400 font-black uppercase tracking-tighter">${fecha}</p>
                    <i class="fas fa-info-circle text-[10px] text-blue-500/50"></i>
                </div>
                <p class="text-sm text-white font-bold leading-tight">${aviso.titulo || 'Comunicado Oficial'}</p>
                <p class="text-xs text-zinc-400 mt-1">${aviso.mensaje || ''}</p>
            `;
            feed.appendChild(card);
        });
    });
}

// ======================================================
// 3. RADAR DE MIS REPORTES (STATUS DE FALLAS)
// ======================================================
function escucharMisReportes(uid, edificioId) {
    const lista = document.getElementById("listaMisReportes");

    // IMPORTANTE: Consulta cruzada por creador y edificio para seguridad total
    const q = query(
        collection(db, "servicios_b2b"),
        where("creado_por", "==", uid),
        where("edificioId", "==", edificioId),
        orderBy("fecha_creacion", "desc"),
        limit(10)
    );

    onSnapshot(q, (snap) => {
        lista.innerHTML = "";

        if (snap.empty) {
            lista.innerHTML = `<p class="text-center py-10 text-xs text-zinc-600 italic">No tienes reportes activos.</p>`;
            return;
        }

        snap.forEach(docSnap => {
            const ot = docSnap.data();
            const card = document.createElement("div");
            
            let colorStatus = "text-yellow-500";
            let bgStatus = "bg-yellow-500/10";
            if (ot.status === "finalizado") { colorStatus = "text-emerald-500"; bgStatus = "bg-emerald-500/10"; }
            if (ot.status === "en_proceso") { colorStatus = "text-blue-500"; bgStatus = "bg-blue-500/10"; }

            card.className = "glass-card p-4 rounded-2xl flex justify-between items-center border border-white/5";
            card.innerHTML = `
                <div>
                    <p class="text-xs font-black text-white uppercase">${ot.equipo || 'Incidencia'}</p>
                    <p class="text-[9px] text-zinc-500 mt-0.5">${ot.ubicacion_especifica || 'General'}</p>
                </div>
                <div class="${bgStatus} ${colorStatus} px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">
                    ${ot.status.replace('_', ' ')}
                </div>
            `;
            lista.appendChild(card);
        });
    });
}

// ======================================================
// 4. MOTOR DE ENVÍO DE INCIDENCIAS (B2B PURE) CON IMAGEN
// ======================================================
let archivoFotoSeleccionado = null;

// Lógica para abrir la cámara/galería
document.getElementById("btnSeleccionarFoto").addEventListener("click", () => {
    document.getElementById("inputFotoIncidencia").click();
});

// Lógica para manejar el archivo seleccionado
document.getElementById("inputFotoIncidencia").addEventListener("change", (e) => {
    const file = e.target.files[0];
    const lblBtn = document.getElementById("lblFotoBtn");
    const btn = document.getElementById("btnSeleccionarFoto");

    if (file) {
        archivoFotoSeleccionado = file;
        lblBtn.innerText = "Foto Lista";
        btn.classList.remove("text-zinc-400", "bg-zinc-800");
        btn.classList.add("text-blue-400", "bg-blue-900/30", "border", "border-blue-500/50");
    } else {
        archivoFotoSeleccionado = null;
        lblBtn.innerText = "Foto";
        btn.classList.add("text-zinc-400", "bg-zinc-800");
        btn.classList.remove("text-blue-400", "bg-blue-900/30", "border", "border-blue-500/50");
    }
});


window.abrirModalReporte = (tipo) => {
    document.getElementById("tipoReporte").value = tipo;
    document.getElementById("modalTitulo").innerText = tipo === 'mantenimiento' ? "REPORTAR FALLA" : "AVISO A CASETA";
    document.getElementById("modalReporte").classList.remove("hidden");
};

window.cerrarModal = () => {
    document.getElementById("modalReporte").classList.add("hidden");
    document.getElementById("formReporteB2B").reset();
    
    // Resetear el estado de la foto al cerrar
    archivoFotoSeleccionado = null;
    const btn = document.getElementById("btnSeleccionarFoto");
    document.getElementById("lblFotoBtn").innerText = "Foto";
    btn.classList.add("text-zinc-400", "bg-zinc-800");
    btn.classList.remove("text-blue-400", "bg-blue-900/30", "border", "border-blue-500/50");
};

document.getElementById("formReporteB2B").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    if (!inquilinoContext) return;

    const btn = document.getElementById("btnEnviarReporte");
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> ENVIANDO...';

    let urlFotoSubida = null;

    try {
        // 1. Si hay foto, la subimos primero a Firebase Storage
        if (archivoFotoSeleccionado) {
            btn.innerHTML = '<i class="fas fa-arrow-up fa-spin"></i> SUBIENDO FOTO...';
            
            // Creamos una ruta única: edificios/uxmal39/reportes/timestamp_nombrefile
            const rutaStorage = `edificios/${inquilinoContext.edificioId}/reportes/${Date.now()}_${archivoFotoSeleccionado.name}`;
            const storageRef = ref(storage, rutaStorage);
            
            // Subimos el archivo
            const uploadTask = await uploadBytesResumable(storageRef, archivoFotoSeleccionado);
            
            // Obtenemos el link público
            urlFotoSubida = await getDownloadURL(uploadTask.ref);
        }

        btn.innerHTML = '<i class="fas fa-paper-plane"></i> REGISTRANDO...';

        // 2. Armamos el payload con la URL de la foto (si existe)
        const payload = {
            edificioId: inquilinoContext.edificioId,
            edificioNombre: inquilinoContext.edificioNombre || "Uxmal 39",
            unidad: inquilinoContext.unidad || "S/N",
            creado_por: auth.currentUser.uid,
            inquilino_nombre: inquilinoContext.nombre || "Inquilino VIP",
            descripcion: document.getElementById("descIncidencia").value.trim(),
            prioridad: document.getElementById("prioridadIncidencia").value,
            tipo: document.getElementById("tipoReporte").value,
            equipo: document.getElementById("tipoReporte").value === 'mantenimiento' ? "Mantenimiento General" : "Aviso de Seguridad",
            status: "pendiente",
            fecha_creacion: serverTimestamp(),
            ubicacion_especifica: inquilinoContext.unidad || "Planta Local",
            fotoUrl: urlFotoSubida // Inyectamos la URL aquí. Si no hay foto, será null.
        };

        // 3. Inyectamos el reporte en Firestore
        await addDoc(collection(db, "servicios_b2b"), payload);
        
        alert("✅ Reporte enviado al Staff. Jonathan o Jessica lo atenderán a la brevedad.");
        window.cerrarModal();

    } catch (error) {
        console.error("❌ Error Firebase:", error);
        alert("Falla en el envío. Revisa tu conexión o el tamaño de la foto.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

// ======================================================
// 5. UTILIDADES
// ======================================================
window.logout = () => {
    if (confirm("¿Cerrar el panel de inquilino?")) {
        auth.signOut().then(() => window.location.href = "login.html");
    }
};