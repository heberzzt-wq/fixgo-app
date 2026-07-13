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
    describeJarvisMultifunctionPlanner
} from "../gestia-core/jarvis/jarvis.multifunction.planner.js";

const __dirname =
    path.dirname(
        fileURLToPath(import.meta.url)
    );

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

test("multifunction pack registers seven read-only tools", () => {
    const runtime =
        createRuntime();

    const result =
        registerJarvisMultifunctionTools(runtime);

    assert.equal(result.ok, true);
    assert.deepEqual(result.tools, [
        "conversation.respond",
        "system.capabilities",
        "system.health",
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

test("Jarvis answers casual greetings locally when cloud cognition is unavailable", async () => {
    const runtime = createRuntime();
    registerJarvisMultifunctionTools(runtime);

    const result = await runtime.execute(
        "conversation.respond",
        {
            prompt: "buenos dias jarvis, se me antoja una tecate"
        }
    );

    assert.equal(result.ok, true);
    assert.equal(result.localFallback, true);
    assert.match(result.message, /Buenos días, pariente/i);
    assert.match(result.message, /Tecate/i);

    const calls = buildJarvisMultifunctionToolCalls(
        "buenos dias jarvis, se me antoja una tecate"
    );

    assert.equal(calls[0]?.name, "conversation.respond");
    assert.equal(calls[0]?.mutates, false);
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

test("general semantic intent stays casual and speaks through the terminal", () => {
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
    const semantic = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "semantic.engine.js"),
        "utf8"
    );
    const vision = fs.readFileSync(
        path.join(__dirname, "..", "gestia-core", "jarvis", "jarvis.vision.engine.js"),
        "utf8"
    );

    assert.match(core, /semantic\.primaryConcept\s*\|\|\s*semantic\.concept/);
    assert.match(core, /semanticPrimaryConcept\s*!==\s*"GENERAL"/);
    assert.match(core, /isConversationalQuestion/);
    assert.match(core, /hasExplicitOperationalRequest/);
    assert.match(core, /anali\[sz\]/);
    assert.match(core, /typo-normalization-v1-20260713/);
    assert.match(semantic, /replace\(\/\\banalisa\\b\/g, "analiza"\)/);
    assert.match(vision, /replace\(\/\\banalisa\\b\/g, "analiza"\)/);
    assert.match(core, /isExplicitCasualSocialRequest/);
    assert.match(core, /conversational_question_without_operational_verb/);
    assert.match(core, /explicit_social_request_without_operational_verb/);
    assert.ok(
        core.indexOf("if (isConversationalQuestion)") <
            core.indexOf("state?.hasPatchPreview &&"),
        "a new explanatory question must outrank stale patch state"
    );
    assert.match(terminal, /canAnswerCasualTerminalLocally/);
    assert.match(terminal, /Una API es un puente con reglas definidas/);
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

test("multifunction planner routes natural requests into bounded read-only tools", () => {
    const calls =
        buildJarvisMultifunctionToolCalls(
            "Jarvis, crea una landing y marketing con reels para Instagram",
            {
                brandName: "FixGo"
            }
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

test("brain seeds natural multifunction requests into the tested planner", () => {
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
    assert.match(brain, /plannerSeedToolCalls\s*=\s*buildJarvisMultifunctionToolCalls/);
    assert.match(brain, /plannerSeedToolCalls\.length\s*===\s*0/);
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
    assert.equal(planner.maximumToolCalls, 3);
});
