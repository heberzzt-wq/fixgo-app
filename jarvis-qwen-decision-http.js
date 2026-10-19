import {createLocalQwenActionSelector} from './jarvis-qwen-local-action.js';
import {JARVIS_PRIVATE_RELAY} from './gestia-core/jarvis/jarvis.semantic.transport.js';

// Verify only the existing browser ID token. This module never reads Firestore
// with Admin credentials and never executes a model-selected tool.
async function verifyBrowserIdToken(token){
    if(process.env.FIREBASE_AUTH_EMULATOR_HOST)throw new Error('QWEN_PILOT_REAL_AUTH_REQUIRED');
    const [{initializeApp,getApps},{getAuth}]=await Promise.all([
        import('firebase-admin/app'),import('firebase-admin/auth')]);
    const name='jarvis-qwen-browser-token-verifier';
    const app=getApps().find(app=>app.name===name)||initializeApp({projectId:'fixgo-44e4d'},name);
    return getAuth(app).verifyIdToken(token);
}

export function createQwenDecisionHandler({enabled=false,verifyIdToken=verifyBrowserIdToken,
    selectNextAction=null,getRepositoryMap=()=>null,heartbeatMs=5000}={}){
    let busy=false;
    return async(req,res)=>{
        if(!enabled)return res.status(403).json({ok:false,error:'QWEN_DIRECT_PILOT_DISABLED'});
        const header=String(req.get('Authorization')||'');
        if(!/^Bearer [^\s]{1,8192}$/.test(header))
            return res.status(401).json({ok:false,error:'QWEN_BROWSER_TOKEN_REQUIRED'});
        let identity;
        try {identity=await verifyIdToken(header.slice(7));}
        catch {return res.status(401).json({ok:false,error:'QWEN_BROWSER_TOKEN_INVALID'});}
        if(identity?.uid!==JARVIS_PRIVATE_RELAY.ownerUid)
            return res.status(403).json({ok:false,error:'QWEN_PILOT_OWNER_REQUIRED'});
        if(res.destroyed)return;
        const body=req.body||{};
        if(typeof body.instruction!=='string'||!body.instruction.trim()||body.instruction.length>24000||
            !Array.isArray(body.tools)||!body.tools.length||body.tools.length>80||
            !Array.isArray(body.observations)||body.observations.length>12||
            JSON.stringify(body).length>120000)
            return res.status(400).json({ok:false,error:'QWEN_DECISION_REQUEST_INVALID'});
        if(busy)return res.status(409).json({ok:false,error:'QWEN_DECISION_BUSY'});
        busy=true;
        const controller=new AbortController(),startedAt=Date.now();
        const close=()=>controller.abort();
        res.once('close',close);
        const streaming=body.streamProgress===true;
        const send=frame=>{if(!res.destroyed&&!res.writableEnded)res.write(JSON.stringify(frame)+'\n');};
        let timer,usage=null;
        if(streaming){
            res.status(200).set({'Content-Type':'application/x-ndjson','Cache-Control':'no-store'});
            res.flushHeaders();
            const progress=()=>send({type:'progress',stage:'DIRECT_READ_ONLY_ACTION',elapsedMs:Date.now()-startedAt});
            progress();timer=setInterval(progress,heartbeatMs);
        }
        try {
            const selector=selectNextAction||createLocalQwenActionSelector({maxOutputTokens:1024,onInference:value=>{usage=value;}});
            const decision=await selector({instruction:body.instruction,repositoryMap:await getRepositoryMap(body.instruction),
                tools:body.tools,observations:body.observations,evidenceSummary:body.evidenceSummary,
                missionLedger:body.missionLedger,iteration:body.iteration,signal:controller.signal});
            const result={ok:true,decision,usage,principalId:identity.uid};
            if(streaming){send({type:'result',result});res.end();}
            else res.json(result);
        } catch(error) {
            const reason=/^LOCAL_QWEN_[A-Z0-9_]+$/.test(String(error?.message||''))?error.message:
                error?.name==='TimeoutError'?'LOCAL_QWEN_TIMEOUT':'LOCAL_QWEN_INTERNAL_ERROR';
            const result={ok:false,error:'QWEN_LOCAL_DECISION_FAILED',reason};
            if(streaming){send({type:'result',result});res.end();}
            else if(!res.destroyed)res.status(503).json(result);
        } finally {clearInterval(timer);res.removeListener('close',close);busy=false;}
    };
}
