// Deterministic comparison of local recognizer output with receipt-bound narration.
// This never prompts a recognizer with the expected text or turns model flags into proof.
export const normalizeAudioWords=text=>String(text||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).map(token=>token==='diez'?'10':token).join(' ');
const words=normalizeAudioWords;
export function verifyNarrationTimeline({sourceSha256,durationSeconds,narration,scenes=[],transcription}={}){
 const result={transcriptionVerified:false,synchronizationVerified:false,reason:'AUDIO_TRANSCRIPTION_REQUIRED',sceneChecks:[]};
 if(!/^[a-f0-9]{64}$/i.test(sourceSha256||'')||transcription?.sourceSha256!==sourceSha256)return {...result,reason:'AUDIO_TRANSCRIPT_SOURCE_MISMATCH'};
 const segments=transcription?.segments;
 if(transcription.completed!==true||!Array.isArray(segments)||!segments.length||!words(narration)||segments.some(s=>!s||typeof s.text!=='string'||!words(s.text)))return result;
 const recognized=words(segments.map(s=>s.text).join(' '));
 result.transcriptionVerified=recognized===words(narration);
 result.recognizedText=segments.map(s=>s.text).join(' ');
 if(!result.transcriptionVerified)result.reason='AUDIO_NARRATION_TEXT_MISMATCH';
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 if(!finite(durationSeconds)||durationSeconds<=0||!scenes.length||scenes.some(s=>!finite(s.durationSeconds)||s.durationSeconds<=0||!words(s.subtitle))||Math.abs(scenes.reduce((n,s)=>n+s.durationSeconds,0)-durationSeconds)>.35)return {...result,reason:'AUDIO_SCENE_TIMELINE_INVALID'};
 let priorEnd=0;
 for(const s of segments){if(!finite(s.startSeconds)||!finite(s.durationSeconds)||s.startSeconds<0||s.durationSeconds<=0||s.startSeconds+.05<priorEnd||s.startSeconds+s.durationSeconds>durationSeconds+.35)return {...result,reason:'AUDIO_TRANSCRIPT_TIMESTAMPS_INVALID'};priorEnd=s.startSeconds+s.durationSeconds;}
 let start=0;const assigned=new Set();
 for(const [index,scene] of scenes.entries()){
  const end=start+scene.durationSeconds;
  const owned=segments.map((s,i)=>({s,i})).filter(({s})=>s.startSeconds>=start&&s.startSeconds<end);
  const text=words(owned.map(({s})=>s.text).join(' '));
  const inside=owned.every(({s})=>s.startSeconds+s.durationSeconds<=end+.15);
  owned.forEach(({i})=>assigned.add(i));
  result.sceneChecks.push({index,startSeconds:start,endSeconds:end,satisfied:inside&&text===words(scene.subtitle),recognizedText:text,expectedSubtitle:words(scene.subtitle),contained:inside});start=end;
 }
 result.synchronizationVerified=result.transcriptionVerified&&assigned.size===segments.length&&result.sceneChecks.every(s=>s.satisfied);
 result.reason=result.synchronizationVerified?'AUDIO_NARRATION_TIMELINE_VERIFIED':result.transcriptionVerified?'AUDIO_SUBTITLE_TIMING_MISMATCH':result.reason;
 return result;
}
