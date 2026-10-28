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
 assert.match(bridge,/sourceUrl:html\.sourceUrl/,'the final verified URL survives the mobile relay response');
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
  [302,'text/html','<html><title>Redirect</title><p>Hi</p></html>','BROWSER_PUBLIC_HTML_REDIRECT_LOCATION_REQUIRED'],
  [200,'application/pdf','%PDF-','BROWSER_PUBLIC_HTML_CONTENT_TYPE'],
  [200,'text/html','<html><title>Only a stub</title></html>','BROWSER_PUBLIC_HTML_STRUCTURE_UNVERIFIED']
 ])await assert.rejects(inspectPublicHtmlSource(legal,{lookup:async()=>[{address:'8.8.8.8',family:4}],request:fakeRequest(status,type,body).request}),new RegExp(error));
});

function redirectFixture(steps, ipByHost={}){
 const requests=[],dnsLookups=[],pinned=[];
 const lookup=async hostname=>{
  dnsLookups.push(hostname);
  return [{address:ipByHost[hostname]||'8.8.8.8',family:4}];
 };
 const request=(url,options,onResponse)=>{
  const emitter=new EventEmitter();
  emitter.setTimeout=()=>{};
  emitter.end=()=>{
   const next=steps[requests.length]||{code:500};
   requests.push(url.href);
   options.lookup(url.hostname,{},(err,ip,family)=>{
    if(err){emitter.emit('error',err);return;}
    pinned.push({host:url.hostname,ip,family});
    const response=new PassThrough();
    response.statusCode=next.code;
    response.headers={
     'content-type':next.type||'text/html',
     ...(next.location?{location:next.location}:{})
    };
    onResponse(response);
    response.end(next.body||'<html><head><title>Filters</title></head><main><p>Clean filters regularly.</p></main></html>');
   });
  };
  return emitter;
 };
 return {request,lookup,requests,dnsLookups,pinned};
}
test('public HTTPS 302 follows a safe same-host canonical URL and records verified source',async()=>{
 const fixture=redirectFixture([{code:302,location:'/saveathome/filter-maintenance'},{code:200}]);
 const result=await inspectPublicHtmlSource(legal,fixture);
 assert.equal(result.status,'BROWSER_INSPECT_SOURCE_HTML_VERIFIED');
 assert.equal(result.sourceUrl,'https://www.energystar.gov/saveathome/filter-maintenance');
 assert.deepEqual(result.redirectChain,[legal]);
 assert.deepEqual(fixture.dnsLookups,['www.energystar.gov','www.energystar.gov']);
 assert.equal(fixture.pinned.length,2);
});
test('safe cross-host 301 performs fresh DNS check and pins the second public IP',async()=>{
 const target='https://www.epa.gov/indoor-air-quality-iaq/air-cleaners';
 const fixture=redirectFixture([{code:301,location:target},{code:200}],{
  'www.energystar.gov':'8.8.8.8','www.epa.gov':'1.1.1.1'
 });
 const result=await inspectPublicHtmlSource(legal,fixture);
 assert.equal(result.sourceUrl,target);
 assert.deepEqual(fixture.pinned.map(p=>p.ip),['8.8.8.8','1.1.1.1']);
 assert.deepEqual(fixture.dnsLookups,['www.energystar.gov','www.epa.gov']);
});
test('redirect cannot downgrade HTTPS, access private addresses or use credentials',async()=>{
 for(const target of [
  'http://www.energystar.gov/private','http://127.0.0.1:3344/health',
  'https://127.0.0.1/private','https://example.local/secret',
  'https://admin:password@example.com/private','file:///etc/passwd'
 ]){
  const fixture=redirectFixture([{code:302,location:target},{code:200}]);
  await assert.rejects(inspectPublicHtmlSource(legal,fixture),/BROWSER_PUBLIC_HTML_REDIRECT_UNSAFE/);
  assert.equal(fixture.requests.length,1,target);
 }
});
test('redirect target with mixed public and private DNS is never requested',async()=>{
 const fixture=redirectFixture([{code:302,location:'https://www.epa.gov/air'},{code:200}]);
 fixture.lookup=async hostname=>hostname==='www.epa.gov'?
  [{address:'1.1.1.1',family:4},{address:'192.168.0.144',family:4}]:
  [{address:'8.8.8.8',family:4}];
 await assert.rejects(inspectPublicHtmlSource(legal,fixture),/BROWSER_PUBLIC_HTML_DNS_PRIVATE_OR_EMPTY/);
 assert.equal(fixture.requests.length,1);
});
test('redirect loops and more than three hops fail closed without unbounded requests',async()=>{
 const loop=redirectFixture([{code:302,location:legal}]);
 await assert.rejects(inspectPublicHtmlSource(legal,loop),/BROWSER_PUBLIC_HTML_REDIRECT_LOOP/);
 assert.equal(loop.requests.length,1);
 const limit=redirectFixture([0,1,2,3].map(i=>({code:302,location:'/redirect-'+i})));
 await assert.rejects(inspectPublicHtmlSource(legal,limit),/BROWSER_PUBLIC_HTML_REDIRECT_LIMIT/);
 assert.equal(limit.requests.length,4);
});
