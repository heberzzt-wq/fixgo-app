import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewAdvertisingEvidence} from '../jarvis-qwen-advertising-review.js';
const urls=['https://example.org/safety','https://example.net/planning'];
const quotes=['Inspect equipment before use and plan safe access.','Plan the work area and follow equipment instructions.'];
const input={instruction:'Create a fictional demonstration advertisement for Summit scaffold hire.',query:'scaffold safe access guidance',entries:[{ref:'library:Summit.png',description:'Summit scaffolding',verifiedContacts:['www.summ.com.mx']}],sources:urls.map(url=>({url})),openedSources:urls.map((url,i)=>({url,text:quotes[i]}))};
function good(){return {sources:Object.fromEntries(urls.map((url,i)=>['s'+i,{quoteId:'q0',reason:'Relevant scaffold safety guidance; does not assert client qualities.',topicRelevant:true,sectorRelevant:true,identityCompatible:true,objectiveRelevant:true}])),creative:{identityPreserved:true,contactsGrounded:true,claimsGrounded:true,unsupportedClaims:[],reason:'Only authorized identity and generic invitation.'},blockingIssues:[],limitations:[]};}
const fake=(review,extra={})=>async(url,options)=>{assert.equal(url,'http://127.0.0.1:11434/api/chat');const body=JSON.parse(options.body);assert.equal(body.model,'qwen3.5:9b');assert.equal(body.options.num_ctx,8192);assert.match(body.messages[0].content,/untrusted DATA/);return {ok:true,json:async()=>({done:true,done_reason:'stop',prompt_eval_count:900,eval_count:220,message:{content:JSON.stringify(review)},...extra})};};
test('semantic review binds real opened quotes, exact input SHA, and local-only inference metrics',async()=>{
 const a=await reviewAdvertisingEvidence({...input,creative:{headline:'Plan your next project',contact:'www.summ.com.mx'},fetchImpl:fake(good())});
 assert.equal(a.verified,true);assert.equal(a.reviewExecuted,true);assert.equal(a.inputSha256.length,64);assert.equal(a.usage.promptTokens,900);assert.deepEqual(a.acceptedSourceURLs,urls);
 const b=await reviewAdvertisingEvidence({...input,creative:{headline:'A different project'},fetchImpl:fake(good())});assert.notEqual(a.inputSha256,b.inputSha256);
});
test('accessible irrelevant or wrong identity sources cannot certify research',async()=>{
 for(const key of ['topicRelevant','sectorRelevant','identityCompatible','objectiveRelevant']){const r=good();r.sources.s0[key]=false;const out=await reviewAdvertisingEvidence({...input,fetchImpl:fake(r)});assert.equal(out.verified,false);assert.equal(out.status,'ADVERTISING_SEMANTIC_REJECTED');}
});
test('unopened snippets and invented URLs never count as research',async()=>{
 const result=await reviewAdvertisingEvidence({...input,openedSources:input.openedSources.slice(0,1),fetchImpl:()=>{throw Error('Must not infer');}});assert.equal(result.verified,false);assert.equal(result.inferenceCount,0);
 const r=good();r.sources.invented=r.sources.s0;await assert.rejects(reviewAdvertisingEvidence({...input,fetchImpl:fake(r)}),/SOURCE_UNOBSERVED/);
});
test('a fabricated quote or repeated URL fails closed',async()=>{
 const r=good();r.sources.s0.quoteId='invented-id';await assert.rejects(reviewAdvertisingEvidence({...input,fetchImpl:fake(r)}),/QUOTE_UNGROUNDED/);
 delete r.sources.s0;await assert.rejects(reviewAdvertisingEvidence({...input,fetchImpl:fake(r)}),/SOURCE_UNOBSERVED/);
});
test('creative invented offers, contacts, advantages or identity never become complete',async()=>{
 for(const key of ['claimsGrounded','contactsGrounded','identityPreserved']){const r=good();r.creative[key]=false;r.creative.unsupportedClaims=['Guaranteed lowest price'];const out=await reviewAdvertisingEvidence({...input,creative:{headline:'Guaranteed lowest price'},fetchImpl:fake(r)});assert.equal(out.verified,false);}
});
test('truncated and malformed model responses cannot certify',async()=>{
 await assert.rejects(reviewAdvertisingEvidence({...input,fetchImpl:fake(good(),{done_reason:'length'})}),/INCOMPLETE/);
 await assert.rejects(reviewAdvertisingEvidence({...input,fetchImpl:fake({sources:[]})}),/SCHEMA_INVALID/);
 await assert.rejects(reviewAdvertisingEvidence({...input,fetchImpl:fake(good(),{message:{content:'{'}})}),/JSON_INVALID/);
 await assert.rejects(reviewAdvertisingEvidence({...input,creative:'x'.repeat(18000),fetchImpl:fake(good())}),/CONTEXT_BUDGET/);
});

test('research-only schema never treats the future instruction as existing creative',async()=>{
 const r=good();delete r.creative;
 const fetchImpl=async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.format.properties.creative,undefined);assert.equal(body.format.required.includes('creative'),false);assert.match(body.messages[0].content,/Independent guidance need not mention the client/);assert.equal(body.format.properties.blockingIssues.maxItems,4);return {ok:true,json:async()=>({done:true,message:{content:JSON.stringify(r)}})};};
 const result=await reviewAdvertisingEvidence({...input,fetchImpl});assert.equal(result.verified,true);assert.equal(result.review.creative.claimsGrounded,true);assert.deepEqual(result.review.creative.unsupportedClaims,[]);
});
test('creative-specific schema remains mandatory when actual copy is supplied',async()=>{
 const r=good();delete r.creative;
 await assert.rejects(reviewAdvertisingEvidence({...input,creative:{headline:'Free consultation'},fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.format.required.includes('creative'),true);return {ok:true,json:async()=>({done:true,message:{content:JSON.stringify(r)}})};}}),/SCHEMA_INVALID/);
});

test('research system excludes creative restrictions and quote alternatives are URL-bound exact source segments',async()=>{
 const r=good();delete r.creative;
 const fetchImpl=async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.messages[0].content.includes('Never invent promotions'),false);assert.equal(body.messages[0].content.includes('Additionally review supplied creative'),false);const alternatives=body.format.properties.sources.properties;assert.equal(Object.keys(alternatives).length,2);for(const [sourceId,a] of Object.entries(alternatives)){const supplied=JSON.parse(body.messages[1].content).sources.find(x=>x.sourceId===sourceId);const source=input.openedSources.find(x=>x.url===supplied.url);assert.ok(source);assert.equal(supplied.text,undefined);for(const id of a.properties.quoteId.enum.filter(Boolean)){const segment=supplied.segments.find(x=>x.id===id);assert.ok(segment);assert.ok(source.text.includes(segment.text));}}return {ok:true,json:async()=>({done:true,message:{content:JSON.stringify(r)}})};};assert.equal((await reviewAdvertisingEvidence({...input,fetchImpl})).verified,true);
});

test('explicit nonblocking limitations remain visible while real model blockers fail closed',async()=>{
 const r=good();r.limitations=['Foreign guidance supplies principles, not local legal applicability.'];
 const accepted=await reviewAdvertisingEvidence({...input,fetchImpl:fake(r)});assert.equal(accepted.verified,true);assert.deepEqual(accepted.review.limitations,r.limitations);assert.deepEqual(accepted.review.issues,[]);
 r.blockingIssues=['Claimed guarantee lacks user or library support.'];const denied=await reviewAdvertisingEvidence({...input,creative:{headline:'Guaranteed outcome'},fetchImpl:fake(r)});assert.equal(denied.verified,false);assert.deepEqual(denied.review.issues,r.blockingIssues);
});
test('legacy undifferentiated issues cannot silently become approval',async()=>{
 const r=good();delete r.blockingIssues;delete r.limitations;r.issues=['Unsupported claim'];await assert.rejects(reviewAdvertisingEvidence({...input,fetchImpl:fake(r)}),/SCHEMA_INVALID/);
});

test('segment selection reconstructs exact evidence without trusting model-supplied quote text',async()=>{
 const r=good();const out=await reviewAdvertisingEvidence({...input,fetchImpl:fake(r)});assert.equal(out.review.sources[0].quote,quotes[0]);assert.equal(out.review.sources[0].quoteId,'q0');
 r.sources.s0.quoteId='q1';await assert.rejects(reviewAdvertisingEvidence({...input,fetchImpl:fake(r)}),/QUOTE_UNGROUNDED/);
});
test('enumerated excerpts retain a bounded nonduplicated source budget',async()=>{
 const openedSources=input.openedSources.map(s=>({...s,text:s.text+' '+('A distinct informative source sentence about documented procedures. '.repeat(70))}));const r=good();const fetchImpl=async(url,options)=>{const body=JSON.parse(options.body),payload=JSON.parse(body.messages[1].content);for(const source of payload.sources){assert.ok(source.segments.reduce((n,s)=>n+s.text.length,0)<=2400);assert.equal(new Set(source.segments.map(s=>s.text)).size,source.segments.length);assert.equal(source.excerpted,true);}return {ok:true,json:async()=>({done:true,message:{content:JSON.stringify(r)}})};};assert.equal((await reviewAdvertisingEvidence({...input,openedSources,fetchImpl})).verified,true);
});

test('fixed source keys represent empty pages without duplicating the informative source',async()=>{
 const r=good();r.sources.s1={quoteId:null,reason:'PDF has no extracted text.',topicRelevant:false,sectorRelevant:false,identityCompatible:true,objectiveRelevant:false};
 const out=await reviewAdvertisingEvidence({...input,openedSources:[input.openedSources[0],{url:urls[1],text:''}],fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);assert.deepEqual(body.format.properties.sources.required,['s0','s1']);assert.deepEqual(body.format.properties.sources.properties.s1.properties.quoteId.enum,[null]);assert.equal(body.format.properties.sources.additionalProperties,false);return {ok:true,json:async()=>({done:true,message:{content:JSON.stringify(r)}})};}});
 assert.equal(out.verified,false);assert.equal(out.review.sources[1].url,urls[1]);assert.equal(out.review.sources[1].quote,'');assert.equal(out.review.sources[1].quoteId,null);
});
test('fixed source verdict cannot inject URL or skip its mandatory source key',async()=>{
 const r=good();r.sources.s0.url=urls[1];await assert.rejects(reviewAdvertisingEvidence({...input,fetchImpl:fake(r)}),/SCHEMA_INVALID/);
 delete r.sources.s0.url;delete r.sources.s1;await assert.rejects(reviewAdvertisingEvidence({...input,fetchImpl:fake(r)}),/SOURCE_UNOBSERVED/);
});

test('explicit user copy restriction rejects added claims even when semantic model returns true',async()=>{
 const instruction='Campaña. Único texto comercial permitido: "Summit. Asesoría fiscal y legal. Conoce el servicio en www.summ.com.mx".';
 const creative={tool:'image.adapt',args:{composition:{headline:'Asesoría fiscal y legal experta.',body:'Conoce el servicio',contact:'www.summ.com.mx'}}};
 const denied=await reviewAdvertisingEvidence({...input,instruction,creative,fetchImpl:fake(good())});
 assert.equal(denied.verified,false);assert.equal(denied.status,'ADVERTISING_EXACT_COPY_MISMATCH');assert.equal(denied.review.creative.claimsGrounded,true,'raw model judgment remains unchanged for audit');assert.deepEqual(denied.hostCopyConstraint.rejected.map(f=>f.field),['composition.headline']);
 creative.args.composition.headline='Asesoría fiscal y legal.';
 assert.equal((await reviewAdvertisingEvidence({...input,instruction,creative,fetchImpl:fake(good())})).verified,true);
 const unrelated=good();unrelated.sources.s0.sectorRelevant=false;
 assert.equal((await reviewAdvertisingEvidence({...input,instruction,creative,fetchImpl:fake(unrelated)})).verified,false,'literal copy never bypasses semantic relevance');
 const page={tool:'page.create',args:{brandName:'Summit',title:'Asesoría fiscal y legal',description:'Expertos en fiscalidad',services:[{title:'Derecho corporativo',description:'Estructuración de empresas'}]}};
 const blocked=await reviewAdvertisingEvidence({...input,instruction,creative:page,fetchImpl:fake(good())});assert.equal(blocked.verified,false);assert.equal(blocked.hostCopyConstraint.rejected.length,3);
});
