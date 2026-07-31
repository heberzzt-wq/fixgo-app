"use strict";

const assert = require("node:assert/strict");

const {
    bindingValid,
    calculateSettlement,
    assertPaymentCoverage
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
        metodo_pago: "stripe",
        tasa_comision_aplicada: 1.2
    }),
    "COMMISSION_RATE_INVALID"
);

console.log(
    "B2C SERVICE SETTLEMENT TEST: PASS — evidencia, Stripe, efectivo y B2B calculados sin confiar en el navegador."
);
