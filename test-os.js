import { ejecutarCambios } from './gestia-core/operations-executor.engine.js';

const result = await ejecutarCambios({
    operation_id: "TEST_CODE_WRITE_" + Date.now(),
    tenantId: "admin",
    ejecutado_por: "heberto_arquitecto",
    changes: [{
        type: "CODE_WRITE",
        target: "jarvis-test.js",
        payload: {
            file: "jarvis-test.js",
            content: 'export const TEST = "JARVIS ONLINE";'
        },
        reason: "Validacion CODE_WRITE"
    }]
});

console.dir(result, { depth: null });