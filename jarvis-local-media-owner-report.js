// Deterministic owner-facing presentation of already executed local Qwen observations.
// No new inference, no authority elevation and no false "mission completed" state.
const bounded = (value,limit) => String(value ?? '').trim().slice(0,limit);
const filename = value => bounded(value,140).replace(/[\r\n\t]/g,' ');
export function formatLocalMediaOwnerReport(result){
 if(result?.ok!==true||result?.status!=='LOCAL_MEDIA_BATCH_INTERPRETATIONS_PARTIAL'||
    result?.sourceIdentityVerified!==true||!Array.isArray(result?.sources)||!result.sources.length)
   throw Error('LOCAL_MEDIA_REPORT_SOURCE_EVIDENCE_REQUIRED');
 if(result.sources.length>4||result.sources.some(x=>x.sourceIdentityVerified!==true))
   throw Error('LOCAL_MEDIA_REPORT_SCOPE_INVALID');
 const lines=['Pariente, revisé los archivos con Qwen local. Esto es lo que el modelo interpreta de las imágenes; todavía no es una verificación independiente.'];
 for(const item of result.sources){
  const index=Number(item.sourceIndex);
  if(!Number.isInteger(index)||index<1||index>4||
      !/^[a-f0-9]{64}$/i.test(String(item.sha256||'')))
   throw Error('LOCAL_MEDIA_REPORT_SOURCE_IDENTITY_INVALID');
  lines.push('Archivo '+index+': '+filename(item.sourceName||item.output||'archivo')+'.');
  if(item.kind==='image'){
   if(typeof item.observation!=='string'||!item.observation.trim())
      throw Error('LOCAL_MEDIA_REPORT_IMAGE_OBSERVATION_MISSING');
   lines.push('En la fotografía, Qwen describe: '+bounded(item.observation,1250));
  }else if(item.kind==='video'){
   const frames=item.frames;
   if(!Array.isArray(frames)||frames.length<1||frames.length>3)
     throw Error('LOCAL_MEDIA_REPORT_FRAME_EVIDENCE_REQUIRED');
   lines.push('Del video examiné '+frames.length+' fotograma(s); no equivale a revisar continuamente toda la grabación.');
   for(const frame of frames){
    const time=Number(frame.timestampSeconds);
    if(!Number.isFinite(time)||time<0||!frame.observation)
      throw Error('LOCAL_MEDIA_REPORT_FRAME_EVIDENCE_INVALID');
    lines.push('Fotograma a '+time.toFixed(2)+' segundos: '+bounded(frame.observation,700));
   }
   if(item.audioTrackPresent) lines.push('El video contiene una pista de audio, pero su contenido todavía no fue transcrito ni analizado.');
   else lines.push('No se confirmó una pista de audio utilizable; no puedo describir sonidos ni voces.');
  }else throw Error('LOCAL_MEDIA_REPORT_TYPE_UNSUPPORTED');
 }
 lines.push('Los archivos originales permanecen intactos. No se certificó una interpretación de todo el video ni se completó la misión del chat móvil.');
 const response=lines.join('\n\n');
 if(response.length>7400)throw Error('LOCAL_MEDIA_REPORT_LENGTH_UNBOUNDED');
 return {ok:true,status:'LOCAL_MEDIA_OWNER_REPORT_PARTIAL',text:response,
   sourceCount:result.sources.length,verifiedSourceHashes:result.sources.map(x=>x.sha256),
   model:result.model||'qwen3.5:9b',localOnly:true,externalApiUsed:false,
   modelObservationsOnly:true,independentlyVerified:false,objectiveSatisfied:false};
}
