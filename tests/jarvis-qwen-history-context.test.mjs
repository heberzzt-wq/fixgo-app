import test from 'node:test';import assert from 'node:assert/strict';
import {compactGeneralObservation,groundGeneralCatalog} from '../modules/terminal/qwen-general-pilot.js';
test('historical copy stays in receipts but is omitted from creative model context',()=>{
 const c=compactGeneralObservation({ok:true,entries:[],advertisingHistory:[{creative:{headline:'Old copy'},visual:{sourceRef:'library:Entradas/A.png',layout:'stack'}}]});
 assert.equal(JSON.stringify(c).includes('Old copy'),false);assert.equal(c.historicalCopyOmitted,true);assert.equal(c.usedSourceAndLayouts[0].layout,'stack');
});
test('composition alternatives bind actual crop, contact and unused source/layout without brand filtering',()=>{
 const tool={name:'image.adapt',inputSchema:{type:'object',properties:{composition:{type:'object',properties:{layout:{enum:['split','stack']},headline:{type:'string'}}},creativeDirection:{properties:{references:{items:{}}}}}}};
 const e={ref:'library:Entradas/Any project/a.png',photoRegion:{x:1,y:2,width:30,height:40},verifiedContacts:['verified.test']};
 const receipts=[{ok:true,name:'advertising.research',observation:{entries:[e],advertisingHistory:[{visual:{sourceRef:e.ref,layout:'stack'}}],sources:[]}}];
 const grounded=groundGeneralCatalog([tool],receipts)[0].inputSchema.anyOf[0].properties;
 assert.equal(grounded.sourceOutput.const,e.ref);assert.deepEqual(grounded.composition.properties.layout.enum,['split']);assert.deepEqual(grounded.composition.properties.contact.enum,['verified.test']);assert.deepEqual(grounded.composition.properties.photoCrop.const,e.photoRegion);assert.equal(grounded.composition.properties.headline.type,'string');
});
test('completed media reads and reviews disappear but pending outputs remain selectable',()=>{
 const catalog=['artifact.read','media.analyze'].map(name=>({name,inputSchema:{type:'object',properties:{output:{type:'string'}}}}));
 const outputs=[{output:'.jarvis-artifacts/images/general-12345678-a.png',mimeType:'image/png'},{output:'.jarvis-artifacts/images/general-12345678-b.png',mimeType:'image/png'}];
 const receipts=[{ok:true,name:'image.adapt',observation:{outputs}},...catalog.map(t=>({ok:true,name:t.name,observation:outputs[0]}))];
 for(const t of groundGeneralCatalog(catalog,receipts))assert.deepEqual(t.inputSchema.properties.output.enum,[outputs[1].output]);
 receipts.push(...catalog.map(t=>({ok:true,name:t.name,observation:outputs[1]})));assert.deepEqual(groundGeneralCatalog(catalog,receipts),[]);
});

test('delivered dimensions are excluded per source and layout, independent of format id',()=>{
 const e={ref:'library:Entradas/Shared/a.png',sha256:'a'.repeat(64),photoRegion:{x:0,y:0,width:10,height:10}};
 const tool={name:'image.adapt',inputSchema:{type:'object',properties:{variants:{type:'array',minItems:1,items:{type:'object',properties:{id:{type:'string'},width:{type:'integer'},height:{type:'integer'}}}},composition:{type:'object',properties:{layout:{enum:['split','stack']}}},creativeDirection:{properties:{references:{items:{}}}}}}};
 const history=[{visual:{sourceRef:e.ref,layout:'split'},format:{id:'old',width:1080,height:1920,sourceSha256:e.sha256}},{visual:{sourceRef:e.ref,layout:'split'},format:{id:'square',width:1080,height:1080,sourceSha256:e.sha256}}];
 const receipts=[{ok:true,name:'advertising.research',observation:{entries:[e],advertisingHistory:history,sources:[]}}];
 const choices=groundGeneralCatalog([tool],receipts)[0].inputSchema.anyOf;
 const split=choices.find(c=>c.properties.composition.properties.layout.enum[0]==='split').properties;
 const stack=choices.find(c=>c.properties.composition.properties.layout.enum[0]==='stack').properties;
 const dimensions=item=>item.anyOf.map(c=>[c.properties.width.const,c.properties.height.const]);
 assert.ok(!dimensions(split.variants.items).some(([w,h])=>w===1080&&(h===1920||h===1080)));
 assert.ok(dimensions(stack.variants.items).some(([w,h])=>w===1080&&h===1920));
 assert.ok(dimensions(split.variants.items).some(([w,h])=>w===1920&&h===1080));
 assert.equal(JSON.stringify(choices).includes('"not"'),false);
 assert.equal(split.variants.items.properties.width.type,'integer');
});

test('legacy exhausted source/layout choices remove rendering instead of permissive fallback',()=>{
 const e={ref:'library:Entradas/Any name/a.png',photoRegion:{x:0,y:0,width:10,height:10}};
 const tool={name:'image.adapt',inputSchema:{type:'object',properties:{composition:{properties:{layout:{enum:['split','stack']}}},creativeDirection:{properties:{references:{items:{}}}}}}};
 const receipts=[{ok:true,name:'advertising.research',observation:{entries:[e],advertisingHistory:['split','stack'].map(layout=>({visual:{sourceRef:e.ref,layout}})),sources:[]}}];
 assert.deepEqual(groundGeneralCatalog([tool],receipts),[]);
});

test('research waits for pending sources, returns after rejected reads, and closes after verification',()=>{
 const tool={name:'advertising.research',inputSchema:{properties:{}}};
 const receipts=[{ok:true,name:'advertising.research',observation:{sources:[{url:'https://example.test'}]}}];
 assert.equal(groundGeneralCatalog([tool],receipts).length,0);
 receipts.push({ok:true,name:'browser.inspect',observation:{url:'https://example.test',advertisingSemanticReview:{verified:false}}});
 assert.equal(groundGeneralCatalog([tool],receipts).length,1);
 receipts.push({ok:true,name:'browser.inspect',observation:{advertisingSemanticReview:{verified:true}}});
 assert.equal(groundGeneralCatalog([tool],receipts).length,0);
 const compact=compactGeneralObservation({ok:true,dom:'<p>Evidence</p>',advertisingSemanticReview:{verified:false,reason:'Wrong sector'}});
 assert.equal(compact.advertisingSemanticReview.reason,'Wrong sector');
});

test('advertising waits for semantic evidence before offering any creative writer and restores intact tools',async()=>{
 const {generalToolCatalog}=await import('../modules/terminal/qwen-general-pilot.js');
 const {createGeneralToolPolicy}=await import('../jarvis-qwen-general-policy.js');
 const {registerJarvisMultifunctionTools}=await import('../gestia-core/jarvis/jarvis.multitool.pack.js');
 const {registerJarvisActuatorTools}=await import('../gestia-core/jarvis/jarvis.actuator.pack.js');
 const definitions=[],runtime={register(t){definitions.push(t);return t},list:()=>JSON.parse(JSON.stringify(definitions))};
 registerJarvisMultifunctionTools(runtime);registerJarvisActuatorTools(runtime);
 const policy=createGeneralToolPolicy({location:{protocol:'http:',hostname:'127.0.0.1',port:'5000',search:'?qwenPilot=general-v1'},missionId:'general-12345678'});
 const catalog=generalToolCatalog(runtime,policy,{advertising:true,research:true,reel:true,page:true,document:true},'Campaña con horizontal 1200x628, retrato 1080 × 1350.');
 for(const name of ['page.create','document.create','browser.screenshot']){const pattern=new RegExp(catalog.find(t=>t.name===name).inputSchema.properties.output.pattern);assert.ok(pattern.test(policy.artifactRoot+'script.json'));assert.ok(!pattern.test(policy.artifactRoot.replace('12345678','1234')+'script.json'));assert.ok(!pattern.test(policy.artifactRoot+'../script.json'));}
 assert.ok(catalog.some(t=>t.name==='advertising.research'));assert.ok(!catalog.some(t=>t.name==='web.research'));
 const e={ref:'library:Entradas/Any/a.png',relativePath:'Entradas/Any/a.png',mimeType:'image/png',photoRegion:{x:0,y:0,width:10,height:10}};
 const receipts=[{ok:true,name:'advertising.research',observation:{entries:[e],sources:[{url:'https://example.test/one'},{url:'https://example.test/unopened.pdf'}]}}];
 const writers=['image.adapt','reel.create','speech.synthesize','page.create','document.create'];
 const pending=groundGeneralCatalog(catalog,receipts);
 assert.ok(writers.every(name=>!pending.some(t=>t.name===name)));
 assert.ok(pending.some(t=>t.name==='browser.inspect'));assert.ok(pending.some(t=>t.name==='media.library'));
 receipts.push({ok:false,name:'browser.inspect',observation:{advertisingSemanticReview:{verified:true}}});
 assert.ok(writers.every(name=>!groundGeneralCatalog(catalog,receipts).some(t=>t.name===name)));
 receipts.push({ok:true,name:'browser.inspect',observation:{advertisingSemanticReview:{verified:true,acceptedSourceURLs:['https://example.test/one']}}});
 const ready=groundGeneralCatalog(catalog,receipts);
 assert.ok(writers.every(name=>ready.some(t=>t.name===name)));
 assert.ok(!ready.some(t=>t.name==='browser.inspect'),'verified research closes pending external reads');
 assert.equal(ready.find(t=>t.name==='reel.create').inputSchema.properties.durationSeconds.minimum,30);
 assert.equal(ready.find(t=>t.name==='image.adapt').inputSchema.properties.variants.maxItems,3);
 const variantSchema=ready.find(t=>t.name==='image.adapt').inputSchema.anyOf[0].properties.variants;
 assert.equal(variantSchema.enum.length,3);for(const selection of variantSchema.enum){assert.equal(new Set(selection.map(v=>v.id)).size,selection.length);for(const v of selection)assert.match(v.id,/^[a-zA-Z0-9_-]{1,30}$/);}
 const formatChoices=variantSchema.items.anyOf;
 assert.equal(formatChoices.length,2,'explicit dimensions exclude unrelated default sizes');
 assert.ok(formatChoices.some(f=>f.properties.width.const===1200&&f.properties.height.const===628));
 assert.ok(formatChoices.some(f=>f.properties.width.const===1080&&f.properties.height.const===1350));
 for(const branch of formatChoices){
  assert.equal(branch.type,'object');assert.equal(branch.additionalProperties,false);
  for(const key of ['id','mimeType','width','height']){assert.ok(branch.required.includes(key));assert.ok(branch.properties[key]);}
  assert.equal(branch.properties.id.type,'string');assert.equal(branch.properties.mimeType.const,'image/png');
 }
 for(const name of ['image.adapt','reel.create'])assert.deepEqual(ready.find(t=>t.name===name).inputSchema.properties.creativeDirection.properties.references.items.enum,['https://example.test/one']);
 assert.ok(JSON.stringify(pending).length<JSON.stringify(ready).length/2);
 const researchOnly=generalToolCatalog(runtime,policy,{research:true});
 assert.ok(researchOnly.some(t=>t.name==='web.research'));assert.ok(!researchOnly.some(t=>t.name==='advertising.research'));
 const documentOnly=generalToolCatalog(runtime,policy,{document:true});
 assert.ok(groundGeneralCatalog(documentOnly,[]).some(t=>t.name==='document.create'));
});

test('compact browser observation prioritizes main content while retaining observed dates',()=>{
 const dom='<title>Fiscal guide</title><header>'+('menu '.repeat(1000))+'</header><main><p>Relevant sector guidance 2026-10-19.</p><nav>Ignore navigation</nav></main><footer>Other links</footer>';
 const o=compactGeneralObservation({ok:true,dom});
 assert.ok(o.domText.includes('Relevant sector guidance'));assert.ok(o.domText.includes('Fiscal guide'));
 assert.ok(!o.domText.includes('menu'));assert.ok(!o.domText.includes('Ignore navigation'));assert.ok(!o.domText.includes('Other links'));
 assert.deepEqual(o.sourceDates,['2026-10-19']);
});

test('browser evidence extracts full observed stdout before bounded DOM truncation loses article',()=>{
 const stdout='<title>Guide</title><script>'+('x'.repeat(260000))+'</script><main><p>Real financial advertising guidance is present after the large page header.</p></main>';
 const o=compactGeneralObservation({ok:true,dom:stdout.slice(0,250000),stdout});
 assert.ok(o.domText.includes('Real financial advertising guidance'));
 assert.ok(o.domText.length<2800);
 assert.equal(o.stdout,undefined);
});

test('advertising HTML reader omits PDFs without removing other research capabilities',()=>{
 const tool={name:'browser.inspect',inputSchema:{type:'object',properties:{url:{type:'string'}},required:['url']}};
 const observation={sources:[{url:'https://example.test/guide.pdf'},{url:'https://example.test/article'}]};
 const ad=groundGeneralCatalog([tool],[{ok:true,name:'advertising.research',observation}]);
 assert.deepEqual(ad[0].inputSchema.properties.url.enum,['https://example.test/article']);
 const generic=groundGeneralCatalog([tool],[{ok:true,name:'web.research',observation}]);
 assert.equal(generic[0].inputSchema.properties.url.enum.length,2);
});

test('preview actions wait for a page created in the mission, never research URLs',()=>{
 const catalog=['browser.open','browser.screenshot'].map(name=>({name,inputSchema:{type:'object',properties:{url:{type:'string'}},required:['url']}}));
 const rows=[{ok:true,name:'advertising.research',observation:{sources:[{url:'https://example.test/research'}]}}];
 assert.equal(groundGeneralCatalog(catalog,rows).length,0);
 rows.push({ok:true,name:'page.create',observation:{url:'http://localhost:5000/new.html',output:'.jarvis-artifacts/new.html',sha256:'abc'}});
 for(const t of groundGeneralCatalog(catalog,rows))assert.deepEqual(t.inputSchema.properties.url.enum,['http://localhost:5000/new.html']);
 rows.push({ok:true,name:'browser.open',args:{url:'http://localhost:5000/new.html'},observation:{}});assert.deepEqual(groundGeneralCatalog(catalog,rows).map(t=>t.name),['browser.screenshot']);
 rows.push({ok:true,name:'browser.screenshot',args:{url:'http://localhost:5000/new.html'},observation:{output:'.jarvis-artifacts/capture.png',sha256:'abc'}});assert.deepEqual(groundGeneralCatalog(catalog,rows),[]);
});

test('subsequent semantic review excludes rejected evidence without converting it into support',async()=>{
 const {advertisingReviewInput}=await import('../modules/terminal/qwen-general-pilot.js');
 const urls=['https://example.test/blocked','https://example.test/good','https://example.test/new'];
 const rows=[{ok:true,name:'advertising.research',observation:{sources:urls.map(url=>({url})),entries:[]}},...urls.map(url=>({ok:true,name:'browser.inspect',observation:{url,dom:'<main>Observed article text</main>'}}))];
 rows[2].observation.advertisingSemanticReview={verified:false,review:{sources:[{url:urls[0],topicRelevant:false,sectorRelevant:false,identityCompatible:true,objectiveRelevant:false},{url:urls[1],topicRelevant:true,sectorRelevant:true,identityCompatible:true,objectiveRelevant:true}]}};
 const before=JSON.stringify(rows),input=advertisingReviewInput(rows,'Research the requested principles');
 assert.deepEqual(input.openedSources.map(s=>s.url),urls.slice(1));
 assert.equal(input.verified,undefined);assert.equal(JSON.stringify(rows),before);
 const one=advertisingReviewInput(rows.slice(0,3),'Research the requested principles');
 assert.equal(one.openedSources.length,1,'one accepted source never becomes two');
});
