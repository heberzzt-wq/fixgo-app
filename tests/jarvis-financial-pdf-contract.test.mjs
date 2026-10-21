import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import PDFDocument from 'pdfkit';
import {verifyPdfContentPhysically} from '../jarvis-pdf-content-proof.js';
import {financialRequestedAmounts,verifiedFinancialPdfFromWorkbook,verifiedFinancialPdfContent,unfulfilledDownloadFormats,prioritizeGeneralOfficeCatalog} from '../modules/terminal/qwen-general-contract.js';
const source='C:/Users/heber/Downloads/general-90460367-289b-4c6d-9c74-4bf8f13d9cfc.json';
const instruction='Crea XLSX y PDF: deuda inicial 5000 MXN, pago 1 de 1250 MXN, pago 2 de 800 MXN, pago 3 de 450 MXN, total pagado 2500 MXN y saldo pendiente 2500 MXN. Estos movimientos son ficticios.';
const inputs=()=>JSON.parse(fs.readFileSync(source,'utf8')).receipts;
const xlsxOnly=()=>inputs().filter(r=>r.observation?.output?.endsWith('.xlsx'));
const tool={name:'document.create',inputSchema:{type:'object',properties:{format:{type:'string'},content:{type:'string'},output:{type:'string'}},required:[]}};
test('old false positive fails finance PDF and real XLSX binds factual content',()=>{
 const original=inputs();
 assert.deepEqual(financialRequestedAmounts(instruction),[5000,1250,800,450,2500]);
 assert.deepEqual(unfulfilledDownloadFormats(instruction,original),['pdf']);
 const xlsx=xlsxOnly();
 const grounded=verifiedFinancialPdfFromWorkbook(instruction,xlsx);
 assert.ok(grounded.includes('$5,000 MXN')&&grounded.includes('$1,250 MXN'));
 assert.ok(grounded.includes('Saldo pendiente: $2,500 MXN'));
 const ordered=prioritizeGeneralOfficeCatalog([tool],[],instruction);
 assert.deepEqual(ordered[0].inputSchema.properties.format.enum,['xlsx']);
 const pdfTool=prioritizeGeneralOfficeCatalog([tool],xlsx,instruction);
 assert.deepEqual(pdfTool[0].inputSchema.properties.format.enum,['pdf']);
 assert.equal(pdfTool[0].inputSchema.properties.content.const,grounded);
 assert.equal(verifiedFinancialPdfContent(instruction,original),false);
});
test('read real PDF bytes, certify required financial figures; rejection remains on falsified SHA or missing amount',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-pdf-facts-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const f=path.join(dir,'report.pdf'),text=verifiedFinancialPdfFromWorkbook(instruction,xlsxOnly());
 await new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'A4',margin:54}),stream=fs.createWriteStream(f);
  stream.on('finish',resolve);stream.on('error',reject);
  doc.pipe(stream);doc.fontSize(16).text('Reporte financiero de prueba');doc.moveDown();doc.fontSize(10).text(text);doc.end();
 });
 const proof=await verifyPdfContentPhysically(f);
 assert.equal(proof.verified,true);
 for(const number of ['5000','1250','800','450','2500'])
  assert.ok(proof.extractedText.replace(/[,$\s]/g,'').includes(number),number);
 const bytes=fs.readFileSync(f),sha=createHash('sha256').update(bytes).digest('hex');
 const output='.jarvis-artifacts/qwen-general/general-example/reporte.pdf';
 const rows=xlsxOnly().concat([
  {name:'document.create',ok:true,args:{format:'pdf',content:text,output},observation:{ok:true,output,sha256:sha,artifact:{file:output,sha256:sha,mimeType:'application/pdf'},pdfContentProof:proof}},
  {name:'artifact.read',ok:true,args:{output},observation:{ok:true,output,bytes:bytes.length,sha256:sha,dataBase64:bytes.toString('base64')}},
  {name:'media.library',ok:true,args:{action:'export',output},observation:{ok:true,output,sha256:sha,experimental:true}}
 ]);
 assert.equal(verifiedFinancialPdfContent(instruction,rows),true);
 assert.deepEqual(unfulfilledDownloadFormats(instruction,rows),[]);
 const corrupt=structuredClone(rows);corrupt.at(-3).observation.pdfContentProof.sourceSha256='b'.repeat(64);
 assert.deepEqual(unfulfilledDownloadFormats(instruction,corrupt),['pdf']);
 const falseCopy=structuredClone(rows);falseCopy.at(-3).args.content='Reporte sin montos';
 assert.deepEqual(unfulfilledDownloadFormats(instruction,falseCopy),['pdf']);
});

test('financial host injects user-requested numeric XLSX formulas; model cannot silently null B6/B7',async()=>{
 const {financialWorkbookFromInstruction,prioritizeGeneralOfficeCatalog}=await import('../modules/terminal/qwen-general-contract.js');
 const {runQwenAuthorizedCycle}=await import('../jarvis-qwen-direct-cycle.js');
 const instruction='Crea XLSX y PDF: deuda inicial 5000 MXN, pago 1 de 1250 MXN, pago 2 de 800 MXN, pago 3 de 450 MXN, total pagado 2500 MXN y saldo pendiente 2500 MXN. En el XLSX crea hoja llamada Control y usa =SUM(B3:B5) y =B2-B6.';
 const tool={name:'document.create',inputSchema:{type:'object',properties:{
  output:{type:'string'},format:{type:'string'},title:{type:'string'},content:{type:'string'},sheets:{type:'array'},requireFormulas:{type:'boolean'},requireDocumentValidation:{type:'boolean'},documentContract:{type:'object'}
 },required:['output','format','title','content']}};
 const priority=prioritizeGeneralOfficeCatalog([tool],[],instruction)[0];
 const reference=financialWorkbookFromInstruction(instruction).sheets;
 assert.deepEqual(priority.inputSchema.properties.sheets.const,reference);
 let observations=0,toolsOffered=0;
 const result=await runQwenAuthorizedCycle({instruction,catalog:[priority],maximumSteps:4,stepLimit:4,repairIncomplete:true,
  catalogForEvidence:available=>available,
  selectNextAction:async({tools})=>{
   toolsOffered++;
   if(toolsOffered===1){
    assert.equal(tools[0].inputSchema.properties.sheets,undefined);
    assert.equal(tools[0].inputSchema.required.includes('sheets'),false);
    return {toolCall:{name:'document.create',args:{
     format:'xlsx',title:'Control financiero',content:'Datos de prueba',
     output:'.jarvis-artifacts/qwen-general/general-test/control.xlsx',requireFormulas:true,
     requireDocumentValidation:true,documentContract:{documentKind:'original_draft'}
    }}};
   }
   return {finish:true,report:'Documento creado desde datos autorizados.'};
  },
  authorize:async()=>({ok:true}),
  execute:async call=>{observations++;assert.deepEqual(call.args.sheets,reference);assert.equal(call.args.sheets[0].rows[5][1],'=SUM(B3:B5)');assert.equal(call.args.sheets[0].rows[6][1],'=B2-B6');return {ok:true,output:call.args.output};},
  verifyCompletion:async({receipts})=>({ok:receipts.length===1})
 });
 assert.equal(result.status,'SUCCESS');assert.equal(observations,1);
});
