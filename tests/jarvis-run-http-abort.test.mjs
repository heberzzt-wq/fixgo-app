import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createJarvisFsBridgeApp} from '../jarvis-fs-bridge.js';

function fixture(){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-run-http-abort-'));
 const root=path.join(folder,'worktree'),remote=path.join(folder,'remote.git');
 fs.mkdirSync(root);
 const git=process.platform==='win32'&&fs.existsSync('C:/Program Files/Git/cmd/git.exe')
  ?'C:/Program Files/Git/cmd/git.exe':'git';
 execFileSync(git,['init','--bare',remote],{stdio:'ignore'});
 execFileSync(git,['init','-b','v142-official'],{cwd:root,stdio:'ignore'});
 const run=args=>execFileSync(git,['-c','protocol.allow=never','-c','protocol.file.allow=always',...args],
  {cwd:root,stdio:['ignore','pipe','pipe'],encoding:'utf8'}).trim();
 run(['config','user.email','integration@example.invalid']);
 run(['config','user.name','NS1-12 temporary validation']);
 const canonical='https://github.com/test-owner/fixgo-test.git',local=pathToFileURL(remote).href;
 run(['remote','add','origin',canonical]);
 run(['remote','set-url','--push','origin',local]);
 run(['config','url.'+local+'.insteadOf',canonical]);
 fs.writeFileSync(path.join(root,'jarvis-runtime-contract.json'),JSON.stringify({
  projectId:'fixgo-test',repository:'test-owner/fixgo-test',
  branch:'v142-official',releaseId:'test-release'
 }));
 fs.writeFileSync(path.join(root,'.gitignore'),'.jarvis-artifacts/\n');
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({
  private:true,scripts:{'check:syntax':'node sleeper.cjs'}
 }));
 const sleep=[
 "const fs=require('node:fs'),path=require('node:path');",
 "const dir=path.join(__dirname,'.jarvis-artifacts');",
 "fs.mkdirSync(dir,{recursive:true});",
 "fs.writeFileSync(path.join(dir,'started.txt'),String(process.pid));",
 "setTimeout(()=>{",
 " fs.writeFileSync(path.join(dir,'completed.txt'),'should never exist when request aborted');",
 "},1500);"
 ].join('\n');
 fs.writeFileSync(path.join(root,'sleeper.cjs'),sleep);
 run(['add','.']);
 run(['commit','-m','validated temp command fixture']);
 run(['push','-u','origin','v142-official']);
 return {root,folder};
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitUntil(predicate,{limitMs=8000,intervalMs=30}={}){
 const started=Date.now();
 while(Date.now()-started<limitMs){
  if(predicate())return true;
  await wait(intervalMs);
 }
 return false;
}

test('real authenticated /run abort kills its owned Windows npm/Node tree, preserving other services',{timeout:24000},async t=>{
 const {root,folder}=fixture();
 t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const server=createJarvisFsBridgeApp({root}).listen(0,'127.0.0.1');
 await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
 t.after(async()=>await new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const ac=new AbortController();
 const promise=fetch(base+'/run',{method:'POST',
  headers:{'content-type':'application/json','x-jarvis-release-id':'test-release'},
  body:JSON.stringify({command:'npm run check:syntax',cwd:'.',timeoutMs:120000}),
  signal:ac.signal});
 const started=path.join(root,'.jarvis-artifacts/started.txt'),
  completed=path.join(root,'.jarvis-artifacts/completed.txt');
 const observed=await Promise.race([
  waitUntil(()=>fs.existsSync(started)),
  promise.then(async r=>{const body=await r.text();throw Error('RUN_NEVER_STARTED '+r.status+':'+body.slice(0,700))})
 ]);
 assert.equal(observed,true,'could not observe real Node child start');
 const pid=Number(fs.readFileSync(started,'utf8'));
 assert.ok(Number.isInteger(pid)&&pid>0);
 ac.abort();
 await promise.catch(()=>{});
 await wait(2100);
 assert.equal(fs.existsSync(completed),false,
  'owned child survived the HTTP cancellation and produced a late receipt');
 console.log('[NS1-12-HTTP-ABORT] disposable node child stopped, no late artifact, PID '+pid);
});

test('real authenticated /run command finishes normally without cancellation',{timeout:18000},async t=>{
 const {root,folder}=fixture();
 t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const server=createJarvisFsBridgeApp({root}).listen(0,'127.0.0.1');
 await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
 t.after(async()=>await new Promise(resolve=>server.close(resolve)));
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/run',{
  method:'POST',headers:{'content-type':'application/json','x-jarvis-release-id':'test-release'},
  body:JSON.stringify({command:'npm run check:syntax',cwd:'.',timeoutMs:120000})
 });
 const receipt=await response.json();
 assert.equal(response.status,200,JSON.stringify(receipt).slice(0,500));
 assert.equal(receipt.status,'PASSED');
 assert.equal(receipt.exitCode,0);
 assert.equal(receipt.ok,true);
 assert.equal(fs.existsSync(path.join(root,'.jarvis-artifacts/completed.txt')),true);
 console.log('[NS1-12-HTTP-COMPLETE] normal command completed without an unwanted kill');
});
