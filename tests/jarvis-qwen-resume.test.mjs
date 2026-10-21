import test from 'node:test';
import assert from 'node:assert/strict';
import {resumedMissionId} from '../modules/terminal/qwen-general-resume.js';
import {runQwenAuthorizedCycle} from '../jarvis-qwen-direct-cycle.js';
const mission='general-c278aba4-32cc-4290-9136-9ac79b6d714e';
test('resumption is opt-in and limited to an explicit original mission UUID',()=>{
 assert.equal(resumedMissionId('CONTINUAR_MISION: '+mission+'\nCrea una campaña'),mission);
 assert.equal(resumedMissionId('Crea una campaña'),null);
 assert.equal(resumedMissionId('CONTINUAR_MISION: ../../missing'),null);
});
test('resumed authentic executor skips already approved tool, executes only unfinished tool, and can certify',async()=>{
 const prior={name:'advertising.research',args:{query:'neutral legal marketing copy'},ok:true,observation:{ok:true,status:'ADVERTISING_BENCHMARK_READY'}};
 let executed=0,iterations=0,seenFirst;
 const r=await runQwenAuthorizedCycle({instruction:'Do the remaining export',catalog:[{name:'advertising.research',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}},
 {name:'media.library',inputSchema:{type:'object',properties:{action:{type:'string'},output:{type:'string'}},required:['action','output']}}],
 initialReceipts:[prior],maximumSteps:6,stepLimit:6,
 selectNextAction:async info=>{iterations++;if(iterations===1)seenFirst=info.missionLedger.completedCalls?.length;return iterations===1?{toolCall:{name:'media.library',args:{action:'export',output:'.jarvis-artifacts/mock.png'}}}:{finish:true,report:'Ready for independent audit'};},
 authorize:async()=>({ok:true}),execute:async()=>{executed++;return {ok:true,status:'MATERIAL_EXPORTED_VERIFIED'};},
 verifyCompletion:async ({receipts})=>({ok:receipts.length===2&&receipts[0].name==='advertising.research'&&receipts[1].name==='media.library'})
 ,repairIncomplete:true});
 assert.equal(executed,1);
 assert.equal(seenFirst,1);
 assert.equal(r.status,'SUCCESS');
 assert.equal(r.receipts.length,2);
});
test('rejects unverified previous receipts instead of treating them as completed',async()=>{
 await assert.rejects(()=>runQwenAuthorizedCycle({instruction:'Continue',catalog:[{name:'one',inputSchema:{type:'object'}}],initialReceipts:[{name:'one',args:{},ok:false,observation:{ok:false}}],selectNextAction:async()=>({finish:true}),authorize:async()=>({ok:true}),execute:async()=>({ok:true}),verifyCompletion:async()=>({ok:true})}),/QWEN_RESUME_RECEIPTS_NOT_VERIFIED/);
});

test('Qwen does not have to echo host-bound document content',async()=>{
 const content=JSON.stringify({resources:[{output:'file.png',sha256:'a'.repeat(64)}],limitations:['Demo']});
 const schema={type:'object',properties:{format:{type:'string',const:'json'},output:{type:'string'},title:{type:'string'},content:{type:'string',const:content}},required:['format','output','title','content']};
 let offered,executed;
 const res=await runQwenAuthorizedCycle({instruction:'Create document',catalog:[{name:'document.create',inputSchema:schema}],maximumSteps:3,stepLimit:3,
 selectNextAction:async({tools,iteration})=>{if(iteration)return {finish:true,report:'verified'};offered=tools[0].inputSchema;return {toolCall:{name:'document.create',args:{format:'json',output:'file.json',title:'Production'}}};},
 authorize:async({call})=>({ok:call.args.content===content}),execute:async call=>{executed=call.args.content;return {ok:true};},verifyCompletion:async()=>({ok:true})});
 assert.equal(offered.properties.content,undefined);
 assert.ok(!offered.required.includes('content'));
 assert.equal(executed,content);
 assert.equal(res.status,'SUCCESS');
});

test('catalog exhausted: host independent auditor certifies complete receipts without Qwen call',async()=>{
 const receipt={name:'read',args:{id:1},ok:true,observation:{ok:true,status:'READ_OK'}};
 let qwen=0, executions=0, audits=0;
 const result=await runQwenAuthorizedCycle({
 instruction:'Continue and certify',catalog:[{name:'read',inputSchema:{type:'object'}}],initialReceipts:[receipt],maximumSteps:3,stepLimit:3,
 catalogForEvidence:()=>[],summarizeEvidence:()=>({finishEligible:false,deliveryGaps:[{reason:'STALE_HINT'}]}),
 selectNextAction:async()=>{qwen++;return {finish:true};},
 authorize:async()=>({ok:true}),execute:async()=>{executions++;return {ok:true};},
 verifyCompletion:async({receipts})=>{audits++;return {ok:receipts.length===1&&receipts[0].observation.status==='READ_OK',reason:'VERIFIED_COMPLETE',objectives:[{objective:'proof',satisfied:true}]};}
 });
 assert.equal(qwen,0);assert.equal(executions,0);assert.equal(audits,1);
 assert.equal(result.status,'SUCCESS');assert.equal(result.reason,'VERIFIED_COMPLETE');
});
test('catalog exhausted: independent verification failure preserves PARTIAL and actual failed reason',async()=>{
 const receipt={name:'read',args:{id:1},ok:true,observation:{ok:true}};
 const result=await runQwenAuthorizedCycle({instruction:'Do not fabricate closure',catalog:[{name:'read',inputSchema:{type:'object'}}],
 initialReceipts:[receipt],catalogForEvidence:()=>[],summarizeEvidence:()=>({finishEligible:true}),
 selectNextAction:async()=>{throw Error('MODEL_SHOULD_NOT_RUN');},
 authorize:async()=>({ok:true}),execute:async()=>{throw Error('TOOL_SHOULD_NOT_RUN');},
 verifyCompletion:async()=>({ok:false,reason:'DOCUMENT_READ_BACK_AND_CONTENT_BINDING_REQUIRED',objectives:[{objective:'document',satisfied:false}]})});
 assert.equal(result.status,'PARTIAL');assert.equal(result.reason,'DOCUMENT_READ_BACK_AND_CONTENT_BINDING_REQUIRED');
 assert.equal(result.certification?.objectives?.[0]?.satisfied,false);
});

test('second continuation explicitly binds a resume receipt record to the original artifact mission',async()=>{
 const {originalResumedMissionId}=await import('../modules/terminal/qwen-general-resume.js');
 const previous='resume-0d1373f0-d638-4a4f-a35f-141e43c6105a';
 const original='general-c278aba4-32cc-4290-9136-9ac79b6d714e';
 const instruction='CONTINUAR_MISION: '+previous+'\nORIGEN_MISION: '+original+'\nCrea una campaña';
 assert.equal(resumedMissionId(instruction),previous);
 assert.equal(originalResumedMissionId(instruction),original);
 assert.equal(originalResumedMissionId(instruction.replace(original,'resume-c278aba4-32cc-4290-9136-9ac79b6d714e')),null);
 assert.equal(originalResumedMissionId(instruction.replace('ORIGEN_MISION: ','ORIGEN_NO_VALIDO: ')),null);
});

test('document.create actual receipt layout resumes when SHA is nested in the exact artifact',async()=>{
 const {verifiedResumeReceipts}=await import('../modules/terminal/qwen-general-resume.js');
 const source='general-c278aba4-32cc-4290-9136-9ac79b6d714e';
 const continuation='resume-0d1373f0-d638-4a4f-a35f-141e43c6105a';
 const imageOutput='.jarvis-artifacts/images/'+source+'-square-w1080-h1080.png';
 const docOutput='.jarvis-artifacts/qwen-general/'+source+'/campaign-production-report.json';
 const imageHash='a'.repeat(64),docHash='b'.repeat(64);
 const approved=[
  {name:'advertising.research',args:{query:'legal advertising'},ok:true,observation:{ok:true,status:'ADVERTISING_BENCHMARK_READY'}},
  {name:'browser.inspect',args:{url:'https://example.org'},ok:true,observation:{ok:true,advertisingSemanticReview:{verified:true}}},
  {name:'image.adapt',args:{brandLogoOutput:'library:Logos/Summit/summit-logo-original.png'},ok:true,observation:{ok:true,creativeSemanticReview:{verified:true},outputs:[{output:imageOutput,sha256:imageHash}]}},
  {name:'document.create',args:{format:'json',content:'{}'},ok:true,observation:{ok:true,status:'DOCUMENT_CREATED',output:docOutput,artifact:{file:docOutput,sha256:docHash}}}
 ];
 const u={getIdToken:async()=>'fake-test-only'},auth={currentUser:u};
 const actual=new Map([[imageOutput,imageHash],[docOutput,docHash]]);
 const bridge={requestJson:async(_,{output})=>({ok:true,output,sha256:actual.get(output),artifact:{file:output,sha256:actual.get(output)}})};
 const saved={missionId:continuation,record:{receipts:approved}};
 const resumed=await verifiedResumeReceipts(saved,continuation,bridge,auth,undefined,source);
 assert.equal(resumed.length,4);
 assert.equal(resumed[3].observation.artifact.sha256,docHash);
 const tampered=structuredClone(saved);
 tampered.record.receipts[3].observation.artifact.file=docOutput.replace('report.json','unrelated.json');
 await assert.rejects(()=>verifiedResumeReceipts(tampered,continuation,bridge,auth,undefined,source),/QWEN_RESUME_ARTIFACT_SOURCE_MISMATCH/);
 actual.set(docOutput,'c'.repeat(64));
 await assert.rejects(()=>verifiedResumeReceipts(saved,continuation,bridge,auth,undefined,source),/QWEN_RESUME_PHYSICAL_SHA_MISMATCH/);
});

test('independent certification accepts document.create artifact.sha256 only with a matching physical read and exact output',async()=>{
 const {verifyGeneralMission}=await import('../modules/terminal/qwen-general-evidence.js');
 const {createHash}=await import('node:crypto');
 const body='Production notes bound to original receipts. This content has sufficient length and no invented status.';
 const bytes=Buffer.from(body),sha=createHash('sha256').update(bytes).digest('hex');
 const output='.jarvis-artifacts/qwen-general/general-c278aba4-32cc-4290-9136-9ac79b6d714e/campaign-production-report.json';
 const doc={name:'document.create',ok:true,args:{content:body,output,format:'json'},observation:{ok:true,status:'DOCUMENT_CREATED',output,artifact:{file:output,sha256:sha}}};
 const read={name:'artifact.read',ok:true,args:{output},observation:{ok:true,status:'ARTIFACT_READ',output,sha256:sha,bytes:bytes.length,dataBase64:bytes.toString('base64')}};
 const objectives={document:true,advertising:false,page:false,research:false,unsupported:false};
 const verify=receipts=>verifyGeneralMission({instruction:'Create a production document',receipts,objectives});
 const positive=await verify([doc,read]);
 assert.equal(positive.ok,true,JSON.stringify(positive.objectives));
 for(const corrupt of [
  {...doc,observation:{...doc.observation,artifact:{file:output+'-other',sha256:sha}}},
  {...doc,observation:{...doc.observation,artifact:{file:output,sha256:'0'.repeat(64)}}},
  {...doc,observation:{...doc.observation,sha256:'f'.repeat(64)}}
 ]){
  const result=await verify([corrupt,read]);
  assert.equal(result.ok,false);
  assert.equal(result.reason,'DOCUMENT_READ_BACK_AND_CONTENT_BINDING_REQUIRED');
 }
 assert.equal((await verify([doc])).ok,false,'cannot certify without read-back');
});

test('negative prohibitions do not turn a verified Summit campaign into an unsupported objective',async()=>{
 const {generalObjectives,generalRestrictedActionRequested}=await import('../modules/terminal/qwen-general-evidence.js');
 const mission='CONTINUAR_MISION: resume-b25dbbaf-1274-4829-96ae-3b408b953fa3\nORIGEN_MISION: general-c278aba4-32cc-4290-9136-9ac79b6d714e\n'+
 'Crea una campaña publicitaria ficticia y NO la publiques. Marca: Summit Consulting Group. ÚNICO texto comercial permitido: "Summit. Asesoría fiscal y legal. Conoce el servicio en www.summ.com.mx". '+
 'Añade landing HTML, captura, documento JSON, PNG 1080×1080 y 1200×628.\n'+
 'Mismo worktree codex/v142-qwen-auth-pilot; sin commit, push, merge, deploy, nube, pagos ni publicación.';
 const goals=generalObjectives(mission);
 assert.equal(goals.prohibited,false);
 assert.equal(goals.advertising,true);
 assert.equal(goals.page,true);
 assert.equal(goals.document,true);
 assert.equal(goals.requestedImageFormats.length,2);
 for(const no of ['sin pagos ni deploy','no hacer deploy','no la publiques','no quiero publicar en redes'])
  assert.equal(generalRestrictedActionRequested(no),false,no);
 for(const positive of ['haz deploy','realiza un pago','publica en Facebook','no publiques; haz deploy'])
  assert.equal(generalRestrictedActionRequested(positive),true,positive);
});

test('fresh Summit MP4 instruction routes to reel tools instead of false capability inventory',async()=>{
 const {generalObjectives}=await import('../modules/terminal/qwen-general-evidence.js');
 const {generalToolCatalog}=await import('../modules/terminal/qwen-general-pilot.js');
 const input='Produce, sin publicar, un MP4 vertical real de 30 segundos, 1080×1920, H.264/AAC, con tres escenas distintas, logo oficial y ÚNICO texto comercial permitido: "Summit. Asesoría fiscal y legal. Conoce el servicio en www.summ.com.mx". Usa Qwen3.5:9b y Whisper local. Verifica subtítulos y audio. Crea guion real document.create. Mismo worktree; sin commit, push, merge, deploy, nube, pagos ni publicación.';
 const o=generalObjectives(input);
 assert.equal(o.reel,true);
 assert.equal(o.advertising,true);
 assert.equal(o.document,true);
 assert.equal(o.prohibited,false);
 assert.equal(o.capabilities,false);
 assert.equal(o.unsupported,true);
 assert.deepEqual(o.requestedImageFormats,[{width:1080,height:1920}]);
 const runtime={list:()=>[
  {name:'system.capabilities',inputSchema:{type:'object',properties:{}}},
  {name:'speech.synthesize',inputSchema:{type:'object',properties:{text:{type:'string'},output:{type:'string'},language:{type:'string'}},required:[]}},
  {name:'reel.create',inputSchema:{type:'object',properties:{scenes:{type:'array',items:{}},output:{type:'string'},studioOutput:{type:'string'},durationSeconds:{type:'number'}},required:[]}},
  {name:'document.create',inputSchema:{type:'object',properties:{content:{type:'string'},output:{type:'string'},format:{type:'string'}},required:[]}},
  {name:'artifact.read',inputSchema:{type:'object',properties:{output:{type:'string'}},required:[]}}
 ]};
 const policy={accept:()=>true,artifactRoot:'.jarvis-artifacts/qwen-general/general-test/',audioPrefix:'.jarvis-artifacts/audio/general-test-',imagePrefix:'general-test-'};
 const offered=generalToolCatalog(runtime,policy,o,input).map(t=>t.name);
 assert.equal(offered.includes('system.capabilities'),false,'capability inventory does not override real audiovisual tools');
 for(const name of ['speech.synthesize','reel.create','document.create','artifact.read'])assert.equal(offered.includes(name),true,name);
});
