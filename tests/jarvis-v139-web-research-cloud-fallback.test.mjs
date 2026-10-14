import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parse} from 'acorn';
import {externalInferenceBlocked,hasExactLocalModel} from '../gestia-core/jarvis/jarvis.local.policy.js';

import { registerJarvisMultifunctionTools, fetchGroundedWebResearch } from "../gestia-core/jarvis/jarvis.multitool.pack.js";

test('historical cloud callable handlers reject before invoking any provider',async()=>{
 const source=readFileSync(new URL('../functions/index.js',import.meta.url),'utf8');
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'script'});
 for(const name of ['jarvisWebResearch','jarvisMediaAnalyze','jarvisImageGenerate']){
  const assignment=ast.body.find(node=>node.expression?.left?.object?.name==='exports'&&node.expression.left.property?.name===name).expression;
  const handler=assignment.right.arguments[0];let providerCalls=0;
  class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
  const deny=()=>{providerCalls++;throw Error('PROVIDER_MUST_NOT_BE_REACHED');};
  const invoke=runInNewContext('('+source.slice(handler.start,handler.end)+')',{functions:{https:{HttpsError}},fetch:deny,callGenAi:deny});
  await assert.rejects(invoke({query:'Read current evidence',prompt:'Create an image'},{auth:{uid:'authorized-fixture'}}),error=>error.code==='failed-precondition'&&error.message==='LOCAL_JARVIS_ONLY');
  assert.equal(providerCalls,0);
  assert.doesNotMatch(source.slice(assignment.start,assignment.end),/GEMINI_KEY|VERTEX|RUNPOD/);
 }
});

test('unavailable local vision does not read attachment bytes or request cloud inference',async()=>{
 const source=readFileSync(new URL('../gestia-core/jarvis/jarvis.multitool.pack.js',import.meta.url),'utf8');
 const node=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='fetchGroundedMediaAnalysis');
 let reads=0;const forbidden=()=>{reads++;throw Error('EXTERNAL_READ_FORBIDDEN');};
 const invoke=runInNewContext('('+source.slice(node.start,node.end)+')',{externalInferenceBlocked,fetch:forbidden,invokeGroundedMediaAnalysis:forbidden});
 const result=await invoke([{kind:'image',url:'https://fixture.test/private.png'}],'Explain the visible contents');
 assert.equal(reads,0);assert.equal(result.ok,false);assert.equal(result.error,'EXTERNAL_INFERENCE_DISABLED');assert.equal(result.externalApiUsed,false);
});

test('a related model tag cannot satisfy exact local model readiness',()=>{
 assert.equal(hasExactLocalModel(['qwen3.5:4b','qwen3.5:9b-custom']),false);
 assert.equal(hasExactLocalModel(['qwen3.5:9b']),true);
});

test('local research failure cannot request a cloud token or call an external inference endpoint',async()=>{
 const previous={auth:globalThis.auth,bridge:globalThis.JarvisLocalBridge,fetch:globalThis.fetch};let tokens=0,calls=0;
 try{
  globalThis.auth={currentUser:{getIdToken:async()=>{tokens++;return 'fixture-token';}}};
  globalThis.JarvisLocalBridge={requestJson:async()=>({ok:false,error:'LOCAL_SOURCE_UNAVAILABLE'})};
  globalThis.fetch=async()=>{calls++;throw Error('EXTERNAL_CALL_FORBIDDEN');};
  const result=await fetchGroundedWebResearch('Inspect the authorized public source');
  assert.equal(calls,0);assert.equal(tokens,0);assert.equal(result.ok,false);assert.equal(result.error,'EXTERNAL_INFERENCE_DISABLED');
 }finally{globalThis.auth=previous.auth;globalThis.JarvisLocalBridge=previous.bridge;globalThis.fetch=previous.fetch;}
});

test("v139 web.research preserves the newer grounded local-primary authority", async () => {
    const previousAuth = globalThis.auth;
    const previousBridge = globalThis.JarvisLocalBridge;
    const previousFetch = globalThis.fetch;
    const previousHealth = globalThis.__JARVIS_WEB_RESEARCH_HEALTH__;

    const registry = new Map();
    const runtime = {
        register(definition) {
            registry.set(definition.name, definition);
            return definition;
        },
        list() {
            return [...registry.values()];
        },
        get(name) {
            return registry.get(name);
        }
    };

    const localSources = [
        {
            title: "Taqueria El Dorado - fuente local verificada",
            url: "https://example.test/taqueria-el-dorado",
            snippet: "Fuente simulada para validar el contrato de recuperacion local."
        }
    ];
    let bridgeCall = null;
    let cloudCalls = 0;

    try {
        globalThis.auth = {
            currentUser: {
                getIdToken: async () => "test-token"
            }
        };
        globalThis.fetch = async url => {
            cloudCalls += 1;
            assert.match(String(url), /jarvisWebResearch$/);
            return {
                ok: false,
                status: 500,
                json: async () => ({
                    error: {
                        message: "WEB_RESEARCH_HTTP_500"
                    }
                })
            };
        };
        globalThis.JarvisLocalBridge = {
            requestJson: async (path, payload, options) => {
                bridgeCall = { path, payload, options };
                return {
                    ok: true,
                    grounded: true,
                    status: "GROUNDED_LOCAL_SEARCH",
                    query: payload.query,
                    answer: "Investigacion local recuperada con una fuente verificable.",
                    sources: localSources
                };
            }
        };

        registerJarvisMultifunctionTools(runtime);
        const webResearch = registry.get("web.research");
        assert.ok(webResearch, "web.research debe estar registrado");

        const result = await webResearch.execute({
            query: "Taqueria El Dorado Cancun",
            allowedDomain: "example.test",
            exactEntity: "Taqueria El Dorado",
            seedUrl: "https://example.test/taqueria-el-dorado"
        }, {
            objectiveId: "objective-v139",
            caseId: "case-v139"
        });

        assert.equal(result.ok, true);
        assert.equal(result.grounded, true);
        assert.equal(result.status, "GROUNDED_LOCAL_PRIMARY");
        assert.equal(result.source, "JARVIS_LOCAL_GROUNDED_WEB_RESEARCH");
        assert.equal(result.cloudResearchUsed, false);
        assert.equal(result.externalApiUsed, false);
        assert.equal(result.cloudError, undefined);
        assert.deepEqual(result.sources, localSources);
        assert.equal(cloudCalls, 0);

        assert.equal(bridgeCall?.path, "/research");
        assert.equal(bridgeCall?.payload?.allowedDomain, "example.test");
        assert.equal(bridgeCall?.payload?.exactEntity, "Taqueria El Dorado");
        assert.equal(bridgeCall?.payload?.seedUrl, "https://example.test/taqueria-el-dorado");
        assert.match(bridgeCall?.payload?.query || "", /Taqueria El Dorado Cancun/);
        assert.equal(bridgeCall?.options?.timeoutMs, 25000);

        assert.equal(globalThis.__JARVIS_WEB_RESEARCH_HEALTH__?.ok, true);
        assert.equal(globalThis.__JARVIS_WEB_RESEARCH_HEALTH__?.grounded, true);
        assert.equal(globalThis.__JARVIS_WEB_RESEARCH_HEALTH__?.status, "GROUNDED_LOCAL_PRIMARY");
    } finally {
        globalThis.auth = previousAuth;
        globalThis.JarvisLocalBridge = previousBridge;
        globalThis.fetch = previousFetch;
        globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ = previousHealth;
    }
});
