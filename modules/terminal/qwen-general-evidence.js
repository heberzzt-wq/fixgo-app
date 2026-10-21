import {mediaDeliveryGaps,verifyMediaDelivery} from './qwen-general-media.js';
import {verifiedPosterCopy} from './qwen-poster-proof.js';
import {requiredDeliveryFormats,unfulfilledDownloadFormats,unavailableMissionOperations} from './qwen-general-contract.js';
import '../../gestia-core/contracts/b2c-platform-contract.js';
export const GENERAL_COUNT_FIELDS=['rol','role','tipo_cuenta','account_type','b2b_activo','sub_type','subtype'];
// Only when the instruction explicitly asks for Terminal -> local bridge -> executor
// does the verifier demand physical source proof for each authority boundary.
export function requiredEngineeringSourceFiles(instruction=''){
 const s=String(instruction||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase();
 if(/\b(?:terminal|adjunto|heberto)\b/u.test(s)&&
    /\bbridge\b/u.test(s)&&
    /\b(?:ejecutor|herramientas|runtime|tool)\b/u.test(s)&&
    /\b(?:autenticacion|firebase|sesion|token|permisos)\b/u.test(s))
   return ['modules/terminal/qwen-direct-transport.js','jarvis-workstation-health.js','jarvis-qwen-tool-bridge.js'];
 return [];
}

// Negative operating boundaries describe forbidden actions, not requests to perform them.
// Evaluate each clause independently so "sin deploy, pagos ni publicación" cannot
// cancel an actual positive request in a different sentence.
export function generalRestrictedActionRequested(instruction){
    const clauses=String(instruction||'').toLowerCase().split(/[.;\n]/u);
    const restricted=/\b(?:deploy|despliegue|desplegar|pagos?|pagar|publicar\s+en|publica\s+en)\b/giu;
    return clauses.some(clause=>{
        restricted.lastIndex=0;
        for(const m of clause.matchAll(restricted)){
            let prefix=clause.slice(0,m.index);
            // A positive instruction introduced after a contrast starts a new scope.
            prefix=prefix.split(/\b(?:pero|excepto|sin embargo|en cambio)\b/iu).at(-1);
            if(/\b(?:no|sin|evita|prohibido|prohibida)\b/iu.test(prefix))continue;
            // "Reporte de pagos" is financial data, not permission to
            // transfer money. Only a payment-execution imperative is restricted.
            if(/^pagos?$/iu.test(m[0]) &&
               !/\b(?:haz|hacer|realiza|realizar|efect[uú]a|efectuar|ejecuta|ejecutar|procesa|procesar|env[ií]a|enviar|transfiere|transferir|autoriza|autorizar)\s+(?:(?:un|una|el|los|las)\s+)?$/iu.test(prefix))
                continue;
            return true;
        }
        return false;
    });
}
// A negative sentence such as "no inventes un parche" is a constraint,
// never evidence that the user authorized or requested a code change.
export function codeConcurrencyRequested(instruction=''){
 return /\b(?:concurrenc\w*|idempotenc\w*|duplicad\w*|simult[aá]ne\w*|replay)\b/iu.test(String(instruction||''));
}
export function codeRepairRequested(instruction=''){
 const clauses=String(instruction||'').split(/[.;\n]/u);
 const change=/\b(?:corrige|corregir|repara|reparar|implementa|implementar|aplica|aplicar|modifica|modificar)\b/giu;
 const patch=/\b(?:prepara|preparar|crea|crear|genera|generar|entrega|entregar|produce|producir)\b[^.;\n]{0,75}\b(?:parche|patch|diff|correcci[oó]n)\b/giu;
 return clauses.some(clause=>{
  for(const pattern of [change,patch]){
   pattern.lastIndex=0;
   for(const match of clause.matchAll(pattern)){
    const prefix=clause.slice(0,match.index).split(/\b(?:pero|en cambio|entonces)\b/iu).at(-1);
    if(/\b(?:no|sin|nunca|evita|evitar|prohibido|prohibida)\b/iu.test(prefix))continue;
    return true;
   }
  }
  return false;
 });
}
// General engineering intent must not depend on one historical financial bug.
export function generalEngineeringRequested(instruction=''){
 const s=String(instruction||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase()
  .replace(/\b(?:sin|no|nunca|evita)\s+(?:modificar|modifiques|tocar|cambiar|editar|publicar|escribir)\s+(?:el\s+)?(?:codigo|repositorio|repo)\b/gu,'');
 const engineeringObject=/\b(?:codigo|repositorio|repo|javascript|typescript|backend|frontend|funcion(?:es)?|handler|endpoint|webhook|api|autenticacion|sesiones?|firebase|bridge|arquitectura|dependencias|seguridad|kyc|pruebas?|tests?|programacion|implementacion|modulos?\s+de\s+codigo)\b/u;
 const engineeringAction=/\b(?:audita|auditar|rastrea|rastrear|revisa|revisar|analiza|analizar|depura|depurar|diagnostica|diagnosticar|investiga|investigar|verifica|verificar|evalua|evaluar|refactoriza|refactorizar|implementa|implementar|programa|programar|escribe|escribir|desarrolla|desarrollar|prueba|probar|ejecuta|ejecutar|corrige|corregir|repara|reparar|explica|explicar)\b/u;
 const softwareContext=/\b(?:codigo|repositorio|repo|javascript|typescript|backend|frontend|funcion(?:es)?|handler|endpoint|webhook|api|firebase|bridge|kyc|arquitectura\s+de\s+(?:autenticacion|software)|pruebas?|tests?|programacion)\b/u;
 return engineeringAction.test(s)&&engineeringObject.test(s)&&softwareContext.test(s);
}
export function generalObjectives(instruction){
    const s=String(instruction).toLowerCase();
    const reel=/tiktok|reel|video|vídeo|mp4|h[.]?264/.test(s);
    const advertising=/tiktok|campaña|publicitari|publicidad/.test(s)||reel&&/texto comercial|logo oficial|contacto verificado|anuncio|marketing/.test(s);
    const code=generalEngineeringRequested(instruction)||unavailableMissionOperations(instruction).some(x=>x.includes('parches'))||/\b(?:requestpayout|bug)\b/iu.test(s);
    const requestedImageFormats=advertising?[...new Map([...s.matchAll(/\b(\d{2,4})\s*[x×]\s*(\d{2,4})\b/g)].map(m=>[m[1]+'x'+m[2],{width:Number(m[1]),height:Number(m[2])}])).values()]:[];
    return {code,reel,prohibited:generalRestrictedActionRequested(s),advertising,capabilities:/capacidades|system\.capabilities|inventario de herramientas/.test(s),research:!code&&/investig|fuentes|webgpu|actualidad/.test(s),page:/landing|(?:crea|genera|diseña|construye|haz)[\s\S]{0,100}(?:página|pagina|html)/.test(s),
        records:!code&&/firestore|b2c|técnicos|tecnicos|users/.test(s),document:/documento|document\.create|export|informe descargable/.test(s)||requiredDeliveryFormats(s).length>0||(advertising&&reel),
        ...(requestedImageFormats.length?{requestedImageFormats}:{}),current:/actual|reciente|hoy|vigente/.test(s),unsupported:reel||advertising||/imagen/.test(s)||generalRestrictedActionRequested(s)};
}
export function verifyGeneralCount(receipts,now=Date.now()){
    for(const r of [...receipts].reverse()){
        const e=r.observation?.recordEvidence,s=e?.scope;
        if(!r.ok||r.name!=='platform.query'||e?.source!=='FIRESTORE_SERVER_AUTHENTICATED'||e.readOnly!==true||s?.collection!=='users'||s.mode!=='query')continue;
        if(JSON.stringify(s.filters)!==JSON.stringify([{field:'rol',op:'==',value:'tecnico'}]))continue;
        const time=Date.parse(e.rowsObservedAt);
        if(!Number.isFinite(time)||now-time>300000||time>now+5000||e.previousCursor||e.hasMore!==false||e.queryExhausted!==true||
            !Array.isArray(e.rows)||e.totalCount!==e.rows.length||e.returnedCount!==e.rows.length||new Set(e.rows.map(x=>x.id)).size!==e.rows.length||
            e.truncatedFields?.length||!Array.isArray(s.implicitExistenceFields)||s.implicitExistenceFields.length)continue;
        const schema=e.fieldSchema,absent=f=>schema?.source==='SERVER_RECORD_FIELD_NAMES'&&schema.sampledRows===e.rows.length&&
            ((schema.completeForObservedRows===true&&!schema.paths.includes(f))||(schema.completeRootPaths===true&&!schema.rootPaths.includes(f)));
        if(GENERAL_COUNT_FIELDS.some(f=>!s.fields?.includes(f)&&!absent(f)))continue;
        if(e.rows.some(row=>GENERAL_COUNT_FIELDS.some(f=>!Object.hasOwn(row.values||{},f)&&!absent(f))))continue;
        const excluded=e.rows.filter(row=>globalThis.GestiaB2CPlatformContract.isB2BAccountProfile(row.values)).length;
        return {ok:true,data:{authorizedTechnicians:e.rows.length,b2c:e.rows.length-excluded,b2bExcluded:excluded,observedAt:e.rowsObservedAt},reason:'SERVER_COUNT_AND_ROWS_MATCH'};
    }
    return {ok:false,reason:'CURRENT_COMPLETE_AUTHORIZED_TECHNICIAN_COUNT_REQUIRED',requiredFields:GENERAL_COUNT_FIELDS};
}
const good=receipts=>receipts.filter(r=>r.ok&&r.observation?.ok===true);
// The document describes physical production, never its own certification status.
export function validateProductionDocument(content,receipts,objectives={advertising:true}){
    const issues=[],fail=reason=>issues.push(reason),text=typeof content==='string'?content:'';
    if(/VERIFIED_COMPLETE/i.test(text))fail('DOCUMENT_SELF_CERTIFICATION_FORBIDDEN');
    let doc;try{doc=JSON.parse(text);}catch{fail('PRODUCTION_DOCUMENT_JSON_REQUIRED');}
    if(!doc||typeof doc!=='object'||Array.isArray(doc))return {ok:false,reason:issues[0]||'PRODUCTION_DOCUMENT_JSON_REQUIRED',issues};
    const rows=good(receipts),physical=rows.flatMap(r=>r.name==='image.adapt'?r.observation.outputs||[]:
        ['speech.synthesize','reel.create','page.create'].includes(r.name)?[r.observation]:[]);
    const digest=o=>o?.sha256||(o?.artifact?.file===o?.output?o?.artifact?.sha256:undefined);
    const resources=Array.isArray(doc.resources)?doc.resources:[];
    if(!resources.length||resources.some(a=>!a||typeof a.output!=='string'||!/^[a-f0-9]{64}$/i.test(a.sha256||'')||!physical.some(p=>p.output===a.output&&digest(p)===a.sha256)))fail('DOCUMENT_PHYSICAL_RESOURCE_BINDING_REQUIRED');
    if(!Array.isArray(doc.limitations)||!doc.limitations.length||doc.limitations.some(x=>typeof x!=='string'||!x.trim()))fail('DOCUMENT_LIMITATIONS_REQUIRED');
    if(objectives.reel){
        // The screenplay must describe the final production candidate, not an earlier rejected cut.
        const reel=[...rows].reverse().find(r=>r.name==='reel.create');
        const speech=reel&&rows.find(r=>r.name==='speech.synthesize'&&r.observation.output===reel.args?.audioOutput);
        const scenes=doc.scenes,actual=reel?.args?.scenes;
        if(!speech||typeof doc.narration!=='string'||!doc.narration.trim()||doc.narration!==speech.args?.text)fail('DOCUMENT_NARRATION_RECEIPT_MISMATCH');
        if(!reel||!Number.isFinite(doc.durationSeconds)||doc.durationSeconds!==reel.args?.durationSeconds||!Array.isArray(scenes)||scenes.length<3||!Array.isArray(actual)||scenes.length!==actual.length||scenes.some((s,i)=>!s||!Number.isFinite(s.durationSeconds)||s.durationSeconds<=0||['durationSeconds','assetOutput','overlay','subtitle'].some(k=>s[k]!==actual[i]?.[k])||typeof s.overlay!=='string'||!(s.overlay.trim()||verifiedPosterCopy(actual[i],receipts))||typeof s.subtitle!=='string'||!s.subtitle.trim())||Math.abs((Array.isArray(scenes)?scenes:[]).reduce((n,s)=>n+(s?.durationSeconds||0),0)-doc.durationSeconds)>.01)fail('DOCUMENT_SCENE_TIMELINE_RECEIPT_MISMATCH');
        const required=[reel?.observation.output,speech?.observation.output,...(actual||[]).map(s=>s.assetOutput)].filter(Boolean);
        if(required.some(output=>!resources.some(a=>a.output===output)))fail('DOCUMENT_ALL_PRODUCTION_RESOURCES_REQUIRED');
    }
    return {ok:issues.length===0,reason:issues[0]||'PRODUCTION_DOCUMENT_RECEIPTS_MATCH',issues};
}
const researchText=html=>String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
export function advertisingSourceText(html){
 const dom=String(html||''),title=researchText(dom.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
 const body=(dom.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||dom.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||dom).replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
 return title+'\n'+researchText(body);
}
export function researchSourceProofs(receipts,instruction=''){
    const rows=good(receipts),urls=new Set(rows.filter(r=>r.name==='web.research').flatMap(r=>(r.observation.sources||[]).map(s=>s.url)));
    return rows.filter(r=>r.name==='browser.inspect'&&urls.has(r.observation.url)&&r.observation.dom).map(r=>{
        const dom=r.observation.dom,title=researchText(dom.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
        const content=(dom.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||dom).replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
        const paragraphs=[...content.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>researchText(m[1]));
        if(!paragraphs.length)paragraphs.push(researchText(content));
        const terms=title.toLowerCase().match(/[\p{L}\p{N}]{5,}/gu)||[];
        const quotes=[...new Set(paragraphs.filter(p=>p.split(/\s+/).length>=8).map(p=>p.split(/\s+/).slice(0,20).join(' ')).filter(q=>q.length>=32&&researchText(content).includes(q)&&!/[{};]/.test(q)&&!/\.ast-|menu-item-|display:|line-height:|vertical-align:|@media|css\b/i.test(q)&&researchQuoteRelevant(q,instruction,title)))].slice(0,8);
        const dates=[...new Set(dom.match(/\b20\d{2}[-/]\d{2}[-/]\d{2}\b/g)||[])].filter(d=>{const t=Date.parse(d);return Number.isFinite(t)&&t<=Date.now()+86400000&&Date.now()-t<=366*86400000;});
        return {url:r.observation.url,title,quotes,dates};
    }).filter(p=>p.title&&p.quotes.length);
}
export function verifiedEngineeringAssignmentWitness(receipts=[]){
 return good(receipts).filter(r=>r.name==='repo.read'&&r.args?.file===r.observation?.verifiedRead?.file&&
   /^functions\/(?:index|secure-entry)\.[cm]?js$/i.test(r.args.file)&&
   typeof r.observation.verifiedRead.content==='string').map(r=>{
   const lines=r.observation.verifiedRead.content.split(/\r?\n/),assignments=[];
   lines.forEach((source,i)=>{
     if(/^\s*exports\.(?:solicitarRetiro|requestPayout)\s*=/.test(source))
       assignments.push({line:i+1,source:source.trim().slice(0,180),
         nextLine:lines[i+1]?.trim().slice(0,180)||''});
   });
   return {file:r.args.file,assignments,duplicateAssignment:assignments.length>1,
     interpretation:assignments.length>1?'Last top-level assignment replaces the earlier export; do not attribute old handler checks to the effective one.':'Do not infer overwritten handlers.'};
 }).filter(w=>w.assignments.length>0);
}
export function summarizeGeneralEvidence(receipts,objectives,instruction=''){
    const rows=good(receipts),sources=rows.filter(r=>r.name==='web.research').flatMap(r=>r.observation.sources||[]);
    const proofs=researchSourceProofs(receipts);
    const has=name=>rows.some(r=>r.name===name),records=objectives.records?verifyGeneralCount(receipts):null;
    const gaps=mediaDeliveryGaps(receipts,objectives);
    for(const format of unfulfilledDownloadFormats(instruction,receipts))gaps.push({goal:'requested downloadable '+format,requiredTool:'document.create',format});
    if(objectives.capabilities&&!has('system.capabilities'))gaps.push({goal:'live registered capability inventory',requiredTool:'system.capabilities'});
    if(objectives.records&&!records?.ok)gaps.push({goal:'authorized complete counts',requiredTool:'platform.query',reason:records.reason});
    if(objectives.code){
        for(const file of requiredEngineeringSourceFiles(instruction)){
            if(!rows.some(r=>r.name==='repo.read'&&r.args?.file===file&&r.observation?.verifiedRead?.file===file&&typeof r.observation.verifiedRead.content==='string'))
                gaps.push({goal:'verified authentication boundary: '+file,requiredTool:'repo.read',file,reason:'ENGINEERING_AUTH_BOUNDARY_SOURCE_REQUIRED'});
        }
        if(!has('repo.grep')||!has('repo.read'))gaps.push({goal:'repository code proof',requiredTool:'repo.read',reason:'CODE_SOURCE_EVIDENCE_REQUIRED'});
        if(!rows.some(r=>r.name==='tests.run'&&r.observation.testsPassed===true&&r.observation.objectiveSatisfied===true))
            gaps.push({goal:'passing physical repository tests',requiredTool:'tests.run',reason:'CODE_TESTS_PASSING_REQUIRED'});
        if(codeConcurrencyRequested(instruction)&&!rows.some(r=>r.name==='tests.run'&&r.args?.command==='v142:security-emulator'&&r.observation?.status==='PASSED'&&r.observation?.testsPassed===true&&r.observation?.objectiveSatisfied===true&&r.observation?.exitCode===0))
            gaps.push({goal:'physical concurrent payout and idempotency emulator tests',requiredTool:'tests.run',command:'v142:security-emulator',reason:'CODE_CONCURRENCY_EMULATOR_EVIDENCE_REQUIRED'});
        if(codeRepairRequested(instruction))
            gaps.push({goal:'governed isolated repair and before-after regression receipts',requiredTool:'repo.prepareWrite',reason:'ISOLATED_CODE_REPAIR_NOT_IMPLEMENTED'});
    }
    if(objectives.research&&!objectives.advertising&&(requiredDeliveryFormats(instruction).length?independentResearchProofs(receipts,instruction).length:new Set(proofs.map(p=>p.url)).size)<3)gaps.push({goal:'three independently opened and quoted sources',requiredTool:'browser.inspect'});
    if(objectives.page)for(const name of ['page.create','browser.open','browser.inspect','browser.screenshot','media.analyze','artifact.read'])if(!has(name))gaps.push({goal:'page evidence',requiredTool:name});
    if(objectives.document||objectives.advertising&&objectives.reel){if(!has('document.create'))gaps.push({goal:'physical downloadable document',requiredTool:'document.create',content:records?.ok?JSON.stringify(records.data):undefined});
        else if(!rows.some(r=>r.name==='artifact.read'&&rows.some(d=>d.name==='document.create'&&d.observation.output===r.observation.output)))gaps.push({goal:'document read-back',requiredTool:'artifact.read'});}
    if(objectives.advertising)for(const doc of rows.filter(r=>r.name==='document.create')){
        const validation=validateProductionDocument(doc.args?.content,receipts,objectives);
        if(!validation.ok)gaps.push({goal:'production document bound to receipts',requiredTool:'document.create',reason:validation.reason});
        if(!rows.some(r=>r.name==='media.library'&&r.args?.action==='export'&&r.args.output===doc.observation.output&&r.observation.sha256===doc.observation.sha256&&r.observation.experimental===true))gaps.push({goal:'registered production document export',requiredTool:'media.library',action:'export',output:doc.observation.output});
    }
    return {objectives,records,...(objectives.code?{sourceAssignmentWitness:verifiedEngineeringAssignmentWitness(receipts),
        engineeringSourceRequirements:requiredEngineeringSourceFiles(instruction),
        engineeringExecutedTests:rows.filter(r=>r.name==='tests.run'&&r.observation?.status==='PASSED'&&r.observation?.testsPassed===true&&r.observation?.exitCode===0).map(r=>({command:r.args.command,status:r.observation.status,testsPassed:true,exitCode:0}))}:{}),deliveryGaps:gaps,finishEligible:gaps.length===0&&(!objectives.unsupported||objectives.advertising||has('system.capabilities')),

        pendingVisualReviews:objectives.page?rows.filter(r=>r.name==='browser.screenshot'&&!rows.some(v=>v.name==='media.analyze'&&v.observation.output===r.observation.output)).map(r=>({requiredTool:'media.analyze',output:r.observation.output,reason:'Screenshot alone is not visual review. Execute media.analyze on these pixels before FINISH.'})):[],
        openedSources:rows.filter(r=>r.name==='browser.inspect').map(r=>({url:r.observation.url,title:String(r.observation.dom||'').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim(),hasDom:!!r.observation.dom})),
        ...(objectives.research&&!objectives.advertising&&proofs.length?{reportSchema:{type:'object',properties:{sources:{type:'array',minItems:3,maxItems:4,items:{anyOf:proofs.map(p=>({type:'object',properties:{url:{const:p.url},title:{const:p.title},date:{enum:[...p.dates,null]},quote:{enum:p.quotes}},required:['url','title','date','quote'],additionalProperties:false}))}}},required:['sources'],additionalProperties:false}}:{}),
        sources:sources.map(s=>({url:s.url,title:s.title})).slice(0,12),
        artifacts:rows.filter(r=>['page.create','document.create'].includes(r.name)).map(r=>({output:r.observation.output,sha256:r.observation.sha256,url:r.observation.url})),
        rule:'FINISH requires independent verification. Search snippets alone do not establish current facts. Read sources with browser.inspect. Read produced files with artifact.read. A screenshot is a capture, not semantic visual inspection.'};
}
// A successful tool loop is not a finished engineering deliverable. Ground the
// written diagnosis in source paths actually read and a passing test receipt.
// A non-financial engineering report is certified against its own source
// receipts, never forced to cite the payout handler from an unrelated mission.
function genericEngineeringReportIssues(report,receipts=[],instruction=''){
 const text=String(report||'').trim(),issues=[],rows=good(receipts);
 const reads=rows.filter(r=>r.name==='repo.read'&&r.args?.file===r.observation?.verifiedRead?.file&&
  typeof r.observation.verifiedRead.content==='string'&&r.observation.verifiedRead.content.length>=120&&
  /^(?:functions|modules|gestia-core|tests)\/|^jarvis-[\w.-]+\.[cm]?js$/i.test(r.args.file));
 const executed=rows.filter(r=>r.name==='tests.run'&&r.observation?.status==='PASSED'&&
  r.observation?.testsPassed===true&&r.observation?.objectiveSatisfied===true&&r.observation?.exitCode===0);
 const cited=reads.filter(r=>text.includes(r.args.file));
 for(const required of requiredEngineeringSourceFiles(instruction)){
    if(!reads.some(r=>r.args.file===required))issues.push('READ_REQUIRED_BOUNDARY_SOURCE:'+required);
    else if(!text.includes(required))issues.push('CITE_REQUIRED_BOUNDARY_SOURCE:'+required);
 }
 if(text.length<180||text.length>10000)issues.push('ENGINEERING_DIAGNOSIS_LENGTH_INVALID');
 if(!reads.length)issues.push('VERIFIED_ENGINEERING_SOURCE_REQUIRED');
 if(!cited.length)issues.push('CITE_ACTUALLY_READ_SOURCE_PATH');
 if(!executed.length)issues.push('EXECUTED_PASSING_TEST_RECEIPT_REQUIRED');
 else if(!executed.some(r=>text.includes(r.args.command)))issues.push('REPORT_EXECUTED_TEST_COMMAND_REQUIRED');
 if(!/\b(?:tests?|pruebas?|suite|regresiones?)\b/iu.test(text))issues.push('TEST_SCOPE_EXPLANATION_REQUIRED');
 const domain=String(instruction||'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase();
 if(/\b(?:autenticacion|sesion|permisos|firebase|bridge|uid)\b/.test(domain)){
  const src=cited.some(r=>/\b(?:auth|token|session|role|uid|firebase|verifyidtoken|bridge)\b/i.test(r.observation.verifiedRead.content));
  const reportDomain=/\b(?:auth|autenticaci\w*|sesion(?:es)?|token|rol(?:es)?|permisos?|uid|firebase|bridge)\b/iu.test(text);
  if(!src||!reportDomain)issues.push('AUTHENTICATION_SOURCE_AND_DIAGNOSIS_REQUIRED');
 }
 if(/\b(?:kyc|biometria|identidad)\b/.test(domain)){
  const src=cited.some(r=>/\b(?:kyc|identity|identidad|biometric|verification|verificacion)\b/iu.test(r.observation.verifiedRead.content));
  if(!src||!/\b(?:kyc|identidad|biometria|verificacion)\b/iu.test(text))
   issues.push('IDENTITY_SOURCE_AND_DIAGNOSIS_REQUIRED');
 }
 return issues;
}
export function engineeringReportIssues(report,receipts=[],instruction=''){
 if(instruction&&!/\b(?:requestpayout|solicitarretiro)\b/i.test(instruction))return genericEngineeringReportIssues(report,receipts,instruction);
 const text=String(report||'').trim(),rows=good(receipts),issues=[];
 const reads=rows.filter(r=>r.name==='repo.read'&&r.observation?.verifiedRead?.file===r.args?.file);
 const canonical=reads.find(r=>/^functions\/(?:index|secure-entry)\.[cm]?js$/i.test(r.args?.file)&&typeof r.observation?.verifiedRead?.content==='string'&&/solicitarRetiro|Number\.isFinite/iu.test(r.observation.verifiedRead.content));
 const tested=rows.find(r=>r.name==='tests.run'&&r.observation?.testsPassed===true&&r.observation?.objectiveSatisfied===true&&r.observation?.status==='PASSED'&&r.observation?.exitCode===0);
 if(text.length<180||text.length>10000)issues.push('DICTAMEN_TECNICO_180_A_10000_CARACTERES');
 if(!canonical)issues.push('LECTURA_CANONICA_VERIFICADA_FALTANTE');
 else {
   if(!text.includes(canonical.args.file))issues.push('CITAR_RUTA_CANONICA_LEIDA');
   const assignments=[...canonical.observation.verifiedRead.content.matchAll(/\bexports\.(?:solicitarRetiro|requestPayout)\s*=/gu)];
   if(assignments.length>1&&!/sobrescri|redefin|reemplaz|segunda\s+asignaci|[uú]ltima\s+asignaci|definici[oó]n\s+final|asignaci[oó]n\s+final/iu.test(text))
     issues.push('DIFERENCIAR_EXPORT_DUPLICADO_Y_ULTIMA_ASIGNACION');
 }
 if(!tested)issues.push('RECIBO_DE_TESTS_PASADOS_FALTANTE');
 if(tested&&!text.includes(tested.args?.command||'pilot:security'))issues.push('NOMBRAR_COMANDO_TESTS_EJECUTADO');
 if(!/requestPayout|solicitarRetiro/iu.test(text))issues.push('IDENTIFICAR_FUNCION');
 if(!/\b(?:pruebas?|tests?|suite|regresiones?)\b/iu.test(text))issues.push('EXPLICAR_ALCANCE_DE_PRUEBAS');
 if(!/\b(?:importe|monto|cantidad|negativ|finito|nan|cero|validaci[oó]n)\b/iu.test(text))issues.push('EXPLICAR_VALIDACION_MONETARIA');
 const emulator=rows.some(r=>r.name==='tests.run'&&r.args?.command==='v142:security-emulator'&&r.observation?.status==='PASSED'&&r.observation?.exitCode===0&&r.observation?.testsPassed===true);
 if(!emulator&&/hotfix-legacy-emulator\.test\.mjs/iu.test(text)&&!/no\s+se\s+ejecut|sin\s+ejecutar|pendiente\s+de\s+ejecutar|solo\s+le[ií]d|no\s+ejecutad/iu.test(text))
   issues.push('EMULADOR_SOLO_LEIDO_NO_EJECUTADO');
 if(/sourceTextOmitted|sin\s+evidencia\s+directa\s+del?\s+c[oó]digo/iu.test(text))issues.push('NO_CERTIFICAR_FUENTE_OMITIDA');
 return issues;
}
export function engineeringReportVerified(report,receipts=[],instruction=''){
 if(instruction&&!/\b(?:requestpayout|solicitarretiro)\b/i.test(instruction))return genericEngineeringReportIssues(report,receipts,instruction).length===0;
 const text=String(report||'').trim();
 if(text.length<180||text.length>10000)return false;
 const reads=good(receipts).filter(r=>r.name==='repo.read'&&
   typeof r.args?.file==='string'&&r.observation?.verifiedRead?.file===r.args.file);
 const canonical=reads.find(r=>/^functions\/(?:index|secure-entry)\.[cm]?js$/i.test(r.args.file)&&
    typeof r.observation.verifiedRead.content==='string'&&
    /solicitarRetiro|Number\.isFinite/iu.test(r.observation.verifiedRead.content));
 const tested=good(receipts).some(r=>r.name==='tests.run'&&r.observation?.testsPassed===true&&
   r.observation?.objectiveSatisfied===true&&r.observation?.status==='PASSED'&&r.observation?.exitCode===0);
 const confessedMissingSource=/sourceTextOmitted|source\s*text\s*omitted|no\s+(?:se\s+)?(?:expone|dispone|recuper[oó]|ley[oó])\s+(?:del?\s+)?contenido\s+(?:textual|del?\s+c[oó]digo)|sin\s+evidencia\s+directa\s+del?\s+c[oó]digo/iu.test(text);
 // A legacy function name assigned more than once is not proof that its first
 // definition is the live one. Demand that the report acknowledges replacement.
 const definitions=[...String(canonical?.observation?.verifiedRead?.content||'')
  .matchAll(/\bexports\.(?:solicitarRetiro|requestPayout)\s*=/gu)];
 const duplicateExportAcknowledged=definitions.length<2||
   /\b(?:sobrescri\w*|redefin\w*|reemplaz\w*|segunda\s+asignaci[oó]n|[uú]ltima\s+asignaci[oó]n|definici[oó]n\s+final|asignaci[oó]n\s+final)\b/iu.test(text);
 const emulatorExecuted=good(receipts).some(r=>r.name==='tests.run'&&
   r.args?.command==='v142:security-emulator'&&r.observation?.status==='PASSED'&&
   r.observation?.exitCode===0&&r.observation?.testsPassed===true);
 const citedUnexecutedEmulator=/\bhotfix-legacy-emulator\.test\.mjs\b/iu.test(text)&&
   !emulatorExecuted&&!/\b(?:no\s+se\s+ejecut[oó]|sin\s+ejecutar|pendiente\s+de\s+ejecutar|solo\s+le[ií]d[oa]|no\s+ejecutad[oa]s?)\b/iu.test(text);
 return tested&&!!canonical&&text.includes(canonical.args.file)&&!confessedMissingSource&&
   duplicateExportAcknowledged&&!citedUnexecutedEmulator&&
   /requestPayout|solicitarRetiro/iu.test(text)&&
   /\b(?:pruebas?|tests?|suite|regresiones?)\b/iu.test(text)&&
   /\b(?:importe|monto|cantidad|negativ|finito|nan|cero|validaci[oó]n)\b/iu.test(text);
}
export async function verifyGeneralMission({instruction,receipts,proposedReport,objectives=generalObjectives(instruction)}){
    const rows=good(receipts),checks=[];
    const check=(objective,satisfied,reason,details=null)=>checks.push({objective,satisfied,reason,...(details?{details}:{})});
    const outputReads=new Map();
    for(const r of rows.filter(r=>r.name==='artifact.read')){
        const o=r.observation;
        try {const bytes=Uint8Array.from(atob(o.dataBase64),c=>c.charCodeAt(0));
            const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
            if(bytes.length===o.bytes&&digest===o.sha256)outputReads.set(o.output,{text:new TextDecoder().decode(bytes),sha256:digest,bytes});
        }catch{}
    }
    if(objectives.code){
        const grep=rows.find(r=>r.name==='repo.grep'&&Array.isArray(r.observation?.matches));
        const sourceReads=rows.filter(r=>r.name==='repo.read'&&r.observation?.verifiedRead?.file===r.args?.file);
        check('real repository grep and source reads',!!grep&&grep.observation.matches.length>0&&sourceReads.length>0,
            'CODE_SOURCE_EVIDENCE_REQUIRED');
        const reportAccepted=engineeringReportVerified(proposedReport,receipts,instruction);
        check('source-anchored engineering diagnosis',reportAccepted,'ENGINEERING_SOURCE_BOUND_REPORT_REQUIRED',
            reportAccepted?null:{missingClauses:engineeringReportIssues(proposedReport,receipts,instruction)});
        const tested=rows.find(r=>r.name==='tests.run'&&r.observation?.testsPassed===true&&
            r.observation?.objectiveSatisfied===true&&r.observation?.status==='PASSED');
        check('real repository tests pass',!!tested,'CODE_TESTS_PASSING_REQUIRED');
        if(codeConcurrencyRequested(instruction)){
            const emulator=rows.find(r=>r.name==='tests.run'&&r.args?.command==='v142:security-emulator'&&r.observation?.status==='PASSED'&&r.observation?.testsPassed===true&&r.observation?.objectiveSatisfied===true&&r.observation?.exitCode===0);
            check('physical concurrent payout and idempotency emulator tests',!!emulator,'CODE_CONCURRENCY_EMULATOR_EVIDENCE_REQUIRED');
        }
        // A prepared patch is not a write. Even a passing baseline suite cannot
        // certify a requested fix without isolated after-tests and verified diff.
        if(codeRepairRequested(instruction)){
            const preview=rows.some(r=>r.name==='repo.prepareWrite'&&r.observation?.status==='WRITE_PREPARED'&&r.observation?.written===false);
            check('governed exact patch preview',preview,'CODE_PATCH_PREVIEW_REQUIRED');
            check('isolated fix and before-after regression receipts',false,'ISOLATED_CODE_REPAIR_NOT_IMPLEMENTED');
        }
    }
    if(objectives.research&&!objectives.advertising){
        const sources=rows.filter(r=>r.name==='web.research').flatMap(r=>r.observation.sources||[]);
        const observed=new Map(rows.filter(r=>r.name==='browser.inspect'&&r.observation.dom).map(r=>[r.observation.url,r.observation.dom]));
        // The host already extracted independently checked URL/title/quote pairs.
        // For office delivery, certify those original receipts, not an unreliable
        // Qwen repetition of the same citation JSON. Research-only still requires
        // the model's bounded, independently checked report.
        const officeResearch=requiredDeliveryFormats(instruction).some(format=>['docx','pdf'].includes(format));
        const sourceProofs=officeResearch&&researchOfficeContent(receipts,instruction)
            ?independentResearchProofs(receipts,instruction).slice(0,3):[];
        const boundReport=sourceProofs.length===3?JSON.stringify({sources:sourceProofs.map(p=>({
            url:p.url,title:p.title,date:null,quote:p.quotes[0]
        }))}):null;
        const effectiveReport=boundReport||proposedReport;
        const cited=sources.filter(s=>observed.has(s.url)&&String(effectiveReport).includes(s.url));
        check('three independently opened sources',new Set(cited.map(s=>s.url)).size>=3,'THREE_OPENED_CITED_URLS_REQUIRED');
        // Do not certify unsupported source classifications or claims merely because links exist.
        let table;try{table=JSON.parse(effectiveReport);}catch{}
        const evidenceRows=Array.isArray(table?.sources)?table.sources:[];
        const proofs=researchSourceProofs(receipts);
        check('bounded evidence report',!!table&&Object.keys(table).length===1&&new Set(evidenceRows.map(r=>r?.url)).size>=3&&evidenceRows.every(r=>Object.keys(r).every(k=>['url','title','date','quote'].includes(k))),'UNSUPPORTED_REPORT_ASSERTIONS');
        if(objectives.current)check('dated current assertions',evidenceRows.some(s=>s.date!==null)&&evidenceRows.every(s=>{if(s.date===null)return true;const date=Date.parse(s.date);return typeof s.date==='string'&&/^20\d{2}[-/]\d{2}[-/]\d{2}$/.test(s.date)&&String(observed.get(s.url)||'').includes(s.date)&&Number.isFinite(date)&&date<=Date.now()+86400000&&Date.now()-date<=366*86400000;}),'SOURCE_DATES_AND_REPORT_BINDING_REQUIRED');

        const text=researchText;
        check('source quotations and attribution',evidenceRows.length>=3&&evidenceRows.every(s=>typeof s.url==='string'&&observed.has(s.url)&&typeof s.quote==='string'&&proofs.some(p=>p.url===s.url&&p.quotes.some(q=>q.includes(s.quote)))&&s.quote.length>=32&&s.quote.trim().split(/\s+/).length<=25&&text(observed.get(s.url)).includes(s.quote)&&typeof s.title==='string'&&text(observed.get(s.url)).includes(s.title)),'SOURCE_QUOTATIONS_AND_TITLES_REQUIRED');
        if(/fuentes primarias/i.test(instruction))check('primary source classification independently established',false,'PRIMARY_SOURCE_CLASSIFICATION_NOT_INDEPENDENTLY_ESTABLISHED');
    }
    if(objectives.page){
        const pages=rows.filter(r=>r.name==='page.create');
        const page=pages.find(r=>{const read=outputReads.get(r.observation.output);return read&&/<!doctype html>/i.test(read.text)&&/<h1[ >]/i.test(read.text)&&!/<(?:h[1-6]|a)\b[^>]*>\s*<\//i.test(read.text);});
        check('physical valid HTML',!!page,'READ_BACK_VALID_HTML_REQUIRED');
        check('browser open and DOM',!!page&&rows.some(r=>r.name==='browser.open'&&r.observation.url===page.observation.url)&&rows.some(r=>r.name==='browser.inspect'&&r.observation.url===page.observation.url&&r.observation.dom),'BROWSER_OPEN_AND_INSPECTION_REQUIRED');
        const dom=page&&rows.find(r=>r.name==='browser.inspect'&&r.observation.url===page.observation.url)?.observation.dom;
        const ids=new Set([...String(dom||'').matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]));
        const anchors=[...String(dom||'').matchAll(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];
        check('rendered headings and internal links',!!dom&&/<h1\b[^>]*>[^<]+<\/h1>/i.test(dom)&&anchors.length>0&&anchors.every(m=>m[2].replace(/<[^>]*>/g,'').trim()&&m[1]&&(m[1]==='#'||!m[1].startsWith('#')||ids.has(m[1].slice(1)))),'RENDERED_HEADING_OR_LINK_TARGET_INVALID');

        const visual=page&&rows.find(r=>r.name==='media.analyze'&&r.observation.status==='LOCAL_VISUAL_REVIEW'&&r.observation.model==='qwen3.5:9b'&&rows.some(s=>s.name==='browser.screenshot'&&s.args.url===page.observation.url&&s.observation.output===r.observation.output&&s.observation.sha256===r.observation.imageSha256));
        const review=visual?.observation.review;
        const heading=page&&outputReads.get(page.observation.output)?.text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1].replace(/<[^>]+>/g,'').trim();
        check('independent visual review',!!review&&!!heading&&review.visibleHeading.includes(heading)&&review.readableText===true&&review.overlappingContent===false&&review.clippedContent===false&&review.blankOrErrorPage===false&&review.issues?.length===0,'LOCAL_VISUAL_REVIEW_OR_LAYOUT_REPAIR_REQUIRED');
    }
    const records=objectives.records?verifyGeneralCount(receipts):null;
    if(records)check('current authorized Firestore population',records.ok,records.reason);
    if(objectives.document||objectives.advertising&&(objectives.reel||rows.some(r=>r.name==='document.create'))){
        const docs=rows.filter(r=>r.name==='document.create');
        const officeFormats=requiredDeliveryFormats(instruction);
        const officeVerified=officeFormats.length>0&&unfulfilledDownloadFormats(instruction,receipts).length===0&&
            officeFormats.every(format=>docs.some(r=>r.args?.format===format&&
                outputReads.get(r.observation?.output)?.sha256===(r.observation?.sha256||r.observation?.artifact?.sha256)));
        const verified=officeFormats.length?officeVerified:docs.some(r=>{const output=r.observation.output,artifact=r.observation.artifact,read=outputReads.get(output);
            const recordedSha=r.observation.sha256||(artifact?.file===output?artifact.sha256:undefined);
            // document.create records SHA under artifact.sha256; never trust a foreign file or contradictory SHA.
            if(artifact?.file&&artifact.file!==output||r.observation.sha256&&artifact?.sha256&&r.observation.sha256!==artifact.sha256||
               !/^[a-f0-9]{64}$/i.test(recordedSha||'')||!read||read.text!==r.args.content||read.sha256!==recordedSha)return false;
            if(objectives.advertising)return validateProductionDocument(read.text,receipts,objectives).ok&&r.observation.creativeSemanticReview?.verified===true&&rows.some(e=>e.name==='media.library'&&e.args?.action==='export'&&e.args.output===r.observation.output&&e.observation.sha256===read.sha256&&e.observation.experimental===true);
            if(records){try{const data=JSON.parse(read.text);return records.ok&&Object.keys(data).length===Object.keys(records.data).length&&Object.entries(records.data).every(([k,v])=>data[k]===v);}catch{return false;}}
            return read.text.length>80;});
        check('physical document agrees with evidence',verified,'DOCUMENT_READ_BACK_AND_CONTENT_BINDING_REQUIRED');
    }
    const missingFormats=unfulfilledDownloadFormats(instruction,receipts);
    if(requiredDeliveryFormats(instruction).length)check('all requested file formats physically delivered',missingFormats.length===0,missingFormats.length?'REQUESTED_DOWNLOAD_FORMATS_MISSING':'REQUESTED_DOWNLOAD_FORMATS_VERIFIED');
    if(objectives.research&&!objectives.advertising&&requiredDeliveryFormats(instruction).some(f=>['docx','pdf'].includes(f))){
        const content=researchOfficeContent(receipts,instruction);
        const docs=rows.filter(r=>r.name==='document.create');
        const formats=requiredDeliveryFormats(instruction).filter(f=>['docx','pdf'].includes(f));
        const bound=!!content&&formats.every(format=>docs.some(r=>{
            if(r.args?.format!==format||r.args?.content!==content)return false;
            if(format==='docx')return r.observation?.documentValidation?.ok===true;
            const proof=r.observation?.pdfContentProof,sha=r.observation?.sha256||r.observation?.artifact?.sha256;
            if(proof?.verified!==true||proof.sourceSha256!==sha||proof.pages<1||proof.characters<100)return false;
            const extracted=String(proof.extractedText||'').toLowerCase().replace(/\s+/g,'');
            return independentResearchProofs(receipts,instruction).slice(0,3).every(s=>{
                try{return extracted.includes(new URL(s.url).hostname.replace(/^www\./,'').toLowerCase());}
                catch{return false;}
            });
        }));
        check('source-bound original office files',bound,'RESEARCH_DOCUMENT_SOURCE_AND_PDF_CONTENT_REQUIRED');
    }
    if(objectives.capabilities){
        const c=rows.find(r=>r.name==='system.capabilities')?.observation;
        check('live structured inventory',c?.workstation?.ok===true&&Array.isArray(c.inventory)&&c.inventory.length===c.totalTools&&new Set(c.inventory.map(t=>t.name)).size===c.totalTools&&c.inventory.every(t=>t.registered===true&&t.physicallyVerified===false&&['ELIGIBLE_UNVERIFIED','BLOCKED_BY_SCOPE','PENDING_INTEGRATION'].includes(t.executionStatus)),'CAPABILITY_INVENTORY_UNVERIFIED');
    }
    if(objectives.advertising)checks.push(...verifyMediaDelivery(receipts,objectives,outputReads));
    if(objectives.prohibited||(objectives.unsupported&&!objectives.advertising)||!checks.length)check('requested capability supported',false,'GENERAL_OBJECTIVE_NOT_IMPLEMENTED');
    return {ok:checks.length>0&&checks.every(c=>c.satisfied),objectives:checks,reason:checks.find(c=>!c.satisfied)?.reason||'VERIFIED_COMPLETE'};
}

// Independent research evidence controls document creation. URL lookup alone
// never establishes an inspected, quotable, independent source.
export function independentResearchProofs(receipts,instruction=''){
 const byHost=new Map();
 const topic=instruction||receipts.find(r=>r.name==='web.research')?.args?.query||'';
 for(const proof of researchSourceProofs(receipts,topic)){
  let host;try{const url=new URL(proof.url);if(url.protocol!=='https:')continue;host=url.hostname.replace(/^www\./,'').toLowerCase();}catch{continue;}
  const labels=host.split('.');
  const sublevel=labels.at(-2);
  const delegated=labels.length>=3&&labels.at(-1)?.length===2&&['com','net','org','co','gov','gob','edu','ac'].includes(sublevel);
  const organization=delegated?labels.at(-3):sublevel;
  if(!organization)continue;
  if(!byHost.has(organization))byHost.set(organization,proof);
 }
 return [...byHost.values()];
}
export function researchOfficeContent(receipts,instruction=''){
 const sources=independentResearchProofs(receipts,instruction);
 if(sources.length<3)return null;
 const selected=sources.slice(0,3);
 const sections=selected.map((source,i)=>{
  const quote=source.quotes.find(q=>q.trim().split(/\s+/).length>=8 && q.trim().split(/\s+/).length<=20);
  if(!quote)return null;
  return [
   '## Fuente '+(i+1)+': '+source.title,
   'Página original inspeccionada: '+source.url,
   'Cita literal comprobada: "'+quote+'"',
   'Fecha de publicación: no comprobada, salvo evidencia fechada explícita en la página.',
   'Alcance de la evidencia: el fragmento anterior se recuperó directamente del contenido publicado. Su existencia no demuestra por sí sola la eficacia de ninguna intervención ni sustituye una evaluación profesional.'
  ].join('\n\n');
 });
 if(sections.some(s=>!s))return null;
 return [
  '# Informe de investigación con fuentes verificadas',
  '## Introducción',
  'Este informe reúne tres fuentes de sitios independientes cuya respuesta HTML fue leída durante esta misión. Se presentan fragmentos literales atribuidos a sus páginas de origen. No se fabrican entrevistas, pruebas de campo, cifras, resultados ni fechas de publicación.',
  ...sections,
  '## Comparación y límites',
  'Las tres fuentes se citan por separado para que puedan consultarse directamente. Su selección no significa que sus autores hayan validado este informe ni que los fragmentos, sin leer el contexto completo, autoricen afirmaciones adicionales. Las fechas se omiten cuando no existe comprobación inequívoca.',
  '## Conclusión',
  'Las citas y los enlaces anteriores son una base documental reproducible, no una certificación técnica ni una recomendación específica para un equipo real. Para aplicar cualquier práctica se debe consultar la documentación oficial del fabricante y contar con personal calificado cuando corresponda.'
 ].join('\n\n');
}
export function researchOfficeContentVerified(receipts,content,instruction=''){
 const expected=researchOfficeContent(receipts,instruction);
 return typeof expected==='string'&&content===expected;
}

export function researchTopic(instruction=''){
 const text=String(instruction||'');
 const colon=text.match(/\b(?:investiga(?:ci[oó]n)?|investigaci[oó]n(?: real)?)\b[^:\n]{0,110}:\s*([^,.;\n]{6,110})/iu);
 if(colon)return colon[1].trim();
 const named=text.match(/\b(?:sobre|acerca de|tema)\s*:??\s*([^,.;\n]{8,110})/iu);
 return (named?.[1]||text.slice(0,100)).trim();
}

export function researchQuoteRelevant(quote,instruction='',title=''){
 const q=String(quote||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
 if(/\b(help mode|click on any control|sign in|privacy policy|accept cookies|terms of use|find a carrier expert nearby)\b/i.test(q))return false;
 if(!instruction)return true;
 const request=String(instruction).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
 if(/aire acondicionado|acondicionador|climatizacion|air condition|hvac/i.test(request)){
   const subject=/aire acondicionado|acondicionad|climatiz|air condition|hvac|cooling system|cooling equipment/i.test(q);
   const actionable=/mantenimient|maintenance|maintain|filter|filtro|clean|limpi|service|servicio|refrigerant|refrigerante|inspec|preventiv/i.test(q);
   return subject&&actionable;
 }
 const topic=researchTopic(instruction).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
 const heading=String(title||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
 const ignored=new Set(['sobre','investigar','investiga','investigacion','fuentes','informe','documentos','archivo','original','entrega','crear','crea','actual','general','como','para','entre','tipo']);
 const tokens=[...new Set(topic.split(/[^a-z0-9]+/).filter(w=>w.length>=5&&!ignored.has(w)))];
 if(!tokens.length)return false;
 const match=q=>tokens.filter(w=>q.includes(w.slice(0,6))).length;
 // A topic-grounded page heading may anchor a quote that mentions the core
 // concept without repeating the full research instruction in the first line.
 return heading?match(heading)>=1&&match(q)>=1:match(q)>=Math.min(2,tokens.length);
}
