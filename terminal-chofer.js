/**
 * =====================================================
 * TERMINAL DE OPERACIONES MÓVIL v1.0
 * Inteligencia de Campo para Choferes y Técnicos
 * =====================================================
 */

import { db, auth } from "./firebase.js";
import { 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, 
    query, 
    where, 
    onSnapshot, 
    getDocs, 
    addDoc, 
    serverTimestamp,
    doc,
    updateDoc,
    limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 1. ESTADO GLOBAL Y CONFIGURACIÓN
// ==========================================
const tenantId = "UXMAL39_NOC";
let usuarioActual = null;
let vehiculoAsignado = null;

// Referencias a UI
const lblNombre = document.getElementById("lblNombreChofer");
const lblVehiculo = document.getElementById("lblVehiculo");
const lblPlacas = document.getElementById("lblPlacas");
const lblFecha = document.getElementById("lblFecha");

// Reloj y Fecha Superior
const actualizarFecha = () => {
    const opciones = { weekday: 'long', day: 'numeric', month: 'long' };
    lblFecha.innerText = new Date().toLocaleDateString('es-MX', opciones).toUpperCase();
};
actualizarFecha();

// ==========================================
// 2. PROTECCIÓN DE RUTA Y CARGA DE PERFIL
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioActual = user;
        // Buscamos el nombre en la colección de usuarios
        const qUser = query(collection(db, "users"), where("email", "==", user.email));
        const snapUser = await getDocs(qUser);
        
        if (!snapUser.empty) {
            const userData = snapUser.docs[0].data();
            lblNombre.innerText = `HOLA, ${userData.nombre.split(' ')[0]}`;
            
            // BUSCAR VEHÍCULO ASIGNADO
            // Buscamos en la flotilla quién tiene su nombre como operador
            buscarVehiculo(userData.nombre.toUpperCase());
        } else {
            lblNombre.innerText = `HOLA, OPERADOR`;
        }
    } else {
        // Si no hay sesión, al login de cabeza
        window.location.href = "index.html";
    }
});

// ==========================================
// 3. MOTOR DE BÚSQUEDA DE UNIDAD
// ==========================================
const buscarVehiculo = (nombreCompleto) => {
    const qVeh = query(
        collection(db, "flotilla_b2b", tenantId, "vehiculos"), 
        where("operador", "==", nombreCompleto),
        limit(1)
    );

    onSnapshot(qVeh, (snap) => {
        if (!snap.empty) {
            const docVeh = snap.docs[0];
            vehiculoAsignado = { id: docVeh.id, ...docVeh.data() };
            
            // Pintar UI
            lblVehiculo.innerText = vehiculoAsignado.modelo;
            lblPlacas.innerText = vehiculoAsignado.placas;
            document.getElementById("cardUnidad").classList.remove("opacity-50");
            
            // Cargar historial del día
            cargarHistorialDia(docVeh.id);
        } else {
            lblVehiculo.innerText = "SIN UNIDAD ASIGNADA";
            lblPlacas.innerText = "---";
            document.getElementById("cardUnidad").classList.add("opacity-50");
        }
    });
};

// ==========================================
// 4. GESTIÓN DE MODALES Y REPORTES
// ==========================================
window.abrirModal = (tipo) => {
    if (!vehiculoAsignado) {
        alert("⚠️ No tienes una unidad asignada para reportar.");
        return;
    }

    const modal = document.getElementById("modalReporte");
    const title = document.getElementById("modalTitle");
    const campos = document.getElementById("camposDinamicos");
    
    modal.classList.remove("hidden");
    campos.innerHTML = ""; // Limpiar

    if (tipo === 'gasolina') {
        title.innerText = "REPORTE DE GASOLINA";
        campos.innerHTML = `
            <div class="space-y-4">
                <input type="hidden" id="repoTipo" value="combustible">
                <div>
                    <label class="text-[9px] font-black text-zinc-500 uppercase ml-2 mb-1 block">Kilometraje actual</label>
                    <input id="repoKm" type="number" placeholder="Ej: 45200" required class="bg-zinc-800 border border-white/10 text-white w-full p-4 rounded-2xl text-xl font-mono">
                </div>
                <div>
                    <label class="text-[9px] font-black text-zinc-500 uppercase ml-2 mb-1 block">Costo total ($)</label>
                    <input id="repoCosto" type="number" step="0.01" placeholder="0.00" required class="bg-zinc-800 border border-white/10 text-emerald-400 w-full p-4 rounded-2xl text-xl font-mono">
                </div>
                <div>
                    <label class="text-[9px] font-black text-zinc-500 uppercase ml-2 mb-1 block">Notas / Gasolinera</label>
                    <input id="repoNotas" type="text" placeholder="Ej: Carga tanque lleno Pemex" class="bg-zinc-800 border border-white/10 text-white w-full p-4 rounded-2xl">
                </div>
            </div>
        `;
    }

    if (tipo === 'incidente') {
        title.innerText = "REPORTAR FALLA";
        campos.innerHTML = `
            <div class="space-y-4">
                <input type="hidden" id="repoTipo" value="incidente">
                <div>
                    <label class="text-[9px] font-black text-zinc-500 uppercase ml-2 mb-1 block">¿Qué sucedió?</label>
                    <textarea id="repoNotas" rows="4" placeholder="Describe la falla o el incidente..." required class="bg-zinc-800 border border-white/10 text-white w-full p-4 rounded-2xl"></textarea>
                </div>
                <div class="bg-red-500/10 border border-red-500/20 p-4 rounded-xl">
                    <p class="text-[10px] text-red-500 font-bold uppercase"><i class="fas fa-exclamation-circle mr-2"></i> Esto notificará de inmediato al NOC de Control.</p>
                </div>
            </div>
        `;
    }
};

window.cerrarModal = () => {
    document.getElementById("modalReporte").classList.add("hidden");
};

// ==========================================
// 5. ENVÍO DE DATOS AL NOC
// ==========================================
document.getElementById("formReporte").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> TRANSMITIENDO...';

    const tipo = document.getElementById("repoTipo").value;
    const notas = document.getElementById("repoNotas").value;
    const costo = document.getElementById("repoCosto")?.value || 0;
    const km = document.getElementById("repoKm")?.value || vehiculoAsignado.kilometraje;

    try {
        // 1. Guardar en la bitácora del vehículo
        const bitacoraRef = collection(db, "flotilla_b2b", tenantId, "vehiculos", vehiculoAsignado.id, "bitacora");
        await addDoc(bitacoraRef, {
            tipo: tipo,
            fecha: new Date().toISOString().split('T')[0],
            costo: Number(costo),
            descripcion: notas,
            reportado_por: usuarioActual.email,
            creado_en: serverTimestamp()
        });

        // 2. Actualizar kilometraje si es reporte de gasolina
        if (tipo === 'combustible') {
            const vehRef = doc(db, "flotilla_b2b", tenantId, "vehiculos", vehiculoAsignado.id);
            await updateDoc(vehRef, {
                kilometraje: Number(km)
            });
        }

        cerrarModal();
        alert("✅ Reporte enviado con éxito al NOC.");

    } catch (error) {
        console.error("Error al transmitir:", error);
        alert("❌ Error de conexión. Intenta de nuevo.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = "Enviar al NOC";
    }
});

// ==========================================
// 6. FEED DE ACTIVIDAD DEL DÍA
// ==========================================
const cargarHistorialDia = (vehId) => {
    const hoyStr = new Date().toISOString().split('T')[0];
    const qHoy = query(
        collection(db, "flotilla_b2b", tenantId, "vehiculos", vehId, "bitacora"),
        where("fecha", "==", hoyStr),
        orderBy("creado_en", "desc")
    );

    onSnapshot(qHoy, (snap) => {
        const feed = document.getElementById("feedHoy");
        if (snap.empty) {
            feed.innerHTML = `<div class="p-4 rounded-2xl bg-zinc-900/50 border border-white/5 text-center py-10 text-zinc-700 text-xs font-bold uppercase italic">Sin actividad hoy</div>`;
            return;
        }

        feed.innerHTML = "";
        snap.forEach(docSnap => {
            const data = docSnap.data();
            let icon = data.tipo === 'combustible' ? 'fa-gas-pump text-emerald-500' : 'fa-car-crash text-red-500';
            const div = document.createElement("div");
            div.className = "p-4 rounded-2xl bg-zinc-900/50 border border-white/5 flex items-center justify-between";
            div.innerHTML = `
                <div class="flex items-center gap-4">
                    <i class="fas ${icon} text-lg"></i>
                    <div>
                        <p class="text-[10px] font-black text-white uppercase tracking-widest">${data.tipo}</p>
                        <p class="text-[9px] text-zinc-500 font-bold uppercase">${data.descripcion.substring(0, 30)}...</p>
                    </div>
                </div>
                <p class="text-xs font-mono text-zinc-300 font-bold">${data.costo > 0 ? '$'+data.costo : '--'}</p>
            `;
            feed.appendChild(div);
        });
    });
};