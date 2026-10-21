import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedPosterCopy} from '../modules/terminal/qwen-poster-proof.js';
import {validateProductionDocument} from '../modules/terminal/qwen-general-evidence.js';
const key='a'.repeat(64),speechSha='b'.repeat(64),videoSha='c'.repeat(64);
const images=[1,2,3].map(i=>({output:'.jarvis-artifacts/images/general-test-scene'+i+'.png',sha256:String(i).repeat(64),mimeType:'image/png',width:1080,height:1920}));
const subtitles=['Summit.','Asesoría fiscal y legal.','Conoce el servicio.'];
const scenes=images.map((image,i)=>({durationSeconds:10,assetOutput:image.output,presentation:'poster',overlay:'',subtitle:subtitles[i]}));
const sceneRows=()=>[{name:'advertising.research',ok:true,observation:{ok:true,entries:[{role:'official_logo_source',ref:'library:Logos/Summit/summit-logo-original.png',sha256:key}]}} ,...images.flatMap((img,i)=>[
 {name:'image.adapt',ok:true,observation:{ok:true,outputs:[img]},args:{brandLogoOutput:'library:Logos/Summit/summit-logo-original.png',composition:{headline:'Summit. Asesoría fiscal y legal.',body:'Conoce el servicio en www.summ.com.mx'}}},
 {name:'media.analyze',ok:true,observation:{ok:true,output:img.output,imageSha256:img.sha256,visualPassed:true}},
 {name:'artifact.read',ok:true,observation:{ok:true,output:img.output,sha256:img.sha256}},
 {name:'media.library',ok:true,args:{action:'export',output:img.output},observation:{ok:true,output:img.output,sha256:img.sha256,experimental:true}}
])];
test('poster subtitle may use pre-rendered official branded pixels only with full physical receipts',()=>{
 const r=sceneRows();
 assert.deepEqual(scenes.map(s=>verifiedPosterCopy(s,r)),[true,true,true]);
 for(const s of scenes){
  assert.equal(verifiedPosterCopy({...s,presentation:'scene'},r),false);
  assert.equal(verifiedPosterCopy({...s,subtitle:'Descuento gratuito'},r),false);
 }
 assert.equal(verifiedPosterCopy(scenes[0],r.filter(x=>!(x.name==='media.analyze'&&x.observation.output===images[0].output))),false);
 assert.equal(verifiedPosterCopy(scenes[0],r.filter(x=>!(x.name==='media.library'&&x.args?.output===images[0].output))),false);
 assert.equal(verifiedPosterCopy(scenes[0],r.filter(x=>!(x.name==='artifact.read'&&x.observation.output===images[0].output))),false);
 const mutated=structuredClone(r);mutated[1].observation.outputs[0].sha256=key;
 assert.equal(verifiedPosterCopy(scenes[0],mutated),false);
});
test('production document accepts verified poster with empty overlay, not ordinary empty overlay',()=>{
 const speech={name:'speech.synthesize',ok:true,args:{text:subtitles.join(' ')},observation:{ok:true,output:'.jarvis-artifacts/audio/general-test-timed.wav',sha256:speechSha}};
 const reel={name:'reel.create',ok:true,args:{audioOutput:speech.observation.output,durationSeconds:30,scenes},observation:{ok:true,output:'.jarvis-artifacts/qwen-general/general-test/advertisement.mp4',sha256:videoSha}};
 const rows=[...sceneRows(),speech,reel];
 const resources=[...images,speech.observation,reel.observation].map(x=>({output:x.output,sha256:x.sha256}));
 const doc={narration:speech.args.text,durationSeconds:30,scenes:scenes.map(x=>({durationSeconds:x.durationSeconds,assetOutput:x.assetOutput,overlay:x.overlay,subtitle:x.subtitle})),resources,limitations:['Local proof only']};
 const pass=validateProductionDocument(JSON.stringify(doc),rows,{advertising:true,reel:true});
 assert.equal(pass.ok,true,JSON.stringify(pass.issues));
 const invalid=structuredClone(rows);invalid[1].args.brandLogoOutput='library:Logos/Unverified/not-official.png';
 assert.equal(validateProductionDocument(JSON.stringify(doc),invalid,{advertising:true,reel:true}).ok,false);
 const unrendered=structuredClone(doc);unrendered.scenes[0].overlay='';
 const missing=rows.filter(r=>!(r.name==='artifact.read'&&r.observation.output===images[0].output));
 assert.equal(validateProductionDocument(JSON.stringify(unrendered),missing,{advertising:true,reel:true}).ok,false);
});

test('narration provenance accepts only an independently verified poster copy',async()=>{
 const {verifyMediaDelivery}=await import('../modules/terminal/qwen-general-media.js');
 const speech={name:'speech.synthesize',ok:true,args:{text:subtitles.join(' ')},observation:{ok:true,provider:'windows-system-speech',output:'.jarvis-artifacts/audio/general-test-narration.wav',sha256:speechSha}};
 const reel={name:'reel.create',ok:true,args:{scenes,audioOutput:speech.observation.output,durationSeconds:30},observation:{ok:true,output:'.jarvis-artifacts/qwen-general/general-test/advertisement.mp4',sha256:videoSha}};
 const rows=[...sceneRows(),speech,reel];
 const check=(receipts)=>verifyMediaDelivery(receipts,{advertising:true,reel:true},new Map()).find(x=>x.objective==='local narration and scene script provenance');
 assert.equal(check(rows)?.satisfied,true);
 const noRead=rows.filter(x=>!(x.name==='artifact.read'&&x.observation.output===images[1].output));
 assert.equal(check(noRead)?.satisfied,false);
 const wrong=structuredClone(rows);wrong.at(-1).args.scenes[1].presentation='scene';
 assert.equal(check(wrong)?.satisfied,false);
});
