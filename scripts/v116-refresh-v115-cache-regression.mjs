import fs from "node:fs";

{
    const path = "tests/jarvis-page-browser-fallback-v115.test.mjs";
    let source = fs.readFileSync(path, "utf8");

    const oldBlock = `test("browser boot chain carries v115 cache identity", () => {
    const html = fs.readFileSync(path.join(root, "gestia-terminal.html"), "utf8");
    const core = fs.readFileSync(path.join(root, "gestia-core", "gestia-core.js"), "utf8");
    const terminal = fs.readFileSync(path.join(root, "gestia-terminal.js"), "utf8");
    assert.match(html, /v94-page-browser-fallback-v115-20260809/);
    assert.match(core, /v94-page-browser-fallback-v115-20260809/);
    assert.match(terminal, /repo-bootstrap-index\\.js\\?v=v94-page-browser-fallback-v115-20260809/);
});`;

    const newBlock = `test("browser boot chain preserves v115 fallback while allowing later shell cache busts", () => {
    const html = fs.readFileSync(path.join(root, "gestia-terminal.html"), "utf8");
    const core = fs.readFileSync(path.join(root, "gestia-core", "gestia-core.js"), "utf8");
    const terminal = fs.readFileSync(path.join(root, "gestia-terminal.js"), "utf8");
    assert.match(html, /gestia-terminal\\.js\\?v=v94-[a-z0-9-]+-20260809/);
    assert.match(core, /v94-page-browser-fallback-v115-20260809/);
    assert.match(terminal, /repo-bootstrap-index\\.js\\?v=v94-page-browser-fallback-v115-20260809/);
});`;

    if (!source.includes(oldBlock)) {
        throw new Error("V115_CACHE_REGRESSION_ANCHOR_MISSING");
    }

    source = source.replace(oldBlock, newBlock);
    fs.writeFileSync(path, source, "utf8");
}

{
    const path = "tests/jarvis-semantic-memory-integrity.test.mjs";
    let source = fs.readFileSync(path, "utf8");

    const oldAssertion = `    assert.match(html, /v94-page-browser-fallback-v115-20260809/);`;
    const newAssertion = `    assert.match(html, /gestia-terminal\\.js\\?v=v94-[a-z0-9-]+-20260809/);`;

    const occurrences = source.split(oldAssertion).length - 1;
    if (occurrences !== 1) {
        throw new Error(`SEMANTIC_HTML_CACHE_ASSERTION_COUNT_${occurrences}`);
    }

    source = source.replace(oldAssertion, newAssertion);
    fs.writeFileSync(path, source, "utf8");
}

{
    const path = "tests/jarvis-marketing-terminal-delivery.e2e.test.mjs";
    let source = fs.readFileSync(path, "utf8");

    const testStart = source.indexOf('test("Terminal core hydrates marketing documents and gives the direct delivery response highest priority"');
    if (testStart < 0) {
        throw new Error("MARKETING_TERMINAL_CACHE_TEST_MISSING");
    }
    const testEnd = source.indexOf('\n});', testStart);
    if (testEnd < 0) {
        throw new Error("MARKETING_TERMINAL_CACHE_TEST_END_MISSING");
    }

    const before = source.slice(0, testStart);
    let block = source.slice(testStart, testEnd + 4);
    const after = source.slice(testEnd + 4);

    const oldTerminalAssertion = `    assert.match(terminal, /v94-page-browser-fallback-v115-20260809/);`;
    const newTerminalAssertion = `    assert.match(terminal, /gestia-terminal\\.js\\?v=v94-[a-z0-9-]+-20260809/);`;

    if (!block.includes('assert.match(core, /v94-page-browser-fallback-v115-20260809/);')) {
        throw new Error("MARKETING_CORE_V115_ASSERTION_MISSING");
    }
    if (!block.includes(oldTerminalAssertion)) {
        throw new Error("MARKETING_TERMINAL_V115_ASSERTION_MISSING");
    }

    block = block.replace(oldTerminalAssertion, newTerminalAssertion);
    source = before + block + after;
    fs.writeFileSync(path, source, "utf8");
}

console.log("V115_SEMANTIC_AND_MARKETING_CACHE_REGRESSIONS_REFRESHED_FOR_V116");
