/* ================================
   🔔 FIXGO ALERT ENGINE v2.0 (NO-FILES VERSION)
   Archivo: alert-engine.js
   Función: Generador de Sonidos Sintetizados + Vibración
   Ventaja: No requiere archivos .mp3 externos
   ================================ */

let audioContext = null;
let sistemaActivo = false;

// 1. Inicializar el Sintetizador
export async function initAlertSystem() {
    if (audioContext) return;

    // Creamos el contexto de audio
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContext();

    console.log("🎹 Sintetizador FixGo: Listo en espera.");
}

// 2. Activar Sistema (Debe llamarse tras un clic del usuario)
export async function activarAlertas() {
    if (!audioContext) await initAlertSystem();

    // Desbloqueamos el audio en Chrome/Safari
    if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    
    sistemaActivo = true;
    console.log("🔊 MOTOR DE AUDIO: ACTIVADO");
    
    // Hacemos un "micro-beep" inaudible para calentar motores
    generarTono(0, 0.01, 'sine'); 
}


// 3. LA MAGIA: Generador de Tonos (Sin archivos MP3)
function generarTono(frecuencia, duracion, tipo = 'square') {
    if (!audioContext) return;

    // Oscilador (El que vibra)
    const osc = audioContext.createOscillator();
    // Ganancia (El volumen)
    const gainNode = audioContext.createGain();

    osc.type = tipo; // 'sine' (suave), 'square' (retro), 'sawtooth' (agresivo)
    osc.frequency.setValueAtTime(frecuencia, audioContext.currentTime);

    // Envolvente de volumen (Para que no suene "seco")
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duracion);

    // Conectar cables: Oscilador -> Volumen -> Altavoces
    osc.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // ¡DISPARAR!
    osc.start();
    osc.stop(audioContext.currentTime + duracion);
}

// ================================
// 🎯 ALERTAS POR ROL (EXPORTS)
// ================================

// ALERTA TÉCNICO (Doble Beep Agudo - Estilo Walkie Talkie)
export function alertaTecnico() {
    if (!sistemaActivo) return;
    
    console.log("🚨 ALERTA TÉCNICO DISPARADA");

    // Sonido: "Ti-Ti-Ti" (Tres beeps rápidos agudos)
    const now = audioContext.currentTime;
    
    // Beep 1
    generarTono(880, 0.1, 'square'); 
    // Beep 2 (con retraso de 150ms)
    setTimeout(() => generarTono(880, 0.1, 'square'), 150);
    // Beep 3 (con retraso de 300ms)
    setTimeout(() => generarTono(1200, 0.3, 'square'), 300);

    // Vibración Física
    if ("vibrate" in navigator) {
        navigator.vibrate([200, 100, 200, 100, 500]);
    }
}

// ALERTA ADMIN (Campana Suave - Estilo Recepción)
export function alertaAdmin() {
    if (!sistemaActivo) return;
    
    // Sonido: "Ding-Dong"
    generarTono(600, 0.5, 'sine');
    setTimeout(() => generarTono(450, 0.8, 'sine'), 400);
}

// ALERTA CLIENTE (Confirmación Sencilla)
export function alertaCliente() {
    if (!sistemaActivo) return;
    
    // Sonido: "Blip" positivo
    generarTono(1000, 0.1, 'sine');
}
