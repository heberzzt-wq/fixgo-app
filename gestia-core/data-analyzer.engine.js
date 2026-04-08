/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - DATA ANALYZER ENGINE V7.0
 * ======================================================================================
 * Función: El "Ojo de Dios". Escanea la realidad operativa para evitar alucinaciones.
 * Autor: Heber Mendoza (Arquitecto Supremo)
 * ======================================================================================
 */

import { 
    db, 
    collection, 
    getDocs, 
    query, 
    where, 
    limit 
} from '../firebase.js';

/**
 * analizarDatosSistema: Escaneo profundo del Tenant
 * @param {string} tenantId - El ID del búnker a analizar
 */
export async function analizarDatosSistema(tenantId) {
    console.log(`%c[DATA_ANALYZER]: Iniciando escaneo para Tenant: ${tenantId}`, "color: #3b82f6; font-weight: bold;");

    const analysis = {
        alerts: [],    // Bloqueos críticos (Seguros vencidos, falta de pago)
        warnings: [],  // Preventivos (Mantenimientos próximos)
        insights: [],  // Oportunidades (Optimización de rutas)
        metrics: {
            tecnicos_activos: 0,
            flota_operativa: 0,
            vencimientos_criticos: 0
        },
        timestamp: new Date().toISOString()
    };

    try {
        // --- 1. SCAN DE CAPITAL HUMANO (Técnicos) ---
        const tecnicosRef = collection(db, "tenants", tenantId, "technicians");
        const qTecnicos = query(tecnicosRef, limit(20)); // Límite Tacaño V7
        const snapTecnicos = await getDocs(qTecnicos);

        snapTecnicos.forEach(doc => {
            const data = doc.data();
            analysis.metrics.tecnicos_activos++;

            // Lógica Forense: Caso Jonathan / Seguros
            if (data.seguro_vencimiento) {
                const fechaVencimiento = new Date(data.seguro_vencimiento);
                const hoy = new Date();
                
                if (fechaVencimiento < hoy) {
                    analysis.alerts.push({
                        type: "HUMAN_RISK",
                        id: doc.id,
                        target: data.nombre || "Técnico sin nombre",
                        msg: `SEGURO VENCIDO: El técnico opera fuera de norma legal desde ${data.seguro_vencimiento}.`,
                        severity: "CRITICAL"
                    });
                    analysis.metrics.vencimientos_criticos++;
                }
            }
        });

        // --- 2. SCAN DE FLOTA (Vehículos) ---
        const flotaRef = collection(db, "tenants", tenantId, "vehicles");
        const qFlota = query(flotaRef, limit(15));
        const snapFlota = await getDocs(qFlota);

        snapFlota.forEach(doc => {
            const data = doc.data();
            analysis.metrics.flota_operativa++;

            // Mantenimiento Preventivo
            if (data.km_actual >= (data.ultimo_servicio_km + 5000)) {
                analysis.warnings.push({
                    type: "VEHICLE_MAINTENANCE",
                    id: doc.id,
                    target: data.placas || doc.id,
                    msg: `Servicio pendiente: Superó el umbral de 5,000km post-servicio.`,
                    severity: "MEDIUM"
                });
            }
        });

        // --- 3. SCAN FINANCIERO (SaaS / Suscripción) ---
        // Aquí verificamos si el Tenant mismo está al día
        const tenantRef = collection(db, "tenants");
        const qTenant = query(tenantRef, where("tenantId", "==", tenantId), limit(1));
        const snapTenant = await getDocs(qTenant);

        if (!snapTenant.empty) {
            const tData = snapTenant.docs[0].data();
            if (tData.status === "deudor") {
                analysis.alerts.push({
                    type: "BILLING_LOCK",
                    id: tenantId,
                    target: "SISTEMA",
                    msg: "Módulo en modo lectura: Detectado impago en suscripción Gestia.",
                    severity: "CRITICAL"
                });
            }
        }

        console.log(`%c[DATA_ANALYZER]: Escaneo completado. Hallazgos: ${analysis.alerts.length} Alertas | ${analysis.warnings.length} Advertencias`, "color: #10b981;");
        return analysis;

    } catch (error) {
        console.error("❌ ERROR_IN_DATA_ANALYZER:", error);
        throw new Error(`ANALYZER_CRASH: ${error.message}`);
    }
}

/**
 * generateHealthScore: Calcula el estado de salud del búnker
 */
export function generateHealthScore(analysis) {
    let score = 100;
    score -= (analysis.alerts.length * 20);
    score -= (analysis.warnings.length * 5);
    return Math.max(0, score);
}