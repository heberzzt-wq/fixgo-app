#!/usr/bin/env node
import fs from "node:fs";

function read(path) {
    return fs.readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
}
function ok(condition, message) {
    if (!condition) throw new Error(message);
    console.log(`✅ ${message}`);
}
function no(condition, message) {
    ok(!condition, message);
}

const identity = read("gestia-core/nexo/nexo.identity.js");
const bootstrap = read("modules/terminal/nexo-bootstrap.js");
const marketing = read("gestia-core/jarvis/jarvis.marketing.engine.js");
const brain = read("gestia-core/brain.engine.js");
const semanticLegacy = read("gestia-core/semantic.engine.js");
const compiler = read("gestia-core/nexo/nexo.mission.compiler.js");
const compilerV2 = read("gestia-core/nexo/nexo.mission.compiler.v2.js");
const resilience = read("gestia-core/nexo/nexo.semantic-planner-resilience.js");
const planner = read("gestia-core/jarvis/jarvis.multifunction.planner.js");
const core = read("gestia-core/gestia-core.js");

ok(identity.includes("COMPATIBILITY_CANARY_ONLY"), "identidad NEXO retirada a canario inerte");
ok(identity.includes("active: false"), "NEXO no posee runtime activo");
ok(identity.includes('semanticAuthority: "jarvisSemanticPlan"'), "canario NEXO reconoce autoridad Jarvis");
no(identity.includes("__PENINSULA_PRIVATE_ENGINE__"), "NEXO no publica motor privado paralelo");
ok(planner.includes("jarvisSemanticPlan"), "planner semántico cloud sigue siendo autoridad");
ok(core.includes("SINGLE SEMANTIC BRAIN CONTRACT"), "core declara una sola autoridad semántica");
ok(core.includes("SINGLE_SEMANTIC_BRAIN_FAIL_CLOSED"), "core falla cerrado sin cerebro alterno");

ok(bootstrap.includes("__JARVIS_TERMINAL_BOOTSTRAP__"), "bootstrap activo pertenece a Jarvis");
ok(bootstrap.includes('identity: "JARVIS"'), "bootstrap declara identidad Jarvis");
ok(bootstrap.includes("alternateBrains: 0"), "bootstrap declara cero cerebros alternos");
no(bootstrap.includes("__NEXO_TERMINAL_BOOTSTRAP__"), "NEXO no conserva bootstrap activo");
ok(bootstrap.includes("nexo.real-media.tools.js"), "filename legado conserva herramientas mecánicas reales");
no(bootstrap.includes("nexo.semantic-planner-resilience.js"), "bootstrap no instala fallback semántico");
no(marketing.includes("nexo.semantic-planner-resilience.js"), "marketing no instala fallback semántico");

for (const [name, source, maxBytes] of [
    ["brain", brain, 1600],
    ["semanticLegacy", semanticLegacy, 1200],
    ["compiler", compiler, 1600],
    ["compilerV2", compilerV2, 1800],
    ["resilience", resilience, 1800]
]) {
    ok(source.includes("COMPATIBILITY_CANARY_ONLY"), `${name} quedó como canario inerte`);
    ok(Buffer.byteLength(source, "utf8") <= maxBytes, `${name} quedó acotado en peso`);
    no(/globalThis\.fetch\s*=/.test(source), `${name} no intercepta fetch`);
    no(/compileNexoMission\s*\(/.test(source), `${name} no compila lenguaje localmente`);
    no(/\.match(All)?\s*\(/.test(source), `${name} no clasifica lenguaje por match`);
    no(/\.test\s*\(/.test(source), `${name} no clasifica lenguaje por regex test`);
}

ok(brain.includes("const semanticToolPlan"), "canario brain conserva marker del supervisor");
ok(brain.includes("patchPreviewAllowed: false"), "canario brain conserva marker de seguridad");
ok(compilerV2.includes("NEXO_PAGE_COMPOSITION_BEFORE_ARTIFACT"), "canario compiler conserva marker del supervisor");
ok(resilience.includes("NEXO_SEMANTIC_RECOVERY"), "canario resilience conserva marker del supervisor");

console.log("✅ SINGLE_SEMANTIC_AUTHORITY_CONTRACT_GREEN");
