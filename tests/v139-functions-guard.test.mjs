import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyFunctionsBaseline, CERTIFICATION_BRANCH } from '../.github/scripts/v139-functions-guard.mjs';

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
