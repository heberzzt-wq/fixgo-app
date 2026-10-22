import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import {verifyXlsxWorkbookCalculations} from '../jarvis-xlsx-calculation.js';
import {unfulfilledDownloadFormats} from '../modules/terminal/qwen-general-contract.js';

test('XLSX physical recalculation verifies SUM and dependent balance, never invents cached results',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-xlsx-recalc-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Control');
 [['Concepto','Monto'],['Saldo inicial',5000],['Pago 1',1250],['Pago 2',800],['Pago 3',450],
  ['Total pagado',{formula:'SUM(B3:B5)'}],['Saldo pendiente',{formula:'B2-B6'}]]
 .forEach(r=>sheet.addRow(r));
 const file=path.join(dir,'calculo.xlsx');await book.xlsx.writeFile(file);
 const result=await verifyXlsxWorkbookCalculations(file,{requireFormulas:true});
 assert.equal(result.verified,true,JSON.stringify(result.failures));
 assert.equal(result.formulaCount,2);
 assert.deepEqual(result.results.map(x=>x.value),[2500,2500]);
 assert.match(result.sourceSha256,/^[a-f0-9]{64}$/);
 sheet.getCell('B6').value={formula:'B7-B2'};
 await book.xlsx.writeFile(file);
 const invalid=await verifyXlsxWorkbookCalculations(file,{requireFormulas:true});
 assert.equal(invalid.verified,false);
 assert.match(invalid.failures[0].reason,/XLSX_CIRCULAR_REFERENCE/);
});
test('unknown formula fails closed and formulas are required when requested',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-xlsx-unsupported-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Control');
 sheet.addRow(['Monto',3]);const file=path.join(dir,'check.xlsx');await book.xlsx.writeFile(file);
 assert.equal((await verifyXlsxWorkbookCalculations(file,{requireFormulas:true})).verified,false);
 sheet.getCell('C2').value={formula:'NOW()'};await book.xlsx.writeFile(file);
 const result=await verifyXlsxWorkbookCalculations(file,{requireFormulas:true});
 assert.equal(result.verified,false);
 assert.match(result.failures[0].reason,/NOT_SUPPORTED/);
});
test('full original Excel/PDF physical receipts are accredited only after SHA-bound independent calculation',async()=>{
 const file='C:/Users/heber/Downloads/general-5f0a938d-b2b8-4497-bb95-8cdf68a38a12.json';
 const receipt=JSON.parse(fs.readFileSync(file,'utf8')).receipts;
 const instruction='Crea un XLSX y PDF con fórmulas y saldo';
 assert.deepEqual(unfulfilledDownloadFormats(instruction,receipt),['pdf','xlsx'].filter(x=>x==='xlsx'));
 const rows=structuredClone(receipt),xlsx=rows.find(x=>x.name==='document.create'&&x.args.format==='xlsx');
 const real='.jarvis-artifacts/qwen-general/general-5f0a938d-b2b8-4497-bb95-8cdf68a38a12/deuda_control.xlsx';
 assert.equal(xlsx.observation.output,real);
 const calc=await verifyXlsxWorkbookCalculations(path.resolve(real),{requireFormulas:true});
 xlsx.observation.workbookCalculationVerified=calc.verified;
 xlsx.observation.workbookCalculation=calc;
 assert.deepEqual(unfulfilledDownloadFormats(instruction,rows),[]);
 xlsx.observation.workbookCalculation.sourceSha256='f'.repeat(64);
 assert.deepEqual(unfulfilledDownloadFormats(instruction,rows),['xlsx']);
});

test('restricted recalculation covers monetary cell multiplication/division while guarding zero divisor and unsafe formulas',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-xlsx-safe-arithmetic-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('APU');
 sheet.addRow(['Concepto','Cantidad','Precio','Importe']);
 sheet.addRow(['Block supuesto',13,20,{formula:'B2*C2'}]);
 sheet.addRow(['Costo directo',null,null,{formula:'SUM(D2:D2)'}]);
 sheet.addRow(['Relación',2,1,{formula:'B4/C4'}]);
 const file=path.join(dir,'apu.xlsx');
 await book.xlsx.writeFile(file);
 const result=await verifyXlsxWorkbookCalculations(file,{requireFormulas:true});
 assert.equal(result.verified,true,JSON.stringify(result.failures));
 assert.deepEqual(result.results.map(x=>[x.cell,x.value]),[['D2',260],['D3',260],['D4',2]]);
 sheet.getCell('C4').value=0;await book.xlsx.writeFile(file);
 const zero=await verifyXlsxWorkbookCalculations(file,{requireFormulas:true});
 assert.equal(zero.verified,false);
 assert.ok(zero.failures.some(x=>x.reason==='XLSX_DIVISION_BY_ZERO'));
 sheet.getCell('D4').value={formula:'WEBSERVICE("https://example.invalid")'};
 await book.xlsx.writeFile(file);
 const unsafe=await verifyXlsxWorkbookCalculations(file,{requireFormulas:true});
 assert.equal(unsafe.verified,false);
 assert.match(unsafe.failures[0].reason,/NOT_SUPPORTED_FOR_VERIFIED_RECALC/);
});
