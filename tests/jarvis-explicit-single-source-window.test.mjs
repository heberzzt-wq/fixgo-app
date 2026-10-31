import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {explicitSingleRepositoryReadScope,auditExplicitRepositoryRead,stripModelRepositoryReadReceipt} from '../gestia-core/jarvis/jarvis.current-turn-scope.js';
import {composeEvidenceGroundedConversation} from '../gestia-core/jarvis/jarvis.conversation.composer.js';

const instruction = 'Lee únicamente las líneas 1 a 40 del archivo app-main.js del repositorio fixgo-app, rama v142-official. Indica qué contiene el fragmento y confirma cuántas líneas pudiste leer. No modifiques archivos ni ejecutes comandos. Si falla, informa el código exacto del error y no repitas la operación.';

test('owner mobile single-source request preserves the exact source window', () => {
  assert.deepEqual(explicitSingleRepositoryReadScope(instruction),
    {file:'app-main.js',startLine:1,endLine:40});
});

test('unrelated, mixed, unsafe and non-explicit requests are not silently restricted', () => {
  for(const prompt of [
    'Lee app-main.js y resume sus funciones.',
    'Lee las líneas 1 a 40 del archivo app-main.js.',
    'Lee únicamente las líneas 1 a 40 del archivo app-main.js y src/other.js.',
    'Lee únicamente las líneas 20 a 1 del archivo app-main.js.',
    'Lee únicamente las líneas 1 a 40 del archivo ../private.js.',
    'Lee únicamente las líneas 1 a 1400 del archivo app-main.js.'
  ]) assert.equal(explicitSingleRepositoryReadScope(prompt),null,prompt);
});

test('bounded source audit counts only actually recorded repo reads', () => {
  const receipt={name:'repo.read',args:{file:'app-main.js',startLine:1,endLine:40},
    observation:{ok:true,executionOk:true,verifiedRead:{file:'app-main.js',
      startLine:1,endLine:40,totalLines:1674,partial:true,content:'header\\nimport\\n'}}};
  const one=auditExplicitRepositoryRead({instruction,completedTasks:[receipt]});
  assert.equal(one.recordedReadAttempts,1);
  assert.equal(one.outsideScope,0);
  assert.equal(one.exactlyOneRecordedRead,true);
  assert.equal(one.verifiedRequestedWindow,true);
  const extra={...structuredClone(receipt),args:{file:'app-main.js',startLine:41,endLine:160},
    observation:{ok:true,verifiedRead:{file:'app-main.js',startLine:41,endLine:160,content:'extra'}}};
  const two=auditExplicitRepositoryRead({instruction,completedTasks:[receipt,extra]});
  assert.equal(two.recordedReadAttempts,2);
  assert.equal(two.outsideScope,1);
  assert.equal(two.exactlyOneRecordedRead,false);
  const failed=auditExplicitRepositoryRead({instruction,blockedTasks:[{name:'repo.read',
    args:{file:'app-main.js',startLine:1,endLine:40},observation:{ok:false}}]});
  assert.equal(failed.recordedReadAttempts,1);
  assert.equal(failed.verifiedRequestedWindow,false);
  assert.equal(auditExplicitRepositoryRead({instruction:'Lee todo app-main.js',
    completedTasks:[receipt]}),null);
});

test('exact Android contradiction is eliminated without removing Qwen source explanation', () => {
  const audit={file:'app-main.js',startLine:1,endLine:40,recordedReadAttempts:1,
    insideScope:1,outsideScope:0,verifiedRequestedWindow:true};
  const original=[
    'El fragmento contiene encabezados del controlador.',
    'Recibo técnico de la misión:',
    '1. Se registraron 2 operaciones repo.read.',
    '2. No se realizaron lecturas fuera del archivo.',
    '3. Las líneas 1 a 40 tienen evidencia.'
  ].join(String.fromCharCode(10));
  const stripped=stripModelRepositoryReadReceipt(original,audit);
  assert.match(stripped,/El fragmento contiene encabezados/);
  assert.doesNotMatch(stripped,/Se registraron 2|Recibo técnico de la misión/);
  assert.equal(stripModelRepositoryReadReceipt(original,null),original);
  const other=['Se registraron 2 operaciones repo.read.','El controlador existe.'].join(String.fromCharCode(10));
  assert.equal(stripModelRepositoryReadReceipt(other,audit),'El controlador existe.');
});

test('Qwen receives the canonical audit before drafting and cannot treat duplicated evidence as multiple calls',async()=>{
  const audit={file:'app-main.js',startLine:1,endLine:40,recordedReadAttempts:1,
    insideScope:1,outsideScope:0,verifiedRequestedWindow:true};
  let prompt='';
  const result=await composeEvidenceGroundedConversation({
    instruction,
    evidenceItems:[
      {name:'mission.outcome',observation:{status:'COMPLETED',ok:true,boundedReadAudit:audit}},
      {name:'repo.read',args:{file:'app-main.js',startLine:1,endLine:40},observation:{
        ok:true,executionOk:true,status:'SUCCESS',verifiedRead:{tool:'repo.read',file:'app-main.js',
        startLine:1,endLine:40,totalLines:1674,partial:true,content:'/**\\n * header\\n'}}}
    ],
    executeConversation:async p=>{prompt=p;return {ok:true,data:{ok:true,message:'El fragmento contiene imports y versiones.'}};}
  });
  assert.equal(result.ok,true);
  assert.match(prompt,/CONTEO_CANONICO_REPO_READ/);
  assert.match(prompt,/"recordedReadAttempts":1/);
  assert.match(prompt,/no la cuentes dos veces/);
});

test('final message displays mission read audit without claiming network telemetry', () => {
  const core=readFileSync(new URL('../gestia-core/gestia-core.js',import.meta.url),'utf8');
  assert.ok(core.includes('auditExplicitRepositoryRead({'));
  assert.match(core,/recordedReadAttempts/);
  assert.match(core,/outsideScope/);
  assert.match(core,/boundedReadAudit,/);
  assert.match(core,/no tráfico de red/);
});

test('local mission gates audit and argument-completion tools before any execution', () => {
  const core=readFileSync(new URL('../gestia-core/gestia-core.js',import.meta.url),'utf8');
  assert.match(core,/missionContractToolCalls\s*=\s*\[\{\s*name: "repo.read", args: \{\.\.\.explicitNarrowReadScope\}/);
  assert.match(core,/completionAuditToolCalls\.find\(call =>\s*allowedSingleSourceAction\(call\)/);
  assert.match(core,/nextToolCalls\.filter\(allowedSingleSourceAction\)/);
  assert.match(core,/if \(!allowedSingleSourceAction\(executionCall\)\) return \[\{/);
  const planner=readFileSync(new URL('../functions/jarvis-semantic-planner.js',import.meta.url),'utf8');
  assert.match(planner,/Un aviso condicional como si falla informa el error no obliga/);
});
