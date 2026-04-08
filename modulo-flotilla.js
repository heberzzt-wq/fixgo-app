/**
 * =====================================================
 * MÓDULO: FLEET MANAGEMENT (NOC FLOTILLAS) v5.50
 * Inteligencia: Flotilla + Bitácora + Operadores
 * Funciones: Alta, Monitoreo y Baja (Delete)
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
    updateDoc,
    deleteDoc // <--- Importado para la función de baja
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 1. CONFIGURACIÓN DEL MOTOR
// ==========================================
const tenantId = "uxmal39"; 
const flotillaRef = collection(db, "flotilla_b2b", tenantId, "vehiculos");
const operadoresRef = collection(db, "flotilla_b2b", tenantId, "operadores");

let unsubscribeBitacora = null;
let unsubscribeOperadores = null;

// ==========================================
// 2. MOTOR DE INTELIGENCIA DE AUTOS
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
        mostrarToast("Unidad Añadida al NOC", "amber");

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
onSnapshot(query(flotillaRef, orderBy("creado_en", "desc")), (snapshot) => {
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
    document.getElementById("bitFecha").valueAsDate = new Date();

    if(unsubscribeBitacora) unsubscribeBitacora();

    const bitacoraRef = collection(db, "flotilla_b2b", tenantId, "vehiculos", id, "bitacora");
    unsubscribeBitacora = onSnapshot(query(bitacoraRef, orderBy("fecha", "desc"), orderBy("creado_en", "desc")), (snapshot) => {
        const feed = document.getElementById("feedBitacoraVehiculo");
        
        if (snapshot.empty) {
            feed.innerHTML = `<div class="py-10 text-center text-zinc-600"><i class="fas fa-file-invoice text-3xl mb-3 opacity-20"></i><p class="text-[9px] font-black uppercase tracking-widest">Sin registros previos</p></div>`;
            return;
        }
        feed.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
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
        const bitacoraRef = collection(db, "flotilla_b2b", tenantId, "vehiculos", vehiculoId, "bitacora");
        await addDoc(bitacoraRef, {
            tipo: tipo,
            fecha: fecha,
            costo: Number(document.getElementById("bitCosto").value) || 0,
            descripcion: document.getElementById("bitDescripcion").value.trim(),
            creado_en: serverTimestamp()
        });

        if (tipo === "mantenimiento") {
            await updateDoc(doc(db, "flotilla_b2b", tenantId, "vehiculos", vehiculoId), { ultimo_mtto: fecha });
        }

        document.getElementById("formNuevaBitacora").reset();
        document.getElementById("bitVehiculoId").value = vehiculoId; 
        document.getElementById("bitFecha").valueAsDate = new Date(); 
        mostrarToast("Registro guardado", "blue");
        
    } catch (error) {
        console.error("Error al guardar bitácora:", error);
        alert("Ocurrió un error al guardar el registro.");
    } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
    }
});

// ==========================================
// 6. MOTOR DE OPERADORES (OPCIÓN B)
// ==========================================

// Función para calcular salud de la licencia
function analizarLicencia(fechaVence) {
    const hoy = new Date();
    const vence = new Date(fechaVence);
    const dias = Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));

    if (dias <= 0) return { texto: "VENCIDA", color: "bg-red-500/10 text-red-500 border-red-500/20", icon: "fa-times-circle" };
    if (dias <= 30) return { texto: `VENCE EN ${dias} DÍAS`, color: "bg-amber-500/10 text-amber-500 border-amber-500/20", icon: "fa-exclamation-triangle" };
    return { texto: "VIGENTE", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", icon: "fa-check-circle" };
}

window.abrirModalOperadores = () => {
    document.getElementById("modalDirectorioOperadores").classList.remove("hidden");
    
    if(unsubscribeOperadores) unsubscribeOperadores();

    unsubscribeOperadores = onSnapshot(query(operadoresRef, orderBy("creado_en", "desc")), (snapshot) => {
        const tbody = document.getElementById("tablaOperadores");
        
        if (snapshot.empty) {
            tbody.innerHTML = `<tr><td colspan="4" class="py-10 text-center text-zinc-600"><p class="text-xs font-black uppercase tracking-widest">Sin Operadores Registrados</p></td></tr>`;
            return;
        }

        tbody.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id; // Obtenemos el ID para la función de borrado
            const licencia = analizarLicencia(data.vence_licencia);

            const tr = document.createElement("tr");
            tr.className = "border-b border-white/5 hover:bg-white/5 transition-colors";
            tr.innerHTML = `
                <td class="p-4">
                    <p class="text-sm font-black text-blue-400 uppercase">${data.nombre}</p>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="text-[9px] text-zinc-400 font-mono"><i class="fas fa-phone-alt mr-1"></i> ${data.telefono}</span>
                        <span class="text-[10px] font-black text-red-400 bg-red-400/10 px-2 py-0.5 rounded border border-red-400/20">🩸 ${data.sangre}</span>
                    </div>
                </td>
                <td class="p-4">
                    <p class="text-xs font-black text-white uppercase tracking-widest">${data.licencia}</p>
                </td>
                <td class="p-4 text-center">
                    <span class="px-3 py-1 rounded-full border ${licencia.color} text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 w-fit mx-auto">
                        <i class="fas ${licencia.icon}"></i> ${licencia.texto}
                    </span>
                </td>
                <td class="p-4 text-right">
                    <button onclick="window.eliminarOperador('${id}', '${data.nombre}')" class="text-zinc-600 hover:text-red-500 transition-colors p-2">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    });
};

// Función Maestra de Eliminación
window.eliminarOperador = async (id, nombre) => {
    const confirmar = confirm(`¿Estás seguro de eliminar a ${nombre}?\nEsta acción no se puede deshacer.`);
    
    if (confirmar) {
        try {
            const docRef = doc(db, "flotilla_b2b", tenantId, "operadores", id);
            await deleteDoc(docRef);
            mostrarToast("Operador eliminado", "red");
        } catch (error) {
            console.error("Error al borrar:", error);
            alert("No se pudo eliminar el registro del servidor.");
        }
    }
};

document.getElementById("formNuevoOperador").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btnGuardarOperador");
    const oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Procesando...';

    try {
        await addDoc(operadoresRef, {
            nombre: document.getElementById("opNombre").value.trim().toUpperCase(),
            telefono: document.getElementById("opTelefono").value.trim(),
            sangre: document.getElementById("opSangre").value,
            nss: document.getElementById("opNSS").value.trim() || "N/A",
            licencia: document.getElementById("opLicencia").value.trim().toUpperCase(),
            vence_licencia: document.getElementById("opVenceLicencia").value,
            emergencia: document.getElementById("opEmergencia").value.trim().toUpperCase(),
            creado_en: serverTimestamp()
        });

        document.getElementById("formNuevoOperador").reset();
        mostrarToast("Operador Registrado", "blue");

    } catch (error) {
        console.error("Error guardando operador:", error);
        alert("Fallo al conectar con el servidor.");
    } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
    }
});

// Función de utilidad para Toast Notifications
function mostrarToast(mensaje, color = "amber") {
    const toast = document.createElement("div");
    toast.className = `fixed bottom-5 right-5 bg-${color}-500 text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest shadow-[0_0_20px_rgba(0,0,0,0.5)] z-[999] animate-bounce`;
    toast.innerHTML = `<i class="fas fa-info-circle mr-2"></i> ${mensaje}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}