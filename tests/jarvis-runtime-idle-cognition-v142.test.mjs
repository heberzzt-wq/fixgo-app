import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const read = relative =>
    fs.readFileSync(new URL("../" + relative, import.meta.url), "utf8");

test("runtime boot keeps repo cognition verbose logs quiet and defers hydration", () => {
    const repoCognition = read("modules/terminal/repo-cognition.js");
    const governance = read("modules/terminal/runtime-governance.js");
    const repairHealth = read("modules/terminal/runtime-repair-health.js");
    const eventBus = read("modules/terminal/runtime-event-bus.js");

    for (const marker of [
        "REPO_COGNITION_REHYDRATED",
        "IMPACT_ANALYSIS_READY",
        "CRITICALITY_PROPAGATION",
        "CRITICALITY_RESULT"
    ]) {
        const at = repoCognition.indexOf(marker);
        assert.ok(at >= 0, marker);
        assert.match(repoCognition.slice(Math.max(0, at - 90), at + 140), /gestiaBootLog/);
    }

    assert.match(governance, /gestiaBootLog\?\.\([\s\S]{0,90}RISK_NODE/);
    assert.match(repairHealth, /gestiaBootLog\?\.\([\s\S]{0,90}RUNTIME_STATE_CHANGE/);
    assert.match(repairHealth, /gestiaBootLog\?\.\([\s\S]{0,90}RUNTIME_STATE_UPDATED/);
    assert.match(eventBus, /requestIdleCallback/);
    assert.match(eventBus, /timeout:\s*12000/);
    assert.match(eventBus, /setTimeout\(\s*runWhenIdle,\s*5000\s*\)/);
});
