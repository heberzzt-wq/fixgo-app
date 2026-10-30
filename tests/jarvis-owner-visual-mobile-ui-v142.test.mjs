import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {test} from 'node:test';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const marker='V142_QWEN_LOCAL_VISUAL_RECEIPT';
test('real Terminal delivers mobile-width owner photo review without giant Qwen planner',async t=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-owner-vision-ui-v142-'));
 const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
 ['--headless=new','--disable-gpu','--disable-extensions','--no-first-run',
 '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],
 {windowsHide:true,stdio:'ignore'});
 let socket=null;
 t.after(async()=>{
  socket?.close();
  const name=path.basename(profile);
  const command="Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*"+name+"*'} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}";
  spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:10000});
  await pause(450);
  try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:12,retryDelay:250});}
  catch(error){if(error.code!=='EPERM'&&error.code!=='EBUSY')throw error;
    console.warn('SCOPED_CHROME_TEST_PROFILE_CLEANUP_DEFERRED',error.code);}
 });
 const file=path.join(profile,'DevToolsActivePort');
 for(let i=0;i<100&&!fs.existsSync(file);i++)await pause(100);
 assert.ok(fs.existsSync(file));
 const port=Number(fs.readFileSync(file,'utf8').split(/\r?\n/)[0]);
 const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const url=pages.find(x=>x.type==='page').webSocketDebuggerUrl;
 socket=new WebSocket(url);
 await new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true});
  socket.addEventListener('error',reject,{once:true});
 });
 let seq=0;const pending=new Map();
 socket.addEventListener('message',event=>{
  const response=JSON.parse(String(event.data));
  const task=pending.get(response.id);if(!task)return;
  pending.delete(response.id);
  response.error?task.reject(Error(JSON.stringify(response.error))):task.resolve(response.result);
 });
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++seq;pending.set(id,{resolve,reject});
  socket.send(JSON.stringify({id,method,params}));
 });
 const evalInBrowser=async expression=>{
  const response=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));
  return response.result?.value;
 };
 await cdp('Page.enable');await cdp('Runtime.enable');
 await cdp('Emulation.setDeviceMetricsOverride',{width:375,height:760,deviceScaleFactor:1,mobile:true});
 await cdp('Page.navigate',{url:'http://127.0.0.1:5000/gestia-terminal.html'});
 let booted=false;
 for(let i=0;i<120;i++){
  await pause(100);
  booted=await evalInBrowser("!!window.__JARVIS_SUBMIT_BOUND__&&typeof window.ToolsBridge?.executeMany==='function'&&typeof window.JarvisAttachments?.prepareVisualReview==='function'&&typeof window.renderJarvisResponse==='function'");
  if(booted)break;
 }
 assert.equal(booted,true,'Terminal must register submit and tool runtime');
 const setup="(()=>{const output='.jarvis-artifacts/uploads/owner-test-photo.jpg',sha256='a'.repeat(64);"+
  "window.JarvisAttachments.prepareVisualReview=()=>({question:'¿Qué ves en los archivos?',attachments:[{artifact:output,sha256,name:'photo.jpg',mimeType:'image/jpeg'}]});"+
  "window.__visualRouteAudit={};window.JarvisLocalBridge={requestJson:async(route,body)=>{"+
  "window.__visualRouteAudit={route,stage:body.semanticStage,files:body.localMediaReview.attachments.length};"+
  "return {ok:true,status:'LOCAL_MEDIA_BATCH_INTERPRETATIONS_PARTIAL',model:'qwen3.5:9b',externalApiUsed:false,sourceIdentityVerified:true,independentlyVerified:false,objectiveSatisfied:false,"+
  "ownerReport:{status:'LOCAL_MEDIA_OWNER_REPORT_PARTIAL',text:'V142_QWEN_LOCAL_VISUAL_RECEIPT Se observa una pantalla.',localOnly:true,independentlyVerified:false,objectiveSatisfied:false},"+
  "sources:[{sourceIndex:1,sourceName:'photo.jpg',output,sha256,kind:'image',observation:'Pantalla visible',sourceIdentityVerified:true,visualInferenceCompleted:true,independentlyVerified:false}]};}};"+
  "const input=document.getElementById('gestia-input');input.value='¿Qué ves en los archivos?';"+
  "document.getElementById('gestia-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true;})()";
 assert.equal(await evalInBrowser(setup),true);
 let actual;
 for(let i=0;i<90;i++){
  await pause(100);
  actual=await evalInBrowser("({audit:window.__visualRouteAudit,rendered:document.getElementById('gestia-output')?.textContent?.includes('V142_QWEN_LOCAL_VISUAL_RECEIPT'),active:window.__JARVIS_MISSION_IN_FLIGHT__})");
  if(actual?.rendered)break;
 }
 console.log('VISUAL_UI_RECEIPT',JSON.stringify(actual));
 assert.equal(actual?.audit?.route,'/semantic/respond');
 assert.equal(actual?.audit?.stage,'OWNER_UPLOADED_MEDIA_REVIEW');
 assert.equal(actual?.audit?.files,1);
 assert.equal(actual?.rendered,true);
 assert.equal(actual?.active,false);
});