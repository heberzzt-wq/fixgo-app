import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, 
    doc, 
    getDoc, 
    addDoc, 
    onSnapshot, 
    serverTimestamp, 
    query, 
    orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// VARIABLES GLOBALES DEL MOTOR
// ==========================================
let unsubscribeSnapshot = null;
let escannerActivo = null; 
let blockedUsersGlobal = []; // Buffer de seguridad para validación instantánea

// ==========================================
// 1. INICIALIZADOR DEL MOTOR DE RENDERIZADO
// ==========================================
export async function initGestiaRender(moduloId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Inyectar librería de escáner QR silenciosamente en el fondo
    if (!document.getElementById('html5-qr-script')) {
        const script = document.createElement('script');
        script.id = 'html5-qr-script';
        script.src = 'https://unpkg.com/html5-qrcode';
        document.head.appendChild(script);
    }

    // Pantalla de carga profesional
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center p-10 h-full">
            <i class="fa-solid fa-circle-notch fa-spin text-4xl text-gestia-primary mb-4"></i>
            <p class="text-slate-400 font-mono text-sm animate-pulse">Sincronizando Módulos de Seguridad V5.19.1...</p>
        </div>
    `;

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            container.innerHTML = `
                <div class="p-5 text-red-400 bg-red-900/20 rounded-lg border border-red-800 shadow-2xl">
                    <i class="fa-solid fa-user-slash mr-2"></i> Error: Sesión no válida o expirada.
                </div>`;
            return;
        }

        try {
            // 1. Obtener el Molde de la Arquitectura
            const moduloRef = doc(db, "gestia_system_modules", moduloId);
            const moduloSnap = await getDoc(moduloRef);

            if (!moduloSnap.exists()) {
                container.innerHTML = `
                    <div class="p-5 text-red-400 bg-red-900/20 rounded-lg border border-red-800">
                        <i class="fa-solid fa-triangle-exclamation mr-2"></i> Error: El módulo '${moduloId}' no existe. 
                        Verifica la inyección en la Terminal Heberto.
                    </div>`;
                return;
            }

            const esquemaModulo = moduloSnap.data();

            // 2. Cargar Lista Negra del Condominio (UXMAL39 por defecto en Fase 1)
            const condoRef = doc(db, "condominios", "UXMAL39"); 
            onSnapshot(condoRef, (snap) => {
                if(snap.exists()) {
                    blockedUsersGlobal = snap.data().blockedUsers || [];
                    console.log("🛡️ Lista Negra Sincronizada: ", blockedUsersGlobal.length, " registros.");
                }
            });

            // 3. Obtener Datos del Usuario (Seguridad de Roles Original)
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            const userRol = userSnap.exists() ? userSnap.data().rol : null;

            // EL CADENERO CON TU VIP (Mantengo tu lógica original de roles)
            const rolesAutorizados = esquemaModulo.seguridad_roles || [];
            const esAdmin = ['super_admin', 'ceo', 'admin'].includes(userRol);

            if (!esAdmin && !rolesAutorizados.includes(userRol)) {
                container.innerHTML = `
                    <div class="p-5 text-orange-400 bg-orange-900/20 rounded-lg border border-orange-800 shadow-lg">
                        <i class="fa-solid fa-lock mr-2"></i> Acceso denegado: Tu rol (${userRol}) no tiene permisos.
                    </div>`;
                return;
            }

            // 4. Renderizado de Capas
            renderizarUIBase(esquemaModulo, container);
            conectarDatosEnVivo(esquemaModulo);
            
            // 5. Inyección de Módulos Pro de Fase 1
            inyectarWidgetsSeguridad(esquemaModulo);

        } catch (error) {
            console.error("Error inicializando GestiaRender:", error);
            container.innerHTML = `<div class="p-5 text-red-400 bg-red-900/20 rounded-lg border border-red-800">Error crítico: ${error.message}</div>`;
        }
    });
}

// ==========================================
// 2. CONSTRUCTOR DE INTERFAZ (UI BUILDER)
// ==========================================
function renderizarUIBase(esquema, container) {
    const tieneBotonCrear = esquema.esquema_interfaz?.acciones_permitidas?.includes("crear");
    
    // Mantenemos tu estructura de tabla completa y profesional
    container.innerHTML = `
        <div class="bg-slate-900 rounded-xl border border-slate-700 shadow-xl overflow-hidden flex flex-col h-full w-full relative">
            
            <div class="bg-slate-800 border-b border-slate-700 p-4 flex justify-between items-center z-10 shadow-md">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                        <i class="fa-solid fa-${esquema.icono || 'cube'} text-blue-400 text-lg"></i>
                    </div>
                    <div>
                        <h2 class="text-lg font-bold text-white uppercase tracking-wide">${esquema.nombre_display}</h2>
                        <p class="text-xs text-slate-400">${esquema.descripcion}</p>
                    </div>
                </div>
                ${tieneBotonCrear ? `
                <button id="btn-crear-registro" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20">
                    <i class="fa-solid fa-plus"></i> Nuevo Registro
                </button>
                ` : ''}
            </div>

            <div class="flex-1 flex overflow-hidden bg-[#0d1117] relative">
                
                <div class="flex-1 overflow-auto custom-scrollbar">
                    <table class="w-full text-left border-collapse min-w-max">
                        <thead class="bg-slate-800/90 sticky top-0 backdrop-blur-sm z-10 border-b border-slate-700">
                            <tr id="tabla-cabeceras"></tr>
                        </thead>
                        <tbody id="tabla-cuerpo" class="divide-y divide-slate-800/60 text-sm"></tbody>
                    </table>
                    
                    <div id="estado-vacio" class="hidden absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none">
                        <i class="fa-solid fa-folder-open text-4xl mb-3 opacity-30"></i>
                        <p class="font-mono text-sm uppercase tracking-widest">Sin registros en la unidad</p>
                    </div>
                </div>

                <div id="panel-derecho-pro" class="hidden lg:flex w-80 bg-slate-900 border-l border-slate-700 flex-col p-4 space-y-4 shadow-2xl z-20 overflow-y-auto">
                    <div class="flex items-center gap-2 text-blue-400 font-bold text-sm border-b border-slate-700 pb-2">
                        <i class="fa-solid fa-box-archive"></i> GESTIÓN DE PAQUETES
                    </div>
                    <div id="form-paqueteria-container"></div>
                </div>
            </div>

            <div id="contenedor-panico-flotante"></div>

            <div id="modal-dinamico" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity">
                <div class="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] animate-fade-in">
                    <div class="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800/80 rounded-t-2xl">
                        <h3 class="text-lg font-bold text-white flex items-center gap-2">
                            <i class="fa-solid fa-bolt text-blue-400"></i> Control de Acceso
                        </h3>
                        <button id="btn-cerrar-modal" class="text-slate-400 hover:text-white transition-colors">
                            <i class="fa-solid fa-xmark text-xl"></i>
                        </button>
                    </div>
                    <div class="p-5 overflow-y-auto custom-scrollbar">
                        <form id="formulario-dinamico" class="flex flex-col gap-4"></form>
                    </div>
                    <div class="p-5 border-t border-slate-700 flex justify-end gap-3 bg-slate-900/50 rounded-b-2xl">
                        <button type="button" id="btn-cancelar-modal" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors">Cancelar</button>
                        <button type="submit" form="formulario-dinamico" class="px-5 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-lg flex items-center gap-2">
                            <i class="fa-solid fa-floppy-disk"></i> Guardar en BD
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 1. Renderizar Cabeceras Originales
    const trCabeceras = document.getElementById('tabla-cabeceras');
    esquema.esquema_base_datos.campos.forEach(campo => {
        trCabeceras.innerHTML += `<th class="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">${campo.etiqueta}</th>`;
    });
    trCabeceras.innerHTML += `<th class="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right font-mono">Acciones</th>`;

    // 2. Event Listeners Originales
    if (tieneBotonCrear) {
        document.getElementById('btn-crear-registro').addEventListener('click', () => abrirModalFormulario(esquema));
        document.getElementById('btn-cerrar-modal').addEventListener('click', cerrarModal);
        document.getElementById('btn-cancelar-modal').addEventListener('click', cerrarModal);
        document.getElementById('formulario-dinamico').addEventListener('submit', (e) => guardarNuevoRegistro(e, esquema));
    }
}

// ==========================================
// 3. INYECCIÓN DE COMPONENTES DE SEGURIDAD (FASE 1)
// ==========================================
function inyectarWidgetsSeguridad(esquema) {
    // 1. Botón de Pánico Profesional
    const panicContainer = document.getElementById('contenedor-panico-flotante');
    panicContainer.innerHTML = `
        <button id="btn-panico-pro" class="fixed bottom-6 right-6 p-6 bg-red-700 text-white rounded-full shadow-[0_0_30px_rgba(185,28,28,0.5)] hover:bg-red-600 active:scale-90 transition-all z-[60] border-4 border-red-900/40 group overflow-hidden">
            <div class="absolute inset-0 bg-white/10 animate-ping opacity-20"></div>
            <i class="fa-solid fa-shield-run text-2xl group-hover:rotate-12 transition-transform"></i>
        </button>
    `;

    document.getElementById('btn-panico-pro').onclick = async () => {
        const confirmacion = confirm("🚨 ¿Deseas disparar una ALERTA DE PÁNICO inmediata al NOC?");
        if (!confirmacion) return;

        try {
            await addDoc(collection(db, "panicAlerts"), {
                timestamp: serverTimestamp(),
                status: "active",
                notified: false,
                ubicacion: "Caseta de Vigilancia",
                creado_por: auth.currentUser.uid,
                condominioId: "UXMAL39"
            });
            alert("ALERTA ENVIADA. El equipo de seguridad ha sido notificado.");
        } catch (e) {
            console.error("Error pánico:", e);
        }
    };

    // 2. Formulario de Paquetería Lateral
    const pkgFormContainer = document.getElementById('form-paqueteria-container');
    pkgFormContainer.innerHTML = `
        <div class="space-y-4">
            <div class="flex flex-col gap-1">
                <label class="text-[10px] text-slate-500 font-bold uppercase">Unidad / Depto</label>
                <input id="pkg-unit" type="text" placeholder="Ej: 402" class="bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-white focus:border-blue-500 outline-none">
            </div>
            <div class="flex flex-col gap-1">
                <label class="text-[10px] text-slate-500 font-bold uppercase">Mensajería</label>
                <select id="pkg-courier" class="bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-white focus:border-blue-500 outline-none">
                    <option>Amazon</option>
                    <option>Mercado Libre</option>
                    <option>DHL / FedEx</option>
                    <option>Uber Eats / Rappi</option>
                </select>
            </div>
            <button id="btn-save-pkg" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-xs transition-all shadow-lg flex items-center justify-center gap-2">
                <i class="fa-solid fa-paper-plane"></i> NOTIFICAR RESIDENTE
            </button>
            <div class="p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                <p class="text-[9px] text-slate-500 leading-tight italic">
                    Al guardar, se enviará una notificación push automática al residente vinculado a la unidad.
                </p>
            </div>
        </div>
    `;

    document.getElementById('btn-save-pkg').onclick = async () => {
        const unitId = document.getElementById('pkg-unit').value;
        const courier = document.getElementById('pkg-courier').value;

        if(!unitId) return alert("Por favor, ingresa el número de unidad.");

        try {
            await addDoc(collection(db, "packages"), {
                unitId,
                courier,
                status: "recibido",
                timestamp: serverTimestamp(),
                notified: false,
                condominioId: "UXMAL39"
            });
            alert("✅ Registro exitoso. Residente notificado.");
            document.getElementById('pkg-unit').value = "";
        } catch (e) {
            alert("Error al registrar paquete.");
        }
    };
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

// ==========================================
// 5. CEREBRO DE VISIÓN ARTIFICIAL
// ==========================================
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
        (textoDecodificado) => {
            
            // --- INYECCIÓN DE SEGURIDAD V5.18 ---
            if (blockedUsersGlobal.includes(textoDecodificado.trim())) {
                const audioAlerta = new Audio('https://www.soundjay.com/buttons/button-10.mp3');
                audioAlerta.play();
                alert("🚫 ALERTA: Este usuario se encuentra en la LISTA NEGRA. Acceso Denegado.");
                
                addDoc(collection(db, "condominios/UXMAL39/logs_seguridad"), {
                    tipo: "acceso_denegado",
                    timestamp: serverTimestamp(),
                    description: `Intento de acceso de ID bloqueado: ${textoDecodificado}`,
                    reportedBy: auth.currentUser.uid
                });
                return;
            }
            // ------------------------------------

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
 * 5. LÓGICA DE BASE DE DATOS Y CONECTIVIDAD (FASE 2)
 * ==========================================
 */
async function guardarNuevoRegistro(e, esquema) {
    e.preventDefault();
    const btnSubmit = document.querySelector('button[form="formulario-dinamico"]');
    
    // Validación: obligar a elegir un flujo primero
    const selectorFlujo = document.getElementById('selector-tipo-flujo');
    if (selectorFlujo && !selectorFlujo.value) {
        alert("Por favor, selecciona primero la Clasificación del Acceso en la parte superior.");
        return;
    }

    // Bloqueo de re-envío
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> PROCESANDO...';

    try {
        const formData = new FormData(e.target);
        const dataToSave = {
            creado_por: auth.currentUser.uid,
            creado_en: serverTimestamp(),
            modulo_origen: esquema.modulo_id,
            tipo_flujo: selectorFlujo.value // Guardamos el tipo de flujo en la BD
        };

        // Mapeo dinámico: Si el campo no existía en el DOM (porque se ocultó por el flujo), formData.get devuelve null, y le asignamos "—"
        esquema.esquema_base_datos.campos.forEach(campo => {
            if (campo.tipo === 'fecha_hora_automatica' || campo.id === 'fecha_hora') {
                dataToSave[campo.id] = serverTimestamp(); 
            } else {
                dataToSave[campo.id] = formData.get(campo.id) || "—";
            }
        });

        // REGLA DE PRIORIDAD POSIQ (Pre-procesamiento)
        const empresaArea = (dataToSave.empresa_area || "").toLowerCase();
        if (empresaArea.includes("posiq")) {
            dataToSave.prioridad_alta = true;
            dataToSave.color_alerta = "RED";
        }

        const coleccionDestino = collection(db, "gestia_dynamic_data", esquema.modulo_id, "registros");
        await addDoc(coleccionDestino, dataToSave);

        console.log("✅ Registro Guardado con éxito en Firestore bajo flujo: " + selectorFlujo.value);
        cerrarModal();
        e.target.reset();

    } catch (error) {
        console.error("❌ Error guardando en BD:", error);
        alert("Error crítico al guardar: " + error.message);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="fa-solid fa-floppy-disk mr-2"></i> GUARDAR EN BD';
    }
}

/**
 * ==========================================
 * 6. SINCRONIZACIÓN EN VIVO Y RENDERIZADO DE TABLA
 * ==========================================
 */
function conectarDatosEnVivo(esquema) {
    if (unsubscribeSnapshot) unsubscribeSnapshot();

    const tbody = document.getElementById('tabla-cuerpo');
    const estadoVacio = document.getElementById('estado-vacio');
    
    const registrosRef = collection(db, "gestia_dynamic_data", esquema.modulo_id, "registros");
    const q = query(registrosRef, orderBy("creado_en", "desc"));

    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        tbody.innerHTML = ''; 
        
        if (snapshot.empty) {
            estadoVacio.classList.remove('hidden');
            return;
        }

        estadoVacio.classList.add('hidden');

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const tr = document.createElement('tr');
            
            // --- NUEVO: Extraemos el tipo de flujo ---
            const tipoFlujo = data.tipo_flujo || 'b2b';

            // --- DETECTOR DE PRIORIDAD POSIQ V5.19 (ULTRA-SENSIBLE) ---
            const txtEmpresa = (data.empresa_area || "").toUpperCase();
            const txtRecurso = (data.recurso || "").toUpperCase();
            const txtMotivo = (data.motivo || "").toUpperCase();
            
            const esPOSIQ = txtEmpresa.includes("POSIQ") || 
                           txtRecurso.includes("ESTUDIO") || 
                           data.prioridad_alta === true;
            
            // --- NUEVO: Lógica de colores del borde de fila según el flujo ---
            if (esPOSIQ) {
                tr.className = "bg-red-900/20 border-l-4 border-l-red-600 hover:bg-red-900/30 transition-all duration-200 group border-b border-slate-800/50";
            } else {
                let borderFlujo = "border-l-transparent"; // B2B Normal por defecto
                if (tipoFlujo === 'residencial') borderFlujo = "border-l-emerald-500/50";
                if (tipoFlujo === 'delivery') borderFlujo = "border-l-amber-500/50";
                if (tipoFlujo === 'proveedor') borderFlujo = "border-l-purple-500/50";
                
                tr.className = `hover:bg-slate-800/50 transition-colors group border-b border-slate-800/50 border-l-4 ${borderFlujo}`;
            }

            // Renderizado Dinámico de Columnas
            let isFirstColumn = true; // --- NUEVO: Bandera para el ícono ---

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
                        valorFinal = `<span class="${colorTag} border border-slate-700/50 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider shadow-inner">${data[campo.id]}</span>`;
                    } else if (campo.tipo === 'texto_qr') {
                        valorFinal = `<span class="font-mono text-xs ${esPOSIQ ? 'text-red-400' : 'text-emerald-400'} font-bold truncate block max-w-[120px]"><i class="fa-solid fa-qrcode mr-1"></i>${data[campo.id]}</span>`;
                    } else {
                        valorFinal = data[campo.id];
                    }
                }

                // --- NUEVO: Inyectar el icono indicador del flujo solo en la primera columna ---
                if (isFirstColumn) {
                    let iconHTML = '<i class="fa-solid fa-building text-blue-400 mr-2" title="B2B / Corporativo"></i>';
                    if (tipoFlujo === 'residencial') iconHTML = '<i class="fa-solid fa-house text-emerald-400 mr-2" title="Residencial"></i>';
                    if (tipoFlujo === 'delivery') iconHTML = '<i class="fa-solid fa-burger text-amber-400 mr-2" title="Delivery"></i>';
                    if (tipoFlujo === 'proveedor') iconHTML = '<i class="fa-solid fa-helmet-safety text-purple-400 mr-2" title="Proveedor"></i>';
                    
                    valorFinal = `<div class="flex items-center">${iconHTML} <span class="truncate">${valorFinal}</span></div>`;
                    isFirstColumn = false;
                }

                tr.innerHTML += `<td class="px-4 py-3 text-slate-300 whitespace-nowrap overflow-hidden text-ellipsis max-w-[180px]">${valorFinal}</td>`;
            });

            // --- ACCIONES: EL OJITO CON VIDA (V5.19) ---
            const tdAcciones = document.createElement('td');
            tdAcciones.className = "px-4 py-3 text-right";
            
            const btnVer = document.createElement('button');
            btnVer.className = "text-slate-500 hover:text-blue-400 p-2 bg-slate-800 rounded-lg shadow-md border border-slate-700 transition-all active:scale-95 group/btn";
            btnVer.innerHTML = `<i class="fa-solid fa-eye text-xs group-hover/btn:scale-110"></i>`;
            
            btnVer.onclick = () => {
                const infoFormateada = formatearDetalleParaGuardia(data);
                // --- NUEVO: Mostrar el flujo en el alert del ojito ---
                alert(`📋 DETALLE DEL ACCESO [Uxmal 39]\n----------------------------------\nFlujo: ${data.tipo_flujo ? data.tipo_flujo.toUpperCase() : 'B2B'}\n${infoFormateada}\n----------------------------------\nID: ${docSnap.id}`);
            };

            tdAcciones.appendChild(btnVer);
            tr.appendChild(tdAcciones);
            tbody.appendChild(tr);
        });

        console.log(`📊 Renderizado completo: ${snapshot.size} registros procesados.`);
    }, (error) => {
        console.error("❌ Error en la suscripción de datos:", error);
        tbody.innerHTML = `<tr><td colspan="10" class="p-10 text-center"><p class="text-red-500">Error: ${error.message}</p></td></tr>`;
    });
}

/**
 * Función Auxiliar: Formateo de Datos para el Detalle (Ojito)
 */
function formatearDetalleParaGuardia(data) {
    return Object.entries(data)
        .filter(([key]) => !['creado_por', 'creado_en', 'modulo_origen', 'prioridad_alta', 'color_alerta', 'tipo_flujo'].includes(key)) // --- NUEVO: ocultar tipo_flujo del map ---
        .map(([key, val]) => {
            const label = key.replace(/_/g, ' ').toUpperCase();
            let valorAMostrar = val;

            if (val && typeof val === 'object' && val.seconds) {
                const d = val.toDate();
                valorAMostrar = d.toLocaleString('es-MX', { 
                    day: '2-digit', month: 'long', year: 'numeric', 
                    hour: '2-digit', minute: '2-digit', second: '2-digit' 
                });
            }
            return `🔹 ${label}: ${valorAMostrar}`;
        }).join('\n');
}

// ==========================================
// FIN DEL MOTOR GESTIA-RENDER V5.19.2
// ==========================================
console.info("🚀 GestiaRender V5.19.2: Despliegue Multi-Flujo Finalizado con éxito.");
