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

test('an upload route rejection reports the exact failing stage and client revision, without bytes',async t=>{
 const before={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage};
 const store=new Map();
 const mockNode=()=>({dataset:{},children:[],hidden:false,appendChild(child){this.children.push(child);return child;},
   remove(){},querySelectorAll(){return [];},querySelector(){return null;},
   addEventListener(){},getAttribute(){return null;},setAttribute(){},textContent:''});
 const tray=mockNode();
 globalThis.document={getElementById:id=>id==='jarvis-attachment-tray'?tray:null,
   createElement:()=>mockNode()};
 globalThis.localStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,String(value)),
   removeItem:key=>store.delete(key)};
 let called=0;
 globalThis.window={location:{protocol:'https:',hostname:'other-preview.web.app'},
   JarvisLocalBridge:{requestJson:async(route)=>{
     assert.equal(route,'/upload/start');called++;
     throw new Error('JARVIS_MOBILE_UPLOAD_ROUTE_DENIED');
   }}};
 t.after(()=>{
  try{JarvisAttachments.clear()}catch{}
  for(const [key,value] of Object.entries(before)){
   if(value===undefined)delete globalThis[key];else globalThis[key]=value;
  }
 });
 const photo=new File([new Uint8Array(24576)],'test-photo.png',{type:'image/png'});
 await JarvisAttachments.acceptFiles([photo]);
 assert.equal(called,1);
 const result=JarvisAttachments.inspectAttachmentBatch();
 assert.equal(result.incompleteFiles,1);
 assert.match(result.incomplete[0].error,/JAR-602 · Ruta rechazada en inicio/);
 assert.match(result.incomplete[0].error,/Sin recibo: no se confirmó el inicio de la subida/);
 assert.match(result.incomplete[0].error,/2\.5\.1-mobile-upload-stage-diagnostics-v142/);
 assert.match(result.incomplete[0].error,/JARVIS_MOBILE_UPLOAD_ROUTE_DENIED/);
 assert.ok(!result.incomplete[0].error.includes('dataBase64'));
});
