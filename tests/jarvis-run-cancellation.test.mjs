import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {spawn} from 'node:child_process';
import {
 bindOwnedCommandLifecycle,terminateOwnedProcessTree
} from '../jarvis-run-command-cancellation.js';

const connection=()=>{
 const req=new EventEmitter(),res=new EventEmitter();
 res.writableEnded=false;req.aborted=false;
 return {req,res};
};

test('HTTP client disconnect terminates only the current command tree and cannot trigger twice',()=>{
 const {req,res}=connection(),child={pid:12345},calls=[];
 const lifecycle=bindOwnedCommandLifecycle({req,res,child,onCancel:reason=>calls.push(reason)});
 res.emit('close');req.emit('aborted');res.emit('close');
 assert.deepEqual(calls,['CLIENT_DISCONNECTED']);
 assert.equal(lifecycle.cancelled,true);
 assert.equal(req.listenerCount('aborted'),0);
 assert.equal(res.listenerCount('close'),0);
});

test('completed response cleanup and ordinary close cannot terminate successful commands',()=>{
 const {req,res}=connection(),calls=[];
 const lifecycle=bindOwnedCommandLifecycle({req,res,child:{pid:432},onCancel:reason=>calls.push(reason)});
 lifecycle.complete();
 res.writableEnded=true;res.emit('close');req.emit('aborted');
 assert.deepEqual(calls,[]);
 assert.equal(lifecycle.cancelled,false);
 assert.equal(lifecycle.completed,true);
});

test('request abortion stops work even before response is sent',()=>{
 const {req,res}=connection(),calls=[];
 bindOwnedCommandLifecycle({req,res,child:{pid:77},onCancel:reason=>calls.push(reason)});
 req.aborted=true;req.emit('aborted');
 assert.deepEqual(calls,['CLIENT_ABORTED']);
});

test('Windows owned-child termination uses an exact PID tree kill, not an arbitrary shell',()=>{
 const calls=[],killer=new EventEmitter(),child={pid:10042,kill:()=>{throw Error('should not fallback')}};
 const result=terminateOwnedProcessTree(child,{
  platform:'win32',spawnImpl:(bin,args,options)=>{calls.push({bin,args,options});return killer}
 });
 assert.equal(result,true);
 assert.equal(calls.length,1);
 assert.equal(calls[0].bin,'taskkill');
 assert.deepEqual(calls[0].args,['/PID','10042','/T','/F']);
 assert.equal(calls[0].options.shell,undefined);
 assert.equal(calls[0].options.windowsHide,true);
});

test('invalid or missing PID never invokes process-kill or taskkill',()=>{
 let called=false;
 assert.equal(terminateOwnedProcessTree({pid:0},{
  platform:'win32',spawnImpl:()=>{called=true}
 }),false);
 assert.equal(terminateOwnedProcessTree({pid:-17},{
  platform:'win32',spawnImpl:()=>{called=true}
 }),false);
 assert.equal(called,false);
});

test('POSIX termination sends SIGTERM to the exact owned child',()=>{
 const signals=[];
 assert.equal(terminateOwnedProcessTree({pid:17,kill:s=>signals.push(s)},{platform:'linux'}),true);
 assert.deepEqual(signals,['SIGTERM']);
});

test('real cancellation terminates a disposable local Node child process',async t=>{
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],
  {windowsHide:true,stdio:'ignore'});
 t.after(()=>{try{child.kill('SIGKILL')}catch{}});
 await new Promise((resolve,reject)=>{
  child.once('spawn',resolve);child.once('error',reject);
 });
 const {req,res}=connection();
 bindOwnedCommandLifecycle({req,res,child});
 const ended=new Promise((resolve,reject)=>{
  child.once('exit',resolve);child.once('error',reject);
 });
 res.emit('close');
 await Promise.race([
  ended,
  new Promise((_,reject)=>setTimeout(()=>reject(Error('OWNED_NODE_PROCESS_SURVIVED_DISCONNECT')),4000))
 ]);
 assert.notEqual(child.exitCode,undefined);
});
