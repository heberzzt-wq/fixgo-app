/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - B2B RESIDENTIAL CONTROLLER
 * Archivo: panel-residencial.js
 * Versión: 1.0.0 (SaaS Multi-Tenant & Fleet Management)
 * Autor: Heber (CEO & Lead Architect)
 * ======================================================================================
 */

import { db, collection, addDoc, getDoc, getDocs, doc, updateDoc, onSnapshot, query, where, orderBy, serverTimestamp } from "./firebase.js";

let empresaId = null; // Se detectará al iniciar

/**
 * 🚀 INICIO DEL PANEL RESIDENCIAL
 * Esta función es llamada por el Gatekeeper (app-main.js)
 */
export async function iniciarPanelResidencial(userAuth) {
    console.log("🏢 [B2B] Inicializando Panel para:", userAuth.email);
    
    // 1. Buscar a qué empresa pertenece este administrador
    // Buscamos en la colección global de usuarios su empresa asignada
    const userDoc = await getDoc(doc(db, "users", userAuth.uid));
    if (userDoc.exists() && userDoc.data().empresaId) {
        empresaId = userDoc.data().empresaId;
        document.getElementById('residencialNombre').innerText = empresaId.replace('-', ' ').toUpperCase();
        
        // 2. Cargar datos en tiempo real
        escucharDatosEmpresa();
        escucharTicketsInternos();
        escucharActividadReciente();
    } else {
        alert("Error: Tu perfil no tiene una empresa B2B vinculada.");
    }
}

/**
 * 📊 ESCUCHA DE SALDO Y MÉTRICAS BÁSICAS
 */
function escucharDatosEmpresa() {
    onSnapshot(doc(db, "empresas_b2b", empresaId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('saldoB2B').innerText = `$${(data.saldo || 0).toLocaleString('es-MX')}`;
            document.getElementById('countActivos').innerText = data.total_activos || 0;
            document.getElementById('countEscalados').innerText = data.total_escalados || 0;
        }
    });
}

/**
 * 🎫 GESTIÓN DE TICKETS INTERNOS (EMPLEADOS DE NÓMINA)
 */
function escucharTicketsInternos() {
    const q = query(
        collection(db, `empresas_b2b/${empresaId}/tickets_internos`),
        where("status", "!=", "finalizado"),
        orderBy("status"),
        orderBy("createdAt", "desc")
    );

    onSnapshot(q, (snapshot) => {
        const grid = document.getElementById('gridTicketsInternos');
        if (!grid) return;
        
        grid.innerHTML = "";
        let totalAbiertos = 0;

        snapshot.forEach(docTicket => {
            const t = docTicket.data();
            totalAbiertos++;
            
            const card = document.createElement('div');
            card.className = "bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center";
            card.innerHTML = `
                <div>
                    <h4 class="font-bold text-gray-800">${t.titulo || 'Mantenimiento General'}</h4>
                    <p class="text-xs text-gray-500"><i class="fas fa-map-marker-alt"></i> ${t.area || 'Área no definida'}</p>
                    <div class="mt-2">
                        <span class="text-[10px] bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-bold uppercase">${t.status}</span>
                        <span class="text-[10px] bg-gray-200 text-gray-700 px-2 py-1 rounded-full ml-1">${t.tecnico_nombre || 'Sin asignar'}</span>
                    </div>
                </div>
                <div class="flex flex-col space-y-2">
                    <button onclick="verDetalleTicket('${docTicket.id}')" class="text-blue-600 hover:text-blue-800 text-sm font-bold">VER</button>
                    <button onclick="prepararEscalamiento('${docTicket.id}')" class="bg-orange-100 text-orange-600 p-2 rounded text-xs font-bold hover:bg-orange-200">
                        <i class="fas fa-rocket"></i> ESCALAR
                    </button>
                </div>
            `;
            grid.appendChild(card);
        });

        document.getElementById('countTickets').innerText = totalAbiertos;
    });
}

/**
 * 📅 BITÁCORA E HISTORIAL (ACTIVIDAD RECIENTE)
 */
function escucharActividadReciente() {
    const q = query(
        collection(db, `empresas_b2b/${empresaId}/bitacora`),
        orderBy("fecha", "desc"),
        limit(10)
    );

    onSnapshot(q, (snapshot) => {
        const tabla = document.getElementById('listaMovimientos');
        if (!tabla) return;
        
        tabla.innerHTML = "";
        snapshot.forEach(log => {
            const d = log.data();
            const fecha = d.fecha ? d.fecha.toDate().toLocaleDateString() : '---';
            
            tabla.innerHTML += `
                <tr class="border-b hover:bg-gray-50 transition">
                    <td class="py-3 text-sm">${fecha}</td>
                    <td class="py-3 font-semibold">${d.elemento_nombre}</td>
                    <td class="py-3 text-sm">${d.tecnico_nombre}</td>
                    <td class="py-3"><span class="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded-full font-bold">COMPLETADO</span></td>
                    <td class="py-3"><button class="text-blue-500"><i class="fas fa-eye"></i></button></td>
                </tr>
            `;
        });
    });
}

/**
 * 🌉 PASO 4: EL PUENTE DE RESCATE (ESCALAR A GESTIAPREMIUM)
 * Convierte un ticket interno en un servicio B2C pagado por la empresa.
 */
let ticketAEscalar = null;

window.prepararEscalamiento = function(id) {
    ticketAEscalar = id;
    window.abrirModalEscalar(); // Esta función está en el HTML
};

document.getElementById('confirmarEscalamiento').addEventListener('click', async () => {
    if (!ticketAEscalar) return;
    
    const btn = document.getElementById('confirmarEscalamiento');
    btn.disabled = true;
    btn.innerText = "ESCALANDO...";

    try {
        // 1. Obtener datos del ticket interno
        const ticketRef = doc(db, `empresas_b2b/${empresaId}/tickets_internos`, ticketAEscalar);
        const ticketSnap = await getDoc(ticketRef);
        const tData = ticketSnap.data();

        // 2. Clonar a la colección global 'services'
        const nuevoServicio = {
            clienteId: empresaId, // La empresa actúa como cliente
            clienteNombre: `B2B: ${empresaId.toUpperCase()}`,
            descripcion: `[ESCALADO B2B] ${tData.titulo}: ${tData.descripcion}`,
            area: tData.area,
            estado: "pendiente",
            metodo_pago: "b2b_saldo", // Regla especial para descuento de saldo
            createdAt: serverTimestamp(),
            tipo: "emergencia_b2b",
            id_interno_origen: ticketAEscalar
        };

        await addDoc(collection(db, "services"), nuevoServicio);

        // 3. Marcar ticket interno como ESCALADO
        await updateDoc(ticketRef, {
            status: "escalado",
            escaladoAt: serverTimestamp()
        });

        // 4. Actualizar contador en empresa
        const empresaRef = doc(db, "empresas_b2b", empresaId);
        const empSnap = await getDoc(empresaRef);
        await updateDoc(empresaRef, {
            total_escalados: (empSnap.data().total_escalados || 0) + 1
        });

        alert("✅ Ticket escalado exitosamente. Un especialista de GestiaPremium será asignado.");
        window.cerrarModalEscalar();
        
    } catch (error) {
        console.error("Error al escalar ticket:", error);
        alert("Error al conectar con el puente de especialistas.");
    } finally {
        btn.disabled = false;
        btn.innerText = "SÍ, SOLICITAR ESPECIALISTA";
    }
});

// Exponer funciones al window para el HTML
window.verDetalleTicket = (id) => { console.log("Ver detalle de ticket:", id); };
