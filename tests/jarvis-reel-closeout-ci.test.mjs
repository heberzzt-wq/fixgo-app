import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script = fs.readFileSync(new URL('../.github/scripts/v142-reel-closeout.mjs', import.meta.url), 'utf8');
const start = script.indexOf('function ensureVideoStageAndTimeout()');
const end = script.indexOf('function ensureVerifiedVideoImport()', start);
const stage = script.slice(start, end);
const file = 'gestia-core/jarvis/jarvis.mission.orchestrator.js';

function certify(source) {
  const files = new Map([[file, source], ['gestia-core/jarvis/jarvis.mission.dependencies.js', '"video.generate": 35']]);
  const writes = [];
  vm.runInNewContext(`${stage}\nensureVideoStageAndTimeout();`, {
    sourceOf: name => files.get(name),
    replaceExactOnce(name, before, after, label) {
      const current = files.get(name);
      if (current.includes(after)) return;
      assert.equal(current.split(before).length - 1, 1, label);
      files.set(name, current.replace(before, after));
      writes.push(name);
    }
  });
  return { source: files.get(file), writes };
}

test('CI preserves the actual timeout policy including noDeadline without rewriting runtime', () => {
  const current = fs.readFileSync(new URL('../gestia-core/jarvis/jarvis.mission.orchestrator.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(!current.includes('const effectiveMissionTimeoutMs = videoGenerationRequested'), 'reproduces the obsolete literal marker');
  assert.deepEqual(certify(current), { source: current, writes: [] });
});

test('CI still installs the timeout policy for the legacy unconfigured runtime', () => {
  const old = '    const persistence = storageOrMemory(storage);\n    const startedAt = Date.now();\n    const runtimeResults = [];';
  const first = certify(old);
  assert.deepEqual(first.writes, [file]);
  assert.match(first.source, /const effectiveMissionTimeoutMs = videoGenerationRequested/);
  assert.match(first.source, /Math.max\(Number\(timeoutMs\) \|\| 180000, 1800000\)/);
  assert.deepEqual(certify(first.source), { source: first.source, writes: [] });
});
