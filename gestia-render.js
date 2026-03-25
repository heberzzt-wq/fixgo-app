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
let unsubscribeSnapshot = null;
let escannerActivo = null; 
let condominioIdActual = null; // Identificador del Tenant (Edificio/Residencial)
let rolUsuarioActual = null;   // Nivel de privilegio del operador
let blockedUsersGlobal = [];   // Buffer de seguridad (Lista Negra)

/**
 * FIX: EXPOSICIÓN GLOBAL (ReferenceError Protection)
 * Mapeamos las variables de estado al objeto window para que 
 * los módulos de UI puedan consultarlas sin perder el scope.
 */
window.gestiaConfig = {
    version: "6.3 Enterprise",
    get condoId() { return condominioIdActual; },
    get rol() { return rolUsuarioActual; }
};

// Exponemos funciones de Firebase necesarias para los botones en el HTML (onclick)
window.functionsAuthority = {
    httpsCallable,
    functions
};

console.log("🚀 Módulo 0: Infraestructura cargada. CORS configurado en us-central1.");

/**
 * ==========================================
 * 1. INICIALIZADOR DEL MOTOR DE RENDERIZADO (V6.3 - Edificio Uxmal 39)
 * ==========================================
 * Esta sección valida la identidad del usuario, extrae su residencialId y
 * permite que los roles CEO/SUPER_ADMIN operen con acceso global en UXMAL 39.
 */
export async function initGestiaRender(moduloId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Inyección de librería de visión artificial para QR (Solo si no existe)
    if (!document.getElementById('html5-qr-script')) {
        const script = document.createElement('script');
        script.id = 'html5-qr-script';
        script.src = 'https://unpkg.com/html5-qrcode';
        document.head.appendChild(script);
    }

    // Interfaz de carga estilo Terminal NOC (Diseño Minimalista Enterprise)
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center p-10 h-full">
            <i class="fa-solid fa-building-shield fa-spin text-4xl text-blue-500 mb-4"></i>
            <p class="text-slate-400 font-mono text-[10px] animate-pulse uppercase tracking-[0.2em]">
                SISTEMA GESTIAPREMIUM: ACCESO NIVEL ARQUITECTO...
            </p>
        </div>
    `;

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            console.warn("Sesión no detectada. Redirigiendo a login...");
            window.location.href = 'login.html';
            return;
        }

        try {
            // 1. Obtener perfil de usuario desde la colección unificada
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                container.innerHTML = `
                    <div class="p-10 text-center text-slate-500 font-mono text-xs uppercase">
                        <i class="fa-solid fa-user-xmark text-2xl mb-4 text-red-500/50"></i><br>
                        Error: Usuario no registrado en la base de datos central.
                    </div>`;
                return;
            }

            const userData = userSnap.data();
            rolUsuarioActual = userData.rol;
            
            // Mapeo dinámico: Soporta residencialId (V5) y condominioId (V6)
            condominioIdActual = userData.residencialId || userData.condominioId; 

            // --- REGLA DE BYPASS PARA HEBER MENDOZA (CEO) ---
            const esSuperUser = ['super_admin', 'ceo'].includes(rolUsuarioActual);

            if (esSuperUser) {
                // Forzamos el ID de Uxmal 39 para que el CEO vea Oficinas/Notaría/POSIQ
                condominioIdActual = "UXMAL39"; 
                console.info("⚡ MODO ARQUITECTO: Acceso global activado en Edificio Uxmal 39.");
            } else if (!condominioIdActual) {
                container.innerHTML = `
                    <div class="p-10 text-center text-slate-500 font-mono text-xs uppercase">
                        <i class="fa-solid fa-building-circle-exclamation text-2xl mb-4 text-orange-500/50"></i><br>
                        Error: Usuario sin Edificio/Residencial vinculado.
                    </div>`;
                return;
            }

            // 2. Cargar el Esquema Dinámico del Módulo solicitado (Ej: seguridad_accesos)
            const moduloRef = doc(db, "gestia_system_modules", moduloId);
            const moduloSnap = await getDoc(moduloRef);

            if (!moduloSnap.exists()) {
                container.innerHTML = `
                    <div class="p-10 text-center text-slate-500 font-mono text-xs uppercase">
                        <i class="fa-solid fa-code-branch text-2xl mb-4 text-blue-500/50"></i><br>
                        Error: El módulo [${moduloId}] no ha sido inyectado en el sistema central.
                    </div>`;
                return;
            }

            const esquemaModulo = moduloSnap.data();

            // 3. Sincronización en vivo de la Lista Negra del Edificio (Seguridad Perimetral)
            const condoRef = doc(db, "condominios", condominioIdActual); 
            onSnapshot(condoRef, (snap) => {
                if(snap.exists()) {
                    blockedUsersGlobal = snap.data().blockedUsers || [];
                    console.log(`🛡️ NOC: Lista negra sincronizada para ${condominioIdActual}.`);
                }
            });

            // 4. Validación de Privilegios según el Esquema (Oficinas/Notaría)
            const rolesAutorizados = esquemaModulo.seguridad_roles || [];
            const esAdminGlobal = ['super_admin', 'ceo', 'admin'].includes(rolUsuarioActual);

            if (!esAdminGlobal && !rolesAutorizados.includes(rolUsuarioActual)) {
                container.innerHTML = `
                    <div class="p-10 text-center text-slate-500 font-mono text-xs uppercase tracking-widest">
                        <i class="fa-solid fa-ban text-2xl mb-4 text-red-600/40"></i><br>
                        Privilegios Insuficientes: El rol ${rolUsuarioActual} no tiene acceso a este módulo.
                    </div>`;
                return;
            }

            // 5. Orquestación de Capas y Widgets (Llamadas a módulos siguientes)
            renderizarUIBase(esquemaModulo, container);
            conectarDatosEnVivo(esquemaModulo);
            inyectarWidgetsSeguridad(esquemaModulo);

            console.info(`✅ GestiaReady: Panel de ${esquemaModulo.nombre_display} operativo en ${condominioIdActual}`);

        } catch (error) {
            console.error("Fallo crítico en el arranque del motor:", error);
            container.innerHTML = `
                <div class="p-10 text-center text-red-500 font-mono text-xs uppercase">
                    <i class="fa-solid fa-triangle-exclamation text-2xl mb-4 animate-pulse"></i><br>
                    INIT_FATAL_ERROR: ${error.message}
                </div>`;
        }
    });
}

/**
 * FIX: EXPOSICIÓN AL SCOPE GLOBAL
 * Necesario para que el index.html pueda invocar initGestiaRender 
 * sin errores de tipo "is not defined".
 */
window.initGestiaRender = initGestiaRender;
// ==========================================
// 2. CONSTRUCTOR DE INTERFAZ (UI BUILDER) - V6.3 (NOC Layout & Real-time Counters)
// ==========================================
export function renderizarUIBase(esquema, container) {
    // CORRECCIÓN: Validación de permisos basada en el esquema dinámico de la base de datos
    const tieneBotonCrear = esquema.esquema_interfaz?.acciones_permitidas?.includes("crear");
    
    // Inyección del Layout Principal (Arquitectura de 3 capas: Header, Body/Table, Panel Derecho)
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
                            <div class="flex items-center gap-1.5" title="Personas actualmente dentro del edificio">
                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span class="text-[10px] text-slate-400 font-mono uppercase">En Edificio: <b id="count-activos" class="text-emerald-400">0</b></span>
                            </div>
                            <div class="flex items-center gap-1.5 border-l border-slate-700 pl-3">
                                <i class="fa-solid fa-box text-[10px] text-blue-400"></i>
                                <span class="text-[10px] text-slate-400 font-mono uppercase">Paquetes: <b id="count-paquetes-header" class="text-blue-400">0</b></span>
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
                        <input type="text" id="buscador-trazabilidad" placeholder="Buscar registro..." 
                            class="w-full bg-slate-900/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 outline-none focus:border-blue-500/50">
                    </div>

                    ${tieneBotonCrear ? `
                    <button id="btn-crear-registro" class="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20">
                        <i class="fa-solid fa-plus"></i> NUEVO REGISTRO
                    </button>
                    ` : ''}
                </div>
            </div>

            <div class="flex-1 flex flex-col lg:flex-row overflow-hidden bg-[#0d1117] relative">
                
                <div class="flex-1 overflow-auto custom-scrollbar relative">
                    <table class="w-full text-left border-collapse min-w-max">
                        <thead class="bg-slate-800/90 sticky top-0 backdrop-blur-sm z-10 border-b border-slate-700">
                            <tr id="tabla-cabeceras"></tr>
                        </thead>
                        <tbody id="tabla-cuerpo" class="divide-y divide-slate-800/60 text-sm"></tbody>
                    </table>
                    
                    <div id="estado-vacio" class="hidden absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none">
                        <i class="fa-solid fa-folder-open text-4xl mb-3 opacity-30"></i>
                        <p class="font-mono text-[10px] uppercase tracking-widest text-center">Sin resultados operativos para este tenant</p>
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
                <div class="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[95vh] animate-fade-in">
                    <div class="p-4 border-b border-slate-700 flex justify-between items-center shrink-0">
                        <h3 class="text-base font-bold text-white flex items-center gap-2"><i class="fa-solid fa-bolt text-blue-400"></i> Registro de Acceso</h3>
                        <button id="btn-cerrar-modal" class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark text-xl"></i></button>
                    </div>
                    <div class="p-4 overflow-y-auto custom-scrollbar">
                        <form id="formulario-dinamico" class="flex flex-col gap-4"></form>
                    </div>
                    <div class="p-4 border-t border-slate-700 flex flex-col sm:flex-row justify-end gap-3 bg-slate-900/50 rounded-b-2xl">
                        <button type="button" id="btn-cancelar-modal" class="px-4 py-2 text-sm font-semibold text-slate-300">Cancelar</button>
                        <button type="submit" form="formulario-dinamico" class="bg-blue-600 px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all">Guardar en BD</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // --- ASIGNACIÓN DE LISTENERS (V6.3 Global Mapping) ---
    
    // 1. Buscador de Trazabilidad
    document.getElementById('buscador-trazabilidad').addEventListener('input', (e) => {
        if (typeof window.filtrarTablaEnVivo === 'function') {
            window.filtrarTablaEnVivo(e.target.value);
        } else {
            console.warn("Módulo de Trazabilidad no cargado aún.");
        }
    });
    
    // 2. Toggle de Registros Activos (Filtro NOC)
    document.getElementById('toggle-solo-activos').addEventListener('click', function() {
        const isActive = this.getAttribute('data-active') === 'true';
        this.setAttribute('data-active', !isActive);
        this.classList.toggle('bg-blue-600/20', !isActive);
        this.classList.toggle('text-blue-400', !isActive);
        this.classList.toggle('border-blue-500/50', !isActive);
        
        if (typeof window.filtrarActivos === 'function') {
            window.filtrarActivos(!isActive);
        }
    });

    // 3. Generación Dinámica de Cabeceras de Tabla
    const trCabeceras = document.getElementById('tabla-cabeceras');
    if (esquema.esquema_base_datos?.campos) {
        esquema.esquema_base_datos.campos.forEach(campo => {
            trCabeceras.innerHTML += `
                <th class="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
                    ${campo.etiqueta}
                </th>`;
        });
        // Columna de control final
        trCabeceras.innerHTML += `
            <th class="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right font-mono">
                Acciones
            </th>`;
    }

    // 4. Activación de Modal de Creación
    if (tieneBotonCrear) {
        document.getElementById('btn-crear-registro').onclick = () => {
            if (typeof window.abrirModalFormulario === 'function') {
                window.abrirModalFormulario(esquema);
            }
        };
        document.getElementById('btn-cerrar-modal').onclick = () => window.cerrarModal();
        document.getElementById('btn-cancelar-modal').onclick = () => window.cerrarModal();
        document.getElementById('formulario-dinamico').onsubmit = (e) => {
            if (typeof window.guardarNuevoRegistro === 'function') {
                window.guardarNuevoRegistro(e, esquema);
            }
        };
    }
}

// Vinculación al scope global para evitar ReferenceError en callbacks de otros módulos
window.renderizarUIBase = renderizarUIBase;
/**
 * ==========================================
 * 3. INYECCIÓN DE COMPONENTES DE SEGURIDAD (V6.3 - Multi-tenant Real & Full NOC)
 * ==========================================
 * Esta sección inyecta el Botón de Pánico y el Sistema de Inventario de Paquetes.
 * Todo está vinculado al condominioIdActual para aislamiento total de datos.
 */
export function inyectarWidgetsSeguridad(esquema) {
    // --- 1. BOTÓN DE PÁNICO (DINAMIZADO POR TENANT) ---
    const panicContainer = document.getElementById('contenedor-panico-flotante');
    if (panicContainer) {
        panicContainer.innerHTML = `
            <button id="btn-panico-pro" class="fixed bottom-6 right-6 p-6 bg-red-700 text-white rounded-full shadow-[0_0_30px_rgba(185,28,28,0.5)] hover:bg-red-600 active:scale-90 transition-all z-[60] border-4 border-red-900/40 group overflow-hidden">
                <div class="absolute inset-0 bg-white/10 animate-ping opacity-20"></div>
                <i class="fa-solid fa-shield-run text-2xl group-hover:rotate-12 transition-transform"></i>
            </button>
        `;

        document.getElementById('btn-panico-pro').onclick = async () => {
            const confirmacion = confirm(`🚨 ¿Deseas disparar una ALERTA DE PÁNICO inmediata en ${condominioIdActual}?`);
            if (!confirmacion) return;

            try {
                // RUTA: panicAlerts/{condominioId}/alertas
                const alertaRef = collection(db, "panicAlerts", condominioIdActual, "alertas");
                await addDoc(alertaRef, {
                    timestamp: serverTimestamp(),
                    status: "active",
                    notified: false,
                    ubicacion: "Caseta de Vigilancia",
                    creado_por: auth.currentUser.uid,
                    residencialId: condominioIdActual,
                    rol_emisor: rolUsuarioActual
                });
                alert("ALERTA DE SEGURIDAD ENVIADA AL NOC CENTRAL.");
                console.info("🚨 Pánico registrado exitosamente.");
            } catch (error) {
                console.error("❌ Fallo al disparar alerta:", error);
                alert("Error crítico: No se pudo conectar con el servidor de emergencias.");
            }
        };
    }

    // --- 2. GESTIÓN DE PAQUETERÍA (INVENTARIO Y NOTIFICACIONES) ---
    const pkgFormContainer = document.getElementById('form-paqueteria-container');
    if (pkgFormContainer) {
        pkgFormContainer.innerHTML = `
            <div class="space-y-4">
                <div class="bg-slate-800/50 p-3 rounded-xl border border-slate-700 shadow-inner">
                    <div class="flex flex-col gap-3">
                        <div class="flex flex-col gap-1">
                            <label class="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Unidad / Departamento</label>
                            <input id="pkg-unit" type="text" placeholder="Ej: Torre 3 - 402" class="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-blue-500 transition-all">
                        </div>
                        <div class="flex flex-col gap-1">
                            <label class="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Empresa de Mensajería</label>
                            <select id="pkg-courier" class="bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-blue-500 cursor-pointer">
                                <option value="Amazon">📦 Amazon</option>
                                <option value="Mercado Libre">📦 Mercado Libre</option>
                                <option value="DHL / FedEx">🚚 DHL / FedEx / Estafeta</option>
                                <option value="Uber Eats / Rappi">🍔 Uber Eats / Rappi / Didi</option>
                                <option value="Particular / Otro">👤 Particular / Otro</option>
                            </select>
                        </div>
                        <button id="btn-save-pkg" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg text-[10px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95">
                            <i class="fa-solid fa-paper-plane"></i> REGISTRAR Y NOTIFICAR RESIDENTE
                        </button>
                    </div>
                </div>

                <div class="space-y-3">
                    <div class="flex justify-between items-center px-1">
                        <span class="text-[10px] text-slate-400 font-bold uppercase tracking-[0.1em]">Paquetes en Resguardo</span>
                        <span id="pkg-count" class="bg-blue-500/20 text-blue-400 text-[10px] px-2.5 py-1 rounded-full border border-blue-500/30 font-mono">0</span>
                    </div>
                    <div id="pkg-list-container" class="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                        </div>
                </div>
            </div>
        `;

        // Lógica: Guardado de nuevo paquete (Enterprise Path)
        document.getElementById('btn-save-pkg').onclick = async function() {
            const unitId = document.getElementById('pkg-unit').value.trim();
            const courier = document.getElementById('pkg-courier').value;
            const btn = this;

            if (!unitId) {
                alert("Debes indicar la Unidad o Departamento del residente.");
                return;
            }

            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> REGISTRANDO...`;

            try {
                // RUTA ESTRUCTURADA V6.3: packages/{condominioId}/items
                const colRef = collection(db, "packages", condominioIdActual, "items");
                await addDoc(colRef, {
                    unitId,
                    courier,
                    status: "recibido",
                    timestamp: serverTimestamp(),
                    notified: false,
                    recibido_por: auth.currentUser.uid,
                    residencialId: condominioIdActual
                });

                document.getElementById('pkg-unit').value = "";
                console.log("✅ Paquete registrado en el inventario del condominio.");
            } catch (error) {
                console.error("❌ Fallo al guardar paquete:", error);
                alert("No se pudo registrar el paquete: " + error.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<i class="fa-solid fa-paper-plane mr-2"></i> REGISTRAR Y NOTIFICAR`;
            }
        };

        // Sincronización: Inventario en Vivo con Triple Contador (Header + Widget)
        const pkgList = document.getElementById('pkg-list-container');
        const countHeader = document.getElementById('count-paquetes-header');
        
        const qPkg = query(
            collection(db, "packages", condominioIdActual, "items"), 
            where("status", "==", "recibido"),
            orderBy("timestamp", "desc")
        );
        
        onSnapshot(qPkg, (snap) => {
            pkgList.innerHTML = '';
            let totalRecibidos = 0;
            
            if (snap.empty) {
                pkgList.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-10 opacity-30">
                        <i class="fa-solid fa-boxes-stacked text-3xl mb-2"></i>
                        <p class="text-[10px] font-mono uppercase">Caseta Vacía</p>
                    </div>`;
                document.getElementById('pkg-count').innerText = "0";
                if (countHeader) countHeader.innerText = "0";
                return;
            }

            snap.forEach(docSnap => {
                totalRecibidos++;
                const pkg = docSnap.data();
                const card = document.createElement('div');
                card.className = "bg-slate-800/80 border border-slate-700/50 p-3 rounded-xl flex justify-between items-center animate-fade-in hover:border-blue-500/30 transition-all";
                
                // Nota: Llamamos a window.entregarPaqueteBD para evitar ReferenceError
                card.innerHTML = `
                    <div class="flex flex-col">
                        <span class="text-white font-bold text-xs">Unidad ${pkg.unitId}</span>
                        <span class="text-[10px] text-slate-500 uppercase font-mono">${pkg.courier}</span>
                    </div>
                    <button onclick="gestia.entregarPaquete('${docSnap.id}')" class="bg-emerald-500/10 hover:bg-emerald-600 text-emerald-500 hover:text-white border border-emerald-500/20 p-2.5 rounded-lg transition-all group/check active:scale-90" title="Marcar Entrega Física">
                        <i class="fa-solid fa-check text-xs group-hover/check:scale-110"></i>
                    </button>
                `;
                pkgList.appendChild(card);
            });

            // Actualización de contadores
            document.getElementById('pkg-count').innerText = totalRecibidos;
            if (countHeader) countHeader.innerText = totalRecibidos;
            
            console.info(`📦 Inventario de Paquetes Actualizado: ${totalRecibidos} en espera.`);
        }, (err) => console.error("Error en Snapshot Paquetes:", err));
    }
}

/**
 * --- Función: Entregar Paquete BD (V6.3 Global Window) ---
 * Esta función cierra el ciclo del paquete con auditoría completa.
 */
window.entregarPaqueteBD = async (paqueteId) => {
    try {
        if (!condominioIdActual) {
            alert("Error de sesión: No se identificó el residencial para completar la entrega.");
            return;
        }

        const confirmacion = confirm(`📦 ¿Confirmas que el residente ha recibido este paquete?`);
        if (!confirmacion) return;

        const paqueteRef = doc(db, "packages", condominioIdActual, "items", paqueteId);
        
        console.info(`🏁 Cerrando ciclo de paquete ${paqueteId}...`);

        await updateDoc(paqueteRef, {
            entregado: true,
            estatus: "entregado", 
            status: "entregado",  // Doble validación para reportes
            fecha_entrega: serverTimestamp(),
            entregado_por: auth.currentUser.uid,
            audit_log: "Entrega física completada en caseta"
        });

        console.log("✅ Paquete removido del inventario activo.");
        
    } catch (error) {
        console.error("❌ Error crítico en la entrega:", error);
        alert("No se pudo actualizar el estatus: " + error.message);
    }
};

// Vinculación al namespace de seguridad
window.gestia = window.gestia || {};
window.gestia.entregarPaquete = window.entregarPaqueteBD;
window.inyectarWidgetsSeguridad = inyectarWidgetsSeguridad;
/**
 * ==========================================
 * 4. CONSTRUCTOR DINÁMICO DE FORMULARIOS MULTI-FLUJO (V6.3 Enterprise)
 * ==========================================
 * Este motor genera la interfaz de captura basándose en el esquema de la BD,
 * pero muta en tiempo real según la clasificación del acceso (B2B, Delivery, etc.)
 */
export function abrirModalFormulario(esquema) {
    const form = document.getElementById('formulario-dinamico');
    if (!form) return;

    form.innerHTML = ''; 
    const camposConQR = []; 

    // 1. INYECTAMOS EL SELECTOR MAESTRO DE FLUJO (Autoridad de la Interfaz)
    form.innerHTML = `
        <div class="mb-2 pb-5 border-b border-slate-700/60">
            <label class="block text-sm font-bold text-blue-400 mb-2">
                <i class="fa-solid fa-route mr-2"></i>Clasificación del Acceso
            </label>
            <select id="selector-tipo-flujo" name="tipo_flujo" class="w-full bg-slate-900 border border-blue-500/50 rounded-lg px-3 py-3 text-white font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-all cursor-pointer">
                <option value="" disabled selected>Selecciona el tipo de flujo...</option>
                <option value="b2b">🏢 Corporativo / B2B (Salas y POSIQ)</option>
                <option value="residencial">🏠 Visita Residencial Regular</option>
                <option value="delivery">🍔 Delivery / Plataformas de Entrega</option>
                <option value="proveedor">🛠️ Contratista / Proveedor Externo</option>
            </select>
        </div>
        <div id="contenedor-campos-dinamicos" class="flex flex-col gap-4 hidden animate-fade-in pt-2"></div>
    `;

    const contenedorCampos = document.getElementById('contenedor-campos-dinamicos');
    const selectorFlujo = document.getElementById('selector-tipo-flujo');

    // 2. ESCUCHADOR DINÁMICO: Mutación de campos según el flujo seleccionado
    selectorFlujo.addEventListener('change', (e) => {
        const flujoSeleccionado = e.target.value;
        contenedorCampos.innerHTML = ''; // Limpiamos campos previos
        contenedorCampos.classList.remove('hidden');
        camposConQR.length = 0; // Vaciamos el buffer de QRs para esta instancia

        // 3. RECORRIDO DEL ESQUEMA ORIGINAL APLICANDO BIZ-RULES (UXMAL 39)
        esquema.esquema_base_datos.campos.forEach(campo => {
            // Ignoramos campos automáticos (el servidor se encarga en V6.3)
            if (campo.tipo === 'fecha_hora_automatica') return;

            let mostrarCampo = true;
            let etiquetaPersonalizada = campo.etiqueta;
            let esObligatorio = campo.obligatorio;

            // ---- LÓGICA DE MUTACIÓN BIZ-RULES (Enterprise Mapping) ----
            if (flujoSeleccionado === 'delivery') {
                if (campo.id === 'recurso') { mostrarCampo = false; } // No aplican salas/oficinas a Delivery
                if (campo.id === 'empresa_area') { etiquetaPersonalizada = 'Plataforma (Uber, Rappi, etc)'; }
                if (campo.id === 'motivo') { mostrarCampo = false; } // El motivo es implícito
            } 
            else if (flujoSeleccionado === 'residencial') {
                if (campo.id === 'recurso') { etiquetaPersonalizada = 'Unidad / Departamento Destino'; }
                if (campo.id === 'empresa_area') { mostrarCampo = false; } // Visitas personales no llevan empresa
            } 
            else if (flujoSeleccionado === 'proveedor') {
                if (campo.id === 'recurso') { etiquetaPersonalizada = 'Área de Trabajo / Unidad'; }
                if (campo.id === 'empresa_area') { etiquetaPersonalizada = 'Empresa Contratista'; }
            }

            if (!mostrarCampo) return; 

            // ---- RENDERIZADO DEL INPUT HTML (Tailwind CSS V3) ----
            let inputHtml = '';
            const req = esObligatorio ? 'required' : '';
            const baseClass = "w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 mt-1 text-sm shadow-inner transition-all";

            switch (campo.tipo) {
                case 'texto':
                    inputHtml = `<input type="text" id="campo_${campo.id}" name="${campo.id}" class="${baseClass}" ${req} placeholder="Ingresa ${etiquetaPersonalizada.toLowerCase()}">`;
                    break;
                case 'selector':
                    let opts = campo.opciones.map(op => `<option value="${op}">${op}</option>`).join('');
                    inputHtml = `
                        <select id="campo_${campo.id}" name="${campo.id}" class="${baseClass} appearance-none" ${req}>
                            <option value="" disabled selected>Selecciona una opción...</option>
                            ${opts}
                        </select>`;
                    break;
                case 'texto_qr':
                    camposConQR.push(campo.id);
                    inputHtml = `
                        <div class="relative">
                            <input type="text" id="campo_${campo.id}" name="${campo.id}" class="${baseClass} pr-10 font-mono text-blue-300" placeholder="Escanear o teclear..." ${req}>
                            <button type="button" onclick="gestia.scanQR('${campo.id}')" id="btn_scan_${campo.id}" class="absolute right-2 top-[12px] text-slate-400 hover:text-blue-400 p-1 bg-slate-800 rounded border border-slate-600 shadow-md transition-colors" title="Abrir Escáner">
                                <i class="fa-solid fa-qrcode text-lg"></i>
                            </button>
                        </div>
                        <div id="reader_${campo.id}" class="hidden w-full mt-3 rounded-xl overflow-hidden border-2 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)] bg-black"></div>
                    `;
                    break;
                default:
                    inputHtml = `<input type="text" id="campo_${campo.id}" name="${campo.id}" class="${baseClass}" ${req}>`;
            }

            contenedorCampos.innerHTML += `
                <div class="animate-fade-in">
                    <label class="block text-sm font-medium text-slate-300">
                        ${etiquetaPersonalizada} ${esObligatorio ? '<span class="text-red-500">*</span>' : ''}
                    </label>
                    ${inputHtml}
                </div>`;
        });
    });

    // Mostramos el modal (Eliminamos la clase hidden del contenedor padre)
    document.getElementById('modal-dinamico').classList.remove('hidden');
}

/**
 * --- Gestión de Cierre de Modal ---
 */
window.cerrarModal = () => {
    // Si hay un escáner activo, lo detenemos antes de cerrar
    if (typeof window.gestiaStopScan === 'function') {
        window.gestiaStopScan();
    }
    document.getElementById('modal-dinamico').classList.add('hidden');
};

// Vinculación Global
window.abrirModalFormulario = abrirModalFormulario;
/**
 * ==========================================
 * 5. CEREBRO DE VISIÓN ARTIFICIAL (V6.3 - Multi-tenant Scanner)
 * ==========================================
 * Esta sección controla el hardware de la cámara, la decodificación de QR
 * y la validación inmediata contra la lista negra perimetral.
 */
export function toggleEscanerQR(campoId) {
    // 5.1 Verificación de Integridad de la Librería
    if (!window.Html5Qrcode) {
        alert("La librería de visión artificial aún está cargando o no se ha inyectado correctamente.");
        return;
    }

    const readerId = `reader_${campoId}`;
    const readerDiv = document.getElementById(readerId);
    const btnScan = document.getElementById(`btn_scan_${campoId}`);

    // 5.2 Lógica de Apagado (Si el escáner ya está corriendo)
    if (escannerActivo) {
        detenerEscannerGlobal(readerDiv, btnScan);
        return;
    }

    // 5.3 Lógica de Encendido
    readerDiv.classList.remove('hidden');
    if (btnScan) {
        btnScan.innerHTML = '<i class="fa-solid fa-xmark text-lg"></i>';
        btnScan.classList.replace('text-slate-400', 'text-red-400');
    }

    escannerActivo = new Html5Qrcode(readerId);
    const configParams = { 
        fps: 15, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0 
    };

    // 5.4 Inicio de Captura (Cámara Trasera / Environment)
    escannerActivo.start(
        { facingMode: "environment" },
        configParams,
        async (textoDecodificado) => {
            
            // --- A. VALIDACIÓN DE SEGURIDAD CONTRA LISTA NEGRA ---
            const tokenLimpio = textoDecodificado.trim();
            
            if (blockedUsersGlobal.includes(tokenLimpio)) {
                // Feedback Auditivo de Alerta
                const audioAlerta = new Audio('https://www.soundjay.com/buttons/button-10.mp3');
                audioAlerta.play().catch(() => console.warn("Audio de alerta bloqueado por el navegador"));
                
                alert("🚫 ALERTA DE SEGURIDAD: Este usuario se encuentra en la LISTA NEGRA del condominio. Acceso Denegado.");
                
                console.warn(`🚨 Intento de acceso BLOQUEADO para: ${tokenLimpio} en ${condominioIdActual}`);
                
                // Cerramos el escáner por seguridad tras un positivo en lista negra
                detenerEscannerGlobal(readerDiv, btnScan);
                return;
            }

            // --- B. PROCESAMIENTO DE LECTURA EXITOSA ---
            const inputTarget = document.getElementById(`campo_${campoId}`);
            if (inputTarget) {
                // Feedback Auditivo de Éxito
                const audioExito = new Audio('https://www.soundjay.com/buttons/beep-07a.mp3');
                audioExito.volume = 0.5;
                audioExito.play().catch(() => {});

                // Inyección de datos y feedback visual en el input
                inputTarget.value = tokenLimpio;
                inputTarget.classList.add('ring-2', 'ring-green-500', 'bg-green-900/30', 'text-green-300');
                
                setTimeout(() => {
                    inputTarget.classList.remove('ring-2', 'ring-green-500', 'bg-green-900/30', 'text-green-300');
                }, 2000);
            }

            // C. Auto-cierre del escáner tras lectura válida
            detenerEscannerGlobal(readerDiv, btnScan);
        },
        (errorLectura) => { 
            // Silenciamos errores de "frame sin QR" para no saturar la consola del NOC
        }
    ).catch(err => {
        console.error("Error al iniciar cámara:", err);
        alert("No se pudo acceder a la cámara. Verifica los permisos del navegador.");
        readerDiv.classList.add('hidden');
        escannerActivo = null;
    });
}

/**
 * Función Auxiliar: Limpieza y Detención de Cámara
 */
async function detenerEscannerGlobal(readerDiv, btnScan) {
    if (!escannerActivo) return;

    try {
        await escannerActivo.stop();
        escannerActivo = null;
        
        if (readerDiv) readerDiv.classList.add('hidden');
        if (btnScan) {
            btnScan.innerHTML = '<i class="fa-solid fa-qrcode text-lg"></i>';
            btnScan.classList.replace('text-red-400', 'text-slate-400');
        }
        console.log("📷 Cámara liberada correctamente.");
    } catch (e) {
        console.error("Error al detener el escáner:", e);
        // Forzamos limpieza de variables aunque falle el stop()
        escannerActivo = null;
    }
}

// --- MAPEADO GLOBAL PARA FIX DE REFERENCE ERROR ---
window.gestia = window.gestia || {};
window.gestia.scanQR = toggleEscanerQR;
window.gestiaStopScan = () => {
    const readerDivs = document.querySelectorAll('[id^="reader_"]');
    const btnScans = document.querySelectorAll('[id^="btn_scan_"]');
    // Si hay un escáner activo, lo detenemos usando las referencias visuales
    if (escannerActivo) {
        detenerEscannerGlobal(readerDivs[0], btnScans[0]);
    }
};

/**
 * ==========================================
 * 6. PERSISTENCIA SEGURA (V6.3 - Cloud Authority)
 * ==========================================
 * Esta sección reemplaza la escritura directa en Firestore por llamadas
 * a Cloud Functions (Backend). Resuelve el problema de CORS y asegura
 * que el timestamp y la auditoría sean generados por el servidor.
 */
export async function guardarNuevoRegistro(e, esquema) {
    e.preventDefault();
    
    // 6.1 VALIDACIÓN DE FLUJO MAESTRO
    // Evitamos registros huérfanos sin clasificación (B2B, Delivery, etc.)
    const selectorFlujo = document.getElementById('selector-tipo-flujo');
    if (selectorFlujo && !selectorFlujo.value) {
        alert("⚠️ ACCIÓN REQUERIDA: Selecciona la Clasificación del Acceso antes de guardar.");
        return;
    }

    const btnSubmit = document.querySelector('button[form="formulario-dinamico"]');
    if (!btnSubmit) return;
    
    const originalHTML = btnSubmit.innerHTML;
    
    // 6.2 BLOQUEO DE INTERFAZ (Prevención de Doble Click)
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> VALIDANDO EN NUBE...';

    try {
        // 6.3 EXTRACCIÓN Y MAPEADO DINÁMICO DE DATOS
        const formData = new FormData(e.target);
        const payload = {
            tipo_flujo: selectorFlujo.value,
            modulo_origen: esquema.modulo_id,
            metadata: {
                version_motor: "6.3",
                agente: "GestiaRender_JS"
            }
        };

        // Recorremos los campos definidos en la base de datos para armar el objeto
        esquema.esquema_base_datos.campos.forEach(campo => {
            // Por seguridad, NO enviamos fechas ni IDs generados localmente.
            // La Cloud Function 'crearAcceso' inyectará el serverTimestamp().
            if (campo.tipo !== 'fecha_hora_automatica' && campo.id !== 'fecha_hora') {
                const valor = formData.get(campo.id);
                payload[campo.id] = (valor !== null && valor !== "") ? valor : "—";
            }
        });

        // 6.4 LLAMADA AL BACKEND ENTERPRISE (Fix CORS via Region us-central1)
        // Usamos la instancia 'functions' inicializada en el Módulo 0
        const crearAccesoFn = httpsCallable(functions, 'crearAcceso');
        
        console.info(`📡 Sincronizando registro con Tenant: ${condominioIdActual}...`);
        
        // Ejecución de la Función de Nube
        const resultado = await crearAccesoFn({
            condominioId: condominioIdActual,
            moduloId: esquema.modulo_id,
            payload: payload
        });

        // 6.5 PROCESAMIENTO DE RESPUESTA DEL SERVIDOR
        const { status, id, message } = resultado.data;

        if (status === 'success' || status === 'created' || status === 'updated') {
            console.log(`✅ Operación Exitosa. ID de Registro: ${id}`);
            
            // Feedback Visual de Éxito
            btnSubmit.className = "bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-emerald-500/20";
            btnSubmit.innerHTML = '<i class="fa-solid fa-check mr-2"></i> REGISTRO COMPLETADO';

            // Reset y cierre con delay para que el guardia vea el éxito
            setTimeout(() => {
                if (typeof window.cerrarModal === 'function') {
                    window.cerrarModal();
                }
                e.target.reset();
            }, 1200);

        } else if (status === 'blocked') {
            // Caso de usuario en Blacklist detectado por el Backend
            alert(`🚨 ACCESO DENEGADO POR SEGURIDAD:\n${message}`);
            btnSubmit.className = "bg-red-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold animate-shake";
            btnSubmit.innerHTML = '<i class="fa-solid fa-hand mr-2"></i> BLOQUEADO';
        } else {
            throw new Error(message || "Respuesta desconocida del servidor");
        }

    } catch (error) {
        // 6.6 GESTIÓN DE ERRORES DE CONECTIVIDAD (CORS / TIMEOUT)
        console.error("❌ Error de comunicación con el Backend:", error);
        
        let msgError = "Fallo en la comunicación segura con la nube.";
        if (error.message.includes("internal")) msgError = "Error interno en la Cloud Function. Revisa logs en GCP.";
        if (error.message.includes("failed-precondition")) msgError = "Error de permisos: El usuario no tiene autorización para escribir.";
        
        alert(`FALLO CRÍTICO: ${msgError}\nDetalle: ${error.message}`);
        
        btnSubmit.className = "bg-orange-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold";
        btnSubmit.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-2"></i> REINTENTAR';

    } finally {
        // Restauración del botón tras el proceso
        setTimeout(() => {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = originalHTML;
            btnSubmit.className = "bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-lg flex items-center justify-center gap-2";
        }, 3000);
    }
}

/**
 * --- MAPEADO GLOBAL ---
 * Mapeamos la función al scope global para que el onsubmit del 
 * formulario dinámico (Módulo 2/4) pueda invocarla sin ReferenceError.
 */
window.guardarNuevoRegistro = guardarNuevoRegistro;
/**
 * ==========================================
 * 7. SINCRONIZACIÓN EN VIVO Y RENDERIZADO (V6.3 - Multi-tenant Heart)
 * ==========================================
 * Esta sección controla la escucha en tiempo real, filtrada estrictamente por Condominio.
 * Integra: NOC Intelligence, POSIQ Detector, Overstay Alerts y Multi-tenant Security.
 */
export function conectarDatosEnVivo(esquema) {
    // 7.1 LIMPIEZA DE MEMORIA
    // Si ya existe una escucha activa (de otro módulo), la cerramos para evitar fugas.
    if (unsubscribeSnapshot) unsubscribeSnapshot();

    const tbody = document.getElementById('tabla-cuerpo');
    const estadoVacio = document.getElementById('estado-vacio');
    const countActivosLabel = document.getElementById('count-activos');
    
    // 7.2 SEGURIDAD MULTI-TENANT (Uxmal 39 Isolation)
    // La colección cuelga del condominioIdActual del usuario (Bypass Heber Mendoza activo)
    const registrosRef = collection(db, "gestia_records", condominioIdActual, esquema.modulo_id);
    const q = query(registrosRef, orderBy("creado_en", "desc"));

    console.info(`📡 NOC: Escuchando tráfico en vivo para ${condominioIdActual}...`);

    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        tbody.innerHTML = ''; 
        let activosEnEdificio = 0;
        const ahora = new Date();
        
        if (snapshot.empty) {
            if (estadoVacio) estadoVacio.classList.remove('hidden');
            if (countActivosLabel) countActivosLabel.innerText = "0";
            return;
        }

        if (estadoVacio) estadoVacio.classList.add('hidden');

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const tr = document.createElement('tr');
            
            // --- 1. VARIABLES DE ESTADO OPERATIVO ---
            const tipoFlujo = data.tipo_flujo || 'b2b';
            const yaSalio = (data.fecha_salida || data.estatus === 'salida') ? true : false;

            // --- 2. LÓGICA DE CONTADOR (NOC INTELLIGENCE) ---
            if (!yaSalio) activosEnEdificio++;

            // --- 3. LÓGICA DE ALERTA DE PERMANENCIA (OVERSTAY) ---
            let alertaOverstay = false;
            if (!yaSalio && data.creado_en) {
                const entrada = data.creado_en.toDate();
                const minutosTranscurridos = (ahora - entrada) / (1000 * 60);
                
                // Reglas de negocio Uxmal 39: 60m Delivery, 120m Visita, 240m Proveedor
                if (tipoFlujo === 'delivery' && minutosTranscurridos > 60) alertaOverstay = true;
                if (tipoFlujo === 'residencial' && minutosTranscurridos > 120) alertaOverstay = true;
                if (tipoFlujo === 'proveedor' && minutosTranscurridos > 240) alertaOverstay = true;
            }

            // --- 4. DETECTOR DE PRIORIDAD POSIQ / SENSITIVE ---
            const txtEmpresa = (data.empresa_area || "").toUpperCase();
            const txtRecurso = (data.recurso || "").toUpperCase();
            const esPOSIQ = txtEmpresa.includes("POSIQ") || 
                           txtRecurso.includes("ESTUDIO") || 
                           data.prioridad_alta === true;
            
            // --- 5. CONSTRUCCIÓN VISUAL DE LA FILA (DISEÑO TERMINAL) ---
            let clasesFila = "hover:bg-slate-800/50 transition-all duration-200 group border-b border-slate-800/60 border-l-4 ";
            
            if (esPOSIQ) {
                clasesFila += "bg-red-900/20 border-l-red-600 "; // Alerta de Seguridad Máxima
            } else if (alertaOverstay) {
                clasesFila += "bg-amber-900/10 border-l-amber-500 animate-pulse-slow "; // Alerta de Tiempo
            } else {
                let borderFlujo = "border-l-transparent"; 
                if (tipoFlujo === 'residencial') borderFlujo = "border-l-emerald-500/50";
                if (tipoFlujo === 'delivery') borderFlujo = "border-l-amber-500/50";
                if (tipoFlujo === 'proveedor') borderFlujo = "border-l-purple-500/50";
                clasesFila += borderFlujo;
            }

            // Atributos de estado para el motor de filtrado
            if (yaSalio) {
                clasesFila += " opacity-40 grayscale-[0.4] ";
                tr.setAttribute('data-salida', 'true');
            } else {
                tr.setAttribute('data-salida', 'false');
            }

            tr.className = clasesFila;

            // --- 6. RENDERIZADO DINÁMICO DE COLUMNAS (REGLA 1: COMPLETO) ---
            let isFirstColumn = true; 
            esquema.esquema_base_datos.campos.forEach(campo => {
                let valorFinal = "—";
                
                if (data[campo.id] && data[campo.id] !== "—") {
                    if (campo.tipo === 'fecha_hora_automatica' || campo.id === 'fecha_hora') {
                        const dateObj = data[campo.id].toDate ? data[campo.id].toDate() : new Date();
                        valorFinal = new Intl.DateTimeFormat('es-MX', { 
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
                        }).format(dateObj);
                    } else if (campo.tipo === 'selector') {
                        const colorTag = esPOSIQ ? 'bg-red-600 text-white' : 'bg-blue-900/30 text-blue-400';
                        const tagClass = yaSalio ? 'bg-slate-700 text-slate-400' : colorTag;
                        
                        let textoBadge = data[campo.id];
                        if (campo.id === 'tipo_movimiento' && yaSalio) textoBadge = 'SALIDA';

                        valorFinal = `<span class="${tagClass} border border-slate-700/50 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider shadow-inner">${textoBadge}</span>`;
                    } else if (campo.tipo === 'texto_qr') {
                        valorFinal = `<span class="font-mono text-xs ${esPOSIQ ? 'text-red-400' : 'text-emerald-400'} font-bold truncate block max-w-[120px]"><i class="fa-solid fa-qrcode mr-1"></i>${data[campo.id]}</span>`;
                    } else {
                        valorFinal = data[campo.id];
                    }
                }

                // Inyectar ícono del flujo en la primera celda
                if (isFirstColumn) {
                    let iconHTML = '<i class="fa-solid fa-building text-blue-400 mr-2"></i>';
                    if (tipoFlujo === 'residencial') iconHTML = '<i class="fa-solid fa-house text-emerald-400 mr-2"></i>';
                    if (tipoFlujo === 'delivery') iconHTML = '<i class="fa-solid fa-burger text-amber-400 mr-2"></i>';
                    if (tipoFlujo === 'proveedor') iconHTML = '<i class="fa-solid fa-helmet-safety text-purple-400 mr-2"></i>';
                    
                    valorFinal = `<div class="flex items-center">${iconHTML} <span class="truncate">${valorFinal}</span></div>`;
                    isFirstColumn = false;
                }

                tr.innerHTML += `<td class="px-4 py-3 text-slate-300 whitespace-nowrap overflow-hidden text-ellipsis max-w-[180px]">${valorFinal}</td>`;
            });

            // --- 7. PANEL DE ACCIONES (REGISTRO DE SALIDA) ---
            const tdAcciones = document.createElement('td');
            tdAcciones.className = "px-4 py-3 flex justify-end gap-2 items-center";
            
            // Botón Ver Detalle (Audit ready)
            const btnVer = document.createElement('button');
            btnVer.className = "text-slate-500 hover:text-blue-400 p-2 bg-slate-800 rounded-lg shadow-md border border-slate-700 transition-all active:scale-95 group/btn";
            btnVer.innerHTML = `<i class="fa-solid fa-eye text-xs group-hover/btn:scale-110"></i>`;
            btnVer.onclick = () => {
                const infoFormateada = window.formatearDetalleParaGuardia(data);
                alert(`📋 DETALLE DEL ACCESO [${condominioIdActual}]\n----------------------------------\nFlujo: ${tipoFlujo.toUpperCase()}\n${infoFormateada}\n----------------------------------\nID: ${docSnap.id}`);
            };
            tdAcciones.appendChild(btnVer);

            // Botón Registrar Salida (Loop de cierre)
            if (!yaSalio) {
                const btnSalida = document.createElement('button');
                btnSalida.className = "text-amber-500 hover:text-amber-400 p-2 bg-slate-800 rounded-lg shadow-md border border-slate-700 transition-all active:scale-95 group/btn";
                btnSalida.title = "Registrar Salida Definitiva";
                btnSalida.innerHTML = `<i class="fa-solid fa-right-from-bracket text-xs group-hover/btn:scale-110"></i>`;
                btnSalida.onclick = async () => {
                    if (confirm(`🚪 ¿Confirmar SALIDA de este registro?`)) {
                        btnSalida.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs"></i>`;
                        await window.registrarSalidaBD(docSnap.id, esquema.modulo_id);
                    }
                };
                tdAcciones.appendChild(btnSalida);
            }

            tr.appendChild(tdAcciones);
            tbody.appendChild(tr);
        });

        // Actualizar contadores del Header (NOC Dashboard)
        if (countActivosLabel) countActivosLabel.innerText = activosEnEdificio;
        console.info(`📊 Sincronización Multi-tenant [${condominioIdActual}]: ${activosEnEdificio} activos.`);

    }, (error) => {
        console.error("❌ Error de suscripción multi-tenant:", error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="p-10 text-center"><p class="text-red-500 font-mono text-xs">FALLO_CONEXIÓN_TENANT: ${error.message}</p></td></tr>`;
    });
}

/**
 * --- Función: Registrar Salida (Persistencia Cloud) ---
 */
window.registrarSalidaBD = async (registroId, moduloId) => {
    try {
        const registrarSalidaFn = httpsCallable(functions, 'registrarSalida');
        const resultado = await registrarSalidaFn({
            condominioId: condominioIdActual,
            moduloId: moduloId,
            registroId: registroId
        });

        if (resultado.data.status === 'success') {
            console.log("✅ Salida registrada exitosamente en servidor.");
        }
    } catch (error) {
        console.error("❌ Error al registrar salida:", error);
        alert("No se pudo registrar la salida: " + error.message);
    }
};

/**
 * --- Función: Filtrado de Activos ---
 */
window.filtrarActivos = (soloActivos) => {
    const filas = document.querySelectorAll('#tabla-cuerpo tr');
    filas.forEach(fila => {
        const yaSalio = fila.getAttribute('data-salida') === 'true';
        if (soloActivos && yaSalio) {
            fila.style.display = "none";
        } else {
            fila.style.display = "";
        }
    });
};

/**
 * --- Función: Filtrado por Texto (Buscador) ---
 */
window.filtrarTablaEnVivo = (termino) => {
    const t = termino.toLowerCase();
    const filas = document.querySelectorAll('#tabla-cuerpo tr');
    filas.forEach(fila => {
        const texto = fila.textContent.toLowerCase();
        fila.style.display = texto.includes(t) ? "" : "none";
    });
};

/**
 * --- Función Auxiliar: Formateo de Datos Forense ---
 */
window.formatearDetalleParaGuardia = (data) => {
    return Object.entries(data)
        .filter(([key]) => !['creado_por', 'creado_en', 'modulo_origen', 'prioridad_alta', 'color_alerta', 'tipo_flujo', 'estatus_acceso', 'condominioId'].includes(key)) 
        .map(([key, val]) => {
            const label = key.replace(/_/g, ' ').toUpperCase();
            let valorAMostrar = val;

            if (val && typeof val === 'object' && val.seconds) {
                const d = val.toDate();
                valorAMostrar = d.toLocaleString('es-MX', { 
                    day: '2-digit', month: 'short', year: 'numeric', 
                    hour: '2-digit', minute: '2-digit' 
                });
            }
            return `🔹 ${label}: ${valorAMostrar}`;
        }).join('\n');
};

// Vinculación Global
window.conectarDatosEnVivo = conectarDatosEnVivo;
