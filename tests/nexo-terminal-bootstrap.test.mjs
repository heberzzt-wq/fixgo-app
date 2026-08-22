import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
const bootstrap = fs.readFileSync(
    path.join(root, "modules/terminal/nexo-bootstrap.js"),
    "utf8"
);

test("NEXO bootstrap keeps tools but installs no alternate semantic authority", () => {
    assert.match(bootstrap, /installNexoRealMediaTools/);
    assert.match(bootstrap, /nexo\.real-media\.tools\.js/);
    assert.doesNotMatch(bootstrap, /nexo\.semantic-planner-resilience/);
    assert.doesNotMatch(bootstrap, /resilienceVersion/);
});

test("NEXO bootstrap remains inert outside the browser", () => {
    assert.match(bootstrap, /environment:\s*"non_browser"/);
    assert.match(bootstrap, /active:\s*false/);
});

test("NEXO bootstrap hydrates the existing local bridge transport from the runtime contract", () => {
    assert.match(bootstrap, /globalThis\.JarvisLocalBridge\s*=\s*bridge/);
    assert.match(bootstrap, /http:\/\/localhost:3344/);
    assert.match(bootstrap, /jarvis-runtime-contract\.json/);
    assert.match(bootstrap, /"X-Jarvis-Release-Id": contract\.releaseId/);
    assert.match(bootstrap, /targetAddressSpace:\s*"local"/);
    assert.match(bootstrap, /localBridgeActive/);
    assert.doesNotMatch(bootstrap, /releaseId:\s*"v94-/);
});
