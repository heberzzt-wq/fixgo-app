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
