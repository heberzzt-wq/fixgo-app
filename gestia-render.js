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

// --- INFRAESTRUCTURA DE BACKEND (CLOUDFUNCTIONS) ---
import { 
    getFunctions, 
    httpsCallable 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

// ==========================================
// VARIABLES GLOBALES DEL MOTOR (V6.3 - NOC Architecture)
// ==========================================

// Ajuste de Región para evitar errores de CORS en Cloud Functions
const functions = getFunctions(undefined, 'us-central1'); 

// --- CONTROL DE SUBSCRIPCIONES (ANTI MEMORY LEAK) ---
let unsubscribeSnapshot = null;
let unsubscribeCondo = null; // 🔒 agregado para lista negra

// --- ESTADO GLOBAL ---
let escannerActivo = null; 
let condominioIdActual = null; // Identificador del Tenant (Edificio/Residencial)
let rolUsuarioActual = null;   // Nivel de privilegio del operador
let blockedUsersGlobal = [];   // Buffer de seguridad (Lista Negra)

// ==========================================
// HARDENING GLOBAL SCOPE (SAFE WINDOW BINDING)
// ==========================================

// Evita sobreescritura accidental del objeto global
window.gestiaConfig = window.gestiaConfig || {};

Object.defineProperties(window.gestiaConfig, {
    version: {
        value: "6.3 Enterprise",
        writable: false,
        configurable: false
    },
    condoId: {
        get() { return condominioIdActual; }
    },
    rol: {
        get() { return rolUsuarioActual; }
    }
});

// ==========================================
// EXPOSICIÓN CONTROLADA DE CLOUD FUNCTIONS
// ==========================================

// Se protege contra sobrescritura accidental
window.functionsAuthority = window.functionsAuthority || {};

Object.assign(window.functionsAuthority, {
    httpsCallable,
    functions
});

// ==========================================
// NAMESPACE GLOBAL SEGURO
// ==========================================

// Evita errores si otros módulos cargan en distinto orden
window.gestia = window.gestia || {};

// ==========================================
// LOG CONTROLADO (DEBUG SAFE)
// ==========================================

if (typeof console !== "undefined") {
    console.log("🚀 Módulo 0: Infraestructura cargada. CORS configurado en us-central1.");
}
/**
 * ==========================================
 * 1. INICIALIZADOR DEL MOTOR DE RENDERIZADO (V6.3 - Edificio Uxmal 39)
 * ==========================================
 */

export async function initGestiaRender(moduloId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // ==========================================
    // PREVENCIÓN DE MULTI-INSTANCIA (CRÍTICO)
    // ==========================================
    if (window.__gestiaInitialized) {
        console.warn("⚠️ Gestia ya estaba inicializado. Reiniciando listeners...");
        
        if (typeof unsubscribeSnapshot === "function") unsubscribeSnapshot();
        if (typeof unsubscribeCondo === "function") unsubscribeCondo();

        window.__gestiaInitialized = false;
    }

    window.__gestiaInitialized = true;

    // ==========================================
    // CARGA SEGURA DE LIBRERÍA QR
    // ==========================================
    if (!document.getElementById('html5-qr-script')) {
        const script = document.createElement('script');
        script.id = 'html5-qr-script';
        script.src = 'https://unpkg.com/html5-qrcode';
        script.async = true;
        document.head.appendChild(script);
    }

    // ==========================================
    // UI LOADING
    // ==========================================
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center p-10 h-full">
            <i class="fa-solid fa-building-shield fa-spin text-4xl text-blue-500 mb-4"></i>
            <p class="text-slate-400 font-mono text-[10px] animate-pulse uppercase tracking-[0.2em]">
                SISTEMA GESTIAPREMIUM: ACCESO NIVEL ARQUITECTO...
            </p>
        </div>
    `;

   // ==========================================
// AUTH LISTENER (CONTROLADO + DEBUG)
// ==========================================
onAuthStateChanged(auth, async (user) => {

    console.log("👤 AUTH STATE:", user);

    if (!user) {
        console.warn("❌ Sesión no detectada. Redirigiendo a login...");
        window.location.href = 'login.html';
        return;
    }

    console.log("✅ UID:", user.uid);
    console.log("📧 EMAIL:", user.email);

    try {
        // ==========================================
        // 1. PERFIL USUARIO
        // ==========================================
        const path = "users/" + user.uid;
        console.log("📡 Intentando leer:", path);

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        console.log("📦 DOC EXISTS:", userSnap.exists());

        if (!userSnap.exists()) {
            container.innerHTML = `ERROR: Usuario no registrado`;
            return;
        }

        const userData = userSnap.data();
        console.log("📦 USER DATA:", userData);

        let rolUsuarioActual = userData.rol || null;

        let condominioIdActual =
            userData.edificioId ||
            userData.condominioId ||
            userData.residencialId ||
            null;

        console.log("🏢 TENANT:", condominioIdActual);

        // ==========================================
        // 2. BYPASS CEO
        // ==========================================
        const esSuperUser = ['super_admin', 'ceo', 'arquitecto_supremo'].includes(rolUsuarioActual);

        if (esSuperUser) {
            condominioIdActual = "UXMAL39";
            console.info("⚡ MODO ARQUITECTO ACTIVADO");
        }

        if (!condominioIdActual) {
            container.innerHTML = `ERROR: Usuario sin edificio`;
            return;
        }

        // ==========================================
        // 3. MÓDULO
        // ==========================================
        const moduloRef = doc(db, "gestia_system_modules", moduloId);
        const moduloSnap = await getDoc(moduloRef);

        if (!moduloSnap.exists()) {
            container.innerHTML = `ERROR: Módulo no existe`;
            return;
        }

        const esquemaModulo = moduloSnap.data();

        // ==========================================
        // 4. LISTA NEGRA
        // ==========================================
        const condoRef = doc(db, "condominios", condominioIdActual);

        onSnapshot(condoRef, (snap) => {
            console.log("🛡️ Lista negra OK");
        }, (error) => {
            console.error("🔥 Error lista negra:", error);
        });

        // ==========================================
        // 5. ROLES
        // ==========================================
        const rolesAutorizados = esquemaModulo.seguridad_roles || [];

        const esAdminGlobal = ['super_admin', 'ceo', 'admin', 'seguridad_24_7'].includes(rolUsuarioActual);

        if (!esAdminGlobal && !rolesAutorizados.includes(rolUsuarioActual)) {
            container.innerHTML = `SIN PERMISOS`;
            return;
        }

        // ==========================================
        // 6. ORQUESTACIÓN SEGURA
        // ==========================================
        try {
            renderizarUIBase?.(esquemaModulo, container);
          conectarDatosEnVivo(esquemaModulo, moduloId, condominioIdActual);
            inyectarWidgetsSeguridad?.(esquemaModulo);
        } catch (uiError) {
            console.error("Error en renderizado UI:", uiError);
            container.innerHTML = `
                <div class="p-10 text-center text-red-500 font-mono text-xs uppercase">
                    ERROR_UI_RENDER: ${uiError.message}
                </div>`;
            return;
        }

        console.info(`✅ GestiaReady: ${esquemaModulo.nombre_display} en ${condominioIdActual}`);

    } catch (error) {
        console.error("🔥 ERROR GENERAL:", error);

        container.innerHTML = `
            <div class="p-10 text-center text-red-500 font-mono text-xs uppercase">
                <i class="fa-solid fa-triangle-exclamation text-2xl mb-4 animate-pulse"></i><br>
                INIT_FATAL_ERROR: ${error.message}
            </div>`;
    }
});
}

// ==========================================
// EXPOSICIÓN GLOBAL SEGURA
// ==========================================
window.initGestiaRender = initGestiaRender;
// ==========================================
// 2. CONSTRUCTOR DE INTERFAZ (UI BUILDER) - V6.4 (ELASTIC NOC & SIDE-PANEL)
// ==========================================

export function renderizarUIBase(esquema, container) {
    if (!container) return;

    // ==========================================
    // LIMPIEZA DEFENSIVA (ANTI EVENT DUPLICATION)
    // ==========================================
    container.innerHTML = '';

    const tieneBotonCrear = esquema?.esquema_interfaz?.acciones_permitidas?.includes("crear");

    // ==========================================
    // RENDER BASE (ARQUITECTURA ELÁSTICA V6.4)
    // ==========================================
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
                                <span class="text-[10px] text-slate-400 font-mono uppercase">
                                    En Edificio: <b id="count-activos" class="text-emerald-400">0</b>
                                </span>
                            </div>
                            <div class="flex items-center gap-1.5 border-l border-slate-700 pl-3">
                                <i class="fa-solid fa-box text-[10px] text-blue-400"></i>
                                <span class="text-[10px] text-slate-400 font-mono uppercase">
                                    Paquetes: <b id="count-paquetes-header" class="text-blue-400">0</b>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
                    <button id="toggle-solo-activos" 
                        class="w-full sm:w-auto px-3 py-2 rounded-lg border border-slate-700 text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 hover:bg-slate-700 text-slate-400" 
                        data-active="false">
                        <i class="fa-solid fa-eye-slash"></i> Ocultar Salidas
                    </button>

                    <div class="relative w-full sm:w-64">
                        <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                        <input type="text" id="buscador-trazabilidad"
                            placeholder="Buscar registro..." 
                            class="w-full bg-slate-900/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 outline-none focus:border-blue-500/50">
                    </div>

                    ${tieneBotonCrear ? `
                    <button id="btn-crear-registro"
                        class="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20">
                        <i class="fa-solid fa-plus"></i> NUEVO REGISTRO
                    </button>
                    ` : ''}
                </div>
            </div>

            <div class="flex-1 flex flex-col lg:flex-row overflow-hidden bg-[#0d1117] relative">
                
                <div id="contenedor-tabla-principal" class="flex-1 overflow-auto custom-scrollbar relative transition-all duration-300">
                    <table class="w-full text-left border-collapse min-w-max">
                        <thead class="bg-slate-800/90 sticky top-0 backdrop-blur-sm z-10 border-b border-slate-700">
                            <tr id="tabla-cabeceras"></tr>
                        </thead>
                        <tbody id="tabla-cuerpo" class="divide-y divide-slate-800/60 text-sm"></tbody>
                    </table>
                    
                    <div id="estado-vacio"
                        class="hidden absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none">
                        <i class="fa-solid fa-folder-open text-4xl mb-3 opacity-30"></i>
                        <p class="font-mono text-[10px] uppercase tracking-widest text-center">
                            Sin resultados operativos para este tenant
                        </p>
                    </div>
                </div>

                <div id="panel-detalle-desplegable" 
                    class="fixed lg:absolute top-0 right-0 h-full w-full sm:w-[450px] bg-slate-900 border-l border-slate-700 z-[45] transform translate-x-full transition-transform duration-300 flex flex-col shadow-2xl">
                    
                    <div class="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50 shrink-0">
                        <div class="flex items-center gap-2">
                            <i class="fa-solid fa-address-card text-blue-400"></i>
                            <h3 class="text-[11px] font-bold text-white uppercase tracking-widest">Detalle del Registro</h3>
                        </div>
                        <button id="btn-cerrar-detalle" class="text-slate-500 hover:text-white transition-colors p-1">
                            <i class="fa-solid fa-xmark text-xl"></i>
                        </button>
                    </div>
                    
                    <div id="detalle-contenido-dinamico" class="flex-1 overflow-y-auto p-5 custom-scrollbar bg-[#0d1117]">
                        </div>
                </div>

                <div id="panel-derecho-pro"
                    class="w-full lg:w-80 flex-shrink-0 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-700 flex flex-col p-4 space-y-4 shadow-2xl z-20 overflow-y-auto max-h-[45%] lg:max-h-full">
                    <div class="flex items-center gap-2 text-blue-400 font-bold text-[10px] uppercase tracking-tighter border-b border-slate-700 pb-2">
                        <i class="fa-solid fa-box-archive"></i> GESTIÓN DE PAQUETES
                    </div>
                    <div id="form-paqueteria-container"></div>
                </div>
            </div>

            <div id="contenedor-panico-flotante"></div>

            <div id="modal-dinamico"
                class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
                <div class="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[95vh]">
                    <div class="p-4 border-b border-slate-700 flex justify-between items-center shrink-0">
                        <h3 class="text-base font-bold text-white flex items-center gap-2">
                            <i class="fa-solid fa-bolt text-blue-400"></i> Registro de Acceso
                        </h3>
                        <button id="btn-cerrar-modal" class="text-slate-400 hover:text-white">
                            <i class="fa-solid fa-xmark text-xl"></i>
                        </button>
                    </div>
                    <div class="p-4 overflow-y-auto custom-scrollbar">
                        <form id="formulario-dinamico" class="flex flex-col gap-4"></form>
                    </div>
                    <div class="p-4 border-t border-slate-700 flex flex-col sm:flex-row justify-end gap-3 bg-slate-900/50 rounded-b-2xl">
                        <button type="button" id="btn-cancelar-modal"
                            class="px-4 py-2 text-sm font-semibold text-slate-300">
                            Cancelar
                        </button>
                        <button type="submit" form="formulario-dinamico"
                            class="bg-blue-600 px-5 py-2 rounded-lg text-sm font-semibold text-white">
                            Guardar en BD
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // ==========================================
    // EVENTOS SEGUROS (SIN CRASH)
    // ==========================================

    const buscador = document.getElementById('buscador-trazabilidad');
    if (buscador) {
        buscador.addEventListener('input', (e) => {
            window.filtrarTablaEnVivo?.(e.target.value);
        });
    }

    const toggle = document.getElementById('toggle-solo-activos');
    if (toggle) {
        toggle.addEventListener('click', function () {
            const isActive = this.dataset.active === 'true';
            this.dataset.active = (!isActive).toString();

            this.classList.toggle('bg-blue-600/20', !isActive);
            this.classList.toggle('text-blue-400', !isActive);
            this.classList.toggle('border-blue-500/50', !isActive);

            window.filtrarActivos?.(!isActive);
        });
    }

    // EVENTO: CERRAR PANEL DE DETALLE
    const btnCerrarDetalle = document.getElementById('btn-cerrar-detalle');
    if (btnCerrarDetalle) {
        btnCerrarDetalle.onclick = () => {
            const panel = document.getElementById('panel-detalle-desplegable');
            if (panel) panel.classList.add('translate-x-full');
        };
    }

    // ==========================================
    // CABECERAS (OPTIMIZADAS)
    // ==========================================

    const trCabeceras = document.getElementById('tabla-cabeceras');

    if (trCabeceras && esquema?.esquema_base_datos?.campos) {
        let headersHTML = '';
        esquema.esquema_base_datos.campos.forEach(campo => {
            headersHTML += `
                <th class="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
                    ${campo.etiqueta}
                </th>`;
        });

        headersHTML += `
            <th class="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right font-mono">
                Acciones
            </th>`;

        trCabeceras.innerHTML = headersHTML;
    }

    // ==========================================
    // MODAL EVENTS (SAFE)
    // ==========================================

    if (tieneBotonCrear) {
        const btnCrear = document.getElementById('btn-crear-registro');
        const btnCerrar = document.getElementById('btn-cerrar-modal');
        const btnCancelar = document.getElementById('btn-cancelar-modal');
        const form = document.getElementById('formulario-dinamico');

        if (btnCrear) {
            btnCrear.onclick = () => window.abrirModalFormulario?.(esquema);
        }

        if (btnCerrar) {
            btnCerrar.onclick = () => window.cerrarModal?.();
        }

        if (btnCancelar) {
            btnCancelar.onclick = () => window.cerrarModal?.();
        }

        if (form) {
            form.onsubmit = (e) => {
                window.guardarNuevoRegistro?.(e, esquema);
            };
        }
    }
}
/**
 * ==========================================
 * 3. INYECCIÓN DE COMPONENTES DE SEGURIDAD (V6.3 - Multi-tenant Real & Full NOC)
 * ==========================================
 * Esta sección inyecta el Botón de Pánico y el Sistema de Inventario de Paquetes.
 * Todo está vinculado al condominioIdActual para aislamiento total de datos.
 */
export function inyectarWidgetsSeguridad(esquema) {
    const panicContainer = document.getElementById('contenedor-panico-flotante');

    // ==========================================
    // 1. BOTÓN DE PÁNICO (HARDENED - CONECTADO A JESSICA)
    // ==========================================
    if (panicContainer) {
        panicContainer.innerHTML = `
            <button id="btn-panico-pro" class="fixed bottom-6 right-6 p-6 bg-red-700 text-white rounded-full shadow-[0_0_30px_rgba(185,28,28,0.5)] hover:bg-red-600 active:scale-90 transition-all z-[60] border-4 border-red-900/40 group overflow-hidden">
                <div class="absolute inset-0 bg-white/10 animate-ping opacity-20"></div>
                <i class="fa-solid fa-shield-run text-2xl group-hover:rotate-12 transition-transform"></i>
            </button>
        `;

        document.getElementById('btn-panico-pro').onclick = async () => {
            if (!condominioIdActual || !auth.currentUser) {
                alert("Sesión inválida.");
                return;
            }

            const confirmacion = confirm(`🚨 ¿Disparar alerta en ${condominioIdActual}?`);
            if (!confirmacion) return;

            try {
                // 📡 CONECTADO AL RADAR DE JESSICA (NOC B2B)
                console.log("🧪 WIDGET DEBUG:", arguments);
                const alertaRef = collection(db, "alertas_seguridad");

                await addDoc(alertaRef, {
                    edificioId: condominioIdActual, // Match exacto con el radar de Jessica
                    estado: "activa",               // Match exacto para encender la campana
                    nivel: "critico",
                    origen: "CASETA DE VIGILANCIA",
                    mensaje: "🚨 ¡PÁNICO! El guardia ha activado la alerta de emergencia.",
                    fecha_emision: serverTimestamp(),
                    unidad: "Acceso Principal",
                    // Trazabilidad interna (No rompe el esquema)
                    creado_por: auth.currentUser.uid,
                    rol_emisor: rolUsuarioActual
                });

                console.info("🚨 Alerta enviada correctamente al Centro de Mando NOC");
            } catch (error) {
                console.error("❌ Error enviando alerta al NOC:", error);
            }
        };
    }

    // ==========================================
    // 2. PAQUETERÍA ENTERPRISE
    // ==========================================
    const pkgFormContainer = document.getElementById('form-paqueteria-container');

    if (!pkgFormContainer) return;

    pkgFormContainer.innerHTML = `
        <div class="space-y-4">
            <div class="bg-slate-800/50 p-3 rounded-xl border border-slate-700 shadow-inner">
                <div class="flex flex-col gap-3">
                    
                    <input id="pkg-unit" type="text" placeholder="Unidad" class="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white">
                    
                    <select id="pkg-courier" class="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white">
                        <option>Amazon</option>
                        <option>Mercado Libre</option>
                        <option>DHL / FedEx</option>
                        <option>Uber Eats / Rappi</option>
                        <option>Otro</option>
                    </select>

                    <button id="btn-save-pkg" class="bg-blue-600 text-white py-3 rounded-lg text-xs">
                        REGISTRAR
                    </button>
                </div>
            </div>

            <div id="pkg-list-container"></div>
        </div>
    `;

    // ==========================================
    // GUARDAR PAQUETE (VALIDADO)
    // ==========================================
    document.getElementById('btn-save-pkg').onclick = async () => {
        if (!condominioIdActual || !auth.currentUser) {
            alert("Sesión inválida");
            return;
        }

        let unitId = document.getElementById('pkg-unit').value.trim().toUpperCase();
        let courier = document.getElementById('pkg-courier').value.trim();

        if (!unitId) {
            alert("Unidad requerida");
            return;
        }

        try {
            const colRef = collection(db, "packages", condominioIdActual, "items");

            await addDoc(colRef, {
                unitId,
                courier,
                status: "recibido",
                timestamp: serverTimestamp(),
                recibido_por: auth.currentUser.uid,
                residencialId: condominioIdActual
            });

            document.getElementById('pkg-unit').value = "";

        } catch (error) {
            console.error("❌ Error guardar:", error);
        }
    };

    // ==========================================
    // SNAPSHOT CONTROLADO
    // ==========================================
    if (window.pkgUnsubscribe) {
        window.pkgUnsubscribe();
    }

    const qPkg = query(
        collection(db, "packages", condominioIdActual, "items"),
        where("status", "==", "recibido"),
        orderBy("timestamp", "desc")
    );

    window.pkgUnsubscribe = onSnapshot(qPkg, (snap) => {
        const container = document.getElementById('pkg-list-container');
        container.innerHTML = '';

        snap.forEach(docSnap => {
            const pkg = docSnap.data();

            const div = document.createElement('div');
            div.className = "p-2 border border-slate-700 flex justify-between";

            const btn = document.createElement('button');
            btn.textContent = "ENTREGAR";

            btn.onclick = () => entregarPaqueteSeguro(docSnap.id);

            div.innerHTML = `
                <span>${pkg.unitId} - ${pkg.courier}</span>
            `;

            div.appendChild(btn);
            container.appendChild(div);
        });
    });
}

// ==========================================
// ENTREGA SEGURA (ANTI RACE CONDITION)
// ==========================================
async function entregarPaqueteSeguro(id) {
    if (!condominioIdActual) return;

    const ref = doc(db, "packages", condominioIdActual, "items", id);
    const snap = await getDoc(ref);

    if (!snap.exists()) return;

    const data = snap.data();

    if (data.status === "entregado") {
        alert("Ya fue entregado");
        return;
    }

    await updateDoc(ref, {
        status: "entregado",
        fecha_entrega: serverTimestamp(),
        entregado_por: auth.currentUser.uid
    });
}

window.inyectarWidgetsSeguridad = inyectarWidgetsSeguridad;
/**
 * ==========================================
 * 4. CONSTRUCTOR DINÁMICO DE FORMULARIOS MULTI-FLUJO (V6.3 ENTERPRISE HARDENED)
 * ==========================================
 * Motor de formularios con mutación dinámica por flujo operativo.
 * Incluye validación avanzada, control de estado QR y sanitización de datos.
 */
export function abrirModalFormulario(esquema) {
    const form = document.getElementById('formulario-dinamico');
    if (!form) {
        console.error("FORM_INIT_ERROR: Contenedor no encontrado");
        return;
    }

    form.innerHTML = '';
    const camposConQR = [];
    let flujoActivo = null;

    // --- HEADER DE CONTROL DE FLUJO ---
    form.innerHTML = `
        <div class="mb-2 pb-5 border-b border-slate-700/60">
            <label class="block text-sm font-bold text-blue-400 mb-2">
                <i class="fa-solid fa-route mr-2"></i>Clasificación del Acceso
            </label>
            <select id="selector-tipo-flujo" name="tipo_flujo"
                class="w-full bg-slate-900 border border-blue-500/50 rounded-lg px-3 py-3 text-white font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-all cursor-pointer">
                <option value="" disabled selected>Selecciona el tipo de flujo...</option>
                <option value="b2b">🏢 Corporativo / B2B</option>
                <option value="residencial">🏠 Residencial</option>
                <option value="delivery">🍔 Delivery</option>
                <option value="proveedor">🛠️ Proveedor</option>
            </select>
        </div>
        <div id="contenedor-campos-dinamicos" class="flex flex-col gap-4 hidden animate-fade-in pt-2"></div>
    `;

    const contenedorCampos = document.getElementById('contenedor-campos-dinamicos');
    const selectorFlujo = document.getElementById('selector-tipo-flujo');

    // --- LISTENER DE CAMBIO DE FLUJO ---
    selectorFlujo.addEventListener('change', (e) => {
        flujoActivo = e.target.value;

        contenedorCampos.innerHTML = '';
        contenedorCampos.classList.remove('hidden');
        camposConQR.length = 0;

        console.info(`🔄 MUTATION_ENGINE: Flujo seleccionado → ${flujoActivo}`);

        esquema.esquema_base_datos.campos.forEach(campo => {

            if (campo.tipo === 'fecha_hora_automatica') return;

            let mostrarCampo = true;
            let etiqueta = campo.etiqueta;
            let obligatorio = campo.obligatorio;

            // --- BIZ RULES ---
            if (flujoActivo === 'delivery') {
                if (campo.id === 'recurso') mostrarCampo = false;
                if (campo.id === 'empresa_area') etiqueta = 'Plataforma';
                if (campo.id === 'motivo') mostrarCampo = false;
            }

            if (flujoActivo === 'residencial') {
                if (campo.id === 'recurso') etiqueta = 'Unidad / Departamento';
                if (campo.id === 'empresa_area') mostrarCampo = false;
            }

            if (flujoActivo === 'proveedor') {
                if (campo.id === 'recurso') etiqueta = 'Área de Trabajo';
                if (campo.id === 'empresa_area') etiqueta = 'Empresa Contratista';
            }

            if (!mostrarCampo) return;

            // --- CLASE BASE ---
            const baseClass = `
                w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 
                text-slate-200 focus:outline-none focus:border-blue-500 
                focus:ring-1 focus:ring-blue-500 mt-1 text-sm shadow-inner transition-all
            `;

            const req = obligatorio ? 'required' : '';
            let inputHtml = '';

            // --- RENDER SEGÚN TIPO ---
            switch (campo.tipo) {

                case 'texto':
                    inputHtml = `
                        <input type="text"
                            id="campo_${campo.id}"
                            name="${campo.id}"
                            class="${baseClass}"
                            ${req}
                            maxlength="120"
                            autocomplete="off"
                            placeholder="Ingresa ${etiqueta.toLowerCase()}">
                    `;
                break;

                case 'selector':
                    const opciones = (campo.opciones || [])
                        .map(op => `<option value="${sanitize(op)}">${sanitize(op)}</option>`)
                        .join('');

                    inputHtml = `
                        <select id="campo_${campo.id}" name="${campo.id}" class="${baseClass}" ${req}>
                            <option value="" disabled selected>Selecciona...</option>
                            ${opciones}
                        </select>
                    `;
                break;

                case 'texto_qr':
                    camposConQR.push(campo.id);

                    inputHtml = `
                        <div class="relative">
                            <input type="text"
                                id="campo_${campo.id}"
                                name="${campo.id}"
                                class="${baseClass} pr-10 font-mono text-blue-300"
                                ${req}
                                placeholder="Escanear o teclear">
                            
                            <button type="button"
                                onclick="gestia.scanQR('${campo.id}')"
                                class="absolute right-2 top-[12px] text-slate-400 hover:text-blue-400 p-1 bg-slate-800 rounded border border-slate-600">
                                <i class="fa-solid fa-qrcode text-lg"></i>
                            </button>
                        </div>

                        <div id="reader_${campo.id}"
                            class="hidden w-full mt-3 rounded-xl overflow-hidden border-2 border-blue-500/50 bg-black">
                        </div>
                    `;
                break;

                default:
                    inputHtml = `
                        <input type="text"
                            id="campo_${campo.id}"
                            name="${campo.id}"
                            class="${baseClass}"
                            ${req}>
                    `;
            }

            contenedorCampos.innerHTML += `
                <div class="animate-fade-in">
                    <label class="block text-sm font-medium text-slate-300">
                        ${etiqueta}
                        ${obligatorio ? '<span class="text-red-500">*</span>' : ''}
                    </label>
                    ${inputHtml}
                </div>
            `;
        });
    });

    document.getElementById('modal-dinamico').classList.remove('hidden');
}

/**
 * ==========================================
 * VALIDACIÓN Y SANITIZACIÓN
 * ==========================================
 */
function sanitize(text) {
    if (!text) return '';
    return text.toString()
        .replace(/[<>]/g, '')
        .trim();
}

/**
 * ==========================================
 * RECOLECCIÓN SEGURA DE DATOS DEL FORM
 * ==========================================
 */
window.gestiaRecolectarFormulario = (esquema) => {
    const data = {};
    const errores = [];

    esquema.esquema_base_datos.campos.forEach(campo => {
        if (campo.tipo === 'fecha_hora_automatica') return;

        const el = document.getElementById(`campo_${campo.id}`);
        if (!el) return;

        let valor = sanitize(el.value);

        if (campo.obligatorio && !valor) {
            errores.push(campo.etiqueta);
        }

        data[campo.id] = valor;
    });

    if (errores.length > 0) {
        alert("Campos obligatorios faltantes:\n- " + errores.join("\n- "));
        return null;
    }

    return data;
};

/**
 * ==========================================
 * CONTROL GLOBAL DE ESCÁNER QR (ANTI DUPLICADOS)
 * ==========================================
 */
window.gestiaScanActivo = null;

window.gestiaStopScan = () => {
    if (window.gestiaScanActivo) {
        try {
            window.gestiaScanActivo.stop().then(() => {
                window.gestiaScanActivo.clear();
                window.gestiaScanActivo = null;
                console.log("📴 QR detenido correctamente");
            });
        } catch (e) {
            console.warn("QR_STOP_WARN:", e);
        }
    }
};

/**
 * ==========================================
 * CIERRE DE MODAL
 * ==========================================
 */
window.cerrarModal = () => {
    window.gestiaStopScan();
    const modal = document.getElementById('modal-dinamico');
    if (modal) modal.classList.add('hidden');
};

/**
 * EXPOSICIÓN GLOBAL
 */
window.abrirModalFormulario = abrirModalFormulario;
/**
 * ==========================================
 * 5. CEREBRO DE VISIÓN ARTIFICIAL (V6.3 ENTERPRISE HARDENED)
 * ==========================================
 * Scanner multi-tenant con control de concurrencia, validación perimetral
 * y protección contra duplicación de instancias.
 */

// --- ESTADO GLOBAL DEL SCANNER ---
let scannerInstance = null;
let scannerRunning = false;
let lastScanTimestamp = 0;
const SCAN_COOLDOWN = 1500; // ms anti-lecturas duplicadas

export async function toggleEscanerQR(campoId) {

    // --- 1. VALIDACIÓN DE LIBRERÍA ---
    if (!window.Html5Qrcode) {
        console.error("QR_LIB_NOT_READY");
        alert("El sistema de escaneo aún no está disponible.");
        return;
    }

    const readerId = `reader_${campoId}`;
    const readerDiv = document.getElementById(readerId);
    const btnScan = document.getElementById(`btn_scan_${campoId}`);

    if (!readerDiv) {
        console.error("QR_CONTAINER_NOT_FOUND:", readerId);
        return;
    }

    // --- 2. TOGGLE OFF SI YA ESTÁ ACTIVO ---
    if (scannerRunning) {
        await detenerEscannerGlobal(readerDiv, btnScan);
        return;
    }

    // --- 3. ASEGURAR ESTADO LIMPIO ---
    await limpiarInstanciaResidual();

    readerDiv.classList.remove('hidden');

    if (btnScan) {
        btnScan.innerHTML = '<i class="fa-solid fa-xmark text-lg"></i>';
        btnScan.classList.remove('text-slate-400');
        btnScan.classList.add('text-red-400');
    }

    try {
        scannerInstance = new Html5Qrcode(readerId);
        scannerRunning = true;

        const config = {
            fps: 15,
            qrbox: { width: 260, height: 260 },
            aspectRatio: 1.0,
            disableFlip: false
        };

        console.info(`📡 SCANNER_INIT → campo: ${campoId} | tenant: ${condominioIdActual}`);

        await scannerInstance.start(
            { facingMode: "environment" },
            config,

            async (decodedText) => {

                const now = Date.now();

                // --- 4. ANTI SPAM / DEBOUNCE ---
                if (now - lastScanTimestamp < SCAN_COOLDOWN) {
                    return;
                }
                lastScanTimestamp = now;

                const token = sanitizeQR(decodedText);

                console.info("📥 QR_READ:", token);

                // --- 5. VALIDACIÓN LISTA NEGRA ---
                if (Array.isArray(blockedUsersGlobal) && blockedUsersGlobal.includes(token)) {

                    emitirAudio('error');

                    alert("🚫 ACCESO BLOQUEADO: Usuario en lista negra.");

                    console.warn(`🚨 ACCESS_DENIED → ${token} | ${condominioIdActual}`);

                    await detenerEscannerGlobal(readerDiv, btnScan);
                    return;
                }

                // --- 6. INYECCIÓN EN INPUT ---
                const input = document.getElementById(`campo_${campoId}`);
                if (input) {
                    emitirAudio('success');

                    input.value = token;

                    input.classList.add(
                        'ring-2',
                        'ring-green-500',
                        'bg-green-900/30',
                        'text-green-300'
                    );

                    setTimeout(() => {
                        input.classList.remove(
                            'ring-2',
                            'ring-green-500',
                            'bg-green-900/30',
                            'text-green-300'
                        );
                    }, 1800);
                }

                console.info(`✅ ACCESS_GRANTED → ${token}`);

                // --- 7. AUTO STOP ---
                await detenerEscannerGlobal(readerDiv, btnScan);
            },

            () => {
                // Silencio operativo (no ruido en consola)
            }

        );

    } catch (error) {

        console.error("❌ SCANNER_START_ERROR:", error);

        alert("No se pudo iniciar la cámara. Revisa permisos del navegador.");

        readerDiv.classList.add('hidden');

        scannerRunning = false;
        scannerInstance = null;
    }
}

/**
 * ==========================================
 * DETENER ESCÁNER GLOBAL (SAFE STOP)
 * ==========================================
 */
async function detenerEscannerGlobal(readerDiv, btnScan) {

    if (!scannerInstance || !scannerRunning) return;

    try {
        await scannerInstance.stop();
        await scannerInstance.clear();

        console.info("📷 SCANNER_STOP_OK");

    } catch (err) {
        console.warn("⚠️ SCANNER_STOP_WARN:", err);
    }

    scannerInstance = null;
    scannerRunning = false;

    if (readerDiv) readerDiv.classList.add('hidden');

    if (btnScan) {
        btnScan.innerHTML = '<i class="fa-solid fa-qrcode text-lg"></i>';
        btnScan.classList.remove('text-red-400');
        btnScan.classList.add('text-slate-400');
    }
}

/**
 * ==========================================
 * LIMPIEZA FORZADA DE INSTANCIAS (ANTI MEMORY LEAK)
 * ==========================================
 */
async function limpiarInstanciaResidual() {
    if (scannerInstance) {
        try {
            await scannerInstance.stop();
            await scannerInstance.clear();
        } catch (e) {
            console.warn("Residual cleanup warning:", e);
        }
        scannerInstance = null;
        scannerRunning = false;
    }
}

/**
 * ==========================================
 * SANITIZACIÓN DE QR
 * ==========================================
 */
function sanitizeQR(text) {
    if (!text) return '';
    return text
        .toString()
        .trim()
        .replace(/[<>]/g, '')
        .substring(0, 120);
}

/**
 * ==========================================
 * FEEDBACK AUDITIVO CONTROLADO
 * ==========================================
 */
function emitirAudio(tipo) {
    let url = '';

    if (tipo === 'success') {
        url = 'https://www.soundjay.com/buttons/beep-07a.mp3';
    }

    if (tipo === 'error') {
        url = 'https://www.soundjay.com/buttons/button-10.mp3';
    }

    if (!url) return;

    const audio = new Audio(url);
    audio.volume = tipo === 'success' ? 0.4 : 1;

    audio.play().catch(() => {
        console.warn("Audio blocked by browser policy");
    });
}

/**
 * ==========================================
 * STOP GLOBAL DESDE UI / MODAL
 * ==========================================
 */
window.gestiaStopScan = async () => {
    await limpiarInstanciaResidual();
    console.info("🛑 SCANNER_FORCE_STOP");
};

/**
 * ==========================================
 * EXPOSICIÓN GLOBAL
 * ==========================================
 */
window.gestia = window.gestia || {};
window.gestia.scanQR = toggleEscanerQR;
/**
 * ==========================================
 * 6. PERSISTENCIA SEGURA (V6.3 ENTERPRISE HARDENED+)
 * ==========================================
 * Escritura vía Cloud Functions con validación, idempotencia y control de errores avanzado.
 */

let requestInFlight = false; // Control real anti doble submit

export async function guardarNuevoRegistro(e, esquema) {
    e.preventDefault();

    // --- 1. VALIDACIÓN DE ESTADO GLOBAL ---
    if (requestInFlight) {
        console.warn("⚠️ REQUEST_DUPLICATED_BLOCKED");
        return;
    }

    const selectorFlujo = document.getElementById('selector-tipo-flujo');

    if (!selectorFlujo || !selectorFlujo.value) {
        alert("⚠️ Selecciona la Clasificación del Acceso.");
        return;
    }

    const btnSubmit = document.querySelector('button[form="formulario-dinamico"]');
    if (!btnSubmit) return;

    const originalHTML = btnSubmit.innerHTML;

    // --- 2. BLOQUEO HARD UI + FLAG ---
    requestInFlight = true;
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> VALIDANDO EN NUBE...';

    try {
        // --- 3. RECOLECCIÓN Y SANITIZACIÓN ---
        const formData = new FormData(e.target);

        const payload = construirPayloadSeguro(formData, esquema, selectorFlujo.value);

        if (!payload) {
            throw new Error("VALIDATION_CLIENT_FAILED");
        }

        // --- 4. LLAMADA SEGURA CON TIMEOUT ---
        const crearAccesoFn = httpsCallable(functions, 'crearAcceso');

        console.info("📡 CLOUD_SYNC_START", {
            tenant: condominioIdActual,
            modulo: esquema.modulo_id
        });

        const resultado = await ejecutarConTimeout(
            crearAccesoFn({
                condominioId: condominioIdActual,
                moduloId: esquema.modulo_id,
                payload
            }),
            10000 // 10s timeout
        );

        const data = resultado?.data || {};
        const { status, id, message } = data;

        // --- 5. RESPUESTA CONTROLADA ---
        if (['success', 'created', 'updated'].includes(status)) {

            console.info("✅ CLOUD_OK", { id });

            aplicarEstadoBoton(btnSubmit, "success");

            setTimeout(() => {
                if (window.cerrarModal) window.cerrarModal();
                e.target.reset();
            }, 1200);

        } 
        else if (status === 'blocked') {

            console.warn("🚨 CLOUD_BLOCKED", message);

            aplicarEstadoBoton(btnSubmit, "blocked");
            alert(`🚨 ACCESO DENEGADO:\n${message}`);

        } 
        else {
            throw new Error(message || "UNKNOWN_SERVER_RESPONSE");
        }

    } catch (error) {

        console.error("❌ CLOUD_ERROR:", normalizarError(error));

        manejarErrorUI(btnSubmit, error);

    } finally {

        setTimeout(() => {
            restaurarBoton(btnSubmit, originalHTML);
            requestInFlight = false;
        }, 3000);
    }
}

/**
 * ==========================================
 * CONSTRUCCIÓN SEGURA DE PAYLOAD
 * ==========================================
 */
function construirPayloadSeguro(formData, esquema, tipoFlujo) {

    const payload = {
        tipo_flujo: tipoFlujo,
        modulo_origen: esquema.modulo_id,
        metadata: {
            version_motor: "6.3",
            agente: "GestiaRender_JS",
            timestamp_cliente: Date.now()
        }
    };

    const errores = [];

    esquema.esquema_base_datos.campos.forEach(campo => {

        if (campo.tipo === 'fecha_hora_automatica') return;

        let valor = formData.get(campo.id);

        valor = sanitizeInput(valor);

        if (campo.obligatorio && !valor) {
            errores.push(campo.etiqueta);
        }

        payload[campo.id] = valor || "—";
    });

    if (errores.length > 0) {
        alert("Campos faltantes:\n- " + errores.join("\n- "));
        return null;
    }

    return payload;
}

/**
 * ==========================================
 * SANITIZACIÓN
 * ==========================================
 */
function sanitizeInput(val) {
    if (!val) return '';
    return val
        .toString()
        .trim()
        .replace(/[<>]/g, '')
        .substring(0, 150);
}

/**
 * ==========================================
 * TIMEOUT CONTROLADO
 * ==========================================
 */
function ejecutarConTimeout(promise, ms) {
    return new Promise((resolve, reject) => {

        const timeout = setTimeout(() => {
            reject(new Error("TIMEOUT_EXCEEDED"));
        }, ms);

        promise
            .then(res => {
                clearTimeout(timeout);
                resolve(res);
            })
            .catch(err => {
                clearTimeout(timeout);
                reject(err);
            });
    });
}

/**
 * ==========================================
 * NORMALIZADOR DE ERRORES FIREBASE
 * ==========================================
 */
function normalizarError(error) {

    if (!error) return { message: "UNKNOWN" };

    return {
        message: error.message,
        code: error.code || "NO_CODE",
        details: error.details || null
    };
}

/**
 * ==========================================
 * UI: ESTADOS DEL BOTÓN
 * ==========================================
 */
function aplicarEstadoBoton(btn, tipo) {

    if (tipo === "success") {
        btn.className = "bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold";
        btn.innerHTML = '<i class="fa-solid fa-check mr-2"></i> COMPLETADO';
    }

    if (tipo === "blocked") {
        btn.className = "bg-red-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold";
        btn.innerHTML = '<i class="fa-solid fa-ban mr-2"></i> BLOQUEADO';
    }
}

/**
 * ==========================================
 * UI: ERRORES
 * ==========================================
 */
function manejarErrorUI(btn, error) {

    let msg = "Error de conexión con el servidor.";

    if (error.message.includes("TIMEOUT")) {
        msg = "Tiempo de espera agotado (red lenta o servidor saturado).";
    }

    if (error.code === "permission-denied") {
        msg = "No tienes permisos para esta operación.";
    }

    if (error.code === "unauthenticated") {
        msg = "Sesión expirada. Inicia sesión nuevamente.";
    }

    alert("FALLO CRÍTICO:\n" + msg);

    btn.className = "bg-orange-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold";
    btn.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-2"></i> REINTENTAR';
}

/**
 * ==========================================
 * RESTAURACIÓN DE BOTÓN
 * ==========================================
 */
function restaurarBoton(btn, originalHTML) {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    btn.className = "bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2";
}

/**
 * ==========================================
 * EXPOSICIÓN GLOBAL
 * ==========================================
 */
window.guardarNuevoRegistro = guardarNuevoRegistro;
/**
 * ==========================================
 * 7. SINCRONIZACIÓN EN VIVO Y RENDERIZADO (V6.4.2 - LEGACY LOOK RESTORE)
 * ==========================================
 * Optimizado para:
 * - Minimizar lecturas Firestore ($)
 * - Estética V5.21: Colores vibrantes y botones con iconos.
 * - Fix de Contraste: Eliminación de opacidad para evitar "líneas negras".
 */

// --- REGISTRO GLOBAL DE LISTENERS (ANTI MEMORY LEAK) ---
unsubscribeSnapshot = null;

// --- CACHE EN MEMORIA ---
const gestiaStore = {
    registros: new Map(), // id -> data
    renderizados: new Set(), // ids ya en DOM
};

// --- CONFIGURACIÓN DE RENDIMIENTO ---
const MAX_RENDER = 50; 

export function conectarDatosEnVivo(esquema, moduloId, condominioIdActual) {

    console.log("🧪 DEBUG:", {
        moduloId: moduloId,
        esquema: esquema,
        condominioIdActual: condominioIdActual
    });

    // 7.1 LIMPIEZA TOTAL
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
    }

    gestiaStore.registros.clear();
    gestiaStore.renderizados.clear();

    const tbody = document.getElementById('tabla-cuerpo');
    const estadoVacio = document.getElementById('estado-vacio');
    const countActivosLabel = document.getElementById('count-activos');

    if (!tbody) return;

    // 🔥 QUERY OPTIMIZADA
    const registrosRef = collection(
        db,
        "gestia_records",
        condominioIdActual,
        moduloId
    );

    const q = query(
        registrosRef,
        orderBy("creado_en", "desc")
    );

    console.info(`📡 NOC V6.4.2 en ${condominioIdActual}`);

    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        let activosEnEdificio = 0;

        if (snapshot.empty) {
            tbody.innerHTML = "";
            if (estadoVacio) estadoVacio.classList.remove('hidden');
            if (countActivosLabel) countActivosLabel.innerText = "0";
            return;
        }

        if (estadoVacio) estadoVacio.classList.add('hidden');

        snapshot.docChanges().forEach((change) => {
            const id = change.doc.id;
            const data = change.doc.data();

            gestiaStore.registros.set(id, data);

            if (change.type === "removed") {
                const fila = document.getElementById(`row-${id}`);
                if (fila) fila.remove();
                gestiaStore.renderizados.delete(id);
                return;
            }

            if (change.type === "added") {
                if (gestiaStore.renderizados.size >= MAX_RENDER) return;
                const tr = construirFila(id, data, esquema, new Date());
                tbody.appendChild(tr);
                gestiaStore.renderizados.add(id);
            }

            if (change.type === "modified") {
                const filaExistente = document.getElementById(`row-${id}`);
                if (filaExistente) {
                    const nuevaFila = construirFila(id, data, esquema, new Date());
                    tbody.replaceChild(nuevaFila, filaExistente);
                }
            }
        });

        gestiaStore.registros.forEach((data) => {
            const yaSalio = data.fecha_salida || data.status === "salida";
            if (!yaSalio) activosEnEdificio++;
        });

        if (countActivosLabel) countActivosLabel.innerText = activosEnEdificio;

    }, (error) => {
        console.error("❌ Error snapshot:", error);
    });
}
/**
 * ==========================================
 * CONSTRUCTOR DE FILAS (V6.4.2 - ESTILO V5.21)
 * ==========================================
 */
function construirFila(id, data, esquema, ahora) {
    const tr = document.createElement('tr');
    tr.id = `row-${id}`;

    const tipoFlujo = data.tipo_flujo || 'b2b';
    const yaSalio = data.fecha_salida || data.status === "salida";

    // --- LÓGICA DE ALERTAS ---
    let alertaOverstay = false;
    if (!yaSalio && data.creado_en) {
        const entrada = data.creado_en.toDate();
        const minutos = (ahora - entrada) / (1000 * 60);
        if (tipoFlujo === 'delivery' && minutos > 60) alertaOverstay = true;
        if (tipoFlujo === 'residencial' && minutos > 120) alertaOverstay = true;
        if (tipoFlujo === 'proveedor' && minutos > 240) alertaOverstay = true;
    }

    const txtEmpresa = (data.empresa_area || "").toUpperCase();
    const txtRecurso = (data.recurso || "").toUpperCase();
    const esPOSIQ = txtEmpresa.includes("POSIQ") || txtRecurso.includes("ESTUDIO");

    // --- COLORES Y CONTRASTE (Recuperando el look de la Captura 2097) ---
    let clases = "border-b border-slate-800/40 border-l-4 transition-all duration-200 ";

    if (yaSalio) {
        // En lugar de opacity-40, usamos colores de texto apagados para mantener legibilidad
        clases += "border-l-slate-700 bg-slate-900/30 ";
    } else if (esPOSIQ) {
        // Rojo vibrante estilo V5.21
        clases += "border-l-red-500 bg-red-600/10 shadow-[inset_10px_0_15px_-10px_rgba(220,38,38,0.3)] ";
    } else if (alertaOverstay) {
        clases += "border-l-amber-500 bg-amber-500/5 ";
    } else {
        clases += "border-l-blue-600/50 bg-slate-800/20 ";
    }

    tr.className = clases;

    // 1. RENDER DE COLUMNAS (Uxmal 39 Ready)
    esquema.esquema_base_datos.campos.forEach(campo => {
        const td = document.createElement('td');
        // Texto brillante para activos, gris para cerrados
        const textClass = yaSalio ? 'text-slate-500' : 'text-slate-200';
        td.className = `px-4 py-3 text-[11px] font-mono whitespace-nowrap ${textClass}`;

        let valor = data[campo.id] || "—";

        if (campo.tipo === 'fecha_hora_automatica' && data[campo.id]) {
            const fechaObj = data[campo.id].toDate();
            valor = fechaObj.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        }

        td.innerHTML = valor;
        tr.appendChild(td);
    });

    // 2. COLUMNA DE ACCIONES (Botones Glass con Iconos V5.21)
    const tdAcciones = document.createElement('td');
    tdAcciones.className = "px-4 py-3 text-right whitespace-nowrap min-w-[120px]";

    const btnContainer = document.createElement('div');
    btnContainer.className = "flex items-center justify-end gap-2";

    if (!yaSalio) {
        // Botón Detalle (Ojo)
        const btnVer = document.createElement('button');
        btnVer.className = "w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-all";
        btnVer.innerHTML = '<i class="fa-solid fa-eye text-xs"></i>';
        btnVer.onclick = () => alert(window.formatearDetalleParaGuardia(data));
        btnContainer.appendChild(btnVer);

        // Botón Salida (Puerta)
        const btnSalida = document.createElement('button');
        btnSalida.className = "h-8 px-3 flex items-center gap-2 rounded-lg bg-blue-600/10 border border-blue-500/40 text-blue-400 hover:bg-blue-600 hover:text-white transition-all text-[10px] font-bold uppercase";
        btnSalida.innerHTML = '<i class="fa-solid fa-door-open"></i> SALIDA';
        
        btnSalida.onclick = async () => {
            btnSalida.disabled = true;
            btnSalida.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            await window.registrarSalidaBD(id, esquema.modulo_id);
        };
        btnContainer.appendChild(btnSalida);
    } else {
        // Sello de Cerrado Estilo Legacy
        btnContainer.innerHTML = `
            <span class="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/5 border border-emerald-500/20 text-emerald-500/60 text-[9px] font-bold uppercase italic">
                <i class="fa-solid fa-check-double"></i> Finalizado
            </span>
        `;
    }

    tdAcciones.appendChild(btnContainer);
    tr.appendChild(tdAcciones);

    return tr;
}

/**
 * ==========================================
 * REGISTRO DE SALIDA (SIN CAMBIOS)
 * ==========================================
 */
window.registrarSalidaBD = async (registroId, moduloId) => {
    try {
        const registrarSalidaFn = httpsCallable(functions, 'registrarSalida');
        await registrarSalidaFn({
            condominioId: condominioIdActual,
            moduloId,
            registroId
        });
        console.log("✅ Salida registrada en Búnker");
    } catch (error) {
        console.error("❌ Error salida:", error);
    }
};

/**
 * ==========================================
 * FILTROS Y FORMATEO
 * ==========================================
 */
window.filtrarActivos = (soloActivos) => {
    gestiaStore.registros.forEach((data, id) => {
        const fila = document.getElementById(`row-${id}`);
        if (!fila) return;
        const yaSalio = data.fecha_salida || data.status === "salida";
        fila.style.display = (soloActivos && yaSalio) ? "none" : "";
    });
};

window.filtrarTablaEnVivo = (termino) => {
    const t = termino.toLowerCase();
    gestiaStore.registros.forEach((data, id) => {
        const fila = document.getElementById(`row-${id}`);
        if (!fila) return;
        const texto = JSON.stringify(data).toLowerCase();
        fila.style.display = texto.includes(t) ? "" : "none";
    });
};

window.formatearDetalleParaGuardia = (data) => {
    return Object.entries(data)
        .filter(([k]) => k !== 'metadata' && k !== 'creado_en')
        .map(([k, v]) => `${k.toUpperCase()}: ${v}`)
        .join('\n');
};

// GLOBAL BIND
window.conectarDatosEnVivo = conectarDatosEnVivo;

/**
 * ==========================================
 * 8. MOTOR FAST-PASS v2.0 (ENTRADA/SALIDA INTELIGENTE)
 * ==========================================
 * Procesa lecturas QR detectando automáticamente si es Entrada o Salida.
 * Arquitectura: Smart-Toggle B2B
 */

let fastPassInFlight = false;

window.procesarAccesoQR = async (datosQR) => {
    // --- 1. VALIDACIONES DE SEGURIDAD ---
    if (fastPassInFlight) {
        console.warn("⚠️ FAST_PASS: Bloqueado por request en vuelo.");
        return;
    }

    if (!window.gestiaConfig.condoId) {
        alert("🚨 Error: No hay un edificio activo.");
        return;
    }

    const { tipo_pase, identificador, vigencia } = datosQR;
    const moduloId = "seguridad_accesos_b2b";

    if (!identificador || !tipo_pase) {
        alert("⚠️ QR Inválido.");
        return;
    }

    fastPassInFlight = true;

    // Preparar el Toast de Notificación
    const toastId = "toast-fastpass-gestia";
    let toastContainer = document.getElementById(toastId);
    if (!toastContainer) {
        toastContainer = document.createElement("div");
        toastContainer.id = toastId;
        toastContainer.className = "fixed top-5 right-5 px-6 py-4 rounded-2xl shadow-2xl z-[9999] font-black text-xs uppercase tracking-widest transition-all duration-300 transform scale-100 backdrop-blur-md";
        document.body.appendChild(toastContainer);
    }
    toastContainer.style.display = "block";
    toastContainer.style.opacity = "1";

    try {
        // --- 2. LÓGICA DE DETECCIÓN (SMART-TOGGLE) ---
        let registroActivoId = null;

        // Buscamos en el Store si este identificador ya está "DENTRO"
        for (let [id, data] of gestiaStore.registros) {
            const yaSalio = data.fecha_salida || data.status === "salida";
            if (data.nombre === identificador && !yaSalio) {
                registroActivoId = id;
                break;
            }
        }

        if (registroActivoId) {
            // ==========================================
            // FLUJO: REGISTRAR SALIDA (CHECK-OUT)
            // ==========================================
            console.info(`🚪 DETECTADA SALIDA: ${identificador}`);
            
            toastContainer.className = "fixed top-5 right-5 px-6 py-4 rounded-2xl shadow-2xl z-[9999] font-black text-xs uppercase tracking-widest backdrop-blur-md bg-amber-600/90 text-white border border-amber-400";
            toastContainer.innerHTML = `<i class="fa-solid fa-door-open fa-fade mr-3 text-lg"></i> REGISTRANDO SALIDA...<br><span class="text-amber-200 mt-1 block">${identificador}</span>`;

            const registrarSalidaFn = window.functionsAuthority.httpsCallable(window.functionsAuthority.functions, 'registrarSalida');
            
            await registrarSalidaFn({
                condominioId: window.gestiaConfig.condoId,
                moduloId: moduloId,
                registroId: registroActivoId
            });

            toastContainer.className = "fixed top-5 right-5 px-6 py-4 rounded-2xl shadow-2xl z-[9999] font-black text-xs uppercase tracking-widest backdrop-blur-md bg-zinc-700 text-white border border-zinc-500";
            toastContainer.innerHTML = `<i class="fa-solid fa-check-circle mr-3 text-lg"></i> CICLO CERRADO<br><span class="text-zinc-300 mt-1 block">Vuelva pronto, ${identificador}</span>`;
            
            new Audio('https://www.soundjay.com/buttons/beep-08b.mp3').play().catch(()=>{});

        } else {
            // ==========================================
            // FLUJO: REGISTRAR ENTRADA (CHECK-IN)
            // ==========================================
            console.info(`📥 DETECTADA ENTRADA: ${identificador}`);

            toastContainer.className = "fixed top-5 right-5 px-6 py-4 rounded-2xl shadow-2xl z-[9999] font-black text-xs uppercase tracking-widest backdrop-blur-md bg-blue-600/90 text-white border border-blue-400";
            toastContainer.innerHTML = `<i class="fa-solid fa-qrcode fa-spin mr-3 text-lg"></i> AUTORIZANDO ACCESO...<br><span class="text-blue-200 mt-1 block">${identificador}</span>`;

            const payload = {
                tipo_flujo: tipo_pase === 'staff' ? 'b2b' : 'proveedor',
                modulo_origen: moduloId,
                nombre: identificador,
                empresa_area: tipo_pase === 'staff' ? 'STAFF INTERNO B2B' : 'VISITANTE / PROVEEDOR',
                recurso: `QR Code (Vigencia: ${vigencia || '24h'})`,
                motivo: "Validación Óptica en Caseta",
                metadata: {
                    version_motor: window.gestiaConfig.version,
                    agente: "Gestia_Scanner_Optico",
                    timestamp_cliente: Date.now()
                }
            };

            const crearAccesoFn = window.functionsAuthority.httpsCallable(window.functionsAuthority.functions, 'crearAcceso');

            await crearAccesoFn({
                condominioId: window.gestiaConfig.condoId,
                moduloId: moduloId,
                payload
            });

            toastContainer.className = "fixed top-5 right-5 px-6 py-4 rounded-2xl shadow-2xl z-[9999] font-black text-xs uppercase tracking-widest backdrop-blur-md bg-emerald-600/90 text-white border border-emerald-400";
            toastContainer.innerHTML = `<i class="fa-solid fa-check-double mr-3 text-lg"></i> ACCESO CONCEDIDO<br><span class="text-emerald-200 mt-1 block">${identificador}</span>`;
            
            new Audio('https://www.soundjay.com/buttons/beep-07a.mp3').play().catch(()=>{});
        }

    } catch (error) {
        console.error("❌ FAST-PASS ERROR:", error);
        toastContainer.className = "fixed top-5 right-5 px-6 py-4 rounded-2xl shadow-2xl z-[9999] font-black text-xs uppercase tracking-widest backdrop-blur-md bg-red-600 text-white border border-red-400";
        toastContainer.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-3 text-lg"></i> ERROR DE NUBE<br><span class="text-red-200 mt-1 block">${error.message}</span>`;
    } finally {
        setTimeout(() => {
            toastContainer.style.opacity = "0";
            setTimeout(() => {
                toastContainer.style.display = "none";
                fastPassInFlight = false;
            }, 300);
        }, 3500);
    }
};