// V142 host-owned, cross-platform self-healing contract.
// Pure planner: an AI claim, tool result or repair history CANNOT grant authority.
// Automatic actions require independently authenticated adapters and receipts.
export const JARVIS_PLATFORM_SELF_HEALING_VERSION='1.0.0-bounded-platform-recovery';
const READS=new Set(['repo.read','repo.grep','repo.search','browser.inspect','web.research',
  'artifact.read','system.capabilities']);
const TRANSIENT=new Set(['NETWORK_TRANSIENT','REMOTE_FETCH_FAILED','ETIMEDOUT','ECONNRESET',
  'READ_TOOL_TRANSPORT_INTERRUPTED','ECONNABORTED']);
const PERMISSION=/^(?:UNAUTHORIZED|FORBIDDEN|PERMISSION_DENIED|AUTH_FAILED|TENANT_SCOPE_DENIED|QWEN_BROWSER_TOKEN_INVALID|SESSION_EXPIRED|RESOURCE_EXHAUSTED|HTTP_401|HTTP_403)$/u;
const FORMATS=new Set(['xml','json','csv','html','docx','xlsx','pdf']);
const FAIL_SAFE=Object.freeze({autoExecute:false,maxAttempts:0,requiresApproval:true,
  status:'RECOVERY_REVIEW_REQUIRED',action:'DIAGNOSE_AND_ESCALATE'});
function codeOf(failure){
 const raw=failure?.error?.context?.runtimeResult?.error?.code||
   failure?.error?.code||failure?.status||failure?.code||'';
 return typeof raw==='string'?raw.slice(0,140).toUpperCase():'';
}
function safeOp(name){return typeof name==='string'&&/^[a-z][a-z0-9._-]{1,79}$/i.test(name);}
function noAuthority(){return {autoExecute:false,maxAttempts:0,requiresApproval:false,
  status:'RECOVERY_SECURITY_BLOCKED',action:'DO_NOT_EXECUTE'};}

/**
 * All Jarvis subsystems use this common taxonomy: model, runtime services,
 * documents, connectors, tools, repository, finance and tenant operations.
 * Outcomes are PLANS, not executed changes.
 */
export function planPlatformRecovery({system='',tool={},failure={},attempt=1,
  output='',format='',operation=''}={}){
 const subsystem=String(system||'').toLowerCase();
 const op=tool?.name||operation,code=codeOf(failure);
 const phase=Number(attempt);
 if(!safeOp(op)||!Number.isInteger(phase)||phase<1)
   return {...noAuthority(),reason:'RECOVERY_INVALID_OPERATION'};
 const destructive=tool?.mutates===true||tool?.requiresApproval===true||
   /(?:^|\.)(?:write|delete|publish|send|charge|payout|deploy|authorize|push|commit|transfer|refund|pay|update)(?:\.|$)/iu.test(op);
 if(destructive)return {...noAuthority(),reason:'RECOVERY_MUTATION_NEEDS_EXPLICIT_AUTHORITY',system:subsystem,code};
 if(PERMISSION.test(code)||failure?.blocked===true||failure?.requiresInput===true)
   return {...noAuthority(),reason:'RECOVERY_AUTH_OR_SCOPE_DENIED',system:subsystem,code};
 // Same authenticated read only, at most two physical tool invocations total.
 if(READS.has(op)&&TRANSIENT.has(code)&&failure?.ok===false&&phase===1)
  return {status:'RECOVERY_SAFE_READ_RETRY',action:'REAUTHORIZE_AND_RETRY_READ',
   autoExecute:true,maxAttempts:2,requiresApproval:false,code,system:subsystem,
   originalFailurePreserved:true,independentReauthorizationRequired:true};
 // XML/JSON/etc: create a NEW version, never overwrite an original, never
 // treat a model-generated "valid=true" flag as a physical parse result.
 if(op==='document.create'&&FORMATS.has(String(format).toLowerCase())&&
    ['XML_INVALID','JSON_INVALID','ARTIFACT_CONTENT_INVALID','DOCUMENT_VALIDATION_FAILED',
     'XLSX_CALCULATION_UNVERIFIED','PDF_CONTENT_UNVERIFIED',
     'XML_STRUCTURE_REGENERATION_REQUIRED'].includes(code)&&
    typeof output==='string'&&
    /^\.jarvis-artifacts\/(?:documents|qwen-general\/general-[a-f0-9-]{36})\/[a-z0-9._-]+\.(?:xml|json|csv|html|docx|xlsx|pdf)$/iu.test(output))
   return {status:'RECOVERY_REGENERATE_ARTIFACT_PROPOSAL',action:'NEW_ARTIFACT_VERSION_WITH_PHYSICAL_VALIDATION',
    autoExecute:false,maxAttempts:2,requiresApproval:false,code,system:subsystem,
    keepOriginal:true,overwrite:false,physicalRevalidationRequired:true,
    validationFeedbackRequired:true};
 if(['bridge','hosting','ollama','qwen','docker','worker'].includes(subsystem)&&
    ['SERVICE_NOT_READY','CONNECTION_REFUSED','MODEL_UNAVAILABLE','BRIDGE_NOT_HEALTHY'].includes(code))
   return {status:'RECOVERY_LOCAL_SERVICE_HEALTH_REQUIRED',action:'DELEGATE_TO_OWNED_SUPERVISOR',
    autoExecute:false,maxAttempts:0,requiresApproval:false,system:subsystem,code,
    physicalHealthCheckRequired:true,controlledRestartRequired:true};
 if(['gmail','outlook','zoho','facebook','instagram','tiktok','calendar','drive'].includes(subsystem)&&
    /(?:TOKEN|OAUTH|AUTH|EXPIRED)/u.test(code))
   return {status:'RECOVERY_RECONNECT_ACCOUNT_REQUIRED',action:'REQUEST_FRESH_OWNER_OAUTH',
    autoExecute:false,maxAttempts:0,requiresApproval:true,system:subsystem,code};
 return {...FAIL_SAFE,system:subsystem,code};
}

export async function runAuthenticatedReadRecovery({plan,call,tool,execute,authorize,signal,
    instruction='',receipts=[]}={}){
 if(plan?.status!=='RECOVERY_SAFE_READ_RETRY'||plan.autoExecute!==true||
    !READS.has(call?.name)||tool?.name!==call.name||tool?.mutates===true||
    tool?.requiresApproval===true||typeof execute!=='function'||typeof authorize!=='function')
  return {ok:false,status:'RECOVERY_NOT_AUTHORIZED',attempts:1};
 signal?.throwIfAborted?.();
 let approved;
 try{approved=await authorize({instruction,tool:structuredClone(tool),call:structuredClone(call),
   receipts:structuredClone(receipts),signal});}
 catch {return {ok:false,status:'RECOVERY_REAUTHORIZATION_UNAVAILABLE',attempts:1};}
 if(approved?.ok!==true)
  return {ok:false,status:'RECOVERY_REAUTHORIZATION_DENIED',attempts:1};
 signal?.throwIfAborted?.();
 try{
  const result=await execute(call,{instruction,signal,receipts:structuredClone(receipts),
   authorization:structuredClone(approved)});
  return {ok:result?.ok===true,status:result?.ok===true?'RECOVERY_READ_RETRIED':'RECOVERY_RETRY_FAILED',
   attempts:2,observation:result};
 }catch(error){
  if(signal?.aborted)throw error;
  return {ok:false,status:'RECOVERY_RETRY_FAILED',attempts:2,
   observation:{ok:false,status:'READ_TOOL_RETRY_EXECUTION_FAILED',
     error:{code:/^(?:NETWORK_TRANSIENT|REMOTE_FETCH_FAILED|ETIMEDOUT|ECONNRESET)$/u.test(String(error?.message||''))?
       error.message:'READ_TOOL_RETRY_EXECUTION_FAILED'}}};
 }
}
