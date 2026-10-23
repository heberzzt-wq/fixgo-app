import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolveExplicitRepositoryTargets, appendExplicitReadOnlySourceCalls} from '../gestia-core/repo/repo.source.structure.js';
import {runJarvisMission, missingExplicitRepositorySourceEvidence} from '../gestia-core/jarvis/jarvis.mission.orchestrator.js';

const files=['jarvis-configured-sources.js','jarvis-upload-bridge.js'];
const instruction='NS1-08 Audita arquitectura de repositorio oficial; usa repo.graph y lee jarvis-configured-sources.js y jarvis-upload-bridge.js. No modifiques nada.';
const tools=[{name:'repo.graph',investigationReadOnly:true,mutates:false},
    {name:'repo.read',investigationReadOnly:true,mutates:false}];

test('bounded read-only repo graph keeps both explicit files, without invented writes',()=>{
    const names=resolveExplicitRepositoryTargets(instruction,{registeredToolNames:tools.map(x=>x.name)});
    assert.deepEqual(names,files);
    const calls=appendExplicitReadOnlySourceCalls({toolCalls:[{name:'repo.graph',args:{}}],
        explicitReadCalls:names.map(file=>({name:'repo.read',args:{file}})),catalog:tools});
    assert.deepEqual(calls.map(x=>x.name),['repo.graph','repo.read','repo.read']);
    assert.deepEqual(calls.slice(1).map(x=>x.args.file),files);
    assert.deepEqual(appendExplicitReadOnlySourceCalls({toolCalls:calls,
        explicitReadCalls:names.map(file=>({name:'repo.read',args:{file}})),catalog:tools}),calls);
    assert.deepEqual(appendExplicitReadOnlySourceCalls({toolCalls:[calls[0]],
        explicitReadCalls:calls.slice(1),catalog:[tools[0]]}),[calls[0]]);
});

test('source completeness is exact per file and rejects success from another source',()=>{
    const read=file=>({name:'repo.read',args:{file},observation:{ok:true,verifiedRead:{file,content:'source'}}});
    assert.deepEqual(missingExplicitRepositorySourceEvidence(files,[read(files[0])]),[files[1]]);
    assert.deepEqual(missingExplicitRepositorySourceEvidence(files,[read(files[0]),read(files[1])]),[]);
    assert.deepEqual(missingExplicitRepositorySourceEvidence(files,[{name:'repo.read',args:{file:files[1]},observation:{ok:true,verifiedRead:{file:files[0]}}}]),files);
});

const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
async function missionWith(allowed) {
    const initial=[{name:'repo.graph',args:{refresh:true}},
        ...allowed.map(file=>({name:'repo.read',args:{file}}))];
    return runJarvisMission({instruction,initialToolCalls:initial,
        requiredToolNames:[...new Set(initial.map(x=>x.name))],
        requiredRepositorySourceFiles:files,toolCatalog:tools,
        storage:storage(),maximumSteps:8,
        planner:async()=>({toolCalls:[],missionComplete:true}),
        execute:async call=>call.name==='repo.graph'
            ? {ok:true,status:'REPO_GRAPH_READY',summary:{filesScanned:641}}
            : {ok:true,status:'REPO_READ_OK',file:call.args.file,content:'confirmed source',numberedContent:'1: confirmed source',startLine:1,endLine:1}
    });
}
test('a real graph alone can never close the two-source request',async()=>{
    const m=await missionWith([]);
    assert.equal(m.status,'PARTIAL');
    assert.deepEqual(m.contractMissingSourceFiles,files);
    assert.equal(m.reason,'EXPLICIT_REPOSITORY_READ_EVIDENCE_REQUIRED');
});
test('one source does not satisfy two user-specified reads',async()=>{
    const m=await missionWith(files.slice(0,1));
    assert.equal(m.status,'PARTIAL');
    assert.deepEqual(m.contractMissingSourceFiles,[files[1]]);
});
test('both verified reads and the graph permit completion',async()=>{
    const m=await missionWith(files);
    assert.equal(m.status,'COMPLETED');
    assert.deepEqual(m.contractMissingSourceFiles,[]);
});
test('production planner imports explicit-read safeguard instead of skipping bounded calls',()=>{
    const source=fs.readFileSync(new URL('../gestia-core/gestia-core.js',import.meta.url),'utf8');
    assert.match(source,/appendExplicitReadOnlySourceCalls\(\{/);
    assert.match(source,/requiredRepositorySourceFiles:\s*missionIsIsolated\s*\?\s*\[\]\s*:\s*explicitRepositoryTargets/);
});

test('public Hosting never fetches private repository files during automatic hydration',async()=>{
    const vm=await import('node:vm');
    const source=fs.readFileSync(new URL('../modules/terminal/repo-cognition.js',import.meta.url),'utf8');
    const fetched=[];
    const w={
        __REPO_INDEX__:{'jarvis-fs-bridge.js':{path:'jarvis-fs-bridge.js'},
            'firebase-node-adapter.js':{path:'firebase-node-adapter.js'}},
        loadRepoContext:async file=>{fetched.push(file);return {ok:true,source:'export const x=1;'}},
        gestiaBootLog(){}
    };
    const context={window:w,location:{hostname:'fixgo-44e4d.web.app'},
        console:{log(){},warn(){},info(){}},setTimeout,Date};
    vm.runInNewContext(source,context,{timeout:2000});
    const result=await w.buildRepoDependencyGraph();
    assert.equal(result.ok,true);
    assert.equal(result.status,'REPOSITORY_GRAPH_REQUIRES_AUTHORIZED_BRIDGE');
    assert.deepEqual(fetched,[]);
    assert.deepEqual(Object.keys(w.__REPO_DEP_GRAPH__),[]);
});
