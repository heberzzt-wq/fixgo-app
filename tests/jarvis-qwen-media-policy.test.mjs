import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createGeneralToolPolicy} from '../jarvis-qwen-general-policy.js';
import {qwenArtifactWriteGuard} from '../jarvis-qwen-artifact-write-guard.js';
import {mediaDeliveryGaps,verifyMediaDelivery} from '../modules/terminal/qwen-general-media.js';
test('document export binds the ledger hash to its exact created file',()=>{
 const output='.jarvis-artifacts/qwen-general/general-12345678/report.json',sha256='a'.repeat(64);
 const rows=[{name:'document.create',ok:true,args:{},observation:{output,artifact:{file:output,sha256}}},{name:'media.library',ok:true,args:{action:'export',output},observation:{sha256,experimental:true}}];
 const check=()=>verifyMediaDelivery(rows,{advertising:true},new Map()).find(c=>c.objective==='experimental exports match created bytes').satisfied;
 assert.equal(check(),true);
 rows[0].observation.artifact.file+='-other';assert.equal(check(),false);
 rows[0].observation.artifact.file=output;rows[1].observation.sha256='b'.repeat(64);assert.equal(check(),false);
 rows[1].observation.sha256=sha256;rows[1].observation.experimental=false;assert.equal(check(),false);
});
const p=createGeneralToolPolicy({location:{protocol:'http:',hostname:'localhost',port:'5000',search:'?qwenPilot=general-v1'},missionId:'general-12345678'});
test('shared library references use provenance rather than brand names',()=>{
 const entry={ref:'library:Entradas/Un proyecto/a.png',relativePath:'Entradas/Un proyecto/a.png',photoRegion:{x:0,y:0,width:100,height:100}};
 const receipts=[{name:'advertising.research',ok:true,observation:{entries:[entry]}}];
 assert.equal(p.authorize({name:'media.library',args:{action:'import',relativePath:entry.relativePath}},receipts).ok,true);
 assert.equal(p.authorize({name:'media.library',args:{action:'import',relativePath:'Entradas/not-observed.png'}},receipts).ok,false);
 const call={name:'image.adapt',args:{sourceOutput:entry.ref,outputPrefix:p.imagePrefix+'new',variants:[{id:'social',mimeType:'image/png'}],composition:{photoCrop:entry.photoRegion}}};
 assert.equal(p.authorize(call,receipts).ok,true);call.args.composition.photoCrop={...entry.photoRegion,x:5};assert.equal(p.authorize(call,receipts).ok,false);
});
test('media writes and exports remain bound to this mission and observed receipts',()=>{
 assert.equal(p.authorize({name:'speech.synthesize',args:{output:'.jarvis-artifacts/audio/other.wav'}},[]).ok,false);
 assert.equal(p.authorize({name:'speech.synthesize',args:{output:p.audioPrefix+'narration.wav'}},[]).ok,true);
 assert.equal(p.authorize({name:'media.library',args:{action:'export',output:p.artifactRoot+'uncreated.png'}},[]).ok,false);
 assert.equal(p.authorize({name:'reel.create',args:{output:p.artifactRoot+'v.mp4',studioOutput:p.artifactRoot+'s.html',scenes:[],audioOutput:'invented.wav'}},[]).ok,false);
});
test('advertising cannot certify missing physical outputs from a successful tool status',()=>{
 const receipts=[{name:'image.adapt',ok:true,observation:{ok:true,outputs:[{output:p.artifactRoot+'fake.png',sha256:'a'.repeat(64),mimeType:'image/png'}]}}];
 assert.ok(mediaDeliveryGaps(receipts,{advertising:true,reel:true}).length);
 assert.ok(verifyMediaDelivery(receipts,{advertising:true,reel:true},new Map()).some(c=>!c.satisfied));
});
test('server refuses an already existing experimental speech or reel target without touching bytes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qwen-write-guard-'));
 try{const output='.jarvis-artifacts/audio/general-12345678-narration.wav',file=path.join(root,output);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'preserve');
 let code,body,next=false;const res={status(n){code=n;return this;},json(x){body=x;return this;}};
 qwenArtifactWriteGuard(root)({method:'POST',path:'/speech/synthesize',body:{output}},res,()=>{next=true;});
 assert.equal(code,409);assert.equal(body.error,'EXISTING_ARTIFACT_OVERWRITE_FORBIDDEN');assert.equal(next,false);assert.equal(fs.readFileSync(file,'utf8'),'preserve');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('reel logo uses verified role rather than an arbitrary known photograph',()=>{
 const entries=[{ref:'library:Entradas/project/photo.png',role:'input',sha256:'photo'},{ref:'library:Logos/project/logo.png',role:'official_logo_source',sha256:'logo'}];
 const receipts=[{ok:true,name:'advertising.research',observation:{entries}},{ok:true,name:'speech.synthesize',observation:{output:p.audioPrefix+'narration.wav'}}];
 const args={output:p.artifactRoot+'v.mp4',studioOutput:p.artifactRoot+'s.html',scenes:[{assetOutput:entries[0].ref}],audioOutput:p.audioPrefix+'narration.wav',logoOutput:entries[0].ref};
 assert.equal(p.authorize({name:'reel.create',args},receipts).reason,'VERIFIED_LOGO_REFERENCE_REQUIRED');args.logoOutput=entries[1].ref;assert.equal(p.authorize({name:'reel.create',args},receipts).reason,'VERTICAL_SCENE_ASSETS_REQUIRED');
});

function duplicateFixture(){
 const entry={ref:'library:Entradas/Shared/photo.png',relativePath:'Entradas/Shared/photo.png',sha256:'a'.repeat(64),photoRegion:{x:0,y:0,width:100,height:100}};
 const delivered={visual:{sourceRef:entry.ref,layout:'split'},format:{width:1080,height:1920,sourceSha256:entry.sha256}};
 const receipts=[{ok:true,name:'media.library',args:{action:'list'},observation:{entries:[entry],deliveredCombinations:[delivered]}}];
 const args={sourceOutput:entry.ref,outputPrefix:p.imagePrefix+'fresh',composition:{layout:'split',photoCrop:entry.photoRegion},variants:[{id:'new-name',width:1080,height:1920,mimeType:'image/png'}]};
 return {entry,delivered,receipts,args,authorize:()=>p.authorize({name:'image.adapt',args},receipts)};
}

test('host pre-render refuses delivered dimensions even under a new variant id, permits different dimensions',()=>{
 const f=duplicateFixture();assert.equal(f.authorize().reason,'ADVERTISING_DUPLICATE_BLOCKED');
 f.args.variants[0].height=1080;assert.equal(f.authorize().ok,true);
 f.args.variants.push({id:'renamed-again',width:1080,height:1920,mimeType:'image/png'});assert.equal(f.authorize().reason,'ADVERTISING_DUPLICATE_BLOCKED');
});

test('host pre-render resolves imported original by verified SHA before duplicate check',()=>{
 const f=duplicateFixture();const output='.jarvis-artifacts/material-library/'+f.entry.sha256+'.png';
 f.receipts.push({ok:true,name:'media.library',args:{action:'import',relativePath:f.entry.relativePath},observation:{output,sha256:f.entry.sha256}});
 f.args.sourceOutput=output;assert.equal(f.authorize().reason,'ADVERTISING_DUPLICATE_BLOCKED');
});

test('legacy delivery blocks its photo and layout across requested dimensions',()=>{
 const f=duplicateFixture();delete f.delivered.format;f.args.variants[0].height=628;
 assert.equal(f.authorize().reason,'ADVERTISING_DUPLICATE_BLOCKED');
 f.args.composition.layout='stack';assert.equal(f.authorize().ok,true);
});

test('complete combinations enforce older deliveries omitted from detailed recent history',()=>{
 const f=duplicateFixture();f.receipts[0].observation.advertisingHistory=[];
 assert.equal(f.authorize().reason,'ADVERTISING_DUPLICATE_BLOCKED');
});

test('a newly exported composition enters the pre-render guard in the same mission',()=>{
 const f=duplicateFixture();f.receipts[0].observation.deliveredCombinations=[];
 const output='.jarvis-artifacts/images/'+p.imagePrefix+'previous-social.png';
 f.receipts.push({ok:true,name:'image.adapt',args:structuredClone(f.args),observation:{outputs:[{output,width:1080,height:1920,mimeType:'image/png'}]}});
 assert.equal(f.authorize().reason,'MISSION_RENDER_DUPLICATE_BLOCKED');
 f.receipts.push({ok:true,name:'media.library',args:{action:'export',output},observation:{experimental:true}});
 assert.equal(f.authorize().reason,'ADVERTISING_DUPLICATE_BLOCKED');
});

test('new export retains imported source identity for the next library-reference composition',()=>{
 const f=duplicateFixture();f.receipts[0].observation.deliveredCombinations=[];
 const imported='.jarvis-artifacts/material-library/'+f.entry.sha256+'.png',output='.jarvis-artifacts/images/'+p.imagePrefix+'previous-social.png';
 f.receipts.push({ok:true,name:'media.library',args:{action:'import',relativePath:f.entry.relativePath},observation:{output:imported,sha256:f.entry.sha256}});
 f.receipts.push({ok:true,name:'image.adapt',args:{...structuredClone(f.args),sourceOutput:imported},observation:{outputs:[{output,width:1080,height:1920,mimeType:'image/png'}]}});
 f.receipts.push({ok:true,name:'media.library',args:{action:'export',output},observation:{experimental:true}});
 assert.equal(f.authorize().reason,'ADVERTISING_DUPLICATE_BLOCKED');
});

test('every requested social format remains pending until a real output exists',()=>{
 const objectives={advertising:true,requestedImageFormats:[{width:1080,height:1080},{width:1200,height:628}]};
 const rows=[{ok:true,name:'image.adapt',observation:{outputs:[{output:'.jarvis-artifacts/a.png',width:1200,height:628}]}}];
 assert.deepEqual(mediaDeliveryGaps(rows,objectives).filter(g=>g.goal==='requested image dimensions'),[{goal:'requested image dimensions',requiredTool:'image.adapt',width:1080,height:1080}]);
 rows[0].observation.outputs.push({output:'.jarvis-artifacts/b.png',width:1080,height:1080});
 assert.equal(mediaDeliveryGaps(rows,objectives).filter(g=>g.goal==='requested image dimensions').length,0);
 const call={name:'image.adapt',args:{sourceOutput:'library:a.png',outputPrefix:p.imagePrefix+'new',variants:[{id:'same',mimeType:'image/png'},{id:'same',mimeType:'image/png'}]}};
 assert.equal(p.authorize(call,[{ok:true,name:'advertising.research',observation:{entries:[{ref:'library:a.png'}]}}]).reason,'MISSION_IMAGE_VARIANTS_INVALID');
});
