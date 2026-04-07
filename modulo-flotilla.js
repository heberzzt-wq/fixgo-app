/**
 * =====================================================
 * MÓDULO: FLEET MANAGEMENT (NOC FLOTILLAS) v5.30
 * Inteligencia: Cálculo de Mantenimientos y Seguros
 * =====================================================
 */

import { db } from "./firebase.js";
import { 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 1. CONFIGURACIÓN DEL MOTOR
// ==========================================
// NOTA: Asumimos que el adminContext viene de un auth state, 
// para este módulo independiente usaremos el ID de tu Búnker B2B
const tenantId = "UXMAL39_NOC"; 
const flotillaRef = collection(db, "flotilla_b2b", tenantId, "vehiculos");

// ==========================================
// 2. MOTOR DE INTELIGENCIA (REGLAS DE NEGOCIO)
// ==========================================
function analizarSaludVehiculo(data) {
    const hoy = new Date();
    const venceSeguro = new Date(data.vence_seguro);
    const ultimoMtto = new Date(data.ultimo_mtto);
    
    // Cálculo de días para el seguro
    const diasSeguro = Math.ceil((venceSeguro - hoy) / (1000 * 60 * 60 * 24));
    
    // Cálculo de meses desde el último mantenimiento
    const mesesMtto = (hoy.getFullYear() - ultimoMtto.getFullYear()) * 12 + (hoy.getMonth() - ultimoMtto.getMonth());

    let estatus = "operativo";
    let alertas = [];
    let colorBadge = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    let iconStatus = '<i class="fas fa-check-circle"></i>';

    // REGLA 1: Seguro vencido = CRÍTICO (No circula)
    if (diasSeguro <= 0) {
        estatus = "taller";
        alertas.push("SEGURO VENCIDO");
        colorBadge = "bg-red-500/10 text-red-500 border-red-500/20";
        iconStatus = '<i class="fas fa-ban"></i>';
    } 
    // REGLA 2: Seguro próximo a vencer (15 días) = PREVENCIÓN
    else if (diasSeguro <= 15) {
        estatus = "mantenimiento";
        alertas.push(`Seguro vence en ${diasSeguro} días`);
        colorBadge = "bg-amber-500/10 text-amber-500 border-amber-500/20";
        iconStatus = '<i class="fas fa-exclamation-triangle"></i>';
    }

    // REGLA 3: Mantenimiento mayor a 6 meses
    if (mesesMtto >= 6 && estatus !== "taller") {
        estatus = estatus === "operativo" ? "mantenimiento" : estatus;
        alertas.push("Requiere Afinación");
        if(colorBadge.includes("emerald")) {
            colorBadge = "bg-amber-500/10 text-amber-500 border-amber-500/20";
            iconStatus = '<i class="fas fa-tools"></i>';
        }
    }

    if (alertas.length === 0) alertas.push("En Ruta");

    return { estatus, alertas, colorBadge, iconStatus };
}

// ==========================================
// 3. REGISTRO Y ESCRITURA EN NUBE
// ==========================================
document.getElementById("formAltaFlotilla").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const btn = document.getElementById("btnGuardarVehiculo");
    const oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Procesando...';

    try {
        const payload = {
            modelo: document.getElementById("vehModelo").value.trim().toUpperCase(),
            ano: document.getElementById("vehAño").value,
            placas: document.getElementById("vehPlacas").value.trim().toUpperCase(),
            vin: document.getElementById("vehVIN").value.trim().toUpperCase() || "N/A",
            operador: document.getElementById("vehOperador").value.trim().toUpperCase() || "SIN ASIGNAR",
            kilometraje: Number(document.getElementById("vehKm").value),
            combustible: document.getElementById("vehCombustible").value,
            llantas: document.getElementById("vehLlantas").value.trim().toUpperCase(),
            seguro_poliza: document.getElementById("vehSeguro").value.trim().toUpperCase(),
            vence_seguro: document.getElementById("vehVenceSeguro").value,
            ultimo_mtto: document.getElementById("vehUltimoMtto").value,
            creado_en: serverTimestamp()
        };

        await addDoc(flotillaRef, payload);
        
        document.getElementById("formAltaFlotilla").reset();
        
        // Toast Notification Elegante
        const toast = document.createElement("div");
        toast.className = "fixed bottom-5 right-5 bg-amber-500 text-black px-6 py-3 rounded-xl font-black uppercase tracking-widest shadow-[0_0_20px_rgba(245,158,11,0.3)] z-50 animate-bounce";
        toast.innerHTML = `<i class="fas fa-check-double mr-2"></i> Unidad Añadida al NOC`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);

    } catch (error) {
        console.error("Error guardando unidad:", error);
        alert("Fallo al conectar con el servidor.");
    } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
    }
});

// ==========================================
// 4. SINCRONIZACIÓN EN VIVO (REAL-TIME NOC)
// ==========================================
const q = query(flotillaRef, orderBy("creado_en", "desc"));

onSnapshot(q, (snapshot) => {
    const tbody = document.getElementById("tablaFlotilla");
    
    // Contadores de KPI
    let kpiTot = 0, kpiOp = 0, kpiMtto = 0, kpiTal = 0;

    if (snapshot.empty) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="py-20 text-center text-zinc-600">
                    <i class="fas fa-parking text-4xl mb-4 opacity-20"></i>
                    <p class="text-xs font-black uppercase tracking-[0.2em]">Flotilla Vacía. Ingrese unidades.</p>
                </td>
            </tr>`;
        actualizarKPIs(0,0,0,0);
        return;
    }

    tbody.innerHTML = "";

    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const id = docSnap.id;
        
        kpiTot++;
        
        // Análisis IA Básico
        const analisis = analizarSaludVehiculo(data);
        
        if (analisis.estatus === "operativo") kpiOp++;
        if (analisis.estatus === "mantenimiento") kpiMtto++;
        if (analisis.estatus === "taller") kpiTal++;

        const tr = document.createElement("tr");
        tr.className = "border-b border-white/5 hover:bg-white/5 transition-colors";
        
        tr.innerHTML = `
            <td class="p-4">
                <p class="text-sm font-black text-white tracking-tighter uppercase">${data.modelo} <span class="text-zinc-500 font-medium ml-1">(${data.ano})</span></p>
                <div class="flex items-center gap-2 mt-1">
                    <span class="bg-amber-500 text-black px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest">${data.placas}</span>
                    <span class="text-[9px] text-zinc-500 font-mono">VIN: ${data.vin}</span>
                </div>
            </td>
            <td class="p-4">
                <p class="text-xs font-bold text-blue-400 uppercase"><i class="fas fa-user-astronaut mr-1"></i> ${data.operador}</p>
            </td>
            <td class="p-4">
                <p class="text-xs font-mono text-zinc-300">${data.kilometraje.toLocaleString()} km</p>
                <p class="text-[9px] font-bold text-zinc-600 uppercase mt-0.5">${data.combustible}</p>
            </td>
            <td class="p-4 text-center">
                <span class="px-3 py-1 rounded-full border ${analisis.colorBadge} text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 w-fit mx-auto">
                    ${analisis.iconStatus} ${analisis.alertas[0]}
                </span>
            </td>
            <td class="p-4 text-right">
                <button class="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors w-8 h-8 rounded-lg" title="Historial del Vehículo">
                    <i class="fas fa-folder-open text-xs"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    actualizarKPIs(kpiTot, kpiOp, kpiMtto, kpiTal);
});

function actualizarKPIs(total, op, mtto, taller) {
    document.getElementById("kpiTotal").innerText = total;
    document.getElementById("kpiOperativas").innerText = op;
    document.getElementById("kpiMantenimiento").innerText = mtto;
    document.getElementById("kpiTaller").innerText = taller;
}