import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {REPO_ROOT,updateDailyManifest} from '../scripts/platform-manifest-daily-v142.mjs';

test('one committed SHA produces an immutable per-commit receipt outside Git without claiming production', async()=>{
 const destination=mkdtempSync(join(tmpdir(),'v142-manifest-hook-'));
 try {
  const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:REPO_ROOT,encoding:'utf8'}).trim();
  const result=await updateDailyManifest({root:REPO_ROOT,destination,runTests:false});
  const receipt=join(destination,'commits',sha+'.json');
  assert.equal(result.commitReceipt,receipt);
  assert.equal(existsSync(receipt),true);
  const body=JSON.parse(readFileSync(receipt,'utf8'));
  assert.equal(body.repo.head,sha);
  assert.equal(body.tests.status,'NOT_EXECUTED');
  assert.equal(body.evidence.productionCertified,false);
  assert.equal(body.evidence.updatedStatusesAutomatically,false);
  assert.equal(existsSync(join(destination,'ultimo.md')),true);
  assert.match(readFileSync(new URL('../.githooks/post-commit',import.meta.url),'utf8'),/platform-manifest-daily-v142\.mjs --no-tests/);
 } finally {rmSync(destination,{recursive:true,force:true});}
});
