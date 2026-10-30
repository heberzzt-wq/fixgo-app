import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import express from 'express';
import {JARVIS_MOBILE_UPLOAD_ROUTES,validateMobileRelayUploadOperation}
 from '../modules/terminal/jarvis-mobile-relay-policy.js';

const sample={batchId:'batch-20261029-test',name:'evidence.png',
 mimeType:'image/png',expectedBytes:1024,caseId:'CASE-20261029',objectiveId:'OBJ-20261029'};
test('Express mounted upload middleware sees a relative req.path, exact req.baseUrl',async t=>{
 const app=express();
 app.use(express.json());
 let observed;
 app.use(JARVIS_MOBILE_UPLOAD_ROUTES,(req,res)=>{
   observed={path:req.path,baseUrl:req.baseUrl,originalUrl:req.originalUrl,method:req.method};
   try{validateMobileRelayUploadOperation(req.baseUrl,req.body);}
   catch(error){return res.status(400).json({ok:false,status:error.message});}
   return res.json({ok:true});
 });
 const server=app.listen(0,'127.0.0.1');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 await new Promise((resolve,reject)=>{
   if(server.listening)resolve();
   else {server.once('listening',resolve);server.once('error',reject);}
 });
 const url='http://127.0.0.1:'+server.address().port+'/upload/start';
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify(sample)});
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true});
 assert.deepEqual(observed,{path:'/',baseUrl:'/upload/start',
  originalUrl:'/upload/start',method:'POST'});
 assert.throws(()=>validateMobileRelayUploadOperation(observed.path,sample),
  /JARVIS_MOBILE_UPLOAD_ROUTE_DENIED/);
 assert.equal(validateMobileRelayUploadOperation(observed.baseUrl,sample).route,'/upload/start');
});
test('real Bridge upload middleware validates its Express mount path, not the relative path',()=>{
 const bridge=readFileSync('jarvis-fs-bridge.js','utf8');
 assert.match(bridge,/app\.use\(JARVIS_MOBILE_UPLOAD_ROUTES,[\s\S]*?validateMobileRelayUploadOperation\(req\.baseUrl,req\.body\|\|\{\}\)/);
 assert.doesNotMatch(bridge,/validateMobileRelayUploadOperation\(req\.path,req\.body\|\|\{\}\)/);
});
