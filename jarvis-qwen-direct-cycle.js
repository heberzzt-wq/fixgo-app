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
    if(!args||Array.isArray(args)||typeof args!=='object')return 'TOOL_ARGUMENTS_REQUIRED';
    const schema=tool.inputSchema||{};
    const properties=schema.properties||{};
    for(const name of schema.required||[]){
        if(!Object.hasOwn(args,name))return 'REQUIRED_ARGUMENT_MISSING:'+name;
    }
    for(const [name,value] of Object.entries(args)){
        const rule=properties[name];
        if(schema.additionalProperties===false && !rule)return 'ARGUMENT_UNDECLARED:'+name;
        if(rule?.const!==undefined && value!==rule.const)return 'ARGUMENT_OUTSIDE_SCHEMA:'+name;
        if(Array.isArray(rule?.enum) && !rule.enum.some(option=>safeJson(canonical(option))===safeJson(canonical(value))))return 'ARGUMENT_OUTSIDE_SCHEMA:'+name;
        if(rule?.type==='string' && typeof value!=='string')return 'ARGUMENT_TYPE_INVALID:'+name;
        if(rule?.type==='array' && !Array.isArray(value))return 'ARGUMENT_TYPE_INVALID:'+name;
    }
    return null;
}

// selectNextAction is the sole model decision maker.
// authorize, execute and verifyCompletion MUST be implemented independently,
// using the authenticated user's real session, scope, and original receipts.
export async function runQwenDirectReadCycle({
    instruction='', catalog=[], repositoryMap=null,
    selectNextAction, authorize, execute, verifyCompletion,
    maximumSteps=8, signal, onProgress=()=>{},summarizeEvidence=null
}={}){
    if(typeof selectNextAction!=='function' || typeof authorize!=='function' ||
        typeof execute!=='function' || typeof verifyCompletion!=='function'){
        throw new Error('QWEN_DIRECT_INDEPENDENT_AUTHORITY_REQUIRED');
    }
    if(typeof instruction!=='string'||!instruction.trim())throw new Error('MISSION_INSTRUCTION_REQUIRED');
    const selected=readonlyCatalog(catalog);
    if(!selected.length)throw new Error('QWEN_DIRECT_READ_ONLY_TOOLS_REQUIRED');
    const steps=Math.max(1,Math.min(MAX_STEPS,Number(maximumSteps)||8));
    const receipts=[],forModel=[],seen=new Map();
    let modelDecisionCount=0;
    const decisions=[];
    const missionLedger=()=>({
        completedQueries:receipts.filter(r=>r.ok&&r.name==='platform.query').map(r=>({args:r.args,
            projection:r.observation.recordEvidence?.scope?.fields,
            returnedCount:r.observation.recordEvidence?.returnedCount,
            queryExhausted:r.observation.recordEvidence?.queryExhausted,
            nextCursor:r.observation.recordEvidence?.nextCursor})),
        errors:receipts.filter(r=>!r.ok).map(r=>({name:r.name,args:r.args,
            error:shortReceipt(r.observation).error||r.observation.reason})),
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
        onProgress({phase:'QWEN_DECISION',iteration,completed:receipts.length});
        modelDecisionCount+=1;
        const producedKinds=new Set(receipts.filter(receipt=>receipt.ok===true)
            .flatMap(receipt=>selected.find(tool=>tool.name===receipt.name)?.evidenceKinds||[]));
        const available=selected.filter(tool=>(tool.requiresEvidence||[])
            .every(requirement=>producedKinds.has(requirement.kind)));
        let decision;
        try{
            decision=await selectNextAction({
                instruction,repositoryMap,
                tools:available.map(tool=>({name:tool.name,description:tool.description,
                    inputSchema:tool.inputSchema,evidenceKinds:tool.evidenceKinds,requiresEvidence:tool.requiresEvidence})),
                observations:structuredClone(forModel),
                evidenceSummary:typeof summarizeEvidence==='function'
                    ? summarizeEvidence(structuredClone(receipts)):null,
                missionLedger:missionLedger(),iteration,signal
            });
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
            return done(independentlyVerified?'SUCCESS':'PARTIAL',
                independentlyVerified?'VERIFIED_COMPLETE':
                    certification?.ok===true?'NO_EXECUTED_EVIDENCE':'OBJECTIVES_NOT_VERIFIED',
                independentlyVerified?String(decision.report||''):'',
                certification||null);
        }
        const call=decision?.toolCall;
        const tool=selected.find(item=>item.name===call?.name);
        if(!tool)return done('PARTIAL','UNKNOWN_OR_UNAUTHORIZED_TOOL');
        const argumentError=invalidArguments(tool,call.args);
        if(argumentError)return done('PARTIAL',argumentError);
        const signature=safeJson([tool.name,canonical(call.args)]);
        if(!signature)return done('PARTIAL','UNSERIALIZABLE_TOOL_CALL');
        const previous=seen.get(signature),evidenceCount=receipts.filter(receipt=>receipt.ok===true).length;
        if(previous && !(previous.schemaFailure===true && previous.evidenceCount<evidenceCount && previous.retries<1))
            return done('PARTIAL','REPEATED_TOOL_CALL');
        const attempt={evidenceCount,retries:previous?previous.retries+1:0,schemaFailure:false};
        seen.set(signature,attempt);
        const invocation={name:tool.name,args:structuredClone(call.args)};
        let authorization;
        try{
            authorization=await authorize({instruction,tool:structuredClone(tool),
                call:structuredClone(invocation),receipts:structuredClone(receipts),signal});
        }catch{return done('PARTIAL','INDEPENDENT_AUTHORIZATION_FAILED');}
        if(authorization?.ok!==true){
            receipts.push({name:tool.name,args:invocation.args,ok:false,
                observation:{blocked:true,status:'UNAUTHORIZED',
                    reason:String(authorization?.reason||'NOT_AUTHORIZED')}});
            return done('PARTIAL','INDEPENDENT_AUTHORIZATION_DENIED');
        }
        onProgress({phase:'TOOL_EXECUTION',iteration,name:tool.name});
        let observation;
        try{
            observation=await execute(invocation,{
                instruction,signal,receipts:structuredClone(receipts),
                authorization:structuredClone(authorization)
            });
        }catch(error){
            return done('PARTIAL','READ_TOOL_EXECUTION_FAILED');
        }
        const successful=observation?.ok===true && observation.executionOk!==false &&
            observation.blocked!==true && observation.requiresInput!==true;
        receipts.push({name:tool.name,args:invocation.args,ok:successful,
            observation:structuredClone(observation)});
        forModel.push({name:tool.name,args:invocation.args,ok:successful,
            observation:shortReceipt(observation,selected.find(t=>t.name==='platform.query')?.inputSchema?.properties?.fields?.items?.enum)});
        if(!successful){
            const code=observation?.error?.context?.runtimeResult?.error?.code || observation?.error?.code;
            // Only pre-read schema validation may return to Qwen for a different
            // bounded action. Auth, permissions and execution failures still stop.
            if(['PLATFORM_QUERY_FIELD_NOT_DISCOVERED','PLATFORM_QUERY_FILTER_FIELD_NOT_DISCOVERED',
                'PLATFORM_QUERY_ORDER_FIELD_NOT_DISCOVERED'].includes(code)){attempt.schemaFailure=true;continue;}
            return done('PARTIAL','READ_TOOL_NOT_SUCCESSFUL');
        }
    }
    return done('PARTIAL','STEP_LIMIT_REACHED');
}
