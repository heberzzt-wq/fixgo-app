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
function generarTono(frecuencia, duracion, tipo = 'square', volumen = 0.1) {
    if (!audioContext) return;

    // Oscilador (El que vibra)
    const osc = audioContext.createOscillator();
    // Ganancia (El volumen)
    const gainNode = audioContext.createGain();

    osc.type = tipo; // 'sine' (suave), 'square' (retro), 'sawtooth' (agresivo)
    osc.frequency.setValueAtTime(frecuencia, audioContext.currentTime);

    // Envolvente de volumen (Para que no suene "seco")
    const gananciaSegura = Math.min(Math.max(Number(volumen) || 0.1, 0.01), 0.55);
    gainNode.gain.setValueAtTime(gananciaSegura, audioContext.currentTime);
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

// ALERTA TÉCNICO (timbre largo, fuerte y reconocible para solicitudes nuevas)
export function alertaTecnico() {
    if (!sistemaActivo) return;
    
    console.log("🚨 ALERTA TÉCNICO DISPARADA");

    const secuencia = [880, 1046, 880, 1046, 988, 1175, 1046, 1318];
    secuencia.forEach((frecuencia, index) => {
        setTimeout(() => {
            generarTono(frecuencia, index === secuencia.length - 1 ? 1.15 : 0.28, 'square', 0.42);
            generarTono(frecuencia / 2, index === secuencia.length - 1 ? 1.15 : 0.28, 'sine', 0.24);
        }, index * 380);
    });

    // Vibración Física
    if ("vibrate" in navigator) {
        navigator.vibrate([700, 180, 700, 180, 700, 180, 1200]);
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
