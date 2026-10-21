import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isEngineeringMission, codeCandidates, validateEngineeringPatch, physicalTestVerdict, engineeringEvidence,
  engineeringNextAction, PAYOUT_SECURITY_SUITE, PAYOUT_SECURITY_COMMAND
} from '../modules/terminal/qwen-engineering-acceptance.js';

const instruction = 'Audita y corrige el código del repositorio requestPayout, prepara un parche y ejecuta pruebas';
const grep = { name: 'repo.grep', ok: true, args: { term: 'requestPayout' }, observation: { matches: [
  { file: 'modules/terminal/qwen-general-pilot.js' },
  { file: 'functions/secure-entry.js' },
  { file: 'tests/hotfix-legacy.test.mjs' },
  { file: '../private/secrets.js' },
  { file: 'functions/legacy-security-hotfix.js' }
] } };
const read = file => ({ name: 'repo.read', ok: true, args: { file }, observation: { verifiedRead: { file, content: 'export const example = true' } } });
const suite = props => ({ name: 'tests.run', ok: true, args: { command: PAYOUT_SECURITY_SUITE }, observation: {
  exitCode: 0, status: 'PASSED', testsPassed: true, objectiveSatisfied: true,
  verifiedCases: ['negative', 'zero', 'nonfinite', 'idempotence'], ...props
} });

test('classifies code requests without misrouting incidental research or B2C wording', () => {
  assert.equal(isEngineeringMission(instruction), true);
  assert.equal(isEngineeringMission('Investiga mantenimiento preventivo; no modificar código'), false);
  assert.equal(isEngineeringMission('Investiga diabetes tipo 2 y genera PDF'), false);
  assert.equal(isEngineeringMission('Corrige un bug del backend sin despliegues'), true);
});

test('finds actual canonical source and tests before self-referential runtime files', () => {
  assert.deepEqual(codeCandidates(grep).slice(0,3), [
    'functions/legacy-security-hotfix.js', 'functions/secure-entry.js', 'tests/hotfix-legacy.test.mjs'
  ]);
  assert.equal(codeCandidates(grep).includes('../private/secrets.js'), false);
});

test('runs only predefined approved host suite; no arbitrary shell tool', () => {
  assert.equal(PAYOUT_SECURITY_COMMAND, 'node --test tests/hotfix-legacy.test.mjs tests/secure-financial-entry.test.mjs');
  const first = engineeringNextAction({ instruction, allowedTools: ['repo.grep','repo.read','tests.run'] });
  assert.deepEqual(first, { type: 'tool', name: 'repo.grep', args: { term: 'requestPayout' } });
  const next = engineeringNextAction({ instruction, receipts: [grep], allowedTools: ['repo.grep','repo.read','tests.run'] });
  assert.deepEqual(next, { type: 'tool', name: 'repo.read', args: { file: 'functions/legacy-security-hotfix.js' } });
  const readTwo = [read('functions/legacy-security-hotfix.js'), read('functions/secure-entry.js'), read('tests/hotfix-legacy.test.mjs')];
  const scheduled = engineeringNextAction({ instruction, receipts: [grep, ...readTwo], allowedTools: ['repo.grep','repo.read','tests.run'] });
  assert.deepEqual(scheduled, { type: 'tool', name: 'tests.run', args: { command: 'pilot:security' } });
});

test('executed process is not the same as passing tests', () => {
  assert.equal(physicalTestVerdict(suite({exitCode:1, status:'TESTS_NOT_PASSING'})).passed, false);
  assert.equal(physicalTestVerdict(suite({testsPassed:false})).passed, false);
  assert.equal(physicalTestVerdict(suite({status:'COMMAND_NOT_ALLOWED'})).passed, false);
  assert.equal(physicalTestVerdict(suite()).passed, true);
});

test('green tests alone never certify a requested patch or unobserved cases', () => {
  const receipts = [grep, read('functions/secure-entry.js'), read('tests/hotfix-legacy.test.mjs'), suite()];
  const e = engineeringEvidence(receipts, { instruction, requiredCases: ['negative','zero','nonfinite','idempotence','concurrency'] });
  assert.equal(e.ok, false);
  assert.ok(e.failures.includes('REQUIRED_REGRESSION_CASES_NOT_PROVEN'));
  assert.ok(e.failures.includes('CODE_PATCH_PREVIEW_REQUIRED'));
  assert.ok(e.failures.includes('ISOLATED_BEFORE_AFTER_TESTS_REQUIRED'));
});

test('already-correct outcome allowed only with host verification for every requested case', () => {
  const receipts = [grep, read('functions/secure-entry.js'), read('tests/hotfix-legacy.test.mjs'),
    suite({existingFixVerified:true})];
  const e = engineeringEvidence(receipts, {instruction, requiredCases: ['negative','zero','nonfinite','idempotence']});
  assert.equal(e.ok, true);
  assert.equal(e.noChangeNeeded, true);
  const fake = engineeringEvidence(receipts.slice(0,-1).concat(suite()),
    {instruction, requiredCases:['negative','zero','nonfinite','idempotence']});
  assert.equal(fake.ok, false);
});

test('a write instruction does not authorize write tools as receipts', () => {
  const receipts = [grep, read('functions/secure-entry.js'), read('tests/hotfix-legacy.test.mjs'),
    suite({existingFixVerified:true}),
    {name:'repo.write',ok:true,observation:{executionOk:true}}];
  assert.equal(engineeringEvidence(receipts,{instruction}).ok,false);
  assert.ok(engineeringEvidence(receipts,{instruction}).forbiddenSideEffects.includes('repo.write'));
});

test('after tests a model-proposed patch can be prepared only when exact source appears once', () => {
  const source = 'const amount = input.amount; if (amount < 0) throw Error();';
  const readActual = {name:'repo.read',ok:true,args:{file:'functions/secure-entry.js'},
    observation:{verifiedRead:{file:'functions/secure-entry.js',content:source}}};
  const patch = {file:'functions/secure-entry.js',operation:'replace',
    search:'if (amount < 0)',replace:'if (!Number.isFinite(amount) || amount <= 0)',matchCount:1};
  const result = engineeringNextAction({instruction,receipts:[grep,readActual,read('tests/hotfix-legacy.test.mjs'),suite()],
    allowedTools:['repo.grep','repo.read','tests.run','repo.prepareWrite'],proposedPatch:patch});
  assert.equal(result.type,'tool');
  assert.equal(result.name,'repo.prepareWrite');
  assert.equal(result.args.matchCount,1);
  assert.equal(validateEngineeringPatch({...patch,file:'functions/other.js'},[readActual]).ok,false);
  assert.equal(validateEngineeringPatch({...patch,search:'missing original code'},[readActual]).ok,false);
  assert.equal(validateEngineeringPatch({...patch,search:'',matchCount:0},[readActual]).ok,false);
  assert.equal(validateEngineeringPatch({...patch,operation:'create'},[readActual]).ok,false);
  assert.equal(validateEngineeringPatch({...patch,file:'../../something'},[readActual]).ok,false);
});
