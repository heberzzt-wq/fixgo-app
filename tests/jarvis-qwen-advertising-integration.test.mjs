import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createQwenAuthenticatedToolBridge} from '../jarvis-qwen-tool-bridge.js';
import {createQwenDecisionHandler} from '../jarvis-qwen-decision-http.js';
import {JARVIS_PRIVATE_RELAY} from '../gestia-core/jarvis/jarvis.semantic.transport.js';
const identity={ok:true,principalId:'owner',tenantId:'B2C',role:'admin'};
const research={ok:true,name:'advertising.research',observation:{sources:[{url:'https://a.test/guide'},{url:'https://b.test/guide'}]}};
function fixture(review={verified:false},identityResult=identity){
 const executions=[],reviews=[];
 const adapter=createQwenAuthenticatedToolBridge({toolRuntime:{list:()=>['image.adapt','reel.create','speech.synthesize','page.create','document.create','browser.inspect'].map(name=>({name}))},toolsBridge:{executeMany:async([call],context)=>{executions.push({call,context});return [{ok:true,output:call.args.output,outputs:[{output:call.args.output}],url:call.args.url,dom:'<main>Real source content</main>'}];}},sessionContext:{qwenAdvertisingReview:async args=>{reviews.push(args);return review;}},validateAuthenticatedContext:async()=>identityResult,verifyObjectives:async()=>({ok:true}),hostToolPolicy:{accept:()=>true,authorize:()=>({ok:true,approved:true}),ownPath:()=>true,preview:output=>'http://127.0.0.1:5000/'+output}});
 return {adapter,executions,reviews};
}
test('all advertising artifact writes are blocked before executor when semantic verdict is false',async()=>{
 for(const name of ['image.adapt','reel.create','speech.synthesize','page.create','document.create']){
  const f=fixture();const call={name,args:{output:'demo'}};const authorization=await f.adapter.authorize({call,receipts:[research]});
  const result=await f.adapter.execute(call,{instruction:'Create fictitious advertisement',authorization,receipts:[research]});
  assert.equal(result.ok,false);assert.equal(result.status,'ADVERTISING_CLAIMS_NOT_VERIFIED');assert.equal(f.executions.length,0);assert.equal(f.reviews.length,1);assert.deepEqual(f.reviews[0].creative,{tool:name,args:call.args});
 }
});
test('verified creative attaches its review while execution retains authenticated tenant and scope',async()=>{
 const review={verified:true,inputSha256:'e'.repeat(64)};const f=fixture(review);const call={name:'document.create',args:{output:'demo.json'}};
 const authorization=await f.adapter.authorize({call,receipts:[research]});const result=await f.adapter.execute(call,{instruction:'Demo',authorization,receipts:[research]});
 assert.equal(result.ok,true);assert.deepEqual(result.creativeSemanticReview,review);assert.equal(f.executions.length,1);assert.equal(f.executions[0].context.tenantId,'B2C');assert.equal(f.executions[0].context.userId,'owner');assert.equal(f.executions[0].context.writeAuthorization,false);
});
test('fresh session rejection happens before any semantic inference or artifact write',async()=>{
 const f=fixture({verified:true},{ok:false});const result=await f.adapter.execute({name:'page.create',args:{output:'demo'}},{authorization:identity,receipts:[research]});
 assert.equal(result.ok,false);assert.equal(result.status,'SESSION_CHANGED');assert.equal(f.reviews.length,0);assert.equal(f.executions.length,0);
});
test('second distinct discovered source inspection attaches semantic research review',async()=>{
 const review={verified:false,status:'ADVERTISING_SEMANTIC_REJECTED'};const f=fixture(review);
 const prior={ok:true,name:'browser.inspect',observation:{url:'https://a.test/guide',dom:'<main>First source</main>'}};const receipts=[research,prior];
 const call={name:'browser.inspect',args:{url:'https://b.test/guide'}};const authorization=await f.adapter.authorize({call,receipts});
 const result=await f.adapter.execute(call,{instruction:'Research scaffold advertising',authorization,receipts});
 assert.deepEqual(result.advertisingSemanticReview,review);assert.equal(f.reviews.length,1);assert.equal(f.reviews[0].receipts.length,3);assert.equal(f.reviews[0].receipts[2].observation.url,call.args.url);
});
test('one observed page or unrelated inspected URL does not fabricate a research review',async()=>{
 for(const url of ['https://a.test/guide','https://unrelated.test/']){const f=fixture({verified:true});const call={name:'browser.inspect',args:{url}};const authorization=await f.adapter.authorize({call,receipts:[research]});const result=await f.adapter.execute(call,{instruction:'Research',authorization,receipts:[research]});assert.equal(result.advertisingSemanticReview,undefined);assert.equal(f.reviews.length,0);}
});
function response(){const res=new EventEmitter();res.statusCode=200;res.status=code=>{res.statusCode=code;return res;};res.json=value=>{res.payload=value;return res;};return res;}
test('semantic HTTP request retains pilot-enabled, bearer-token and owner guards',async()=>{
 const body={advertisingEvidence:{instruction:'Demo',sources:[],openedSources:[]}};
 for(const row of [{enabled:false,token:'Bearer valid',uid:JARVIS_PRIVATE_RELAY.ownerUid,status:403,error:'QWEN_DIRECT_PILOT_DISABLED'},{enabled:true,token:'',uid:JARVIS_PRIVATE_RELAY.ownerUid,status:401,error:'QWEN_BROWSER_TOKEN_REQUIRED'},{enabled:true,token:'Bearer valid',uid:'other-user',status:403,error:'QWEN_PILOT_OWNER_REQUIRED'}]){
  const handler=createQwenDecisionHandler({enabled:row.enabled,verifyIdToken:async()=>({uid:row.uid})});const res=response();await handler({body,get:()=>row.token},res);assert.equal(res.statusCode,row.status);assert.equal(res.payload.error,row.error);
 }
});
test('authorized HTTP semantic route exposes unverified research without pretending completion',async()=>{
 const handler=createQwenDecisionHandler({enabled:true,verifyIdToken:async()=>({uid:JARVIS_PRIVATE_RELAY.ownerUid})});const res=response();await handler({body:{advertisingEvidence:{instruction:'Create demonstration',sources:[],openedSources:[]}},get:()=> 'Bearer valid'},res);
 assert.equal(res.statusCode,200);assert.equal(res.payload.decision.advertisingReview.verified,false);assert.equal(res.payload.decision.advertisingReview.inferenceCount,0);assert.equal(res.payload.principalId,JARVIS_PRIVATE_RELAY.ownerUid);
});

import {runQwenAuthorizedCycle} from '../jarvis-qwen-direct-cycle.js';
const semanticFailure={ok:false,status:'ADVERTISING_CLAIMS_NOT_VERIFIED',creativeSemanticReview:{reviewExecuted:true,verified:false,review:{creative:{unsupportedClaims:['Free consultation']}}}};
const writeCall=text=>({toolCall:{name:'document.create',args:{text}}});
function cycleFixture({actions,authorize=async()=>({ok:true}),maximumSteps=6,execute}={}){
 let executions=0;
 return {run:()=>runQwenAuthorizedCycle({instruction:'Create a grounded demonstration',catalog:[{name:'document.create',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']}},{name:'repo.search',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}}],selectNextAction:async()=>actions.shift(),authorize,execute:async(call,ctx)=>{executions++;return execute?execute(call,ctx):call.args.text==='Free consultation'?semanticFailure:{ok:true};},verifyCompletion:async()=>({ok:true}),maximumSteps}),executions:()=>executions};
}
test('semantic pre-write rejection permits corrected arguments within the existing mission budget',async()=>{
 const f=cycleFixture({actions:[writeCall('Free consultation'),writeCall('Demonstration only'),{finish:true,report:'Done'}]});const result=await f.run();
 assert.equal(result.reason,'VERIFIED_COMPLETE');assert.equal(f.executions(),2);assert.equal(result.receipts[0].ok,false);assert.equal(result.receipts[1].ok,true);assert.equal(result.receipts[1].args.text,'Demonstration only');
});
test('identical rejected creative call remains guarded, including after unrelated successful evidence',async()=>{
 for(const extra of [[],[{toolCall:{name:'repo.search',args:{query:'materials'}}}]]){const f=cycleFixture({actions:[writeCall('Free consultation'),...extra,writeCall('Free consultation')]});const result=await f.run();assert.equal(result.reason,'REPEATED_TOOL_CALL');assert.equal(f.executions(),1+extra.length);}
});
test('semantic repair cannot evade the step budget or turn failed authorization into a retry',async()=>{
 const bounded=cycleFixture({actions:[writeCall('Free consultation'),writeCall('Demonstration only')],maximumSteps:1});assert.equal((await bounded.run()).reason,'STEP_LIMIT_REACHED');assert.equal(bounded.executions(),1);
 const denied=cycleFixture({actions:[writeCall('Free consultation'),writeCall('Demonstration only')],authorize:async()=>({ok:false,reason:'AUTHENTICATED_SESSION_INVALID'})});assert.equal((await denied.run()).reason,'INDEPENDENT_AUTHORIZATION_DENIED');assert.equal(denied.executions(),0);
 const notReviewed=cycleFixture({actions:[writeCall('Free consultation'),writeCall('Demonstration only')],execute:async()=>({...semanticFailure,creativeSemanticReview:{verified:false,reviewExecuted:false}})});assert.equal((await notReviewed.run()).reason,'READ_TOOL_NOT_SUCCESSFUL');assert.equal(notReviewed.executions(),1);
});
