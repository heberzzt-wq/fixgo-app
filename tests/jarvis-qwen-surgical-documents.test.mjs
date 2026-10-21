import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generalObjectives,validateProductionDocument,verifyGeneralMission,summarizeGeneralEvidence} from '../modules/terminal/qwen-general-evidence.js';
const sha='a'.repeat(64),rec=(name,args,observation)=>({ok:true,name,args,observation:{ok:true,...observation}});
function fixture(){
 const scenes=[1,2,3].map(i=>({durationSeconds:10,assetOutput:`scene${i}.png`,overlay:`Escena ${i}`,subtitle:`Narración ${i}`}));
 const receipts=[rec('image.adapt',{}, {outputs:scenes.map(s=>({output:s.assetOutput,sha256:sha,width:1080,height:1920}))}),rec('speech.synthesize',{text:'Narración real'},{output:'speech.wav',sha256:sha}),rec('reel.create',{audioOutput:'speech.wav',durationSeconds:30,scenes},{output:'video.mp4',sha256:sha})];
 const doc={narration:'Narración real',durationSeconds:30,scenes,resources:['video.mp4','speech.wav',...scenes.map(s=>s.assetOutput)].map(output=>({output,sha256:sha})),limitations:['Composición convencional local; no generación de video IA.']};
 return {receipts,doc};
}
test('TikTok requires screenplay even without an explicit document request',()=>{
 assert.equal(generalObjectives('Crea un TikTok publicitario').document,true);
 assert.equal(generalObjectives('Consulta users').document,false);
});
test('production screenplay binds exact narration, scenes and physical resources',()=>{
 const {receipts,doc}=fixture();assert.equal(validateProductionDocument(JSON.stringify(doc),receipts,{reel:true}).ok,true);
 for(const mutate of [d=>d.narration='Inventada',d=>d.scenes[0].subtitle='Otro',d=>d.durationSeconds=31,d=>d.resources.pop(),d=>d.resources[0].sha256='b'.repeat(64),d=>d.limitations=[]]){
  const changed=structuredClone(doc);mutate(changed);assert.equal(validateProductionDocument(JSON.stringify(changed),receipts,{reel:true}).ok,false);
 }
});
test('phase4 self-certified delivery manifest is not a production screenplay',()=>{
 const {receipts}=fixture();const result=validateProductionDocument(JSON.stringify({status:'VERIFIED_COMPLETE',summary:'Completed MP4',outputs:['video.mp4']}),receipts,{reel:true});
 assert.equal(result.reason,'DOCUMENT_SELF_CERTIFICATION_FORBIDDEN');
 assert.equal(validateProductionDocument('{"scenes":{}}',receipts,{reel:true}).ok,false);
});
test('screenplay cannot certify an obsolete rejected cut after a physical repair',()=>{
 const {receipts,doc}=fixture();
 receipts.push(rec('reel.create',{...receipts.at(-1).args,scenes:receipts.at(-1).args.scenes.map((s,i)=>({...s,overlay:`Reparación ${i}`}))},{output:'video-repair-1.mp4',sha256:'b'.repeat(64)}));
 const stale=validateProductionDocument(JSON.stringify(doc),receipts,{reel:true});
 assert.equal(stale.ok,false);assert.ok(stale.issues.includes('DOCUMENT_ALL_PRODUCTION_RESOURCES_REQUIRED'));
 doc.scenes=receipts.at(-1).args.scenes;
 doc.resources=doc.resources.filter(r=>r.output!=='video.mp4');
 doc.resources.push({output:'video-repair-1.mp4',sha256:'b'.repeat(64)});
 assert.equal(validateProductionDocument(JSON.stringify(doc),receipts,{reel:true}).ok,true);
});
test('document certification requires byte readback, creation SHA, review and experimental export',async()=>{
 const {receipts,doc}=fixture(),content=JSON.stringify(doc),bytes=Buffer.from(content),digest=createHash('sha256').update(bytes).digest('hex');
 const create=rec('document.create',{content},{output:'script.json',sha256:digest,creativeSemanticReview:{verified:true}});
 const read=rec('artifact.read',{}, {output:'script.json',sha256:digest,bytes:bytes.length,dataBase64:bytes.toString('base64')});
 const exp=rec('media.library',{action:'export',output:'script.json'},{sha256:digest,experimental:true});
 const all=[...receipts,create,read,exp],objectives={advertising:true,reel:true,document:true};
 const check=async rows=>(await verifyGeneralMission({instruction:'TikTok',receipts:rows,objectives})).objectives.find(c=>c.objective==='physical document agrees with evidence').satisfied;
 assert.equal(await check(all),true);
 assert.equal(await check(all.filter(r=>r!==exp)),false);
 for(const mutate of [a=>a.at(-3).observation.sha256='b'.repeat(64),a=>a.at(-3).observation.creativeSemanticReview.verified=false,a=>a.at(-2).observation.dataBase64=Buffer.from('different').toString('base64'),a=>a.at(-1).observation.sha256='b'.repeat(64)]){
  const changed=structuredClone(all);mutate(changed);assert.equal(await check(changed),false);
 }
 const gaps=summarizeGeneralEvidence(all.filter(r=>r!==exp),objectives).deliveryGaps;
 assert.ok(gaps.some(g=>g.goal==='registered production document export'));
});
