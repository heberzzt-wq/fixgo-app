import assert from "node:assert/strict";
import test from "node:test";
import { registerJarvisMultifunctionTools } from "../gestia-core/jarvis/jarvis.multitool.pack.js";
import { runJarvisMission } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";

const marker = "[[JARVIS_DOCUMENT_COMPLETE]]";
const draft = `# Propuesta de trabajo
El equipo revisará la información disponible antes de preparar cualquier publicación. Cada pieza tendrá un responsable, una fecha prevista y una evidencia que permita comprobar su contenido. La primera semana se dedicará a organizar las fuentes, revisar las necesidades de los lectores y elaborar un calendario editorial. Durante la siguiente etapa se producirán borradores, se comprobarán los enlaces y se revisará la claridad del mensaje. Los resultados se registrarán en un informe que distinga las acciones propuestas de las actividades realizadas. Cualquier afirmación que carezca de respaldo quedará pendiente de verificación. La entrega incluirá instrucciones para actualizar los materiales y conservar las versiones aprobadas.`;

function composeTool() {
    const registry = new Map();
    registerJarvisMultifunctionTools({ has: name => registry.has(name), register: tool => registry.set(tool.name, tool) });
    return registry.get("document.compose");
}

function storage() {
    const values = new Map();
    return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
}

test("document recovery stops when a repair does not reduce a validation failure and retains its draft", async () => {
    const previous = globalThis.JarvisLocalBridge;
    const requests = [];
    try {
        globalThis.JarvisLocalBridge = { requestJson: async (_route, payload) => {
            requests.push(payload);
            return { ok: true, message: requests.length === 1 ? `${draft}\n${marker}` : marker };
        } };
        const result = await composeTool().execute({ instructions: "Redacta una propuesta con 2 tablas.", format: "md" }, {});
        assert.equal(requests.length, 2, "one targeted repair must not become six identical attempts");
        assert.equal(result.ok, false);
        assert.equal(result.retryable, false);
        assert.equal(result.fullRestartAllowed, false);
        assert.equal(result.recovery.reason, "DOCUMENT_REPAIR_NO_PROGRESS");
        assert.equal(result.content, draft);
        assert.ok(result.validationFailures.some(value => value.startsWith("DOCUMENT_TABLE_COUNT_BELOW_MINIMUM")));
    } finally { globalThis.JarvisLocalBridge = previous; }
});

test("document recovery fixes only missing content with the same local provider", async () => {
    const previous = globalThis.JarvisLocalBridge;
    const requests = [];
    try {
        globalThis.JarvisLocalBridge = { requestJson: async (route, payload) => {
            assert.equal(route, "/semantic/respond");
            requests.push(payload);
            return { ok: true, message: requests.length === 1 ? `${draft}\n${marker}` : `| Actividad | Responsable |\n|---|---|\n| Revisar fuentes | Equipo editorial |\n\n| Entrega | Estado |\n|---|---|\n| Propuesta | Preparada |\n${marker}` };
        } };
        const result = await composeTool().execute({ instructions: "Redacta una propuesta con 2 tablas.", format: "md" }, {});
        assert.equal(requests.length, 2);
        assert.equal(result.ok, true);
        assert.equal(result.validationPassed, true);
        assert.equal(result.content.split(draft).length - 1, 1);
        assert.match(requests[1].input, /DOCUMENT_TABLE_COUNT_BELOW_MINIMUM/);
        assert.equal(result.recovery.status, "RECOVERED");
        assert.deepEqual(requests.map(request => request.semanticStage), ["document_initial", "document_repair"]);
        assert.equal(requests[1].recoveryAttempt, 1);
    } finally { globalThis.JarvisLocalBridge = previous; }
});

test("placeholder recovery replaces the invalid draft instead of appending a marker to it", async () => {
    const previous = globalThis.JarvisLocalBridge;
    let calls = 0;
    try {
        globalThis.JarvisLocalBridge = { requestJson: async (_route, payload) => {
            calls++;
            if (calls === 2) assert.match(payload.input, /documento corregido completo/);
            return { ok: true, message: calls === 1 ? `El contenido completo del manual generado por document.compose.\n${marker}` : `${draft}\n${marker}` };
        } };
        const result = await composeTool().execute({ instructions: "Redacta una propuesta.", format: "md" }, {});
        assert.equal(result.ok, true);
        assert.equal(calls, 2);
        assert.equal(result.content, draft);
        assert.equal(result.recovery.history[0].strategy, "REPLACE_INVALID_DRAFT");
    } finally { globalThis.JarvisLocalBridge = previous; }
});

test("the repair prompt uses the same contract as the validator when a plan adds detail", async () => {
    const previous = globalThis.JarvisLocalBridge;
    try {
        globalThis.JarvisLocalBridge = { requestJson: async (_route, payload) => {
            const contract = JSON.parse(payload.input.match(/CONTRATO_VERIFICABLE=(.*)/)[1]);
            assert.equal(contract.minTables, 2);
            return { ok: true, message: `${draft}\n${marker}` };
        } };
        const result = await composeTool().execute({ instructions: "Incluye 2 tablas.", format: "md" }, { rawInput: "Prepara un documento descargable con la propuesta." });
        assert.equal(result.ok, false);
        assert.equal(result.recovery.reason, "DOCUMENT_REPAIR_NO_PROGRESS");
    } finally { globalThis.JarvisLocalBridge = previous; }
});

test("a missing final marker can be repaired without duplicating an otherwise valid draft", async () => {
    const previous = globalThis.JarvisLocalBridge;
    let calls = 0;
    try {
        globalThis.JarvisLocalBridge = { requestJson: async () => ({ ok: true, message: ++calls === 1 ? draft : `${draft}\n${marker}` }) };
        const result = await composeTool().execute({ instructions: "Redacta una propuesta.", format: "md" }, {});
        assert.equal(result.ok, true);
        assert.equal(result.content, draft);
        assert.equal(calls, 2);
    } finally { globalThis.JarvisLocalBridge = previous; }
});

test("an exhausted document repair cannot restart through tool retry or a renamed plan", async () => {
    const previous = globalThis.JarvisLocalBridge;
    let inferenceCount = 0;
    let composeCount = 0;
    const completed = [];
    try {
        globalThis.JarvisLocalBridge = { requestJson: async () => ({ ok: true, message: ++inferenceCount === 1 ? `${draft}\n${marker}` : marker }) };
        const compose = composeTool();
        const mission = await runJarvisMission({
            instruction: "Crea un documento con 2 tablas.",
            initialToolCalls: [{ name: "repo.read", args: { file: "README.md" } }, { name: "document.compose", args: { instructions: "Crea un documento con 2 tablas.", format: "md" } }],
            requiredToolNames: ["repo.read", "document.compose"],
            maximumSteps: 5,
            execute: async call => {
                if (call.name === "document.compose") { composeCount++; return compose.execute(call.args, {}); }
                completed.push(call.name); return { ok: true, status: "READ_COMPLETE", content: "Evidence" };
            },
            planner: async () => ({ toolCalls: [{ name: "document.compose", args: { title: "Otro título", instructions: "Crea un documento con 2 tablas.", format: "md" } }] }),
            storage: storage()
        });
        assert.equal(composeCount, 1);
        assert.equal(inferenceCount, 2);
        assert.deepEqual(completed, ["repo.read"]);
        assert.equal(mission.status, "PARTIAL");
        assert.equal(mission.blockedTasks.length, 1);
        assert.equal(mission.blockedTasks[0].observation.retryable, false);
    } finally { globalThis.JarvisLocalBridge = previous; }
});

test("segmented documents never run two local inferences together", async () => {
    const previous = globalThis.JarvisLocalBridge;
    let active = 0;
    let maximum = 0;
    try {
        globalThis.JarvisLocalBridge = { requestJson: async () => {
            maximum = Math.max(maximum, ++active);
            await new Promise(resolve => setTimeout(resolve, 5));
            active--;
            return { ok: true, message: `${draft}\n${marker}` };
        } };
        await composeTool().execute({ instructions: "Redacta un documento de mínimo 2500 palabras.", format: "md" }, {});
        assert.equal(maximum, 1);
    } finally { globalThis.JarvisLocalBridge = previous; }
});
