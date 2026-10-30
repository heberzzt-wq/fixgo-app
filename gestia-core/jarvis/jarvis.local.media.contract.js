// Browser-safe contract between the registered media.analyze tool and a
// *host-supplied* local vision capability. No new transport permission.
const IMAGE=/\.(?:jpe?g|png|webp)$/i;
const VIDEO=/\.(?:mp4|webm|mov)$/i;
const SHA=/^[a-f0-9]{64}$/i;
const PREFIX='.jarvis-artifacts/uploads/';
const cleanText=(v,max=3000)=>String(v||'').trim().slice(0,max);
export function prepareOwnerUploadedMediaReview(attachments=[],question=''){
 if(!Array.isArray(attachments)||attachments.length<1||attachments.length>4)
   throw Error('LOCAL_MEDIA_REVIEW_BATCH_UNSUPPORTED');
 const sources=[],unique=new Set();
 for(const file of attachments){
   const output=String(file?.artifact||file?.output||'').trim().replaceAll('\\','/');
   const sha256=String(file?.sha256||'').trim().toLowerCase();
   const isImage=IMAGE.test(output),isVideo=VIDEO.test(output);
   if(!output.startsWith(PREFIX)||output.includes('..')||output.includes('//')||
      !/^[a-z0-9./_-]+$/i.test(output)||(!isImage&&!isVideo)||
      !SHA.test(sha256)||unique.has(output))throw Error('LOCAL_MEDIA_REVIEW_SOURCE_INVALID');
   unique.add(output);
   sources.push({output,sha256});
 }
 return {attachments:sources,question:cleanText(question,1000),localOnly:true,
   requiresExistingAuthenticatedWorkstation:true,
   model:'qwen3.5:9b'};
}
export function verifyOwnerUploadedMediaReview(result,requested){
 if(result?.ok!==true||result.status!=='LOCAL_MEDIA_BATCH_INTERPRETATIONS_PARTIAL'||
   result.model!=='qwen3.5:9b'||result.externalApiUsed!==false||
   result.sourceIdentityVerified!==true||result.independentlyVerified!==false||
   result.objectiveSatisfied!==false||
   !Array.isArray(result.sources)||result.sources.length!==requested.attachments.length||
   result.ownerReport?.status!=='LOCAL_MEDIA_OWNER_REPORT_PARTIAL'||
   result.ownerReport?.localOnly!==true||
   result.ownerReport?.independentlyVerified!==false||
   result.ownerReport?.objectiveSatisfied!==false)
   throw Error('LOCAL_MEDIA_REVIEW_RECEIPT_INVALID');
 for(let i=0;i<requested.attachments.length;i++){
   const got=result.sources[i],want=requested.attachments[i];
   if(got?.output!==want.output||got.sha256!==want.sha256||
      got.sourceIndex!==i+1||got.sourceIdentityVerified!==true||
      got.visualInferenceCompleted!==true||got.independentlyVerified!==false)
     throw Error('LOCAL_MEDIA_REVIEW_SOURCE_RECEIPT_INVALID');
   if(got.kind==='image'){
     if(!IMAGE.test(want.output)||!cleanText(got.observation))
       throw Error('LOCAL_MEDIA_REVIEW_IMAGE_RECEIPT_INVALID');
   }else if(got.kind==='video'){
     if(!VIDEO.test(want.output)||got.fullVideoSemanticVerification!==false||
        got.audioTranscriptionVerified!==false||
        !Array.isArray(got.frames)||got.frames.length<1||got.frames.length>3||
        got.frames.some(frame=>!Number.isFinite(frame.timestampSeconds)||!cleanText(frame.observation)))
       throw Error('LOCAL_MEDIA_REVIEW_VIDEO_RECEIPT_INVALID');
   }else throw Error('LOCAL_MEDIA_REVIEW_TYPE_INVALID');
 }
 const text=result.ownerReport.text;
 if(typeof text!=='string'||!text.trim()||text.length>7400)
   throw Error('LOCAL_MEDIA_REVIEW_REPORT_INVALID');
 return {ok:true,status:'LOCAL_MEDIA_REVIEW_PARTIAL_UNVERIFIED',
   message:text,sourceCount:result.sources.length,
   sources:result.sources.map(source=>({
      name:cleanText(source.sourceName,140),sha256:source.sha256,
      output:source.output,kind:source.kind,framesObserved:source.framesObserved||0,
      audioTranscriptionVerified:false
   })),
   model:'qwen3.5:9b',localOnly:true,externalApiUsed:false,
   sourceIdentityVerified:true,visualInferenceCompleted:true,
   independentlyVerified:false,objectiveSatisfied:false,
   mediaAnalysisNotCertified:true};
}
