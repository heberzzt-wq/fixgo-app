"use strict";

const assert = require("node:assert/strict");
const {
    createB2cServiceHandler,
    createMigrateTechnicianProfileHandler,
    createSetCustomerPaymentPermissionsHandler
} = require("./b2c-platform-authority");

class HttpsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function snapshot(id, value, ref = null) {
    return { id, ref, exists: value !== undefined, data: () => value };
}

function fakeDb(seed) {
    const data = new Map(Object.entries(seed));
    const ref = path => ({ path, id: path.split("/").pop(), async get() { return snapshot(this.id, data.get(path), this); }, async set(value, options) {
        data.set(path, options?.merge ? { ...(data.get(path) || {}), ...value } : value);
    } });
    return {
        data,
        collection(name) { return { doc(id) { return ref(`${name}/${id}`); } }; },
        async runTransaction(callback) {
            const writes = [];
            const transaction = {
                async get(target) { return snapshot(target.id, data.get(target.path), target); },
                create(target, value) { writes.push(() => data.set(target.path, value)); },
                update(target, value) { writes.push(() => data.set(target.path, { ...(data.get(target.path) || {}), ...value })); }
            };
            const result = await callback(transaction);
            writes.forEach(write => write());
            return result;
        }
    };
}

const admin = { firestore: { FieldValue: { serverTimestamp: () => "server-time" } } };
const functions = { https: { HttpsError } };
const destination = {
    direccion: "Av. Prueba 123",
    coords: { lat: 21.1619, lng: -86.8515 },
    fuente: "mapa_pin",
    confirmado_por_cliente: true
};

(async () => {
    const db = fakeDb({
        "configuracion/pagos": { stripe_activo: false, efectivo_activo: true },
        "users/client-1": {
            rol: "cliente",
            tipo_cuenta: "B2C",
            nombre: "Cliente",
            pagos: { stripe_autorizado: false, efectivo_autorizado: true }
        }
    });
    const create = createB2cServiceHandler({ admin, db, functions });
    const context = { auth: { uid: "client-1", token: {} } };
    await assert.rejects(
        create({ serviceId: "service_stripe_1", metodo_pago: "stripe", categoria_id: "fix_plomeria", destino: destination }, context),
        error => error.code === "failed-precondition" && error.message === "PAYMENT_METHOD_NOT_AUTHORIZED"
    );
    const result = await create({
        serviceId: "service_cash_1",
        metodo_pago: "efectivo",
        categoria_id: "FIX-PLOMERÍA",
        destino: destination,
        descripcion: "Fuga visible"
    }, context);
    assert.equal(result.created, true);
    const service = db.data.get("services/service_cash_1");
    assert.equal(service.estado, "pendiente");
    assert.equal(service.categoria_id, "fix_plomeria");
    assert.equal(service.payment_authority.effective, true);
    assert.deepEqual(service.auditoria, {
        create_authority: "createB2cService",
        contract_version: "b2c-platform-contract-v1"
    });
    assert.equal(Object.hasOwn(service, "auditoria.create_authority"), false);

    db.data.set("users/admin-1", { rol: "admin" });
    const setPayments = createSetCustomerPaymentPermissionsHandler({ admin, db, functions });
    await setPayments(
        { customerId: "client-1", stripe_autorizado: true, efectivo_autorizado: false },
        { auth: { uid: "admin-1", token: {} } }
    );
    const updated = db.data.get("users/client-1");
    assert.equal(updated["pagos.stripe_autorizado"], true);
    assert.equal(updated["pagos.efectivo_autorizado"], false);

    db.data.set("users/tech-legacy", {
        rol: "tecnico",
        estado: "activo",
        status: "activo",
        disponible: true,
        nombre: "Juan preservado",
        logistica: { vehiculo: "peaton" },
        skills: ["FIX PLOMERÍA"]
    });
    const migrate = createMigrateTechnicianProfileHandler({ admin, db, functions });
    const dryRun = await migrate(
        { technicianId: "tech-legacy", apply: false },
        { auth: { uid: "admin-1", token: {} } }
    );
    assert.equal(dryRun.classification, "requires_review");
    await assert.rejects(
        migrate({ technicianId: "tech-legacy", apply: true }, { auth: { uid: "admin-1", token: {} } }),
        error => error.code === "failed-precondition" && error.message === "MIGRATION_REVIEW_CONFIRMATION_REQUIRED"
    );
    assert.equal(db.data.get("users/tech-legacy").nombre, "Juan preservado");
    console.log("PASS b2c-platform-authority");
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
