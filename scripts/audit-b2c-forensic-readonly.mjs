import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const baseline = '3a81f4b2635ca767e04d5f6d2b87fd2091f7e7ca';
// Evaluate the deployed, dependency-free generated contract, not an in-progress repair.
const source = execFileSync('git', ['show', `${baseline}:functions/generated/b2c-platform-contract.cjs`], { encoding: 'utf8' });
const module = { exports: {} };
new Function('module', 'exports', 'require', source)(module, module.exports, require);
const contract = module.exports;
const candidate = require('../functions/b2c-platform-contract.js');
const token = process.env.FIREBASE_ACCESS_TOKEN;
if (!token) throw new Error('FIREBASE_ACCESS_TOKEN_REQUIRED');
const project = 'fixgo-44e4d';
const headers = { Authorization: `Bearer ${token}`, 'x-goog-user-project': project };
async function get(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`READ_HTTP_${response.status}`);
  return response.json();
}
function decode(v) {
  if (v?.mapValue) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k,x]) => [k,decode(x)]));
  if (v?.arrayValue) return (v.arrayValue.values || []).map(decode);
  for (const k of ['stringValue','booleanValue','timestampValue','integerValue','doubleValue','nullValue']) if (k in (v || {})) return ['integerValue','doubleValue'].includes(k) ? Number(v[k]) : v[k];
  return null;
}
async function list(name) {
  const out = []; let pageToken = '';
  do {
    const q = new URLSearchParams({ pageSize: '300', ...(pageToken ? { pageToken } : {}) });
    const data = await get(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${name}?${q}`);
    for (const d of data.documents || []) out.push({ id: d.name.split('/').pop(), data: decode({ mapValue: { fields: d.fields } }) });
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return out;
}
const [users, services, config] = await Promise.all([list('users'),list('services'),list('configuracion')]);
const technicians = users.filter(x => contract.normalizeToken(x.data.rol || x.data.role) === 'tecnico' && x.data.tipo_cuenta !== 'B2B');
const customers = users.filter(x => contract.normalizeToken(x.data.rol || x.data.role) === 'cliente' && x.data.tipo_cuenta !== 'B2B');
const aliases = new Map([...technicians.map((x,i) => [x.id,`T${i+1}`]), ...customers.map((x,i) => [x.id,`C${i+1}`])]);
const fields = ['rol','role','status','estado','tipo_cuenta','vehiculo','logistica','vehiculo_tipo','placas','kyc','documentos','verificado','aprobadoEn','pagos','efectivo_autorizado','stripeCustomerId','paymentMethodId','direccion','ubicacion','coordenadas'];
const report = { observed_at: new Date().toISOString(), baseline, read_only: true, totals: { users:users.length, services:services.length, technicians:technicians.length, customers:customers.length },
  technicians: technicians.map(x => { const p=x.data, migration=contract.technicianMigration(p); return {
    account: aliases.get(x.id), classification: migration.classification, reasons:migration.reasons,
    fields_present: fields.filter(k=>Object.hasOwn(p,k)), canonical_write_keys: Object.keys(migration.canonical || {}),
    candidate_classification: candidate.technicianMigration(p).classification,
    candidate_reasons: candidate.technicianMigration(p).reasons,
    status: ['activo','pendiente','pendiente_revision','suspendido','rechazado'].includes(p.estado) ? p.estado : 'other_or_absent',
    kyc_status: ['activo','pendiente','pendiente_revision','suspendido','rechazado'].includes(p.kyc?.estado) ? p.kyc.estado : 'other_or_absent',
    canonical_approval: p.kyc?.aprobado===true, legacy_verified: p.verificado===true, legacy_approval_timestamp: Boolean(p.aprobadoEn), available:p.disponible===true,
    eligibility: contract.technicianEligibility(p,{requireAvailable:false}).reason || 'eligible',
    document_keys: Object.keys(p.documentos || {}), kyc_keys:Object.keys(p.kyc || {}), vehicle_keys:Object.keys(p.vehiculo || {}),
    legacy_vehicle_keys: Object.keys(p.logistica || {})
  }; }),
  customers: customers.map(x => { const m=contract.paymentMigration(x.data); return { account:aliases.get(x.id), classification:m.classification, reasons:m.reasons, proposed:m.proposed,
    fields_present:fields.filter(k=>Object.hasOwn(x.data,k)), payment_permissions: {stripe:x.data.pagos?.stripe_autorizado===true,efectivo:x.data.pagos?.efectivo_autorizado===true,legacy_cash:x.data.efectivo_autorizado===true},
    has_cash_history:services.some(s=>s.data.cliente_id===x.id && s.data.metodo_pago==='efectivo') }; }),
  services: services.map((x,i)=>({service:`S${i+1}`,estado:x.data.estado,tipo:x.data.tipo,cliente_tipo:x.data.cliente_tipo,method:x.data.metodo_pago,customer:aliases.get(x.data.cliente_id)||'other',technician:aliases.get(x.data.tecnico_id)||'unassigned_or_other',fields_present:['cliente_id','clienteId','tecnico_id','tecnicoId','tipo_cuenta','cliente_tipo','liquidado','cierre_operativo_completado','cierre_financiero_pendiente_backend','work_evidence_binding_path','client_consent_binding_path'].filter(k=>Object.hasOwn(x.data,k))})),
  config: config.filter(x=>['catalogo_global','pagos','finanzas_global'].includes(x.id)).map(x=>({document:x.id,keys:Object.keys(x.data),boolean_flags:Object.fromEntries(Object.entries(x.data).filter(([,v])=>typeof v==='boolean'))})) };
const catalog=config.find(x=>x.id==='catalogo_global')?.data || {};
try {
  const ledger=await list('transacciones');
  report.ledger={documents:ledger.length};
  for (let i=0;i<services.length;i++) {
    const s=services[i];
    const links=ledger.filter(x=>x.data.servicio_id===s.id || x.data.serviceId===s.id || x.id===`txn_split_${s.id}`);
    Object.assign(report.services[i],{category:contract.getServiceDefinition(s.data)?.id || 'unknown',
      confirmed_destination:s.data.destino?.confirmado_por_cliente===true,
      paid_amount_present:Object.hasOwn(s.data,'monto_pagado'),liquidated:s.data.liquidado===true,
      linked_ledger_count:links.length,canonical_ledger_present:links.some(x=>x.id===`txn_split_${s.id}`)});
    try { await get(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/services/${encodeURIComponent(s.id)}/work_evidence_bindings/current`); report.services[i].work_binding_exists=true; }
    catch(e) { report.services[i].work_binding_exists=e.message==='READ_HTTP_404'?false:'unverified'; }
  }
} catch(e) {report.ledger={error:e.message};}
report.kyc_storage = [];
for (const technician of technicians) {
  const profile=contract.normalizeTechnicianProfile(technician.data);
  const refs={foto_perfil:profile.foto_perfil,ine:profile.documentos.ine,csf:profile.documentos.csf,licencia:profile.documentos.licencia};
  const checks={};
  for (const [kind,ref] of Object.entries(refs)) {
    if (!ref) { checks[kind]={status:'missing_reference'}; continue; }
    let object=typeof ref==='object' ? ref.storage_path : null;
    const url=typeof ref==='string' ? ref : ref.url;
    if (url) {
      try { const u=new URL(url); const marker='/v0/b/fixgo-44e4d.firebasestorage.app/o/';
        if(u.hostname!=='firebasestorage.googleapis.com' || !u.pathname.startsWith(marker)) throw new Error();
        object=decodeURIComponent(u.pathname.slice(marker.length));
      } catch { checks[kind]={status:'noncanonical_reference'};continue; }
    }
    if (!object) { checks[kind]={status:'missing_storage_path'};continue; }
    try { const m=await get(`https://storage.googleapis.com/storage/v1/b/fixgo-44e4d.firebasestorage.app/o/${encodeURIComponent(object)}`);
      checks[kind]={status:'exists',owner_path:object.startsWith(`expedientes/${technician.id}/`),size:Number(m.size),content_type:m.contentType,generation_present:Boolean(m.generation),approval_generation_pinned:technician.data.kyc?.evidencias?.[kind]?.generation===m.generation};
    } catch(e) { checks[kind]={status:e.message}; }
  }
  report.kyc_storage.push({account:aliases.get(technician.id),checks});
}
const tokenOwners = new Map();
for (const user of users) if (user.data.fcmToken) { const owners=tokenOwners.get(user.data.fcmToken)||[];owners.push(aliases.get(user.id)||'other_account');tokenOwners.set(user.data.fcmToken,owners); }
report.notifications={profiles_with_token:[...tokenOwners.values()].reduce((n,a)=>n+a.length,0),unique_tokens:tokenOwners.size,shared_token_account_groups:[...tokenOwners.values()].filter(a=>a.length>1)};
try { const failures=await list('failed_events'); report.failed_events={count:failures.length,retry_required:failures.filter(x=>x.data.retry_required===true).length}; } catch(e) {report.failed_events={error:e.message};}
report.hosting_assets=[];
for (const name of ['sw.js','platform-release.js','firebase.js','panel-cliente.js','panel-tecnico.js','tecnico.html','cliente.html','gestia-core/contracts/b2c-platform-contract.js']) {
  try { const response=await fetch(`https://fixgo-44e4d.web.app/${name}`,{signal:AbortSignal.timeout(20000),cache:'no-store'});
    if(!response.ok) throw new Error(`HTTP_${response.status}`);
    const content=await response.text(), expected=execFileSync('git',['show',`${baseline}:${name}`],{encoding:'utf8'});
    report.hosting_assets.push({file:name,sha256:createHash('sha256').update(content).digest('hex'),matches_release_bytes:content===expected,cache_control:response.headers.get('cache-control')});
  } catch(e) {report.hosting_assets.push({file:name,error:e.message.split('\n')[0]});}
}
report.catalog=Object.values(contract.SERVICE_CATALOG).flat().map(s=>({category:s.id,enabled:catalog[s.id]===true,
  compatible_available_deployed:technicians.filter(x=>contract.technicianEligibility(x.data,{requireAvailable:true}).ok && contract.isSkillCompatible(x.data,s.id)).length,
  compatible_available_candidate:technicians.filter(x=>candidate.technicianEligibility(x.data,{requireAvailable:true}).ok && candidate.isSkillCompatible(x.data,s.id)).length}));
report.rules = {};
for (const releaseId of ['cloud.firestore','firebase.storage/fixgo-44e4d.firebasestorage.app']) {
  try { const release=await get(`https://firebaserules.googleapis.com/v1/projects/${project}/releases/${releaseId}`);
    const rules=await get(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
    const text=(rules.source?.files||[]).map(x=>x.content||'').join('\n');
    report.rules[releaseId]={sha_marker:text.match(/GESTIA_RELEASE_SHA:([a-f0-9]{40})/)?.[1],sha256:createHash('sha256').update(text).digest('hex')};
    const file=releaseId==='cloud.firestore'?'security/firestore-console-snapshot-2026-07-30.rules.txt':'security/storage-hardening-candidate.rules.txt';
    const original=execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8'});
    const clean=t=>t.replace(/^.*GESTIA_RELEASE_SHA:.*\r?\n/gm,'').replace(/\r\n/g,'\n').trim();
    report.rules[releaseId].matches_deployed_source_ignoring_stamp=clean(text)===clean(original);
  } catch(e) { report.rules[releaseId]={error:e.message}; }
}
try { const deployed=await get(`https://cloudfunctions.googleapis.com/v1/projects/${project}/locations/-/functions`);
  report.functions=(deployed.functions||[]).map(x=>({name:x.name.split('/').pop(),status:x.status,entryPoint:x.entryPoint,runtime:x.runtime,eventType:x.eventTrigger?.eventType,updated_at:x.updateTime}));
} catch(e) { report.functions_error=e.message; }
fs.writeFileSync(new URL('../docs/v142-forensic-production-20260921.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({saved:'docs/v142-forensic-production-20260921.json',totals:report.totals,rules:report.rules,function_count:report.functions?.length,functions_error:report.functions_error},null,2));
