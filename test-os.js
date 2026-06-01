import { ejecutarCambios } from './gestia-core/operations-executor.engine.js';

// Operación de prueba para verificar acceso a sistema
await ejecutarCambios({
    operation_id: "TEST_BRAZO_EJECUTOR_" + Date.now(),
    tenantId: "admin", // Usa el tenant de pruebas
    ejecutado_por: "heberto_arquitecto",
    changes: [{
        type: "OS_COMMAND",
        target: "files_system",
        payload: {
            command: "dir", // Usa "ls" si estuvieras en Linux/Mac
            args: []
        },
        reason: "Validación de conectividad con sistema operativo"
    }]
});