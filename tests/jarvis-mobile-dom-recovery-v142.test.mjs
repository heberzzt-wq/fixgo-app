import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createQwenAuthenticatedToolBridge} from '../jarvis-qwen-tool-bridge.js';
import {planPlatformRecovery} from '../jarvis-platform-self-healing.js';
import {readSavedMission} from '../modules/terminal/qwen-general-resume.js';

const url='https://www.energy.gov/node/374803';
const tool={name:'browser.inspect',mutates:false,requiresApproval:false,
  inputSchema:{type:'object',properties:{url:{type:'string'}},required:['url']}};
const owner={ok:true,principalId:'owner-fixture',tenantId:'B2C',role:'ceo'};
const composed={ok:false,executionOk:false,blocked:true,
  status:'BROWSER_INSPECT_DOM_UNAVAILABLE',error:null};

function adapterFor(observation,operation='browser.inspect'){
  return createQwenAuthenticatedToolBridge({
    toolRuntime:{list:()=>[{...tool,name:operation}]},
    toolsBridge:{executeMany:async()=>[observation]},
    validateAuthenticatedContext:async()=>owner,
    sessionContext:{tenantId:'B2C'},
    verifyObjectives:async()=>({ok:false}),
    hostToolPolicy:{accept:()=>true,authorize:()=>({ok:true,approved:false})}
  });
}

test('physical source DOM failure is a distinct source replan, not auth bypass or a fabricated verified page',async()=>{
  const read=adapterFor(composed);
  const received=await read.execute({name:tool.name,args:{url}},{authorization:owner,receipts:[]});
  assert.equal(received.ok,false);
  assert.equal(received.status,'SOURCE_HTML_UNVERIFIED');
  assert.equal(received.neverClaimedInspected,true);
  assert.equal(received.blocked,undefined);
  const recovery=planPlatformRecovery({system:'browser',tool,failure:received});
  assert.equal(recovery.status,'RECOVERY_READ_REPLAN_REQUIRED');
  assert.equal(recovery.autoExecute,false);
  assert.equal(recovery.action,'SELECT_DIFFERENT_AUTHORIZED_READ');
  assert.equal(planPlatformRecovery({tool:{...tool,mutates:true},failure:received}).status,'RECOVERY_SECURITY_BLOCKED');
});
test('permission and other tool failures are not converted to public source-recovery authority',async()=>{
  for(const bad of [
    {...composed,status:'PERMISSION_DENIED',error:{code:'permission-denied'}},
    {...composed,error:{code:'permission-denied'}},
    {...composed,status:'BROWSER_COMMAND_FAILED'},
  ]){
    const received=await adapterFor(bad).execute({name:tool.name,args:{url}},{authorization:owner,receipts:[]});
    assert.notEqual(received.status,'SOURCE_HTML_UNVERIFIED');
    assert.equal(received.blocked,true);
  }
});
test('every IndexedDB evidence reader opens existing v2 schema without pinning obsolete v1',()=>{
  for(const file of ['modules/terminal/qwen-general-resume.js','modules/terminal/qwen-download-ui.js','modules/terminal/qwen-code-preview-download.js']){
    const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/indexedDB\.open\('jarvis-qwen-general-evidence',1\)/);
    assert.match(source,/indexedDB\.open\('jarvis-qwen-general-evidence'\)/);
  }
});
test('the exact partial mission is readable from an existing version-two evidence store with a matching SHA',async()=>{
  const id='general-1f86d21a-db03-44f3-9bc3-99d1f65d3e93';
  const record={status:'PARTIAL',reason:'READ_TOOL_NOT_SUCCESSFUL',
    receipts:[{name:'browser.inspect',args:{url},ok:false,observation:{ok:false,status:'BROWSER_INSPECT_DOM_UNAVAILABLE'}}]};
  const sha256=createHash('sha256').update(JSON.stringify(record)).digest('hex');
  const prior=globalThis.indexedDB;
  let openArgs=null, closed=false;
  globalThis.indexedDB={
    open(...args){
      openArgs=args;
      const request={};
      queueMicrotask(()=>{
        request.result={
          transaction(){
            const tx={objectStore:()=>({get:()=>{const result={};queueMicrotask(()=>{
              result.result={missionId:id,record,sha256};
              result.onsuccess?.();
              tx.oncomplete?.();
            });return result;}})};
            return tx;
          },
          close(){closed=true;}
        };
        request.onsuccess?.();
      });
      return request;
    }
  };
  try{
    const saved=await readSavedMission(id);
    assert.deepEqual(openArgs,['jarvis-qwen-general-evidence']);
    assert.deepEqual(saved.record,record);
    assert.equal(closed,true);
  }finally{globalThis.indexedDB=prior;}
});
