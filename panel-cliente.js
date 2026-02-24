/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - MÓDULO DE CLIENTE (CEREBRO COMERCIAL)
 * ======================================================================================
 * Archivo: panel-cliente.js
 * Descripción: Catálogo dinámico, cotizador interactivo, anti-spam y PDFs de usuario.
 * REGLAS DE ARQUITECTURA: NO COMPACTAR. NO FRAGMENTAR. MANTENER LOGICA.
 * ======================================================================================
 */

import {
 db,
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

// Funciones específicas de Firestore importadas desde el CDN
import { runTransaction, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Sistema Nervioso Compartido
import { escaparHTML, cargarLibreriaPDF, urlABase64, sonarAlerta } from "./app-utils.js";

// ======================================================================================
// 3. PANEL DE CLIENTE (USUARIO FINAL) - V5.17.0
// ======================================================================================
export async function iniciarPanelCliente(user) {
 console.log(" 📱 Iniciando Panel de Cliente (Modo Bootstrapping / Efectivo / 4K Storage)...");

 const el = {
 form: document.getElementById("nuevaSolicitudForm"),
 lista: document.getElementById("solicitudesCliente"),
 inputCat: document.getElementById("categoriaSeleccionada"),
 labelServicio: document.getElementById("btnLabel"),
 containerRoad: document.getElementById("content_road"),
 containerFix: document.getElementById("content_fix"),
 containerTech: document.getElementById("content_tech"),
 containerMaint: document.getElementById("content_maint"),
 stripeCard: document.getElementById("stripe_card"),
 toggleFactura: document.getElementById("toggleFactura"),
 facRfc: document.getElementById("fac_rfc"),
 facRazon: document.getElementById("fac_razon"),
 facCp: document.getElementById("fac_cp"),
 facRegimen: document.getElementById("fac_regimen")
 };

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
 // 3.2 ENVÍO DE SOLICITUD (SHARK MODE ANTI-SPAM & RUTEO DUAL STRIPE/EFECTIVO)
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
 if (!datosFacturacion.rfc || !datosFacturacion.razon_social) {
 alert("⚠️ Si requieres factura, por favor completa RFC y Razón Social.");
 return;
 }
 }

 const btn = el.form.querySelector("button");
 const textoOriginal = btn.innerHTML;
 btn.disabled = true;
 btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> PROCESANDO CONEXIÓN...`;
 
 setTimeout(() => {
 btn.innerHTML = `<i class="fas fa-satellite-dish"></i> OBTENIENDO UBICACIÓN SATELITAL...`;
 if (navigator.geolocation) {
 navigator.geolocation.getCurrentPosition(
 async (pos) => {
 await enviarSolicitudFinal(cat, dir, desc, {
 lat: pos.coords.latitude,
 lng: pos.coords.longitude
 }, requiereFactura, datosFacturacion);
 },
 async (err) => {
 console.warn("GPS Cliente no disponible:", err);
 await enviarSolicitudFinal(cat, dir, desc, null, requiereFactura, datosFacturacion);
 },
 { timeout: 15000, maximumAge: 10000, enableHighAccuracy: true }
 );
 } else {
 enviarSolicitudFinal(cat, dir, desc, null, requiereFactura, datosFacturacion);
 }
 }, 500); 
 
 async function enviarSolicitudFinal(categoriaFull, direccion, descripcion, coords, reqFac, datosFac) {
 const partes = categoriaFull.split('_');
 const vertical = partes[0].toUpperCase(); 
 const servicio = partes[1] ? partes[1].toUpperCase() : 'GENERAL';

 // 🔥 INYECCIÓN: LÓGICA DE RUTEO DE PAGO SEGÚN PERMISOS VIP
 const esEfectivoAutorizado = user.efectivo_autorizado === true;
 let metodoSeleccionado = "stripe"; // Tarjeta por defecto

 if (esEfectivoAutorizado) {
 const quiereEfectivo = confirm("⭐ ERES CLIENTE VIP ⭐\n\nTienes autorización para pagar en EFECTIVO directo al técnico.\n\n- Toca [Aceptar] para solicitar con pago en EFECTIVO.\n- Toca [Cancelar] para retener $550 con TARJETA.");
 if (quiereEfectivo) {
 metodoSeleccionado = "efectivo";
 }
 }

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
 estado: metodoSeleccionado === "efectivo" ? "pendiente" : "iniciado_stripe", // <-- CLAVE ANTI-DUPLICADO
 metodo_pago: metodoSeleccionado,
 zona: "Cancún",
 created_at: serverTimestamp(),
 retencion_inicial: metodoSeleccionado === "stripe" ? 550 : 0, 
 costo_final: 0,
 coords: coords,
 factura_requerida: reqFac,
 datos_facturacion: datosFac,
 factura_enviada: false
 };

 // Creamos UN SOLO DOCUMENTO base
 const docRef = await addDoc(collection(db, "services"), payloadTicket);
 lastSubmitTime = Date.now(); 

 el.form.reset();
 if(el.toggleFactura) {
 el.toggleFactura.checked = false;
 document.getElementById('datosFacturacion')?.classList.add('hidden');
 }
 
 const formContainer = document.getElementById("modalSolicitud");
 if(formContainer) formContainer.classList.add("hidden");

 if(el.labelServicio) el.labelServicio.innerText = "SERVICIO";
 document.querySelectorAll('.service-card-btn').forEach(cardBtn => {
 cardBtn.classList.remove('bg-zinc-800', 'border-emerald-500', 'ring-1', 'ring-emerald-500');
 cardBtn.classList.add('bg-zinc-900', 'border-zinc-700');
 });

 // REDIRECCIÓN SEGÚN MÉTODO
 if (metodoSeleccionado === "stripe") {
 alert("🔒 Redirigiendo a pasarela segura...\n\nSe realizará una retención de $550 MXN por garantía. Tu técnico será asignado en cuanto confirmes el pago.");
 // Hook para tu archivo fixgo-bridge.js
 if (window.procesarPagoStripe) {
 window.procesarPagoStripe(docRef.id, payloadTicket);
 } else {
 console.warn("Falta conectar la pasarela. Por favor, asegúrate de que fixgo-bridge.js lea este ticket ID:", docRef.id);
 // Si no tienes la función conectada, aquí debes integrar el window.location.href a Stripe.
 }
 } else {
 alert(" ✅ ¡Solicitud VIP en Efectivo Enviada!\n\nNuestro sistema está buscando al técnico certificado más cercano...");
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
 console.log(" 🔔 Actualización de servicio:", newData.estado);
 sonarAlerta();

 if (newData.estado === 'finalizado') {
 alert("✅ ¡Servicio terminado exitosamente!\n\nPor favor, realiza el pago en efectivo directamente al técnico. Revisa tu comprobante digital en pantalla.");
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
 // Visualización amigable para cuando el cliente aún no paga o está procesando
 contenido = `
 <div class="bg-blue-900/10 border border-blue-500/30 p-4 rounded-xl mt-2 text-center">
 <i class="fas fa-credit-card text-blue-500 text-2xl mb-2 animate-bounce"></i>
 <p class="text-blue-400 font-bold text-xs uppercase">PENDIENTE DE PAGO STRIPE</p>
 <p class="text-gray-400 text-[10px] mt-1">Esperando confirmación del banco para despachar al técnico.</p>
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
 <td class="quote-num text-emerald-500 font-black text-sm" style="padding: 4px;">$${s.costo_final.toFixed(2)}</td>
 </tr>
 </tfoot>
 </table>
 </div>
 `;
 } else {
 htmlTabla = `<p class="text-white text-2xl font-black mt-1">$${s.costo_final}</p><p class="text-gray-400 text-xs italic">"${escaparHTML(s.diagnostico)}"</p>`;
 }

 contenido = `
 <div class="bg-zinc-800 p-4 rounded-lg border border-yellow-500 mt-2">
 <div class="flex justify-between items-center mb-2">
 <p class="text-yellow-500 text-xs font-bold uppercase">PRESUPUESTO GENERADO</p>
 <span class="bg-yellow-500/20 text-yellow-500 text-[9px] px-2 py-1 rounded">FOLIO: ${id.substring(0,6).toUpperCase()}</span>
 </div>
 ${htmlTabla}
 <div class="mt-2 p-2 bg-black/50 rounded border border-white/5">
 <p class="legal-note" style="font-size: 8px; color: #666;">* SI HUBIERA CANCELACION TOTAL O PARCIAL... PENALIZACION DEL 20%.</p>
 <p class="legal-note" style="font-size: 8px; color: #666;">* GARANTIA POR ESCRITO MINIMO DE 6 MESES.</p>
 <p class="legal-note mt-2 text-emerald-500 font-bold"><i class="fas fa-hand-holding-usd"></i> Pago en EFECTIVO directo al técnico al finalizar.</p>
 </div>
 <div class="flex gap-2 mt-4">
 <button onclick="window.responderCotizacion('${id}', false)" class="flex-1 bg-red-900/50 hover:bg-red-900 text-red-200 text-xs py-3 rounded-lg font-bold transition-colors">
 RECHAZAR
 </button>
 <button onclick="window.responderCotizacion('${id}', true)" class="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs py-3 rounded-lg transition-colors shadow-lg shadow-emerald-500/20">
 APROBAR COSTO
 </button>
 </div>
 </div>
 `;
 } else if (s.estado === "finalizado") {
 const f_a1 = s.evidencia?.antes1 || s.evidencia?.antes;
 const f_a2 = s.evidencia?.antes2;
 const f_d1 = s.evidencia?.despues1 || s.evidencia?.despues;
 const f_d2 = s.evidencia?.despues2;

 contenido = `
 <div class="bg-emerald-900/10 border border-emerald-500/30 p-4 rounded-xl mt-2">
 <div class="flex justify-between items-center mb-3">
 <span class="text-emerald-500 font-black text-xs uppercase tracking-widest">TICKET FINAL</span>
 <span class="bg-emerald-500 text-black text-[9px] font-bold px-2 py-0.5 rounded">FINALIZADO</span>
 </div>
 <div class="space-y-2 mb-4">
 <div class="flex justify-between text-lg text-white font-black">
 <span>TOTAL PAGADO:</span>
 <span>$${s.costo_final}</span>
 </div>
 </div>
 <p class="text-[9px] text-gray-500 mb-2 font-bold uppercase">EVIDENCIA FOTOGRÁFICA (Cloud):</p>
 <div class="grid grid-cols-4 gap-1 mb-4">
 ${f_a1 ? `<div class="relative h-16"><img src="${f_a1}" class="w-full h-full object-cover rounded border border-zinc-700"></div>` : ''}
 ${f_a2 ? `<div class="relative h-16"><img src="${f_a2}" class="w-full h-full object-cover rounded border border-zinc-700"></div>` : ''}
 ${f_d1 ? `<div class="relative h-16"><img src="${f_d1}" class="w-full h-full object-cover rounded border border-zinc-700"></div>` : ''}
 ${f_d2 ? `<div class="relative h-16"><img src="${f_d2}" class="w-full h-full object-cover rounded border border-zinc-700"></div>` : ''}
 </div>
 <button onclick="window.generarPDF('${id}')" class="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs py-3 rounded-lg font-bold border border-white/10 transition-all flex items-center justify-center gap-2">
 <i class="fas fa-file-download text-red-500"></i> DESCARGAR REPORTE FISCAL
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
 }

 let fechaFormat = "";
 if(s.created_at) {
 const dateObj = new Date(s.created_at.seconds * 1000);
 fechaFormat = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
 }

 const card = document.createElement("div");
 card.className = "uber-card rounded-2xl overflow-hidden shadow-lg mb-3";

 card.innerHTML = `
 <div class="p-4 flex justify-between items-center cursor-pointer hover:bg-zinc-800/50 transition-colors" onclick="toggleAccordion('hist-${id}', 'icon-${id}')">
 <div class="flex items-center gap-4">
 <div class="w-3 h-3 ${dotColor} rounded-full shadow-[0_0_8px_currentColor]"></div>
 <div>
 <h4 class="font-black text-white text-sm uppercase tracking-tight">${escaparHTML(s.categoria)} <span class="text-gray-500 font-normal ml-1">| ${escaparHTML(s.sub_servicio || '')}</span></h4>
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
 


 ${contenido}

 ${(s.estado === 'en_camino' || s.estado === 'en_sitio') ? `
 <button onclick="window.abrirMapaEnVivo('${id}')" class="w-full mt-4 text-center bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs py-3 rounded-xl border border-blue-500/30 transition-colors font-bold flex items-center justify-center gap-2">
 <i class="fas fa-map-marked-alt"></i> SEGUIR TÉCNICO EN VIVO
 </button>
 ` : ''}
 </div>
 </div>
 `;
 el.lista.appendChild(card);
 });
 });

 window.abrirMapaEnVivo = (id) => {
 const existingModal = document.getElementById('modalMapaVivo');
 if (existingModal) existingModal.remove();

 const html = `
 <div id="modalMapaVivo" class="fixed inset-0 bg-black/95 z-[70] flex flex-col p-4 animate-fade-in">
 <div class="flex justify-between items-center mb-4 mt-2">
 <h3 class="text-white font-black text-lg flex items-center gap-2"><img src="assets/gestiapremium-icon.svg" class="w-6 h-6 drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]"> RASTREO EN VIVO</h3>
 <button onclick="document.getElementById('modalMapaVivo').remove()" class="bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors">
 <i class="fas fa-times"></i> CERRAR MAPA
 </button>
 </div>
 <div class="flex-1 rounded-2xl overflow-hidden border border-zinc-700 relative bg-zinc-900 flex items-center justify-center">
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
 costo_final: 550, // <-- CANDADO DE GARANTÍA MILITAR
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
 const { jsPDF } = await cargarLibreriaPDF();
 const docPdf = new jsPDF();
 
 docPdf.setFillColor(18, 18, 18);
 docPdf.rect(0, 0, 215, 40, 'F');

 docPdf.setTextColor(255, 255, 255);
 docPdf.setFont("helvetica", "bold");
 docPdf.setFontSize(24);
 docPdf.text("GESTIAPREMIUM", 20, 22);
 docPdf.setFont("helvetica", "normal");
 docPdf.setTextColor(16, 185, 129); 
 docPdf.text("MÉXICO", 85, 22);

 docPdf.setTextColor(200, 200, 200);
 docPdf.setFontSize(10);
 docPdf.text("Comprobante de Servicio Digital", 20, 32);
 
 docPdf.setFontSize(8);
 docPdf.setTextColor(150, 150, 150);
 docPdf.text(`RFC EMISOR: FXG260211-H8A`, 20, 45);
 docPdf.text(`RÉGIMEN FISCAL: 626 - Simplificado de Confianza`, 20, 50);
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
 docPdf.text(`$${data.costo_final} MXN`, 125, y + 35);

 y += 60;
 docPdf.setTextColor(0, 0, 0);
 docPdf.setFontSize(12);
 docPdf.text("EVIDENCIA FOTOGRÁFICA (Cloud)", 20, y);
 y += 10;
 
 // 🔥 V5.17.2: Traducción Base64 para el Cliente
 const f_a1 = data.evidencia?.antes1 || data.evidencia?.antes;
 const f_a2 = data.evidencia?.antes2;
 const f_d1 = data.evidencia?.despues1 || data.evidencia?.despues;
 const f_d2 = data.evidencia?.despues2;

 btn.innerText = "PROCESANDO FOTOS...";

 // Descarga las imágenes de Cloud y las convierte para el PDF
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

 // --- INYECCIÓN V5.18.0: FIRMA DIGITAL EN PDF (CLIENTE) ---
 const firmaDigitalCliente = data.evidencia?.firma_cliente;
 if (firmaDigitalCliente) {
 y += 45; // Bajamos el cursor Y
 docPdf.setFontSize(10);
 docPdf.setFont("helvetica", "bold");
 docPdf.setTextColor(0, 0, 0);
 docPdf.text("FIRMA DE CONFORMIDAD DEL CLIENTE", 20, y);
 docPdf.addImage(firmaDigitalCliente, "PNG", 20, y + 5, 60, 20); // Renderizamos la firma
 docPdf.setDrawColor(50, 50, 50);
 docPdf.setLineWidth(0.5);
 docPdf.line(20, y + 26, 80, y + 26); // Línea de firma
 }
 // ---------------------------------------------------------
 
 docPdf.setFontSize(8);
 docPdf.setTextColor(150, 150, 150);
 docPdf.text("Este documento es un comprobante digital emitido por la plataforma GestiaPremium.", 60, 280);
 docPdf.save(`GestiaPremium_Reporte_${data.id}.pdf`);
 
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
