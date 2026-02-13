/* ================================
   🔔 FIXGO ALERT ENGINE v1.0
   Archivo: alert-engine.js
   Función: Sistema de Audio Profesional + Vibración
   ================================ */

let audioContext = null;
let bufferAlerta = null;
let sistemaActivo = false;

// 1. Inicializar audio (Cargar el archivo en memoria RAM)
async function initAlertSystem() {
    try {
        // Si ya existe, no lo recargamos
        if (audioContext) return;

        // Creamos el contexto compatible con todos los navegadores
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();

        console.log("🔊 Cargando sonido de alerta...");
        const response = await fetch('./sounds/alerta.mp3');
        
        if (!response.ok) {
            throw new Error(`No se encontró el archivo de audio: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        
        // Decodificamos el audio para tenerlo listo para disparar
        bufferAlerta = await audioContext.decodeAudioData(arrayBuffer);
        console.log("✅ Sonido cargado y listo en memoria.");
        
    } catch (error) {
        console.error("❌ Error en Alert Engine:", error);
    }
}

// 2. Activar Sistema (Debe llamarse tras un clic del usuario)
export async function activarAlertas() {
    if (!audioContext) await initAlertSystem();

    // Esto desbloquea el audio en Chrome/Safari
    if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    
    sistemaActivo = true;
    console.log("🔊 MOTOR DE AUDIO: ACTIVADO Y ESPERANDO ÓRDENES");
    
    // Reproducimos un sonido "mudo" o muy corto para probar
    reproducirSonido(0.01); 
}

// 3. Función Interna de Reproducción
function reproducirSonido(volumen = 1) {
    if (!sistemaActivo || !bufferAlerta || !audioContext) return;

    // Crear la fuente de sonido
    const source = audioContext.createBufferSource();
    source.buffer = bufferAlerta;

    // Control de volumen (GainNode)
    const gainNode = audioContext.createGain();
    gainNode.gain.value = volumen;

    // Conectar: Fuente -> Volumen -> Altavoces
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // ¡Fuego!
    source.start(0);
}

// ================================
// 🎯 ALERTAS POR ROL (EXPORTS)
// ================================

// ALERTA TÉCNICO (Vibración fuerte + Loop)
export function alertaTecnico() {
    console.log("🚨 EJECUTANDO ALERTA DE TÉCNICO");
    reproducirSonido(1.0); // Volumen máximo

    // Vibración fuerte: (Vibra 500ms, Pausa 200ms, Vibra 500ms)
    if ("vibrate" in navigator) {
        navigator.vibrate([500, 200, 500]);
    }

    // Repetición cada 4s hasta que alguien lo detenga
    // Retornamos el ID del intervalo para poder cancelarlo con clearInterval
    const intervalo = setInterval(() => {
        reproducirSonido(1.0);
        if ("vibrate" in navigator) navigator.vibrate([500, 200, 500]);
    }, 4000);

    return intervalo; 
}

// ALERTA ADMIN (Solo un aviso sonoro)
export function alertaAdmin() {
    console.log("🔔 Alerta Admin");
    reproducirSonido(0.8);
}

// ALERTA CLIENTE (Suave)
export function alertaCliente() {
    reproducirSonido(0.5);
    if ("vibrate" in navigator) {
        navigator.vibrate(200);
    }
}
