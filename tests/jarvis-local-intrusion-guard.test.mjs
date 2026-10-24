import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createJarvisFsBridgeApp} from '../jarvis-fs-bridge.js';
import {evaluateJarvisWebPerimeter,JARVIS_BROWSER_ORIGINS,
 localIntrusionSnapshot,createJarvisLocalIntrusionGuard} from '../jarvis-local-intrusion-guard.js';

test('local bridge perimeter allows only exact loopback host and known browser origins',()=>{
 const options={host:'127.0.0.1:3344',localPort:3344,localAddress:'127.0.0.1'};
 assert.equal(evaluateJarvisWebPerimeter(options).ok,true);
 const ipv6Local={...options,host:'localhost:3344',localAddress:'::1',origin:'https://fixgo-44e4d.web.app'};
 assert.equal(evaluateJarvisWebPerimeter(ipv6Local).ok,true,'IPv6 loopback is local, not a remote host');
 assert.equal(evaluateJarvisWebPerimeter({...ipv6Local,origin:'https://evil.example'}).ok,false);
 assert.equal(evaluateJarvisWebPerimeter({...ipv6Local,localAddress:'2001:db8::1'}).ok,false);
 for(const origin of JARVIS_BROWSER_ORIGINS)
  assert.equal(evaluateJarvisWebPerimeter({...options,origin,fetchSite:'cross-site'}).ok,true,origin);
 for(const adversarial of [
  {host:'evil.example:3344'},
  {host:'127.0.0.1.evil.example:3344'},
  {host:'127.0.0.1@evil.example:3344'},
  {host:'127.0.0.1:3345'},
  {host:'[::1]:3344'},
  {host:'localhost:3344,evil.example:3344'},
  {origin:'https://evil.example'},
  {origin:'null'},
  {origin:'https://fixgo-44e4d.web.app.evil.example'},
  {origin:'https://fixgo-44e4d--v142-jarvis-webtest-20261023-zht01nmx.web.app.evil.example'},
  {origin:'https://fixgo-44e4d--v142-jarvis-webtest-20261023-zht01nmx.web.app:8443'},
  {origin:'https://fixgo-44e4d.web.app:8443'},
  {fetchSite:'cross-site'},
  {localAddress:'192.168.1.9'},
  {hostCount:2}
 ]){
  const outcome=evaluateJarvisWebPerimeter({...options,...adversarial});
  assert.equal(outcome.ok,false,JSON.stringify(adversarial));
 }
 assert.equal(evaluateJarvisWebPerimeter({...options,fetchSite:'same-site'}).ok,true);
});
test('intrusion events reveal no authorization headers, tokens, query or request body',()=>{
 const guard=createJarvisLocalIntrusionGuard();
 const req={method:'POST',path:'/connectors',rawHeaders:['Host','evil.example:3344'],
  headers:{host:'evil.example:3344',authorization:'Bearer PRIVATE_TOKEN'},
  body:{password:'PRIVATE_SECRET'},socket:{localAddress:'127.0.0.1',localPort:3344}};
 let status,body,next=0;
 const res={status(n){status=n;return this},set(){return this},json(x){body=x;return this}};
 guard(req,res,()=>next++);
 assert.equal(status,403);
 assert.equal(next,0);
 assert.equal(body.status,'JARVIS_WEB_PERIMETER_DENIED');
 const saved=localIntrusionSnapshot();
 assert.ok(saved.blockedTotal>=1);
 assert.equal(saved.scope,'loopback-http-browser-perimeter-only');
 assert.ok(!JSON.stringify(saved).includes('PRIVATE_TOKEN'));
 assert.ok(!JSON.stringify(saved).includes('PRIVATE_SECRET'));
});
test('real ephemeral bridge rejects spoofed Host, foreign Origin and originless cross-site probes before route logic',async t=>{
 const root=new URL('../',import.meta.url).pathname;
 const server=createJarvisFsBridgeApp({root:process.cwd()}).listen(0,'127.0.0.1');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 await new Promise(resolve=>server.once('listening',resolve));
 const port=server.address().port,base='http://127.0.0.1:'+port;
 const probe=async(headers={})=>new Promise((resolve,reject)=>{
  const request=http.request({hostname:'127.0.0.1',port,path:'/health',
    method:'GET',headers},response=>{
    let body='';response.on('data',chunk=>body+=chunk);
    response.on('end',()=>{
      try{resolve({status:response.statusCode,body:JSON.parse(body)});}
      catch(error){reject(error);}
    });
  });
  request.on('error',reject);request.end();
 });
 const healthy=await probe();
 assert.equal(healthy.status,200,JSON.stringify(healthy.body));
 const official=await probe({Origin:'https://fixgo-44e4d.web.app','Sec-Fetch-Site':'cross-site'});
 assert.equal(official.status,200);
 for(const headers of [
  {Host:'hostile.example:'+port},
  {Host:'127.0.0.1.evil.example:'+port},
  {Host:'localhost:3344'},
  {Origin:'https://intruder.invalid'},
  {'Sec-Fetch-Site':'cross-site'}
 ]){
  const response=await probe(headers);
  assert.equal(response.status,403,JSON.stringify(headers)+' '+JSON.stringify(response.body));
  assert.equal(response.body.status,'JARVIS_WEB_PERIMETER_DENIED');
 }
 const post=await fetch(base+'/connectors',{method:'POST',
  headers:{'content-type':'application/json',Origin:'https://evil.example'},
  body:'{}'});
 assert.equal(post.status,403);
 const release=await fetch(base+'/connectors',{method:'POST',
  headers:{'content-type':'application/json'},body:'{}'});
 assert.equal(release.status,409,'normal CLI still follows existing release-id gate');
});

test('security event status requires an independently verified owner token and never reveals secrets',async()=>{
 const {createWorkstationAuthorization}=await import('../jarvis-workstation-health.js');
 const auth=createWorkstationAuthorization({
  identity:()=>({ok:true,contract:{branch:'v142-official',releaseId:'guarded-release'}}),
  verifyIdToken:async token=>({uid:token==='owner-valid'?'expected-owner':'foreign-user'}),
  ownerUid:'expected-owner'
 });
 const response=()=>({statusCode:200,payload:null,status(code){this.statusCode=code;return this},
  json(body){this.payload=body;return this}});
 const request=token=>({socket:{remoteAddress:'127.0.0.1'},
  get(name){const normalized=String(name).toLowerCase();
   return normalized==='x-jarvis-release-id'?'guarded-release':
     normalized==='authorization'?(token?'Bearer '+token:''):'';}});
 const anonymous=response();
 assert.equal(await auth(request(null),anonymous),false);
 assert.equal(anonymous.statusCode,401);
 const foreign=response();
 assert.equal(await auth(request('foreign'),foreign),false);
 assert.equal(foreign.statusCode,403);
 const owner=response();
 assert.equal(await auth(request('owner-valid'),owner),true);
 const snapshot=localIntrusionSnapshot();
 assert.equal(snapshot.alert==='REPEATED_UNAUTHORIZED_BROWSER_REQUESTS'||snapshot.alert==='NONE',true);
 assert.ok(!JSON.stringify(snapshot).includes('owner-valid'));
 const source=(await import('node:fs')).readFileSync(
  new URL('../jarvis-fs-bridge.js',import.meta.url),'utf8');
 assert.match(source,/app\.post\('\/security\/local\/status'/);
 assert.match(source,/verifyIdToken:verifyBrowserIdToken,ownerUid:workstationRelay\.ownerUid/);
 assert.match(source,/Cache-Control','no-store'/);
});

test('owner does not get locked out after repeated rejected intrusions; legitimate browser sessions remain accessible',async t=>{
 const server=createJarvisFsBridgeApp({root:process.cwd()}).listen(0,'127.0.0.1');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 await new Promise(resolve=>server.once('listening',resolve));
 const port=server.address().port;
 const invoke=({host='127.0.0.1:'+port,origin,fetchSite,method='GET',route='/health',
    body=null}={})=>new Promise((resolve,reject)=>{
   const headers={Host:host};
   if(origin!==undefined)headers.Origin=origin;
   if(fetchSite!==undefined)headers['Sec-Fetch-Site']=fetchSite;
   if(body!==null)headers['Content-Type']='application/json';
   const request=http.request({hostname:'127.0.0.1',port,path:route,method,headers},response=>{
    let bytes='';response.on('data',chunk=>bytes+=chunk);
    response.on('end',()=>{
     try{resolve({status:response.statusCode,body:JSON.parse(bytes)});}
     catch(error){reject(error);}
    });
   });request.on('error',reject);
   if(body!==null)request.write(JSON.stringify(body));
   request.end();
 });
 for(let i=0;i<12;i++){
  const denied=await invoke({host:i%2?'127.0.0.1.evil.test:'+port:'malicious.example:'+port});
  assert.equal(denied.status,403);
 }
 const warning=localIntrusionSnapshot();
 assert.equal(warning.alert,'REPEATED_UNAUTHORIZED_BROWSER_REQUESTS');
 // Rejected requests must never add a source-IP ban or disable a session.
 for(const origin of [
  'http://127.0.0.1:5000','http://localhost:5000',
  'https://fixgo-44e4d.web.app','https://fixgo-44e4d.firebaseapp.com'
 ]){
  const restored=await invoke({origin,fetchSite:'cross-site'});
  assert.equal(restored.status,200,'owner origin should survive hostile burst: '+origin);
  assert.equal(restored.body.ok,true);
 }
 const ownerLocal=await invoke();
 assert.equal(ownerLocal.status,200);
 // Authorized origin may proceed to existing release/owner gates; the
 // perimeter must not return a 403 masquerading as session lockout.
 const mission=await invoke({route:'/connectors',method:'POST',
  origin:'http://127.0.0.1:5000',body:{}});
 assert.equal(mission.status,409,'release ID must still be enforced without a bogus perimeter ban');
 const inspect=localIntrusionSnapshot();
 assert.equal(inspect.blockedTotal>=12,true);
 assert.equal(inspect.productionWafVerified,false);
});

test('security perimeter never modifies Firebase user login, session persistence or OAuth tokens',async()=>{
 const source=(await import('node:fs')).readFileSync(
  new URL('../jarvis-local-intrusion-guard.js',import.meta.url),'utf8');
 for(const forbidden of ['signOut(', 'revokeRefreshTokens(', 'updatePassword(',
   'deleteUser(', 'disableUser(', 'setCustomUserClaims(', 'localStorage.clear(',
   'indexedDB.deleteDatabase(', 'firebase.auth.signOut('])
   assert.equal(source.includes(forbidden),false,forbidden);
 assert.equal(source.includes('blockedTotal++'),true);
 assert.equal(source.includes('res.status(403)'),true);
});
