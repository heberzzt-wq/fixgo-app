import fs from "node:fs";

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
console.log("V115_CACHE_REGRESSION_REFRESHED_FOR_V116");
