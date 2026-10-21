import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptBoundProductionContent,prioritizeReceiptBoundProduction} from '../modules/terminal/qwen-production-document.js';
import {validateProductionDocument} from '../modules/terminal/qwen-general-evidence.js';

const text='Summit. Asesoría fiscal y legal. Conoce el servicio en www.summ.com.mx';
const instruction='Marca: Summit Consulting Group. ÚNICO texto comercial permitido: "'+text+'".';
const sha=n=>String(n).repeat(64);
const receipt=(name,observation,args={})=>({name,ok:true,args,observation:{ok:true,...observation}});
const urls=['https://example.org/a','https://example.org/b'];
const img1={output:'.jarvis-artifacts/images/general-test-a.png',mimeType:'image/png',width:1080,height:1080,sha256:sha('a')};
const img2={output:'.jarvis-artifacts/images/general-test-b.png',mimeType:'image/png',width:1200,height:628,sha256:sha('b')};
const page={output:'.jarvis-artifacts/qwen-general/general-test/index.html',url:'http://127.0.0.1:3347/qwen-artifact?output=landing',sha256:sha('c')};
const screenshot={output:'.jarvis-artifacts/qwen-general/general-test/screenshot.png',mimeType:'image/png',sha256:sha('d')};
const objectives={advertising:true,document:true,page:true,requestedImageFormats:[{width:1080,height:1080},{width:1200,height:628}]};
const fixtures={img1,img2,page,screenshot};
const inventory=()=>{
 const {img1,img2,page,screenshot}=structuredClone(fixtures);
 const rows=[
  receipt('advertising.research',{sources:urls.map(url=>({url})),advertisingSemanticReview:{verified:true,acceptedSourceURLs:urls}}),
  ...urls.map(url=>receipt('browser.inspect',{url,dom:'<main>Principles</main>'},{url})),
  receipt('media.library',{entries:[{ref:'library:logo'}]},{action:'list'}),
  receipt('image.adapt',{outputs:[img1]},{composition:{headline:'Summit. Asesoría fiscal y legal.',body:'Conoce el servicio en www.summ.com.mx'}}),
  receipt('image.adapt',{outputs:[img2]},{composition:{headline:'Summit. Asesoría fiscal y legal.',body:'Conoce el servicio en www.summ.com.mx'}}),
  receipt('page.create',page,{brandName:'Summit Consulting Group'}),
  receipt('browser.open',{url:page.url},{url:page.url}),
  receipt('browser.inspect',{url:page.url,dom:'<main>Landing</main>'},{url:page.url}),
  receipt('browser.screenshot',screenshot,{url:page.url,output:screenshot.output})
 ];
 for(const item of [img1,img2,screenshot]){
  rows.push(receipt('media.analyze',{output:item.output,imageSha256:item.sha256,visualPassed:true},{output:item.output}));
  rows.push(receipt('artifact.read',{output:item.output,sha256:item.sha256},{output:item.output}));
  rows.push(receipt('media.library',{output:item.output,sha256:item.sha256,experimental:true},{action:'export',output:item.output}));
 }
 rows.push(receipt('artifact.read',{output:page.output,sha256:page.sha256},{output:page.output}));
 return rows;
};
test('no production document without physically reviewed, read and exported media',()=>{
 const rows=inventory();rows.splice(rows.findIndex(r=>r.name==='artifact.read'&&r.observation.output===img2.output),1);
 assert.equal(receiptBoundProductionContent(rows,objectives,instruction),null);
 const schema=[{name:'artifact.read',inputSchema:{type:'object',properties:{output:{type:'string',enum:[img2.output]}}}}];
 assert.deepEqual(prioritizeReceiptBoundProduction(schema,rows,objectives).map(x=>x.name),['artifact.read']);
});
test('host binds exact Summit copy, two verified sources, two PNGs and landing SHA',()=>{
 const rows=inventory(),content=receiptBoundProductionContent(rows,objectives,instruction);
 assert.ok(content);
 const doc=JSON.parse(content);
 assert.equal(doc.socialCopy,text);
 assert.deepEqual(doc.resources,[img1,img2,page].map(x=>({output:x.output,sha256:x.sha256})));
 assert.deepEqual(doc.sources,urls);
 assert.equal(validateProductionDocument(content,rows,objectives).ok,true);
 assert.equal(/VERIFIED_COMPLETE/.test(content),false);
 assert.deepEqual(prioritizeReceiptBoundProduction([{name:'document.create',inputSchema:{type:'object',properties:{}}}],rows,objectives).map(x=>x.name),['document.create']);
});
test('a missing resource, unsupported source or mutated SHA cannot be laundered into the document',()=>{
 const rows=inventory();
 rows.find(r=>r.name==='advertising.research').observation.advertisingSemanticReview.acceptedSourceURLs=[urls[0]];
 assert.equal(receiptBoundProductionContent(rows,objectives,instruction),null);
 const next=inventory();next.find(r=>r.name==='image.adapt'&&r.observation.outputs[0].output===img1.output).observation.outputs[0].sha256='bad';
 assert.equal(receiptBoundProductionContent(next,objectives,instruction),null);
 assert.equal(receiptBoundProductionContent([],objectives,instruction),null);
});
test('after successful document, only physical read-back and export remain, never another render',()=>{
 const rows=inventory();
 const content=receiptBoundProductionContent(rows,objectives,instruction);
 const document={output:'.jarvis-artifacts/qwen-general/general-test/report.json',sha256:sha('e')};
 rows.push(receipt('document.create',document,{format:'json',content,output:document.output}));
 const catalog=[
  {name:'document.create',inputSchema:{type:'object',properties:{}}},
  {name:'artifact.read',inputSchema:{type:'object',properties:{output:{type:'string',enum:[document.output]}}}},
  {name:'media.library',inputSchema:{type:'object',anyOf:[{properties:{action:{const:'export'},output:{type:'string',enum:[document.output]}}}]}}
 ];
 assert.deepEqual(prioritizeReceiptBoundProduction(catalog,rows,objectives).map(x=>x.name),['artifact.read']);
 rows.push(receipt('artifact.read',{output:document.output,sha256:document.sha256},{output:document.output}));
 assert.deepEqual(prioritizeReceiptBoundProduction(catalog,rows,objectives).map(x=>x.name),['media.library']);
 rows.push(receipt('media.library',{output:document.output,sha256:document.sha256,experimental:true},{action:'export',output:document.output}));
 assert.deepEqual(prioritizeReceiptBoundProduction(catalog,rows,objectives),[]);
});

test('TikTok document reproduces verified narration, exact timed scenes and MP4 WAV image SHA inventory',()=>{
 const frames=['e','f','1'].map((digit,i)=>({output:'.jarvis-artifacts/images/general-video-'+i+'.png',mimeType:'image/png',width:1080,height:1920,sha256:sha(digit)}));
 const speech={output:'.jarvis-artifacts/audio/general-video-voice.wav',sha256:sha('2'),mimeType:'audio/wav'};
 const video={output:'.jarvis-artifacts/qwen-general/general-video/advertisement.mp4',sha256:sha('3'),mimeType:'video/mp4'};
 const scenes=frames.map((f,i)=>({durationSeconds:10,assetOutput:f.output,overlay:'Escena '+(i+1),subtitle:'Línea '+(i+1)}));
 const script='Línea 1 Línea 2 Línea 3';
 const rows=[receipt('advertising.research',{sources:urls.map(url=>({url})),advertisingSemanticReview:{verified:true,acceptedSourceURLs:urls}}),
 ...urls.map(url=>receipt('browser.inspect',{url,dom:'<main>Observed advertising principles</main>'},{url})),
 receipt('media.library',{entries:[]},{action:'list'}),
 ...frames.map(x=>receipt('image.adapt',{outputs:[x]}))];
 rows.push(receipt('speech.synthesize',speech,{text:script,output:speech.output}));
 rows.push(receipt('reel.create',video,{durationSeconds:30,audioOutput:speech.output,scenes}));
 for(const x of [...frames,video])for(const r of [
  receipt('media.analyze',{output:x.output,imageSha256:x.sha256,visualPassed:true},{output:x.output}),
  receipt('artifact.read',{output:x.output,sha256:x.sha256},{output:x.output}),
  receipt('media.library',{output:x.output,sha256:x.sha256,experimental:true},{action:'export',output:x.output})
 ])rows.push(r);
 const goals={advertising:true,reel:true,document:true,requestedImageFormats:[{width:1080,height:1920}]};
 const content=receiptBoundProductionContent(rows,goals,instruction);
 assert.ok(content);
 const doc=JSON.parse(content);
 assert.equal(doc.narration,script);
 assert.deepEqual(doc.scenes,scenes);
 assert.deepEqual(doc.resources,[...frames,speech,video].map(v=>({output:v.output,sha256:v.sha256})));
 assert.equal(validateProductionDocument(content,rows,goals).ok,true);
 const tampered=JSON.parse(content);tampered.scenes[2].assetOutput=frames[1].output;
 assert.equal(validateProductionDocument(JSON.stringify(tampered),rows,goals).ok,false);
});

test('actual grounded Qwen schema freezes content to host-produced JSON',async()=>{
 const {groundGeneralCatalog}=await import('../modules/terminal/qwen-general-pilot.js');
 const t={name:'document.create',inputSchema:{type:'object',properties:{
   content:{type:'string'},format:{type:'string'},title:{type:'string'},
   output:{type:'string'}
 },required:['content','format','title','output'],additionalProperties:false}};
 const rows=inventory(),before=groundGeneralCatalog([t],rows.slice(0,4),instruction,objectives);
 assert.deepEqual(before.map(t=>t.name),[]);
 const ready=groundGeneralCatalog([t],rows,instruction,objectives);
 assert.equal(ready.length,1);
 assert.equal(ready[0].inputSchema.properties.content.const,receiptBoundProductionContent(rows,objectives,instruction));
 assert.equal(ready[0].inputSchema.properties.format.type,'string');
 assert.equal(t.inputSchema.properties.content.const,undefined);
});
