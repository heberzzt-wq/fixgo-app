"use strict";

const assert = require("node:assert/strict");
const {
    createAdminNocActionHandler,
    createB2cServiceHandler,
    createMigrateTechnicianProfileHandler,
    createSetGlobalPaymentGatewaysHandler,
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
    let autoId = 0;
    const ref = path => ({ path, id: path.split("/").pop(), async get() { return snapshot(this.id, data.get(path), this); }, async set(value, options) {
        data.set(path, options?.merge ? { ...(data.get(path) || {}), ...value } : value);
    } });
    return {
        data,
        collection(name) { return {
            doc(id = `auto-${++autoId}`) { return ref(`${name}/${id}`); },
            async get() {
                const prefix = `${name}/`;
                const docs = [...data.entries()]
                    .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
                    .map(([path, value]) => snapshot(path.slice(prefix.length), value, ref(path)));
                return { docs };
            }
        }; },
        batch() {
            const writes = [];
            return {
                set(target, value, options) { writes.push(() => data.set(target.path, options?.merge ? { ...(data.get(target.path) || {}), ...value } : value)); },
                async commit() { writes.forEach(write => write()); }
            };
        },
        async runTransaction(callback) {
            const writes = [];
            const transaction = {
                async get(target) { return snapshot(target.id, data.get(target.path), target); },
                create(target, value) { writes.push(() => data.set(target.path, value)); },
                set(target, value, options) { writes.push(() => data.set(target.path, options?.merge ? { ...(data.get(target.path) || {}), ...value } : value)); },
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
        "configuracion/catalogo_global": {
            fix_plomeria: true,
            fix_electricidad: false,
            road_llanta: true,
            maint_general: true
        },
        "users/client-1": {
            rol: "cliente",
            tipo_cuenta: "B2C",
            nombre: "Cliente",
            pagos: { stripe_autorizado: false, efectivo_autorizado: true }
        },
        "users/tech-covered": {
            rol: "tecnico",
            tipo_cuenta: "B2C",
            estado: "activo",
            status: "activo",
            disponible: true,
            skills: ["fix"],
            foto_perfil: "https://example.test/profile.jpg",
            documentos: {
                ine: "https://example.test/ine.pdf",
                csf: "https://example.test/csf.pdf"
            },
            datos_bancarios: { banco: "Banco", clabe: "012345678901234567" },
            vehiculo: { tipo: "peaton" },
            kyc: { estado: "activo", aprobado: true }
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
        contract_version: "b2c-platform-contract-v2"
    });
    assert.equal(Object.hasOwn(service, "auditoria.create_authority"), false);
    await assert.rejects(
        create({ serviceId: "service_disabled_1", metodo_pago: "efectivo", categoria_id: "fix_electricidad", destino: destination }, context),
        error => error.code === "failed-precondition" && error.message === "SERVICE_CATEGORY_DISABLED"
    );
    await assert.rejects(
        create({ serviceId: "service_unknown_1", metodo_pago: "efectivo", categoria_id: "fix_inventado", destino: destination }, context),
        error => error.code === "invalid-argument" && error.message === "SERVICE_CATEGORY_UNKNOWN"
    );
    const adminEnabledWithoutCoverage = await create({
        serviceId: "service_admin_enabled_1",
        metodo_pago: "efectivo",
        categoria_id: "road_llanta",
        destino: destination
    }, context);
    assert.equal(adminEnabledWithoutCoverage.created, true);
    assert.equal(db.data.get("services/service_admin_enabled_1").categoria_id, "road_llanta");
    await assert.rejects(
        create({ serviceId: "service_wrong_audience_1", metodo_pago: "efectivo", categoria_id: "maint_general", destino: destination }, context),
        error => error.code === "failed-precondition" && error.message === "SERVICE_CATEGORY_ACCOUNT_MISMATCH"
    );

    db.data.set("users/admin-1", { rol: "admin" });
    const setPayments = createSetCustomerPaymentPermissionsHandler({ admin, db, functions });
    await setPayments(
        { customerId: "client-1", stripe_autorizado: true, efectivo_autorizado: false },
        { auth: { uid: "admin-1", token: {} } }
    );
    const updated = db.data.get("users/client-1");
    assert.equal(updated["pagos.stripe_autorizado"], true);
    assert.equal(updated["pagos.efectivo_autorizado"], false);

    const setGateways = createSetGlobalPaymentGatewaysHandler({ admin, db, functions });
    const gatewayResult = await setGateways(
        { stripe_activo: true, efectivo_activo: false },
        { auth: { uid: "admin-1", token: {} } }
    );
    assert.deepEqual(gatewayResult.gateways, { stripe_activo: true, efectivo_activo: false });
    assert.equal(gatewayResult.marketplaceResync, "triggered_by_config_write");
    assert.equal(db.data.get("configuracion/pagos").stripe_activo, true);
    assert.equal(db.data.get("configuracion/pagos").efectivo_activo, false);
    assert.equal(db.data.get("configuracion/pagos").actualizado_por, "admin-1");
    await assert.rejects(
        setGateways({ stripe_activo: true, efectivo_activo: true }, {}),
        error => error.code === "unauthenticated"
    );

    db.data.set("users/tech-1", { rol: "tecnico", nombre: "Técnico Uno", estado: "activo" });
    db.data.set("retiros/withdrawal-1", { estado: "pendiente", tecnico_id: "tech-1", monto: 350 });
    const noc = createAdminNocActionHandler({ admin, db, functions });
    const adminContext = { auth: { uid: "admin-1", token: {} } };
    const strike = await noc(
        { action: "apply_strike", technicianId: "tech-1", strikeLevel: 1 },
        adminContext
    );
    assert.equal(strike.state, "suspendido");
    assert.equal(db.data.get("users/tech-1").disponible, false);
    const withdrawal = await noc(
        { action: "process_withdrawal", withdrawalId: "withdrawal-1" },
        adminContext
    );
    assert.equal(withdrawal.amount, 350);
    assert.equal(db.data.get("retiros/withdrawal-1").estado, "aprobado");
    await assert.rejects(
        noc({ action: "process_withdrawal", withdrawalId: "withdrawal-1" }, adminContext),
        error => error.code === "failed-precondition"
    );

    const b2bCustomer = await noc(
        { action: "update_b2b_customer", customerId: "client-1", enabled: true, balance: 1250.457 },
        adminContext
    );
    assert.equal(b2bCustomer.balance, 1250.46);
    assert.equal(db.data.get("users/client-1").b2b_activo, true);
    assert.equal(db.data.get("users/client-1").saldo_virtual, 1250.46);
    const b2bAudit = [...db.data.entries()].find(([path, value]) => (
        path.startsWith("transacciones/") && value.tipo === "configuracion_saldo_b2b"
    ));
    assert.ok(b2bAudit);
    assert.equal(b2bAudit[1].cliente_id, "client-1");
    assert.equal(b2bAudit[1].tecnico_id, undefined);
    await assert.rejects(
        noc({ action: "update_b2b_customer", customerId: "tech-1", enabled: true, balance: 100 }, adminContext),
        error => error.code === "failed-precondition"
    );

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
