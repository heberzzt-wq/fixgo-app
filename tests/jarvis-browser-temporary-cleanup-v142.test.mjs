import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
const source=readFileSync('jarvis-fs-bridge.js','utf8');
const anchor=source.indexOf('path.join(os.tmpdir(), "jarvis-browser-")');
assert.ok(anchor>=0);
const start=source.indexOf('            let result;',anchor);
const end=source.indexOf('            const relativeOutput = outputFile',start);
assert.ok(start>0&&end>start);
const snippet=source.slice(start,end);
const execute=(rmSync,runProcess,logger)=>new Function(
 'fs','profileDir','runProcess','chrome','args','path','root','timeoutMs','console',
 'return (async()=>{'+snippet+'return result;})()'
)({rmSync},'C:\\Temp\\jarvis-browser-fixture',runProcess,'chrome.exe',[],path,'.',15000,logger);
test('ENOTEMPTY cleanup race does not turn successful browser inspection into failure',async()=>{
 const events=[],result={ok:true,status:'BROWSER_INSPECT_OK',stdout:'<html><title>ok</title></html>'};
 const actual=await execute(()=>{const e=new Error('Directory not empty');e.code='ENOTEMPTY';throw e},
  async()=>result,{warn:(...args)=>events.push(args)});
 assert.equal(actual,result);
 assert.equal(events.length,1);
 assert.equal(events[0][0],'[JARVIS_BROWSER_TEMP_CLEANUP_DEFERRED]');
 assert.equal(events[0][1].code,'ENOTEMPTY');
 assert.equal(events[0][1].profile,'jarvis-browser-fixture');
});
test('browser subprocess error is not silenced by cleanup handler',async()=>{
 await assert.rejects(execute(()=>{},async()=>{throw Error('BROWSER_PROCESS_FAILED')},
   {warn:()=>{}}),/BROWSER_PROCESS_FAILED/);
});
test('cleanup uses bounded retries only on isolated temporary profile',async()=>{
 let call;
 await execute((p,options)=>{call={p,options}},async()=>({ok:true}),{warn:()=>{}});
 assert.equal(call.p,'C:\\Temp\\jarvis-browser-fixture');
 assert.equal(call.options.recursive,true);
 assert.equal(call.options.force,true);
 assert.ok(call.options.maxRetries>=2 && call.options.maxRetries<=8);
 assert.ok(call.options.retryDelay>=50 && call.options.retryDelay<=300);
});
