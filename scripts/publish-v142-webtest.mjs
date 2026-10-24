// ADJUNTO V142: owner-approved preview-only publication (not a production deploy).
import {execFileSync, spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const WEBTEST=Object.freeze({
  branch:'v142-official',project:'fixgo-44e4d',site:'fixgo-44e4d',
  channel:'v142-jarvis-webtest-20261023',
  origin:'https://fixgo-44e4d--v142-jarvis-webtest-20261023-zht01nmx.web.app',
  bridge:'http://127.0.0.1:3344'
});
const PRIVATE_FILES=['/jarvis-fs-bridge.js','/jarvis-github-worker.js','/functions/index.js'];
export function buildFirebasePreviewCommand(firebaseCli){
  // cmd.exe /s strips executable quotes from a command passed by Node on
  // Windows. Restrict the CLI to a literal, safe, no-space .cmd path instead
  // of using shell:true or accepting arbitrary arguments from the user.
  if(typeof firebaseCli!=='string' ||
     !/^[a-z]:\\[a-z0-9_.\\-]+\.cmd$/i.test(firebaseCli))
    throw Error('WEBTEST_UNSAFE_FIREBASE_CLI_PATH');
  return firebaseCli+' hosting:channel:deploy '+WEBTEST.channel+
    ' --only '+WEBTEST.site+' --project '+WEBTEST.project+
    ' --config firebase.release.json --expires 7d --non-interactive --json';
}
const git=args=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8',windowsHide:true,timeout:90000}).trim();
const request=(url,options={})=>fetch(url,{...options,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});

export function validateBridge(identity,expectedSha){
  return identity?.status==='BRIDGE_IDENTITY_OK' &&
    identity.git?.head===expectedSha && identity.contractHead===expectedSha &&
    identity.contract?.branch===WEBTEST.branch;
}
export async function waitForBridge(sha,{fetchImpl=request,attempts=45,delayMs=1000}={}){
  for(let i=0;i<attempts;i++){
    try{
      const response=await fetchImpl(WEBTEST.bridge+'/health');
      if(response.status===200 && validateBridge((await response.json()).identity,sha))
        return true;
    }catch{/* singleton restart or temporary unavailability */}
    if(i+1<attempts)await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
  throw Error('WEBTEST_BRIDGE_NOT_READY_FOR_SHA');
}
export function validateSingleSite(response){
  return response?.status==='success' &&
    Object.keys(response.result||{}).length===1 &&
    response.result[WEBTEST.site]?.site===WEBTEST.site &&
    response.result[WEBTEST.site]?.url===WEBTEST.origin;
}
export async function inspectWebtest(sha,{fetchImpl=request}={}){
  const health=await fetchImpl(WEBTEST.bridge+'/health',{
    headers:{Origin:WEBTEST.origin,'Sec-Fetch-Site':'cross-site'}});
  if(health.status!==200||health.headers.get('access-control-allow-origin')!==WEBTEST.origin)
    throw Error('WEBTEST_BRIDGE_CORS_ORIGIN_NOT_ALLOWED');
  const body=await health.json();
  if(!validateBridge(body.identity,sha))throw Error('WEBTEST_BRIDGE_IDENTITY_DRIFT');
  const spoof=await fetchImpl(WEBTEST.bridge+'/health',{
    headers:{Origin:WEBTEST.origin+'.evil.example','Sec-Fetch-Site':'cross-site'}});
  if(spoof.status!==403)throw Error('WEBTEST_BRIDGE_ACCEPTED_SPOOFED_ORIGIN');
  // The local singleton supervisor uses a minimal GET heartbeat (200).
  // Browser access to private workstation diagnostics uses POST with the
  // owner release-id/Firebase-token gate (409 when release-id is missing).
  const heartbeat=await fetchImpl(WEBTEST.bridge+'/workstation/health');
  if(heartbeat.status!==200)throw Error('WEBTEST_SUPERVISOR_HEARTBEAT_UNHEALTHY');
  const auth=await fetchImpl(WEBTEST.bridge+'/workstation/health',{
    method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  if(auth.status!==409)throw Error('WEBTEST_POST_RELEASE_GATE_MISSING_OR_BRIDGE_UNHEALTHY');
  const release=await fetchImpl(WEBTEST.origin+'/release-manifest.json');
  if(release.status!==200||(await release.json()).git_sha!==sha)throw Error('WEBTEST_PUBLIC_SHA_MISMATCH');
  const page=await fetchImpl(WEBTEST.origin+'/gestia-terminal.html');
  if(page.status!==200)throw Error('WEBTEST_TERMINAL_MISSING');
  const contract=await fetchImpl(WEBTEST.origin+'/jarvis-runtime-contract.json');
  if(contract.status!==200)throw Error('WEBTEST_RUNTIME_CONTRACT_MISSING');
  for(const file of PRIVATE_FILES)if((await fetchImpl(WEBTEST.origin+file)).status!==404)
    throw Error('WEBTEST_PRIVATE_SOURCE_EXPOSED:'+file);
  return {bridgeIdentity:true,exactOriginCors:true,spoofedOriginRejected:true,
    releaseIdGate:true,previewShaVerified:true,terminalAvailable:true,privateFilesBlocked:true};
}

async function run(){
  const flags=new Set(process.argv.slice(2));
  if(flags.size===0 || [...flags].some(f=>!['--check','--publish','--push'].includes(f)) ||
      flags.has('--check')===flags.has('--publish') || flags.has('--check')&&flags.has('--push'))
    throw Error('USAGE: node scripts/publish-v142-webtest.mjs --check | --publish [--push]');
  if(git(['branch','--show-current'])!==WEBTEST.branch)throw Error('WEBTEST_WRONG_BRANCH');
  if(git(['status','--porcelain']))throw Error('WEBTEST_DIRTY_REPOSITORY');
  const sha=git(['rev-parse','HEAD']);
  if(!/^[a-f0-9]{40}$/.test(sha))throw Error('WEBTEST_INVALID_COMMIT');
  let remote=git(['ls-remote','--heads','origin',WEBTEST.branch]).split(/\s+/)[0];
  if(remote!==sha){
    if(!flags.has('--push'))throw Error('WEBTEST_REMOTE_COMMIT_MISMATCH');
    const ff=spawnSync('git',['merge-base','--is-ancestor',remote,sha],{cwd:ROOT,windowsHide:true});
    if(ff.status!==0)throw Error('WEBTEST_PUSH_NOT_FAST_FORWARD');
    git(['push','origin','HEAD:refs/heads/'+WEBTEST.branch]);
    git(['fetch','origin',WEBTEST.branch]);
    remote=git(['rev-parse','FETCH_HEAD']);
    if(remote!==sha)throw Error('WEBTEST_PUSH_SHA_MISMATCH');
  }
  // Wait for the supervised singleton to adopt the pushed revision BEFORE
  // running security tests. Otherwise their 409 expectation sees a 503.
  await waitForBridge(sha,{attempts:flags.has('--publish')?45:1});
  if(flags.has('--publish')){
    const tests=spawnSync(process.execPath,['--test',
      'tests/jarvis-local-intrusion-guard.test.mjs',
      'tests/jarvis-workstation-health.test.mjs'],{
        cwd:ROOT,encoding:'utf8',timeout:60000,maxBuffer:2000000,windowsHide:true
      });
    if(tests.status!==0)throw Error('WEBTEST_SECURITY_TESTS_FAILED:'+String(tests.stdout||'').slice(-1000));
    execFileSync(process.execPath,['scripts/prepare-platform-release.mjs'],{
      cwd:ROOT,timeout:30000,windowsHide:true});
    const manifest=JSON.parse(readFileSync(join(ROOT,'release-manifest.json'),'utf8'));
    if(manifest.git_sha!==sha)throw Error('WEBTEST_RELEASE_SHA_MISMATCH');
    const firebaseCli=join(process.env.APPDATA||'','npm','firebase.cmd');
    if(process.platform!=='win32'||!existsSync(firebaseCli))throw Error('WEBTEST_FIREBASE_CLI_UNAVAILABLE');
    const command=buildFirebasePreviewCommand(firebaseCli);
    const response=spawnSync('cmd.exe',['/d','/s','/c',command],{
      cwd:ROOT,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:2000000
    });
    if(response.status!==0)throw Error('WEBTEST_PREVIEW_DEPLOY_FAILED:'+String(response.stderr||'').slice(-1000));
    let payload;
    try{payload=JSON.parse(response.stdout||'');}
    catch{throw Error('WEBTEST_PREVIEW_RESPONSE_NOT_JSON');}
    if(!validateSingleSite(payload))throw Error('WEBTEST_MULTI_SITE_OR_UNEXPECTED_URL');
  }
  // The supervisor may reload after GitHub moves to this exact SHA; fail closed.
  let results,problem;
  for(let attempt=0;attempt<(flags.has('--publish')?25:1);attempt++){
    try{results=await inspectWebtest(sha);break;}
    catch(error){problem=error;if(attempt<24&&flags.has('--publish'))await new Promise(r=>setTimeout(r,1000));}
  }
  if(!results)throw problem||Error('WEBTEST_EVIDENCE_MISSING');
  const receipt={status:'ADJUNTO_V142_WEBTEST_VERIFIED',commit:sha,
    branch:WEBTEST.branch,mode:flags.has('--publish')?'publish':'check',
    url:WEBTEST.origin+'/gestia-terminal.html',verifiedAt:new Date().toISOString(),
    ...results,authenticatedBrowserMission:false};
  const receiptsDir=join(process.env.USERPROFILE||ROOT,'Documents','Jarvis-V142-Manifiestos');
  if(existsSync(receiptsDir))writeFileSync(join(receiptsDir,'latest-v142-webtest-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  run().catch(e=>{console.error('ADJUNTO_WEBTEST_FAILED',String(e.message||e));process.exitCode=1;});
}
