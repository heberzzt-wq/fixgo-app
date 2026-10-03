import test from 'node:test';
import assert from 'node:assert/strict';
import { marketingFinalResponseFromMission } from '../gestia-core/jarvis/jarvis.marketing.presenter.js';
import { ensureExecutableArtifactDependencies } from '../gestia-core/jarvis/jarvis.mission.dependencies.js';
import { planMarketingRequest } from '../gestia-core/jarvis/jarvis.marketing.engine.js';
import { runJarvisMission } from '../gestia-core/jarvis/jarvis.mission.orchestrator.js';

const brief = { brandName:'Firma de prueba', audience:'Empresas', offer:'Asesoría', pain:'Incertidumbre', promise:'Orientación', differentiator:'Atención', cta:'Contacta', market:'México', campaignObjective:'Consultas', horizon:'30 días', tone:'Profesional', channels:['Facebook'], metrics:['Consultas'], productionRequested:true, deliveryMode:'publishable_media' };
const requirement = {id:'facebook',type:'image',toolName:'image.adapt',label:'Facebook',publishable:true,args:{variants:[{id:'facebook',width:1080,height:1080,mimeType:'image/png'}],brandLogoOutput:'.jarvis-artifacts/logo.png'}};
function mission(observation) {
  return {completedTasks:[{name:'marketing.plan',observation:{status:'MARKETING_PACKAGE_READY',planReady:true,objectiveSatisfied:true,productionRequested:true,deliveryMode:'publishable_media',requiredArtifacts:[requirement],userVisible:'Plan de trabajo'}}, {name:'image.adapt',args:{marketingRequirementId:'facebook'},observation}],blockedTasks:[],pendingTasks:[]};
}
test('a publishable campaign cannot be fulfilled by documents or a media manifest',()=>{
  const r=planMarketingRequest('Publicidad para publicar', {...brief,productionArtifacts:[{id:'plan',type:'document',toolName:'document.create'}]});
  assert.equal(r.readyForProduction,false);
  assert.equal(r.status,'MARKETING_PRODUCTION_CONTRACT_INCOMPLETE');
});
test('local adaptation and its explicit media requirements survive the marketing plan',()=>{
  const r=planMarketingRequest('Usa los anuncios y el logo adjuntos', {...brief,productionArtifacts:[requirement]});
  assert.equal(r.readyForProduction,true);
  assert.equal(r.deliveryMode,'publishable_media');
  assert.deepEqual(r.requiredArtifacts[0].args,requirement.args);
  assert.equal(r.requiredArtifacts[0].publishable,true);
});
test('a named PNG without physical media evidence is not a publishable ad',()=>{
  const r=marketingFinalResponseFromMission(mission({objectiveSatisfied:true,output:'.jarvis-artifacts/ad.png'}));
  assert.equal(r.ok,false);
});
test('only measured dimensions, bytes and original logo composition complete an ad',()=>{
  const valid={objectiveSatisfied:true,output:'.jarvis-artifacts/ad.png',mimeType:'image/png',bytes:1200,sha256:'a'.repeat(64),physicallyWritten:true,width:1080,height:1080,logoOverlayApplied:true,logoSourceSha256:'b'.repeat(64)};
  for (const patch of [{width:147},{logoOverlayApplied:false},{mimeType:'text/html'},{sha256:''}]) assert.equal(marketingFinalResponseFromMission(mission({...valid,...patch})).ok,false);
  const r=marketingFinalResponseFromMission(mission(valid));
  assert.equal(r.ok,true);
  assert.match(r.title,/Publicidad/);
});
test('a reel with unspecified media policy must not silently inject image generation',()=>{
  const calls=ensureExecutableArtifactDependencies({toolCalls:[{name:'reel.plan',args:{title:'Reutiliza los anuncios'}}],catalog:[{name:'reel.plan'},{name:'image.generate'}]});
  assert.equal(calls.some(c=>c.name==='image.generate'),false);
});

test('mission carries physical ad requirements through scheduling and refuses a false successful filename', async () => {
  for (const verified of [false, true]) {
    const actualArgs = [];
    const store = new Map();
    const plan = planMarketingRequest('Anuncio listo', {...brief, productionArtifacts:[requirement]});
    const mission = await runJarvisMission({
      instruction:'Prepara el anuncio usando el original aportado.',
      initialToolCalls:[{name:'marketing.plan',args:{}}],
      requiredToolNames:['marketing.plan'], executionContractLocked:true, maximumRetries:0, maximumSteps:4,
      storage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
      planner:async()=>({toolCalls:[],missionComplete:true}),
      execute:async call=>{
        if(call.name==='marketing.plan') return {...plan,ok:true,objectiveSatisfied:true};
        actualArgs.push(call.args);
        return {ok:true,objectiveSatisfied:true,output:'.jarvis-artifacts/fb.png',...(verified?{
          mimeType:'image/png',bytes:1000,sha256:'a'.repeat(64),physicallyWritten:true,width:1080,height:1080,logoOverlayApplied:true,logoSourceSha256:'b'.repeat(64)
        }:{})};
      }
    });
    assert.equal(mission.status==='COMPLETED',verified);
    assert.deepEqual(actualArgs[0].variants,requirement.args.variants);
    assert.equal(actualArgs[0].brandLogoOutput,requirement.args.brandLogoOutput);
  }
});
