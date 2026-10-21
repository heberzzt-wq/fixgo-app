import {validateOfferedArguments} from './jarvis-qwen-argument-schema.js';
// Prototype for an optional local-Qwen read-only mission loop.
// This module is not wired to production. It cannot grant permissions or
// certify success: those decisions are mandatory independent host callbacks.
export const QWEN_DIRECT_READ_CYCLE_VERSION='v142-readonly-pilot-1';

const MAX_RECEIPT_CHARS=4096;
const MAX_STEPS=12;

const safeJson=value=>{
    try{return JSON.stringify(value);}catch{return null;}
};
const canonical=value=>Array.isArray(value)?value.map(canonical):
    value&&typeof value==='object'?Object.fromEntries(
        Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;

function shortReceipt(observation,fieldAllowlist=null){
    const failure=observation?.error?.context?.runtimeResult?.error||observation?.error;
    if(observation?.ok!==true&&failure)return {ok:false,status:observation?.status,
        error:{code:failure.code,details:failure.details}};
    const raw=safeJson(observation);
    if(raw!==null && raw.length<=MAX_RECEIPT_CHARS)return observation;
    const source=observation&&typeof observation==='object'?observation:{};
    // Keep actionable provenance when a source or record page exceeds the
    // model budget. Full originals remain in receipts for authorization/audit.
    if(source.tool==='repo.search' && Array.isArray(source.results)){
        const results=source.results.slice(0,12).map(item=>({file:item.file,score:item.score}));
        const excerpt={ok:source.ok===true,status:source.status,tool:source.tool,
            query:source.query,results,totalResults:source.totalResults,
            repositoryTarget:source.repositoryTarget,observationTruncated:true,
            warning:'Navigation candidates only; read the actual file before querying records.'};
        if((safeJson(excerpt)||'').length<=MAX_RECEIPT_CHARS)return excerpt;
    }
    const read=source.verifiedRead;
    if(read?.file&&read.sourceStructure?.dataBindings){
        const bindings=read.sourceStructure.dataBindings;
        const shapes=[...(bindings.writeShapes||[]),...(bindings.queryShapes||[])];
        const collections=[...new Set(shapes.map(s=>s.collection))];
        const excerpt={ok:source.ok===true,status:source.status,observationTruncated:true,
            verifiedRead:{file:read.file,
                partial:true,sourceStructure:{dataBindings:{source:bindings.source,
                    collections:(bindings.collections||[]).slice(0,15),
                    writeShapes:collections.map(collection=>({collection,fields:[...new Set(shapes.filter(s=>s.collection===collection).flatMap(s=>s.fields||[]))].filter(f=>!fieldAllowlist||fieldAllowlist.includes(f))}))}}}};
        if((safeJson(excerpt)||'').length<=MAX_RECEIPT_CHARS)return excerpt;
    }
    const records=source.recordEvidence;
    if(records?.fieldSchema){
        const excerpt={ok:source.ok===true,status:source.status,observationTruncated:true,
            recordEvidence:{source:records.source,scope:records.scope,
                fieldSchema:{source:records.fieldSchema.source,collection:records.fieldSchema.collection,paths:records.fieldSchema.paths.filter(f=>!fieldAllowlist||fieldAllowlist.includes(f)),
                    completeForObservedRows:false},hasMore:records.hasMore,nextCursor:records.nextCursor},
            warning:'Rows omitted from model context; field names are discovery only. Independent audit retains the full original page.'};
        if((safeJson(excerpt)||'').length<=MAX_RECEIPT_CHARS)return excerpt;
    }
    const important=['ok','status','executionOk','blocked','error','reason',
        'count','total','hasMore','queryExhausted','verifiedRead',
        'recordEvidence','scope','sourceFile','collection','query',
        'validationFailures','requiresInput'];
    const value=Object.fromEntries(important.filter(key=>Object.hasOwn(source,key))
        .map(key=>[key,source[key]]));
    const compact={ ...value, observationTruncated:true,
        originalChars:raw?.length??null,
        warning:'Partial model context only. Consult the original validated receipt before asserting complete population coverage.' };
    if((safeJson(compact)||'').length<=MAX_RECEIPT_CHARS)return compact;
    // Never claim that this stripped excerpt establishes data completeness.
    return {ok:source.ok===true,blocked:source.blocked===true,
        status:String(source.status||'').slice(0,120),
        count:Number.isFinite(source.count)?source.count:null,
        observationTruncated:true,originalChars:raw?.length??null,
        warning:'Oversized evidence omitted from model context; full original receipt is retained for independent certification.'};
}

function readonlyCatalog(catalog){
    return (Array.isArray(catalog)?catalog:[]).filter(tool=>
        typeof tool?.name==='string' && tool.name &&
        tool.investigationReadOnly===true && tool.mutates!==true &&
        tool.requiresApproval!==true && tool.userArtifact!==true)
        .map(tool=>({...tool}));
}

function invalidArguments(tool,args){
    return validateOfferedArguments(tool.inputSchema,args);
}

// selectNextAction is the sole model decision maker.
// authorize, execute and verifyCompletion MUST be implemented independently,
// using the authenticated user's real session, scope, and original receipts.
export function runQwenDirectReadCycle(options={}){
    return runQwenAuthorizedCycle({...options,stepLimit:MAX_STEPS,catalog:readonlyCatalog(options.catalog)});
}
export async function runQwenAuthorizedCycle({
    instruction='', catalog=[], repositoryMap=null,
    selectNextAction, authorize, execute, verifyCompletion,
    maximumSteps=8, stepLimit=MAX_STEPS, signal, onProgress=()=>{},summarizeEvidence=null,compactObservation=null,repairIncomplete=false,catalogForEvidence=null,initialReceipts=[],requireFinalReport=false
}={}){
    if(typeof selectNextAction!=='function' || typeof authorize!=='function' ||
        typeof execute!=='function' || typeof verifyCompletion!=='function'){
        throw new Error('QWEN_DIRECT_INDEPENDENT_AUTHORITY_REQUIRED');
    }
    if(typeof instruction!=='string'||!instruction.trim())throw new Error('MISSION_INSTRUCTION_REQUIRED');
    const selected=catalog.map(tool=>({...tool}));
    if(!selected.length)throw new Error('QWEN_DIRECT_READ_ONLY_TOOLS_REQUIRED');
    const steps=Math.max(1,Math.min(96,Number(stepLimit)||MAX_STEPS,Number(maximumSteps)||8));
    if(!Array.isArray(initialReceipts)||initialReceipts.some(r=>!r||r.ok!==true||typeof r.name!=='string'||!r.args||r.observation?.ok!==true))throw Error('QWEN_RESUME_RECEIPTS_NOT_VERIFIED');
    const receipts=structuredClone(initialReceipts),forModel=[],seen=new Map();
    for(const r of receipts){const signature=safeJson([r.name,canonical(r.args)]);if(!signature||seen.has(signature))throw Error('QWEN_RESUME_REPEATED_RECEIPT');seen.set(signature,{evidenceCount:receipts.length,retries:0,schemaFailure:false});}
    forModel.push(...receipts.slice(-12).map(r=>({name:r.name,args:r.args,ok:true,observation:typeof compactObservation==='function'?compactObservation(r.observation):shortReceipt(r.observation)})));
    let modelDecisionCount=0;
    let lastUsefulStep=0;
    const decisions=[],certificationFailures=[];
    let lastFailedFinish=null;
    const rejectedToolChoices=[];
    const missionLedger=()=>({
        ...(repairIncomplete?{completedCalls:receipts.filter(r=>r.ok).map(r=>({name:r.name,args:r.args})),certificationFailures}:{}),
        completedQueries:receipts.filter(r=>r.ok&&r.name==='platform.query').map(r=>({args:r.args,
            projection:r.observation.recordEvidence?.scope?.fields,
            returnedCount:r.observation.recordEvidence?.returnedCount,
            queryExhausted:r.observation.recordEvidence?.queryExhausted,
            nextCursor:r.observation.recordEvidence?.nextCursor})),
        errors:receipts.filter(r=>!r.ok).map(r=>({name:r.name,args:r.args,
            error:shortReceipt(r.observation).error||r.observation.reason})),
        rejectedToolChoices:rejectedToolChoices.slice(-2),
        completedSources:receipts.filter(r=>r.ok&&r.name==='repo.read').map(r=>r.args.file),
        rule:'An exhausted query is not a completed mission. Never repeat a successful call. Correct grounding before retrying a failed call.'
    });
    const done=(status,reason,report='',certification=null)=>({
        status,reason,report,certification,receipts,decisions,missionLedger:missionLedger(),
        modelDecisions:modelDecisionCount,
        completedReadCalls:receipts.filter(x=>x.ok).length
    });
    for(let iteration=0;iteration<steps;iteration++){
        if(signal?.aborted)return done('CANCELLED','SIGNAL_ABORTED');
        if(repairIncomplete&&iteration-lastUsefulStep>=14)return done('PARTIAL','NO_USEFUL_PROGRESS');
        const evidenceSummary=typeof summarizeEvidence==='function'?summarizeEvidence(structuredClone(receipts)):null;
        if(evidenceSummary?.blockedReason)return {...done('PARTIAL',evidenceSummary.blockedReason),preflight:evidenceSummary.preflight};
        onProgress({phase:'QWEN_DECISION',iteration,completed:receipts.length});
        const producedKinds=new Set(receipts.filter(receipt=>receipt.ok===true)
            .flatMap(receipt=>selected.find(tool=>tool.name===receipt.name)?.evidenceKinds||[]));
        const available=selected.filter(tool=>(tool.requiresEvidence||[])
            .every(requirement=>producedKinds.has(requirement.kind)));
        // The offered dynamic catalog is the host's execution boundary, not
        // just a hint to the model. It may be stricter than the static catalog.
        const offered=catalogForEvidence?catalogForEvidence(available,structuredClone(receipts)):available;
        if(!offered.length){
            // Engineering deliverables must contain a source-anchored written
            // report from Qwen. Physical tool receipts alone are insufficient.
            if(requireFinalReport){
                for(let reportAttempt=0;reportAttempt<3;reportAttempt++){
                let summaryDecision;
                try{
                    modelDecisionCount++;
                    summaryDecision=await selectNextAction({
                        instruction,repositoryMap,tools:[],observations:structuredClone(forModel.slice(-12)),
                        // Allow a report-only model turn even when some audited
                        // objectives remain missing. The verifier (not Qwen)
                        // still decides success, and keeps missing gaps.
                        evidenceSummary:{...evidenceSummary,finishEligible:true,reportOnly:true,
                            reportRevisionAttempt:reportAttempt,
                            reportRevisionInstruction:reportAttempt>0?'Previous final report failed independent source-bound verification. Correct only the rejected claims using verified source excerpts and the exact tests.run receipt; do not invent tests or files.':undefined,
                            unverifiedObjectives:evidenceSummary?.deliveryGaps||[]},
                        missionLedger:missionLedger(),iteration,signal
                    });
                }catch{return done('PARTIAL','ENGINEERING_FINAL_REPORT_UNAVAILABLE');}
                if(summaryDecision?.finish!==true||typeof summaryDecision.report!=='string'||
                    !summaryDecision.report.trim())return done('PARTIAL','ENGINEERING_FINAL_REPORT_REQUIRED');
                decisions.push(structuredClone(summaryDecision));
                let certification;
                try{
                    certification=await verifyCompletion({
                        instruction,receipts:structuredClone(receipts),
                        proposedReport:summaryDecision.report,signal
                    });
                }catch{return done('PARTIAL','INDEPENDENT_CERTIFICATION_FAILED');}
                const independentlyVerified=certification?.ok===true&&receipts.some(r=>r.ok===true);
                const failed=certification?.objectives?.filter(x=>x.satisfied!==true)||[];
                const reportOnlyFailure=failed.length>0&&failed.every(x=>x.reason==='ENGINEERING_SOURCE_BOUND_REPORT_REQUIRED');
                if(!independentlyVerified&&repairIncomplete&&reportAttempt<2&&reportOnlyFailure){
                    certificationFailures.push({reason:'ENGINEERING_SOURCE_BOUND_REPORT_REQUIRED',objectives:failed});
                    continue;
                }
                return done(independentlyVerified?'SUCCESS':'PARTIAL',
                    independentlyVerified?'VERIFIED_COMPLETE':certification?.reason||'ENGINEERING_REPORT_NOT_CERTIFIED',
                    independentlyVerified?summaryDecision.report:'',certification||null);
                }
                return done('PARTIAL','ENGINEERING_SOURCE_BOUND_REPORT_REQUIRED');
            }
            // An exhausted catalog is a request to the independent verifier,
            // never proof that the mission succeeded or permission to make up a receipt.
            let certification;
            try{
                certification=await verifyCompletion({
                    instruction,receipts:structuredClone(receipts),proposedReport:'',
                    signal
                });
            }catch(error){
                return done('PARTIAL','INDEPENDENT_CERTIFICATION_FAILED');
            }
            const independentlyVerified=certification?.ok===true&&receipts.some(r=>r.ok===true);
            return done(independentlyVerified?'SUCCESS':'PARTIAL',
                independentlyVerified?'VERIFIED_COMPLETE':
                    certification?.reason||evidenceSummary?.deliveryGaps?.[0]?.reason||'OBJECTIVES_NOT_VERIFIED',
                independentlyVerified?'Comprobación independiente completada a partir de los recibos físicos verificados.':'',
                certification||null);
        }
        // The host can execute only wholly specified, dynamically offered
        // office steps without another model inference. Authorization and
        // physical verification below are unchanged.
        const single=offered.length===1?offered[0]:null;
        const required=single?.inputSchema?.required||[];
        const fields=single?.inputSchema?.properties||{};
        const deterministic=!!catalogForEvidence&&single&&
            ['document.create','artifact.read','media.library'].includes(single.name)&&
            required.length>0&&required.every(k=>Object.hasOwn(fields,k)&&Object.hasOwn(fields[k]||{},'const'));
        let decision;
        try{
            if(deterministic)decision={toolCall:{name:single.name,args:Object.fromEntries(required.map(k=>[k,structuredClone(fields[k].const)]))},hostBound:true};
            else {modelDecisionCount+=1;decision=await selectNextAction({
                instruction,repositoryMap,
                tools:offered.map(tool=>{const schema=structuredClone(tool.inputSchema);
                    const hostDocument=tool.name==='document.create'&&typeof schema?.properties?.content?.const==='string';
                    const hostSheets=tool.name==='document.create'&&Array.isArray(schema?.properties?.sheets?.const);
                    if(hostDocument||hostSheets){
                        const hostFields=[...(hostDocument?['content']:[]),...(hostSheets?['sheets']:[])];
                        for(const field of hostFields)delete schema.properties[field];
                        schema.required=(schema.required||[]).filter(x=>!hostFields.includes(x));
                    }
                    return {name:tool.name,description:hostDocument||hostSheets?'El contenido o las hojas se incorporan desde datos y recibos físicos verificados por el host. Selecciona solamente los demás argumentos; NO envíes content ni sheets.':tool.description,
                    inputSchema:schema,evidenceKinds:tool.evidenceKinds,requiresEvidence:tool.requiresEvidence};}),
                observations:structuredClone(forModel.slice(-12)),
                evidenceSummary,
                missionLedger:missionLedger(),iteration,signal
            });}
        }catch(error){
            return {...done('PARTIAL','MODEL_UNAVAILABLE'),failureCode:
                /^(?:LOCAL_QWEN|QWEN)_[A-Z0-9_]+$/.test(String(error?.message||''))?error.message:'MODEL_DECISION_FAILED'};
        }
        if(signal?.aborted)return done('CANCELLED','SIGNAL_ABORTED');
        decisions.push(structuredClone(decision));
        if(decision?.finish===true){
            let certification;
            try{
                certification=await verifyCompletion({
                    instruction,receipts:structuredClone(receipts),
                    proposedReport:typeof decision.report==='string'?decision.report:'',
                    signal
                });
            }catch(error){
                return done('PARTIAL','INDEPENDENT_CERTIFICATION_FAILED');
            }
            const independentlyVerified=certification?.ok===true&&
                receipts.some(receipt=>receipt.ok===true);
            if(repairIncomplete&&!independentlyVerified){
                const signature=safeJson([receipts.length,decision.report]);
                if(lastFailedFinish!==signature&&certificationFailures.length<3){
                    lastFailedFinish=signature;certificationFailures.push({reason:certification?.reason,objectives:certification?.objectives});continue;
                }
            }
            return done(independentlyVerified?'SUCCESS':'PARTIAL',
                independentlyVerified?'VERIFIED_COMPLETE':
                    certification?.ok===true?'NO_EXECUTED_EVIDENCE':'OBJECTIVES_NOT_VERIFIED',
                independentlyVerified?String(decision.report||''):'',
                certification||null);
        }
        const call=decision?.toolCall?structuredClone(decision.toolCall):null;
        const tool=(catalogForEvidence?offered:selected).find(item=>item.name===call?.name);
        const hostContent=tool?.name==='document.create'?tool.inputSchema?.properties?.content?.const:null;
        const hostSheets=tool?.name==='document.create'?tool.inputSchema?.properties?.sheets?.const:null;
        if((typeof hostContent==='string'||Array.isArray(hostSheets))&&call){
            if(!call.args||typeof call.args!=='object'||Array.isArray(call.args))return done('PARTIAL','DOCUMENT_HOST_ARGUMENTS_INVALID');
            if(typeof hostContent==='string'){
                if(Object.hasOwn(call.args,'content')&&call.args.content!==hostContent)return done('PARTIAL','DOCUMENT_CONTENT_HOST_MISMATCH');
                call.args.content=hostContent;
            }
            if(Array.isArray(hostSheets)){
                if(Object.hasOwn(call.args,'sheets')&&safeJson(call.args.sheets)!==safeJson(hostSheets))return done('PARTIAL','DOCUMENT_HOST_SHEETS_MISMATCH');
                call.args.sheets=structuredClone(hostSheets);
            }
        }
        if(!tool){
            // One bounded opportunity to correct an out-of-catalog choice;
            // never authorize or execute the hallucinated tool.
            if(catalogForEvidence&&repairIncomplete&&rejectedToolChoices.length<2){
                rejectedToolChoices.push({name:String(call?.name||''),reason:'TOOL_NOT_OFFERED_IN_CURRENT_STEP',
                    allowed:offered.map(t=>t.name)});
                continue;
            }
            return done('PARTIAL',catalogForEvidence?'TOOL_NOT_OFFERED_IN_CURRENT_STEP':'UNKNOWN_OR_UNAUTHORIZED_TOOL');
        }
        if(!selected.some(item=>item.name===tool.name))return done('PARTIAL','UNKNOWN_OR_UNAUTHORIZED_TOOL');
        const argumentError=invalidArguments(tool,call.args);
        if(argumentError){
            // The old executor only checked top-level properties and let
            // nested false claims reach authorization. Give one bounded
            // schema-specific correction before stopping, with zero execution.
            const fixes=rejectedToolChoices.filter(x=>x.reason.startsWith('SCHEMA_ARGUMENT:')).length;
            if(catalogForEvidence&&repairIncomplete&&fixes<1){
                const violation={name:tool.name,reason:'SCHEMA_ARGUMENT:'+argumentError,
                    allowed:offered.map(t=>t.name)};
                rejectedToolChoices.push(violation);
                forModel.push({name:tool.name,args:call.args,ok:false,
                    observation:{status:'SCHEMA_ARGUMENT_REJECTED',error:argumentError,
                    warning:'Follow the currently offered tool schema. The rejected action was NOT executed.'}});
                continue;
            }
            return done('PARTIAL',argumentError);
        }
        const signature=safeJson([tool.name,canonical(call.args)]);
        if(!signature)return done('PARTIAL','UNSERIALIZABLE_TOOL_CALL');
        const previous=seen.get(signature),evidenceCount=receipts.filter(receipt=>receipt.ok===true).length;
        if(previous && !(previous.schemaFailure===true && previous.evidenceCount<evidenceCount && previous.retries<1)){
            // Feedback only: never execute the same successful action again.
            // Give Qwen a bounded chance to select an unmet action instead of
            // immediately aborting after it reuses a stale research query.
            const repeats=rejectedToolChoices.filter(c=>c.reason==='REPEATED_TOOL_CALL').length;
            if(repairIncomplete&&catalogForEvidence&&repeats<2){
                rejectedToolChoices.push({name:tool.name,reason:'REPEATED_TOOL_CALL',args:call.args,
                    allowed:offered.map(x=>x.name),warning:'Already completed. Choose different arguments or a different required tool.'});
                forModel.push({name:tool.name,args:call.args,ok:false,
                    observation:{status:'REPEATED_TOOL_CALL_REJECTED',warning:'No tool executed; this call was already completed.'}});
                continue;
            }
            return done('PARTIAL','REPEATED_TOOL_CALL');
        }
        const attempt={evidenceCount,retries:previous?previous.retries+1:0,schemaFailure:false};
        seen.set(signature,attempt);
        const invocation={name:tool.name,args:structuredClone(call.args)};
        let authorization;
        try{
            authorization=await authorize({instruction,tool:structuredClone(tool),
                call:structuredClone(invocation),receipts:structuredClone(receipts),signal});
        }catch{return done('PARTIAL','INDEPENDENT_AUTHORIZATION_FAILED');}
        if(authorization?.ok!==true){
            const reason=String(authorization?.reason||'NOT_AUTHORIZED');
            const refusal={name:tool.name,args:invocation.args,ok:false,
                observation:{blocked:true,status:'UNAUTHORIZED',reason}};
            receipts.push(refusal);
            // These are recoverable creative argument mistakes, not permissions.
            // Still deny the call and enforce repeat limits; never render it.
            const recoverable=repairIncomplete&&['REDUNDANT_ADVERTISING_COPY',
                'VERIFIED_CONTACT_REQUIRED','VARIANT_DIMENSIONS_MISMATCH',
                'ADVERTISING_RESEARCH_CLIENT_BRAND_QUERY_FORBIDDEN'].includes(reason)&&
                receipts.filter(r=>!r.ok&&r.observation?.status==='UNAUTHORIZED').length<=2;
            if(recoverable){
                forModel.push(refusal);
                continue;
            }
            return done('PARTIAL','INDEPENDENT_AUTHORIZATION_DENIED');
        }
        onProgress({phase:'TOOL_EXECUTION',iteration,name:tool.name,tool:tool.name,state:'active',executionId:'qwen-'+iteration});
        let observation;
        try{
            observation=await execute(invocation,{
                instruction,signal,receipts:structuredClone(receipts),
                authorization:structuredClone(authorization)
            });
        }catch(error){
            const code=/^(?:ADVERTISING_SEMANTIC|LOCAL_QWEN)_[A-Z0-9_]+$/.test(String(error?.message||''))?error.message:'READ_TOOL_EXECUTION_FAILED';
            receipts.push({name:tool.name,args:invocation.args,ok:false,observation:{ok:false,status:code,error:{code}}});
            onProgress({phase:'TOOL_RESULT',iteration,name:tool.name,tool:tool.name,state:'failed',executionId:'qwen-'+iteration});
            return done('PARTIAL','READ_TOOL_EXECUTION_FAILED');
        }
        const successful=observation?.ok===true && observation.executionOk!==false &&
            observation.blocked!==true && observation.requiresInput!==true &&
            (tool.name!=='tests.run'||observation.testsPassed===true&&observation.objectiveSatisfied===true);
        receipts.push({name:tool.name,args:invocation.args,ok:successful,
            observation:structuredClone(observation)});
        onProgress({phase:'TOOL_RESULT',iteration,name:tool.name,tool:tool.name,state:successful?'completed':'failed',executionId:'qwen-'+iteration});
        forModel.push({name:tool.name,args:invocation.args,ok:successful,
            observation:typeof compactObservation==='function'?compactObservation(observation):shortReceipt(observation,selected.find(t=>t.name==='platform.query')?.inputSchema?.properties?.fields?.items?.enum)});
        if(successful)lastUsefulStep=iteration+1;
        if(!successful){
            if(repairIncomplete&&tool.name==='media.analyze'&&observation?.status==='LOCAL_VIDEO_REVIEW_FAILED'){
                if(receipts.filter(r=>r.name==='media.analyze'&&r.observation?.status==='LOCAL_VIDEO_REVIEW_FAILED').length===1)continue;
                return done('PARTIAL','LOCAL_VIDEO_REPAIR_EXHAUSTED');
            }
            // This host preflight runs before any write. Corrected text may be
            // proposed within the same step budget; identical calls remain guarded.
            if(observation?.status==='ADVERTISING_CLAIMS_NOT_VERIFIED'&&observation?.creativeSemanticReview?.reviewExecuted===true){continue;}
            const code=observation?.error?.context?.runtimeResult?.error?.code || observation?.error?.code;
            // Only pre-read schema validation may return to Qwen for a different
            // bounded action. Auth, permissions and execution failures still stop.
            if(['PLATFORM_QUERY_FIELD_NOT_DISCOVERED','PLATFORM_QUERY_FILTER_FIELD_NOT_DISCOVERED',
                'PLATFORM_QUERY_ORDER_FIELD_NOT_DISCOVERED'].includes(code)){attempt.schemaFailure=true;continue;}
            return done('PARTIAL',tool.name==='tests.run'?'CODE_TESTS_NOT_PASSING':'READ_TOOL_NOT_SUCCESSFUL');
        }
    }
    return done('PARTIAL','STEP_LIMIT_REACHED');
}
