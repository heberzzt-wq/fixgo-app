"use strict";

const assert = require("node:assert/strict");

const {
    financialBlockReasons,
    initialAuthorizationAmount,
    balanceDue,
    assertCustomerCheckout,
    assertWebhookTransition
} = require("./b2c-financial-policy");

function expectCode(fn, expectedCode) {
    assert.throws(fn, (error) => {
        assert.equal(error?.code || error?.message, expectedCode);
        return true;
    });
}

function baseTicket(overrides = {}) {
    return {
        cliente_id: "customer_1",
        tecnico_id: "technician_1",
        estado: "cotizando",
        metodo_pago: "stripe",
        retencion_inicial: 350,
        costo_final: 1350,
        monto_pagado: 350,
        ...overrides
    };
}

assert.equal(initialAuthorizationAmount(baseTicket()), 350);
assert.equal(initialAuthorizationAmount(baseTicket({ retencion_inicial: 550 })), 550);
expectCode(
    () => initialAuthorizationAmount(baseTicket({ retencion_inicial: 500 })),
    "INITIAL_AUTHORIZATION_POLICY_MISMATCH"
);

assert.equal(balanceDue(baseTicket()), 1000);
assert.equal(
    balanceDue(baseTicket({ costo_final: 550, monto_pagado: 350 })),
    200
);
expectCode(
    () => balanceDue(baseTicket({ costo_final: 350, monto_pagado: 350 })),
    "NO_BALANCE_DUE"
);

assert.deepEqual(financialBlockReasons(baseTicket()), []);
assert.deepEqual(
    financialBlockReasons(baseTicket({
        b2c_financial_hold: { active: true },
        llegada_cliente_respuesta: "ubicacion_disputada"
    })),
    ["financial_hold_active", "customer_arrival_dispute"]
);

assert.deepEqual(
    assertCustomerCheckout({
        ticketData: baseTicket({ estado: "iniciado_stripe" }),
        actorUid: "customer_1",
        paymentType: "garantia_inicial",
        requestedAmount: 350
    }),
    {
        allowed: true,
        paymentType: "garantia_inicial",
        authoritativeAmount: 350,
        policyVersion: "1.0.0"
    }
);

expectCode(
    () => assertCustomerCheckout({
        ticketData: baseTicket({ estado: "iniciado_stripe" }),
        actorUid: "attacker",
        paymentType: "garantia_inicial",
        requestedAmount: 350
    }),
    "CUSTOMER_SERVICE_MISMATCH"
);

expectCode(
    () => assertCustomerCheckout({
        ticketData: baseTicket({ estado: "iniciado_stripe" }),
        actorUid: "customer_1",
        paymentType: "garantia_inicial",
        requestedAmount: 1
    }),
    "PAYMENT_AMOUNT_MISMATCH"
);

assert.equal(
    assertCustomerCheckout({
        ticketData: baseTicket(),
        actorUid: "customer_1",
        paymentType: "liquidacion_saldo",
        requestedAmount: 1000
    }).authoritativeAmount,
    1000
);

expectCode(
    () => assertCustomerCheckout({
        ticketData: baseTicket({
            b2c_financial_hold: { active: true }
        }),
        actorUid: "customer_1",
        paymentType: "liquidacion_saldo",
        requestedAmount: 1000
    }),
    "FINANCIAL_HOLD_OR_REVIEW_PENDING"
);

expectCode(
    () => assertCustomerCheckout({
        ticketData: baseTicket({
            llegada_revision_requerida: true
        }),
        actorUid: "customer_1",
        paymentType: "liquidacion_saldo",
        requestedAmount: 1000
    }),
    "FINANCIAL_HOLD_OR_REVIEW_PENDING"
);

assert.equal(
    assertWebhookTransition({
        ticketData: baseTicket({ estado: "iniciado_stripe" }),
        paymentType: "garantia_inicial",
        paidAmount: 350
    }).nextState,
    "pendiente"
);

assert.equal(
    assertWebhookTransition({
        ticketData: baseTicket({ estado: "procesando_saldo" }),
        paymentType: "liquidacion_saldo",
        paidAmount: 1000
    }).nextState,
    "trabajando"
);

expectCode(
    () => assertWebhookTransition({
        ticketData: baseTicket({
            estado: "procesando_saldo",
            llegada_cliente_respuesta: "ubicacion_disputada"
        }),
        paymentType: "liquidacion_saldo",
        paidAmount: 1000
    }),
    "FINANCIAL_HOLD_OR_REVIEW_PENDING"
);

expectCode(
    () => assertWebhookTransition({
        ticketData: baseTicket({ estado: "procesando_saldo" }),
        paymentType: "liquidacion_saldo",
        paidAmount: 999
    }),
    "WEBHOOK_BALANCE_AMOUNT_MISMATCH"
);

console.log(
    "B2C FINANCIAL POLICY TEST: PASS — montos autoritativos, identidad, holds y transiciones protegidos."
);
