// Process-local, host-owned Qwen vision checkpoint session.
// It stores only successful, bounded observation strings. No original image,
// prompts, credentials, unverified mission success or artifacts are persisted.
import {createHash} from 'node:crypto';
const sessions=new WeakSet();
const MAX_OBSERVATIONS=12;
const MAX_OBSERVATION_LENGTH=2600;
function keyFor({output,sha256,question,frameTimestamp=null}){
 const signature=JSON.stringify({
   model:'qwen3.5:9b',output:String(output||''),sha256:String(sha256||''),
   question:String(question||''),frameTimestamp
 });
 return createHash('sha256').update(signature).digest('hex');
}
export function createLocalVisionReviewSession(){
 const observations=new Map();
 const pending=new Map();
 const session=Object.freeze({
   async observe(meta,execute){
     if(typeof execute!=='function'||!/^[a-f0-9]{64}$/i.test(String(meta?.sha256||''))||
       typeof meta?.output!=='string'||!meta.output||typeof meta?.question!=='string')
       throw Error('LOCAL_VISION_CHECKPOINT_INPUT_INVALID');
     const key=keyFor(meta);
     if(observations.has(key))return {description:observations.get(key),resumed:true};
     if(pending.has(key))return pending.get(key);
     const task=(async()=>{
       const result=await execute();
       const text=String(result?.description||'').trim();
       if(result?.model!=='qwen3.5:9b'||result?.sha256!==meta.sha256||
         result?.visualInferenceCompleted!==true||!text||text.length>MAX_OBSERVATION_LENGTH)
          throw Error('LOCAL_VISION_CHECKPOINT_RECEIPT_INVALID');
       if(observations.size>=MAX_OBSERVATIONS)
          observations.delete(observations.keys().next().value);
       observations.set(key,text);
       return {description:text,resumed:false};
     })();
     pending.set(key,task);
     try{return await task;}finally{pending.delete(key);}
   },
   snapshot(){
     return Object.freeze({status:'LOCAL_VISION_IN_MEMORY_PROGRESS',
       successfulObservations:observations.size,activeObservations:pending.size,
       durable:false,missionComplete:false,independentlyVerified:false});
   },
   clear(){observations.clear();}
 });
 sessions.add(session);
 return session;
}
export function requireLocalVisionSession(value){
 if(value!==undefined&&value!==null&&!sessions.has(value))
   throw Error('LOCAL_VISION_CHECKPOINT_UNTRUSTED');
 return value||null;
}
