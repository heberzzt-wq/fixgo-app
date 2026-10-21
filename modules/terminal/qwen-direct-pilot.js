import {createQwenAuthenticatedToolBridge} from '../../jarvis-qwen-tool-bridge.js';
import {runQwenDirectReadCycle,runQwenAuthorizedCycle} from '../../jarvis-qwen-direct-cycle.js';
import {createQwenBridgeActionSelector} from './qwen-direct-transport.js';
import {resolveGestiaRole} from '../../gestia-core/auth/role-authority.js';
import {JARVIS_PRIVATE_RELAY} from '../../gestia-core/jarvis/jarvis.semantic.transport.js';

const activeSessions=new WeakSet();

// Opt-in host integration. The authenticated Terminal supplies its existing
// runtime and objective verifier; neither can be chosen by model output.
export async function runQwenTerminalReadPilot({instruction,auth,bridge,toolRuntime,toolsBridge,
    sessionContext,verifyObjectives,repositoryMap,signal,onProgress=()=>{},maximumSteps=8,summarizeEvidence=null,hostToolPolicy=null,compactObservation=null,repairIncomplete=false,catalogForEvidence=null,pilotVersion=null,initialReceipts=[]}={}){
    if(!auth||typeof verifyObjectives!=='function'||!sessionContext?.tenantId)
        throw new Error('QWEN_TERMINAL_AUTHORITY_REQUIRED');
    if(activeSessions.has(auth))throw new Error('QWEN_TERMINAL_MISSION_BUSY');
    activeSessions.add(auth);
    const startedAt=Date.now();
    const metrics={firstUsefulToolMs:null,inferences:0,promptTokens:0,outputTokens:0,
        inferenceMs:0,objectivesCompletedPercent:null};
    try {
        await auth.authStateReady?.();
        const user=auth.currentUser;
        const validateAuthenticatedContext=async()=>{
            signal?.throwIfAborted();
            if(!user||auth.currentUser!==user||user.uid!==JARVIS_PRIVATE_RELAY.ownerUid)
                return {ok:false};
            const role=resolveGestiaRole(user);
            if(!role.resolved||role.source!=='master_identity')return {ok:false};
            return {ok:true,principalId:user.uid,tenantId:sessionContext.tenantId,role:role.role};
        };
        if((await validateAuthenticatedContext()).ok!==true)throw new Error('QWEN_TERMINAL_SESSION_REQUIRED');
        const adapter=createQwenAuthenticatedToolBridge({toolRuntime,toolsBridge,
            sessionContext,validateAuthenticatedContext,verifyObjectives,hostToolPolicy});
        const selector=createQwenBridgeActionSelector({bridge,auth,pilotVersion,onInference:usage=>{
            metrics.inferences++;
            metrics.promptTokens+=Number(usage.promptTokens)||0;
            metrics.outputTokens+=Number(usage.outputTokens)||0;
            metrics.inferenceMs+=Number(usage.durationMs)||0;
        }});
        const result=await (hostToolPolicy?runQwenAuthorizedCycle:runQwenDirectReadCycle)({instruction,repositoryMap,maximumSteps,stepLimit:hostToolPolicy?96:12,signal,summarizeEvidence,compactObservation,repairIncomplete,catalogForEvidence,initialReceipts,
            ...adapter,selectNextAction:selector,onProgress,
            execute:async(call,context)=>{
                const receipt=await adapter.execute(call,context);
                if(receipt.ok===true&&metrics.firstUsefulToolMs===null)
                    metrics.firstUsefulToolMs=Date.now()-startedAt;
                return receipt;
            }});
        const objectives=result.certification?.objectives;
        if(Array.isArray(objectives)&&objectives.length)
            metrics.objectivesCompletedPercent=100*objectives.filter(x=>x.satisfied===true).length/objectives.length;
        return {...result,metrics:{...metrics,totalMs:Date.now()-startedAt}};
    } finally {activeSessions.delete(auth);}
}
