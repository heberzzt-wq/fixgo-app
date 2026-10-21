// V142 engineering mission acceptance contract. Pure, deterministic, read-only.
// This module is intentionally NOT an authorization mechanism or shell runner.
// Pilot integration must use the authenticated ToolsBridge and its host policy.
export const PAYOUT_SECURITY_SUITE = 'pilot:security';
export const PAYOUT_SECURITY_COMMAND = 'node --test tests/hotfix-legacy.test.mjs tests/secure-financial-entry.test.mjs';

const filePattern = /^(?:functions|tests|gestia-core|modules)\/[\w./-]+\.(?:cjs|js|mjs|ts)$/i;
const noControl = /[\0\r\n]/;
const writable = new Set(['repo.write', 'repo.authorizeWrite', 'repo.safePatchApply', 'git.push', 'deploy']);
const engineeringVerb = /\b(?:corrige|corregir|repara|reparar|programa|programar|parche|patch|depura|debug|bug|audita|auditar|implementa|implementar|refactoriza|refactorizar)\b/iu;
const engineeringObject = /\b(?:c[oó]digo|repositorio|repo|software|javascript|typescript|requestpayout|funci[oó]n|m[oó]dulo|aplicaci[oó]n|backend|frontend|tests?|pruebas)\b/iu;

export function isEngineeringMission(instruction) {
  const text = String(instruction || '').trim();
  if (!text) return false;
  if (/\brequestpayout\b/i.test(text)) return true;
  // Instructions describing forbidden code modifications do not request them.
  const affirmative = text.split(/[.;\n]+/u).filter(part => !/^\s*(?:no|sin|nunca|evita|prohibido)\b/iu.test(part));
  return affirmative.some(part => engineeringVerb.test(part) && engineeringObject.test(part));
}

function validRepoPath(file) {
  return typeof file === 'string' && filePattern.test(file) && !file.includes('..') &&
    !noControl.test(file) && !file.startsWith('/') && !file.includes('\\');
}

function priority(file) {
  if (/^functions\/(?:secure-entry|legacy-security-hotfix|b2c-financial-policy|index)\.(?:js|cjs)$/i.test(file)) return 0;
  if (/^functions\//.test(file)) return 1;
  if (/^tests\/(?:secure-financial-entry|hotfix-legacy|hotfix-legacy-emulator)\.test\.mjs$/i.test(file)) return 2;
  if (/^tests\//.test(file)) return 3;
  return 4;
}

export function codeCandidates(grepReceipt, alreadyRead = []) {
  const readSet = new Set(alreadyRead);
  const matches = Array.isArray(grepReceipt?.observation?.matches) ? grepReceipt.observation.matches : [];
  return [...new Set(matches.map(m => m?.file || m?.path || m?.relativePath).filter(validRepoPath))]
    .filter(file => !readSet.has(file))
    .sort((a, b) => priority(a) - priority(b) || a.localeCompare(b));
}

export function validateEngineeringPatch(proposedPatch, receipts = []) {
  if (!proposedPatch || typeof proposedPatch !== 'object' ||
    !validRepoPath(proposedPatch.file) || proposedPatch.operation === 'create')
    return {ok: false, reason: 'PATCH_SCOPE_INVALID'};
  const { file, search, replace, matchCount } = proposedPatch;
  if (typeof search !== 'string' || !search.length ||
    typeof replace !== 'string' || !replace.length || search === replace ||
    matchCount !== 1 || search.length > 20000 || replace.length > 20000)
    return {ok: false, reason: 'PATCH_EXACT_REPLACEMENT_REQUIRED'};
  const source = receipts.find(r => r?.ok === true && r.name === 'repo.read' &&
    r.args?.file === file && r.observation?.verifiedRead?.file === file)?.observation?.verifiedRead?.content;
  if (typeof source !== 'string' || source.split(search).length !== 2)
    return {ok: false, reason: 'PATCH_SOURCE_SNAPSHOT_NOT_MATCHED'};
  return {ok: true, args: {file, operation: 'replace', search, replace, matchCount: 1}};
}

export function physicalTestVerdict(receipt, expectedSuite = PAYOUT_SECURITY_SUITE) {
  if (!receipt || receipt.name !== 'tests.run') return { executed: false, passed: false, reason: 'TEST_RECEIPT_MISSING' };
  const observation = receipt.observation || {};
  const executed = receipt.args?.command === expectedSuite && Number.isInteger(observation.exitCode);
  const passed = executed && receipt.ok === true && observation.exitCode === 0 &&
    observation.testsPassed === true && observation.objectiveSatisfied === true && observation.status === 'PASSED';
  return { executed, passed, reason: !executed ? 'TEST_SCOPE_NOT_PROVEN' : passed ? 'TESTS_VERIFIED_PASS' : 'CODE_TESTS_NOT_PASSING' };
}

export function engineeringEvidence(receipts = [], { instruction = '', requiredCases = [] } = {}) {
  const valid = Array.isArray(receipts) ? receipts : [];
  const successful = valid.filter(r => r?.ok === true);
  const grep = successful.find(r => r.name === 'repo.grep' && Array.isArray(r.observation?.matches));
  const reads = successful.filter(r => r.name === 'repo.read' &&
    validRepoPath(r.args?.file) && r.observation?.verifiedRead?.file === r.args.file &&
    typeof r.observation?.verifiedRead?.content === 'string' && r.observation.verifiedRead.content.length > 0);
  const readFiles = [...new Set(reads.map(r => r.args.file))];
  const tests = [...valid].reverse().find(r => r.name === 'tests.run');
  const test = physicalTestVerdict(tests);
  const observedCases = new Set(Array.isArray(tests?.observation?.verifiedCases) ? tests.observation.verifiedCases : []);
  const absentCases = requiredCases.filter(c => !observedCases.has(c));
  const patch = successful.find(r => r.name === 'repo.prepareWrite' &&
    r.observation?.status === 'WRITE_PREPARED' && r.observation?.written === false &&
    readFiles.includes(r.args?.file) && typeof r.observation?.fingerprint === 'string');
  const forbidden = valid.filter(r => writable.has(r?.name) && r.observation?.executionOk === true);
  const failures = [];
  if (!grep || !grep.observation.matches.length) failures.push('CODE_GREP_EVIDENCE_REQUIRED');
  if (!readFiles.some(f => f.startsWith('functions/'))) failures.push('CANONICAL_CODE_READ_REQUIRED');
  if (!readFiles.some(f => f.startsWith('tests/'))) failures.push('REGRESSION_SOURCE_READ_REQUIRED');
  if (!test.passed) failures.push(test.reason);
  if (absentCases.length) failures.push('REQUIRED_REGRESSION_CASES_NOT_PROVEN');
  if (forbidden.length) failures.push('FORBIDDEN_SIDE_EFFECT_DETECTED');
  const requestedChange = /\b(?:corrige|corregir|repara|reparar|implementa|implementar|parche|patch|aplica)\b/iu.test(instruction);
  // Already-fixed is valid only when host-verified regression receipts prove each requested case.
  // One green suite is not enough.
  const noChangeNeeded = tests?.observation?.existingFixVerified === true && test.passed && !absentCases.length;
  if (requestedChange && !noChangeNeeded) {
    if (!patch) failures.push('CODE_PATCH_PREVIEW_REQUIRED');
    failures.push('ISOLATED_BEFORE_AFTER_TESTS_REQUIRED');
  }
  return {
    ok: failures.length === 0, reason: failures[0] || 'ENGINEERING_EVIDENCE_COMPLETE', failures,
    readFiles, test, verifiedCases: [...observedCases], absentCases,
    patchPrepared: Boolean(patch), noChangeNeeded, forbiddenSideEffects: forbidden.map(r => r.name)
  };
}

export function engineeringNextAction({ instruction = '', receipts = [], allowedTools = [], proposedPatch = null } = {}) {
  if (!isEngineeringMission(instruction)) return { type: 'blocked', reason: 'NOT_AN_ENGINEERING_MISSION' };
  const catalog = new Set(allowedTools);
  // This planner proposes only read/diagnostic and predefined tests.
  const successful = receipts.filter(r => r?.ok === true);
  const grep = successful.find(r => r.name === 'repo.grep');
  if (!grep) return catalog.has('repo.grep')
    ? { type: 'tool', name: 'repo.grep', args: { term: /requestpayout/i.test(instruction) ? 'requestPayout' : 'source' } }
    : { type: 'blocked', reason: 'REPO_GREP_UNAVAILABLE' };
  const anyTest = receipts.find(r => r.name === 'tests.run');
  if (anyTest) {
    const evidence = engineeringEvidence(receipts, { instruction });
    if (evidence.ok) return {type: 'verified', reason: evidence.reason, evidence};
    if (proposedPatch && !receipts.some(r => r.name === 'repo.prepareWrite')) {
      const proposal = validateEngineeringPatch(proposedPatch, receipts);
      if (!proposal.ok) return {type: 'partial', reason: proposal.reason, evidence};
      if (!catalog.has('repo.prepareWrite'))
        return {type: 'partial', reason: 'GOVERNED_PATCH_PREVIEW_TOOL_REQUIRED', evidence};
      return {type: 'tool', name: 'repo.prepareWrite', args: proposal.args};
    }
    return {type: 'partial', reason: evidence.reason, evidence};
  }
  const readFiles = successful.filter(r => r.name === 'repo.read').map(r => r.args?.file);
  const candidate = codeCandidates(grep, readFiles).find(f => priority(f) < 4);
  if (candidate && readFiles.length < 8) return catalog.has('repo.read')
    ? { type: 'tool', name: 'repo.read', args: { file: candidate } }
    : { type: 'blocked', reason: 'REPO_READ_UNAVAILABLE' };
  return catalog.has('tests.run')
    ? { type: 'tool', name: 'tests.run', args: { command: PAYOUT_SECURITY_SUITE } }
    : { type: 'blocked', reason: 'TESTS_RUN_UNAVAILABLE' };
}
