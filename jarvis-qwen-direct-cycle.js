// Prototype for an optional local-Qwen read-only mission loop.
// This module is not wired to production. It cannot grant permissions or
// certify success: those decisions are mandatory independent host callbacks.
export const QWEN_DIRECT_READ_CYCLE_VERSION='v142-readonly-pilot-1';

const MAX_RECEIPT_CHARS=3500;
const MAX_STEPS=12;

const safeJson=value=>{
    try{return JSON.stringify(value);}catch{return null;}
};
const canonical=value=>Array.isArray(value)?value.map(canonical):
    value&&typeof value==='object'?Object.fromEntries(
        Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;

function shortReceipt(observation){
    const raw=safeJson(observation);
    if(raw!==null && raw.length<=MAX_RECEIPT_CHARS)return observation;
    const source=observation&&typeof observation==='object'?observation:{};
    // Keep actionable provenance when a source or record page exceeds the
    // model budget. Full originals remain in receipts for authorization/audit.
    const read=source.verifiedRead;
    if(read?.file&&read.sourceStructure?.dataBindings){
        const bindings=read.sourceStructure.dataBindings;
        const excerpt={ok:source.ok===true,status:source.status,observationTruncated:true,
            verifiedRead:{file:read.file,content:String(read.content||read.numberedContent||'').slice(0,900),
                partial:true,sourceStructure:{dataBindings:{source:bindings.source,
                    collections:(bindings.collections||[]).slice(0,15),
                    fields:[...new Set([...(bindings.writeShapes||[]),...(bindings.queryShapes||[])]
                        .flatMap(shape=>shape.fields||[]))].slice(0,35)}}}};
        if((safeJson(excerpt)||'').length<=MAX_RECEIPT_CHARS)return excerpt;
    }
    const records=source.recordEvidence;
    if(records?.fieldSchema){
        const excerpt={ok:source.ok===true,status:source.status,observationTruncated:true,
            recordEvidence:{source:records.source,scope:records.scope,
                fieldSchema:{...records.fieldSchema,paths:records.fieldSchema.paths?.slice(0,32),
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
        if(Array.isArray(rule?.enum) && !rule.enum.includes(value))return 'ARGUMENT_OUTSIDE_SCHEMA:'+name;
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
    const receipts=[],forModel=[],seen=new Set();
    let modelDecisionCount=0;
    const done=(status,reason,report='',certification=null)=>({
        status,reason,report,certification,receipts,
        modelDecisions:modelDecisionCount,
        completedReadCalls:receipts.filter(x=>x.ok).length
    });
    for(let iteration=0;iteration<steps;iteration++){
        if(signal?.aborted)return done('CANCELLED','SIGNAL_ABORTED');
        onProgress({phase:'QWEN_DECISION',iteration,completed:receipts.length});
        modelDecisionCount+=1;
        let decision;
        try{
            decision=await selectNextAction({
                instruction,repositoryMap,
                tools:selected.map(tool=>({name:tool.name,description:tool.description,
                    inputSchema:tool.inputSchema,evidenceKinds:tool.evidenceKinds})),
                observations:structuredClone(forModel),
                evidenceSummary:typeof summarizeEvidence==='function'
                    ? summarizeEvidence(structuredClone(receipts)):null,
                iteration,signal
            });
        }catch(error){
            return done('PARTIAL','MODEL_UNAVAILABLE');
        }
        if(signal?.aborted)return done('CANCELLED','SIGNAL_ABORTED');
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
        if(seen.has(signature))return done('PARTIAL','REPEATED_TOOL_CALL');
        seen.add(signature);
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
            observation:shortReceipt(observation)});
        if(!successful)return done('PARTIAL','READ_TOOL_NOT_SUCCESSFUL');
    }
    return done('PARTIAL','STEP_LIMIT_REACHED');
}
