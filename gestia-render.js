import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, doc, getDoc, addDoc, onSnapshot, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Variable global para almacenar el listener y evitar fugas de memoria
let unsubscribeSnapshot = null;

// ==========================================
// 1. INICIALIZADOR DEL MOTOR DE RENDERIZADO
// ==========================================
export async function initGestiaRender(moduloId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`GestiaRender: Contenedor HTML con id '${containerId}' no encontrado.`);
        return;
    }

    // Mostrar spinner de carga con estilo GestiaPremium
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center p-10 h-full">
            <i class="fa-solid fa-circle-notch fa-spin text-4xl text-gestia-primary mb-4"></i>
            <p class="text-slate-400 font-mono text-sm animate-pulse">Cargando módulo dinámico...</p>
        </div>
    `;

    // Validar sesión estricta V5.18 antes de inyectar nada
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            container.innerHTML = `<div class="p-5 text-red-400 bg-red-900/20 rounded-lg border border-red-800">Error: Sesión no válida o expirada.</div>`;
            return;
        }

        try {
            // Obtener el molde (JSON) de la base de datos
            const moduloRef = doc(db, "gestia_system_modules", moduloId);
            const moduloSnap = await getDoc(moduloRef);

            if (!moduloSnap.exists()) {
                container.innerHTML = `<div class="p-5 text-red-400 bg-red-900/20 rounded-lg border border-red-800 shadow-lg">Error: El módulo '${moduloId}' no existe en la arquitectura del sistema. Verifica la Terminal Heberto.</div>`;
                return;
            }

            const esquemaModulo = moduloSnap.data();

            // Validar si el usuario actual tiene permisos para ver esto
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            const userRol = userSnap.exists() ? userSnap.data().rol : null;

            if (userRol !== 'super_admin' && userRol !== 'ceo' && userRol !== 'admin' && (!esquemaModulo.seguridad_roles || !esquemaModulo.seguridad_roles.includes(userRol))) {
                container.innerHTML = `<div class="p-5 text-orange-400 bg-orange-900/20 rounded-lg border border-orange-800 shadow-lg">
                    <i class="fa-solid fa-lock mr-2"></i> Acceso denegado: Tu rol (${userRol}) no tiene permisos para abrir este módulo.
                </div>`;
                return;
            }

            // Si pasa seguridad, construimos el HTML y conectamos la DB
            renderizarUIBase(esquemaModulo, container);
            conectarDatosEnVivo(esquemaModulo);

        } catch (error) {
            console.error("Error inicializando GestiaRender:", error);
            container.innerHTML = `<div class="p-5 text-red-400 bg-red-900/20 rounded-lg border border-red-800">Error crítico del motor: ${error.message}</div>`;
        }
    });
}

// ==========================================
// 2. CONSTRUCTOR DE INTERFAZ (UI BUILDER)
// ==========================================
function renderizarUIBase(esquema, container) {
    const tieneBotonCrear = esquema.esquema_interfaz.acciones_permitidas.includes("crear");
    
    // Inyectamos el cascarón de la tabla y el modal oculto
    container.innerHTML = `
        <div class="bg-slate-900 rounded-xl border border-slate-700 shadow-xl overflow-hidden flex flex-col h-full w-full relative">
            
            <div class="bg-slate-800 border-b border-slate-700 p-4 flex justify-between items-center z-10 shadow-md">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                        <i class="fa-solid fa-${esquema.icono || 'cube'} text-blue-400 text-lg"></i>
                    </div>
                    <div>
                        <h2 class="text-lg font-bold text-white">${esquema.nombre_display}</h2>
                        <p class="text-xs text-slate-400">${esquema.descripcion}</p>
                    </div>
                </div>
                ${tieneBotonCrear ? `
                <button id="btn-crear-registro" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20">
                    <i class="fa-solid fa-plus"></i> Nuevo Registro
                </button>
                ` : ''}
            </div>

            <div class="flex-1 overflow-auto bg-[#0d1117] relative">
                <table class="w-full text-left border-collapse min-w-max">
                    <thead class="bg-slate-800/90 sticky top-0 backdrop-blur-sm z-10 border-b border-slate-700">
                        <tr id="tabla-cabeceras">
                            </tr>
                    </thead>
                    <tbody id="tabla-cuerpo" class="divide-y divide-slate-800/60 text-sm">
                        </tbody>
                </table>
                <div id="estado-vacio" class="hidden absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                    <i class="fa-solid fa-folder-open text-4xl mb-3 opacity-30"></i>
                    <p class="font-mono text-sm">Base de datos en blanco.</p>
                </div>
            </div>

            <div id="modal-dinamico" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity">
                <div class="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] animate-fade-in">
                    <div class="p-5 border-b border-slate-700 flex justify-between items-center">
                        <h3 class="text-lg font-bold text-white flex items-center gap-2">
                            <i class="fa-solid fa-plus text-blue-400"></i> Agregar: ${esquema.nombre_display}
                        </h3>
                        <button id="btn-cerrar-modal" class="text-slate-400 hover:text-white transition-colors">
                            <i class="fa-solid fa-xmark text-xl"></i>
                        </button>
                    </div>
                    <div class="p-5 overflow-y-auto">
                        <form id="formulario-dinamico" class="flex flex-col gap-4">
                            </form>
                    </div>
                    <div class="p-5 border-t border-slate-700 flex justify-end gap-3 bg-slate-800/50 rounded-b-2xl">
                        <button type="button" id="btn-cancelar-modal" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors border border-transparent hover:border-slate-600">Cancelar</button>
                        <button type="submit" form="formulario-dinamico" class="px-5 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-lg shadow-blue-500/20 flex items-center gap-2">
                            <i class="fa-solid fa-floppy-disk"></i> Guardar en BD
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 1. Dibujar Cabeceras de la Tabla leyendo el JSON
    const trCabeceras = document.getElementById('tabla-cabeceras');
    esquema.esquema_base_datos.campos.forEach(campo => {
        trCabeceras.innerHTML += `<th class="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">${campo.etiqueta}</th>`;
    });
    // Agregamos una columna extra visual para botones de acción
    trCabeceras.innerHTML += `<th class="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Acciones</th>`;

    // 2. Conectar eventos a los botones si el usuario tiene permiso de Crear
    if (tieneBotonCrear) {
        document.getElementById('btn-crear-registro').addEventListener('click', () => abrirModalFormulario(esquema));
        document.getElementById('btn-cerrar-modal').addEventListener('click', cerrarModal);
        document.getElementById('btn-cancelar-modal').addEventListener('click', cerrarModal);
        document.getElementById('formulario-dinamico').addEventListener('submit', (e) => guardarNuevoRegistro(e, esquema));
    }
}

// ==========================================
// 3. CONSTRUCTOR DE FORMULARIOS (FORM BUILDER)
// ==========================================
function abrirModalFormulario(esquema) {
    const form = document.getElementById('formulario-dinamico');
    form.innerHTML = ''; // Limpiamos la basura anterior

    esquema.esquema_base_datos.campos.forEach(campo => {
        // Ignorar campos automáticos de backend (ej. Timestamp del sistema)
        if (campo.tipo === 'fecha_hora_automatica') return;

        let inputHtml = '';
        const requiredAttr = campo.obligatorio ? 'required' : '';
        const baseInputClasses = "w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors mt-1 text-sm shadow-inner";

        // Lógica de "Lego" para construir inputs según el tipo de dato
        switch (campo.tipo) {
            case 'texto':
                inputHtml = `<input type="text" id="campo_${campo.id}" name="${campo.id}" class="${baseInputClasses}" ${requiredAttr}>`;
                break;
            case 'selector':
                let opcionesHtml = campo.opciones.map(op => `<option value="${op}">${op}</option>`).join('');
                inputHtml = `
                    <select id="campo_${campo.id}" name="${campo.id}" class="${baseInputClasses} appearance-none" ${requiredAttr}>
                        <option value="" disabled selected>Selecciona una opción...</option>
                        ${opcionesHtml}
                    </select>
                `;
                break;
            case 'texto_qr':
                inputHtml = `
                    <div class="relative">
                        <input type="text" id="campo_${campo.id}" name="${campo.id}" class="${baseInputClasses} pr-10" placeholder="Escribe el código o usa el botón de escáner..." ${requiredAttr}>
                        <button type="button" class="absolute right-2 top-[12px] text-blue-400 hover:text-blue-300 p-1" onclick="alert('Módulo de cámara en desarrollo. Siguiente frijolito.')" title="Escanear QR">
                            <i class="fa-solid fa-qrcode text-lg"></i>
                        </button>
                    </div>
                `;
                break;
            default:
                inputHtml = `<input type="text" id="campo_${campo.id}" name="${campo.id}" class="${baseInputClasses}" ${requiredAttr}>`;
        }

        form.innerHTML += `
            <div>
                <label for="campo_${campo.id}" class="block text-sm font-medium text-slate-300">
                    ${campo.etiqueta} ${campo.obligatorio ? '<span class="text-red-400">*</span>' : ''}
                </label>
                ${inputHtml}
            </div>
        `;
    });

    document.getElementById('modal-dinamico').classList.remove('hidden');
}

function cerrarModal() {
    document.getElementById('modal-dinamico').classList.add('hidden');
}

// ==========================================
// 4. LÓGICA DE BASE DE DATOS (LECTURA/ESCRITURA V2.0)
// ==========================================
async function guardarNuevoRegistro(e, esquema) {
    e.preventDefault();
    const form = e.target;
    const btnSubmit = document.querySelector('button[form="formulario-dinamico"]');
    
    // UI de carga
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

    try {
        const formData = new FormData(form);
        const dataToSave = {
            creado_por: auth.currentUser.uid,
            creado_en: serverTimestamp() // Sello de tiempo maestro de Firebase
        };

        // Extraer los datos mapeándolos contra el esquema JSON
        esquema.esquema_base_datos.campos.forEach(campo => {
            if (campo.tipo === 'fecha_hora_automatica') {
                dataToSave[campo.id] = serverTimestamp(); 
            } else {
                dataToSave[campo.id] = formData.get(campo.id) || null;
            }
        });

        // Guardar bajo la ruta maestra que blindamos en las Reglas de Seguridad
        const coleccionDestino = collection(db, "gestia_dynamic_data", esquema.modulo_id, "registros");
        await addDoc(coleccionDestino, dataToSave);

        cerrarModal();
        form.reset();

    } catch (error) {
        console.error("Error guardando registro:", error);
        alert("Error al guardar en BD: " + error.message);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar en BD';
    }
}

function conectarDatosEnVivo(esquema) {
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot(); // Mata el listener viejo si abres otro módulo
    }

    const tbody = document.getElementById('tabla-cuerpo');
    const estadoVacio = document.getElementById('estado-vacio');
    
    // Consulta en tiempo real a la colección protegida
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
            tr.className = "hover:bg-slate-800/50 transition-colors group";

            // Imprimir celda por celda según lo pida el molde
            esquema.esquema_base_datos.campos.forEach(campo => {
                let valorFormateado = "<span class='text-slate-600'>—</span>";
                
                if (data[campo.id]) {
                    if (campo.tipo === 'fecha_hora_automatica') {
                        // Formatear Firestore Timestamp a Fecha Legible
                        const date = data[campo.id].toDate ? data[campo.id].toDate() : new Date();
                        valorFormateado = new Intl.DateTimeFormat('es-MX', { 
                            day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit' 
                        }).format(date);
                    } else if (campo.tipo === 'selector') {
                        // Badge visual para los selectores
                        valorFormateado = `<span class="bg-blue-900/30 text-blue-300 border border-blue-800/50 px-2 py-1 rounded shadow-inner text-xs font-semibold uppercase tracking-wide">${data[campo.id]}</span>`;
                    } else {
                        // Texto normal
                        valorFormateado = data[campo.id];
                    }
                }

                tr.innerHTML += `<td class="px-4 py-3 text-slate-300 whitespace-nowrap">${valorFormateado}</td>`;
            });

            // Columna extra de acciones por registro
            tr.innerHTML += `
                <td class="px-4 py-3 text-right whitespace-nowrap">
                    <button class="text-slate-500 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100 p-1 bg-slate-800 rounded shadow-md border border-slate-700" title="Ver Detalles">
                        <i class="fa-solid fa-eye text-xs"></i>
                    </button>
                </td>
            `;

            tbody.appendChild(tr);
        });
    }, (error) => {
        console.error("Error leyendo datos en tiempo real:", error);
        // Si falta un índice compuesto en Firestore, este error te lo avisa aquí
        tbody.innerHTML = `<tr><td colspan="10" class="text-center p-6 text-red-400 border border-red-900/50 bg-red-900/10 rounded-lg"><i class="fa-solid fa-triangle-exclamation mb-2 text-2xl"></i><br>Error cargando datos. Revisa la consola o los índices de Firestore.</td></tr>`;
    });
}
