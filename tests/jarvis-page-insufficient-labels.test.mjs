import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPageArtifactHtml,describePageArtifact} from '../jarvis-page-artifact.js';
const input={brandName:'Demo',title:'Demostración',evidenceMode:'insufficient',requiredSections:['Propuesta',{title:'Alcance & límites'}]};
test('insufficient-evidence page preserves escaped section names in headings, navigation and metadata',()=>{
 const html=buildPageArtifactHtml(input),report=describePageArtifact(input,html);
 assert.match(html,/<h2>Propuesta<\/h2>/);
 assert.match(html,/<h2>Alcance &amp; límites<\/h2>/);
 assert.match(html,/<a href="#contenido-propuesta">Propuesta<\/a>/);
 assert.deepEqual(report.renderedSections.map(s=>s.title),['Propuesta','Alcance & límites']);
 assert.equal(report.ok,true);
 assert.doesNotMatch(html,/<(?:h2|a)[^>]*>\s*<\//);
 assert.doesNotMatch(html,/id="servicios"|wa\.me|mailto:/);
});
test('insufficient-evidence gate rejects empty section headings or navigation even when IDs remain',()=>{
 const html=buildPageArtifactHtml(input);
 for(const broken of [html.replace('<h2>Propuesta</h2>','<h2></h2>'),html.replace('href="#contenido-propuesta">Propuesta</a>','href="#contenido-propuesta"></a>')]){
  assert.equal(describePageArtifact(input,broken).checks.requestedSections,false);
  assert.equal(describePageArtifact(input,broken).ok,false);
 }
});
