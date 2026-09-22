"use strict";

const assert = require("node:assert/strict");

const {
    bindingValid,
    calculateSettlement,
    assertPaymentCoverage,
    existingLedgerValid,
    createB2CServiceSettlementEngine,
    createB2CServiceReconciliationHandler
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
        storage_path: "servicios/service_1/customer_signature_1.png",
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
    let autoId = 0;

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
            doc(id = `auto_${++autoId}`) {
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
            technician_id: technicianId,
            before: {...validBinding.before, storage_path: 'b2c_evidence/'+serviceId+'/'+technicianId+'/work_before/a.jpg'},
            after: {...validBinding.after, storage_path: 'b2c_evidence/'+serviceId+'/'+technicianId+'/work_after/b.jpg'},
            signature: {...validBinding.signature, storage_path: 'servicios/'+serviceId+'/customer_signature_1.png'}
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
        verifyEvidence: async () => ({ verifiedByUnitFixture: true }),
        financialPolicy: {
            assertNoFinancialBlock: require("./b2c-financial-policy").assertNoFinancialBlock,
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

    // Retry recovers only after backend payment evidence changes, using the same ledger key.
    const servicePath = `services/${serviceId}`;
    const baseline = fakeDb.data.get(servicePath);
    fakeDb.data.set(servicePath, { ...baseline, liquidado: false, cierre_financiero_pendiente_backend: true,
        monto_pagado: 100, liquidacion_bloqueada: true });
    fakeDb.data.delete(`transacciones/txn_split_${serviceId}`);
    const retry = createB2CServiceReconciliationHandler({
        db: fakeDb, admin, settleCompletedService: engine,
        authorize: async context => { if (context.auth?.token?.admin !== true) throw new Error("ADMIN_REQUIRED"); }
    });
    const adminContext = { auth: { uid: "admin_1", token: { admin: true } } };
    await assert.rejects(retry({ serviceId, reason: "verify payment" }, { auth: { uid: technicianId } }), /ADMIN_REQUIRED/);
    assert.equal([...fakeDb.data.keys()].filter(path => path.includes("settlement_reconciliation_attempts")).length, 0);
    await assert.rejects(retry({ serviceId, reason: "verify payment", monto_pagado: 1000 }, adminContext), /STRIPE_PAYMENT_INCOMPLETE/);
    assert.equal(fakeDb.data.has(`transacciones/txn_split_${serviceId}`), false);
    assert.equal(fakeDb.data.get(servicePath).liquidacion_bloqueada, true);
    fakeDb.data.set(servicePath, { ...fakeDb.data.get(servicePath), monto_pagado: 1000 });
    const recovered = await retry({ serviceId, reason: "payment verified by backend" }, adminContext);
    assert.equal(recovered.status, "settled");
    const completedCount = fakeDb.data.get(`users/${technicianId}`).servicios_completados;
    assert.equal((await retry({ serviceId, reason: "repeat request" }, adminContext)).status, "already_settled");
    assert.equal(fakeDb.data.get(`users/${technicianId}`).servicios_completados, completedCount);
    const attempts = [...fakeDb.data.entries()].filter(([path]) => path.includes("settlement_reconciliation_attempts")).map(([, value]) => value);
    assert.deepEqual(attempts.map(attempt => attempt.status), ["blocked", "settled", "already_settled"]);
    assert.ok(attempts.every(attempt => attempt.actor_id === "admin_1" && attempt.reason));
    fakeDb.data.set(servicePath, { ...fakeDb.data.get(servicePath), liquidado: false,
        cierre_financiero_pendiente_backend: true, b2c_financial_hold: { active: true } });
    await assert.rejects(retry({ serviceId, reason: "hold must remain" }, adminContext), /FINANCIAL_HOLD_OR_REVIEW_PENDING/);
    assert.equal(fakeDb.data.get(servicePath).b2c_financial_hold.active, true);
    fakeDb.data.set(servicePath, { ...fakeDb.data.get(servicePath), b2c_financial_hold: { active: false } });
    fakeDb.data.delete(bindingPath);
    await assert.rejects(retry({ serviceId, reason: "missing evidence" }, adminContext), /FINAL_EVIDENCE_BINDING_INVALID/);
    assert.equal(fakeDb.data.get(`users/${technicianId}`).servicios_completados, completedCount);
    // Deterministic interleaving: another attempt commits after our attempt fails,
    // before failure bookkeeping. The old failure must not block the settled service.
    const originalTransaction = fakeDb.runTransaction.bind(fakeDb);
    let failOnce = true;
    fakeDb.runTransaction = async callback => {
        if (failOnce) {
            failOnce = false;
            fakeDb.data.set(servicePath, { ...fakeDb.data.get(servicePath), liquidado: true,
                cierre_financiero_pendiente_backend: false, liquidacion_bloqueada: false,
                liquidacion_bloqueo_codigo: null });
            throw new Error("STALE_ATTEMPT_FAILED");
        }
        return originalTransaction(callback);
    };
    await assert.rejects(engine({ serviceId }), /STALE_ATTEMPT_FAILED/);
    assert.equal(fakeDb.data.get(servicePath).liquidado, true);
    assert.equal(fakeDb.data.get(servicePath).liquidacion_bloqueada, false);
    assert.equal(fakeDb.data.get(servicePath).liquidacion_bloqueo_codigo, null);
    console.log("B2C SERVICE SETTLEMENT ENGINE: PASS — comisión canónica, ledger y estadísticas son idempotentes.");
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

console.log(
    "B2C SERVICE SETTLEMENT TEST: PASS — evidencia, métodos permitidos, Stripe, efectivo, B2B e idempotencia protegidos."
);