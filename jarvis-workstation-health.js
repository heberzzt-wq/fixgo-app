// Shared health contract. Health is process telemetry, not an execution certificate.
export const workstationRuntimeState = {
    workstationContractVersion: '2.0.0-singleton-exact-sync',
    loadedHead: null, startedAt: null, bridgeStarted: false, workerStarted: false,
    workerPollMs: 5000, workerLastPollAt: null, workerLastPollOkAt: null,
    workerLastPollError: null, lastDoctorAt: null
};

export function registerWorkstationHealth(app, {bridgeVersion, uploadTransportVersion,
    authorize = null, identity = null, experimental = false, capabilities = null} = {}) {
    if(app.locals.jarvisWorkstationHealthRegistered) return;
    app.locals.jarvisWorkstationHealthRegistered = true;
    const handler = async (req, res) => {
        if(authorize && !await authorize(req,res)) return;
        const runtime = experimental ? {
            workstationContractVersion: workstationRuntimeState.workstationContractVersion,
            loadedHead: identity?.()?.local?.head || null,
            bridgeStarted: true, workerStarted: false,
            node: {ok:true, version:process.version}
        } : {...workstationRuntimeState, processId:process.pid,
            node:{ok:true,version:process.version,executable:process.execPath}};
        return res.set('Cache-Control','no-store').json({ok:true,status:'JARVIS_WORKSTATION_LIVE',
            checkedAt:new Date().toISOString(),runtime,bridgeVersion,
            ...(uploadTransportVersion ? {uploadTransportVersion} : {}),
            doctorRoute: experimental ? null : '/workstation/doctor',
            ...(experimental ? {scope:'isolated-fs-bridge', readinessVerified:false,
                pendingIntegration:['workstation.doctor','upload.transport','relay.worker'],
                ...(typeof capabilities==='function'?{audioReviewCapabilities:capabilities()}:{})} : {})});
    };
    app.get('/workstation/health',handler);
    app.post('/workstation/health',handler);
}

export function createWorkstationAuthorization({identity,verifyIdToken,ownerUid}) {
    return async(req,res)=>{
            const current=identity();
            const deny=(code,error)=>{res.status(code).json({ok:false,error});return false;};
            if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress))return deny(403,'WORKSTATION_LOOPBACK_REQUIRED');
            if(current.ok!==true||current.contract?.branch!=='v142-official')return deny(503,'BRIDGE_IDENTITY_INVALID');
            if(req.get('X-Jarvis-Release-Id')!==current.contract.releaseId)return deny(409,'BRIDGE_RELEASE_MISMATCH');
            const bearer=String(req.get('Authorization')||'');
            if(!/^Bearer [^\s]{1,8192}$/.test(bearer))return deny(401,'QWEN_BROWSER_TOKEN_REQUIRED');
            try {const user=await verifyIdToken(bearer.slice(7));
                if(user?.uid!==ownerUid)return deny(403,'QWEN_PILOT_OWNER_REQUIRED');
            }catch{return deny(401,'QWEN_BROWSER_TOKEN_INVALID');}
            return true;
        };
}
