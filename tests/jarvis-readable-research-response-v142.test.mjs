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
 assert.equal(view.researchReport.length,3);
 assert.match(view.safeTitle,/Fuentes de la investigación/);
 assert.match(view.renderedMessage,/Jarvis encontró 3 fuentes verificadas/);
 assert.match(view.renderedMessage,/Abrir fuente original/);
 assert.match(view.renderedMessage,/Fecha documentada: 2026-10-14/);
 assert.match(view.renderedMessage,/Ver detalles técnicos \(JSON\)/);
 assert.match(view.renderedMessage,/&amp;b=2/);
 assert.match(view.renderedMessage,/&quot;sources&quot;/);
 assert.match(page,/\$\{renderedMessage\}/,'Actual card uses the readable report');
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