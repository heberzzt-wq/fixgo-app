// Read-only source HTML recovery when Windows Chrome --dump-dom exits with no DOM.
// Never browse private networks, follow redirects, execute scripts or claim a rendered DOM.
import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';

const forbidden=new net.BlockList();
for(const [network,prefix] of [
  ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],
  ['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],
  ['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],
  ['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]
])forbidden.addSubnet(network,prefix,'ipv4');
for(const [network,prefix] of [
  ['::',128],['::1',128],['fc00::',7],
  ['fe80::',10],['ff00::',8],['2001:db8::',32]
])forbidden.addSubnet(network,prefix,'ipv6');

export function publicHtmlSourceUrl(raw){
 let url;
 try{url=new URL(String(raw||''));}catch{throw Error('BROWSER_PUBLIC_HTML_URL_INVALID');}
 const host=url.hostname.toLowerCase().replace(/\.$/,'');
 if(url.protocol!=='https:'||url.port&&url.port!=='443'||url.username||url.password||
   host.length>253||!host.includes('.')||net.isIP(host)!==0||
   /(?:^|\.)(?:localhost|local|internal|invalid|test|home|lan)$/.test(host))
    throw Error('BROWSER_PUBLIC_HTML_HTTPS_ONLY');
 return url;
}
export function isPublicHtmlAddress(address){
 const family=net.isIP(address);
 return family===4?!forbidden.check(address,'ipv4'):
   family===6&&!/^::ffff:/i.test(address)?!forbidden.check(address,'ipv6'):false;
}
export async function inspectPublicHtmlSource(raw,{
 lookup=dns.lookup,request=https.request,timeoutMs=15000,maxBytes=800000
}={}){
 const url=publicHtmlSourceUrl(raw);
 const resolved=await lookup(url.hostname,{all:true,verbatim:true});
 if(!Array.isArray(resolved)||!resolved.length||
    resolved.some(row=>!row||!isPublicHtmlAddress(row.address)||![4,6].includes(row.family)))
    throw Error('BROWSER_PUBLIC_HTML_DNS_PRIVATE_OR_EMPTY');
 const chosen=resolved.find(x=>x.family===4)||resolved[0];
 return await new Promise((resolve,reject)=>{
  let ended=false;
  const fail=e=>{if(ended)return;ended=true;reject(e instanceof Error?e:Error(String(e)));};
  const opts={
   method:'GET',headers:{'User-Agent':'Mozilla/5.0 JarvisV142-SafeHtmlInspection','Accept':'text/html'},
   lookup(_host,options,callback){
    if(typeof options==='function')callback=options;
    if(options?.all===true)callback(null,[chosen]);
    else callback(null,chosen.address,chosen.family);
   }
  };
  const req=request(url,opts,res=>{
   const code=Number(res.statusCode)||0;
   if(code!==200){res.resume();fail(Error('BROWSER_PUBLIC_HTML_HTTP_'+code));return;}
   const type=String(res.headers?.['content-type']||'').toLowerCase();
   if(!type.includes('text/html')){res.resume();fail(Error('BROWSER_PUBLIC_HTML_CONTENT_TYPE'));return;}
   if(Number(res.headers?.['content-length']||0)>maxBytes){res.destroy();fail(Error('BROWSER_PUBLIC_HTML_TOO_LARGE'));return;}
   const chunks=[];let total=0;
   res.on('data',chunk=>{
    total+=chunk.length;
    if(total>maxBytes){res.destroy();fail(Error('BROWSER_PUBLIC_HTML_TOO_LARGE'));return;}
    chunks.push(chunk);
   });
   res.on('error',fail);
   res.on('end',()=>{
    if(ended)return;
    const dom=Buffer.concat(chunks).toString('utf8');
    if(!/<html(?:\s|>)/iu.test(dom)||!/<title(?:\s|>)/iu.test(dom)||
       !/<(?:p|main|article)(?:\s|>)/iu.test(dom)){
      fail(Error('BROWSER_PUBLIC_HTML_STRUCTURE_UNVERIFIED'));return;
    }
    ended=true;resolve({ok:true,status:'BROWSER_INSPECT_SOURCE_HTML_VERIFIED',
      dom,sourceKind:'HTTPS_SOURCE_HTML_NOT_RENDERED_DOM',
      engine:'node_https_public_source',sourceBytes:total,readOnly:true});
   });
  });
  req.on('error',fail);
  req.setTimeout(Math.min(Math.max(timeoutMs,1000),25000),()=>req.destroy(Error('BROWSER_PUBLIC_HTML_TIMEOUT')));
  req.end();
 });
}
