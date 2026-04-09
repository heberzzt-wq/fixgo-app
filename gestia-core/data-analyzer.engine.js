/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - DATA ANALYZER ENGINE V7.4 (HYBRID: DATA + CODE)
 * ======================================================================================
 * Función: El "Ojo de Dios" total. Escanea Firestore Y el Runtime del navegador.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR. NO PLACEHOLDERS.
 * Actualización V7.4: Detección de desentrelazado de código (Ref. El Abuelo).
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
 * analizarCodigoRuntime: Escanea el objeto window buscando piezas desentrelazadas.
 */
function analizarCodigoRuntime() {
    const codeAlerts = [];
    
    // ADN Vital de la Interfaz
    const piezasRequeridas = [
        'renderProposalCard',
        'renderExecutionResult',
        'agregarBurbujaUsuario',
        'KernelHeberto'
    ];

    piezasRequeridas.forEach(pieza => {
        if (!window[pieza]) {
            codeAlerts.push({
                type: "CODE_DETACHED",
                id: `JS_${pieza.toUpperCase()}`,
                target: "WINDOW_SCOPE",
                msg: `DESENTRELAZADO DETECTADO: La pieza '${pieza}' no está vinculada al scope global.`,
                severity: "CRITICAL"
            });
        }
    });

    return codeAlerts;
}

/**
 * analizarDatosSistema: Escaneo híbrido del Tenant.
 */
export async function analizarDatosSistema(tenantId, manualContext = null) {
    console.log(`%c[DATA_ANALYZER]: Iniciando Auditoría Híbrida para: ${tenantId}`, "color: #3b82f6; font-weight: bold;");

    const analysis = {
        alerts: [],    // Aquí irán Alertas de Datos y de Código
        warnings: [],
        insights: [],
        metrics: {
            tecnicos_activos: 0,
            flota_operativa: 0,
            vencimientos_criticos: 0
        },
        timestamp: new Date().toISOString()
    };

    // 🛡️ CAPA 1: ANÁLISIS DE CÓDIGO (EL ABUELO)
    const codeAlerts = analizarCodigoRuntime();
    analysis.alerts.push(...codeAlerts);

    try {
        // --- CAPA 2: SCAN DE CAPITAL HUMANO (Técnicos) ---
        const tecnicosRef = collection(db, "tenants", tenantId, "technicians");
        const snapTecnicos = await getDocs(query(tecnicosRef, limit(20)));

        snapTecnicos.forEach(doc => {
            const data = doc.data();
            const tecnicoId = doc.id;
            analysis.metrics.tecnicos_activos++;

            if (data.seguro_vencimiento) {
                if (new Date(data.seguro_vencimiento) < new Date()) {
                    analysis.alerts.push({
                        type: "HUMAN_RISK",
                        id: tecnicoId,
                        target: data.nombre || "Técnico",
                        msg: `SEGURO VENCIDO: ${data.nombre} fuera de norma legal.`,
                        severity: "CRITICAL"
                    });
                    analysis.metrics.vencimientos_criticos++;
                }
            }

            // Match Manual (Jonathan)
            if (manualContext?.tecnico && data.nombre?.toLowerCase().includes(manualContext.tecnico.toLowerCase())) {
                manualContext.tecnicoId = tecnicoId;
            }
        });

        // --- CAPA 3: SCAN DE FLOTA (Vehículos) ---
        const flotaRef = collection(db, "tenants", tenantId, "vehicles");
        const snapFlota = await getDocs(query(flotaRef, limit(15)));

        snapFlota.forEach(doc => {
            const data = doc.data();
            const vehiculoId = doc.id;
            analysis.metrics.flota_operativa++;

            const uiFlags = data.status_mantenimiento === "requiere_afinacion" || data.badge === "naranja";
            const umbralKm = data.proximo_servicio_km || (data.ultimo_servicio_km + 5000);
            const kmExcedido = data.km_actual >= umbralKm;
            const esTargetManual = manualContext?.placa && (vehiculoId.includes(manualContext.placa) || data.placas?.includes(manualContext.placa));

            if (uiFlags || kmExcedido || esTargetManual) {
                analysis.alerts.push({
                    type: "VEHICLE_MAINTENANCE",
                    id: vehiculoId,
                    target: data.placas || vehiculoId,
                    msg: esTargetManual ? `SINCRONIZACIÓN FORZADA: ${data.modelo || 'Auto'}` : `AFINACIÓN REQUERIDA.`,
                    severity: (kmExcedido || esTargetManual) ? "HIGH" : "MEDIUM",
                    metadata: {
                        asignado_a: manualContext?.tecnicoId || data.asignado_a || "jonathan_uid"
                    }
                });
                analysis.metrics.vencimientos_criticos++;
            }
        });

        // --- CAPA 4: SCAN FINANCIERO ---
        const tenantRef = collection(db, "tenants");
        const snapTenant = await getDocs(query(tenantRef, where("tenantId", "==", tenantId), limit(1)));

        if (!snapTenant.empty && snapTenant.docs[0].data().status === "deudor") {
            analysis.alerts.push({
                type: "BILLING_LOCK",
                id: tenantId,
                target: "SISTEMA",
                msg: "Mora detectada. Módulo restringido.",
                severity: "CRITICAL"
            });
        }

        console.log(`%c[DATA_ANALYZER]: Escaneo Híbrido OK. Alertas totales: ${analysis.alerts.length}`, "color: #10b981; font-weight: bold;");
        return analysis;

    } catch (error) {
        console.error("❌ ERROR_IN_DATA_ANALYZER:", error);
        throw error;
    }
}

/**
 * generateHealthScore: Salud del búnker.
 */
export function generateHealthScore(analysis) {
    if (!analysis) return 0;
    let score = 100;
    score -= (analysis.alerts.length * 15);
    return Math.max(0, score);
}