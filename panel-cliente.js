/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - MÓDULO DE CLIENTE (CEREBRO COMERCIAL)
 * ======================================================================================
 * Archivo: panel-cliente.js
 * Descripción: Catálogo dinámico, cotizador interactivo, anti-spam y PDFs de usuario.
 * REGLAS DE ARQUITECTURA: NO COMPACTAR. NO FRAGMENTAR. MANTENER LOGICA.
 * INYECCIÓN: Botón de Emergencia (+50%), Subida de Foto Inicial a Cloud, Garantías y GPS Fallback.
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
    getDoc 
} from "./firebase.js";

// Funciones específicas de Firestore y Storage importadas desde el CDN
import { runTransaction, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Sistema Nervioso Compartido
import { escaparHTML, cargarLibreriaPDF, urlABase64, sonarAlerta, lanzarNotificacionPush } from "./app-utils.js";

// ======================================================================================
// 3. PANEL DE CLIENTE (USUARIO FINAL) - V5.18.2
// ======================================================================================
export async function iniciarPanelCliente(user) {
    console.log(" 📱 Iniciando Panel de Cliente (Modo Urgencias 1.5x / Foto Inicial / Garantías / GPS Anti-Freeze)...");

    // 🔥 INYECCIÓN: Desbloqueo de Audio en la primera interacción del usuario
    document.body.addEventListener('click', function unlockAudio() {
        const audio = document.getElementById('audioAlerta');
        if (audio && audio.paused) {
            audio.play().then(() => {
                audio.pause();
                audio.currentTime = 0;
                document.body.removeEventListener('click', unlockAudio);
            }).catch(e => console.warn("Esperando interacción para audio..."));
        }
    }, { once: true });

    const el = {
        form: document.getElementById("nuevaSolicitudForm"),
        lista: document.getElementById("solicitudesCliente"),
        inputCat: document.getElementById("categoriaSeleccionada"),
        labelServicio: document.getElementById("btnLabel"),
        containerRoad: document.getElementById("content_road"),
        containerFix: document.getElementById("content_fix"),
        containerTech: document.getElementById("content_tech"),
        containerMaint: document.getElementById("content_maint"),
        stripeCard: document.getElementById("contenedorOpcionStripe"), 
        efectivoCard: document.getElementById("contenedorOpcionEfectivo"),
        toggleFactura: document.getElementById("toggleFactura"),
        facRfc: document.getElementById("fac_rfc"),
        facRazon: document.getElementById("fac_razon"),
        facCp: document.getElementById("fac_cp"),
        facRegimen: document.getElementById("fac_regimen"),
        inputFoto: document.getElementById("fotoProblemaCliente"),
        toggleUrgencia: document.getElementById("toggleUrgencia")
    };

    // ----------------------------------------------------------------------------------
    // 3.0 LECTOR MAESTRO DE FEATURE FLAGS (PASARELAS DE PAGO)
    // ----------------------------------------------------------------------------------
    onSnapshot(doc(db, "configuracion", "pagos"), (docSnap) => {
        const configPagos = docSnap.exists() ? docSnap.data() : { stripe_activo: true, efectivo_activo: false };
        
        const radioStripe = document.querySelector('input[name="metodoPago"][value="stripe"]');
        const radioEfectivo = document.querySelector('input[name="metodoPago"][value="efectivo"]');

        if (configPagos.stripe_activo) {
            if(el.stripeCard) el.stripeCard.classList.remove("hidden");
        } else {
            if(el.stripeCard) el.stripeCard.classList.add("hidden");
        }

        if (configPagos.efectivo_activo || user.efectivo_autorizado) {
            if(el.efectivoCard) el.efectivoCard.classList.remove("hidden");
        } else {
            if(el.efectivoCard) el.efectivoCard.classList.add("hidden");
        }

        if (!configPagos.stripe_activo && (configPagos.efectivo_activo || user.efectivo_autorizado)) {
            if(radioEfectivo) radioEfectivo.checked = true;
            const btnText = document.getElementById('btnSubmitText');
            if (btnText) btnText.innerText = 'SOLICITAR AHORA (PAGO EN DOMICILIO)';
            const btnIcon = document.getElementById('btnSubmitIcon');
            if (btnIcon) btnIcon.className = 'fas fa-hand-holding-usd';
            const btnApp = document.getElementById('btnSubmitApp');
            if (btnApp) btnApp.className = 'w-full bg-emerald-500 text-black font-black py-4 rounded-xl text-lg hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 transform active:scale-95 flex items-center justify-center gap-2 mt-4';
        } else if (configPagos.stripe_activo && (!radioEfectivo || !radioEfectivo.checked)) {
            if(radioStripe) radioStripe.checked = true;
            const btnText = document.getElementById('btnSubmitText');
            if (btnText) btnText.innerText = 'PROCEDER AL PAGO SEGURO';
            const btnIcon = document.getElementById('btnSubmitIcon');
            if (btnIcon) btnIcon.className = 'fas fa-lock';
            const btnApp = document.getElementById('btnSubmitApp');
            if (btnApp) btnApp.className = 'w-full bg-blue-600 text-white font-black py-4 rounded-xl text-lg hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 transform active:scale-95 flex items-center justify-center gap-2 mt-4';
        }
    });

    // ----------------------------------------------------------------------------------
    // 3.1 CARGA DINÁMICA DE VERTICALES EN ACORDEÓN
    // ----------------------------------------------------------------------------------
    async function cargarServiciosCliente() {
        console.log("Cargando servicios en contenedores dinámicos...");

        onSnapshot(doc(db, "configuracion", "catalogo_global"), (docSnap) => {
            const dbConfig = docSnap.exists() ? docSnap.data() : {};
            
            const DEFINICION_VERTICALES = {
                road: [
                    { id: "road_llanta", label: "Llantera Móvil", icon: "fa-car-crash" },
                    { id: "road_cerrajero", label: "Cerrajería", icon: "fa-key" },
                    { id: "road_grua", label: "Grúas", icon: "fa-truck-pickup" },
                    { id: "road_mecanico", label: "Mecánico Gral.", icon: "fa-wrench" },
                    { id: "road_corriente", label: "Paso Corriente", icon: "fa-car-battery" }
                ],
                fix: [
                    { id: "fix_electricidad", label: "Electricidad", icon: "fa-plug" },
                    { id: "fix_plomeria", label: "Plomería", icon: "fa-faucet" },
                    { id: "fix_ac", label: "Aires Acondicionad.", icon: "fa-snowflake" },
                    { id: "fix_jardin", label: "Jardinería", icon: "fa-leaf" },
                    { id: "fix_pintura", label: "Pintura", icon: "fa-paint-roller" },
                    { id: "fix_alberca", label: "Albercas", icon: "fa-swimming-pool" },
                    { id: "fix_fumigacion", label: "Fumigación", icon: "fa-bug" }
                ],
                maint: [
                    { id: "maint_general", label: "Mantenimiento Gral.", icon: "fa-building" }
                ],
                tech: [
                    { id: "tech_cctv", label: "CCTV", icon: "fa-video" },
                    { id: "tech_alarma", label: "Alarmas", icon: "fa-bell" },
                    { id: "tech_acceso", label: "Accesos", icon: "fa-id-card" },
                    { id: "tech_elevador", label: "Elevadores", icon: "fa-elevator" },
                    { id: "tech_planta", label: "Plantas Eléc.", icon: "fa-charging-station" },
                    { id: "tech_solar", label: "Paneles Solares", icon: "fa-solar-panel" }
                ]
            };

            const renderizarCategoria = (categoriaClave, contenedor) => {
                if(!contenedor) return;
                contenedor.innerHTML = ""; 
                let html = '<div class="grid grid-cols-2 gap-2 p-3 bg-black/50 rounded-b-xl border-x border-b border-zinc-800">';
                
                DEFINICION_VERTICALES[categoriaClave].forEach(srv => {
                    const isActive = dbConfig[srv.id] !== false; 
                    
                    if (isActive) {
                        html += `
                        <div onclick="window.seleccionarServicio('${srv.id}', '${srv.label}')" 
                             class="bg-zinc-900 border border-zinc-700 p-3 rounded-xl flex flex-col items-center text-center transition-all duration-200 service-card-btn opacity-100 hover:scale-105 hover:border-emerald-500 active:scale-95 cursor-pointer" id="card_${srv.id}">
                            <div class="mb-2">
                                <div class="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_5px_#10b981]"></div>
                            </div>
                            <i class="fas ${srv.icon} text-lg mb-2 text-gray-300"></i>
                            <span class="text-white font-bold text-[10px] leading-tight uppercase">${srv.label}</span>
                            <span class="text-[8px] text-gray-500 mt-1 uppercase tracking-widest font-bold">DISPONIBLE</span>
                        </div>`;
                    } else {
                        html += `
                        <div class="bg-zinc-900/40 border border-zinc-800/40 p-3 rounded-xl flex flex-col items-center text-center opacity-40 grayscale cursor-not-allowed">
                            <div class="mb-2"><i class="fas fa-lock text-gray-600 text-xs"></i></div>
                            <i class="fas ${srv.icon} text-lg mb-2 text-zinc-600"></i>
                            <span class="text-white font-bold text-[10px] leading-tight uppercase">${srv.label}</span>
                            <span class="text-[8px] text-gray-500 mt-1 uppercase tracking-widest font-bold">PRÓXIMAMENTE</span>
                        </div>`;
                    }
                });
                
                html += '</div>';
                contenedor.innerHTML = html;
            };

            renderizarCategoria("road", el.containerRoad);
            renderizarCategoria("fix", el.containerFix);
            renderizarCategoria("tech", el.containerTech);
            renderizarCategoria("maint", el.containerMaint);

            window.seleccionarServicio = (id, label) => {
                document.querySelectorAll('.service-card-btn').forEach(btn => {
                    btn.classList.remove('bg-zinc-800', 'border-emerald-500', 'ring-1', 'ring-emerald-500');
                    btn.classList.add('bg-zinc-900', 'border-zinc-700');
                });

                const activeCard = document.getElementById(`card_${id}`);
                if(activeCard) {
                    activeCard.classList.remove('bg-zinc-900', 'border-zinc-700');
                    activeCard.classList.add('bg-zinc-800', 'border-emerald-500', 'ring-1', 'ring-emerald-500');
                }

                if(el.inputCat) el.inputCat.value = id;
                if(el.labelServicio) el.labelServicio.innerText = label.toUpperCase();

                const formContainer = document.getElementById("modalSolicitud");
                if(formContainer) formContainer.classList.remove("hidden");

                el.form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            };
        });
    }

    cargarServiciosCliente();

    // ----------------------------------------------------------------------------------
    // 3.2 ENVÍO DE SOLICITUD (SHARK MODE ANTI-SPAM & RUTEO DUAL & URGENCIA)
    // ----------------------------------------------------------------------------------
    let lastSubmitTime = 0; 

    if (el.form) {
        el.form.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            const now = Date.now();
            if (now - lastSubmitTime < 30000) {
                alert("⏳ SISTEMA ANTI-SPAM: Por favor espera al menos 30 segundos antes de enviar una nueva solicitud de servicio.");
                return;
            }

            const cat = el.inputCat.value; 
            const dir = el.form.querySelector('[name="direccion"]').value;
            const desc = el.form.querySelector('[name="descripcion"]').value;
            
            const isUrgencia = el.toggleUrgencia ? el.toggleUrgencia.checked : false;
            const fotoFile = el.inputFoto ? el.inputFoto.files[0] : null;

            if (!cat) { alert(" ⚠ Por favor selecciona un servicio habilitado de la lista."); return; }
            
            let requiereFactura = false;
            let datosFacturacion = null;

            if (el.toggleFactura && el.toggleFactura.checked) {
                requiereFactura = true;
                datosFacturacion = {
                    rfc: el.facRfc?.value.toUpperCase(),
                    razon_social: el.facRazon?.value,
                    cp: el.facCp?.value,
                    regimen: el.facRegimen?.value
                };
                if (!datosFacturacion.rfc || !datosFacturacion.razon_social || !datosFacturacion.cp || !datosFacturacion.regimen) {
                    alert("⚠️ Si requieres factura, es obligatorio llenar todos los campos (RFC, Razón Social, CP y Régimen).");
                    return;
                }
            }

            const btn = el.form.querySelector("button[type='submit']");
            const textoOriginal = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> PROCESANDO SOLICITUD...`;
            
            // 🔥 GPS BLINDADO CON TIMEOUT DE 6 SEGUNDOS 🔥
            const obtenerGPSConTimeout = () => {
                return new Promise((resolve) => {
                    let resuelto = false;
                    
                    // Si en 6 segundos no hay respuesta del GPS, forzamos salida para que no se quede colgado
                    const fallback = setTimeout(() => {
                        if(!resuelto) { 
                            resuelto = true; 
                            console.warn("⏳ GPS Timeout Forzado. Enviando solicitud sin coordenadas."); 
                            resolve(null); 
                        }
                    }, 6000); 

                    if (navigator.geolocation) {
                        btn.innerHTML = `<i class="fas fa-satellite-dish"></i> OBTENIENDO GPS...`;
                        navigator.geolocation.getCurrentPosition(
                            (pos) => { 
                                if(!resuelto) { 
                                    resuelto = true; 
                                    clearTimeout(fallback); 
                                    resolve({lat: pos.coords.latitude, lng: pos.coords.longitude}); 
                                } 
                            },
                            (err) => { 
                                if(!resuelto) { 
                                    resuelto = true; 
                                    clearTimeout(fallback); 
                                    resolve(null); 
                                } 
                            },
                            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                        );
                    } else {
                        if(!resuelto) { resuelto = true; clearTimeout(fallback); resolve(null); }
                    }
                });
            };

            const coordsObtenidas = await obtenerGPSConTimeout();
            await enviarSolicitudFinal(cat, dir, desc, coordsObtenidas, requiereFactura, datosFacturacion, isUrgencia, fotoFile);
            
            async function enviarSolicitudFinal(categoriaFull, direccion, descripcion, coords, reqFac, datosFac, flagUrgencia, archivoFoto) {
                const partes = categoriaFull.split('_');
                const vertical = partes[0].toUpperCase(); 
                const servicio = partes[1] ? partes[1].toUpperCase() : 'GENERAL';

                let metodoSeleccionado = "stripe"; 
                const radioEfectivo = document.querySelector('input[name="metodoPago"][value="efectivo"]');
                if (radioEfectivo && radioEfectivo.checked) {
                    metodoSeleccionado = "efectivo";
                }

                let urlFotoDescargada = null;
                if (archivoFoto && storage) {
                    btn.innerHTML = `<i class="fas fa-cloud-upload-alt animate-bounce"></i> SUBIENDO FOTO A LA NUBE...`;
                    try {
                        const storageRef = ref(storage, `solicitudes_iniciales/${user.uid}_${Date.now()}.jpg`);
                        await uploadBytes(storageRef, archivoFoto);
                        urlFotoDescargada = await getDownloadURL(storageRef);
                    } catch (e) {
                        console.error("No se pudo subir la foto inicial:", e);
                    }
                }

                btn.innerHTML = `<i class="fas fa-satellite-dish"></i> ENVIANDO A CENTRAL...`;

                try {
                    const payloadTicket = {
                        cliente_id: user.uid,
                        cliente_nombre: user.nombre || "Cliente",
                        cliente_telefono: user.telefono || "",
                        categoria: vertical,
                        sub_servicio: servicio,
                        categoria_id: categoriaFull,
                        direccion: direccion,
                        descripcion: descripcion,
                        estado: metodoSeleccionado === "efectivo" ? "pendiente" : "iniciado_stripe",
                        metodo_pago: metodoSeleccionado,
                        zona: "Cancún",
                        created_at: serverTimestamp(),
                        retencion_inicial: metodoSeleccionado === "stripe" ? 550 : 0, 
                        costo_final: 0,
                        coords: coords,
                        factura_requerida: reqFac,
                        datos_facturacion: datosFac,
                        factura_enviada: false,
                        urgencia: flagUrgencia,
                        foto_problema: urlFotoDescargada
                    };

                    const docRef = await addDoc(collection(db, "services"), payloadTicket);
                    lastSubmitTime = Date.now(); 

                    el.form.reset();
                    if(el.toggleFactura) {
                        el.toggleFactura.checked = false;
                        document.getElementById('datosFacturacion')?.classList.add('hidden');
                    }
                    if(el.toggleUrgencia) el.toggleUrgencia.checked = false;
                    
                    const formContainer = document.getElementById("modalSolicitud");
                    if(formContainer) formContainer.classList.add("hidden");

                    if(el.labelServicio) el.labelServicio.innerText = "SERVICIO";
                    document.querySelectorAll('.service-card-btn').forEach(cardBtn => {
                        cardBtn.classList.remove('bg-zinc-800', 'border-emerald-500', 'ring-1', 'ring-emerald-500');
                        cardBtn.classList.add('bg-zinc-900', 'border-zinc-700');
                    });

                    if (metodoSeleccionado === "stripe") {
                        alert("🔒 SEGURIDAD GESTIAPREMIUM:\n\nSe realizará una RETENCIÓN DE GARANTÍA por $550 MXN en tu tarjeta.\n\nEste monto NO es el costo final, es solo para asegurar la visita del técnico.");
                        if (window.procesarPagoStripe) {
                            window.procesarPagoStripe(docRef.id, payloadTicket);
                        } else {
                            console.warn("Falta conectar la pasarela. Ticket ID:", docRef.id);
                        }
                    } else {
                        if(flagUrgencia) {
                            alert(" 🚨 ¡SOLICITUD DE EMERGENCIA RECIBIDA!\n\nNuestras unidades están en camino. Recuerda que la cotización final incluirá la tarifa prioritaria 1.5x.");
                        } else {
                            alert(" ✅ ¡Solicitud Confirmada!\n\nEl pago se realizará en EFECTIVO directamente al técnico.\nNuestro sistema está buscando a la unidad más cercana...");
                        }
                    }

                } catch (error) {
                    console.error(error);
                    alert("Error al enviar solicitud al servidor central.");
                }
                
                btn.disabled = false;
                btn.innerHTML = textoOriginal;
            }
        });
    }

    // ----------------------------------------------------------------------------------
    // 3.3 MONITOR DE HISTORIAL & WATCHDOG DE NOTIFICACIONES AL CLIENTE
    // ----------------------------------------------------------------------------------
    onSnapshot(query(collection(db, "services"), where("cliente_id", "==", user.uid), orderBy("created_at", "desc"), limit(50)), (snap) => {
        if(!el.lista) return;
        
        snap.docChanges().forEach(change => {
            if (change.type === 'modified') {
                const newData = change.doc.data();
                console.log(" 🔔 Cambio de estado detectado en ticket:", newData.estado);
                
                sonarAlerta();

                if (newData.estado === 'asignado') {
                    lanzarNotificacionPush("Técnico Asignado", `${newData.tecnico_nombre} ha aceptado tu solicitud.`);
                } else if (newData.estado === 'en_camino') {
                    lanzarNotificacionPush("Técnico en Camino", `${newData.tecnico_nombre} se dirige a tu ubicación.`);
                } else if (newData.estado === 'en_sitio') {
                    lanzarNotificacionPush("Técnico en Sitio", "El técnico ha llegado a tu domicilio y comenzará el diagnóstico.");
                } else if (newData.estado === 'cotizando') {
                    lanzarNotificacionPush("Reporte y Cotización Lista", "Revisa el diagnóstico y aprueba el presupuesto para iniciar.");
                } else if (newData.estado === 'finalizado') {
                    // 🔥 LÓGICA DE FINALIZACIÓN Y GARANTÍA $0 🔥
                    if (newData.es_garantia) {
                        lanzarNotificacionPush("✅ Garantía Finalizada", "Trabajo corregido satisfactoriamente.");
                        alert("🛡️ GESTIAPREMIUM INFORMA:\n\nHas confirmado que el trabajo de garantía fue realizado correctamente. Este servicio NO TIENE COSTO para ti. ¡Gracias por tu paciencia!");
                    } else {
                        if (newData.metodo_pago === 'stripe') {
                            lanzarNotificacionPush("Servicio Finalizado", "Pago cobrado automáticamente a tu tarjeta.");
                            alert("✅ ¡Servicio terminado exitosamente!\n\nTu pago ha sido procesado de forma segura vía STRIPE a tu tarjeta. Revisa tu comprobante digital en pantalla.");
                        } else {
                            lanzarNotificacionPush("Servicio Finalizado", "Por favor, realiza el pago en efectivo al técnico.");
                            alert("✅ ¡Servicio terminado exitosamente!\n\nPor favor, realiza el pago en EFECTIVO directamente al técnico. Revisa tu comprobante digital en pantalla.");
                        }
                    }
                }
            }
        });
        
        el.lista.innerHTML = "";

        if(snap.empty) {
            el.lista.innerHTML = `
            <div class="text-center py-8">
                <i class="fas fa-history text-gray-700 text-3xl mb-2"></i>
                <p class="text-gray-600 text-sm">Tus servicios aparecerán aquí.</p>
            </div>`;
            return;
        }

        snap.forEach(docSnap => {
            const s = docSnap.data();
            const id = docSnap.id;
            
            let contenido = `<div class="p-4 bg-yellow-900/10 rounded-xl border border-yellow-500/30 mb-2"><span class="text-xs font-bold text-yellow-500 animate-pulse"> 🔎 RASTREANDO TÉCNICO EN LA ZONA...</span></div>`;
            
            if (s.estado === "iniciado_stripe") {
                contenido = `
                <div class="bg-blue-900/10 border border-blue-500/30 p-4 rounded-xl mt-2 text-center">
                    <i class="fas fa-credit-card text-blue-500 text-2xl mb-2 animate-bounce"></i>
                    <p class="text-blue-400 font-bold text-xs uppercase">PENDIENTE DE PAGO STRIPE</p>
                    <p class="text-gray-400 text-[10px] mt-1 mb-4">Esperando confirmación del banco para despachar al técnico.</p>
                    <button onclick="window.cancelarTicketFantasma('${id}')" class="bg-red-900/40 hover:bg-red-600 text-red-400 hover:text-white px-4 py-2 rounded-lg text-[10px] font-bold transition-all border border-red-500/30 shadow-lg"><i class="fas fa-trash-alt"></i> CANCELAR SOLICITUD / REINTENTAR</button>
                </div>
                `;
            } else if (s.estado === "procesando_saldo") {
                contenido = `
                <div class="bg-blue-900/10 border border-blue-500/30 p-4 rounded-xl mt-2 text-center shadow-inner">
                    <i class="fas fa-circle-notch fa-spin text-blue-500 text-3xl mb-3"></i>
                    <p class="text-blue-400 font-bold text-sm uppercase tracking-widest">PROCESANDO PAGO...</p>
                    <p class="text-gray-400 text-xs mt-2">No cierres esta ventana. Esperando la confirmación segura de Stripe.</p>
                </div>
                `;
            } else if (s.estado === "cotizando") {
                let htmlTabla = "";
                if (s.detalles_cotizacion && s.detalles_cotizacion.length > 0) {
                    const filas = s.detalles_cotizacion.map(item => `
                    <tr>
                        <td>${item.cantidad} ${escaparHTML(item.unidad)}</td>
                        <td>${escaparHTML(item.descripcion)}</td>
                        <td class="quote-num">$${item.precio}</td>
                        <td class="quote-num text-white">$${(item.cantidad * item.precio).toFixed(2)}</td>
                    </tr>
                    `).join('');
                    
                    htmlTabla = `
                    <div class="bg-black border border-zinc-700 rounded-lg overflow-hidden my-3">
                        <table class="quote-table" style="width: 100%; border-collapse: collapse; font-size: 10px; color: #ccc;">
                            <thead>
                                <tr>
                                    <th style="background: #1f1f1f; color: #10b981; padding: 4px;">CANT</th>
                                    <th style="background: #1f1f1f; color: #10b981; padding: 4px;">DESC</th>
                                    <th style="background: #1f1f1f; color: #10b981; padding: 4px;">P.U.</th>
                                    <th style="background: #1f1f1f; color: #10b981; padding: 4px;">IMP.</th>
                                </tr>
                            </thead>
                            <tbody>${filas}</tbody>
                            <tfoot>
                                <tr class="quote-total-row" style="background: #1a1a1a; border-top: 2px solid #333;">
                                    <td colspan="3" class="text-right font-bold text-gray-400" style="padding: 4px;">TOTAL:</td>
                                    <td class="quote-num text-emerald-500 font-black text-sm" style="padding: 4px;">$${(s.costo_final || 0).toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    `;
                } else {
                    htmlTabla = `<p class="text-white text-2xl font-black mt-1">$${s.costo_final || 0}</p>`;
                }

                const reporteDiagnosticoHTML = s.diagnostico ? `
                <div class="bg-black/50 border border-blue-900/50 p-3 rounded-lg mb-3 shadow-inner">
                    <p class="text-blue-400 text-[10px] font-bold uppercase tracking-widest mb-1"><i class="fas fa-clipboard-check"></i> Reporte de Diagnóstico Técnico:</p>
                    <p class="text-gray-300 text-xs italic leading-relaxed">"${escaparHTML(s.diagnostico)}"</p>
                </div>
                ` : '';

                let textoCobroCotizacion = s.metodo_pago === 'stripe'
                    ? `<p class="legal-note mt-2 text-blue-400 font-bold"><i class="fas fa-credit-card"></i> El saldo final será cobrado automáticamente a tu tarjeta vía STRIPE.</p>`
                    : `<p class="legal-note mt-2 text-emerald-500 font-bold"><i class="fas fa-hand-holding-usd"></i> Pago en EFECTIVO directo al técnico al finalizar.</p>`;

                let saldoPendiente = (s.costo_final || 0) - (s.retencion_inicial || 0);
                if (saldoPendiente < 0) saldoPendiente = 0;

                let btnAprobarHTML = "";
                if (s.metodo_pago === 'stripe' && saldoPendiente > 0) {
                    btnAprobarHTML = `<button onclick="window.iniciarPagoSaldo('${id}', ${saldoPendiente})" class="flex-[2] bg-blue-600 hover:bg-blue-500 text-white font-black text-xs py-3 rounded-lg transition-colors shadow-lg shadow-blue-500/20"><i class="fas fa-lock"></i> PAGAR SALDO ($${saldoPendiente.toFixed(2)})</button>`;
                } else {
                    btnAprobarHTML = `<button onclick="window.responderCotizacion('${id}', true)" class="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs py-3 rounded-lg transition-colors shadow-lg shadow-emerald-500/20">APROBAR COSTO</button>`;
                }

                contenido = `
                <div class="bg-zinc-800 p-4 rounded-lg border border-yellow-500 mt-2">
                    <div class="flex justify-between items-center mb-3 border-b border-zinc-700 pb-2">
                        <p class="text-yellow-500 text-xs font-bold uppercase">PRESUPUESTO GENERADO</p>
                        <span class="bg-yellow-500/20 text-yellow-500 text-[9px] px-2 py-1 rounded">FOLIO: ${id.substring(0,6).toUpperCase()}</span>
                    </div>
                    ${reporteDiagnosticoHTML}
                    ${htmlTabla}
                    <div class="mt-2 p-2 bg-black/50 rounded border border-white/5">
                        <p class="legal-note" style="font-size: 8px; color: #666;">* SI HUBIERA CANCELACION TOTAL O PARCIAL... PENALIZACION DEL 20%.</p>
                        <p class="legal-note" style="font-size: 8px; color: #666;">* GARANTIA POR ESCRITO MINIMO DE 6 MESES.</p>
                        ${textoCobroCotizacion}
                    </div>
                    <div class="flex gap-2 mt-4">
                        <button onclick="window.responderCotizacion('${id}', false)" class="flex-1 bg-red-900/50 hover:bg-red-900 text-red-200 text-xs py-3 rounded-lg font-bold transition-colors shadow-lg">
                            RECHAZAR
                        </button>
                        ${btnAprobarHTML}
                    </div>
                </div>
                `;
            } else if (s.estado === "finalizado") {
                const f_a1 = s.evidencia?.antes1 || s.evidencia?.antes;
                const f_a2 = s.evidencia?.antes2;
                const f_d1 = s.evidencia?.despues1 || s.evidencia?.despues;
                const f_d2 = s.evidencia?.despues2;

                let subtotalHtml = "";
                if (s.desglose) {
                    subtotalHtml = `
                    <div class="text-[10px] text-gray-400 font-mono mb-2 space-y-1">
                        <div class="flex justify-between"><span>Subtotal:</span> <span>$${s.desglose.subtotal}</span></div>
                        <div class="flex justify-between"><span>IVA (16%):</span> <span>$${s.desglose.iva}</span></div>
                    </div>`;
                }

                // 🔥 INYECCIÓN: BOTÓN SOLICITAR GARANTÍA AÑADIDO AL FINALIZAR 🔥
                contenido = `
                <div class="bg-emerald-900/10 border border-emerald-500/30 p-4 rounded-xl mt-2">
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-emerald-500 font-black text-xs uppercase tracking-widest">TICKET FINAL</span>
                        <span class="bg-emerald-500 text-black text-[9px] font-bold px-2 py-0.5 rounded">FINALIZADO</span>
                    </div>
                    <div class="mb-4 bg-black/40 p-3 rounded-lg border border-white/5">
                        ${subtotalHtml}
                        <div class="flex justify-between text-lg text-emerald-400 font-black border-t border-white/10 pt-2 mt-1">
                            <span>TOTAL PAGADO:</span>
                            <span>$${(s.costo_final || 0).toFixed(2)}</span>
                        </div>
                    </div>
                    <p class="text-[9px] text-gray-500 mb-2 font-bold uppercase">EVIDENCIA FOTOGRÁFICA (Cloud):</p>
                    <div class="grid grid-cols-4 gap-1 mb-4">
                        ${f_a1 ? `<div class="relative h-16"><img src="${f_a1}" class="w-full h-full object-cover rounded border border-zinc-700"></div>` : ''}
                        ${f_a2 ? `<div class="relative h-16"><img src="${f_a2}" class="w-full h-full object-cover rounded border border-zinc-700"></div>` : ''}
                        ${f_d1 ? `<div class="relative h-16"><img src="${f_d1}" class="w-full h-full object-cover rounded border border-zinc-700"></div>` : ''}
                        ${f_d2 ? `<div class="relative h-16"><img src="${f_d2}" class="w-full h-full object-cover rounded border border-zinc-700"></div>` : ''}
                    </div>
                    
                    <button onclick="window.generarPDF('${id}')" class="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs py-3 rounded-lg font-bold border border-white/10 transition-all flex items-center justify-center gap-2 shadow-lg mb-3">
                        <i class="fas fa-file-download text-red-500"></i> DESCARGAR REPORTE OFICIAL
                    </button>
                    
                    <button onclick="window.abrirModalGarantia('${id}', '${s.tecnico_id}')" class="w-full bg-black border border-orange-500 hover:bg-orange-900/40 text-orange-500 text-xs py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 shadow-[0_0_10px_rgba(249,115,22,0.2)]">
                        <i class="fas fa-shield-alt"></i> SOLICITAR GARANTÍA / REPORTAR FALLA
                    </button>

                    ${s.factura_requerida ? `<p class="text-[9px] text-center mt-3 text-emerald-400 italic">Factura CFDI solicitada. Te llegará por correo.</p>` : ''}
                </div>
                `;
            }

            let headerStatus = `<span class="text-[10px] font-bold text-yellow-500 animate-pulse">BUSCANDO...</span>`;
            let dotColor = "bg-yellow-500";
            if (s.estado !== "pendiente") {
                headerStatus = `<span class="text-[10px] font-bold text-blue-400 uppercase">${s.estado.replace('_', ' ')}</span>`;
                dotColor = "bg-blue-500";
                if(s.estado === "finalizado") { headerStatus = `<span class="text-[10px] font-bold text-emerald-500">FINALIZADO</span>`; dotColor = "bg-emerald-500"; }
                if(s.estado === "cancelado") { headerStatus = `<span class="text-[10px] font-bold text-red-500">CANCELADO</span>`; dotColor = "bg-red-500"; }
                if(s.estado === "iniciado_stripe") { headerStatus = `<span class="text-[10px] font-bold text-blue-400 animate-pulse">PAGO PENDIENTE (STRIPE)</span>`; dotColor = "bg-blue-500"; }
                if(s.estado === "procesando_saldo") { headerStatus = `<span class="text-[10px] font-bold text-blue-400 animate-pulse">PROCESANDO SALDO</span>`; dotColor = "bg-blue-500"; }
            }

            let fechaFormat = "";
            if(s.created_at) {
                const dateObj = new Date(s.created_at.seconds * 1000);
                fechaFormat = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }

            const badgeUrgencia = s.urgencia ? `<span class="bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(220,38,38,0.8)] uppercase ml-2"><i class="fas fa-fire"></i> EMERGENCIA</span>` : '';

            const imgInicialHTML = s.foto_problema ? `
            <div class="mt-3 mb-3 p-2 bg-black/50 border border-zinc-800 rounded-xl">
                <p class="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2"><i class="fas fa-camera"></i> Foto del Problema:</p>
                <img src="${s.foto_problema}" class="w-full h-32 object-cover rounded-lg border border-zinc-700">
            </div>` : '';

            const card = document.createElement("div");
            card.className = "uber-card rounded-2xl overflow-hidden shadow-lg mb-3";

            card.innerHTML = `
            <div class="p-4 flex justify-between items-center cursor-pointer hover:bg-zinc-800/50 transition-colors" onclick="toggleAccordion('hist-${id}', 'icon-${id}')">
                <div class="flex items-center gap-4">
                    <div class="w-3 h-3 ${dotColor} rounded-full shadow-[0_0_8px_currentColor]"></div>
                    <div>
                        <h4 class="font-black text-white text-sm uppercase tracking-tight">${escaparHTML(s.categoria)} <span class="text-gray-500 font-normal ml-1">| ${escaparHTML(s.sub_servicio || '')}</span> ${badgeUrgencia}</h4>
                        <div class="flex items-center gap-2 mt-1">
                            ${headerStatus}
                            <span class="text-[9px] text-gray-500">• ${fechaFormat}</span>
                        </div>
                    </div>
                </div>
                <i id="icon-${id}" class="fas fa-chevron-down text-gray-400 chevron-icon"></i>
            </div>

            <div id="hist-${id}" class="expandable-content bg-zinc-900/40">
                <div class="p-4 border-t border-zinc-800/50">
                    <p class="text-xs text-gray-400 truncate mb-3"><i class="fas fa-map-marker-alt text-zinc-600"></i> ${escaparHTML(s.direccion)}</p>
                    
                    ${imgInicialHTML}
                    ${contenido}

                    ${(s.estado === 'en_camino' || s.estado === 'en_sitio') ? `
                    <button onclick="window.abrirMapaEnVivo('${id}')" class="w-full mt-4 text-center bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs py-3 rounded-xl border border-blue-500/30 transition-colors font-bold flex items-center justify-center gap-2 shadow-lg">
                        <i class="fas fa-map-marked-alt"></i> SEGUIR TÉCNICO EN VIVO
                    </button>
                    ` : ''}
                </div>
            </div>
            `;
            el.lista.appendChild(card);
        });
    });

    window.cancelarTicketFantasma = async (id) => {
        if(!confirm("¿Deseas cancelar esta solicitud que quedó pendiente de pago?")) return;
        try {
            await updateDoc(doc(db, "services", id), { estado: "cancelado", cancelado_razon: "Abortado por el usuario (Ticket Fantasma)" });
        } catch(e) {
            console.error("Error al cancelar ticket fantasma:", e);
        }
    };

    window.iniciarPagoSaldo = async (id, saldo) => {
        alert(`🔒 SEGURIDAD GESTIAPREMIUM:\n\nSerás redirigido a Stripe para cubrir el saldo pendiente de $${saldo.toFixed(2)} MXN.\n\nUna vez procesado el pago, el técnico comenzará a trabajar de inmediato.`);
        try {
            await updateDoc(doc(db, "services", id), { estado: "procesando_saldo" });
            
            if (window.procesarPagoSaldoStripe) {
                window.procesarPagoSaldoStripe(id, saldo);
            } else {
                console.warn("MODO DEV: Simulando éxito de Stripe (falta programar procesarPagoSaldoStripe en el bridge)");
                setTimeout(async () => {
                    await updateDoc(doc(db, "services", id), { estado: "trabajando" });
                }, 2500);
            }
        } catch (error) {
            console.error("Error iniciando pago de saldo:", error);
            alert("Error de conexión al iniciar el pago. Intenta de nuevo.");
        }
    };

    window.abrirMapaEnVivo = (id) => {
        const existingModal = document.getElementById('modalMapaVivo');
        if (existingModal) existingModal.remove();

        const html = `
        <div id="modalMapaVivo" class="fixed inset-0 bg-black/95 z-[70] flex flex-col p-4 animate-fade-in">
            <div class="flex justify-between items-center mb-4 mt-2">
                <h3 class="text-white font-black text-lg flex items-center gap-2"><img src="assets/gestiapremium-icon.svg" class="w-6 h-6 drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]"> RASTREO EN VIVO</h3>
                <button onclick="document.getElementById('modalMapaVivo').remove()" class="bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors shadow-lg">
                    <i class="fas fa-times"></i> CERRAR MAPA
                </button>
            </div>
            <div class="flex-1 rounded-2xl overflow-hidden border border-zinc-700 relative bg-zinc-900 flex items-center justify-center shadow-2xl">
                <div class="absolute text-zinc-600 flex flex-col items-center z-0">
                    <i class="fas fa-spinner fa-spin text-3xl mb-2"></i>
                    <p class="text-xs font-bold uppercase tracking-widest">Conectando con GPS...</p>
                </div>
                <iframe src="rastreo.html?id=${id}" class="w-full h-full border-0 absolute inset-0 z-10"></iframe>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    };

    window.responderCotizacion = async (id, aceptado) => {
        const serviceRef = doc(db, "services", id);
        
        try {
            if (aceptado) {
                await runTransaction(db, async (transaction) => {
                    const sfDoc = await transaction.get(serviceRef);
                    if (!sfDoc.exists()) throw "NO_EXISTE";
                    if (sfDoc.data().estado !== "cotizando") throw "ESTADO_INVALIDO";
                    transaction.update(serviceRef, { estado: "trabajando" });
                });
                alert(" ✅ ¡Costo aprobado! El técnico comenzará a trabajar ahora.");
            } else {
                if(confirm(" ⚠ ¿Estás seguro de cancelar?\n\nAl haber llegado el técnico, le deberás pagar el costo mínimo de visita ($550).")) {
                    await runTransaction(db, async (transaction) => {
                        const sfDoc = await transaction.get(serviceRef);
                        if (!sfDoc.exists()) throw "NO_EXISTE";
                        
                        const currentStatus = sfDoc.data().estado;
                        if (currentStatus === "cancelado" || currentStatus === "finalizado") {
                            throw "ESTADO_FINALIZADO";
                        }

                        transaction.update(serviceRef, {
                            estado: "cancelado",
                            costo_final: 550, 
                            cancelado_razon: "Cliente rechazó cotización"
                        });
                    });
                    alert(" 🚫 Servicio cancelado exitosamente. Por favor, liquida el costo de visita al técnico.");
                }
            }
        } catch (error) {
            console.error("Error en transacción del cliente:", error);
            if(error === "ESTADO_INVALIDO" || error === "ESTADO_FINALIZADO") {
                alert("⚠️ Error: El estado del servicio ya cambió (fue cancelado o finalizado) y no puede ser modificado.");
            } else {
                alert("❌ Error de red al procesar tu respuesta. Intenta de nuevo.");
            }
        }
    };

    // 🔥 INYECCIÓN SPLIT BILLING: PDF EMITIDO POR EL TÉCNICO (100% COSTO) 🔥
    window.generarPDF = async (serviceId) => {
        const btn = document.activeElement;
        const textoOrig = btn.innerText;
        btn.innerText = "OBTENIENDO DATOS...";
        btn.disabled = true;

        try {
            const docRef = doc(db, "services", serviceId);
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
                throw new Error("No se encontró el servicio en la base de datos.");
            }
            
            const data = { ...docSnap.data(), id: serviceId };

            let tecnicoNombre = "ESPECIALISTA INDEPENDIENTE";
            let tecnicoLogo = null;
            let tecnicoRFC = "XAXX010101000";
            
            if (data.tecnico_id) {
                try {
                    const techSnap = await getDoc(doc(db, "users", data.tecnico_id));
                    if (techSnap.exists()) {
                        const tData = techSnap.data();
                        tecnicoNombre = (tData.nombre || tecnicoNombre).toUpperCase();
                        tecnicoLogo = tData.logo_factura || null;
                        tecnicoRFC = tData.rfc || tecnicoRFC;
                    }
                } catch(e) {
                    console.warn("No se pudo obtener el perfil del técnico para el PDF.");
                }
            }

            const { jsPDF } = await cargarLibreriaPDF();
            const docPdf = new jsPDF();
            
            docPdf.setFillColor(18, 18, 18);
            docPdf.rect(0, 0, 215, 40, 'F');
            docPdf.setTextColor(255, 255, 255);
            
            if (tecnicoLogo) {
                try {
                    const logoType = tecnicoLogo.includes("image/png") ? "PNG" : "JPEG";
                    docPdf.addImage(tecnicoLogo, logoType, 15, 5, 30, 30);
                    docPdf.setFont("helvetica", "bold");
                    docPdf.setFontSize(16);
                    docPdf.text(tecnicoNombre, 50, 22);
                    
                    docPdf.setFontSize(8);
                    docPdf.setTextColor(16, 185, 129); 
                    docPdf.text("SOCIO VERIFICADO", 50, 28);
                } catch(e) {
                    docPdf.setFont("helvetica", "bold");
                    docPdf.setFontSize(18);
                    docPdf.text(tecnicoNombre, 20, 22);
                }
            } else {
                docPdf.setFont("helvetica", "bold");
                docPdf.setFontSize(18);
                docPdf.text(tecnicoNombre, 20, 22);
            }

            docPdf.setTextColor(200, 200, 200);
            docPdf.setFontSize(10);
            docPdf.text("Comprobante de Servicio Digital", 20, 32);
            
            docPdf.setFontSize(8);
            docPdf.setTextColor(150, 150, 150);
            docPdf.text(`RFC EMISOR: ${tecnicoRFC}`, 20, 45);
            docPdf.text(`RÉGIMEN FISCAL: Persona Física con Actividades Empresariales`, 20, 50);
            docPdf.text(`LUGAR EXPEDICIÓN: 77500, Cancún, Q.Roo`, 20, 55);
            
            if(data.folio_fiscal) docPdf.text(`FOLIO FISCAL: ${data.folio_fiscal}`, 150, 45);
            docPdf.text(`FECHA: ${new Date().toLocaleDateString()}`, 150, 50);

            let y = 70;
            docPdf.setTextColor(0, 0, 0);
            docPdf.setFontSize(12);
            docPdf.setFont("helvetica", "bold");
            docPdf.text("DETALLES DEL SERVICIO", 20, y);

            y += 10;
            docPdf.setFont("helvetica", "normal");
            docPdf.setFontSize(10);
            docPdf.text(`Cliente: ${data.cliente_nombre}`, 20, y);
            const servicioLabel = `${data.categoria} ${data.sub_servicio ? '- ' + data.sub_servicio : ''}`;
            docPdf.text(`Categoría: ${servicioLabel}`, 120, y);
            y += 8;
            docPdf.text(`Ubicación: ${data.direccion}`, 20, y);

            y += 15;
            docPdf.setDrawColor(200, 200, 200);
            docPdf.line(20, y, 190, y);

            y += 15;
            docPdf.setFont("helvetica", "bold");
            docPdf.setFontSize(12);
            docPdf.text("DIAGNÓSTICO TÉCNICO Y COSTOS", 20, y);

            y += 10;
            
            if (data.detalles_cotizacion && data.detalles_cotizacion.length > 0) {
                docPdf.setFontSize(9);
                docPdf.setTextColor(100, 100, 100);
                docPdf.setFont("helvetica", "bold");
                
                docPdf.text("CANT", 20, y);
                docPdf.text("DESCRIPCIÓN", 45, y); 
                docPdf.text("P.UNIT", 140, y);
                docPdf.text("IMPORTE", 170, y);
                
                y += 5;
                docPdf.setDrawColor(50, 50, 50);
                docPdf.setLineWidth(0.5);
                docPdf.line(20, y, 190, y);
                y += 7;

                docPdf.setFont("helvetica", "normal");
                docPdf.setTextColor(0, 0, 0);
                
                data.detalles_cotizacion.forEach(item => {
                    docPdf.text(`${item.cantidad} ${item.unidad}`, 20, y);
                    const desc = item.descripcion.substring(0, 50) + (item.descripcion.length > 50 ? '...' : '');
                    docPdf.text(desc, 45, y);
                    docPdf.text(`$${item.precio}`, 140, y);
                    docPdf.text(`$${(item.cantidad * item.precio).toFixed(2)}`, 170, y);
                    y += 7;
                });
                y += 5; 
            } else {
                docPdf.setFont("helvetica", "normal");
                docPdf.setFontSize(10);
                docPdf.setTextColor(50, 50, 50); 
                
                const diagText = data.diagnostico || "(Sin desglose registrado en base de datos)";
                const splitDiag = docPdf.splitTextToSize(diagText, 170);
                
                docPdf.text(splitDiag, 20, y);
                y += (splitDiag.length * 7) + 5;
            }

            docPdf.setFillColor(245, 245, 245);
            docPdf.rect(120, y, 70, 40, 'F'); 
            
            docPdf.setTextColor(0, 0, 0);
            docPdf.setFontSize(10);
            docPdf.text("IMPORTE TOTAL:", 125, y + 10);
            
            if (data.desglose) {
                docPdf.setFontSize(8);
                docPdf.text(`Subtotal: $${data.desglose.subtotal}`, 125, y + 18);
                docPdf.text(`IVA (16%): $${data.desglose.iva}`, 125, y + 23);
            }

            docPdf.setFont("helvetica", "bold");
            docPdf.setFontSize(16);
            docPdf.setTextColor(16, 185, 129); 
            docPdf.text(`$${data.costo_final || 0} MXN`, 125, y + 35);

            y += 60;
            docPdf.setTextColor(0, 0, 0);
            docPdf.setFontSize(12);
            docPdf.text("EVIDENCIA FOTOGRÁFICA (Cloud)", 20, y);
            y += 10;
            
            const f_a1 = data.evidencia?.antes1 || data.evidencia?.antes;
            const f_a2 = data.evidencia?.antes2;
            const f_d1 = data.evidencia?.despues1 || data.evidencia?.despues;
            const f_d2 = data.evidencia?.despues2;

            btn.innerText = "PROCESANDO FOTOS...";

            const [b64_a1, b64_a2, b64_d1, b64_d2] = await Promise.all([
                urlABase64(f_a1),
                urlABase64(f_a2),
                urlABase64(f_d1),
                urlABase64(f_d2)
            ]);

            docPdf.setTextColor(0, 0, 0);
            if(b64_a1) { docPdf.addImage(b64_a1, "JPEG", 20, y, 40, 30); docPdf.setFontSize(8); docPdf.text("ANTES 1", 20, y + 35); }
            if(b64_a2) { docPdf.addImage(b64_a2, "JPEG", 65, y, 40, 30); docPdf.setFontSize(8); docPdf.text("ANTES 2", 65, y + 35); }
            if(b64_d1) { docPdf.addImage(b64_d1, "JPEG", 110, y, 40, 30); docPdf.setFontSize(8); docPdf.text("DESPUÉS 1", 110, y + 35); }
            if(b64_d2) { docPdf.addImage(b64_d2, "JPEG", 155, y, 40, 30); docPdf.setFontSize(8); docPdf.text("DESPUÉS 2", 155, y + 35); }

            const firmaDigitalCliente = data.evidencia?.firma_cliente;
            if (firmaDigitalCliente) {
                y += 45; 
                docPdf.setFontSize(10);
                docPdf.setFont("helvetica", "bold");
                docPdf.setTextColor(0, 0, 0);
                docPdf.text("FIRMA DE CONFORMIDAD DEL CLIENTE", 20, y);
                docPdf.addImage(firmaDigitalCliente, "PNG", 20, y + 5, 60, 20); 
                docPdf.setDrawColor(50, 50, 50);
                docPdf.setLineWidth(0.5);
                docPdf.line(20, y + 26, 80, y + 26); 
            }
            
            // 3. Leyenda de Intermediación
            docPdf.setFontSize(8);
            docPdf.setTextColor(150, 150, 150);
            const notaLegal = "Este documento es un comprobante de servicio emitido directamente por el especialista independiente que ejecutó la obra. Plataforma de intermediación tecnológica: GestiaPremium.";
            const splitNota = docPdf.splitTextToSize(notaLegal, 170);
            docPdf.text(splitNota, 20, 280);
            
            docPdf.save(`Comprobante_Servicio_${data.id.substring(0,6)}.pdf`);
            
            btn.innerText = "DESCARGAR REPORTE OFICIAL";
            btn.disabled = false;

        } catch (error) {
            console.error(error);
            alert("Hubo un error generando el PDF. Asegúrate de tener conexión a internet.");
            btn.innerText = "ERROR - REINTENTAR";
            btn.disabled = false;
        }
    };
}
