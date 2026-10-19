import {unmetMissionEvidenceRequirements} from './gestia-core/jarvis/jarvis.mission.orchestrator.js';

// Adapter for an opt-in, read-only pilot. It deliberately reuses the existing
// ToolsBridge executor and requires explicit trusted browser-session validation.
// No standalone Firebase, admin SDK, anonymous account, service key or
// permission shortcut may be supplied by Qwen.
export function createQwenAuthenticatedToolBridge({
    toolRuntime, toolsBridge, sessionContext,
    validateAuthenticatedContext, verifyObjectives
}={}){
    if(typeof toolRuntime?.list!=='function'||
        typeof toolsBridge?.executeMany!=='function'||
        typeof validateAuthenticatedContext!=='function'||
        typeof verifyObjectives!=='function'){
        throw new Error('QWEN_DIRECT_EXISTING_RUNTIME_REQUIRED');
    }
    const catalog=toolRuntime.list().filter(tool=>
        typeof tool?.name==='string' && tool.name!=='conversation.respond' &&
        tool.investigationReadOnly===true &&
        tool.mutates!==true && tool.requiresApproval!==true &&
        tool.userArtifact!==true);
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
                tenantId:identity.tenantId,role:identity.role};
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
            const result=await toolsBridge.executeMany([
                {name:call.name,args:call.args,approved:false}
            ],{
                ...sessionContext,
                rawInput:instruction,tenantId:fresh.tenantId,
                userId:fresh.principalId,rootInstruction:instruction,
                writeAllowed:false,writeAuthorization:false,
                rol:fresh.role,approved:false,readOnlyPilot:true,
                completedTasks:structuredClone(receipts),
                evidenceReceipts:structuredClone(receipts)
            });
            const observation=Array.isArray(result)?result[0]:null;
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
                return structuredClone(data);
            }
            return structuredClone(observation);
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
