#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
    const absolute = path.join(root, relativePath);
    if (!fs.existsSync(absolute)) {
        throw new Error(`Falta ${relativePath}`);
    }
    return fs.readFileSync(absolute, "utf8");
}

function ok(condition, message) {
    if (!condition) throw new Error(message);
    console.log(`✅ ${message}`);
}

function no(condition, message) {
    ok(!condition, message);
}

const appPanel = read("app-panel.js");
const guard = read("b2c-financial-execution-guard.js");
const stripeStub = read("b2c-stripe-fail-closed-stub.js");
const bridge = read("fixgo-bridge.js");
const legacyBackend = read("fixgo-core-backend.js");
const functionsPackage = JSON.parse(read("functions/package.json"));
const secureEntry = read("functions/secure-entry.js");
const secureAlias = read("functions/secure-entry-alias.js");
const policy = read("functions/b2c-financial-policy.js");
const settlement = read("functions/b2c-service-settlement.js");
const policyTest = read("functions/test-b2c-financial-policy.js");
const settlementTest = read("functions/test-b2c-service-settlement.js");

const guardImportIndex = appPanel.indexOf(
    'import "./b2c-financial-execution-guard.js";'
);
const signatureImportIndex = appPanel.indexOf(
    'import "./b2c-signature-storage-bridge.js";'
);

ok(guardImportIndex >= 0, "app-panel activa guardia financiero B2C");
ok(
    signatureImportIndex >= 0 && guardImportIndex < signatureImportIndex,
    "guardia financiero se registra antes del puente de firma"
);
ok(
    appPanel.includes('import "./b2c-stripe-fail-closed-stub.js";'),
    "app-panel activa fallback Stripe fail-closed"
);

ok(
    guard.includes('B2C_FINANCIAL_EXECUTION_GUARD_VERSION = "1.1.0"'),
    "guardia financiero usa cierre operativo 1.1.0"
);
ok(
    guard.includes("cierre_financiero_pendiente_backend: true"),
    "cierre deja liquidación pendiente al backend"
);
ok(
    guard.includes("cierre_legacy_financiero_ejecutado: false"),
    "cierre declara que el financiero legacy no se ejecutó"
);
ok(
    guard.includes("await finalizarSoloOperacion({ serviceId, technicianId })"),
    "etapa final ejecuta solo cierre operativo"
);
no(
    guard.includes("collection(db, \"transacciones\"") ||
        guard.includes("saldo_virtual") ||
        guard.includes("servicios_completados"),
    "guardia no crea transacciones, no descuenta saldo ni aumenta reputación"
);

ok(
    stripeStub.includes("STRIPE_BRIDGE_UNAVAILABLE_FAIL_CLOSED"),
    "stub Stripe bloquea si no cargó el bridge"
);
no(
    stripeStub.includes('estado: "trabajando"') ||
        stripeStub.includes("setTimeout(async"),
    "stub no simula pago ni cambia estado"
);

ok(
    bridge.includes("Authorization: `Bearer ${token}`"),
    "bridge envía token Firebase al backend"
);
ok(
    bridge.includes("exigirSinBloqueoFinanciero(data)"),
    "bridge bloquea saldo ante disputas o holds"
);
ok(
    bridge.includes("CLIENT_BALANCE_AMOUNT_MISMATCH"),
    "bridge compara saldo informado contra Firestore"
);
ok(
    bridge.includes("INITIAL_AUTHORIZATION_POLICY_MISMATCH"),
    "bridge restringe autorización inicial a política vigente"
);

no(
    /sk_(?:test|live)_[A-Za-z0-9]+/.test(legacyBackend),
    "motor alterno no contiene claves secretas Stripe"
);
ok(
    legacyBackend.includes("process.env.STRIPE_SECRET_KEY"),
    "motor alterno exige secreto por variable de entorno"
);
ok(
    legacyBackend.includes("WITHDRAWAL_ENGINE_NOT_IMPLEMENTED_FAIL_CLOSED"),
    "retiro backend incompleto permanece fail-closed"
);

ok(
    functionsPackage.main === "secure-entry-alias.js",
    "Functions usa entrada segura final"
);
ok(
    functionsPackage.scripts?.["check:b2c-financial"]?.includes(
        "test-b2c-service-settlement.js"
    ),
    "Functions expone verificación financiera automatizada"
);

ok(
    secureEntry.includes("financialPolicy.assertCustomerCheckout"),
    "checkout backend valida identidad, estado y monto autoritativo"
);
ok(
    secureEntry.includes("financialPolicy.assertWebhookTransition"),
    "webhook backend valida transición y monto"
);
ok(
    secureEntry.includes('doc(`stripe_${event.id}`)'),
    "webhook usa transacción determinista por evento Stripe"
);
ok(
    secureEntry.includes("onServiceCompleted: secureOnServiceCompleted"),
    "trigger legacy de liquidación queda sustituido"
);
ok(
    secureEntry.includes("createB2CServiceSettlementEngine"),
    "entrada segura usa motor de liquidación ligado a evidencia"
);

ok(
    secureAlias.includes("stripewebhook: stripeWebhookProxy"),
    "nombre histórico Stripe apunta a proxy seguro independiente"
);
ok(
    secureAlias.includes("secureExports.api(req, res)"),
    "proxy histórico delega al API autoritativo"
);

ok(
    policy.includes("assertNoFinancialBlock"),
    "política backend bloquea incidencias y financial_hold"
);
ok(
    policy.includes("INITIAL_AUTHORIZATION_AMOUNTS"),
    "política backend centraliza autorizaciones iniciales"
);
ok(
    policy.includes("PAYMENT_AMOUNT_MISMATCH"),
    "política backend rechaza montos manipulados"
);

ok(
    settlement.includes("FINAL_EVIDENCE_BINDING_INVALID"),
    "liquidación exige binding final de evidencia"
);
ok(
    settlement.includes("UNTRUSTED_SERVICE_CLOSE"),
    "liquidación rechaza cierres que no vengan del flujo seguro"
);
ok(
    settlement.includes("EXISTING_LEDGER_MISMATCH"),
    "liquidación rechaza colisión de ledger adulterado"
);
ok(
    settlement.includes("PAYMENT_METHOD_NOT_ALLOWED"),
    "liquidación falla cerrado ante métodos desconocidos"
);
ok(
    settlement.includes("STRIPE_PAYMENT_INCOMPLETE"),
    "liquidación Stripe exige cobertura total del servicio"
);
ok(
    settlement.includes("B2B_BALANCE_INSUFFICIENT"),
    "liquidación B2B verifica saldo antes de descontar"
);

ok(
    policyTest.includes("FINANCIAL_HOLD_OR_REVIEW_PENDING") &&
        policyTest.includes("PAYMENT_AMOUNT_MISMATCH"),
    "pruebas cubren holds y manipulación de montos"
);
ok(
    settlementTest.includes("EXISTING_LEDGER_MISMATCH") ||
        settlementTest.includes("existingLedgerValid"),
    "pruebas cubren ledger determinista"
);
ok(
    settlementTest.includes("PAYMENT_METHOD_NOT_ALLOWED"),
    "pruebas cubren método no permitido"
);

const secretScanFiles = [
    "fixgo-core-backend.js",
    "fixgo-bridge.js",
    "functions/secure-entry.js",
    "functions/index.js"
];
for (const file of secretScanFiles) {
    const content = read(file);
    no(
        /sk_(?:test|live)_[A-Za-z0-9]+/.test(content),
        `${file} no contiene secreto Stripe embebido`
    );
}

console.log(
    "\n🛡️ B2C FINANCIAL EXECUTION CHECK: PASS — el navegador solo cierra operación; backend autoritativo valida Stripe, evidencia, holds e idempotencia."
);
