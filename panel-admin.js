/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - MÓDULO DE ADMINISTRACIÓN (CEREBRO FINANCIERO & SUPPORT DESK)
 * ======================================================================================
 * Archivo: panel-admin.js
 * Descripción: Torre de control pro, finanzas, aprobación de técnicos y resolución de disputas.
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
 getDoc,
 aprobarTecnicoB2C,
 actualizarPermisosPagoB2C,
 ejecutarAccionNocB2C
} from "./firebase.js";
import {
 normalizeTechnicianProfile,
 getTechnicianKycRequirements,
 TECHNICIAN_KYC_STATES
} from "./b2c-technician-profile.js";

import { getDocs, increment, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { escaparHTML, cargarLibreriaPDF, urlABase64 } from "./app-utils.js";
import "./gestia-core/contracts/b2c-platform-contract.js";

const platformContract = globalThis.GestiaB2CPlatformContract;
if (!platformContract) throw new Error("B2C_PLATFORM_CONTRACT_UNAVAILABLE");

function adminListenerError(surface, target, message, error) {
 console.error(`[PANEL_ADMIN_${surface}_LISTENER_FAILED]`, error);
 if (target) {
 target.innerHTML = `<p class="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-center text-xs font-bold text-red-300">${message}</p>`;
 }
}

function documentReferenceUrl(value) {
 if (typeof value === "string") return value;
 if (value && typeof value === "object" && typeof value.url === "string") return value.url;
 return null;
}

export async function iniciarPanelAdmin(user) {
 console.log(" 🛡️ Iniciando Panel de Administrador (Modo BI V5.18.5 - Support Desk Activo)...");
 
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
 contadorFacturas: document.getElementById("contadorFacturas"),
 // 🔥 INYECCIÓN 1: ELEMENTOS KPI INVERSIONISTAS
 kpiTicketPromedio: document.getElementById("kpiTicketPromedio"),
 kpiLtvPromedio: document.getElementById("kpiLtvPromedio"),
 kpiTasaCancelacion: document.getElementById("kpiTasaCancelacion"),
 kpiMargenNeto: document.getElementById("kpiMargenNeto"),
 kpiForecastRunRate: document.getElementById("kpiForecastRunRate"),
 // 🔥 INYECCIÓN NUEVA: Elementos CAC y Retención
 kpiCAC: document.getElementById("kpiCAC"),
 kpiRetencion: document.getElementById("kpiRetencion")
 };

 // 🔥 INYECCIÓN DE ESTADO GLOBAL PARA CAC EN TIEMPO REAL
 let gastoMarketingGlobal = 0;
 let clientesUnicosActivos = 1; 

 onSnapshot(doc(db, "configuracion", "catalogo_global"), (docSnap) => {
 if (docSnap.exists()) {
 gastoMarketingGlobal = parseFloat(docSnap.data().gasto_marketing || 0);
 if (elementos.kpiCAC) {
 const cac = clientesUnicosActivos > 0 ? (gastoMarketingGlobal / clientesUnicosActivos) : gastoMarketingGlobal;
 elementos.kpiCAC.innerText = `$${cac.toFixed(2)}`;
 }
 }
 }, (error) => {
 console.error("[PANEL_ADMIN_CATALOG_CONFIG_LISTENER_FAILED]", error);
 if (elementos.kpiCAC) elementos.kpiCAC.innerText = "N/D";
 });

if (elementos.lista && !document.getElementById("btnAutorizarEfectivo")) {
 const adminToolbar = document.createElement("div");
 adminToolbar.className = "mb-4 flex flex-col gap-2";
 adminToolbar.innerHTML = `
 <section id="autorizacionMetodosCliente" class="rounded-2xl border border-emerald-500/30 bg-emerald-950/10 p-3 space-y-2">
   <p class="text-[10px] font-black uppercase tracking-widest text-emerald-300">Autorización de métodos por cliente</p>
   <div class="flex gap-2">
     <input id="adminPaymentCustomerEmail" type="email" autocomplete="off" placeholder="correo del cliente B2C" class="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-black px-3 py-2 text-xs text-white">
     <button id="btnAutorizarEfectivo" onclick="window.buscarYAutorizarCliente()" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black py-2 px-3 rounded-xl shadow-lg border border-emerald-500/50 transition-transform active:scale-95 flex items-center justify-center gap-2">
       <i class="fas fa-search"></i> BUSCAR
     </button>
   </div>
   <div id="gestorPagosCliente" class="hidden"></div>
 </section>
 <button id="btnBuscarB2B" onclick="window.buscarClienteParaB2B()" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-black py-3 px-4 rounded-xl shadow-lg border border-blue-500/50 transition-transform active:scale-95 w-full flex items-center justify-center gap-2">
 <i class="fas fa-handshake"></i> GESTIONAR CONTRATO B2B (BUSCAR CLIENTE)
 </button>
 `;
 elementos.lista.parentElement.insertBefore(adminToolbar, elementos.lista);
 }

 window.buscarYAutorizarCliente = async () => {
 const email = document.getElementById("adminPaymentCustomerEmail")?.value?.trim().toLowerCase();
 if(!email) return;

 try {
 const q = query(collection(db, "users"), where("email", "==", email.trim().toLowerCase()));
 const [snap, paymentConfigSnapshot] = await Promise.all([
 getDocs(q),
 getDoc(doc(db, "configuracion", "pagos"))
 ]);
 
 if(snap.empty) {
 alert("❌ No se encontró ningún cliente registrado con ese correo.");
 return;
 }

 const clienteId = snap.docs[0].id;
 const clienteData = snap.docs[0].data();
 if (clienteData.rol !== "cliente" || clienteData.tipo_cuenta === "B2B") {
 alert("⚠️ El perfil seleccionado no corresponde a un cliente B2C.");
 return;
 }
 const globalConfig = paymentConfigSnapshot.exists() ? paymentConfigSnapshot.data() : {};
 const resolved = platformContract.resolvePaymentPermissions(globalConfig, clienteData);
 const gestor = document.getElementById("gestorPagosCliente");
 if (!gestor) return;
 gestor.dataset.customerId = clienteId;
 gestor.className = "bg-zinc-950 border border-zinc-700 rounded-xl p-4 space-y-3";
 gestor.innerHTML = `
 <div>
   <p class="text-white text-sm font-black">${escaparHTML(clienteData.nombre || "Cliente")}</p>
   <p class="text-zinc-500 text-[10px]">${escaparHTML(clienteData.email || email)}</p>
 </div>
 <label class="flex items-center justify-between bg-zinc-900 rounded-lg p-3 gap-3">
   <span class="text-xs font-bold text-blue-300">STRIPE<br><small class="text-zinc-500">Global: ${resolved.global.stripe ? "ACTIVO" : "INACTIVO"}<br>Cliente: ${resolved.individual.stripe_autorizado ? "AUTORIZADO" : "NO AUTORIZADO"}<br>Resultado: ${resolved.stripe ? "DISPONIBLE" : "BLOQUEADO"}</small></span>
   <input id="adminStripeAutorizado" type="checkbox" ${resolved.individual.stripe_autorizado ? "checked" : ""}>
 </label>
 <label class="flex items-center justify-between bg-zinc-900 rounded-lg p-3 gap-3">
   <span class="text-xs font-bold text-emerald-300">EFECTIVO<br><small class="text-zinc-500">Global: ${resolved.global.efectivo ? "ACTIVO" : "INACTIVO"}<br>Cliente: ${resolved.individual.efectivo_autorizado ? "AUTORIZADO" : "NO AUTORIZADO"}<br>Resultado: ${resolved.efectivo ? "DISPONIBLE" : "BLOQUEADO"}</small></span>
   <input id="adminEfectivoAutorizado" type="checkbox" ${resolved.individual.efectivo_autorizado ? "checked" : ""}>
 </label>
 ${resolved.individual.efectivo_source === "legacy_fallback"
   ? '<p class="text-[10px] text-amber-400">El valor de efectivo mostrado proviene del fallback legacy; al guardar se consolidará en pagos.</p>'
   : ''}
 <button onclick="window.guardarPermisosPagoCliente()" class="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-black py-3 rounded-lg">GUARDAR AUTORIZACIONES</button>`;
 } catch(e) {
 console.error("Error buscando cliente:", e);
 alert("Hubo un error al buscar en la base de datos.");
 }
 };

 window.guardarPermisosPagoCliente = async () => {
 const gestor = document.getElementById("gestorPagosCliente");
 const customerId = gestor?.dataset.customerId;
 if (!customerId) return;
 const stripe = document.getElementById("adminStripeAutorizado")?.checked === true;
 const efectivo = document.getElementById("adminEfectivoAutorizado")?.checked === true;
 try {
 await actualizarPermisosPagoB2C(customerId, stripe, efectivo);
 alert("✅ Autorizaciones B2C actualizadas por backend.");
 } catch (error) {
 console.error("Error actualizando permisos B2C:", error);
 alert("No fue posible actualizar las autorizaciones de pago.");
 }
 };

 window.buscarClienteParaB2B = async () => {
 const email = prompt("Ingresa el CORREO ELECTRÓNICO del CLIENTE para gestionar su contrato B2B:");
 if(!email) return;

 try {
 const q = query(collection(db, "users"), where("email", "==", email.trim().toLowerCase()));
 const snap = await getDocs(q);
 
 if(snap.empty) {
 alert("❌ No se encontró ningún usuario registrado con ese correo.");
 return;
 }

 const clienteDoc = snap.docs[0];
 const data = clienteDoc.data();
 
 if(data.rol === "tecnico") {
 alert("⚠️ Este correo pertenece a un Técnico, debes buscar a un Cliente.");
 return;
 }

 // Si lo encuentra, abrimos el modal mágico B2B
 window.abrirGestorB2B(
 clienteDoc.id, 
 data.nombre, 
 data.email, 
 data.b2b_activo || false, 
 data.saldo_virtual || 0
 );

 } catch(e) {
 console.error("Error buscando cliente B2B:", e);
 alert("Hubo un error al buscar en la base de datos.");
 }
 };

 // ======================================================================================
 // 🔥 MOTOR DE RENDERIZADO DE TÉCNICOS (CON BYPASS B2B)
 // ======================================================================================
 if (elementos.lista) {
    const qTecnicos = query(collection(db, "users"), where("rol", "==", "tecnico"));
   
    onSnapshot(qTecnicos, async (snap) => {
    let contOnline = 0;
    let contTotal = 0;
    
    if (snap.empty) {
    elementos.lista.innerHTML = '<p class="text-gray-500 p-4 italic">No hay técnicos registrados en la base de datos.</p>';
    if(elementos.countOnline) elementos.countOnline.innerHTML = `0 <span class="text-sm text-gray-500">/ 0</span>`;
    return;
    }
   
    const fragment = document.createDocumentFragment();
    
    for (const docSnap of snap.docs) {
    let data = docSnap.data();
    const uid = docSnap.id;
    
    // 🔥 EL FILTRO MÁGICO: Si es un técnico B2B (tipo_cuenta === 'B2B'), lo saltamos
    if (data.tipo_cuenta === "B2B") {
        continue; // Salta al siguiente técnico en el bucle
    }
   
    contTotal++;
   
    if(data.disponible) {
    contOnline++;
    }
    
    const perfilCanonico = normalizeTechnicianProfile(data);
    const esPendiente = [TECHNICIAN_KYC_STATES.PENDING_REVIEW, TECHNICIAN_KYC_STATES.DOCUMENTS_UPLOADED].includes(perfilCanonico.estado);
    
    const ineUrl = documentReferenceUrl(perfilCanonico.documentos.ine);
    const csfUrl = documentReferenceUrl(perfilCanonico.documentos.csf);
    
    const ineCheck = ineUrl ? '<span class="text-emerald-400"> ✅ INE</span>' : '<span class="text-red-500"> ❌ INE</span>';
    const csfCheck = csfUrl ? '<span class="text-emerald-400"> ✅ CSF</span>' : '<span class="text-red-500"> ❌ CSF</span>';
    const skillsStr = perfilCanonico.skills.length ? perfilCanonico.skills.join(" • ").toUpperCase() : "GENERAL";
    
    const fotoUrl = documentReferenceUrl(perfilCanonico.foto_perfil) || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.nombre)}&background=random`;
   
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
    card.className = `p-4 mb-3 rounded-xl border ${esPendiente ? 'bg-yellow-900/10 border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.1)]' : 'bg-zinc-900 border-zinc-800'}`;
   
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
    <button class="bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 text-[9px] font-bold px-2 py-1 rounded border border-blue-900/50 mb-1" onclick="window.verExpediente('${uid}')">
    <i class="fas fa-folder-open"></i> EXPEDIENTE
    </button>
   
     ${esPendiente ? `
    <button class="btn-aprobar bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-3 py-2 rounded shadow-lg transition-transform hover:scale-105" onclick="window.aprobarTecnico('${uid}')">
    APROBAR ACCESO
    </button>
    ` : `
    <button class="bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400 text-[9px] font-bold px-2 py-1 rounded border border-emerald-900/50 mb-1" onclick="window.registrarPagoTecnico('${uid}', '${escaparHTML(data.nombre)}')">
    <i class="fas fa-money-bill-wave"></i> REGISTRAR PAGO
    </button>
    <button class="bg-red-900/30 hover:bg-red-900/50 text-red-500 text-[9px] font-bold px-2 py-1 rounded border border-red-900/50" onclick="window.aplicarPenalizacionManual('${uid}')">
    <i class="fas fa-gavel"></i> PENALIZAR
    </button>
    `}
    </div>
    </div>
    `;
    fragment.appendChild(card);
    }
   
    elementos.lista.innerHTML = "";
    elementos.lista.appendChild(fragment);
    
    if(elementos.countOnline) {
    elementos.countOnline.innerHTML = `${contOnline} <span class="text-sm text-gray-500">/ ${contTotal}</span>`;
    elementos.countOnline.style.color = contOnline > 0 ? "#10b981" : "white";
    }
    }, (error) => adminListenerError(
    "TECHNICIANS",
    elementos.lista,
    "No fue posible cargar técnicos. Verifica reglas o índices de Firestore.",
    error
    ));
 }

 const qServicios = query(collection(db, "services"), orderBy("created_at", "desc"), limit(50));

 onSnapshot(qServicios, (snap) => {
 if(elementos.actividad) elementos.actividad.innerHTML = "";
 
 if(elementos.listaFacturasPendientes) elementos.listaFacturasPendientes.innerHTML = "";
 let facturasPendientesCount = 0;

 let activos = 0;
 // 🔥 INYECCIÓN 2: LÓGICA DE TASA DE CANCELACIÓN
 let totalTickets = 0;
 let canceladosTickets = 0;
 
 // 🔥 INYECCIÓN NUEVA: TRACKING MATEMÁTICO DE CLIENTES ÚNICOS PARA CAC Y RETENCIÓN
 let setClientesUnicos = new Set();
 
 if (snap.empty) {
 if(elementos.actividad) elementos.actividad.innerHTML = '<p class="text-gray-500 italic text-sm text-center mt-4">Sin actividad reciente en la plataforma.</p>';
 }
 
 snap.forEach(docSnap => {
 const data = docSnap.data();
 const sid = docSnap.id;

 totalTickets++;
 if (data.estado === "cancelado") {
 canceladosTickets++;
 }

 if (data.cliente_nombre) {
 setClientesUnicos.add(data.cliente_nombre.trim().toLowerCase());
 }

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

 if (elementos.actividad && elementos.actividad.children.length < 15) { // Aumenté el límite visible a 15 para no perder disputas
 const item = document.createElement("div");
 item.className = "flex justify-between items-start border-b border-white/5 py-3 last:border-0";

 let colorEstado = "text-gray-400";
 if(data.estado === "pendiente" || data.estado === "pagado" || data.estado === "iniciado_stripe") colorEstado = "text-yellow-500";
 if(data.estado === "asignado") colorEstado = "text-blue-300";
 if(data.estado === "en_camino") colorEstado = "text-blue-400";
 if(data.estado === "en_sitio") colorEstado = "text-purple-400";
 if(data.estado === "cotizando") colorEstado = "text-orange-400";
 if(data.estado === "trabajando") colorEstado = "text-blue-500 animate-pulse font-bold";
 if(data.estado === "finalizado") colorEstado = "text-emerald-500";
 if(data.estado === "cancelado") colorEstado = "text-red-500 line-through";
 
 // 🔥 NUEVOS ESTADOS DE DISPUTA PARA EL ADMIN
 if(data.estado === "disputed") colorEstado = "text-red-500 font-black animate-pulse";
 if(data.estado === "warranty_requested") colorEstado = "text-orange-500 font-black animate-pulse";
 
 const labelServicio = escaparHTML(`${data.categoria} ${data.sub_servicio ? '• ' + data.sub_servicio : ''}`);

 let btnAuditar = '';
 if(data.estado === "finalizado") {
 btnAuditar = `<button class="mt-2 text-[9px] bg-purple-600/30 text-purple-400 font-bold px-2 py-1 rounded border border-purple-500/50 transition-colors hover:bg-purple-600/50 block" onclick="window.auditarServicio('${sid}')"><i class="fas fa-camera"></i> AUDITAR (4 FOTOS)</button>`;
 }

 // 🔥 INYECCIÓN: BOTÓN DE RESOLUCIÓN PARA EL JUEZ (ADMIN)
 let btnSoporteAdmin = '';
 if(data.estado === "disputed" || data.estado === "warranty_requested") {
     btnSoporteAdmin = `
     <button class="mt-2 text-[10px] bg-red-600 text-white font-black px-3 py-1.5 rounded border border-red-500 hover:bg-red-500 transition-colors shadow-[0_0_10px_rgba(220,38,38,0.5)] block" onclick="window.juzgarDisputaAdmin('${sid}', '${data.estado}')">
         <i class="fas fa-gavel"></i> RESOLVER CASO
     </button>`;
 }

 item.innerHTML = `
 <div class="flex items-start gap-3">
 <div class="bg-zinc-800 p-2 rounded-lg mt-1"><i class="fas fa-tools text-gray-400"></i></div>
 <div>
 <p class="text-xs font-bold text-white uppercase">${labelServicio}</p>
 <p class="text-[10px] text-gray-500">${escaparHTML(data.cliente_nombre || 'Cliente')} • ${escaparHTML(data.zona || 'Cancún')}</p>
 ${btnAuditar}
 ${btnSoporteAdmin}
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
 
 // 🔥 INYECCIÓN NUEVA: PROCESAMIENTO MATEMÁTICO DE CAC Y RETENCIÓN
 clientesUnicosActivos = setClientesUnicos.size > 0 ? setClientesUnicos.size : 1;
 
 if (elementos.kpiCAC) {
 const cac = (gastoMarketingGlobal / clientesUnicosActivos);
 elementos.kpiCAC.innerText = `$${cac.toFixed(2)}`;
 }
 
 if (elementos.kpiRetencion) {
 const retencion = setClientesUnicos.size > 0 ? (totalTickets / setClientesUnicos.size) : 0;
 elementos.kpiRetencion.innerText = `${retencion.toFixed(1)}x`;
 }

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

 // 🔥 INYECCIÓN 2.1: RENDERIZAR TASA DE CANCELACIÓN
 if (elementos.kpiTasaCancelacion) {
 const tasa = totalTickets > 0 ? (canceladosTickets / totalTickets) * 100 : 0;
 elementos.kpiTasaCancelacion.innerText = `${tasa.toFixed(1)}%`;
 elementos.kpiTasaCancelacion.className = tasa > 15 ? "text-xl font-black text-red-500" : "text-xl font-black text-white";
 }
 }, (error) => {
 adminListenerError("SERVICES", elementos.actividad, "No fue posible cargar Actividad.", error);
 adminListenerError("INVOICES", elementos.listaFacturasPendientes, "No fue posible cargar Facturación.", error);
 if (elementos.countServ) elementos.countServ.innerText = "N/D";
 });

 // ======================================================================================
 // ⚖️ MESA DE AYUDA DEL JUEZ: LÓGICA DE RESOLUCIÓN DE DISPUTAS Y GARANTÍAS
 // ======================================================================================
 window.juzgarDisputaAdmin = async (serviceId, estadoActual) => {
     if(document.getElementById("modalJuezAdmin")) return;
     
     try {
         const qTickets = query(collection(db, "support_tickets"), where("serviceId", "==", serviceId), limit(1));
         const ticketSnap = await getDocs(qTickets);
         
         if (ticketSnap.empty) {
             alert("No se encontró el ticket de soporte en la base de datos.");
             return;
         }

         const ticketDoc = ticketSnap.docs[0];
         const ticketId = ticketDoc.id;

         const qMessages = query(collection(db, `support_tickets/${ticketId}/messages`), orderBy("timestamp", "asc"), limit(1));
         const msgSnap = await getDocs(qMessages);
         let mensajeQueja = "Sin descripción proporcionada.";
         if (!msgSnap.empty) {
             mensajeQueja = msgSnap.docs[0].data().message;
         }

         const isWarranty = estadoActual === "warranty_requested";
         const tipoProblema = isWarranty ? "SOLICITUD DE GARANTÍA" : "CLIENTE SE NIEGA A PAGAR";
         const colorTema = isWarranty ? "text-orange-500" : "text-red-500";
         const borderTema = isWarranty ? "border-orange-500" : "border-red-500";

         let botonesAccion = "";
         
         if (isWarranty) {
             botonesAccion = `
                 <button onclick="window.resolverGarantia('${serviceId}', '${ticketId}', true)" class="w-full bg-orange-600 hover:bg-orange-500 text-white font-black py-3 rounded-lg text-xs shadow-lg transition-transform active:scale-95 mb-2">
                     <i class="fas fa-undo"></i> REABRIR SERVICIO (TÉCNICO DEBE VOLVER)
                 </button>
                 <button onclick="window.resolverGarantia('${serviceId}', '${ticketId}', false)" class="w-full bg-zinc-800 hover:bg-zinc-700 text-gray-300 font-bold py-3 rounded-lg text-xs border border-zinc-700 transition-colors">
                     <i class="fas fa-times"></i> RECHAZAR GARANTÍA (CERRAR CASO)
                 </button>
             `;
         } else {
             botonesAccion = `
                 <button onclick="window.resolverDisputaPago('${serviceId}', '${ticketId}', 'pagado')" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 rounded-lg text-xs shadow-lg transition-transform active:scale-95 mb-2">
                     <i class="fas fa-check-double"></i> YA LE PAGÓ (LIBERAR COBRO AL TÉCNICO)
                 </button>
                 <button onclick="window.resolverDisputaPago('${serviceId}', '${ticketId}', 'cancelado')" class="w-full bg-red-900 hover:bg-red-800 text-white font-bold py-3 rounded-lg text-xs border border-red-500 transition-colors">
                     <i class="fas fa-user-slash"></i> NO PAGÓ (CANCELAR SERVICIO Y VETAR CLIENTE)
                 </button>
             `;
         }

         const html = `
         <div id="modalJuezAdmin" class="fixed inset-0 bg-black/95 z-[90] flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm">
             <div class="bg-zinc-900 w-full max-w-md rounded-3xl p-6 border ${borderTema} shadow-2xl relative">
                 <button onclick="document.getElementById('modalJuezAdmin').remove()" class="absolute top-4 right-4 text-gray-500 hover:text-white"><i class="fas fa-times text-xl"></i></button>
                 
                 <h3 class="text-xl font-black mb-1 ${colorTema} uppercase"><i class="fas fa-gavel"></i> RESOLUCIÓN DE CASO</h3>
                 <p class="text-[10px] text-gray-500 font-mono mb-4">Ticket ID: ${ticketId.substring(0,8).toUpperCase()} | Srv ID: ${serviceId.substring(0,6).toUpperCase()}</p>
                 
                 <div class="bg-black border border-zinc-800 p-4 rounded-xl mb-6">
                     <p class="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Motivo del reporte:</p>
                     <p class="text-sm text-white font-bold mb-3">${tipoProblema}</p>
                     <p class="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Descripción del usuario:</p>
                     <p class="text-xs text-gray-300 italic border-l-2 ${borderTema} pl-2 py-1">"${escaparHTML(mensajeQueja)}"</p>
                 </div>

                 <div class="space-y-2">
                     ${botonesAccion}
                 </div>
             </div>
         </div>
         `;
         document.body.insertAdjacentHTML('beforeend', html);

     } catch (error) {
         console.error("Error al abrir caso:", error);
         alert("Hubo un error al intentar leer el ticket de soporte.");
     }
 };

 // Resolución de Garantías
 window.resolverGarantia = async (serviceId, ticketId, aprobar) => {
     if(!confirm(aprobar ? "🚨 ¿Seguro que deseas APROBAR la garantía? El técnico será forzado a regresar." : "¿Seguro que deseas RECHAZAR la garantía?")) return;
     
     try {
         if (aprobar) {
             // 1. Extraemos el mensaje de la queja original
             const qMessages = query(collection(db, `support_tickets/${ticketId}/messages`), orderBy("timestamp", "asc"), limit(1));
             const msgSnap = await getDocs(qMessages);
             const reporteFalla = !msgSnap.empty ? msgSnap.docs[0].data().message : "Falla reportada por el cliente.";

             // 2. MAGIA: Reabrimos el servicio INYECTANDO LA BANDERA DE GARANTÍA
             await updateDoc(doc(db, "services", serviceId), { 
                 estado: "trabajando",
                 es_garantia: true,
                 motivo_garantia: reporteFalla 
             }); 
             
             alert("✅ Garantía APROBADA. El servicio regresó al técnico con la alerta roja.");
         } else {
             await updateDoc(doc(db, "services", serviceId), { estado: "finalizado" });
             alert("❌ Garantía RECHAZADA. El servicio se mantiene finalizado.");
         }

         // 3. Tu labor como Juez terminó. Cerramos el ticket de disputa.
         await updateDoc(doc(db, "support_tickets", ticketId), { status: "resolved", resolvedAt: serverTimestamp() });
         
         const modal = document.getElementById('modalJuezAdmin');
         if(modal) modal.remove();

     } catch (e) {
         console.error(e);
         alert("Error al resolver la garantía.");
     }
 };

 // Resolución de Disputas de Pago
 window.resolverDisputaPago = async (serviceId, ticketId, decision) => {
     let msg = decision === 'pagado' 
         ? "¿El cliente ya le pagó al técnico? El sistema avanzará al paso de subir la evidencia (Firma y Fotos)." 
         : "🚨 ATENCIÓN: Esto cancelará el servicio por falta de pago. ¿Deseas proceder?";
     
     if(!confirm(msg)) return;

     try {
         if (decision === 'pagado') {
             await updateDoc(doc(db, "services", serviceId), { estado: "trabajando" }); 
         } else {
             await updateDoc(doc(db, "services", serviceId), { estado: "cancelado", cancelado_razon: "Cancelado por Admin: Cliente se negó a pagar el efectivo." });
         }
         await updateDoc(doc(db, "support_tickets", ticketId), { status: "resolved", resolvedAt: serverTimestamp() });
         
         document.getElementById('modalJuezAdmin').remove();
         alert("✅ Disputa de pago resuelta. El flujo se ha reactivado/cancelado.");
     } catch (e) {
         console.error(e);
         alert("Error al resolver la disputa.");
     }
 };
 // ======================================================================================

 window.marcarFacturaEnviada = async (id) => {
 if(!confirm("¿Confirmas que ya enviaste el CFDI a este cliente a través de tu portal del SAT?")) return;
 try {
 await updateDoc(doc(db, "services", id), { factura_enviada: true });
 } catch(e) {
 console.error("Error al actualizar factura:", e);
 alert("Error al actualizar estado en la base de datos.");
 }
 };

 const qFinanzas = query(collection(db, "transacciones"));
 onSnapshot(qFinanzas, (snap) => {
 let globalFixGo = 0; 
 let globalIVA = 0; 
 let globalISR = 0; 
 let globalGarantia = 0; 
 let globalStripe = 0; 
 let globalTecnico = 0; 
 
 let totalFlujo = 0; 
 let dineroRetenido = 0; 
 let dineroRetiradoTecnicos = 0; 

 // 🔥 INYECCIÓN 3: CONTADOR DE PAGOS PARA TICKET PROMEDIO Y RUN-RATE
 let conteoServiciosPagados = 0;
 let flujoMesActual = 0;

 const ahora = new Date();
 const mesActual = ahora.getMonth();
 const anoActual = ahora.getFullYear();

 snap.forEach(docSnap => {
 const tx = docSnap.data();
 
 if (tx.tipo === "retiro_fondos") {
 dineroRetiradoTecnicos += Math.abs(tx.pago_tecnico || 0);
 }

 if (tx.tipo === "ingreso_servicio") {
 const monto = tx.monto_total || 0;
 totalFlujo += monto;
 conteoServiciosPagados++; // Contamos los servicios que sí se pagaron

 const calcFixGo = monto * 0.32; 
 const calcGarantia = monto * 0.02; 
 const calcStripe = (monto * 0.036) + 3.00; 
 
 const calcIVA = calcFixGo * 0.16; 
 const calcISR = calcFixGo * 0.30; 

 const calcTecnico = monto - calcFixGo - calcGarantia - calcStripe;

 globalFixGo += calcFixGo;
 globalIVA += calcIVA;
 globalISR += calcISR;
 globalGarantia += calcGarantia;
 globalStripe += calcStripe;
 globalTecnico += calcTecnico;

 if (tx.fecha && tx.fecha.toDate) {
 const fechaTx = tx.fecha.toDate();
 if (fechaTx.getMonth() === mesActual && fechaTx.getFullYear() === anoActual) {
 flujoMesActual += monto;
 }
 const diffHoras = Math.abs(ahora - fechaTx) / 36e5;
 if (diffHoras < 24) {
 dineroRetenido += calcTecnico; 
 }
 }
 }
 });

 const utilidadNetaReal = globalFixGo - globalIVA - globalISR;
 const saldoBoveda = totalFlujo - dineroRetiradoTecnicos;

 // 🔥 INYECCIÓN 3.1: CÁLCULO Y RENDERIZADO DE KPIs DE INVERSIÓN (AOV, LTV, MARGEN, RUN-RATE)
 if (elementos.kpiTicketPromedio) {
 const aov = conteoServiciosPagados > 0 ? (totalFlujo / conteoServiciosPagados) : 0;
 elementos.kpiTicketPromedio.innerText = `$${aov.toFixed(2)}`;
 
 // LTV Estimado = AOV x 2.5 (Frecuencia de recompra estándar)
 if (elementos.kpiLtvPromedio) {
 elementos.kpiLtvPromedio.innerText = `$${(aov * 2.5).toFixed(2)}`;
 }
 }
 if (elementos.kpiMargenNeto) {
 const margen = totalFlujo > 0 ? (utilidadNetaReal / totalFlujo) * 100 : 0;
 elementos.kpiMargenNeto.innerText = `~${margen.toFixed(1)}%`;
 }
 if (elementos.kpiForecastRunRate) {
 const diasPasados = ahora.getDate() || 1;
 const diasEnMes = new Date(anoActual, mesActual + 1, 0).getDate();
 const runRateMensual = (flujoMesActual / diasPasados) * diasEnMes;
 elementos.kpiForecastRunRate.innerText = `$${runRateMensual.toFixed(2)}`;
 }

 if(elementos.countMoney) {
 elementos.countMoney.innerText = `$${globalFixGo.toFixed(2)}`;
 if(elementos.countBovedaStripe) elementos.countBovedaStripe.innerText = `$${saldoBoveda.toFixed(2)}`;
 
 // CORRECCIÓN QUIRÚRGICA DEL CONTENEDOR DE CLASES
 const cardParent = elementos.countMoney.closest('.glow-money') || elementos.countMoney.closest('.uber-card') || elementos.countMoney.parentElement;
 let desgloseContainer = cardParent.querySelector('.finance-breakdown');
 
 if(!desgloseContainer) {
 desgloseContainer = document.createElement('div');
 desgloseContainer.className = "finance-breakdown mt-3 pt-3 border-t border-white/10 text-[9px] text-gray-400 space-y-1";
 const referenceNode = cardParent.querySelector('.border-t.border-white\\/10') || cardParent.children[1];
 if (referenceNode) {
 cardParent.insertBefore(desgloseContainer, referenceNode); 
 } else {
 cardParent.appendChild(desgloseContainer);
 }
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

 <button onclick="window.exportarConciliacionCSV()" class="w-full mt-3 bg-blue-900/40 hover:bg-blue-800/60 text-blue-400 font-bold py-2 rounded-lg border border-blue-500/50 transition-colors flex items-center justify-center gap-2 text-[10px] shadow-lg relative z-20 cursor-pointer">
 <i class="fas fa-file-excel"></i> EXPORTAR CONCILIACIÓN CONTABLE (CSV)
 </button>
 `;
 }
 }, (error) => {
 console.error("[PANEL_ADMIN_FINANCE_LISTENER_FAILED]", error);
 [elementos.countMoney, elementos.countBovedaStripe, elementos.kpiTicketPromedio,
  elementos.kpiLtvPromedio, elementos.kpiMargenNeto, elementos.kpiForecastRunRate]
 .filter(Boolean).forEach(element => { element.innerText = "N/D"; });
 });

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

 window.auditarServicio = async (sid) => {
 if(document.getElementById("modalAuditoria")) return;
 try {
 const docSnap = await getDoc(doc(db, "services", sid));
 if(!docSnap.exists()) return alert("Servicio no encontrado.");
 const s = docSnap.data();
 
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
 
 const f_a1 = data.evidencia?.antes1 || data.evidencia?.antes;
 const f_a2 = data.evidencia?.antes2;
 const f_d1 = data.evidencia?.despues1 || data.evidencia?.despues;
 const f_d2 = data.evidencia?.despues2;

 btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PROCESANDO FOTOS...';

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

 const firmaDigital = data.evidencia?.firma_cliente;
 if (firmaDigital) {
 y += 45; 
 docPdf.setFontSize(10);
 docPdf.setFont("helvetica", "bold");
 docPdf.setTextColor(0, 0, 0);
 docPdf.text("FIRMA DE CONFORMIDAD DEL CLIENTE", 20, y);
 docPdf.addImage(firmaDigital, "PNG", 20, y + 5, 60, 20); 
 docPdf.setDrawColor(50, 50, 50);
 docPdf.setLineWidth(0.5);
 docPdf.line(20, y + 26, 80, y + 26); 
 }
 
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

 // 🔥 EXPEDIENTES LIMPIADOS: Solo lee de 'users'
 window.verExpediente = async (uid) => {
 if(document.getElementById("modalExpediente")) return;
 try {
 let t = {};
 const docSnap = await getDoc(doc(db, "users", uid));
 if(docSnap.exists()) t = docSnap.data();

 if(Object.keys(t).length === 0) return alert("Técnico no encontrado.");

 const fotoUrl = t.foto_perfil || t.fotoPerfil || t.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.nombre)}&background=random`;
 
 const ineUrl = t.documentos?.ine || t.ine || t.ine_url || t.identificacion || null;
 const csfUrl = t.documentos?.csf || t.csf || t.csf_url || t.constancia || null;
 const licUrl = t.documentos?.licencia || t.licencia || t.vehiculo?.licencia || null;

 const banco = t.datos_bancarios?.banco || t.banco || t.banco_nombre || 'NO REGISTRADO';
 const clabe = t.datos_bancarios?.clabe || t.clabe || t.clabe_interbancaria || 'NO REGISTRADA';

 const perfilCanonico = normalizeTechnicianProfile(t);
 const kyc = getTechnicianKycRequirements(t);
 const tipoVehiculo = perfilCanonico.vehiculo.tipo || 'NO REGISTRADO';
 const placas = kyc.pedestrian ? 'NO APLICA (PEATÓN)' : (perfilCanonico.vehiculo.placas || 'N/A');
 const certificados = perfilCanonico.documentos.certificados;

 const ineHTML = ineUrl ? `<a href="${ineUrl}" target="_blank" class="bg-blue-600/20 text-blue-400 px-3 py-1 rounded-lg border border-blue-500/30 text-xs font-bold hover:bg-blue-600/40 transition-colors"><i class="fas fa-external-link-alt"></i> Ver</a>` : '<span class="text-red-500 text-xs"><i class="fas fa-times-circle"></i> Faltante</span>';
 const csfHTML = csfUrl ? `<a href="${csfUrl}" target="_blank" class="bg-blue-600/20 text-blue-400 px-3 py-1 rounded-lg border border-blue-500/30 text-xs font-bold hover:bg-blue-600/40 transition-colors"><i class="fas fa-external-link-alt"></i> Ver</a>` : '<span class="text-red-500 text-xs"><i class="fas fa-times-circle"></i> Faltante</span>';
 const licHTML = licUrl ? `<a href="${licUrl}" target="_blank" class="bg-blue-600/20 text-blue-400 px-3 py-1 rounded-lg border border-blue-500/30 text-xs font-bold hover:bg-blue-600/40 transition-colors"><i class="fas fa-external-link-alt"></i> Ver</a>` : '<span class="text-red-500 text-xs"><i class="fas fa-times-circle"></i> Faltante</span>';

 let certsHTML = '';
 if (certificados.length > 0) {
  certsHTML = certificados.map(c => `<a href="${typeof c === 'string' ? c : c.url}" target="_blank" class="bg-emerald-900/30 text-emerald-400 text-[9px] font-bold px-2 py-1 rounded border border-emerald-500/50 mr-1 mb-1 inline-block"><i class="fas fa-award"></i> Ver certificado</a>`).join('');
 } else {
  certsHTML = '<span class="text-gray-500 text-xs"><i class="fas fa-info-circle"></i> Sin certificados opcionales</span>';
 }

 const btnAprobarModal = ([TECHNICIAN_KYC_STATES.PENDING_REVIEW, TECHNICIAN_KYC_STATES.DOCUMENTS_UPLOADED].includes(perfilCanonico.estado) && kyc.complete) ? `
 <button onclick="window.aprobarTecnico('${uid}'); document.getElementById('modalExpediente').remove();" class="w-full mt-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 rounded-xl text-sm transition-colors shadow-lg">
 <i class="fas fa-user-check"></i> APROBAR TÉCNICO AHORA
 </button>
 ` : '';

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
 <p class="text-blue-400 text-xs font-bold flex items-center gap-1"><img src="assets/gestiapremium-icon.svg" class="w-3 h-3"> EXPEDIENTE OFICIAL</p>
 </div>
 </div>
 <button onclick="document.getElementById('modalExpediente').remove()" class="text-gray-500 hover:text-white"><i class="fas fa-times text-xl"></i></button>
 </div>

 <div class="space-y-4">
 <div class="bg-black p-3 rounded-xl border border-zinc-800">
 <p class="text-[10px] text-gray-500 font-bold uppercase mb-1"><i class="fas fa-university"></i> Datos Bancarios</p>
 <p class="text-sm text-white font-mono">Banco: <span class="text-emerald-400">${escaparHTML(banco)}</span></p>
 <p class="text-sm text-white font-mono">CLABE: <span class="text-emerald-400">${escaparHTML(clabe)}</span></p>
 </div>

 <div class="bg-black p-3 rounded-xl border border-zinc-800">
 <p class="text-[10px] text-gray-500 font-bold uppercase mb-3"><i class="fas fa-id-card"></i> Identidad y Fiscal</p>
 <div class="flex justify-between items-center mb-3">
 <span class="text-white text-xs">Identificación (INE):</span> ${ineHTML}
 </div>
 <div class="flex justify-between items-center">
 <span class="text-white text-xs">Constancia Fiscal (CSF):</span> ${csfHTML}
 </div>
 </div>

 <div class="bg-black p-3 rounded-xl border border-zinc-800">
 <p class="text-[10px] text-gray-500 font-bold uppercase mb-2"><i class="fas fa-motorcycle"></i> Logística Operativa</p>
 <div class="flex justify-between items-center mb-1">
 <span class="text-sm text-white">Vehículo:</span>
 <span class="text-sm text-blue-400 font-bold uppercase">${escaparHTML(tipoVehiculo)}</span>
 </div>
 <div class="flex justify-between items-center mb-3">
 <span class="text-sm text-white">Placas:</span>
 <span class="text-sm text-blue-400 font-mono uppercase bg-blue-900/30 px-2 py-0.5 rounded border border-blue-500/30">${escaparHTML(placas)}</span>
 </div>
 <div class="flex justify-between items-center border-t border-zinc-800 pt-3">
 <span class="text-white text-xs">Licencia de Conducir:</span> ${licHTML}
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
 <p class="text-sm text-white font-mono">${escaparHTML(t.telefono || t.phone || 'Sin teléfono')}</p>
 <p class="text-xs text-gray-400">${escaparHTML(t.email || 'Sin correo')}</p>
 </div>
 </div>

 <div class="mt-6">
 ${btnAprobarModal}
 <button onclick="document.getElementById('modalExpediente').remove()" class="w-full mt-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl text-sm transition-colors shadow-lg">
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
 await aprobarTecnicoB2C(uid);

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
 await ejecutarAccionNocB2C({
 action: "manual_penalty",
 technicianId: uid,
 amount: monto,
 reason: `Admin: ${motivo}`
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
 await ejecutarAccionNocB2C({ action: "record_technician_payment", technicianId: uid, amount: monto });
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
 // 🔥 INYECCIÓN: INPUT PARA PRESUPUESTO MARKETING
 let html = `
 <div class="mb-4 bg-blue-900/10 rounded-xl border border-blue-500/30 overflow-hidden shadow-lg p-4 col-span-1 md:col-span-2">
 <h4 class="text-blue-400 font-bold text-xs md:text-sm uppercase tracking-widest mb-3 flex items-center gap-2"><i class="fas fa-bullhorn"></i> Presupuesto Marketing (Mensual)</h4>
 <div class="flex items-center bg-black p-3 rounded-lg border border-zinc-800">
 <span class="text-emerald-500 font-bold mr-2">$</span>
 <input type="number" id="cfg_gasto_marketing" class="bg-transparent text-white font-bold w-full focus:outline-none" placeholder="Ej. 5000" value="${config.gasto_marketing || 0}">
 <span class="text-gray-500 text-xs ml-2">MXN</span>
 </div>
 <p class="text-[9px] text-gray-500 mt-2">Este valor se usará para calcular el CAC (Costo de Adquisición de Cliente) en tiempo real en el dashboard.</p>
 </div>
 `;
 let indexCat = 0;
 
 for (const [categoria, servicios] of Object.entries(MASTER_STRUCTURE)) {
 const catId = `cat_admin_${indexCat}`;
 const isHidden = indexCat === 0 ? "" : "hidden";
 const isRotated = indexCat === 0 ? "rotate-180" : "";

 html += `
 <div class="mb-3 bg-zinc-900/80 rounded-xl border border-zinc-800 overflow-hidden shadow-lg">
 <div class="p-4 flex justify-between items-center cursor-pointer hover:bg-zinc-800/80 transition-colors" onclick="window.toggleCategoriaAdmin('${catId}')">
 <h4 class="text-emerald-500 font-bold text-xs md:text-sm uppercase tracking-widest">${categoria}</h4>
 <div class="bg-black/50 p-2 rounded-lg">
 <i id="icon_${catId}" class="fas fa-chevron-down text-gray-400 transition-transform duration-300 ${isRotated}"></i>
 </div>
 </div>
 <div id="${catId}" class="${isHidden} p-4 pt-0 space-y-3 border-t border-zinc-800/50 mt-2">`;
 
 servicios.forEach(srv => {
 const isChecked = config[srv.id] === true;
 html += generarSwitchGranular(srv.id, srv.label, isChecked);
 });
 
 html += `</div></div>`;
 indexCat++;
 }
 container.innerHTML = html;
 }
 };

 window.toggleCategoriaAdmin = (catId) => {
 const content = document.getElementById(catId);
 const icon = document.getElementById(`icon_${catId}`);
 if(content && icon) {
 content.classList.toggle('hidden');
 icon.classList.toggle('rotate-180');
 }
 };

 window.guardarConfiguracionGlobal = async () => {
 const inputs = document.querySelectorAll('input[id^="cfg_"]');
 let nuevaConfig = {
 updatedAt: serverTimestamp(),
 // 🔥 INYECCIÓN: GUARDAR EL DATO DE MARKETING
 gasto_marketing: parseFloat(document.getElementById("cfg_gasto_marketing")?.value || 0)
 };

 inputs.forEach(input => {
 if (input.id !== "cfg_gasto_marketing") {
 const realId = input.id.replace("cfg_", "");
 nuevaConfig[realId] = input.checked;
 }
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
 }, (error) => adminListenerError(
 "WITHDRAWALS",
 elementos.listaRetiros,
 "No fue posible cargar retiros. Verifica reglas o el índice requerido.",
 error
 ));

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
 await ejecutarAccionNocB2C({ action: "process_withdrawal", withdrawalId: retiroId });

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
 <div class="flex justify-between items-center bg-black p-3 rounded-lg border border-zinc-800">
 <span class="text-gray-300 text-xs md:text-sm font-medium">${label}</span>
 <label class="relative inline-flex items-center cursor-pointer">
 <input type="checkbox" id="cfg_${id}" class="sr-only peer" ${checked ? 'checked' : ''}>
 <div class="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
 </label>
 </div>`;
}

// --- MOTOR DE IMPORTACIÓN V5.18 (INYECCIÓN NATIVA) ---
window.importarJSONGithub = async function() {
    const btn = document.getElementById('btnImportarTareas');
    if (!btn) return;
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin text-emerald-500"></i> Importando...';
    btn.disabled = true;

    try {
        // Leemos el archivo JSON alojado en tu servidor/GitHub
        const response = await fetch('./mantenimiento_edificio.json');
        if (!response.ok) throw new Error("No se encontró el archivo JSON");
        const data = await response.json();

        // Juntamos todas las categorías
        const tasks = [
            ...data.Diaria, 
            ...data.Semanal_Quincenal, 
            ...data.Mensual, 
            ...data.Semestral_Anual
        ];
        
        let count = 0;

        // Inyectamos a la base de datos usando la conexión nativa existente (db)
       for (const task of tasks) {
            // 🔥 AQUÍ ESTÁ LA MAGIA: Inyectamos la fecha nativa
            task.created_at = serverTimestamp();
            
            await addDoc(collection(db, 'services'), task);
            count++;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin text-emerald-500"></i> ${count}/${tasks.length}...`;
        }

        // Éxito visual
        btn.innerHTML = `<i class="fas fa-check"></i> ¡Éxito! (${count})`;
        btn.classList.replace('text-emerald-400', 'text-white');
        btn.classList.replace('hover:bg-emerald-900/30', 'bg-emerald-600');
        btn.classList.replace('border-emerald-500/20', 'border-emerald-500');

        alert(`¡Inyección completada! ${count} tareas enviadas al panel de Jonathan.`);

    } catch (error) {
        console.error("Error crítico importando JSON:", error);
        btn.innerHTML = '<i class="fas fa-times text-red-500"></i> Falló Inyección';
        btn.disabled = false;
        alert("Error de red o conexión. Revisa la consola roja (F12) para detalles.");
    }
};


// ======================================================================================
// 🔥 MÓDULO B2B (PREPAGO Y CONTRATOS) - V5.18 🔥
// ======================================================================================

window.abrirGestorB2B = async (userId, nombre, email, estadoB2BActual, saldoActual) => {
    const modal = document.getElementById('modalB2B');
    if (!modal) {
        alert("Error: El modal HTML para B2B no se encontró en la vista.");
        return;
    }
    
    modal.classList.remove('hidden');
    
    // Llenar datos visuales
    document.getElementById('b2bClienteId').value = userId;
    document.getElementById('b2bClienteNombre').innerText = nombre || 'Cliente sin nombre';
    document.getElementById('b2bClienteEmail').innerText = email || 'Sin correo registrado';
    
    // Setear los switches y saldo con la data de Firebase
    const toggle = document.getElementById('toggleB2BAdmin');
    toggle.checked = estadoB2BActual;
    document.getElementById('cajaSaldoVirtual').classList.toggle('hidden', !estadoB2BActual);
    
    document.getElementById('inputSaldoVirtual').value = saldoActual || 0;
};

window.guardarPerfilB2B = async () => {
    const id = document.getElementById('b2bClienteId').value;
    const isB2B = document.getElementById('toggleB2BAdmin').checked;
    const saldo = parseFloat(document.getElementById('inputSaldoVirtual').value) || 0;
    
    if(!id) { 
        alert("Error crítico: ID de cliente no encontrado."); 
        return; 
    }
    
    const btn = document.querySelector('#modalB2B button[onclick="window.guardarPerfilB2B()"]');
    const txtOrg = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> GUARDANDO EN NUBE...`;
    btn.disabled = true;

    try {
        // Inyectamos los "billetitos falsos" directamente al documento del usuario
        await updateDoc(doc(db, "users", id), {
            b2b_activo: isB2B,
            saldo_virtual: isB2B ? saldo : 0,
            fecha_modificacion_b2b: serverTimestamp()
        });

        // Opcional: Dejamos un rastro en las transacciones para auditoría
        if (isB2B && saldo > 0) {
            await addDoc(collection(db, "transacciones"), {
                tecnico_id: id, // Usamos el ID del cliente aquí para tener el registro
                tipo: "recarga_b2b",
                monto_total: saldo,
                descripcion: `Admin recargó saldo B2B virtual`,
                fecha: serverTimestamp()
            });
        }

        alert(`✅ ÉXITO: Perfil de ${document.getElementById('b2bClienteNombre').innerText} actualizado.\nModalidad B2B: ${isB2B ? 'ACTIVA' : 'INACTIVA'}\nSaldo Prepago: $${saldo} MXN.`);
        document.getElementById('modalB2B').classList.add('hidden');
        
    } catch (error) {
        console.error("Fallo al guardar B2B:", error);
        alert("❌ Error de Firebase al actualizar el contrato.");
    } finally {
        btn.innerHTML = txtOrg;
        btn.disabled = false;
    }
};
