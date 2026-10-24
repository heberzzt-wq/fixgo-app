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
 if(!Array.isArray(m.ownerExecutionOrder)||m.ownerExecutionOrder.length!==5||
  m.ownerExecutionOrder.some((x,i)=>x.rank!==i+1||!x.track||!x.name||!x.goal)||
  new Set(m.ownerExecutionOrder.map(x=>x.track)).size!==5)
  errors.push('OWNER_EXECUTION_ORDER_INVALID');
 if(!/^[a-f0-9]{40}$/i.test(m.auditedBaselineSha||''))errors.push('BASELINE_SHA_INVALID');
 if(m.projectHistory?.ownerLabor){
  const l=m.projectHistory.ownerLabor;
  if(l.hoursPerDay!==12||l.daysPerWeek!==7||l.hoursPerWeek!==84||
     l.actualPaidSalaryVerified!==false||l.hourlyRateIsKnown!==false||
     !Array.isArray(l.estimatedHoursRange)||l.estimatedHoursRange[1]<l.estimatedHoursRange[0])
    errors.push('FOUNDERS_LABOR_EVIDENCE_INVALID');
 }
 if(m.productStrategy){
  const p=m.productStrategy;
  if(p.brand!=='ADJUNTO'||p.decisionDate!=='2026-10-23'||!p.businessModel.includes('No vende suscripciones')||
     !p.deployment.includes('Qwen3.5:9b')||!p.commercialBoundary.includes('no compra ni opera')||
     !p.autonomyBoundary.includes('aprobacion del propietario')||!p.notClaimed.includes('Vision'))
    errors.push('ADJUNTO_PRIVATE_STRATEGY_INVALID');
 }
 if(m.securityAutonomousGuardians){
  const g=m.securityAutonomousGuardians;
  if(g.status!=='META_PENDIENTE_NO_IMPLEMENTADA_NI_CERTIFICADA'||
     !Array.isArray(g.roles)||g.roles.length<6||
     !Array.isArray(g.guardrails)||!g.guardrails.some(x=>x.includes('propietario'))||
     !Array.isArray(g.acceptance)||g.acceptance.length<4||
     !Array.isArray(g.refs)||g.refs.some(id=>!m.workstreams?.some(w=>w.id===id))||
     !g.authority?.includes('activos propios'))errors.push('AUTONOMOUS_GUARDIANS_UNSAFE_OR_INCOMPLETE');
 }
 if(m.valueReadiness){
  const v=m.valueReadiness, expected=new Set(Array.from({length:11},(_,i)=>"VAL-"+String(i+1).padStart(2,"0")));
  if(v.baseline?.class!=="HIPOTESIS_CONVERSACIONAL_NO_AVALUO"||v.baseline.autoReprice!==false||
     v.evaluation?.missionSample!==30||v.evaluation?.noFakeSuccess!==true||!Array.isArray(v.gates)||v.gates.length!==11)
    errors.push("VALUE_READINESS_INVALID");
  for(const g of v.gates||[]){
   if(!expected.delete(g.id)||!["PENDIENTE","CERTIFICADO"].includes(g.status)||
      (g.status==="CERTIFICADO"&&(!Array.isArray(g.receipts)||g.receipts.length===0))||
      !g.criterion||!g.proof||!g.benefit||!Array.isArray(g.refs)||
      g.refs.some(id=>!m.workstreams?.some(w=>w.id===id)))errors.push("VALUE_GATE_INVALID:"+g.id);
  }
  if(expected.size)errors.push("VALUE_GATE_MISSING");
 }
 if(m.productStrategy?.northStar){
  const x=m.productStrategy.northStar;
  if(x.decisionDate!=="2026-10-23"||!x.nonCompetition.includes("No competir")||
   !x.originality.includes("no plagiar")||!x.privateOperation.includes("no vender ADJUNTO")||
   !x.executionOrder.includes("Primero terminar ADJUNTO")||
   !Array.isArray(x.measurableOutcomes)||x.measurableOutcomes.length<6||
   !x.realityCheck.includes("META")||!x.decisionBoundary.includes("propietario"))
   errors.push("ADJUNTO_NORTH_STAR_INVALID");
 }
 if(m.projectHistory?.refreshmentExpenses){
  const x=m.projectHistory.refreshmentExpenses;
  if(x.sixPacksPerReportedDay!==2||x.pricePerSixMXN!==112||
    x.reportedDailyTotalMXN!==224||!Array.isArray(x.illustrativeDaysRange)||
    x.illustrativeDaysRange[0]!==238||x.illustrativeDaysRange[1]!==243||
    !Array.isArray(x.illustrativeCostRangeMXN)||
    x.illustrativeCostRangeMXN[0]!==224*238||x.illustrativeCostRangeMXN[1]!==224*243||
    x.invoicesVerified!==false||x.verifiedDailyRecord!==false||
    !x.taxTreatment.includes("por verificar")||
    !x.valuationTreatment.includes("No se suma automaticamente"))
    errors.push("REFRESHMENT_EXPENSE_MATH_OR_PROVENANCE_INVALID");
 }

 if(m.latestHandoff||m.latestVerifiedCandidate){
  if(!/^[a-f0-9]{40}$/i.test(m.latestVerifiedCandidate?.sha||'')||
   m.latestHandoff?.verifiedCandidateSha!==m.latestVerifiedCandidate?.sha||
   m.latestHandoff?.deployment?.candidateSha!==m.latestVerifiedCandidate?.sha||
   !Array.isArray(m.latestHandoff?.completedActions)||m.latestHandoff.completedActions.length<1||
   !Array.isArray(m.latestHandoff?.nextSteps)||m.latestHandoff.nextSteps.length<1||
   m.latestVerifiedCandidate.productionCertified!==false||
   m.latestHandoff.deployment.status!=='BLOCKED_NOT_DEPLOYED')
   errors.push('LATEST_HANDOFF_UNVERIFIED');
 }
 if(!Array.isArray(m.workstreams)||m.workstreams.length<40)errors.push('INVENTORY_INCOMPLETE');
 if(m.governance?.noAutoDeploy!==true||m.governance?.noAutoFinancialWrites!==true||
  m.governance?.noAutomatedOwnerLockout!==true||m.governance?.productionCertified!==false)
  errors.push('AUTHORITY_GATES_MISSING');
 const dev=m.governance?.ownerDevelopmentAuthorization;
 if(dev && (dev.decision!=='AUTORIZACION_CONTINUA_DE_DESARROLLO_Y_COMMITS' ||
   dev.branch!=='v142-official'||dev.repository!==m.repository||
   dev.status!=='OWNER_DIRECTIVE_RECORDED_NOT_PRODUCTION_RELEASE'||
   !Array.isArray(dev.authorized)||dev.authorized.length<4||
   !Array.isArray(dev.limits)||dev.limits.length<4||
   !String(dev.pushPolicy||'').includes('despliegue')||
   dev.webTesting?.decision!=='CADA_CAMBIO_PROBABLE_EN_WEB'||
   dev.webTesting?.productionFunctionsRulesPaymentsAndOwnerAccessRequireSeparateGates!==true||
   !existsSync(resolve(rootDir,dev.webTesting?.automationScript||''))||
   m.governance.noAutoDeploy!==true||m.governance.noAutoFinancialWrites!==true))
   errors.push('OWNER_DEVELOPMENT_AUTHORIZATION_SCOPE_INVALID');
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

function renderOwnerNorthStar(m){
 const n=m.productStrategy?.northStar;
 if(!n)return [];
 const lines=[
  "## ESTRELLA POLAR - Meta irrenunciable de ADJUNTO","",
  "**Palabras y voluntad del propietario:** "+esc(n.ownerWords),"",
  "- **No competencia:** "+esc(n.nonCompetition),
  "- **Originalidad:** "+esc(n.originality),
  "- **Identidad unica:** "+esc(n.uniqueness),
  "- **Uso privado:** "+esc(n.privateOperation),
  "- **Que significa ser el mejor:** "+esc(n.excellenceDefinition),
  "- **Orden para llevarlo a la realidad:** "+esc(n.executionOrder),
  "- **Autoridad:** "+esc(n.decisionBoundary),
  "- **Regla para futuras decisiones:** "+esc(n.futureDecisionRule),
  "","### Resultados que demostrarian la meta",""
 ];
 for(const result of n.measurableOutcomes)lines.push("- "+esc(result));
 lines.push("","> **Sin triunfalismos:** "+esc(n.realityCheck),"");
 return lines;
}

function renderSecurityAutonomousGuardians(m){
 const g=m.securityAutonomousGuardians;
 if(!g)return [];
 const lines=[
  '## Escuadra de robots guardianes — ADJUNTO CYBER GUARDIANS',
  '',
  '**Decisión del propietario:** '+esc(g.decisionDate)+' · **Estado:** '+code(g.status),
  '',
  '**Inspiración B2B/Uxmal 39:** '+esc(g.inspiration),
  '',
  '**Misión:** '+esc(g.mission),
  '',
  '### Robots y responsabilidades',''
 ];
 for(const r of g.roles)lines.push('- **'+esc(r.id)+' '+esc(r.name)+':** '+esc(r.duty));
 lines.push('','### Superficies protegidas','');
 for(const item of g.coverage)lines.push('- '+esc(item));
 lines.push('','### Rondas y simulaciones','');
 for(const item of g.cadence)lines.push('- '+esc(item));
 lines.push('','### Reglas obligatorias','');
 for(const item of g.guardrails)lines.push('- '+esc(item));
 lines.push('','### Pruebas de cierre','');
 for(const item of g.acceptance)lines.push('- '+esc(item));
 lines.push('','**Frentes enlazados:** '+g.refs.map(code).join(', ')+'.');
 lines.push('','**Límite y orden de ejecución:** '+esc(g.authority),'');
 return lines;
}

function renderValueReadiness(m){
 const v=m.valueReadiness;
 if(!v)return [];
 const lines=[
  "## Certificacion operativa y valor de activos de Península Tech","",
  "**Proposito:** "+esc(v.purpose),
  "**Avance verificable:** "+v.gates.filter(g=>g.status==="CERTIFICADO").length+"/"+v.gates.length+
   " puertas certificadas; los 57 frentes de ingeniería continúan independientes.",
  "**Precio referencial HOY:** MXN $"+v.baseline.estimatedAssetsValueMXN.toLocaleString("en-US")+
   " (hipótesis conversacional, NO avalúo ni comprador).",
  "**Escenario condicional sin clientes:** MXN $"+v.baseline.potentialNoClientCertifiedRangeMXN[0].toLocaleString("en-US")+
   "–$"+v.baseline.potentialNoClientCertifiedRangeMXN[1].toLocaleString("en-US")+
   " (no automático y dependiente de evidencia y mercado).","",
  "| ID | Criterio de cierre | Evidencia exigida | Beneficio | Frentes | Estado |",
  "|---|---|---|---|---|---|"
 ];
 for(const g of v.gates)lines.push("| "+g.id+" "+esc(g.name)+" | "+esc(g.criterion)+
  " | "+esc(g.proof)+" | "+esc(g.benefit)+" | "+g.refs.map(code).join(", ")+" | "+code(g.status)+" |");
 lines.push("","### Prueba de autonomía y límites","",
  "- **Muestra:** "+v.evaluation.missionSample+" misiones; "+esc(v.evaluation.passCriterion),
  "- **Confiabilidad aspiracional:** "+esc(v.evaluation.futureReliabilityGoal),
  "","### Reglas que impiden inflar la valuación","");
 for(const rule of v.guardrails)lines.push("- "+esc(rule));
 lines.push("");return lines;
}

function renderPrivateProductStrategy(m){
 const p=m.productStrategy;
 if(!p)return [];
 return [
 '## Decision estrategica del propietario - ADJUNTO privado ('+esc(p.decisionDate)+')','',
 '**Identidad y posicionamiento:** '+esc(p.ownerDecision),
 '',
 '- **Marca:** '+esc(p.brand)+'. '+esc(p.naming)+'.',
 '- **Modelo comercial:** '+esc(p.businessModel),
 '- **Infraestructura:** '+esc(p.deployment),
 '- **Conectores:** '+esc(p.integrationBoundary),
 '- **Alcance previsto:** '+esc(p.ambition),
 '- **Autoridad:** '+esc(p.autonomyBoundary),
 '- **Relación con el cliente:** '+esc(p.commercialBoundary),
 '',
 '> **Alcance de esta decisión:** '+esc(p.notClaimed),
 ''
 ];
}

function renderProjectHistory(m){
 const p=m.projectHistory, labor=p?.ownerLabor;
 if(!p)return [];
 const lines=['## Historia e inversion de trabajo del fundador','',
  '- **Inicio aproximado:** '+esc(p.startedApprox)+'.',
  '- **Colaboracion inicial:** '+esc(p.initialCollaboration)+'.',
  '- **Continuidad:** '+esc(p.continuedCollaboration)+'.',
  '- **Duracion historica:** '+esc(p.durationAtOct2026)+'.',
  '- **Suscripcion reportada:** '+esc(p.userReportedSubscriptionMXN)+'. Sin comprobantes auditados.',
  ...(p.refreshmentExpenses?['- **Refrigerios de desarrollo reportados (sin comprobantes):** 2 six Tecate × MXN $112/six = **MXN $224/dia**; periodo ilustrativo de 238–243 dias: **MXN $53,312–$54,432**. '+esc(p.refreshmentExpenses.taxTreatment)+' '+esc(p.refreshmentExpenses.valuationTreatment)]:[]),
  ...(p.refreshmentExpenses?.actualDailyReports||[]).map(x=>'- **Refrigerios del '+esc(x.date)+' (declarado):** MXN $'+x.amountMXN+'; '+esc(x.source)+'. No se suma dos veces al calculo ilustrativo.'),
  ''
 ];
 if(labor){
  lines.push(
   '**Trabajo personal reportado:** '+labor.hoursPerDay+' horas diarias × '+labor.daysPerWeek+
    ' dias por semana = '+labor.hoursPerWeek+' h/semana.',
   '**Rango temporal estimado:** '+esc(labor.calendarStartRange)+
    ' a '+esc(labor.estimationThrough)+'. **Horas aproximadas:** '+
    labor.estimatedHoursRange[0].toLocaleString('en-US')+'–'+
    labor.estimatedHoursRange[1].toLocaleString('en-US')+'.',
   '',
   '| Tarifa hipotetica MXN/h | Costo del trabajo estimado MXN |',
   '|---:|---:|'
  );
  for(const v of labor.scenariosMXN){
   lines.push('| $'+v.hourlyRateMXN+' | $'+v.estimatedCostRangeMXN[0].toLocaleString('en-US')+
   ' – $'+v.estimatedCostRangeMXN[1].toLocaleString('en-US')+' |');
  }
  lines.push('',
   '**Contabilidad:** '+esc(labor.accountingRule),
   '**Valoracion:** '+esc(labor.marketValueRule),
   '**Estado del sueldo:** tarifa exacta no informada, pagos reales sin comprobar; se registra como costo de oportunidad, no efectivo pagado.',
   ''
  );
 }
 return lines;
}

function renderLatestHandoff(m){
 const h=m.latestHandoff,c=m.latestVerifiedCandidate;
 if(!h||!c)return [];
 const lines=[
  '## LEE ESTO PRIMERO - relevo y continuidad inmediata',
  '',
  '**Actualizado:** '+esc(h.asOf)+' | **Candidato certificado en local:** '+code(c.sha)+' | **Rama:** '+code(h.branch),
  '',
  '**Meta:** '+esc(h.instruction),
  '',
  '**Laptop:** '+code(h.workstation)+' | **Repositorio:** '+code(h.repositoryPath),
  '',
  '**Resumen:** '+esc(h.lastSessionSummary),
  '',
  '### Autorizacion de trabajo y commits del propietario',
  '',
  '**Decision:** '+esc(m.governance?.ownerDevelopmentAuthorization?.decision||'SIN AUTORIZACION CONTINUA REGISTRADA')+
    ' ('+esc(m.governance?.ownerDevelopmentAuthorization?.authorizedOn||'fecha no registrada')+').',
  '',
  '**Alcance:** '+esc(m.governance?.ownerDevelopmentAuthorization?.ownerInstruction||'Revisar con el propietario')+'.',
  '',
  '**CI y push:** '+esc(m.governance?.ownerDevelopmentAuthorization?.pushPolicy||'Sin permisos adicionales')+'.',
  '',
  '**Prueba web por cambio:** '+esc(m.governance?.ownerDevelopmentAuthorization?.webTesting?.workflow||'No configurado')+'.',
  '',
  '**Limite:** Los commits no son despliegues; mantienen controles de produccion, dinero, secretos y acceso.',
  '',
  '**Infraestructura actual al corte:** '+esc(h.infrastructure.bridge)+'; '+esc(h.infrastructure.model)+
   '; puertos '+h.infrastructure.ports.map(code).join(', ')+'.',
  '',
  '**Control de ventanas:** '+esc(h.infrastructure.browser),
  '',
  '### Entregas y acciones verificadas',
  ''
 ];
 for(const item of h.completedActions)lines.push('- '+esc(item));
 lines.push('',
  '### Evidencia tecnica certificada (sin elevarla a produccion)',
  '',
  '- CI completa: '+c.ci.passed+' PASS, '+c.ci.failed+' FAIL, '+c.ci.skipped+' SKIP. '+code(c.ci.command)+' (exit '+c.ci.exitCode+').',
  '- Hosting candidato: '+c.hostingPreview.uploadFiles+' archivos; '+c.hostingPreview.httpPublicPassed+
    ' HTTP publicos 200, '+c.hostingPreview.httpPrivateDenied+' privados 404, '+
    c.hostingPreview.brokenImports+' imports ausentes.',
  '- Pruebas fisicas de Qwen: '+c.localQwenSmokes.completed+'. '+esc(c.localQwenSmokes.scope)+'.',
  '',
  '### BLOQUEO ACTUAL: NO PUBLICADO',
  '',
  '- Estado: '+code(h.deployment.status)+'; causa: '+code(h.deployment.reason)+'.',
  '- SHA web: '+code(h.deployment.publishedSha)+'; candidato: '+code(h.deployment.candidateSha)+'.',
  '- '+esc(h.deployment.governance),
  '',
  '### Ruta de recuperacion para el siguiente chat',
  ''
 );
 for(const task of h.nextSteps)lines.push('1. '+esc(task));
 lines.push('',
  '### Recibos locales (en la laptop autorizada)',
  ''
 );
 for(const f of h.receipts)lines.push('- '+code(f));
 lines.push('',
  '### Reporte diario automatico',
  '',
  '- Leer '+code('C:/Users/heber/Documents/Jarvis-V142-Manifiestos/ultimo.md')+' y '+code('ultimo.json')+
    ' para observar cambios posteriores a este corte. Ese diario NO certifica cambios automaticamente.',
  '- Fuente de verdad de los 57 frentes: '+code('docs/platform-master-manifest-v142.json')+
    '; esta vista se regenera, nunca se edita a mano.',
  '',
  '---',
  ''
 );
 return lines;
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
 ...renderLatestHandoff(m),
 ...renderPrivateProductStrategy(m),
 ...renderOwnerNorthStar(m),
 ...renderSecurityAutonomousGuardians(m),
 ...renderValueReadiness(m),
 ...renderProjectHistory(m),
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
 lines.push('## Orden de ejecución decidido por el propietario — '+esc(m.ownerExecutionDecisionDate),'',
 ...m.ownerExecutionOrder.map(x=>x.rank+'. **'+esc(x.name)+':** '+esc(x.goal)+'.'),
 '',
 '**Alcance:** la clasificación P0 sigue indicando bloqueos de lanzamiento, no el orden de desarrollo.',
 'Se mantienen permisos mínimos, prohibición de despliegue y operaciones financieras sin aprobación.',
 'La auditoría integral de seguridad queda para la quinta etapa, antes de la apertura general.',
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
