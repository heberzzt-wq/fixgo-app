// Bounded, local, read-only multimodal analysis coordinator.
// Independent Qwen calls per image/frame; no large media manifest inside one prompt.
// Caller supplies existing verified temporal extractor + artifact reader. No HTTP routes.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readBoundedLocalImage,analyzeLocalImageBytes} from './jarvis-local-upload-vision.js';

const UPLOAD_PREFIX='.jarvis-artifacts/uploads/';
const MAX_VIDEO_BYTES=8*1024*1024;
const MAX_FRAME_SAMPLES=3;
function error(code){const e=new Error(code);e.code=code;return e;}
function imageType(file){
 const ext=path.extname(String(file||'')).toLowerCase();
 return ['.jpg','.jpeg','.png','.webp'].includes(ext);
}
function videoType(file){return ['.mp4','.webm','.mov'].includes(path.extname(String(file||'')).toLowerCase());}
export function verifyUploadedVideo({root=process.cwd(),output='',expectedSha256=''}={}){
 const source=String(output||'').replaceAll('\\','/');
 if(!source.startsWith(UPLOAD_PREFIX)||source.includes('..')||source.includes('//')||
    source.includes('#')||source.includes('?')||source.includes('\0')||!videoType(source))
   throw error('LOCAL_VISION_VIDEO_PATH_INVALID');
 if(!/^[a-f0-9]{64}$/i.test(expectedSha256))throw error('LOCAL_VISION_SOURCE_HASH_REQUIRED');
 const base=path.resolve(root,UPLOAD_PREFIX),file=path.resolve(root,source);
 if(!file.startsWith(base+path.sep)||!fs.existsSync(file))throw error('LOCAL_VISION_VIDEO_FILE_NOT_FOUND');
 if(fs.realpathSync(path.dirname(file))!==fs.realpathSync(base))
   throw error('LOCAL_VISION_VIDEO_SYMLINK_PARENT');
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<32||stat.size>MAX_VIDEO_BYTES)
   throw error('LOCAL_VISION_VIDEO_BYTES_INVALID');
 const fileBytes=fs.readFileSync(file);
 const extension=path.extname(source).toLowerCase();
 const headerValid=extension==='.webm'
   ? fileBytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))
   : fileBytes.toString('ascii',4,8)==='ftyp';
 if(!headerValid)throw error('LOCAL_VISION_VIDEO_SIGNATURE_INVALID');
 const sha256=createHash('sha256').update(fileBytes).digest('hex');
 if(sha256!==expectedSha256.toLowerCase())throw error('LOCAL_VISION_SOURCE_HASH_MISMATCH');
 return {output:source,sha256,bytes:stat.size,mimeType:{
   '.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime'
 }[path.extname(source).toLowerCase()]};
}
function validateTemporalSamples(extracted,source){
 if(extracted?.ok!==true||extracted?.sha256!==source.sha256||
    extracted?.output!==source.output||!Array.isArray(extracted?.temporal?.samples))
    throw error('LOCAL_VISION_TEMPORAL_SOURCE_UNVERIFIED');
 const samples=extracted.temporal.samples;
 const duration=Number(extracted.temporal.durationSeconds);
 if(!Number.isFinite(duration)||duration<=0||duration>45)
   throw error('LOCAL_VISION_DURATION_OUT_OF_RANGE');
 if(!samples.length||samples.length>MAX_FRAME_SAMPLES)throw error('LOCAL_VISION_SAMPLE_COVERAGE_INVALID');
 const allowedPrefix='.jarvis-artifacts/media-evidence/'+source.sha256.slice(0,20)+'/';
 for(const [i,sample] of samples.entries()){
   if(sample.output!==allowedPrefix+'frame-'+String(i+1).padStart(3,'0')+'.jpg'||
      sample.mimeType!=='image/jpeg'||!/^[a-f0-9]{64}$/i.test(String(sample.sha256||''))||
      !Number.isFinite(sample.timestampSeconds)||sample.timestampSeconds<0)
      throw error('LOCAL_VISION_TEMPORAL_FRAME_PROOF_INVALID');
 }
 return samples;
}
export async function analyzeLocalUploadedMediaBatch({
 root=process.cwd(),attachments=[],question='',extractTemporal,readArtifact,
 fetchImpl=globalThis.fetch,signal,onProgress=()=>{}
}={}){
 if(!Array.isArray(attachments)||attachments.length<1||attachments.length>4)
   throw error('LOCAL_VISION_BATCH_SIZE_INVALID');
 if(typeof extractTemporal!=='function'||typeof readArtifact!=='function')
   throw error('LOCAL_VISION_DEPENDENCIES_REQUIRED');
 const descriptions=[];
 for(const [fileIndex,attachment] of attachments.entries()){
   signal?.throwIfAborted?.();
   const output=String(attachment?.output||'');
   const expectedSha256=String(attachment?.sha256||'');
   const name=path.basename(output);
   if(imageType(output)){
     const source=readBoundedLocalImage({root,output,expectedSha256});
     const inspected=await analyzeLocalImageBytes({imageBytes:source.bytes,
       mimeType:source.mimeType,expectedSha256:source.sha256,
       question,fetchImpl,signal});
     descriptions.push({sourceIndex:fileIndex+1,sourceName:name,kind:'image',
       output,sha256:source.sha256,observation:inspected.description,
       independentlyVerified:false,visualInferenceCompleted:true,
       sourceIdentityVerified:true});
   } else if(videoType(output)){
     const source=verifyUploadedVideo({root,output,expectedSha256});
     const extracted=await extractTemporal({root,output,sourceName:name,mimeType:source.mimeType});
     const samples=validateTemporalSamples(extracted,source);
     const frames=[];
     for(const frame of samples){
       signal?.throwIfAborted?.();
       const artifact=await readArtifact({root,output:frame.output});
       if(artifact?.ok!==true||artifact?.sha256!==frame.sha256||
          artifact?.mimeType!=='image/jpeg'||artifact?.output!==frame.output)
          throw error('LOCAL_VISION_FRAME_READ_MISMATCH');
       // The existing extractor supplies frames with independently checked
       // physical identity. Qwen's natural-language observations remain unverified.
       const bytes=Buffer.from(String(artifact.dataBase64||''),'base64');
       const inspected=await analyzeLocalImageBytes({imageBytes:bytes,
         mimeType:'image/jpeg',expectedSha256:frame.sha256,
         question:'Un fotograma a '+frame.timestampSeconds+' segundos. '+String(question||'').slice(0,750),
         fetchImpl,signal});
       frames.push({timestampSeconds:frame.timestampSeconds,
         frameSha256:frame.sha256,observation:inspected.description,
         independentlyVerified:false});
       onProgress({sourceIndex:fileIndex+1,framesCompleted:frames.length,frameCount:samples.length});
     }
     descriptions.push({sourceIndex:fileIndex+1,sourceName:name,kind:'video',
       output,sha256:source.sha256,durationSeconds:extracted.temporal.durationSeconds,
       frames,framesObserved:frames.length,frameCount:samples.length,
       audioTrackPresent:!!extracted.temporal.audio,
       audioTranscriptionVerified:false,fullVideoSemanticVerification:false,
       visualInferenceCompleted:true,independentlyVerified:false,sourceIdentityVerified:true});
   } else throw error('LOCAL_VISION_UNSUPPORTED_ATTACHMENT');
 }
 return {ok:true,status:'LOCAL_MEDIA_BATCH_INTERPRETATIONS_PARTIAL',
   model:'qwen3.5:9b',sourceCount:descriptions.length,sources:descriptions,
   completeFileReceiptCount:descriptions.length,
   sourceIdentityVerified:true,visualInferenceCompleted:true,
   independentlyVerified:false,objectiveSatisfied:false,
   noFalseAudioClaims:true,externalApiUsed:false,
   note:'Descripción interpretativa por imagen o fotograma; no revisión visual independiente ni transcripción del audio.'};
}
