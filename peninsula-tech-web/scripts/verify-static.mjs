import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const check=(name,ok)=>{if(!ok)throw new Error(name);checks.push({name,pass:true});};
const checks=[];
const config=JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8'));
const rc=JSON.parse(fs.readFileSync(path.join(root,'.firebaserc'),'utf8'));
check('Only isolated static Hosting configured',Object.keys(config).length===1&&!!config.hosting&&!Array.isArray(config.hosting));
check('Exact separate project, never FixGo Blaze',rc.projects.default==='peninsula-tech-v01'&&JSON.stringify(rc).indexOf('fixgo-44e4d')<0);
check('Exact isolated site',config.hosting.target==='peninsula-tech'&&config.hosting.public==='public'&&rc.targets['peninsula-tech-v01'].hosting['peninsula-tech'].join(',')==='peninsula-tech-v01');
check('Actual deploy project cannot be changed',!process.env.GCLOUD_PROJECT||process.env.GCLOUD_PROJECT==='peninsula-tech-v01');
check('No backend rewrites',!config.hosting.rewrites);
const files=[];function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);check('Not symlink '+e.name,!e.isSymbolicLink());if(e.isDirectory())scan(p);else files.push(p);}}
scan(path.join(root,'public'));const manifest=[];
for(const p of files){const rel=path.relative(path.join(root,'public'),p).replaceAll('\\','/');const b=fs.readFileSync(p);check('Allowed static file '+rel,/\.(?:html|js|css|json|txt|webp|png|jpe?g|svg|ico)$/.test(rel)&&!/(?:^|\/)[.]/.test(rel));
if(/\.(html|js|css|json|txt)$/.test(rel)){const s=b.toString('utf8');check('No secret material '+rel,!/-----BEGIN [A-Z ]*PRIVATE KEY-----|\bya29\.[A-Za-z0-9_-]{20,}|\bEAA[A-Za-z0-9_-]{30,}|\bgh[pousr]_[A-Za-z0-9]{25,}/.test(s));}
manifest.push({file:rel,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});}
const totalBytes=manifest.reduce((n,x)=>n+x.bytes,0);check('Static public bundle under 1 MB',totalBytes<1000000);
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8'),js=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
check('Demo cannot send requests or persist data',!/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB)\b/.test(js));
check('No live external scripts',!/<script[^>]+src=["']https?:/i.test(html));
check('Nonindexed demo',html.includes('noindex'));
check('No external network allowed in CSP',config.hosting.headers.some(r=>r.headers.some(h=>h.key==='Content-Security-Policy'&&h.value.includes("connect-src 'none'")&&h.value.includes("form-action 'none'"))));
execFileSync(process.execPath,['--check',path.join(root,'public/app.js')]);check('JavaScript syntax valid',true);
fs.writeFileSync(path.join(root,'docs/public-manifest.json'),JSON.stringify({totalBytes,files:manifest},null,2)+'\n');
fs.writeFileSync(path.join(root,'docs/static-checks.json'),JSON.stringify({checkedAt:new Date().toISOString(),passed:checks.length,total:checks.length,publicBytes:totalBytes,checks},null,2)+'\n');
console.log(JSON.stringify({passed:checks.length,total:checks.length,publicBytes:totalBytes,project:'peninsula-tech-v01'}));
