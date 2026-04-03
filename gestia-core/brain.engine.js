// ==========================================
// 🧠 GESTIA CORE: BRAIN ENGINE V5.55 (STRICT IDENTITY)
// ==========================================
// Handshake con la Cloud Function del Arquitecto IA (Zero-Trust).
// FIX DEFINITIVO: Doble Capa de ID (Root + Data) para FirewallV5.
// REGLA 1: CÓDIGO COMPLETO SIN RECORTES.

import { auth } from '../firebase.js';

/**
 * INVOCAR ARQUITECTO IA:
 * Envía el prompt, el contexto y los archivos al cerebro en la nube.
 * ACTUALIZACIÓN V5.55: Alineación de estructura para bypass de FirewallV5.
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
        // 🛡️ 1. BLINDAJE DE IDENTIDAD (STRICT)
        // ==========================================
        
        // 🔒 1.1. Blindaje de operationId (opId)
        let finalOpId = operationId;
        if (!finalOpId || typeof finalOpId !== "string") {
            logger.error("🚨 operationId inválido detectado. Regenerando en caliente...");
            finalOpId = `BRAIN_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        }

        // 🔒 1.2. Blindaje de targetModuloId (Identidad de Dominio)
        // 🔥 FIX V5.55: Si targetModuloId es el literal "modulo_id", activamos fallback inmediato.
        let finalModuloId = (targetModuloId && targetModuloId !== "modulo_id") 
            ? targetModuloId 
            : "modulo_fallback_v5";

        // ==========================================
        // 🧪 2. LOG DE AUDITORÍA FRONTEND (CIRUGÍA DE PAYLOAD)
        // ==========================================
        console.log("%c🧪 PAYLOAD SALIENDO (DOUBLE INJECTION):", "color: #10b981; font-weight: bold", JSON.stringify({
            id_root: finalOpId,
            id_data: finalOpId,
            opId: finalOpId,
            modulo_id: finalModuloId
        }, null, 2));

        // 🛡️ 3. OBTENER EL GAFETE VIP (Token JWT)
        let token = authToken;
        if (!token) {
            const currentUser = auth.currentUser;
            if (!currentUser) {
                throw new Error("ERROR_NO_AUTH: El usuario no tiene sesión activa.");
            }
            token = await currentUser.getIdToken(true); 
        }

        // ==========================================
        // 🚀 4. DISPARO AL BÚNKER (DOUBLE LAYER INJECTION)
        // ==========================================
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                // 🔥 NIVEL 1: RAÍZ (Para el Middleware FirewallV5 / req.body.id)
                id: finalOpId, 

                // 🔥 NIVEL 2: DATA (Para el Architect Engine / req.body.data.id)
                data: {
                    id: finalOpId, 
                    opId: finalOpId,
                    prompt: prompt,
                    contexto: contexto,
                    maxTokens: maxTokens || 3200,
                    timestamp: Date.now(),
                    modulo_id: finalModuloId,
                    modulo_nombre: finalModuloId 
                }
            })
        });

        // 🧠 5. PARSEO Y MANEJO DE ERRORES
        let resultData;
        try {
            resultData = await response.json();
        } catch (parseError) {
            throw new Error(`ERROR_BRAIN_HTTP: El búnker devolvió un formato inválido (Status ${response.status})`);
        }

        // Si HTTP no es 200 OK (ej. 401 Unauthorized por el Firewall)
        if (!response.ok) {
            const errorMsg = resultData?.data?.error || resultData?.error || `Error HTTP: ${response.status}`;
            throw new Error(errorMsg);
        }

        // Si el Backend V5.55 reporta success: false 
        if (resultData && resultData.data && resultData.data.success === false) {
            throw new Error(resultData.data.error || "Rechazo de Autoridad en Backend.");
        }

        return resultData;

    } catch (e) {
        logger.error("🚨 FALLO_CONEXIÓN_CEREBRO:", e.message);
        throw e; 
    }
}