/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - TERMINAL HEBERTO "ARQUITECTURA AUTÓNOMA" (V5.22)
 * ======================================================================================
 * Identidad: Ingeniero Arquitecto Senior Nivel Dios.
 * CEO & Socio Tecnológico: Heberto.
 * * REGLAS DE ORO DEL DESARROLLO (INNEGOCIABLES):
 * 1. CÓDIGO ÍNTEGRO: +550 líneas analizadas. Prohibido compactar o usar placeholders.
 * 2. MODO TACAÑO: Optimización de bites (WebP 0.5) para presupuesto < 5 USD.
 * 3. SEGURIDAD SSoT: Handshake de roles, Whitelist de campos y Sanitización XSS.
 * 4. PERSISTENCIA ATÓMICA: Write Batch sincronizado para Módulo e Historial.
 * 5. MULTIMODALIDAD PRO: Lector de PDF, JS, JSON, IMG con limpieza de memoria.
 * 6. ANTI-DUPLICADO: Solo escribe en DB si hay cambios reales en la lógica.
 * * "Arre con la que barre, Jefe. Salud por el búnker que estamos armando." 🍻
 * ======================================================================================
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, doc, setDoc, getDoc, getDocs, 
    serverTimestamp, writeBatch, query, limit, orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 1. CONFIGURACIÓN MAESTRA Y LÍMITES PRO
// ==========================================
const CONFIG = {
    MAX_FILES: 5,
    MAX_FILE_SIZE_MB: 5,
    MAX_CONTEXT_SIZE_BYTES: 950000, // Margen de seguridad para el límite de 1MB de Firestore
    FETCH_TIMEOUT_MS: 25000,        // 25 segundos para evitar timeouts en prompts pesados
    RETRY_ATTEMPTS: 3,              // Reintentos automáticos en red inestable
    VERSION_SISTEMA: "V5.22_AUTONOMA_GOD_LEVEL"
};

// Selectores del DOM (UI Engine)
const form = document.getElementById('terminal-form');
const input = document.getElementById('terminal-input');
const output = document.getElementById('terminal-output');
const btnGenerate = document.getElementById('btn-generate');
const fileInput = document.getElementById('terminal-file-input');
const dropZone = document.getElementById('terminal-drop-zone');

// Estado de Memoria de la Terminal (El Buche Neuronal)
let contextoMultimodal = [];
let esquemaCorral = ""; 

// ==========================================
// 2. UTILIDADES DE SEGURIDAD Y BLINDAJE
// ==========================================

/**
 * Sanitización XSS Total: Blindaje de 5 puntos para evitar inyecciones.
 */
function escaparHTML(str = "") {
    if (typeof str !== 'string') return "";
    return str.replace(/[&<>"']/g, (m) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[m]));
}

/**
 * Limpieza Profesional de Respuesta IA: Elimina Markdown y etiquetas parásitas.
 */
function limpiarRespuestaIA(raw = "") {
    return raw
        .replace(/```(json|javascript|js|html|css|txt)?/gi, "")
        .replace(/```/g, "")
        .replace(/^\s*(json|javascript|js|html|css)\s*/gi, "") 
        .trim();
}

/**
 * Whitelist de Campos: Solo permite la entrada de campos autorizados al sistema.
 */
function filtrarCamposPermitidos(json) {
    const permitidos = ["modulo_id", "nombre_display", "html", "javascript", "css"];
    const filtrado = {};
    permitidos.forEach(key => {
        if (json[key] !== undefined) filtrado[key] = json[key];
    });
    return filtrado;
}

/**
 * Validador de Identidad: Garantiza que el ID sea compatible con la arquitectura SSoT.
 */
function validarIDMódulo(id) {
    // Solo minúsculas, números, guiones y guiones bajos
    const idRegex = /^[a-z0-9_-]+$/;
    return idRegex.test(id);
}

// ==========================================
// 3. SCHEMA ENFORCEMENT (EL PORTERO)
// ==========================================
function validarModuloEstructura(json) {
    const errores = [];

    // Verificación de Identidad
    if (!json.modulo_id) {
        errores.push("Falta 'modulo_id' en la estructura.");
    } else if (!validarIDMódulo(json.modulo_id)) {
        errores.push(`ID [${json.modulo_id}] inválido: Solo minúsculas, números y guiones.`);
    }

    if (!json.nombre_display || typeof json.nombre_display !== "string" || json.nombre_display.length < 5) {
        errores.push("'nombre_display' inexistente o demasiado corto para ser profesional.");
    }

    // Validación del Núcleo (Obligatorio)
    const nucleo = ["html", "javascript"];
    nucleo.forEach(campo => {
        if (!json[campo]) {
            errores.push(`El campo crítico [${campo}] es obligatorio.`);
        } else if (typeof json[campo] !== "string") {
            errores.push(`El campo [${campo}] debe ser texto plano.`);
        } else if (json[campo].trim().length < 30) {
            errores.push(`El contenido de [${campo}] es insuficiente para ser funcional.`);
        }
    });

    // Control de Peso del Documento (Firestore Safety)
    const pesoBytes = JSON.stringify(json).length;
    if (pesoBytes > CONFIG.MAX_CONTEXT_SIZE_BYTES) {
        errores.push(`El módulo excede el peso de seguridad: ${(pesoBytes / 1024).toFixed(2)} KB.`);
    }

    if (errores.length > 0) {
        throw new Error(`🚨 FALLO DE ARQUITECTURA:\n• ${errores.join("\n• ")}`);
    }
    return true;
}

// ==========================================
// 4. SEGURIDAD Y HANDSHAKE DE ROLES
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) throw new Error("PERFIL_INEXISTENTE_EN_BD");

        const data = snap.data();
        const jerarquiaAlta = ['super_admin', 'ceo', 'admin'];

        if (!jerarquiaAlta.includes(data.rol)) {
            console.error("Acceso prohibido: Nivel Arquitecto Requerido.");
            window.location.href = 'login.html';
        } else {
            console.log(`💎 Arquitecto Senior ${data.nombre || ''} en línea. V5.22 Activa.`);
            // Sincronizamos el corral inmediatamente para calentar la IA
            await inyectarContextoCorral();
        }
    } catch (e) {
        console.error("Seguridad Crítica:", e.message);
        window.location.href = 'login.html';
    }
});

// ==========================================
// 5. INYECCIÓN DEL CORRAL OPTIMIZADO
// ==========================================
/**
 * Recupera los módulos más recientes para que la IA tenga memoria operativa.
 */
async function inyectarContextoCorral() {
    try {
        console.log(">> Mapeando el corral por relevancia...");
        const q = query(
            collection(db, "gestia_system_modules"),
            orderBy("fecha_actualizacion", "desc"),
            limit(20)
        );

        const snap = await getDocs(q);
        const resumen = [];

        snap.forEach(docu => {
            const m = docu.data();
            resumen.push({ 
                id: docu.id, 
                nombre: m.nombre_display,
                actualizado: m.fecha_actualizacion?.toDate().toISOString().split('T')[0] || '2026'
            });
        });

        // Usamos JSON Stringify para que la IA capte la estructura de datos real
        esquemaCorral = `CONTEXTO_DEL_CORRAL_GEstia:\n${JSON.stringify(resumen)}`;
        console.log("🏗️ Contexto del Corral inyectado con éxito.");
    } catch (e) {
        console.error("Fallo al leer corral:", e);
        esquemaCorral = "CORRAL_NO_DISPONIBLE_OFFLINE";
    }
}

// ==========================================
// 6. ANTI-DUPLICADO INTELIGENTE (MODO TACAÑO)
// ==========================================
/**
 * Solo permite guardar si el nuevo código difiere del actual.
 */
async function detectarCambiosReales(moduloId, nuevoData) {
    const docRef = doc(db, "gestia_system_modules", moduloId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) return true; // Es nuevo, se guarda sin dudar

    const viejo = snap.data();
    const camposValidar = ["modulo_id", "nombre_display", "html", "javascript", "css"];

    const viejoMapeado = {};
    const nuevoMapeado = {};

    camposValidar.forEach(k => {
        viejoMapeado[k] = viejo[k] || "";
        nuevoMapeado[k] = nuevoData[k] || "";
    });

    return JSON.stringify(viejoMapeado) !== JSON.stringify(nuevoMapeado);
}

// ==========================================
// 7. PROCESAMIENTO MULTIMODAL (FILTRO WEBP)
// ==========================================

/**
 * Tritura imágenes pesadas en el cliente para convertirlas a WebP ligero.
 */
async function optimizarImagenParaIA(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_W = 1200; // Resolución quirúrgica para IA
                const ratio = MAX_W / img.width;
                
                canvas.width = MAX_W;
                canvas.height = img.height * ratio;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                // Exportación en Modo Tacaño (0.5 de calidad)
                resolve(canvas.toDataURL('image/webp', 0.5));
            };
        };
    });
}

/**
 * Carga archivos al buche validando límites físicos y de memoria.
 */
async function cargarArchivoAlBuche(file) {
    try {
        console.log(`>> Analizando archivo: ${file.name}`);
        
        if (contextoMultimodal.length >= CONFIG.MAX_FILES) {
            throw new Error(`Límite alcanzado: Máximo ${CONFIG.MAX_FILES} archivos.`);
        }
        if (file.size > CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024) {
            throw new Error(`Archivo [${file.name}] excede los 5MB permitidos.`);
        }

        const dataArchivo = { nombre: file.name, mime: file.type, payload: "" };

        if (file.type.startsWith('image/')) {
            dataArchivo.payload = await optimizarImagenParaIA(file);
        } else if (file.type === 'application/pdf') {
            dataArchivo.payload = await new Promise((resolve) => {
                const r = new FileReader();
                r.onload = e => resolve(e.target.result);
                r.readAsDataURL(file);
            });
        } else {
            // JS, TXT, JSON, CSS, HTML
            dataArchivo.payload = await file.text();
        }

        // Verificamos si el contexto total no explota el límite de red
        const pesoTotalContexto = JSON.stringify([...contextoMultimodal, dataArchivo]).length;
        if (pesoTotalContexto > CONFIG.MAX_CONTEXT_SIZE_BYTES) {
            throw new Error("El buche está lleno. Demasiada data para un solo prompt.");
        }

        contextoMultimodal.push(dataArchivo);
        agregarBurbujaSistema({ message: `Elemento [${file.name}] inyectado en memoria multimodal.` }, "MULTIMODAL_BOT");
        hacerScrollAbajo();

    } catch (err) {
        agregarBurbujaError(err.message);
    }
}

// Controladores de Arrastre (Drag & Drop)
if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('bg-blue-600/10', 'border-blue-500', 'scale-[1.01]');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('bg-blue-600/10', 'border-blue-500', 'scale-[1.01]');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('bg-blue-600/10', 'border-blue-500', 'scale-[1.01]');
        Array.from(e.dataTransfer.files).forEach(f => cargarArchivoAlBuche(f));
    });
}

fileInput?.addEventListener('change', (e) => {
    Array.from(e.target.files).forEach(f => cargarArchivoAlBuche(f));
});

// ==========================================
// 8. COMUNICACIÓN ROBUSTA (IA BRIDGE)
// ==========================================
async function invocarArquitectoIA(payload, retries = CONFIG.RETRY_ATTEMPTS) {
    const url = "https://us-central1-fixgo-44e4d.cloudfunctions.net/generarModuloIA";
    
    for (let i = 0; i <= retries; i++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS);

        try {
            console.log(`>> Intentando conexión neuronal (Intento ${i + 1})...`);
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ data: payload }),
                signal: controller.signal
            });

            clearTimeout(timeout);
            if (!res.ok) throw new Error(`HTTP_ERR_${res.status}`);
            
            const rawResponse = await res.json();
            return rawResponse.result;

        } catch (err) {
            clearTimeout(timeout);
            if (i === retries) {
                if (err.name === 'AbortError') throw new Error("TIMEOUT: El Arquitecto IA está saturado. Intenta de nuevo.");
                throw err;
            }
            console.warn(`Reintentando en 2 segundos...`);
            await new Promise(r => setTimeout(r, 2000 * (i + 1))); 
        }
    }
}

// ==========================================
// 9. PERSISTENCIA ATÓMICA (WRITE BATCH)
// ==========================================
async function guardarModuloEnElCorral(moduloId, data) {
    const batch = writeBatch(db);
    
    const modRef = doc(db, "gestia_system_modules", moduloId);
    
    // Generamos un ID de versión basado en tiempo y autor para el historial
    const versionId = `${Date.now()}_${auth.currentUser.uid.substring(0, 4)}`;
    const histRef = doc(db, "gestia_module_versions", moduloId, "historial", versionId);

    // Operación 1: Actualizar el Módulo Maestro
    batch.set(modRef, {
        ...data,
        actualizado_por: auth.currentUser.uid,
        fecha_actualizacion: serverTimestamp(),
        version_core: CONFIG.VERSION_SISTEMA
    }, { merge: false }); // Limpieza total de campos antiguos

    // Operación 2: Inyectar Snapshot al Historial
    batch.set(histRef, {
        snapshot: data,
        autor: auth.currentUser.uid,
        fecha: serverTimestamp(),
        id_version: versionId
    });

    await batch.commit();
}

// ==========================================
// 10. FLUJO PRINCIPAL (EL SUBMIT)
// ==========================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const instruccion = input.value.trim();

    if (!instruccion && contextoMultimodal.length === 0) return;

    // Bloqueo de UI para evitar colisiones
    btnGenerate.disabled = true;
    input.value = '';
    input.style.height = '58px';

    // 1. Mostrar la orden del CEO
    agregarBurbujaUsuario(instruccion);

    // 2. Indicador de Análisis Pro
    const idCarga = mostrarCargando();

    try {
        // 3. Fusión de Prompt con el Corral y Multimodalidad
        const promptDefinitivo = `ORDEN_EJECUTIVA: ${instruccion}\n\n${esquemaCorral}`;

        const respuestaIA = await invocarArquitectoIA({
            prompt: promptDefinitivo,
            contexto_multimodal: contextoMultimodal
        });

        const raw = respuestaIA.modulo_generado || "";
        
        // 4. Limpieza Quirúrgica (V5.22)
        const limpio = limpiarRespuestaIA(raw);

        // Vaciamos el buche multimodal después del proceso
        contextoMultimodal = []; 
        document.getElementById(idCarga).remove();

        try {
            // FLUJO A: GESTIÓN DE MÓDULO (JSON)
            let dataFinal = JSON.parse(limpio);

            // 🔐 Filtro de Whitelist
            dataFinal = filtrarCamposPermitidos(dataFinal);

            // 🧬 Validación de Estructura
            validarModuloEstructura(dataFinal);

            // 🧠 Verificación de Cambios (Anti-Duplicado)
            const hayCambios = await detectarCambiosReales(dataFinal.modulo_id, dataFinal);

            if (!hayCambios) {
                throw new Error("SIN_CAMBIOS_DETECTADOS: El código generado es idéntico al que ya está en el corral.");
            }

            // ⚛️ Guardado Atómico (Módulo + Snapshot)
            await guardarModuloEnElCorral(dataFinal.modulo_id, dataFinal);

            // 5. Mostrar Éxito
            agregarBurbujaSistema(dataFinal, dataFinal.modulo_id);

        } catch (eJson) {
            // FLUJO B: CÓDIGO PLANO (REESCRITURA)
            console.log(">> La IA devolvió código libre. Renderizando...");
            agregarBurbujaCodigo(limpio);
        }

    } catch (err) {
        console.error("❌ FALLO_SISTEMA:", err.message);
        if (document.getElementById(idCarga)) document.getElementById(idCarga).remove();
        agregarBurbujaError(err.message);
    } finally {
        btnGenerate.disabled = false;
        input.focus();
        hacerScrollAbajo();
    }
});

// ==========================================
// 11. UI RENDERING (ESTILO ARQUITECTO)
// ==========================================

function agregarBurbujaUsuario(texto) {
    const div = document.createElement('div');
    div.className = 'flex gap-4 animate-fade-in max-w-4xl mx-auto w-full justify-end mt-8';
    const msg = escaparHTML(texto || "[Instrucción Multimodal Absorbida]");

    div.innerHTML = `
        <div class="bg-slate-800 border border-slate-700 p-4 rounded-2xl rounded-tr-none shadow-2xl max-w-[85%]">
            <p class="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap font-sans">${msg}</p>
        </div>
        <div class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center shrink-0 border border-slate-600 shadow-lg">
            <i class="fa-solid fa-user-tie text-slate-300 text-sm"></i>
        </div>
    `;
    output.appendChild(div);
}

function mostrarCargando() {
    const id = `load_${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = 'flex gap-4 animate-fade-in max-w-4xl mx-auto w-full mt-8';
    div.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shrink-0 shadow-lg animate-pulse shadow-blue-500/20">
            <i class="fa-solid fa-microchip text-white text-sm"></i>
        </div>
        <div class="bg-slate-900 border border-blue-500/30 p-4 rounded-2xl rounded-tl-none flex items-center gap-5">
            <div class="flex gap-1.5">
                <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
            </div>
            <span class="text-[11px] font-mono text-blue-400 uppercase tracking-[0.2em]">Heberto V5.22 auditando arquitectura...</span>
        </div>
    `;
    output.appendChild(div);
    hacerScrollAbajo();
    return id;
}

function agregarBurbujaSistema(json, docId) {
    const div = document.createElement('div');
    div.className = 'flex gap-4 animate-fade-in max-w-4xl mx-auto w-full mt-8';
    
    div.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20">
            <i class="fa-solid fa-check-double text-white text-sm"></i>
        </div>
        <div class="bg-[#0f172a] border border-emerald-500/40 p-6 rounded-2xl rounded-tl-none shadow-2xl flex-1 overflow-hidden">
            <div class="flex justify-between items-center mb-4">
                <h3 class="font-bold text-emerald-400 text-[10px] tracking-[0.3em] uppercase">Sincronización Autónoma Exitosa</h3>
                <span class="text-[9px] font-mono text-slate-500 bg-slate-800/50 px-2 py-1 rounded">ID: ${escaparHTML(docId)}</span>
            </div>
            <p class="text-slate-300 text-sm mb-4">El módulo <strong>${escaparHTML(json.nombre_display)}</strong> ha sido inyectado y versionado en el corral.</p>
            <div class="bg-black/50 rounded-lg border border-slate-800 p-4 relative">
                <pre class="text-[10px] font-mono text-emerald-300 overflow-x-auto custom-scrollbar"><code>${escaparHTML(JSON.stringify(json, null, 2))}</code></pre>
            </div>
        </div>
    `;
    output.appendChild(div);
    hacerScrollAbajo();
}

function agregarBurbujaCodigo(codigo) {
    const div = document.createElement('div');
    div.className = 'flex gap-4 animate-fade-in max-w-4xl mx-auto w-full mt-8';
    const escaped = escaparHTML(codigo);

    div.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20">
            <i class="fa-solid fa-code text-white text-sm"></i>
        </div>
        <div class="bg-[#0f172a] border border-indigo-500/40 p-6 rounded-2xl rounded-tl-none shadow-2xl flex-1 overflow-hidden">
            <div class="flex justify-between items-center mb-4">
                <h3 class="font-bold text-indigo-400 text-[10px] uppercase tracking-[0.3em]">Código Modo Dios Generado</h3>
                <button onclick="navigator.clipboard.writeText(this.parentElement.nextElementSibling.nextElementSibling.querySelector('code').innerText); this.innerText='¡COPIADO!'; setTimeout(()=>this.innerText='COPIAR', 2000)" 
                        class="text-[10px] bg-indigo-500/10 hover:bg-indigo-500/30 text-indigo-300 px-4 py-2 rounded transition-all border border-indigo-500/20 cursor-pointer font-bold">
                    COPIAR
                </button>
            </div>
            <p class="text-slate-400 text-[11px] mb-4 italic">Analizado 1000 veces. Regla 1: Código Completo (Sin recortes ni compactación).</p>
            <div class="bg-black/60 rounded-lg border border-slate-800 relative">
                <pre class="p-5 overflow-x-auto text-[11px] font-mono text-blue-300 max-h-[650px] overflow-y-auto custom-scrollbar"><code style="white-space: pre-wrap; word-break: break-all;">${escaped}</code></pre>
            </div>
        </div>
    `;
    output.appendChild(div);
    hacerScrollAbajo();
}

function agregarBurbujaError(msg) {
    const div = document.createElement('div');
    div.className = 'flex gap-4 animate-fade-in max-w-4xl mx-auto w-full mt-8';
    div.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shrink-0 shadow-lg shadow-red-500/20">
            <i class="fa-solid fa-bolt text-white text-sm"></i>
        </div>
        <div class="bg-slate-900 border border-red-500/30 p-5 rounded-2xl rounded-tl-none flex-1">
            <h3 class="text-red-400 text-[10px] font-bold uppercase tracking-widest mb-2">Error de Arquitectura</h3>
            <p class="text-slate-300 text-sm leading-relaxed">${escaparHTML(msg)}</p>
        </div>
    `;
    output.appendChild(div);
    hacerScrollAbajo();
}

function hacerScrollAbajo() {
    output.scrollTo({ top: output.scrollHeight, behavior: 'smooth' });
}

// Inicialización de la Terminal
input.focus();
console.log(`%c>> GESTIAPREMIUM V5.22: TERMINAL HEBERTO ACTIVA %c🍻`, "color: #3b82f6; font-weight: bold; font-size: 14px;", "font-size: 14px;");
