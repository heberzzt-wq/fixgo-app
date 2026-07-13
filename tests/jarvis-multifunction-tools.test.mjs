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

test("multifunction pack registers six read-only domains", () => {
    const runtime =
        createRuntime();

    const result =
        registerJarvisMultifunctionTools(runtime);

    assert.equal(result.ok, true);
    assert.deepEqual(result.tools, [
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
