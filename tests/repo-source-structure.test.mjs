import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
    analyzeRepoSourceStructure,
    buildExecutableSourceView,
    extractQualifiedSourceIdentifiers,
    resolveExplicitRepositoryTargets
} from "../gestia-core/repo/repo.source.structure.js";

const __dirname =
    path.dirname(
        fileURLToPath(import.meta.url)
    );

test("source structure indexes real multifunction registrations with lines", () => {
    const source =
        fs.readFileSync(
            path.join(
                __dirname,
                "..",
                "gestia-core",
                "jarvis",
                "jarvis.multitool.pack.js"
            ),
            "utf8"
        );

    const structure =
        analyzeRepoSourceStructure(source);

    const marketing =
        structure.registrations.find(item =>
            item.name === "marketing.plan"
        );

    const image =
        structure.registrations.find(item =>
            item.name === "image.plan"
        );

    assert.equal(
        structure.kind,
        "tool_registry"
    );

    assert.ok(
        structure.registrationCount >= 13
    );

    assert.ok(marketing);
    assert.ok(image);
    assert.ok(marketing.line > 0);
    assert.ok(image.line > marketing.line);
    assert.equal(
        marketing.inputSchema,
        "MARKETING_ARGUMENT_SCHEMA"
    );
    assert.equal(
        image.inputSchema,
        "IMAGE_PLAN_ARGUMENT_SCHEMA"
    );
    assert.equal(
        marketing.output,
        "SIA7_MARKETING_PLAN"
    );
    assert.equal(
        image.output,
        "SIA7_IMAGE_REQUIREMENTS_PLAN"
    );
});

test("executable source view excludes documentary role markers", () => {
    const source = [
        "const markers = [",
        "  \"resolveGestiaRouteDecision\",",
        "  \"[ROLE_AUTHORITY_REDIRECT]\",",
        "  \"gestia-auth-pending\"",
        "];",
        "runtime.register({",
        "  name: \"example.tool\",",
        "  execute: async () => window.ToolsBridge.executeMany([])",
        "});"
    ].join("\n");

    const executable =
        buildExecutableSourceView(source);

    assert.equal(
        executable.includes(
            "resolveGestiaRouteDecision"
        ),
        false
    );
    assert.equal(
        executable.includes(
            "ROLE_AUTHORITY_REDIRECT"
        ),
        false
    );
    assert.equal(
        executable.includes(
            "gestia-auth-pending"
        ),
        false
    );
    assert.equal(
        executable.includes(
            "ToolsBridge.executeMany"
        ),
        true
    );
});

test("qualified identifier extraction finds tool symbols without phrase rules", () => {
    assert.deepEqual(
        extractQualifiedSourceIdentifiers(
            "MODO READ ONLY. Busca marketing.plan e image.plan; revisa gestia-core/jarvis/jarvis.multitool.pack.js."
        ),
        [
            "marketing.plan",
            "image.plan",
            "jarvis.multitool.pack.js"
        ]
    );
});

test("explicit repository targets keep every named file and exclude runtime tool identifiers", () => {
    assert.deepEqual(
        resolveExplicitRepositoryTargets(
            "Revisa app-login.js, firebase.js, app-main.js y gestia-terminal.html; confirma marketing.plan en gestia-core/jarvis/jarvis.multitool.pack.js.",
            {
                registeredToolNames: [
                    "marketing.plan",
                    "image.plan"
                ]
            }
        ),
        [
            "app-login.js",
            "firebase.js",
            "app-main.js",
            "gestia-terminal.html",
            "gestia-core/jarvis/jarvis.multitool.pack.js"
        ]
    );
});
