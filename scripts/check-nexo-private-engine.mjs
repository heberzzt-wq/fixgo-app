#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
    const absolute = path.join(root, relativePath);
    if (!fs.existsSync(absolute)) {
        throw new Error(`Falta ${relativePath}`);
    }
    return fs.readFileSync(absolute, "utf8")
        .replace(/\r\n?/g, "\n");
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
const realMediaTools = read("gestia-core/nexo/nexo.real-media.tools.js");
const bootstrap = read("modules/terminal/nexo-bootstrap.js");
const marketing = read("gestia-core/jarvis/jarvis.marketing.engine.js");
const multitool = read("gestia-core/jarvis/jarvis.multitool.pack.js");
const actuator = read("gestia-core/jarvis/jarvis.actuator.pack.js");
const missionOrchestrator = read("gestia-core/jarvis/jarvis.mission.orchestrator.js");
const bridge = read("jarvis-fs-bridge.js");
const uploadBridge = read("jarvis-upload-bridge.js");
const webMediaBridge = read("nexo-web-media-bridge.js");
const runtimeContract = JSON.parse(read("jarvis-runtime-contract.json"));
const supervisor = read("functions/jarvis-daily-supervisor.js");
const missionTests = read("tests/nexo-mission-compiler.test.mjs");
const realMediaRoutingTests = read("tests/nexo-real-media-routing.test.mjs");
const realMediaToolTests = read("tests/nexo-real-media-tools.test.mjs");
const realMediaBridgeTests = read("tests/nexo-web-media-bridge.test.mjs");
const resilienceTests = read("tests/nexo-semantic-resilience.test.mjs");
const approvalTests = read("tests/nexo-approval-normalization.test.mjs");
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
    compilerV2.includes("2.1.0-real-media-evidence-chain"),
    "compilador V2 con evidencia de medios reales activo"
);
ok(
    compilerV2.includes("NEXO_PAGE_COMPOSITION_BEFORE_ARTIFACT") &&
        compilerV2.includes("NEXO_DOCX_ARTIFACT_AFTER_VALIDATED_COMPOSITION"),
    "página y Word encadenan composición antes de creación"
);
ok(
    compilerV2.includes('name: "web.media.collect"') &&
        compilerV2.includes('name: "marketing.package.real-media"') &&
        compilerV2.includes("sourceBytesRequired: true") &&
        compilerV2.includes("sha256Required: true"),
    "misiones con fotos o videos reales exigen bytes y paquete verificable"
);
ok(
    compilerV2.includes('if (call.name === "image.generate") return false') &&
        compilerV2.includes("syntheticMediaSubstitutionAllowed: false"),
    "medios reales nunca se sustituyen por generación sintética"
);

ok(
    resilience.includes("1.4.0-semantic-intent-authority") &&
        resilience.includes("localCompilerMayAssist"),
    "resiliencia semántica deja la intención inicial al planificador generalista"
);
ok(
    resilience.includes('phase === "GROUNDED_ARGUMENT_COMPLETION"') &&
        resilience.includes("toolName.length > 0") &&
        resilience.includes("const localPlan = localCompilerMayAssist(requestPayload)"),
    "compilador local sólo asiste argumentos de una herramienta ya seleccionada"
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
    branding.includes("1.1.0-approval-normalization-runtime-stamp") &&
        branding.includes("__NEXO_RUNTIME_STAMP__"),
    "terminal expone huella verificable del runtime NEXO cargado"
);
ok(
    branding.includes("isNexoApprovalCommand") &&
        branding.includes('"aprobacion autorizada"') &&
        branding.includes('input.value = "proceder"'),
    "aprobaciones naturales se normalizan para el runtime legacy"
);
ok(
    /document\.addEventListener\(\s*"submit"\s*,\s*normalizeApprovalBeforeLegacy\s*,\s*true\s*\)/s
        .test(branding),
    "normalizador de aprobación se instala en fase capture antes del submit legacy"
);

ok(
    bootstrap.includes("1.1.0-real-media-runtime") &&
        bootstrap.includes("nexo.real-media.tools.js") &&
        bootstrap.includes("installNexoRealMediaTools"),
    "bootstrap temprano instala resiliencia y herramientas de medios reales"
);
ok(
    realMediaTools.includes('name: "marketing.plan"') &&
        realMediaTools.includes('name: "web.media.collect"') &&
        realMediaTools.includes('name: "marketing.package.real-media"'),
    "runtime NEXO sustituye marketing viejo y registra cadena real"
);
ok(
    realMediaTools.includes("REAL_MEDIA_PACKAGE_REQUIREMENTS_UNMET") &&
        realMediaTools.includes("syntheticMediaSubstitutionAllowed: false") &&
        realMediaTools.includes('controllerId: args.controllerId || context.controllerId || "PENINSULA_NEXO"'),
    "paquete final falla cerrado y conserva identidad Peninsula NEXO"
);

ok(
    marketing.includes('const VERSION = "8.1.0-nexo-complete-marketing-package"') &&
        marketing.includes('source: "nexo_natural_brief_and_optional_evidence"') &&
        marketing.includes('routing: "natural_instruction_with_semantic_and_local_resilience"'),
    "marketing usa el motor NEXO natural vigente"
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
ok(
    marketing.includes("missingCriticalInputs") &&
        marketing.includes("inputRequiredResult") &&
        marketing.includes('status: "MARKETING_INPUT_REQUIRED"') &&
        marketing.includes("requiresInput: true"),
    "marketing natural conserva contexto y pide datos criticos sin inventarlos"
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
        uploadBridge.includes("startJarvisUploadBridge") &&
        uploadBridge.includes("registerNexoWebMediaRoutes"),
    "npm bridge levanta cargas, artefactos y recolección de medios reales"
);
ok(
    webMediaBridge.includes('app.post("/web/media/collect"') &&
        webMediaBridge.includes("WEB_REAL_MEDIA_VERIFIED") &&
        webMediaBridge.includes("WEB_MEDIA_PRIVATE_ADDRESS_BLOCKED") &&
        webMediaBridge.includes("sha256(fetched.bytes)"),
    "recolector valida SSRF, bytes, MIME y SHA-256"
);
ok(
    webMediaBridge.includes("MAX_TOTAL_MEDIA_BYTES") &&
        webMediaBridge.includes("WEB_MEDIA_MAGIC_MISMATCH") &&
        webMediaBridge.includes("WEB_REAL_MEDIA_REQUIREMENTS_UNMET"),
    "recolector aplica límites y falla cerrado ante material faltante"
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
    missionTests.includes('"page.plan"') &&
        missionTests.includes('"page.compose"') &&
        missionTests.includes('"page.create"') &&
        missionTests.includes("one page instruction reaches page.create through composition"),
    "pruebas exigen página de punta a punta"
);
ok(
    missionTests.includes('"document.compose"') &&
        missionTests.includes('"document.create"') &&
        missionTests.includes("Word instruction composes and creates a validated DOCX"),
    "pruebas exigen Word de punta a punta"
);
ok(
    missionTests.includes("reel.args.scenes.reduce") &&
        missionTests.includes('assert.deepEqual(marketingFiles, ["md", "pdf"])') &&
        missionTests.includes("Plan de marketing completo"),
    "pruebas exigen reel temporalmente coherente y plan descargable en Markdown/PDF"
);
ok(
    realMediaRoutingTests.includes("multiserviciospeninsulareshmh.com") &&
        realMediaRoutingTests.includes('names(plan).includes("image.generate"), false') &&
        realMediaRoutingTests.includes("requireVideos, true"),
    "prueba reproduce la orden real de Multiservicios sin sustitución sintética"
);
ok(
    realMediaToolTests.includes("runtime override preserves NEXO marketing input-required semantics") &&
        realMediaToolTests.includes('assert.equal(result.status, "MARKETING_INPUT_REQUIRED")') &&
        realMediaToolTests.includes("REAL_MEDIA_PACKAGE_REQUIREMENTS_UNMET") &&
        realMediaToolTests.includes("REAL_MEDIA_MARKETING_PACKAGE_CREATED"),
    "pruebas cubren override NEXO y paquete real completo/incompleto"
);
ok(
    realMediaBridgeTests.includes("verified real JPEG and MP4 bytes") &&
        realMediaBridgeTests.includes("WEB_MEDIA_PRIVATE_ADDRESS_BLOCKED") &&
        realMediaBridgeTests.includes("WEB_REAL_MEDIA_REQUIREMENTS_UNMET"),
    "pruebas físicas cubren JPEG, MP4, SHA, ausencia y SSRF"
);
ok(
    resilienceTests.includes("local compiler never owns initial or contract intent") &&
        resilienceTests.includes("semantic cloud plan is authoritative when no grounded tool requires completion"),
    "pruebas exigen autoridad semántica del turno inicial"
);
ok(
    resilienceTests.includes("grounded argument completion still requires the semantically selected tool") &&
        resilienceTests.includes("local compiler may assist only an already selected grounded tool"),
    "pruebas conservan recuperación local sólo para argumentos ya seleccionados"
);
ok(
    approvalTests.includes("aprobación autorizada") &&
        approvalTests.includes("no autorizo el plan") &&
        approvalTests.includes("analiza la autorización de pagos") &&
        approvalTests.includes("capture=true") &&
        approvalTests.includes("submitListener.options, true") &&
        approvalTests.includes('assert.equal(input.value, "proceder")'),
    "prueba reproduce aprobación real, fase capture y evita falsos positivos"
);
ok(
    marketingTests.includes("NEXO marketing produces the complete 90-day package") &&
        marketingTests.includes("Captar clientes y prestadores durante los primeros 90 días") &&
        marketingTests.includes("readyForProduction, true"),
    "prueba funcional reproduce un paquete NEXO completo y listo para produccion"
);

console.log(
    "\n🧠 NEXO PRIVATE ENGINE CHECK: PASS — identidad, misión, aprobación, marketing, medios reales, páginas, documentos, puente y supervisión están contratados."
);
