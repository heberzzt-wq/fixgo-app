import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Reviewed integrated Functions baseline; see ../v139-functions-baseline.md.
export const FUNCTIONS_BASELINE = 'c4d03e2e16dd789fb228b57e69f0f8fa71aed8d6';
export const CERTIFICATION_BRANCH = 'v94-media-v4n-negative-claims';

export function verifyFunctionsBaseline({ cwd = process.cwd(), refName = process.env.GITHUB_REF_NAME, baseline = FUNCTIONS_BASELINE } = {}) {
  if (refName !== CERTIFICATION_BRANCH) throw new Error('WRONG_BRANCH');
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  // Missing history, Git errors and a baseline outside HEAD ancestry all fail closed.
  git('rev-parse', '--verify', `${baseline}^{commit}`);
  git('merge-base', '--is-ancestor', baseline, 'HEAD');
  const changed = git('diff', '--name-only', `${baseline}..HEAD`, '--', 'functions/');
  if (changed) throw new Error(`FUNCTIONS_CHANGED_SINCE_REVIEWED_BASELINE:${baseline}\n${changed}`);
  git('diff', '--exit-code', 'HEAD', '--', 'functions/');
  const untracked = git('ls-files', '--others', '--exclude-standard', '--', 'functions/');
  if (untracked) throw new Error(`FUNCTIONS_UNTRACKED:${untracked}`);
  return { baseline, head: git('rev-parse', 'HEAD'), functionsUnchanged: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log('V139_FUNCTIONS_BASELINE_VERIFIED', JSON.stringify(verifyFunctionsBaseline()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
