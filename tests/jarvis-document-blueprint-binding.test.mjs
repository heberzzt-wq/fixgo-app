import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ensureExecutableArtifactDependencies} from '../gestia-core/jarvis/jarvis.mission.dependencies.js';

// Exercise the actual browser executor block without loading Firebase or a DOM.
const source=fs.readFileSync(new URL('../gestia-core/gestia-core.js',import.meta.url),'utf8');
const start=source.search(/const blueprint(?:Task|Binding) =/);
const end=source.indexOf('const directSheetsReady =',start);
assert.ok(start>=0&&end>start);
const bind=new Function('missionContext','executionCall','const call=executionCall;let argumentGrounded=false;'+source.slice(start,end)+';return executionCall;');
const prose=(title,format='pdf')=>({name:'document.compose',args:{title,format},observation:{preparedArtifact:{title,format,content:'EXCLUSIVE '+title,validationPassed:true,compositionComplete:true,completionMarkerPresent:true}}});
const sheet=title=>({name:'spreadsheet.compose',args:{title},observation:{preparedArtifact:{title,sheets:[{name:'Datos',rows:[['Dato',1]]}],formulaValidationPassed:true}}});
const create=(title,format='pdf')=>({name:'document.create',args:{title,format,output:title+'.'+format}});
const execute=(completed,call)=>bind({completedTasks:completed},structuredClone(call));

test('real dependency ordering keeps each same-format document bound to its own composition',()=>{
 const ordered=ensureExecutableArtifactDependencies({toolCalls:[prose('Manual'),create('Manual'),prose('Cotizacion'),create('Cotizacion')]});
 assert.deepEqual(ordered.map(x=>x.name),['document.compose','document.compose','document.create','document.create']);
 const completed=ordered.filter(x=>x.name==='document.compose');
 for(const call of ordered.filter(x=>x.name==='document.create')){
  const result=execute(completed,call);
  assert.equal(result.args.title,call.args.title);
  assert.equal(result.args.output,call.args.output);
  assert.equal(result.args.content,'EXCLUSIVE '+call.args.title);
 }
});
test('mixed spreadsheet and prose compositions never change the requested format',()=>{
 const completed=[prose('Informe'),sheet('Gastos')];
 assert.equal(execute(completed,create('Informe')).args.content,'EXCLUSIVE Informe');
 assert.equal(execute(completed,create('Informe')).args.format,'pdf');
 const workbook=execute(completed,create('Gastos','xlsx'));
 assert.equal(workbook.args.format,'xlsx');assert.deepEqual(workbook.args.sheets,completed[1].observation.preparedArtifact.sheets);
});
test('ambiguous or contradictory composition identities fail closed',()=>{
 for(const [completed,call] of [
  [[prose('Uno'),prose('Dos')],{name:'document.create',args:{format:'pdf'}}],
  [[prose('Uno')],create('Otro')],
  [[prose('Igual'),prose('Igual')],create('Igual')],
  [[{...prose('Informe'),args:{title:'Informe',format:'pdf',output:'otro.pdf'}}],create('Informe')]
 ]){
  const result=execute(completed,call);
  assert.equal(result.ok,false);assert.equal(result.blocked,true);assert.equal(result.retryable,false);
  assert.match(result.error,/DOCUMENT_BLUEPRINT_(AMBIGUOUS|IDENTITY_MISMATCH)/);
 }
});
test('one compatible unnamed destination preserves existing composition behavior',()=>{
 const result=execute([prose('Informe')],{name:'document.create',args:{format:'pdf',output:'resultado.pdf'}});
 assert.equal(result.args.content,'EXCLUSIVE Informe');assert.equal(result.args.output,'resultado.pdf');
 const direct=create('Presentacion','pptx');direct.args.slides=[{title:'Inicio'}];
 assert.deepEqual(execute([prose('Informe')],direct),direct);
});

test('composer plan identity remains authoritative when generated content chooses a display title',()=>{
 const planned=prose('Gastos de Prueba');
 planned.observation.preparedArtifact.title='Control de gastos';
 const result=execute([prose('Otro'),planned],create('Gastos de Prueba'));
 assert.notEqual(result.ok,false,'Generated headings must not break the explicit plan identity');
 assert.equal(result.args.output,'Gastos de Prueba.pdf');
 assert.equal(result.args.content,'EXCLUSIVE Gastos de Prueba');
 assert.equal(result.args.format,'pdf');
});
