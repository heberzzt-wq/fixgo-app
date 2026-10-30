import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import test from 'node:test';

const html=fs.readFileSync('gestia-terminal.html','utf8');
const widths=[320,375,414,768];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function injectAndMeasure(){
 const tray=document.getElementById('jarvis-attachment-tray');
 tray.hidden=false;
 const e=document.createElement('div');
 e.setAttribute('data-jarvis-attachment-status','true');
 e.className='text-xs px-3 py-2 rounded-lg bg-red-500/15 text-red-200';
 e.textContent='JAR-602 Ruta rechazada en inicio. Sin recibo: no se confirmó el inicio de la subida. Versión: 2.5.1-mobile-upload-stage-diagnostics-v142. Detalle: JARVIS_MOBILE_UPLOAD_ROUTE_DENIED '.repeat(7);
 tray.appendChild(e);
 const chip=document.createElement('div');
 chip.setAttribute('data-jarvis-attachment-chip','true');
 chip.className='flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-2.5 py-2 max-w-full';
 const n=document.createElement('div');n.className='min-w-0 flex-1';
 const label=document.createElement('div');label.className='text-xs text-white truncate';
 label.textContent='Screenshot_20261029_195232_com_android_chrome_CustomTabActivity.jpg';
 n.appendChild(label);chip.appendChild(n);tray.appendChild(chip);
 const rect=e.getBoundingClientRect(),t=tray.getBoundingClientRect();
 const welcome=document.querySelector('.terminal-welcome')?.getBoundingClientRect();
 const output=document.getElementById('gestia-output');
 return {
   width:window.innerWidth,bodyScrollWidth:document.body.scrollWidth,htmlScrollWidth:document.documentElement.scrollWidth,
   trayWidth:t.width,statusWidth:rect.width,statusScrollWidth:e.scrollWidth,statusClientWidth:e.clientWidth,
   statusHeight:rect.height,statusLineHeight:parseFloat(getComputedStyle(e).lineHeight)||0,
   statusOverflowWrap:getComputedStyle(e).overflowWrap,
   chipScrollWidth:chip.scrollWidth,chipClientWidth:chip.clientWidth,
   outputScrollWidth:output.scrollWidth,outputClientWidth:output.clientWidth,
   welcomeRight:welcome?.right??0,welcomeLeft:welcome?.left??0
 };
}
test('long upload error wraps in actual Chromium mobile viewport sizes',async t=>{
 assert.match(html,/#jarvis-attachment-tray\s*\{[^}]*overflow-x:\s*hidden/s);
 assert.match(html,/#jarvis-attachment-tray \[data-jarvis-attachment-status="true"\]\s*\{[^}]*overflow-wrap:\s*anywhere/s);
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-mobile-overflow-v142-'));

 const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
 assert.ok(fs.existsSync(chrome));
 const browser=spawn(chrome,['--headless=new','--disable-gpu','--disable-extensions',
  '--no-first-run','--no-default-browser-check','--remote-debugging-port=0',
  '--user-data-dir='+folder,'about:blank'],{windowsHide:true,stdio:'ignore'});

 const portFile=path.join(folder,'DevToolsActivePort');
 for(let i=0;i<120&&!fs.existsSync(portFile);i++)await pause(100);
 assert.ok(fs.existsSync(portFile),'Chrome debugger must start');
 const port=Number(fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0]);
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const tab=targets.find(x=>x.type==='page');
 assert.ok(tab?.webSocketDebuggerUrl,'page target should exist');
 const socket=new WebSocket(tab.webSocketDebuggerUrl);
 t.after(async()=>{
   socket.close();
   if(process.platform==='win32'){
     const marker=path.basename(folder);
     assert.match(marker,/^jarvis-mobile-overflow-v142-[a-zA-Z0-9]+$/);
     const command="Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*"+marker+"*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
     spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:10000});
   }else browser.kill();
   await pause(600);
   fs.rmSync(folder,{recursive:true,force:true,maxRetries:16,retryDelay:250});
 });
 await new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true});
  socket.addEventListener('error',reject,{once:true});
 });
 let next=0;const promises=new Map();
 socket.addEventListener('message',event=>{
  const data=JSON.parse(String(event.data));
  if(!data.id)return;
  const callback=promises.get(data.id);if(!callback)return;
  promises.delete(data.id);
  if(data.error)callback.reject(Error(JSON.stringify(data.error)));
  else callback.resolve(data.result);
 });
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++next;promises.set(id,{resolve,reject});
  socket.send(JSON.stringify({id,method,params}));
 });
 await cdp('Page.enable');await cdp('Runtime.enable');
 for(const viewport of widths){
  await cdp('Emulation.setDeviceMetricsOverride',{width:viewport,height:780,deviceScaleFactor:1,mobile:true});
  await cdp('Page.navigate',{url:'http://127.0.0.1:5000/gestia-terminal.html'});
  let ready=false;
  for(let k=0;k<45;k++){
   await pause(120);
   const r=await cdp('Runtime.evaluate',{expression:"document.readyState==='complete'&&!!document.getElementById('jarvis-attachment-tray')",returnByValue:true});
   if(r?.result?.value===true){ready=true;break;}
  }
  assert.ok(ready,'Terminal UI should load at '+viewport+'px');
  const measured=await cdp('Runtime.evaluate',{expression:'('+injectAndMeasure.toString()+')()',returnByValue:true});
  if(measured?.exceptionDetails)throw Error(JSON.stringify(measured.exceptionDetails));
  const m=measured?.result?.value;
  assert.ok(m,'measurements required');
  console.log('MOBILE_VIEWPORT',JSON.stringify(m));
  assert.equal(m.width,viewport);
  assert.ok(m.htmlScrollWidth<=viewport+1,'page wider at '+viewport);
  assert.ok(m.statusScrollWidth<=m.statusClientWidth+1,'diagnostic clipped at '+viewport);
  assert.ok(m.chipScrollWidth<=m.chipClientWidth+1,'chip clipped at '+viewport);
  assert.ok(m.statusHeight>m.statusLineHeight*2,'diagnostic not wrapped at '+viewport);
  assert.equal(m.statusOverflowWrap,'anywhere');
  assert.ok(m.welcomeRight<=viewport+1&&m.welcomeLeft>=-1,'welcome clipped at '+viewport);
 }
});