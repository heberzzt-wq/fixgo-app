import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 1. INICIALIZACIÓN Y SEGURIDAD V5.19
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
                if (
                    userData.rol !== 'super_admin' &&
                    userData.rol !== 'ceo' &&
                    userData.rol !== 'admin'
                ) {

                    console.warn("Acceso denegado: Nivel de privilegios insuficiente.");
                    window.location.href = 'login.html';

                } else {

                    console.log("Terminal Heberto: Acceso autorizado. Nivel Arquitecto conectado al motor IA.");

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
// 2. LÓGICA DE INTERACCIÓN DE LA TERMINAL (Check-and-Merge)
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

        // 3. Procesar la idea usando el motor IA Inteligente (JSON o Código)
        const respuestaIA = await motorGeneradorEstructura(textoIdea);

        document.getElementById(idCarga).remove();

        if (respuestaIA.esJSON) {
            // ==========================================
            // FLUJO A: ES UN MÓDULO NUEVO (JSON)
            // ==========================================
            const jsonEstructura = respuestaIA.data;
            const moduloId = jsonEstructura.modulo_id || `modulo_${Date.now()}`;
            const moduloRef = doc(db, "gestia_system_modules", moduloId);
            const moduloSnap = await getDoc(moduloRef);

            if (moduloSnap.exists()) {
                await setDoc(moduloRef, {
                    ...moduloSnap.data(),
                    ...jsonEstructura,
                    actualizado_por: auth.currentUser.uid,
                    fecha_actualizacion: serverTimestamp(),
                    version_motor: "2.0_AI_Powered_Backend"
                }, { merge: true });
                console.log(`Módulo existente actualizado: ${moduloId}`);
            } else {
                await setDoc(moduloRef, {
                    ...jsonEstructura,
                    creado_por: auth.currentUser.uid,
                    fecha_creacion: serverTimestamp(),
                    version_motor: "2.0_AI_Powered_Backend"
                });
                console.log(`Módulo nuevo creado: ${moduloId}`);
            }

            agregarBurbujaSistema(jsonEstructura, moduloId);

        } else {
            // ==========================================
            // FLUJO B: ES UNA MODIFICACIÓN DE CÓDIGO (TEXTO PLANO)
            // ==========================================
            // No guardamos en Firestore, solo le mostramos el código reescrito al Arquitecto
            agregarBurbujaCodigo(respuestaIA.data);
        }

    } catch (error) {

        console.error("Error en la terminal:", error);
        document.getElementById(idCarga)?.remove();
        agregarBurbujaError(error.message);

    } finally {

        // Desbloquear UI
        btnGenerate.disabled = false;
        input.focus();
        hacerScrollAbajo();

    }

});

// ==========================================
// 3. CEREBRO IA (NÚCLEO NO-CODE AUTOMATIZADO)
// ==========================================
async function motorGeneradorEstructura(promptUsuario) {

    const url = "https://us-central1-fixgo-44e4d.cloudfunctions.net/generarModulo";

    const promptMaestro = `
Eres el motor No-Code automatizado de GestiaPremium V5.18.
El CEO (Arquitecto) te dará instrucciones en lenguaje natural. Tu trabajo es devolver SIEMPRE un JSON estricto que el sistema guardará automáticamente en la base de datos.

REGLAS DE ORO:
1. ACTUALIZAR (Reescribir): Si el Arquitecto te pide modificar un módulo existente, debes devolver el JSON manteniendo el MISMO 'modulo_id' original. Reescribe el código en el JSON aplicando los cambios solicitados.
2. CREAR (Nuevo): Si pide un módulo nuevo, genera un 'modulo_id' único (ej. modulo_visitas_123) y crea la estructura desde cero.
3. CÓDIGO COMPLETO: No cortes código, no lo compactes, no uses "// ... resto del código". Entrega las líneas completas dentro de tu JSON.

SIEMPRE debes devolver esta estructura JSON estricta:
{
  "modulo_id": "ID_DEL_MODULO_A_ACTUALIZAR_O_CREAR",
  "nombre_display": "Nombre del Módulo",
  "html": "código html completo aquí...",
  "javascript": "código js completo aquí..."
}

PETICIÓN DEL ARQUITECTO:
"${promptUsuario}"
`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptMaestro })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fallo en backend IA: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const limpio = data.texto.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
        // Devolvemos el JSON para que la terminal lo guarde directo en Firestore
        return JSON.parse(limpio); 
    } catch (e) {
        console.error("Respuesta IA inválida:", limpio);
        throw new Error("La IA no devolvió un JSON válido para el auto-guardado.");
    }
}
// ==========================================
// 4. FUNCIONES DE INTERFAZ (UI BUILDERS)
// ==========================================
function agregarBurbujaUsuario(texto) {

    const div = document.createElement('div');

    div.className = 'flex gap-4 animate-fade-in max-w-4xl mx-auto w-full justify-end mt-4';

    // Escapar texto para que no se rompa el HTML si pegas código
    const textoEscapado = texto.replace(/</g, "&lt;").replace(/>/g, "&gt;").substring(0, 300) + (texto.length > 300 ? '... [Código adjunto]' : '');

    div.innerHTML = `
        <div class="bg-slate-800 border border-slate-700 p-4 rounded-2xl rounded-tr-none shadow-md max-w-[80%]">
            <p class="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">${textoEscapado}</p>
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
            <span class="text-sm text-slate-400 font-mono">Terminal analizando requerimientos y reglas...</span>
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
            <p class="text-slate-300 text-sm mb-4">El módulo <strong>${jsonObj.nombre_display || 'Generado'}</strong> ha sido inyectado en <code class="bg-slate-900 px-1 py-0.5 rounded text-blue-400">gestia_system_modules</code>. El motor de renderizado ya puede consumirlo.</p>
            
            <div class="bg-[#0d1117] rounded-lg border border-slate-700 overflow-hidden">
                <div class="bg-slate-800/50 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                    <span class="text-xs font-mono text-slate-400">esquema_generado_por_ia.json</span>
                </div>
                <pre class="p-4 overflow-x-auto text-xs font-mono text-emerald-400"><code>${jsonString}</code></pre>
            </div>
        </div>
    `;

    output.appendChild(div);

    hacerScrollAbajo();

}

// NUEVA FUNCIÓN: Para mostrar el código modificado completo sin guardarlo como módulo JSON
function agregarBurbujaCodigo(codigoPlano) {

    const div = document.createElement('div');

    div.className = 'flex gap-4 animate-fade-in max-w-4xl mx-auto w-full mt-4';
    
    // Escapamos el código para que se muestre como texto
    const codigoEscapado = codigoPlano.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    div.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-gestia-accent flex items-center justify-center shrink-0 shadow-lg shadow-green-500/30">
            <i class="fa-solid fa-code text-white text-sm"></i>
        </div>
        <div class="bg-gestia-panel border border-gestia-accent/50 p-5 rounded-2xl rounded-tl-none shadow-[0_0_15px_rgba(16,185,129,0.15)] flex-1 overflow-hidden">
            <div class="flex justify-between items-center mb-3">
                <h3 class="font-bold text-gestia-accent text-lg flex items-center gap-2">
                    <i class="fa-solid fa-file-code"></i> Código Analizado y Reescribido
                </h3>
            </div>
            <p class="text-slate-300 text-sm mb-4">Regla 1 aplicada: Código 100% completo, sin recortes. Listo para copiar y pegar.</p>
            <div class="bg-[#0d1117] rounded-lg border border-slate-700 overflow-hidden relative">
                <div class="bg-slate-800/50 px-4 py-2 border-b border-slate-700 flex justify-between items-center sticky top-0">
                    <span class="text-xs font-mono text-slate-400">codigo_modificado</span>
                    <button onclick="navigator.clipboard.writeText(this.parentElement.nextElementSibling.innerText); this.innerHTML='¡Copiado!'; setTimeout(() => this.innerHTML='Copiar Código', 2000);" class="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded transition shadow-sm border border-slate-600 cursor-pointer">Copiar Código</button>
                </div>
                <pre class="p-4 overflow-x-auto text-xs font-mono text-blue-300 max-h-[600px] overflow-y-auto"><code style="white-space: pre-wrap; word-break: break-all;">${codigoEscapado}</code></pre>
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
