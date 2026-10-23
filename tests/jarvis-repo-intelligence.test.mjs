import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from 'node:child_process';
import {configuredRepositorySources,configuredSourcesMessage,bindConfiguredSourceArguments,sameConfiguredRepositoryRoot} from '../jarvis-configured-sources.js';
import {
    buildRepoEmbeddingDocuments,
    scoreRepoSemanticPreselection,
    buildRepoIntelligence,
    cosineSimilarity,
    rankRepoCandidates,
    rankRepoHybridCandidates
} from "../jarvis-repo-intelligence.js";

function configuredSourceFixture() {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-schema-fixture-'));
    const git=process.platform==='win32'&&fs.existsSync('C:/Program Files/Git/cmd/git.exe')?'C:/Program Files/Git/cmd/git.exe':'git';
    const run=args=>execFileSync(git,['-C',root,...args],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
    run(['init','--quiet']);
    fs.writeFileSync(path.join(root,'capture.js'),`import {collection,doc,setDoc} from 'sdk'; export function capture(db,id,value){ return setDoc(doc(db,'groups','scope-A','entries',id),{label:value,details:{category:value},owner:value}); } export function inspect(db){return collection(db,'groups','scope-A','entries');}`);
    fs.writeFileSync(path.join(root,'legacy.js'),`export const examples={count:999,secret:'NOT_OPERATIONAL_DATA'};`);
    fs.writeFileSync(path.join(root,'utility.js'),`export const ready=()=>true;`);
    fs.writeFileSync(path.join(root,'sample.test.js'),`collection(db,'test_only_records');`);
    const commit=()=>{run(['add','.']);run(['-c','user.name=Schema Test','-c','user.email=schema@example.invalid','commit','--quiet','-m','fixture']);};
    commit();
    return {root,run,commit,cleanup(){assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('jarvis-schema-fixture-'));fs.rmSync(root,{recursive:true,force:true});}};
}

test('Git root comparison ignores Windows case only and never admits different directories',()=>{
    const root=path.resolve('C:/Users/Runner/AppData/Local/Temp/schema-fixture');
    assert.equal(sameConfiguredRepositoryRoot(root.toUpperCase(),root,'win32'),true);
    assert.equal(sameConfiguredRepositoryRoot(root+'-foreign',root,'win32'),false);
    assert.equal(sameConfiguredRepositoryRoot(root.toUpperCase(),root,'linux'),false);
});

test('configured sources preserve modular SDK bindings without record examples and refresh on revision changes',()=>{
    const f=configuredSourceFixture();
    try {
        const legacy=buildRepoIntelligence({root:f.root});
        assert.deepEqual(legacy.nodes['capture.js'].collections,[],'reproduce the legacy graph omission');
        const catalog=configuredRepositorySources(f.root);
        if (!catalog && process.env.GITHUB_ACTIONS === 'true') {
            const top=f.run(['rev-parse','--show-toplevel']);
            console.error('SOURCE_FIXTURE_DIAGNOSTIC',JSON.stringify({
                root:f.root,gitTop:top,sameRoot:sameConfiguredRepositoryRoot(top,f.root),
                status:f.run(['status','--porcelain']),head:f.run(['rev-parse','HEAD'])
            }));
        }
        assert.equal(catalog.operationalEvidence,false);
        assert.equal(catalog.permissionsGranted,false);
        assert.equal(catalog.exhaustiveOperationalCoverage,false);
        const ref=catalog.references.find(([file,col])=>catalog.files[file]==='capture.js'&&catalog.collections[col]==='groups/scope-A/entries');
        assert.ok(ref,'the actual modular source must be configured');
        assert.ok(ref[2].map(index=>catalog.fields[index]).includes('details.category'));
        assert.doesNotMatch(JSON.stringify(catalog),/NOT_OPERATIONAL_DATA|test_only_records/);
        assert.equal(configuredRepositorySources(f.root),catalog,'reuse the same clean revision without rescanning');
        fs.appendFileSync(path.join(f.root,'capture.js'),` export function more(db,id,value){return setDoc(doc(db,'other_records',id),{different:value});}`);
        assert.equal(configuredRepositorySources(f.root),null,'dirty work must not use a cached clean configuration');
        f.commit();
        const updated=configuredRepositorySources(f.root);
        assert.notEqual(updated.revision,catalog.revision);
        assert.notEqual(updated.digest,catalog.digest);
        assert.ok(updated.collections.includes('other_records'));
    } finally {f.cleanup();}
});

test('missing source inventory fails closed without the null collections crash',()=>{
    const tools=[{name:'repo.search',investigationReadOnly:true}];
    assert.equal(configuredSourcesMessage(null,18000,{instruction:'NS1-01 Audita la refactorizacion multicapa'}),null);
    assert.equal(configuredSourcesMessage(null,18000),null);
    assert.equal(bindConfiguredSourceArguments(tools,null,{recordFlow:true}),tools);
});

test('configured source hints respect the prompt budget without dropping file and path associations',()=>{
    const f=configuredSourceFixture();
    try {
        const catalog=configuredRepositorySources(f.root);
        const expanded={...catalog,fields:Array.from({length:100},(_,i)=>'field_'+i+'x'.repeat(1000))};
        const message=configuredSourcesMessage(expanded,2000);
        assert.ok(message);
        assert.ok(message.content.length<=2000,'the entire message must fit, including guidance');
        const payload=JSON.parse(message.content.split('\n')[0].split('CONFIGURACION_DE_FUENTES_VERIFICADA=')[1]);
        assert.equal(payload.fieldHintsOmitted,true);
        assert.deepEqual(payload.routes.map(([collection])=>collection),catalog.collections);
        assert.deepEqual(payload.routes.flatMap(([collection,files])=>files.map(file=>[file,collection])).sort(),catalog.references.map(([file,col])=>[catalog.files[file],catalog.collections[col]]).sort());
        assert.equal(configuredSourcesMessage(expanded,10),null);
    } finally {f.cleanup();}
});

test('source argument choices contain actual files and paths without widening existing restrictions',()=>{
    const f=configuredSourceFixture();
    try {
        const sources=configuredRepositorySources(f.root);
        const reader={name:'repo.read',investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}};
        const records={name:'fixture.records',evidenceKinds:['platform_records'],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'},fields:{type:'array',items:{type:'string'}}},required:['sourceFile','collection','fields']}};
        const before=JSON.stringify([reader,records]);
        const bound=bindConfiguredSourceArguments([reader,records],sources,{recordFlow:true,initialDiscovery:true});
        assert.ok(bound[0].inputSchema.properties.file.enum.includes('capture.js'));
        assert.ok(!bound[0].inputSchema.properties.file.enum.includes('groups/scope-A/entries.js'),'a collection cannot be turned into an invented filename');
        assert.ok(bound[1].inputSchema.properties.collection.enum.includes('groups/scope-A/entries'));
        assert.deepEqual(bound[1].inputSchema.properties.fields,records.inputSchema.properties.fields,'discovery cannot grant field/value authority');
        const restricted={...reader,inputSchema:{...reader.inputSchema,properties:{file:{type:'string',enum:['capture.js']}}}};
        assert.deepEqual(bindConfiguredSourceArguments([restricted],sources,{recordFlow:true})[0].inputSchema.properties.file.enum,['capture.js']);
        const absent={...reader,inputSchema:{...reader.inputSchema,properties:{file:{type:'string',const:'missing.js'}}}};
        assert.deepEqual(bindConfiguredSourceArguments([absent],sources,{recordFlow:true}),[]);
        assert.equal(JSON.stringify([reader,records]),before);
    } finally {f.cleanup();}
});

test('record reader schemas retain configured sources and observed dependencies without the entire helper inventory',()=>{
    const reader={name:'repo.read',investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}};
    const sources={files:['capture.js'],inspectionFiles:['capture.js',...Array.from({length:1000},(_,i)=>'helpers/helper-'+i+'.js')]};
    const bound=bindConfiguredSourceArguments([reader],sources,{recordFlow:true,discoveredFiles:['helpers/helper-2.js','missing.js']});
    assert.deepEqual(bound[0].inputSchema.properties.file.enum,['capture.js','helpers/helper-2.js']);
    assert.ok(JSON.stringify(bound).length<1000,'undiscovered helper paths must not inflate the native schema');
    assert.equal(reader.inputSchema.properties.file.enum,undefined);
});

test('an initial source inventory cannot replace mission-related source discovery',()=>{
    const reader={name:'repo.read',investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}};
    const search={name:'repo.search',investigationReadOnly:true,mutates:false,evidenceKinds:['repository_search'],inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}};
    const sources={files:['capture.js','read-helper.js'],inspectionFiles:['capture.js','read-helper.js','dependency.js']};
    const catalog=[reader,search],before=JSON.stringify(catalog);
    assert.deepEqual(bindConfiguredSourceArguments(catalog,sources,{recordFlow:true,locatedFilesOnly:true,discoveredFiles:[]}).map(tool=>tool.name),['repo.search'],'inventory existence is not semantic source relevance; the existing search must locate a candidate first');
    const located=bindConfiguredSourceArguments(catalog,sources,{recordFlow:true,locatedFilesOnly:true,discoveredFiles:['capture.js','invented.js']});
    assert.deepEqual(located[0].inputSchema.properties.file.enum,['capture.js'],'a real observed candidate remains readable without admitting another inventory file or an invented path');
    assert.equal(JSON.stringify(catalog),before);
});

test('record mission source readers cannot emit collection-derived nonexistent paths',async()=>{
    const f=configuredSourceFixture();
    try {
        const {createSelfHostedSemanticEngine}=await import('../jarvis-fs-bridge.js');
        const objective={objective:'Report current entries',requiredEvidenceKind:'platform_records',coverageMode:'population',scope:'all_sources',groups:['entries']};
        let inspected=false;
        const engine=createSelfHostedSemanticEngine({root:f.root,env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b'},fetchImpl:async(_url,options)=>{
            const body=JSON.parse(options.body);
            const schema=JSON.stringify(body.format);
            assert.match(schema,/capture[.]js/,'native choices must be bound to the actual source inventory');
            assert.doesNotMatch(schema,/groups\/scope-A\/entries[.]js/);
            inspected=true;
            const content=JSON.stringify({explanation:'Read source',completionAssessment:{objectives:[{objective:objective.objective,requiredEvidenceKind:'platform_records',satisfied:false,evidenceTaskIndexes:[],limitation:'Records are pending'}]},toolCalls:[{name:'repo.read',args:{file:'capture.js'}}]});
            return {ok:true,status:200,text:async()=>JSON.stringify({message:{content},done_reason:'stop'})};
        }});
        const plan=await engine.plan({input:objective.objective,catalog:[{name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}},{name:'fixture.records',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'}},required:['sourceFile']}}],missionState:{phase:'COMPLETION_AUDIT',evidenceObjectives:[objective],completedTasks:[]}});
        assert.equal(inspected,true);
        assert.equal(plan.missionComplete,false);
    } finally {f.cleanup();}
});

test('the local planner receives configured paths as discovery, never completion evidence',async()=>{
    const f=configuredSourceFixture();
    try {
        const {createSelfHostedSemanticEngine}=await import('../jarvis-fs-bridge.js');
        let inspected=false;
        const objective={objective:'Report current entries',requestQuote:'Report current entries',requiredEvidenceKind:'platform_records',coverageMode:'population',scope:'all_sources',groups:['entries']};
        const engine=createSelfHostedSemanticEngine({root:f.root,env:{JARVIS_SEMANTIC_PROVIDER_MODE:'LOCAL_ONLY',JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b'},fetchImpl:async(url,options)=>{
            assert.ok(String(url).startsWith('http://127.0.0.1:11434/'));
            const body=JSON.parse(options.body);
            assert.equal(body.model,'qwen3.5:9b');
            const configuration=body.messages.find(message=>message.content?.startsWith('CONFIGURACION_DE_FUENTES_VERIFICADA='));
            assert.ok(configuration,'the same model must receive the configured flow before planning');
            assert.match(configuration.content,/capture[.]js/);
            assert.match(configuration.content,/groups\/scope-A\/entries/);
            assert.doesNotMatch(configuration.content,/NOT_OPERATIONAL_DATA/);
            inspected=true;
            const content=JSON.stringify({explanation:'Read the configured source, then query current entries',completionAssessment:{objectives:[{objective:objective.objective,requiredEvidenceKind:'platform_records',satisfied:false,evidenceTaskIndexes:[],limitation:'Records have not been queried'}]},toolCalls:[{name:'repo.read',args:{file:'capture.js'}}]});
            return {ok:true,status:200,text:async()=>JSON.stringify({message:{role:'assistant',content},done_reason:'stop'})};
        }});
        const result=await engine.plan({input:objective.requestQuote,catalog:[{name:'repo.read',description:'Read repository source',investigationReadOnly:true,mutates:false,evidenceKinds:['repository_source'],inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}},{name:'fixture.records',description:'Query current records after source inspection',investigationReadOnly:true,mutates:false,evidenceKinds:['platform_records'],requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'}},required:['sourceFile']}}],missionState:{phase:'COMPLETION_AUDIT',evidenceObjectives:[objective],completedTasks:[]}});
        assert.equal(inspected,true);
        assert.equal(result.toolCalls[0].args.file,'capture.js');
        assert.equal(result.missionComplete,false);
        assert.equal(result.completionAssessment.objectives[0].requiredEvidenceKind,'platform_records');
    } finally {f.cleanup();}
});

test('current-turn record selection offers the source prerequisite before the unread query',async()=>{
    const f=configuredSourceFixture();
    try {
        const {createSelfHostedSemanticEngine}=await import('../jarvis-fs-bridge.js');
        let selected=false;
        const engine=createSelfHostedSemanticEngine({root:f.root,env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b'},fetchImpl:async(url,options)=>{
            const body=JSON.parse(options.body);
            if(body.format?.properties?.ids){const ids=body.format.properties.ids.items.enum.slice(0,body.format.properties.ids.maxItems);return {ok:true,status:200,text:async()=>JSON.stringify({message:{content:JSON.stringify({ids})}})};}
            let content;
            if(body.format?.properties?.actionDescription) content=JSON.stringify({actionDescription:'leer esquema y consultar los registros actuales'});
            else {
                const tools=body.tools || [];
                assert.ok(!tools.some(tool=>tool.function?.name==='platform.query'),'a query lacking its declared source evidence cannot be an initial native choice');
                const reader=tools.find(tool=>tool.function?.name==='repo.read');
                assert.ok(reader,'keep the declared read prerequisite available');
                assert.ok(reader.function.parameters.properties.file.enum.includes('capture.js'),'the prerequisite also uses real source paths');
                selected=true;
                return {ok:true,status:200,text:async()=>JSON.stringify({message:{role:'assistant',content:'',tool_calls:[{function:{name:'repo.read',arguments:{file:'capture.js'}}}]},done_reason:'stop'})};
            }
            return {ok:true,status:200,text:async()=>JSON.stringify({message:{role:'assistant',content},done_reason:'stop'})};
        }});
        const plan=await engine.plan({input:'Report current entries and their owners',missionState:{phase:'CURRENT_TURN'},catalog:[{name:'repo.read',description:'Read source before querying current records',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}},{name:'platform.query',description:'Query current records after source inspection',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']},{kind:'repository_source',argument:'collection',observationPath:['verifiedRead','sourceStructure','dataBindings','collections']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'}},required:['sourceFile','collection']}}]});
        assert.equal(selected,true);
        assert.equal(plan.toolCalls[0].name,'repo.read');
        assert.equal(plan.missionComplete,false);
    } finally {f.cleanup();}
});

for(const named of [false,true])test(`ambiguous current-turn source selection preserves ${named?'an explicit file':'the existing semantic search'}`,async()=>{
    const f=configuredSourceFixture();
    try {
        fs.writeFileSync(path.join(f.root,'secondary.js'),`import {collection,addDoc} from 'sdk'; export function store(db,value){return addDoc(collection(db,'other_records'),{owner:value});}`);
        f.commit();
        const {createSelfHostedSemanticEngine}=await import('../jarvis-fs-bridge.js');
        let selected=false;
        const engine=createSelfHostedSemanticEngine({root:f.root,env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b'},fetchImpl:async(_url,options)=>{
            const body=JSON.parse(options.body);
            assert.equal(body.model,'qwen3.5:9b');
            if(body.format?.properties?.ids){const ids=body.format.properties.ids.items.enum.slice(0,body.format.properties.ids.maxItems);return {ok:true,status:200,text:async()=>JSON.stringify({message:{content:JSON.stringify({ids})}})};}
            if(body.format?.properties?.action)return {ok:true,status:200,text:async()=>JSON.stringify({message:{content:JSON.stringify({action:'Leer capture.js y consultar sus registros actuales'})}})};
            if(body.format?.properties?.actionDescription)return {ok:true,status:200,text:async()=>JSON.stringify({message:{content:JSON.stringify({actionDescription:'Localizar la fuente y consultar los registros actuales'})}})};
            const tools=body.tools||[],reader=tools.find(tool=>tool.function?.name==='repo.read');
            assert.ok(!tools.some(tool=>tool.function?.name==='platform.query'),'the initial choice cannot bypass its unread source prerequisite');
            if(!named)assert.ok(tools.some(tool=>tool.function?.name==='repo.search'),'preserve the already authorized local search capability');
            if(named)assert.deepEqual(reader?.function.parameters.properties.file.enum,['capture.js'],'an explicit real path needs no redundant discovery');
            else assert.equal(reader,undefined,'a global filename inventory is not a mission-related candidate');
            selected=true;
            const call=named?{name:'repo.read',arguments:{file:'capture.js'}}:{name:'repo.search',arguments:{query:'registros actuales y sus responsables'}};
            return {ok:true,status:200,text:async()=>JSON.stringify({message:{role:'assistant',content:'',tool_calls:[{function:call}]},done_reason:'stop'})};
        }});
        const plan=await engine.plan({input:named?'Inspecciona capture.js y consulta sus registros actuales':'Consulta los registros actuales y sus responsables',missionState:{phase:'CURRENT_TURN'},catalog:[
            {name:'repo.read',description:'Read source before querying current records',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}},
            {name:'repo.search',description:'Locate relevant source candidates with the sole local model',evidenceKinds:['repository_search'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query']}},
            {name:'platform.query',description:'Query current records after source inspection',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'}},required:['sourceFile','collection']}}
        ]});
        assert.equal(selected,true);assert.equal(plan.toolCalls[0].name,named?'repo.read':'repo.search');assert.equal(plan.missionComplete,false);
    } finally {f.cleanup();}
});

test('the first source read after search stays inside its observed candidates',async()=>{
    const f=configuredSourceFixture();
    try {
        fs.writeFileSync(path.join(f.root,'secondary.js'),`import {collection,addDoc} from 'sdk';export function store(db,value){return addDoc(collection(db,'other_records'),{owner:value});}`);f.commit();
        const {createSelfHostedSemanticEngine}=await import('../jarvis-fs-bridge.js');
        const objective={objective:'Report current entries',requiredEvidenceKind:'platform_records',coverageMode:'population',scope:'all_sources',groups:['entries']};
        let selected=false;
        const engine=createSelfHostedSemanticEngine({root:f.root,env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b'},fetchImpl:async(_url,options)=>{
            const body=JSON.parse(options.body),schema=JSON.stringify(body.format);
            assert.match(schema,/capture[.]js/,'the observed search candidate remains readable');
            assert.doesNotMatch(schema,/secondary[.]js/,'a configured inventory file is not another search candidate');
            selected=true;
            return {ok:true,status:200,text:async()=>JSON.stringify({message:{content:JSON.stringify({completionAssessment:{objectives:[{objective:objective.objective,requiredEvidenceKind:'platform_records',satisfied:false,evidenceTaskIndexes:[],limitation:'Operational records have not been queried'}]},toolCalls:[{name:'repo.read',args:{file:'capture.js'}}]})},done_reason:'stop'})};
        }});
        const plan=await engine.plan({input:objective.objective,catalog:[
            {name:'repo.read',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}},
            {name:'fixture.records',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'}},required:['sourceFile']}}
        ],missionState:{phase:'COMPLETION_AUDIT',evidenceObjectives:[objective],completedTasks:[{name:'repo.search',args:{query:'current entries'},observation:{ok:true,repoCandidates:[{file:'capture.js'}]}}]}});
        assert.equal(selected,true);assert.equal(plan.toolCalls[0].args.file,'capture.js');assert.equal(plan.missionComplete,false);assert.equal(plan.completionAssessment.objectives[0].satisfied,false);
    } finally {f.cleanup();}
});

test('declared source prerequisites bind witnessed tuples even when the reader was not shortlisted',async()=>{
    const {bindEvidencePrerequisites}=await import('../functions/jarvis-semantic-planner.js');
    const reader={name:'source.inspect',evidenceKinds:['repository_source']};
    const query={name:'records.inspect',requiresEvidence:[
        {kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']},
        {kind:'repository_source',argument:'collection',observationPath:['verifiedRead','collections']}
    ],inputSchema:{type:'object',properties:{sourceFile:{type:'string'},collection:{type:'string'}},required:['sourceFile','collection']}};
    const tasks=[{name:reader.name,observation:{ok:true,verifiedRead:{file:'capture.js',collections:['entries']}}}];
    const bound=bindEvidencePrerequisites([query],tasks,[reader,query]);
    assert.deepEqual(bound[0].inputSchema.properties.sourceFile.enum,['capture.js']);
    assert.deepEqual(bound[0].inputSchema.properties.collection.enum,['entries']);
    assert.deepEqual(bindEvidencePrerequisites([query],[{...tasks[0],observation:{...tasks[0].observation,ok:false}}],[reader,query]),[]);
    assert.equal(query.inputSchema.properties.collection.enum,undefined);
});

test('record continuation can read a configured source that has not been searched or read',async()=>{
    const f=configuredSourceFixture();
    try {
        const {createSelfHostedSemanticEngine}=await import('../jarvis-fs-bridge.js');
        const objective='Inspect current entries and owners';
        let checked=false;
        const reader={name:'repo.read',investigationReadOnly:true,mutates:false,evidenceKinds:['repository_source'],inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}};
        const query={name:'platform.query',investigationReadOnly:true,mutates:false,evidenceKinds:['platform_records'],requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'}},required:['sourceFile']}};
        const engine=createSelfHostedSemanticEngine({root:f.root,env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b'},fetchImpl:async(_url,options)=>{
            const body=JSON.parse(options.body);
            const readerChoice=body.format?.properties?.toolCalls?.items?.anyOf?.find(branch=>branch.properties.name.enum.includes(reader.name));
            if(readerChoice)assert.ok(!readerChoice.properties.args.properties.file.enum.includes('utility.js'),'record schema must not repeat undiscovered helper inventory');
            const recovery=body.messages.some(message=>message.content?.startsWith('RUTAS_LOCALIZADAS='));
            if(recovery){
                const choices=body.format?.properties.toolCalls.items.anyOf || body.tools.map(tool=>({properties:{name:{enum:[tool.function.name]},args:tool.function.parameters}}));
                const choice=choices.find(branch=>branch.properties.name.enum.includes(reader.name));
                assert.ok(choice.properties.args.properties.file.enum.includes('capture.js'),'configured discovery must survive the recovery frontier');
                checked=true;
            }
            const content=JSON.stringify({toolCalls:recovery?[{name:reader.name,args:{file:'capture.js'}}]:[],missionComplete:false,completionAssessment:{objectives:[{objective,requiredEvidenceKind:'platform_records',satisfied:false,evidenceTaskIndexes:[],limitation:'Current records have not been queried'}]}});
            return {ok:true,status:200,text:async()=>JSON.stringify({message:{role:'assistant',content},done_reason:'stop'})};
        }});
        const result=await engine.plan({input:objective,catalog:[reader,query],missionState:{phase:'COMPLETION_AUDIT',evidenceObjectives:[{objective,requiredEvidenceKind:'platform_records'}],completedTasks:[{name:reader.name,observation:{ok:true,executionOk:true,verifiedRead:{file:'legacy.js',content:'observed legacy schema',startLine:1,endLine:2,totalLines:10,truncated:true}}}]}});
        assert.equal(checked,true);assert.equal(result.toolCalls[0].args.file,'capture.js');assert.equal(result.missionComplete,false);
    } finally {f.cleanup();}
});

test('configured sources do not alter grounded operation transport or non-record objectives',async()=>{
    const f=configuredSourceFixture();
    try {
        const {createSelfHostedSemanticEngine}=await import('../jarvis-fs-bridge.js');
        for (const grounded of [true,false]) {
            const instruction='Inspect the supplied object';
            const selected={name:grounded?'fixture.inspect':'repo.read',description:'Inspect source',investigationReadOnly:true,mutates:false,evidenceKinds:[grounded?'platform_records':'repository_source'],inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}};
            const catalog=[selected,...(grounded?[]:[{name:'fixture.records',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{},required:[]}}])];
            const state=grounded?{phase:'GROUNDED_ARGUMENT_COMPLETION',currentOperation:instruction}:{phase:'COMPLETION_AUDIT',completedTasks:[],evidenceObjectives:[{objective:instruction,requiredEvidenceKind:'repository_source'}]};
            let inspected=false;
            const engine=createSelfHostedSemanticEngine({root:f.root,env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b'},fetchImpl:async(_url,options)=>{
                const body=JSON.parse(options.body);
                assert.ok(!body.messages.some(message=>message.content?.startsWith('CONFIGURACION_DE_FUENTES_VERIFICADA=')),'record configuration must not enter this transport');
                if (grounded) assert.ok(body.messages[1].content.startsWith(instruction),'the original grounded request keeps its position and content');
                inspected=true;
                const content=JSON.stringify({explanation:'Inspect source',missionComplete:false,toolCalls:[{name:selected.name,args:{file:'capture.js'}}],...(grounded?{}:{completionAssessment:{objectives:[{objective:instruction,requiredEvidenceKind:'repository_source',satisfied:false,evidenceTaskIndexes:[],limitation:'Source has not been read'}]}})});
                return {ok:true,status:200,text:async()=>JSON.stringify({message:{role:'assistant',content},done_reason:'stop'})};
            }});
            const result=await engine.plan({input:instruction,catalog,missionState:state});
            assert.equal(inspected,true);
            assert.equal(result.toolCalls[0].args.file,'capture.js');
            assert.equal(engine.describe().sourceConfiguration,undefined);
        }
    } finally {f.cleanup();}
});

test('semantic preselection uses parsed literals and cannot replace relevant source with an unrelated hub', () => {
    const relevant = scoreRepoSemanticPreselection({file:'registration.js', structuralText:'FILE: registration.js', literals:['equipmentSerial'], queryTokens:['equipment'], relationCount:0});
    const hub = scoreRepoSemanticPreselection({file:'central.js', structuralText:'FILE: central.js', queryTokens:['equipment'], relationCount:100});
    assert.ok(relevant.preselectionScore > hub.preselectionScore);
    assert.equal(relevant.queryOverlap,1);
    const substring = scoreRepoSemanticPreselection({file:'authorization.js', structuralText:'FILE: authorization.js', queryTokens:['author'], relationCount:0});
    assert.equal(substring.queryOverlap,0);
    const fixture = scoreRepoSemanticPreselection({file:'fixture.test.js', structuralText:'FILE: fixture.test.js', literals:['equipment'], queryTokens:['equipment'],isTest:true});
    assert.ok(fixture.preselectionScore < relevant.preselectionScore);
    const explicit = scoreRepoSemanticPreselection({file:'fixture.test.js', structuralText:'FILE: fixture.test.js', planned:true,isTest:true});
    assert.ok(explicit.preselectionScore > relevant.preselectionScore);
});

function makeFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-repo-graph-"));
    fs.writeFileSync(path.join(root, "auth.js"), `
        import { db } from "./firebase.js";
        export function routeAdmin(user) {
            onAuthStateChanged(user.auth, () => {});
            collection("usuarios");
            return redirect(user.rol);
        }
    `);
    fs.writeFileSync(path.join(root, "firebase.js"), "export const db = {};\n");
    fs.writeFileSync(path.join(root, "server.js"), `
        import { routeAdmin } from "./auth.js";
        app.post("/session/admin", routeAdmin);
    `);
    fs.writeFileSync(path.join(root, "auth.test.js"), `
        import { routeAdmin } from "./auth.js";
        routeAdmin({ rol: "admin" });
    `);
    fs.writeFileSync(path.join(root, "login.html"), '<script type="module" src="./auth.js?v=1"></script>');
    return root;
}

test("live repo graph discovers syntax, dependencies, listeners, endpoints, collections and tests", () => {
    const root = makeFixture();
    try {
        const graph = buildRepoIntelligence({ root });
        assert.equal(graph.ok, true);
        assert.equal(graph.source, "live_repo_ast_graph");
        assert.equal(graph.nodes["auth.js"].parser, "acorn_ast");
        assert.deepEqual(graph.nodes["server.js"].dependencies, ["auth.js"]);
        assert.ok(graph.nodes["auth.js"].dependents.includes("server.js"));
        assert.ok(graph.nodes["auth.js"].dependents.includes("login.html"));
        assert.ok(graph.nodes["auth.js"].functions.includes("routeAdmin"));
        assert.equal(graph.nodes["auth.js"].listeners[0].call, "onAuthStateChanged");
        assert.ok(graph.nodes["auth.js"].collections.includes("usuarios"));
        assert.deepEqual(graph.nodes["server.js"].endpoints, [{ method: "POST", route: "/session/admin" }]);
        assert.ok(graph.nodes["auth.js"].relatedTests.includes("auth.test.js"));
        assert.equal(graph.summary.endpoints, 1);
        assert.equal(graph.summary.tests, 1);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("local embedding evidence augments repo ranking without becoming semantic authority", () => {
    const root = makeFixture();
    try {
        const graph = buildRepoIntelligence({ root });
        const documents = buildRepoEmbeddingDocuments({ graph });
        assert.ok(documents.some(item => item.file === "auth.js" && item.text.includes("routeAdmin")));
        assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
        assert.equal(cosineSimilarity([1, 0, 0], [0, 1, 0]), 0);

        const result = rankRepoHybridCandidates({
            graph,
            plannedFiles: [],
            semanticScores: {
                "server.js": 0.98
            },
            limit: 5
        });
        assert.equal(result.ok, true);
        assert.equal(result.source, "local_embedding_plus_live_repo_graph");
        assert.equal(result.semanticRetrieval, true);
        assert.equal(result.candidates[0].file, "server.js");
        assert.equal(result.candidates[0].semanticSimilarity, 0.98);
        assert.ok(result.candidates[0].breakdown.localEmbeddingSimilarity > 90);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("candidate ranking explains structural evidence only for semantic-selected files", () => {
    const root = makeFixture();
    try {
        const graph = buildRepoIntelligence({ root });
        const result = rankRepoCandidates({
            graph,
            plannedFiles: ["auth.js"],
            limit: 5
        });
        assert.equal(result.ok, true);
        assert.equal(result.source, "semantic_plan_plus_live_repo_graph");
        assert.equal(result.scoring, "structural_evidence_for_semantic_selection");
        assert.deepEqual(result.semanticSelection, ["auth.js"]);
        assert.equal(result.candidates[0].file, "auth.js");
        assert.equal(result.candidates[0].breakdown.plannedFile, 120);
        assert.ok(result.candidates[0].breakdown.incomingCalls > 0);
        assert.ok(result.candidates[0].breakdown.existingTests > 0);
        assert.ok(result.candidates[0].reasons.some(reason => reason.startsWith("plannedFile:")));
        assert.deepEqual(result.candidates[0].coveredByTests, ["auth.test.js"]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("candidate ranking fails closed without semantic-selected files", () => {
    const root = makeFixture();
    try {
        const graph = buildRepoIntelligence({ root });
        assert.throws(
            () => rankRepoCandidates({ graph, plannedFiles: [] }),
            /PLANNED_FILES_REQUIRED/
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("bridge exposes structural repo evidence while the semantic brain owns file selection", () => {
    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    const runtime = fs.readFileSync(new URL("../gestia-core/tools.runtime.js", import.meta.url), "utf8");
    const brain = fs.readFileSync(new URL("../gestia-core/brain.engine.js", import.meta.url), "utf8");
    const intelligence = fs.readFileSync(new URL("../jarvis-repo-intelligence.js", import.meta.url), "utf8");
    assert.match(bridge, /app\.post\("\/repo\/graph"/);
    assert.match(bridge, /app\.post\("\/repo\/candidates"/);
    assert.match(bridge, /PLANNED_FILES_OR_QUERY_REQUIRED/);
    assert.match(runtime, /name: "repo\.graph"/);
    assert.match(runtime, /name: "repo\.rankCandidates"/);
    assert.match(runtime, /query: "string"/);
    assert.match(runtime, /plannedFiles: "array"/);
    assert.match(brain, /COMPATIBILITY_CANARY_ONLY/);
    assert.match(brain, /semanticAuthority:\s*"jarvisSemanticPlan"/);
    assert.doesNotMatch(brain, /LOCAL_SEMANTIC_EXPLAINABLE_CANDIDATE_RANKING/);
    assert.doesNotMatch(intelligence, /function queryTerms/);
    assert.doesNotMatch(intelligence, /lexicalSemantic/);
    assert.doesNotMatch(intelligence, /normalizedQuery/);
    assert.match(intelligence, /structural_evidence_for_semantic_selection/);
    assert.match(intelligence, /local_embedding_and_structural_evidence/);
});


test('repository discovery honors Git ignore rules without indexing generated release copies', async () => {
 const {execFileSync}=await import('node:child_process');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-git-source-scope-'));
 try {
  const git=process.platform==='win32'&&fs.existsSync('C:/Program Files/Git/cmd/git.exe')?'C:/Program Files/Git/cmd/git.exe':'git';
  execFileSync(git,['init',root],{stdio:'ignore',windowsHide:true});
  fs.writeFileSync(path.join(root,'.gitignore'),'release-copies/\nignored.js\n');
  fs.writeFileSync(path.join(root,'source.js'),'export function realSource() { return true; }');
  fs.writeFileSync(path.join(root,'untracked-source.js'),'export function newSource() { return true; }');
  fs.writeFileSync(path.join(root,'ignored.js'),'export function ignoredSource() { return true; }');
  fs.mkdirSync(path.join(root,'release-copies'));fs.writeFileSync(path.join(root,'release-copies','source.js'),'export function staleSource() { return false; }');
  execFileSync(git,['-C',root,'add','source.js'],{stdio:'ignore',windowsHide:true});
  const graph=buildRepoIntelligence({root});
  assert.ok(graph.nodes['source.js']);assert.ok(graph.nodes['untracked-source.js']);
  assert.equal(graph.nodes['ignored.js'],undefined);assert.equal(graph.nodes['release-copies/source.js'],undefined);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});


test('semantic source relevance outranks unrelated structural popularity while exact symbols retain priority',()=>{
 const root=makeFixture();try{const graph=buildRepoIntelligence({root});
 const semanticScores={'firebase.js':0.95,'auth.js':0.1};
 const ranked=rankRepoHybridCandidates({graph,semanticScores});assert.equal(ranked.candidates[0].file,'firebase.js');
 const exact=rankRepoHybridCandidates({graph,semanticScores,exactFiles:['auth.js']});assert.equal(exact.candidates[0].file,'auth.js');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('bridge carries checkout navigation to the same local Qwen decision without duplicate maps or unread query authority',async()=>{
 const f=configuredSourceFixture();
 try{
  const {createSelfHostedSemanticEngine}=await import('../jarvis-fs-bridge.js');
  const objective={objective:'Report current entries',requiredEvidenceKind:'platform_records',coverageMode:'population',scope:'all_sources',groups:['entries']};
  let calls=0;
  const engine=createSelfHostedSemanticEngine({root:f.root,env:{JARVIS_LOCAL_LLM_MODEL:'qwen3.5:9b'},fetchImpl:async(url,options)=>{
   calls++;assert.ok(String(url).startsWith('http://127.0.0.1:11434/'));
   const body=JSON.parse(options.body);assert.equal(body.model,'qwen3.5:9b');
   const maps=body.messages.filter(m=>m.content?.startsWith('MAPA_NAVEGACION_REPOSITORIO='));assert.equal(maps.length,1);
   assert.equal(body.messages.some(m=>m.content?.startsWith('CONFIGURACION_DE_FUENTES_VERIFICADA=')),false,'the transport must not append another large map after the planner budget');
   const map=JSON.parse(maps[0].content.split('\n')[0].slice('MAPA_NAVEGACION_REPOSITORIO='.length));
   assert.ok(map.links.some(([file,collection])=>map.files[file]==='capture.js'&&map.collections[collection]==='groups/scope-A/entries'));
   assert.equal(map.operationalEvidence,false);assert.equal(map.permissionsGranted,false);assert.doesNotMatch(JSON.stringify(map),/NOT_OPERATIONAL_DATA/);
   assert.ok(body.messages.reduce((sum,m)=>sum+m.content.length,0)<=60000);
   assert.doesNotMatch(JSON.stringify(body.format),/fixture.records/,'unread operational tools are not navigation choices');
   return{ok:true,status:200,text:async()=>JSON.stringify({message:{content:JSON.stringify({toolCalls:[{name:'repo.read',args:{file:'capture.js'}}]})},done_reason:'stop'})};
  }});
  const result=await engine.plan({input:objective.objective,catalog:[
   {name:'repo.read',description:'Read source',evidenceKinds:['repository_source'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}},
   {name:'fixture.records',description:'Read current records',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,requiresEvidence:[{kind:'repository_source',argument:'sourceFile',observationPath:['verifiedRead','file']}],inputSchema:{type:'object',properties:{sourceFile:{type:'string'}},required:['sourceFile']}}
  ],missionState:{phase:'EVIDENCE_NEXT_ACTION',evidenceObjectives:[objective],completedTasks:[{name:'repo.search',args:{query:'entries'},observation:{ok:true,repoCandidates:[{file:'capture.js'}]}}]}});
  assert.equal(calls,1);assert.equal(result.toolCalls[0].args.file,'capture.js');assert.equal(result.missionComplete,false);assert.equal(result.completionAssessment.objectives[0].satisfied,false);
 }finally{f.cleanup();}
});