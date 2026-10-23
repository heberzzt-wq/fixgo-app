// V142: cancel only the process tree launched by an authenticated /run request.
// Never kill by executable name, port, unrelated PID, or model-supplied PID.
import {spawn} from 'node:child_process';

export function terminateOwnedProcessTree(child,{
 platform=process.platform,spawnImpl=spawn
}={}){
 const pid=child?.pid;
 if(!Number.isSafeInteger(pid)||pid<=0)return false;
 const fallback=()=>{
  try{child.kill?.('SIGTERM')}catch{/* process may already have exited */}
 };
 if(platform==='win32'){
  // npm scripts run in cmd.exe and may spawn Node descendants.
  // cmd.exe.kill alone leaves grandchildren alive on Windows.
  try{
   const killer=spawnImpl('taskkill',['/PID',String(pid),'/T','/F'],
    {windowsHide:true,stdio:'ignore'});
   if(typeof killer?.once==='function')killer.once('error',fallback);
   return true;
  }catch{
   fallback();
   return true;
  }
 }
 fallback();
 return true;
}

export function bindOwnedCommandLifecycle({req,res,child,onCancel}={}){
 if(!req?.once||!res?.once)throw Error('OWNED_COMMAND_HTTP_CONTEXT_REQUIRED');
 if(!Number.isSafeInteger(child?.pid)||child.pid<=0)throw Error('OWNED_COMMAND_PID_REQUIRED');
 let completed=false,cancelled=false;
 const cleanup=()=>{
  req.removeListener?.('aborted',onAborted);
  res.removeListener?.('close',onClose);
 };
 const cancel=reason=>{
  if(completed||cancelled)return false;
  cancelled=true;
  cleanup();
  if(typeof onCancel==='function')onCancel(reason);
  else terminateOwnedProcessTree(child);
  return true;
 };
 const onAborted=()=>cancel('CLIENT_ABORTED');
 const onClose=()=>{
  // Node also emits close after an ordinary response. That's not cancellation.
  if(res.writableEnded!==true)cancel('CLIENT_DISCONNECTED');
 };
 req.once('aborted',onAborted);
 res.once('close',onClose);
 if(req.aborted===true||(res.destroyed===true&&res.writableEnded!==true))
  cancel('ALREADY_DISCONNECTED');
 return {
  get completed(){return completed},
  get cancelled(){return cancelled},
  cancel,
  complete(){
   if(completed||cancelled)return false;
   completed=true;
   cleanup();
   return true;
  }
 };
}
