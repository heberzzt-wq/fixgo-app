import { ejecutarCambios } from './gestia-core/operations-executor.engine.js';

const result = await ejecutarCambios({
    operation_id: "TEST_WRITE_" + Date.now(),
    tenantId: "admin",
    ejecutado_por: "heberto_arquitecto",
    changes: [{
        type: "OS_COMMAND",
        target: "files_system",
        payload: {
            command: "cmd",
            args: [
                "/c",
                "echo JARVIS_OK > prueba.txt"
            ]
        },
        reason: "Validación de escritura"
    }]
});

console.dir(result, { depth: null });