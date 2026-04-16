/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - GESTIA RENDER ENGINE V7.3 (THE ABSOLUTE SOVEREIGN)
 * ======================================================================================
 * Identidad: Motor de Interfaz Total con Locks Granulares y Filtros Protegidos.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR. NO PLACEHOLDERS.
 * Actualización: Declaración de Lock 'sync' y Ready-Guards en motores de búsqueda.
 * Autor: Heber Mendoza (Arquitecto Supremo)
 * ======================================================================================
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, 
    doc, 
    getDoc, 
    onSnapshot, 
    query, 
    orderBy,
    where,
    addDoc,
    updateDoc,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { 
    getFunctions, 
    httpsCallable 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

// ==========================================
// 🛡️ 0. GESTIÓN DE BLOQUEOS Y CICLO DE VIDA
// ==========================================
const functions = getFunctions(undefined, 'us-central1'); 

const Locks = {
    form: false,
    panic: false,
    package: false,
    sync: false, // 🛡️ FIX: Declaración explícita para control de persistencia
    
    acquire(domain) {
        if (this[domain]) return false;
        this[domain] = true;
        // Watchdog de seguridad (10s)
        setTimeout(() => { if (this[domain]) this.release(domain, "WATCHDOG_TIMEOUT"); }, 10000);
        return true;
    },
    release(domain, reason = "COMPLETED") {
        if (this[domain] !== undefined) {
            console.log(`%c🔓 [LOCKS]: Liberando ${domain} (${reason})`, "color: #10b981; font-weight: bold;");
            this[domain] = false;
        }
    }
};

const Lifecycle = {
    activeListeners: new Set(),
    register(unsub) { if (typeof unsub === "function") this.activeListeners.add(unsub); },
    destroy() {
        console.log(`%c🧹 [SIA7]: Ejecutando Purga de Ciclo de Vida...`, "color: #f59e0b; font-weight: bold;");
        this.activeListeners.forEach(unsub => unsub());
        this.activeListeners.clear();
        window.__gestiaInitialized = false;
        window.SIA7_READY = false;
    }
};

let condominioIdActual = null; 
let rolUsuarioActual = null;  

function emitirPulsoHUD(step, status = "INFO", details = "") {
    window.dispatchEvent(new CustomEvent('gestia-terminal-state', {
        detail: { state: null, step: `RENDER_${step}: ${status}`, details }
    }));
}

// ==========================================
// 1. INICIALIZADOR DEL MOTOR (INIT)
// ==========================================
export async function initGestiaRender(moduloId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (window.__gestiaInitialized === true) {
        emitirPulsoHUD("LIFECYCLE", "REBOOTING");
        Lifecycle.destroy();
    }
    window.__gestiaInitialized = true;
    window.SIA7_READY = false;

    emitirPulsoHUD("INIT", "STARTING", moduloId);

    if (!document.getElementById('html5-qr-script')) {
        const script = document.createElement('script');
        script.id = 'html5-qr-script';
        script.src = 'https://unpkg.com/html5-qrcode';
        script.async = true;
        document.head.appendChild(script);
    }

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center p-10 h-full bg-[#0d1117]">
            <i class="fa-solid fa-building-shield fa-spin text-4xl text-blue-500 mb-4"></i>
            <p class="text-slate-400 font-mono text-[10px] animate-pulse uppercase tracking-[0.2em]">
                SISTEMA GESTIAPREMIUM: PROTOCOLO SIA7 ACTIVO...
            </p>
        </div>
    `;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
        if (!user) {
            emitirPulsoHUD("AUTH", "FAILED");
            window.location.href = 'login.html';
            return;
        }

        emitirPulsoHUD("AUTH", "RESOLVED", user.uid.substring(0, 6));

        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                container.innerHTML = `ERROR: Usuario no registrado`;
                return;
            }

            const userData = userSnap.data();
            rolUsuarioActual = userData.rol || null;
            condominioIdActual = userData.edificioId || userData.condominioId || userData.residencialId || "UXMAL39";

            if (['super_admin', 'ceo', 'arquitecto_supremo'].includes(rolUsuarioActual)) {
                condominioIdActual = "UXMAL39";
                emitirPulsoHUD("MODE", "SUPREMO");
            }

            const moduloSnap = await getDoc(doc(db, "gestia_system_modules", moduloId));
            if (!moduloSnap.exists()) throw new Error("MODULE_NOT_FOUND");
            const esquemaModulo = moduloSnap.data();

            renderizarUIBase(esquemaModulo, container);
            conectarDatosEnVivo(esquemaModulo, moduloId, condominioIdActual);
            inyectarWidgetsSeguridad(esquemaModulo, moduloId, condominioIdActual, rolUsuarioActual);

            window.SIA7_READY = true; 
            emitirPulsoHUD("UI", "READY", esquemaModulo.nombre_display);

        } catch (error) {
            emitirPulsoHUD("CRASH", "INIT_FAIL", error.message);
            container.innerHTML = `<div class="p-10 text-center text-red-500 font-mono text-xs uppercase">ERROR_FATAL: ${error.message}</div>`;
        }
    });

    Lifecycle.register(unsubAuth);
}

// ==========================================
// 2. CONSTRUCTOR DE INTERFAZ (UI BUILDER)
// ==========================================
export function renderizarUIBase(esquema, container) {
    if (!container) return;
    container.innerHTML = '';
    const tieneBotonCrear = esquema?.esquema_interfaz?.acciones_permitidas?.includes("crear");

    container.innerHTML = `
        <div class="bg-slate-900 rounded-xl border border-slate-700 shadow-xl overflow-hidden flex flex-col h-full w-full relative">
            <div class="bg-slate-800 border-b border-slate-700 p-4 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 z-10 shadow-md shrink-0">
                <div class="flex items-center gap-4 w-full xl:w-auto">
                    <div class="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-500/30 shrink-0">
                        <i class="fa-solid fa-${esquema.icono || 'cube'} text-blue-400 text-lg"></i>
                    </div>
                    <div>
                        <h2 class="text-base font-bold text-white uppercase tracking-wide leading-tight">${esquema.nombre_display}</h2>
                        <div class="flex items-center gap-3 mt-1">
                            <div class="flex items-center gap-1.5">
                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span class="text-[10px] text-slate-400 font-mono uppercase">En Edificio: <b id="count-activos" class="text-emerald-400">0</b></span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
                    <button id="toggle-solo-activos" class="w-full sm:w-auto px-3 py-2 rounded-lg border border-slate-700 text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 hover:bg-slate-700 text-slate-400" data-active="false">
                        <i class="fa-solid fa-eye-slash"></i> Ocultar Salidas
                    </button>
                    <div class="relative w-full sm:w-64">
                        <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                        <input type="text" id="buscador-trazabilidad" placeholder="Buscar registro..." class="w-full bg-slate-900/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 outline-none">
                    </div>
                    ${tieneBotonCrear ? `
                    <button id="btn-crear-registro" class="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20">
                        <i class="fa-solid fa-plus"></i> NUEVO REGISTRO
                    </button>` : ''}
                </div>
            </div>
            <div class="flex-1 flex flex-col lg:flex-row overflow-hidden bg-[#0d1117] relative">
                <div id="contenedor-tabla-principal" class="flex-1 overflow-auto custom-scrollbar relative">
                    <table class="w-full text-left border-collapse min-w-max">
                        <thead class="bg-slate-800/90 sticky top-0 backdrop-blur-sm z-10 border-b border-slate-700">
                            <tr id="tabla-cabeceras"></tr>
                        </thead>
                        <tbody id="tabla-cuerpo" class="divide-y divide-slate-800/60 text-sm"></tbody>
                    </table>
                    <div id="estado-vacio" class="hidden absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none">
                        <i class="fa-solid fa-folder-open text-4xl mb-3 opacity-30"></i>
                        <p class="font-mono text-[10px] uppercase tracking-widest text-center">Sin resultados operativos</p>
                    </div>
                </div>
                <div id="panel-derecho-pro" class="w-full lg:w-80 flex-shrink-0 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-700 flex flex-col p-4 space-y-4 shadow-2xl z-20 overflow-y-auto max-h-[45%] lg:max-h-full">
                    <div class="flex items-center gap-2 text-blue-400 font-bold text-[10px] uppercase tracking-tighter border-b border-slate-700 pb-2">
                        <i class="fa-solid fa-box-archive"></i> GESTIÓN DE PAQUETES
                    </div>
                    <div id="form-paqueteria-container"></div>
                </div>
            </div>
            <div id="contenedor-panico-flotante"></div>
            <div id="modal-dinamico" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
                <div class="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[95vh]">
                    <div class="p-4 border-b border-slate-700 flex justify-between items-center shrink-0">
                        <h3 class="text-base font-bold text-white flex items-center gap-2"><i class="fa-solid fa-bolt text-blue-400"></i> Registro Activo</h3>
                        <button onclick="SIA7.cerrarModal()" class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark text-xl"></i></button>
                    </div>
                    <div class="p-4 overflow-y-auto custom-scrollbar">
                        <form id="formulario-dinamico" class="flex flex-col gap-4"></form>
                    </div>
                    <div class="p-4 border-t border-slate-700 flex flex-col sm:flex-row justify-end gap-3 bg-slate-900/50 rounded-b-2xl">
                        <button type="button" onclick="SIA7.cerrarModal()" class="px-4 py-2 text-sm font-semibold text-slate-300">Cancelar</button>
                        <button type="submit" form="formulario-dinamico" class="bg-blue-600 px-5 py-2 rounded-lg text-sm font-semibold text-white">Guardar en BD</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('buscador-trazabilidad')?.addEventListener('input', (e) => SIA7.filtrarTablaEnVivo(e.target.value));
    
    const toggle = document.getElementById('toggle-solo-activos');
    if (toggle) {
        toggle.onclick = function () {
            if (!window.SIA7_READY) return;
            const isActive = this.dataset.active === 'true';
            this.dataset.active = (!isActive).toString();
            this.classList.toggle('bg-blue-600/20', !isActive);
            this.classList.toggle('text-blue-400', !isActive);
            SIA7.filtrarActivos(!isActive);
        };
    }

    const trCabeceras = document.getElementById('tabla-cabeceras');
    if (trCabeceras && esquema?.esquema_base_datos?.campos) {
        let headersHTML = esquema.esquema_base_datos.campos.map(campo => `
            <th class="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
                ${campo.etiqueta}
            </th>`).join('');
        headersHTML += `<th class="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right font-mono">Acciones</th>`;
        trCabeceras.innerHTML = headersHTML;
    }

    if (tieneBotonCrear) {
        document.getElementById('btn-crear-registro').onclick = () => SIA7.abrirModalFormulario(esquema);
        document.getElementById('formulario-dinamico').onsubmit = (e) => SIA7.guardarNuevoRegistro(e, esquema);
    }
}

// ==========================================
// 3. WIDGETS DE SEGURIDAD
// ==========================================
export function inyectarWidgetsSeguridad(esquema, moduloId, condominioIdActual, rolUsuarioActual) {
    const panicContainer = document.getElementById('contenedor-panico-flotante');

    if (panicContainer) {
        panicContainer.innerHTML = `
            <button id="btn-panico-pro" class="fixed bottom-6 right-6 p-6 bg-red-700 text-white rounded-full shadow-2xl active:scale-95 transition-all z-[60] border-4 border-red-900/40 group overflow-hidden">
                <div class="absolute inset-0 bg-white/10 animate-ping opacity-20"></div>
                <i class="fa-solid fa-shield-run text-2xl group-hover:rotate-12 transition-transform"></i>
            </button>
        `;

        document.getElementById('btn-panico-pro').onclick = async () => {
            if (!window.SIA7_READY || !Locks.acquire('panic')) return;
            if (!condominioIdActual || !auth.currentUser) { Locks.release('panic'); return; }
            if (!confirm(`🚨 ¿DISPARAR ALERTA EN ${condominioIdActual}?`)) { Locks.release('panic'); return; }

            emitirPulsoHUD("PANIC", "TRIGGERED");
            try {
                await addDoc(collection(db, "alertas_seguridad"), {
                    edificioId: condominioIdActual, estado: "activa", nivel: "critico",
                    origen: "CASETA DE VIGILANCIA", mensaje: "🚨 ¡PÁNICO ACTIVADO!",
                    fecha_emision: serverTimestamp(), creado_por: auth.currentUser.uid, rol_emisor: rolUsuarioActual
                });
                emitirPulsoHUD("PANIC", "SUCCESS");
            } catch (e) { emitirPulsoHUD("PANIC", "ERROR", e.message); }
            finally { Locks.release('panic'); }
        };
    }

    const pkgFormContainer = document.getElementById('form-paqueteria-container');
    if (!pkgFormContainer) return;

    pkgFormContainer.innerHTML = `
        <div class="space-y-4">
            <div class="bg-slate-800/50 p-3 rounded-xl border border-slate-700 shadow-inner">
                <div class="flex flex-col gap-3">
                    <input id="pkg-unit" type="text" placeholder="Unidad" class="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white">
                    <select id="pkg-courier" class="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white">
                        <option>Amazon</option><option>Mercado Libre</option><option>DHL / FedEx</option><option>Uber Eats</option><option>Otro</option>
                    </select>
                    <button id="btn-save-pkg" class="bg-blue-600 text-white py-3 rounded-lg text-xs font-bold">REGISTRAR</button>
                </div>
            </div>
            <div id="pkg-list-container"></div>
        </div>
    `;

    document.getElementById('btn-save-pkg').onclick = async () => {
        if (!window.SIA7_READY || !Locks.acquire('package')) return;
        let unitId = document.getElementById('pkg-unit').value.trim().toUpperCase();
        if (!unitId) { Locks.release('package'); return; }

        emitirPulsoHUD("PACKAGE", "SAVING");
        try {
            await addDoc(collection(db, "packages", condominioIdActual, "items"), {
                unitId, courier: document.getElementById('pkg-courier').value, 
                status: "recibido", timestamp: serverTimestamp(),
                recibido_por: auth.currentUser.uid, residencialId: condominioIdActual
            });
            document.getElementById('pkg-unit').value = "";
            emitirPulsoHUD("PACKAGE", "SUCCESS");
        } catch (e) { emitirPulsoHUD("PACKAGE", "ERROR", e.message); }
        finally { Locks.release('package'); }
    };

    const qPkg = query(collection(db, "packages", condominioIdActual, "items"), where("status", "==", "recibido"), orderBy("timestamp", "desc"));
    const unsubPkg = onSnapshot(qPkg, (snap) => {
        const container = document.getElementById('pkg-list-container');
        container.innerHTML = '';
        snap.forEach(docSnap => {
            const pkg = docSnap.data();
            const div = document.createElement('div');
            div.className = "p-2 border border-slate-700 flex justify-between bg-slate-800/30 mb-2 rounded items-center";
            div.innerHTML = `<span class="text-[10px] text-slate-300 font-mono">${pkg.unitId} - ${pkg.courier}</span>`;
            const btn = document.createElement('button');
            btn.className = "bg-emerald-600/20 text-emerald-400 px-2 py-1 rounded text-[9px] font-bold hover:bg-emerald-600 hover:text-white transition-all";
            btn.textContent = "ENTREGAR";
            btn.onclick = () => SIA7.registrarSalidaPaquete(docSnap.id, condominioIdActual);
            div.appendChild(btn);
            container.appendChild(div);
        });
    }, (e) => emitirPulsoHUD("SYNC", "PKG_ERROR", e.message));
    Lifecycle.register(unsubPkg);
}

// ==========================================
// 4. CONSTRUCTOR DE FORMULARIOS MULTI-FLUJO
// ==========================================
export function abrirModalFormulario(esquema) {
    if (!window.SIA7_READY) return;
    const form = document.getElementById('formulario-dinamico');
    if (!form) return;
    form.innerHTML = '';
    emitirPulsoHUD("FORM", "OPENING");

    form.innerHTML = `
        <div class="mb-2 pb-5 border-b border-slate-700/60">
            <label class="block text-sm font-bold text-blue-400 mb-2"><i class="fa-solid fa-route mr-2"></i>Clasificación del Operación</label>
            <select id="selector-tipo-flujo" name="tipo_flujo" class="w-full bg-slate-900 border border-blue-500/50 rounded-lg px-3 py-3 text-white font-bold cursor-pointer">
                <option value="" disabled selected>Selecciona el tipo de flujo...</option>
                <option value="b2b">🏢 Acceso: Corporativo / B2B</option>
                <option value="residencial">🏠 Acceso: Residencial</option>
                <option value="delivery">🍔 Acceso: Delivery</option>
                <option value="proveedor">🛠️ Acceso: Proveedor</option>
                <option value="reporte" class="text-amber-400">🚨 Reporte / Anuncio / Incidencia</option>
            </select>
        </div>
        <div id="contenedor-campos-dinamicos" class="flex flex-col gap-4 hidden pt-2"></div>
    `;

    const contenedorCampos = document.getElementById('contenedor-campos-dinamicos');
    const selectorFlujo = document.getElementById('selector-tipo-flujo');

    selectorFlujo.addEventListener('change', (e) => {
        const flujoActivo = e.target.value;
        contenedorCampos.innerHTML = '';
        contenedorCampos.classList.remove('hidden');
        emitirPulsoHUD("FORM_MUTATION", flujoActivo);

        esquema.esquema_base_datos.campos.forEach(campo => {
            if (campo.tipo === 'fecha_hora_automatica') return;

            let mostrarCampo = true;
            let etiqueta = campo.etiqueta;
            
            const isReportField = campo.id.includes('reporte') || campo.id.includes('incidencia') || ['tipo_incidencia', 'nivel_urgencia'].includes(campo.id);

            if (flujoActivo === 'reporte') {
                if (['recurso', 'empresa_area', 'motivo', 'identificacion'].includes(campo.id) && !isReportField) mostrarCampo = false;
                if (campo.id === 'nombre') etiqueta = 'Reporta / Emisor';
            } else if (isReportField) mostrarCampo = false;

            if (flujoActivo === 'delivery') {
                if (campo.id === 'recurso') mostrarCampo = false;
                if (campo.id === 'empresa_area') etiqueta = 'Plataforma (Uber/Rappi/etc)';
            }

            if (flujoActivo === 'residencial' && campo.id === 'empresa_area') mostrarCampo = false;
            if (flujoActivo === 'proveedor' && campo.id === 'empresa_area') etiqueta = 'Empresa Contratista';

            if (!mostrarCampo) return;

            const baseClass = `w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-slate-200 text-sm mt-1 focus:border-blue-500 outline-none`;
            let inputHtml = '';

            if (campo.tipo === 'texto_qr') {
                inputHtml = `
                    <div class="relative">
                        <input type="text" id="campo_${campo.id}" name="${campo.id}" class="${baseClass} pr-10 text-blue-300 font-mono">
                        <button type="button" onclick="SIA7.scanQR('${campo.id}')" class="absolute right-2 top-2.5 text-slate-400 p-1"><i class="fa-solid fa-qrcode text-lg"></i></button>
                    </div>
                    <div id="reader_${campo.id}" class="hidden w-full mt-3 rounded-xl border-2 border-blue-500/50 bg-black overflow-hidden"></div>
                `;
            } else if (campo.tipo === 'selector') {
                const opciones = (campo.opciones || []).map(op => `<option value="${op}">${op}</option>`).join('');
                inputHtml = `<select id="campo_${campo.id}" name="${campo.id}" class="${baseClass}">${opciones}</select>`;
            } else {
                inputHtml = `<input type="text" id="campo_${campo.id}" name="${campo.id}" class="${baseClass}" ${campo.obligatorio ? 'required' : ''} placeholder="Ingresa ${etiqueta.toLowerCase()}">`;
            }

            contenedorCampos.innerHTML += `
                <div class="animate-fade-in">
                    <label class="block text-[10px] uppercase font-bold text-slate-500">${etiqueta}${campo.obligatorio ? '<span class="text-red-500">*</span>' : ''}</label>
                    ${inputHtml}
                </div>`;
        });
    });

    document.getElementById('modal-dinamico').classList.remove('hidden');
}

// ==========================================
// 5. VISIÓN ÓPTICA (QR)
// ==========================================
let scannerInstance = null;
let scannerRunning = false;

export async function toggleEscanerQR(campoId) {
    if (!window.SIA7_READY) return;
    const readerDiv = document.getElementById(`reader_${campoId}`);
    if (scannerRunning) { await SIA7.gestiaStopScan(); return; }

    emitirPulsoHUD("OPTIC", "START", campoId);
    readerDiv.classList.remove('hidden');

    try {
        scannerInstance = new Html5Qrcode(`reader_${campoId}`);
        scannerRunning = true;
        await scannerInstance.start({ facingMode: "environment" }, { fps: 15, qrbox: 260 }, async (decodedText) => {
            document.getElementById(`campo_${campoId}`).value = decodedText;
            emitirPulsoHUD("OPTIC", "READ_SUCCESS");
            await SIA7.gestiaStopScan();
        }, () => {});
    } catch (e) { emitirPulsoHUD("OPTIC", "CRASH", e.message); scannerRunning = false; }
}

// ==========================================
// 6. PERSISTENCIA (CLOUD FUNCTIONS)
// ==========================================
export async function guardarNuevoRegistro(e, esquema) {
    e.preventDefault();
    if (!window.SIA7_READY || !Locks.acquire('form')) return;

    const btn = document.querySelector('button[form="formulario-dinamico"]');
    const originalHTML = btn.innerHTML;
    
    emitirPulsoHUD("PERSISTENCE", "CLOUD_SYNC");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>';

    try {
        const formData = new FormData(e.target);
        const payload = { tipo_flujo: formData.get('tipo_flujo'), modulo_origen: esquema.modulo_id, metadata: { v: "7.3-SOVEREIGN" } };
        esquema.esquema_base_datos.campos.forEach(c => {
            if (c.tipo !== 'fecha_hora_automatica') payload[c.id] = formData.get(c.id) || "—";
        });

        const res = await httpsCallable(functions, 'crearAcceso')({ condominioId: condominioIdActual, moduloId: esquema.modulo_id, payload });
        if (res.data.status === 'success') {
            emitirPulsoHUD("PERSISTENCE", "SUCCESS");
            btn.innerHTML = '✅';
            setTimeout(() => { SIA7.cerrarModal(); e.target.reset(); }, 1000);
        } else throw new Error(res.data.message);
    } catch (err) { emitirPulsoHUD("PERSISTENCE", "FAIL", err.message); btn.innerHTML = '❌'; }
    finally { 
        setTimeout(() => { 
            btn.disabled = false; 
            btn.innerHTML = originalHTML; 
            Locks.release('form'); 
        }, 3000); 
    }
}

// ==========================================
// 7. SINCRONIZACIÓN Y CONSTRUCTOR DE FILAS
// ==========================================
export function conectarDatosEnVivo(esquema, moduloId, condoId) {
    emitirPulsoHUD("SYNC", "INIT_STREAM");
    const q = query(collection(db, "gestia_records", condoId, moduloId), orderBy("creado_en", "desc"));

    const unsubSnap = onSnapshot(q, (snapshot) => {
        const tbody = document.getElementById('tabla-cuerpo');
        if (!tbody) return;
        emitirPulsoHUD("SYNC", "DATA_PKT", snapshot.size);
        tbody.innerHTML = "";
        if (snapshot.empty) { document.getElementById('estado-vacio')?.classList.remove('hidden'); return; }
        document.getElementById('estado-vacio')?.classList.add('hidden');

        const ahora = new Date();
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            const tr = document.createElement('tr');
            tr.id = `row-${id}`;
            const yaSalio = data.fecha_salida || data.status === "salida";
            const esReporte = data.tipo_flujo === 'reporte';

            let alertaOverstay = false;
            if (!yaSalio && data.creado_en && !esReporte) {
                const entrada = data.creado_en.toDate();
                const minutos = (ahora - entrada) / (1000 * 60);
                if (data.tipo_flujo === 'delivery' && minutos > 60) alertaOverstay = true;
                if (data.tipo_flujo === 'residencial' && minutos > 120) alertaOverstay = true;
                if (data.tipo_flujo === 'proveedor' && minutos > 240) alertaOverstay = true;
            }

            let clases = "border-b border-slate-800/40 border-l-4 transition-all duration-200 ";
            if (esReporte) clases += "border-l-amber-500 bg-amber-900/20 ";
            else if (yaSalio) clases += "border-l-slate-700 bg-slate-900/30 ";
            else if (alertaOverstay) clases += "border-l-amber-500 bg-amber-500/5 ";
            else clases += "border-l-blue-600/50 bg-slate-800/20 ";
            tr.className = clases;

            let cells = esquema.esquema_base_datos.campos.map(campo => {
                let val = data[campo.id] || "—";
                if (campo.tipo === 'fecha_hora_automatica' && data[campo.id]) val = data[campo.id].toDate().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                return `<td class="px-4 py-3 text-[11px] font-mono whitespace-nowrap ${yaSalio ? 'text-slate-500' : 'text-slate-200'}">${val}</td>`;
            }).join('');

            const accionesHTML = `
                <td class="px-4 py-3 text-right whitespace-nowrap min-w-[120px]">
                    <div class="flex items-center justify-end gap-2">
                        <button onclick="alert(SIA7.formatearDetalle(${JSON.stringify(data).replace(/"/g, '&quot;')}))" class="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-all"><i class="fa-solid fa-eye"></i></button>
                        ${!yaSalio && !esReporte ? `<button onclick="SIA7.registrarSalidaBD('${id}', '${moduloId}')" class="h-8 px-3 rounded-lg bg-blue-600/10 border border-blue-500/40 text-blue-400 text-[10px] font-bold uppercase hover:bg-blue-600 hover:text-white transition-all">SALIDA</button>` : ''}
                        ${esReporte ? `<span class="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[9px] font-bold italic">TICKET</span>` : ''}
                    </div>
                </td>`;
            tr.innerHTML = cells + accionesHTML;
            tbody.appendChild(tr);
        });
        document.getElementById('count-activos').innerText = snapshot.size;
    }, (error) => { emitirPulsoHUD("SYNC", "ERROR", error.message); });

    Lifecycle.register(unsubSnap);
}

// ==========================================
// 8. UNIFICACIÓN SIA7 (NAMESPACE HARDENED)
// ==========================================
window.SIA7 = window.SIA7 || {};

Object.assign(window.SIA7, {
    init: initGestiaRender,
    scanQR: toggleEscanerQR,
    abrirModalFormulario,
    guardarNuevoRegistro,
    cerrarModal: () => { SIA7.gestiaStopScan(); document.getElementById('modal-dinamico')?.classList.add('hidden'); },
    gestiaStopScan: async () => {
        if (scannerInstance && scannerRunning) { await scannerInstance.stop(); await scannerInstance.clear(); }
        scannerInstance = null; scannerRunning = false;
        document.querySelectorAll('[id^="reader_"]').forEach(el => el.classList.add('hidden'));
        emitirPulsoHUD("OPTIC", "OFF");
    },
    registrarSalidaBD: async (id, mId) => {
        if (!window.SIA7_READY || !Locks.acquire('sync')) return;
        emitirPulsoHUD("PERSISTENCE", "EXIT_SYNC");
        try { await httpsCallable(functions, 'registrarSalida')({ condominioId: condominioIdActual, moduloId: mId, registroId: id }); }
        catch (e) { emitirPulsoHUD("PERSISTENCE", "EXIT_FAIL"); }
        finally { Locks.release('sync'); }
    },
    registrarSalidaPaquete: async (id, cId) => {
        if (!window.SIA7_READY || !Locks.acquire('package')) return;
        try { await updateDoc(doc(db, "packages", cId, "items", id), { status: "entregado", fecha_entrega: serverTimestamp() }); }
        catch (e) { console.error("PKG_ERROR:", e); }
        finally { Locks.release('package'); }
    },
    filtrarTablaEnVivo: (t) => {
        if (!window.SIA7_READY) return; // 🛡️ Ready Guard
        const term = t.toLowerCase();
        document.querySelectorAll('#tabla-cuerpo tr').forEach(row => row.style.display = row.innerText.toLowerCase().includes(term) ? "" : "none");
    },
    filtrarActivos: (soloActivos) => {
        if (!window.SIA7_READY) return; // 🛡️ Ready Guard
        document.querySelectorAll('#tabla-cuerpo tr').forEach(row => {
            const yaSalio = row.classList.contains('border-l-slate-700');
            row.style.display = (soloActivos && yaSalio) ? "none" : "";
        });
    },
    formatearDetalle: (data) => Object.entries(data).filter(([k]) => !['metadata', 'creado_en'].includes(k)).map(([k, v]) => `${k.toUpperCase()}: ${v}`).join('\n'),
    Lifecycle
});

window.initGestiaRender = initGestiaRender;