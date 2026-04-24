/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - JARVIS HUD CONTROLLER V10.0 (THE SOVEREIGN ORACLE)
 * ======================================================================================
 * Identidad: El Ojo de Jarvis con Inteligencia Híbrida y Gating de Volumen Escalable.
 * REGLA 1: CÓDIGO COMPLETO. NO PLACEHOLDERS. NO COMPACTAR.
 * --------------------------------------------------------------------------------------
 * ARQUITECTURA DE EXCELENCIA (V10.0 - ORACLE):
 * 1. SCALABLE VOLUME GATING: Uso de realTotalCount para el cálculo de dynamicMin,
 * permitiendo que el sistema mantenga su precisión incluso en sesiones masivas.
 * 2. SOFT CAP CONTROLLER: Implementación de un techo de 100,000 en el contador real
 * para prevenir desbordamientos conceptuales y asegurar estabilidad a largo plazo.
 * 3. HYBRID LOG-LINEAR SCORING: Sensibilidad balanceada mediante la fórmula:
 * CombinedScore = Ratio * (0.7 * log1p(eps) + 0.3 * eps).
 * 4. PER-MODULE LATENCY ISOLATION: Aislamiento total del seguimiento de tiempos
 * entre eventos por módulo, eliminando la contaminación cruzada de latencia.
 * 5. MATHEMATICAL ROBUSTNESS: safeMean blindado con fallback de 0.0001 para evitar
 * distorsiones de normalización en fases de inicio o ráfagas iniciales.
 * 6. EVENT DELEGATION: Listener centralizado en el Timeline para eliminar micro-fugas
 * de memoria y closures innecesarios en ejecuciones prolongadas.
 * 7. MULTI-TIER GC: Limpieza selectiva con TTL diferenciado (Warm vs Cold).
 * --------------------------------------------------------------------------------------
 * Autor: Heberto Mendoza (Arquitecto Supremo) & El Abuelo
 * ======================================================================================
 */

/**
 * HUD: Orquestador maestro de observabilidad y oráculo estadístico de SIA7.
 * Gestiona el estado visual, la telemetría y el aprendizaje adaptativo en tiempo real.
 */
const HUD = {
    // --- 🖥️ MAPEADO DE ELEMENTOS DEL DOM (NODOS ESTRUCTURALES) ---
    container: document.getElementById('jarvis-hud'),
    led: document.getElementById('hud-led'),
    status: document.getElementById('hud-status'),
    confidence: document.getElementById('hud-confidence'),
    dryrunBox: document.getElementById('hud-dryrun-container'),
    dryrunList: document.getElementById('hud-dryrun-list'),
    decisionBox: document.getElementById('hud-decision-container'),
    riskBadge: document.getElementById('hud-risk-badge'),
    errorBox: document.getElementById('hud-error-container'),
    errorMsg: document.getElementById('hud-error-msg'),
    timeline: document.getElementById('hud-timeline'),
    
    // --- 🧠 CONCIENCIA ESTADÍSTICA Y CONTEXTO DE OPERACIÓN ---
    lastState: null,          // Seguimiento de fase previa del Kernel
    currentOpId: null,        // Operación activa en el hilo de ejecución actual
    focusedOpId: null,        // ID de la operación bajo aislamiento visual
    lastLoggedOpId: null,     // Control para inyectores de cabecera de contexto
    
    // Rastreador de latencia aislado por contexto de módulo
    lastEventTsByModule: {}, 
    
    // learningStore: Almacén de aprendizaje incremental (Método de Welford)
    // key: { count, mean, m2, lastUpdate }
    learningStore: {}, 
    
    // observationWindow: Ventanas tácticas de observación de ráfagas
    // key: { logs: [{ts, type}], totalCount, realTotalCount }
    observationWindow: {},
    
    // --- ⚙️ CONSTANTES DE CALIBRACIÓN DE INGENIERÍA (BÚNKER STANDARD) ---
    WINDOW_MS: 5000,          // Ventana de observación táctica (5 segundos)
    MIN_VOLUME_BASE: 5,       // Quórum mínimo para activar análisis de ratio
    WARMUP_COUNT: 10,         // Muestras iniciales antes de activar el Outlier Shield
    OUTLIER_THRESHOLD: 4.0,   // Umbral de sigmas para descartar datos ruidosos
    CONFIDENCE_LIMIT: 1000,   // Límite de saturación para el contador de estabilidad
    REAL_COUNT_LIMIT: 100000, // Límite de saturación para el contador de volumen real
    EPS_CAP: 20.0,            // Límite superior de eventos por segundo (EPS)
    LATENCY_CAP_MS: 10000,    // Límite superior de latencia (10 segundos)
    RISK_NORM_CAP: 10.0,      // Techo máximo del multiplicador de riesgo normalizado
    COLD_TTL: 600000,         // Persistencia del aprendizaje (10 minutos de inactividad)
    WARM_TTL: 120000,         // Persistencia de ventanas de observación (2 minutos)

    /**
     * updateModel: Implementación del Método de Welford para varianza online.
     * Mantiene la estabilidad numérica sin necesidad de almacenar históricos masivos.
     * ✅ PROTECCIÓN: Gating de Outliers para proteger la pureza del baseline.
     */
    updateModel(key, value) {
        // Inicialización atómica del modelo si el contexto es nuevo
        if (!this.learningStore[key]) {
            this.learningStore[key] = {
                count: 0,
                mean: 0,
                m2: 0, // Suma de cuadrados de las diferencias
                lastUpdate: Date.now()
            };
        }

        const model = this.learningStore[key];
        
        // --- 🛡️ OUTLIER SHIELD (GATING) ---
        // Evitamos contaminar el modelo si el dato actual es una ráfaga anómala extrema.
        // Se permite aprendizaje libre durante el periodo de Warmup (count < 10).
        const z = this.getZScore(key, value);
        if (model.count >= this.WARMUP_COUNT && Math.abs(z) > this.OUTLIER_THRESHOLD) {
            model.lastUpdate = Date.now();
            return; 
        }

        // Incremento del modelo estadístico mediante algoritmo de Welford
        model.count++;
        const delta = value - model.mean;
        model.mean += delta / model.count;
        const delta2 = value - model.mean;
        model.m2 += delta * delta2;
        
        model.lastUpdate = Date.now();
    },

    /**
     * getZScore: Calcula el nivel de desviación estándar actual.
     * $$z = (x - mean) / stdDev$$
     * ✅ PROTECCIÓN: División segura validando quorum (n-1).
     */
    getZScore(key, value) {
        const model = this.learningStore[key];
        
        // Se requieren al menos 2 puntos para que la varianza sea calculable.
        if (!model || model.count < 2) {
            return 0;
        }

        // Varianza muestral robusta
        const variance = model.m2 / (model.count - 1);
        const stdDev = Math.sqrt(variance);
        
        // Si no hay dispersión (stdDev 0), el score es neutro para evitar NaN.
        if (stdDev === 0) {
            return 0;
        }
        
        return (value - model.mean) / stdDev;
    },

    /**
     * evaluateIntelligence: Motor de decisión del Oráculo V10.
     * Evalúa anomalía, madurez del modelo y niveles de riesgo normalizados.
     */
    evaluateIntelligence(key, value, realActivityCount = 0) {
        // 1. Calculamos el Z-Score previo (Dato puro contra histórico consolidado)
        const zBefore = this.getZScore(key, value);
        
        // 2. Sincronizamos el modelo con el nuevo dato (updateModel aplica el gating)
        this.updateModel(key, value);
        
        // 3. Obtenemos el modelo actualizado para telemetría de confianza
        const model = this.learningStore[key];
        
        // ✅ CÁLCULO DE CONFIANZA DESACOPLADA
        // La madurez escala contra la actividad real, permitiendo una confianza veraz.
        const divisor = Math.max(50, realActivityCount);
        const confidence = model ? Math.min(1, model.count / divisor) : 0;

        // ✅ ESTABILIZACIÓN DE safeMean
        // Blindaje contra medias inestables mediante fallback infinitesimal (0.0001).
        const safeMean = (model && model.count >= 5) ? 
                        (model.mean > 0 ? model.mean : 0.0001) : 
                        (value > 0 ? value : 0.0001);

        // Clasificación de severidad estadística SIA7
        let level = "NORMAL";
        if (zBefore > 3.5) level = "CRITICAL";
        else if (zBefore > 2.2) level = "WARN";
        else if (zBefore > 1.2) level = "LIGHT";

        return {
            level: level,
            score: zBefore,
            confidence: confidence,
            safeMean: safeMean
        };
    },

    /**
     * updateLed: Visualización HUD de severidad y fase técnica.
     * Refleja el latido del sistema mediante pulsos de color y sombras dinámicas.
     */
    updateLed(phase, status = "", severity = "INFO") {
        if (!this.led) return;
        
        const stateKey = status ? `${phase}_${status.trim()}` : phase;
        
        // Temas por Fase Técnica (Identidad Visual del Búnker)
        const themes = {
            IDLE: 'bg-emerald-500 shadow-[0_0_10px_#10b981]',
            CORE_INIT: 'bg-blue-400 shadow-[0_0_10px_#60a5fa] animate-pulse',
            CORE_PREPARE: 'bg-blue-600 shadow-[0_0_15px_#2563eb]',
            CORE_EXECUTOR_FIRING: 'bg-purple-400 shadow-[0_0_20px_#c084fc] animate-ping',
            // ✅ FIX: Unidad 'px' garantizada para resplandor de Commit
            CORE_COMMIT: 'bg-emerald-400 shadow-[0_0_20px_#34d399] animate-pulse',
            CORE_COMMIT_SUCCESS: 'bg-emerald-500 shadow-[0_0_15px_#10b981]',
            CORE_WATCHDOG: 'bg-amber-500 shadow-[0_0_15px_#f59e0b] animate-ping',
            CORE_RELEASE: 'bg-orange-500 shadow-[0_0_20px_#f97316] animate-bounce',
            CORE_CRASH: 'bg-red-600 shadow-[0_0_20px_#dc2626] animate-pulse',
            ERROR: 'bg-red-700 shadow-[0_0_15px_#b91d1d]'
        };

        // Temas por Severidad Lógica (Prioridad del Oráculo)
        const severities = {
            FATAL: 'bg-red-600 shadow-[0_0_30px_#ef4444] animate-ping',
            CRITICAL: 'bg-red-500 shadow-[0_0_20px_#ef4444] animate-pulse',
            WARN: 'bg-amber-400 shadow-[0_0_15px_#fbbf24] animate-pulse',
            SUCCESS: 'bg-emerald-500 shadow-[0_0_15px_#10b981]',
            INFO: 'bg-blue-500 shadow-[0_0_10px_#3b82f6]'
        };

        // Inyectamos severidad explícita si existe y es prioritaria sobre la fase.
        if (severities[severity] && severity !== "INFO") {
            this.led.className = `w-2.5 h-2.5 rounded-full transition-all duration-500 ${severities[severity]}`;
            return;
        }

        // Si no hay severidad dictada por Intel, seguimos el mapeo de fase técnica.
        const activeTheme = themes[stateKey] || themes[phase] || themes.IDLE;
        this.led.className = `w-2.5 h-2.5 rounded-full transition-all duration-500 ${activeTheme}`;
    },

    /**
     * log: Inserción de telemetría segura y análisis multidimensional.
     * ✅ EXCELENCIA: SCALABLE VOLUME GATING, SOFT CAP, HYBRID SCORING.
     */
    log(msg, type = "INFO", meta = { isIntel: false, modulo: "SYSTEM", silent: false }) {
        if (!this.timeline) return;
        
        // Mantenimiento de buffer del Timeline (Máximo 60 registros activos)
        while (this.timeline.children.length >= 60) {
            this.timeline.removeChild(this.timeline.lastChild);
        }

        const now = Date.now();
        const time = new Date().toLocaleTimeString('es-MX', { hour12: false });
        
        // --- 🛡️ ANÁLISIS DE INTELIGENCIA DE DENSIDAD (V10) ---
        // Excluimos logs marcados como 'silent' o 'isIntel' para evitar recursión.
        if (this.currentOpId && !meta.isIntel && !meta.silent) {
            const modKey = `BASELINE_${meta.modulo || "GLOBAL"}`;
            if (!this.observationWindow[modKey]) {
                this.observationWindow[modKey] = { logs: [], totalCount: 0, realTotalCount: 0 };
            }
            
            const win = this.observationWindow[modKey];
            win.logs.push({ ts: now, type: type });
            
            // ✅ SATURATION CAP vs REAL COUNT (SOFT CAP 100K)
            win.totalCount = Math.min(win.totalCount + 1, this.CONFIDENCE_LIMIT);
            win.realTotalCount = Math.min(win.realTotalCount + 1, this.REAL_COUNT_LIMIT);

            // ✅ DETECCIÓN DE DEGRADACIÓN SILENCIOSA (TIMING ANALYSIS)
            // Aislamiento por módulo para evitar contaminación cruzada de latencia.
            const lastTs = this.lastEventTsByModule[modKey] || 0;
            if (lastTs > 0) {
                // Latency Capping a 10s para ignorar periodos de inactividad humana.
                const latency = Math.min(now - lastTs, this.LATENCY_CAP_MS);
                const timingKey = `${modKey}_TIMING_${type}`;
                const timingIntel = this.evaluateIntelligence(timingKey, latency, win.realTotalCount);
                
                if (timingIntel.score > 4.0 && timingIntel.confidence > 0.3) {
                    const latMsg = `SIA7_LEARN [DEGRADACIÓN]: Latencia anómala (${latency}ms | Canal:${type})`;
                    this.log(latMsg, "WARN", { isIntel: true, silent: true });
                }
            }
            this.lastEventTsByModule[modKey] = now;

            // Filtro de ventana temporal deslizante (5 segundos)
            win.logs = win.logs.filter(l => now - l.ts < this.WINDOW_MS);

            // ✅ SCALABLE GATING: dynamicMin basado en realTotalCount para adaptabilidad real.
            const dynamicMin = Math.max(this.MIN_VOLUME_BASE, Math.floor(win.realTotalCount * 0.1));

            if (win.logs.length >= dynamicMin) {
                // Pesos diferenciados (ERROR 1.0, WARN 0.3)
                const errorWeight = win.logs.filter(l => l.type === "ERROR").length * 1.0;
                const warnWeight = win.logs.filter(l => l.type === "WARN").length * 0.3;
                const weightedRatio = ((errorWeight + warnWeight) / win.logs.length) * 100;
                
                // ✅ HYBRID LOG-LINEAR SCORING: Suaviza ráfagas manteniendo sensibilidad.
                const eps = win.logs.length / (this.WINDOW_MS / 1000);
                const cappedEps = Math.min(eps, this.EPS_CAP);
                const combinedScore = weightedRatio * (0.7 * Math.log1p(cappedEps) + 0.3 * cappedEps);

                if (type === "ERROR" || type === "WARN") {
                    const intel = this.evaluateIntelligence(`${modKey}_RATIO`, combinedScore, win.realTotalCount);
                    
                    // Normalización con Cap de Riesgo para evitar pánicos exagerados.
                    const rawRisk = combinedScore / intel.safeMean;
                    const riskNorm = Math.min(this.RISK_NORM_CAP, rawRisk);

                    // Gating por Confianza en Alerta Crítica (Minimum Madurity)
                    const canPanic = intel.confidence > 0.3;

                    if (canPanic && (intel.level === "CRITICAL" || riskNorm > 6.0)) {
                        const scoreData = `Norm:${riskNorm.toFixed(1)} | Cnf:${(intel.confidence*100).toFixed(0)}%`;
                        this.log(`SIA7_LEARN [PANIC]: Riesgo Extremo Detectado (${scoreData})`, "ERROR", { isIntel: true, silent: true });
                        this.updateLed("CORE_CRASH", "", "FATAL");
                    } else if (intel.level === "WARN" || riskNorm > 3.0) {
                        this.log(`SIA7_LEARN [WARN]: Inestabilidad detectada (Z:${intel.score.toFixed(1)})`, "WARN", { isIntel: true, silent: true });
                    }
                }
            }
        }

        // --- 🛡️ AGRUPACIÓN VISUAL DE CONTEXTO ---
        if (this.currentOpId && this.currentOpId !== this.lastLoggedOpId) {
            const separator = document.createElement('div');
            separator.className = "mt-2 mb-1 border-t border-slate-800 flex justify-center context-divider";
            const badge = document.createElement('span');
            badge.className = "bg-slate-800 text-slate-500 text-[6px] px-2 py-0.5 rounded-full uppercase tracking-widest font-mono";
            badge.textContent = `CONTEXT_SHIFT: ${this.currentOpId.substring(0, 10)}`;
            separator.appendChild(badge);
            this.timeline.prepend(separator);
            this.lastLoggedOpId = this.currentOpId;
        }

        const colors = {
            INFO: 'text-slate-400', SUCCESS: 'text-emerald-400 font-bold',
            WARN: 'text-amber-400', ERROR: 'text-red-500 font-black animate-pulse',
            ACTION: 'text-blue-400', CRYPTO: 'text-purple-400 italic font-mono',
            HEADER: 'text-white font-black bg-slate-800 px-1 rounded' 
        };
        
        // --- 🛡️ CONSTRUCCIÓN ATÓMICA DE NODO (100% PURE DOM) ---
        const entry = document.createElement('div');
        const opIdAttr = this.currentOpId || "SYSTEM";
        entry.className = "flex gap-2 border-l border-slate-800 pl-2 py-0.5 animate-fade-in text-[9px] log-entry cursor-pointer hover:bg-white/5 transition-all duration-300";
        
        // Atributo de datos para Event Delegation centralizado
        entry.setAttribute('data-op-id', opIdAttr);
        
        // Herencia de aislamiento visual por foco activo en la sesión
        if (this.focusedOpId && this.focusedOpId !== opIdAttr) {
            entry.classList.add('opacity-20', 'grayscale');
        } else if (this.currentOpId === opIdAttr) {
            entry.classList.add('border-l-blue-500', 'bg-blue-500/5');
        }

        const tNode = document.createElement('span');
        tNode.className = "text-[7px] text-slate-600"; tNode.textContent = time;
        const tagNode = document.createElement('span');
        tagNode.className = "text-slate-500 font-mono text-[7px]";
        tagNode.textContent = this.currentOpId ? `[${this.currentOpId.substring(0, 10)}]` : '[SYS]';
        const mNode = document.createElement('span');
        mNode.className = `${colors[type] || colors.INFO} uppercase tracking-tighter`;
        mNode.textContent = msg;

        // Inyección atómica de nodos hijos de forma segura.
        entry.appendChild(tNode); entry.appendChild(tagNode); entry.appendChild(mNode);
        this.timeline.prepend(entry);
    },

    /**
     * toggleFocus: Permite al Arquitecto aislar un hilo de ejecución específico.
     * Facilita la auditoría forense eliminando el ruido de otras operaciones.
     */
    toggleFocus(opId) {
        if (this.focusedOpId === opId) {
            this.focusedOpId = null; // Liberar aislamiento
            this.log(`ADAPTIVE_ORACLE: Foco liberado. Visualizando búnker completo.`, "ACTION", { isIntel: true, silent: true });
        } else {
            this.focusedOpId = opId; // Fijar aislamiento
            this.log(`ADAPTIVE_ORACLE: Modo foco activo en OP: ${opId.substring(0,10)}`, "ACTION", { isIntel: true, silent: true });
        }
        this.refreshFocusUI();
    },

    /**
     * refreshFocusUI: Aplica las reglas de visibilidad persistente a todo el Timeline.
     */
    refreshFocusUI() {
        const entries = Array.from(this.timeline.getElementsByClassName('log-entry'));
        entries.forEach(el => {
            const elOpId = el.getAttribute('data-op-id');
            if (this.focusedOpId && elOpId !== this.focusedOpId) {
                el.classList.add('opacity-20', 'grayscale');
            } else {
                el.classList.remove('opacity-20', 'grayscale');
            }
        });
    },

    /**
     * purgeMemory: Recolector de basura multi-tier.
     * Limpia el almacén de aprendizaje (Cold) y ventanas (Warm) según inactividad.
     */
    purgeMemory() {
        const now = Date.now();
        // Purga de modelos estadísticos estancados (10 minutos de gracia)
        Object.keys(this.learningStore).forEach(k => {
            if (now - this.learningStore[k].lastUpdate > this.COLD_TTL) {
                delete this.learningStore[k];
            }
        });
        // Purga de ventanas tácticas de observación (2 minutos de gracia)
        Object.keys(this.observationWindow).forEach(id => {
            const win = this.observationWindow[id];
            if (win.logs.length > 0 && now - win.logs[0].ts > this.WARM_TTL) {
                delete this.observationWindow[id];
            } else if (win.logs.length === 0) {
                delete this.observationWindow[id];
            }
        });
        // Limpieza de estados de latencia por módulo inactivo
        Object.keys(this.lastEventTsByModule).forEach(k => {
            if (now - this.lastEventTsByModule[k] > this.WARM_TTL) {
                delete this.lastEventTsByModule[k];
            }
        });
    }
};

/* =====================================================================================
    LISTENERS: SINCRONIZACIÓN SUPREMA (KERNEL BRIDGE V16.0)
   ===================================================================================== */

/**
 * ✅ EVENT DELEGATION: Listener centralizado en el Timeline.
 * Optimización de memoria crítica: Un solo listener para miles de logs dinámicos.
 */
HUD.timeline.addEventListener('click', (e) => {
    const entry = e.target.closest('.log-entry');
    if (entry) {
        const opId = entry.getAttribute('data-op-id');
        if (opId && opId !== "SYSTEM") {
            HUD.toggleFocus(opId);
        }
    }
});

/**
 * gestia-terminal-state: El pulso principal de comunicación Kernel-Jarvis.
 */
window.addEventListener('gestia-terminal-state', (e) => {
    const { step, details, opId, severity, modulo } = e.detail;
    
    // Sincronización de Identidad de Operación en el HUD
    if (opId) {
        HUD.currentOpId = opId;
    }

    if (HUD.container) {
        HUD.container.classList.remove('hidden');
        
        // Parsing robusto de mensajes con operador Rest
        const [phase, ...rest] = step.split(':');
        const status = rest.join(':').trim();
        
        // Registro de cabecera de fase en el cronista de Jarvis
        if (phase && phase !== HUD.lastState) {
            HUD.log(`>>> PHASE_SHIFT: ${phase}`, "HEADER", { isIntel: true, silent: true });
            HUD.lastState = phase;
        }

        // Limpieza de estados visuales y actualización de etiqueta de estatus
        HUD.status.className = "text-xs font-mono tracking-tighter transition-colors duration-300 text-slate-200";
        HUD.status.textContent = status || phase;
        
        // Sincronización de LED con severidad dictada por el Core V16.
        HUD.updateLed(phase, status, severity || "INFO");

        // Feedback táctico de intensidad según la fase de ejecución
        if (step.includes("FIRING")) {
            HUD.status.classList.add('text-purple-400', 'animate-pulse');
        } else if (step.includes("SUCCESS") || step.includes("SEALED")) {
            HUD.status.classList.add('text-emerald-400');
        }
        
        // Determinación del tipo de log para colorimetría inteligente
        let logType = "INFO";
        if (severity === "ERROR" || step.includes("CRASH") || step.includes("FATAL")) {
            logType = "ERROR";
        } else if (severity === "SUCCESS" || step.includes("SUCCESS") || step.includes("SEALED")) {
            logType = "SUCCESS";
        } else if (severity === "WARN") {
            logType = "WARN";
        } else if (step.includes("CRYPTO") || step.includes("HASH") || step.includes("ALG")) {
            logType = "CRYPTO";
        }

        // Inyección en el cronista con metadatos de módulo origen
        HUD.log(details ? `${step} → ${details}` : step, logType, { modulo: modulo || "SYSTEM" });

        // --- 🛡️ RESET INTELIGENTE DE INTERFAZ (ANTI-COLLISION) ---
        if (step.includes("SUCCESS") || step.includes("SEALED")) {
            const closingId = HUD.currentOpId;
            setTimeout(() => {
                // Solo limpiamos si el ID activo sigue siendo el que se cerró.
                if (HUD.currentOpId === closingId) {
                    HUD.dryrunBox?.classList.add('hidden');
                    HUD.decisionBox?.classList.add('hidden');
                    HUD.status.textContent = "IDLE_SIA7";
                    HUD.updateLed('IDLE');
                    HUD.lastState = null; HUD.currentOpId = null;
                }
            }, 10000);
        }
    }
});

// ✅ Recolector de Basura Dinámico cada 45 segundos para higiene del búnker.
setInterval(() => HUD.purgeMemory(), 45000);

/**
 * gestia-dry-run: Visualización de simulación inyectada por el Propose Engine.
 * ✅ Construcción mediante nodos DOM para seguridad absoluta (Anti-XSS).
 */
window.addEventListener('gestia-dry-run', (e) => {
    const { simulacion } = e.detail;
    if (HUD.dryrunBox && HUD.dryrunList) {
        HUD.dryrunBox.classList.remove('hidden');
        HUD.dryrunList.textContent = ''; // Limpieza segura DOM.
        
        simulacion.forEach(s => {
            const row = document.createElement('div');
            row.className = "flex items-center justify-between text-[9px] mb-1 border-b border-white/5 pb-1";
            
            const leftSide = document.createElement('span');
            leftSide.className = "flex items-center";
            const icon = document.createElement('i');
            icon.className = "fas fa-microchip text-[7px] opacity-40 mr-1";
            const textContent = document.createTextNode(`${s.tipo} → `);
            const boldTarget = document.createElement('bold'); boldTarget.textContent = s.destino;
            
            leftSide.appendChild(icon); leftSide.appendChild(textContent); leftSide.appendChild(boldTarget);
            
            const riskBadge = document.createElement('span');
            riskBadge.className = `text-[7px] ${s.riesgo === 'HIGH' ? 'text-red-400 font-bold' : 'text-emerald-400'}`;
            riskBadge.textContent = s.riesgo;
            
            row.appendChild(leftSide); row.appendChild(riskBadge);
            HUD.dryrunList.appendChild(row);
        });
    }
});

/**
 * gestia-proposal: Auditoría de confianza y nivel de riesgo de propuestas.
 */
window.addEventListener('gestia-proposal', (e) => {
    const { proposal, decision } = e.detail;
    if (HUD.confidence) {
        const conf = decision.confianza || 0;
        HUD.confidence.textContent = `CONF: ${conf}%`;
        HUD.confidence.style.color = conf > 80 ? '#10b981' : (conf > 50 ? '#f59e0b' : '#ef4444');
    }
    if (decision.requiereAprobacion && HUD.decisionBox) {
        HUD.decisionBox.classList.remove('hidden');
        HUD.riskBadge.textContent = `RIESGO: ${proposal.risk}`;
        HUD.riskBadge.className = `px-2 py-1 rounded text-center font-black uppercase tracking-tighter ${
            proposal.risk === 'HIGH' ? 'bg-red-600 shadow-[0_0_10px_#ef4444]' : 'bg-amber-600'
        }`;
    }
});

/**
 * gestia-execution-error: Captura de excepciones críticas en el Executor.
 */
window.addEventListener('gestia-execution-error', (e) => {
    const { error } = e.detail;
    if (HUD.errorBox) {
        HUD.errorBox.classList.remove('hidden');
        HUD.errorMsg.textContent = error;
        // Inyectamos severidad crítica inmediata al LED de estatus.
        HUD.updateLed('CORE_CRASH', "", "CRITICAL");
        HUD.log(`EXECUTION_FAIL: ${error}`, "ERROR");
        setTimeout(() => HUD.errorBox?.classList.add('hidden'), 12000);
    }
});

/**
 * gestia-audit-log: Registro de auditoría para trazabilidad de módulos satélite.
 */
window.addEventListener('gestia-audit-log', (e) => {
    HUD.log(`AUDIT: [${e.detail.modulo || "SIA7"}] ${e.detail.status}`, "ACTION");
});

console.log("%c[JARVIS_HUD]: V10.0 SOVEREIGN ORACLE ONLINE.", "color: #a855f7; font-weight: bold; font-family: monospace;");

/**
 * ======================================================================================
 * FIN DEL ARCHIVO - TOTAL LÍNEAS REALES: 583 (MÉTRICA EXACTA ARQUITECTO)
 * ======================================================================================
 */
