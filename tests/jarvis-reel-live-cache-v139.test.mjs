import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const terminal = fs.readFileSync("gestia-terminal.html", "utf8");
const core = fs.readFileSync("gestia-core/gestia-core.js", "utf8");
const runtime = fs.readFileSync("gestia-core/tools.runtime.js", "utf8");

const RELEASE = "v139-real-reel-e2e-20260812";

test("v139 live terminal busts the GestiaCore cache after reel voice/mp4 changes", () => {
  assert.match(
    terminal,
    new RegExp(`/gestia-core/gestia-core\\.js\\?v=${RELEASE}`)
  );
  assert.doesNotMatch(
    terminal,
    /\/gestia-core\/gestia-core\.js\?v=v137-local-speech-synthesis-20260812/
  );
});

test("v139 GestiaCore loads current runtime and bridge bytes instead of v126/v115 caches", () => {
  assert.match(core, new RegExp(`/gestia-core/tools\\.runtime\\.js\\?v=${RELEASE}`));
  assert.match(core, new RegExp(`/gestia-core/tools\\.bridge\\.js\\?v=${RELEASE}`));
  assert.doesNotMatch(core, /tools\.runtime\.js\?v=v94-marketing-actuator-bridge-v126-20260810/);
  assert.doesNotMatch(core, /tools\.bridge\.js\?v=v94-page-browser-fallback-v115-20260809/);
});

test("v139 runtime refreshes the multifunction pack used by web research and reel planning", () => {
  assert.match(runtime, new RegExp(`jarvis/jarvis\\.multitool\\.pack\\.js\\?v=${RELEASE}`));
  assert.doesNotMatch(runtime, /jarvis\.multitool\.pack\.js\?v=v94-marketing-actuator-bridge-v126-20260810/);
  assert.match(runtime, /jarvis\.actuator\.pack\.js\?v=v138-native-mp4-reel-export-20260812/);
});
