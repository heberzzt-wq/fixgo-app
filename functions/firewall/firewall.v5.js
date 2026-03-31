/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - FIREWALL ENGINE V5 (SENTINEL RADAR V5.45)
 * ======================================================================================
 * DESARROLLADO POR: Gemini (Colaborador IA)
 * PARA: Heber Mendoza (Arquitecto Supremo)
 * * ESTRATEGIA: Reputación persistente, Detección de Botnets y Telemetría Radar.
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
 * 🛰️ reportSentinelMetric: Helper interno para el Firewall.
 * (Asegura que el Firewall pueda reportar al Radar incluso como módulo independiente)
 */
async function reportSentinelMetric(metricName, value = 1) {
    const today = new Date().toISOString().split('T')[0];
    const healthRef = db.collection("gestia_system_health").doc(today);
    try {
        await healthRef.set({
            [metricName]: admin.firestore.FieldValue.increment(value),
            last_heartbeat: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) { /* Fallback silencioso */ }
}

/**
 * firewallV5: Motor de análisis de reputación y control de acceso.
 */
async function firewallV5(req) {
    const ip = req.ip || req.headers['x-forwarded-for'] || "0.0.0.0";
    const ua = req.headers['user-agent'] || "unknown_agent";
    const tenantId = req.body?.data?.tenantId || req.query?.tenantId || "UXMAL39";
    const uid = req.body?.data?.uid || "anonymous";

    // 🧬 1. GENERACIÓN DE FINGERPRINT PERSISTENTE
    const fingerprint = `fp_${Buffer.from(`${ip}_${ua.slice(0, 50)}`).toString('base64').substring(0, 20)}`;

    try {
        // 🛰️ RADAR: Pulso de análisis iniciado
        await reportSentinelMetric('firewall_requests_analyzed');

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
        const recentTimes = (reputation.history || []).filter(t => now - t < V5_CONFIG.TIME_WINDOW_MS);
        const burstScore = recentTimes.length * 5;

        // B. Correlación Multi-tenant (Detección de Botnets)
        const tenantsSet = new Set(reputation.tenants || []);
        tenantsSet.add(tenantId);
        const tenantsInvolved = tenantsSet.size;

        let clusterScore = 0;
        if (tenantsInvolved >= V5_CONFIG.BOTNET_THRESHOLD) {
            clusterScore += tenantsInvolved * 25;
            // 🛰️ RADAR: Detectada posible red de bots
            await reportSentinelMetric('firewall_botnet_signals');
        }

        // C. Cálculo de Score Híbrido con Decay
        let instantScore = (clusterScore * V5_CONFIG.BURST_WEIGHT) + (burstScore * V5_CONFIG.REPUTATION_WEIGHT);
        let totalScore = Math.floor(((reputation.score || 0) * V5_CONFIG.DECAY) + instantScore);

        // 🚦 4. ENGINE DE DECISIÓN V5
        let action = "ALLOW";

        if (totalScore >= V5_CONFIG.SCORE_BLOCK) {
            action = "BLOCK";
        } else if (totalScore >= V5_CONFIG.SCORE_THROTTLE) {
            action = "THROTTLE";
        }

        // 🛡️ 5. RESPUESTA ACTIVA
        
        // Acción: BLOQUEO
        if (action === "BLOCK") {
            // 🛰️ RADAR: Bloqueo de seguridad ejecutado
            await reportSentinelMetric('firewall_blocks_total');
            
            await db.collection("gestia_global_blacklist").doc(fingerprint).set({
                reason: "V5_ADAPTIVE_THREAT_DETECTION",
                score: totalScore,
                tenants: Array.from(tenantsSet),
                lastIp: ip,
                userAgent: ua,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.error(`🚨 [FIREWALL V5] BLOQUEO: ${fingerprint} | Score: ${totalScore}`);
            return { authorized: false, reason: "SECURITY_BLOCK_V5", score: totalScore };
        }

        // Acción: THROTTLE
        if (action === "THROTTLE") {
            // 🛰️ RADAR: Freno de mano aplicado (Degradación de velocidad)
            await reportSentinelMetric('firewall_throttles_applied');
            
            const delay = Math.min(5000, totalScore * 20);
            console.warn(`⚠️ [FIREWALL V5] Throttle: ${delay}ms a ${fingerprint}`);
            await new Promise(r => setTimeout(r, delay));
        }

        // 📝 6. ACTUALIZACIÓN DE REPUTACIÓN
        await reputationRef.set({
            score: totalScore,
            trust: Math.max(0, 100 - totalScore),
            history: [...recentTimes, now].slice(-50),
            tenants: Array.from(tenantsSet),
            lastSeen: admin.firestore.FieldValue.serverTimestamp(),
            lastIp: ip
        }, { merge: true });

        // 📊 7. LOG DE SEGURIDAD SENTINEL
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

        // 🛰️ RADAR: Petición autorizada con éxito
        await reportSentinelMetric('firewall_authorized_access');

        return {
            authorized: true,
            fingerprint,
            tenantId,
            uid,
            score: totalScore,
            trustLevel: Math.max(0, 100 - totalScore)
        };

    } catch (error) {
        // 🛰️ RADAR: Error fatal en el motor de seguridad
        await reportSentinelMetric('firewall_fatal_errors');
        
        console.error("🔥 [FATAL FIREWALL V5]:", error.message);
        return { authorized: false, reason: "FIREWALL_INTERNAL_ERROR" };
    }
}

module.exports = { firewallV5 };
