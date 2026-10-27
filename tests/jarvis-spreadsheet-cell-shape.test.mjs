import test from 'node:test';import assert from 'node:assert/strict';
import {registerJarvisMultifunctionTools} from '../gestia-core/jarvis/jarvis.multitool.pack.js';
test('spreadsheet composition cannot certify a nested row as a cell',async()=>{
 const previous=globalThis.JarvisLocalBridge,tools=new Map();let calls=0;
 registerJarvisMultifunctionTools({register:t=>tools.set(t.name,t)});
 globalThis.JarvisLocalBridge={requestJson:async()=>++calls===1?{ok:true,message:JSON.stringify({title:'Gastos',sheets:[{name:'Gastos',rows:[['Descripcion','Categoria','Monto'],['cable','Materiales',120],[['tornillos','Materiales',80]],['transporte','Servicios',50],['Total','=SUM(C3:C5)']]}]})}:{ok:false,error:'NO_REPAIR_IN_TEST'}};
 try{const result=await tools.get('spreadsheet.compose').execute({title:'Gastos',instructions:'Crear gastos',requireFormulas:true},{rawInput:'Crea un Excel de gastos.'});
 assert.equal(result.ok,false);assert.ok(result.invalidFormulas.some(x=>x.issue==='WORKBOOK_CELL_VALUE_INVALID'));
 }finally{globalThis.JarvisLocalBridge=previous;}
});
