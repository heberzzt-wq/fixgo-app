"use strict";

const assert = require("node:assert/strict");
const {
    buildMarketplaceListing,
    calculateAvailableBalance,
    createCancelB2cServiceHandler,
    createClaimB2cServiceHandler,
    createMarketplaceNotificationHandler,
    createRequestB2cWithdrawalHandler,
    createResyncMarketplaceConfigHandler,
    isCompatible,
    isOperationalTechnician,
    recipientFingerprint,
    syncMarketplaceService,
    vehicleData
} = require("./b2c-service-marketplace");

const listing = buildMarketplaceListing("svc-1", {
    categoria: "Plomería",
    categoria_id: "fix-plomeria",
    sub_servicio: "Fuga",
    zona: "Cancún",
    descripcion: "Mi hija está sola en casa",
    direccion: "Calle privada 123",
    coords: { lat: 21, lng: -86 },
    cliente_telefono: "555",
    foto_problema: "https://secret.example/photo.jpg",
    metodo_pago: "stripe",
    estado: "pendiente",
    fecha_pago: "timestamp",
    payment_authority: {
        method: "stripe",
        global_enabled: true,
        individual_authorized: true,
        effective: true
    },
    destino: {
        fuente: "mapa_pin",
        confirmado_por_cliente: true,
        coords: { lat: 21, lng: -86 }
    },
    urgencia: true
}, "timestamp");

assert.equal(listing.service_id, "svc-1");
assert.equal(listing.metodo_pago, "stripe");
for (const privateField of ["descripcion", "direccion", "coords", "cliente_telefono", "foto_problema", "destino", "cliente_id"]) {
    assert.equal(Object.hasOwn(listing, privateField), false, `No debe publicar ${privateField}`);
}

const operational = {
    rol: "tecnico",
    estado: "activo",
    status: "activo",
    disponible: true,
    suspendido: false,
    kyc: { aprobado: true },
    skills: ["plomeria"],
    foto_perfil: { storage_path: "expedientes/tech-1/foto/current.png" },
    documentos: {
        ine: { storage_path: "expedientes/tech-1/ine/current.png" },
        csf: { storage_path: "expedientes/tech-1/csf/current.png" },
        licencia: null,
        certificados: []
    },
    datos_bancarios: { banco: "Banco", clabe: "012345678901234567" },
    vehiculo: { tipo: "peaton", placas: null }
};
assert.equal(isOperationalTechnician(operational), true);
assert.equal(isOperationalTechnician({ ...operational, disponible: false }), false);
assert.equal(isOperationalTechnician({ ...operational, kyc: { aprobado: false } }), false);
assert.equal(isCompatible(operational, { categoria_id: "fix-plomeria" }), true);
assert.equal(isCompatible(operational, { categoria_id: "electricidad" }), false);
assert.equal(isCompatible({ ...operational, skills: ["FIX"] }, { categoria_id: "fix_plomeria" }), true);
assert.equal(isCompatible({ ...operational, skills: ["FIX"] }, { categoria_id: "fix_electricidad" }), true);
assert.equal(isCompatible({ ...operational, skills: ["fix_plomeria"] }, { categoria_id: "fix_electricidad" }), false);
assert.equal(isCompatible({ ...operational, skills: ["ROAD"] }, { categoria_id: "fix_plomeria" }), false);
assert.match(recipientFingerprint("tech-1"), /^[a-f0-9]{16}$/);
assert.deepEqual(vehicleData(operational), { type: "peaton", plates: null });

const now = Date.parse("2026-08-31T12:00:00Z");
assert.equal(calculateAvailableBalance([
    { pago_tecnico: -1100, tipo: "penalizacion" },
    { pago_tecnico: 300, tipo: "servicio", fecha: "2026-08-30T11:00:00Z" },
    { pago_tecnico: 900, tipo: "servicio", fecha: "2026-08-31T11:00:00Z" }
], [
    { monto: 50, estado: "pendiente" },
    { monto: 999, estado: "aprobado" }
], now), -850);

console.log("PASS b2c-service-marketplace");

class HttpsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function fakeSnapshot(id, value) {
    return {
        id,
        exists: value !== undefined,
        data: () => value
    };
}

function createFakeDb() {
    const data = new Map([
        ["users/tech-1", operational],
        ["users/tech-2", { ...operational, nombre: "Segundo" }],
        ["services/svc-race", {
            estado: "pendiente",
            cliente_id: "customer",
            categoria_id: "fix-plomeria",
            metodo_pago: "efectivo",
            es_privada: false
        }],
        ["service_marketplace/svc-race", { service_id: "svc-race", estado: "disponible" }]
    ]);
    let autoId = 0;
    let queue = Promise.resolve();
    const db = {
        collection(name) {
            return {
                doc(id = `auto-${++autoId}`) { return { kind: "doc", path: `${name}/${id}`, id }; },
                where(field, operator, value) { return { kind: "query", name, field, operator, value }; }
            };
        },
        runTransaction(callback) {
            const execute = async () => {
                const writes = [];
                const tx = {
                    async get(target) {
                        if (target.kind === "doc") return fakeSnapshot(target.id, data.get(target.path));
                        const docs = [...data.entries()]
                            .filter(([path, value]) => path.startsWith(`${target.name}/`) && value?.[target.field] === target.value)
                            .map(([path, value]) => fakeSnapshot(path.split("/")[1], value));
                        return { docs };
                    },
                    update(ref, patch) { writes.push(() => data.set(ref.path, { ...data.get(ref.path), ...patch })); },
                    delete(ref) { writes.push(() => data.delete(ref.path)); },
                    set(ref, value) { writes.push(() => data.set(ref.path, value)); }
                };
                const result = await callback(tx);
                writes.forEach(write => write());
                return result;
            };
            const result = queue.then(execute, execute);
            queue = result.catch(() => {});
            return result;
        }
    };
    return { db, data };
}

(async () => {
    const { db, data } = createFakeDb();
    const handler = createClaimB2cServiceHandler({
        db,
        admin: { firestore: { FieldValue: { serverTimestamp: () => "server-time" } } },
        functions: { https: { HttpsError } },
        now: () => Date.parse("2026-08-31T12:00:00Z")
    });
    const attempts = await Promise.allSettled([
        handler({ serviceId: "svc-race" }, { auth: { uid: "tech-1" } }),
        handler({ serviceId: "svc-race" }, { auth: { uid: "tech-2" } })
    ]);
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(attempts.filter(result => result.status === "rejected").length, 1);
    assert.equal(data.get("services/svc-race").estado, "asignado");
    assert.equal(data.has("service_marketplace/svc-race"), false);
    console.log("PASS b2c-service-marketplace simultaneous claim");

    const cancelDb = createFakeDb();
    cancelDb.data.set("services/svc-race", {
        ...cancelDb.data.get("services/svc-race"),
        estado: "asignado",
        tecnico_id: "tech-1",
        tecnico_nombre: "Técnico",
        asignado_at: "old-time"
    });
    cancelDb.data.set("technician_active_services/tech-1", {
        service_id: "svc-race", technician_id: "tech-1", estado: "activo"
    });
    const cancelHandler = createCancelB2cServiceHandler({
        db: cancelDb.db,
        admin: { firestore: { FieldValue: { serverTimestamp: () => "server-time" } } },
        functions: { https: { HttpsError } }
    });
    const cancelled = await cancelHandler(
        { serviceId: "svc-race", reason: "No puedo continuar la misión" },
        { auth: { uid: "tech-1" } }
    );
    assert.equal(cancelled.estado, "pendiente");
    assert.equal(cancelDb.data.get("services/svc-race").marketplace_revision, 1);
    assert.deepEqual(cancelDb.data.get("services/svc-race").rejected_by, ["tech-1"]);
    assert.equal(cancelDb.data.has("technician_active_services/tech-1"), false);
    assert.equal(cancelDb.data.get("transacciones/cancel_svc-race_tech-1").pago_tecnico, -150);
    cancelDb.data.set("service_marketplace/svc-race", { service_id: "svc-race", estado: "disponible" });
    await assert.rejects(
        createClaimB2cServiceHandler({
            db: cancelDb.db,
            admin: { firestore: { FieldValue: { serverTimestamp: () => "server-time" } } },
            functions: { https: { HttpsError } }
        })({ serviceId: "svc-race" }, { auth: { uid: "tech-1" } }),
        error => error.code === "permission-denied"
    );
    console.log("PASS b2c-service-marketplace canonical cancellation");

    const withdrawalDb = createFakeDb();
    withdrawalDb.data.set("transacciones/tx-available", {
        tecnico_id: "tech-1",
        pago_tecnico: 500,
        tipo: "servicio",
        fecha: "2026-08-29T11:00:00Z"
    });
    const withdrawalHandler = createRequestB2cWithdrawalHandler({
        db: withdrawalDb.db,
        admin: { firestore: { FieldValue: { serverTimestamp: () => "server-time" } } },
        functions: { https: { HttpsError } },
        now: () => Date.parse("2026-08-31T12:00:00Z")
    });
    const withdrawal = await withdrawalHandler({ amount: 500 }, { auth: { uid: "tech-1" } });
    assert.equal(withdrawal.ok, true);
    assert.equal(withdrawal.amount, 500);
    assert.equal(withdrawalDb.data.get(`retiros/${withdrawal.withdrawalId}`).estado, "pendiente");
    await assert.rejects(
        withdrawalHandler({ amount: 1 }, { auth: { uid: "tech-1" } }),
        error => error.code === "already-exists"
    );
    assert.equal([...withdrawalDb.data.keys()].some(path => path.startsWith("tecnicos/")), false);
    console.log("PASS b2c-service-marketplace canonical withdrawal");

    const admin = { firestore: { FieldValue: { serverTimestamp: () => "server-time" } } };
    const marketplaceDb = createFakeDb();
    marketplaceDb.data.set("services/svc-race", {
        ...marketplaceDb.data.get("services/svc-race"),
        destino: {
            fuente: "mapa_pin",
            confirmado_por_cliente: true,
            coords: { lat: 21, lng: -86 }
        }
    });
    marketplaceDb.data.set("users/customer", { pagos: { efectivo_autorizado: true } });
    marketplaceDb.data.set("configuracion/pagos", { efectivo_activo: true, stripe_activo: false });
    marketplaceDb.data.set("configuracion/catalogo_global", { fix_plomeria: true });
    const enabledResult = await syncMarketplaceService({
        admin,
        db: marketplaceDb.db,
        serviceId: "svc-race"
    });
    assert.equal(enabledResult.published, true);
    marketplaceDb.data.set("configuracion/catalogo_global", { fix_plomeria: false });
    const disabledResult = await syncMarketplaceService({
        admin,
        db: marketplaceDb.db,
        serviceId: "svc-race"
    });
    assert.deepEqual(disabledResult, { published: false, reason: "SERVICE_CATEGORY_DISABLED" });
    assert.equal(marketplaceDb.data.has("service_marketplace/svc-race"), false);

    let resyncCount = 0;
    const resyncDb = {
        collection(name) {
            if (name === "services") {
                return {
                    doc: id => marketplaceDb.db.collection(name).doc(id),
                    where: () => ({
                        get: async () => ({ docs: [{ id: "svc-race" }] })
                    })
                };
            }
            return marketplaceDb.db.collection(name);
        },
        runTransaction: async callback => {
            resyncCount += 1;
            return marketplaceDb.db.runTransaction(callback);
        }
    };
    const resyncHandler = createResyncMarketplaceConfigHandler({ admin, db: resyncDb });
    const configChange = {
        before: fakeSnapshot("catalogo_global", { fix_plomeria: true }),
        after: fakeSnapshot("catalogo_global", { fix_plomeria: false })
    };
    await resyncHandler(configChange, { params: { configId: "otro" } });
    assert.equal(resyncCount, 0);
    await resyncHandler(configChange, { params: { configId: "catalogo_global" } });
    assert.equal(resyncCount, 1);
    console.log("PASS b2c-service-marketplace admin catalog resync");

    const notificationTechnicians = [
        fakeSnapshot("tech-vertical", { ...operational, skills: ["FIX"], fcmToken: "token-compatible" }),
        fakeSnapshot("tech-specific-other", { ...operational, skills: ["fix_electricidad"], fcmToken: "token-other" }),
        fakeSnapshot("tech-road", { ...operational, skills: ["ROAD"], fcmToken: "token-road" })
    ];
    let sentMessage = null;
    const eventWrites = [];
    const notificationDb = {
        collection(name) {
            if (name === "service_marketplace") {
                return { doc: id => ({ get: async () => fakeSnapshot(id, { service_id: id, categoria_id: "fix_plomeria" }) }) };
            }
            if (name === "services") {
                return { doc: id => ({ get: async () => fakeSnapshot(id, { rejected_by: ["tech-specific-other"] }) }) };
            }
            if (name === "users") {
                const technicianQuery = {
                    where() { return technicianQuery; },
                    get: async () => ({ docs: notificationTechnicians })
                };
                return technicianQuery;
            }
            throw new Error(`Unexpected collection ${name}`);
        }
    };
    const notificationHandler = createMarketplaceNotificationHandler({
        db: notificationDb,
        admin: {
            firestore: { FieldValue: { serverTimestamp: () => "server-time" } },
            messaging: () => ({
                sendEachForMulticast: async message => {
                    sentMessage = message;
                    return { successCount: 1, failureCount: 0, responses: [{ success: true }] };
                }
            })
        }
    });
    await notificationHandler({
        data: () => ({
            event_type: "marketplace_service_available",
            service_id: "svc-notify",
            message_id: "msg-notify"
        }),
        ref: { set: async patch => eventWrites.push(patch) }
    });
    assert.deepEqual(sentMessage.tokens, ["token-compatible"]);
    assert.equal(sentMessage.notification.title, "Nueva solicitud disponible");
    assert.equal(sentMessage.data.alertProfile, "long_loud_vibration");
    assert.equal(sentMessage.webpush.fcmOptions.link, "https://fixgo-44e4d.web.app/tecnico.html");
    assert.equal(sentMessage.webpush.notification.silent, false);
    assert.equal(sentMessage.webpush.notification.renotify, true);
    assert.deepEqual(sentMessage.webpush.notification.vibrate, [700, 180, 700, 180, 700, 180, 1200]);
    assert.equal(sentMessage.android.priority, "high");
    assert.equal(sentMessage.android.notification.sound, "default");
    assert.equal(sentMessage.android.notification.channelId, "gestia_requests");
    assert.equal(sentMessage.apns.headers["apns-priority"], "10");
    assert.equal(sentMessage.apns.payload.aps.sound, "default");
    assert.equal(eventWrites.at(-1).recipient_count, 1);
    assert.deepEqual(eventWrites.at(-1).recipient_fingerprints, [recipientFingerprint("tech-vertical")]);
    assert.deepEqual(eventWrites.at(-1).delivered_recipient_fingerprints, [recipientFingerprint("tech-vertical")]);
    console.log("PASS b2c-service-marketplace FCM compatibility parity");
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
