// ==========================================
// 🧠 GESTIA CORE: BRAIN ENGINE V5.55 (STRICT IDENTITY)
// ==========================================
// Handshake con la Cloud Function del Arquitecto IA (Zero-Trust).

import { auth } from '../firebase.js';

/**
 * INVOCAR ARQUITECTO IA:
 * Envía el prompt, el contexto y los archivos al cerebro en la nube.
 * ACTUALIZACIÓN V5.55: Sincronización de Identidad Snake_Case y ID Dinámico.
 * 🛡️ FIX ANTI-FRÁGIL: Blindaje total contra IDs corruptos o inexistentes.
 */
export async function invocarArquitectoIA(prompt, contexto, operationId, maxTokens, authToken, targetModuloId) {
    const logger = { 
        log: console.log, 
        warn: console.warn, 
        error: console.error 
    };
    
    // URL del Búnker Central (Sincronizado con Proyecto fixgo-44e4d)
    const ENDPOINT = 'https://us-central1-fixgo-44e4d.cloudfunctions.net/gestiaArchitectV5';

    try {
        // ==========================================
        // 🛡️ 1. BLINDAJE DE IDENTIDAD (CRÍTICO V5.55)
        // ==========================================
        
        // 🔒 1.1. Blindaje de operationId (opId)
        let finalOpId = operationId;

        if (!finalOpId || typeof finalOpId !== "string") {
            logger.error("🚨 operationId inválido detectado en Brain Engine");
            
            // Generación de emergencia para no romper el contrato con el Backend
            finalOpId = `BRAIN_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            
            logger.warn(`⚠️ opId regenerado en Brain Engine: ${finalOpId}`);
        }

        // 🔒 1.2. Blindaje de targetModuloId (Identidad del Módulo)
        let finalModuloId = targetModuloId;

        if (!finalModuloId || typeof finalModuloId !== "string") {
            logger.warn("⚠️ targetModuloId inválido, activando fallback de identidad");
            finalModuloId = "modulo_fallback_v5";
        }

        // Logging de trazabilidad final antes del salto a la nube
        console.log("🧬 [BRAIN_SHIELD] OP_ID FINAL:", finalOpId);
        console.log("🧬 [BRAIN_SHIELD] MODULO_ID FINAL:", finalModuloId);

        // 🛡️ 2. OBTENER EL GAFETE VIP (Token JWT Bearer)
        // Si la Terminal Heberto (V5.55) nos inyecta el token en la llamada, lo usamos.
        // Si no, usamos auth.currentUser como Fallback Atómico.
        let token = authToken;
        
        if (!token) {
            const currentUser = auth.currentUser;
            if (!currentUser) {
                throw new Error("ERROR_NO_AUTH: Autoridad no reconocida. El usuario no está logueado en el frontend.");
            }
            token = await currentUser.getIdToken(true); 
        }

        // 🚀 3. ENVIAR LA PETICIÓN CON EL FIREWALL PASS (ZERO-TRUST V5.55)
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // 🔑 EL PASE VIP INQUEBRANTABLE
            },
            body: JSON.stringify({
                data: { // 📦 Empaquetado estándar para Cloud Functions
                    prompt: prompt,
                    contexto: contexto,
                    opId: finalOpId, // <--- 🆔 ID BLINDADO
                    maxTokens: maxTokens || 3200,
                    timestamp: Date.now(),
                    // 🛡️ LEY DE IDENTIDAD V5.55: Evitamos ID_CORRUPTO [undefined]
                    modulo_id: finalModuloId, // <--- 🆔 ID BLINDADO
                    modulo_nombre: finalModuloId 
                }
            })
        });

        // 🧠 4. PARSEO Y MANEJO DE ERRORES DEL MUTEX/FIREWALL
        let resultData;
        try {
            resultData = await response.json();
        } catch (parseError) {
            throw new Error(`ERROR_BRAIN_HTTP: El búnker devolvió un formato inválido (Status ${response.status})`);
        }

        // Si HTTP no es 200 OK (ej. 405 Método no permitido, 401 Unauthenticated)
        if (!response.ok) {
            const errorMsg = resultData?.data?.error || resultData?.error || `Error de Red HTTP: ${response.status}`;
            throw new Error(errorMsg);
        }

        // Si HTTP es 200 pero el Backend V5.55 reporta success: false 
        // (Ej. Rate Limit excedido, Bloqueo de Firewall o Rechazo de Audit Engine)
        if (resultData && resultData.data && resultData.data.success === false) {
            throw new Error(resultData.data.error || "Rechazo de Autoridad en Backend (Bloqueo Activo)");
        }

        // Retornamos la data cruda. El Normalizador Híbrido en gestia-terminal.js la procesará.
        return resultData;

    } catch (e) {
        logger.error("🚨 FALLO_CONEXIÓN_CEREBRO:", e.message);
        throw e; // Lanzamos para que el Orquestador lo capture y pinte la burbuja de error
    }
}