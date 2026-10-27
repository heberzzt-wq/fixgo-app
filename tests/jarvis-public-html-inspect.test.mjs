import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {PassThrough} from 'node:stream';
import {publicHtmlSourceUrl,isPublicHtmlAddress,inspectPublicHtmlSource} from '../jarvis-public-html-inspect.js';
import {generalObjectives} from '../modules/terminal/qwen-general-evidence.js';
const legal='https://www.energystar.gov/saveathome/heating-cooling/maintenance-checklist';
test('HTTPS source fallback never targets localhost, intranet, credentials, custom ports or unsafe schemes',()=>{
 assert.equal(publicHtmlSourceUrl(legal).hostname,'www.energystar.gov');
 for(const url of ['http://example.com','http://127.0.0.1:3344/health','https://localhost/private',
 'https://example.local/path','https://admin:password@example.com/path',
 'https://example.com:444/', 'file:///etc/passwd','https://192.168.0.1/private'])
  assert.throws(()=>publicHtmlSourceUrl(url),/BROWSER_PUBLIC_HTML_HTTPS_ONLY/,url);
 for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.0.144','169.254.1.1',
  '100.64.0.1','198.51.100.7','::1','fc00::1','fe80::1','::ffff:127.0.0.1'])
  assert.equal(isPublicHtmlAddress(ip),false,ip);
 for(const ip of ['1.1.1.1','8.8.8.8','2001:4860:4860::8888'])
  assert.equal(isPublicHtmlAddress(ip),true,ip);
});
test('Bridge requires actual HTML tags: no double-escaped regex and no false PROCESS_OK',()=>{
 const bridge=readFileSync(new URL('../jarvis-fs-bridge.js',import.meta.url),'utf8');
 assert.equal(bridge.includes(String.raw`/<html(?:\\s|>)/iu`),false);
 assert.equal(bridge.includes(String.raw`/<html(?:\s|>)/iu`),true);
 assert.equal(bridge.includes(String.raw`/<title(?:\s|>)/iu`),true);
 assert.match(bridge,/BROWSER_INSPECT_DOM_UNAVAILABLE/);
});
test('a negative instruction not to modify code never redirects HVAC research into engineering',()=>{
 const prompt='Investiga mantenimiento preventivo de aire acondicionado residencial con tres fuentes independientes; incluye citas literales; no crees archivos ni modifiques codigo.';
 const goals=generalObjectives(prompt);
 assert.equal(goals.research,true);
 assert.equal(goals.code,false);
 assert.equal(goals.document,false);
 assert.equal(goals.page,false);
});
test('public HTML recovery pins DNS and rejects even one private DNS answer',async()=>{
 let called=false;
 await assert.rejects(inspectPublicHtmlSource(legal,{lookup:async()=>[
  {address:'8.8.8.8',family:4},{address:'192.168.0.2',family:4}],
  request:()=>{called=true;throw Error('UNSAFE_CALL')}}),/BROWSER_PUBLIC_HTML_DNS_PRIVATE_OR_EMPTY/);
 assert.equal(called,false);
});
function fakeRequest(status=200,contentType='text/html',body='<html><head><title>Guide</title></head><main><p>Maintenance and filter advice.</p></main></html>'){
 let pinned=null;
 const req=(url,options,onResponse)=>{
  const emitter=new EventEmitter();
  emitter.setTimeout=()=>{};
  emitter.end=()=>{
   options.lookup('www.energystar.gov',{},(err,ip,family)=>{
    pinned={ip,family};
    if(err){emitter.emit('error',err);return;}
    const stream=new PassThrough();
    stream.statusCode=status;stream.headers={'content-type':contentType};
    onResponse(stream);stream.end(body);
   });
  };
  return emitter;
 };
 return {request:req,pinned:()=>pinned};
}
test('fallback verifies HTML content, pins public IP, and describes source as NOT rendered DOM',async()=>{
 const stub=fakeRequest();
 const observed=await inspectPublicHtmlSource(legal,{lookup:async()=>[{address:'8.8.8.8',family:4}],request:stub.request});
 assert.equal(stub.pinned().ip,'8.8.8.8');
 assert.equal(stub.pinned().family,4);
 assert.equal(observed.ok,true);
 assert.equal(observed.sourceKind,'HTTPS_SOURCE_HTML_NOT_RENDERED_DOM');
 assert.match(observed.dom,/Maintenance and filter advice/);
 for(const [status,type,body,error] of [
  [302,'text/html','<html><title>Redirect</title><p>Hi</p></html>','BROWSER_PUBLIC_HTML_HTTP_302'],
  [200,'application/pdf','%PDF-','BROWSER_PUBLIC_HTML_CONTENT_TYPE'],
  [200,'text/html','<html><title>Only a stub</title></html>','BROWSER_PUBLIC_HTML_STRUCTURE_UNVERIFIED']
 ])await assert.rejects(inspectPublicHtmlSource(legal,{lookup:async()=>[{address:'8.8.8.8',family:4}],request:fakeRequest(status,type,body).request}),new RegExp(error));
});
