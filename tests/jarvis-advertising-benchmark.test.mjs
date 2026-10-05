import test from "node:test";
import assert from "node:assert/strict";
import {validateAdvertisingDirection} from "../gestia-core/jarvis/jarvis.advertising.benchmark.js";
import {registerJarvisMultifunctionTools} from "../gestia-core/jarvis/jarvis.multitool.pack.js";
import {registerJarvisActuatorTools} from "../gestia-core/jarvis/jarvis.actuator.pack.js";

const sources=[{url:"https://reference-one.test/",title:"Referencia uno"},{url:"https://reference-two.test/",snippet:"Referencia dos"}];
const direction={insight:"La propuesta necesita ser legible",distinction:"Concepto propio sin copiar",clarity:"Mensaje breve",visualHierarchy:"Un titular dominante",callToAction:"Una acción concreta",references:sources.map(source=>source.url)};

test("creation requires observed references and a concrete proposed direction, not a premium claim",()=>{
    assert.throws(()=>validateAdvertisingDirection(direction,[]),/BENCHMARK_REQUIRED/);
    const evidence=[{tool:"advertising.research",evidence:{sources}}];
    assert.throws(()=>validateAdvertisingDirection({...direction,references:[sources[0].url,"https://invented.test/"]},evidence),/REFERENCE_UNVERIFIED/);
    assert.throws(()=>validateAdvertisingDirection({references:direction.references},evidence),/DIRECTION_REQUIRED/);
    assert.equal(validateAdvertisingDirection(direction,evidence).superiorQualityVerified,false);
});

test("benchmark reuses the local research bridge and returns official originals and history, without cloud fallback",async t=>{
    const previous=globalThis.JarvisLocalBridge;
    t.after(()=>{globalThis.JarvisLocalBridge=previous;});
    const calls=[];
    globalThis.JarvisLocalBridge={requestJson:async(route,args)=>{
        calls.push({route,args});
        return route==="/research" ? {ok:true,grounded:true,sources,answer:"Texto observado"} : {ok:true,entries:[{ref:"library:Entradas/photo.png",mimeType:"image/png"}],advertisingHistory:[{sha256:"a".repeat(64)}]};
    }};
    const tools=new Map(); registerJarvisMultifunctionTools({register:tool=>tools.set(tool.name,tool)});
    const result=await tools.get("advertising.research").execute({query:"Publicidad de despachos fiscales en Cancún"});
    assert.deepEqual(calls.map(call=>call.route),["/media/library","/research"]);
    assert.deepEqual(result.sources,sources);
    assert.equal(result.entries.length,1);
    assert.equal(result.advertisingHistory.length,1);
    assert.equal(result.externalApiUsed,false);
    assert.equal(result.thirdPartyAssetsReusable,false);
    globalThis.JarvisLocalBridge.requestJson=async(route)=>route==="/media/library" ? {ok:true,entries:[]} : {ok:false,error:"SEARCH_UNAVAILABLE"};
    await assert.rejects(tools.get("advertising.research").execute({query:"Despachos fiscales"}),/SOURCES_INSUFFICIENT/);
});

test("short brand requests ground their research query in official material before searching",async t=>{
    const previous=globalThis.JarvisLocalBridge;
    t.after(()=>{globalThis.JarvisLocalBridge=previous;});
    const calls=[];
    globalThis.JarvisLocalBridge={requestJson:async(route,args,options)=>{
        calls.push({route,args,options});
        if(route==="/media/library") return {ok:true,entries:[{relativePath:"Entradas/firma.png",mimeType:"image/png",description:"SUMMIT, asesoría fiscal en Cancún"}]};
        assert.equal(args.query,"publicidad asesoría fiscal Cancún");
        assert.ok(options.timeoutMs>=3*args.timeoutMs);
        return {ok:true,grounded:true,sources};
    }};
    const tools=new Map();registerJarvisMultifunctionTools({register:tool=>tools.set(tool.name,tool)});
    const result=await tools.get("advertising.research").execute({}, {rawInput:"créame una publicidad nueva para SUMMIT",semanticArgumentPlanner:async ({input})=>{
        assert.deepEqual(calls.map(call=>call.route),["/media/library"]);
        assert.match(input,/asesoría fiscal en Cancún/);
        return {ok:true,toolCalls:[{name:"advertising.research",args:{query:"publicidad asesoría fiscal Cancún"}}]};
    }});
    assert.equal(result.query,"publicidad asesoría fiscal Cancún");
    assert.equal(result.superiorQualityVerified,false);
});

test("image and branded reel block before reading or rendering any media without benchmark",async()=>{
    const tools=new Map();registerJarvisActuatorTools({register:tool=>tools.set(tool.name,tool)});
    await assert.rejects(tools.get("image.adapt").execute({composition:{headline:"Nuevo",body:"Texto"}}),/BENCHMARK_REQUIRED/);
    await assert.rejects(tools.get("reel.create").execute({brandName:"Firma"}),/BENCHMARK_REQUIRED/);
});
