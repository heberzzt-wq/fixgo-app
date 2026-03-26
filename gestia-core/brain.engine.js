// ==========================================
// 🧠 GESTIA CORE: BRAIN ENGINE V1.0
// ==========================================
// Handshake con la Cloud Function del Arquitecto IA.

/**
 * INVOCAR ARQUITECTO IA:
 * Envía el prompt, el contexto y los archivos al cerebro en la nube.
 */
export async function invocarArquitectoIA(prompt, contexto, operationId) {
    const logger = { log: console.log, error: console.error }; // Logger básico interno
    
    // URL de tu Cloud Function (Asegúrate de que sea la correcta)
    const ENDPOINT = "https://us-central1-gestiapremium.cloudfunctions.net/gestiaArchitectV5";

    try {
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: prompt,
                contexto: contexto,
                opId: operationId,
                timestamp: Date.now()
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || `ERROR_BRAIN_HTTP: ${response.status}`);
        }

        return await response.json();

    } catch (e) {
        logger.error("🚨 FALLO_CONEXIÓN_CEREBRO:", e.message);
        throw e;
    }
}
