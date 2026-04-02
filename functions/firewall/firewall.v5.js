/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - FIREWALL ENGINE V5.51.8 (SENTINEL RADAR ANTIFRÁGIL)
 * ======================================================================================
 * DESARROLLADO POR: Gemini (Colaborador IA)
 * PARA: Heber Mendoza (Arquitecto Supremo)
 * ESTRATEGIA: Inyección de Dependencias (Factory Pattern) y Zero-Trust.
 * ACTUALIZACIÓN V5.51.8: Corrección de Scope y Encapsulamiento de Métricas.
 * --------------------------------------------------------------------------------------
 */

// ⚙️ CONFIGURACIÓN DE SENSIBILIDAD V5.51 (Nivel Industrial)
const V5_CONFIG = {
    BOTNET_THRESHOLD: 3,      // Número de tenants distintos para marcar como Botnet
    TIME_WINDOW_MS: 30000,    // Ventana de 30 segundos para análisis de ráfagas
    SCORE_BLOCK: 100,         // Umbral de bloqueo total (Blacklist)
    SCORE_THROTTLE: 70,       // Umbral para empezar a degradar velocidad (Delay)
    DECAY: 0.85,              // Factor de enfriamiento
    REPUTATION_WEIGHT: 0.6,   // Peso del historial
    BURST_WEIGHT: 0.4         // Peso de la actividad reciente
};

/**
 * FACTORY MODULE: Recibe las instancias de admin y db desde el index.js
 * para asegurar que el Firewall no use recursos antes de que estén listos.
 */
module.exports = ({ admin, db }) => {

    /**
     * 🛰️ reportSentinelMetric: Helper interno encapsulado.
     * Ahora tiene acceso garantizado a 'db' y 'admin' vía closure.
     */
    async function reportSentinelMetric(metricName, value = 1) {
        const today = new Date().toISOString().split('T')[0];
        const healthRef = db.collection("gestia_system_health").doc(today);
        try {
            await healthRef.set({
                [metricName]: admin.firestore.FieldValue.increment(value),
                last_heartbeat: admin.firestore.FieldValue.serverTimestamp(),
                version_core: "V5.51_ANTIFRAGILE"
            }, { merge: true });
        } catch (e) { 
            // Fallback silencioso para no bloquear el flujo crítico si el radar falla
        }
    }

    /**
     * firewallV5: Motor de análisis de reputación y control de acceso.
     */
    async function firewallV5(req) {
        const ip = req.ip || req.headers['x-forwarded-for'] || "0.0.0.0";
        const ua = req.headers['user-agent'] || "unknown_agent";
        
        let uid = "anonymous";
        let tenantId = null;

        try {
            // 🛡️ 1. EXTRACCIÓN DE IDENTIDAD SUPREMA
            const authHeader = req.headers.authorization || req.headers.Authorization || "";
            
            if (authHeader.startsWith('Bearer ')) {
                const idToken = authHeader.split('Bearer ')[1];
                try {
                    // Validamos la firma del token criptográfico
                    const decodedToken = await admin.auth().verifyIdToken(idToken);
                    uid = decodedToken.uid;
                    
                    // Prioridad 1: Custom Claim
                    tenantId = decodedToken.tenantId;

                    // Prioridad 2: Consulta a Base de Datos (Fuente de Verdad)
                    if (!tenantId) {
                        const userRecord = await db.collection("users").doc(uid).get();
                        if (userRecord.exists) {
                            tenantId = userRecord.data().tenantId || userRecord.data().condominioId;
                        }
                    }
                } catch (tokenError) {
                    console.warn(`⚠️ [FIREWALL V5.51] Token rechazado: ${tokenError.message}`);
                    return { authorized: false, reason: "INVALID_AUTH_TOKEN", score: 100 };
                }
            }

            // 🛡️ 2. GUARDA DE CONTEXTO (Zero-Trust Policy)
            if (!tenantId || uid === "anonymous") {
                await reportSentinelMetric('firewall_unauthenticated_drops');
                console.warn(`🚨 [FIREWALL V5.51] Acceso denegado: Sin sesión válida. IP: ${ip}`);
                return { authorized: false, reason: "MISSING_TENANT_CONTEXT_OR_AUTH", score: 100 };
            }

            // 🧬 3. GENERACIÓN DE FINGERPRINT PERSISTENTE
            const fingerprint = `fp_${Buffer.from(`${ip}_${ua.slice(0, 50)}`).toString('base64').substring(0, 20)}`;

            // 🛰️ RADAR: Pulso de análisis
            await reportSentinelMetric('firewall_requests_analyzed');

            // 🧠 4. RECUPERACIÓN DE MEMORIA (PERFIL DE REPUTACIÓN)
            const reputationRef = db.collection("gestia_reputation").doc(fingerprint);
            const reputationSnap = await reputationRef.get();

            let reputation = reputationSnap.exists ? reputationSnap.data() : {
                score: 0, trust: 100, history: [], tenants: [], lastSeen: null
            };

            const now = Date.now();

            // 🧬 5. MOTOR DE SCORING AVANZADO
            const recentTimes = (reputation.history || []).filter(t => now - t < V5_CONFIG.TIME_WINDOW_MS);
            const burstScore = recentTimes.length * 5;

            const tenantsSet = new Set(reputation.tenants || []);
            tenantsSet.add(tenantId);
            const tenantsInvolved = tenantsSet.size;

            let clusterScore = 0;
            if (tenantsInvolved >= V5_CONFIG.BOTNET_THRESHOLD) {
                clusterScore += tenantsInvolved * 25;
                await reportSentinelMetric('firewall_botnet_signals');
            }

            let instantScore = (clusterScore * V5_CONFIG.BURST_WEIGHT) + (burstScore * V5_CONFIG.REPUTATION_WEIGHT);
            let totalScore = Math.floor(((reputation.score || 0) * V5_CONFIG.DECAY) + instantScore);

            // 🚦 6. ENGINE DE DECISIÓN
            let action = "ALLOW";
            if (totalScore >= V5_CONFIG.SCORE_BLOCK) {
                action = "BLOCK";
            } else if (totalScore >= V5_CONFIG.SCORE_THROTTLE) {
                action = "THROTTLE";
            }

            // 🛡️ 7. RESPUESTA ACTIVA - BLOQUEO
            if (action === "BLOCK") {
                await reportSentinelMetric('firewall_blocks_total');
                await db.collection("gestia_global_blacklist").doc(fingerprint).set({
                    reason: "V5.51_ADAPTIVE_THREAT_DETECTION",
                    score: totalScore,
                    tenants: Array.from(tenantsSet),
                    lastIp: ip,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.error(`🚨 [FIREWALL V5.51] BLOQUEO: ${fingerprint} | Score: ${totalScore}`);
                return { authorized: false, reason: "SECURITY_BLOCK_V5.51", score: totalScore };
            }

            // Acción: THROTTLE
            if (action === "THROTTLE") {
                await reportSentinelMetric('firewall_throttles_applied');
                const delay = Math.min(5000, totalScore * 20);
                await new Promise(r => setTimeout(r, delay));
            }

            // 📝 8. ACTUALIZACIÓN DE REPUTACIÓN
            await reputationRef.set({
                score: totalScore,
                trust: Math.max(0, 100 - totalScore),
                history: [...recentTimes, now].slice(-50),
                tenants: Array.from(tenantsSet),
                lastSeen: admin.firestore.FieldValue.serverTimestamp(),
                lastIp: ip
            }, { merge: true });

            // 📊 9. LOG DE SEGURIDAD SENTINEL
            await db.collection("gestia_security_logs").add({
                uid, tenantId, fingerprint, totalScore, action,
                engine: "FIREWALL_V5.51_ANTIFRAGILE",
                ip: ip, createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await reportSentinelMetric('firewall_authorized_access');

            // ✅ 10. CONTRATO DE AUTORIDAD
            return {
                authorized: true,
                fingerprint,
                tenantId,
                uid,
                score: totalScore,
                trustLevel: Math.max(0, 100 - totalScore)
            };

        } catch (error) {
            await reportSentinelMetric('firewall_fatal_errors');
            console.error("🔥 [FATAL FIREWALL V5.51]:", error.message);
            return { authorized: false, reason: "FIREWALL_INTERNAL_ERROR" };
        }
    }

    // Retornamos las funciones que queremos que el index.js vea
    return { firewallV5 };
};