import test from 'node:test';
import assert from 'node:assert/strict';
import {configuredSourcesMessage} from '../jarvis-configured-sources.js';

const catalog={
 source:'VERIFIED_LOCAL_REPOSITORY_SCHEMA',revision:'git-verified-revision',
 digest:'sha256-of-verified-map',
 files:['app-registro.js','functions/b2c-technician-approval.js',
   'modulo-flotilla.js','functions/b2b-personnel-kyc.js'],
 collections:['users','flotilla_b2b/uxmal39/vehiculos'],
 fields:['rol','tipo_cuenta','vehiculo.tipo','vehiculo.placas','operador','placas'],
 references:[[0,0,[0,1,2,3]],[1,0,[0,1]],[2,1,[4,5]],[3,0,[0]]]
};

test('Qwen receives a revision-bound operational map prioritizing B2C sources without inventing records',()=>{
  const packet=configuredSourcesMessage(catalog,2600,{
    instruction:'Revisa técnicos B2C registrados en users, tipos de vehículo y placas sin consultar B2B'
  });
  assert.ok(packet);
  assert.ok(packet.content.length<=2600);
  assert.ok(packet.content.startsWith('CONFIGURACION_DE_FUENTES_VERIFICADA='));
  const data=JSON.parse(packet.content.split('\n')[0].split('=')[1]);
  assert.equal(data.revision,catalog.revision);
  assert.equal(data.routeCount,2);
  assert.equal(data.operationalEvidence,false);
  assert.equal(data.permissionsGranted,false);
  assert.equal(data.exhaustiveOperationalCoverage,false);
  assert.equal(data.routes[0][0],'users');
  assert.equal(data.routes[0][1][0],'functions/b2c-technician-approval.js');
  assert.ok(data.routes[0][2].includes('vehiculo'));
  assert.ok(!packet.content.includes('EXAMPLE_HIDDEN_RECORD'));
});

test('Qwen sees B2B source provenance when explicitly requested, without treating it as B2C',()=>{
  const packet=configuredSourcesMessage(catalog,2600,{
    instruction:'Consulta la flotilla B2B: vehículos y operadores declarados'
  });
  assert.ok(packet);
  const data=JSON.parse(packet.content.split('\n')[0].split('=')[1]);
  assert.equal(data.routes[0][0],'flotilla_b2b/uxmal39/vehiculos');
  assert.equal(data.routes[0][1][0],'modulo-flotilla.js');
});

test('small Qwen context yields a bounded packet or no packet rather than dropping safeguards',()=>{
  const packet=configuredSourcesMessage(catalog,1100,{instruction:'B2C'});
  if(packet){
    assert.ok(packet.content.length<=1100);
    assert.match(packet.content,/operationalEvidence":false/);
    assert.match(packet.content,/permissionsGranted":false/);
  }
  assert.equal(configuredSourcesMessage(catalog,10,{instruction:'B2C'}),null);
});

test('Qwen receives a bounded full-repo module slice with functions and dependencies, never private data or permissions',()=>{
  const source={...catalog,moduleIndex:[
    {file:'app-registro.js',functions:['registrarTecnico'],exports:[],dependencies:['b2c-technician-profile.js'],dependents:[],relatedTests:[],isTest:false,isGenerated:false,authoritySensitive:true},
    {file:'panel-admin.js',functions:['iniciarPanelAdmin'],exports:['iniciarPanelAdmin'],dependencies:['b2c-technician-profile.js'],dependents:[],relatedTests:[],isTest:false,isGenerated:false,authoritySensitive:true},
    {file:'modulo-flotilla.js',functions:['cargarFlotillaB2B'],exports:[],dependencies:['firebase.js'],dependents:[],relatedTests:[],isTest:false,isGenerated:false,authoritySensitive:false},
    {file:'tests/private.fixture.test.mjs',functions:['EXAMPLE_HIDDEN_RECORD'],exports:[],dependencies:[],dependents:[],relatedTests:[],isTest:true,isGenerated:false,authoritySensitive:false}
  ]};
  const packet=configuredSourcesMessage(source,2100,{instruction:'Lista los tecnicos B2C de users y su vehiculo declarado'});
  assert.ok(packet);
  assert.ok(packet.content.length<=2100);
  const payload=JSON.parse(packet.content.split('\n')[0].split('=')[1]);
  assert.equal(payload.moduleCount,4);
  assert.equal(payload.operationalEvidence,false);
  assert.equal(payload.permissionsGranted,false);
  assert.ok(payload.modules.some(item=>item[0]==='app-registro.js'));
  assert.ok(payload.modules.some(item=>item[0]==='panel-admin.js'));
  assert.ok(payload.modules.some(item=>item[1].includes('iniciarPanelAdmin')));
  assert.ok(payload.modules.every(item=>!item[0].includes('private.fixture')));
  assert.doesNotMatch(JSON.stringify(payload),/EXAMPLE_HIDDEN_RECORD/);
});

test('repo structural catalog may include all source modules while delivering only a budgeted relevant subset',()=>{
  const huge={...catalog,moduleIndex:Array.from({length:515},(_,i)=>({
    file:i===0?'panel-admin.js':'lib/modules/module-'+i+'.js',
    functions:['readTechnicianData','prepareReport'],
    exports:[],dependencies:['firebase.js'],dependents:[],relatedTests:[],
    isTest:false,isGenerated:false,authoritySensitive:false
  }))};
  const packet=configuredSourcesMessage(huge,3000,{instruction:'Contar tecnicos B2C en users desde panel-admin.js'});
  assert.ok(packet);
  const data=JSON.parse(packet.content.split('\n')[0].split('=')[1]);
  assert.equal(data.moduleCount,515);
  assert.ok(data.modules.length>0);
  assert.ok(data.modules.length<515);
  assert.equal(data.modules[0][0],'panel-admin.js');
  assert.ok(packet.content.length<=3000);
});
