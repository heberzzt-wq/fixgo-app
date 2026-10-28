import test from 'node:test';
import assert from 'node:assert/strict';
import {createQwenAuthenticatedToolBridge,publicHtmlSourceFailureCode} from '../jarvis-qwen-tool-bridge.js';
import {planPlatformRecovery} from '../jarvis-platform-self-healing.js';
import {prioritizeResearchDiscovery} from '../modules/terminal/qwen-general-pilot.js';
const url='https://www.sciencedirect.com/science/article/pii/S0378778824012635';
const tool={name:'browser.inspect',mutates:false,requiresApproval:false,
 inputSchema:{type:'object',properties:{url:{type:'string'}},required:['url']}};
const wrapped={ok:false,executionOk:false,status:'BROWSER_COMMAND_FAILED',
 type:'JARVIS_CONVERSATIONAL_RESPONSE',meta:{type:'ACTUATOR_FAILURE_RESPONSE'},
 data:{ok:false,tool:'browser.inspect',status:'BROWSER_COMMAND_FAILED',
 error:'BROWSER_PUBLIC_HTML_HTTP_403'}};
test('publisher HTTP 403 is a failed source, not an owner authorization bypass',async()=>{
 assert.equal(publicHtmlSourceFailureCode('browser.inspect',wrapped),'PUBLIC_HTML_ACCESS_DENIED');
 const identity={ok:true,principalId:'test-owner',tenantId:'B2C',role:'ceo'};
 const adapter=createQwenAuthenticatedToolBridge({toolRuntime:{list:()=>[tool]},
 toolsBridge:{executeMany:async()=>[wrapped]},sessionContext:{},
 validateAuthenticatedContext:async()=>identity,verifyObjectives:async()=>({ok:false}),
 hostToolPolicy:{accept:()=>true,authorize:()=>({ok:true,approved:false})}});
 const result=await adapter.execute({name:'browser.inspect',args:{url}},{authorization:identity,receipts:[]});
 assert.equal(result.ok,false);
 assert.equal(result.neverClaimedInspected,true);
 assert.equal(result.status,'PUBLIC_HTML_ACCESS_DENIED');
 assert.equal(planPlatformRecovery({tool,system:'browser',failure:result}).status,'RECOVERY_READ_REPLAN_REQUIRED');
 assert.equal(planPlatformRecovery({tool,system:'browser',failure:result,attempt:2}).autoExecute,false);
 assert.equal(planPlatformRecovery({tool,system:'browser',failure:{ok:false,status:'HTTP_403'}}).status,'RECOVERY_SECURITY_BLOCKED');
 assert.equal(publicHtmlSourceFailureCode('browser.inspect',{...wrapped,data:{...wrapped.data,error:'PERMISSION_DENIED'}}),null);
 assert.equal(publicHtmlSourceFailureCode('repo.read',wrapped),null);
});
test('physical failed HVAC URLs lead to one different public institution candidate',()=>{
 const dead='https://www.energy.gov/node/374803';
 const official='https://www.energystar.gov/saveathome/heating-cooling/maintenance-checklist';
 const receipts=[
  {name:'web.research',ok:true,args:{query:'air conditioner maintenance filters'},observation:{ok:true,sources:[
   {url:dead,title:'Air Conditioner Maintenance - DOE'},
   {url:'https://nadca.com/blog/groundbreaking-nadca-energy-study-published-hvac-cleaning-proven-boost-efficiency-and-airflow',title:'HVAC Cleaning NADCA'},
   {url,title:'Impacts of HVAC cleaning on energy consumption'},
   {url:official,title:'Maintenance Checklist - ENERGY STAR'}
  ]}},
  {name:'browser.inspect',ok:false,args:{url:dead},observation:{ok:false,status:'HTTP_404'}}
 ];
 const catalog=[{...tool,inputSchema:{type:'object',properties:{url:{type:'string'}},required:['url']}}];
 const next=prioritizeResearchDiscovery(catalog,receipts,'Investiga mantenimiento de filtros de aire acondicionado residencial y verifica fuentes independientes');
 assert.deepEqual(next[0].inputSchema.properties.url.enum,[official]);
 const after=[...receipts,{name:'browser.inspect',ok:false,args:{url:official},observation:{ok:false,status:'PUBLIC_HTML_ACCESS_DENIED'}}];
 const another=prioritizeResearchDiscovery(catalog,after,'Investiga mantenimiento de filtros de aire acondicionado residencial y verifica fuentes independientes');
 assert.notEqual(another[0].inputSchema.properties.url.enum[0],dead);
 assert.notEqual(another[0].inputSchema.properties.url.enum[0],official);
});

test('multiple results from an HTTP-403 publisher are not retried on different paths',()=>{
 const catalog=['web.research','browser.inspect'].map(name=>({name,
  inputSchema:{type:'object',properties:name==='browser.inspect'?
   {url:{type:'string'}}:{query:{type:'string'}},required:[name==='browser.inspect'?'url':'query']}}));
 const source='https://www.blocked-publisher.gov/hvac-filter-maintenance';
 const sameHost='https://blocked-publisher.gov/another-hvac-filter-guide';
 const independent='https://independent-lab.edu/air-conditioning-filters';
 const receipts=[
  {name:'web.research',ok:true,args:{query:'HVAC filter maintenance'},
   observation:{ok:true,sources:[
    {url:source,title:'HVAC maintenance filters'},
    {url:sameHost,title:'Another HVAC filter guide'},
    {url:independent,title:'Air conditioning filters maintenance'}
   ]}},
  {name:'browser.inspect',ok:false,args:{url:source},
   observation:{ok:false,status:'PUBLIC_HTML_ACCESS_DENIED',
    error:{code:'PUBLIC_HTML_ACCESS_DENIED'}}}
 ];
 const tools=prioritizeResearchDiscovery(catalog,receipts,
  'Investiga mantenimiento de filtros de aire acondicionado residencial');
 assert.deepEqual(tools.map(t=>t.name),['browser.inspect']);
 assert.deepEqual(tools[0].inputSchema.properties.url.enum,[independent]);
 assert.equal(receipts.at(-1).ok,false,'Publisher denial must remain failed evidence');
});
test('owner permission denial is not mistaken for publisher-only HTML refusal',()=>{
 const catalog=['web.research','browser.inspect'].map(name=>({name,
  inputSchema:{type:'object',properties:{url:{type:'string'},query:{type:'string'}},required:[]}}));
 const a='https://site.gov/hvac-filters-a',b='https://site.gov/hvac-filters-b';
 const receipts=[{name:'web.research',ok:true,args:{query:'hvac'},observation:{ok:true,
  sources:[{url:a,title:'HVAC filters'},{url:b,title:'HVAC maintenance'}]}},
 {name:'browser.inspect',ok:false,args:{url:a},observation:{ok:false,status:'HTTP_403'}}];
 const tools=prioritizeResearchDiscovery(catalog,receipts,
  'Investiga mantenimiento de filtros de aire acondicionado residencial');
 assert.deepEqual(tools[0].inputSchema.properties.url.enum,[b]);
});

test('a denied explicit source is not reseeded or queried with site restrictions',()=>{
 const denied='https://www.publisher-hvac.org/air-conditioning-filter-guide';
 const instruction='Investiga mantenimiento de filtros de aire acondicionado '+denied;
 const catalog=['web.research','browser.inspect'].map(name=>({name,
  inputSchema:{type:'object',properties:name==='web.research'?
   {query:{type:'string'},seedUrl:{type:'string'},allowedDomain:{type:'string'},researchGoal:{type:'string'}}:
   {url:{type:'string'}},required:[]}}));
 const found={name:'web.research',ok:true,args:{query:'HVAC filter guidance'},observation:{ok:true,sources:[
  {url:denied,title:'HVAC air filter guidance'}]}};
 const deniedReceipt={name:'browser.inspect',ok:false,args:{url:denied},
  observation:{ok:false,status:'PUBLIC_HTML_ACCESS_DENIED'}};
 const next=prioritizeResearchDiscovery(catalog,[found,deniedReceipt],instruction);
 assert.equal(next[0].name,'web.research');
 assert.doesNotMatch(next[0].inputSchema.properties.query.const,/publisher-hvac/);
 assert.equal(next[0].inputSchema.properties.seedUrl?.const,undefined);
});
