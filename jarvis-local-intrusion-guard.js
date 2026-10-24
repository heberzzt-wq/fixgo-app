// V142 workstation web perimeter. Loopback alone is NOT browser authorization.
// Reject DNS rebinding, foreign Origins, cross-site requests without an
// authorized Origin, and malformed/duplicated Host headers before route logic.
// This does not replace independent Firebase owner authentication, release
// contracts or per-tool authorization on privileged operations.
const LOOPBACK_HOSTS=new Set(['127.0.0.1','localhost']);
export const JARVIS_BROWSER_ORIGINS=Object.freeze([
 'https://fixgo-44e4d.web.app',
 // Exact owner-controlled Firebase preview; no wildcard or arbitrary channel.
 'https://fixgo-44e4d--v142-jarvis-webtest-20261023-zht01nmx.web.app',
 'https://fixgo-44e4d.firebaseapp.com',
 'http://localhost:5000','http://127.0.0.1:5000',
 'http://localhost:5500','http://127.0.0.1:5500'
]);
const ALLOWED=new Set(JARVIS_BROWSER_ORIGINS);
const MAX_OBSERVED=24;
const recent=[];
let blockedTotal=0;
const reasons=new Map();

export function evaluateJarvisWebPerimeter({host='',origin=null,fetchSite='',
  localAddress='127.0.0.1',localPort=null,hostCount=1}={}){
 const deny=reason=>({ok:false,reason});
 if(hostCount!==1||typeof host!=='string'||!host||host.length>100||
    /[\s,@/\\]/u.test(host))return deny('HOST_HEADER_INVALID');
 const target=/^(127\.0\.0\.1|localhost)(?::([1-9]\d{0,4}))?$/iu.exec(host);
 if(!target||!LOOPBACK_HOSTS.has(target[1].toLowerCase()))return deny('HOST_NOT_LOOPBACK');
 if(target[2]&&Number(target[2])>65535)return deny('HOST_PORT_INVALID');
 if(Number.isInteger(localPort)&&localPort>0&&Number(target[2]||80)!==localPort)
   return deny('HOST_PORT_MISMATCH');
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(String(localAddress||'')))
   return deny('LISTENER_NOT_LOOPBACK');
 if(origin!==null&&origin!==undefined&&origin!==''){
   if(!ALLOWED.has(origin))return deny('UNTRUSTED_BROWSER_ORIGIN');
 }else if(['cross-site','same-site'].includes(String(fetchSite||'').toLowerCase())&&
    String(fetchSite||'').toLowerCase()==='cross-site'){
   return deny('ORIGIN_REQUIRED_FOR_CROSS_SITE');
 }
 return {ok:true,reason:'LOCAL_BROWSER_PERIMETER_ALLOWED'};
}

export function localIntrusionSnapshot(){
 const now=Date.now();
 const recentRejectedCount=recent.filter(x=>now-Date.parse(x.at)<=60000).length;
 return {status:'JARVIS_LOCAL_WEB_PERIMETER_ACTIVE',blockedTotal,
  blockedByReason:Object.fromEntries([...reasons.entries()].sort()),
  recentRejectedCount,alert:recentRejectedCount>=4?'REPEATED_UNAUTHORIZED_BROWSER_REQUESTS':'NONE',
  recent:recent.map(x=>({...x})),
  // This is a local warning, not a proven attacker identity or public WAF.
  scope:'loopback-http-browser-perimeter-only',productionWafVerified:false};
}
export function createJarvisLocalIntrusionGuard({onBlocked}={}){
 return (req,res,next)=>{
  const raw=req.rawHeaders||[];
  let hostCount=0;
  for(let i=0;i<raw.length;i+=2)if(String(raw[i]).toLowerCase()==='host')hostCount++;
  const decision=evaluateJarvisWebPerimeter({
   host:req.headers.host,hostCount,
   origin:req.headers.origin,fetchSite:req.headers['sec-fetch-site'],
   localAddress:req.socket?.localAddress,localPort:req.socket?.localPort
  });
  if(decision.ok)return next();
  blockedTotal++;
  reasons.set(decision.reason,(reasons.get(decision.reason)||0)+1);
  const event={reason:decision.reason,method:String(req.method||'').slice(0,8),
    route:String(req.path||'').slice(0,100),at:new Date().toISOString()};
  recent.push(event);if(recent.length>MAX_OBSERVED)recent.shift();
  try{onBlocked?.({...event});}catch{/* telemetry must not bypass the denial */}
  res.set('Cache-Control','no-store');
  return res.status(403).json({ok:false,status:'JARVIS_WEB_PERIMETER_DENIED',
    reason:decision.reason});
 };
}
