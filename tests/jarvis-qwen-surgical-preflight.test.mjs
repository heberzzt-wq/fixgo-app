import test from 'node:test';
import assert from 'node:assert/strict';
import {generalMediaPreflight,groundGeneralCatalog,generalToolCatalog} from '../modules/terminal/qwen-general-pilot.js';
const entry=(id='a')=>({ref:`library:Entradas/${id}.png`,sha256:id.repeat(64),mimeType:'image/png',photoRegion:{x:0,y:0,width:100,height:200}});
const formats=[{width:1080,height:1080},{width:1200,height:628}];
function catalog(dims=formats){return [{name:'image.adapt',inputSchema:{type:'object',properties:{variants:{type:'array',items:{type:'object',properties:{id:{type:'string'},mimeType:{const:'image/png'},width:{type:'integer'},height:{type:'integer'}},anyOf:dims.map(f=>({properties:{width:{const:f.width},height:{const:f.height}}}))}},composition:{properties:{layout:{enum:['split','stack']}}},creativeDirection:{properties:{references:{items:{}}}}}}}];}
const research=(entries,history=[])=>({ok:true,name:'advertising.research',observation:{entries,deliveredCombinations:history}});
const used=(e,layout,width,height)=>({visual:{sourceRef:e.ref,layout},format:{width,height,sourceSha256:e.sha256}});
const production=(e,width,height,sha='d'.repeat(64))=>({ok:true,name:'image.adapt',args:{sourceOutput:e.ref,composition:{layout:'stack'},outputPrefix:'misleading-square',variants:[{id:'arbitrary',width,height}]},observation:{outputs:[{output:'.jarvis-artifacts/images/misleading-square.png',mimeType:'image/png',width,height,sha256:sha}]}});
test('preflight waits for actual library evidence rather than inventing availability',()=>{
 assert.deepEqual(generalMediaPreflight(catalog(),[],{advertising:true}).pending,true);
 assert.equal(generalMediaPreflight(catalog(),[research([])],{advertising:true,requestedImageFormats:formats}).reason,'REQUESTED_FORMAT_UNAVAILABLE');
});
test('phase4 horizontal remainder cannot satisfy requested square regardless of filename',()=>{
 const e=entry(),receipts=[research([e],[used(e,'split',1080,1080),used(e,'split',1200,628),used(e,'stack',1080,1080)])];
 const result=generalMediaPreflight(catalog(),receipts,{advertising:true,requestedImageFormats:formats});
 assert.equal(result.ok,false);assert.equal(result.reason,'REQUESTED_FORMAT_UNAVAILABLE');assert.deepEqual(result.missingFormats,[formats[0]]);
 assert.deepEqual(result.alternatives.map(a=>[a.width,a.height]),[[1200,628]]);
 receipts.push(production(e,1200,628));
 const after=generalMediaPreflight(catalog(),receipts,{advertising:true,requestedImageFormats:formats});
 assert.equal(after.ok,false);assert.deepEqual(after.missingFormats,[formats[0]]);assert.equal(after.optionsExhausted,true);
});
test('legacy unknown dimensions stay blocked without modifying receipts',()=>{
 const e=entry(),receipts=[research([e],['split','stack'].map(layout=>({visual:{sourceRef:e.ref,layout}})))],before=JSON.stringify(receipts);
 const p=generalMediaPreflight(catalog(),receipts,{advertising:true,requestedImageFormats:formats});
 assert.equal(p.optionsExhausted,true);assert.equal(p.blockedLegacyCombinations.length,2);assert.equal(JSON.stringify(receipts),before);
});
test('completed format remains satisfied and prefix changes cannot restore produced combination',()=>{
 const e=entry(),receipts=[research([e]),production(e,1080,1080)];
 const choices=groundGeneralCatalog(catalog(),receipts)[0].inputSchema.anyOf;
 const stack=choices.find(c=>c.properties.composition.properties.layout.enum[0]==='stack');
 assert.deepEqual(stack.properties.variants.enum,[[{id:'w1200-h628',width:1200,height:628,mimeType:'image/png'}]]);
 assert.equal(generalMediaPreflight(catalog(),receipts,{advertising:true,requestedImageFormats:formats}).ok,true);
});
test('TikTok requires three distinct vertical alternatives and counts current production once',()=>{
 const e=entry(),v=[{width:1080,height:1920}],objectives={advertising:true,reel:true};
 const limited=generalMediaPreflight(catalog(v),[research([e])],objectives);
 assert.equal(limited.reason,'VERTICAL_SEQUENCE_UNAVAILABLE');assert.equal(limited.verticalSequence.missing,1);
 const receipts=[research([e,entry('b')]),production(e,1080,1920)];
 const ready=generalMediaPreflight(catalog(v),receipts,objectives);
 assert.equal(ready.ok,true);assert.equal(ready.verticalSequence.produced,1);assert.equal(ready.verticalSequence.available,3);
 const square=generalMediaPreflight(catalog(formats),[research([e]),production(e,1080,1080)],objectives);
 assert.equal(square.reason,'REQUESTED_FORMAT_UNAVAILABLE');assert.equal(square.verticalSequence.produced,0);
});
test('reel catalog contains only unique actual portrait outputs, never nominal portrait filenames',()=>{
 const e=entry(),v={name:'reel.create',inputSchema:{properties:{scenes:{items:{properties:{}}},creativeDirection:{properties:{references:{items:{}}}}}}};
 const receipts=[research([e]),production(e,1080,1080),production(e,1080,1920,'e'.repeat(64))];
 receipts[2].observation.outputs[0].output='.jarvis-artifacts/images/vertical.png';
 receipts.push(structuredClone(receipts[2]));receipts[3].observation.outputs[0].output='.jarvis-artifacts/images/duplicate.png';
 const p=groundGeneralCatalog([v],receipts)[0].inputSchema.properties;
 assert.deepEqual(p.scenes.items.properties.assetOutput.enum,['.jarvis-artifacts/images/duplicate.png']);assert.equal(p.scenes.minItems,3);
});
test('one failed physical MP4 permits exactly one preserved-path repair and never export of rejected bytes',()=>{
 const e=entry(),base='.jarvis-artifacts/qwen-general/general-test/advertisement';
 const reel={name:'reel.create',inputSchema:{properties:{output:{const:base+'.mp4'},studioOutput:{const:base+'-studio.html'},scenes:{items:{properties:{}}},creativeDirection:{properties:{references:{items:{}}}}}}};
 const library={name:'media.library',inputSchema:{properties:{}}};
 const failed=output=>({ok:false,name:'media.analyze',args:{output},observation:{error:{code:'LOCAL_VIDEO_REVIEW_FAILED'}}});
 const made=output=>({ok:true,name:'reel.create',args:{output},observation:{output,mimeType:'video/mp4',sha256:'f'.repeat(64)}});
 const receipts=[research([e]),made(base+'.mp4'),failed(base+'.mp4')];
 const grounded=groundGeneralCatalog([reel,library],receipts);
 assert.equal(grounded.find(t=>t.name==='reel.create').inputSchema.properties.output.const,base+'-repair-1.mp4');
 assert.equal(JSON.stringify(grounded.find(t=>t.name==='media.library')).includes('"export"'),false);
 receipts.push(made(base+'-repair-1.mp4'),failed(base+'-repair-1.mp4'));
 assert.equal(groundGeneralCatalog([reel],receipts).length,0);
 assert.equal(generalMediaPreflight(catalog(),receipts,{advertising:true,reel:true}).reason,'LOCAL_VIDEO_REPAIR_EXHAUSTED');
});
