import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../modules/terminal/jarvis-attachments.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../gestia-terminal.html',import.meta.url),'utf8');
const begin=source.indexOf('function prepareVisualReview(question = "")');
const end=source.indexOf('export const JarvisAttachments',begin);
assert.ok(begin>0 && end>begin);
function makeReview(files){
 const ctx={
   state:{items:files},
   itemName:item=>item.name,
   itemType:item=>item.mimeType
 };
 vm.runInNewContext(source.slice(begin,end)+'\n globalThis.review=prepareVisualReview;',ctx);
 return ctx.review;
}
function example(n=5){
 return Array.from({length:n},(_,i)=>({
  status:'ready',name:'photo-'+i+'.jpg',
  mimeType:'image/jpeg',
  output:'.jarvis-artifacts/uploads/photo-'+i+'.jpg',
  saved:{sha256: String(i).repeat(64)}
 }));
}
test('five uploaded photos receive a bounded visual-batch response, not null planner fallback',()=>{
 const response=makeReview(example(5))('¿Qué ves en estos archivos?');
 assert.equal(response.status,'LOCAL_MEDIA_REVIEW_BATCH_LIMIT');
 assert.equal(response.received,5);
 assert.equal(response.maximum,4);
 assert.ok(!response.attachments);
});
test('exact four photos or videos remain available for Qwen media.analyze',()=>{
 const files=example(4);
 files[3].output='.jarvis-artifacts/uploads/clip.mp4';
 files[3].name='clip.mp4';
 files[3].mimeType='video/mp4';
 const response=makeReview(files)('analiza los videos');
 assert.equal(response.attachments.length,4);
 assert.equal(response.question,'analiza los videos');
 assert.equal(response.attachments[3].artifact,files[3].output);
 assert.equal(response.attachments[3].sha256,files[3].saved.sha256);
});
test('unrelated requests and unsupported file types retain their prior safe routing',()=>{
 const review=makeReview(example(5));
 assert.equal(review('Crea un documento Excel'),null);
 const invalid=example(5);
 invalid[0].output='.jarvis-artifacts/uploads/not-supported.exe';
 assert.equal(makeReview(invalid)('¿Qué ves?'),null);
});
test('UI handles visual batch limit before calling any tool and preserves input and original attachments',()=>{
 const position=html.indexOf('const visualReview = window.JarvisAttachments?.prepareVisualReview?.(rawCommand);');
 const limit=html.indexOf('visualReview?.status === "LOCAL_MEDIA_REVIEW_BATCH_LIMIT"',position);
 const call=html.indexOf('const observations = await tools.executeMany',position);
 assert.ok(position>0&&limit>position&&call>limit);
 assert.match(html,/keepReadyAttachments = true/);
 assert.match(html,/if \(textarea && !keepReadyAttachments\)/);
 assert.match(html,/if \(!keepReadyAttachments\) window\.JarvisAttachments\?\.clear\?\.\(\)/);
 assert.match(html,/No inicié una misión ni inventé un análisis/);
 assert.match(html,/jarvis-attachments\.js\?v=v142-owner-visual-batch-20261029-v9/);
});
