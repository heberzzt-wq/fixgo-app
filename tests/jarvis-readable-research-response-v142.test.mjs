import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const page=readFileSync(join(process.cwd(),'gestia-terminal.html'),'utf8');
const start=page.indexOf('        // Preserve the signed evidence JSON but render its sources as a readable report.');
const end=page.indexOf('        const responseHtml = ',start);
assert.ok(start>0&&end>start,'Research renderer must be present');
const snippet=page.slice(start,end);
const escapeHTML=s=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const render=(message,title='Jarvis')=>new Function('message','title','escapeHTML',
    snippet+';return {researchReport,renderedMessage,safeTitle,safeMessage};')(message,title,escapeHTML);
const sample={sources:[
 {url:'https://example.org/filters?a=1&b=2',title:'How to clean filters',
  quote:'Clean filters improve airflow and lower maintenance costs.',date:'2026-10-14'},
 {url:'https://example.com/hvac',title:'Proper installation',
  quote:'Filters must be fitted properly to avoid bypass.',date:null},
 {url:'https://example.net/air',title:'Air research',
  quote:'Inspect the system and follow manufacturer guidance.',date:null}
]};
test('Research evidence is readable and keeps the original JSON within details',()=>{
 const original=JSON.stringify(sample),view=render(original);
 assert.equal(view.researchReport.sources.length,3);
 assert.match(view.safeTitle,/Fuentes de la investigación/);
 assert.match(view.renderedMessage,/Jarvis encontró 3 fuentes verificadas/);
 assert.match(view.renderedMessage,/Abrir fuente original/);
 assert.match(view.renderedMessage,/Fecha documentada: 2026-10-14/);
 assert.match(view.renderedMessage,/Ver detalles técnicos \(JSON\)/);
 assert.match(view.renderedMessage,/&amp;b=2/);
 assert.match(view.renderedMessage,/&quot;sources&quot;/);
 assert.match(page,/\$\{renderedMessage\}/,'Actual card uses the readable report');
});
test('procedural research renders six sourced steps and two warnings without changing receipts',()=>{
 const full={...sample,steps:Array.from({length:6},(_,i)=>({
  number:i+1,instruction:'Instrucción respaldada número '+(i+1)+': limpiar el filtro con precaución',
  sourceUrl:sample.sources[0].url,quote:'Clean filters improve airflow and lower maintenance costs.'
 })),warnings:[
  {kind:'disposable_filter',text:'Reemplazar los filtros desechables.',sourceUrl:sample.sources[0].url,quote:'Clean filters improve airflow and lower maintenance costs.'},
  {kind:'manufacturer_manual',text:'Leer el manual del fabricante.',sourceUrl:sample.sources[2].url,quote:'Inspect the system and follow manufacturer guidance.'}
 ]};
 const result=render(JSON.stringify(full),'Misión general verificada');
 assert.equal(result.researchReport.sources.length,3);
 assert.equal(result.researchReport.steps.length,6);
 assert.match(result.renderedMessage,/Procedimiento sustentado en las fuentes/);
 assert.match(result.renderedMessage,/Advertencias documentadas/);
 assert.match(result.renderedMessage,/6\. Instrucción respaldada/);
 assert.match(result.renderedMessage,/Ver detalles técnicos/);
 const injected=structuredClone(full);injected.steps[2].instruction='<img src=x onerror=alert(1)>';
 const safe=render(JSON.stringify(injected));
 assert.match(safe.renderedMessage,/&lt;img/);
 assert.doesNotMatch(safe.renderedMessage,/<img/);
 const invalid=structuredClone(full);invalid.steps[0].sourceUrl='https://evil.example/filters';
 assert.equal(render(JSON.stringify(invalid)).researchReport,null);
});
test('Unrelated mission messages stay unmodified',()=>{
 const msg='Misión cancelada: vuelva a intentar';
 assert.equal(render(msg).renderedMessage,msg);
 assert.equal(render('{"status":"PARTIAL"}').researchReport,null);
});
test('Invalid links cannot become clickable research sources',()=>{
 const attack=JSON.stringify({sources:[{...sample.sources[0],url:'javascript:alert(1)'}]});
 const view=render(attack);
 assert.equal(view.researchReport,null);
 assert.doesNotMatch(view.renderedMessage,/<a /);
});
test('Untrusted titles and quoted passages are escaped',()=>{
 const attack=JSON.stringify({sources:[{url:'https://example.org/',
   title:'<img src=x onerror=alert(1)>',quote:'<script>alert(1)</script>',date:'bad'}]});
 const view=render(attack);
 assert.match(view.renderedMessage,/&lt;img/);
 assert.match(view.renderedMessage,/&lt;script&gt;/);
 assert.doesNotMatch(view.renderedMessage,/<script>/);
 assert.doesNotMatch(view.renderedMessage,/Fecha documentada:/);
});
test('Actual verified pilot message with counters renders sources, not raw JSON',()=>{
 const message=JSON.stringify(sample)+'\nMisión: general-fb1fbf9f-8d71-4552-8fd1-5e802969cf78'+
   '\nLlamadas registradas: 12; exitosas: 8; inferencias: 5'+
   '\nTokens: 15556 entrada / 610 salida; duración: 95832 ms.'+
   '\nEvidencia local SHA-256: 380d54488c5da57c02c8087ade067e1a01a8639526a8502cbafed9dd1d9eee5f';
 const view=render(message,'Misión general verificada');
 assert.equal(view.researchReport.sources.length,3);
 assert.match(view.renderedMessage,/Abrir fuente original/);
 assert.match(view.renderedMessage,/Ver detalles técnicos/);
 assert.match(view.renderedMessage,/Misión: general-fb1fbf9f/);
 assert.doesNotMatch(view.renderedMessage,/^\{\\"sources/);
});
test('A non-evidence JSON envelope cannot hijack readable research presentation',()=>{
 const msg=JSON.stringify({sources:[{url:'https://example.org',title:'x',quote:'y'}],admin:true})+
   '\nMisión: general-sample';
 assert.equal(render(msg).researchReport,null);
});

test('Verified repository status is explained in plain Spanish with original technical proof preserved',()=>{
 const message='Misión completada. Se ha verificado el estado del repositorio heberzzt-wq/fixgo-app en la rama v142-official mediante repo.gitStatus (timeoutMs: 5000). El árbol de trabajo está limpio y el SHA es válido. No se requieren más lecturas ni herramientas adicionales.'+
   '\nMisión: general-d7e9a1f8-b0f6-4c04-8d09-47e44bee9e7d'+
   '\nLlamadas registradas: 1; exitosas: 1; inferencias: 2'+
   '\nTokens: 2769 entrada / 149 salida; duración: 57315 ms.'+
   '\nEvidencia local SHA-256: f0f1eaca711e2b8ad366ef0a52f1c0934f4109c00ea1f170e61391cbee32692a';
 const view=render(message,'Misión general verificada');
 assert.match(view.safeTitle,/Revisión del proyecto completada/);
 assert.match(view.renderedMessage,/Revisé el estado de los archivos del proyecto/);
 assert.match(view.renderedMessage,/no que toda la plataforma esté libre de fallas/);
 assert.match(view.renderedMessage,/Ver detalles técnicos de la revisión/);
 assert.match(view.renderedMessage,/general-d7e9a1f8/);
 assert.doesNotMatch(view.renderedMessage,/^Misión completada/);
 const incomplete=render(message,'Misión general no certificada');
 assert.match(incomplete.renderedMessage,/No pude confirmar que la misión terminara correctamente/);
 assert.match(incomplete.renderedMessage,/Ver detalles técnicos/);
 assert.doesNotMatch(incomplete.renderedMessage,/^Misión completada/);
});

test('ordinary technical JSON gets a clear explanation and retains the original as evidence',()=>{
 const unproven=render(JSON.stringify({status:'PARTIAL',rows:[{code:'X1'}]}));
 assert.match(unproven.renderedMessage,/Recibí datos del trabajo/);
 assert.match(unproven.renderedMessage,/data-jarvis-readable-technical/);
 assert.match(unproven.renderedMessage,/Ver mensaje técnico original/);
 assert.match(unproven.renderedMessage,/&quot;status&quot;:&quot;PARTIAL&quot;/);
 assert.doesNotMatch(unproven.renderedMessage,/^\{&quot;status/);
 const summary=render(JSON.stringify({summary:'Analicé dos archivos y encontré una tabla.',status:'ok'}));
 assert.match(summary.renderedMessage,/Esto es lo que informó Jarvis: Analicé dos archivos/);
 const untrusted=render(JSON.stringify({message:'<img src=x onerror=alert(1)>'}));
 assert.match(untrusted.renderedMessage,/&lt;img/);
 assert.doesNotMatch(untrusted.renderedMessage,/<img/);
});

test('known mobile and bridge errors use natural language without erasing their proof',()=>{
 const relay=render('QWEN_PILOT_PREFLIGHT_FAILED:JARVIS_RELAY_WORKSTATION_UNAVAILABLE');
 assert.match(relay.renderedMessage,/se perdió la conexión privada con la laptop/);
 assert.match(relay.renderedMessage,/Ver mensaje técnico original/);
 assert.match(relay.renderedMessage,/QWEN_PILOT_PREFLIGHT_FAILED/);
 const timeout=render('JARVIS_LOCAL_BRIDGE_TIMEOUT_REQUEST');
 assert.match(timeout.renderedMessage,/la laptop no respondió/);
 const other=render('BRIDGE_IDENTITY_INVALID');
 assert.match(other.renderedMessage,/problema técnico/);
 assert.equal(render('El trabajo terminó y ya tienes el archivo listo.').renderedMessage,
  'El trabajo terminó y ya tienes el archivo listo.');
});
