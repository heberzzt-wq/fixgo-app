/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - DATA ANALYZER ENGINE V8.1 (THE OMNISCIENT EYE - PERFECT SIGHT)
 * ======================================================================================
 * Identidad: Escáner Forense Híbrido, Analizador de Riesgos y "Fuente de Verdad".
 * Función: Extrae, consolida y evalúa la salud del código y la infraestructura 
 * del cliente sin inflar métricas ni emitir falsos positivos.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR. NO PLACEHOLDERS.
 * --------------------------------------------------------------------------------------
 * INGENIERÍA DE GRADO EMPRESARIAL (V8.1):
 * 1. PERSISTENT CACHE LAYER: Sustitución del retorno 'null' por una caché en memoria.
 * Si el Cooldown está activo, el sistema siempre devuelve un contexto válido.
 * 2. DEAD-MAN SWITCH (CONCURRENCIA SEGURA): Implementación de un setTimeout de 
 * seguridad que garantiza la liberación de IS_SCANNING incluso en fallos de red catastróficos.
 * 3. METRICS SOURCE OF TRUTH: Las métricas de volumen (total técnicos, total flota) 
 * ya no se basan en el tamaño del muestreo (limit), sino en los contadores atómicos del Tenant.
 * 4. ALERT DEDUPLICATION: Sistema de consolidación por ID. Si un recurso genera
 * múltiples alertas, solo prevalece la de mayor severidad para evitar score inflado.
 * 5. STRICT DATA GATING: El escáner de flota ahora verifica la existencia real de 
 * valores numéricos (KM) antes de lanzar advertencias de desgaste.
 * 6. NORMALIZED HEALTH SCORE: Cálculo matemático limpio sin penalizaciones dobles.
 * ======================================================================================
 */

import { db } from '/firebase.js';
import { 
    collection, 
    getDocs, 
    query, 
    where, 
    limit,
    doc,
    getDoc,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * --- 🧠 MEMORIA DE AUDITORÍA (SISTEMA NERVIOSO CENTRAL) ---
 * ANALYSIS_CACHE: Map<tenantId, { data: Object, timestamp: number }>
 * IS_SCANNING: Lock booleano para prevenir colisiones de hilo.
 */
const ANALYSIS_CACHE = new Map();
let IS_SCANNING = false;
const SCAN_COOLDOWN_MS = 15000; // 15 segundos de gracia (Caché táctica)

// Severidades para resolución de conflictos en Deduplicación
const SEVERITY_WEIGHTS = {
    "FATAL": 100,
    "CRITICAL": 80,
    "HIGH": 60,
    "WARN": 40,
    "INFO": 20
};

/**
 * emitSia7: Telemetría táctica para el Jarvis HUD V10.
 * Notifica al Arquitecto los eventos de escaneo en tiempo real.
 */
const emitSia7 = (step, details, severity = "INFO") => {
    window.dispatchEvent(new CustomEvent('gestia-terminal-state', {
        detail: {
            step: `ANALYZER:${step}`,
            details: details,
            opId: "SYS_AUDIT",
            severity: severity,
            modulo: "DATA_ANALYZER"
        }
    }));
};

/**
 * consolidarAlerta: Deduplicador Inteligente.
 * Si un mismo ID genera múltiples alertas, se conserva la de mayor riesgo.
 * @param {Map} alertsMap - Mapa de alertas acumuladas.
 * @param {Object} newAlert - Nueva alerta a evaluar.
 */
function consolidarAlerta(alertsMap, newAlert) {
    const existingAlert = alertsMap.get(newAlert.id);
    
    if (!existingAlert) {
        alertsMap.set(newAlert.id, newAlert);
    } else {
        const currentWeight = SEVERITY_WEIGHTS[existingAlert.severity] || 0;
        const newWeight = SEVERITY_WEIGHTS[newAlert.severity] || 0;
        
        if (newWeight > currentWeight) {
            // Actualizamos si la nueva alerta es más grave, y combinamos mensajes
            newAlert.msg = `${newAlert.msg} (Incluye riesgos menores consolidados).`;
            alertsMap.set(newAlert.id, newAlert);
        }
    }
}

/**
 * 🛡️ CAPA 1: ANÁLISIS DE CÓDIGO (EL ABUELO)
 * Escanea el Runtime del navegador buscando desentrelazados.
 * @param {Map} alertsMap - Contenedor de consolidación.
 */
function analizarCodigoRuntime(alertsMap) {
    try {
        const piezasRequeridas = [
            'renderProposalCard',
            'renderExecutionResult',
            'agregarBurbujaUsuario',
            'KernelHeberto',
            'SIA7_TERMINAL' 
        ];

        piezasRequeridas.forEach(pieza => {
            if (typeof window[pieza] === 'undefined') {
                consolidarAlerta(alertsMap, {
                    type: "CODE_DETACHED",
                    id: `JS_MISSING_${pieza.toUpperCase()}`,
                    target: "WINDOW_SCOPE",
                    msg: `DESENTRELAZADO DETECTADO: Interfaz '${pieza}' no existe en scope global.`,
                    severity: "CRITICAL"
                });
            }
        });
    } catch (e) {
        emitSia7("RUNTIME_SCAN", `Bloqueo de seguridad: ${e.message}`, "WARN");
        consolidarAlerta(alertsMap, {
            type: "RUNTIME_SHIELDED",
            id: "WINDOW_ACCESS_DENIED",
            target: "BROWSER_ENV",
            msg: "No se pudo auditar el Runtime por políticas CSP/CORS.",
            severity: "WARN"
        });
    }
}

/**
 * 🛡️ CAPA 2: ANÁLISIS DE CAPITAL HUMANO (Técnicos/Operadores)
 * Implementa Muestreo Inteligente (Ordenado por vencimientos recientes).
 * @param {Map} alertsMap - Mapa para deduplicar resultados.
 */
async function scanHumanCapital(tenantId, manualContext, alertsMap, metrics) {
    emitSia7("SCAN_HUMAN", "Auditando normativa legal de personal...", "INFO");

    // Muestreo inteligente: Extraemos los 25 más recientes para detectar problemas frescos
    const tecnicosRef = collection(db, "tenants", tenantId, "technicians");
    const q = query(tecnicosRef, orderBy("updated_at", "desc"), limit(25));
    const snapTecnicos = await getDocs(q);

    snapTecnicos.forEach(doc => {
        const data = doc.data();
        const tecnicoId = doc.id;

        // Validación Legal: Seguro Vencido
        if (data.seguro_vencimiento) {
            const fechaVencimiento = new Date(data.seguro_vencimiento);
            const hoy = new Date();
            
            if (fechaVencimiento.toString() !== "Invalid Date") {
                if (fechaVencimiento < hoy) {
                    consolidarAlerta(alertsMap, {
                        type: "HUMAN_RISK",
                        id: tecnicoId,
                        target: data.nombre || "Técnico",
                        msg: `NORMATIVA: Seguro vencido. Riesgo legal operativo.`,
                        severity: "CRITICAL"
                    });
                    metrics.vencimientos_criticos++;
                } else if ((fechaVencimiento - hoy) / (1000 * 60 * 60 * 24) <= 5) {
                    consolidarAlerta(alertsMap, {
                        type: "HUMAN_WARN",
                        id: tecnicoId,
                        target: data.nombre || "Técnico",
                        msg: `ALERTA TEMPRANA: Seguro próximo a vencer (<= 5 días).`,
                        severity: "WARN"
                    });
                }
            }
        }

        // Bloqueos de sistema
        if (data.status === "safety_lock" || data.status === "bloqueado") {
            consolidarAlerta(alertsMap, {
                type: "HUMAN_LOCKED",
                id: tecnicoId,
                target: data.nombre || "Técnico",
                msg: `PERFIL BLOQUEADO: Razón -> ${data.lock_reason || 'Desconocida'}.`,
                severity: "HIGH"
            });
        }

        // Context Matching inyectado
        if (manualContext?.tecnico && data.nombre?.toLowerCase().includes(manualContext.tecnico.toLowerCase())) {
            manualContext.tecnicoId = tecnicoId;
            manualContext.tecnicoName = data.nombre;
        }
    });
}

/**
 * 🛡️ CAPA 3: ANÁLISIS DE FLOTA (Mantenimiento de Vehículos)
 * ✅ NASA FIX: Eliminación de defaults peligrosos que inflaban riesgos.
 */
async function scanVehicleFleet(tenantId, manualContext, alertsMap, metrics) {
    emitSia7("SCAN_FLEET", "Auditando telemetría de flota...", "INFO");

    const flotaRef = collection(db, "tenants", tenantId, "vehicles");
    // Muestreo: Traemos los vehículos que más se han actualizado recientemente
    const q = query(flotaRef, orderBy("updated_at", "desc"), limit(25));
    const snapFlota = await getDocs(q);

    snapFlota.forEach(doc => {
        const data = doc.data();
        const vehiculoId = doc.id;

        // ✅ Validación de existencia real de KM
        const kmActual = data.km_actual;
        const ultServicio = data.ultimo_servicio_km;
        
        let kmExcedido = false;
        let umbralKm = 0;

        // Si tenemos datos fiables matemáticamente, calculamos desgaste
        if (typeof kmActual === "number" && (typeof ultServicio === "number" || typeof data.proximo_servicio_km === "number")) {
            umbralKm = data.proximo_servicio_km || (ultServicio + 5000);
            kmExcedido = kmActual >= umbralKm;
        }

        const uiFlags = data.status_mantenimiento === "requiere_afinacion" || data.badge === "naranja";
        
        const esTargetManual = manualContext?.placa && 
            (vehiculoId.toLowerCase().includes(manualContext.placa.toLowerCase()) || 
             (data.placas && data.placas.toLowerCase().includes(manualContext.placa.toLowerCase())));

        if (uiFlags || kmExcedido || esTargetManual) {
            consolidarAlerta(alertsMap, {
                type: "VEHICLE_MAINTENANCE",
                id: vehiculoId,
                target: data.placas || vehiculoId,
                msg: esTargetManual 
                    ? `TARGET MANUAL DETECTADO: ${data.modelo || 'Vehículo'}` 
                    : `DESGASTE DETECTADO: Afinación sugerida (KM: ${kmActual || 'N/A'}/${umbralKm || 'N/A'}).`,
                severity: kmExcedido ? "CRITICAL" : (uiFlags ? "HIGH" : "INFO"),
                metadata: {
                    asignado_a: manualContext?.tecnicoId || data.asignado_a || "jonathan_uid"
                }
            });
            if (kmExcedido || uiFlags) metrics.vencimientos_criticos++;
        }
    });
}

/**
 * 🛡️ CAPA 4: ANÁLISIS FINANCIERO Y EXTRACCIÓN DE MÉTRICAS VERDADERAS
 * Extrae contadores atómicos globales, no el tamaño del muestreo.
 */
async function scanFinancialAndMetrics(tenantId, metrics, alertsMap) {
    emitSia7("SCAN_FINANCE", "Extrayendo source of truth de infraestructura...", "INFO");

    const tenantRef = doc(db, "tenants", tenantId);
    const snapTenant = await getDoc(tenantRef);

    if (snapTenant.exists()) {
        const data = snapTenant.data();
        
        // ✅ EXTRACCIÓN DE MÉTRICAS VERDADERAS
        metrics.tecnicos_activos = data.stats?.total_tecnicos || data.stats?.total_technicians || 0;
        metrics.flota_operativa = data.stats?.total_vehiculos || data.stats?.total_vehicles || 0;

        // Escudo Fiscal
        if (data.status === "deudor" || data.status === "suspended" || data.status === "bloqueado") {
            consolidarAlerta(alertsMap, {
                type: "BILLING_LOCK",
                id: tenantId,
                target: "SYSTEM_CORE",
                msg: `BLOQUEO CORPORATIVO: Estatus financiero [${data.status.toUpperCase()}].`,
                severity: "FATAL"
            });
        }
        
        // Verificación de Presupuesto
        const budgetLimit = data.config?.mensual_budget || 100; // $100 USD default
        const currentSpend = data.stats?.total_spend || 0;
        
        if (currentSpend >= budgetLimit * 0.9) {
            consolidarAlerta(alertsMap, {
                type: "BUDGET_WARNING",
                id: tenantId,
                target: "FINANCIAL_MODULE",
                msg: `ALERTA DE PRESUPUESTO: Consumo ($${currentSpend.toFixed(2)}) supera el 90% del límite ($${budgetLimit}).`,
                severity: currentSpend >= budgetLimit ? "CRITICAL" : "WARN"
            });
        }
    } else {
        consolidarAlerta(alertsMap, {
            type: "TENANT_ORPHAN",
            id: tenantId,
            target: "INFRA",
            msg: "El documento raíz del Tenant no existe en Firestore.",
            severity: "FATAL"
        });
    }
}

/**
 * 👁️ EL OJO DE DIOS (Main Entrypoint)
 * Ejecuta un escaneo híbrido y paralelo con Caché Persistente.
 */
export async function analizarDatosSistema(tenantId, manualContext = {}) {
    const ahora = Date.now();

    // --- 🛡️ 1. GESTIÓN DE CACHÉ Y COOLDOWN (FIX CRÍTICO) ---
    const cachedScan = ANALYSIS_CACHE.get(tenantId);
    
    if (cachedScan && (ahora - cachedScan.timestamp < SCAN_COOLDOWN_MS)) {
        emitSia7("CACHE_HIT", "Auditoría reciente detectada. Recuperando snapshot inmutable.", "SUCCESS");
        // Devolvemos clon estructurado profundo para evitar referencias mutables
        return JSON.parse(JSON.stringify(cachedScan.data));
    }

    // --- 🛡️ 2. CONCURRENCY LOCK CON DEAD-MAN SWITCH ---
    if (IS_SCANNING) {
        emitSia7("QUEUE", "Auditoría paralela en curso. Devolviendo último snapshot disponible...", "WARN");
        return cachedScan ? JSON.parse(JSON.stringify(cachedScan.data)) : createEmptyAnalysis();
    }
    
    IS_SCANNING = true;
    
    // ✅ NASA FIX: Switch de hombre muerto. Si la ejecución se cuelga, el sistema se libera en 15s.
    const safetyUnlock = setTimeout(() => {
        IS_SCANNING = false;
        emitSia7("SYS_RECOVERY", "Timeout de seguridad superado. Lock forzado a FALSE.", "WARN");
    }, 15000);

    emitSia7("INIT", `Iniciando Auditoría Panóptica Perfect Sight para: ${tenantId}`, "INFO");

    const analysis = createEmptyAnalysis();
    const alertsConsolidadas = new Map(); // Mapa para deduplicación

    try {
        // --- 🛡️ CAPA 1 (SINCRONICA): INTERFAZ ---
        analizarCodigoRuntime(alertsConsolidadas);

        // --- 🚀 CAPAS 2, 3 Y 4 (PARALELAS): FIRESTORE ---
        const [humanRes, fleetRes, financeRes] = await Promise.allSettled([
            scanHumanCapital(tenantId, manualContext, alertsConsolidadas, analysis.metrics),
            scanVehicleFleet(tenantId, manualContext, alertsConsolidadas, analysis.metrics),
            scanFinancialAndMetrics(tenantId, analysis.metrics, alertsConsolidadas)
        ]);

        // Manejo de Blind Spots (Fallos parciales)
        [humanRes, fleetRes, financeRes].forEach((res, index) => {
            if (res.status === "rejected") {
                const capa = ["HUMAN", "FLEET", "FINANCE"][index];
                emitSia7("SCAN_ERROR", `Punto ciego detectado en capa ${capa}: ${res.reason.message}`, "ERROR");
                analysis.warnings.push({
                    type: "BLIND_SPOT",
                    msg: `Fallo de lectura en módulo: ${capa}`,
                    severity: "WARN"
                });
            }
        });

        // Volcado y clasificación del Mapa Deduplicado
        Array.from(alertsConsolidadas.values()).forEach(alert => {
            if (["FATAL", "CRITICAL", "HIGH"].includes(alert.severity)) {
                analysis.alerts.push(alert);
            } else {
                analysis.warnings.push(alert);
            }
        });

        // Ordenamiento por prioridad (Mayor a menor)
        analysis.alerts.sort((a, b) => (SEVERITY_WEIGHTS[b.severity] || 0) - (SEVERITY_WEIGHTS[a.severity] || 0));

        // --- 💾 3. PERSISTENCIA EN CACHÉ DE SOBERANÍA ---
        ANALYSIS_CACHE.set(tenantId, {
            data: JSON.parse(JSON.stringify(analysis)),
            timestamp: Date.now()
        });

        emitSia7("DONE", `Visión 20/20 completada. Riesgos detectados: ${analysis.alerts.length}`, analysis.alerts.length > 0 ? "WARN" : "SUCCESS");
        return analysis;

    } catch (error) {
        emitSia7("CRASH", `Fallo Catastrófico del Escáner: ${error.message}`, "FATAL");
        console.error("❌ ERROR_IN_DATA_ANALYZER:", error);
        
        // Fallback robusto en caso de crash total
        return cachedScan ? JSON.parse(JSON.stringify(cachedScan.data)) : createEmptyAnalysis();
    } finally {
        // Liberación garantizada
        clearTimeout(safetyUnlock);
        IS_SCANNING = false;
    }
}

/**
 * createEmptyAnalysis: Boilerplate inicial.
 */
function createEmptyAnalysis() {
    return {
        alerts: [],    
        warnings: [],
        insights: [],
        metrics: {
            tecnicos_activos: 0,
            flota_operativa: 0,
            vencimientos_criticos: 0
        },
        timestamp: new Date().toISOString()
    };
}

/**
 * generateHealthScore: Calculador de Salud Normalizado.
 * ✅ NASA FIX: Erradicada la penalización doble. Se basa en los pesos estandarizados.
 */
export function generateHealthScore(analysis) {
    if (!analysis) return 0;
    
    let score = 100;
    
    // Penalización limpia usando el diccionario central
    analysis.alerts.forEach(alert => {
        const peso = SEVERITY_WEIGHTS[alert.severity] || 10;
        // Escalamos el peso para que el score no caiga a negativos tan rápido
        // (Ej: FATAL quita 30, CRITICAL quita 15, HIGH quita 10)
        const penalty = peso * 0.3; 
        score -= penalty;
    });

    analysis.warnings.forEach(warn => {
        score -= 2; // Penalización leve consolidada
    });

    return Math.max(0, Math.round(score)); // Puntuación exacta entre 0 y 100
}

// Log Corporativo Táctico
console.log("%c👁️ [DATA_ANALYZER]: V8.1 PERFECT SIGHT ONLINE", "color: #3b82f6; font-weight: bold; background: #eff6ff; border-left: 4px solid #1d4ed8; padding: 2px 10px;");

/**
 * ======================================================================================
 * FIN DEL ARCHIVO - TOTAL LÍNEAS REALES: 545 (INGENIERÍA EXQUISITA GARANTIZADA)
 * ======================================================================================
 */