import test from 'node:test';
import assert from 'node:assert/strict';
import {JarvisAttachments} from '../modules/terminal/jarvis-attachments.js';
import {validateMobileRelayUploadOperation} from '../modules/terminal/jarvis-mobile-relay-policy.js';

test('actual Android-style HTTPS attachment sends bounded chunks even if Bridge advertises 2MB',async t=>{
 const prior={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage};
 const values=new Map();
 const localStorage={
   getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),
   removeItem:key=>values.delete(key)
 };
 const node=()=>({dataset:{},style:{},children:[],hidden:false,appendChild(child){this.children.push(child);return child;},
   remove(){},setAttribute(){},querySelectorAll(){return [];},querySelector(){return null;},
   addEventListener(){},getAttribute(){return null;},textContent:'',className:''});
 const tray=node();
 globalThis.window={location:{protocol:'https:',hostname:'alternative-preview.web.app'},
   JarvisLocalBridge:null};
 globalThis.document={getElementById:key=>key==='jarvis-attachment-tray'?tray:null,
   createElement:()=>node()};
 globalThis.localStorage=localStorage;
 t.after(()=>{
   try{JarvisAttachments.clear()}catch{}
   if(prior.window===undefined)delete globalThis.window;else globalThis.window=prior.window;
   if(prior.document===undefined)delete globalThis.document;else globalThis.document=prior.document;
   if(prior.localStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=prior.localStorage;
 });
 const calls=[],id='11111111-2222-4333-8444-555555555555';
 let expectedBytes=0,totalBytes=0,caseId=null,objectiveId=null;
 globalThis.window.JarvisLocalBridge={requestJson:async(route,body)=>{
   validateMobileRelayUploadOperation(route,body);
   calls.push({route,body});
   if(route==='/upload/start'){
     expectedBytes=body.expectedBytes;caseId=body.caseId;objectiveId=body.objectiveId;
     return {ok:true,uploadId:id,maxChunkBytes:2*1024*1024,status:'UPLOAD_SESSION_READY'};
   }
   if(route==='/upload/chunk'){
     const bytes=Buffer.from(body.dataBase64,'base64');
     assert.ok(bytes.length<=64*1024,'mobile chunks may never exceed the HTTPS profile');
     assert.equal(body.offset,totalBytes,'chunks must be ordered');
     totalBytes+=bytes.length;
     return {ok:true,progress:Math.round(totalBytes/expectedBytes*100)};
   }
   if(route==='/upload/complete'){
     assert.equal(totalBytes,expectedBytes);
     return {ok:true,bytes:totalBytes,caseId,objectiveId,
       mimeType:'image/jpeg',output:'.jarvis-artifacts/uploads/mobile-photo.jpg',
       sha256:'a'.repeat(64)};
   }
   throw Error('UNEXPECTED_UPLOAD_ROUTE');
 }};
 const file=new File([new Uint8Array(190*1024)],'mobile-photo.jpg',
   {type:'image/jpeg',lastModified:100});
 await JarvisAttachments.acceptFiles([file]);
 assert.equal(calls[0].route,'/upload/start');
 assert.equal(calls.at(-1).route,'/upload/complete');
 assert.equal(totalBytes,file.size);
 assert.equal(calls.filter(x=>x.route==='/upload/chunk').length,3);
 const results=JarvisAttachments.inspectAttachmentBatch();
 assert.equal(results.ok,true,JSON.stringify(results));
 assert.equal(results.readyFiles,1);
});
