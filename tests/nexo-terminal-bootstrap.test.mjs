import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import {
    instalarBootstrapTerminalNexo,
    NEXO_TERMINAL_BOOTSTRAP_VERSION
} from "../modules/terminal/nexo-bootstrap.js";

test("NEXO terminal bootstrap stays inert and deterministic outside the browser", async () => {
    const result = await instalarBootstrapTerminalNexo();

    assert.equal(result.ok, true);
    assert.equal(result.active, false);
    assert.equal(result.environment, "non_browser");
    assert.equal(result.version, NEXO_TERMINAL_BOOTSTRAP_VERSION);
});

test("proposal state loads NEXO before the legacy terminal core", () => {
    const proposalState = fs.readFileSync(
        new URL("../modules/terminal/proposal-state.js", import.meta.url),
        "utf8"
    );
    const bootstrap = fs.readFileSync(
        new URL("../modules/terminal/nexo-bootstrap.js", import.meta.url),
        "utf8"
    );

    assert.match(
        proposalState,
        /^import "\.\/nexo-bootstrap\.js\?v=nexo-terminal-runtime-v2-20260731";/
    );
    assert.match(
        bootstrap,
        /nexo\.semantic-planner-resilience\.js\?v=nexo-terminal-runtime-v3-20260731/
    );
    assert.match(
        bootstrap,
        /nexo\.real-media\.tools\.js\?v=nexo-real-media-runtime-v1-20260731/
    );
    assert.match(
        bootstrap,
        /installNexoRealMediaTools\(\)/
    );
    assert.match(
        bootstrap,
        /__NEXO_TERMINAL_BOOT_HEALTH__/
    );
});
