import { ejecutarCambios } from './gestia-core/operations-executor.engine.js';

console.log("🔥 TEST START");

const result = await ejecutarCambios({
    operation_id: "TEST_BRAZO_EJECUTOR_" + Date.now(),
    tenantId: "admin",
    ejecutado_por: "heberto_arquitecto",
    changes: [{
        type: "OS_COMMAND",
        target: "files_system",
        payload: {
            command: "dir",
            args: []
        },
        reason: "Validación de conectividad con sistema operativo"
    }]
});

console.log("🔥 RESULTADO:");
console.dir(result, { depth: null });

console.log("🔥 TEST END");