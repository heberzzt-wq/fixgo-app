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
                // Validamos que el usuario tenga los permisos de arquitectura (incluido admin)
                if (userData.rol !== 'super_admin' && userData.rol !== 'ceo' && userData.rol !== 'admin') {
                    console.warn("Acceso denegado: Nivel de privilegios insuficiente.");
                    window.location.href = 'login.html';
                } else {
                    console.log("Terminal Heberto: Acceso autorizado. Nivel Arquitecto conectado a IA.");
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
        // 3. Procesar la idea (CONEXIÓN REAL A LA IA)
        const jsonEstructura = await motorGeneradorEstructura(textoIdea);

        // 4. Guardar el Molde en Firestore V2.0
        const moduloId = jsonEstructura.modulo_id || `modulo_${Date.now()}`;
        const moduloRef = doc(collection(db, "gestia_system_modules"), moduloId);
        
        await setDoc(moduloRef, {
            ...jsonEstructura,
            creado_por: auth.currentUser.uid,
            fecha_creacion: serverTimestamp(),
            version_motor: "2.0_AI_Powered"
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
// 3. CEREBRO IA (NÚCLEO GENERATIVO V2.0)
// ==========================================
async function motorGeneradorEstructura(promptUsuario) {
    // ⚠️ HEBERTO: PEGA TU LLAVE EXACTA AQUÍ (LA QUE TERMINA EN D6OU)
    const API_KEY = "AIzaSyAoeWKuRt-44d2WCSz7SyBVI8ghKyoD6OU"; 
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=" + API_KEY;

    const promptMaestro = `
    Eres el motor No-Code del sistema GestiaPremium. Tu objetivo es convertir la idea del usuario en una estructura JSON estricta para crear módulos dinámicos.
    
    REGLA DE ORO: Devuelve ÚNICAMENTE un JSON válido. Cero texto adicional. Cero formato markdown (no uses \`\`\`json).
    
    ESTRUCTURA EXACTA QUE DEBES DEVOLVER:
    {
        "modulo_id": "nombre_unico_sin_espacios_ni_mayusculas",
        "nombre_display": "Nombre Elegante del Módulo",
        "descripcion": "Una descripción clara de lo que hace.",
        "icono": "box", 
        "seguridad_roles": ["super_admin", "admin"],
        "esquema_base_datos": {
            "coleccion_destino": "nombre_coleccion_bd",
            "campos": [
                { "id": "campo_1", "etiqueta": "Nombre del Campo", "tipo": "texto", "obligatorio": true }
            ]
        },
        "esquema_interfaz": {
            "tipo_vista_principal": "tabla_datos_en_vivo",
            "acciones_permitidas": ["crear", "leer"]
        },
        "estado_modulo": "activo"
    }

    TIPOS DE CAMPO PERMITIDOS: "texto", "selector", "texto_qr", "fecha_hora_automatica".
    (Si el tipo es "selector", debes incluir la propiedad "opciones" con un arreglo de strings).
    Usa iconos de fontawesome lógicos (ej. shield-check, car, users, wrench, calendar).

    IDEA DEL USUARIO: "${promptUsuario}"
    `;

    const payload = {
        contents: [{ parts: [{ text: promptMaestro }] }],
        generationConfig: {
            temperature: 0.2, // Baja temperatura para que sea analítico y no invente cosas raras
            responseMimeType: "application/json" // Obliga a la IA a contestar puro JSON
        }
    };

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Fallo en la API de Inteligencia Artificial: ${response.status}`);
    }

    const data = await response.json();
    const textoRespuesta = data.candidates[0].content.parts[0].text;
    
    try {
        return JSON.parse(textoRespuesta);
    } catch (e) {
        throw new Error("La IA no devolvió un JSON válido. Intenta con otra instrucción.");
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
            <span class="text-sm text-slate-400 font-mono">El Cerebro IA está diseñando la arquitectura...</span>
        </div>
    `;
    output.appendChild(div);
    hacerScrollAbajo();
    return id;
}

function agregarBurbujaSistema(jsonObj, docId) {
    const div = document.createElement('div');
    div.className = 'flex gap-4 animate-fade-in max-w-4xl mx-auto w-full mt-4';
    
    const jsonString = JSON.stringify(jsonObj, null, 2);
    
    div.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-gestia-primary flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30">
            <i class="fa-solid fa-check-double text-white text-sm"></i>
        </div>
        <div class="bg-gestia-panel border border-gestia-primary/50 p-5 rounded-2xl rounded-tl-none shadow-[0_0_15px_rgba(59,130,246,0.15)] flex-1 overflow-hidden">
            <div class="flex justify-between items-center mb-3">
                <h3 class="font-bold text-gestia-accent text-lg flex items-center gap-2">
                    <i class="fa-solid fa-database"></i> Arquitectura IA Generada y Guardada
                </h3>
                <span class="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded font-mono border border-slate-700">ID: ${docId}</span>
            </div>
            <p class="text-slate-300 text-sm mb-4">El módulo <strong>${jsonObj.nombre_display}</strong> ha sido inyectado en <code class="bg-slate-900 px-1 py-0.5 rounded text-blue-400">gestia_system_modules</code>. El motor de renderizado ya puede consumirlo.</p>
            
            <div class="bg-[#0d1117] rounded-lg border border-slate-700 overflow-hidden">
                <div class="bg-slate-800/50 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                    <span class="text-xs font-mono text-slate-400">esquema_generado_por_ia.json</span>
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
            <h3 class="font-semibold text-red-400 mb-1">Error en el Cerebro IA</h3>
            <p class="text-slate-300 text-sm">${mensaje}</p>
        </div>
    `;
    output.appendChild(div);
    hacerScrollAbajo();
}

function hacerScrollAbajo() {
    output.scrollTop = output.scrollHeight;
}
