/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - FIREWALL ENGINE V5 (SENTINEL ADAPTIVE CORE)
 * ======================================================================================
 * DESARROLLADO POR: Gemini (Colaborador IA)
 * PARA: Heber Mendoza (Arquitecto Supremo)
 * * ESTRATEGIA: Reputación persistente, Detección de Botnets y Throttle Progresivo.
 * --------------------------------------------------------------------------------------
 */

const admin = require("firebase-admin");
const db = admin.firestore();

// ⚙️ CONFIGURACIÓN DE SENSIBILIDAD V5 (Nivel Industrial)
const V5_CONFIG = {
    BOTNET_THRESHOLD: 3,      // Número de tenants distintos para marcar como Botnet
    TIME_WINDOW_MS: 30000,    // Ventana de 30 segundos para análisis de ráfagas
    SCORE_BLOCK: 100,         // Umbral de bloqueo total (Blacklist)
    SCORE_THROTTLE: 70,       // Umbral para empezar a degradar velocidad (Delay)
    DECAY: 0.85,              // Factor de enfriamiento (el score baja si el usuario es legítimo)
    REPUTATION_WEIGHT: 0.6,   // Peso del historial de reputación
    BURST_WEIGHT: 0.4         // Peso de la actividad frenética reciente
};

/**
 * firewallV5: Motor de análisis de reputación y control de acceso.
 * @param {Object} req - Request de Express/Cloud Functions
 * @returns {Object} Session - Objeto de autorización y contexto del usuario
 */
async function firewallV5(req) {
    const ip = req.ip || req.headers['x-forwarded-for'] || "0.0.0.0";
    const ua = req.headers['user-agent'] || "unknown_agent";
    const tenantId = req.body?.data?.tenantId || req.query?.tenantId || "UXMAL39";
    const uid = req.body?.data?.uid || "anonymous";

    // 🧬 1. GENERACIÓN DE FINGERPRINT PERSISTENTE
    // Combinamos IP y fragmento de User Agent para identificar al actor, no solo la conexión.
    const fingerprint = `fp_${Buffer.from(`${ip}_${ua.slice(0, 50)}`).toString('base64').substring(0, 20)}`;

    console.log(`🛡️ [FIREWALL V5] Analizando actor: ${fingerprint} | Tenant: ${tenantId}`);

    try {
        // 🧠 2. RECUPERACIÓN DE MEMORIA (PERFIL DE REPUTACIÓN)
        const reputationRef = db.collection("gestia_reputation").doc(fingerprint);
        const reputationSnap = await reputationRef.get();

        let reputation = reputationSnap.exists ? reputationSnap.data() : {
            score: 0,
            trust: 100,
            history: [],
            tenants: [],
            lastSeen: null
        };

        const now = Date.now();

        // 🧬 3. MOTOR DE SCORING AVANZADO
        
        // A. Análisis de Ráfagas (Burst activity)
        // Filtramos marcas de tiempo dentro de nuestra ventana de tiempo (30s)
        const recentTimes = (reputation.history || []).filter(t => now - t < V5_CONFIG.TIME_WINDOW_MS);
        const burstScore = recentTimes.length * 5;

        // B. Correlación Multi-tenant (Detección de Botnets/Scrapers)
        const tenantsSet = new Set(reputation.tenants || []);
        tenantsSet.add(tenantId);
        const tenantsInvolved = tenantsSet.size;

        let clusterScore = 0;
        if (tenantsInvolved >= V5_CONFIG.BOTNET_THRESHOLD) {
            clusterScore += tenantsInvolved * 25; // Penalización agresiva por saltar entre tenants
        }

        // C. Cálculo de Score Híbrido con Decay
        // El score actual se compone del peso de la ráfaga y el comportamiento de red (cluster)
        let instantScore = (clusterScore * V5_CONFIG.BURST_WEIGHT) + (burstScore * V5_CONFIG.REPUTATION_WEIGHT);
        
        // Aplicamos el "Decay": El score histórico se enfría, y sumamos la sospecha actual
        let totalScore = Math.floor(((reputation.score || 0) * V5_CONFIG.DECAY) + instantScore);

        // 🚦 4. ENGINE DE DECISIÓN V5
        let action = "ALLOW";

        if (totalScore >= V5_CONFIG.SCORE_BLOCK) {
            action = "BLOCK";
        } else if (totalScore >= V5_CONFIG.SCORE_THROTTLE) {
            action = "THROTTLE";
        }

        // 🛡️ 5. RESPUESTA ACTIVA
        
        // Acción: BLOQUEO (Inyectar en Blacklist Global)
        if (action === "BLOCK") {
            await db.collection("gestia_global_blacklist").doc(fingerprint).set({
                reason: "V5_ADAPTIVE_THREAT_DETECTION",
                score: totalScore,
                tenants: Array.from(tenantsSet),
                lastIp: ip,
                userAgent: ua,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.error(`🚨 [FIREWALL V5] BLOQUEO EJECUTADO: ${fingerprint} | Score: ${totalScore}`);
            return { authorized: false, reason: "SECURITY_BLOCK_V5", score: totalScore };
        }

        // Acción: THROTTLE (Degradación de experiencia)
        if (action === "THROTTLE") {
            const delay = Math.min(5000, totalScore * 20); // Máximo 5 segundos de retraso
            console.warn(`⚠️ [FIREWALL V5] Aplicando Throttle: ${delay}ms a ${fingerprint} | Score: ${totalScore}`);
            await new Promise(r => setTimeout(r, delay));
        }

        // 📝 6. ACTUALIZACIÓN DE REPUTACIÓN (Memoria Evolutiva)
        // Guardamos los cambios para que el sistema "recuerde" al usuario en la siguiente petición.
        await reputationRef.set({
            score: totalScore,
            trust: Math.max(0, 100 - totalScore),
            history: [...recentTimes, now].slice(-50), // Guardamos solo los últimos 50 eventos
            tenants: Array.from(tenantsSet),
            lastSeen: admin.firestore.FieldValue.serverTimestamp(),
            lastIp: ip
        }, { merge: true });

        // 📊 7. LOG DE SEGURIDAD SENTINEL
        // Registro estructurado para el dashboard de Heberto
        await db.collection("gestia_security_logs").add({
            uid,
            tenantId,
            fingerprint,
            totalScore,
            tenantsInvolved,
            action,
            engine: "FIREWALL_V5_SENTINEL",
            ip: ip,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Retorno de sesión exitosa
        return {
            authorized: true,
            fingerprint,
            tenantId,
            uid,
            score: totalScore,
            trustLevel: Math.max(0, 100 - totalScore)
        };

    } catch (error) {
        console.error("🔥 [FATAL FIREWALL V5]:", error.message);
        // En caso de error crítico del firewall, por seguridad cerramos el acceso (Fail-Safe)
        return { authorized: false, reason: "FIREWALL_INTERNAL_ERROR" };
    }
}

module.exports = { firewallV5 };
