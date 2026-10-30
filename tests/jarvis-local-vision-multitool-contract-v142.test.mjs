import test from 'node:test';
import assert from 'node:assert/strict';
import {registerJarvisMultifunctionTools} from '../gestia-core/jarvis/jarvis.multitool.pack.js';
import {prepareOwnerUploadedMediaReview,verifyOwnerUploadedMediaReview} from '../gestia-core/jarvis/jarvis.local.media.contract.js';

const a='.jarvis-artifacts/uploads/photo.jpg',b='.jarvis-artifacts/uploads/clip.mp4';
const shaA='a'.repeat(64),shaB='b'.repeat(64);
const attach=[
 {artifact:a,name:'photo.jpg',mimeType:'image/jpeg',sha256:shaA},
 {artifact:b,name:'clip.mp4',mimeType:'video/mp4',sha256:shaB}
];
const registry=new Map();
registerJarvisMultifunctionTools({register:d=>registry.set(d.name,d)});
const media=registry.get('media.analyze');
const receipt=()=>({ok:true,status:'LOCAL_MEDIA_BATCH_INTERPRETATIONS_PARTIAL',
  model:'qwen3.5:9b',externalApiUsed:false,sourceIdentityVerified:true,
  independentlyVerified:false,objectiveSatisfied:false,
  ownerReport:{status:'LOCAL_MEDIA_OWNER_REPORT_PARTIAL',text:'Qwen observa una captura y tres fotogramas; el audio no está analizado.',
    localOnly:true,independentlyVerified:false,objectiveSatisfied:false},
  sources:[
   {sourceIndex:1,output:a,sha256:shaA,kind:'image',observation:'Pantalla visible',
    sourceIdentityVerified:true,visualInferenceCompleted:true,independentlyVerified:false},
   {sourceIndex:2,output:b,sha256:shaB,kind:'video',sourceIdentityVerified:true,
    visualInferenceCompleted:true,independentlyVerified:false,fullVideoSemanticVerification:false,
    audioTranscriptionVerified:false,frames:[{timestampSeconds:0,observation:'TikTok visible'},
      {timestampSeconds:1,observation:'Pantalla visible'}]}
  ]});
test('media.analyze preserves its original fail-closed behavior without a host visual provider',async()=>{
 const result=await media.execute({attachments:[attach[0]]},{rawInput:'¿Qué ves en los documentos?'});
 assert.equal(result.ok,false);
 assert.equal(result.status,'LOCAL_CAPABILITY_UNAVAILABLE');
 assert.equal(result.externalApiUsed,false);
});
test('media.analyze uses only a host-supplied local function and correctly forwards a partial source-bound report',async()=>{
 let calls=0;
 const result=await media.execute({attachments:attach},{rawInput:'¿Qué ves en los documentos?',
   localUploadedMediaReview:async request=>{
     calls++;
     assert.deepEqual(request.attachments,[{output:a,sha256:shaA},{output:b,sha256:shaB}]);
     assert.match(request.question,/Qué ves/);
     assert.equal(request.localOnly,true);
     return receipt();
   }});
 assert.equal(calls,1);
 assert.equal(result.ok,true);
 assert.equal(result.status,'LOCAL_MEDIA_REVIEW_PARTIAL_UNVERIFIED');
 assert.equal(result.objectiveSatisfied,false);
 assert.equal(result.independentlyVerified,false);
 assert.equal(result.sourceCount,2);
 assert.match(result.message,/audio no está analizado/);
 assert.deepEqual(result.sources.map(x=>x.sha256),[shaA,shaB]);
});
test('forged receipts, cloud models, and fake completed results must fail closed',async()=>{
 for(const change of [
   x=>x.model='cloud-model',
   x=>x.objectiveSatisfied=true,
   x=>x.sources[1].sha256=shaA,
   x=>x.sources[1].audioTranscriptionVerified=true,
   x=>x.sources[0].visualInferenceCompleted=false,
   x=>x.ownerReport.objectiveSatisfied=true
 ]){
   const bad=receipt();change(bad);
   const result=await media.execute({attachments:attach},{
     localUploadedMediaReview:async()=>bad,rawInput:'Revisa los adjuntos'});
   assert.equal(result.ok,false);
   assert.equal(result.status,'LOCAL_MEDIA_REVIEW_NOT_VERIFIED');
 }
});
test('rejects unsupported paths, missing SHA, excessive batch and duplicates before invoking local vision',async()=>{
 const variants=[
  [{artifact:a,sha256:''}],
  [{artifact:'../../private.jpg',sha256:shaA}],
  [attach[0],attach[0]],
  Array(5).fill({...attach[0],artifact:a}),
  [{artifact:'.jarvis-artifacts/other/secret.mp4',sha256:shaA}]
 ];
 for(const attachments of variants){
  let invoked=false;
  const result=await media.execute({attachments},{rawInput:'¿Qué ves?',
    localUploadedMediaReview:async()=>{invoked=true;return receipt();}});
  assert.equal(result.ok,false);
  assert.equal(invoked,false);
 }
});
test('pure contract never grants transport route or permission',()=>{
 const request=prepareOwnerUploadedMediaReview(attach,'¿Qué ves?');
 assert.equal(request.requiresExistingAuthenticatedWorkstation,true);
 assert.ok(!('route' in request));
 assert.ok(!('token' in request));
 const result=verifyOwnerUploadedMediaReview(receipt(),request);
 assert.equal(result.mediaAnalysisNotCertified,true);
 assert.equal(result.objectiveSatisfied,false);
});
