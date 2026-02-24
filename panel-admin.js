/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - MÓDULO DE ADMINISTRACIÓN (CEREBRO FINANCIERO)
 * ======================================================================================
 * Archivo: panel-admin.js
 * Descripción: Torre de control pro, finanzas, aprobación de técnicos y auditorías.
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
 setDoc,
 getDoc 
} from "./firebase.js";

// Importaciones específicas de Firestore CDN usadas por el Admin
import { getDocs, increment, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Importamos el Sistema Nervioso Compartido
import { escaparHTML, cargarLibreriaPDF, urlABase64 } from "./app-utils.js";

// ======================================================================================
// 1. PANEL DE ADMINISTRADOR (TORRE DE CONTROL PRO)
// ======================================================================================
export async function iniciarPanelAdmin(user) {
 console.log(" 🛡️ Iniciando Panel de Administrador (Modo BI V5.17.4 - Bootstrapping)...");
 
 // 🚨 CANDADO DE SEGURIDAD MAESTRO: Validación estricta de rol
 if (!user || user.rol !== "admin") {
 console.error("🛑 ALERTA DE SEGURIDAD GESTIAPREMIUM: Intento de acceso no autorizado al Panel Admin.");
 alert("🔒 ACCESO DENEGADO.");
 return;
 }

 const elementos = {
 lista: document.getElementById("listaTecnicos"),
 actividad: document.getElementById("listaTransacciones"),
 listaRetiros: document.getElementById("listaRetiros"),
 btnToggleHistorialRetiros: document.getElementById("btnToggleHistorialRetiros"),
 vistaRetirosPendientes: document.getElementById("vistaRetirosPendientes"),
 vistaHistorialRetiros: document.getElementById("vistaHistorialRetiros"),
 listaHistorialRetiros: document.getElementById("listaHistorialRetiros"),
 countServ: document.querySelector(".fa-bolt")?.closest(".uber-card")?.querySelector("h3"),
 countMoney: document.getElementById("countMoneyFixgo"), 
 countBovedaStripe: document.getElementById("countBovedaStripe"), 
 countOnline: document.getElementById("totalTecnicos"),
 listaFacturasPendientes: document.getElementById("listaFacturasPendientes"), 
 contadorFacturas: document.getElementById("contadorFacturas") 
 };

 // --- A. GESTIÓN DE TÉCNICOS ---
 if (elementos.lista) {
 const qTecnicos = query(collection(db, "users"), where("rol", "==", "tecnico"));

 onSnapshot(qTecnicos, (snap) => {
 elementos.lista.innerHTML = ""; 

 let contOnline = 0;
 let contTotal = 0;
 
 if (snap.empty) {
 elementos.lista.innerHTML = '<p class="text-gray-500 p-4 italic">No hay técnicos registrados en la base de datos.</p>';
 }
 
 snap.forEach((docSnap) => {
 const data = docSnap.data();
 contTotal++;

 if(data.disponible) {
 contOnline++;
 }
 
 const esPendiente = (data.estado || "pendiente") === "pendiente";
 const ineCheck = data.documentos?.ine ? '<span class="text-emerald-400"> ✅ INE</span>' : '<span class="text-red-500"> ❌ INE</span>';
 const csfCheck = data.documentos?.csf ? '<span class="text-emerald-400"> ✅ CSF</span>' : '<span class="text-red-500"> ❌ CSF</span>';
 const skillsStr = data.skills ? data.skills.join(" • ").toUpperCase() : "GENERAL";
 
 // --- IDENTIDAD CONECTADA ---
 const fotoUrl = data.foto_perfil || data.fotoPerfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.nombre)}&background=random`;

 // --- SISTEMA DE REPUTACIÓN VISUAL ---
 const reputacion = data.reputacion || 5.0;
 const estrellas = "⭐".repeat(Math.round(reputacion));
 const nivel = data.nivel || "BRONCE";
 let colorNivel = "text-orange-500";
 if(nivel === "PLATA") colorNivel = "text-gray-300";
 if(nivel === "ORO") colorNivel = "text-yellow-400";

 const estadoDot = data.disponible
 ? '<span class="text-emerald-500 font-bold text-[10px] animate-pulse">● ONLINE</span>'
 : '<span class="text-gray-500 text-[10px]">● OFFLINE</span>';

 const card = document.createElement("div");
 card.className = `p-4 mb-3 rounded-xl border ${esPendiente ? 'bg-yellow-900/10 border-yellow-500' : 'bg-zinc-900 border-zinc-800'}`;

 card.innerHTML = `
 <div class="flex justify-between items-center">
 <div class="flex items-start gap-3">
 <img src="${fotoUrl}" class="w-12 h-12 rounded-full border border-zinc-700 object-cover shadow-lg" alt="Foto">
 <div>
 <h4 class="font-bold text-white text-sm">
 ${escaparHTML(data.nombre)}
 ${esPendiente ? '<span class="text-[9px] bg-yellow-500 text-black px-1 rounded ml-2 font-black">NUEVO</span>' : ''}
 </h4>
 <div class="flex items-center gap-2 text-[10px] mt-0.5">
 <span class="${colorNivel} font-black">${nivel}</span>
 <span class="text-yellow-500">${estrellas} (${reputacion.toFixed(1)})</span>
 </div>
 <p class="text-[9px] text-blue-400 font-bold mt-1 tracking-wide">SKILLS: ${escaparHTML(skillsStr)}</p>
 <p class="text-xs text-gray-400">${escaparHTML(data.telefono || '')}</p>
 

 <div class="mt-2 text-[10px] bg-black/20 p-1 rounded inline-block border border-white/5">
 ${ineCheck} | ${csfCheck}
 </div>
 

 <div class="mt-1">
 ${estadoDot}
 </div>
 </div>
 </div>

 <div class="flex flex-col gap-2">
 ${esPendiente ? `
 <button class="btn-aprobar bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-3 py-2 rounded shadow-lg transition-transform hover:scale-105" onclick="window.aprobarTecnico('${docSnap.id}')">
 APROBAR ACCESO
 </button>
 ` : `
 <button class="bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 text-[9px] font-bold px-2 py-1 rounded border border-blue-900/50 mb-1" onclick="window.verExpediente('${docSnap.id}')">
 <i class="fas fa-folder-open"></i> EXPEDIENTE
 </button>
 <button class="bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400 text-[9px] font-bold px-2 py-1 rounded border border-emerald-900/50 mb-1" onclick="window.registrarPagoTecnico('${docSnap.id}', '${escaparHTML(data.nombre)}')">
 <i class="fas fa-money-bill-wave"></i> REGISTRAR PAGO
 </button>
 <button class="bg-red-900/30 hover:bg-red-900/50 text-red-500 text-[9px] font-bold px-2 py-1 rounded border border-red-900/50" onclick="window.aplicarPenalizacionManual('${docSnap.id}')">
 <i class="fas fa-gavel"></i> PENALIZAR
 </button>
 `}
 </div>
 </div>
 `;
 elementos.lista.appendChild(card);
 });
 
 if(elementos.countOnline) {
 elementos.countOnline.innerHTML = `${contOnline} <span class="text-sm text-gray-500">/ ${contTotal}</span>`;
 elementos.countOnline.style.color = contOnline > 0 ? "#10b981" : "white";
 }
 });
 }

 // --- B. ACTIVIDAD RECIENTE (ESCUDO RAM) ---
 const qServicios = query(collection(db, "services"), orderBy("created_at", "desc"), limit(50));

 onSnapshot(qServicios, (snap) => {
 if(elementos.actividad) elementos.actividad.innerHTML = "";
 
 // 🔥 INYECCIÓN V5.14.0: BANDEJA DE FACTURACIÓN
 if(elementos.listaFacturasPendientes) elementos.listaFacturasPendientes.innerHTML = "";
 let facturasPendientesCount = 0;

 let activos = 0;
 
 if (snap.empty) {
 if(elementos.actividad) elementos.actividad.innerHTML = '<p class="text-gray-500 italic text-sm text-center mt-4">Sin actividad reciente en la plataforma.</p>';
 }
 
 snap.forEach(docSnap => {
 const data = docSnap.data();
 const sid = docSnap.id;

 // Lógica Facturación
 if (data.factura_requerida && data.estado === "finalizado" && !data.factura_enviada) {
 facturasPendientesCount++;
 if (elementos.listaFacturasPendientes) {
 const facCard = document.createElement("div");
 facCard.className = "bg-zinc-900 border border-zinc-700 p-4 rounded-xl shadow-lg";
 facCard.innerHTML = `
 <div class="flex justify-between items-start mb-2">
 <div>
 <p class="text-emerald-500 font-bold text-[10px] uppercase tracking-widest mb-1"><i class="fas fa-file-invoice"></i> Folio: ${data.folio_fiscal || sid.substring(0,6)}</p>
 <p class="text-white font-black text-sm">${escaparHTML(data.datos_facturacion?.razon_social || 'Desconocido')}</p>
 </div>
 <span class="text-white font-black bg-zinc-800 px-2 py-1 rounded text-xs">$${data.costo_final}</span>
 </div>
 <div class="bg-black p-2 rounded-lg text-[10px] text-gray-400 mb-3 space-y-1">
 <p><span class="font-bold text-gray-300">RFC:</span> ${escaparHTML(data.datos_facturacion?.rfc || 'N/A')}</p>
 <p><span class="font-bold text-gray-300">CP:</span> ${escaparHTML(data.datos_facturacion?.cp || 'N/A')}</p>
 <p><span class="font-bold text-gray-300">Régimen:</span> ${escaparHTML(data.datos_facturacion?.regimen || 'N/A')}</p>
 </div>
 <button class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-[10px] transition-colors" onclick="window.marcarFacturaEnviada('${sid}')">
 <i class="fas fa-check"></i> MARCAR COMO ENVIADA
 </button>
 `;
 elementos.listaFacturasPendientes.appendChild(facCard);
 }
 }

 if (!["finalizado", "cancelado"].includes(data.estado)) {
 activos++;
 }

 if (elementos.actividad && elementos.actividad.children.length < 10) {
 const item = document.createElement("div");
 item.className = "flex justify-between items-start border-b border-white/5 py-3 last:border-0";

 let colorEstado = "text-gray-400";
 if(data.estado === "pendiente" || data.estado === "pagado") colorEstado = "text-yellow-500";
 if(data.estado === "asignado") colorEstado = "text-blue-300";
 if(data.estado === "en_camino") colorEstado = "text-blue-400";
 if(data.estado === "en_sitio") colorEstado = "text-purple-400";
 if(data.estado === "cotizando") colorEstado = "text-orange-400";
 if(data.estado === "trabajando") colorEstado = "text-blue-500 animate-pulse font-bold";
 if(data.estado === "finalizado") colorEstado = "text-emerald-500";
 if(data.estado === "cancelado") colorEstado = "text-red-500 line-through";
 
 const labelServicio = escaparHTML(`${data.categoria} ${data.sub_servicio ? '• ' + data.sub_servicio : ''}`);

 // --- AUDITORÍA REAL (V5.17.0 4 PHOTOS) ---
 let btnAuditar = '';
 if(data.estado === "finalizado") {
 btnAuditar = `<button class="mt-2 text-[9px] bg-purple-600/30 text-purple-400 font-bold px-2 py-1 rounded border border-purple-500/50 transition-colors hover:bg-purple-600/50 block" onclick="window.auditarServicio('${sid}')"><i class="fas fa-camera"></i> AUDITAR (4 FOTOS)</button>`;
 }

 item.innerHTML = `
 <div class="flex items-start gap-3">
 <div class="bg-zinc-800 p-2 rounded-lg mt-1"><i class="fas fa-tools text-gray-400"></i></div>
 <div>
 <p class="text-xs font-bold text-white uppercase">${labelServicio}</p>
 <p class="text-[10px] text-gray-500">${escaparHTML(data.cliente_nombre || 'Cliente')} • ${escaparHTML(data.zona || 'Cancún')}</p>
 ${btnAuditar}
 </div>
 </div>
 <div class="text-right">
 <p class="text-[10px] font-bold ${colorEstado} uppercase">${data.estado.replace('_', ' ')}</p>
 <p class="text-[9px] text-gray-600">Hace un momento</p>
 </div>
 `;
 elementos.actividad.appendChild(item);
 }
 });
 
 if (elementos.contadorFacturas) {
 elementos.contadorFacturas.innerText = `${facturasPendientesCount} Solicitudes`;
 }
 if (facturasPendientesCount === 0 && elementos.listaFacturasPendientes) {
 elementos.listaFacturasPendientes.innerHTML = `<div class="col-span-full text-gray-500 italic text-sm text-center py-6"><i class="fas fa-check-circle text-2xl mb-2 text-zinc-700 block"></i>No hay solicitudes de facturas pendientes.</div>`;
 }

 if(elementos.countServ) {
 elementos.countServ.innerText = activos + (snap.size === 50 ? '+' : '');
 elementos.countServ.style.color = activos > 0 ? "#34d399" : "white";
 }
 });

 // Función Admin para marcar factura como enviada
 window.marcarFacturaEnviada = async (id) => {
 if(!confirm("¿Confirmas que ya enviaste el CFDI a este cliente a través de tu portal del SAT?")) return;
 try {
 await updateDoc(doc(db, "services", id), { factura_enviada: true });
 } catch(e) {
 console.error("Error al actualizar factura:", e);
 alert("Error al actualizar estado en la base de datos.");
 }
 };

 // --- C. DASHBOARD FINANCIERO PRO V5.14.0 (Business Intelligence & Real Split) ---
 const qFinanzas = query(collection(db, "transacciones"));
 onSnapshot(qFinanzas, (snap) => {
 // 🧮 VARIABLES DE LA ARQUITECTURA FINANCIERA
 let globalFixGo = 0; // 32% del Total (Comisión Bruta)
 let globalIVA = 0; // 16% sobre la comisión
 let globalISR = 0; // 30% sobre la utilidad
 let globalGarantia = 0; // 2% del Total (Fondo de Seguridad)
 let globalStripe = 0; // 3.6% + $3.00 MXN (Costo Operativo)
 let globalTecnico = 0; // El remanente líquido
 
 let totalFlujo = 0; // Volumen Bruto Transaccional (GTV)
 let dineroRetenido = 0; // Dinero en tránsito (Stripe < 24h)
 let dineroRetiradoTecnicos = 0; // Para calcular saldo real en bóveda

 const ahora = new Date();

 snap.forEach(docSnap => {
 const tx = docSnap.data();
 
 if (tx.tipo === "retiro_fondos") {
 dineroRetiradoTecnicos += Math.abs(tx.pago_tecnico || 0);
 }

 if (tx.tipo === "ingreso_servicio") {
 const monto = tx.monto_total || 0;
 totalFlujo += monto;

 const calcFixGo = monto * 0.32; // 32% para Plataforma
 const calcGarantia = monto * 0.02; // 2% Fondo Garantía
 const calcStripe = (monto * 0.036) + 3.00; // Costo Pasarela (3.6% + $3)
 
 const calcIVA = calcFixGo * 0.16; // 16% de IVA sobre la comisión
 const calcISR = calcFixGo * 0.30; // 30% de ISR sobre utilidad

 const calcTecnico = monto - calcFixGo - calcGarantia - calcStripe;

 globalFixGo += calcFixGo;
 globalIVA += calcIVA;
 globalISR += calcISR;
 globalGarantia += calcGarantia;
 globalStripe += calcStripe;
 globalTecnico += calcTecnico;

 if (tx.fecha && tx.fecha.toDate) {
 const fechaTx = tx.fecha.toDate();
 const diffHoras = Math.abs(ahora - fechaTx) / 36e5;
 if (diffHoras < 24) {
 dineroRetenido += calcTecnico; 
 }
 }
 }
 });

 const utilidadNetaReal = globalFixGo - globalIVA - globalISR;
 const saldoBoveda = totalFlujo - dineroRetiradoTecnicos;

 if(elementos.countMoney) {
 elementos.countMoney.innerText = `$${globalFixGo.toFixed(2)}`;
 if(elementos.countBovedaStripe) elementos.countBovedaStripe.innerText = `$${saldoBoveda.toFixed(2)}`;
 
 const cardParent = elementos.countMoney.closest('.uber-card');
 let desgloseContainer = cardParent.querySelector('.finance-breakdown');
 
 if(!desgloseContainer) {
 desgloseContainer = document.createElement('div');
 desgloseContainer.className = "finance-breakdown mt-3 pt-3 border-t border-white/10 text-[9px] text-gray-400 space-y-1";
 cardParent.insertBefore(desgloseContainer, cardParent.children[1]); 
 }

 desgloseContainer.innerHTML = `
 <div class="flex justify-between text-gray-300"><span>COMISIÓN GESTIAPREMIUM (32%):</span> <span>$${globalFixGo.toFixed(2)}</span></div>
 <div class="flex justify-between text-red-400"><span>IVA (16% s/Comisión):</span> <span>-$${globalIVA.toFixed(2)}</span></div>
 <div class="flex justify-between text-red-400"><span>ISR (30% s/Comisión):</span> <span>-$${globalISR.toFixed(2)}</span></div>
 <div class="flex justify-between font-bold text-yellow-500"><span>FONDO GARANTÍA (2%):</span> <span>$${globalGarantia.toFixed(2)}</span></div>
 <div class="flex justify-between text-gray-500"><span>STRIPE FEES (3.6%+$3):</span> <span>-$${globalStripe.toFixed(2)}</span></div>
 

 <div class="flex justify-between font-black text-white bg-emerald-600/30 px-2 py-1 rounded border border-emerald-500/50 my-2">
 <span>💵 UTILIDAD NETA GESTIAPREMIUM:</span> <span>$${utilidadNetaReal.toFixed(2)}</span>
 </div>

 <div class="flex justify-between"><span class="text-blue-400 font-bold">TECNICOS (LÍQUIDO):</span> <span>$${(globalTecnico - dineroRetenido).toFixed(2)}</span></div>
 <div class="flex justify-between italic text-zinc-500 bg-black/20 px-1 rounded mb-2">
 <span>⏳ RETENIDO (24h):</span> <span>$${dineroRetenido.toFixed(2)}</span>
 </div>

 <button onclick="window.exportarConciliacionCSV()" class="w-full mt-3 bg-blue-900/40 hover:bg-blue-800/60 text-blue-400 font-bold py-2 rounded-lg border border-blue-500/50 transition-colors flex items-center justify-center gap-2 text-[10px] shadow-lg">
 <i class="fas fa-file-excel"></i> EXPORTAR CONCILIACIÓN CONTABLE (CSV)
 </button>
 `;
 }
 });

 // --- D. FUNCIONES DE ADMINISTRACIÓN ---

 // 🔥 MOTOR DE EXPORTACIÓN CONTABLE (V5.17.3 - SHARK TANK VALUATION)
 window.exportarConciliacionCSV = async () => {
 const btn = document.activeElement;
 const textoOrig = btn.innerHTML;
 
 if(!confirm("¿Deseas descargar el reporte maestro de conciliación contable? Se procesarán todas las transacciones históricas.")) return;
 
 btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PROCESANDO DATA...';
 btn.disabled = true;

 try {
 const qTrans = query(collection(db, "transacciones"), orderBy("fecha", "desc"));
 const snap = await getDocs(qTrans);

 let csvContent = "data:text/csv;charset=utf-8,";
 csvContent += "FECHA,TIPO_OPERACION,FOLIO_SERVICIO,TECNICO_ID,INGRESO_BRUTO,COMISION_GESTIAPREMIUM_32,IVA_16,ISR_30,FONDO_GARANTIA_2,STRIPE_FEE,LIQUIDO_TECNICO,ESTADO_RETENCION\n";

 const ahora = new Date();

 snap.forEach(docSnap => {
 const tx = docSnap.data();
 
 let fechaStr = "N/A";
 let diffHoras = 999;
 if(tx.fecha && tx.fecha.toDate) {
 const d = tx.fecha.toDate();
 // Formato DD/MM/YYYY HH:MM
 fechaStr = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
 diffHoras = Math.abs(ahora - d) / 36e5;
 }

 if(tx.tipo === "ingreso_servicio") {
 const monto = tx.monto_total || 0;
 const calcFixGo = monto * 0.32;
 const calcGarantia = monto * 0.02;
 const calcStripe = (monto * 0.036) + 3.00;
 const calcIVA = calcFixGo * 0.16;
 const calcISR = calcFixGo * 0.30;
 const calcTecnico = monto - calcFixGo - calcGarantia - calcStripe;

 let estadoRetencion = diffHoras < 24 ? "RETENIDO (24H)" : "LIBERADO";

 const fila = [
 `"${fechaStr}"`,
 `"INGRESO SERVICIO"`,
 `"${tx.servicio_id || 'N/A'}"`,
 `"${tx.tecnico_id || 'N/A'}"`,
 monto.toFixed(2),
 calcFixGo.toFixed(2),
 calcIVA.toFixed(2),
 calcISR.toFixed(2),
 calcGarantia.toFixed(2),
 calcStripe.toFixed(2),
 calcTecnico.toFixed(2),
 `"${estadoRetencion}"`
 ];
 csvContent += fila.join(",") + "\n";
 } else {
 // Retiros, abonos, penalizaciones
 const fila = [
 `"${fechaStr}"`,
 `"${tx.tipo.toUpperCase()}"`,
 `"${tx.servicio_id || 'N/A'}"`,
 `"${tx.tecnico_id || 'N/A'}"`,
 "0.00", "0.00", "0.00", "0.00", "0.00", "0.00",
 (tx.pago_tecnico || 0).toFixed(2),
 `"APLICADO"`
 ];
 csvContent += fila.join(",") + "\n";
 }
 });

 const encodedUri = encodeURI(csvContent);
 const link = document.createElement("a");
 link.setAttribute("href", encodedUri);
 link.setAttribute("download", `GestiaPremium_Conciliacion_Contable_${new Date().getTime()}.csv`);
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);

 btn.innerHTML = '<i class="fas fa-check-double"></i> EXPORTACIÓN EXITOSA';
 btn.classList.replace("text-blue-400", "text-emerald-400");
 
 setTimeout(() => {
 btn.innerHTML = textoOrig;
 btn.disabled = false;
 btn.classList.replace("text-emerald-400", "text-blue-400");
 }, 3000);

 } catch(e) {
 console.error("Error exportando CSV Contable:", e);
 alert("Error al conectar con la bóveda de transacciones.");
 btn.innerHTML = textoOrig;
 btn.disabled = false;
 }
 };

// 🔥 AUDITORÍA REAL (V5.17.1: 4 FOTOS SOPORTADAS + BOTÓN DE DESCARGA PDF)
 window.auditarServicio = async (sid) => {
 if(document.getElementById("modalAuditoria")) return;
 try {
 const docSnap = await getDoc(doc(db, "services", sid));
 if(!docSnap.exists()) return alert("Servicio no encontrado.");
 const s = docSnap.data();
 
 // Leemos las 4 URLs de Storage
 const f_a1 = s.evidencia?.antes1 || s.evidencia?.antes || 'https://via.placeholder.com/300x400?text=SIN+FOTO+ANTES+1';
 const f_a2 = s.evidencia?.antes2 || 'https://via.placeholder.com/300x400?text=SIN+FOTO+ANTES+2';
 const f_d1 = s.evidencia?.despues1 || s.evidencia?.despues || 'https://via.placeholder.com/300x400?text=SIN+FOTO+DESPUES+1';
 const f_d2 = s.evidencia?.despues2 || 'https://via.placeholder.com/300x400?text=SIN+FOTO+DESPUES+2';

 const html = `
 <div id="modalAuditoria" class="fixed inset-0 bg-black/95 z-[70] flex items-center justify-center p-4 animate-fade-in">
 <div class="bg-zinc-900 w-full max-w-4xl rounded-3xl p-6 border border-zinc-700 shadow-2xl overflow-y-auto max-h-[90vh]">
 <div class="flex justify-between items-center mb-4 border-b border-zinc-800 pb-3">
 <div>
 <h3 class="text-white font-black text-xl flex items-center gap-2"><img src="assets/gestiapremium-icon.svg" class="w-6 h-6 inline-block drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]"> AUDITORÍA FOTOGRÁFICA DE CALIDAD</h3>
 <p class="text-xs text-gray-400 mt-1">Folio: <span class="font-mono text-emerald-400">${s.folio_fiscal || sid.substring(0,6).toUpperCase()}</span> | Técnico: ${escaparHTML(s.tecnico_nombre)}</p>
 </div>
 <button onclick="document.getElementById('modalAuditoria').remove()" class="text-gray-500 hover:text-white bg-black p-2 rounded-xl"><i class="fas fa-times text-xl"></i></button>
 </div>
 
 <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
 <div class="text-center relative group">
 <span class="absolute top-2 left-2 bg-red-900/80 text-red-400 border border-red-500/50 text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest z-10 shadow-lg">ANTES 1</span>
 <img src="${f_a1}" class="w-full h-64 rounded-xl border border-zinc-700 object-cover shadow-lg transition-transform hover:scale-105" alt="Antes 1">
 </div>
 <div class="text-center relative group">
 <span class="absolute top-2 left-2 bg-red-900/80 text-red-400 border border-red-500/50 text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest z-10 shadow-lg">ANTES 2</span>
 <img src="${f_a2}" class="w-full h-64 rounded-xl border border-zinc-700 object-cover shadow-lg transition-transform hover:scale-105" alt="Antes 2">
 </div>
 <div class="text-center relative group">
 <span class="absolute top-2 left-2 bg-emerald-900/80 text-emerald-400 border border-emerald-500/50 text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest z-10 shadow-lg">DESPUÉS 1</span>
 <img src="${f_d1}" class="w-full h-64 rounded-xl border border-zinc-700 object-cover shadow-lg transition-transform hover:scale-105" alt="Despues 1">
 </div>
 <div class="text-center relative group">
 <span class="absolute top-2 left-2 bg-emerald-900/80 text-emerald-400 border border-emerald-500/50 text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest z-10 shadow-lg">DESPUÉS 2</span>
 <img src="${f_d2}" class="w-full h-64 rounded-xl border border-zinc-700 object-cover shadow-lg transition-transform hover:scale-105" alt="Despues 2">
 </div>
 </div>
 
 <div class="mt-6 flex justify-end gap-3 border-t border-zinc-800 pt-4">
 <button id="btnDescargarPDFAdmin" onclick="window.generarPDFAdmin('${sid}')" class="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-6 rounded-lg text-sm transition-colors shadow-lg flex items-center gap-2">
 <i class="fas fa-file-pdf"></i> DESCARGAR REPORTE OFICIAL
 </button>
 <button onclick="document.getElementById('modalAuditoria').remove()" class="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 px-6 rounded-lg text-sm transition-colors">
 CERRAR
 </button>
 </div>
 </div>
 </div>`;
 document.body.insertAdjacentHTML('beforeend', html);
 } catch(e) {
 console.error(e);
 alert("Error al cargar la auditoría fotográfica desde Firebase Storage.");
 }
 };

 // 🔥 MOTOR PDF EXCLUSIVO PARA EL ADMINISTRADOR
 window.generarPDFAdmin = async (serviceId) => {
 const btn = document.getElementById('btnDescargarPDFAdmin');
 const textoOrig = btn.innerHTML;
 btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> GENERANDO...';
 btn.disabled = true;

 try {
 const docRef = doc(db, "services", serviceId);
 const docSnap = await getDoc(docRef);
 
 if (!docSnap.exists()) throw new Error("No se encontró el servicio.");
 
 const data = { ...docSnap.data(), id: serviceId };
 const { jsPDF } = await cargarLibreriaPDF();
 const docPdf = new jsPDF();
 
 // --- DISEÑO DEL REPORTE (MEMBRETE) ---
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
 docPdf.text("Reporte Oficial de Calidad y Servicio", 20, 32);
 
 docPdf.setFontSize(8);
 docPdf.setTextColor(150, 150, 150);
 docPdf.text(`RFC EMISOR: FXG260211-H8A`, 20, 45);
 if(data.folio_fiscal) docPdf.text(`FOLIO FISCAL: ${data.folio_fiscal}`, 150, 45);
 docPdf.text(`FECHA EMISIÓN: ${new Date().toLocaleDateString()}`, 150, 50);

 let y = 70;
 docPdf.setTextColor(0, 0, 0);
 docPdf.setFontSize(12);
 docPdf.setFont("helvetica", "bold");
 docPdf.text("DETALLES OPERATIVOS", 20, y);

 y += 10;
 docPdf.setFont("helvetica", "normal");
 docPdf.setFontSize(10);
 docPdf.text(`Cliente: ${data.cliente_nombre}`, 20, y);
 docPdf.text(`Técnico Asignado: ${data.tecnico_nombre}`, 120, y);
 y += 8;
 docPdf.text(`Ubicación: ${data.direccion}`, 20, y);
 const servicioLabel = `${data.categoria} ${data.sub_servicio ? '- ' + data.sub_servicio : ''}`;
 docPdf.text(`Categoría: ${servicioLabel}`, 120, y);

 y += 15;
 docPdf.setDrawColor(200, 200, 200);
 docPdf.line(20, y, 190, y);

 y += 15;
 docPdf.setFont("helvetica", "bold");
 docPdf.setFontSize(12);
 docPdf.text("RESUMEN FINANCIERO", 20, y);
 
 y += 10;
 docPdf.setFont("helvetica", "normal");
 docPdf.setFontSize(14);
 docPdf.setTextColor(16, 185, 129); 
 docPdf.text(`Total Pagado: $${data.costo_final} MXN (${data.metodo_pago ? data.metodo_pago.toUpperCase() : 'EFECTIVO'})`, 20, y);
 
 y += 20;
 docPdf.setTextColor(0, 0, 0);
 docPdf.setFontSize(12);
 docPdf.setFont("helvetica", "bold");
 docPdf.text("EVIDENCIA FOTOGRÁFICA (ALMACENAMIENTO CLOUD)", 20, y);
 y += 10;
 
// 🔥 V5.17.2: Traducción Base64 para el Admin
 const f_a1 = data.evidencia?.antes1 || data.evidencia?.antes;
 const f_a2 = data.evidencia?.antes2;
 const f_d1 = data.evidencia?.despues1 || data.evidencia?.despues;
 const f_d2 = data.evidencia?.despues2;

 btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PROCESANDO FOTOS...';

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

 // --- INYECCIÓN V5.18.0: FIRMA DIGITAL EN PDF (ADMIN) ---
 const firmaDigital = data.evidencia?.firma_cliente;
 if (firmaDigital) {
 y += 45; // Bajamos el cursor Y para que no encime con las fotos
 docPdf.setFontSize(10);
 docPdf.setFont("helvetica", "bold");
 docPdf.setTextColor(0, 0, 0);
 docPdf.text("FIRMA DE CONFORMIDAD DEL CLIENTE", 20, y);
 docPdf.addImage(firmaDigital, "PNG", 20, y + 5, 60, 20); // Renderizamos la firma (formato PNG)
 docPdf.setDrawColor(50, 50, 50);
 docPdf.setLineWidth(0.5);
 docPdf.line(20, y + 26, 80, y + 26); // Línea formal debajo de la firma
 }
 // -------------------------------------------------------
 
 docPdf.setFontSize(8);
 docPdf.setTextColor(150, 150, 150);
 docPdf.text("Este documento es un reporte de auditoría interno emitido por la plataforma GestiaPremium.", 60, 280);
 docPdf.save(`GestiaPremium_Auditoria_${data.id.substring(0,6)}.pdf`);
 
 btn.innerHTML = '<i class="fas fa-check"></i> DESCARGADO';
 btn.classList.replace("bg-red-600", "bg-emerald-600");
 btn.disabled = false;

 } catch (error) {
 console.error(error);
 alert("Error conectando con la nube. Asegúrate de tener conexión a internet estable para descargar el PDF.");
 btn.innerHTML = '<i class="fas fa-file-pdf"></i> REINTENTAR';
 btn.disabled = false;
 }
 };

 // 🔥 FUNCION ADMIN: CAMBIO FORZADO DE FOTO DE PERFIL
 window.adminCambiarFotoTecnico = async (uid) => {
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
 alert("✅ Foto del técnico actualizada exitosamente por el Administrador.");
 const modal = document.getElementById('modalExpediente');
 if(modal) modal.remove();
 window.verExpediente(uid); 
 } catch(err) {
 console.error("Error subiendo foto:", err);
 alert("Error al actualizar la foto de perfil en el servidor.");
 }
 };
 reader.readAsDataURL(file);
 };
 fileInput.click();
 };

 // 🔥 EXPEDIENTES DESBLOQUEADOS Y BLINDADOS
 window.verExpediente = async (uid) => {
 if(document.getElementById("modalExpediente")) return;
 try {
 const docSnap = await getDoc(doc(db, "users", uid));
 if(!docSnap.exists()) return alert("Técnico no encontrado.");
 const t = docSnap.data();

 const fotoUrl = t.foto_perfil || t.fotoPerfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.nombre)}&background=random`;
 
 const ineCheck = t.documentos?.ine ? '<span class="text-emerald-400"><i class="fas fa-check-circle"></i> Cargado</span>' : '<span class="text-red-500"><i class="fas fa-times-circle"></i> Faltante</span>';
 const csfCheck = t.documentos?.csf ? '<span class="text-emerald-400"><i class="fas fa-check-circle"></i> Cargado</span>' : '<span class="text-red-500"><i class="fas fa-times-circle"></i> Faltante</span>';

 const vehiculo = t.vehiculo || {};
 const tipoVehiculo = vehiculo.tipo || 'NO REGISTRADO';
 const placas = vehiculo.placas || 'N/A';
 const licenciaCheck = t.documentos?.licencia ? '<span class="text-emerald-400"><i class="fas fa-check-circle"></i> Vigente</span>' : '<span class="text-red-500"><i class="fas fa-times-circle"></i> Faltante</span>';

 let certsHTML = '';
 if (t.documentos && t.documentos.certificados && t.documentos.certificados.length > 0) {
 certsHTML = t.documentos.certificados.map(c => `<span class="bg-emerald-900/30 text-emerald-400 text-[9px] font-bold px-2 py-1 rounded border border-emerald-500/50 mr-1 mb-1 inline-block"><i class="fas fa-award"></i> Validado</span>`).join('');
 } else {
 certsHTML = '<span class="text-red-500 text-xs font-bold"><i class="fas fa-times-circle"></i> Sin documentos de respaldo</span>';
 }

 const html = `
 <div id="modalExpediente" class="fixed inset-0 bg-black/95 z-[70] flex items-center justify-center p-4 animate-fade-in">
 <div class="bg-zinc-900 w-full max-w-md rounded-3xl p-6 border border-zinc-700 shadow-2xl overflow-y-auto max-h-[90vh]">
 <div class="flex justify-between items-start mb-6 border-b border-zinc-800 pb-4">
 <div class="flex items-center gap-4">
 <div class="relative inline-block">
 <img src="${fotoUrl}" class="w-16 h-16 rounded-full border-2 border-blue-500 object-cover shadow-lg" alt="Foto">
 <button onclick="window.adminCambiarFotoTecnico('${uid}')" class="absolute -bottom-2 -right-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center border-2 border-zinc-900 transition-colors shadow-lg" title="Cambiar Foto">
 <i class="fas fa-camera text-[10px]"></i>
 </button>
 </div>
 <div>
 <h3 class="text-white font-black text-lg uppercase">${escaparHTML(t.nombre)}</h3>
 <p class="text-blue-400 text-xs font-bold flex items-center gap-1"><img src="assets/gestiapremium-icon.svg" class="w-3 h-3"> EXPEDIENTE CONFIDENCIAL</p>
 </div>
 </div>
 <button onclick="document.getElementById('modalExpediente').remove()" class="text-gray-500 hover:text-white"><i class="fas fa-times text-xl"></i></button>
 </div>

 <div class="space-y-4">
 <div class="bg-black p-3 rounded-xl border border-zinc-800">
 <p class="text-[10px] text-gray-500 font-bold uppercase mb-1"><i class="fas fa-university"></i> Datos Bancarios</p>
 <p class="text-sm text-white font-mono">Banco: <span class="text-emerald-400">${escaparHTML(t.banco || 'NO REGISTRADO')}</span></p>
 <p class="text-sm text-white font-mono">CLABE: <span class="text-emerald-400">${escaparHTML(t.clabe || 'NO REGISTRADA')}</span></p>
 </div>

 <div class="bg-black p-3 rounded-xl border border-zinc-800">
 <p class="text-[10px] text-gray-500 font-bold uppercase mb-1"><i class="fas fa-id-card"></i> Identidad y Fiscal</p>
 <div class="flex justify-between text-sm mb-1">
 <span class="text-white">INE/ID:</span> ${ineCheck}
 </div>
 <div class="flex justify-between text-sm">
 <span class="text-white">Constancia Fiscal (CSF):</span> ${csfCheck}
 </div>
 </div>

 <div class="bg-black p-3 rounded-xl border border-zinc-800">
 <p class="text-[10px] text-gray-500 font-bold uppercase mb-1"><i class="fas fa-motorcycle"></i> Logística Operativa</p>
 <div class="flex justify-between items-center mb-1">
 <span class="text-sm text-white">Vehículo:</span>
 <span class="text-sm text-blue-400 font-bold uppercase">${escaparHTML(tipoVehiculo)}</span>
 </div>
 <div class="flex justify-between items-center mb-1">
 <span class="text-sm text-white">Placas:</span>
 <span class="text-sm text-blue-400 font-mono uppercase bg-blue-900/30 px-2 py-0.5 rounded border border-blue-500/30">${escaparHTML(placas)}</span>
 </div>
 <div class="flex justify-between text-sm mt-2 border-t border-zinc-800 pt-2">
 <span class="text-white">Licencia de Conducir:</span> ${licenciaCheck}
 </div>
 </div>

 <div class="bg-black p-3 rounded-xl border border-zinc-800">
 <p class="text-[10px] text-gray-500 font-bold uppercase mb-2"><i class="fas fa-certificate"></i> Credenciales y Especialidades</p>
 <div class="flex flex-wrap">
 ${certsHTML}
 </div>
 </div>
 
 <div class="bg-black p-3 rounded-xl border border-zinc-800">
 <p class="text-[10px] text-gray-500 font-bold uppercase mb-1"><i class="fas fa-phone"></i> Contacto</p>
 <p class="text-sm text-white font-mono">${escaparHTML(t.telefono || 'Sin teléfono')}</p>
 <p class="text-xs text-gray-400">${escaparHTML(t.email || 'Sin correo')}</p>
 </div>
 </div>

 <div class="mt-6">
 <button onclick="document.getElementById('modalExpediente').remove()" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-sm transition-colors shadow-lg">
 CERRAR EXPEDIENTE
 </button>
 </div>
 </div>
 </div>`;
 document.body.insertAdjacentHTML('beforeend', html);
 } catch(e) {
 console.error(e);
 alert("Error al cargar expediente.");
 }
 };

 window.aprobarTecnico = async (uid) => {
 if(!confirm("¿Estás seguro de aprobar a este técnico? Tendrá acceso inmediato a ver solicitudes y aceptar trabajos.")) return;
 try {
 await updateDoc(doc(db, "users", uid), {
 estado: "activo",
 status: "activo",
 verificado: true,
 nivel: "BRONCE",
 reputacion: 5.0,
 servicios_completados: 0,
 aprobadoEn: serverTimestamp()
 });
 alert(" ✅ Técnico Aprobado y Activado exitosamente.");
 } catch (error) {
 console.error(error);
 alert("Error al aprobar técnico en base de datos.");
 }
 };

 window.aplicarPenalizacionManual = async (uid) => {
 const motivo = prompt("Describe el motivo de la penalización:");
 if (!motivo) return;
 const monto = parseFloat(prompt("Monto a descontar de su Wallet ($):", "50"));
 if (isNaN(monto)) return;

 try {
 await addDoc(collection(db, "transacciones"), {
 tecnico_id: uid,
 pago_tecnico: -Math.abs(monto),
 monto_total: 0,
 tipo: "penalizacion",
 descripcion: `Admin: ${motivo}`,
 fecha: serverTimestamp()
 });
 
 await updateDoc(doc(db, "users", uid), {
 reputacion: increment(-0.5)
 });

 alert(`⛔ Penalización de $${monto} aplicada al técnico.`);
 } catch (e) {
 console.error(e);
 alert("Error al aplicar penalización.");
 }
 };

 window.registrarPagoTecnico = async (uid, nombre) => {
 const monto = parseFloat(prompt(`¿Cuánto dinero te depositó / pagó ${nombre} para abonar a su deuda? ($):`, "0"));
 if (isNaN(monto) || monto <= 0) return;

 if(!confirm(`¿Confirmas que recibiste $${monto} de ${nombre}? Esto borrará o reducirá su deuda en el sistema.`)) return;

 try {
 await addDoc(collection(db, "transacciones"), {
 tecnico_id: uid,
 pago_tecnico: Math.abs(monto), 
 monto_total: 0,
 tipo: "abono_deuda",
 descripcion: `Admin: Abono de deuda recibido (SPEI/OXXO)`,
 fecha: serverTimestamp()
 });
 alert(`✅ Abono de $${monto} registrado con éxito. La billetera del técnico se ha liberado.`);
 } catch (e) {
 console.error(e);
 alert("Error al registrar el abono en la base de datos.");
 }
 };

 window.abrirGestorCatalogo = async () => {
 const modal = document.getElementById("modalCatalogo");
 const container = document.getElementById("gridConfiguracion");
 if (modal) modal.classList.remove("hidden");
 
 const docRef = doc(db, "configuracion", "catalogo_global");
 const docSnap = await getDoc(docRef);
 let config = {}; 
 if(docSnap.exists()) config = docSnap.data();

 const MASTER_STRUCTURE = {
 "ROAD (Auxilio Vial)": [
 { id: "road_llanta", label: "Llantera Móvil" },
 { id: "road_cerrajero", label: "Cerrajería" },
 { id: "road_grua", label: "Grúas" },
 { id: "road_mecanico", label: "Mecánico Gral." },
 { id: "road_corriente", label: "Paso Corriente" }
 ],
 "FIX (Hogar)": [
 { id: "fix_electricidad", label: "Electricidad" },
 { id: "fix_plomeria", label: "Plomería" },
 { id: "fix_ac", label: "Aires Acondicionad." },
 { id: "fix_jardin", label: "Jardinería" },
 { id: "fix_pintura", label: "Pintura" },
 { id: "fix_alberca", label: "Albercas" },
 { id: "fix_fumigacion", label: "Fumigación" }
 ],
 "MAINT (B2B)": [
 { id: "maint_general", label: "Mantenimiento Gral." }
 ],
 "TECH (Sistemas)": [
 { id: "tech_cctv", label: "CCTV" },
 { id: "tech_alarma", label: "Alarmas" },
 { id: "tech_acceso", label: "Accesos" },
 { id: "tech_elevador", label: "Elevadores" },
 { id: "tech_planta", label: "Plantas Eléc." },
 { id: "tech_solar", label: "Paneles Solares" }
 ]
 };

 if (container) {
 container.innerHTML = "";
 let html = "";
 
 for (const [categoria, servicios] of Object.entries(MASTER_STRUCTURE)) {
 html += `
 <div class="mb-4 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
 <h4 class="text-emerald-500 font-bold text-xs uppercase mb-3 border-b border-zinc-700 pb-1">${categoria}</h4>
 <div class="space-y-2">`;
 
 servicios.forEach(srv => {
 const isChecked = config[srv.id] === true;
 html += generarSwitchGranular(srv.id, srv.label, isChecked);
 });
 
 html += `</div></div>`;
 }
 container.innerHTML = html;
 }
 };

 window.guardarConfiguracionGlobal = async () => {
 const inputs = document.querySelectorAll('input[id^="cfg_"]');
 let nuevaConfig = {
 updatedAt: serverTimestamp() 
 };

 inputs.forEach(input => {
 const realId = input.id.replace("cfg_", "");
 nuevaConfig[realId] = input.checked;
 });
 
 try {
 await setDoc(doc(db, "configuracion", "catalogo_global"), nuevaConfig);
 alert("✅ Catálogo actualizado. Disponibilidad sincronizada con clientes en tiempo real.");
 document.getElementById("modalCatalogo").classList.add("hidden");
 } catch (e) {
 console.error(e);
 alert("Error al guardar configuración global.");
 }
 };

 if(elementos.btnToggleHistorialRetiros) {
 let mostrandoHistorial = false;
 elementos.btnToggleHistorialRetiros.onclick = () => {
 mostrandoHistorial = !mostrandoHistorial;
 if(mostrandoHistorial) {
 elementos.vistaRetirosPendientes.classList.add("hidden");
 elementos.vistaHistorialRetiros.classList.remove("hidden");
 elementos.btnToggleHistorialRetiros.innerHTML = '<i class="fas fa-arrow-left"></i> Volver a Pendientes';
 elementos.btnToggleHistorialRetiros.classList.replace("text-zinc-300", "text-emerald-400");
 } else {
 elementos.vistaRetirosPendientes.classList.remove("hidden");
 elementos.vistaHistorialRetiros.classList.add("hidden");
 elementos.btnToggleHistorialRetiros.innerHTML = '<i class="fas fa-history"></i> Historial';
 elementos.btnToggleHistorialRetiros.classList.replace("text-emerald-400", "text-zinc-300");
 }
 };
 }

 if (elementos.listaRetiros) {
 const qRetiros = query(collection(db, "retiros"), where("estado", "==", "pendiente"), orderBy("fecha_solicitud", "asc"));
 
 onSnapshot(qRetiros, (snap) => {
 elementos.listaRetiros.innerHTML = "";
 if(snap.empty) {
 elementos.listaRetiros.innerHTML = '<p class="text-gray-500 italic text-sm text-center mt-10">No hay retiros pendientes.</p>';
 return;
 }

 snap.forEach(docSnap => {
 const ret = docSnap.data();
 const id = docSnap.id;
 
 let fechaFormat = "";
 if(ret.fecha_solicitud) {
 const dateObj = new Date(ret.fecha_solicitud.seconds * 1000);
 fechaFormat = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
 }

 const card = document.createElement("div");
 card.className = "p-4 bg-emerald-900/10 border border-emerald-500/30 rounded-xl mb-3 shadow-lg";
 card.innerHTML = `
 <div class="flex justify-between items-start mb-2">
 <div>
 <p class="text-white font-bold text-sm uppercase">${escaparHTML(ret.tecnico_nombre)}</p>
 <p class="text-[10px] text-gray-400">${fechaFormat}</p>
 </div>
 <span class="bg-yellow-500 text-black text-[9px] font-black px-2 py-1 rounded animate-pulse">PENDIENTE</span>
 </div>
 <p class="text-2xl font-black text-emerald-400 mb-3">$${ret.monto.toFixed(2)}</p>
 <button id="btn_aprobar_${id}" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg text-xs shadow-lg transition-all transform hover:scale-105" onclick="window.aprobarRetiro('${id}', '${ret.tecnico_id}', ${ret.monto})">
 <i class="fas fa-check-double"></i> MARCAR COMO PAGADO (SPEI)
 </button>
 `;
 elementos.listaRetiros.appendChild(card);
 });
 });

 window.aprobarRetiro = async (retiroId, tecnicoId, monto) => {
 if(!confirm("¿Confirmas que ya realizaste la transferencia SPEI por $"+monto.toFixed(2)+"?\n\nEsto descontará el saldo de la wallet del técnico en automático.")) return;
 
 const btn = document.getElementById(`btn_aprobar_${retiroId}`);
 if(btn) {
 btn.disabled = true;
 btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> PROCESANDO...`;
 btn.classList.remove("hover:bg-emerald-500", "hover:scale-105");
 btn.classList.add("opacity-50", "cursor-not-allowed");
 }

 try {
 await updateDoc(doc(db, "retiros", retiroId), {
 estado: "aprobado",
 fecha_aprobacion: serverTimestamp()
 });

 await addDoc(collection(db, "transacciones"), {
 servicio_id: "RETIRO_SPEI_" + retiroId.substring(0,5),
 tecnico_id: tecnicoId,
 monto_total: 0,
 comision_fixgo: 0,
 retencion_iva: 0,
 retencion_isr: 0,
 pago_tecnico: -Math.abs(monto), 
 fecha: serverTimestamp(),
 tipo: "retiro_fondos"
 });

 alert("✅ Retiro procesado exitosamente. Wallet del técnico actualizada.");
 } catch (error) {
 console.error("Error al procesar retiro:", error);
 alert("❌ Error de conexión al procesar el retiro en Firebase.");
 if(btn) {
 btn.disabled = false;
 btn.innerHTML = `<i class="fas fa-check-double"></i> MARCAR COMO PAGADO (SPEI)`;
 btn.classList.add("hover:bg-emerald-500", "hover:scale-105");
 btn.classList.remove("opacity-50", "cursor-not-allowed");
 }
 }
 };
 }

 if (elementos.listaHistorialRetiros) {
 const qHistorialRetiros = query(
 collection(db, "retiros"), 
 where("estado", "==", "aprobado"), 
 orderBy("fecha_aprobacion", "desc")
 );
 
 onSnapshot(qHistorialRetiros, (snap) => {
 elementos.listaHistorialRetiros.innerHTML = "";
 if(snap.empty) {
 elementos.listaHistorialRetiros.innerHTML = '<p class="text-gray-500 italic text-xs text-center mt-4">Aún no hay retiros procesados.</p>';
 return;
 }

 snap.forEach(docSnap => {
 const ret = docSnap.data();
 
 let fechaFormat = "";
 if(ret.fecha_aprobacion) {
 const dateObj = new Date(ret.fecha_aprobacion.seconds * 1000);
 fechaFormat = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
 }

 const card = document.createElement("div");
 card.className = "p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-xl mb-2 flex justify-between items-center";
 card.innerHTML = `
 <div>
 <p class="text-white font-bold text-xs uppercase">${escaparHTML(ret.tecnico_nombre)}</p>
 <p class="text-[9px] text-gray-500"><i class="fas fa-check-double text-emerald-500"></i> ${fechaFormat}</p>
 </div>
 <div class="text-right">
 <p class="text-sm font-black text-emerald-400">$${ret.monto.toFixed(2)}</p>
 <p class="text-[8px] text-zinc-500 uppercase tracking-widest">Liquidado</p>
 </div>
 `;
 elementos.listaHistorialRetiros.appendChild(card);
 });
 }, (error) => {
 console.error("Error historial retiros (¿Falta índice?):", error);
 elementos.listaHistorialRetiros.innerHTML = '<p class="text-red-500 italic text-xs text-center mt-4">Construyendo índice en Firebase... (Recarga en 3 min)</p>';
 });
 }
}

function generarSwitchGranular(id, label, checked) {
 return `
 <div class="flex justify-between items-center bg-black p-2 rounded-lg border border-zinc-800">
 <span class="text-gray-300 text-xs">${label}</span>
 <label class="relative inline-flex items-center cursor-pointer">
 <input type="checkbox" id="cfg_${id}" class="sr-only peer" ${checked ? 'checked' : ''}>
 <div class="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
 </label>
 </div>`;
}
