/**
 * =====================================================
 * MÓDULO: FLEET MANAGEMENT (NOC FLOTILLAS) v5.35
 * Inteligencia: Expedientes, Timeline y Auto-Updates
 * =====================================================
 */

import { db } from "./firebase.js";
import { 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp,
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 1. CONFIGURACIÓN DEL MOTOR
// ==========================================
const tenantId = "UXMAL39_NOC"; 
const flotillaRef = collection(db, "flotilla_b2b", tenantId, "vehiculos");
let unsubscribeBitacora = null; // Para limpiar el listener del modal al cambiar de auto

// ==========================================
// 2. MOTOR DE INTELIGENCIA (REGLAS DE NEGOCIO)
// ==========================================
function analizarSaludVehiculo(data) {
    const hoy = new Date();
    const venceSeguro = new Date(data.vence_seguro);
    const ultimoMtto = new Date(data.ultimo_mtto);
    
    const diasSeguro = Math.ceil((venceSeguro - hoy) / (1000 * 60 * 60 * 24));
    const mesesMtto = (hoy.getFullYear() - ultimoMtto.getFullYear()) * 12 + (hoy.getMonth() - ultimoMtto.getMonth());

    let estatus = "operativo";
    let alertas = [];
    let colorBadge = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    let iconStatus = '<i class="fas fa-check-circle"></i>';

    if (diasSeguro <= 0) {
        estatus = "taller";
        alertas.push("SEGURO VENCIDO");
        colorBadge = "bg-red-500/10 text-red-500 border-red-500/20";
        iconStatus = '<i class="fas fa-ban"></i>';
    } 
    else if (diasSeguro <= 15) {
        estatus = "mantenimiento";
        alertas.push(`Seguro vence en ${diasSeguro} días`);
        colorBadge = "bg-amber-500/10 text-amber-500 border-amber-500/20";
        iconStatus = '<i class="fas fa-exclamation-triangle"></i>';
    }

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
// 3. REGISTRO Y ESCRITURA EN NUBE (NUEVA UNIDAD)
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
// 4. SINCRONIZACIÓN EN VIVO (TABLA PRINCIPAL)
// ==========================================
const qFlotilla = query(flotillaRef, orderBy("creado_en", "desc"));

onSnapshot(qFlotilla, (snapshot) => {
    const tbody = document.getElementById("tablaFlotilla");
    let kpiTot = 0, kpiOp = 0, kpiMtto = 0, kpiTal = 0;

    if (snapshot.empty) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-20 text-center text-zinc-600"><i class="fas fa-parking text-4xl mb-4 opacity-20"></i><p class="text-xs font-black uppercase tracking-[0.2em]">Flotilla Vacía</p></td></tr>`;
        actualizarKPIs(0,0,0,0);
        return;
    }

    tbody.innerHTML = "";

    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const id = docSnap.id;
        
        kpiTot++;
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
                <button onclick="window.abrirExpediente('${id}', '${data.modelo}', '${data.placas}')" class="bg-blue-600/20 hover:bg-blue-500 border border-blue-500/30 text-blue-400 hover:text-white transition-all w-9 h-9 rounded-xl shadow-lg" title="Abrir Expediente">
                    <i class="fas fa-folder-open text-sm"></i>
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

// ==========================================
// 5. MOTOR DEL EXPEDIENTE (HISTORIAL / BITÁCORA)
// ==========================================
window.abrirExpediente = (id, modelo, placas) => {
    document.getElementById("modalBitacoraVehiculo").classList.remove("hidden");
    document.getElementById("bitVehiculoId").value = id;
    document.getElementById("lblModalVehiculo").innerText = `${modelo} | PLACAS: ${placas}`;
    
    // Setear la fecha de hoy por defecto en el form
    document.getElementById("bitFecha").valueAsDate = new Date();

    // Limpiar listener anterior si existe para evitar duplicidad de datos
    if(unsubscribeBitacora) unsubscribeBitacora();

    const bitacoraRef = collection(db, "flotilla_b2b", tenantId, "vehiculos", id, "bitacora");
    const qBitacora = query(bitacoraRef, orderBy("fecha", "desc"), orderBy("creado_en", "desc"));

    unsubscribeBitacora = onSnapshot(qBitacora, (snapshot) => {
        const feed = document.getElementById("feedBitacoraVehiculo");
        
        if (snapshot.empty) {
            feed.innerHTML = `<div class="py-10 text-center text-zinc-600"><i class="fas fa-file-invoice text-3xl mb-3 opacity-20"></i><p class="text-[9px] font-black uppercase tracking-widest">Sin registros previos</p></div>`;
            return;
        }

        feed.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            
            // Configurar iconos y colores por tipo
            let icon = "fa-tools"; let color = "text-amber-500"; let bg = "bg-amber-500/10 border-amber-500/20";
            if(data.tipo === "combustible") { icon = "fa-gas-pump"; color = "text-blue-500"; bg = "bg-blue-500/10 border-blue-500/20"; }
            if(data.tipo === "incidente") { icon = "fa-car-crash"; color = "text-red-500"; bg = "bg-red-500/10 border-red-500/20"; }
            if(data.tipo === "tramite") { icon = "fa-file-signature"; color = "text-zinc-300"; bg = "bg-zinc-500/10 border-zinc-500/20"; }

            const div = document.createElement("div");
            div.className = `p-4 rounded-xl border ${bg} flex gap-4 items-start`;
            div.innerHTML = `
                <div class="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center shrink-0 border border-white/5 shadow-inner">
                    <i class="fas ${icon} ${color} text-sm"></i>
                </div>
                <div class="flex-1">
                    <div class="flex justify-between items-start">
                        <h5 class="text-xs font-black uppercase text-white tracking-wider">${data.tipo}</h5>
                        <span class="text-[10px] font-mono text-emerald-400 font-bold">$${Number(data.costo).toLocaleString()}</span>
                    </div>
                    <p class="text-[10px] text-zinc-500 font-bold mt-1 uppercase"><i class="far fa-calendar-alt mr-1"></i> ${data.fecha}</p>
                    <p class="text-xs text-zinc-300 mt-2 leading-relaxed bg-black/30 p-3 rounded-lg border border-white/5">${data.descripcion}</p>
                </div>
            `;
            feed.appendChild(div);
        });
    });
};

// ==========================================
// 6. GUARDAR NUEVO REGISTRO (CON AUTO-UPDATE)
// ==========================================
document.getElementById("formNuevaBitacora").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const btn = document.getElementById("btnGuardarBitacora");
    const oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...';

    const vehiculoId = document.getElementById("bitVehiculoId").value;
    const tipo = document.getElementById("bitTipo").value;
    const fecha = document.getElementById("bitFecha").value;
    
    try {
        // 1. Guardar en subcolección de bitácora
        const bitacoraRef = collection(db, "flotilla_b2b", tenantId, "vehiculos", vehiculoId, "bitacora");
        await addDoc(bitacoraRef, {
            tipo: tipo,
            fecha: fecha,
            costo: Number(document.getElementById("bitCosto").value) || 0,
            descripcion: document.getElementById("bitDescripcion").value.trim(),
            creado_en: serverTimestamp()
        });

        // 2. INTELIGENCIA "TESLA": Auto-Update del Vehículo Padre
        if (tipo === "mantenimiento") {
            const vehiculoRef = doc(db, "flotilla_b2b", tenantId, "vehiculos", vehiculoId);
            await updateDoc(vehiculoRef, {
                ultimo_mtto: fecha // Actualiza la fecha para limpiar la alerta del NOC
            });
        }

        document.getElementById("formNuevaBitacora").reset();
        document.getElementById("bitVehiculoId").value = vehiculoId; // Recuperar el ID oculto
        document.getElementById("bitFecha").valueAsDate = new Date(); // Re-setear hoy
        
    } catch (error) {
        console.error("Error al guardar bitácora:", error);
        alert("Ocurrió un error al guardar el registro.");
    } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
    }
});