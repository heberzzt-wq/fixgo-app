// Canonical inventory -> human-readable report. Read-only except regenerating
// the Markdown view; does not deploy, log in, inspect secrets, or change Firebase.
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const input=resolve(root,'docs/platform-master-manifest-v142.json');
const output=resolve(root,'docs/platform-master-manifest-v142.md');
const data=JSON.parse(readFileSync(input,'utf8'));
const tick=String.fromCharCode(96);
const code=v=>tick+String(v)+tick;
const esc=v=>String(v||'').replaceAll('|','/').replace(/\r?\n/g,' ').trim();
export const groups=['B2C','B2B','JARVIS','SEGURIDAD','OPERACIONES'];

export function validateManifest(m,{rootDir=root}={}){
 const errors=[],ids=new Set();
 if(m.schemaVersion!=='platform-master-v142-1'||m.branch!=='v142-official')errors.push('SCHEMA_OR_BRANCH_INVALID');
 if(!/^[a-f0-9]{40}$/i.test(m.auditedBaselineSha||''))errors.push('BASELINE_SHA_INVALID');
 if(!Array.isArray(m.workstreams)||m.workstreams.length<40)errors.push('INVENTORY_INCOMPLETE');
 if(m.governance?.noAutoDeploy!==true||m.governance?.noAutoFinancialWrites!==true||
  m.governance?.noAutomatedOwnerLockout!==true||m.governance?.productionCertified!==false)
  errors.push('AUTHORITY_GATES_MISSING');
 for(const w of m.workstreams||[]){
  if(!/^(?:B2C|B2B|JARVIS|SEC|OPS)-\d{2}$/.test(w?.id||'')||ids.has(w.id))errors.push('INVALID_ID:'+w?.id);
  ids.add(w.id);
  if(!groups.includes(w.domain))errors.push('UNKNOWN_GROUP:'+w.id);
  if(!['P0','P1','P2'].includes(w.priority))errors.push('UNKNOWN_PRIORITY:'+w.id);
  if(!Object.hasOwn(m.statusLegend||{},w.status))errors.push('UNKNOWN_STATUS:'+w.id);
  if(!w.production||!w.title||!w.gap||!w.acceptance)errors.push('INCOMPLETE:'+w.id);
  if(!Array.isArray(w.anchors)||w.anchors.length===0)errors.push('NO_ANCHOR:'+w.id);
  for(const f of w.anchors||[]){
   if(typeof f!=='string'||! /^[A-Za-z0-9./_-]+$/.test(f)||f.startsWith('/')||
     f.split('/').includes('..')){errors.push('UNSAFE_ANCHOR:'+w.id);continue;}
   if(!existsSync(resolve(rootDir,f)))errors.push('MISSING_ANCHOR:'+w.id+':'+f);
  }
 }
 for(const g of groups)if(!m.workstreams?.some(w=>w.domain===g))errors.push('EMPTY_GROUP:'+g);
 const counts=Object.fromEntries(groups.map(g=>[g,m.workstreams?.filter(w=>w.domain===g).length||0]));
 return {ok:errors.length===0,errors,total:m.workstreams?.length||0,
  p0:m.workstreams?.filter(w=>w.priority==='P0').length||0,counts};
}

export function renderManifest(m){
 const v=validateManifest(m);
 if(!v.ok)throw Error(v.errors.join('\n'));
 const lines=[
 '# Manifiesto maestro — Península Tech / FixGo / ADJUNTO V142',
 '',
 '**Corte de evidencia:** '+m.snapshotDate+' · **Base local:** '+code(m.branch)+
 ' / '+code(m.auditedBaselineSha.slice(0,8))+' · **Repositorio:** '+code(m.repository),
 '',
 '> Este documento es un INVENTARIO y plan de pruebas, NO una certificación de seguridad',
 '> ni autorización de despliegue. Los reportes históricos no demuestran el estado productivo actual.',
 '',
 '## Estado global verificable',
 '',
 '- **'+v.total+' frentes inventariados:** '+groups.map(g=>g+': '+v.counts[g]).join(' · ')+'.',
 '- **'+v.p0+' prioridades P0:** dependencias críticas o bloqueos de lanzamiento, no necesariamente vulnerabilidades explotables.',
 '- **B2C:** el forense de septiembre consideró bloqueada su apertura general; se necesita',
 '  nueva verificación remota de retiros, KYC, liquidaciones, Functions y reglas.',
 '- **B2B:** los módulos y pruebas de aislamiento existen, pero falta certificar E2E multiempresa en producción.',
 '- **Jarvis:** Qwen local y varias misiones/artefactos reales demostrados; falta autonomía repetible',
 '  de múltiples tareas, conectores OAuth y recuperación verdaderamente transversal.',
 '- **Seguridad:** perímetro web local probado. Un pentest externo, el control uniforme de rutas',
 '  privilegiadas y la seguridad pública son trabajos distintos.',
 '',
 '## Qué hay local y qué está publicado',
 '',
 '| Superficie | Evidencia de solo lectura | Conclusión segura |',
 '|---|---|---|',
 '| Código V142 auditado | '+code(m.auditedBaselineSha.slice(0,8))+
 ' | Código de la rama; NO prueba despliegue |',
 '| Contrato servido desde '+esc(m.productionEvidence.site)+' | '+
 code(m.productionEvidence.publicRuntimeBranch)+' | Rama diferente de V142 |',
 '| Manifiesto release de Hosting | '+code(m.productionEvidence.publicManifestSha.slice(0,8))+
 ' | SHA publicado distinto del local |',
 '| JS interno servido públicamente | '+m.productionEvidence.internalServerFilesPubliclyServed.map(code).join(', ')+
 ' | HTTP 200 observado; no implica acceso al proceso local |',
 '',
 '**Fecha de observación pública:** '+m.productionEvidence.observedDate+
 '. Se requiere volver a consultar tras cualquier despliegue autorizado.',
 '',
 '## Baterías observadas',
 '',
 '| Suite | Pasaron | Fallaron | Alcance |','|---|---:|---:|---|'
 ];
 for(const item of m.testObservations)lines.push('| '+esc(item.suite)+' | '+item.passed+
 ' | '+item.failed+' | '+esc(item.provenance)+' ('+item.asOf+') |');
 lines.push('', 'Las suites pueden solaparse: NO se suman como número de casos independientes.','');
 const names={B2C:'B2C — cliente, técnico, marketplace, pagos y soporte',
 B2B:'B2B — empresas, personal, supervisión y contratos',
 JARVIS:'Jarvis — IA local, agentes, herramientas y artefactos',
 SEGURIDAD:'Ciberseguridad, privilegios e intrusiones',
 OPERACIONES:'Operación, releases, respaldos y calidad'};
 for(const group of groups){
  lines.push('## '+names[group],'',
   '| ID | Prio | Capacidad | Estado de código | Evidencia productiva | Referencias | Próximo cierre |',
   '|---|---|---|---|---|---|---|');
  for(const item of m.workstreams.filter(w=>w.domain===group)){
   lines.push('| '+item.id+' | **'+item.priority+'** | '+esc(item.title)+
    ' | '+esc(m.statusLegend[item.status])+' | '+code(item.production)+
    ' | '+item.anchors.slice(0,3).map(code).join(', ')+
    ' | **Pendiente:** '+esc(item.gap)+' **Certificar:** '+esc(item.acceptance)+' |');
  }
  lines.push('');
 }
 lines.push('## Orden de cierre — P0 antes de funciones nuevas','',
 '1. **Acceso y dinero:** autenticar rutas privilegiadas, proteger al propietario',
 '   de bloqueos accidentales, verificar Functions legacy, retiros, KYC y reglas productivas.',
 '2. **Despliegue coordinado:** Hosting, Functions, Firestore y Storage con canarios y',
 '   validación de SHA; no publicar ni migrar usuarios automáticamente.',
 '3. **E2E real:** cliente-técnico-admin, empresa-supervisor-personal, sesiones',
 '   expiradas, cambio de red, cancelaciones, pagos sandbox y soporte.',
 '4. **Jarvis autónomo:** medir misiones reales, recuperación de errores, pruebas',
 '   Docker antes/después, calidad de documentos y observabilidad sin inventar éxito.',
 '5. **Conectores:** OAuth de lectura Gmail/Outlook/Zoho/Drive/Calendar/Meta;',
 '   aprobar individualmente cada operación de envío/publicación.',
 '6. **Resiliencia:** restauración, RTO/RPO, pruebas de caos, alarmas y rollback.',
 '',
 '## Requisito no-lockout del propietario',
 '',
 '- Rechazar una solicitud no autorizada NO autoriza bloquear cuentas, banear IP,',
 '  cerrar sesiones, cambiar credenciales, revocar tokens ni borrar información.',
 '- Cambiar de red NO equivale a intrusión. Revalidar identidad por token, rol y sesión.',
 '- Probar doce solicitudes hostiles y después acceso legítimo en laptop/móvil.',
 '- Mantener recuperación autenticada y reversible, sin bypass anónimo de emergencia.',
 '- No modificar autenticación de producción sin canario y plan de rollback.',
 '',
 '## «Nivel NASA»: objetivos de ingeniería crítica, no certificación de NASA',
 '',
 '| Control de calidad | Prueba exigida |','|---|---|',
 '| Identidad | 0 accesos transversales, dueño recuperable, MFA y revocación verificadas |',
 '| Seguridad | Auditoría independiente, controles de mínimos permisos y cero críticos abiertos |',
 '| Disponibilidad | SLO e incident response medidos 30 días con pruebas de falla real |',
 '| Datos | Backup cifrado y restauración ensayada con RTO/RPO |',
 '| Finanzas | Conciliación, idempotencia y seguridad del ledger, cero doble cobro/retiro |',
 '| IA autónoma | 30 misiones representativas de extremo a extremo, evidencias y correcciones bounded |',
 '| Release | CI, revisión humana, canary, monitoreo de despliegue y rollback seguro |',
 '',
 '## Cómo mantenerlo actualizado',
 '',
 '- **Fuente editable:** '+code('docs/platform-master-manifest-v142.json')+'.',
 '- **Generador:** '+code('node scripts/platform-master-manifest-v142.mjs')+'.',
 '- **Verificador:** '+code('node scripts/platform-master-manifest-v142.mjs --check')+'.',
 '- Cada frente debe conservar prueba concreta, pendiente, criterio de cierre y estado productivo.',
 '- Actualizar evidencias públicas después de cada release AUTORIZADO; este manifiesto es una instantánea.',
 ''
 );
 return lines.join('\n');
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const validation=validateManifest(data);
 if(!validation.ok){console.error('MANIFEST_INVALID',JSON.stringify(validation.errors));process.exitCode=1;}
 else{
  const markdown=renderManifest(data);
  if(process.argv.includes('--check')){
   const current=existsSync(output)?readFileSync(output,'utf8'):'';
   if(current!==markdown){console.error('MANIFEST_MARKDOWN_STALE');process.exitCode=1;}
   else console.log('MANIFEST_VERIFIED',JSON.stringify(validation));
  }else{
   writeFileSync(output,markdown,'utf8');
   console.log('MANIFEST_WRITTEN',JSON.stringify(validation));
  }
 }
}
