"use strict";

const assert = require("node:assert/strict");

const {
    bindingValid,
    calculateSettlement,
    assertPaymentCoverage,
    existingLedgerValid,
    createB2CServiceSettlementEngine
} = require("./b2c-service-settlement");

function expectCode(fn, expectedCode) {
    assert.throws(fn, (error) => {
        assert.equal(error?.code || error?.message, expectedCode);
        return true;
    });
}

const validBinding = {
    service_id: "service_1",
    technician_id: "technician_1",
    before: {
        sha256: "a".repeat(64),
        storage_path: "b2c_evidence/service_1/technician_1/work_before/a.jpg",
        download_url: "https://example.test/before.jpg"
    },
    after: {
        sha256: "b".repeat(64),
        storage_path: "b2c_evidence/service_1/technician_1/work_after/b.jpg",
        download_url: "https://example.test/after.jpg"
    },
    signature: {
        present: true,
        sha256: "c".repeat(64),
        storage_path: "servicios/service_1/customer_signature.png",
        download_url: "https://example.test/signature.png",
        base64_persisted: false
    }
};

assert.equal(
    bindingValid(validBinding, "service_1", "technician_1"),
    true
);
assert.equal(
    bindingValid(
        {
            ...validBinding,
            technician_id: "attacker"
        },
        "service_1",
        "technician_1"
    ),
    false
);
assert.equal(
    bindingValid(
        {
            ...validBinding,
            signature: {
                ...validBinding.signature,
                base64_persisted: true
            }
        },
        "service_1",
        "technician_1"
    ),
    false
);

const stripeSettlement = calculateSettlement({
    costo_final: 1000,
    metodo_pago: "stripe",
    clientType: "ON_DEMAND",
    tasa_comision_aplicada: 0.30
});
assert.deepEqual(stripeSettlement, {
    total: 1000,
    method: "stripe",
    clientType: "ON_DEMAND",
    commissionRate: 0.30,
    technicianAmount: 700,
    platformAmount: 300
});
assert.equal(
    assertPaymentCoverage(
        { monto_pagado: 1000 },
        stripeSettlement
    ),
    true
);
expectCode(
    () => assertPaymentCoverage(
        { monto_pagado: 999 },
        stripeSettlement
    ),
    "STRIPE_PAYMENT_INCOMPLETE"
);

const cashSettlement = calculateSettlement({
    costo_final: 1000,
    metodo_pago: "efectivo",
    client_type: "ON_DEMAND",
    tasa_comision_aplicada: 0.32
});
assert.deepEqual(cashSettlement, {
    total: 1000,
    method: "efectivo",
    clientType: "ON_DEMAND",
    commissionRate: 0.32,
    technicianAmount: -320,
    platformAmount: 320
});

const b2bSettlement = calculateSettlement({
    costo_final: 1000,
    metodo_pago: "b2b",
    clientType: "B2B_UXMAL",
    monto_tecnico_fijo: 850
});
assert.deepEqual(b2bSettlement, {
    total: 1000,
    method: "b2b",
    clientType: "B2B_UXMAL",
    commissionRate: 0.15,
    technicianAmount: 850,
    platformAmount: 150
});

const ledgerContext = {
    serviceId: "service_1",
    technicianId: "technician_1",
    settlement: stripeSettlement,
    bindingPath: "services/service_1/work_evidence_bindings/current",
    ledgerId: "txn_split_service_1"
};
const validLedger = {
    servicio_id: "service_1",
    tecnico_id: "technician_1",
    idempotency_key: "txn_split_service_1",
    evidence_binding_path:
        "services/service_1/work_evidence_bindings/current",
    monto_total: 1000,
    pago_tecnico: 700,
    comision_gestia: 300
};
assert.equal(existingLedgerValid(validLedger, ledgerContext), true);
assert.equal(
    existingLedgerValid(
        { ...validLedger, pago_tecnico: 900 },
        ledgerContext
    ),
    false
);
assert.equal(
    existingLedgerValid(
        { ...validLedger, tecnico_id: "attacker" },
        ledgerContext
    ),
    false
);

expectCode(
    () => calculateSettlement({
        costo_final: 0,
        metodo_pago: "stripe"
    }),
    "SERVICE_TOTAL_INVALID"
);
expectCode(
    () => calculateSettlement({
        costo_final: 1000,
        metodo_pago: "crypto"
    }),
    "PAYMENT_METHOD_NOT_ALLOWED"
);
expectCode(
    () => calculateSettlement({
        costo_final: 1000,
        metodo_pago: "stripe",
        tasa_comision_aplicada: 1.2
    }),
    "COMMISSION_RATE_INVALID"
);
expectCode(
    () => calculateSettlement({
        costo_final: 1000,
        metodo_pago: "b2b",
        monto_tecnico_fijo: 1200
    }),
    "B2B_TECHNICIAN_AMOUNT_INVALID"
);

function createFakeSettlementDb(initial = {}) {
    const data = new Map(Object.entries(initial));

    function applyPatch(current = {}, patch = {}) {
        const next = { ...current };
        for (const [key, value] of Object.entries(patch)) {
            if (value && typeof value === "object" && value.__increment !== undefined) {
                next[key] = Number(next[key] || 0) + Number(value.__increment || 0);
            } else {
                next[key] = value;
            }
        }
        return next;
    }

    function document(path) {
        return {
            path,
            id: path.split("/").at(-1),
            collection(name) {
                return collection(`${path}/${name}`);
            },
            async get() {
                return snapshot(path);
            },
            async set(value, options = {}) {
                data.set(path, options.merge ? applyPatch(data.get(path), value) : value);
            }
        };
    }

    function collection(path) {
        return {
            doc(id) {
                return document(`${path}/${id}`);
            }
        };
    }

    function snapshot(path) {
        const value = data.get(path);
        return {
            exists: value !== undefined,
            data: () => value
        };
    }

    return {
        data,
        collection,
        async runTransaction(callback) {
            const writes = [];
            const transaction = {
                async get(ref) {
                    return snapshot(ref.path);
                },
                set(ref, value) {
                    writes.push(() => data.set(ref.path, value));
                },
                update(ref, patch) {
                    writes.push(() => data.set(ref.path, applyPatch(data.get(ref.path), patch)));
                }
            };
            const result = await callback(transaction);
            writes.forEach(write => write());
            return result;
        }
    };
}

(async () => {
    const serviceId = "service_engine_1";
    const technicianId = "technician_engine_1";
    const bindingPath = `services/${serviceId}/work_evidence_bindings/current`;
    const fakeDb = createFakeSettlementDb({
        [`services/${serviceId}`]: {
            estado: "finalizado",
            tecnico_id: technicianId,
            cliente_id: "customer_engine_1",
            costo_final: 1000,
            metodo_pago: "stripe",
            monto_pagado: 1000,
            cierre_operativo_completado: true,
            cierre_financiero_pendiente_backend: true,
            cierre_legacy_financiero_ejecutado: false,
            work_evidence_binding_path: bindingPath
        },
        [bindingPath]: {
            ...validBinding,
            service_id: serviceId,
            technician_id: technicianId
        },
        [`users/${technicianId}`]: {
            comision_asignada: 0.30,
            reputacion: 7.7,
            servicios_completados: 27
        }
    });
    const admin = {
        firestore: {
            FieldValue: {
                serverTimestamp: () => "server-time",
                increment: value => ({ __increment: value })
            }
        }
    };
    const engine = createB2CServiceSettlementEngine({
        admin,
        db: fakeDb,
        financialPolicy: {
            assertNoFinancialBlock: () => true,
            assignedTechnician: service => service.tecnico_id
        }
    });

    const first = await engine({ serviceId });
    assert.equal(first.status, "settled");
    assert.equal(first.settlement.commissionRate, 0.30);
    assert.equal(first.settlement.technicianAmount, 700);
    assert.equal(fakeDb.data.get(`transacciones/txn_split_${serviceId}`).pago_tecnico, 700);
    assert.equal(fakeDb.data.get(`transacciones/txn_split_${serviceId}`).comision_gestia, 300);
    assert.equal(fakeDb.data.get(`users/${technicianId}`).reputacion, 7.8);
    assert.equal(fakeDb.data.get(`users/${technicianId}`).servicios_completados, 28);
    assert.equal(fakeDb.data.get(`services/${serviceId}`).liquidado, true);

    const second = await engine({ serviceId });
    assert.equal(second.status, "already_settled");
    assert.equal(fakeDb.data.get(`users/${technicianId}`).reputacion, 7.8);
    assert.equal(fakeDb.data.get(`users/${technicianId}`).servicios_completados, 28);
    assert.equal(
        [...fakeDb.data.keys()].filter(path => path === `transacciones/txn_split_${serviceId}`).length,
        1
    );

    console.log("B2C SERVICE SETTLEMENT ENGINE: PASS — comisión canónica, ledger y estadísticas son idempotentes.");
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

console.log(
    "B2C SERVICE SETTLEMENT TEST: PASS — evidencia, métodos permitidos, Stripe, efectivo, B2B e idempotencia protegidos."
);