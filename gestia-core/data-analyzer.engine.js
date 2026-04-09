/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - DATA ANALYZER ENGINE V7.3 (MANUAL OVERRIDE & UI-SYNC)
 * ======================================================================================
 * Función: El "Ojo de Dios". Escanea la realidad operativa para evitar alucinaciones.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR. NO PLACEHOLDERS.
 * Actualización V7.3: Capacidad de enlace forzado (Manual Context) para Jonathan/Gol.
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
 * analizarDatosSistema: Escaneo profundo del Tenant con capacidad de sobreescritura manual.
 * @param {string} tenantId - El ID del búnker a analizar.
 * @param {Object} manualContext - Contexto extraído del lenguaje natural (opcional).
 */
export async function analizarDatosSistema(tenantId, manualContext = null) {
    console.log(`%c[DATA_ANALYZER]: Iniciando escaneo profundo para Tenant: ${tenantId}`, "color: #3b82f6; font-weight: bold;");

    const analysis = {
        alerts: [],    // Bloqueos críticos (Seguros, Afinaciones urgentes, Impagos)
        warnings: [],  // Preventivos (Mantenimientos próximos)
        insights: [],  // Optimización
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
        const qTecnicos = query(tecnicosRef, limit(20)); 
        const snapTecnicos = await getDocs(qTecnicos);

        snapTecnicos.forEach(doc => {
            const data = doc.data();
            const tecnicoId = doc.id;
            analysis.metrics.tecnicos_activos++;

            // A) Lógica de Seguros (Vencimientos)
            if (data.seguro_vencimiento) {
                const fechaVencimiento = new Date(data.seguro_vencimiento);
                const hoy = new Date();
                
                if (fechaVencimiento < hoy) {
                    analysis.alerts.push({
                        type: "HUMAN_RISK",
                        id: tecnicoId,
                        target: data.nombre || "Técnico sin nombre",
                        msg: `SEGURO VENCIDO: El técnico opera fuera de norma legal desde ${data.seguro_vencimiento}.`,
                        severity: "CRITICAL"
                    });
                    analysis.metrics.vencimientos_criticos++;
                }
            }

            // B) Inyección de Contexto Manual (Jonathan Match)
            if (manualContext && manualContext.tecnico) {
                const nombreLimpio = (data.nombre || "").toLowerCase();
                if (nombreLimpio.includes(manualContext.tecnico.toLowerCase())) {
                    console.log(`🎯 [Analyzer] Enlace manual detectado para técnico: ${data.nombre}`);
                    manualContext.tecnicoId = tecnicoId; // Guardamos el ID real para el Propose Engine
                }
            }
        });

        // --- 2. SCAN DE FLOTA (Vehículos) ---
        const flotaRef = collection(db, "tenants", tenantId, "vehicles");
        const qFlota = query(flotaRef, limit(15));
        const snapFlota = await getDocs(qFlota);

        snapFlota.forEach(doc => {
            const data = doc.data();
            const vehiculoId = doc.id;
            analysis.metrics.flota_operativa++;

            // A) Detección por Flags de Interfaz (Lo que Heber ve en pantalla)
            const uiRequiereAtencion = 
                data.status_mantenimiento === "requiere_afinacion" || 
                data.mantenimiento === "pendiente" ||
                data.badge === "naranja";

            // B) Detección por Kilometraje (Hard Logic)
            const umbralKm = data.proximo_servicio_km || (data.ultimo_servicio_km + 5000);
            const kmExcedido = data.km_actual >= umbralKm;

            // C) Match Manual por Placa o Modelo (El caso del Gol UVZ343K)
            const esTargetManual = manualContext && manualContext.placa && 
                                 (vehiculoId.includes(manualContext.placa) || (data.placas && data.placas.includes(manualContext.placa)));

            if (uiRequiereAtencion || kmExcedido || esTargetManual) {
                analysis.alerts.push({
                    type: "VEHICLE_MAINTENANCE",
                    id: vehiculoId,
                    target: data.placas || vehiculoId,
                    msg: esTargetManual 
                        ? `INTERVENCIÓN SOLICITADA: Sincronización forzada para ${data.modelo || 'Vehículo'} (${vehiculoId}).`
                        : `AFINACIÓN REQUERIDA: Vehículo reporta estatus crítico a los ${data.km_actual} km.`,
                    severity: (kmExcedido || esTargetManual) ? "HIGH" : "MEDIUM",
                    metadata: {
                        km_actual: data.km_actual,
                        asignado_a: manualContext?.tecnicoId || data.asignado_a || "jonathan_uid",
                        placa: data.placas || vehiculoId
                    }
                });
                analysis.metrics.vencimientos_criticos++;
            }
        });

        // --- 3. SCAN FINANCIERO (Suscripción) ---
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

        console.log(`%c[DATA_ANALYZER]: Escaneo completado. Hallazgos: ${analysis.alerts.length} Alertas | ${analysis.warnings.length} Advertencias`, "color: #10b981; font-weight: bold;");
        return analysis;

    } catch (error) {
        console.error("❌ ERROR_IN_DATA_ANALYZER:", error);
        throw new Error(`ANALYZER_CRASH: ${error.message}`);
    }
}

/**
 * generateHealthScore: Calcula el estado de salud del búnker
 * @param {Object} analysis - El resultado del escaneo.
 */
export function generateHealthScore(analysis) {
    if (!analysis) return 0;
    let score = 100;
    score -= (analysis.alerts.length * 20);
    score -= (analysis.warnings.length * 5);
    return Math.max(0, score);
}