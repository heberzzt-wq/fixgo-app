import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from 'node:child_process';
import {configuredRepositorySources,configuredSourcesMessage} from '../jarvis-configured-sources.js';
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
    fs.writeFileSync(path.join(root,'sample.test.js'),`collection(db,'test_only_records');`);
    const commit=()=>{run(['add','.']);run(['-c','user.name=Schema Test','-c','user.email=schema@example.invalid','commit','--quiet','-m','fixture']);};
    commit();
    return {root,run,commit,cleanup(){assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('jarvis-schema-fixture-'));fs.rmSync(root,{recursive:true,force:true});}};
}

test('configured sources preserve modular SDK bindings without record examples and refresh on revision changes',()=>{
    const f=configuredSourceFixture();
    try {
        const legacy=buildRepoIntelligence({root:f.root});
        assert.deepEqual(legacy.nodes['capture.js'].collections,[],'reproduce the legacy graph omission');
        const catalog=configuredRepositorySources(f.root);
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

test('configured source hints respect the prompt budget without dropping file and path associations',()=>{
    const f=configuredSourceFixture();
    try {
        const catalog=configuredRepositorySources(f.root);
        const expanded={...catalog,fields:Array.from({length:100},(_,i)=>'field_'+i+'x'.repeat(100))};
        const message=configuredSourcesMessage(expanded,2000);
        assert.ok(message);
        assert.ok(message.content.length<=2000,'the entire message must fit, including guidance');
        const payload=JSON.parse(message.content.split('\n')[0].split('CONFIGURACION_DE_FUENTES_VERIFICADA=')[1]);
        assert.equal(payload.fieldHintsOmitted,true);
        assert.deepEqual(payload.files,catalog.files);
        assert.deepEqual(payload.collections,catalog.collections);
        assert.deepEqual(payload.references.map(([file,col])=>[file,col]),catalog.references.map(([file,col])=>[file,col]));
        assert.equal(configuredSourcesMessage(expanded,10),null);
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
