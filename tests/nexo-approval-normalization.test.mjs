import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const source = fs.readFileSync(
    path.join(process.cwd(), "gestia-core/nexo/nexo.ui.branding.js"),
    "utf8"
);

test("NEXO UI branding contains no natural-language approval brain", () => {
    assert.doesNotMatch(source, /EXACT_APPROVAL_COMMANDS/);
    assert.doesNotMatch(source, /isNexoApprovalCommand/);
    assert.doesNotMatch(source, /normalizeNexoCommand/);
    assert.doesNotMatch(source, /APPROVAL_BRIDGE_KEY/);
    assert.doesNotMatch(source, /nexoApprovalNormalized/);
    assert.doesNotMatch(source, /input\.value\s*=\s*"proceder"/);
    assert.doesNotMatch(source, /\.test\s*\(/);
    assert.doesNotMatch(source, /\bapruebo\b|\barre\b|\bhazlo\b/);
});

test("NEXO UI branding declares the single semantic authority", () => {
    assert.match(source, /2\.0\.0-branding-only-single-semantic-authority/);
    assert.match(source, /semanticAuthority:\s*"jarvisSemanticPlan"/);
    assert.match(source, /replaceExactText/);
    assert.match(source, /__NEXO_RUNTIME_STAMP__/);
});
