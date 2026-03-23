import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 1. INICIALIZACIÓN Y SEGURIDAD V5.18
// ==========================================
const form = document.getElementById('terminal-form');
const input = document.getElementById('terminal-input');
const output = document.getElementById('terminal-output');
const btnGenerate = document.getElementById('btn-generate');

// Validación estricta contra la colección unificada de usuarios
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
                const userData = userSnap.data();
                // Validamos que el usuario tenga los permisos de arquitectura
                if (userData.rol !== 'super_admin' && userData.rol !== 'ceo') {
                    console.warn("Acceso denegado: Nivel de privilegios insuficiente.");
                    window.location.href = 'login.html';
                } else {
                    console.log("Terminal Heberto: Acceso autorizado. Nivel Arquitecto.");
                }
            } else {
                window.location.href = 'login.html';
            }
        } catch (error) {
            console.error("Error validando seguridad de la terminal:", error);
            window.location.href = 'login.html';
        }
    } else {
        window.location.href = 'login.html';
    }
});

// ==========================================
// 2. LÓGICA DE INTERACCIÓN DE LA TERMINAL
// ==========================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const textoIdea = input.value.trim();
    if (!textoIdea) return;

    // Bloquear UI mientras procesa
    input.value = '';
    input.style.height = '58px';
    btnGenerate.disabled = true;

    // 1. Mostrar lo que pidió el Arquitecto
    agregarBurbujaUsuario(textoIdea);

    // 2. Mostrar indicador de procesamiento
    const idCarga = mostrarCargando();

    try {
        // 3. Procesar la idea (Motor Lógico)
        const jsonEstructura = motorGeneradorEstructura(textoIdea);

        // Simulamos un pequeño retraso para efecto visual de "IA pensando"
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 4. Guardar el Molde en Firestore V2.0
        const moduloId = jsonEstructura.modulo_id || `modulo_${Date.now()}`;
        const moduloRef = doc(collection(db, "gestia_system_modules"), moduloId);
        
        await setDoc(moduloRef, {
            ...jsonEstructura,
            creado_por: auth.currentUser.uid,
            fecha_creacion: serverTimestamp(),
            version_motor: "1.0"
        });

        // 5. Actualizar Interfaz con el resultado
        document.getElementById(idCarga).remove();
        agregarBurbujaSistema(jsonEstructura, moduloId);

    } catch (error) {
        console.error("Error en la generación del módulo:", error);
        document.getElementById(idCarga).remove();
        agregarBurbujaError(error.message);
    } finally {
        // Desbloquear UI
        btnGenerate.disabled = false;
        input.focus();
        hacerScrollAbajo();
    }
});

// ==========================================
// 3. MOTOR GENERADOR (EL CEREBRO NO-CODE)
// ==========================================
function motorGeneradorEstructura(prompt) {
    // Aquí es donde en el futuro harás el fetch a tu API de IA.
    // Por ahora, procesamos la instrucción clave para devolver la estructura exacta.
    const promptLower = prompt.toLowerCase();
    
    if (promptLower.includes("seguridad") || promptLower.includes("accesos")) {
        return {
            "modulo_id": "seguridad_accesos_b2b",
            "nombre_display": "Control de Accesos B2B",
            "descripcion": "Gestión de entradas, salidas y escaneo de QR para visitantes y contratistas externos.",
            "icono": "shield-check",
            "seguridad_roles": ["super_admin", "guardia_b2b"], 
            "esquema_base_datos": {
                "coleccion_destino": "b2b_registro_accesos",
                "campos": [
                    { "id": "tipo_movimiento", "etiqueta": "Tipo de Movimiento", "tipo": "selector", "opciones": ["Entrada", "Salida", "Ronda de Vigilancia"], "obligatorio": true },
                    { "id": "codigo_qr", "etiqueta": "Código QR Escaneado", "tipo": "texto_qr", "obligatorio": false },
                    { "id": "tipo_persona", "etiqueta": "Perfil", "tipo": "selector", "opciones": ["Visitante", "Trabajador Externo", "Residente"], "obligatorio": true },
                    { "id": "timestamp_registro", "etiqueta": "Fecha y Hora", "tipo": "fecha_hora_automatica", "obligatorio": true }
                ]
            },
            "esquema_interfaz": {
                "tipo_vista_principal": "tabla_datos_en_vivo",
                "acciones_permitidas": ["crear", "leer", "escanear_qr"]
            },
            "estado_modulo": "activo"
        };
    } else {
        // Estructura genérica de respaldo si pides otra cosa
        const timeStamp = Date.now();
        return {
            "modulo_id": `modulo_generico_${timeStamp}`,
            "nombre_display": "Nuevo Módulo Generado",
            "descripcion": "Estructura generada automáticamente basada en tu instrucción.",
            "icono": "box",
            "seguridad_roles": ["super_admin"],
            "esquema_base_datos": {
                "coleccion_destino": `coleccion_dinamica_${timeStamp}`,
                "campos": [
                    { "id": "campo_principal", "etiqueta": "Dato Principal", "tipo": "texto", "obligatorio": true }
                ]
            },
            "esquema_interfaz": {
                "tipo_vista_principal": "lista_simple",
                "acciones_permitidas": ["crear", "leer"]
            },
            "estado_modulo": "borrador"
        };
    }
}

// ==========================================
// 4. FUNCIONES DE INTERFAZ (UI BUILDERS)
// ==========================================
function agregarBurbujaUsuario(texto) {
    const div = document.createElement('div');
    div.className = 'flex gap-4 animate-fade-in max-w-4xl mx-auto w-full justify-end mt-4';
    div.innerHTML = `
        <div class="bg-slate-800 border border-slate-700 p-4 rounded-2xl rounded-tr-none shadow-md max-w-[80%]">
            <p class="text-slate-200 text-sm leading-relaxed">${texto}</p>
        </div>
        <div class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center shrink-0 shadow-lg border border-slate-600">
            <i class="fa-solid fa-user-tie text-slate-300 text-sm"></i>
        </div>
    `;
    output.appendChild(div);
}

function mostrarCargando() {
    const id = `carga_${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = 'flex gap-4 animate-fade-in max-w-4xl mx-auto w-full mt-4';
    div.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-gestia-primary flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30">
            <i class="fa-solid fa-microchip text-white text-sm animate-pulse"></i>
        </div>
        <div class="bg-gestia-panel border border-slate-700 p-4 rounded-2xl rounded-tl-none shadow-md flex items-center gap-3">
            <div class="flex gap-1">
                <div class="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style="animation-delay: 0s"></div>
                <div class="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style="animation-delay: 0.1s"></div>
                <div class="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style="animation-delay: 0.2s"></div>
            </div>
            <span class="text-sm text-slate-400 font-mono">Construyendo arquitectura en Firestore...</span>
        </div>
    `;
    output.appendChild(div);
    hacerScrollAbajo();
    return id;
}

function agregarBurbujaSistema(jsonObj, docId) {
    const div = document.createElement('div');
    div.className = 'flex gap-4 animate-fade-in max-w-4xl mx-auto w-full mt-4';
    
    // Convertimos el JSON a un string formateado para mostrarlo en pantalla
    const jsonString = JSON.stringify(jsonObj, null, 2);
    
    div.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-gestia-primary flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30">
            <i class="fa-solid fa-check-double text-white text-sm"></i>
        </div>
        <div class="bg-gestia-panel border border-gestia-primary/50 p-5 rounded-2xl rounded-tl-none shadow-[0_0_15px_rgba(59,130,246,0.15)] flex-1 overflow-hidden">
            <div class="flex justify-between items-center mb-3">
                <h3 class="font-bold text-gestia-accent text-lg flex items-center gap-2">
                    <i class="fa-solid fa-database"></i> Estructura Creada y Guardada
                </h3>
                <span class="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded font-mono border border-slate-700">ID: ${docId}</span>
            </div>
            <p class="text-slate-300 text-sm mb-4">El módulo <strong>${jsonObj.nombre_display}</strong> ha sido inyectado en <code class="bg-slate-900 px-1 py-0.5 rounded text-blue-400">gestia_system_modules</code>. El motor de renderizado ya puede consumirlo.</p>
            
            <div class="bg-[#0d1117] rounded-lg border border-slate-700 overflow-hidden">
                <div class="bg-slate-800/50 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                    <span class="text-xs font-mono text-slate-400">esquema_base.json</span>
                    <button class="text-slate-400 hover:text-white transition-colors" onclick="navigator.clipboard.writeText(this.parentElement.nextElementSibling.innerText); this.innerHTML='<i class=\\'fa-solid fa-check\\'></i> Copiado'; setTimeout(()=>this.innerHTML='<i class=\\'fa-regular fa-copy\\'></i> Copiar', 2000);">
                        <i class="fa-regular fa-copy"></i> Copiar
                    </button>
                </div>
                <pre class="p-4 overflow-x-auto text-xs font-mono text-emerald-400"><code>${jsonString}</code></pre>
            </div>
        </div>
    `;
    output.appendChild(div);
    hacerScrollAbajo();
}

function agregarBurbujaError(mensaje) {
    const div = document.createElement('div');
    div.className = 'flex gap-4 animate-fade-in max-w-4xl mx-auto w-full mt-4';
    div.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center shrink-0 shadow-lg shadow-red-500/30">
            <i class="fa-solid fa-triangle-exclamation text-white text-sm"></i>
        </div>
        <div class="bg-gestia-panel border border-red-500/50 p-4 rounded-2xl rounded-tl-none shadow-md flex-1">
            <h3 class="font-semibold text-red-400 mb-1">Error de Compilación</h3>
            <p class="text-slate-300 text-sm">${mensaje}</p>
        </div>
    `;
    output.appendChild(div);
    hacerScrollAbajo();
}

function hacerScrollAbajo() {
    output.scrollTop = output.scrollHeight;
}
