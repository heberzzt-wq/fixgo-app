import {unmetMissionEvidenceRequirements,normalizeJarvisMissionObservation} from './gestia-core/jarvis/jarvis.mission.orchestrator.js';

// This is independent, receipt-bound advertising research evidence. A new
// creative need not ask Qwen to reclassify already approved source pages.
export function acceptedAdvertisingResearch(receipts=[]){
    const valid=receipts.filter(r=>r.ok===true);
    const researches=valid.filter(r=>r.name==='advertising.research').flatMap(r=>r.observation?.sources||[]).map(s=>s.url);
    const allowed=new Set(researches),inspected=new Set(valid.filter(r=>r.name==='browser.inspect'&&r.observation?.dom).map(r=>r.observation.url));
    for(const receipt of valid.filter(r=>r.name==='browser.inspect')){
        const evidence=receipt.observation?.advertisingSemanticReview;
        if(evidence?.verified!==true||evidence?.reviewExecuted!==true||evidence?.model!=='qwen3.5:9b'||
           !/^[a-f0-9]{64}$/i.test(evidence.inputSha256||''))continue;
        const urls=[...new Set(evidence.acceptedSourceURLs||[])];
        if(urls.length<2||urls.some(u=>!allowed.has(u)||!inspected.has(u)))continue;
        const decisions=evidence.review?.sources||[];
        if(urls.some(u=>!decisions.some(v=>v.url===u&&v.quote&&
            ['topicRelevant','sectorRelevant','identityCompatible','objectiveRelevant'].every(k=>v[k]===true))))continue;
        return {verified:true,acceptedSourceURLs:urls,inputSha256:evidence.inputSha256};
    }
    return {verified:false,acceptedSourceURLs:[]};
}
export function mergeAdvertisingCreativeEvidence(review,prior){
    if(review?.verified===true)return review;
    if(prior?.verified!==true||!Array.isArray(prior.acceptedSourceURLs)||prior.acceptedSourceURLs.length<2||
       review?.reviewExecuted!==true||review?.creativeEvidenceVerified!==true||
       review?.hostClaimConstraint?.verified!==true||
       review?.hostCopyConstraint?.rejected?.length!==0||
       !Array.isArray(review?.review?.blockingIssues))return review;
    // Only stale source-relevance assessments can be reused; a new unsupported
    // creative claim, identity or offer may not be bypassed.
    // Model explanations are localized natural language. Restrict reuse to
    // explicit SOURCE sufficiency/relevance complaints in English or Spanish;
    // unrelated creative/identity/offer blockers must still fail closed.
    const sourceComplaint=issue=>{
        const message=String(issue||'').normalize('NFD').replace(/\p{M}/gu,'').trim();
        return /^(?:Source s\d+\b|Only one source\b|(?:Two|At least two) (?:distinct |adequate )?sources\b|Solo una fuente\b|Falta (?:la )?segunda fuente\b|La segunda fuente\b|Fuente s\d+\b)/i.test(message);
    };
    const sourceOnly=review.review.blockingIssues.every(sourceComplaint)&&
        review.review.creative?.identityPreserved===true&&
        review.review.creative?.contactsGrounded===true&&
        review.review.creative?.claimsGrounded===true&&
        review.review.creative?.unsupportedClaims?.length===0;
    if(!sourceOnly)return review;
    return {...review,verified:true,status:'ADVERTISING_PRIOR_SOURCE_REVIEW_REUSED',
        sourceResearchPreviouslyVerified:{acceptedSourceURLs:[...prior.acceptedSourceURLs],inputSha256:prior.inputSha256},
        creativeReviewRawVerified:false};
}


// Distinguish a successfully prepared, non-mutating patch from authority to
// apply it. The ordinary composer deliberately marks approval-required
// operations blocked; this bounded pilot only consumes the physical preview.
export function verifiedNonMutatingPreviewEnvelope(envelope,call,sessionContext={}){
 if(call?.name!=='repo.prepareWrite'||envelope?.type!=='AGENT_TOOL_RESULT')return null;
 const item=Array.isArray(envelope.observations)&&envelope.observations.length===1?envelope.observations[0]:null;
 const data=item?.data,hash=s=>/^[a-f0-9]{64}$/iu.test(String(s||''));
 if(item?.tool!=='repo.prepareWrite'||item.ok!==true||item.executionOk!==true||
    data?.ok!==true||data?.status!=='WRITE_PREPARED'||data?.executionOk!==true||
    data?.requiresApproval!==true||data?.objectiveSatisfied!==false||
    data?.written!==false||data?.verified!==false||
    data?.file!==call.args?.file||call.args.matchCount!==1||
    data?.objectiveId!==sessionContext.objectiveId||
    data?.caseId!==sessionContext.caseId||
    !String(data.caseId||'').startsWith('general-')||
    !String(data.objectiveId||'').startsWith('QWEN_PREVIEW_general-')||
    !hash(data.fingerprint)||!hash(data.snapshotSha256)||!hash(data.expectedSha256)||
    data.snapshotSha256===data.expectedSha256||
    !String(data.approvalCommand||'').endsWith(data.fingerprint))return null;
 return {...data,ok:true,executionOk:true,blocked:false,
    objectiveSatisfied:false,requiresApproval:true,requiresHumanApproval:true,
    written:false,verified:false,preparedPreviewOnly:true};
}
// Adapter for an opt-in, read-only pilot. It deliberately reuses the existing
// ToolsBridge executor and requires explicit trusted browser-session validation.
// No standalone Firebase, admin SDK, anonymous account, service key or
// permission shortcut may be supplied by Qwen.
export function createQwenAuthenticatedToolBridge({
    toolRuntime, toolsBridge, sessionContext,
    validateAuthenticatedContext, verifyObjectives, hostToolPolicy=null
}={}){
    if(typeof toolRuntime?.list!=='function'||
        typeof toolsBridge?.executeMany!=='function'||
        typeof validateAuthenticatedContext!=='function'||
        typeof verifyObjectives!=='function'){
        throw new Error('QWEN_DIRECT_EXISTING_RUNTIME_REQUIRED');
    }
    const catalog=toolRuntime.list().filter(tool=>
        typeof tool?.name==='string' && (hostToolPolicy ? hostToolPolicy.accept(tool) :
        tool.name!=='conversation.respond' && tool.investigationReadOnly===true &&
        tool.mutates!==true && tool.requiresApproval!==true && tool.userArtifact!==true));
    if(!catalog.length)throw new Error('QWEN_DIRECT_READ_ONLY_CATALOG_EMPTY');
    const byName=new Map(catalog.map(tool=>[tool.name,tool]));
    let missionIdentity=null;
    const getSession=async(signal)=>{
        signal?.throwIfAborted?.();
        const result=await validateAuthenticatedContext(sessionContext,{signal});
        if(result?.ok!==true || !result.principalId ||
            !result.tenantId || !result.role){
            throw new Error('QWEN_DIRECT_AUTHENTICATED_SESSION_REQUIRED');
        }
        const key=JSON.stringify([result.principalId,result.tenantId,result.role]);
        if(missionIdentity!==null&&missionIdentity!==key)throw new Error('QWEN_DIRECT_MISSION_SESSION_CHANGED');
        missionIdentity=key;
        return result;
    };
    const authorizeRead=async ({call,receipts=[],signal})=>{
            const definition=byName.get(call?.name);
            if(!definition)return {ok:false,reason:'TOOL_NOT_READ_ONLY_REGISTERED'};
            const hostPermission=hostToolPolicy?.authorize(call,receipts)||{ok:true,approved:false};
            if(hostPermission.ok!==true)return hostPermission;
            let identity;
            try{identity=await getSession(signal);}
            catch{return {ok:false,reason:'AUTHENTICATED_SESSION_INVALID'};}
            const missing=unmetMissionEvidenceRequirements(call,receipts,catalog);
            if(missing.length)return {ok:false,reason:'INDEPENDENT_EVIDENCE_PREREQUISITE_REQUIRED'};
            // A read of *some* file is insufficient when the next query
            // requests a specific sourceFile or collection. Bind its exact
            // argument to the verified predecessor's observed value.
            const requestedEvidence=(definition.requiresEvidence||[])
                .filter(requirement=>requirement?.argument &&
                    call.args?.[requirement.argument]!==undefined);
            for(const requirement of requestedEvidence){
                const proposed=call.args[requirement.argument];
                if(typeof proposed!=='string')return {ok:false,reason:'EVIDENCE_ARGUMENT_TYPE_INVALID'};
                const warranted=receipts.some(receipt=>{
                    const producer=byName.get(receipt.name);
                    if(!receipt.ok || !producer?.evidenceKinds?.includes(requirement.kind))
                        return false;
                    let value=receipt.observation;
                    for(const key of requirement.observationPath||[]){
                        if(!value||typeof value!=='object'||
                            !Object.hasOwn(value,key))return false;
                        value=value[key];
                    }
                    const values=Array.isArray(value)?value:[value];
                    return values.some(item=>item===proposed);
                });
                if(!warranted)return {ok:false,reason:'EXACT_SOURCE_EVIDENCE_BINDING_REQUIRED'};
            }
            return {ok:true,principalId:identity.principalId,
                tenantId:identity.tenantId,role:identity.role,approved:hostPermission.approved===true};
        };
    return {
        catalog,
        authorize:authorizeRead,
        async execute(call,{instruction,authorization,receipts=[],signal}={}){
            if(!byName.has(call?.name) || !authorization?.principalId ||
                !authorization.tenantId || !authorization.role){
                return {ok:false,executionOk:false,blocked:true,status:'UNAUTHORIZED'};
            }
            let fresh;
            try {fresh=await getSession(signal);}
            catch {return {ok:false,executionOk:false,blocked:true,status:'SESSION_CHANGED'};}
            if(fresh.principalId!==authorization.principalId ||
                fresh.tenantId!==authorization.tenantId ||
                fresh.role!==authorization.role){
                return {ok:false,executionOk:false,blocked:true,status:'SESSION_CHANGED'};
            }
            const check=await authorizeRead({call,receipts,signal});
            if(check.ok!==true || check.principalId!==fresh.principalId ||
                check.tenantId!==fresh.tenantId || check.role!==fresh.role){
                return {ok:false,executionOk:false,blocked:true,status:'EVIDENCE_OR_SESSION_INVALID'};
            }
            const advertising=hostToolPolicy&&receipts.some(r=>r.ok&&r.name==='advertising.research');
            let creativeSemanticReview=null;
            if(advertising&&['image.adapt','reel.create','speech.synthesize','page.create','document.create'].includes(call.name)){
                if(typeof sessionContext.qwenAdvertisingReview!=='function')return {ok:false,status:'ADVERTISING_SEMANTIC_REVIEW_REQUIRED'};
                const rawReview=await sessionContext.qwenAdvertisingReview({instruction,receipts,creative:{tool:call.name,args:call.args},signal});
                const priorResearch=acceptedAdvertisingResearch(receipts);
                creativeSemanticReview=mergeAdvertisingCreativeEvidence(rawReview,priorResearch);
                if(creativeSemanticReview?.verified!==true)return {ok:false,status:'ADVERTISING_CLAIMS_NOT_VERIFIED',creativeSemanticReview};
            }
            const result=await toolsBridge.executeMany([
                {name:call.name,args:call.args,approved:check.approved===true}
            ],{
                ...sessionContext,
                rawInput:instruction,tenantId:fresh.tenantId,
                userId:fresh.principalId,rootInstruction:instruction,
                writeAllowed:false,writeAuthorization:false,
                rol:fresh.role,approved:check.approved===true,readOnlyPilot:!hostToolPolicy,
                qwenDirectDecision:!!hostToolPolicy,
                canonicalEvidence:structuredClone(receipts).map(r=>({...r,tool:r.name,evidence:r.observation})),
                completedTasks:structuredClone(receipts),
                evidenceReceipts:structuredClone(receipts)
            });
            const normalizeRead=async data=>{
                const payload=structuredClone(data);
                if(creativeSemanticReview)payload.creativeSemanticReview=creativeSemanticReview;
                if(advertising&&call.name==='browser.inspect'&&payload.ok&&payload.dom&&typeof sessionContext.qwenAdvertisingReview==='function'){
                    const combined=[...receipts,{name:call.name,args:call.args,ok:true,observation:payload}];
                    const currentResearch=combined.findLast(r=>r.ok&&r.name==='advertising.research');
                    const urls=new Set(currentResearch?.observation?.sources?.map(s=>s.url));
                    if(new Set(combined.filter(r=>r.ok&&r.name==='browser.inspect'&&urls.has(r.observation.url)).map(r=>r.observation.url)).size>=2)
                        payload.advertisingSemanticReview=await sessionContext.qwenAdvertisingReview({instruction,receipts:combined,signal});
                }
                if(hostToolPolicy&&['page.create','document.create'].includes(call.name)){
                    if(payload.output!==call.args.output||!hostToolPolicy.ownPath(payload.output))
                        return {ok:false,status:'ARTIFACT_RESULT_SCOPE_INVALID'};
                    if(call.name==='page.create')payload.url=hostToolPolicy.preview(payload.output);
                }
                if(hostToolPolicy&&['speech.synthesize','reel.create','image.adapt'].includes(call.name)){
                    const outputs=call.name==='image.adapt'?payload.outputs:[payload];
                    if(!outputs?.length||outputs.some(o=>!hostToolPolicy.ownPath(o.output)))return {ok:false,status:'MEDIA_RESULT_SCOPE_INVALID'};
                    if(call.name!=='image.adapt'&&payload.output!==call.args.output)return {ok:false,status:'MEDIA_RESULT_SCOPE_INVALID'};
                }
                if(hostToolPolicy&&call.name==='browser.screenshot'){
                    if(payload.output!==call.args.output||payload.artifact?.file!==call.args.output||!hostToolPolicy.ownPath(payload.output))return {ok:false,status:'SCREENSHOT_RESULT_SCOPE_INVALID'};
                    payload.sha256=payload.artifact.sha256;
                }
                if(call.name==='repo.read'&&!payload.verifiedRead){
                    const normalized=normalizeJarvisMissionObservation(payload);
                    if(normalized.ok!==true||!normalized.verifiedRead||normalized.verifiedRead.file!==call.args.file)
                        return {ok:false,executionOk:false,blocked:true,status:'READ_SOURCE_RECEIPT_INVALID'};
                    payload.verifiedRead=normalized.verifiedRead;
                }
                return payload;
            };
            const observation=Array.isArray(result)?result[0]:null;
            // WRITE_PREPARED is a completed preview receipt, not a completed
            // repair and never permission to execute repo.write.
            if(hostToolPolicy&&call.name==='repo.prepareWrite'){
                const prepared=verifiedNonMutatingPreviewEnvelope(observation,call,sessionContext);
                if(prepared)return prepared;
            }
            if(!observation || observation.ok!==true || observation.blocked===true ||
                observation.executionOk===false || observation.requiresInput===true){
                return {ok:false,executionOk:false,blocked:true,
                    status:String(observation?.status||'READ_TOOL_REJECTED'),
                    error:observation?.error||null};
            }
            // ToolsBridge returns an AGENT_TOOL_RESULT envelope; prerequisites
            // and platform.query consume the original runtime payload, not the
            // presentation wrapper. Never unwrap a failed/mismatched result.
            if(observation.type==='AGENT_TOOL_RESULT'){
                const items=observation.observations;
                const item=Array.isArray(items)&&items.length===1?items[0]:null;
                const data=item?.data;
                if(item?.tool!==call.name || item.ok!==true ||
                    item.executionOk===false || item.blocked===true ||
                    item.requiresInput===true || data?.ok!==true ||
                    data.executionOk===false || data.blocked===true ||
                    data.requiresInput===true){
                    return {ok:false,executionOk:false,blocked:true,status:'READ_TOOL_RECEIPT_INVALID'};
                }
                return normalizeRead(data);
            }
            return normalizeRead(observation);
        },
        async verifyCompletion({instruction,receipts,proposedReport,signal}){
            const identity=await getSession(signal);
            return verifyObjectives({
                instruction,receipts,proposedReport,signal,
                principalId:identity.principalId,
                tenantId:identity.tenantId,role:identity.role
            });
        }
    };
}
