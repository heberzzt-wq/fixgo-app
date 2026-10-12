import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyFunctionsBaseline, CERTIFICATION_BRANCH, FUNCTIONS_BASELINE } from '../.github/scripts/v139-functions-guard.mjs';

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'v139-guard-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init');
  git('config', 'user.email', 'guard@example.invalid');
  git('config', 'user.name', 'Guard regression');
  const write = (file, value) => { fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true }); fs.writeFileSync(path.join(cwd, file), value); };
  const commit = () => { git('add', '.'); git('commit', '-m', 'fixture'); return git('rev-parse', 'HEAD'); };
  write('functions/runtime.js', 'old\n');
  const oldBaseline = commit();
  write('functions/runtime.js', 'integrated\n');
  const baseline = commit();
  const verify = (options = {}) => verifyFunctionsBaseline({ cwd, baseline, refName: CERTIFICATION_BRANCH, ...options });
  return { cwd, git, write, commit, verify, baseline, oldBaseline };
}

test('accepted Functions evolution passes while the obsolete baseline reproduces the failure', t => {
  const f = fixture(t);
  assert.throws(() => f.verify({ baseline: f.oldBaseline }), /FUNCTIONS_CHANGED/);
  f.write('reel.js', 'certification change\n'); f.commit();
  assert.equal(f.verify().functionsUnchanged, true);
});

for (const change of ['modify', 'add', 'delete', 'rename']) {
  test(`new committed Functions ${change} still fails`, t => {
    const f = fixture(t);
    if (change === 'modify') f.write('functions/runtime.js', 'unreviewed\n');
    if (change === 'add') f.write('functions/new.js', 'new\n');
    if (change === 'delete') fs.unlinkSync(path.join(f.cwd, 'functions/runtime.js'));
    if (change === 'rename') fs.renameSync(path.join(f.cwd, 'functions/runtime.js'), path.join(f.cwd, 'functions/renamed.js'));
    f.commit();
    assert.throws(() => f.verify(), /FUNCTIONS_CHANGED/);
  });
}

test('wrong branch, missing baseline and unrelated ancestry all fail closed', t => {
  const f = fixture(t);
  assert.throws(() => f.verify({ refName: 'main' }), /WRONG_BRANCH/);
  assert.throws(() => f.verify({ baseline: '0000000000000000000000000000000000000000' }));
  f.git('checkout', '--orphan', 'other'); f.git('rm', '-rf', '.');
  f.write('other.js', 'unrelated\n'); const unrelated = f.commit();
  f.git('checkout', '--detach', f.baseline);
  assert.throws(() => f.verify({ baseline: unrelated }));
});

test('unstaged, staged and untracked Functions changes cannot enter certification', t => {
  const f = fixture(t);
  f.write('functions/runtime.js', 'dirty\n');
  assert.throws(() => f.verify());
  f.git('add', '.'); assert.throws(() => f.verify());
  f.git('reset', '--hard', f.baseline);
  f.write('functions/untracked.js', 'untracked\n');
  assert.throws(() => f.verify(), /FUNCTIONS_UNTRACKED/);
});

test('a missing Git repository fails instead of reporting an unchanged tree', t => {
  const f = fixture(t);
  fs.rmSync(path.join(f.cwd, '.git'), { recursive: true });
  assert.throws(() => f.verify());
});

const localWorkflow = fs.readFileSync(new URL('../.github/workflows/v139-real-reel-e2e-cert.yml', import.meta.url), 'utf8').replace(/\r/g, '');
const externalWorkflow = fs.readFileSync(new URL('../.github/workflows/v139-legacy-external-reel.yml', import.meta.url), 'utf8').replace(/\r/g, '');

test('automatic certification contains tests and the guard, never external credentials or the live reel', () => {
  assert.match(localWorkflow, /  push:\n/);
  assert.match(localWorkflow, /  workflow_dispatch: \{\}/);
  assert.match(localWorkflow, /  certify-v139:\n    runs-on: ubuntu-latest/);
  assert.match(localWorkflow, /node \.github\/scripts\/v139-functions-guard\.mjs/);
  assert.match(localWorkflow, /node --test tests\/v139-functions-guard\.test\.mjs/);
  assert.match(localWorkflow, /run: npm run ci:test/);
  assert.doesNotMatch(localWorkflow.slice(localWorkflow.indexOf('\njobs:')), /secrets\.|v139-canonical-real-reel|real-reel-e2e:|Start-Process|GoogleGenAI|authorize_paid_external_reel/);
  assert.match(localWorkflow, /V139_LOCAL_COMPATIBILITY_TESTS_ONLY=true/);
  assert.doesNotMatch(localWorkflow, /V139_CANONICAL_REAL_REEL_E2E_GREEN/);
});

test('historical providers are isolated behind manual explicit opt-in that defaults to false', () => {
  const triggers = externalWorkflow.slice(externalWorkflow.indexOf('\non:\n'), externalWorkflow.indexOf('\npermissions:'));
  assert.match(triggers, /  workflow_dispatch:\n/);
  assert.doesNotMatch(triggers, /push:|pull_request:|schedule:|workflow_run:|workflow_call:/);
  assert.match(triggers, /authorize_paid_external_reel:[\s\S]*type: boolean\n        default: false/);
  assert.match(externalWorkflow, /if: \$\{\{ github.event_name == 'workflow_dispatch' && inputs.authorize_paid_external_reel == true \}\}/);
  assert.match(externalWorkflow, /node \.github\/scripts\/v139-functions-guard\.mjs/);
  assert.doesNotMatch(externalWorkflow, /continue-on-error|\|\| true/);
});

test('moving historical certification preserves its canonical mission and Windows marker byte for byte', () => {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const original = execFileSync('git', ['show', `${FUNCTIONS_BASELINE}:.github/workflows/v139-real-reel-e2e-cert.yml`], { cwd, encoding: 'utf8' }).replace(/\r/g, '');
  const marker = '      - name: Start bridge and run canonical real-reel mission in same step';
  assert.ok(original.includes(marker));
  assert.equal(externalWorkflow.slice(externalWorkflow.indexOf(marker)), original.slice(original.indexOf(marker)));
});
