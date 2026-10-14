// Canonical local workstation entry point. Keep npm commands below Windows CMD limits.
const http=require('http'),net=require('net'),fs=require('fs'),{
    spawn,spawnSync}
=require('child_process');
const EXPECTED='2.0.0-singleton-exact-sync';
const expectedBridgeVersion=()=>{
    const s=fs.readFileSync('jarvis-fs-bridge.js','utf8'),tail=s.split('JARVIS_FS_BRIDGE_VERSION')[1]||'',q=tail.split(String.fromCharCode(34));
    return q.length>1?q[1]:'';
}
;
const git=process.platform==='win32'&&fs.existsSync('C:\Program Files\Git\cmd\git.exe')?'C:\Program Files\Git\cmd\git.exe':'git';
let lastKnownHead='';
const currentHead=()=>{
    const r=spawnSync(git,['rev-parse','HEAD'],{
        encoding:'utf8',windowsHide:true}
    );
    const head=r.status===0?String(r.stdout||'').trim():'';
    if(head)lastKnownHead=head;
    return head||lastKnownHead;
}
;
const SUPERVISOR_LOCK_PORT=3345;
const STARTUP_GRACE_MS=Math.max(120000,Math.min(300000,Math.max(10000,Number(process.env.JARVIS_LOCAL_LLM_WARMUP_TIMEOUT_MS)||240000))+120000);
const HEALTH_FAILURE_GRACE_MS=610000;
const STALE_SETTLE_MS=10000;
let child=null,childStartedAt=0,childWasHealthy=false,unhealthySince=0,stopping=false,lockServer=null,loopTimer=null,loopRunning=false;
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
const later=ms=>{
    clearTimeout(loopTimer);
    loopTimer=setTimeout(loop,ms);
}
;
const recycle=pid=>{
    if(!Number.isInteger(pid)||pid<=0)return false;
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
const launch=()=>{
    if(child)return;
    unhealthySince=0;
    childWasHealthy=false;
    const win=process.platform==='win32';
    const command=win?'cmd.exe':'npm';
    const args=win?['/d','/s','/c','npm run bridge']:['run','bridge'];
    child=spawn(command,args,{
        cwd:process.cwd(),stdio:'inherit',windowsHide:true}
    );
    childStartedAt=Date.now();
    console.log('[JARVIS_WORKSTATION_SUPERVISOR] launched child pid='+String(child.pid||0)+' contract='+EXPECTED);
    const launchedChild=child;
    child.on('error',error=>{
        if(child!==launchedChild)return;
        console.error('[JARVIS_WORKSTATION_CHILD_ERROR]',error.message);
        child=null;
        childStartedAt=0;
        if(!stopping)later(1500)}
    );
    child.on('exit',(code,signal)=>{
        if(child!==launchedChild)return;
        console.error('[JARVIS_WORKSTATION_CHILD_EXIT]',JSON.stringify({
            code,signal}
        ));
        child=null;
        childStartedAt=0;
        if(!stopping)later(1500)}
    );
}
;
async function loop(){
    if(stopping||loopRunning)return;
    loopRunning=true;
    try{
        const state=await inspect();
        const expectedVersion=expectedBridgeVersion();
        const head=currentHead();
        const runtimeAligned=state.healthy&&state.isJarvis&&state.contractVersion===EXPECTED&&state.workerStarted&&state.bridgeVersion===expectedVersion;
        if(runtimeAligned&&(!head||state.loadedHead===head)){
            childWasHealthy=true;
            unhealthySince=0;
            return later(5000);
        }
        if(state.healthy&&state.isJarvis){
            if(child&&Date.now()-childStartedAt<STALE_SETTLE_MS){
                console.warn('[JARVIS_WORKSTATION_SUPERVISOR] transient startup mismatch; waiting',JSON.stringify({
                    loadedHead:state.loadedHead,currentHead:head,bridgeVersion:state.bridgeVersion,expectedVersion,workerStarted:state.workerStarted}
                ));
                return later(500)}
            if(recycle(state.processId)){
                console.warn('[JARVIS_WORKSTATION_SUPERVISOR] recycled stale verified Jarvis pid='+state.processId+' contract='+state.contractVersion+' loadedHead='+state.loadedHead+' currentHead='+head+' bridgeVersion='+state.bridgeVersion+' expectedVersion='+expectedVersion);
                return later(1500)}
            console.error('[JARVIS_WORKSTATION_SUPERVISOR] stale verified Jarvis could not be recycled',JSON.stringify({
                loadedHead:state.loadedHead,currentHead:head,bridgeVersion:state.bridgeVersion,expectedVersion,workerStarted:state.workerStarted}
            ));
            return later(5000)}
        if(child){
            const childPid=Number(child.pid||0),childAge=Date.now()-childStartedAt;
            if(!childWasHealthy&&childAge<STARTUP_GRACE_MS)return later(2000);
            if(!unhealthySince){
                unhealthySince=Date.now();
                console.warn('[JARVIS_WORKSTATION_SUPERVISOR] health check delayed; waiting before recycling owned child');
            }
            if(Date.now()-unhealthySince<HEALTH_FAILURE_GRACE_MS)return later(2000);
            const recycled=recycle(childPid);
            console.warn('[JARVIS_WORKSTATION_SUPERVISOR] child failed to become healthy; clearing stale child pid='+childPid+' recycled='+recycled);
            child=null;
            childStartedAt=0;
            return later(1500)}
        if(await occupied()){
            console.error('[JARVIS_WORKSTATION_SUPERVISOR] port 3344 occupied by non-Jarvis or unhealthy process; refusing duplicate bind');
            return later(5000)}
        console.log('[JARVIS_WORKSTATION_SUPERVISOR] workstation offline -> starting contract '+EXPECTED);
        launch();
        return later(2000)}
    finally{
        loopRunning=false}
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
    stopping=true;
    if(child&&!child.killed)recycle(Number(child.pid||0));
    try{
        lockServer?.close()}
    catch{
    }
    process.exit(0)}
);
lockServer=net.createServer();
lockServer.once('error',error=>{
    if(error?.code==='EADDRINUSE'){
        console.log('[JARVIS_WORKSTATION_SUPERVISOR] singleton lock already held port='+SUPERVISOR_LOCK_PORT);
        process.exit(0);
        return}
    console.error('[JARVIS_WORKSTATION_SUPERVISOR_LOCK_ERROR]',error?.message||String(error));
    process.exit(1)}
);
lockServer.listen(SUPERVISOR_LOCK_PORT,'127.0.0.1',()=>{
    console.log('[JARVIS_WORKSTATION_SUPERVISOR] online singleton contract='+EXPECTED+' lock=127.0.0.1:'+SUPERVISOR_LOCK_PORT);
    loop()}
)
