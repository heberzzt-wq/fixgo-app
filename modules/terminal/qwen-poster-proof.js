import {normalizeAudioWords} from '../../jarvis-qwen-audio-evidence.js';

// No second text layer is needed if an unchanged, officially branded PNG
// contains the authorized wording and has independent physical receipts.
export function verifiedPosterCopy(scene,receipts=[]){
 if(!scene||scene.presentation!=='poster'||scene.overlay!==''||
    !scene.assetOutput||!normalizeAudioWords(scene.subtitle||''))return false;
 const adapted=receipts.find(r=>r.ok===true&&r.name==='image.adapt'&&
   r.args?.brandLogoOutput?.startsWith('library:Logos/')&&
   (r.observation?.outputs||[]).some(a=>a.output===scene.assetOutput&&
     a.width===1080&&a.height===1920&&/^[a-f0-9]{64}$/i.test(a.sha256||'')));
 const asset=adapted?.observation.outputs.find(a=>a.output===scene.assetOutput);
 if(!asset)return false;
 const logo=adapted.args.brandLogoOutput;
 if(!receipts.some(r=>r.ok===true&&(r.observation?.entries||[]).some(entry=>entry.role==='official_logo_source'&&entry.ref===logo&&/^[a-f0-9]{64}$/i.test(entry.sha256||''))))return false;
 const copy=normalizeAudioWords(['headline','body','cta','contact']
   .map(k=>adapted.args?.composition?.[k]||'').join(' '));
 const subtitle=normalizeAudioWords(scene.subtitle);
 if(!(' '+copy+' ').includes(' '+subtitle+' '))return false;
 const matching=r=>r.ok===true&&r.observation?.output===asset.output;
 return receipts.some(r=>r.name==='media.analyze'&&matching(r)&&
    r.observation?.imageSha256===asset.sha256&&r.observation?.visualPassed===true)&&
  receipts.some(r=>r.name==='artifact.read'&&matching(r)&&
    r.observation?.sha256===asset.sha256)&&
  receipts.some(r=>r.name==='media.library'&&r.ok===true&&
    r.args?.action==='export'&&r.args.output===asset.output&&
    r.observation?.sha256===asset.sha256&&r.observation?.experimental===true);
}
