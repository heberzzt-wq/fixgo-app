"use strict";

const assert = require("node:assert/strict");
const {
    buildMarketplaceListing,
    calculateAvailableBalance,
    createClaimB2cServiceHandler,
    isCompatible,
    isOperationalTechnician,
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
    vehiculo: { tipo: "peaton", placas: null }
};
assert.equal(isOperationalTechnician(operational), true);
assert.equal(isOperationalTechnician({ ...operational, disponible: false }), false);
assert.equal(isOperationalTechnician({ ...operational, kyc: { aprobado: false } }), false);
assert.equal(isCompatible(operational, { categoria_id: "fix-plomeria" }), true);
assert.equal(isCompatible(operational, { categoria_id: "electricidad" }), false);
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
    let queue = Promise.resolve();
    const db = {
        collection(name) {
            return {
                doc(id) { return { kind: "doc", path: `${name}/${id}`, id }; },
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
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
