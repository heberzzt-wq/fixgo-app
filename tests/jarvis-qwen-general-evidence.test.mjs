import test from 'node:test';import assert from 'node:assert/strict';
import {verifyGeneralMission,verifyGeneralCount,GENERAL_COUNT_FIELDS,generalObjectives} from '../modules/terminal/qwen-general-evidence.js';
import {createQwenArtifactPreview} from '../jarvis-qwen-artifact-preview.js';
test('opening source pages does not authorize creating a page',()=>{
 assert.equal(generalObjectives('Investiga WebGPU, abre sus páginas. Solo lectura.').page,false);
 assert.equal(generalObjectives('Crea una página de prueba en HTML').page,true);
});
test('tool success and a screenshot never suffice to certify page completion',async()=>{
 const result=await verifyGeneralMission({instruction:'Crea una landing',receipts:[{ok:true,name:'page.create',observation:{ok:true,output:'x.html'}},{ok:true,name:'browser.screenshot',observation:{ok:true}}],proposedReport:'SUCCESS'});
 assert.equal(result.ok,false);assert.ok(result.objectives.some(x=>x.reason==='LOCAL_VISUAL_REVIEW_OR_LAYOUT_REPAIR_REQUIRED'));
});
test('search snippets cannot certify three opened sources or current claims',async()=>{
 const result=await verifyGeneralMission({instruction:'Investiga un tema actual con tres fuentes',receipts:[{ok:true,name:'web.research',observation:{ok:true,sources:[1,2,3].map(i=>({url:'https://example.com/'+i}))}}],proposedReport:'Verificado'});
 assert.equal(result.ok,false);
});
test('aggregate verifier rejects stale, paginated and count-mismatched server receipts',()=>{
 const e={source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{collection:'users',mode:'query',filters:[{field:'rol',op:'==',value:'tecnico'}],fields:GENERAL_COUNT_FIELDS,implicitExistenceFields:[]},rows:[{id:'one',values:Object.fromEntries(GENERAL_COUNT_FIELDS.map(f=>[f,f==='rol'?'tecnico':null]))}],totalCount:1,returnedCount:1,previousCursor:null,hasMore:false,queryExhausted:true,truncatedFields:[],rowsObservedAt:new Date().toISOString()};
 const receipt=x=>[{name:'platform.query',ok:true,observation:{ok:true,recordEvidence:x}}];
 assert.equal(verifyGeneralCount(receipt(e)).data.b2c,1);
 for(const change of [{totalCount:2},{hasMore:true},{rowsObservedAt:'2000-01-01'},{previousCursor:'missing'}])assert.equal(verifyGeneralCount(receipt({...e,...change})).ok,false);
});
test('preview refuses public peers, traversal, disabled feature and unregistered outputs',()=>{
 const output='.jarvis-artifacts/qwen-general/general-12345678/p.html';
 for(const [enabled,address,path,registered,expected]of [[false,'127.0.0.1',output,true,403],[true,'192.168.1.2',output,true,403],[true,'127.0.0.1','../index.html',true,400],[true,'127.0.0.1',output,false,404]]){
  let status;const res={status:c=>(status=c,res),send:()=>res};
  createQwenArtifactPreview({enabled,identity:()=>({ok:true,contract:{branch:'codex/v142-qwen-auth-pilot'}}),findArtifact:()=>registered,readArtifact:()=>{throw Error('must not read');}})({socket:{remoteAddress:address},query:{output:path}},res);
  assert.equal(status,expected);
 }
});
import {createHash} from 'node:crypto';
test('page completion binds visual review to captured bytes and rejects detected defects',async()=>{
 const html='<!doctype html><html><body><h1>Demo</h1><a href="#services">Services</a><section id="services">Service details</section></body></html>',bytes=Buffer.from(html),output='demo.html',url='http://127.0.0.1:3347/qwen-artifact?output=demo.html';
 const row=(name,o,args={})=>({name,ok:true,args,observation:{ok:true,...o}});
 const review=row('media.analyze',{status:'LOCAL_VISUAL_REVIEW',model:'qwen3.5:9b',output:'screen.png',imageSha256:'a'.repeat(64),review:{visibleHeading:'Demo',readableText:true,overlappingContent:false,clippedContent:false,blankOrErrorPage:false,issues:[]}});
 const receipts=[row('page.create',{output,url}),row('browser.open',{url}),row('browser.inspect',{url,dom:html}),row('artifact.read',{output,dataBase64:bytes.toString('base64'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}),row('browser.screenshot',{output:'screen.png',sha256:'a'.repeat(64)},{url}),review];
 const verify=()=>verifyGeneralMission({instruction:'Crea una landing',receipts,proposedReport:'Created'});
 assert.equal((await verify()).ok,true);
 review.observation.imageSha256='b'.repeat(64);assert.equal((await verify()).ok,false);
 review.observation.imageSha256='a'.repeat(64);review.observation.review.overlappingContent=true;assert.equal((await verify()).ok,false);
});
test('research rejects unquoted factual assertions even with three opened dated links',async()=>{
 const date=new Date().toISOString().slice(0,10),sources=[1,2,3].map(i=>({url:'https://example.org/'+i,title:'Source '+i}));
 const receipts=[{name:'web.research',ok:true,observation:{ok:true,sources}},...sources.map(s=>({name:'browser.inspect',ok:true,observation:{ok:true,url:s.url,dom:`<title>${s.title}</title><p>${date} This is a sufficiently long literal statement from this source.</p>`}}))];
 const proposedReport=JSON.stringify({sources:sources.map(s=>({...s,date,quote:'This is a sufficiently long literal statement from this source.'}))});
 assert.equal((await verifyGeneralMission({instruction:'Investiga un tema actual',receipts,proposedReport})).ok,true);
 assert.equal((await verifyGeneralMission({instruction:'Investiga un tema actual',receipts,proposedReport:proposedReport.replace('sufficiently','invented')})).ok,false);
});
import {summarizeGeneralEvidence} from '../modules/terminal/qwen-general-evidence.js';
test('no-publish does not hide unsupported media objectives and a catalog is never execution proof',async()=>{
 const objectives=generalObjectives('Crea un video para TikTok sin publicar');assert.equal(objectives.unsupported,true);
 const receipts=[{name:'system.capabilities',ok:true,observation:{ok:true,totalTools:81}}];
 assert.equal(summarizeGeneralEvidence(receipts,objectives).finishEligible,false);
 assert.equal((await verifyGeneralMission({instruction:'Crea un video para TikTok sin publicar',receipts,proposedReport:'Complete'})).ok,false);
});
import {researchSourceProofs} from '../modules/terminal/qwen-general-evidence.js';
test('report grammar binds titles and quotations to fresh source text instead of model paraphrases',()=>{
 const url='https://example.org/evidence',date=new Date().toISOString().slice(0,10),dom=`<title>Exact source title</title><time datetime="${date}">${date}</time><p>A source with at least eight words supplies a literal reproducible quotation.</p>`;
 const receipts=[{name:'web.research',ok:true,observation:{ok:true,sources:[{url}]}},{name:'browser.inspect',ok:true,observation:{ok:true,url,dom}}];
 const proofs=researchSourceProofs(receipts);assert.equal(proofs.length,1);assert.equal(proofs[0].title,'Exact source title');assert.ok(proofs[0].dates.includes(date));
 const branch=summarizeGeneralEvidence(receipts,generalObjectives('Investiga fuentes actuales')).reportSchema.properties.sources.items.anyOf[0];
 assert.equal(branch.properties.title.const,'Exact source title');assert.deepEqual(branch.properties.quote.enum,proofs[0].quotes);assert.equal(branch.properties.quote.enum.some(q=>q.includes('invented')),false);
});
test('research excludes footer boilerplate even when it is a literal source quotation',()=>{
 const url='https://example.org/webgpu',dom='<title>WebGPU publication history</title><main><p>WebGPU publication history reports a Candidate Recommendation Draft in September 2026.</p></main><footer><p>This institution works with industry and society on technology needs across the world.</p></footer>';
 const receipts=[{name:'web.research',ok:true,observation:{ok:true,sources:[{url}]}},{name:'browser.inspect',ok:true,observation:{ok:true,url,dom}}];
 const proof=researchSourceProofs(receipts)[0];assert.ok(proof.quotes.length);assert.ok(proof.quotes.every(q=>q.includes('WebGPU')&&!q.includes('institution')));
});
