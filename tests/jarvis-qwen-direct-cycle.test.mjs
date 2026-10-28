import test from 'node:test';
import assert from 'node:assert/strict';
import {runQwenDirectReadCycle} from '../jarvis-qwen-direct-cycle.js';

const catalog=[
    {name:'repo.read',investigationReadOnly:true,mutates:false,evidenceKinds:['repository_source'],
        inputSchema:{type:'object',properties:{file:{type:'string',enum:['panel-admin.js']}},required:['file'],additionalProperties:false}},
    {name:'platform.query',investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source'}],
        inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string',enum:['users','flotilla_b2b']},role:{type:'string'}},required:['sourceFile','collection'],additionalProperties:false}},
    {name:'platform.write',mutates:true,investigationReadOnly:false},
    {name:'payment.charge',investigationReadOnly:true,mutates:false,requiresApproval:true}
];
const map='CONFIGURACION_DE_FUENTES_VERIFICADA={"revision":"fake-fixture","operationalEvidence":false,"permissionsGranted":false}';

test('Qwen directly chooses read -> authenticated query -> finish without extra contract decisions',async()=>{
    const actions=[
        {toolCall:{name:'repo.read',args:{file:'panel-admin.js'}}},
        {toolCall:{name:'platform.query',args:{sourceFile:'panel-admin.js',collection:'users',role:'tecnico'}}},
        {finish:true,report:'Dos técnicos B2C del alcance autenticado'}
    ];
    const selected=[],executed=[];
    const result=await runQwenDirectReadCycle({
        instruction:'Cuenta los técnicos B2C registrados en users',
        repositoryMap:map,catalog,
        selectNextAction:async({repositoryMap,tools,observations})=>{
            assert.equal(repositoryMap,map);
            assert.ok(tools.every(t=>!['platform.write','payment.charge'].includes(t.name)));
            assert.equal(observations.length,executed.length);
            assert.equal(tools.some(tool=>tool.name==='platform.query'),executed.length>0,
                'model catalog exposes queries only after a successful source receipt');
            return actions.shift();
        },
        authorize:async({call,receipts})=>{
            if(call.name==='platform.query'){
                return {ok:receipts.some(r=>r.name==='repo.read'&&r.observation.verifiedRead?.file==='panel-admin.js')};
            }
            return {ok:true};
        },
        execute:async(call)=>{
            executed.push(call);
            return call.name==='repo.read'?{ok:true,verifiedRead:{file:'panel-admin.js'}}:
                {ok:true,recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',scope:{collection:'users',filter:'rol == tecnico'}},count:2,hasMore:false};
        },
        verifyCompletion:async({receipts})=>({ok:receipts.length===2&&
            receipts[1].observation.recordEvidence.source==='FIRESTORE_SERVER_AUTHENTICATED'})
    });
    assert.equal(result.status,'SUCCESS');
    assert.equal(result.reason,'VERIFIED_COMPLETE');
    assert.equal(executed.length,2);
    assert.equal(result.modelDecisions,3);
});
test('model may not execute mutation or approval-only tools even when it asks directly',async()=>{
    for(const name of ['platform.write','payment.charge']){
        const result=await runQwenDirectReadCycle({
            instruction:'Read only',catalog,repositoryMap:map,
            selectNextAction:async()=>({toolCall:{name,args:{}}}),
            authorize:async()=>{throw Error('authorization should not be reached');},
            execute:async()=>{throw Error('execution should not be reached');},
            verifyCompletion:async()=>{throw Error('not complete');}
        });
        assert.equal(result.status,'PARTIAL');
        assert.equal(result.reason,'UNKNOWN_OR_UNAUTHORIZED_TOOL');
        assert.equal(result.receipts.length,0);
    }
});
test('an assertion without verified operational data remains partial',async()=>{
    const result=await runQwenDirectReadCycle({
        instruction:'Count all B2C technicians',catalog,repositoryMap:map,
        selectNextAction:async()=>({finish:true,report:'999 technicians'}),
        authorize:async()=>({ok:true}),execute:async()=>({ok:true}),
        verifyCompletion:async({receipts})=>({ok:receipts.length>0})
    });
    assert.equal(result.status,'PARTIAL');
    assert.equal(result.reason,'OBJECTIVES_NOT_VERIFIED');
    assert.equal(result.report,'');
});
test('exact replay of one tool call is stopped without more execution',async()=>{
    let count=0;
    const result=await runQwenDirectReadCycle({
        instruction:'Read B2C source',catalog,repositoryMap:map,
        selectNextAction:async()=>({toolCall:{name:'repo.read',args:{file:'panel-admin.js'}}}),
        authorize:async()=>({ok:true}),
        execute:async()=>{count++;return {ok:true,verifiedRead:{file:'panel-admin.js'}};},
        verifyCompletion:async()=>({ok:false})
    });
    assert.equal(result.reason,'REPEATED_TOOL_CALL');
    assert.equal(count,1);
});
test('denied scope never calls executor or becomes a successful mission',async()=>{
    const result=await runQwenDirectReadCycle({
        instruction:'B2C only',catalog,repositoryMap:map,
        selectNextAction:async()=>({toolCall:{name:'platform.query',args:{sourceFile:'panel-admin.js',collection:'flotilla_b2b'}}}),
        authorize:async()=>({ok:false,reason:'TENANT_SCOPE_DENIED'}),
        execute:async()=>{throw Error('must not execute');},
        verifyCompletion:async()=>({ok:true})
    });
    assert.equal(result.reason,'INDEPENDENT_AUTHORIZATION_DENIED');
    assert.equal(result.receipts[0].observation.blocked,true);
});
test('missing independent authorization or certification is fail closed',async()=>{
    await assert.rejects(runQwenDirectReadCycle({
        instruction:'Read',catalog,selectNextAction:async()=>({finish:true}),
        execute:async()=>({ok:true})
    }),/QWEN_DIRECT_INDEPENDENT_AUTHORITY_REQUIRED/);
});
test('unsafe, undeclared or invalid arguments are rejected before authorization',async()=>{
    for(const args of [{}, {file:'invented.js'}, {file:'panel-admin.js',script:'rm -rf'}]){
        const result=await runQwenDirectReadCycle({
            instruction:'Read a source',catalog,repositoryMap:map,
            selectNextAction:async()=>({toolCall:{name:'repo.read',args}}),
            authorize:async()=>{throw Error('should not reach');},
            execute:async()=>{throw Error('should not reach');},
            verifyCompletion:async()=>({ok:true})
        });
        assert.equal(result.status,'PARTIAL');
        assert.match(result.reason,/REQUIRED_ARGUMENT|OUTSIDE_SCHEMA|ARGUMENT_UNDECLARED/);
    }
});

test('even a mistaken positive certifier cannot mark a mission complete without execution evidence',async()=>{
    const result=await runQwenDirectReadCycle({
        instruction:'Read real operational data',catalog,repositoryMap:map,
        selectNextAction:async()=>({finish:true,report:'Already complete'}),
        authorize:async()=>({ok:true}),execute:async()=>({ok:true}),
        verifyCompletion:async()=>({ok:true})
    });
    assert.equal(result.status,'PARTIAL');
    assert.equal(result.reason,'NO_EXECUTED_EVIDENCE');
    assert.equal(result.report,'');
});

test('large tool receipts are bounded in Qwen context but retained intact for the independent auditor',async()=>{
    let seen=null,verified=null;
    const result=await runQwenDirectReadCycle({
        instruction:'Inspect a local source',catalog,repositoryMap:map,
        selectNextAction:async({observations})=>{
            if(observations.length){
                seen=observations[0].observation;
                return {finish:true,report:'Done'};
            }
            return {toolCall:{name:'repo.read',args:{file:'panel-admin.js'}}};
        },
        authorize:async()=>({ok:true}),
        execute:async()=>({ok:true,verifiedRead:{file:'panel-admin.js'},
            sensitiveLargeBody:'SECRET_SOURCE_DATA_'.repeat(5000)}),
        verifyCompletion:async({receipts})=>{
            verified=receipts[0].observation;
            return {ok:receipts[0].ok===true};
        }
    });
    assert.equal(result.status,'SUCCESS');
    assert.ok(JSON.stringify(seen).length<3500);
    assert.equal(seen.observationTruncated,true);
    assert.match(verified.sensitiveLargeBody,/SECRET_SOURCE_DATA_/);
    assert.doesNotMatch(JSON.stringify(seen),/SECRET_SOURCE_DATA_/);
});

test('large search receipts preserve candidate file paths for the next Qwen decision',async()=>{
    const files=['panel-tecnico.js','app-registro.js','b2c-technician-profile.js'];
    const original={ok:true,tool:'repo.search',results:files.map(file=>({file,score:1,controls:['detail'.repeat(4000)]})),totalResults:3};
    const result=await runQwenDirectReadCycle({instruction:'Discover source',
        catalog:[{name:'repo.search',investigationReadOnly:true,inputSchema:{type:'object'}}],
        selectNextAction:async({observations})=>{
            if(!observations.length)return {toolCall:{name:'repo.search',args:{}}};
            assert.deepEqual(observations[0].observation.results.map(x=>x.file),files);
            assert.ok(JSON.stringify(observations[0].observation).length<3500);
            return {finish:true,report:'Source candidates only'};
        },authorize:async()=>({ok:true}),execute:async()=>original,
        verifyCompletion:async({receipts})=>{assert.deepEqual(receipts[0].observation,original);return {ok:false};}
    });
    assert.equal(result.status,'PARTIAL');
});

test('schema discovery feedback permits a different bounded read but permission denial stops',async()=>{
    for(const code of ['PLATFORM_QUERY_FIELD_NOT_DISCOVERED','permission-denied']){
        let decisions=0,executions=0;
        const result=await runQwenDirectReadCycle({instruction:'Read',catalog:[{name:'platform.query',investigationReadOnly:true,inputSchema:{type:'object'}}],
            selectNextAction:async({observations})=>{decisions++;
                if(observations.length){assert.equal(observations[0].ok,false);assert.equal(observations[0].observation.error.code,code);}
                return {toolCall:{name:'platform.query',args:{fields:decisions===1?['unknown']:['__name__']}}};
            },authorize:async()=>({ok:true}),execute:async()=>{executions++;return {ok:false,blocked:true,error:{code}};},
            verifyCompletion:async()=>({ok:false}),maximumSteps:2});
        assert.equal(result.status,'PARTIAL');
        assert.equal(executions,code==='permission-denied'?1:2);
        assert.equal(result.reason,code==='permission-denied'?'READ_TOOL_NOT_SUCCESSFUL':'STEP_LIMIT_REACHED');
    }
});

test('schema retry needs new successful evidence and permits only one retry',async()=>{
    const query={name:'platform.query',investigationReadOnly:true,inputSchema:{type:'object'}};
    let index=0;
    const actions=[['missing'],['__name__'],['missing'],['rol'],['missing']];
    const result=await runQwenDirectReadCycle({instruction:'Read',catalog:[query],
        selectNextAction:async()=>({toolCall:{name:'platform.query',args:{fields:actions[index++]}}}),
        authorize:async()=>({ok:true}),execute:async call=>call.args.fields[0]==='missing'?
            {ok:false,blocked:true,error:{code:'PLATFORM_QUERY_FIELD_NOT_DISCOVERED'}}:{ok:true},
        verifyCompletion:async()=>({ok:false})});
    assert.equal(result.reason,'REPEATED_TOOL_CALL');
    assert.equal(result.receipts.length,4);
    assert.equal(result.completedReadCalls,2);
});
test('bounded record context preserves every observed schema path',async()=>{
    const paths=Array.from({length:122},(_,i)=>'field_'+i);
    await runQwenDirectReadCycle({instruction:'Read',catalog:[{name:'platform.query',investigationReadOnly:true,inputSchema:{type:'object'}}],
        selectNextAction:async({observations})=>{
            if(!observations.length)return {toolCall:{name:'platform.query',args:{}}};
            assert.deepEqual(observations[0].observation.recordEvidence.fieldSchema.paths,paths);
            assert.ok(JSON.stringify(observations[0].observation).length<=4096);
            assert.equal(observations[0].observation.recordEvidence.fieldSchema.completeForObservedRows,false);
            return {finish:true,report:''};
        },authorize:async()=>({ok:true}),execute:async()=>({ok:true,recordEvidence:{source:'FIRESTORE_SERVER_AUTHENTICATED',scope:{collection:'users'},
            fieldSchema:{source:'SERVER_RECORD_FIELD_NAMES',paths,completeForObservedRows:true},rows:[{values:{long:'x'.repeat(10000)}}]}}),
        verifyCompletion:async()=>({ok:false})});
});

test('structured filter enums compare JSON values while retaining scope denial',async()=>{
    for(const [filters,allowed] of [[[],true],[[{value:'tecnico',op:'==',field:'rol'}],true],[[{field:'tipo_cuenta',op:'==',value:'b2c'}],false]]){
        let executed=0,authorized=0;
        const result=await runQwenDirectReadCycle({instruction:'Census',repositoryMap:map,
            catalog:[{name:'platform.query',investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{filters:{type:'array',enum:[[],[{field:'rol',op:'==',value:'tecnico'}]]}},required:['filters']}}],
            selectNextAction:async()=>executed?{finish:true,report:'verified'}:{toolCall:{name:'platform.query',args:{filters:structuredClone(filters)}}},
            authorize:async()=>{authorized++;return {ok:true};},
            execute:async()=>{executed++;return {ok:true};},verifyCompletion:async()=>({ok:true})});
        assert.equal(executed,allowed?1:0);assert.equal(authorized,allowed?1:0);
        assert.equal(result.status,allowed?'SUCCESS':'PARTIAL');
        if(!allowed)assert.equal(result.reason,'ARGUMENT_OUTSIDE_SCHEMA:filters');
    }
});

test('mission ledger preserves exhausted query and missing-field errors independently of completion',async()=>{
    let step=0;
    const result=await runQwenDirectReadCycle({instruction:'Census',repositoryMap:map,
        catalog:[{name:'platform.query',investigationReadOnly:true,mutates:false,inputSchema:{properties:{fields:{type:'array'}}}}],
        selectNextAction:async input=>{
            if(step===2){assert.equal(input.missionLedger.completedQueries.length,1);assert.equal(input.missionLedger.errors.length,1);
                assert.equal(input.missionLedger.completedQueries[0].queryExhausted,true);return {finish:true,report:'unsupported'};}
            return {toolCall:{name:'platform.query',args:{fields:step?['__name__']:['unknown']}}};},
        authorize:async()=>({ok:true}),execute:async()=>step++?{ok:true,recordEvidence:{scope:{fields:['__name__']},returnedCount:29,queryExhausted:true}}:
            {ok:false,error:{code:'PLATFORM_QUERY_FIELD_NOT_DISCOVERED'}},verifyCompletion:async()=>({ok:false})});
    assert.equal(result.status,'PARTIAL');assert.equal(result.decisions.length,3);assert.equal(result.receipts.length,2);
});

test('self-healing recovers from a missing repo path by selecting another authenticated read',async()=>{
 const tools=[
  {name:'repo.read',investigationReadOnly:true,mutates:false,inputSchema:{type:'object',
   properties:{file:{type:'string'}},required:['file']}},
  {name:'repo.grep',investigationReadOnly:true,mutates:false,inputSchema:{type:'object',
   properties:{term:{type:'string'}},required:['term']}}
 ];
 const actions=[
  {toolCall:{name:'repo.read',args:{file:'missing.js'}}},
  {toolCall:{name:'repo.grep',args:{term:'runJarvisMission'}}},
  {finish:true,report:'Source grounded'}
 ];
 const called=[];
 const result=await runQwenDirectReadCycle({instruction:'Localiza el codigo real',catalog:tools,
  repairIncomplete:true,selectNextAction:async()=>actions.shift(),
  authorize:async()=>({ok:true,principalId:'owner'}),
  execute:async call=>{called.push(call);
   return call.name==='repo.read'?{ok:false,status:'REPOSITORY_PATH_NOT_FOUND'}:
    {ok:true,status:'VERIFIED_GREP',matches:[{file:'mission.js',line:1}]};
  },
  verifyCompletion:async({receipts})=>({ok:receipts.some(r=>r.ok&&r.name==='repo.grep')})});
 assert.equal(result.status,'SUCCESS');
 assert.equal(called.length,2);
 assert.deepEqual(called.map(x=>x.name),['repo.read','repo.grep']);
 assert.equal(result.receipts[0].ok,false);
 assert.equal(result.receipts[1].ok,true);
 assert.ok(result.missionLedger.errors.some(x=>x.name==='repo.read'));
});
test('self-healing never repeats an identical missing-source call without progress',async()=>{
 let executed=0,plans=0;
 const result=await runQwenDirectReadCycle({instruction:'Find source',
  catalog:[{name:'repo.read',investigationReadOnly:true,mutates:false,
   inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}}],
  repairIncomplete:true,catalogForEvidence:catalog=>catalog,
  selectNextAction:async()=>{plans++;return {toolCall:{name:'repo.read',args:{file:'missing.js'}}};},
  authorize:async()=>({ok:true}),
  execute:async()=>{executed++;return {ok:false,status:'HTTP_404'};},
  verifyCompletion:async()=>({ok:false})});
 assert.equal(result.status,'PARTIAL');
 assert.equal(executed,1);
 assert.ok(plans<=4);
});

test('context pressure is not mislabeled as offline Qwen and never executes any tool',async()=>{
 let invoked=0;
 const result=await runQwenDirectReadCycle({instruction:'Review verified long evidence',
  catalog:[{name:'repo.read',investigationReadOnly:true,mutates:false,
   inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}}],
  selectNextAction:async()=>{throw Error('LOCAL_QWEN_CONTEXT_NEEDS_SEGMENTATION');},
  authorize:async()=>{invoked++;throw Error('DO_NOT_AUTHORIZE');},
  execute:async()=>{invoked++;throw Error('DO_NOT_EXECUTE');},
  verifyCompletion:async()=>({ok:false})});
 assert.equal(result.status,'PARTIAL');
 assert.equal(result.reason,'EVIDENCE_SEGMENTATION_REQUIRED');
 assert.equal(result.failureCode,'LOCAL_QWEN_CONTEXT_NEEDS_SEGMENTATION');
 assert.equal(result.recoveryAction,'REVIEW_VERIFIED_EVIDENCE_PAGES');
 assert.equal(invoked,0);
});

test('a physically failed web source switches to the single grounded replacement without an extra Qwen HTTP 400',async()=>{
 const {runQwenAuthorizedCycle}=await import('../jarvis-qwen-direct-cycle.js');
 const failed='https://www.energy.gov/node/374803';
 const good='https://www.energystar.gov/saveathome/heating-cooling/maintenance-checklist';
 const search={name:'web.research',mutates:false,requiresApproval:false,
  inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}};
 const inspect={name:'browser.inspect',mutates:false,requiresApproval:false,
  inputSchema:{type:'object',properties:{url:{type:'string'}},required:['url']}};
 const executed=[];
 let modelCalls=0,authorizations=0;
 const result=await runQwenAuthorizedCycle({
  instruction:'Investiga mantenimiento de filtros de aire acondicionado residencial usando tres fuentes independientes',
  catalog:[search,inspect],maximumSteps:3,repairIncomplete:true,
  catalogForEvidence:(_available,receipts)=>{
   if(!receipts.some(r=>r.name==='web.research'))return [{...search,inputSchema:{
    ...search.inputSchema,properties:{query:{type:'string',const:'air conditioner filters official'}}}}];
   const attempted=receipts.filter(r=>r.name==='browser.inspect');
   if(attempted.length>=2)return [];
   return [{...inspect,inputSchema:{...inspect.inputSchema,
    properties:{url:{type:'string',enum:attempted.length?[good]:[failed,good]}}}}];
  },
  selectNextAction:async()=>{
   modelCalls++;
   if(modelCalls===1)return {toolCall:{name:'web.research',args:{query:'air conditioner filters official'}}};
   if(modelCalls===2)return {toolCall:{name:'browser.inspect',args:{url:failed}}};
   throw Error('LOCAL_QWEN_HTTP_400');
  },
  authorize:async()=>{authorizations++;return {ok:true};},
  execute:async({name,args})=>{
   executed.push({name,args});
   if(name==='web.research')return {ok:true,sources:[{url:failed,title:'Air Conditioner Maintenance'},{url:good,title:'Maintenance Checklist'}]};
   return args.url===failed?{ok:false,status:'HTTP_404',error:{code:'HTTP_404'}}:
    {ok:true,status:'BROWSER_INSPECT_SOURCE_HTML_VERIFIED',url:good,dom:'<html><title>HVAC</title><main><p>Filter maintenance</p></main></html>'};
  },
  verifyCompletion:async()=>({ok:false,reason:'THREE_SOURCES_REQUIRED'})
 });
 assert.equal(modelCalls,2,'the third action is a bounded host selection, not another model');
 assert.equal(authorizations,3,'each actual read still needs authorization');
 assert.equal(executed.length,3);
 assert.equal(executed[2].args.url,good);
 assert.equal(result.receipts[1].ok,false);
 assert.equal(result.receipts[2].ok,true);
 assert.equal(result.decisions[2].hostBound,true);
 assert.notEqual(result.status,'SUCCESS','one verified source is not enough to certify the mission');
});
test('a fabricated or ungrounded singleton URL cannot bypass Qwen or authorization',async()=>{
 const {runQwenAuthorizedCycle}=await import('../jarvis-qwen-direct-cycle.js');
 const url='https://example.com/unproven';
 const inspect={name:'browser.inspect',mutates:false,requiresApproval:false,
  inputSchema:{type:'object',properties:{url:{type:'string',enum:[url]}},required:['url']}};
 let attempts=0,modelCalls=0;
 const result=await runQwenAuthorizedCycle({
  instruction:'Inspect one public source',catalog:[inspect],maximumSteps:3,repairIncomplete:true,
  catalogForEvidence:()=>[inspect],
  selectNextAction:async()=>{
   modelCalls++;
   if(modelCalls===1)return {toolCall:{name:'browser.inspect',args:{url}}};
   throw Error('LOCAL_QWEN_HTTP_400');
  },
  authorize:async()=>({ok:true}),
  execute:async()=>{attempts++;return {ok:false,status:'HTTP_404',error:{code:'HTTP_404'}};},
  verifyCompletion:async()=>({ok:false})
 });
 assert.equal(attempts,1,'a missing physical source is not replayed or replaced without search proof');
 assert.equal(modelCalls,2);
 assert.equal(result.status,'PARTIAL');
 assert.equal(result.reason,'MODEL_UNAVAILABLE');
});

test('three independently inspected sources remain reachable after distinct 404 and 403 failures',async()=>{
 const {runQwenAuthorizedCycle}=await import('../jarvis-qwen-direct-cycle.js');
 const dead='https://www.energy.gov/node/374803';
 const star='https://www.energystar.gov/saveathome/heating-cooling/maintenance-checklist';
 const blocked1='https://www.sciencedirect.com/science/article/pii/S0378778824012635';
 const nadca='https://nadca.com/blog/groundbreaking-nadca-energy-study-published-hvac-cleaning-proven-boost-efficiency-and-airflow';
 const blocked2='https://www.sciencedirect.com/science/article/pii/S0378778825016263';
 const epa='https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home';
 const firstQuery='air conditioner filters official maintenance';
 const secondQuery='air conditioner filters independent public institution education';
 const search={name:'web.research',mutates:false,requiresApproval:false,inputSchema:{
  type:'object',properties:{query:{type:'string'}},required:['query']}};
 const inspect={name:'browser.inspect',mutates:false,requiresApproval:false,inputSchema:{
  type:'object',properties:{url:{type:'string'}},required:['url']}};
 const phases=[null,null,[star],[blocked1],[nadca],[blocked2],null,[epa]];
 let modelCalls=0,authCalls=0;const physical=[];
 const result=await runQwenAuthorizedCycle({
  instruction:'Mantenimiento de filtros residenciales: tres fuentes independientes',
  catalog:[search,inspect],stepLimit:12,maximumSteps:8,repairIncomplete:true,
  catalogForEvidence:(_catalog,receipts)=>{
   const i=receipts.length,choices=phases[i];
   if(i===0||i===6){return [{...search,inputSchema:{
    ...search.inputSchema,properties:{query:{type:'string',const:i===0?firstQuery:secondQuery}}} }];}
   return [{...inspect,inputSchema:{...inspect.inputSchema,properties:{
    url:{type:'string',enum:choices||[dead,star]}}}}];
  },
  selectNextAction:async()=>{
   modelCalls++;
   if(modelCalls===1)return {toolCall:{name:'web.research',args:{query:firstQuery}}};
   if(modelCalls===2)return {toolCall:{name:'browser.inspect',args:{url:dead}}};
   throw Error('LOCAL_QWEN_HTTP_400');
  },
  authorize:async()=>{authCalls++;return {ok:true};},
  execute:async call=>{
   physical.push(call);
   if(call.name==='web.research')return {ok:true,sources:call.args.query===firstQuery?
    [dead,star,blocked1,nadca,blocked2].map(url=>({url,title:'HVAC filter maintenance'})):
    [{url:epa,title:'Home air cleaners EPA'}]};
   if([dead,blocked1,blocked2].includes(call.args.url))return {ok:false,
    status:call.args.url===dead?'HTTP_404':'PUBLIC_HTML_ACCESS_DENIED',
    error:{code:call.args.url===dead?'HTTP_404':'PUBLIC_HTML_ACCESS_DENIED'}};
   return {ok:true,status:'BROWSER_INSPECT_SOURCE_HTML_VERIFIED',
    url:call.args.url,dom:'<html><title>Air Filters</title><main><p>Residential HVAC filter maintenance recommendations</p></main></html>'};
  },
  verifyCompletion:async()=>({ok:false,reason:'THREE_SOURCE_AUDIT_REQUIRED'})
 });
 assert.equal(modelCalls,2,'no repeated Qwen grammar request for grounded singleton reads or query');
 assert.equal(physical.length,8);
 assert.equal(authCalls,8,'every read is independently authorized');
 assert.deepEqual(physical.filter(x=>x.name==='web.research').map(x=>x.args.query),[firstQuery,secondQuery]);
 assert.deepEqual(result.receipts.filter(r=>r.name==='browser.inspect'&&r.ok).map(r=>r.args.url),[star,nadca,epa]);
 assert.equal(result.receipts.filter(r=>r.name==='browser.inspect'&&!r.ok).length,3);
 assert.equal(result.decisions.filter(d=>d.hostBound===true).length,6);
 assert.notEqual(result.status,'SUCCESS','physical reads without independent quotations cannot certify completion');
});
