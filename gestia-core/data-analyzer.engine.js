/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - DATA ANALYZER ENGINE V7.2 (UI-SYNC)
 * ======================================================================================
 * Función: El "Ojo de Dios". Escanea la realidad operativa para evitar alucinaciones.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR.
 * Actualización V7.2: Sincronización con Flags de UI y alertas de flota críticas.
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
        alerts: [],    // Bloqueos críticos (Seguros vencidos, falta de pago, afinación urgente)
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
        // 🛠️ FIX V7.2: Entrelazado con Flags de UI para detectar afinaciones
        const flotaRef = collection(db, "tenants", tenantId, "vehicles");
        const qFlota = query(flotaRef, limit(15));
        const snapFlota = await getDocs(qFlota);

        snapFlota.forEach(doc => {
            const data = doc.data();
            analysis.metrics.flota_operativa++;

            // A) Detección por Flags de Interfaz (Lo que tú ves en pantalla)
            const uiRequiereAtencion = 
                data.status_mantenimiento === "requiere_afinacion" || 
                data.mantenimiento === "pendiente" ||
                data.badge === "naranja";

            // B) Detección por Kilometraje (Hard Logic)
            // Priorizamos proximo_servicio_km si existe, sino usamos el offset de +5000
            const umbralKm = data.proximo_servicio_km || (data.ultimo_servicio_km + 5000);
            const kmExcedido = data.km_actual >= umbralKm;

            if (uiRequiereAtencion || kmExcedido) {
                // Si la UI ya lo marca, lo subimos de Warning a ALERT
                analysis.alerts.push({
                    type: "VEHICLE_MAINTENANCE",
                    id: doc.id,
                    target: data.placas || doc.id,
                    msg: `AFINACIÓN REQUERIDA: Vehículo ${data.modelo || ''} (${doc.id}) reporta estatus crítico a los ${data.km_actual} km.`,
                    severity: "HIGH",
                    metadata: {
                        km_actual: data.km_actual,
                        asignado_a: data.asignado_a || "jonathan_uid" // Link directo al técnico
                    }
                });
                analysis.metrics.vencimientos_criticos++;
            }
        });

        // --- 3. SCAN FINANCIERO (SaaS / Suscripción) ---
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