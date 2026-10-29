// Canonical local workstation entry point. Keep npm commands below Windows CMD limits.
const{
    spawnSync}
=require('child_process');
const fs=require('fs'),http=require('http'),net=require('net');
const maintenance=process.argv.includes('--maintenance');
const preflightOnly=process.argv.includes('--preflight');
if(process.argv.slice(2).some(arg=>!['--maintenance','--preflight'].includes(arg)) || preflightOnly&&!maintenance)
    throw Error('JARVIS_WORKSTATION_MODE_INVALID');
const EXPECTED='2.0.0-singleton-exact-sync';
const runtimeContract=JSON.parse(fs.readFileSync('jarvis-runtime-contract.json','utf8'));
const EXPECTED_MODEL=runtimeContract.semanticModel;
if(EXPECTED_MODEL!=='qwen3.5:9b'||runtimeContract.inferencePolicy!=='LOCAL_ONLY'||(process.env.JARVIS_LOCAL_LLM_MODEL&&process.env.JARVIS_LOCAL_LLM_MODEL!==EXPECTED_MODEL)||(process.env.JARVIS_CONVERSATION_MODEL&&process.env.JARVIS_CONVERSATION_MODEL!==EXPECTED_MODEL))throw new Error('JARVIS_LOCAL_MODEL_CONTRACT_MISMATCH');
process.env.JARVIS_LOCAL_LLM_MODEL=EXPECTED_MODEL;
process.env.JARVIS_CONVERSATION_MODEL=EXPECTED_MODEL;
// CPU-only workstation: explicitly overridable limits, without changing the
// canonical model, tool authorization, source receipts or response fidelity.
process.env.JARVIS_LOCAL_LLM_CONTEXT_TOKENS ||= '8192';
process.env.JARVIS_LOCAL_LLM_KEEP_ALIVE ||= '45s';
process.env.JARVIS_LOCAL_LLM_PREWARM ||= '0';
process.env.JARVIS_LOCAL_LLM_MAX_INFERENCE_MS ||= '150000';
const bridgeSource=fs.readFileSync('jarvis-fs-bridge.js','utf8');
const EXPECTED_BRIDGE_VERSION=(((bridgeSource.split('JARVIS_FS_BRIDGE_VERSION')[1]||'').match(/\d+\.\d+\.\d+-[a-z0-9-]+-v142/)||[])[0]||'');
const git=process.platform==='win32'&&fs.existsSync('C:\Program Files\Git\cmd\git.exe')?'C:\Program Files\Git\cmd\git.exe':'git';
const beforeSync=spawnSync(git,['status','--porcelain'],{
    encoding:'utf8',windowsHide:true}
);
if(beforeSync.status!==0||String(beforeSync.stdout||'').trim())throw new Error('JARVIS_WORKTREE_DIRTY_BEFORE_BRIDGE_SYNC');
const rebaseActive=fs.existsSync('.git/rebase-merge')||fs.existsSync('.git/rebase-apply');
if(maintenance){
    if(rebaseActive)throw Error('JARVIS_MAINTENANCE_REBASE_ACTIVE');
    const branch=spawnSync(git,['rev-parse','--abbrev-ref','HEAD'],{encoding:'utf8',windowsHide:true});
    const remote=spawnSync(git,['config','--get','remote.origin.url'],{encoding:'utf8',windowsHide:true});
    if(branch.status!==0||remote.status!==0||String(branch.stdout||'').trim()!=='v142-official'||
        runtimeContract.branch!=='v142-official'||runtimeContract.repository!=='heberzzt-wq/fixgo-app'||
        !['https://github.com/heberzzt-wq/fixgo-app.git','git@github.com:heberzzt-wq/fixgo-app.git'].includes(String(remote.stdout||'').trim()))
        throw Error('JARVIS_MAINTENANCE_IDENTITY_INVALID');
}
let syncOk=true;
if(!maintenance&&rebaseActive){
    const quit=spawnSync(git,['rebase','--quit'],{
        stdio:'inherit',windowsHide:true,timeout:15000}
    );
    syncOk=quit.status===0;
    if(syncOk)console.warn('[JARVIS_GIT_REBASE_STATE_CLEARED] stale rebase metadata cleared before sync');
    else console.warn('[JARVIS_GIT_SYNC_REBASE_STATE_ACTIVE] could not clear stale rebase; continuing with local HEAD');
}
if(!maintenance&&syncOk){
    const fetchSync=spawnSync(git,['fetch','--quiet','origin','+refs/heads/v142-official:refs/remotes/origin/v142-official'],{
        stdio:'inherit',windowsHide:true,timeout:45000}
    );
    syncOk=fetchSync.status===0;
}
if(!maintenance&&syncOk){
    const rebaseSync=spawnSync(git,['rebase','origin/v142-official'],{
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
if(statusResult.status!==0||!localClean)throw new Error('JARVIS_WORKTREE_DIRTY_BEFORE_BRIDGE_START');
if(headResult.status!==0||!/^[a-f0-9]{40}$/.test(localHead))throw Error('JARVIS_WORKSTATION_HEAD_INVALID');
if(!maintenance){
    const remoteHead=spawnSync(git,['rev-parse','refs/remotes/origin/v142-official'],{encoding:'utf8',windowsHide:true});
    if(remoteHead.status!==0||String(remoteHead.stdout||'').trim()!==localHead)
        throw Error('JARVIS_NORMAL_HEAD_NOT_REMOTE');
    // The local Hosting server serves these ignored, generated artifacts.
    // Prepare after verifying the official HEAD and clean worktree, before
    // starting the Bridge; no Firebase deploy, branch change or source rewrite.
    const release=spawnSync(process.execPath,['scripts/prepare-platform-release.mjs'],{
        encoding:'utf8',windowsHide:true,timeout:15000
    });
    if(release.status!==0) {
        console.error('[JARVIS_LOCAL_RELEASE_PREPARE_FAILED]',String(release.stderr||release.error?.message||'').slice(0,600));
        throw Error('JARVIS_LOCAL_RELEASE_PREPARE_FAILED');
    }
    console.log('[JARVIS_LOCAL_RELEASE_PREPARED] head='+localHead);
}
let maintenanceIdentity=null;
if(maintenance){
    // No fetch, ref rewrite, or publication. Pin the actual advertised base.
    const resolvedRemote=spawnSync(git,['remote','get-url','origin'],{encoding:'utf8',windowsHide:true});
    if(resolvedRemote.status!==0||!['https://github.com/heberzzt-wq/fixgo-app.git','git@github.com:heberzzt-wq/fixgo-app.git'].includes(String(resolvedRemote.stdout||'').trim()))
        throw Error('JARVIS_MAINTENANCE_REMOTE_INVALID');
    const remote=spawnSync(git,['ls-remote','--exit-code','--heads','origin','refs/heads/v142-official'],{
        encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
    const match=String(remote.stdout||'').trim().match(/^([a-f0-9]{40})\s+refs\/heads\/v142-official$/);
    if(remote.status!==0||!match)throw Error('JARVIS_MAINTENANCE_REMOTE_UNVERIFIED');
    const remoteHead=match[1];
    const base=spawnSync(git,['merge-base',remoteHead,localHead],{encoding:'utf8',windowsHide:true,timeout:5000});
    if(base.status!==0||String(base.stdout||'').trim()!==remoteHead)throw Error('JARVIS_MAINTENANCE_NOT_REMOTE_DESCENDANT');
    maintenanceIdentity=Object.freeze({localHead,remoteHead});
}
if(preflightOnly){
    console.log('[JARVIS_MAINTENANCE_PREFLIGHT_OK] '+JSON.stringify({head:localHead,branch:'v142-official',clean:true,syncEnabled:false,workerStarted:false,maintenanceIdentity,localPublished:false}));
    process.exit(0);
}
const inspect=()=>new Promise(resolve=>{
    const req=http.get({
        host:'127.0.0.1',port:3344,path:'/health',timeout:2000}
    ,res=>{
        let body='';
        res.on('data',c=>body+=c);
        res.on('end',()=>{
            try{
                const json=JSON.parse(body||'{}');
                resolve({
                    healthy:res.statusCode===200&&json?.identity?.ok===true,isJarvis:Boolean(json?.supervisor?.bridgeVersion),contractVersion:String(json?.supervisor?.workstationContractVersion||''),workerStarted:json?.supervisor?.workerStarted===true,processId:Number(json?.supervisor?.processId||0),bridgeVersion:String(json?.supervisor?.bridgeVersion||''),loadedHead:String(json?.supervisor?.loadedHead||'')}
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
Promise.all([import('../jarvis-upload-bridge.js'),maintenance?Promise.resolve(null):import('../jarvis-github-worker.js')]).then(async([bridge,worker])=>{
    let server=null;
    if(maintenance)await new Promise((resolve,reject)=>{
        const socket=net.connect({host:'127.0.0.1',port:3345});
        socket.once('connect',()=>{socket.destroy();reject(Error('JARVIS_MAINTENANCE_SUPERVISOR_MUST_BE_PAUSED'));});
        socket.once('error',error=>error.code==='ECONNREFUSED'?resolve():reject(error));
        socket.setTimeout(2000,()=>{socket.destroy();reject(Error('JARVIS_MAINTENANCE_SUPERVISOR_STATE_UNCERTAIN'));});
    });
    const existing=await inspect();
    const bridgeState=await inspectBridge();
    if(maintenance&&await occupied())throw Error('JARVIS_MAINTENANCE_BRIDGE_ALREADY_RUNNING');
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
    const coldStart=process.env.JARVIS_LOCAL_LLM_PREWARM==='0';
    const warm=coldStart
        ? {ok:true,status:'JARVIS_LOCAL_MODEL_ON_DEMAND',model:EXPECTED_MODEL,
            keepAlive:process.env.JARVIS_LOCAL_LLM_KEEP_ALIVE,durationMs:0}
        : await bridge.warmJarvisLocalModel({
            model:process.env.JARVIS_LOCAL_LLM_MODEL||'qwen3.5:9b',
            keepAlive:process.env.JARVIS_LOCAL_LLM_KEEP_ALIVE||'45s',
            timeoutMs:Number(process.env.JARVIS_LOCAL_LLM_WARMUP_TIMEOUT_MS)||240000
        });
    if(warm?.ok!==true)throw new Error('JARVIS_LOCAL_AI_WARMUP_FAILED:'+String(warm?.status||'UNKNOWN'));
    console.log('[JARVIS_LOCAL_AI_START_PROFILE] status='+warm.status+
        ' model='+warm.model+' keepAlive='+warm.keepAlive+
        ' context='+process.env.JARVIS_LOCAL_LLM_CONTEXT_TOKENS+
        ' inferenceCapMs='+process.env.JARVIS_LOCAL_LLM_MAX_INFERENCE_MS);
    bridge.markJarvisWorkstationRuntime({
        bridgeStarted:true,workerStarted:!maintenance,workerPollMs:maintenance?null:Math.max(5000,Number(process.env.SIA7_POLL_MS)||30000),loadedHead:localHead,
        maintenanceMode:maintenance,gitSyncEnabled:!maintenance,remoteWorkerEnabled:!maintenance}
    );
    server=bridge.startJarvisUploadBridge({maintenanceIdentity});
    await new Promise((resolve,reject)=>{
        if(server.listening)return resolve();
        server.once('listening',resolve);
        server.once('error',reject)}
    );
    console.log('[JARVIS_WORKSTATION] online branch=v142-official bridge=http://127.0.0.1:3344 contract='+EXPECTED);
    if(maintenance){
        console.log('[JARVIS_MAINTENANCE] local clean HEAD; Git synchronization and publishing worker disabled; supervisor must remain paused');
        return;
    }
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
