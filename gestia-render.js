import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, 
    doc, 
    getDoc, 
    onSnapshot, 
    query, 
    orderBy,
    where // Añadimos where para el filtrado por condominio
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- NUEVA IMPORTACIÓN ENTERPRISE ---
import { 
    getFunctions, 
    httpsCallable 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

// ==========================================
// VARIABLES GLOBALES DEL MOTOR (V6.0 - SaaS Ready)
// ==========================================
const functions = getFunctions();
let unsubscribeSnapshot = null;
let escannerActivo = null; 
let condominioIdActual = null; // Se llena dinámicamente al loguear
let rolUsuarioActual = null;
let blockedUsersGlobal = []; 

/**
 * ==========================================
 * 1. INICIALIZADOR DEL MOTOR DE RENDERIZADO (V6.1 - CEO Bypass & Multi-tenant)
 * ==========================================
 * Esta sección valida la identidad del usuario, extrae su condominioId y
 * permite que los roles CEO/SUPER_ADMIN operen incluso sin ID vinculado.
 */
export async function initGestiaRender(moduloId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Inyectar librería de escáner QR silenciosamente
    if (!document.getElementById('html5-qr-script')) {
        const script = document.createElement('script');
        script.id = 'html5-qr-script';
        script.src = 'https://unpkg.com/html5-qrcode';
        document.head.appendChild(script);
    }

    // Pantalla de carga profesional estilo NOC
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center p-10 h-full">
            <i class="fa-solid fa-shield-halved fa-spin text-4xl text-gestia-primary mb-4"></i>
            <p class="text-slate-400 font-mono text-[10px] animate-pulse uppercase tracking-[0.2em]">AUTENTICANDO ACCESO NIVEL ARQUITECTO...</p>
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
            condominioIdActual = userData.condominioId;

            // --- REGLA DE BYPASS PARA HEBER MENDOZA (CEO) ---
            const esSuperUser = ['super_admin', 'ceo'].includes(rolUsuarioActual);

            if (!condominioIdActual) {
                if (esSuperUser) {
                    // Si el CEO no tiene condominioId, le asignamos UXMAL39 para pruebas
                    condominioIdActual = "UXMAL39"; 
                    console.info("⚡ MODO ARQUITECTO: Acceso global activado en UXMAL39.");
                } else {
                    container.innerHTML = `
                        <div class="p-10 text-center text-slate-500 font-mono text-xs uppercase">
                            <i class="fa-solid fa-building-circle-exclamation text-2xl mb-4 text-orange-500/50"></i><br>
                            Error: Usuario sin condominio vinculado.
                        </div>`;
                    return;
                }
            }

            // 2. Cargar el Esquema Dinámico del Módulo solicitado
            const moduloRef = doc(db, "gestia_system_modules", moduloId);
            const moduloSnap = await getDoc(moduloRef);

            if (!moduloSnap.exists()) {
                container.innerHTML = `
                    <div class="p-10 text-center text-slate-500 font-mono text-xs uppercase">
                        <i class="fa-solid fa-code-branch text-2xl mb-4 text-blue-500/50"></i><br>
                        Error: El módulo [${moduloId}] no ha sido inyectado vía Terminal.
                    </div>`;
                return;
            }

            const esquemaModulo = moduloSnap.data();

            // 3. Sincronización en vivo de la Lista Negra del Tenat
            const condoRef = doc(db, "condominios", condominioIdActual); 
            onSnapshot(condoRef, (snap) => {
                if(snap.exists()) {
                    blockedUsersGlobal = snap.data().blockedUsers || [];
                    console.log(`🛡️ NOC: Lista negra sincronizada para [${condominioIdActual}].`);
                }
            });

            // 4. Validación de Roles según el Esquema del Módulo
            const rolesAutorizados = esquemaModulo.seguridad_roles || [];
            const esAdminGlobal = ['super_admin', 'ceo', 'admin'].includes(rolUsuarioActual);

            if (!esAdminGlobal && !rolesAutorizados.includes(rolUsuarioActual)) {
                container.innerHTML = `
                    <div class="p-10 text-center text-slate-500 font-mono text-xs uppercase tracking-widest">
                        <i class="fa-solid fa-ban text-2xl mb-4 text-red-600/40"></i><br>
                        Privilegios Insuficientes: Rol ${rolUsuarioActual} denegado.
                    </div>`;
                return;
            }

            // 5. Orquestación de Capas (Renderizado Final)
            renderizarUIBase(esquemaModulo, container);
            conectarDatosEnVivo(esquemaModulo);
            inyectarWidgetsSeguridad(esquemaModulo);

            console.info(`✅ GestiaReady: Módulo ${esquemaModulo.nombre_display} activo en ${condominioIdActual}`);

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
// ==========================================
// 2. CONSTRUCTOR DE INTERFAZ (UI BUILDER) - V5.24.1 (Botón Restaurado)
// ==========================================
function renderizarUIBase(esquema, container) {
    // CORRECCIÓN: Volvemos a la ruta correcta 'esquema_interfaz' para los permisos
    const tieneBotonCrear = esquema.esquema_interfaz?.acciones_permitidas?.includes("crear");
    
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
                            <div class="flex items-center gap-1.5" title="Personas actualmente dentro">
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
                        <input type="text" id="buscador-trazabilidad" placeholder="Buscar..." 
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

    // Listeners del Header
    document.getElementById('buscador-trazabilidad').addEventListener('input', (e) => filtrarTablaEnVivo(e.target.value));
    
    document.getElementById('toggle-solo-activos').addEventListener('click', function() {
        const isActive = this.getAttribute('data-active') === 'true';
        this.setAttribute('data-active', !isActive);
        this.classList.toggle('bg-blue-600/20', !isActive);
        this.classList.toggle('text-blue-400', !isActive);
        this.classList.toggle('border-blue-500/50', !isActive);
        filtrarActivos(!isActive);
    });

    const trCabeceras = document.getElementById('tabla-cabeceras');
    esquema.esquema_base_datos.campos.forEach(campo => {
        trCabeceras.innerHTML += `<th class="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">${campo.etiqueta}</th>`;
    });
    trCabeceras.innerHTML += `<th class="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right font-mono">Acciones</th>`;

    if (tieneBotonCrear) {
        document.getElementById('btn-crear-registro').onclick = () => abrirModalFormulario(esquema);
        document.getElementById('btn-cerrar-modal').onclick = cerrarModal;
        document.getElementById('btn-cancelar-modal').onclick = cerrarModal;
        document.getElementById('formulario-dinamico').onsubmit = (e) => guardarNuevoRegistro(e, esquema);
    }
}
// ==========================================
// 3. INYECCIÓN DE COMPONENTES DE SEGURIDAD (V5.22 - Inventario de Paquetes)
// ==========================================
function inyectarWidgetsSeguridad(esquema) {
    // 1. Botón de Pánico (Se mantiene igual)
    const panicContainer = document.getElementById('contenedor-panico-flotante');
    panicContainer.innerHTML = `
        <button id="btn-panico-pro" class="fixed bottom-6 right-6 p-6 bg-red-700 text-white rounded-full shadow-[0_0_30px_rgba(185,28,28,0.5)] hover:bg-red-600 active:scale-90 transition-all z-[60] border-4 border-red-900/40 group overflow-hidden">
            <div class="absolute inset-0 bg-white/10 animate-ping opacity-20"></div>
            <i class="fa-solid fa-shield-run text-2xl group-hover:rotate-12 transition-transform"></i>
        </button>
    `;

    document.getElementById('btn-panico-pro').onclick = async () => {
        if (!confirm("🚨 ¿Deseas disparar una ALERTA DE PÁNICO inmediata al NOC?")) return;
        try {
            await addDoc(collection(db, "panicAlerts"), {
                timestamp: serverTimestamp(), status: "active", notified: false,
                ubicacion: "Caseta de Vigilancia", creado_por: auth.currentUser.uid, condominioId: "UXMAL39"
            });
            alert("ALERTA ENVIADA.");
        } catch (e) { console.error(e); }
    };

    // 2. Gestión de Paquetería con Inventario en Vivo
    const pkgFormContainer = document.getElementById('form-paqueteria-container');
    pkgFormContainer.innerHTML = `
        <div class="space-y-4">
            <div class="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                <div class="flex flex-col gap-3">
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] text-slate-500 font-bold uppercase">Unidad / Depto</label>
                        <input id="pkg-unit" type="text" placeholder="Ej: 402" class="bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white outline-none focus:border-blue-500">
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] text-slate-500 font-bold uppercase">Mensajería</label>
                        <select id="pkg-courier" class="bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white outline-none focus:border-blue-500">
                            <option>Amazon</option><option>Mercado Libre</option><option>DHL / FedEx</option><option>Uber Eats / Rappi</option>
                        </select>
                    </div>
                    <button id="btn-save-pkg" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-lg text-[10px] transition-all flex items-center justify-center gap-2">
                        <i class="fa-solid fa-paper-plane"></i> REGISTRAR Y NOTIFICAR
                    </button>
                </div>
            </div>

            <div class="space-y-2">
                <div class="flex justify-between items-center px-1">
                    <span class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Paquetes en Caseta</span>
                    <span id="pkg-count" class="bg-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5 rounded-full border border-blue-500/30">0</span>
                </div>
                <div id="pkg-list-container" class="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                    </div>
            </div>
        </div>
    `;

    // Lógica de Guardado
    document.getElementById('btn-save-pkg').onclick = async () => {
        const unitId = document.getElementById('pkg-unit').value;
        const courier = document.getElementById('pkg-courier').value;
        if(!unitId) return alert("Ingresa la unidad.");

        try {
            await addDoc(collection(db, "packages"), {
                unitId, courier, status: "recibido", timestamp: serverTimestamp(),
                notified: false, condominioId: "UXMAL39"
            });
            document.getElementById('pkg-unit').value = "";
        } catch (e) { alert("Error al registrar."); }
    };

    // Sincronización del Inventario (Paquetes no entregados)
    const pkgList = document.getElementById('pkg-list-container');
    const q = query(collection(db, "packages"), orderBy("timestamp", "desc"));
    
    onSnapshot(q, (snap) => {
        pkgList.innerHTML = '';
        let count = 0;
        snap.forEach(docSnap => {
            const pkg = docSnap.data();
            if (pkg.status === 'recibido') {
                count++;
                const div = document.createElement('div');
                div.className = "bg-slate-800 border border-slate-700 p-3 rounded-lg flex justify-between items-center animate-fade-in";
                div.innerHTML = `
                    <div>
                        <div class="text-white font-bold text-xs">Depto ${pkg.unitId}</div>
                        <div class="text-[10px] text-slate-400">${pkg.courier}</div>
                    </div>
                    <button onclick="entregarPaqueteBD('${docSnap.id}')" class="bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white border border-emerald-500/30 p-2 rounded-lg transition-all" title="Marcar como entregado">
                        <i class="fa-solid fa-check text-xs"></i>
                    </button>
                `;
                pkgList.appendChild(div);
            }
        });
        document.getElementById('pkg-count').innerText = count;
        if(count === 0) pkgList.innerHTML = '<p class="text-[10px] text-slate-600 italic text-center py-4">Caseta vacía</p>';
    });
}

/**
 * --- Función Global para Entrega de Paquetes ---
 */
window.entregarPaqueteBD = async function(id) {
    try {
        const docRef = doc(db, "packages", id);
        await updateDoc(docRef, { 
            status: "entregado", 
            fecha_entrega: serverTimestamp() 
        });
        console.log("📦 Paquete entregado y retirado de inventario.");
    } catch (e) { console.error("Error al entregar:", e); }
};
/**
 * --- Función de Filtrado en Tiempo Real (Trazabilidad) ---
 * Filtra las filas de la tabla principal según el texto ingresado.
 */
function filtrarTablaEnVivo(termino) {
    const query = termino.toLowerCase();
    const filas = document.querySelectorAll('#tabla-cuerpo tr');
    let encontrados = 0;

    filas.forEach(fila => {
        const contenido = fila.textContent.toLowerCase();
        if (contenido.includes(query)) {
            fila.style.display = "";
            encontrados++;
        } else {
            fila.style.display = "none";
        }
    });

    const estadoVacio = document.getElementById('estado-vacio');
    if (estadoVacio) {
        if (encontrados === 0 && query !== "") {
            estadoVacio.classList.remove('hidden');
        } else {
            estadoVacio.classList.add('hidden');
        }
    }
}
// ==========================================
// 4. CONSTRUCTOR DINÁMICO DE FORMULARIOS MULTI-FLUJO (NUEVO V5.19.1)
// ==========================================
function abrirModalFormulario(esquema) {
    const form = document.getElementById('formulario-dinamico');
    form.innerHTML = ''; 
    const camposConQR = []; 

    // 1. INYECTAMOS EL SELECTOR MAESTRO DE FLUJO AL TOPE DEL FORMULARIO
    form.innerHTML += `
        <div class="mb-2 pb-5 border-b border-slate-700/60">
            <label class="block text-sm font-bold text-blue-400 mb-2"><i class="fa-solid fa-route mr-2"></i>Clasificación del Acceso</label>
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

    // 2. ESCUCHADOR DINÁMICO: Cuando el guardia cambia de B2B a Delivery, por ejemplo.
    selectorFlujo.addEventListener('change', (e) => {
        const flujoSeleccionado = e.target.value;
        contenedorCampos.innerHTML = ''; // Limpiamos campos previos
        contenedorCampos.classList.remove('hidden');
        camposConQR.length = 0; // Vaciamos el buffer de QRs

        // 3. RECORRIDO DEL ESQUEMA ORIGINAL MUTANDO SEGÚN EL FLUJO
        esquema.esquema_base_datos.campos.forEach(campo => {
            if (campo.tipo === 'fecha_hora_automatica') return;

            let mostrarCampo = true;
            let etiquetaPersonalizada = campo.etiqueta;
            let esObligatorio = campo.obligatorio;

            // ---- LÓGICA DE MUTACIÓN BIZ-RULES ----
            if (flujoSeleccionado === 'delivery') {
                if (campo.id === 'recurso') { mostrarCampo = false; } // No aplican salas a Ubers
                if (campo.id === 'empresa_area') { etiquetaPersonalizada = 'Plataforma (Uber, Rappi, etc)'; }
                if (campo.id === 'motivo') { mostrarCampo = false; } // Asumimos que el motivo es "Entrega"
            } 
            else if (flujoSeleccionado === 'residencial') {
                if (campo.id === 'recurso') { etiquetaPersonalizada = 'Unidad / Departamento Destino'; }
                if (campo.id === 'empresa_area') { mostrarCampo = false; } // Las visitas de amigos no traen empresa
            } 
            else if (flujoSeleccionado === 'proveedor') {
                if (campo.id === 'recurso') { etiquetaPersonalizada = 'Área de Trabajo / Unidad'; }
                if (campo.id === 'empresa_area') { etiquetaPersonalizada = 'Empresa Contratista'; }
            }
            // Si es 'b2b', pasa tal cual viene de la base de datos sin mutar.

            // Si la regla de negocio dice que se oculte, saltamos la renderización de este input
            if (!mostrarCampo) return; 

            // ---- RENDERIZADO DEL INPUT HTML ----
            let inputHtml = '';
            const req = esObligatorio ? 'required' : '';
            const baseClass = "w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 mt-1 text-sm shadow-inner transition-all";

            switch (campo.tipo) {
                case 'texto':
                    inputHtml = `<input type="text" id="campo_${campo.id}" name="${campo.id}" class="${baseClass}" ${req}>`;
                    break;
                case 'selector':
                    let opts = campo.opciones.map(op => `<option value="${op}">${op}</option>`).join('');
                    inputHtml = `<select id="campo_${campo.id}" name="${campo.id}" class="${baseClass} appearance-none" ${req}><option value="" disabled selected>Selecciona una opción...</option>${opts}</select>`;
                    break;
                case 'texto_qr':
                    camposConQR.push(campo.id);
                    inputHtml = `
                        <div class="relative">
                            <input type="text" id="campo_${campo.id}" name="${campo.id}" class="${baseClass} pr-10 font-mono text-blue-300" placeholder="Escanear o teclear..." ${req}>
                            <button type="button" id="btn_scan_${campo.id}" class="absolute right-2 top-[12px] text-slate-400 hover:text-blue-400 p-1 bg-slate-800 rounded border border-slate-600 shadow-md transition-colors" title="Abrir Escáner">
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
                    <label class="block text-sm font-medium text-slate-300">${etiquetaPersonalizada} ${esObligatorio ? '<span class="text-red-500">*</span>' : ''}</label>
                    ${inputHtml}
                </div>`;
        });

        // 4. Reactivar listeners de escáner QR para los campos que sí sobrevivieron al filtro
        camposConQR.forEach(id => {
            document.getElementById(`btn_scan_${id}`).addEventListener('click', () => toggleEscanerQR(id));
        });
    });

    document.getElementById('modal-dinamico').classList.remove('hidden');
}

/**
 * ==========================================
 * 5. CEREBRO DE VISIÓN ARTIFICIAL (V6.0 - Multi-tenant)
 * ==========================================
 */
function toggleEscanerQR(campoId) {
    if (!window.Html5Qrcode) {
        alert("La librería de visión artificial aún está cargando...");
        return;
    }

    const readerId = `reader_${campoId}`;
    const readerDiv = document.getElementById(readerId);
    const btnScan = document.getElementById(`btn_scan_${campoId}`);

    if (escannerActivo) {
        escannerActivo.stop().then(() => {
            escannerActivo = null;
            readerDiv.classList.add('hidden');
            btnScan.innerHTML = '<i class="fa-solid fa-qrcode text-lg"></i>';
            btnScan.classList.replace('text-red-400', 'text-slate-400');
        });
        return;
    }

    readerDiv.classList.remove('hidden');
    btnScan.innerHTML = '<i class="fa-solid fa-xmark text-lg"></i>';
    btnScan.classList.replace('text-slate-400', 'text-red-400');

    escannerActivo = new Html5Qrcode(readerId);
    const configParams = { fps: 10, qrbox: { width: 250, height: 250 } };

    escannerActivo.start(
        { facingMode: "environment" },
        configParams,
        async (textoDecodificado) => {
            
            // --- VALIDACIÓN DE SEGURIDAD DINÁMICA ---
            if (blockedUsersGlobal.includes(textoDecodificado.trim())) {
                const audioAlerta = new Audio('https://www.soundjay.com/buttons/button-10.mp3');
                audioAlerta.play();
                alert("🚫 ALERTA: Este usuario se encuentra en la LISTA NEGRA. Acceso Denegado.");
                
                // NOTA: En la fase final, esto también debería ser una Cloud Function
                // Por ahora, usamos la variable dinámica condominioIdActual
                console.warn(`Intento de acceso bloqueado en ${condominioIdActual}`);
                return;
            }

            const inputTarget = document.getElementById(`campo_${campoId}`);
            const audio = new Audio('https://www.soundjay.com/buttons/beep-07a.mp3');
            audio.volume = 0.5;
            audio.play().catch(e => console.log("Audio bloqueado"));

            inputTarget.value = textoDecodificado;
            inputTarget.classList.add('ring-2', 'ring-green-500', 'bg-green-900/30', 'text-green-300');
            setTimeout(() => inputTarget.classList.remove('ring-2', 'ring-green-500', 'bg-green-900/30', 'text-green-300'), 2000);

            escannerActivo.stop().then(() => {
                escannerActivo = null;
                readerDiv.classList.add('hidden');
                btnScan.innerHTML = '<i class="fa-solid fa-qrcode text-lg"></i>';
                btnScan.classList.replace('text-red-400', 'text-slate-400');
            });
        },
        (errorLectura) => { }
    ).catch(err => {
        console.error(err);
        readerDiv.classList.add('hidden');
        escannerActivo = null;
    });
}

function cerrarModal() {
    if (escannerActivo) {
        escannerActivo.stop().then(() => { escannerActivo = null; }).catch(e => console.error(e));
    }
    document.getElementById('modal-dinamico').classList.add('hidden');
}

/**
 * ==========================================
 * 6. PERSISTENCIA SEGURA (V6.0 - Cloud Authority)
 * ==========================================
 * Esta sección reemplaza la escritura directa por llamadas al Backend.
 */
async function guardarNuevoRegistro(e, esquema) {
    e.preventDefault();
    
    // 1. Validación de Flujo (Obligatorio)
    const selectorFlujo = document.getElementById('selector-tipo-flujo');
    if (selectorFlujo && !selectorFlujo.value) {
        alert("Por favor, selecciona primero la Clasificación del Acceso.");
        return;
    }

    const btnSubmit = document.querySelector('button[form="formulario-dinamico"]');
    const originalHTML = btnSubmit.innerHTML;
    
    // 2. Bloqueo de UI
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> VALIDANDO EN NUBE...';

    try {
        const formData = new FormData(e.target);
        const payload = {
            tipo_flujo: selectorFlujo.value,
            modulo_origen: esquema.modulo_id
        };

        // Mapeo dinámico de campos del esquema
        esquema.esquema_base_datos.campos.forEach(campo => {
            // No enviamos el timestamp desde aquí, lo pondrá la Cloud Function por seguridad
            if (campo.tipo !== 'fecha_hora_automatica' && campo.id !== 'fecha_hora') {
                payload[campo.id] = formData.get(campo.id) || "—";
            }
        });

        // 3. LLAMADA AL BACKEND ENTERPRISE
        const crearAccesoFn = httpsCallable(functions, 'crearAcceso');
        
        console.info(`📡 Sincronizando con Tenant: ${condominioIdActual}...`);
        
        const resultado = await crearAccesoFn({
            condominioId: condominioIdActual,
            moduloId: esquema.modulo_id,
            payload: payload
        });

        const { status, id, message } = resultado.data;

        if (status === 'success' || status === 'created' || status === 'updated') {
            console.log("✅ Operación exitosa en servidor.");
            btnSubmit.className = "bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold";
            btnSubmit.innerHTML = '<i class="fa-solid fa-check mr-2"></i> COMPLETADO';

            setTimeout(() => {
                cerrarModal();
                e.target.reset();
            }, 1000);
        } else if (status === 'blocked') {
            alert(`🚨 ACCESO DENEGADO: ${message}`);
            btnSubmit.className = "bg-red-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold";
            btnSubmit.innerHTML = '<i class="fa-solid fa-hand mr-2"></i> BLOQUEADO';
        }

    } catch (error) {
        console.error("❌ Error de conectividad con Backend:", error);
        alert("Fallo en la comunicación segura: " + error.message);
    } finally {
        setTimeout(() => {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = originalHTML;
            btnSubmit.className = "bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-lg flex items-center justify-center gap-2";
        }, 2000);
    }
}
/**
 * ==========================================
 * 7. SINCRONIZACIÓN EN VIVO Y RENDERIZADO (V6.0 - Multi-tenant Heart)
 * ==========================================
 * Esta sección controla la escucha en tiempo real, filtrada estrictamente por Condominio.
 * Integra: NOC Intelligence, POSIQ Detector, Overstay Alerts y Multi-tenant Security.
 */
function conectarDatosEnVivo(esquema) {
    if (unsubscribeSnapshot) unsubscribeSnapshot();

    const tbody = document.getElementById('tabla-cuerpo');
    const estadoVacio = document.getElementById('estado-vacio');
    const countActivosLabel = document.getElementById('count-activos');
    
    // --- SEGURIDAD MULTI-TENANT ---
    // La colección ahora cuelga directamente del condominioIdActual del usuario
    const registrosRef = collection(db, "gestia_records", condominioIdActual, esquema.modulo_id);
    const q = query(registrosRef, orderBy("creado_en", "desc"));

    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        tbody.innerHTML = ''; 
        let activosEnEdificio = 0;
        const ahora = new Date();
        
        if (snapshot.empty) {
            estadoVacio.classList.remove('hidden');
            if(countActivosLabel) countActivosLabel.innerText = "0";
            return;
        }

        estadoVacio.classList.add('hidden');

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const tr = document.createElement('tr');
            
            // --- 1. VARIABLES DE ESTADO OPERATIVO ---
            const tipoFlujo = data.tipo_flujo || 'b2b';
            const yaSalio = data.fecha_salida ? true : false;

            // --- 2. LÓGICA DE CONTADOR (NOC) ---
            if (!yaSalio) activosEnEdificio++;

            // --- 3. LÓGICA DE ALERTA DE PERMANENCIA (OVERSTAY) ---
            let alertaOverstay = false;
            if (!yaSalio && data.creado_en) {
                const entrada = data.creado_en.toDate();
                const minutosTranscurridos = (ahora - entrada) / (1000 * 60);
                
                // Reglas de negocio: 60m Delivery, 120m Visita, 240m Proveedor
                if (tipoFlujo === 'delivery' && minutosTranscurridos > 60) alertaOverstay = true;
                if (tipoFlujo === 'residencial' && minutosTranscurridos > 120) alertaOverstay = true;
                if (tipoFlujo === 'proveedor' && minutosTranscurridos > 240) alertaOverstay = true;
            }

            // --- 4. DETECTOR DE PRIORIDAD POSIQ (SENSITIVE) ---
            const txtEmpresa = (data.empresa_area || "").toUpperCase();
            const txtRecurso = (data.recurso || "").toUpperCase();
            const esPOSIQ = txtEmpresa.includes("POSIQ") || 
                           txtRecurso.includes("ESTUDIO") || 
                           data.prioridad_alta === true;
            
            // --- 5. CONSTRUCCIÓN VISUAL DE LA FILA ---
            let clasesFila = "hover:bg-slate-800/50 transition-all duration-200 group border-b border-slate-800/60 border-l-4 ";
            
            if (esPOSIQ) {
                clasesFila += "bg-red-900/20 border-l-red-600 "; // Alerta Roja (Seguridad)
            } else if (alertaOverstay) {
                clasesFila += "bg-amber-900/10 border-l-amber-500 animate-pulse-slow "; // Alerta Naranja (Permanencia)
            } else {
                let borderFlujo = "border-l-transparent"; 
                if (tipoFlujo === 'residencial') borderFlujo = "border-l-emerald-500/50";
                if (tipoFlujo === 'delivery') borderFlujo = "border-l-amber-500/50";
                if (tipoFlujo === 'proveedor') borderFlujo = "border-l-purple-500/50";
                clasesFila += borderFlujo;
            }

            // Atributos de estado para la terminal
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

            // --- 7. PANEL DE ACCIONES ---
            const tdAcciones = document.createElement('td');
            tdAcciones.className = "px-4 py-3 flex justify-end gap-2 items-center";
            
            // Botón Ver Detalle (Audit ready)
            const btnVer = document.createElement('button');
            btnVer.className = "text-slate-500 hover:text-blue-400 p-2 bg-slate-800 rounded-lg shadow-md border border-slate-700 transition-all active:scale-95 group/btn";
            btnVer.innerHTML = `<i class="fa-solid fa-eye text-xs group-hover/btn:scale-110"></i>`;
            btnVer.onclick = () => {
                const infoFormateada = formatearDetalleParaGuardia(data);
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
                        // Mantenemos registrarSalidaBD para el cierre de ciclo
                        await registrarSalidaBD(docSnap.id, esquema.modulo_id);
                    }
                };
                tdAcciones.appendChild(btnSalida);
            }

            tr.appendChild(tdAcciones);
            tbody.appendChild(tr);
        });

        // Actualizar contadores del Header (NOC Dashboard)
        if(countActivosLabel) countActivosLabel.innerText = activosEnEdificio;
        console.info(`📊 Sincronización Multi-tenant [${condominioIdActual}]: ${activosEnEdificio} activos.`);

    }, (error) => {
        console.error("❌ Error de suscripción multi-tenant:", error);
        tbody.innerHTML = `<tr><td colspan="10" class="p-10 text-center"><p class="text-red-500 font-mono text-xs">FALLO_CONEXIÓN_TENANT: ${error.message}</p></td></tr>`;
    });
}

/**
 * --- Función de Filtrado de Activos ---
 * Muestra u oculta las filas según el estado del check-out.
 */
function filtrarActivos(soloActivos) {
    const filas = document.querySelectorAll('#tabla-cuerpo tr');
    filas.forEach(fila => {
        const yaSalio = fila.getAttribute('data-salida') === 'true';
        if (soloActivos && yaSalio) {
            fila.style.display = "none";
        } else {
            // Respeta el buscador de texto si hay términos ingresados
            const terminoBuscador = document.getElementById('buscador-trazabilidad').value.toLowerCase();
            if (fila.textContent.toLowerCase().includes(terminoBuscador)) {
                fila.style.display = "";
            }
        }
    });
}

/**
 * --- Función Auxiliar: Formateo de Datos Forense ---
 */
function formatearDetalleParaGuardia(data) {
    return Object.entries(data)
        .filter(([key]) => !['creado_por', 'creado_en', 'modulo_origen', 'prioridad_alta', 'color_alerta', 'tipo_flujo', 'estatus_acceso', 'condominioId'].includes(key)) 
        .map(([key, val]) => {
            const label = key.replace(/_/g, ' ').toUpperCase();
            let valorAMostrar = val;

            if (val && typeof val === 'object' && val.seconds) {
                const d = val.toDate();
                valorAMostrar = d.toLocaleString('es-MX', { 
                    day: '2-digit', month: 'short', year: 'numeric', 
                    hour: '2-digit', minute: '2-digit', second: '2-digit' 
                });
            }
            return `🔹 ${label}: ${valorAMostrar}`;
        }).join('\n');
}
