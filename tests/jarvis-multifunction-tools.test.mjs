import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
    describeJarvisMultifunctionTools,
    registerJarvisMultifunctionTools
} from "../gestia-core/jarvis/jarvis.multitool.pack.js";

import {
    buildJarvisMultifunctionToolCalls,
    describeJarvisMultifunctionPlanner,
    isJarvisCapabilityForensicsRequest,
    isJarvisTechnicalDiagnosticRequest,
    mergeJarvisToolCalls
} from "../gestia-core/jarvis/jarvis.multifunction.planner.js";

import {
    resolveGestiaRole,
    resolveGestiaRouteDecision
} from "../gestia-core/auth/role-authority.js";

import {
    normalizeImageArtifactOutput
} from "../gestia-core/jarvis/jarvis.actuator.pack.js";

const __dirname =
    path.dirname(
        fileURLToPath(import.meta.url)
    );

test("image artifact output accepts only a compatible safe local path", () => {
    assert.equal(
        normalizeImageArtifactOutput(
            ".jarvis-artifacts/images/escudo.jpg",
            "image/jpeg"
        ),
        ".jarvis-artifacts/images/escudo.jpg"
    );
    assert.equal(
        normalizeImageArtifactOutput(
            "genera y guarda la imagen",
            "image/jpeg"
        ),
        undefined
    );
    assert.equal(
        normalizeImageArtifactOutput(
            ".jarvis-artifacts/images/../escape.jpg",
            "image/jpeg"
        ),
        undefined
    );
    assert.equal(
        normalizeImageArtifactOutput(
            ".jarvis-artifacts/images/escudo.png",
            "image/jpeg"
        ),
        undefined
    );
});

function createRuntime() {
    const registry =
        new Map();

    return {
        register(tool) {
            registry.set(tool.name, tool);
            return {
                ok: true,
                tool: tool.name
            };
        },
        has(name) {
            return registry.has(name);
        },
        list() {
            return [...registry.values()].map(tool => ({
                name: tool.name,
                mutates: tool.mutates === true,
                requiresApproval: tool.requiresApproval === true
            }));
        },
        async execute(name, args = {}, context = {}) {
            const tool = registry.get(name);
            if (!tool) return { ok: false, error: "TOOL_NOT_FOUND" };
            return await tool.execute(args, context);
        }
    };
}

const semanticPlannerCatalog = [
    ["conversation.respond", false],
    ["system.health", false],
    ["system.supervision", false],
    ["system.supervision.runNow", true],
    ["system.forensics", false],
    ["web.research", false],
    ["browser.inspect", false],
    ["image.generate", false],
    ["document.create", true],
    ["connector.list", false],
    ["agent.delegate", false],
    ["page.plan", false],
    ["marketing.plan", false],
    ["media.analyze", false],
    ["business.assist", false],
    ["repo.search", false],
    ["repo.read", false],
    ["repo.diagnose", false]
].map(([name, mutates]) => ({
    name,
    description: `Herramienta runtime ${name}`,
    mutates,
    requiresApproval: mutates
}));

async function planWithModel(input, toolCalls, { approved = false } = {}) {
    return await buildJarvisMultifunctionToolCalls(input, {
        approved,
        toolCatalog: semanticPlannerCatalog,
        semanticPlanner: async () => ({
            ok: true,
            status: "SEMANTIC_PLAN_READY",
            provider: "test-model",
            model: "semantic-test",
            toolCalls
        })
    });
}

test("multifunction pack registers certification and remains read-only", () => {
    const runtime =
        createRuntime();

    const result =
        registerJarvisMultifunctionTools(runtime);

    assert.equal(result.ok, true);
    assert.deepEqual(result.tools, [
        "conversation.respond",
        "system.capabilities",
        "system.forensics",
        "system.health",
        "system.certify",
        "system.supervision",
        "web.research",
        "business.assist",
        "marketing.plan",
        "page.plan",
        "media.analyze"
    ]);

    assert.equal(
        runtime.list().every(tool => tool.mutates === false),
        true
    );
});

test("business assistant uses the semantic model when a real company is outside the static registry", async () => {
    const previousAuth = globalThis.auth;
    const previousFetch = globalThis.fetch;
    const previousMemory = globalThis.JarvisToolMemory;
    let semanticRequest = null;
    globalThis.auth = { currentUser: null };
    const authTimer = setTimeout(() => {
        globalThis.auth.currentUser = {
            getIdToken: async () => "test-token"
        };
    }, 120);
    globalThis.JarvisToolMemory = {
        last: () => ({
            data: {
                grounded: true,
                query: "Multiservicios Peninsulares HMH",
                answer: "Empresa de mantenimiento y remodelacion con servicios publicados.",
                sources: [{
                    title: "Sitio oficial MPH",
                    url: "https://multiserviciospeninsulareshmh.com/"
                }]
            }
        })
    };
    globalThis.fetch = async (_url, options) => {
        semanticRequest = JSON.parse(options.body);
        return ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
            result: {
                ok: true,
                status: "SEMANTIC_RESPONSE_READY",
                provider: "test-provider",
                model: "test-model",
                message: "Propuesta B2B basada en mantenimiento verificable, con riesgos y siguientes acciones."
            }
        })
    });
    };

    try {
        const runtime = createRuntime();
        registerJarvisMultifunctionTools(runtime);
        const result = await runtime.execute("business.assist", {
            prompt: "Define una propuesta de valor B2B para MPH sin inventar datos"
        });
        assert.equal(result.ok, true);
        assert.equal(result.status, "BUSINESS_ADVISORY_READY");
        assert.equal(result.source, "BUSINESS_SEMANTIC_MODEL");
        assert.equal(result.factsPolicy, "NO_INVENTED_FACTS");
        assert.doesNotMatch(result.message, /falta objetivo/i);
        assert.match(semanticRequest?.data?.input || "", /Sitio oficial MPH/);
        assert.match(semanticRequest?.data?.input || "", /mantenimiento y remodelacion/);
        assert.ok((semanticRequest?.data?.input || "").length <= 1580);
    } finally {
        clearTimeout(authTimer);
        globalThis.auth = previousAuth;
        globalThis.fetch = previousFetch;
        globalThis.JarvisToolMemory = previousMemory;
    }
});

test("capability forensics reports evidence-backed gaps without claiming Codex parity", async () => {
    const previousBridge = globalThis.JarvisLocalBridge;
    const previousWebHealth =
        globalThis.__JARVIS_WEB_RESEARCH_HEALTH__;
    delete globalThis.__JARVIS_WEB_RESEARCH_HEALTH__;
    globalThis.JarvisLocalBridge = {
        verifyIdentity: async () => ({
            ok: true,
            status: "BRIDGE_IDENTITY_OK",
            bridgeRoot: "C:/repo"
        })
    };

    try {
        const runtime = createRuntime();
        registerJarvisMultifunctionTools(runtime);

        const result = await runtime.execute("system.forensics");

        assert.equal(result.ok, true);
        assert.equal(result.parity.canClaimParity, false);
        assert.equal(result.parity.policy, "EVIDENCE_ONLY");
        assert.ok(result.readinessScore >= 0 && result.readinessScore <= 100);
        assert.equal(
            result.capabilities.find(item => item.id === "browser_control")?.status,
            "NOT_AVAILABLE"
        );
        assert.equal(
            result.capabilities.find(item => item.id === "web_research")?.status,
            "PARTIAL"
        );
        assert.ok(result.gaps.some(item => item.id === "web_research"));
        assert.ok(result.gaps.some(item => item.id === "image_generation"));
        assert.equal(
            result.capabilities.find(item => item.id === "professional_pdf_editing")?.status,
            "NOT_AVAILABLE"
        );
        assert.equal(
            result.capabilities.find(item => item.id === "reel_video_production")?.status,
            "NOT_AVAILABLE"
        );
        assert.ok(result.gaps.some(item => item.id === "professional_pdf_editing"));
        assert.ok(result.gaps.some(item => item.id === "structured_document_editing"));
        assert.ok(result.gaps.some(item => item.id === "persistent_cases"));
        assert.equal(result.runtime.registeredTools, result.runtime.tools.length);
        assert.ok(result.runtime.tools.includes("system.forensics"));
        assert.equal(
            result.capabilities.find(item => item.id === "repo_engineering")?.label,
            "Ingenieria del repositorio"
        );

        globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ = {
            ok: true,
            grounded: true,
            status: "GROUNDED",
            sourceCount: 3,
            checkedAt:
                "2026-07-14T01:00:00.000Z"
        };

        const verified =
            await runtime.execute("system.forensics");
        const verifiedWeb =
            verified.capabilities.find(
                item => item.id === "web_research"
            );

        assert.equal(verifiedWeb.status, "READY");
        assert.equal(verifiedWeb.evidence.verified, true);
        assert.equal(verifiedWeb.evidence.sourceCount, 3);
        assert.ok(!verified.gaps.some(item => item.id === "web_research"));

        const capabilities = await runtime.execute("system.capabilities");
        assert.equal(capabilities.readiness.parity.canClaimParity, false);
        assert.ok(Array.isArray(capabilities.readiness.gaps));
    }
    finally {
        globalThis.JarvisLocalBridge = previousBridge;
        if (previousWebHealth === undefined) {
            delete globalThis.__JARVIS_WEB_RESEARCH_HEALTH__;
        }
        else {
            globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ =
                previousWebHealth;
        }
    }
});

test("capability forensics explains partial repo and test actuators when bridge identity fails", async () => {
    const previousBridge = globalThis.JarvisLocalBridge;
    globalThis.JarvisLocalBridge = {
        verifyIdentity: async () => ({
            ok: false,
            status: "BRIDGE_IDENTITY_MISMATCH"
        })
    };

    try {
        const runtime = createRuntime();

        for (const name of [
            "repo.read",
            "repo.grep",
            "repo.diagnose",
            "repo.graph",
            "repo.rankCandidates",
            "repo.prepareWrite",
            "repo.authorizeWrite",
            "repo.write",
            "tests.run",
            "repo.gitStatus"
        ]) {
            runtime.register({
                name,
                execute: async () => ({ ok: true })
            });
        }

        registerJarvisMultifunctionTools(runtime);
        const result = await runtime.execute("system.forensics");
        const repo = result.capabilities.find(item => item.id === "repo_engineering");
        const testsAndGit = result.capabilities.find(item => item.id === "tests_and_git");

        assert.equal(repo.status, "PARTIAL");
        assert.equal(repo.evidence.toolsReady, true);
        assert.equal(repo.evidence.bridgeReady, false);
        assert.match(repo.reason, /bridge local no verifico identidad/i);
        assert.equal(testsAndGit.status, "PARTIAL");
        assert.match(testsAndGit.nextAction, /estado Git/i);
    }
    finally {
        globalThis.JarvisLocalBridge = previousBridge;
    }
});

test("capability forensics distinguishes a deployed scheduler from a completed daily run", async () => {
    const runtime = createRuntime();
    registerJarvisMultifunctionTools(runtime);

    runtime.register({
        name: "system.supervision",
        mutates: false,
        requiresApproval: false,
        execute: async () => ({
            ok: true,
            source: "JARVIS_DAILY_SUPERVISOR",
            status: "PENDING_FIRST_RUN",
            scheduledAt: "04:15 America/Cancun",
            liveProbe: {
                status: "HEALTHY"
            }
        })
    });

    const pending =
        await runtime.execute("system.forensics");
    const pendingCapability =
        pending.capabilities.find(
            item => item.id === "daily_supervision"
        );

    assert.equal(pendingCapability.status, "PARTIAL");
    assert.equal(pendingCapability.evidence.cloudEndpoint, true);
    assert.equal(pendingCapability.evidence.scheduleDeclared, true);
    assert.equal(pendingCapability.evidence.scheduledRun, false);
    assert.match(pendingCapability.reason, /falta evidencia de la primera ejecucion diaria/i);
    assert.ok(
        pending.priorities.some(priority =>
            priority.includes("04:15 America/Cancun")
        )
    );

    runtime.register({
        name: "system.supervision",
        mutates: false,
        requiresApproval: false,
        execute: async () => ({
            ok: true,
            source: "JARVIS_DAILY_SUPERVISOR",
            status: "HEALTHY",
            reportId: "2026-07-14",
            startedAtIso: "2026-07-14T09:15:00.000Z",
            liveProbe: {
                status: "HEALTHY"
            }
        })
    });

    const completed =
        await runtime.execute("system.forensics");
    const completedCapability =
        completed.capabilities.find(
            item => item.id === "daily_supervision"
        );

    assert.equal(completedCapability.status, "READY");
    assert.equal(completedCapability.evidence.scheduledRun, true);
    assert.equal(completedCapability.evidence.reportId, "2026-07-14");
    assert.ok(
        !completed.gaps.some(gap =>
            gap.id === "daily_supervision"
        )
    );
});

test("Jarvis answers casual conversation through the real semantic model", async () => {
    const previousAuth = globalThis.auth;
    const previousFetch = globalThis.fetch;
    globalThis.auth = { currentUser: { getIdToken: async () => "test-token" } };
    globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
            result: {
                ok: true,
                status: "SEMANTIC_RESPONSE_READY",
                provider: "pollinations",
                model: "semantic-test",
                message: "Buenos días, pariente. ¿Qué armamos hoy?"
            }
        })
    });

    const runtime = createRuntime();
    registerJarvisMultifunctionTools(runtime);

    const result = await runtime.execute(
        "conversation.respond",
        {
            prompt: "buenos dias jarvis, se me antoja una tecate"
        }
    );

    assert.equal(result.ok, true);
    assert.equal(result.provider, "pollinations");
    assert.equal(result.model, "semantic-test");
    assert.match(result.message, /Buenos días/);

    const calls = await planWithModel(
        "buenos dias jarvis, se me antoja una tecate",
        [{ name: "conversation.respond", args: { prompt: "buenos dias jarvis" } }]
    );

    assert.equal(calls[0]?.name, "conversation.respond");
    assert.equal(calls[0]?.mutates, false);

    globalThis.auth = previousAuth;
    globalThis.fetch = previousFetch;
});

test("system health reports a real bridge identity mismatch as degraded", async () => {
    const previousBridge =
        globalThis.JarvisLocalBridge;

    globalThis.JarvisLocalBridge = {
        verifyIdentity: async () => ({
            ok: false,
            status: "BRIDGE_IDENTITY_MISMATCH",
            bridgeRoot: "C:/wrong/repo"
        })
    };

    try {
        const runtime = createRuntime();
        registerJarvisMultifunctionTools(runtime);

        const result =
            await runtime.execute(
                "system.health"
            );

        assert.equal(result.ok, false);
        assert.equal(result.status, "DEGRADED");
        assert.ok(
            result.failures.includes(
                "BRIDGE_IDENTITY_MISMATCH"
            )
        );
        assert.equal(
            result.runtime.bridgeRoot,
            "C:/wrong/repo"
        );
    }
    finally {
        globalThis.JarvisLocalBridge =
            previousBridge;
    }
});

test("terminal direct router exposes every registered multifunction namespace", () => {
    const terminal = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "gestia-terminal.html"
        ),
        "utf8"
    );

    assert.match(
        terminal,
        /repo\|tests\|codex\|system\|conversation\|business\|marketing\|page\|media\|web/
    );
    assert.match(terminal, /"web\.research":\s*\{/);
    assert.match(
        terminal,
        /formatTerminalToolPayload/
    );
    assert.match(terminal, /Preparacion real:/);
    assert.match(terminal, /Aprobadas:/);
    assert.match(terminal, /Estado Git:/);
});

test("browser runtime fails closed on bridge identity and avoids dead cloud planner", () => {
    const toolsRuntime = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "gestia-core",
            "tools.runtime.js"
        ),
        "utf8"
    );

    const brain = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "gestia-core",
            "brain.engine.js"
        ),
        "utf8"
    );

    assert.match(
        toolsRuntime,
        /BRIDGE_IDENTITY_MISMATCH/
    );
    assert.match(
        toolsRuntime,
        /"X-Jarvis-Release-Id"/
    );
    assert.match(
        toolsRuntime,
        /args\.script \|\|\s*"test"/
    );
    assert.match(
        brain,
        /TOOL_PLANNER_ENABLED:\s*false/
    );
    assert.match(
        toolsRuntime,
        /name:\s*\n\s*"repo\.write"[\s\S]{0,260}requiresApproval:\s*\n\s*true/
    );
    assert.doesNotMatch(
        toolsRuntime,
        /isDryRun !== true &&[\s\S]{0,140}args\?\.approved/
    );
});

test("terminal unlocks, queues and recovers Jarvis speech", () => {
    const terminal = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "gestia-terminal.html"
        ),
        "utf8"
    );
    assert.match(terminal, /window\.unlockJarvisVoice/);
    assert.match(terminal, /JARVIS_VOICE_QUEUED/);
    assert.match(terminal, /JARVIS_VOICE_WATCHDOG_RESUME/);
    assert.match(terminal, /__JARVIS_TTS_ACTIVE_UTTERANCE__/);
});

test("semantic model planner replaces phrase gates and preserves terminal speech", () => {
    const core = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "gestia-core",
            "gestia-core.js"
        ),
        "utf8"
    );
    const terminal = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "gestia-terminal.html"
        ),
        "utf8"
    );
    const planner = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "jarvis", "jarvis.multifunction.planner.js"),
        "utf8"
    );

    assert.match(core, /await buildJarvisMultifunctionToolCalls/);
    assert.match(core, /lightMultifunctionCalls\.length === 1/);
    assert.match(core, /model_selected_conversation/);
    assert.doesNotMatch(core, /hasExplicitOperationalRequest/);
    assert.doesNotMatch(core, /isExplicitCasualSocialRequest/);
    assert.match(planner, /jarvisSemanticPlan/);
    assert.match(planner, /trustedPlanCalls/);
    assert.doesNotMatch(planner, /\.test\(/);
    assert.doesNotMatch(planner, /new RegExp/);
    assert.doesNotMatch(planner, /ACTION_MAP|ENTITY_MAP|STOPWORDS/);
    assert.match(terminal, /jarvisSemanticRespond/);
    assert.doesNotMatch(terminal, /canAnswerCasualTerminalLocally/);
    assert.doesNotMatch(terminal, /findLocalTerminalExplanation/);
    assert.doesNotMatch(terminal, /localExplanations/);
    assert.match(terminal, /await window\.consultarCerebroIA\(comando\)/);
    assert.match(terminal, /await window\.hablarJarvis\?\.\(\s*casualResponse/);
    assert.match(terminal, /window\.showJarvis\?\.\(\s*"Sistema listo"/);
});

test("multifunction tools create marketing and page proposals without write authority", async () => {
    const runtime =
        createRuntime();

    registerJarvisMultifunctionTools(runtime);

    const marketing =
        await runtime.execute(
            "marketing.plan",
            {
                prompt: "crea marketing para Instagram con reel y landing",
                brandName: "FixGo"
            },
            {
                analysisId: "MULTI-MKT-1"
            }
        );

    assert.equal(marketing.ok, true);
    assert.equal(marketing.domain, "marketing");
    assert.equal(marketing.approval.publishAllowed, false);
    assert.ok(marketing.assets.includes("reel"));

    const page =
        await runtime.execute(
            "page.plan",
            {
                prompt: "crea pagina oficial para FixGo",
                pageName: "FixGo Oficial",
                title: "FixGo"
            },
            {
                analysisId: "MULTI-PAGE-1"
            }
        );

    assert.equal(page.ok, true);
    assert.equal(page.page.fileName, "fixgo-oficial.html");
    assert.equal(page.outputContract.writeAllowed, false);
    assert.equal(page.outputContract.deployAllowed, false);
});

test("multifunction media analysis preserves source trace and stays advisory", async () => {
    const runtime =
        createRuntime();

    registerJarvisMultifunctionTools(runtime);

    const analysis =
        await runtime.execute(
            "media.analyze",
            {
                prompt: "analiza este reporte",
                mimeType: "application/pdf",
                sourceName: "reporte.pdf",
                pages: [
                    {
                        pageNumber: 1,
                        text: "Incidencia resuelta con evidencia."
                    }
                ],
                questions: [
                    "Que se resolvio?"
                ]
            },
            {
                analysisId: "MULTI-MEDIA-1"
            }
        );

    assert.equal(analysis.ok, true);
    assert.equal(analysis.source.sourceName, "reporte.pdf");
    assert.equal(analysis.policy.advisoryOnly, true);
    assert.equal(analysis.policy.mayAuthorizeWrite, false);
});

test("multifunction media analysis consumes a complete 30-file persisted manifest", async () => {
    const previousAuth = globalThis.auth;
    const previousBridge = globalThis.JarvisLocalBridge;
    const previousFetch = globalThis.fetch;
    const runtime = createRuntime();
    registerJarvisMultifunctionTools(runtime);
    const attachments = Array.from({ length: 30 }, (_, index) => ({
        name: `evidencia-${index + 1}.png`,
        mimeType: "image/png",
        bytes: 1024,
        artifact: `.jarvis-artifacts/uploads/evidencia-${index + 1}.png`,
        sha256: String(index + 1).padStart(64, "0")
    }));
    try {
        globalThis.auth = { currentUser: { getIdToken: async () => "token" } };
        globalThis.JarvisLocalBridge = {
            requestJson: async () => ({
                ok: true,
                dataBase64: "iVBORw0KGgo=",
                mimeType: "image/png",
                bytes: 8,
                fileName: "evidencia.png"
            })
        };
        globalThis.fetch = async (_url, options) => {
            const request = JSON.parse(options.body);
            const files = request.data.files;
            return {
                ok: true,
                json: async () => ({
                    result: {
                        ok: true,
                        status: "MEDIA_ANALYSIS_GROUNDED",
                        sources: files.map(file => ({ name: file.name, evidence: [{ observation: "byte real" }]})),
                        policy: { readOnly: true, illegibleContentMustRemainUnknown: true }
                    }
                })
            };
        };
        const analysis = await runtime.execute("media.analyze", {
            prompt: "clasifica las 30 evidencias",
            attachments
        }, { analysisId: "MULTI-MEDIA-30" });

        assert.equal(analysis.ok, true);
        assert.equal(analysis.receivedFiles, 30);
        assert.equal(analysis.analyzedFiles, 8);
        assert.equal(analysis.persistedArtifacts.length, 30);
        assert.equal(analysis.status, "MEDIA_ANALYSIS_GROUNDED");
    } finally {
        globalThis.auth = previousAuth;
        globalThis.JarvisLocalBridge = previousBridge;
        globalThis.fetch = previousFetch;
    }
});

test("multifunction planner accepts model-selected bounded read-only tools", async () => {
    const calls =
        await planWithModel(
            "Jarvis, crea una landing y marketing con reels para Instagram",
            [
                { name: "page.plan", args: { brandName: "FixGo" } },
                { name: "marketing.plan", args: { brandName: "FixGo" } }
            ]
        );

    assert.deepEqual(
        calls.map(call => call.name),
        [
            "page.plan",
            "marketing.plan"
        ]
    );

    assert.equal(
        calls.every(call => call.mutates === false),
        true
    );

    assert.equal(
        calls.every(call => call.approved === false),
        true
    );
});

test("multifunction planner preserves every mixed command selected by the model", async () => {
    const calls =
        await planWithModel(
            "Jarvis, analisa este PDF y crea una landing responsive",
            [
                { name: "page.plan", args: {} },
                { name: "media.analyze", args: {} }
            ]
        );

    assert.deepEqual(
        calls.map(call => call.name),
        [
            "page.plan",
            "media.analyze"
        ]
    );

    assert.equal(
        calls.every(call => call.mutates === false),
        true
    );

    assert.deepEqual(
        (await planWithModel(
            "Jarvis, reviza el sistema y dime si esta sano",
            [{ name: "system.health", args: {} }]
        )).map(call => call.name),
        [
            "system.health"
        ]
    );
});

test("terminal preserves operational tools when a mixed command also contains a greeting", () => {
    const terminal = fs.readFileSync(
        path.join(__dirname, "..", "gestia-terminal.html"),
        "utf8"
    );

    assert.match(terminal, /const hasOperationalObservation\s*=/);
    assert.match(
        terminal,
        /conversationObservation\s*&&\s*!hasOperationalObservation/
    );
    assert.match(terminal, /Evidencia ejecutada:/);
    assert.match(
        terminal,
        /finalResponse\?\.text\s*\?\s*\[\]\s*:\s*\[/
    );
    assert.match(terminal, /new Set\(/);
    assert.doesNotMatch(terminal, /\.slice\(0, 8000\)/);
});

test("technical final response correlates initial and follow-up observations", () => {
    const core = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "gestia-core.js"),
        "utf8"
    );

    assert.match(
        core,
        /followUpObservations:\s*\[\s*\.\.\.toolObservations,\s*\.\.\.followUpObservations\s*\]/
    );
    assert.match(core, /new Map\([\s\S]{0,700}learningHints\?\.lessons/);
});

test("runtime role authority never invents a temporary client role", () => {
    const runtime = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "gestia.runtime.v7.js"),
        "utf8"
    );

    assert.deepEqual(
        resolveGestiaRole(
            {
                email: "HEBERTOH-M@HOTMAIL.COM"
            },
            {}
        ),
        {
            role: "admin",
            roleReal: "admin",
            source: "master_identity",
            resolved: true
        }
    );
    assert.equal(
        resolveGestiaRole(
            {
                email: "sin-perfil@example.com"
            },
            {}
        ).role,
        null
    );
    assert.equal(
        resolveGestiaRole({}, { rol: "tecnico_gp" }).role,
        "tecnico"
    );
    assert.equal(
        resolveGestiaRole({}, { rol: "asistente_admin" }).role,
        "b2b_admin"
    );
    assert.match(runtime, /\[AUTH_ROLE_UNRESOLVED\]/);
    assert.match(runtime, /\[SURFACE_GUARD_ROLE_PENDING\]/);
    assert.match(runtime, /resolveGestiaRouteDecision/);
    assert.match(runtime, /resolveCanonicalRouteDecision/);
    assert.match(runtime, /routeDecision\.reason/);
    assert.doesNotMatch(runtime, /GestiaRuntime\.routes\s*=/);
    assert.doesNotMatch(runtime, /resolveHomeRoute/);
    assert.doesNotMatch(runtime, /validateSurfaceAccess/);
    assert.doesNotMatch(
        runtime,
        /let role\s*=\s*"cliente";[\s\S]{0,80}let roleReal\s*=\s*"cliente";/
    );
});

test("private surfaces stay covered until authentication and role settle", () => {
    const appMain = fs.readFileSync(
        path.join(__dirname, "..", "app-main.js"),
        "utf8"
    );

    assert.match(appMain, /function isCurrentSurfacePublic\(\)/);
    assert.match(appMain, /classList\s*\.add\("gestia-auth-pending"\)/);
    assert.match(appMain, /classList\s*\.remove\("gestia-auth-pending"\)/);
    assert.match(
        appMain,
        /if \(isCurrentSurfacePublic\(\)\) \{[\s\S]{0,160}revealUI\(\);[\s\S]{0,120}else \{[\s\S]{0,120}VALIDANDO PERFIL/
    );

    for (const file of ["admin.html", "cliente.html", "tecnico.html", "ceo.html"]) {
        const surface = fs.readFileSync(
            path.join(__dirname, "..", file),
            "utf8"
        );

        assert.match(surface, /<html[^>]+class="gestia-auth-pending"/);
        assert.match(
            surface,
            /html\.gestia-auth-pending body > :not\(#fortressLoader\)/
        );
    }
});

test("role authority produces deterministic route decisions for every main role", () => {
    assert.deepEqual(
        resolveGestiaRouteDecision({
            user: {
                email: "hebertoh-m@hotmail.com"
            },
            pathname: "/cliente.html"
        }).target,
        "admin.html"
    );

    assert.equal(
        resolveGestiaRouteDecision({
            metadata: {
                rol: "admin"
            },
            pathname: "/ceo.html"
        }).redirect,
        false
    );

    assert.equal(
        resolveGestiaRouteDecision({
            metadata: {
                rol: "tecnico_gp",
                sub_type: "saas"
            },
            pathname: "/cliente.html"
        }).target,
        "tecnico-b2b.html"
    );

    assert.equal(
        resolveGestiaRouteDecision({
            metadata: {
                rol: "admin_b2b"
            },
            pathname: "/login.html"
        }).target,
        "panel-b2b-admin.html"
    );

    assert.equal(
        resolveGestiaRouteDecision({
            metadata: {},
            pathname: "/login.html"
        }).reason,
        "role_unresolved"
    );

    assert.equal(
        resolveGestiaRouteDecision({
            metadata: {
                rol: "cliente"
            },
            pathname: "/admin.html"
        }).target,
        "cliente.html"
    );

    const adminLoginDecision =
        resolveGestiaRouteDecision({
            user: {
                email: "hebertoh-m@hotmail.com"
            },
            pathname: "/login.html"
        });

    const adminLandingDecision =
        resolveGestiaRouteDecision({
            user: {
                email: "hebertoh-m@hotmail.com"
            },
            pathname: `/${adminLoginDecision.target}`
        });

    assert.equal(adminLoginDecision.target, "admin.html");
    assert.equal(adminLandingDecision.redirect, false);
    assert.notEqual(adminLoginDecision.target, "cliente.html");

    for (const pathname of ["/gestia-terminal.html", "/ceo.html"]) {
        assert.equal(
            resolveGestiaRouteDecision({
                user: {
                    email: "hebertoh-m@hotmail.com"
                },
                pathname
            }).redirect,
            false,
            pathname
        );
    }

    const firebase = fs.readFileSync(
        path.join(__dirname, "..", "firebase.js"),
        "utf8"
    );

    assert.match(firebase, /resolveGestiaRouteDecision/);
    assert.match(firebase, /\[ROLE_AUTHORITY_REDIRECT\]/);
    assert.match(firebase, /window\.location\.replace/);

    const observerSection = firebase.slice(
        firebase.indexOf("export function observarAuth"),
        firebase.indexOf("export async function validarClaveB2B")
    );

    assert.doesNotMatch(observerSection, /verificarYRedireccionar\(/);

    const appMain = fs.readFileSync(
        path.join(__dirname, "..", "app-main.js"),
        "utf8"
    );
    const ceo = fs.readFileSync(
        path.join(__dirname, "..", "ceo.html"),
        "utf8"
    );
    const index = fs.readFileSync(
        path.join(__dirname, "..", "index.html"),
        "utf8"
    );

    assert.match(appMain, /resolveGestiaRouteDecision/);
    assert.match(appMain, /APP_MAIN_ROLE_AUTHORITY_REDIRECT/);
    assert.doesNotMatch(
        appMain,
        /return go\(RUTAS\.(?:admin|tecnico|cliente|residencial)\)/
    );
    assert.doesNotMatch(appMain, /const adminSurfaces\s*=/);
    assert.doesNotMatch(firebase, /verificarYRedireccionarLegacy/);
    assert.doesNotMatch(firebase, /shouldSkipLegacyRouting/);
    assert.doesNotMatch(firebase, /__SIA7_ROUTER_LOCK__/);
    assert.match(ceo, /class="gestia-auth-pending"/);
    assert.match(ceo, /verificarYRedireccionar\(userAuth\)/);
    assert.match(index, /verificarYRedireccionar\(userData\)/);
    assert.match(index, /INDEX_ROLE_AUTHORITY_DECISION/);
    assert.doesNotMatch(
        index,
        /if \(rol === ['"](?:tecnico|admin|cliente)['"]\)/
    );
    assert.doesNotMatch(index, /const rolElegido\s*=/);
});

test("Terminal uses one premium response renderer and preserves semantic titles", () => {
    const terminal = fs.readFileSync(
        path.join(__dirname, "..", "gestia-terminal.html"),
        "utf8"
    );

    assert.equal(
        (terminal.match(/window\.renderJarvisResponse\s*=(?!=)/g) || []).length,
        1
    );
    assert.match(terminal, /const multiToolTitle\s*=/);
    assert.match(terminal, /finalResponse\?\.title/);
    assert.match(terminal, /const safeTitle\s*=\s*escapeHTML/);
    assert.match(terminal, /\$\{safeTitle\}<\/h3>/);
    assert.match(terminal, /item\?\.reason/);
    assert.match(terminal, /name === "web\.research"/);
    assert.match(terminal, /Fuentes verificables:/);
    assert.match(terminal, /source\?\.url/);
    assert.doesNotMatch(terminal, /window\.renderJarvisResponse = function/);
});

test("repo diagnosis separates structural file type from secondary capabilities", () => {
    const toolsRuntime = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "tools.runtime.js"),
        "utf8"
    );

    assert.match(
        toolsRuntime,
        /if \(typeSignals\.html\) \{[\s\S]{0,100}"html_application"/
    );
    assert.match(toolsRuntime, /"geolocation"/);
    assert.match(toolsRuntime, /GEOLOCATION_CAPABILITY_DETECTED/);
    assert.match(toolsRuntime, /AUTH_SESSION_OBSERVER/);
    assert.match(toolsRuntime, /ROLE_AUTHORITY_ROUTER/);
    assert.match(toolsRuntime, /AUTH_PENDING_GUARD/);
    assert.match(toolsRuntime, /LEGACY_PROFILE_FALLBACK/);
    assert.match(toolsRuntime, /"auth_observer"/);
    assert.match(toolsRuntime, /"role_routing"/);
    assert.match(toolsRuntime, /"auth_pending_guard"/);
    assert.match(toolsRuntime, /Tipo principal:/);
    assert.match(toolsRuntime, /Capacidades:/);
    assert.match(toolsRuntime, /const hasExactPatchObject\s*=/);
    assert.match(toolsRuntime, /hasPatchPreview[\s\S]{0,180}hasExactPatchObject/);
    assert.doesNotMatch(
        toolsRuntime,
        /patchPreview\|search\\s\*:\|replace\\s\*:/
    );
    assert.doesNotMatch(toolsRuntime, /Tipo detectado: \$\{fileType\}/);

    const core = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "gestia-core.js"),
        "utf8"
    );

    assert.match(core, /const structuredDiagnosisCause\s*=/);
    assert.match(core, /topDiagnosis\.findings\?\.length/);
    assert.doesNotMatch(
        core,
        /String\(topDiagnosis\.summary\)[\s\S]{0,100}\.slice\(0, 10\)/
    );
});

test("multifunction planner exposes the daily supervision report", async () => {
    assert.deepEqual(
        (await planWithModel(
            "Jarvis, dame el estado del supervisor diario",
            [{ name: "system.supervision", args: {} }]
        )).map(call => call.name),
        ["system.supervision"]
    );

    const toolPack = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "jarvis", "jarvis.multitool.pack.js"),
        "utf8"
    );

    assert.match(toolPack, /id:\s*"canonical_role_router"[\s\S]{0,220}"resolveGestiaRouteDecision"/);
    assert.match(toolPack, /id:\s*"canonical_role_router"[\s\S]{0,260}"\[ROLE_AUTHORITY_REDIRECT\]"/);
    assert.match(toolPack, /id:\s*"grounded_web_research"[\s\S]{0,240}"web\.research"/);
    assert.match(toolPack, /id:\s*"grounded_web_research"[\s\S]{0,280}"jarvisWebResearch"/);
    assert.doesNotMatch(
        toolPack,
        /id:\s*"canonical_role_router"[\s\S]{0,180}markers:\s*\["gestia-terminal",\s*"b2b_admin"\]/
    );
});

test("multifunction planner accepts approval only from trusted runtime context", async () => {
    const selected = [{ name: "system.supervision.runNow", args: {} }];
    const pending = await planWithModel(
        "arre ejecuta la supervision diaria ahora",
        selected
    );
    const approved = await planWithModel(
        "ejecuta la supervision diaria ahora",
        selected,
        { approved: true }
    );

    assert.ok(pending.some(call =>
        call.name === "system.supervision.runNow" &&
        call.approved === false
    ));
    assert.ok(approved.some(call =>
        call.name === "system.supervision.runNow" &&
        call.approved === true
    ));
});

test("multifunction planner routes model-selected web research without confusing it with forensics", async () => {
    const prompts = [
        "Jarvis, busca en internet las ultimas novedades de Firebase Functions",
        "Investiga en la web el estado actual de Gemini API y dame fuentes",
        "Dame las ultimas noticias de inteligencia artificial"
    ];

    for (const prompt of prompts) {
        const calls =
            await planWithModel(
                prompt,
                [{ name: "web.research", args: { query: prompt } }]
            );

        assert.deepEqual(
            calls.map(call => call.name),
            ["web.research"],
            prompt
        );
        assert.equal(
            calls[0].args.query,
            prompt
        );
        assert.equal(
            calls[0].mutates,
            false
        );
        assert.equal(
            isJarvisTechnicalDiagnosticRequest(calls),
            false,
            prompt
        );
    }

    assert.deepEqual(
        (await planWithModel(
            "Jarvis, puedes buscar en internet y citar fuentes?",
            [{ name: "system.forensics", args: {} }]
        )).map(call => call.name),
        ["system.forensics"]
    );

    assert.deepEqual(
        (await planWithModel(
            "Jarvis, investiga en la web con fuentes oficiales por que Firebase Hosting puede mostrar contenido antiguo despues de desplegar",
            [{ name: "web.research", args: { query: "Firebase Hosting" } }]
        )).map(call => call.name),
        ["web.research"]
    );
});

test("web research strips assistant command boilerplate before searching", () => {
    const source = fs.readFileSync(
        path.resolve(__dirname, "../gestia-core/jarvis/jarvis.multitool.pack.js"),
        "utf8"
    );

    assert.match(source, /\(jarvis\|heberto\|gestia\)/);
    assert.match(source, /investiga\|investigar\|busca\|buscar/);
    assert.match(source, /(?:web\|internet\|google)/);
});

test("multifunction planner routes capability boundary questions to forensics", async () => {
    const prompts = [
        "Jarvis, corre un analisis forense de tus capacidades reales",
        "Jarvis, corre un analisis forense de tus capacidades reales modo Codex V7: dime que herramientas tienes, cuales faltan, donde falla, y no modifiques nada",
        "Jarvis, que te falta para estar a nivel Codex",
        "Puedes controlar Chrome, buscar internet, generar imagenes y delegar subagentes?"
    ];

    for (const prompt of prompts) {
        const calls = await planWithModel(
            prompt,
            [{ name: "system.forensics", args: {} }]
        );
        assert.equal(
            isJarvisCapabilityForensicsRequest(calls),
            true,
            `forensics gate: ${prompt}`
        );
        assert.deepEqual(
            calls.map(call => call.name),
            ["system.forensics"],
            prompt
        );
    }
});

test("multifunction planner routes real browser, image, document and connector actuators", async () => {
    const browser = await planWithModel(
        "revisa https://example.com en el navegador",
        [{ name: "browser.inspect", args: { url: "https://example.com" } }]
    );
    const image = await planWithModel(
        "genera una imagen futurista de FixGo",
        [{ name: "image.generate", args: { prompt: "FixGo" } }]
    );
    const document = await planWithModel(
        "crea un documento markdown con el reporte",
        [{ name: "document.create", args: { format: "md" } }],
        { approved: true }
    );
    const connectors = await planWithModel(
        "muestra el estado de conectores",
        [{ name: "connector.list", args: {} }]
    );
    const presentation = await planWithModel(
        "crea una presentacion pptx del estado de Jarvis",
        [{ name: "document.create", args: { format: "pptx" } }],
        { approved: true }
    );

    assert.ok(browser.some(call => call.name === "browser.inspect"));
    assert.ok(image.some(call => call.name === "image.generate"));
    assert.ok(!image.some(call => call.name === "system.forensics"));
    assert.ok(document.some(call =>
        call.name === "document.create" &&
        call.mutates === true &&
        call.approved === true
    ));
    assert.ok(connectors.some(call => call.name === "connector.list"));
    assert.ok(presentation.some(call =>
        call.name === "document.create" &&
        call.args.format === "pptx" &&
        call.approved === true
    ));
});

test("document contents do not trigger unrelated capability tools", async () => {
    assert.deepEqual(
        (await planWithModel(
            "Jarvis, crea una presentacion pptx titulada Informe V7 con secciones capacidades, pruebas y pendientes",
            [{ name: "document.create", args: { format: "pptx" } }]
        )).map(call => call.name),
        ["document.create"]
    );
});

test("multifunction planner delegates several read-only tasks in parallel", async () => {
    const calls = await planWithModel(
        "Jarvis, delega en paralelo la salud del sistema, conectores y estado git del repo",
        [{
            name: "agent.delegate",
            args: {
                tasks: [
                    { tool: "system.health", args: {} },
                    { tool: "connector.list", args: {} },
                    { tool: "repo.gitStatus", args: {} }
                ]
            }
        }]
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "agent.delegate");
    assert.deepEqual(
        calls[0].args.tasks.map(task => task.tool),
        ["system.health", "connector.list", "repo.gitStatus"]
    );
    assert.equal(calls[0].mutates, false);
});

test("tool bridge composes human actuator answers without dumping browser DOM or image bytes", () => {
    const bridge = fs.readFileSync(
        path.resolve(__dirname, "../gestia-core/tools.bridge.js"),
        "utf8"
    );
    const terminal = fs.readFileSync(
        path.resolve(__dirname, "../gestia-terminal.html"),
        "utf8"
    );

    assert.match(bridge, /function composeActuatorResponse/);
    assert.match(bridge, /function composeActuatorFailure/);
    assert.match(bridge, /toolName === "browser\.inspect"/);
    assert.match(bridge, /Titulo detectado/);
    assert.match(bridge, /imageBase64:\s*undefined/);
    assert.match(bridge, /No hay conectores externos configurados/);
    assert.match(bridge, /No se genero ni se fingio una imagen/);
    assert.match(bridge, /API key not valid\|API_KEY_INVALID/);
    assert.match(bridge, /Google rechazo la credencial/);
    const toolPack = fs.readFileSync(
        path.resolve(__dirname, "../gestia-core/jarvis/jarvis.multitool.pack.js"),
        "utf8"
    );
    assert.match(toolPack, /Google rechazo la credencial GEMINI_KEY/);
    assert.match(toolPack, /delegacion paralela esta disponible/);
    assert.match(terminal, /jarvis-tools-v7-20260714-safe-image-artifacts/);
    const core = fs.readFileSync(
        path.resolve(__dirname, "../gestia-core/gestia-core.js"),
        "utf8"
    );
    assert.match(core, /directActuatorResponses/);
    assert.match(core, /observation\?\.type === "JARVIS_CONVERSATIONAL_RESPONSE"/);
    assert.match(core, /DIRECT_ACTUATOR_COMPOSITION/);
    assert.match(core, /directActuatorFinalResponse/);
    assert.match(terminal, /sia7-bounded-business-v3-20260714/);
});

test("multifunction planner keeps explanatory questions conversational", async () => {
    assert.deepEqual(
        (await planWithModel(
            "Que es marketing digital y para que sirve?",
            [{ name: "conversation.respond", args: { prompt: "marketing digital" } }]
        )).map(call => call.name),
        ["conversation.respond"]
    );

    assert.deepEqual(
        (await planWithModel(
            "Explicame que es una flotilla",
            [{ name: "conversation.respond", args: { prompt: "flotilla" } }]
        )).map(call => call.name),
        ["conversation.respond"]
    );

    assert.deepEqual(
        (await planWithModel(
            "Explicame marketing y crea una campana para Instagram",
            [{ name: "marketing.plan", args: {} }]
        )).map(call => call.name),
        [
            "marketing.plan"
        ]
    );

    assert.deepEqual(
        (await planWithModel(
            "Explicame marketing y haz una campana para TikTok",
            [{ name: "marketing.plan", args: {} }]
        )).map(call => call.name),
        [
            "marketing.plan"
        ]
    );
});

test("model-selected technical diagnostics outrank business tools", async () => {
    const prompts = [
        "Jarvis, reviza tecnico b2b y cliente html y dime como esta la configuracion y que puede fallar",
        "Jarvis, investiga por que al iniciar sesion en admin primero me manda a cliente y despues de segundos me manda a admin",
        "Jarvis, investiga por que cuando estoy en terminal regreso a CEO pero despues de unos segundos se sale a admin",
        "Jarvis, revisa app-login.js y busca por que redirige al panel equivocado"
    ];

    for (const prompt of prompts) {
        const calls = await planWithModel(
            prompt,
            [{ name: "repo.search", args: { query: prompt } }]
        );
        assert.equal(
            isJarvisTechnicalDiagnosticRequest(calls),
            true,
            prompt
        );
        assert.ok(!calls.some(call => call.name === "business.assist"));
    }

    assert.deepEqual(
        (await planWithModel(
            "Jarvis, dame un resumen del cliente",
            [{ name: "business.assist", args: {} }]
        )).map(call => call.name),
        ["business.assist"]
    );
});

test("mixed investigations retain technical and multifunction tools", async () => {
    const supplemental =
        await planWithModel(
            "Jarvis, revisa tecnico b2b y dime el estado del supervisor diario",
            [
                { name: "repo.search", args: { query: "tecnico b2b" } },
                { name: "system.supervision", args: {} }
            ]
        );

    assert.deepEqual(
        supplemental.map(call => call.name),
        ["repo.search", "system.supervision"]
    );

    const merged =
        mergeJarvisToolCalls(
            [
                {
                    name: "repo.search",
                    args: { query: "tecnico b2b" }
                },
                {
                    name: "repo.read",
                    args: { file: "tecnico-b2b.html" }
                },
                {
                    name: "repo.diagnose",
                    args: { file: "tecnico-b2b.html" }
                }
            ],
            supplemental
        );

    assert.deepEqual(
        merged.map(call => call.name),
        [
            "repo.search",
            "repo.read",
            "repo.diagnose",
            "system.supervision"
        ]
    );
});

test("brain awaits the model semantic planner and keeps bounded governance", () => {
    const brain =
        fs.readFileSync(
            path.join(
                __dirname,
                "..",
                "gestia-core",
                "brain.engine.js"
            ),
            "utf8"
        );

    assert.match(brain, /buildJarvisMultifunctionToolCalls/);
    assert.match(brain, /plannerSeedToolCalls\s*=\s*await buildJarvisMultifunctionToolCalls/);
    assert.match(brain, /mergeJarvisToolCalls/);
    assert.match(brain, /const toolCalls = plannerSeedToolCalls/);
    assert.match(brain, /cloudReasoning:\s*null/);
    assert.match(brain, /const semanticToolPlan\s*=\s*\{/);
    assert.match(brain, /patchPreviewAllowed:\s*false/);
    assert.match(brain, /renderPatchPreview:\s*false/);
    assert.match(brain, /cloudToolPlan:\s*semanticToolPlan/);
    assert.doesNotMatch(brain, /^\s*cloudReasoning,\s*$/m);
    assert.doesNotMatch(brain, /^\s*cloudToolPlan,\s*$/m);
    assert.doesNotMatch(brain, /buildLocalTechnicalInvestigationPlan/);
    assert.doesNotMatch(brain, /REPO_HUB_GLOBAL_FORENSIC_EVIDENCE/);
    assert.doesNotMatch(brain, /forensicCandidateFiles\.map/);
    assert.doesNotMatch(brain, /requestedEvidenceCount \+ 3/);

    const analysisHub = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "gestia-core",
            "hubs",
            "analysis.hub.js"
        ),
        "utf8"
    );

    assert.match(
        analysisHub,
        /brain\.engine\.js\?v=sia7-model-semantic-planner-v3-20260714/
    );
});

test("daily supervision cloud lookup has a bounded browser deadline", () => {
    const source = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "gestia-core",
            "jarvis",
            "jarvis.multitool.pack.js"
        ),
        "utf8"
    );

    assert.match(source, /SUPERVISION_CLOUD_TIMEOUT_MS\s*=\s*4500/);
    assert.match(source, /FORENSICS_SUPERVISION_TIMEOUT_MS\s*=\s*1500/);
    assert.match(source, /timeoutMs:\s*FORENSICS_SUPERVISION_TIMEOUT_MS/);
    assert.match(source, /Math\.min\(\s*10000,[\s\S]{0,180}Math\.max\(\s*1000/);
    assert.match(source, /controller\?\.abort\(\)/);
    assert.match(source, /signal:\s*controller\.signal/);
    assert.match(source, /SUPERVISION_STATUS_TIMEOUT_/);
    assert.match(source, /clearTimeout\(timeoutId\)/);
});

test("multifunction descriptor remains approval-bound", () => {
    const descriptor =
        describeJarvisMultifunctionTools();

    assert.equal(descriptor.readOnlyByDefault, true);
    assert.equal(descriptor.derivedWritesRequireApproval, true);
    assert.ok(descriptor.domains.includes("marketing"));
    assert.ok(descriptor.domains.includes("media"));

    const planner =
        describeJarvisMultifunctionPlanner();

    assert.equal(planner.mutates, false);
    assert.equal(planner.maximumToolCalls, 12);
    assert.equal(planner.architecture, "model_selected_runtime_catalog");
    assert.equal(planner.approvalSource, "trusted_runtime_context");
});

test("terminal ledger stays compact and escapes persisted labels", () => {
    const ledger = fs.readFileSync(
        path.join(__dirname, "..", "modules", "terminal", "ledger.js"),
        "utf8"
    );

    assert.match(ledger, /function escapeLedgerHtml/);
    assert.match(ledger, /Object\.entries\(grouped\)\.slice\(0, 5\)/);
    assert.match(ledger, /<details id="ledger-ui-block"/);
    assert.match(ledger, /escapeLedgerHtml\(planId\)/);
    assert.match(ledger, /escapeLedgerHtml\(eventType\.replace/);
    assert.match(ledger, /hadPreviousLedger && hasNewLedgerEvent/);
    assert.doesNotMatch(ledger, /\$\{planId\}\s*<\/div>/);
});

test("repo diagnostics resolve indexed basenames to real repository paths", () => {
    const toolsRuntime = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "tools.runtime.js"),
        "utf8"
    );

    assert.match(toolsRuntime, /file:\s*meta\?\.path\s*\|\|\s*key/);
    assert.match(toolsRuntime, /window\.__REPO_INDEX__\?\.\[normalizedFile\]/);
    assert.match(toolsRuntime, /indexedPath\.split\("\/"\)\.pop\(\) === normalizedFile/);
    assert.match(toolsRuntime, /const resolvedFile\s*=\s*String\(indexedFile\?\.path \|\| normalizedFile\)/);
    assert.match(toolsRuntime, /requestedFile:\s*normalizedFile,\s*resolvedFile/);
    assert.match(toolsRuntime, /const findingLinePatterns\s*=\s*\{/);
    assert.match(toolsRuntime, /finding\.evidence[\s\S]{0,300}lines:\s*evidenceLines/);

    const core = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "gestia-core.js"),
        "utf8"
    );

    assert.match(core, /jarvis-tools-v7-20260714-safe-image-artifacts/);
});
