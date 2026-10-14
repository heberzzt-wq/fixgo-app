// Canonical local workstation entry point. Keep npm commands below Windows CMD limits.
const{
    spawnSync}
=require('child_process');
const fs=require('fs'),http=require('http'),net=require('net');
const EXPECTED='2.0.0-singleton-exact-sync';
const runtimeContract=JSON.parse(fs.readFileSync('jarvis-runtime-contract.json','utf8'));
const EXPECTED_MODEL=runtimeContract.semanticModel;
if(EXPECTED_MODEL!=='qwen3.5:9b'||runtimeContract.inferencePolicy!=='LOCAL_ONLY'||(process.env.JARVIS_LOCAL_LLM_MODEL&&process.env.JARVIS_LOCAL_LLM_MODEL!==EXPECTED_MODEL)||(process.env.JARVIS_CONVERSATION_MODEL&&process.env.JARVIS_CONVERSATION_MODEL!==EXPECTED_MODEL))throw new Error('JARVIS_LOCAL_MODEL_CONTRACT_MISMATCH');
process.env.JARVIS_LOCAL_LLM_MODEL=EXPECTED_MODEL;
process.env.JARVIS_CONVERSATION_MODEL=EXPECTED_MODEL;
const bridgeSource=fs.readFileSync('jarvis-fs-bridge.js','utf8');
const EXPECTED_BRIDGE_VERSION=(((bridgeSource.split('JARVIS_FS_BRIDGE_VERSION')[1]||'').match(/\d+\.\d+\.\d+-[a-z0-9-]+-v142/)||[])[0]||'');
const git=process.platform==='win32'&&fs.existsSync('C:\Program Files\Git\cmd\git.exe')?'C:\Program Files\Git\cmd\git.exe':'git';
const beforeSync=spawnSync(git,['status','--porcelain'],{
    encoding:'utf8',windowsHide:true}
);
if(beforeSync.status!==0||String(beforeSync.stdout||'').trim())throw new Error('JARVIS_WORKTREE_DIRTY_BEFORE_BRIDGE_SYNC');
const rebaseActive=fs.existsSync('.git/rebase-merge')||fs.existsSync('.git/rebase-apply');
let syncOk=true;
if(rebaseActive){
    const quit=spawnSync(git,['rebase','--quit'],{
        stdio:'inherit',windowsHide:true,timeout:15000}
    );
    syncOk=quit.status===0;
    if(syncOk)console.warn('[JARVIS_GIT_REBASE_STATE_CLEARED] stale rebase metadata cleared before sync');
    else console.warn('[JARVIS_GIT_SYNC_REBASE_STATE_ACTIVE] could not clear stale rebase; continuing with local HEAD');
}
if(syncOk){
    const fetchSync=spawnSync(git,['fetch','--quiet','origin','+refs/heads/v94-media-v4n-negative-claims:refs/remotes/origin/v94-media-v4n-negative-claims'],{
        stdio:'inherit',windowsHide:true,timeout:45000}
    );
    syncOk=fetchSync.status===0;
}
if(syncOk){
    const rebaseSync=spawnSync(git,['rebase','origin/v94-media-v4n-negative-claims'],{
        stdio:'inherit',windowsHide:true,timeout:45000}
    );
    syncOk=rebaseSync.status===0;
}
if(!syncOk&&!rebaseActive)console.warn('[JARVIS_GIT_SYNC_DEGRADED] continuing with local HEAD');
const headResult=spawnSync(git,['rev-parse','HEAD'],{
    encoding:'utf8',windowsHide:true}
);
const localHead=String(headResult.stdout||'').trim();
const statusResult=spawnSync(git,['status','--porcelain'],{
    encoding:'utf8',windowsHide:true}
);
const localClean=String(statusResult.stdout||'').trim()==='';
if(!localClean)throw new Error('JARVIS_WORKTREE_DIRTY_BEFORE_BRIDGE_START');
const inspect=()=>new Promise(resolve=>{
    const req=http.get({
        host:'127.0.0.1',port:3344,path:'/workstation/health',timeout:2000}
    ,res=>{
        let body='';
        res.on('data',c=>body+=c);
        res.on('end',()=>{
            try{
                const json=JSON.parse(body||'{}');
                resolve({
                    healthy:res.statusCode===200,isJarvis:Boolean(json?.uploadTransportVersion||json?.bridgeVersion),contractVersion:String(json?.runtime?.workstationContractVersion||''),workerStarted:json?.runtime?.workerStarted===true,processId:Number(json?.runtime?.processId||0),bridgeVersion:String(json?.bridgeVersion||''),loadedHead:String(json?.runtime?.loadedHead||'')}
                )}
            catch{
                resolve({
                    healthy:false,isJarvis:false,contractVersion:'',workerStarted:false,processId:0}
                )}
        }
        )}
    );
    req.on('timeout',()=>{
        req.destroy();
        resolve({
            healthy:false,isJarvis:false,contractVersion:'',workerStarted:false,processId:0}
        )}
    );
    req.on('error',()=>resolve({
        healthy:false,isJarvis:false,contractVersion:'',workerStarted:false,processId:0}
    ))}
);
const occupied=()=>new Promise(resolve=>{
    const socket=net.connect({
        host:'127.0.0.1',port:3344}
    );
    socket.setTimeout(1200);
    socket.once('connect',()=>{
        socket.destroy();
        resolve(true)}
    );
    socket.once('timeout',()=>{
        socket.destroy();
        resolve(false)}
    );
    socket.once('error',()=>resolve(false))}
);
const recycle=pid=>{
    if(!Number.isInteger(pid)||pid<=0||pid===process.pid)return false;
    try{
        if(process.platform==='win32'){
            const result=spawnSync('taskkill',['/PID',String(pid),'/T','/F'],{
                stdio:'ignore',windowsHide:true}
            );
            return result.status===0;
        }
        process.kill(pid,'SIGTERM');
        return true;
    }
    catch{
        return false;
    }
}
;
const waitPortFree=async()=>{
    for(let i=0;
    i<20;
    i++){
        if(!(await occupied()))return true;
        await new Promise(r=>setTimeout(r,250));
    }
    return false;
}
;
const inspectBridge=()=>new Promise(resolve=>{
    const req=http.get({
        host:'127.0.0.1',port:3344,path:'/health',timeout:2000}
    ,res=>{
        let body='';
        res.on('data',c=>body+=c);
        res.on('end',()=>{
            try{
                const json=JSON.parse(body||'{}');
                resolve({
                    healthy:res.statusCode===200,version:String(json?.version||''),head:String(json?.identity?.git?.head||''),clean:json?.identity?.git?.clean===true,model:String(json?.semantic?.model||''),conversationModel:String(json?.semantic?.conversationModel||''),localOnly:json?.semantic?.mode==='LOCAL_ONLY'&&json?.semantic?.fallbackAllowed===false}
                )}
            catch{
                resolve({
                    healthy:false,version:'',head:'',clean:false}
                )}
        }
        )}
    );
    req.on('timeout',()=>{
        req.destroy();
        resolve({
            healthy:false,version:'',head:'',clean:false}
        )}
    );
    req.on('error',()=>resolve({
        healthy:false,version:'',head:'',clean:false}
    ))}
);
Promise.all([import('../jarvis-upload-bridge.js'),import('../jarvis-github-worker.js')]).then(async([bridge,worker])=>{
    let server=null;
    const existing=await inspect();
    const bridgeState=await inspectBridge();
    const singletonCurrent=existing.healthy&&existing.isJarvis&&existing.contractVersion===EXPECTED&&existing.workerStarted&&existing.loadedHead===localHead&&bridgeState.healthy&&bridgeState.version===EXPECTED_BRIDGE_VERSION&&bridgeState.head===localHead&&bridgeState.clean===true&&bridgeState.model===EXPECTED_MODEL&&bridgeState.conversationModel===EXPECTED_MODEL&&bridgeState.localOnly;
    if(singletonCurrent){
        console.log('[JARVIS_WORKSTATION] singleton already current head='+localHead+' bridgeVersion='+EXPECTED_BRIDGE_VERSION+' http://127.0.0.1:3344');
        return;
    }
    if(existing.healthy&&existing.isJarvis){
        if(!recycle(existing.processId))throw new Error('JARVIS_STALE_SINGLETON_RECYCLE_FAILED');
        console.warn('[JARVIS_WORKSTATION] recycled stale verified Jarvis pid='+existing.processId+' contract='+existing.contractVersion);
        if(!(await waitPortFree()))throw new Error('JARVIS_STALE_SINGLETON_PORT_RELEASE_TIMEOUT');
    }
    else if(await occupied()){
        throw new Error('JARVIS_BRIDGE_PORT_3344_OCCUPIED_UNHEALTHY');
    }
    const warm=await bridge.warmJarvisLocalModel({
        model:process.env.JARVIS_LOCAL_LLM_MODEL||'qwen3.5:9b',keepAlive:process.env.JARVIS_LOCAL_LLM_KEEP_ALIVE||'30m',timeoutMs:Number(process.env.JARVIS_LOCAL_LLM_WARMUP_TIMEOUT_MS)||240000}
    );
    if(warm?.ok!==true)throw new Error('JARVIS_LOCAL_AI_WARMUP_FAILED:'+String(warm?.status||'UNKNOWN'));
    console.log('[JARVIS_LOCAL_AI_WARM] model='+warm.model+' keepAlive='+warm.keepAlive+' durationMs='+warm.durationMs);
    bridge.markJarvisWorkstationRuntime({
        bridgeStarted:true,workerStarted:true,workerPollMs:Math.max(5000,Number(process.env.SIA7_POLL_MS)||30000),loadedHead:localHead}
    );
    server=bridge.startJarvisUploadBridge();
    await new Promise((resolve,reject)=>{
        if(server.listening)return resolve();
        server.once('listening',resolve);
        server.once('error',reject)}
    );
    console.log('[JARVIS_WORKSTATION] online branch=v94-media-v4n-negative-claims bridge=http://127.0.0.1:3344 contract='+EXPECTED);
    const poll=worker.createWorkerPoller();
    const runPoll=async()=>{
        bridge.markJarvisWorkstationRuntime({
            workerLastPollAt:new Date().toISOString(),workerLastPollError:null}
        );
        try{
            const result=await poll();
            if(result?.restartRequired===true||result?.status==='WORKER_RESTART_REQUIRED'){
                bridge.markJarvisWorkstationRuntime({
                    workerLastPollError:result.error||'WORKER_RESTART_REQUIRED'}
                );
                console.warn('[JARVIS_WORKSTATION] worker requested clean restart',JSON.stringify({
                    localHead:result.localHead||null,remoteHead:result.remoteHead||null}
                ));
                setTimeout(()=>process.exit(75),50);
                return;
            }
            if(result?.ok===false){
                bridge.markJarvisWorkstationRuntime({
                    workerLastPollError:result.error||result.status||'WORKER_BACKOFF'}
                );
                return;
            }
            bridge.markJarvisWorkstationRuntime({
                workerLastPollOkAt:new Date().toISOString()}
            );
        }
        catch(error){
            bridge.markJarvisWorkstationRuntime({
                workerLastPollError:error?.message||String(error)}
            );
            throw error;
        }
    }
    ;
    await runPoll();
    setInterval(()=>runPoll().catch(error=>console.error('[JARVIS_WORKER_POLL_ERROR]',error)),Math.max(5000,Number(process.env.SIA7_POLL_MS)||30000));
}
).catch(error=>{
    console.error('[JARVIS_LOCAL_RUNTIME_FATAL]',error);
    process.exit(1)}
)
