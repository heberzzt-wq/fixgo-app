import test from "node:test";
import assert from "node:assert/strict";
import { classifyLocalRequest, selectResumableMarketingMission } from "../gestia-core/jarvis/jarvis.local.routing.js";

test("routes the full honest-memory prompt before any pending marketing mission", () => {
    const prompt = "Jarvis, sin inventar información: ¿qué recuerdas realmente de este proyecto antes de hoy? Enumera por fecha las decisiones, restricciones, commits, expedientes, resultados técnicos y pendientes que tengas almacenados. Separa claramente la memoria persistente real, los datos creados sólo para pruebas y aquello que no recuerdes o no puedas demostrar. Incluye la evidencia o identificador de origen de cada elemento.";
    assert.equal(classifyLocalRequest(prompt), "PROJECT_MEMORY_QUERY");
});

test("resumes only a compatible waiting marketing mission in the same conversation", () => {
    const identity = { userId: "owner-a", workspaceId: "fixgo", projectId: "hmh", conversationId: "c-1" };
    const pointer = { ...identity, contractVersion: "v2", status: "WAITING_FOR_INPUT", intent: "marketing", missionId: "m-1" };
    assert.equal(selectResumableMarketingMission(pointer, identity, "MARKETING_CONTINUATION", "v2"), "m-1");
    assert.equal(selectResumableMarketingMission(pointer, identity, "PROJECT_MEMORY_QUERY", "v2"), "");
    assert.equal(selectResumableMarketingMission({ ...pointer, conversationId: "c-2" }, identity, "MARKETING_CONTINUATION", "v2"), "");
    assert.equal(selectResumableMarketingMission({ ...pointer, status: "FAILED" }, identity, "MARKETING_CONTINUATION", "v2"), "");
    assert.equal(selectResumableMarketingMission({ ...pointer, contractVersion: "v1" }, identity, "MARKETING_CONTINUATION", "v2"), "");
});

test("distinguishes monthly memory, marketing start, continuation, and unrelated work", () => {
    assert.equal(classifyLocalRequest("¿Qué avanzamos este mes y qué quedó pendiente?"), "MONTHLY_MEMORY_QUERY");
    assert.equal(classifyLocalRequest("Crea un plan de marketing completo para HMH"), "MARKETING_START");
    assert.equal(classifyLocalRequest("Audiencia: hogares. Oferta: reparaciones."), "MARKETING_CONTINUATION");
    assert.equal(classifyLocalRequest("Revisa este módulo"), "NEW_REQUEST");
});
