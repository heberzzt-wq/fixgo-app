from pathlib import Path

path = Path('tools/v94_single_brain_prune_wave4.py')
text = path.read_text(encoding='utf-8')
start_marker = "# NEXO bootstrap regression now asserts the absence of local resilience.\n"
end_marker = "\n\n# Retire behavior tests for the deleted local language compiler/fallback.\n"
start = text.find(start_marker)
if start < 0:
    raise SystemExit('WAVE4_BOOTSTRAP_SECTION_START_NOT_FOUND')
end = text.find(end_marker, start)
if end < 0:
    raise SystemExit('WAVE4_BOOTSTRAP_SECTION_END_NOT_FOUND')
replacement = r"""# NEXO bootstrap regression is rewritten as a single-authority source contract.
bootstrap_test = r'''import assert from "node:assert/strict";
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
'''
write('tests/nexo-terminal-bootstrap.test.mjs', bootstrap_test)
"""
text = text[:start] + replacement + text[end:]
path.write_text(text, encoding='utf-8')
print('V94_WAVE4_BOOTSTRAP_HELPER_FIXED')
