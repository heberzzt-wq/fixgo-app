// Dedicated, one-shot CPU certification. Not a paid payload admission bypass.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {resolveRunpodCredentialEnvironment,persistHuMo17PaidReceipt,huMo17BudgetSeconds} from '../jarvis-fs-bridge.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const secondAttempt=process.argv.includes('--reconciled-attempt-2');
const thirdAttempt=process.argv.includes('--verified-cleanup-attempt-3');
const fourthAttempt=process.argv.includes('--scoped-transport-attempt-4');
const fifthAttempt=process.argv.includes('--available-region-attempt-5');
const firstFile=path.join(root,'.jarvis-artifacts/humo17-quality/watchdog-certificate.json');
const file=fifthAttempt?firstFile.replace('.json','-5.json'):fourthAttempt?firstFile.replace('.json','-4.json'):thirdAttempt?firstFile.replace('.json','-3.json'):secondAttempt?firstFile.replace('.json','-2.json'):firstFile;
export function assertCertificateBalance(balance) {
    if(!Number.isFinite(balance))throw Error('CERTIFICATE_BALANCE_UNVERIFIED');
    if(balance<.10)throw Error('CERTIFICATE_INSUFFICIENT_PROVIDER_BALANCE');
}
export function buildCpuWatchdogCertificate({source,createdAtMs,operationId,dataCenterId='EU-NL-1'}) {
    if(!source || !Number.isFinite(createdAtMs) || !/^watchdog-[a-f0-9-]+$/.test(operationId)) throw Error('CERTIFICATE_INPUT_INVALID');
    if(!['EU-NL-1','EU-RO-1'].includes(dataCenterId))throw Error('CERTIFICATE_CPU_REGION_INVALID');
    const seconds=huMo17BudgetSeconds({hardBudgetUsd:.10,hourlyRateUsd:.07,maximumMinutes:20});
    const deadline=Math.floor(createdAtMs/1000)+seconds;
    // The short-lived bootstrap exits. Its detached guardian and PID1 status server are separate processes.
    const boot=`import base64,subprocess,sys,time\nfrom pathlib import Path\np=Path('/tmp/jarvis-budget');p.mkdir(mode=0o700,exist_ok=True)\n(p/'watchdog.py').write_bytes(base64.b64decode('${Buffer.from(source).toString('base64')}'))\nsubprocess.Popen([sys.executable,str(p/'watchdog.py'),'--deadline',str(min(${deadline},int(time.time())+240)),'--receipt',str(p/'state.json')],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)\n`;
    const server=`import base64,json,os,subprocess,sys\nfrom pathlib import Path\nfrom http.server import BaseHTTPRequestHandler,HTTPServer\nsubprocess.run([sys.executable,'-c',base64.b64decode('${Buffer.from(boot).toString('base64')}').decode()],check=True,timeout=15)\nclass Handler(BaseHTTPRequestHandler):\n def log_message(self,*args): pass\n def do_GET(self):\n  if self.path!='/state': self.send_error(404);return\n  try:\n   state=json.loads(Path('/tmp/jarvis-budget/state.json').read_text());state['bootstrapExited']=True\n   if state.get('pid'): os.kill(state['pid'],0)\n   data=json.dumps(state).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(data)\n  except Exception: self.send_error(503)\nHTTPServer(('0.0.0.0',8080),Handler).serve_forever()\n`;
    return {deadlineMs:deadline*1000,maximumPaidRuntimeSeconds:seconds,body:{
        name:operationId,computeType:'CPU',cpuFlavorIds:['cpu3c'],vcpuCount:2,
        cloudType:'SECURE',dataCenterIds:[dataCenterId],containerDiskInGb:20,volumeInGb:0,supportPublicIp:true,
        imageName:'python:3.12-slim-bookworm',ports:['8080/http','8080/tcp'],
        dockerEntrypoint:['python3','-c'],dockerStartCmd:[server],env:{}}};
}

async function main() {
    const action=process.argv[2];
    if(!['preflight','create','verify-arm','observe','cleanup-failed'].includes(action)) throw Error('CERTIFICATE_ACTION_INVALID');
    const credential=resolveRunpodCredentialEnvironment();
    if(!credential.credentialLoaded) throw Error('CERTIFICATE_CREDENTIAL_REQUIRED');
    const api=async(method,suffix)=>{
        const r=await fetch('https://rest.runpod.io/v1'+suffix,{method,headers:{Authorization:'Bearer '+credential.env.RUNPOD_API_KEY},signal:AbortSignal.timeout(12000)});
        if(r.status===404)return {status:404,body:null};
        if(!r.ok)throw Error('CERTIFICATE_PROVIDER_HTTP_'+r.status);
        return {status:r.status,body:r.status===204?null:await r.json()};
    };
    const save=r=>{persistHuMo17PaidReceipt(file,r);console.log(JSON.stringify(r));};
    if(action==='preflight'||action==='create') {
        const pods=await api('GET','/pods');if(!Array.isArray(pods.body)||pods.body.length)throw Error('CERTIFICATE_REQUIRES_ZERO_PODS');
        const volume=await api('GET','/networkvolumes/1qm5wczocl');if(volume.body?.id!=='1qm5wczocl')throw Error('ORIGINAL_VOLUME_NOT_CONFIRMED');
        const accountResponse=await fetch('https://api.runpod.io/graphql',{method:'POST',headers:{Authorization:'Bearer '+credential.env.RUNPOD_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({query:'query WatchdogBalancePreflight { myself { clientBalance } }'}),signal:AbortSignal.timeout(10000)});
        const account=await accountResponse.json(),balance=account.data?.myself?.clientBalance;
        if(!accountResponse.ok||account.errors||!Number.isFinite(balance))throw Error('CERTIFICATE_BALANCE_UNVERIFIED');
        assertCertificateBalance(balance);
        const catalog=await fetch('https://api.runpod.io/v2/catalog/cpus',{headers:{Authorization:'Bearer '+credential.env.RUNPOD_API_KEY},signal:AbortSignal.timeout(10000)}).then(r=>r.json());
        const cpu=catalog.cpus?.find(c=>c.id==='cpu3c');if(!cpu || cpu.vcpu.min!==2 || cpu.price.securePerVcpu*2>.06)throw Error('CPU_RATE_PREFLIGHT_FAILED');
        if(action==='preflight'){console.log(JSON.stringify({activePods:0,networkVolumeRetained:true,computeType:'CPU',cpuType:'cpu3c',vcpuCount:2,hourlyComputeRateUsd:cpu.price.securePerVcpu*2,maximumRateIncludingDiskUsd:.07,hardBudgetUsd:.10,paidExecutionAuthorized:false}));return;}
        if(process.argv[3]!=='--authorized-cpu-only-usd-0.10')throw Error('CERTIFICATE_EXPLICIT_CPU_AUTHORITY_REQUIRED');
        if(fs.existsSync(file))throw Error('CERTIFICATE_ALREADY_EXISTS_NO_REPLAY');
        if(secondAttempt){const previous=JSON.parse(fs.readFileSync(firstFile,'utf8'));if(previous.status!=='CREATE_REJECTED'||previous.podId)throw Error('PREVIOUS_CREATE_NOT_RECONCILED');}
        if(thirdAttempt){const previous=JSON.parse(fs.readFileSync(firstFile.replace('.json','-2.json'),'utf8'));if(previous.terminationVerified!==true||previous.localDeleteIssued!==true)throw Error('PREVIOUS_TERMINATION_REQUIRED');if((Date.now()-previous.createdAtMs)/3600000*previous.hourlyRateUsd>.06)throw Error('CONSERVATIVE_CUMULATIVE_BUDGET_EXHAUSTED');}
        if(fourthAttempt||fifthAttempt){
            let reserved=0;
            for(const n of [2,3]){const previous=JSON.parse(fs.readFileSync(firstFile.replace('.json',`-${n}.json`),'utf8'));if(previous.terminationVerified!==true||previous.localDeleteIssued!==true)throw Error('PREVIOUS_TERMINATION_REQUIRED');reserved+=previous.maximumPaidRuntimeSeconds*.07/3600;}
            const previous=JSON.parse(fs.readFileSync(firstFile.replace('.json','-3.json'),'utf8'));
            if(previous.observedWatchdog?.lastHttpStatus!==403)throw Error('SCOPED_TRANSPORT_FAILURE_EVIDENCE_REQUIRED');
            if(reserved+1200*.07/3600>.10)throw Error('CONSERVATIVE_CUMULATIVE_BUDGET_EXHAUSTED');
        }
        if(fifthAttempt){const previous=JSON.parse(fs.readFileSync(firstFile.replace('.json','-4.json'),'utf8'));if(previous.podId||previous.status!=='CREATE_REJECTED'||!previous.providerError?.includes('no longer any instances available'))throw Error('PLACEMENT_REJECTION_EVIDENCE_REQUIRED');}
        const dataCenterId=fifthAttempt?'EU-RO-1':'EU-NL-1';
        const availability=await fetch('https://api.runpod.io/v2/catalog/datacenters/'+dataCenterId+'?include=CPU_AVAILABILITY',{headers:{Authorization:'Bearer '+credential.env.RUNPOD_API_KEY},signal:AbortSignal.timeout(8000)}).then(r=>r.json());
        if(!availability.cpuAvailability?.some(c=>c.id==='cpu3c'&&['HIGH','MEDIUM','LOW'].includes(c.availability)))throw Error('CPU_NOT_AVAILABLE_NO_POST');
        const createdAtMs=Date.now(),operationId='watchdog-'+randomUUID();
        const source=fs.readFileSync(path.join(root,'scripts/jarvis-humo17-budget-watchdog.py'),'utf8');
        const plan=buildCpuWatchdogCertificate({source,createdAtMs,operationId,dataCenterId});
        const receipt={schema:'jarvis.v142.watchdog-certificate.1',jobId:operationId,operationId,computeType:'CPU',cpuType:'cpu3c',dataCenterId,
            createdAt:new Date(createdAtMs).toISOString(),createdAtMs,hardBudgetUsd:.10,providerBudgetSafetyRatio:.75,
            maximumPaidRuntimeSeconds:plan.maximumPaidRuntimeSeconds,remoteWatchdogDeadline:new Date(plan.deadlineMs).toISOString(),
            remoteWatchdogDeadlineMs:plan.deadlineMs,remoteWatchdogInstalled:false,remoteWatchdogVerified:false,
            inferenceStarted:false,MP4Generated:false,qualityCertified:false,paidExecutionAuthorized:false,
            terminationVerified:false,hostControlAbandoned:false,localWatchdogTriggered:false,localDeleteIssued:false,
            remoteWatchdogTriggered:false,hardCapCertified:false,watchdogSha256:createHash('sha256').update(source).digest('hex'),creatorPid:process.pid};
        // Write-ahead prevents a second POST even after an uncertain response or host crash.
        persistHuMo17PaidReceipt(file,{...receipt,status:'CREATE_REQUEST_PENDING'});
        const response=await fetch('https://rest.runpod.io/v1/pods',{method:'POST',headers:{Authorization:'Bearer '+credential.env.RUNPOD_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(plan.body),signal:AbortSignal.timeout(15000)});
        if(!response.ok){const detail=(await response.text()).slice(0,2048).replaceAll(credential.env.RUNPOD_API_KEY,'[REDACTED]');save({...receipt,status:'CREATE_REJECTED',httpStatus:response.status,providerError:detail});throw Error('CERTIFICATE_CREATE_HTTP_'+response.status);}
        const pod=await response.json();
        if(!pod.id)throw Error('CERTIFICATE_CREATE_ID_MISSING_RECONCILE_BY_NAME');
        const early={...receipt,podId:pod.id,hourlyRateUsd:Number(pod.adjustedCostPerHr??pod.costPerHr),status:'POD_CREATED'};save(early);
        if(!(early.hourlyRateUsd>0&&early.hourlyRateUsd<=.07) || (pod.gpu?.count||0)>0 || pod.cpuFlavorId!=='cpu3c') {
            await api('DELETE','/pods/'+pod.id);save({...early,localDeleteIssued:true,status:'PREFLIGHT_MISMATCH_CLEANUP',terminationVerified:(await api('GET','/pods/'+pod.id)).status===404});throw Error('CERTIFICATE_ACTUAL_RATE_OR_COMPUTE_MISMATCH');
        }
        return;
    }
    const receipt=JSON.parse(fs.readFileSync(file,'utf8'));
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(receipt.podId))throw Error('CERTIFICATE_POD_ID_REQUIRED');
    if(action==='verify-arm') {
        if(receipt.hostControlAbandoned)throw Error('HOST_ALREADY_ABANDONED_WAIT_FOR_DEADLINE');
        let response;
        try{response=await fetch(`https://${receipt.podId}-8080.proxy.runpod.net/state`,{signal:AbortSignal.timeout(8000)});}catch{}
        if(!response?.ok){
            const {body:p}=await api('GET','/pods/'+receipt.podId);
            const network={at:new Date().toISOString(),publicIp:p?.publicIp||null,portMappings:p?.portMappings||null,desiredStatus:p?.desiredStatus||null};
            persistHuMo17PaidReceipt(file,{...receipt,networkObservation:network});
            const port=Number(p?.portMappings?.['8080']);
            if(/^\d{1,3}(\.\d{1,3}){3}$/.test(p?.publicIp||'')&&Number.isInteger(port)&&port>0&&port<=65535){try{response=await fetch(`http://${p.publicIp}:${port}/state`,{signal:AbortSignal.timeout(8000)});}catch{}}
            if(!response?.ok){console.log(JSON.stringify({status:'BOOTSTRAP_NOT_READY',httpStatus:response?.status||null,network}));return;}
        }
        const state=await response.json();
        if(state.podId!==receipt.podId||state.remoteBudgetWatchdogVerified!==true||state.hostIndependent!==true||state.bootstrapExited!==true||!Number.isFinite(state.deadlineEpochSeconds)||state.deadlineEpochSeconds*1000>receipt.remoteWatchdogDeadlineMs||Date.now()+30000>=state.deadlineEpochSeconds*1000){save({...receipt,status:'WATCHDOG_NOT_VERIFIED',observedWatchdog:state});return;}
        save({...receipt,status:'HOST_CONTROL_ABANDONED',remoteWatchdogInstalled:true,remoteWatchdogVerified:true,remoteWatchdog:state,
            remoteWatchdogDeadlineMs:state.deadlineEpochSeconds*1000,remoteWatchdogDeadline:new Date(state.deadlineEpochSeconds*1000).toISOString(),
            hostControlAbandoned:true,hostControlAbandonedAt:new Date().toISOString(),verifierPid:process.pid});
        // Exit: no timer, polling, SSH session or local DELETE remains in this process.
        return;
    }
    if(action==='cleanup-failed') {
        await api('DELETE','/pods/'+receipt.podId);
        const observed=await api('GET','/pods/'+receipt.podId);
        save({...receipt,localDeleteIssued:true,status:'CERTIFICATION_FAILED_LOCAL_CLEANUP',terminationVerified:observed.status===404||observed.body?.desiredStatus==='TERMINATED',hardCapCertified:false});return;
    }
    if(Date.now()<receipt.remoteWatchdogDeadlineMs+15000)throw Error('OBSERVATION_MUST_BE_AFTER_REMOTE_DEADLINE');
    const pod=await api('GET','/pods/'+receipt.podId),pods=await api('GET','/pods'),volume=await api('GET','/networkvolumes/1qm5wczocl');
    const gone=pod.status===404||pod.body?.desiredStatus==='TERMINATED';
    save({...receipt,status:gone?'PROVIDER_TERMINATION_CONFIRMED':'REMOTE_TERMINATION_FAILED',terminationVerified:gone,
        remoteWatchdogTriggered:gone&&receipt.hostControlAbandoned===true&&receipt.localDeleteIssued===false,
        triggerEvidence:'Armed self-delete was the sole configured deletion authority; independent provider observation after deadline.',
        observedAt:new Date().toISOString(),observerPid:process.pid,providerActivePods:pods.body?.length,
        networkVolumeRetained:volume.body?.id==='1qm5wczocl',hardCapCertified:false});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
