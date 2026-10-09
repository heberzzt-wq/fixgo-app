import test from "node:test";
import assert from "node:assert/strict";
import { __test as mission, runJarvisMission } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";
import { compactMissionPlannerObservation } from "../gestia-core/jarvis/jarvis.mission.planner-state.js";
import { completeJarvisPlanningArguments, bindVerifiedMaterialArguments, validateVerifiedMaterialComposition } from "../gestia-core/jarvis/jarvis.multifunction.planner.js";

test("code preparation exposes exact patch fields without granting write approval", async () => {
    const previousWindow=globalThis.window;
    globalThis.window=globalThis;
    try {
        const {JarvisToolRuntime:runtime}=await import("../gestia-core/tools.runtime.js");
        const tool=runtime.list().find(item=>item.name==="repo.prepareWrite");
        assert.equal(tool.mutates,false);
        assert.equal(tool.requiresApproval,false);
        assert.deepEqual(tool.inputSchema.required,["file","search","replace","matchCount"]);
        assert.deepEqual(tool.inputSchema.properties.operation.enum,["replace","create"]);
        assert.equal(tool.inputSchema.properties.matchCount.minimum,0);
        assert.equal(runtime.list().find(item=>item.name==="repo.write").requiresApproval,true);
    } finally {globalThis.window=previousWindow;}
});

test("export grounding distinguishes newly produced artifacts from original library inputs", async () => {
    let request;
    const output = ".jarvis-artifacts/images/current-ad.png";
    await completeJarvisPlanningArguments({toolName:"media.library", instruction:"Exporta el anuncio creado a Salidas", operation:"exportar el archivo creado",
        inputSchema:{type:"object",properties:{action:{type:"string"},output:{type:"string"}}},
        missionEvidence:[{tool:"media.library",status:"MATERIAL_LIBRARY_LISTED",evidence:{entries:[{relativePath:"Entradas/photo.png",mimeType:"image/png"}]}},
            {tool:"image.adapt",status:"IMAGE_VARIANTS_ADAPTED_VERIFIED",evidence:{output,mimeType:"image/png",outputs:[{output,mimeType:"image/png"}]}}],
        semanticPlanner:async input=>{request=input;return{toolCalls:[{name:"media.library",args:{action:"export",output}}]};}
    });
    const serialized=JSON.stringify(request);
    assert.ok(serialized.includes("ARTEFACTOS_PRODUCIDOS="));
    assert.ok(serialized.includes("IMAGE_VARIANTS_ADAPTED_VERIFIED"));
    assert.ok(serialized.includes(output));
    assert.ok(!serialized.includes("EVIDENCIA_CANONICA_DE_MISION=[]"));
});
import { normalizeImageArtifactPrefix, normalizeImageAdaptArguments, normalizeMaterialLibraryArguments } from "../gestia-core/jarvis/jarvis.actuator.pack.js";

test("image composition preserves an authored misplaced brand and rejects conflicting identities",()=>{
    const args={sourceOutput:"library:photo.png",logoPlacement:{brandName:"SUMMIT"},composition:{headline:"Mensaje elegido por Qwen"}};
    assert.equal(normalizeImageAdaptArguments(args).composition.brandName,"SUMMIT");
    assert.equal(normalizeImageAdaptArguments(args).composition.headline,args.composition.headline);
    assert.equal(args.composition.brandName,undefined,"normalization must not mutate the recorded Qwen call");
    assert.throws(()=>normalizeImageAdaptArguments({...args,composition:{brandName:"OTRA FIRMA"}}),/BRAND_NAME_CONFLICT/);
    assert.equal(normalizeImageAdaptArguments({composition:{headline:"Sin nombre"}}).composition.brandName,undefined,"never manufacture missing brand data");
});

test("a bounded retry regrounds the same obligation with the actual argument failure", async () => {
    const prompts=[];
    const semanticPlanner=async request=>{prompts.push(request.input);return{toolCalls:[{name:"repo.read",args:{file:prompts.length===1?"missing.json":"package.json"}}],missionComplete:false};};
    const result=await runJarvisMission({instruction:"Lee package.json sin modificar archivos.",initialToolCalls:[{name:"repo.read",args:{},deferred:true,reason:"leer package.json",obligationId:"read-original"}],maximumSteps:4,maximumRetries:1,planner:async()=>({toolCalls:[],missionComplete:true}),
        execute:async(call,context)=>{
            const grounded=await completeJarvisPlanningArguments({toolName:call.name,instruction:context.rawInput,operation:call.reason,inputSchema:{type:"object",properties:{file:{type:"string"}},required:["file"]},validationFeedback:context.argumentValidationFeedback,semanticPlanner});
            if(grounded.args.file==="missing.json")return{ok:false,status:"FILE_NOT_FOUND",error:"FILE_NOT_FOUND:missing.json",retryable:true,missionExecution:{args:grounded.args}};
            return{ok:true,status:"COMPLETED",missionExecution:{args:grounded.args}};
        }
    });
    assert.equal(prompts.length,2,"failure evidence must invalidate the grounded plan cache");
    assert.ok(prompts[1].includes("FILE_NOT_FOUND:missing.json"));
    assert.ok(!prompts[0].includes("FALLO_OBSERVADO_DEL_INTENTO_ANTERIOR"));
    assert.equal(result.completedTasks[0].obligationId,"read-original");
    assert.equal(result.completedTasks[0].args.file,"package.json");
});

test("a library query cannot silently succeed as delivery of a produced artifact", () => {
    assert.throws(()=>normalizeMaterialLibraryArguments({action:"list",relativePath:".jarvis-artifacts/images/ad.png"}), /MATERIAL_LIST_CANNOT_DELIVER_ARTIFACT/);
    assert.throws(()=>normalizeMaterialLibraryArguments({action:"list",output:".jarvis-artifacts/images/ad.png"}), /MATERIAL_LIST_CANNOT_DELIVER_ARTIFACT/);
    assert.deepEqual(normalizeMaterialLibraryArguments({action:"list"}),{action:"list"});
});
import { mergeEvidenceGroundedToolCalls } from "../gestia-core/jarvis/jarvis.conversation.composer.js";
import { ensureExecutableArtifactDependencies } from "../gestia-core/jarvis/jarvis.mission.dependencies.js";
import { createRequire } from "node:module";
import { __test as planner, mergeJarvisToolCalls } from "../gestia-core/jarvis/jarvis.multifunction.planner.js";
const { validatePlan, runModelSemanticPlanner } = createRequire(import.meta.url)("../functions/jarvis-semantic-planner.js");

test("local completion audit uses semantic candidates and bounded system/user messages", async () => {
    const input="Comprueba el archivo creado y su exportación real.";
    let retrieval;
    const result=await runModelSemanticPlanner({input,catalog:[{name:"repo.read",description:"Lectura real"},{name:"media.library",description:"Exportación real"}],missionState:{phase:"COMPLETION_AUDIT"},
        retrieveToolCandidates:async (...args)=>{retrieval=args;return[{name:"media.library"}];},
        ai:{lastProvider:"ollama-openai-compatible-local",models:{generateContent:async request=>{
            assert.equal(request.config.semanticStage,"COMPLETION_AUDIT");
            assert.equal(request.config.maxOutputTokens,1536);
            assert.equal(request.config.chatMessages[0].role,"system");
            assert.equal(request.config.chatMessages.at(-1).content,input);
            assert.ok(request.config.chatMessages.some(message=>message.content.startsWith("CATALOGO_EJECUTABLE=")));
            assert.ok(request.config.responseJsonSchema.properties.completionAssessment);
            return{text:JSON.stringify({toolCalls:[{name:"media.library",args:{action:"export",output:".jarvis-artifacts/images/ad.png"}}],missionComplete:false})};
        }}}
    });
    assert.equal(retrieval,undefined,"completion preserves the authorized catalog rather than a semantic shortlist");
    assert.equal(result.catalogSize,2);
    assert.equal(result.missionComplete,false);
    assert.equal(result.toolCalls[0].name,"media.library");
});

test("a completion audit cannot claim completion and request another operation simultaneously", async () => {
    await assert.rejects(()=>runModelSemanticPlanner({input:"Audita el resultado real.",catalog:[{name:"image.adapt",description:"Adaptar imagen"}],missionState:{phase:"COMPLETION_AUDIT"},ai:{lastProvider:"ollama-openai-compatible-local",models:{generateContent:async()=>({text:JSON.stringify({toolCalls:[{name:"image.adapt",args:{sourceOutput:"invented"}}],missionComplete:true})})}}}),/COMPLETION_AUDIT_CONTRADICTORY/);
});

test("grounded material schemas offer exact original references and supplied contacts", () => {
    const schema={type:"object",properties:{sourceOutput:{type:"string"},brandLogoOutput:{type:"string"},composition:{type:"object",properties:{contact:{type:"string"}}}}};
    const evidence=[{tool:"media.library",evidence:{entries:[{relativePath:"Entradas/photo.png",role:"input",mimeType:"image/png"},{relativePath:"Logos/logo.png",role:"official_logo_source",mimeType:"image/png"}]}}];
    const bound=bindVerifiedMaterialArguments(schema,"Incluye www.summ.com.mx. No inventes contactos.",[],evidence);
    assert.deepEqual(bound.properties.sourceOutput.enum,["library:Entradas/photo.png"]);
    assert.deepEqual(bound.properties.brandLogoOutput.enum,["library:Logos/logo.png"]);
    assert.deepEqual(bound.properties.composition.properties.contact.enum,["www.summ.com.mx"]);
    assert.equal(schema.properties.sourceOutput.enum,undefined);
});

test("advertising grammar excludes exhausted originals, delivered layouts and non-web benchmark references", () => {
    const schema={type:"object",properties:{sourceOutput:{type:"string"},composition:{type:"object",properties:{layout:{type:"string",enum:["split","stack"]}}},creativeDirection:{type:"object",properties:{references:{type:"array",minItems:2,items:{type:"string"}}}}}};
    const entries=["used.png","available.png"].map(name=>({relativePath:`Entradas/${name}`,role:"input",mimeType:"image/png"}));
    const history=[{visual:{sourceRef:"library:Entradas/used.png",layout:"split"}},{visual:{sourceRef:"library:Entradas/used.png",layout:"stack"}},{visual:{sourceRef:"library:Entradas/available.png",layout:"split"}}];
    const sources=[{url:"https://one.test/"},{url:"https://two.test/"}];
    const evidence=[{tool:"advertising.research",evidence:{entries,advertisingHistory:history,sources}}];
    const bound=bindVerifiedMaterialArguments(schema,"Otro anuncio",[],evidence);
    assert.deepEqual(bound.properties.sourceOutput.enum,["library:Entradas/available.png"]);
    assert.deepEqual(bound.properties.composition.properties.layout.enum,["stack"]);
    assert.deepEqual(bound.properties.creativeDirection.properties.references.items.enum,sources.map(source=>source.url));
    assert.equal(bound.properties.creativeDirection.properties.references.uniqueItems,true);
    assert.ok(bound.required.includes("creativeDirection"));
    assert.ok(bound.required.includes("composition"),"a requested new advertisement cannot degrade into resizing an original");
    assert.deepEqual(schema.properties.composition.properties.layout.enum,["split","stack"],"the canonical schema stays unchanged");
    const exhausted=[...history,{visual:{sourceRef:"library:Entradas/available.png",layout:"stack"}}];
    assert.throws(()=>bindVerifiedMaterialArguments(schema,"Otro anuncio",[],[{tool:"advertising.research",evidence:{entries,advertisingHistory:exhausted,sources}}]),/COMBINATIONS_EXHAUSTED/);
});

test("disjoint available layouts stay coupled to each original instead of admitting a delivered pair", () => {
    const schema={type:"object",properties:{sourceOutput:{type:"string"},composition:{type:"object",properties:{layout:{type:"string",enum:["split","stack"]}}}}};
    const entries=["a.png","b.png"].map(name=>({relativePath:`Entradas/${name}`,role:"input",mimeType:"image/png"}));
    const evidence=[{tool:"media.library",evidence:{entries,advertisingHistory:[{visual:{sourceRef:"library:Entradas/a.png",layout:"split"}},{visual:{sourceRef:"library:Entradas/b.png",layout:"stack"}}]}}];
    const bound=bindVerifiedMaterialArguments(schema,"Otro anuncio",[],evidence);
    assert.deepEqual(bound.anyOf.map(branch=>[branch.properties.sourceOutput.const,branch.properties.composition.properties.layout.enum]),[["library:Entradas/a.png",["stack"]],["library:Entradas/b.png",["split"]]]);
});

test("export arguments bind produced artifacts and cannot substitute an official input", () => {
    const schema={type:"object",properties:{action:{type:"string",enum:["list","import","export"]},relativePath:{type:"string"},output:{type:"string"}},required:["action"]};
    const evidence=[{tool:"advertising.research",evidence:{entries:[{relativePath:"Entradas/original.png",role:"input",mimeType:"image/png"}]}},
        {tool:"image.adapt",evidence:{status:"IMAGE_VARIANTS_CREATED",outputs:[{output:".jarvis-artifacts/images/new.png",mimeType:"image/png"}]}}];
    const bound=bindVerifiedMaterialArguments(schema,"Entrega el anuncio creado",[],evidence);
    assert.deepEqual(bound.properties.output.enum,[".jarvis-artifacts/images/new.png"]);
    const exportBranch=bound.anyOf.find(branch=>branch.properties.action.const==="export");
    assert.deepEqual(exportBranch.required,["action","output"]);
    assert.equal(schema.properties.output.enum,undefined);
});

test("repeated copy gets a bounded second repair while preserving the selected assets", async () => {
    const original={sourceOutput:"library:Entradas/photo.png",brandLogoOutput:"library:Logos/logo.png",composition:{headline:"Mensaje anterior",body:"Texto anterior",layout:"stack"}};
    const evidence=[{tool:"advertising.research",evidence:{advertisingHistory:[{creative:original.composition}]}}];
    let attempts=0;
    const result=await completeJarvisPlanningArguments({toolName:"image.adapt",instruction:"Crea otra publicidad",missionEvidence:evidence,inputSchema:{type:"object",properties:{sourceOutput:{type:"string"},brandLogoOutput:{type:"string"},composition:{type:"object"}}},semanticPlanner:async request=>{
        attempts++;
        if(attempts===3) assert.ok(request.input.includes('BORRADORES_RECHAZADOS_NO_REUTILIZAR='));
        if(attempts>1) assert.ok(!request.input.includes('Texto anterior'), 'rejected bodies cannot become copy examples in the redaction context');
        if(attempts>1) assert.ok(!request.input.includes('Mensaje anterior'), 'rejected headlines cannot become copy examples either');
        const draft=attempts===1?original:attempts===2?{composition:{headline:"Titular cambiado",body:"Texto anterior"}}:{composition:{headline:"Otro enfoque",body:"Texto nuevo"}};
        return {toolCalls:[{name:"image.adapt",args:draft}]};
    }});
    assert.equal(attempts,3);
    assert.equal(result.args.sourceOutput,original.sourceOutput);
    assert.equal(result.args.brandLogoOutput,original.brandLogoOutput);
    assert.equal(result.args.composition.layout,"stack");
    assert.equal(result.args.composition.headline,"Otro enfoque");
});

test("a failed creation cannot export an invented artifact or an original", async () => {
    const evidence=[{tool:"advertising.research",evidence:{entries:[{relativePath:"Entradas/photo.png",role:"input",mimeType:"image/png"}]}},{tool:"image.adapt",status:"TOOL_FAILED",evidence:{}}];
    for(const output of [undefined,"library:Entradas/photo.png",".jarvis-artifacts/images/invented.png"]) {
        let attempts=0;
        await assert.rejects(()=>completeJarvisPlanningArguments({toolName:"media.library",instruction:`Exporta el anuncio creado; referencia propuesta ${output ?? "ausente"}`,missionEvidence:evidence,inputSchema:{type:"object",properties:{action:{type:"string"},output:{type:"string"}}},semanticPlanner:async()=>{
            attempts++; return {toolCalls:[{name:"media.library",args:{action:"export",output}}]};
        }}),error=>error.retryable===false && /SEMANTIC_EXPORT_ARTIFACT_REQUIRED/.test(error.message));
        assert.equal(attempts,1);
    }
});

test("composition rejects another photograph's crop and regrounds a repeated delivered message", async () => {
    const region={x:695,y:240,width:559,height:735};
    const evidence=[{tool:"media.library",evidence:{entries:[{relativePath:"Entradas/photo.png",role:"input",mimeType:"image/png",photoRegion:region}],advertisingHistory:[{creative:{headline:"Mensaje anterior",body:"Texto anterior"}}]}}];
    const original={sourceOutput:"library:Entradas/photo.png",composition:{headline:"Mensaje anterior",body:"Texto anterior",photoCrop:region}};
    const visualEvidence=[{...evidence[0],evidence:{...evidence[0].evidence,advertisingHistory:[{visual:{sourceRef:original.sourceOutput,layout:"split"}}]}}];
    assert.throws(()=>validateVerifiedMaterialComposition(original,visualEvidence),/COMPOSITION_REPEATED/);
    assert.doesNotThrow(()=>validateVerifiedMaterialComposition({...original,composition:{...original.composition,layout:"stack"}},visualEvidence));
    const historicalContact=[{...evidence[0],evidence:{...evidence[0].evidence,advertisingHistory:[{creative:{headline:"Mensaje anterior",body:"Texto anterior www.summ.com.mx"}}]}}];
    assert.throws(()=>validateVerifiedMaterialComposition(original,historicalContact),/MESSAGE_REPEATED/,"removing a website from previously delivered text does not create a new advertisement");
    assert.throws(()=>validateVerifiedMaterialComposition({...original,composition:{...original.composition,photoCrop:{x:260,y:100,width:681,height:835}}},evidence),/PHOTO_REGION_UNVERIFIED/);
    assert.throws(()=>validateVerifiedMaterialComposition({...original,composition:{...original.composition,contact:"info@summ.com.mx"}},evidence,"Incluye www.summ.com.mx."),/CONTACT_UNVERIFIED/);
    const requests=[];
    const result=await completeJarvisPlanningArguments({toolName:"image.adapt",instruction:"Crea otra pieza nueva.",operation:"crear una pieza nueva",missionEvidence:evidence,inputSchema:{type:"object",properties:{sourceOutput:{type:"string"},composition:{type:"object"}}},semanticPlanner:async request=>{
        requests.push(request.input);
        if(requests.length===2) assert.deepEqual(Object.keys(request.catalog[0].inputSchema.properties),["composition"]);
        return{toolCalls:[{name:"image.adapt",args:requests.length===1?original:{...original,composition:{...original.composition,headline:"Otro mensaje",body:"Otro enfoque"}}}],missionComplete:false};
    }});
    assert.equal(requests.length,2);
    assert.ok(requests[1].includes("SEMANTIC_ADVERTISING_MESSAGE_REPEATED"));
    assert.equal(result.args.composition.headline,"Otro mensaje");
    assert.equal(result.args.sourceOutput,original.sourceOutput);
    assert.deepEqual(result.args.composition.photoCrop,region);
    let failedAttempts=0;
    await assert.rejects(()=>completeJarvisPlanningArguments({toolName:"image.adapt",instruction:"Crea otra pieza nueva para la prueba de agotamiento.",operation:"crear otra pieza nueva",missionEvidence:evidence,inputSchema:{type:"object",properties:{sourceOutput:{type:"string"},composition:{type:"object"}}},semanticPlanner:async()=>{failedAttempts++;return{toolCalls:[{name:"image.adapt",args:original}],missionComplete:false};}}),error=>error.retryable===false && /MESSAGE_REPEATED/.test(error.message));
    assert.equal(failedAttempts,3,"exhausted semantic repair cannot recurse into another runtime retry");
    let distinctAttempts=0;
    const repaired=await completeJarvisPlanningArguments({toolName:"image.adapt",instruction:"Crea otra pieza nueva para comprobar recorte y mensaje.",operation:"crear una pieza nueva",missionEvidence:evidence,inputSchema:{type:"object",properties:{sourceOutput:{type:"string"},composition:{type:"object"}}},semanticPlanner:async request=>{
        distinctAttempts++;
        if(distinctAttempts===2) assert.deepEqual(Object.keys(request.catalog[0].inputSchema.properties),["composition"]);
        const args=distinctAttempts===1 ? {...original,composition:{...original.composition,photoCrop:{x:0,y:0,width:1,height:1}}} : {composition:{headline:"Decisiones fiscales con claridad",body:"Prepara tus próximos pasos con asesoría profesional."}};
        return {toolCalls:[{name:"image.adapt",args}],missionComplete:false};
    }});
    assert.equal(distinctAttempts,2,"verified geometry binds to Qwen's source; only creative copy requires a semantic repair");
    assert.equal(repaired.args.sourceOutput,original.sourceOutput);
    assert.deepEqual(repaired.args.composition.photoCrop,region);
    assert.equal(repaired.args.composition.headline,"Decisiones fiscales con claridad");
});

test("official contact facts survive material references without treating advertising history as contact authority", () => {
    const schema={type:"object",properties:{composition:{type:"object",properties:{contact:{type:"string"}}}}};
    const evidence=[{tool:"media.library",evidence:{entries:[{relativePath:"Entradas/photo.png",role:"input",mimeType:"image/png",metadataSource:"USER_LIBRARY_SIDECAR",verifiedContacts:["www.summ.com.mx"]}],advertisingHistory:[{creative:{headline:"Anterior",body:"info@inventado.mx"}}]}}];
    assert.deepEqual(bindVerifiedMaterialArguments(schema,"Crea un anuncio",[],evidence).properties.composition.properties.contact.enum,["www.summ.com.mx"]);
    const args={composition:{headline:"Revisa tu situación fiscal",body:"Asesoría en Cancún",contact:"www.summ.com.mx"}};
    assert.doesNotThrow(()=>validateVerifiedMaterialComposition(args,evidence,"Crea un anuncio"));
    assert.throws(()=>validateVerifiedMaterialComposition({composition:{...args.composition,contact:"info@inventado.mx"}},evidence,"Crea un anuncio"),/CONTACT_UNVERIFIED/);
});

test("terminal preparation preserves inventory, creation and export as separate ordered obligations", async () => {
    const calls = [
        { name: "media.library", args: {}, deferred: true, obligationId: "inventory", reason: "read official originals" },
        { name: "image.adapt", args: {}, deferred: true, obligationId: "compose", reason: "create PNG" },
        { name: "media.library", args: {}, deferred: true, obligationId: "deliver", reason: "export created PNG" }
    ];
    const merged = mergeEvidenceGroundedToolCalls(calls, calls);
    assert.equal(merged.length, 3, "query and export cannot collapse into one library call");
    const prepared = ensureExecutableArtifactDependencies({ toolCalls: merged, catalog: calls });
    assert.deepEqual(prepared.map(call => call.obligationId), ["inventory", "compose", "deliver"]);
    const executed = [];
    await runJarvisMission({ instruction: "Create and deliver a PNG using local originals", initialToolCalls: prepared,
        maximumSteps: 4, planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async call => { executed.push(call.obligationId); return { ok: true, status: "COMPLETED" }; }
    });
    assert.deepEqual(executed, ["inventory", "compose", "deliver"]);
});

test("explicit exports are ordered after image creation while inventory stays before it", () => {
    const prepared = ensureExecutableArtifactDependencies({ toolCalls: [
        { name: "media.library", args: { action: "export", output: ".jarvis-artifacts/images/ad.png" } },
        { name: "image.adapt", args: { sourceOutput: "library:Entradas/photo.png" } },
        { name: "media.library", args: { action: "list" } }
    ] });
    assert.deepEqual(prepared.map(call => call.args.action || call.name), ["list", "image.adapt", "export"]);
});

test("terminal keeps independent repository reads and Qwen's web/video dependencies", () => {
    for (const tools of [
        ["repo.read", "repo.read", "repo.prepareWrite", "repo.architectReview"],
        ["media.library", "page.compose", "page.create"],
        ["media.library", "series.episode.prepare", "reel.create", "media.library"]
    ]) {
        const calls = tools.map((name, index) => ({ name, args: {}, deferred: true, obligationId: `result-${index}` }));
        const prepared = ensureExecutableArtifactDependencies({ toolCalls: mergeEvidenceGroundedToolCalls(calls, calls), catalog: calls });
        assert.deepEqual(prepared.map(call => call.obligationId), calls.map(call => call.obligationId));
    }
});

test("complete Qwen contract replaces provisional turn calls instead of creating a second ungrounded ad", () => {
    const contract = [{ name: "image.adapt", args: {}, deferred: true, obligationId: "compose" }];
    Object.defineProperty(contract, "planKind", { value: "MISSION_CONTRACT_COMPACT_LOCAL" });
    const provisional = [{ name: "image.adapt", args: { sourceOutput: "Unverified folder name" } }];
    assert.deepEqual(mergeEvidenceGroundedToolCalls(contract, provisional), contract);
});

test("export binds an exact artifact path alias without choosing a different action or file", () => {
    const output = ".jarvis-artifacts/images/ad.png";
    assert.deepEqual(normalizeMaterialLibraryArguments({ action: "export", relativePath: output }), {
        action: "export", relativePath: undefined, output
    });
    assert.throws(() => normalizeMaterialLibraryArguments({ action: "list", relativePath: output }), /MATERIAL_LIST_CANNOT_DELIVER_ARTIFACT/);
    assert.throws(() => normalizeMaterialLibraryArguments({ action: "export", relativePath: output, output: output + ".other" }), /AMBIGUOUS/);
});

test("distinct deferred library operations survive backend, browser and mission deduplication", () => {
    const catalog = [{ name: "media.library", mutates: true, inputSchema: {
        type: "object", properties: { action: { type: "string" } }, required: ["action"]
    } }];
    const calls = ["list originals", "export completed image"].map(operation => ({
        name: "media.library", args: {}, deferred: true, obligationId: `semantic:${operation}`, reason: operation
    }));
    const validated = validatePlan({ toolCalls: [...calls, calls[0]] }, catalog, "", { allowDeferred: true });
    assert.equal(validated.toolCalls.length, 2);
    const browserCalls = planner.trustedPlanCalls({ ...validated, planKind: "MISSION_CONTRACT_COMPACT_LOCAL" }, catalog, {});
    assert.equal(browserCalls.length, 2);
    const merged = mergeJarvisToolCalls(browserCalls, browserCalls);
    assert.equal(merged.length, 2);
    const scheduled = mission.trustedCalls(merged, { completedTasks: [], pendingTasks: [], blockedTasks: [] });
    assert.equal(scheduled.length, 2);
    assert.equal(scheduled[1].reason, "export completed image");
    assert.notEqual(scheduled[0].signature, scheduled[1].signature);
    // Fully specified duplicate actions still collapse even with different labels.
    const ready = calls.map(call => ({ ...call, deferred: false, args: { action: "list" } }));
    assert.equal(validatePlan({ toolCalls: ready }, catalog).toolCalls.length, 1);
});

test("the executor receives the semantic operation when the same tool is used twice", async () => {
    const reasons = [];
    const calls = ["list originals", "export completed image"].map(reason => ({
        name: "media.library", args: {}, deferred: true, obligationId: reason, reason
    }));
    let planning = 0;
    await runJarvisMission({ instruction: "Use official materials and export the result", maximumSteps: 4,
        planner: async () => ++planning === 1 ? { toolCalls: calls } : { toolCalls: [], missionComplete: true },
        execute: async call => { reasons.push(call.reason); return { ok: true, status: "COMPLETED" }; }
    });
    assert.deepEqual(reasons, ["list originals", "export completed image"]);
});

test("image names remain under the artifact directory before exporting separately", () => {
    assert.equal(normalizeImageArtifactPrefix("Salidas"), ".jarvis-artifacts/images/Salidas");
    assert.equal(normalizeImageArtifactPrefix(undefined, "adapted-123"), ".jarvis-artifacts/images/adapted-123");
    assert.equal(normalizeImageArtifactPrefix(".jarvis-artifacts/images/ad-123"), ".jarvis-artifacts/images/ad-123");
    for (const value of ["../escape", "C:/Users/test", "Salidas/anuncio", ".jarvis-artifacts/images/../../escape"]) {
        assert.throws(() => normalizeImageArtifactPrefix(value), /IMAGE_ADAPTATION_OUTPUT_INVALID/);
    }
});

const entries = Array.from({ length: 7 }, (_, index) => ({
    relativePath: index === 6 ? "Logos/Firma/logo.png" : `Entradas/Firma/imagen-${index}.png`,
    role: index === 6 ? "official_logo_source" : "input", mimeType: "image/png",
    bytes: 2500000, sha256: String(index).repeat(64), width: 1200, height: 1200,
    description: "Original aportado por el usuario", photoRegion: { x: 0, y: 0, width: 700, height: 900 }
}));
const observation = { ok: true, status: "MATERIAL_LIBRARY_LISTED", objectiveSatisfied: true,
    summary: "Inventario de originales", evidence: { ok: true, status: "MATERIAL_LIBRARY_LISTED", entries,
        advertisingHistory: [{ createdAt: "2026-10-02T12:00:00Z", creative: { headline: "Previous delivered ad" } }] } };

test("library inventory survives the canonical evidence and replanning boundaries", () => {
    const canonical = mission.canonicalMissionEvidence({ completedTasks: [{ name: "media.library", observation }] });
    assert.equal(canonical.length, 1);
    assert.equal(canonical[0].evidence.entries.length, 7);
    const compact = compactMissionPlannerObservation(observation);
    assert.equal(compact.materialReferences.length, 7);
    assert.equal(compact.materialReferences[6].ref, "library:Logos/Firma/logo.png");
    assert.equal(compact.advertisingHistory[0].creative.headline, "Previous delivered ad");
});

test("argument completion receives exact material references including logos beyond the third entry", async () => {
    let request;
    await completeJarvisPlanningArguments({
        toolName: "image.adapt", instruction: "Crea un anuncio con el original y el logo oficial.", operation: "compose the requested image",
        inputSchema: { type: "object", properties: { sourceOutput: { type: "string" } } },
        missionEvidence: [{ tool: "media.library", status: observation.status, summary: observation.summary, evidence: observation.evidence }],
        semanticPlanner: async input => { request = input; return { toolCalls: [{ name: "image.adapt", args: { sourceOutput: "library:Entradas/Firma/imagen-0.png" } }] }; }
    });
    const serialized = JSON.stringify(request);
    assert.ok(serialized.includes("library:Logos/Firma/logo.png"));
    assert.ok(serialized.includes("photoRegion"));
    assert.ok(serialized.includes("OPERACION_ACTUAL_DEL_PLAN=compose the requested image"));
    assert.ok(!serialized.includes("Previous delivered ad"), "delivered copy stays in independent validation rather than becoming a generation example");
    assert.ok(serialized.includes("PUBLICIDAD_YA_ENTREGADA"));
});

test('optional inventory arguments allow the actual current checkout without an invented target', async () => {
    const result=await completeJarvisPlanningArguments({toolName:'repo.audit',instruction:'Inventaría el repositorio actual.',inputSchema:{type:'object',properties:{target:{type:'string'}}},semanticPlanner:async()=>({toolCalls:[{name:'repo.audit',args:{}}]})});
    assert.deepEqual(result.args,{});
    const compact=compactMissionPlannerObservation({ok:true,repositoryTarget:{path:'verified-checkout'},files:['package.json','src/index.js']});
    assert.deepEqual(compact.files,['package.json','src/index.js']);
    assert.equal(compact.repositoryTarget.path,'verified-checkout');
    assert.equal(compact.inventoryExcerpt,true);
});
