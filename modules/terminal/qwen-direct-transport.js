// Browser-side decisions go exclusively through JarvisLocalBridge. ID tokens
// live in the Authorization header, never in prompts, receipts or relay jobs.
export function createQwenBridgeActionSelector({bridge,auth,onInference=()=>{}}={}){
    if(typeof bridge?.requestJson!=='function'||!auth)
        throw new Error('QWEN_AUTHENTICATED_BRIDGE_REQUIRED');
    return async({signal,...input})=>{
        signal?.throwIfAborted();
        await auth.authStateReady?.();
        const user=auth.currentUser;
        if(!user?.uid||typeof user.getIdToken!=='function')throw new Error('QWEN_BROWSER_SESSION_REQUIRED');
        const idToken=await user.getIdToken();
        if(auth.currentUser!==user)throw new Error('QWEN_BROWSER_SESSION_CHANGED');
        const result=await bridge.requestJson('/semantic/plan',{
            ...input,missionState:{phase:'DIRECT_READ_ONLY_ACTION'}
        },{idToken,signal});
        signal?.throwIfAborted();
        if(auth.currentUser!==user)throw new Error('QWEN_BROWSER_SESSION_CHANGED');
        if(result?.ok!==true||result.principalId!==user.uid||!result.decision)
            throw new Error(result?.error||'QWEN_DECISION_RECEIPT_INVALID');
        if(result.usage)onInference(result.usage);
        return result.decision;
    };
}
