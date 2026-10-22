// Read-only daily platform inventory for V142, outside the official Git worktree.
// Never mutates Git, Firebase, credentials, owner sessions or production assets.
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import net from 'node:net';
import {validateManifest,groups} from './platform-master-manifest-v142.mjs';

export const REPO_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const REPORT_DIR=join(homedir(),'Documents','Jarvis-V142-Manifiestos');
const SHA=/^[a-f0-9]{40}$/iu;
const PORTS=['5000','3344','3345','11434'];
const safe=value=>String(value??'').replace(/[\r\n|]/gu,' ').slice(0,230);
const readJson=file=>{try{return JSON.parse(readFileSync(file,'utf8'));}catch{return null;}};
function git(args,root=REPO_ROOT){
 try{return execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:16000,
  windowsHide:true,stdio:['ignore','pipe','ignore']}).trim();}
 catch{return null;}
}
async function checkPort(port){
 return new Promise(resolve=>{
  const socket=net.connect({host:'127.0.0.1',port:Number(port)});
  let settled=false;
  const done=ok=>{if(settled)return;settled=true;socket.destroy();resolve(ok);};
  socket.setTimeout(900);socket.once('connect',()=>done(true));
  socket.once('error',()=>done(false));socket.once('timeout',()=>done(false));
 });
}
function runFastTests(root){
 const result=spawnSync(process.execPath,['--test',
  'tests/platform-master-manifest.test.mjs',
  'tests/jarvis-hosting-web-surface-security.test.mjs',
  'tests/jarvis-local-intrusion-guard.test.mjs'],{
    cwd:root,encoding:'utf8',timeout:45000,maxBuffer:1024*256,windowsHide:true
  });
 const lines=String(result.stdout||'').split(/\r?\n/u);
 const n=kind=>{
  const match=lines.map(line=>new RegExp('^(?:# |ℹ )?'+kind+' (\\d+)$','u').exec(line))
    .filter(Boolean);
  return match.length?Number(match.at(-1)[1]):null;
 };
 return {status:result.status===0?'DIRECTED_SUITE_PASSED':'DIRECTED_SUITE_FAILED',
  passed:n('pass'),failed:n('fail'),exitCode:result.status,
  timedOut:result.error?.code==='ETIMEDOUT',
  suite:'manifiesto + superficie de hosting + protección web localhost'};
}
function dateForZone(date){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const pick=type=>parts.find(x=>x.type===type)?.value;
 return pick('year')+'-'+pick('month')+'-'+pick('day');
}
export function buildDailyReport({manifest,head,previous=null,filesChanged=[],
  dirty=false,services={},tests=null,date=new Date()}={}){
 const check=validateManifest(manifest,{rootDir:REPO_ROOT});
 if(!check.ok)throw Error('MANIFEST_INVALID: '+check.errors.join(','));
 if(!SHA.test(head||''))throw Error('MANIFEST_HEAD_INVALID');
 const changed=new Set(filesChanged.map(s=>String(s).replace(/\\/g,'/')));
 const affected=manifest.workstreams.filter(item=>item.anchors.some(f=>changed.has(f)));
 const counts=Object.fromEntries(groups.map(g=>[
  g,affected.filter(w=>w.domain===g).length]));
 const stateCount=Object.fromEntries(Object.keys(manifest.statusLegend).map(s=>[
  s,manifest.workstreams.filter(w=>w.status===s).length]));
 return {schemaVersion:'platform-v142-daily-1',dateLocal:dateForZone(date),
  generatedAt:date.toISOString(),
  repo:{branch:manifest.branch,head,clean:!dirty,
   auditedBaselineSha:manifest.auditedBaselineSha,
   comparedFrom:previous?.repo?.head||manifest.auditedBaselineSha,
   changedTrackedFiles:[...changed].slice(0,100),changedFileCount:changed.size},
  platform:{total:check.total,p0:check.p0,domainCounts:check.counts,
   statusCounts:stateCount,touchedByDomain:counts,
   workstreamsTouched:affected.map(w=>w.id)},
  services:Object.fromEntries(PORTS.map(p=>[
   p,services[p]===true?'LISTENING':services[p]===false?'OFFLINE':'NOT_CHECKED'])),
  tests:tests||{status:'NOT_EXECUTED'},
  governance:manifest.governance,
  evidence:{masterSnapshotDate:manifest.snapshotDate,
   publicLastObservedDate:manifest.productionEvidence.observedDate,
   productionCertified:false,
   updatedStatusesAutomatically:false,
   note:'A changed anchor is not evidence of feature completion or a safe production release.'},
  warnings:[
   ...(dirty?['OFFICIAL_WORKTREE_DIRTY']:[]),
   ...(head===manifest.auditedBaselineSha?[]:['MASTER_BASELINE_NEEDS_REVIEW']),
   ...(tests?.status==='DIRECTED_SUITE_PASSED'?[]:['DAILY_DIRECTED_TESTS_NOT_CONFIRMED']),
   ...(manifest.productionEvidence.publicManifestSha===head?[]:['PUBLIC_RELEASE_NOT_RECHECKED'])
  ]};
}
export function renderDailyReport(report,manifest){
 const q=String.fromCharCode(96),lines=[
  '# Manifiesto diario — ADJUNTO / FixGo V142',
  '',
  '**Fecha local:** '+report.dateLocal+' · **Generado:** '+report.generatedAt,
  '**HEAD:** '+q+report.repo.head.slice(0,12)+q+
   ' · **Git limpio:** '+(report.repo.clean?'Sí':'NO'),
  '',
  'Este reporte NO certifica producción y nunca autoriza despliegues, pagos,',
  'bloqueo del propietario, revocación de sesiones ni publicación.',
  '',
  '## B2C, B2B, Jarvis, seguridad y operaciones',
  '',
  '| Dominio | Frentes | Anclas modificadas desde corte previo |',
  '|---|---:|---:|'
 ];
 for(const group of groups)
  lines.push('| '+group+' | '+report.platform.domainCounts[group]+' | '+
    report.platform.touchedByDomain[group]+' |');
 lines.push('','**Total:** '+report.platform.total+' frentes, '+
  report.platform.p0+' P0. No se convierten cambios en porcentajes ni aprobaciones.',
  '',
  '## Servicios locales','',
  '| Puerto | Estado |','|---|---|');
 for(const port of PORTS)lines.push('| '+port+' | '+report.services[port]+' |');
 lines.push('','## Prueba dirigida diaria','',
  '- '+safe(report.tests.suite||'No ejecutada')+' — '+report.tests.status+
  ' · '+(report.tests.passed??'s/d')+' aprobadas / '+
  (report.tests.failed??'s/d')+' fallidas.','',
  '## Frentes modificados que requieren comprobación','');
 for(const id of report.platform.workstreamsTouched){
  const w=manifest.workstreams.find(x=>x.id===id);
  lines.push('- '+id+' ['+w.priority+'] '+safe(w.title)+': **pendiente** '+
   safe(w.gap));
 }
 if(!report.platform.workstreamsTouched.length)
  lines.push('Sin cambios en anclas verificadas desde el corte anterior.');
 lines.push('','## P0 aún pendientes de cierre','');
 for(const w of manifest.workstreams.filter(w=>w.priority==='P0'))
  lines.push('- '+w.id+': '+safe(w.title)+' — producción: '+safe(w.production));
 lines.push('','## Regla de protección al propietario','',
  'Nunca bloquear IP, usuario, MFA o sesiones legítimas automáticamente por',
  'cambiar de red o realizar pruebas. No usar una vía de acceso anónima de emergencia.',
  '',
  '**Cambios detectados:** '+report.repo.changedFileCount,
  '**Advertencias:** '+(report.warnings.join(', ')||'ninguna'),
  '',
  '**Fuente de verdad editable:** docs/platform-master-manifest-v142.json.',
  'Este reporte histórico se guarda fuera del checkout oficial.','');
 return lines.join('\n');
}
export async function updateDailyManifest({root=REPO_ROOT,destination=REPORT_DIR,
 date=new Date(),runTests=true}={}){
 const manifest=readJson(join(root,'docs','platform-master-manifest-v142.json'));
 if(!manifest)throw Error('MASTER_MANIFEST_MISSING');
 const branch=git(['branch','--show-current'],root);
 if(branch!==manifest.branch)throw Error('OFFICIAL_BRANCH_REQUIRED');
 const head=git(['rev-parse','HEAD'],root);
 const previous=readJson(join(destination,'ultimo.json'));
 // Multiple updates on the same day accumulate all changes from that day's
 // first baseline rather than replacing them with only the last few commits.
 const today=dateForZone(date);
 const basis=previous?.dateLocal===today?
  previous.repo?.comparedFrom||previous.repo?.head:
  previous?.repo?.head||manifest.auditedBaselineSha;
 const anchor=SHA.test(basis)&&git(['cat-file','-t',basis],root)==='commit'?basis:head;
 const changed=git(['diff','--name-only',anchor+'..'+head],root);
 const filesChanged=(changed||'').split(/\r?\n/gu).filter(Boolean);
 const dirty=Boolean(git(['status','--porcelain'],root));
 const checks=await Promise.all(PORTS.map(checkPort));
 const services=Object.fromEntries(PORTS.map((p,i)=>[p,checks[i]]));
 const tests=runTests?runFastTests(root):{status:'NOT_EXECUTED'};
 const report=buildDailyReport({manifest,head,previous,filesChanged,dirty,services,tests,date});
 mkdirSync(destination,{recursive:true});
 const md=renderDailyReport(report,manifest),body=JSON.stringify(report,null,2)+'\n';
 for(const [filename,data] of [[report.dateLocal+'.json',body],
  [report.dateLocal+'.md',md],['ultimo.json',body],['ultimo.md',md]]){
  const filenameFull=join(destination,filename);
  const temp=filenameFull+'.tmp-'+process.pid;
  writeFileSync(temp,data,'utf8');
  renameSync(temp,filenameFull);
 }
 return {ok:true,date:report.dateLocal,head:head.slice(0,12),destination,
  total:report.platform.total,affected:report.platform.workstreamsTouched.length,
  tests:report.tests.status,clean:!dirty};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 updateDailyManifest({runTests:!process.argv.includes('--no-tests')})
  .then(result=>console.log('PLATFORM_MANIFEST_DAILY_OK '+JSON.stringify(result)))
  .catch(error=>{console.error('PLATFORM_MANIFEST_DAILY_FAILED '+error.message);
   process.exitCode=1;});
}
