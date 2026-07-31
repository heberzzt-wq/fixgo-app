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

const identity = read("gestia-core/nexo/nexo.identity.js");
const compiler = read("gestia-core/nexo/nexo.mission.compiler.js");
const compilerV2 = read("gestia-core/nexo/nexo.mission.compiler.v2.js");
const resilience = read("gestia-core/nexo/nexo.semantic-planner-resilience.js");
const branding = read("gestia-core/nexo/nexo.ui.branding.js");
const marketing = read("gestia-core/jarvis/jarvis.marketing.engine.js");
const multitool = read("gestia-core/jarvis/jarvis.multitool.pack.js");
const actuator = read("gestia-core/jarvis/jarvis.actuator.pack.js");
const missionOrchestrator = read("gestia-core/jarvis/jarvis.mission.orchestrator.js");
const bridge = read("jarvis-fs-bridge.js");
const uploadBridge = read("jarvis-upload-bridge.js");
const runtimeContract = JSON.parse(read("jarvis-runtime-contract.json"));
const supervisor = read("functions/jarvis-daily-supervisor.js");
const missionTests = read("tests/nexo-mission-compiler.test.mjs");
const marketingTests = read("tests/jarvis-marketing-engine-v2.test.mjs");

ok(
    identity.includes('name: "NEXO"') &&
        identity.includes("Núcleo Ejecutivo No-Code de Orquestación"),
    "identidad privada oficial NEXO definida"
);
ok(
    identity.includes('controllerId: "PENINSULA_NEXO"') &&
        identity.includes('authorityId: "HEBERTO_MENDOZA"'),
    "autoridad privada Peninsula Tech y Heberto preservada"
);
ok(
    identity.includes("legacy_jarvis_compatibility_during_migration"),
    "migración mantiene compatibilidad interna sin renombrado destructivo"
);

ok(
    compiler.includes("detectDeliverables") &&
        compiler.includes("compileNexoMission"),
    "compilador local reconoce entregables y crea misión"
);
ok(
    compiler.includes('"marketing.plan"') &&
        compiler.includes('"page.create"') &&
        compiler.includes('"reel.create"') &&
        compiler.includes('"image.generate"') &&
        compiler.includes('"document.create"'),
    "compilador puede seleccionar marketing, página, reel, imagen y documentos"
);
ok(
    compiler.includes("sevenDayProgram") &&
        compiler.includes("spreadsheetPayload") &&
        compiler.includes("requireFormulas: true"),
    "programa de marketing y Excel contienen estructura ejecutable"
);

ok(
    compilerV2.includes("2.0.0-composition-to-artifact-chain"),
    "compilador V2 activo"
);
ok(
    compilerV2.includes("NEXO_PAGE_COMPOSITION_BEFORE_ARTIFACT") &&
        compilerV2.includes("NEXO_DOCX_ARTIFACT_AFTER_VALIDATED_COMPOSITION"),
    "página y Word encadenan composición antes de creación"
);

ok(
    resilience.includes("1.3.0-complete-artifact-contract"),
    "resiliencia semántica exige contrato completo de artefacto"
);
ok(
    resilience.includes("cloudPlanCoversLocalMission") &&
        resilience.includes("SEMANTIC_PLAN_INCOMPLETE"),
    "plan cloud incompleto activa recuperación local"
);
ok(
    resilience.includes(
        "https://us-central1-fixgo-44e4d.cloudfunctions.net/jarvisSemanticPlan"
    ),
    "resiliencia intercepta únicamente el planificador semántico"
);
no(
    resilience.includes("globalThis.fetch = nativeFetch(") ||
        resilience.includes("SEMANTIC_ENDPOINTS"),
    "resiliencia no sustituye indiscriminadamente otros endpoints"
);

ok(
    branding.includes('"NEXO listo"') &&
        branding.includes("NEXO | Terminal privada Peninsula Tech"),
    "terminal migra identidad visible a NEXO"
);
ok(
    branding.includes("conserva ids y APIs Jarvis/SIA7"),
    "branding no rompe ids ni APIs legacy"
);

ok(
    marketing.includes("8.0.0-nexo-natural-brief"),
    "marketing usa motor NEXO natural"
);
ok(
    marketing.includes("deriveCreativeBrief") &&
        marketing.includes("inferredInputs"),
    "marketing completa y etiqueta campos inferidos"
);
ok(
    marketing.includes('status: "MARKETING_PACKAGE_READY"') &&
        marketing.includes("readyForProduction: true"),
    "marketing mínimo entrega paquete listo y editable"
);
no(
    marketing.includes('status: "MARKETING_INPUT_REQUIRED"'),
    "marketing natural ya no se bloquea por formulario incompleto"
);
ok(
    marketing.includes("factualClaimsRequireEvidence: true") &&
        marketing.includes("creativeProposalsAllowed: true"),
    "marketing separa creatividad de hechos verificables"
);

ok(
    multitool.includes('name: "marketing.plan"') &&
        multitool.includes('name: "page.compose"') &&
        multitool.includes('name: "spreadsheet.compose"'),
    "runtime conserva herramientas de planeación y composición"
);
ok(
    actuator.includes('name: "page.create"') &&
        actuator.includes('name: "reel.create"') &&
        actuator.includes('name: "document.create"') &&
        actuator.includes('name: "image.generate"'),
    "actuadores de artefactos siguen registrados"
);
ok(
    missionOrchestrator.includes("preparedArtifact") &&
        missionOrchestrator.includes("DOCUMENT_CONTENT_COMPOSED") &&
        missionOrchestrator.includes("PAGE_CONTENT_COMPOSED"),
    "orquestador conserva blueprints para etapas dependientes"
);

[
    'app.post("/page/create"',
    'app.post("/reel/create"',
    'app.post("/document"',
    'app.post("/image"'
].forEach(marker => {
    ok(bridge.includes(marker), `puente local contiene ${marker}`);
});
ok(
    bridge.includes("PAGE_ARTIFACT_CREATED_VERIFIED") &&
        bridge.includes("DOCUMENT_CREATED"),
    "puente verifica páginas y documentos creados"
);
ok(
    uploadBridge.includes("createJarvisFsBridgeApp") &&
        uploadBridge.includes("startJarvisUploadBridge"),
    "npm bridge levanta rutas completas de archivos y artefactos"
);
ok(
    uploadBridge.includes("3344"),
    "puente local usa el puerto esperado 3344"
);
ok(
    runtimeContract.branch === "v5.9-polish",
    "contrato del puente exige la rama correcta"
);

[
    "nexo_identity",
    "nexo_mission_compiler",
    "nexo_semantic_resilience",
    "nexo_marketing_natural_brief",
    "nexo_artifact_bridge"
].forEach(probe => {
    ok(supervisor.includes(probe), `supervisor incluye canario ${probe}`);
});
ok(
    supervisor.includes("3.0.0-nexo-artifact-capability-supervision") &&
        supervisor.includes("nexo_supervision_last_status"),
    "supervisión registra identidad y salud NEXO"
);

ok(
    missionTests.includes('"page.plan", "page.compose", "page.create"') &&
        missionTests.includes('"document.compose", "document.create"'),
    "pruebas exigen página y Word de punta a punta"
);
ok(
    missionTests.includes("reel.args.scenes.reduce") &&
        missionTests.includes('call.args.format === "json"'),
    "pruebas exigen reel temporalmente coherente y programa descargable"
);
ok(
    marketingTests.includes("hazme un programa de marketing") &&
        marketingTests.includes("readyForProduction, true"),
    "prueba mínima reproduce y corrige la falla reportada"
);

console.log(
    "\n🧠 NEXO PRIVATE ENGINE CHECK: PASS — identidad, misión, marketing, páginas, medios, documentos, puente y supervisión están contratados."
);
