import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizedClaimConstraint,reviewAdvertisingEvidence} from '../jarvis-qwen-advertising-review.js';
const entries=[{ref:'library:identity.png',sha256:'a'.repeat(64),description:'Asesoría fiscal y legal.',verifiedContacts:['www.example.test']}];
const image=headline=>({tool:'image.adapt',args:{composition:{headline}}});
test('phase4 added qualification and specialty fail independently of model claimsGrounded',()=>{
 for(const text of ['Asesoría fiscal y legal experta.','Expertos en fiscalidad y derecho corporativo.','Planificación estratégica.','Estructuración de empresas.','Evaluación gratuita.','Protegemos tu patrimonio.']){
  const result=authorizedClaimConstraint({instruction:'Crea una campaña.',entries,creative:image(text)});
  assert.equal(result.verified,false,text);assert.equal(result.rejected[0].reason,'COMMERCIAL_CLAIM_NOT_AUTHORIZED');
 }
});
test('positive client facts bind literal evidence and SHA; negative instructions cannot ground an offer',()=>{
 const accepted=authorizedClaimConstraint({entries,creative:image('Asesoría fiscal y legal.')});
 assert.equal(accepted.verified,true);assert.equal(accepted.bindings[0].authority.ref,entries[0].ref);assert.equal(accepted.bindings[0].authority.sha256,entries[0].sha256);
 assert.equal(authorizedClaimConstraint({instruction:'No inventes evaluación gratuita.',entries,creative:image('Evaluación gratuita.')}).verified,false);
 assert.equal(authorizedClaimConstraint({instruction:'Oferta autorizada: Evaluación gratuita.',entries,creative:image('Evaluación gratuita.')}).verified,true);
 assert.equal(authorizedClaimConstraint({entries:[{...entries[0],sha256:undefined}],creative:image('Asesoría fiscal y legal.')}).verified,false);
});
test('contacts bind exact authorized endpoint rather than unrelated domain or substring',()=>{
 for(const contact of ['www.example.test.evil.test','invented@example.test','+52 998 123 4567'])assert.equal(authorizedClaimConstraint({entries,creative:{tool:'image.adapt',args:{composition:{contact}}}}).verified,false);
 const good=authorizedClaimConstraint({entries,creative:{tool:'image.adapt',args:{composition:{contact:'https://www.example.test/',cta:'Conoce el servicio'}}}});
 assert.equal(good.verified,true);assert.equal(good.bindings[0].authority.kind,'verified_contact');
});
test('page services, narration, scene subtitles and production document claims are covered',()=>{
 for(const creative of [
  {tool:'page.create',args:{services:[{title:'Derecho corporativo'}]}},
  {tool:'speech.synthesize',args:{text:'Resultados garantizados.'}},
  {tool:'reel.create',args:{scenes:[{subtitle:'Evaluación gratuita.'}]}},
  {tool:'document.create',args:{content:JSON.stringify({scenes:[{narration:'Resultados garantizados.'}],limitations:['Sin prueba de gratuidad.']})}}
 ])assert.equal(authorizedClaimConstraint({entries,creative}).verified,false);
});
test('falsely positive model cannot authorize unsupported claim using research source text',async()=>{
 const urls=['https://research.test/a','https://research.test/b'];
 const out=await reviewAdvertisingEvidence({instruction:'Crea una campaña.',entries,creative:image('Evaluación gratuita.'),sources:urls.map(url=>({url})),openedSources:urls.map(url=>({url,text:'Evaluación gratuita. Research describes advertising principles for clear copy.'})),fetchImpl:async()=>({ok:true,json:async()=>({done:true,message:{content:JSON.stringify({sources:Object.fromEntries(urls.map((_,i)=>['s'+i,{quoteId:'q0',reason:'Relevant',topicRelevant:true,sectorRelevant:true,identityCompatible:true,objectiveRelevant:true}])),creative:{identityPreserved:true,contactsGrounded:true,claimsGrounded:true,unsupportedClaims:[],reason:'Approved'},blockingIssues:[],limitations:[]})}})})});
 assert.equal(out.verified,false);assert.equal(out.status,'ADVERTISING_CLAIM_EVIDENCE_REQUIRED');assert.equal(out.review.creative.claimsGrounded,true);assert.equal(out.hostClaimConstraint.rejected[0].text,'Evaluación gratuita.');
});
