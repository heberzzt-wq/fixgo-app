import test from 'node:test';
import assert from 'node:assert/strict';
import {registerJarvisMultifunctionTools} from '../gestia-core/jarvis/jarvis.multitool.pack.js';
const book = label => ({title:'Gastos',sheets:[{name:'Gastos',rows:[['Concepto','Monto'],[label,80],['Total','=SUM(B2:B2)']]}]});
async function compose(responses, rawInput='Crea Excel con tornillos por 80 y suma total.') {
 const prior=globalThis.JarvisLocalBridge, tools=new Map(), requests=[];
 registerJarvisMultifunctionTools({register:t=>tools.set(t.name,t)});
 globalThis.JarvisLocalBridge={requestJson:async(...args)=>{requests.push(args); const next=responses.shift(); if(!next) throw new Error('Unexpected provider call'); return {ok:true,...next,message:JSON.stringify(next.body)};}};
 try {return {result:await tools.get('spreadsheet.compose').execute({instructions:rawInput,requireFormulas:true},{rawInput}),requests};} finally {globalThis.JarvisLocalBridge=prior;}
}
test('valid formula cannot certify a boolean replacing requested label; semantic feedback repairs same tool',async()=>{
 const {result,requests}=await compose([{body:book(true)},{body:{valid:false,issues:['La etiqueta tornillos fue sustituida por true.']}},{body:book('tornillos')},{body:{valid:true,issues:[]}}]);
 assert.equal(result.ok,true);assert.equal(result.sheets[0].rows[1][0],'tornillos');assert.equal(result.repairCount,1);assert.equal(result.fidelityValidationPassed,true);assert.equal(requests.length,4);
});
test('legitimate boolean is preserved with a valid fidelity review',async()=>{
 const {result}=await compose([{body:book(true)},{body:{valid:true,issues:[]}}],'Crea Excel con Activo true y Monto 80, suma total.');assert.equal(result.ok,true);assert.equal(result.sheets[0].rows[1][0],true);assert.equal(result.fidelityValidationPassed,true);
});
for(const review of [{body:{valid:true,issues:['Dato omitido']}},{body:{valid:true}},{body:{valid:true,issues:[]},partial:true},{body:{valid:true,issues:[]},ok:false}]) test('inconsistent, unavailable or partial review cannot certify '+JSON.stringify(review),async()=>{
 const {result,requests}=await compose([{body:book('tornillos')},review]);assert.equal(result.ok,false);assert.equal(result.objectiveSatisfied,false);assert.equal(result.fidelityValidationPassed,false);assert.equal(requests.length,2);
});
test('unchanged semantic repair stops without granting fidelity',async()=>{
 const {result,requests}=await compose([{body:book(true)},{body:{valid:false,issues:['Etiqueta incorrecta']}},{body:book(true)}]);assert.equal(result.ok,false);assert.equal(result.repairCount,1);assert.equal(requests.length,3);
});
test('fidelity repair is bounded to two attempts even with changing discrepancies',async()=>{
 const {result,requests}=await compose([{body:book(true)},{body:{valid:false,issues:['Etiqueta incorrecta']}},{body:book('otro')},{body:{valid:false,issues:['Concepto ajeno']}},{body:book('ajeno')},{body:{valid:false,issues:['Falta tornillos']}}]);
 assert.equal(result.ok,false);assert.equal(result.repairCount,2);assert.equal(result.fidelityValidationPassed,false);assert.equal(requests.length,6);
});
test('review budget does not silently truncate a large source workbook',async()=>{
 const {result,requests}=await compose([{body:book('x'.repeat(6000))}]);assert.equal(result.ok,false);assert.equal(result.fidelityReview.error,'DOCUMENT_CONTEXT_BUDGET_EXCEEDED');assert.equal(requests.length,1);
});
