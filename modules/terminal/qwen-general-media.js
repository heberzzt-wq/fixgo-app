import {verifyNarrationTimeline,normalizeAudioWords} from '../../jarvis-qwen-audio-evidence.js';
import {verifiedPosterCopy} from './qwen-poster-proof.js';
export const LOCAL_VIDEO_EVIDENCE_CAPABILITIES=Object.freeze({transcriptionVerified:false,synchronizationVerified:false});
// Host boundaries for existing media tools; no generation engine or brand routing.
export const MEDIA_TOOLS=new Set(['media.library','image.adapt','reel.create','speech.synthesize']);
export const mediaEntries=receipts=>receipts.filter(r=>r.ok).flatMap(r=>r.observation?.entries||[]);

// Production identity excludes destination labels and review prose, never pixel-affecting arguments.
const canonicalProduction=value=>Array.isArray(value)?value.map(canonicalProduction):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonicalProduction(value[k])])):value;
export function imageProductionKeys(args,receipts=[]){
 const resolve=ref=>mediaEntries(receipts).find(e=>e.ref===ref)?.sha256||receipts.find(r=>r.ok&&r.name==='media.library'&&r.observation?.output===ref)?.observation.sha256||ref;
 const composition=args.composition?{...args.composition,...Object.fromEntries(['headline','body','brandName','cta','contact'].map(k=>[k,String(args.composition[k]||'').replace(/\s+/g,' ').trim()])),inkColor:/^#[\da-f]{6}$/i.test(args.composition.inkColor||'')?args.composition.inkColor.toLowerCase():'#102a43',accentColor:/^#[\da-f]{6}$/i.test(args.composition.accentColor||'')?args.composition.accentColor.toLowerCase():'#245e91'}:undefined;
 return (args.variants||[]).map(({id,quality,...variant})=>JSON.stringify(canonicalProduction({source:resolve(args.sourceOutput),logo:resolve(args.brandLogoOutput),fit:composition?'composition':args.fit==='contain'?'contain':'cover',composition,variant:{...variant,width:Number(variant.width),height:Number(variant.height),...(variant.mimeType==='image/png'?{}:{quality:Number(quality??.86)})}})));
}
export function producedImageHistory(receipts){
 return receipts.filter(r=>r.ok&&r.name==='image.adapt'&&r.args?.composition).flatMap(r=>{
 const source=mediaEntries(receipts).find(e=>e.ref===r.args.sourceOutput)||mediaEntries(receipts).find(e=>receipts.some(i=>i.ok&&i.name==='media.library'&&i.observation?.output===r.args.sourceOutput&&i.observation.sha256===e.sha256));
 return (r.observation?.outputs||[]).map(o=>({visual:{sourceRef:source?.ref||r.args.sourceOutput,layout:r.args.composition.layout},format:{width:o.width,height:o.height,sourceSha256:source?.sha256},output:o.output,sha256:o.sha256}));
 });
}
export function equivalentImageProduction(receipts,args){
 const keys=new Set(receipts.filter(r=>r.ok&&r.name==='image.adapt'&&r.observation?.outputs?.length).flatMap(r=>imageProductionKeys(r.args,receipts)));
 return imageProductionKeys(args,receipts).some(k=>keys.has(k));
}
export function verticalSequenceEvidence(args,receipts){
 const artifacts=producedMedia(receipts),scenes=args.scenes||[];
 const assets=scenes.map(s=>artifacts.find(p=>p.output===s.assetOutput));
 if(scenes.length<3||assets.some(a=>!a||a.width!==1080||a.height!==1920))return {ok:false,reason:'VERTICAL_SCENE_ASSETS_REQUIRED'};
 if(assets.some(a=>!a.sha256)||new Set(assets.map(a=>a.sha256)).size!==assets.length)return {ok:false,reason:'DISTINCT_SCENE_VISUALS_REQUIRED'};
 return {ok:true};
}
export function deliveredImageHistory(receipts){
 const good=receipts.filter(r=>r.ok),history=good.flatMap(r=>r.observation?.deliveredCombinations||r.observation?.advertisingHistory||[]);
 for(const r of good.filter(r=>r.name==='image.adapt'&&r.args?.composition))for(const o of r.observation.outputs||[]){
  const source=mediaEntries(receipts).find(e=>e.ref===r.args.sourceOutput)||mediaEntries(receipts).find(e=>good.some(i=>i.name==='media.library'&&i.observation?.output===r.args.sourceOutput&&i.observation.sha256===e.sha256));
  if(good.some(e=>e.name==='media.library'&&e.args?.action==='export'&&e.args.output===o.output))history.push({visual:{sourceRef:source?.ref||r.args.sourceOutput,layout:r.args.composition.layout},format:{width:o.width,height:o.height,sourceSha256:source?.sha256}});
 }
 return history;
}
export function deliveredImageCombination(receipts,args){
 const entries=mediaEntries(receipts),source=entries.find(e=>e.ref===args.sourceOutput)||entries.find(e=>receipts.some(r=>r.ok&&r.name==='media.library'&&r.observation?.output===args.sourceOutput&&r.observation.sha256===e.sha256));
 if(!source||!args.composition)return false;
 return deliveredImageHistory(receipts).some(h=>
  (h.visual?.sourceRef===source.ref||h.format?.sourceSha256&&h.format.sourceSha256===source.sha256)&&h.visual?.layout===args.composition.layout&&
  (!(Number(h.format?.width)>0&&Number(h.format?.height)>0)||args.variants?.some(v=>Number(v.width)===Number(h.format.width)&&Number(v.height)===Number(h.format.height))));
}
export function producedMedia(receipts){
 return receipts.filter(r=>r.ok).flatMap(r=>r.name==='image.adapt'?(r.observation.outputs||[]):
  ['page.create','document.create','speech.synthesize','reel.create','browser.screenshot'].includes(r.name)?[{...r.observation,sha256:r.observation.sha256||(r.observation.artifact&&r.observation.artifact.file===r.observation.output?r.observation.artifact.sha256:undefined)}]:[]);
}
export function mediaPaths(missionId){
 const stem=missionId+'-';
 return {imagePrefix:stem,audioPrefix:'.jarvis-artifacts/audio/'+stem,
  owns:path=>typeof path==='string'&&(
   path.startsWith('.jarvis-artifacts/images/'+stem)&&/^[a-zA-Z0-9_-]+\.png$/.test(path.slice(('.jarvis-artifacts/images/'+stem).length))||
   path.startsWith('.jarvis-artifacts/audio/'+stem)&&/^[a-zA-Z0-9_-]+\.wav$/.test(path.slice(('.jarvis-artifacts/audio/'+stem).length)))};
}
export function authorizeMedia(call,receipts,policy){
 const a=call.args||{},entries=mediaEntries(receipts),produced=producedMedia(receipts);
 const known=ref=>entries.some(e=>e.ref===ref)||receipts.some(r=>r.ok&&r.name==='media.library'&&r.observation.output===ref)||produced.some(p=>p.output===ref);
 const bad=reason=>({ok:false,reason});
 if(call.name==='media.library'){
  if(a.action==='list')return {ok:true};
  if(a.action==='import')return entries.some(e=>e.relativePath===a.relativePath)?{ok:true}:bad('OBSERVED_LIBRARY_REFERENCE_REQUIRED');
  if(a.action==='export'&&/\.mp4$/.test(a.output||'')){
   const artifact=produced.find(p=>p.output===a.output),review=receipts.find(r=>r.ok&&r.name==='media.analyze'&&r.observation?.output===a.output&&r.observation.sourceSha256===artifact?.sha256)?.observation;
   const reel=receipts.find(r=>r.ok&&r.name==='reel.create'&&r.observation.output===a.output),speech=receipts.find(r=>r.ok&&r.name==='speech.synthesize'&&r.observation.output===reel?.args?.audioOutput);
   const audioCheck=verifyNarrationTimeline({sourceSha256:review?.audioEvidence?.sha256,durationSeconds:reel?.args?.durationSeconds,narration:speech?.args?.text,scenes:reel?.args?.scenes,transcription:review?.audioEvidence?.transcription});
   if(review?.status!=='LOCAL_VIDEO_REVIEW_VERIFIED'||!audioCheck.transcriptionVerified||!audioCheck.synchronizationVerified)return bad('VIDEO_APPROVED_REVIEW_REQUIRED');
  }
  if(a.action==='export')return produced.some(p=>p.output===a.output)&&policy.ownPath(a.output)?{ok:true}:bad('MISSION_ARTIFACT_RECEIPT_REQUIRED');
  return bad('LIBRARY_ACTION_NOT_ALLOWED');
 }
 if(call.name==='image.adapt'){
  if(deliveredImageCombination(receipts,a))return bad('ADVERTISING_DUPLICATE_BLOCKED');
  if(equivalentImageProduction(receipts,a))return bad('MISSION_RENDER_DUPLICATE_BLOCKED');
  if(!known(a.sourceOutput)||a.brandLogoOutput&&!known(a.brandLogoOutput))return bad('OBSERVED_LIBRARY_REFERENCE_REQUIRED');
  if(!a.outputPrefix?.startsWith(policy.imagePrefix)||!/^[a-zA-Z0-9_-]{1,96}$/.test(a.outputPrefix))return bad('MISSION_IMAGE_PREFIX_REQUIRED');
  if(!Array.isArray(a.variants)||!a.variants.length||new Set(a.variants.map(v=>v.id)).size!==a.variants.length||a.variants.some(v=>v.mimeType!=='image/png'||!/^[a-zA-Z0-9_-]{1,30}$/.test(v.id)))return bad('MISSION_IMAGE_VARIANTS_INVALID');
  if(a.variants.some(v=>/^w[0-9]+-h[0-9]+$/.test(v.id)&&v.id!==`w${v.width}-h${v.height}`))return bad('VARIANT_DIMENSIONS_MISMATCH');
  if(a.variants.some(v=>produced.some(p=>p.output===`.jarvis-artifacts/images/${a.outputPrefix}-${v.id}.png`)))return bad('EXISTING_ARTIFACT_OVERWRITE_FORBIDDEN');
  if(a.composition){const copy=['headline','body','cta','contact'].map(k=>String(a.composition[k]||'').toLowerCase().replace(/\s+/g,' ').trim()).filter(Boolean);if(new Set(copy).size!==copy.length)return bad('REDUNDANT_ADVERTISING_COPY');const source=entries.find(e=>e.ref===a.sourceOutput)||entries.find(e=>receipts.some(r=>r.ok&&r.observation.output===a.sourceOutput&&r.observation.sha256===e.sha256));
   if(a.composition.contact){
    const contact=a.composition.contact;
    // Independent authority: stock photography never proves brand ownership.
    // Accept only the exact contact in user-authorized commercial copy AND in
    // the verified contacts of a separate observed library source.
    const quoted=String(policy.instruction||'').match(/(?:único texto comercial(?: permitido)?|texto comercial exacto)\s*:\s*["“]([^"”]+)["”]/iu)?.[1]||'';
    const authorizedUserContact=[...quoted.matchAll(/(?:https?:\/\/|www\.)[^\s<>"']+/gi)].map(m=>m[0].replace(/[.,;!?)]*$/,'').toLowerCase()).includes(contact.toLowerCase());
    const corroborated=entries.some(e=>e!==source&&e.verifiedContacts?.includes(contact));
    if(!source?.verifiedContacts?.includes(contact)&&!(authorizedUserContact&&corroborated))return bad('VERIFIED_CONTACT_REQUIRED');
   }
   if(!source?.photoRegion||!['x','y','width','height'].every(k=>a.composition.photoCrop?.[k]===source.photoRegion[k]))return bad('VERIFIED_PHOTO_REGION_REQUIRED');}
 }
 if(call.name==='speech.synthesize'&&(!a.output?.startsWith(policy.audioPrefix)||!policy.ownPath(a.output)))return bad('MISSION_AUDIO_PATH_REQUIRED');
 if(call.name==='reel.create'){
  if(a.logoOutput&&!entries.some(e=>e.role==='official_logo_source'&&(e.ref===a.logoOutput||receipts.some(r=>r.ok&&r.name==='media.library'&&r.observation.output===a.logoOutput&&r.observation.sha256===e.sha256))))return bad('VERIFIED_LOGO_REFERENCE_REQUIRED');
  if(!policy.ownPath(a.output)||!a.output.endsWith('.mp4')||!policy.ownPath(a.studioOutput)||!a.studioOutput.endsWith('.html'))return bad('MISSION_REEL_OUTPUTS_REQUIRED');
  const production=({output,studioOutput,creativeDirection,...rest})=>JSON.stringify(canonicalProduction(rest));
  if(receipts.some(r=>r.ok&&r.name==='reel.create'&&production(r.args)===production(a)))return bad('MISSION_RENDER_DUPLICATE_BLOCKED');
  if(a.logoOutput&&(a.scenes||[]).some(scene=>receipts.some(r=>r.ok&&r.name==='image.adapt'&&r.args?.brandLogoOutput&&r.args?.composition&&r.observation?.outputs?.some(o=>o.output===scene.assetOutput))))return bad('REDUNDANT_VIDEO_LOGO');
  const sequence=verticalSequenceEvidence(a,receipts);if(!sequence.ok)return sequence;
  const speech=receipts.find(r=>r.ok&&r.name==='speech.synthesize'&&r.observation.output===a.audioOutput);
  const normalized=normalizeAudioWords;
  if(!speech?.args?.text||normalized(speech.args.text)!==normalized(a.scenes.map(s=>s.subtitle||'').join(' ')))return bad('NARRATION_SUBTITLE_TEXT_MISMATCH');
  const lastSceneStart=a.scenes.slice(0,-1).reduce((n,s)=>n+Number(s.durationSeconds),0);
  if(!Number.isFinite(lastSceneStart)||!(speech.observation.durationSeconds>lastSceneStart))return bad('NARRATION_DOES_NOT_REACH_FINAL_SCENE');
  if(!known(a.audioOutput)||!Array.isArray(a.scenes)||a.scenes.some(s=>!known(s.assetOutput))||a.logoOutput&&!known(a.logoOutput))return bad('OBSERVED_MEDIA_RECEIPTS_REQUIRED');
 }
 if(['speech.synthesize','reel.create'].includes(call.name)&&produced.some(p=>p.output===a.output))return bad('EXISTING_ARTIFACT_OVERWRITE_FORBIDDEN');
 return {ok:true};
}
export function mediaDeliveryGaps(receipts,objectives){
 if(!objectives.advertising)return [];
 const rows=receipts.filter(r=>r.ok),has=n=>rows.some(r=>r.name===n),gaps=[];
 if(!has('advertising.research'))gaps.push({goal:'observed advertising references',requiredTool:'advertising.research'});
 const urls=rows.filter(r=>r.name==='advertising.research').flatMap(r=>r.observation.sources||[]).map(s=>s.url);
 if(new Set(rows.filter(r=>r.name==='browser.inspect'&&r.observation.dom&&urls.includes(r.observation.url)).map(r=>r.observation.url)).size<2)gaps.push({goal:'two accessible reference pages',requiredTool:'browser.inspect',urls:urls.slice(0,5)});
 if(!has('media.library'))gaps.push({goal:'shared material inventory and provenance',requiredTool:'media.library'});
 if(!has('image.adapt'))gaps.push({goal:'physical social graphics',requiredTool:'image.adapt'});
 for(const format of objectives.requestedImageFormats||[])if(!rows.some(r=>r.name==='image.adapt'&&r.observation.outputs?.some(p=>p.width===format.width&&p.height===format.height)))gaps.push({goal:'requested image dimensions',requiredTool:'image.adapt',...format});
 if(objectives.reel){for(const n of ['speech.synthesize','reel.create'])if(!has(n))gaps.push({goal:'narrated conventional video',requiredTool:n});}
 const rejected=new Set(receipts.filter(r=>r.name==='media.analyze'&&r.observation?.status==='LOCAL_VIDEO_REVIEW_FAILED').map(r=>r.observation.output));
 for(const p of producedMedia(rows).filter(p=>/\.(png|mp4)$/.test(p.output||'')&&!rejected.has(p.output))){
  if(!rows.some(r=>r.name==='media.analyze'&&r.observation.output===p.output))gaps.push({goal:'pixel verification',requiredTool:'media.analyze',output:p.output});
  if(!rows.some(r=>r.name==='artifact.read'&&r.observation.output===p.output))gaps.push({goal:'file readback',requiredTool:'artifact.read',output:p.output});
  if(!rows.some(r=>r.name==='media.library'&&r.args.action==='export'&&r.args.output===p.output))gaps.push({goal:'registered experimental delivery',requiredTool:'media.library',action:'export',output:p.output});
 }
 return gaps;
}
export function verifyMediaDelivery(receipts,objectives,reads){
 const rows=receipts.filter(r=>r.ok),checks=[],check=(objective,satisfied,reason)=>checks.push({objective,satisfied:!!satisfied,reason});
 check('advertising deliverables present',mediaDeliveryGaps(receipts,objectives).length===0,'MEDIA_DELIVERY_EVIDENCE_INCOMPLETE');
 check('semantically relevant advertising sources',rows.some(r=>r.observation?.advertisingSemanticReview?.verified===true),'ADVERTISING_RELEVANCE_NOT_VERIFIED');
 const creativeRows=rows.filter(r=>['image.adapt','reel.create','speech.synthesize','page.create','document.create'].includes(r.name));
 check('creative claims bound to authorized evidence',creativeRows.length>0&&creativeRows.every(r=>r.observation?.creativeSemanticReview?.verified===true),'ADVERTISING_CLAIMS_NOT_VERIFIED');
 const images=producedMedia(rows).filter(a=>a.mimeType==='image/png'&&rows.some(r=>r.name==='image.adapt'&&r.observation.outputs?.some(p=>p.output===a.output)));
 check('new graphics with exact file and pixel receipts',images.length>0&&images.every(a=>{
  const read=reads.get(a.output),visual=rows.find(r=>r.name==='media.analyze'&&r.observation.output===a.output)?.observation;
  const bytes=read?.bytes;if(!bytes||bytes.length<24)return false;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return read.sha256===a.sha256&&view.getUint32(16)===a.width&&view.getUint32(20)===a.height&&visual?.imageSha256===a.sha256&&visual.visualPassed===true;
 }),'IMAGE_BYTES_DIMENSIONS_AND_VISUAL_REVIEW_REQUIRED');
 const exports=rows.filter(r=>r.name==='media.library'&&r.args.action==='export');
 check('experimental exports match created bytes',exports.length>0&&exports.every(r=>producedMedia(rows).some(a=>a.output===r.args.output&&a.sha256===r.observation.sha256)&&r.observation.experimental===true),'EXPERIMENTAL_EXPORT_PROVENANCE_REQUIRED');
 if(objectives.reel){
  const reel=rows.findLast(r=>r.name==='reel.create'),visual=reel&&rows.find(r=>r.name==='media.analyze'&&r.observation.output===reel.observation.output)?.observation;
  check('real vertical narrated MP4',reel&&reads.get(reel.observation.output)?.sha256===reel.observation.sha256&&visual?.sourceSha256===reel.observation.sha256&&visual?.status==='LOCAL_VIDEO_REVIEW_VERIFIED'&&visual.audioEvidence?.nonSilent===true&&visual.frames?.length===3&&visual.frames.every(f=>f.visualPassed===true)&&Math.abs(visual.durationSeconds-reel.args.durationSeconds)<=Math.max(1,reel.args.durationSeconds*.05),'VIDEO_BYTES_AUDIO_AND_SAMPLED_FRAMES_REQUIRED');
  check('distinct vertical scene sequence',reel&&verticalSequenceEvidence(reel.args,rows).ok,'VERTICAL_DISTINCT_SCENE_RECEIPTS_REQUIRED');
  const speech=rows.find(r=>r.name==='speech.synthesize'&&r.observation.output===reel?.args?.audioOutput);
  const audioCheck=verifyNarrationTimeline({sourceSha256:visual?.audioEvidence?.sha256,durationSeconds:reel?.args?.durationSeconds,narration:speech?.args?.text,scenes:reel?.args?.scenes,transcription:visual?.audioEvidence?.transcription});
  check('narration and synchronization independently reviewed',audioCheck.transcriptionVerified&&audioCheck.synchronizationVerified,audioCheck.reason);
  check('local narration and scene script provenance',speech?.observation.provider==='windows-system-speech'&&reel?.args?.audioOutput===speech.observation.output&&reel?.args?.scenes?.every(s=>s.subtitle?.trim()&&
    (s.overlay?.trim()||verifiedPosterCopy(s,receipts))),'NARRATION_AND_SUBTITLES_REQUIRED');
 }
 return checks;
}
