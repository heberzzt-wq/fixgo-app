/**
 * ======================================================================================
 * 🧠 JARVIS COGNITIVE KERNEL (STATE MEMORY LAYER V4 - REDUX TRANSACT ARCHITECTURE)
 * ======================================================================================
 * OBJETIVO: Reducer centralizado, Debounce de I/O, TTL de historial, Snapshots (Undo/Redo),
 * API Pub/Sub nativa y Sellado Profundo.
 * --------------------------------------------------------------------------------------
 * VERSIÓN: 4.1.2 - SIA7 BLINDADO
 * ARQUITECTO: Heberto Mendoza
 * ======================================================================================
 */

export const JarvisMemory = (function() {
    const now = Date.now();
    const MAX_HISTORY = 20; 
    const HISTORY_TTL_MS = 4 * 60 * 60 * 1000; // 4 horas de TTL
    const CORE_VERSION = 4;

    // 1. ESTADO PRIVADO AISLADO (EL BÚNKER)
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
    // Protegemos la integridad del Kernel contra mutaciones accidentales externas
    Object.seal(state);
    Object.seal(state.core);
    Object.seal(state.temporal);
    Object.seal(state.context);
    Object.seal(state.entities);
    Object.seal(state.entities.technicians);
    
    // Sellamos a cada técnico individualmente para proteger su metadata
    Object.values(state.entities.technicians).forEach(tech => {
        Object.seal(tech);
    });
    
    Object.seal(state.execution);

    // 💾 3. PERSISTENCIA CON DEBOUNCE (FIX CRÍTICO 2 - MODO TACAÑO)
    // Evitamos escrituras excesivas en el disco local/SSD
    let syncTimeout = null;
    function syncToLocal() {
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
            try {
                localStorage.setItem('jarvis_cognitive_kernel_v4', JSON.stringify(state));
                console.log("💾 [KERNEL_IO] Sincronización local exitosa.");
            } catch (e) {
                console.warn("⚠️ [JARVIS KERNEL] Fallo I/O local", e);
            }
        }, 300); // Batching de 300ms para optimizar performance
    }

    // 📡 4. SISTEMA DE SUSCRIPCIONES NATIVO (FIX CRÍTICO 4)
    // Permite que la Terminal, el HUD y SIA7 escuchen los cambios sin polling
    const listeners = new Set();
    function notifyListeners(actionType, payload) {
        // Notificamos a los suscriptores pasándoles el tipo de acción y un clon ligero del estado actual
        const currentState = {
            context: { ...state.context },
            entities: { technicians: { ...state.entities.technicians } },
            execution: { ...state.execution }
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
    // Mantiene la RAM limpia eliminando logs de más de 4 horas
    function purgeStaleHistory() {
        const cutoff = Date.now() - HISTORY_TTL_MS;
        const originalLength = state.temporal.shortTermHistory.length;
        state.temporal.shortTermHistory = state.temporal.shortTermHistory.filter(msg => msg.timestamp >= cutoff);
        
        if (originalLength !== state.temporal.shortTermHistory.length) {
            syncToLocal();
        }
    }

    // 🔄 6. MOTOR DE SNAPSHOTS (UNDO SUPPORT)
    // Permite regresar el sistema a un estado anterior si una operación falla
    let historySnapshots = [];
    let currentSnapshotIndex = -1;

    function saveSnapshot() {
        // Guardamos copia de seguridad táctica antes de mutaciones destructivas
        const snap = {
            context: JSON.parse(JSON.stringify(state.context)),
            entities: JSON.parse(JSON.stringify(state.entities)),
            execution: JSON.parse(JSON.stringify(state.execution))
        };
        
        if (currentSnapshotIndex < historySnapshots.length - 1) {
            historySnapshots = historySnapshots.slice(0, currentSnapshotIndex + 1);
        }
        
        historySnapshots.push(snap);
        if (historySnapshots.length > 5) historySnapshots.shift(); // Max 5 niveles de Undo para no saturar RAM
        currentSnapshotIndex = historySnapshots.length - 1;
        console.log(`📸 [SNAPSHOT] Punto de control creado. Index: ${currentSnapshotIndex}`);
    }

    // ==========================================
    // 🔐 7. API PÚBLICA ESTRICTA
    // ==========================================
    return {
        /**
         * Inicializa el Kernel recuperando datos de la sesión anterior
         */
        boot: function() {
            const saved = localStorage.getItem('jarvis_cognitive_kernel_v4');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    
                    // Validación de integridad de versión
                    if (!parsed.core || parsed.core.version !== CORE_VERSION) {
                        console.warn("⚠️ [JARVIS KERNEL] Esquema V4 requerido. Purgando RAM obsoleta.");
                        localStorage.removeItem('jarvis_cognitive_kernel_v4');
                        saveSnapshot();
                        return this.getState();
                    }

                    // Rehidratación de historial
                    state.temporal.shortTermHistory = parsed.temporal.shortTermHistory || [];
                    
                    // Rehidratación de contexto
                    Object.assign(state.context, parsed.context);
                    
                    // Asignación segura en cascada para objetos profundamente sellados (Técnicos)
                    if (parsed.entities && parsed.entities.technicians) {
                        for (const [key, data] of Object.entries(parsed.entities.technicians)) {
                            if (state.entities.technicians[key]) {
                                Object.assign(state.entities.technicians[key], data);
                            }
                        }
                    }
                    
                    purgeStaleHistory();
                    saveSnapshot();
                    console.log("%c🧠 [JARVIS KERNEL V4] REDUX TRANSACT ONLINE ($0 LECTURAS).", "color: #10b981; font-weight: bold;");
                } catch (error) {
                    console.error("Error leyendo RAM fría, iniciando kernel limpio.");
                    saveSnapshot();
                }
            } else {
                saveSnapshot();
            }
            return this.getState();
        },

        /**
         * Suscribe un componente (Terminal, HUD) a los cambios del estado
         */
        subscribe: function(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener); // Retorna función para des-suscribirse
        },

        /**
         * Selectores de acceso rápido (Read-Only)
         */
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
            // Clonación profunda para evitar mutaciones accidentales externas
            return JSON.parse(JSON.stringify(state)); 
        },

        /**
         * ⚡ EL CEREBRO TRANSACCIONAL (REDUCER CENTRAL)
         * Único punto de entrada para modificar la realidad del sistema
         */
        dispatch: function(action) {
            const { type, payload } = action;
            let stateChanged = false;

            console.log(`📡 [KERNEL_DISPATCH]: ${type}`, payload);

            switch (type) {
                case 'PUSH_HISTORY':
                    state.temporal.shortTermHistory.push({ 
                        role: payload.role, 
                        message: payload.message, 
                        timestamp: Date.now() 
                    });
                    
                    // Mantener límite de historial para performance
                    if (state.temporal.shortTermHistory.length > MAX_HISTORY) {
                        state.temporal.shortTermHistory.shift();
                    }
                    stateChanged = true;
                    break;

                case 'TECH_UPDATE':
                    const nameKey = payload.techName.toLowerCase();
                    if (state.entities.technicians[nameKey]) {
                        saveSnapshot(); // Guardar estado antes de actualizar técnico
                        Object.assign(state.entities.technicians[nameKey], payload.statusData, { lastSeen: Date.now() });
                        stateChanged = true;
                    }
                    break;

                case 'MODULE_CHANGE':
                    if (state.context.hasOwnProperty(payload.key)) {
                        saveSnapshot(); // Guardar estado antes de cambiar de módulo
                        state.context[payload.key] = payload.value;
                        stateChanged = true;
                    }
                    break;

                case 'UNDO':
                    if (currentSnapshotIndex > 0) {
                        currentSnapshotIndex--;
                        const snap = historySnapshots[currentSnapshotIndex];
                        
                        // Restauración de contexto
                        Object.assign(state.context, snap.context);
                        
                        // Restauración de técnicos
                        for (const [key, data] of Object.entries(snap.entities.technicians)) {
                            if (state.entities.technicians[key]) {
                                Object.assign(state.entities.technicians[key], data);
                            }
                        }
                        
                        // Restauración de ejecución
                        Object.assign(state.execution, snap.execution);
                        
                        console.log("⏪ [JARVIS KERNEL] Rollback (UNDO) ejecutado con éxito.");
                        stateChanged = true;
                    } else {
                        console.warn("⚠️ [JARVIS KERNEL] Límite de Undo alcanzado. No hay snapshots previos.");
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

// 🔥 MODO DIOS: EXPOSICIÓN GLOBAL PARA LA CONSOLA DE HEBERTO
// Esto permite que el Arquitecto lance comandos directamente desde Chrome DevTools
window.JarvisMemory = JarvisMemory;

// 🔥 IGNICIÓN DEL NÚCLEO
JarvisMemory.boot();

console.log("%c🛡️ [SIA7]: KERNEL DE MEMORIA V4.1.2 SELLADO Y ACTIVO.", "color: #7c3aed; font-weight: bold; background: #2e1065; padding: 4px; border-radius: 4px;");