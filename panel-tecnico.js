/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - MÓDULO DE TÉCNICO (SOCIO OPERADOR)
 * ======================================================================================
 * Archivo: panel-tecnico.js
 * Versión: 5.18.10 (Inyección de Datos de Vehículo para Pase QR Caseta)
 * Descripción: Motor de radar, GPS, colisiones, cotizador y evidencia Cloud.
 * REGLAS DE ARQUITECTURA: NO COMPACTAR. NO FRAGMENTAR. MANTENER LOGICA.
 * ======================================================================================
 */

import {
    db,
    storage,
    doc,
    updateDoc,
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    addDoc,
    serverTimestamp,
    setDoc,
    getDoc,
    reclamarServicioB2C,
    enviarCotizacionB2C
} from "./firebase.js";

import { getDocs, arrayUnion, runTransaction, limit, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";
import { iniciarTracking, detenerTracking } from "./gps-motor.js";
import { escaparHTML, calcularDistancia, sonarAlerta, lanzarNotificacionPush, cargarLibreriaPDF, urlABase64 } from "./app-utils.js";
import {
    TECHNICIAN_KYC_STATES,
    assertTechnicianCanOperate,
    getTechnicianKycRequirements,
    normalizeTechnicianProfile,
    storagePathForTechnicianDocument
} from "./b2c-technician-profile.js";
import { getConfirmedServiceDestination } from "./b2c-destination.js";

export async function iniciarPanelTecnico(user) {
    console.log(" 🔧 Iniciando Panel de Técnico (Modo Tarifas Inteligentes y Pase QR)...");
    
    activarMotorFCM(user.uid);

    const elementos = {
        statusLabel: document.getElementById("statusLabel"),
        toggleONOFF: document.getElementById("toggleONOFF"),
        radarSection: document.getElementById("radarSection"),
        seccionBolsa: document.getElementById("seccionBolsa"),
        listaBolsa: document.getElementById("listaBolsa"),
        listaServicios: document.getElementById("listaServicios"),
        panelAcciones: document.getElementById("panelAcciones"),
        walletLabel: document.getElementById("walletSaldo"),
        btnRetiro: document.getElementById("btnRetiro"),
        contenedorHistorialRetiros: document.getElementById("contenedorHistorialRetiros"),
        listaMisRetiros: document.getElementById("listaMisRetiros"),
        listaMisTickets: document.getElementById("listaMisTickets"),
        badgeNivel: document.getElementById("badgeNivel"),
        contenedorEstrellas: document.getElementById("contenedorEstrellas"),
        txtServicios: document.getElementById("txtServicios"),
        fotoPerfil: document.getElementById("fotoPerfil"),
        fotoIcono: document.getElementById("fotoIcono")
    };

    const tecnicoRef = doc(db, "users", user.uid);
    onSnapshot(tecnicoRef, (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        const kycResult = getTechnicianKycRequirements(data);
        const perfilCanonico = kycResult.profile;
        const estado = perfilCanonico.estado;
        const strikes = data.strikes || 0;

        const reputacion = data.reputacion || 5.0;
        const svcs = data.servicios_completados || 0;
        const estrellas = "⭐".repeat(Math.round(reputacion));
        const nivel = data.nivel || "BRONCE";
        
        let colorNivel = "text-orange-500 bg-orange-600/20 border-orange-500/30";
        if(nivel === "PLATA") colorNivel = "text-gray-300 bg-gray-600/20 border-gray-500/30";
        if(nivel === "ORO") colorNivel = "text-yellow-400 bg-yellow-600/20 border-yellow-500/30";

        if(elementos.badgeNivel) {
            elementos.badgeNivel.className = `${colorNivel} text-[10px] font-black px-2 py-0.5 rounded border`;
            elementos.badgeNivel.innerText = `NIVEL ${nivel}`;
        }
        if(elementos.contenedorEstrellas) {
            elementos.contenedorEstrellas.innerHTML = `${estrellas} <span class="text-[10px] text-gray-500 font-bold ml-1">(${reputacion.toFixed(1)})</span>`;
        }
        if(elementos.txtServicios) {
            elementos.txtServicios.classList.remove("hidden");
            elementos.txtServicios.innerText = `${svcs} SERVICIOS FINALIZADOS`;
        }
        if(elementos.fotoPerfil && elementos.fotoIcono) {
            if(data.foto_perfil || data.fotoPerfil) {
                elementos.fotoPerfil.src = data.foto_perfil || data.fotoPerfil;
                elementos.fotoPerfil.classList.remove("hidden");
                elementos.fotoIcono.classList.add("hidden");
            } else {
                elementos.fotoPerfil.classList.add("hidden");
                elementos.fotoIcono.classList.remove("hidden");
            }
        }

        if (elementos.seccionBolsa && estado === "activo" && data.disponible) {
            let tracker = document.getElementById("gamificationTracker");
            
           // 🛡️ CORRECCIÓN V5.18: Limpieza de Interfaz B2B (Sin cortar el flujo)
            if (data.residencialId) {
                console.log("🛠️ Modo Residencial: Limpiando panel pero manteniendo radar activo...");

                // 1. Esconder el Badge de Nivel
                if (elementos.badgeNivel) elementos.badgeNivel.style.display = 'none';

                // 2. Esconder la Cartera (Barras de deuda/saldo)
                document.querySelectorAll('div, section').forEach(el => {
                    if (el.innerText && (el.innerText.includes("MI CARTERA") || el.innerText.includes("SALDO"))) {
                        el.style.setProperty('display', 'none', 'important');
                    }
                });

                // 3. Eliminar visualmente el Tracker de comisiones
                const trackerElem = document.getElementById("gamificationTracker"); // Renombrado para no opacar
                if (trackerElem) trackerElem.style.display = 'none';

                // 🛑 QUITAMOS EL RETURN para que el código siga a las siguientes líneas
            }
            if (!tracker) {
                tracker = document.createElement("div");
                tracker.id = "gamificationTracker";
                elementos.seccionBolsa.parentNode.insertBefore(tracker, elementos.seccionBolsa);
            }

            const comisionActual = data.comision_asignada ? parseFloat(data.comision_asignada) : 0.30;
            const gananciaNetaPorcentaje = Math.round((1 - comisionActual) * 100); 
            
            let sigNivel = ""; let reqSvcs = 0; let reqRep = 0; let beneSig = 0;
            if (nivel === "BRONCE") { sigNivel = "PLATA"; reqSvcs = 20; reqRep = 4.5; beneSig = 73; }
            else if (nivel === "PLATA") { sigNivel = "ORO"; reqSvcs = 50; reqRep = 4.8; beneSig = 76; }
            else { sigNivel = "ÉLITE"; } 

            let progresoHTML = "";
            if (sigNivel !== "ÉLITE") {
                const pctSvcs = Math.min((svcs / reqSvcs) * 100, 100);
                progresoHTML = `
                <div class="border-t border-zinc-800 pt-3 mt-2">
                    <p class="text-[10px] text-gray-400 mb-1">Próxima meta: <span class="text-white font-bold">${sigNivel} (Ganas el ${beneSig}%)</span></p>
                    <div class="flex justify-between text-[9px] font-bold mb-1">
                        <span class="${svcs >= reqSvcs ? 'text-emerald-500' : 'text-blue-400'}">${svcs}/${reqSvcs} Servicios</span>
                        <span class="${reputacion >= reqRep ? 'text-emerald-500' : 'text-blue-400'}">⭐ ${reputacion.toFixed(1)}/${reqRep.toFixed(1)}</span>
                    </div>
                    <div class="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                        <div class="bg-blue-500 h-1.5 rounded-full transition-all duration-1000" style="width: ${pctSvcs}%"></div>
                    </div>
                </div>`;
            } else {
                progresoHTML = `
                <div class="border-t border-yellow-900/50 pt-3 mt-2 text-center">
                    <p class="text-[10px] text-yellow-500 font-bold tracking-widest"><i class="fas fa-crown"></i> ESTÁS EN EL RANGO MÁXIMO</p>
                    <p class="text-[9px] text-gray-400">Mantén tus estrellas altas para no perder este privilegio.</p>
                </div>`;
            }

            tracker.innerHTML = `
            <div class="bg-black border ${nivel === 'ORO' ? 'border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.1)]' : 'border-zinc-800'} rounded-xl p-4 mb-4 shadow-lg animate-fade-in">
                <div class="flex justify-between items-center mb-2">
                    <div>
                        <p class="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Tu Tasa de Ganancia</p>
                        <p class="text-2xl font-black text-emerald-400">${gananciaNetaPorcentaje}% <span class="text-[10px] text-gray-500 font-normal">Libres para ti</span></p>
                    </div>
                    <div class="text-right">
                        <p class="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Estatus Actual</p>
                        <p class="${colorNivel} px-2 py-1 rounded text-[10px] font-black uppercase inline-block">${nivel}</p>
                    </div>
                </div>
                ${progresoHTML}
            </div>
            `;
        } else {
            const tracker = document.getElementById("gamificationTracker");
            if (tracker) tracker.remove();
        }

        if (["suspendido", "suspendido_grave", "baneado_permanente"].includes(estado)) {
            let msgSuspendido = "Cuenta Suspendida Temporalmente";
            let descSuspendido = "Se ha detectado una anomalía en tu servicio. Revisa tu saldo retenido.";
            let iconSuspendido = "fa-exclamation-triangle";
            
            if (estado === "suspendido") {
                descSuspendido = "Penalización Nivel 1 (24 Horas). Tus fondos han sido retenidos preventivamente.";
            } else if (estado === "suspendido_grave") {
                msgSuspendido = "Suspensión Grave (7 Días)";
                descSuspendido = "Penalización Nivel 2. Tienes múltiples reportes críticos. Tu saldo está congelado.";
            } else if (estado === "baneado_permanente") {
                msgSuspendido = "CUENTA BLOQUEADA DEFINITIVAMENTE";
                descSuspendido = "Por violaciones graves a los términos de servicio de GestiaPremium, esta cuenta ha sido cerrada.";
                iconSuspendido = "fa-skull-crossbones";
            }

            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "SUSPENDIDO";
                elementos.statusLabel.className = "bg-red-900/50 text-red-500 status-badge font-black border border-red-500/50 animate-pulse";
            }
            if(elementos.toggleONOFF) {
                elementos.toggleONOFF.disabled = true;
                elementos.toggleONOFF.checked = false;
            }
            detenerTracking();
            if(elementos.radarSection) elementos.radarSection.classList.add("hidden");
            if(elementos.seccionBolsa) {
                elementos.seccionBolsa.classList.remove("hidden");
                elementos.seccionBolsa.innerHTML = `
                <div class="p-6 bg-red-900/20 border border-red-500/50 rounded-2xl text-center shadow-xl shadow-red-900/20">
                    <i class="fas ${iconSuspendido} text-red-500 text-4xl mb-4 animate-bounce"></i>
                    <p class="text-red-500 text-lg font-black uppercase tracking-widest">${msgSuspendido}</p>
                    <p class="text-gray-400 text-xs mt-2 leading-relaxed">${descSuspendido}</p>
                    <div class="mt-5 inline-block bg-black px-4 py-2 rounded-lg border border-red-900">
                        <p class="text-red-500 font-bold text-xs uppercase tracking-widest">STRIKES ACUMULADOS: ${strikes} / 3</p>
                    </div>
                </div>
                `;
            }
            return; 
        }

        const ineUrl = perfilCanonico.documentos.ine;
        const csfUrl = perfilCanonico.documentos.csf;
        const fotoUrl = perfilCanonico.foto_perfil;
        const banco = perfilCanonico.datos_bancarios.banco;
        const clabe = perfilCanonico.datos_bancarios.clabe;
        const vehiculoTipo = perfilCanonico.vehiculo.tipo;
        const placas = perfilCanonico.vehiculo.placas;
        const licenciaUrl = perfilCanonico.documentos.licencia;
        const certificados = perfilCanonico.documentos.certificados;
        const esPeaton = kycResult.pedestrian;
        
        const faltaInfo = !kycResult.complete;

        if (faltaInfo) {
            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "REGISTRO INCOMPLETO";
                elementos.statusLabel.className = "bg-orange-500/20 text-orange-500 status-badge font-bold animate-pulse";
            }
            if(elementos.toggleONOFF) {
                elementos.toggleONOFF.disabled = true;
                elementos.toggleONOFF.checked = false;
            }
            detenerTracking();
            if(elementos.radarSection) elementos.radarSection.classList.add("hidden");
            
            if(elementos.seccionBolsa) {
                elementos.seccionBolsa.classList.remove("hidden");
                elementos.seccionBolsa.innerHTML = `
                    <div class="p-6 bg-orange-900/10 border border-orange-500/50 rounded-2xl shadow-xl shadow-orange-900/20 animate-fade-in">
                        <div class="text-center mb-6">
                            <i class="fas fa-file-signature text-orange-500 text-4xl mb-3"></i>
                            <h3 class="text-white font-black text-xl tracking-tight uppercase">Acción Requerida</h3>
                            <p class="text-gray-400 text-xs mt-2">Hemos detectado que tu expediente oficial está incompleto. Por regulaciones de seguridad (KYC) y operativas, es obligatorio completar todos los datos para activar tu radar.</p>
                        </div>
                        
                        <div class="space-y-4 text-left h-96 overflow-y-auto pr-2">
                            <div class="bg-black p-4 rounded-xl border ${fotoUrl ? 'border-emerald-900/50' : 'border-red-900/50'}">
                                <label class="block text-[10px] font-bold ${fotoUrl ? 'text-emerald-500' : 'text-red-500'} mb-2 uppercase tracking-widest">
                                    1. Foto de Perfil (Selfie) ${fotoUrl ? '✅ CUBIERTO' : '❌ FALTANTE'}
                                </label>
                                ${fotoUrl ? '<p class="text-[10px] text-gray-500">Documento en regla y validado.</p>' : '<input type="file" id="compFoto" accept="image/*" class="text-xs text-gray-300 file:bg-zinc-800 file:text-white file:border-0 file:py-1 file:px-3 file:rounded-lg w-full">'}
                            </div>
                            <div class="bg-black p-4 rounded-xl border ${ineUrl ? 'border-emerald-900/50' : 'border-red-900/50'}">
                                <label class="block text-[10px] font-bold ${ineUrl ? 'text-emerald-500' : 'text-red-500'} mb-2 uppercase tracking-widest">
                                    2. Identificación Oficial (INE Frontal) ${ineUrl ? '✅ CUBIERTO' : '❌ FALTANTE'}
                                </label>
                                ${ineUrl ? '<p class="text-[10px] text-gray-500">Documento en regla y validado.</p>' : '<input type="file" id="compINE" accept="image/*" class="text-xs text-gray-300 file:bg-zinc-800 file:text-white file:border-0 file:py-1 file:px-3 file:rounded-lg w-full">'}
                            </div>
                            <div class="bg-black p-4 rounded-xl border ${csfUrl ? 'border-emerald-900/50' : 'border-red-900/50'}">
                                <label class="block text-[10px] font-bold ${csfUrl ? 'text-emerald-500' : 'text-red-500'} mb-2 uppercase tracking-widest">
                                    3. Constancia de Situación Fiscal (CSF) ${csfUrl ? '✅ CUBIERTO' : '❌ FALTANTE'}
                                </label>
                                ${csfUrl ? '<p class="text-[10px] text-gray-500">Documento en regla y validado.</p>' : '<input type="file" id="compCSF" accept="image/*, application/pdf" class="text-xs text-gray-300 file:bg-zinc-800 file:text-white file:border-0 file:py-1 file:px-3 file:rounded-lg w-full">'}
                            </div>
                            <div class="bg-black p-4 rounded-xl border ${banco && clabe ? 'border-emerald-900/50' : 'border-red-900/50'}">
                                <label class="block text-[10px] font-bold ${banco && clabe ? 'text-emerald-500' : 'text-red-500'} mb-2 uppercase tracking-widest">
                                    4. Datos Bancarios ${banco && clabe ? '✅ CUBIERTO' : '❌ FALTANTE'}
                                </label>
                                ${banco && clabe ? '<p class="text-[10px] text-gray-500">Datos registrados y validados.</p>' : `
                                <input type="text" id="compBanco" placeholder="Nombre del Banco" class="mb-2 w-full text-xs text-white bg-zinc-800 border-0 py-2 px-3 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                                <input type="text" id="compClabe" placeholder="Cuenta CLABE (18 dígitos)" class="w-full text-xs text-white bg-zinc-800 border-0 py-2 px-3 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                                `}
                            </div>
                            <div class="bg-black p-4 rounded-xl border ${vehiculoTipo && (esPeaton || placas) ? 'border-emerald-900/50' : 'border-red-900/50'}">
                                <label class="block text-[10px] font-bold ${vehiculoTipo && (esPeaton || placas) ? 'text-emerald-500' : 'text-red-500'} mb-2 uppercase tracking-widest">
                                    5. Logística Operativa ${vehiculoTipo && (esPeaton || placas) ? '✅ CUBIERTO' : '❌ FALTANTE'}
                                </label>
                                ${vehiculoTipo && (esPeaton || placas) ? `<p class="text-[10px] text-gray-500">${esPeaton ? 'Operación peatonal registrada; no requiere placas.' : 'Vehículo registrado.'}</p>` : `
                                <select id="compVehiculo" class="mb-2 w-full text-xs text-white bg-zinc-800 border-0 py-2 px-3 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                                    <option value="">Selecciona tipo de vehículo...</option>
                                    <option value="peaton">Peatón / sin vehículo</option>
                                    <option value="Motocicleta">Motocicleta</option>
                                    <option value="Auto">Automóvil</option>
                                    <option value="Camioneta">Camioneta</option>
                                    <option value="Bicicleta">Bicicleta</option>
                                </select>
                                <input type="text" id="compPlacas" placeholder="Placas del vehículo" class="w-full text-xs text-white bg-zinc-800 border-0 py-2 px-3 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                                `}
                            </div>
                            <div class="bg-black p-4 rounded-xl border ${esPeaton || licenciaUrl ? 'border-emerald-900/50' : 'border-red-900/50'}">
                                <label class="block text-[10px] font-bold ${esPeaton || licenciaUrl ? 'text-emerald-500' : 'text-red-500'} mb-2 uppercase tracking-widest">
                                    6. Licencia de Conducir ${esPeaton || licenciaUrl ? '✅ CUBIERTO' : '❌ FALTANTE'}
                                </label>
                                ${esPeaton ? '<p class="text-[10px] text-gray-500">No aplica para técnico peatón.</p>' : (licenciaUrl ? '<p class="text-[10px] text-gray-500">Documento en regla.</p>' : '<input type="file" id="compLicencia" accept="image/*, application/pdf" class="text-xs text-gray-300 file:bg-zinc-800 file:text-white file:border-0 file:py-1 file:px-2 file:rounded-lg w-full">')}
                            </div>
                            <div class="bg-black p-4 rounded-xl border border-zinc-800">
                                <label class="block text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-widest">
                                    7. Certificados / DC-3 (Opcional) ${certificados.length ? '✅ ADJUNTOS' : ''}
                                </label>
                                <input type="file" id="compCertificado" accept="image/*, application/pdf" class="text-xs text-gray-300 file:bg-zinc-800 file:text-white file:border-0 file:py-1 file:px-2 file:rounded-lg w-full">
                            </div>
                        </div>
                        <button onclick="window.completarDocumentosTecnico('${user.uid}')" id="btnCompletarDocs" class="w-full mt-4 bg-orange-600 hover:bg-orange-500 text-white font-black py-4 rounded-xl text-sm transition-transform active:scale-95 shadow-lg flex justify-center items-center gap-2">
                            <i class="fas fa-cloud-upload-alt text-lg"></i> SUBIR Y ENVIAR A REVISIÓN
                        </button>
                    </div>
                `;
            }
            return; 
        }

        if ([TECHNICIAN_KYC_STATES.PENDING_REVIEW, TECHNICIAN_KYC_STATES.DOCUMENTS_UPLOADED].includes(estado)) {
            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "EN REVISIÓN";
                elementos.statusLabel.className = "bg-yellow-500/20 text-yellow-500 status-badge font-bold";
            }
            if(elementos.toggleONOFF) {
                elementos.toggleONOFF.disabled = true;
                elementos.toggleONOFF.checked = false;
            }
            if(elementos.radarSection) elementos.radarSection.classList.add("hidden");
            if(elementos.seccionBolsa) {
                elementos.seccionBolsa.innerHTML = `
                <div class="p-6 bg-yellow-900/10 border border-yellow-500/30 rounded-2xl text-center">
                    <i class="fas fa-lock text-yellow-500 text-2xl mb-2"></i>
                    <p class="text-yellow-500 text-sm font-bold">Cuenta en Revisión</p>
                    <p class="text-gray-500 text-xs mt-1">El administrador está validando tus documentos oficiales.</p>
                </div>
                `;
            }
            return;
        }

        if (elementos.toggleONOFF) {
            elementos.toggleONOFF.disabled = false;
            elementos.toggleONOFF.checked = data.disponible === true;
        }

        if (data.disponible) {
            iniciarTracking(user.uid);
            elementos.seccionBolsa?.classList.remove("hidden");
            escucharBolsa(user, elementos.listaBolsa); 

            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "EN LÍNEA";
                elementos.statusLabel.className = "bg-emerald-500/20 text-emerald-500 status-badge font-bold animate-pulse";
            }
            elementos.radarSection?.classList.remove("opacity-50", "grayscale");
        } else {
            detenerTracking();
            elementos.seccionBolsa?.classList.add("hidden");

            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "OFFLINE";
                elementos.statusLabel.className = "bg-red-500/20 text-red-500 status-badge font-bold";
            }
            elementos.radarSection?.classList.add("opacity-50", "grayscale");
        }
    });

    window.completarDocumentosTecnico = async (uid) => {
        const btn = document.getElementById("btnCompletarDocs");
        
        const iFoto = document.getElementById("compFoto")?.files[0];
        const iINE = document.getElementById("compINE")?.files[0];
        const iCSF = document.getElementById("compCSF")?.files[0];
        const iLicencia = document.getElementById("compLicencia")?.files[0];
        const iCertificado = document.getElementById("compCertificado")?.files[0];

        const vBanco = document.getElementById("compBanco")?.value.trim();
        const vClabe = document.getElementById("compClabe")?.value.trim();
        const vVehiculo = document.getElementById("compVehiculo")?.value;
        const vPlacas = document.getElementById("compPlacas")?.value.trim();

        const reqFoto = document.getElementById("compFoto") && !iFoto;
        const reqINE = document.getElementById("compINE") && !iINE;
        const reqCSF = document.getElementById("compCSF") && !iCSF;
        const tipoVehiculoSeleccionado = String(vVehiculo || vehiculoTipo || "").toLowerCase();
        const seleccionPeaton = tipoVehiculoSeleccionado === "peaton" || tipoVehiculoSeleccionado === "peatón";
        const reqLicencia = !seleccionPeaton && document.getElementById("compLicencia") && !iLicencia;
        const reqBanco = document.getElementById("compBanco") && !vBanco;
        const reqClabe = document.getElementById("compClabe") && !vClabe;
        const reqVehiculo = document.getElementById("compVehiculo") && !vVehiculo;
        const reqPlacas = !seleccionPeaton && document.getElementById("compPlacas") && !vPlacas;

        if (reqFoto || reqINE || reqCSF || reqLicencia || reqBanco || reqClabe || reqVehiculo || reqPlacas) {
            alert("⚠️ Debes completar todos los datos de texto y seleccionar todos los archivos faltantes marcados con ❌.");
            return;
        }

        if (!storage) {
            alert("❌ Error: Firebase Storage no está configurado.");
            return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SUBIENDO A LA NUBE...';
        btn.disabled = true;

        try {
            const subirAStorage = async (file, path) => {
                if (!file) return null;
                const storageRef = ref(storage, path);
                await uploadBytes(storageRef, file);
                return await getDownloadURL(storageRef);
            };

            const updates = {};
            updates['documentos.fecha_actualizacion'] = serverTimestamp();

            if (iFoto) {
                const urlF = await subirAStorage(iFoto, storagePathForTechnicianDocument(uid, "foto_perfil", iFoto.name));
                updates['foto_perfil'] = urlF;
            }
            if (iINE) {
                const urlI = await subirAStorage(iINE, storagePathForTechnicianDocument(uid, "ine", iINE.name));
                updates['documentos.ine'] = urlI;
            }
            if (iCSF) {
                const urlC = await subirAStorage(iCSF, storagePathForTechnicianDocument(uid, "csf", iCSF.name));
                updates['documentos.csf'] = urlC;
            }
            if (iLicencia) {
                const urlL = await subirAStorage(iLicencia, storagePathForTechnicianDocument(uid, "licencia", iLicencia.name));
                updates['documentos.licencia'] = urlL;
            }
            if (iCertificado) {
                const urlCert = await subirAStorage(iCertificado, storagePathForTechnicianDocument(uid, `certificado_${Date.now()}`, iCertificado.name));
                updates['documentos.certificados'] = arrayUnion(urlCert);
            }
            
            if (vBanco) updates['datos_bancarios.banco'] = vBanco;
            if (vClabe) updates['datos_bancarios.clabe'] = vClabe;
            if (vVehiculo) updates['vehiculo.tipo'] = vVehiculo.toLowerCase();
       if (vPlacas) {
                // 🛡️ LIMPIEZA SNIPER: Mayúsculas, sin espacios y sin basura.
                // Jonathan solo tendrá que tocar y pegar en la app de su caseta.
                const placasLimpias = vPlacas.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                updates['vehiculo.placas'] = placasLimpias;
            }

            updates['estado'] = TECHNICIAN_KYC_STATES.PENDING_REVIEW;
            updates['status'] = TECHNICIAN_KYC_STATES.PENDING_REVIEW;
            updates['disponible'] = false;
            updates['kyc.estado'] = TECHNICIAN_KYC_STATES.PENDING_REVIEW;
            updates['kyc.aprobado'] = false;
            updates['kyc.ultimo_error'] = null;

            await updateDoc(doc(db, "users", uid), updates);
            alert("✅ ¡Expediente Completado!\n\nLos documentos se han subido con éxito. El Administrador validará tu cuenta en breve.");
            
        } catch (error) {
            console.error("Error crítico subiendo documentos:", error);
            alert("Error al subir los documentos. Asegúrate de tener conexión a internet estable.");
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt text-lg"></i> REINTENTAR SUBIDA';
            btn.disabled = false;
        }
    };


    const qWallet = query(collection(db, "transacciones"), where("tecnico_id", "==", user.uid));
    const qRetirosPendientes = query(collection(db, "retiros"), where("tecnico_id", "==", user.uid), where("estado", "==", "pendiente"));
    
    let saldoBrutoDisponible = 0;
    let saldoRetenido = 0;
    let retirosEnProceso = 0;

    onSnapshot(qWallet, (snap) => {
        saldoBrutoDisponible = 0;
        saldoRetenido = 0;
        const ahora = new Date();

        snap.forEach(docSnap => {
            const tx = docSnap.data();
            const monto = (tx.pago_tecnico || 0);
            
            if (tx.tipo === "retiro_fondos" || tx.tipo === "penalizacion" || tx.tipo === "abono_deuda" || tx.tipo === "abono_stripe") { 
                saldoBrutoDisponible += monto; 
            } else {
                if (tx.fecha && tx.fecha.toDate) {
                    const fechaTx = tx.fecha.toDate();
                    const diffHoras = Math.abs(ahora - fechaTx) / 36e5;

                    if (diffHoras >= 24) {
                        saldoBrutoDisponible += monto;
                    } else {
                        saldoRetenido += monto;
                    }
                } else {
                    saldoRetenido += monto;
                }
            }
        });
        
        actualizarUIWallet();
    });

    onSnapshot(qRetirosPendientes, (snap) => {
        retirosEnProceso = 0;
        snap.forEach(docSnap => {
            retirosEnProceso += docSnap.data().monto;
        });
        actualizarUIWallet();
    });

    function actualizarUIWallet() {
        const saldoRealDisponible = saldoBrutoDisponible - retirosEnProceso;
        window.saldoActualTecnico = saldoRealDisponible;

        let saldoFormat = saldoRealDisponible < 0 ? "-$" + Math.abs(saldoRealDisponible).toFixed(2) : "$" + saldoRealDisponible.toFixed(2);

        if(elementos.walletLabel) {
            elementos.walletLabel.innerHTML = `
            ${saldoFormat}
            <span class="text-[9px] text-gray-400 block font-normal">EN PROCESO: $${saldoRetenido.toFixed(2)}</span>
            `;
            
            if(saldoRealDisponible <= -1000) {
                elementos.walletLabel.classList.add("animate-pulse", "text-red-500"); 
            } else {
                elementos.walletLabel.classList.remove("animate-pulse", "text-red-500");
            }
        }

        if(elementos.btnRetiro) {
            if(retirosEnProceso > 0) {
                elementos.btnRetiro.disabled = true;
                elementos.btnRetiro.onclick = null;
            } 
            else if(saldoRealDisponible > 0) {
                elementos.btnRetiro.disabled = false;
                elementos.btnRetiro.onclick = async () => {
                    if(!confirm(`¿Deseas solicitar el retiro de $${saldoRealDisponible.toFixed(2)} a tu cuenta vía SPEI?`)) return;
                    elementos.btnRetiro.disabled = true;
                    try {
                        await addDoc(collection(db, "retiros"), {
                            tecnico_id: user.uid,
                            tecnico_nombre: user.nombre || "Técnico",
                            monto: saldoRealDisponible,
                            estado: "pendiente",
                            fecha_solicitud: serverTimestamp()
                        });
                        alert("✅ Solicitud de retiro enviada con éxito.");
                    } catch (error) {
                        console.error("Error al solicitar retiro:", error);
                        alert("❌ Hubo un error al procesar tu solicitud. Intenta de nuevo.");
                        elementos.btnRetiro.disabled = false;
                    }
                };
            } else {
                elementos.btnRetiro.disabled = true;
                elementos.btnRetiro.onclick = null;
            }
        }
    }

    if (elementos.listaMisRetiros && elementos.contenedorHistorialRetiros) {
        const qMisRetiros = query(
            collection(db, "retiros"),
            where("tecnico_id", "==", user.uid),
            where("estado", "==", "aprobado"),
            orderBy("fecha_aprobacion", "desc")
        );

        onSnapshot(qMisRetiros, (snap) => {
            elementos.listaMisRetiros.innerHTML = "";
            if(snap.empty) {
                elementos.contenedorHistorialRetiros.classList.add("hidden");
                return;
            }

            elementos.contenedorHistorialRetiros.classList.remove("hidden");

            snap.forEach(docSnap => {
                const ret = docSnap.data();
                const id = docSnap.id;
                
                let fechaFormat = "";
                if(ret.fecha_aprobacion) {
                    const dateObj = new Date(ret.fecha_aprobacion.seconds * 1000);
                    fechaFormat = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                }

                const item = document.createElement("div");
                item.className = "flex justify-between items-center bg-zinc-900 border border-zinc-800 p-3 rounded-xl shadow-lg";
                item.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-emerald-900/30 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                        <i class="fas fa-check text-xs"></i>
                    </div>
                    <div>
                        <p class="text-white font-bold text-sm">$${ret.monto.toFixed(2)}</p>
                        <p class="text-[9px] text-gray-500">${fechaFormat} • LIQUIDADO</p>
                    </div>
                </div>
                <button onclick="window.generarPDFRetiro('${id}')" class="text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-2 rounded-lg text-[10px] font-bold transition-colors flex items-center gap-1 border border-emerald-500/30 shadow">
                    <i class="fas fa-download"></i> PDF
                </button>
                `;
                elementos.listaMisRetiros.appendChild(item);
            });
        }, (error) => {
            console.warn("Falta índice compuesto para historial de retiros del técnico.", error);
            elementos.listaMisRetiros.innerHTML = '<p class="text-red-500 text-[10px] text-center p-2 border border-red-500/30 rounded-xl bg-red-900/10">Construyendo índice en Firebase... (Recarga en 3 min)</p>';
            elementos.contenedorHistorialRetiros.classList.remove("hidden");
        });
    }

    if (elementos.listaMisTickets) {
        const qMisTickets = query(
            collection(db, "services"),
            where("tecnico_id", "==", user.uid),
            where("estado", "==", "finalizado"),
            orderBy("finalizado_at", "desc")
        );

        onSnapshot(qMisTickets, (snap) => {
            elementos.listaMisTickets.innerHTML = "";
            if(snap.empty) {
                elementos.listaMisTickets.innerHTML = '<p class="text-gray-600 text-[10px] text-center italic py-4">Aún no tienes servicios finalizados.</p>';
                return;
            }

            snap.forEach(docSnap => {
                const s = docSnap.data();
                const id = docSnap.id;
                
                let fechaFormat = "";
                const ahora = new Date();
                let esRetenido = true;

                if(s.finalizado_at) {
                    const dateObj = new Date(s.finalizado_at.seconds * 1000);
                    fechaFormat = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    
                    const diffHoras = Math.abs(ahora - dateObj) / 36e5;
                    if (diffHoras >= 24) esRetenido = false;
                }

                const badgeStatus = '<span class="bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 text-[8px] px-2 py-0.5 rounded font-black tracking-widest uppercase"><i class="fas fa-check-circle"></i> COBRADO</span>';

                const item = document.createElement("div");
                item.className = "bg-zinc-900 border border-zinc-800 p-3 rounded-xl shadow-lg mb-3";
                
                item.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <span class="text-white font-bold text-xs uppercase">${escaparHTML(s.categoria)} | ${escaparHTML(s.sub_servicio || 'GRAL')}</span>
                    ${badgeStatus}
                </div>
                <div class="flex justify-between items-end">
                    <div>
                        <p class="text-[9px] text-gray-500 mb-1"><i class="fas fa-calendar-alt"></i> ${fechaFormat}</p>
                        <p class="text-[9px] text-gray-500"><i class="fas fa-hashtag"></i> Folio: ${s.folio_fiscal || id.substring(0,6).toUpperCase()}</p>
                    </div>
                </div>
                <div class="flex justify-between items-end mt-3 pt-3 border-t border-zinc-800/50">
                    <button onclick="window.generarPDFComisionTecnico('${id}', '${user.uid}', '${user.nombre || 'Técnico'}')" class="text-blue-500 hover:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-2 rounded-lg text-[10px] font-bold transition-colors flex items-center gap-1 border border-blue-500/30 shadow">
                        <i class="fas fa-file-invoice-dollar"></i> RECIBO FEE (GP)
                    </button>
                    <div class="text-right">
                        <p class="text-[10px] text-gray-500 mb-0.5 uppercase font-bold">Cobro ${s.metodo_pago === 'stripe' ? 'Stripe' : 'en Efectivo'}:</p>
                        <p class="${s.metodo_pago === 'stripe' ? 'text-blue-400' : 'text-emerald-400'} font-black text-sm">$${s.costo_final ? s.costo_final.toFixed(2) : '0.00'}</p>
                    </div>
                </div>
                `;
                elementos.listaMisTickets.appendChild(item);
            });
        }, (error) => {
            console.warn("Falta índice compuesto para historial de tickets del técnico.", error);
            elementos.listaMisTickets.innerHTML = '<p class="text-red-500 text-[10px] text-center p-2 border border-red-500/30 rounded-xl bg-red-900/10">Construyendo índice de tickets en Firebase... (Recarga en 3 min)</p>';
        });
    }

    if (elementos.toggleONOFF) {
        elementos.toggleONOFF.addEventListener("change", async (e) => {
            await updateDoc(tecnicoRef, {
                disponible: e.target.checked,
                last_seen: serverTimestamp()
            });
        });
    }

    function escucharBolsa(tecnico, contenedor) {
    if(!contenedor) return;

        // B2B conserva services; B2C consume sólo una proyección sin datos privados.
        const qB2B = query(
            collection(db, "services"),
            where("tipo", "==", "mantenimiento"),
            limit(50)
        );
        const qB2C = query(
            collection(db, "service_marketplace"),
            where("estado", "==", "disponible"),
            limit(50)
        );
        let documentosB2B = [];
        let documentosB2C = [];
        let inicialB2B = true;
        let inicialB2C = true;

        const renderizarBolsa = () => {
            if(!contenedor) return;
            contenedor.innerHTML = "";
            let counter = 0;
            const documentos = [
                ...documentosB2B.filter(snapshot => ["pendiente", "pagado"].includes(snapshot.data().estado)),
                ...documentosB2C
            ];

            if(documentos.length === 0) {
                contenedor.innerHTML = `<p class="text-gray-600 text-[10px] text-center italic py-4">Escaneando zona... esperando solicitudes.</p>`;
                return;
            }

            documentos.forEach((docSnap) => {
                const s = docSnap.data();
                const id = docSnap.id;

                // 1. FILTROS GENERALES DE ASIGNACIÓN

//if (s.tecnico_id && s.tecnico_id !== tecnico.uid) return;

if (s.rejected_by && s.rejected_by.includes(tecnico.uid)) return;
if (s.tipo === "b2c_discovery") {
    const ocultos = JSON.parse(localStorage.getItem(`b2c_marketplace_hidden_${tecnico.uid}`) || "[]");
    if (ocultos.includes(id)) return;
}

const skillServicio = (s.categoria_id || s.categoria || "").toLowerCase();

const skillsTecnico = (tecnico.skills || []).map(x => x.toLowerCase());

const permitido = skillsTecnico.some(skill =>
    skillServicio.includes(skill) || skill.includes(skillServicio)
);

if (!permitido) return;

                // 2. VISOR TÁCTICO DE FOTO Y URGENCIA (Compartido para ambos mundos)
                let badgeUrgencia = s.urgencia ? `<span class="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase shadow-[0_0_8px_rgba(220,38,38,0.8)] ml-2 animate-pulse"><i class="fas fa-fire"></i> EMERGENCIA</span>` : '';
                
                let previewFotoHTML = '';
                if (s.foto_problema) {
                    previewFotoHTML = `
                    <div class="mt-3 mb-3">
                        <p class="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2"><i class="fas fa-camera"></i> Evidencia Inicial del Cliente:</p>
                        <div class="w-full h-40 rounded-xl overflow-hidden border border-blue-900/50 relative">
                            <img src="${s.foto_problema}" class="w-full h-full object-cover">
                            <a href="${s.foto_problema}" target="_blank" class="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-white px-3 py-1 rounded text-[9px] font-bold border border-white/20 hover:bg-black transition-colors"><i class="fas fa-expand"></i> VER COMPLETA</a>
                        </div>
                    </div>`;
                }

                counter++; 

                // 3. EL ENRUTADOR VISUAL (AQUÍ SEPARADOS EL B2B DEL B2C)
                const card = document.createElement("div");
                const destinoBolsa = getConfirmedServiceDestination(s);

                if (s.tipo === 'mantenimiento') {
                    // ==========================================
                    // MUNDO B2B: MANTENIMIENTO INTERNO (RESIDENCIAL)
                    // ==========================================
                    
                    // Filtro de seguridad: Si no es de su condominio, lo ignoramos
                    if (s.residencialId && s.residencialId !== tecnico.residencialId) {
                        counter--; 
                        return; 
                    }

                    let badgeMaint = '<span class="bg-amber-500 text-black text-[10px] font-black px-2 py-0.5 rounded uppercase shadow-[0_0_8px_rgba(245,158,11,0.8)]"><i class="fas fa-tools"></i> MANTENIMIENTO INTERNO</span>';
                    
                    card.className = "w-full"; // Contenedor transparente
                    card.innerHTML = `
<div class="bg-zinc-800/90 rounded-xl md:rounded-2xl p-3 md:p-4 mb-3 md:mb-4 border border-zinc-700/50 relative overflow-hidden shadow-lg backdrop-blur-sm">

    <div class="absolute left-0 top-0 bottom-0 w-1 md:w-1.5 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]"></div>

    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-3 pl-2">

        <div class="flex flex-col gap-1 min-w-0">

            <div class="flex gap-2 flex-wrap">
                ${badgeMaint}
                ${badgeUrgencia}
            </div>

            <span class="text-zinc-400 text-[10px] uppercase font-bold tracking-wider mt-1">
                ID Tarea: #${id.substring(0,6)}
            </span>

        </div>

        <div class="bg-zinc-900/80 px-2 py-1 rounded text-[10px] text-zinc-300 font-mono border border-zinc-700/50 self-start">
            <i class="fas fa-clock text-amber-500 mr-1"></i>
            PENDIENTE
        </div>

    </div>

    <div class="pl-2 mb-2 mt-1 md:mt-3">

        <h3 class="text-white font-black text-base md:text-lg leading-tight mb-2 tracking-wide uppercase break-words">
            ${s.titulo || "Tarea sin título"}
        </h3>

        <p class="text-zinc-300 text-xs md:text-sm flex items-center gap-2 font-medium bg-zinc-900/50 p-2 rounded-lg border border-zinc-800 inline-flex flex-wrap mb-2 max-w-full">
            <i class="fas fa-microchip text-amber-500 shrink-0"></i>
            Equipo:
            <span class="text-amber-400 font-bold break-all">
                ${s.activoId || "No especificado"}
            </span>
        </p>

    </div>

    <div class="pl-2">
        ${previewFotoHTML}
    </div>

    <div class="pl-2 flex mt-3 md:mt-4">

        <button
            onclick="iniciarMantenimiento('${id}')"
            class="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-black font-black py-2.5 md:py-3 rounded-xl shadow-[0_0_15px_rgba(245,158,11,0.4)] hover:shadow-[0_0_20px_rgba(245,158,11,0.6)] active:scale-95 transition-all flex items-center justify-center gap-2 uppercase text-xs md:text-sm"
        >
            <i class="fas fa-wrench text-sm md:text-lg"></i>
            Iniciar Tarea
        </button>

    </div>

</div>
`;                

} else {
    
                    // ==========================================
                    // MUNDO B2C: SERVICIOS PÚBLICOS (FIX, ROAD, TECH)
                    // ==========================================
                    
                    let badgeMetodo = s.metodo_pago === 'stripe'
                        ? '<span class="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase shadow-[0_0_8px_rgba(37,99,235,0.8)]"><i class="fab fa-stripe-s"></i> PAGADO STRIPE</span>'
                        : '<span class="bg-emerald-500 text-black text-[10px] font-black px-2 py-0.5 rounded uppercase shadow-[0_0_8px_rgba(16,185,129,0.8)]"><i class="fas fa-money-bill"></i> PAGO EFECTIVO</span>';

                    let btnAceptar = s.metodo_pago === 'stripe'
                        ? `<button class="flex-[4] bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-lg text-xs uppercase transition-all transform active:scale-95" onclick="window.tomarServicio('${id}', '${tecnico.uid}', '${tecnico.nombre}', 'stripe')">ACEPTAR TICKET</button>`
                        : `<button class="flex-[4] bg-emerald-500 hover:bg-emerald-400 text-black font-black py-3 rounded-lg text-xs uppercase transition-all transform active:scale-95" onclick="window.tomarServicio('${id}', '${tecnico.uid}', '${tecnico.nombre}', 'efectivo')">ACEPTAR TICKET</button>`;

                    card.className = `bg-zinc-900 border ${s.urgencia ? 'border-red-500 shadow-red-900/30' : (s.metodo_pago === 'stripe' ? 'border-blue-500 shadow-blue-900/20' : 'border-emerald-500 shadow-emerald-900/20')} p-4 rounded-xl mb-3 shadow-lg transition-transform`;

                    card.innerHTML = `
                    <div class="flex justify-between items-center mb-2">
                        <div>
                            ${badgeMetodo}
                            ${badgeUrgencia}
                        </div>
                        <span class="text-white font-bold text-xs">${s.categoria ? escaparHTML(s.categoria.toUpperCase()) : 'GENERAL'}</span>
                    </div>
                    <h4 class="text-white font-bold text-base mb-1">${escaparHTML(s.zona || 'Cancún')}</h4>
                    <p class="text-gray-300 text-sm mb-2 font-medium">${escaparHTML(s.sub_servicio || 'Servicio técnico')}</p>
                    
                    ${previewFotoHTML}

                    <div class="flex items-center gap-2 mb-3 mt-2 text-xs text-gray-500">
                        <i class="fas fa-map-marker-alt"></i> ${escaparHTML(destinoBolsa?.direccion || s.zona || 'Zona no especificada')}
                    </div>
                    
                    <div class="flex gap-2">
                        <button class="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 font-bold py-3 rounded-lg text-xs transition-colors" onclick="window.rechazarServicio('${id}', '${tecnico.uid}', this)">
                            <i class="fas fa-times"></i>
                        </button>
                        ${btnAceptar}
                    </div>
                    `;
                }

                // Inyectamos la tarjeta final al contenedor
                contenedor.appendChild(card);
            });
            if (counter === 0) {
                contenedor.innerHTML = `<p class="text-gray-600 text-[10px] text-center italic py-4">No hay solicitudes disponibles para tu perfil.</p>`;
            }

        };

        const escucharFuente = (consulta, asignar, esInicial, marcarInicial) => onSnapshot(
            consulta,
            snap => {
                const hayNuevos = snap.docChanges().some(change => change.type === "added");
                if (!esInicial() && hayNuevos) {
                    sonarAlerta();
                    lanzarNotificacionPush("¡NUEVA SOLICITUD!", "Tienes un servicio o mantenimiento pendiente.");
                }
                asignar(snap.docs);
                marcarInicial();
                renderizarBolsa();
            },
            error => {
                console.error("No se pudo leer una fuente de la bolsa:", error);
                renderizarBolsa();
            }
        );

        escucharFuente(qB2B, docs => { documentosB2B = docs; }, () => inicialB2B, () => { inicialB2B = false; });
        escucharFuente(qB2C, docs => { documentosB2C = docs; }, () => inicialB2C, () => { inicialB2C = false; });
    }

    window.rechazarServicio = async (id, uid, boton = null) => {
        if(!confirm("¿Estás seguro de ocultar esta solicitud?\n\nNo podrás verla nuevamente, pero seguirá disponible para otros técnicos.")) return;
        const key = `b2c_marketplace_hidden_${uid}`;
        const ocultos = new Set(JSON.parse(localStorage.getItem(key) || "[]"));
        ocultos.add(id);
        localStorage.setItem(key, JSON.stringify([...ocultos].slice(-200)));
        boton?.closest(".bg-zinc-900")?.remove();
    };

  // 🔥 INYECCIÓN B2B: LECTURA DE PERFIL PARA SPLIT BILLING SIN QUEMAR REGLAS Y PASE QR 🔥
  window.iniciarMantenimiento = async (idServicio) => {
        console.log("🛠️ Iniciando cirugía técnica para el servicio:", idServicio);
        try {
            // Obtenemos los datos fiscales y logísticos del técnico desde su propio perfil
            const miPerfilSnap = await getDoc(doc(db, "users", user.uid));
            const miPerfil = miPerfilSnap.exists() ? miPerfilSnap.data() : {};

            const nombreFiscal = miPerfil.nombre_fiscal || miPerfil.nombre || user.nombre || "Técnico Residencial";
            const rfcTech = miPerfil.rfc || "XAXX010101000";
            const logoFactura = miPerfil.logo_factura || null;
            
            // 🔥 NUEVO: DATOS VEHICULARES PARA EL PASE QR
            const vehiculoTech = miPerfil.logistica?.vehiculo || miPerfil.vehiculo_tipo || "NO ESPECIFICADO";
            const placasTech = miPerfil.logistica?.placas || miPerfil.placas || "SIN PLACAS";

            // 🔒 CANDADO JONATHAN: Verificación de placas para acceso a caseta
            if (!placasTech || placasTech === "SIN PLACAS") {
                alert("⛔ ACCESO DENEGADO (PASE QR)\n\nEl sistema de seguridad de Jonathan (Caseta) requiere que tengas tus placas registradas para aceptar este servicio.\n\nPor favor, completa tu perfil en la sección de 'Registro Incompleto'.");
                return;
            }

            // ¡AQUÍ ESTÁ LA MAGIA! Apuntando 100% a la colección "services"
            const servicioRef = doc(db, "services", idServicio);
            
            // 🛡️ BLINDAJE B2B: Inyectamos los datos comerciales y de vehículo para que el servidor no lo rechace
            await updateDoc(servicioRef, {
                estado: "trabajando",
                tecnico_id: user.uid, 
                tecnico_nombre: user.nombre || "Técnico Residencial",
                tecnico_nombre_fiscal: nombreFiscal, // 👈 INYECCIÓN PARA PDF CLIENTE
                tecnico_rfc: rfcTech,                // 👈 INYECCIÓN PARA PDF CLIENTE
                tecnico_logo_factura: logoFactura,   // 👈 INYECCIÓN PARA PDF CLIENTE
                tecnico_vehiculo: vehiculoTech,      // 🔥 INYECCIÓN PARA PASE QR
                tecnico_placas: placasTech,          // 🔥 INYECCIÓN PARA PASE QR
                metodo_pago: "b2b", // 👈 LA LLAVE MAESTRA para el Split Billing
                cliente_id: "admin_residencial", // 👈 Relleno de seguridad para el servidor
                tipo: "mantenimiento",
                fecha_inicio: serverTimestamp(),
                actualizado_at: serverTimestamp()
            });

            console.log("✅ Servicio iniciado y anclado al servidor.");
            alert("¡Mantenimiento iniciado! Pasa a la sección de misiones.");

        } catch (error) {
            console.error("❌ Error al iniciar el servicio:", error);
            alert("Hubo un problema. Intenta de nuevo.");
        }
    };

    // B2C: el backend es la autoridad de validación y de la transacción de claim.
    window.tomarServicio = async (id, uid) => {
        if (uid !== user.uid) {
            alert("⛔ La identidad del técnico no coincide con la sesión activa.");
            return;
        }
        if (window.saldoActualTecnico <= -1000) {
            alert("⛔ BLOQUEO FINANCIERO OPERATIVO\n\nTu saldo negativo ha superado el límite de -$1,000 MXN.\n\nPor políticas de GestiaPremium, debes liquidar tus comisiones pendientes para volver a aceptar servicios.");
            return;
        }

        let mensajeConfirmacion = "¿Deseas aceptar esta misión de servicio?\n\nRecuerda: Es OBLIGATORIO elaborar el diagnóstico y la cotización al llegar al sitio.";

        if(!confirm(mensajeConfirmacion)) return;
        
        try {
            await reclamarServicioB2C(id);
            console.log("🚀 Transacción Atómica Exitosa: Ticket asegurado.");
        } catch (error) {
            console.error(error);
            if (error?.code === "functions/already-exists" || error?.code === "functions/not-found") {
                alert("💥 ¡COLISIÓN EVITADA!\n\nFuiste demasiado lento. Otro técnico aceptó este servicio milisegundos antes que tú.");
            } else {
                alert(error?.message || "Error al procesar la solicitud en el servidor. Intenta de nuevo.");
            }
        }
    };

    // 🚀 BYPASS V5.18: Quitamos el 'in' para evitar el bloqueo del Índice Compuesto
    const qMisiones = query(
        collection(db, "services"),
        where("tecnico_id", "==", user.uid)
    );

    // 🔥 CANDADO DE SPAM INICIAL 🔥
    let cargaInicialMisiones = true;

    // 🚨 VIGILANTE DE MISIONES MEJORADO 🚨
    onSnapshot(qMisiones, (snap) => {
        const ls = elementos.listaServicios;
        const pa = elementos.panelAcciones;

        if (!ls) return;
        ls.innerHTML = "";

        if (snap.empty) {
            if(pa) pa.classList.add("translate-y-full");
            cargaInicialMisiones = false;
            return;
        }

        if(pa) pa.classList.remove("translate-y-full");

        snap.docChanges().forEach(change => {
            const sData = change.doc.data();
            if (sData.oculto_para_tecnico) return; 

            // 🔥 ALARMA DE GARANTÍA FORZADA (Ignora silencios) 🔥
            if (change.type === 'added' && !cargaInicialMisiones) {
                if (sData.es_garantia && sData.estado === 'trabajando') {
                    sonarAlerta();
                    alert("🚨 ¡ALERTA DE GARANTÍA!\n\nLa Central ha reabierto un ticket por falla. Revisa la franja roja en tu panel para ver el reporte exacto del cliente.");
                    lanzarNotificacionPush("🚨 TICKET REABIERTO", "Garantía exigida por el cliente.");
                }
            }

            if (change.type === 'modified') {
                if (!sData.es_garantia && (sData.estado === 'trabajando' || sData.estado === 'pagado')) {
                    sonarAlerta();
                    lanzarNotificacionPush("✅ ¡Pago Confirmado!", "El cliente ha liquidado el saldo. Puedes iniciar la reparación.");
                } else if (sData.estado === 'cancelado') {
                    sonarAlerta();
                    lanzarNotificacionPush("🚫 Servicio Declinado", "El cliente rechazó el presupuesto. Se ha aplicado el cargo de visita.");
                }
            }
        });
        
        snap.forEach((docSnap) => {
            const s = docSnap.data();
            const id = docSnap.id;

            // --- INYECCIÓN V5.18: FILTRO MANUAL DE ESTADOS ACTIVOS ---
            const estadosActivos = ["pagado", "asignado", "en_camino", "en_sitio", "cotizando", "procesando_saldo", "trabajando", "cancelado"];
            if (!estadosActivos.includes(s.estado)) return;

            if (s.oculto_para_tecnico) return;

            // --- INYECCIÓN V5.18: BLINDAJE B2B (Datos Salvavidas) ---
            const categoriaSafe = s.categoria || (s.tipo === 'mantenimiento' ? 'MANTENIMIENTO' : 'GENERAL');
            const destinoConfirmado = getConfirmedServiceDestination(s);
            const direccionSafe = destinoConfirmado?.direccion || s.direccion || 'Instalaciones del Residencial';
            const descripcionSafe = s.descripcion || s.titulo || s.problema || 'Mantenimiento en curso';

            const destinoWaze = destinoConfirmado?.coords
                ? `${destinoConfirmado.coords.lat},${destinoConfirmado.coords.lng}`
                : encodeURIComponent(direccionSafe);

            let botonAccionHTML = "";

            if (s.estado === "asignado") {
                botonAccionHTML = `
                <button onclick="window.actualizarEstadoGlobal('${id}', 'en_camino')" class="w-full mt-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95">
                    <i class="fas fa-motorcycle"></i> VOY EN CAMINO
                </button>`;
            } else if (s.estado === "en_camino") {
                botonAccionHTML = `
                <button id="btn_llegada_${id}" onclick="window.validarLlegada('${id}', ${destinoConfirmado?.coords ? destinoConfirmado.coords.lat : 'null'}, ${destinoConfirmado?.coords ? destinoConfirmado.coords.lng : 'null'})" class="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95">
                    <i class="fas fa-map-marker-alt"></i> YA LLEGUÉ AL SITIO
                </button>`;
            } else if (s.estado === "en_sitio") {
                botonAccionHTML = `
                <button onclick="window.abrirCotizadorGlobal('${id}')" class="w-full mt-4 bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95">
                    <i class="fas fa-clipboard-list"></i> ELABORAR DIAGNÓSTICO Y COTIZAR
                </button>`;
            } else if (s.estado === "cotizando") {
                botonAccionHTML = `
                <button disabled class="w-full mt-4 bg-zinc-700 text-gray-400 font-bold py-4 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed">
                    <i class="fas fa-hourglass-half animate-spin"></i> ESPERANDO APROBACIÓN DEL CLIENTE...
                </button>`;
            } else if (s.estado === "procesando_saldo") {
                botonAccionHTML = `
                <button disabled class="w-full mt-4 bg-blue-900/50 text-blue-400 font-bold py-4 rounded-xl border border-blue-500/30 flex items-center justify-center gap-2 cursor-not-allowed shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                    <i class="fas fa-circle-notch fa-spin"></i> CLIENTE PAGANDO SALDO EN STRIPE...
                </button>`;
            } else if (s.estado === "pagado" || s.estado === "trabajando") {
                
                botonAccionHTML = `
                ${!s.es_garantia ? `
                <div class="bg-emerald-900/30 border border-emerald-500 p-4 rounded-xl mt-4 text-center mb-3">
                    <p class="text-emerald-400 font-bold text-sm mb-2"><i class="fas fa-check-double"></i> PAGO DE SALDO APROBADO</p>
                    <p class="text-[10px] text-emerald-100">El pago se procesó. Inicia el trabajo para habilitar la cámara.</p>
                </div>
                ` : ''}
                
                ${s.estado !== "trabajando" ? `
                <button onclick="window.actualizarEstadoGlobal('${id}', 'trabajando')" class="w-full mt-3 bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg shadow-blue-900/50">
                    <i class="fas fa-tools"></i> INICIAR REPARACIÓN
                </button>
                ` : ''}

                ${s.estado === "trabajando" ? `
                <button onclick="window.abrirEvidenciaGlobal('${id}')" class="w-full mt-4 bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95">
                    <i class="fas fa-camera"></i> FINALIZAR Y CERRAR
                </button>` : ''}
                
                ${s.metodo_pago === 'efectivo' && !s.es_garantia ? `
                <button onclick="window.abrirModalDisputa('${id}', '${s.cliente_id}')" class="w-full mt-3 bg-black border border-red-600 text-red-500 hover:bg-red-900/40 font-bold py-3 rounded-xl text-xs uppercase flex items-center justify-center gap-2 transition-all shadow-[0_0_10px_rgba(220,38,38,0.2)]">
                    <i class="fas fa-exclamation-triangle animate-pulse"></i> EL CLIENTE NO QUIERE PAGAR EN EFECTIVO
                </button>
                ` : ''}
                `;
                
            } else if (s.estado === "cancelado") {
                botonAccionHTML = `
                <div class="bg-red-900/30 border border-red-500 p-4 rounded-xl mt-4 text-center">
                    <p class="text-red-400 font-bold text-sm mb-2"><i class="fas fa-ban"></i> EL CLIENTE RECHAZÓ EL COSTO</p>
                    <p class="text-xs text-gray-300">El servicio fue cancelado. Cobra tu visita ($550 MXN) y cierra este ticket.</p>
                </div>
                <button onclick="window.ocultarTicketCancelado('${id}')" class="w-full mt-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-transform active:scale-95">
                    <i class="fas fa-eye-slash"></i> OCULTAR Y CONTINUAR
                </button>`;
            }

            // 🔥 INYECCIÓN: VISOR DE GARANTÍA PARA EL TÉCNICO 🔥
            let alertaGarantiaHTML = "";
            if (s.es_garantia) {
                alertaGarantiaHTML = `
                <div class="bg-red-900/40 border-2 border-red-500 p-3 rounded-xl mb-4 shadow-[0_0_15px_rgba(220,38,38,0.3)]">
                    <p class="text-red-500 font-black text-[10px] uppercase tracking-tighter animate-pulse"><i class="fas fa-exclamation-circle"></i> TICKET REABIERTO POR GARANTÍA</p>
                    <p class="text-white text-xs mt-2 font-bold uppercase">Reporte del cliente:</p>
                    <p class="text-gray-200 text-[11px] italic mt-1 leading-relaxed border-l-2 border-red-500 pl-2">"${escaparHTML(s.motivo_garantia || 'El cliente reporta una falla en el trabajo anterior.')}"</p>
                </div>`;
            }

            let fotoMisionActivaHTML = '';
            if (s.foto_problema) {
                fotoMisionActivaHTML = `
                <div class="mt-3 mb-3">
                    <p class="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2"><i class="fas fa-camera"></i> Evidencia del Cliente:</p>
                    <div class="w-full h-40 rounded-xl overflow-hidden border border-blue-900/50 relative">
                        <img src="${s.foto_problema}" class="w-full h-full object-cover">
                        <a href="${s.foto_problema}" target="_blank" class="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-white px-3 py-1 rounded text-[9px] font-bold border border-white/20 hover:bg-black transition-colors"><i class="fas fa-expand"></i> VER COMPLETA</a>
                    </div>
                </div>`;
            }

            const card = document.createElement("div");
            card.className = `bg-zinc-900 border ${s.estado === 'cancelado' ? 'border-red-500' : (s.urgencia || s.es_garantia ? 'border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-blue-500/50')} p-6 rounded-2xl relative overflow-hidden mb-4 shadow-xl`;
            card.innerHTML = `
            <div class="absolute top-0 right-0 ${s.estado === 'cancelado' || s.es_garantia ? 'bg-red-600' : 'bg-blue-600'} text-white text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase">
                ${s.es_garantia ? 'GARANTÍA' : s.estado.replace('_', ' ')}
            </div>
            <h3 class="text-xl font-black text-white mb-1 uppercase">${escaparHTML(categoriaSafe)} ${s.urgencia ? '<span class="text-red-500 ml-1" title="Emergencia"><i class="fas fa-fire animate-pulse"></i></span>' : ''}</h3>
            <p class="text-gray-400 text-sm mb-4">
                <i class="fas fa-map-marker-alt text-blue-500"></i> ${escaparHTML(direccionSafe)}
            </p>
            
            ${!s.es_garantia ? `
            <div class="bg-black/50 p-4 rounded-xl mb-4">
                <p class="text-xs text-gray-500 uppercase font-bold mb-1">Problema Reportado:</p>
                <p class="text-sm text-white italic">"${escaparHTML(descripcionSafe)}"</p>
            </div>
            ` : ''}
            
            ${fotoMisionActivaHTML}
            ${alertaGarantiaHTML}

            <div class="flex gap-2">
                <a href="https://waze.com/ul?q=${destinoWaze}" target="_blank" class="flex-1 bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 rounded-xl text-center text-sm transition-colors ${s.estado === 'cancelado' ? 'pointer-events-none opacity-50' : ''}">
                    <i class="fab fa-waze"></i> IR CON WAZE
                </a>
                <a href="tel:${s.cliente_telefono}" class="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-xl text-center transition-colors">
                    <i class="fas fa-phone"></i>
                </a>
            </div>

            ${botonAccionHTML} 
            
            ${s.estado !== 'cancelado' ? `
            <div class="mt-4 border-t border-white/5 pt-4 text-center">
                <button onclick="window.cancelarMisionActiva('${id}')" class="text-red-500 text-xs font-bold underline hover:text-red-400">
                    CANCELAR SERVICIO (RIESGO PENALIZACIÓN)
                </button>
            </div>` : ''}
            `;
            ls.appendChild(card);
        });

        // 🔥 LIBERAR EL CANDADO AL TERMINAR DE PINTAR 🔥
        cargaInicialMisiones = false; 
    });

    window.ocultarTicketCancelado = async (id) => {
        try {
            await updateDoc(doc(db, "services", id), { oculto_para_tecnico: true });
        } catch (e) {
            console.error("Error al ocultar:", e);
        }
    };

    window.cancelarMisionActiva = async (id) => {
        const motivo = prompt("🚨 ESTÁS A PUNTO DE ABANDONAR UN SERVICIO ACEPTADO.\n\nEsto afectará tu reputación y aplicará una penalización automática de $150 MXN a tu Wallet por incumplimiento.\n\nEscribe el motivo de la cancelación:");
        if (!motivo) return;

        if (!confirm("Último aviso: ¿Confirmas el abandono de esta misión? Tu saldo será descontado inmediatamente.")) return;

        try {
            const sSnap = await getDoc(doc(db, "services", id));
            if(sSnap.exists()) {
                 const sData = sSnap.data();
                 const nuevoEstado = sData.metodo_pago === 'stripe' ? 'pagado' : 'pendiente';
                 
                 await updateDoc(doc(db, "services", id), {
                      estado: nuevoEstado,
                      tecnico_id: null,
                      tecnico_nombre: null,
                      tecnico_telefono: null,
                      tecnico_vehiculo: null,
                      tecnico_placas: null,
                      asignado_at: null,
                      rejected_by: arrayUnion(user.uid) 
                 });
            }

            await addDoc(collection(db, "transacciones"), {
                tecnico_id: user.uid,
                pago_tecnico: -150,
                monto_total: 0,
                tipo: "penalizacion",
                descripcion: `Sistema: Abandono de servicio activo (Folio: ${id.substring(0,6)}) - Motivo: ${motivo}`,
                fecha: serverTimestamp()
            });

            await updateDoc(doc(db, "users", user.uid), {
                reputacion: increment(-0.3)
            });

            const rastreoRef = doc(db, "rastreo", user.uid);
            await setDoc(rastreoRef, { estado: "Disponible" }, { merge: true });

            alert("✅ Misión abandonada. La penalización ha sido aplicada a tu Wallet.");
        } catch (e) {
            console.error("Error al cancelar misión:", e);
            alert("Error procesando la cancelación con el servidor.");
        }
    };

    window.actualizarEstadoGlobal = async (id, estado, extras = {}) => {
        try {
            await updateDoc(doc(db, "services", id), { estado: estado, ...extras });

            let textoMapa = "En Ruta";
            if(estado === "en_sitio") textoMapa = "En Sitio";
            if(estado === "trabajando") textoMapa = "Trabajando";
            if(estado === "finalizado") textoMapa = "Disponible";
            
            const rastreoRef = doc(db, "rastreo", user.uid);
            await setDoc(rastreoRef, { estado: textoMapa }, { merge: true });
        } catch (error) {
            console.error("Error actualizando estado:", error);
            alert("Error de conexión. Intenta de nuevo.");
        }
    };

    window.validarLlegada = (id, targetLat, targetLng) => {
        const btn = document.getElementById(`btn_llegada_${id}`);
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-satellite text-white animate-spin"></i> VERIFICANDO GPS...';
        btn.disabled = true;

        if (navigator.geolocation && targetLat && targetLng) {
            navigator.geolocation.getCurrentPosition((pos) => {
                const dist = calcularDistancia(pos.coords.latitude, pos.coords.longitude, targetLat, targetLng);
                if (dist > 200) { 
                    console.log(`🛰️ [DEBUG TÉCNICO] Distancia calculada: ${Math.round(dist)} metros.`);
                    alert(`🛑 ALERTA ANTIFRAUDE: El sistema detecta que estás a ${Math.round(dist)} metros del cliente.\n\nDebes estar a menos de 200m de Uxmal 39.`);
                    btn.innerHTML = textoOriginal;
                    btn.disabled = false;
                } else {
                    console.log("✅ [DEBUG TÉCNICO] ¡Llegada confirmada!");
                    window.actualizarEstadoGlobal(id, "en_sitio");
                }
            }, (err) => {
                console.warn("Error GPS técnico (Bypass activado por timeout/error):", err);
                window.actualizarEstadoGlobal(id, "en_sitio"); 
            }, { 
                enableHighAccuracy: true,
                timeout: 10000, 
                maximumAge: 0 
            });
        } else {
            window.actualizarEstadoGlobal(id, "en_sitio"); 
        }
    };

    // 🔥 INYECCIÓN: MOTOR DE GEOFENCING (CEREBRO FINANCIERO) 🔥
    function calcularMultiplicadorTarifa(servicioData) {
        let multiplicador = 1.0;
        let razon = "TARIFA BASE REGULAR (1.0x)";
        let color = "text-gray-400";

        // 1. REGLA SUPREMA: SI ES EMERGENCIA, GANA EL 1.5x Y SE IGNORA LA ZONA
        if (servicioData.urgencia === true) {
            return { factor: 1.5, razon: "🔥 EMERGENCIA SOLICITADA (1.5x)", color: "text-red-500" };
        }

        // 2. SI NO ES EMERGENCIA, EVALUAMOS LAS GEOCERCAS (1.3x)
        if (servicioData.coords && servicioData.coords.lat && servicioData.coords.lng) {
            const lat = servicioData.coords.lat;
            const lng = servicioData.coords.lng;

            // Caja 1: Zona Hotelera / Isla Blanca
            if (lat >= 21.03 && lat <= 21.20 && lng >= -86.85 && lng <= -86.74) {
                return { factor: 1.3, razon: "💎 ZONA HOTELERA DETECTADA (1.3x)", color: "text-blue-400" };
            }
            // Caja 2: Puerto Cancún / Puerto Juárez
            if (lat >= 21.16 && lat <= 21.19 && lng >= -86.81 && lng <= -86.79) {
                return { factor: 1.3, razon: "💎 PUERTO CANCÚN DETECTADO (1.3x)", color: "text-blue-400" };
            }
            // Caja 3: Corredor Colosio (Cumbres/Campestre)
            if (lat >= 21.05 && lat <= 21.12 && lng >= -86.86 && lng <= -86.82) {
                return { factor: 1.3, razon: "💎 ZONA PREMIUM COLOSIO (1.3x)", color: "text-blue-400" };
            }
            // Caja 4: Polígono Sur (Huayacán/Jardines)
            if (lat >= 21.10 && lat <= 21.14 && lng >= -86.89 && lng <= -86.84) {
                return { factor: 1.3, razon: "💎 ZONA PREMIUM HUAYACÁN (1.3x)", color: "text-blue-400" };
            }
        }

        // 3. SI NO CAYÓ EN NADA, SE QUEDA LA BASE
        return { factor: multiplicador, razon: razon, color: color };
    }

    window.abrirCotizadorGlobal = (id) => {
        getDoc(doc(db, "services", id)).then(snap => {
            if(snap.exists()) {
                const data = snap.data();
                const inteligencia = calcularMultiplicadorTarifa(data);
                mostrarModalCotizacionDetallada(id, data, inteligencia);
            }
        });
    };

    window.abrirEvidenciaGlobal = (id) => {
        mostrarModalEvidencia(id);
    };

    // 🔥 MODIFICADO: COTIZADOR PRO AHORA RECIBE LA INTELIGENCIA ARTIFICIAL 🔥
    function mostrarModalCotizacionDetallada(id, servicioData, inteligencia) {
        if(document.getElementById("modalCot")) return;
        
        let items = []; 
        const isPremiumActivo = inteligencia.factor > 1.0;

        const html = `
        <div id="modalCot" class="fixed inset-0 bg-black/95 z-[60] flex flex-col p-4 animate-fade-in overflow-y-auto">
            <div class="bg-zinc-900 w-full max-w-lg mx-auto rounded-3xl p-6 border border-zinc-700 shadow-2xl flex-1 flex flex-col">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-white font-black text-xl flex items-center gap-2"><img src="assets/gestiapremium-icon.svg" class="w-6 h-6 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]"> COTIZADOR PRO</h3>
                    <button onclick="document.getElementById('modalCot').remove()" class="text-gray-500"><i class="fas fa-times"></i></button>
                </div>

                <div class="bg-black border border-zinc-800 p-3 rounded-xl mb-4 text-center">
                    <p class="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">Motor de Tarifas Automático</p>
                    <p class="text-xs font-black ${inteligencia.color} animate-pulse">${inteligencia.razon}</p>
                    ${isPremiumActivo ? `<p class="text-[9px] text-gray-400 mt-1">El sistema multiplicará tus precios base automáticamente al agregarlos.</p>` : ''}
                </div>
                
                <div class="bg-zinc-800 p-3 rounded-xl mb-4 border border-blue-900/50">
                    <label class="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-2 block"><i class="fas fa-stethoscope"></i> 1. Reporte de Diagnóstico Obligatorio:</label>
                    <textarea id="inDiagnostico" rows="3" placeholder="Describe detalladamente el problema que encontraste en el sitio..." class="w-full bg-black text-white p-3 rounded-lg text-xs border border-zinc-600 focus:border-blue-500 outline-none resize-none"></textarea>
                </div>

                <label class="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mb-2 block"><i class="fas fa-list"></i> 2. Conceptos y Costos (Ingresa tu precio NORMAL):</label>
                <div class="flex-1 overflow-y-auto mb-4 border border-zinc-800 rounded-xl bg-black/50 p-2" id="listaPartidas">
                    <p class="text-gray-600 text-xs text-center italic py-10">Agrega conceptos para cotizar.</p>
                </div>

                <div class="bg-zinc-800 p-3 rounded-xl mb-4 space-y-2 border border-zinc-700">
                    <div class="flex gap-2">
                        <input id="inCant" type="number" placeholder="Cant." class="w-16 bg-black text-white p-3 rounded-lg text-xs border border-zinc-600 focus:border-emerald-500 outline-none">
                        <input id="inUnidad" type="text" placeholder="Unidad" class="w-20 bg-black text-white p-3 rounded-lg text-xs border border-zinc-600 focus:border-emerald-500 outline-none">
                        <input id="inDesc" type="text" placeholder="Descripción (Ej: Cable 12)" class="flex-1 bg-black text-white p-3 rounded-lg text-xs border border-zinc-600 focus:border-emerald-500 outline-none">
                    </div>
                    <div class="flex gap-2 items-center">
                        <div class="flex-1 relative">
                            <span class="absolute left-3 top-3 text-gray-500 text-xs">$</span>
                            <input id="inPrecio" type="number" placeholder="Precio Base" class="w-full bg-black text-white p-3 pl-6 rounded-lg text-xs border border-zinc-600 focus:border-emerald-500 outline-none font-mono">
                        </div>
                        <button id="btnAddItem" class="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-bold text-xs transition-colors"><i class="fas fa-plus"></i> AGREGAR</button>
                    </div>
                </div>

                <div class="flex justify-between items-center bg-black p-4 rounded-xl border border-emerald-900 mb-4">
                    <span class="text-gray-400 text-xs font-bold uppercase">Total Cotización</span>
                    <span id="txtTotalCot" class="text-emerald-500 font-black text-xl">$0.00</span>
                </div>

                <button id="btnEnviarCot" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl text-sm shadow-lg shadow-blue-900/20 transition-transform active:scale-95">
                    ENVIAR DIAGNÓSTICO Y COSTOS AL CLIENTE
                </button>
            </div>
        </div>`;
        
        document.body.insertAdjacentHTML('beforeend', html);

        const renderItems = () => {
            const container = document.getElementById("listaPartidas");
            const txtTotal = document.getElementById("txtTotalCot");
            container.innerHTML = "";
            let grandTotal = 0;

            if(items.length === 0) {
                container.innerHTML = `<p class="text-gray-600 text-xs text-center italic py-4">Sin conceptos.</p>`;
            } else {
                items.forEach((item, index) => {
                    const importe = item.cantidad * item.precio_final; 
                    grandTotal += importe;
                    const row = document.createElement("div");
                    row.className = "flex justify-between items-start border-b border-zinc-800 py-2 text-xs last:border-0 animate-fade-in";
                    row.innerHTML = `
                    <div class="flex-1">
                        <p class="text-white font-bold"><span class="text-emerald-500">${item.cantidad} ${escaparHTML(item.unidad)}</span> ${escaparHTML(item.descripcion)}</p>
                        <p class="text-gray-500 text-[10px]">$${item.precio_final.toFixed(2)} c/u ${isPremiumActivo ? `<span class="text-emerald-500 ml-1">(Ajustado)</span>` : ''}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-white font-mono">$${importe.toFixed(2)}</p>
                        <button class="text-red-500 text-[10px] underline btn-delete hover:text-red-400" data-idx="${index}">Eliminar</button>
                    </div>
                    `;
                    container.appendChild(row);
                });
            }
            txtTotal.innerText = `$${grandTotal.toFixed(2)}`;
            
            document.querySelectorAll(".btn-delete").forEach(btn => {
                btn.onclick = (e) => {
                    const idx = parseInt(e.target.dataset.idx);
                    items.splice(idx, 1);
                    renderItems();
                };
            });
        };

        setTimeout(() => {
            const btnAdd = document.getElementById("btnAddItem");
            const btnSend = document.getElementById("btnEnviarCot");

            if(btnAdd) {
                btnAdd.onclick = () => {
                    const cant = parseFloat(document.getElementById("inCant").value);
                    const unidad = document.getElementById("inUnidad").value.trim();
                    const desc = document.getElementById("inDesc").value.trim();
                    const precioBase = parseFloat(document.getElementById("inPrecio").value);

                    if(!cant || !desc || !precioBase) return alert("Llena todos los campos del concepto.");

                    // 🔥 APLICAR EL MULTIPLICADOR INVISIBLE AQUÍ 🔥
                    const precioMultiplicado = precioBase * inteligencia.factor;

                    items.push({ 
                        cantidad: cant, 
                        unidad: unidad || 'pz', 
                        descripcion: desc, 
                        precio: precioMultiplicado, // Guardamos el precio ya inflado en la BD
                        precio_final: precioMultiplicado // Para uso del render
                    });
                    
                    document.getElementById("inCant").value = "";
                    document.getElementById("inDesc").value = "";
                    document.getElementById("inPrecio").value = "";
                    renderItems();
                };
            }

            if(btnSend) {
                btnSend.onclick = async () => {
                    const diagTexto = document.getElementById("inDiagnostico").value.trim();
                    if (!diagTexto || diagTexto.length < 10) {
                        return alert("⚠️ OBLIGATORIO:\nDebes escribir un reporte de diagnóstico detallado (mínimo 10 caracteres) explicando qué falla tiene el cliente.");
                    }

                    if(items.length === 0) return alert("Agrega al menos un concepto a cobrar.");
                    
                    const totalFinal = items.reduce((sum, item) => sum + (item.cantidad * item.precio_final), 0);

                    if(!confirm(`¿Enviar diagnóstico y cotización por un total de $${totalFinal.toFixed(2)} al cliente para su revisión?\n\nEste precio ya incluye el multiplicador de zona si aplica.`)) return;

                    try {
                        // Limpiar el array para guardar en BD (Stripe y la UI del cliente esperan "precio")
                        const itemsLimpios = items.map(i => ({
                            cantidad: i.cantidad,
                            unidad: i.unidad,
                            descripcion: i.descripcion,
                            precio: i.precio_final 
                        }));

                        await enviarCotizacionB2C(
                            id,
                            diagTexto,
                            itemsLimpios,
                            inteligencia.factor
                        );
                        alert(`✅ Diagnóstico y Cotización enviados.\n\nEspera a que el cliente lo apruebe en su aplicación para comenzar a trabajar.`);
                    } catch (e) {
                        console.error(e);
                        alert(e?.message || "Error al guardar la cotización.");
                        return;
                    }

                    const modal = document.getElementById("modalCot");
                    if(modal) modal.remove();
                };
            }
        }, 100); 
    }

    function mostrarModalEvidencia(id) {
        if(document.getElementById("modalEvidencia")) return;

        const html = `
        <div id="modalEvidencia" class="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div class="bg-zinc-900 w-full max-w-md rounded-3xl p-6 border border-zinc-700 shadow-2xl">
                <div class="flex justify-center mb-4"><img src="assets/gestiapremium-icon.svg" class="w-12 h-12 drop-shadow-[0_0_12px_rgba(59,130,246,0.5)]"></div>
                <h3 class="text-white font-black text-xl mb-2 text-center">REPORTE FINAL OBLIGATORIO</h3>
                <p class="text-gray-400 text-[10px] mb-6 text-center">Sube hasta 4 fotos (Mínimo 1 del Antes y 1 del Después) para liberar el cobro. Los archivos pesados se subirán directamente a Google Cloud.</p>

                <div class="grid grid-cols-2 gap-3 mb-4">
                    <div class="bg-black p-3 rounded-xl border border-red-900/50 text-center">
                        <label class="block text-[10px] font-bold text-red-500 mb-2 uppercase tracking-widest">ANTES (Foto 1)</label>
                        <input type="file" id="fileA1" accept="image/*" class="text-[9px] w-full text-gray-400 file:bg-zinc-800 file:text-white file:border-0 file:py-1 file:px-2 file:rounded">
                    </div>
                    <div class="bg-black p-3 rounded-xl border border-red-900/50 text-center">
                        <label class="block text-[10px] font-bold text-red-500 mb-2 uppercase tracking-widest">ANTES (Foto 2)</label>
                        <input type="file" id="fileA2" accept="image/*" class="text-[9px] w-full text-gray-400 file:bg-zinc-800 file:text-white file:border-0 file:py-1 file:px-2 file:rounded">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div class="bg-black p-3 rounded-xl border border-emerald-900/50 text-center">
                        <label class="block text-[10px] font-bold text-emerald-500 mb-2 uppercase tracking-widest">DESPUÉS (Foto 1)</label>
                        <input type="file" id="fileD1" accept="image/*" class="text-[9px] w-full text-gray-400 file:bg-zinc-800 file:text-white file:border-0 file:py-1 file:px-2 file:rounded">
                    </div>
                    <div class="bg-black p-3 rounded-xl border border-emerald-900/50 text-center">
                        <label class="block text-[10px] font-bold text-emerald-500 mb-2 uppercase tracking-widest">DESPUÉS (Foto 2)</label>
                        <input type="file" id="fileD2" accept="image/*" class="text-[9px] w-full text-gray-400 file:bg-zinc-800 file:text-white file:border-0 file:py-1 file:px-2 file:rounded">
                    </div>
                </div>

                <div class="bg-black p-3 rounded-xl border border-blue-900/50 text-center mt-4">
                    <label class="block text-[10px] font-bold text-blue-400 mb-2 uppercase tracking-widest">
                        <i class="fas fa-pen-nib"></i> Firma Digital del Cliente (Aceptación de Servicio)
                    </label>
                    <canvas id="canvasFirma" class="w-full h-32 bg-zinc-800 rounded-lg border border-zinc-700 cursor-crosshair touch-none"></canvas>
                    <button type="button" onclick="window.limpiarFirma()" class="text-[9px] text-gray-500 mt-2 uppercase underline hover:text-white transition-colors">
                        <i class="fas fa-eraser"></i> Limpiar Firma
                    </button>
                </div>

                <div class="flex gap-3 mt-8">
                    <button onclick="document.getElementById('modalEvidencia').remove()" class="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-bold text-sm">CANCELAR</button>
                    <button id="btnSubirEvidencia" class="flex-[2] bg-emerald-500 hover:bg-emerald-400 text-black py-3 rounded-xl font-black text-sm transition-colors">SUBIR Y CERRAR ORDEN</button>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        
        document.getElementById("btnSubirEvidencia").onclick = async () => {
            const fA1 = document.getElementById("fileA1").files[0];
            const fA2 = document.getElementById("fileA2").files[0];
            const fD1 = document.getElementById("fileD1").files[0];
            const fD2 = document.getElementById("fileD2").files[0];

            if(!fA1 || !fD1) { alert(" ⚠ Es obligatorio subir al menos la FOTO 1 del ANTES y la FOTO 1 del DESPUÉS."); return; }

            if (!storage) {
                alert("❌ Error: Firebase Storage no está configurado. Contacta a soporte técnico.");
                return;
            }

            const btn = document.getElementById("btnSubirEvidencia");
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SUBIENDO AL SERVIDOR CLOUD...';
            btn.disabled = true;
            
            try {
                const subirImagenAStorage = async (file, nombreAsignado) => {
                    if(!file) return null;
                    const storageRef = ref(storage, `servicios/${id}/${nombreAsignado}_${Date.now()}.jpg`);
                    await uploadBytes(storageRef, file);
                    const url = await getDownloadURL(storageRef);
                    return url;
                };

                const [urlA1, urlA2, urlD1, urlD2] = await Promise.all([
                    subirImagenAStorage(fA1, 'antes_1'),
                    subirImagenAStorage(fA2, 'antes_2'),
                    subirImagenAStorage(fD1, 'despues_1'),
                    subirImagenAStorage(fD2, 'despues_2')
                ]);

                btn.innerHTML = '<i class="fas fa-cog fa-spin"></i> FINALIZANDO COBRO...';
                
                const timestampMetadatos = new Date().toISOString();
                const userAgentCorto = navigator.userAgent.substring(0, 50);
                
                const servicioSnap = await getDoc(doc(db, "services", id));
                const servicioData = servicioSnap.data();
                const costoTotal = servicioData.costo_final || 0;

                const tecnicoSnap = await getDoc(doc(db, "users", user.uid));
                let tasaComision = 0.30;
                if (tecnicoSnap.exists() && tecnicoSnap.data().comision_asignada) {
                    tasaComision = parseFloat(tecnicoSnap.data().comision_asignada);
                }

                const comisionFixGoPura = costoTotal * tasaComision; 
                const aporteGarantia = costoTotal * 0.02; 
                const retencionIVA = costoTotal * 0.08; 
                const retencionISR = costoTotal * 0.10; 
                
                let deudaTecnico = 0;
                if (servicioData.metodo_pago === "stripe") {
                    deudaTecnico = (costoTotal - (costoTotal * tasaComision)); 
                } else {
                    deudaTecnico = -(costoTotal * tasaComision);
                }

                const canvas = document.getElementById("canvasFirma");
                const firmaData = canvas ? canvas.toDataURL("image/png") : null;

               await runTransaction(db, async (transaction) => {
                    const servicioRef = doc(db, "services", id);
                    const tecnicoRef = doc(db, "users", user.uid);
                    // 🔥 REFERENCIA AL PERFIL DE JORGE (CLIENTE)
                    const clienteRef = doc(db, "users", servicioData.cliente_id); 

                    const sSnap = await transaction.get(servicioRef);
                    if (!sSnap.exists()) throw "ERROR_NO_EXISTE";
                    if (sSnap.data().estado !== "trabajando") throw "ERROR_ESTADO_INVALIDO";

                    // 🔥 1. COBRO B2B: DESCONTO DE SALDO VIRTUAL A JORGE 🔥
                    if (servicioData.metodo_pago === "b2b") {
                        const cSnap = await transaction.get(clienteRef);
                        if (cSnap.exists()) {
                            const saldoActual = cSnap.data().saldo_virtual || 0;
                            const nuevoSaldo = saldoActual - costoTotal;
                            
                            // Actualizamos el saldo de Jorge en su documento personal
                            transaction.update(clienteRef, { saldo_virtual: nuevoSaldo });
                            console.log(`🎯 [B2B] Cobro exitoso. Nuevo Saldo de Jorge: $${nuevoSaldo}`);
                        }
                    }

                    transaction.update(servicioRef, {
                        estado: "finalizado",
                        finalizado_at: serverTimestamp(),
                        folio_fiscal: "FX-" + Math.random().toString(36).substr(2, 9).toUpperCase(),
                        evidencia: { 
                            antes1: urlA1,
                            antes2: urlA2 || null,
                            despues1: urlD1,
                            despues2: urlD2 || null,
                            firma_cliente: firmaData, 
                            metadatos: {
                                fecha_captura: timestampMetadatos,
                                dispositivo_tecnico: userAgentCorto,
                                certificacion_legal: true,
                                almacenamiento: "Google Cloud Storage + Firebase Auth"
                            }
                        },
                        desglose: {
                            subtotal: (costoTotal / 1.16).toFixed(2),
                            iva: (costoTotal - (costoTotal / 1.16)).toFixed(2),
                            total: costoTotal
                        }
                    });

                    // 🔥 2. REGISTRO CONTABLE (Efectivo vs. Digitales/B2B) 🔥
                    const transRef = doc(collection(db, "transacciones"));
                    
                    if (servicioData.metodo_pago === "efectivo") {
                        transaction.set(transRef, {
                            servicio_id: id,
                            tecnico_id: user.uid, 
                            monto_total: costoTotal,
                            comision_fixgo: comisionFixGoPura, 
                            aporte_garantia: aporteGarantia, 
                            retencion_iva: retencionIVA, 
                            retencion_isr: retencionISR, 
                            pago_tecnico: deudaTecnico, 
                            fecha: serverTimestamp(),
                            tipo: "ingreso_servicio",
                            metodo_pago: "efectivo"
                        });
                    } else {
                        // Aquí entran STRIPE y B2B: El sistema abona la lana a Jonathan
                        transaction.set(transRef, {
                            servicio_id: id,
                            tecnico_id: user.uid,
                            monto_total: 0, 
                            pago_tecnico: Math.abs(deudaTecnico), 
                            fecha: serverTimestamp(),
                            tipo: servicioData.metodo_pago === "b2b" ? "abono_b2b" : "abono_stripe",
                            descripcion: `Liquidación por servicio pagado vía ${servicioData.metodo_pago.toUpperCase()}`
                        });
                    }

                    transaction.update(tecnicoRef, {
                        reputacion: increment(0.1), 
                        servicios_completados: increment(1)
                    });
                });

                let textoMapa = "Disponible";
                const rastreoRef = doc(db, "rastreo", user.uid);
                await setDoc(rastreoRef, { estado: textoMapa }, { merge: true });

                document.getElementById("modalEvidencia").remove();
                alert(" ✅ ¡CÍRCULO DE SEGURIDAD CERRADO!\n\n1. Firma resguardada.\n2. Evidencia en Cloud.\n3. Finanzas liquidadas.\n4. Reputación aumentada.");
                
            } catch (e) {
                console.error("Error crítico subiendo evidencia a Storage:", e);
                alert("Error de conexión al servidor Cloud. Revisa tu internet e intenta de nuevo.");
                btn.innerText = "REINTENTAR SUBIDA";
                btn.disabled = false;
            }
        };

        setTimeout(() => {
            const canvas = document.getElementById('canvasFirma');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            let dibujando = false;

            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            ctx.strokeStyle = "#60a5fa"; 
            ctx.lineWidth = 3;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";

            const obtenerPos = (e) => {
                const rect = canvas.getBoundingClientRect();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                return { x: clientX - rect.left, y: clientY - rect.top };
            };

            const iniciar = (e) => { dibujando = true; const p = obtenerPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
            const mover = (e) => { if (!dibujando) return; e.preventDefault(); const p = obtenerPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
            const parar = () => { dibujando = false; };

            canvas.addEventListener('mousedown', iniciar);
            canvas.addEventListener('mousemove', mover);
            canvas.addEventListener('mouseup', parar);
            canvas.addEventListener('touchstart', iniciar);
            canvas.addEventListener('touchmove', mover);
            canvas.addEventListener('touchend', parar);

            window.limpiarFirma = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); };
        }, 100);
    }

    // 🔥 INYECCIÓN: Generador de Recibo de Comisión (GP Fee) para el Técnico 🔥
    window.generarPDFComisionTecnico = async (serviceId, tecnicoId, tecnicoNombre) => {
        try {
            const docRef = doc(db, "services", serviceId);
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) throw new Error("Servicio no encontrado en la base de datos.");
            const sData = docSnap.data();

            const techRef = doc(db, "users", tecnicoId);
            const techSnap = await getDoc(techRef);
            let tasaComision = 0.32; 
            if (techSnap.exists() && techSnap.data().comision_asignada) {
                tasaComision = parseFloat(techSnap.data().comision_asignada);
            }

            const costoTotal = sData.costo_final || 0;
            const feeGP = costoTotal * tasaComision;
            const subtotalFee = feeGP / 1.16;
            const ivaFee = feeGP - subtotalFee;

            const { jsPDF } = await cargarLibreriaPDF();
            const docPdf = new jsPDF();

            docPdf.setFillColor(18, 18, 18);
            docPdf.rect(0, 0, 215, 40, 'F');

            // 🔥 INYECCIÓN DE LOGO PNG ABSOLUTO
            let logoBase64 = null;
            try { 
                const logoUrl = window.location.origin + '/icono-512.png';
                logoBase64 = await urlABase64(logoUrl); 
            } catch(e) { console.warn("Aviso: No se pudo cargar el logo PNG para el PDF"); }

            if (logoBase64) {
                docPdf.addImage(logoBase64, "PNG", 15, 8, 24, 24);
                docPdf.setTextColor(255, 255, 255);
                docPdf.setFont("helvetica", "bold");
                docPdf.setFontSize(24);
                docPdf.text("GESTIAPREMIUM", 42, 26);
                docPdf.setFont("helvetica", "normal");
                docPdf.setTextColor(59, 130, 246); 
                docPdf.text("MÉXICO", 110, 26);
            } else {
                docPdf.setTextColor(255, 255, 255);
                docPdf.setFont("helvetica", "bold");
                docPdf.setFontSize(24);
                docPdf.text("GESTIAPREMIUM", 20, 26);
                docPdf.setFont("helvetica", "normal");
                docPdf.setTextColor(59, 130, 246); 
                docPdf.text("MÉXICO", 85, 26);
            }

            docPdf.setTextColor(200, 200, 200);
            docPdf.setFontSize(10);
            docPdf.text("Factura de Comisión por Uso de Plataforma", 20, 35);

            docPdf.setTextColor(0, 0, 0);
            let y = 55;
            docPdf.setFontSize(10);
            docPdf.setFont("helvetica", "bold");
            docPdf.text("EMISOR:", 20, y);
            docPdf.setFont("helvetica", "normal");
            docPdf.text("GestiaPremium (Plataforma Tecnológica)", 20, y+5);
            docPdf.text("RFC: FXG260211-H8A", 20, y+10);
            
            docPdf.setFont("helvetica", "bold");
            docPdf.text("RECEPTOR (Socio Especialista):", 120, y);
            docPdf.setFont("helvetica", "normal");
            docPdf.text(tecnicoNombre || "Técnico", 120, y+5);

            y += 25;
            docPdf.setDrawColor(200, 200, 200);
            docPdf.line(20, y, 190, y);
            
            y += 10;
            docPdf.setFont("helvetica", "bold");
            docPdf.text("CONCEPTO", 20, y);
            docPdf.text("IMPORTE", 160, y);
            
            y += 10;
            docPdf.setFont("helvetica", "normal");
            const folio = sData.folio_fiscal || serviceId.substring(0,6).toUpperCase();
            docPdf.text("Cargo por Uso de Licencia de Software y Ruteo de Clientes", 20, y);
            docPdf.text(`Correspondiente al Folio de Servicio: ${folio}`, 20, y+5);
            
            docPdf.text(`$${feeGP.toFixed(2)}`, 160, y);

            y += 20;
            docPdf.setFillColor(245, 245, 245);
            docPdf.rect(110, y, 80, 30, 'F'); 
            
            docPdf.setFontSize(9);
            docPdf.text(`Subtotal:`, 115, y+10);
            docPdf.text(`$${subtotalFee.toFixed(2)}`, 160, y+10);
            docPdf.text(`IVA (16%):`, 115, y+15);
            docPdf.text(`$${ivaFee.toFixed(2)}`, 160, y+15);
            
            docPdf.setFont("helvetica", "bold");
            docPdf.setFontSize(12);
            docPdf.setTextColor(59, 130, 246);
            docPdf.text(`TOTAL FEE:`, 115, y+25);
            docPdf.text(`$${feeGP.toFixed(2)} MXN`, 150, y+25);

            y += 50;
            docPdf.setFontSize(8);
            docPdf.setTextColor(150, 150, 150);
            docPdf.setFont("helvetica", "normal");
            const notaLegal = "Este documento ampara el cobro de comisiones por el uso de la infraestructura tecnológica de GestiaPremium para la conexión y ruteo de clientes. Las retenciones fiscales aplicables ya han sido calculadas con base en el contrato de asociación en participación vigente.";
            const splitNota = docPdf.splitTextToSize(notaLegal, 170);
            docPdf.text(splitNota, 20, y);

            docPdf.save(`GestiaPremium_Comision_${folio}.pdf`);

        } catch (error) {
            console.error("Error generando PDF de Comisión:", error);
            alert("Hubo un error al generar tu recibo de comisión fiscal.");
        }
    };

    window.generarPDFRetiro = async (retiroId) => {
        try {
            const docRef = doc(db, "retiros", retiroId);
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
                throw new Error("No se encontró la información del retiro.");
            }
            
            const data = { ...docSnap.data(), id: retiroId };
            
            const { jsPDF } = await cargarLibreriaPDF();
            const docPdf = new jsPDF();
            
            docPdf.setFillColor(18, 18, 18);
            docPdf.rect(0, 0, 215, 40, 'F');

            let logoBase64 = null;
            try { 
                const logoUrl = window.location.origin + '/icono-512.png';
                logoBase64 = await urlABase64(logoUrl); 
            } catch(e) {}

            if (logoBase64) {
                docPdf.addImage(logoBase64, "PNG", 15, 8, 24, 24);
                docPdf.setTextColor(255, 255, 255);
                docPdf.setFont("helvetica", "bold");
                docPdf.setFontSize(24);
                docPdf.text("GESTIAPREMIUM", 42, 26);
                docPdf.setFont("helvetica", "normal");
                docPdf.setTextColor(16, 185, 129); 
                docPdf.text("MÉXICO", 110, 26);
            } else {
                docPdf.setTextColor(255, 255, 255);
                docPdf.setFont("helvetica", "bold");
                docPdf.setFontSize(24);
                docPdf.text("GESTIAPREMIUM", 20, 26);
                docPdf.setFont("helvetica", "normal");
                docPdf.setTextColor(16, 185, 129); 
                docPdf.text("MÉXICO", 85, 26);
            }

            docPdf.setTextColor(200, 200, 200);
            docPdf.setFontSize(10);
            docPdf.text("Comprobante de Liquidación (SPEI)", 20, 35);
            
            docPdf.setFontSize(8);
            docPdf.setTextColor(150, 150, 150);
            docPdf.text(`RFC EMISOR: FXG260211-H8A`, 20, 48);
            
            let fechaFormat = new Date().toLocaleDateString();
            if(data.fecha_aprobacion) {
                fechaFormat = new Date(data.fecha_aprobacion.seconds * 1000).toLocaleDateString();
            }
            
            docPdf.text(`FOLIO RETIRO: SPEI-${data.id.substring(0,6).toUpperCase()}`, 130, 48);
            docPdf.text(`FECHA APROBACIÓN: ${fechaFormat}`, 130, 53);

            let y = 75;
            docPdf.setTextColor(0, 0, 0);
            docPdf.setFontSize(14);
            docPdf.setFont("helvetica", "bold");
            docPdf.text("DETALLES DE LA TRANSFERENCIA", 20, y);

            y += 10;
            docPdf.setFont("helvetica", "normal");
            docPdf.setFontSize(11);
            docPdf.text(`Beneficiario (Socio Técnico): ${data.tecnico_nombre}`, 20, y);
            y += 8;
            docPdf.text(`Estado: LIQUIDADO / APROBADO`, 20, y);
            
            y += 20;
            
            docPdf.setFillColor(245, 245, 245);
            docPdf.rect(20, y, 170, 30, 'F');
            
            docPdf.setFont("helvetica", "bold");
            docPdf.setFontSize(12);
            docPdf.setTextColor(50, 50, 50);
            docPdf.text("MONTO TRANSFERIDO:", 30, y + 18);
            
            docPdf.setFontSize(20);
            docPdf.setTextColor(16, 185, 129); 
            docPdf.text(`$${data.monto.toFixed(2)} MXN`, 110, y + 20);

            y += 60;
            docPdf.setFontSize(9);
            docPdf.setTextColor(150, 150, 150);
            docPdf.setFont("helvetica", "normal");
            
            const notaLegal = "Este documento es un comprobante de liquidación digital emitido por la plataforma GestiaPremium. Los fondos han sido transferidos a la cuenta bancaria registrada por el socio especialista. El tiempo de reflejo en cuenta puede variar dependiendo de la institución bancaria receptora.";
            const splitNota = docPdf.splitTextToSize(notaLegal, 170);
            docPdf.text(splitNota, 20, y);
            
            docPdf.save(`GestiaPremium_Liquidacion_${data.id.substring(0,6)}.pdf`);

        } catch (error) {
            console.error("Error al generar PDF de retiro:", error);
            alert("Hubo un error al generar el comprobante. Intenta de nuevo.");
        }
    };

    window.cambiarFotoPerfil = async (uid) => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if(!file) return;
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    await updateDoc(doc(db, "users", uid), {
                        foto_perfil: event.target.result,
                        fotoPerfil: event.target.result 
                    });
                    alert("✅ Foto de perfil actualizada correctamente.");
                } catch(err) {
                    console.error("Error subiendo foto:", err);
                    alert("Error al actualizar la foto de perfil en el servidor.");
                }
            };
            reader.readAsDataURL(file);
        };
        fileInput.click();
    };

    window.cambiarLogoFactura = async (uid) => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/png, image/jpeg'; 
        
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if(!file) return;
            
            if (file.size > 2 * 1024 * 1024) {
                alert("⚠️ El logo es demasiado pesado. Elige una imagen menor a 2MB.");
                return;
            }

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    await updateDoc(doc(db, "users", uid), {
                        logo_factura: event.target.result 
                    });
                    alert("✅ Logo comercial actualizado.\n\nTus próximas facturas y comprobantes al cliente saldrán con tu identidad corporativa.");
                } catch(err) {
                    console.error("Error subiendo logo de factura:", err);
                    alert("Error al guardar el logo en el servidor. Intenta de nuevo.");
                }
            };
            reader.readAsDataURL(file);
        };
        fileInput.click();
    };

} 

async function activarMotorFCM(uid) {
    console.log("🛠️ [FCM DEBUG] Iniciando Motor FCM para UID:", uid);
    try {
        const messaging = getMessaging(); 
        
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(async (registration) => {
                    try {
                        const currentToken = await getToken(messaging, { 
                            vapidKey: 'BJ_qj7caLzTumvHvJxy3kdTK50gW1NYJBFKso7Imx_shSMBFqLwQbzRTyNFCEs9n3b3OlEIoJI4U4jXPx6CLsYQ',
                            serviceWorkerRegistration: registration 
                        });
                        
                        if (currentToken) {
                            await updateDoc(doc(db, "users", uid), { fcmToken: currentToken });
                        }
                    } catch (tokenError) {
                        console.error("❌ [FCM CRÍTICO] Falló la obtención del Token. Error de Google:", tokenError);
                    }
                }).catch(swError => {
                    console.error("❌ [FCM CRÍTICO] Error con el Service Worker:", swError);
                });
            }
        }
        onMessage(messaging, (payload) => {
            sonarAlerta();
        });
    } catch (error) {
        console.error("❌ [FCM GENERAL] El motor Push falló al iniciar.", error);
    }
}
