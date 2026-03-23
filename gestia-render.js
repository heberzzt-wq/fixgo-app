import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, doc, getDoc, addDoc, onSnapshot, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Variables globales del motor
let unsubscribeSnapshot = null;
let escannerActivo = null; // Controla la cámara del QR

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

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center p-10 h-full">
            <i class="fa-solid fa-circle-notch fa-spin text-4xl text-gestia-primary mb-4"></i>
            <p class="text-slate-400 font-mono text-sm animate-pulse">Cargando módulo dinámico...</p>
        </div>
    `;

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            container.innerHTML = `<div class="p-5 text-red-400 bg-red-900/20 rounded-lg border border-red-800">Error: Sesión no válida.</div>`;
            return;
        }

        try {
            const moduloRef = doc(db, "gestia_system_modules", moduloId);
            const moduloSnap = await getDoc(moduloRef);

            if (!moduloSnap.exists()) {
                container.innerHTML = `<div class="p-5 text-red-400 bg-red-900/20 rounded-lg border border-red-800">Error: El módulo '${moduloId}' no existe en la arquitectura del sistema. Verifica la Terminal Heberto.</div>`;
                return;
            }

            const esquemaModulo = moduloSnap.data();
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            const userRol = userSnap.exists() ? userSnap.data().rol : null;

            // EL CADENERO CON TU VIP (admin)
            if (userRol !== 'super_admin' && userRol !== 'ceo' && userRol !== 'admin' && (!esquemaModulo.seguridad_roles || !esquemaModulo.seguridad_roles.includes(userRol))) {
                container.innerHTML = `<div class="p-5 text-orange-400 bg-orange-900/20 rounded-lg border border-orange-800 shadow-lg">
                    <i class="fa-solid fa-lock mr-2"></i> Acceso denegado: Tu rol (${userRol}) no tiene permisos para abrir este módulo.
                </div>`;
                return;
            }

            renderizarUIBase(esquemaModulo, container);
            conectarDatosEnVivo(esquemaModulo);

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
    const tieneBotonCrear = esquema.esquema_interfaz.acciones_permitidas.includes("crear");
    
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

            <div class="flex-1 overflow-auto bg-[#0d1117] relative">
                <table class="w-full text-left border-collapse min-w-max">
                    <thead class="bg-slate-800/90 sticky top-0 backdrop-blur-sm z-10 border-b border-slate-700">
                        <tr id="tabla-cabeceras"></tr>
                    </thead>
                    <tbody id="tabla-cuerpo" class="divide-y divide-slate-800/60 text-sm"></tbody>
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
                            <i class="fa-solid fa-bolt text-blue-400"></i> ${esquema.nombre_display}
                        </h3>
                        <button id="btn-cerrar-modal" class="text-slate-400 hover:text-white transition-colors">
                            <i class="fa-solid fa-xmark text-xl"></i>
                        </button>
                    </div>
                    <div class="p-5 overflow-y-auto">
                        <form id="formulario-dinamico" class="flex flex-col gap-4"></form>
                    </div>
                    <div class="p-5 border-t border-slate-700 flex justify-end gap-3 bg-slate-800/50 rounded-b-2xl">
                        <button type="button" id="btn-cancelar-modal" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-700 border border-transparent">Cancelar</button>
                        <button type="submit" form="formulario-dinamico" class="px-5 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-lg flex items-center gap-2">
                            <i class="fa-solid fa-floppy-disk"></i> Guardar en BD
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const trCabeceras = document.getElementById('tabla-cabeceras');
    esquema.esquema_base_datos.campos.forEach(campo => {
        trCabeceras.innerHTML += `<th class="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">${campo.etiqueta}</th>`;
    });
    trCabeceras.innerHTML += `<th class="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Acciones</th>`;

    if (tieneBotonCrear) {
        document.getElementById('btn-crear-registro').addEventListener('click', () => abrirModalFormulario(esquema));
        document.getElementById('btn-cerrar-modal').addEventListener('click', cerrarModal);
        document.getElementById('btn-cancelar-modal').addEventListener('click', cerrarModal);
        document.getElementById('formulario-dinamico').addEventListener('submit', (e) => guardarNuevoRegistro(e, esquema));
    }
}

// ==========================================
// 3. CONSTRUCTOR DE FORMULARIOS Y CÁMARA
// ==========================================
function abrirModalFormulario(esquema) {
    const form = document.getElementById('formulario-dinamico');
    form.innerHTML = ''; 
    const camposConQR = []; // Para saber a quién conectarle la cámara

    esquema.esquema_base_datos.campos.forEach(campo => {
        if (campo.tipo === 'fecha_hora_automatica') return;

        let inputHtml = '';
        const req = campo.obligatorio ? 'required' : '';
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

        form.innerHTML += `<div><label class="block text-sm font-medium text-slate-300">${campo.etiqueta} ${campo.obligatorio ? '<span class="text-red-400">*</span>' : ''}</label>${inputHtml}</div>`;
    });

    // Encender los listeners de los botones de cámara una vez que el HTML está inyectado
    camposConQR.forEach(id => {
        document.getElementById(`btn_scan_${id}`).addEventListener('click', () => toggleEscanerQR(id));
    });

    document.getElementById('modal-dinamico').classList.remove('hidden');
}

// 🧠 EL CEREBRO DE VISIÓN ARTIFICIAL (LPR BÁSICO)
function toggleEscanerQR(campoId) {
    if (!window.Html5Qrcode) {
        alert("La librería de visión artificial aún está cargando. Intenta de nuevo en 2 segundos.");
        return;
    }

    const readerId = `reader_${campoId}`;
    const readerDiv = document.getElementById(readerId);
    const btnScan = document.getElementById(`btn_scan_${campoId}`);

    // Si la cámara ya está prendida, la apagamos
    if (escannerActivo) {
        escannerActivo.stop().then(() => {
            escannerActivo = null;
            readerDiv.classList.add('hidden');
            btnScan.innerHTML = '<i class="fa-solid fa-qrcode text-lg"></i>';
            btnScan.classList.replace('text-red-400', 'text-slate-400');
        });
        return;
    }

    // Encender cámara
    readerDiv.classList.remove('hidden');
    btnScan.innerHTML = '<i class="fa-solid fa-xmark text-lg"></i>'; // Cambiar ícono a "Cerrar"
    btnScan.classList.replace('text-slate-400', 'text-red-400');

    escannerActivo = new Html5Qrcode(readerId);
    const configParams = { fps: 10, qrbox: { width: 250, height: 250 } };

    escannerActivo.start(
        { facingMode: "environment" }, // Prioriza la cámara trasera de la tablet/celular
        configParams,
        (textoDecodificado) => {
            // ¡QR DETECTADO CON ÉXITO!
            const inputTarget = document.getElementById(`campo_${campoId}`);
            
            // Sonido de éxito sutil (Beep de caseta)
            const audio = new Audio('https://www.soundjay.com/buttons/beep-07a.mp3');
            audio.volume = 0.5;
            audio.play().catch(e => console.log("Audio bloqueado por navegador"));

            // Inyectar el texto y darle un efecto verde chingón
            inputTarget.value = textoDecodificado;
            inputTarget.classList.add('ring-2', 'ring-green-500', 'bg-green-900/30', 'text-green-300');
            setTimeout(() => inputTarget.classList.remove('ring-2', 'ring-green-500', 'bg-green-900/30', 'text-green-300'), 2000);

            // Apagar cámara automáticamente
            escannerActivo.stop().then(() => {
                escannerActivo = null;
                readerDiv.classList.add('hidden');
                btnScan.innerHTML = '<i class="fa-solid fa-qrcode text-lg"></i>';
                btnScan.classList.replace('text-red-400', 'text-slate-400');
            });
        },
        (errorLectura) => { /* Silenciamos los errores de frame sin QR para no spamear la consola */ }
    ).catch(err => {
        console.error("Error arrancando la cámara:", err);
        alert("No se pudo encender la cámara. Verifica los permisos de tu navegador o asegúrate de estar en HTTPS.");
        readerDiv.classList.add('hidden');
        escannerActivo = null;
    });
}

function cerrarModal() {
    // Protección anti-fugas de memoria: Si cierra la ventana y la cámara sigue prendida, apágala.
    if (escannerActivo) {
        escannerActivo.stop().then(() => { escannerActivo = null; }).catch(e => console.error(e));
    }
    document.getElementById('modal-dinamico').classList.add('hidden');
}

// ==========================================
// 4. LÓGICA DE BASE DE DATOS (LECTURA/ESCRITURA)
// ==========================================
async function guardarNuevoRegistro(e, esquema) {
    e.preventDefault();
    const form = e.target;
    // AQUÍ ESTÁ EL ARREGLO DEL BUG QUE TUVIMOS ANTES (Busca el botón de todo el documento)
    const btnSubmit = document.querySelector('button[form="formulario-dinamico"]');
    
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

    try {
        const formData = new FormData(form);
        const dataToSave = {
            creado_por: auth.currentUser.uid,
            creado_en: serverTimestamp()
        };

        esquema.esquema_base_datos.campos.forEach(campo => {
            if (campo.tipo === 'fecha_hora_automatica') {
                dataToSave[campo.id] = serverTimestamp(); 
            } else {
                dataToSave[campo.id] = formData.get(campo.id) || null;
            }
        });

        const coleccionDestino = collection(db, "gestia_dynamic_data", esquema.modulo_id, "registros");
        await addDoc(coleccionDestino, dataToSave);

        cerrarModal();
        form.reset();

    } catch (error) {
        console.error("Error guardando registro:", error);
        alert("Error al guardar: " + error.message);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar en BD';
    }
}

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
            tr.className = "hover:bg-slate-800/50 transition-colors group border-b border-slate-800/50";

            esquema.esquema_base_datos.campos.forEach(campo => {
                let val = "<span class='text-slate-600 font-mono'>—</span>";
                
                if (data[campo.id]) {
                    if (campo.tipo === 'fecha_hora_automatica') {
                        const date = data[campo.id].toDate ? data[campo.id].toDate() : new Date();
                        val = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit' }).format(date);
                    } else if (campo.tipo === 'selector') {
                        val = `<span class="bg-blue-900/30 text-blue-400 border border-blue-800/50 px-2 py-1 rounded shadow-inner text-[10px] font-bold uppercase tracking-wider">${data[campo.id]}</span>`;
                    } else if (campo.tipo === 'texto_qr') {
                        val = `<span class="font-mono text-emerald-400 bg-emerald-900/20 px-2 py-0.5 rounded border border-emerald-800/50"><i class="fa-solid fa-qrcode mr-1"></i>${data[campo.id]}</span>`;
                    } else {
                        val = data[campo.id];
                    }
                }
                tr.innerHTML += `<td class="px-4 py-3 text-slate-300 whitespace-nowrap">${val}</td>`;
            });

            tr.innerHTML += `
                <td class="px-4 py-3 text-right whitespace-nowrap">
                    <button class="text-slate-500 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100 p-1.5 bg-slate-800 rounded-lg shadow-md border border-slate-700">
                        <i class="fa-solid fa-eye text-xs"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }, (error) => {
        console.error("Error leyendo datos:", error);
        tbody.innerHTML = `<tr><td colspan="10" class="text-center p-6 text-red-400 border border-red-900/50 bg-red-900/10 rounded-lg"><i class="fa-solid fa-triangle-exclamation mb-2 text-2xl"></i><br>Error cargando datos.</td></tr>`;
    });
}
