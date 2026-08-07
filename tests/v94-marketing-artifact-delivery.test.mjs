import assert from "node:assert/strict";
import { test } from "node:test";
import { planMarketingRequest } from "../gestia-core/jarvis/jarvis.marketing.engine.js";
import {
    marketingArtifactArgsFromCompletedTasks,
    marketingFinalResponseFromMission
} from "../gestia-core/jarvis/jarvis.marketing.presenter.js";

function readyPlan() {
    return planMarketingRequest(
        "Crea un plan de marketing completo para Multiservicios Peninsulares HMH.",
        {
            brandName: "Multiservicios Peninsulares HMH",
            campaignObjective: "Captar clientes y prestadores durante los primeros 90 días",
            audience: "Propietarios, administradores, pequeños negocios y personas que necesitan técnicos confiables",
            market: "Cancún, Quintana Roo",
            offer: "Plataforma de multiservicios para hogares y negocios",
            pain: "Dificultad para encontrar profesionales verificados, disponibles y con seguimiento",
            promise: "Conexión rápida con profesionales y trazabilidad del servicio",
            differentiator: "Profesionales verificados, seguimiento y experiencia digital",
            budget: "escenario bajo",
            mediumBudget: "escenario medio",
            horizon: "90 días",
            cta: "Solicitar servicio o registrarse como profesional",
            channels: ["Meta Ads", "Google Ads", "contenido local", "WhatsApp", "referidos"]
        }
    );
}

test("the exact completed 25-section marketing output hydrates MD and PDF", () => {
    const result = readyPlan();
    assert.equal(result.status, "MARKETING_PACKAGE_READY");
    assert.equal(Object.keys(result.plan).length, 25);
    const completed = [{ name: "marketing.plan", observation: {
        status: result.status,
        objectiveSatisfied: result.objectiveSatisfied,
        userVisible: result.userVisible
    }}];
    for (const format of ["md", "pdf"]) {
        const args = marketingArtifactArgsFromCompletedTasks(completed, {
            format,
            title: "Plan de marketing completo — Multiservicios Peninsulares HMH"
        });
        assert.equal(args.content, result.userVisible);
        assert.match(args.content, /Multiservicios Peninsulares HMH/i);
        assert.match(args.content, /25\. Próximos pasos priorizados/i);
    }
});

test("final marketing response is fail-closed about artifact delivery", () => {
    const result = readyPlan();
    const marketing = { name: "marketing.plan", observation: {
        status: result.status,
        objectiveSatisfied: true,
        userVisible: result.userVisible
    }};
    const pending = marketingFinalResponseFromMission({
        completedTasks: [marketing],
        blockedTasks: [{ name: "document.create", args: { format: "pdf", title: "Plan de marketing completo — Multiservicios Peninsulares HMH" } }],
        pendingTasks: []
    });
    assert.equal(pending.ok, false);
    assert.match(pending.text, /entrega de archivos todavía no terminó/i);
    const ready = marketingFinalResponseFromMission({
        completedTasks: [
            marketing,
            { name: "document.create", args: { format: "md", title: "Plan de marketing completo — Multiservicios Peninsulares HMH" }, observation: { artifact: ".jarvis-artifacts/documents/hmh.md" } },
            { name: "document.create", args: { format: "pdf", title: "Plan de marketing completo — Multiservicios Peninsulares HMH" }, observation: { artifact: ".jarvis-artifacts/documents/hmh.pdf" } }
        ],
        blockedTasks: [],
        pendingTasks: []
    });
    assert.equal(ready.ok, true);
    assert.match(ready.text, /hmh\.md/);
    assert.match(ready.text, /hmh\.pdf/);
});
