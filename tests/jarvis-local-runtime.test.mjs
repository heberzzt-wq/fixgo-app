import assert from "node:assert/strict";
import test from "node:test";

class Storage {
    constructor() { this.values = new Map(); }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
    key(index) { return [...this.values.keys()][index] ?? null; }
    get length() { return this.values.size; }
}

const firstPrompt = "Crea un plan de marketing completo para Multiservicios Peninsulares HMH.";
const completePrompt = "Negocio: plataforma de multiservicios para hogares y negocios. Mercado inicial: Cancún, Quintana Roo. Audiencia: propietarios, administradores, pequeños negocios y personas que necesitan técnicos confiables. Oferta: conexión con profesionales para servicios de reparación, mantenimiento e instalación, con seguimiento digital. Problema: dificultad para encontrar profesionales verificados, disponibles y con seguimiento. Promesa: conectar rápidamente al cliente con profesionales adecuados y brindar trazabilidad durante el servicio. Diferenciador: profesionales verificados, seguimiento del servicio, evidencia digital y experiencia centralizada en una plataforma. Objetivo: captar clientes y prestadores durante los primeros 90 días. Canales: Meta Ads, Google Ads, contenido local, WhatsApp y referidos. CTA: solicitar servicio o registrarse como profesional. Presupuesto: utiliza un escenario bajo y uno medio. Horizonte: 90 días.";

async function rebuildRuntime(tag) {
    delete globalThis.JarvisLocalRuntime;
    const url = new URL("../gestia-core/jarvis/jarvis.local.runtime.js", import.meta.url);
    url.searchParams.set("testRun", tag);
    await import(url.href);
    return globalThis.JarvisLocalRuntime;
}

test("local marketing resumes one mission and remembers the missing-to-complete transition after rebuild", async () => {
    const previous = {
        location: globalThis.location,
        localStorage: globalThis.localStorage,
        document: globalThis.document,
        MutationObserver: globalThis.MutationObserver,
        runtime: globalThis.JarvisLocalRuntime
    };
    const storage = new Storage();
    globalThis.location = {
        hostname: "127.0.0.1",
        search: "?jarvisLocal=1&userId=owner-a&workspaceId=fixgo&projectId=hmh&conversationId=marketing-runtime-regression"
    };
    globalThis.localStorage = storage;
    globalThis.document = {
        title: "Terminal Heberto | GestiaPremium",
        readyState: "complete",
        documentElement: { dataset: {} },
        addEventListener() {},
        removeEventListener() {},
        getElementById() { return null; },
        querySelectorAll() { return []; }
    };
    globalThis.MutationObserver = class {
        observe() {}
        disconnect() {}
    };

    try {
        const runtime = await rebuildRuntime(`initial-${Date.now()}`);
        const first = await runtime.handle(firstPrompt);
        assert.equal(first.status, "MARKETING_INPUT_REQUIRED");
        assert.equal(first.executionCount, 1);
        assert.match(first.missionId, /^MISSION-/);

        const completed = await runtime.handle(completePrompt);
        assert.equal(completed.status, "MARKETING_PACKAGE_READY");
        assert.equal(completed.missionId, first.missionId);
        assert.equal(completed.executionCount, 1);
        assert.equal([...completed.text.matchAll(/^##\s+\d+\./gm)].length, 25);
        assert.match(completed.text, /escenario bajo/i);
        assert.match(completed.text, /escenario medio/i);

        const rebuilt = await rebuildRuntime(`rebuilt-${Date.now()}`);
        const remembered = await rebuilt.handle("¿Qué hicimos con el plan de marketing de Multiservicios Peninsulares HMH?");
        assert.equal(remembered.status, "PROJECT_MEMORY_READY");
        assert.equal(remembered.executionCount, 0);
        assert.match(remembered.text, new RegExp(first.missionId));
        assert.match(remembered.text, /pendiente:/i);
        assert.match(remembered.text, /completada después de solicitar y recibir los datos críticos faltantes/i);
        assert.match(remembered.text, /90 días/i);
        assert.match(remembered.text, /escenario bajo/i);
        assert.match(remembered.text, /escenario medio/i);
        assert.match(remembered.text, /entregable completo/i);
    } finally {
        if (previous.location === undefined) delete globalThis.location;
        else globalThis.location = previous.location;
        if (previous.localStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previous.localStorage;
        if (previous.document === undefined) delete globalThis.document;
        else globalThis.document = previous.document;
        if (previous.MutationObserver === undefined) delete globalThis.MutationObserver;
        else globalThis.MutationObserver = previous.MutationObserver;
        if (previous.runtime === undefined) delete globalThis.JarvisLocalRuntime;
        else globalThis.JarvisLocalRuntime = previous.runtime;
    }
});
