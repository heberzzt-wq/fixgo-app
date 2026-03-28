// ==========================================
// 🧠 GESTIA CORE: BRAIN ENGINE V1.0
// ==========================================
// Handshake con la Cloud Function del Arquitecto IA.

import { auth } from '../firebase.js'; // 🛡️ INYECCIÓN: Necesitamos la instancia de auth para el Token VIP

/**
 * INVOCAR ARQUITECTO IA:
 * Envía el prompt, el contexto y los archivos al cerebro en la nube.
 */
export async function invocarArquitectoIA(prompt, contexto, operationId) {
    const logger = { log: console.log, error: console.error }; // Logger básico interno
    
    // URL de tu Cloud Function (Asegúrate de que sea la correcta)
    const ENDPOINT = 'https://us-central1-fixgo-44e4d.cloudfunctions.net/gestiaArchitectV5';

    try {
        // 1. OBTENER EL GAFETE VIP (Token de sesión de Firebase)
        const currentUser = auth.currentUser;
        if (!currentUser) {
            throw new Error("ERROR_NO_AUTH: Autoridad no reconocida. El usuario no está logueado en el frontend.");
        }
        
        // Obtenemos el token (true fuerza la actualización por si el caché del token expiró)
        const token = await currentUser.getIdToken(true); 

        // 2. ENVIAR LA PETICIÓN CON EL FIREWALL PASS
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // 🔑 EL PASE VIP PARA EL FIREWALL V4
            },
            body: JSON.stringify({
                prompt: prompt,
                contexto: contexto,
                opId: operationId,
                timestamp: Date.now(),
                // 🛡️ INYECCIÓN DE AUTORIDAD PARA EL FIREWALL V4
                moduleId: "terminal_heberto_v5", 
                moduloId: "terminal_heberto_v5"  
            })
        });

        if (!response.ok) {
            // Intentamos extraer el mensaje de error real del backend si fallara otra cosa
            let errData;
            try {
                errData = await response.json();
            } catch (parseError) {
                errData = { error: `ERROR_BRAIN_HTTP: ${response.status}` };
            }
            throw new Error(errData.error || `ERROR_BRAIN_HTTP: ${response.status}`);
        }

        return await response.json();

    } catch (e) {
        logger.error("🚨 FALLO_CONEXIÓN_CEREBRO:", e.message);
        throw e;
    }
}
