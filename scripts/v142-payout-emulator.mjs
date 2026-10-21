// V142: run real, isolated Firestore emulator payout regression tests.
// Inputs are fixed by the host, not generated as shell commands by the model.
// A portable user-owned Java 21 runtime is preferred on Windows when present.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import process from 'node:process';

export const FIRESTORE_TEST_COMMAND = 'node --test tests/hotfix-legacy-emulator.test.mjs';
export const FIRESTORE_TEST_PROJECT = 'fixgo-b2c-rules-test';

export function emulatorLaunchPlan({
  home = homedir(), win = process.platform === 'win32', env = process.env,
  exists = existsSync, node = process.execPath
} = {}) {
  const globalCli = win
    ? join(home, 'AppData', 'Roaming', 'npm', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js')
    : join(process.cwd(), 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
  const localCli = join(process.cwd(), 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
  const cli = [localCli, globalCli].find(exists);
  if (!cli) return { ok: false, reason: 'FIREBASE_CLI_NOT_INSTALLED' };
  const portable = join(home, 'Documents', 'Codex', 'tools', 'temurin-jre-21');
  const javaHome = env.JARVIS_PORTABLE_JAVA_HOME || (win && exists(join(portable,'bin','java.exe')) ? portable : env.JAVA_HOME);
  const childEnv = { ...env, CI: 'true', GOOGLE_CLOUD_PROJECT: FIRESTORE_TEST_PROJECT };
  if (javaHome) {
    childEnv.JAVA_HOME = javaHome;
    childEnv.PATH = join(javaHome, 'bin') + delimiter + String(env.PATH || '');
  }
  return {
    ok: true, command: node, args: [cli, 'emulators:exec', '--project', FIRESTORE_TEST_PROJECT,
      '--only', 'firestore', FIRESTORE_TEST_COMMAND],
    env: childEnv, shell: false
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const plan = emulatorLaunchPlan();
  if (!plan.ok) {
    console.error('[V142_EMULATOR_UNAVAILABLE]', plan.reason);
    process.exitCode = 2;
  } else {
    const child = spawn(plan.command, plan.args, { cwd: process.cwd(), env: plan.env,
      shell: false, stdio: 'inherit', windowsHide: true });
    child.on('error', err => {
      console.error('[V142_EMULATOR_LAUNCH_FAILED]', err.message);
      process.exitCode = 2;
    });
    child.on('exit', (code, signal) => {
      process.exitCode = signal ? 2 : Number.isInteger(code) ? code : 2;
    });
  }
}
