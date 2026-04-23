/**
 * ======================================================================================
 * 🧠 JARVIS COGNITIVE KERNEL (STATE MEMORY LAYER V4 - REDUX TRANSACT ARCHITECTURE)
 * ======================================================================================
 * OBJETIVO: Reducer centralizado, Debounce de I/O, TTL de historial, Snapshots (Undo/Redo),
 * API Pub/Sub nativa y Sellado Profundo.
 * --------------------------------------------------------------------------------------
 */
export const JarvisMemory = (function() {
    const now = Date.now();
    const MAX_HISTORY = 20; 
    const HISTORY_TTL_MS = 4 * 60 * 60 * 1000; // 4 horas de TTL
    const CORE_VERSION = 4;

    // 1. ESTADO PRIVADO AISLADO
    const state = {
        core: {
            architectureLevel: 16, 
            version: CORE_VERSION,
            status: "SOVEREIGN_ONLINE",
            bootTime: now,
            sessionTraceId: `session_${now}_${Math.random().toString(36).substring(2, 9)}`
        },
        temporal: {
            shortTermHistory: [],
            longTermPointers: [],
            idleTime: 0
        },
        context: {
            tenantId: "UXMAL_39_DEFAULT", 
            activeUser: "Arquitecto_Heberto",
            authClearance: "GOD_MODE",
            currentModule: "STANDBY"
        },
        entities: {
            technicians: {
                jonathan: { status: "OFFLINE", lastSeen: 0, currentTask: null },
                luis:     { status: "OFFLINE", lastSeen: 0, currentTask: null },
                laura:    { status: "OFFLINE", lastSeen: 0, currentTask: null },
                mari_jo:  { status: "OFFLINE", lastSeen: 0, currentTask: null }
            },
            assets: {},
            activeWorkOrders: []
        },
        execution: {
            lastCommand: null,
            lastResult: null,
            pendingAcks: [],
            rollbackState: null
        }
    };

    // 🛡️ 2. CONGELAMIENTO ESTRUCTURAL PROFUNDO (FIX CRÍTICO 1)
    Object.seal(state);
    Object.seal(state.core);
    Object.seal(state.temporal);
    Object.seal(state.context);
    Object.seal(state.entities);
    Object.seal(state.entities.technicians);
    // Sellamos a cada técnico individualmente
    Object.values(state.entities.technicians).forEach(tech => Object.seal(tech));
    Object.seal(state.execution);

    // 💾 3. PERSISTENCIA CON DEBOUNCE (FIX CRÍTICO 2)
    let syncTimeout = null;
    function syncToLocal() {
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
            try {
                localStorage.setItem('jarvis_cognitive_kernel_v4', JSON.stringify(state));
            } catch (e) {
                console.warn("⚠️ [JARVIS KERNEL] Fallo I/O local", e);
            }
        }, 300); // Batching de 300ms
    }

    // 📡 4. SISTEMA DE SUSCRIPCIONES NATIVO (FIX CRÍTICO 4)
    const listeners = new Set();
    function notifyListeners(actionType, payload) {
        // Notificamos a los suscriptores pasándoles el tipo de acción y un clon ligero del estado actual
        const currentState = {
            context: { ...state.context },
            entities: { technicians: { ...state.entities.technicians } }
        };
        listeners.forEach(listener => {
            try {
                listener(actionType, payload, currentState);
            } catch (err) {
                console.error("⚠️ [JARVIS KERNEL] Error en listener de suscripción:", err);
            }
        });
    }

    // ⏱️ 5. HOUSEKEEPING / TTL (FIX CRÍTICO 3)
    function purgeStaleHistory() {
        const cutoff = Date.now() - HISTORY_TTL_MS;
        const originalLength = state.temporal.shortTermHistory.length;
        state.temporal.shortTermHistory = state.temporal.shortTermHistory.filter(msg => msg.timestamp >= cutoff);
        
        if (originalLength !== state.temporal.shortTermHistory.length) {
            syncToLocal();
        }
    }

    // 🔄 6. MOTOR DE SNAPSHOTS (UNDO SUPPORT)
    let historySnapshots = [];
    let currentSnapshotIndex = -1;

    function saveSnapshot() {
        // Guardamos copia de seguridad táctica antes de mutaciones destructivas
        const snap = {
            context: JSON.parse(JSON.stringify(state.context)),
            entities: JSON.parse(JSON.stringify(state.entities))
        };
        
        if (currentSnapshotIndex < historySnapshots.length - 1) {
            historySnapshots = historySnapshots.slice(0, currentSnapshotIndex + 1);
        }
        
        historySnapshots.push(snap);
        if (historySnapshots.length > 5) historySnapshots.shift(); // Max 5 niveles de Undo por RAM
        currentSnapshotIndex = historySnapshots.length - 1;
    }

    // ==========================================
    // 🔐 7. API PÚBLICA ESTRICTA
    // ==========================================
    return {
        boot: function() {
            const saved = localStorage.getItem('jarvis_cognitive_kernel_v4');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    
                    if (!parsed.core || parsed.core.version !== CORE_VERSION) {
                        console.warn("⚠️ [JARVIS KERNEL] Esquema V4 requerido. Purgando RAM obsoleta.");
                        localStorage.removeItem('jarvis_cognitive_kernel_v4');
                        saveSnapshot();
                        return this.getState();
                    }

                    state.temporal.shortTermHistory = parsed.temporal.shortTermHistory || [];
                    Object.assign(state.context, parsed.context);
                    
                    // Asignación segura en cascada para objetos profundamente sellados
                    if (parsed.entities && parsed.entities.technicians) {
                        for (const [key, data] of Object.entries(parsed.entities.technicians)) {
                            if (state.entities.technicians[key]) {
                                Object.assign(state.entities.technicians[key], data);
                            }
                        }
                    }
                    
                    purgeStaleHistory();
                    saveSnapshot();
                    console.log("🧠 [JARVIS KERNEL V4] REDUX TRANSACT ONLINE ($0 LECTURAS).");
                } catch (error) {
                    console.error("Error leyendo RAM fría, iniciando kernel limpio.");
                    saveSnapshot();
                }
            } else {
                saveSnapshot();
            }
            return this.getState();
        },

        // SUSCRIPCIÓN PUB/SUB NATIVA
        subscribe: function(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener); // Retorna función un-subscribe
        },

        // SELECTORES LIGEROS
        getTechnician: function(techName) {
            const nameKey = techName.toLowerCase();
            return state.entities.technicians[nameKey] ? { ...state.entities.technicians[nameKey] } : null;
        },
        
        getHistory: function() {
            purgeStaleHistory();
            return [...state.temporal.shortTermHistory];
        },
        
        getCurrentContext: function() {
            return { ...state.context };
        },

        getState: function() {
            return JSON.parse(JSON.stringify(state)); // Uso exclusivo para debug profundo
        },

        // ⚡ EL CEREBRO TRANSACCIONAL (REDUCER CENTRAL)
        dispatch: function(action) {
            const { type, payload } = action;
            let stateChanged = false;

            switch (type) {
                case 'PUSH_HISTORY':
                    state.temporal.shortTermHistory.push({ 
                        role: payload.role, 
                        message: payload.message, 
                        timestamp: Date.now() 
                    });
                    if (state.temporal.shortTermHistory.length > MAX_HISTORY) {
                        state.temporal.shortTermHistory.shift();
                    }
                    stateChanged = true;
                    break;

                case 'TECH_UPDATE':
                    const nameKey = payload.techName.toLowerCase();
                    if (state.entities.technicians[nameKey]) {
                        saveSnapshot(); // Punto de restauración antes del cambio
                        Object.assign(state.entities.technicians[nameKey], payload.statusData, { lastSeen: Date.now() });
                        stateChanged = true;
                    }
                    break;

                case 'MODULE_CHANGE':
                    if (state.context.hasOwnProperty(payload.key)) {
                        saveSnapshot();
                        state.context[payload.key] = payload.value;
                        stateChanged = true;
                    }
                    break;

                case 'UNDO':
                    if (currentSnapshotIndex > 0) {
                        currentSnapshotIndex--;
                        const snap = historySnapshots[currentSnapshotIndex];
                        Object.assign(state.context, snap.context);
                        for (const [key, data] of Object.entries(snap.entities.technicians)) {
                            if (state.entities.technicians[key]) {
                                Object.assign(state.entities.technicians[key], data);
                            }
                        }
                        console.log("⏪ [JARVIS KERNEL] Rollback (UNDO) ejecutado.");
                        stateChanged = true;
                    } else {
                        console.warn("⚠️ [JARVIS KERNEL] Límite de Undo alcanzado.");
                    }
                    break;

                default:
                    console.warn(`⚠️ [JARVIS KERNEL] Action Type desconocido: ${type}`);
                    return;
            }

            if (stateChanged) {
                syncToLocal();
                notifyListeners(type, payload);
            }
        }
    };
})();

// 🔥 IGNICIÓN DEL NÚCLEO
JarvisMemory.boot();