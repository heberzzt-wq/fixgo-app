import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { iniciarRuntimeAdmin } from "../admin-runtime.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fakeDocument() {
    const elements = new Map([
        ["listaTecnicos", { innerHTML: "ESCANEANDO PERFILES..." }],
        ["dashboardAnalitico", { innerHTML: "" }]
    ]);
    return {
        elements,
        getElementById(id) {
            return elements.get(id) || null;
        }
    };
}

function fakeLogger() {
    const entries = [];
    return {
        entries,
        info(...args) { entries.push(["info", ...args]); },
        error(...args) { entries.push(["error", ...args]); }
    };
}

test("a Panel Admin failure does not prevent BI from starting", async () => {
    const documentRef = fakeDocument();
    const logger = fakeLogger();
    let biStarted = false;
    const result = await iniciarRuntimeAdmin({
        user: { rol: "admin" },
        iniciarPanel: async () => { throw new Error("permission-denied"); },
        iniciarBI: async () => { biStarted = true; },
        documentRef,
        logger
    });
    assert.equal(biStarted, true);
    assert.equal(result.modules.panel.ok, false);
    assert.equal(result.modules.bi.ok, true);
    assert.match(documentRef.elements.get("listaTecnicos").innerHTML, /demás superficies siguen disponibles/);
    assert.ok(logger.entries.some(entry => String(entry[1]).includes("BI_DONE")));
});

test("a BI failure stays localized and Panel Admin still starts", async () => {
    const documentRef = fakeDocument();
    let panelStarted = false;
    const result = await iniciarRuntimeAdmin({
        user: { rol: "admin" },
        iniciarPanel: async () => { panelStarted = true; },
        iniciarBI: async () => { throw new Error("failed-precondition"); },
        documentRef,
        logger: fakeLogger()
    });
    assert.equal(panelStarted, true);
    assert.equal(result.modules.panel.ok, true);
    assert.equal(result.modules.bi.ok, false);
    assert.match(documentRef.elements.get("dashboardAnalitico").innerHTML, /No fue posible iniciar BI\/NOC/);
});

test("Admin production entry no longer references pruned Jarvis globals", () => {
    const source = fs.readFileSync(path.join(root, "app-main.js"), "utf8");
    assert.doesNotMatch(source, /window\.runJarvis\s*=\s*runJarvis/);
    assert.doesNotMatch(source, /window\.analyzeIntent\s*=\s*analyzeIntent/);
    assert.match(source, /iniciarRuntimeAdmin/);
});

test("BI keeps gateways visible and has no privileged direct writes or cash override", () => {
    const source = fs.readFileSync(path.join(root, "app-bi.js"), "utf8");
    for (const id of ["cardGatewayStripe", "toggleStripeGW", "cardGatewayEfectivo", "toggleEfectivoGW"]) {
        assert.match(source, new RegExp(`id=["']${id}["']`));
    }
    assert.match(source, /actualizarGatewaysPagoB2C/);
    assert.match(source, /ejecutarAccionNocB2C/);
    assert.doesNotMatch(source, /\b(?:updateDoc|setDoc|addDoc)\s*\(/);
    assert.doesNotMatch(source, /allowCashPayment|cashAuthorizedAt|habilitarCobroEfectivo/);
});

test("customer payment UI resolves the real global configuration", () => {
    const source = fs.readFileSync(path.join(root, "panel-admin.js"), "utf8");
    assert.match(source, /getDoc\(doc\(db, "configuracion", "pagos"\)\)/);
    assert.doesNotMatch(source, /stripe_activo:\s*true,\s*efectivo_activo:\s*true/);
    assert.match(source, /Resultado: \$\{resolved\.efectivo \? "DISPONIBLE" : "BLOQUEADO"\}/);
    assert.match(source, /adminListenerError\(\s*"TECHNICIANS"/);
});

test("Admin listeners replace every critical placeholder with data, an empty state, or a localized error", () => {
    const source = fs.readFileSync(path.join(root, "panel-admin.js"), "utf8");
    assert.match(source, /No hay técnicos registrados en la base de datos/);
    assert.match(source, /Sin actividad reciente en la plataforma/);
    assert.match(source, /No hay retiros pendientes/);
    assert.match(source, /No hay solicitudes de facturas pendientes/);
    for (const surface of ["TECHNICIANS", "SERVICES", "WITHDRAWALS", "INVOICES"]) {
        assert.match(source, new RegExp(`(?:adminListenerError|PANEL_ADMIN_)\\(?[\\s\\S]{0,120}${surface}`));
    }
});

test("global gateway writes resynchronize marketplace on create and update", () => {
    const source = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
    assert.match(source, /exports\.resyncB2cMarketplaceConfig[\s\S]{0,180}\.onWrite\(/);
    assert.doesNotMatch(source, /exports\.resyncB2cMarketplaceConfig[\s\S]{0,180}\.onUpdate\(/);
});
