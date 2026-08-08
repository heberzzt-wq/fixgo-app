const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const terminalPath = path.join(process.cwd(), "gestia-terminal.html");
const terminal = fs.readFileSync(terminalPath, "utf8");

test("media.analyze evidence renderer preserves certification fields instead of 700-char truncation", () => {
    assert.match(terminal, /if \(toolName === "media\.analyze"\)/);
    assert.match(terminal, /expectedSources:/);
    assert.match(terminal, /receivedSources:/);
    assert.match(terminal, /description: item\?\.description \|\| ""/);
    assert.match(terminal, /inferences: Array\.isArray\(item\?\.inferences\)/);
    assert.match(terminal, /visibleData: Array\.isArray\(item\?\.visibleData\)/);
    assert.match(terminal, /sourceManifest:/);
    assert.match(terminal, /verifiedVisualClaims:/);
    assert.match(terminal, /policy:/);

    const mediaBranch = terminal.slice(
        terminal.indexOf('if (toolName === "media.analyze")'),
        terminal.indexOf('if (toolName === "repo.grep")')
    );

    assert.doesNotMatch(mediaBranch, /slice\(0,\s*700\)/);
});

test("generic observation renderer keeps its compact fallback for unrelated tools", () => {
    assert.match(
        terminal,
        /JSON\.stringify\(repoData, null, 2\)\.slice\(0, 700\)/
    );
});
