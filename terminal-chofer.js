/**
 * =====================================================
 * TERMINAL DE OPERACIONES MÓVIL v1.1 - GOD MODE EDITION
 * Inteligencia de Campo para Arquitectos y Técnicos
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
    getDoc, 
    doc,
    addDoc, 
    serverTimestamp,
    updateDoc,
    limit,
    orderBy // <--- SECCIÓN CORREGIDA: Importado con éxito
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 1. ESTADO GLOBAL (CONFIGURACIÓN MAESTRA)
// ==========================================
const tenantIdBase = "uxmal39"; // El búnker de flotilla
let usuarioActual = null;
let vehiculoAsignado = null;

const lblNombre = document.getElementById("lblNombreChofer");
const lblVehiculo = document.getElementById("lblVehiculo");
const lblPlacas = document.getElementById("lblPlacas");
const lblFecha = document.getElementById("lblFecha");

const actualizarFecha = () => {
    const opciones = { weekday: 'long', day: 'numeric', month: 'long' };
    lblFecha.innerText = new Date().toLocaleDateString('es-MX', opciones).toUpperCase();
};
actualizarFecha();

// ==========================================
// 2. ACCESO MULTI-ROL (ARQUITECTO / TÉCNICO)
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioActual = user;
        
        try {
            // Buscamos tu documento directamente por UID
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const userData = userSnap.data();
                const nombreParaFlotilla = userData.nombre.toUpperCase();
                
                // SALUDO PERSONALIZADO
                if (userData.tipo_cuenta === "GOD_MODE" || userData.rol === "arquitecto_supremo") {
                    lblNombre.innerText = `MODO DIOS: ${userData.nombre.split(' ')[0]}`;
                } else {
                    lblNombre.innerText = `HOLA, ${userData.nombre.split(' ')[0]}`;
                }

                // BUSCAR VEHÍCULO ASIGNADO EN EL NOC
                buscarVehiculo(nombreParaFlotilla);

            } else {
                // Fallback para el Jefe
                lblNombre.innerText = "ACCESO INVITADO";
                if (user.email === 'hebertoh-m@hotmail.com') {
                    lblNombre.innerText = "HOLA, JEFE HEBERTO";
                    buscarVehiculo("HEBERTO MENDOZA HERNANDEZ");
                }
            }
        } catch (error) {
            console.error("Error cargando perfil:", error);
            lblNombre.innerText = "ERROR DE PERFIL";
        }
    } else {
        window.location.href = "index.html";
    }
});

// ==========================================
// 3. RASTREO DINÁMICO DE UNIDAD
// ==========================================
const buscarVehiculo = (nombreCompleto) => {
    // Buscamos en la ruta maestra de flotilla
    const qVeh = query(
        collection(db, "flotilla_b2b", tenantIdBase, "vehiculos"), 
        where("operador", "==", nombreCompleto),
        limit(1)
    );

    onSnapshot(qVeh, (snap) => {
        const card = document.getElementById("cardUnidad");
        
        if (!snap.empty) {
            const docVeh = snap.docs[0];
            vehiculoAsignado = { id: docVeh.id, ...docVeh.data() };
            
            // Inyectar datos en la UI
            lblVehiculo.innerText = vehiculoAsignado.modelo;
            lblPlacas.innerText = vehiculoAsignado.placas;
            card.style.opacity = "1";
            card.classList.remove("border-l-zinc-700");
            card.classList.add("border-l-blue-500");
            
            cargarHistorialDia(docVeh.id);
        } else {
            lblVehiculo.innerText = "SIN UNIDAD ASIGNADA";
            lblPlacas.innerText = "---";
            card.style.opacity = "0.5";
            card.classList.remove("border-l-blue-500");
            card.classList.add("border-l-zinc-700");
        }
    });
};

// ==========================================
// 4. LÓGICA DE REPORTES
// ==========================================
window.abrirModal = (tipo) => {
    if (!vehiculoAsignado) {
        alert("⚠️ No tienes una unidad vinculada en este momento.");
        return;
    }

    const modal = document.getElementById("modalReporte");
    const title = document.getElementById("modalTitle");
    const campos = document.getElementById("camposDinamicos");
    
    modal.classList.remove("hidden");
    campos.innerHTML = "";

    if (tipo === 'gasolina') {
        title.innerText = "REPORTE DE COMBUSTIBLE";
        campos.innerHTML = `
            <div class="space-y-4">
                <input type="hidden" id="repoTipo" value="combustible">
                <div>
                    <label class="text-[9px] font-black text-zinc-500 uppercase ml-2 mb-1 block">Lectura de Odómetro (KM)</label>
                    <input id="repoKm" type="number" value="${vehiculoAsignado.kilometraje}" required class="bg-zinc-800 border border-white/10 text-white w-full p-4 rounded-2xl text-xl font-mono focus:border-emerald-500 outline-none">
                </div>
                <div>
                    <label class="text-[9px] font-black text-zinc-500 uppercase ml-2 mb-1 block">Importe Total ($)</label>
                    <input id="repoCosto" type="number" step="0.01" placeholder="0.00" required class="bg-zinc-800 border border-white/10 text-emerald-400 w-full p-4 rounded-2xl text-xl font-mono focus:border-emerald-500 outline-none">
                </div>
                <div>
                    <label class="text-[9px] font-black text-zinc-500 uppercase ml-2 mb-1 block">Estación / Notas</label>
                    <input id="repoNotas" type="text" placeholder="Ej: Full Tanque - Pemex" class="bg-zinc-800 border border-white/10 text-white w-full p-4 rounded-2xl">
                </div>
            </div>
        `;
    }

    if (tipo === 'incidente') {
        title.innerText = "AVISO DE FALLA / INCIDENTE";
        campos.innerHTML = `
            <div class="space-y-4">
                <input type="hidden" id="repoTipo" value="incidente">
                <div>
                    <label class="text-[9px] font-black text-zinc-500 uppercase ml-2 mb-1 block">Descripción del suceso</label>
                    <textarea id="repoNotas" rows="4" placeholder="¿Qué le pasó a la unidad?" required class="bg-zinc-800 border border-white/10 text-white w-full p-4 rounded-2xl"></textarea>
                </div>
            </div>
        `;
    }
};

window.cerrarModal = () => {
    document.getElementById("modalReporte").classList.add("hidden");
};

document.getElementById("formReporte").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> ENVIANDO...';

    const tipo = document.getElementById("repoTipo").value;
    const notas = document.getElementById("repoNotas").value;
    const costo = document.getElementById("repoCosto")?.value || 0;
    const km = document.getElementById("repoKm")?.value || vehiculoAsignado.kilometraje;

    try {
        const bitacoraRef = collection(db, "flotilla_b2b", tenantIdBase, "vehiculos", vehiculoAsignado.id, "bitacora");
        await addDoc(bitacoraRef, {
            tipo: tipo,
            fecha: new Date().toISOString().split('T')[0],
            costo: Number(costo),
            descripcion: notas,
            reportado_por: usuarioActual.email,
            creado_en: serverTimestamp()
        });

        if (tipo === 'combustible') {
            const vehRef = doc(db, "flotilla_b2b", tenantIdBase, "vehiculos", vehiculoAsignado.id);
            await updateDoc(vehRef, { kilometraje: Number(km) });
        }

        cerrarModal();
        alert("Transmisión exitosa. El NOC ha sido actualizado.");

    } catch (error) {
        console.error("Error en reporte:", error);
        alert("Error de red. Reintenta.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = "Enviar al NOC";
    }
});

const cargarHistorialDia = (vehId) => {
    const hoyStr = new Date().toISOString().split('T')[0];
    const qHoy = query(
        collection(db, "flotilla_b2b", tenantIdBase, "vehiculos", vehId, "bitacora"),
        where("fecha", "==", hoyStr),
        orderBy("creado_en", "desc")
    );

    onSnapshot(qHoy, (snap) => {
        const feed = document.getElementById("feedHoy");
        if (snap.empty) {
            feed.innerHTML = `<div class="p-4 rounded-2xl bg-zinc-900/50 border border-white/5 text-center py-10 text-zinc-700 text-[10px] font-black uppercase italic tracking-widest">Sin actividad hoy</div>`;
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
                        <p class="text-[9px] text-zinc-500 font-bold uppercase truncate w-32">${data.descripcion}</p>
                    </div>
                </div>
                <p class="text-xs font-mono text-zinc-300 font-bold">${data.costo > 0 ? '$'+data.costo : '--'}</p>
            `;
            feed.appendChild(div);
        });
    });
};
/* =====================================================
   REGRESO AL DASHBOARD TÉCNICO (V5.35)
   ===================================================== */
window.volverAlDashboard = () => {
    
    // Feedback visual en consola
    console.log("🔄 Sincronizando salida de terminal...");

    // Redirección al dashboard principal
    // Asegúrate de que la ruta coincida con tu archivo (tecnico-b2b.html o index.html)
    window.location.href = "./tecnico-b2b.html"; 

};