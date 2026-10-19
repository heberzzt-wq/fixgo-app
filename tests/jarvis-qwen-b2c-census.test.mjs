import test from 'node:test';
import assert from 'node:assert/strict';
import {B2C_CENSUS_FIELDS,inspectB2cCensusEvidence,verifyB2cCensusReport} from '../modules/terminal/qwen-b2c-census-evidence.js';

function receipt(){
    const rows=[{id:'a',rol:'tecnico',tipo_cuenta:'B2C',estado:'activo','kyc.aprobado':true,disponible:true,'vehiculo.tipo':'auto','vehiculo.placas':'RAW-123'},
        {id:'b',rol:'tecnico',tipo_cuenta:'B2B',estado:'activo','kyc.aprobado':true,'vehiculo.tipo':'camioneta'},
        {id:'c',rol:'tecnico',estado:'pendiente','vehiculo.tipo':'a_pie'}]
        .map(({id,...values})=>({id,values:{...Object.fromEntries(B2C_CENSUS_FIELDS.map(f=>[f,null])),...values}}));
    return {name:'platform.query',ok:true,observation:{ok:true,executionOk:true,recordEvidence:{
        source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,
        scope:{collection:'users',mode:'query',filters:[{field:'rol',op:'==',value:'tecnico'}],fields:[...B2C_CENSUS_FIELDS],implicitExistenceFields:[]},
        rows,totalCount:3,returnedCount:3,previousCursor:null,nextCursor:null,hasMore:false,queryExhausted:true,
        rowsObservedAt:new Date().toISOString(),truncatedFields:[]}}};
}
test('census uses canonical B2C authority, retains legacy accounts and original plates',()=>{
    const evidence=inspectB2cCensusEvidence([receipt()]);assert.equal(evidence.ok,true);
    assert.equal(evidence.result.total,2);assert.equal(evidence.result.excluidosB2B,1);
    assert.equal(evidence.result.aprobadosActivos,1);assert.equal(evidence.result.pendientesRevision,1);
    assert.equal(evidence.result.disponiblesDeclarados,1);assert.equal(evidence.result.transportes.peaton,1);
    assert.equal(evidence.result.transportes.auto,1);assert.equal(evidence.result.transportes.camioneta,0);
    assert.equal(evidence.result.tecnicos[0].placas,'RAW-123');
});
test('source-only, B2B, partial, stale, unprojected and narrowed populations cannot certify census',()=>{
    assert.equal(inspectB2cCensusEvidence([{name:'repo.read',ok:true}]).ok,false);
    for(const mutate of [e=>e.scope.collection='flotilla_b2b/uxmal39/vehiculos',e=>e.hasMore=true,
        e=>e.totalCount=4,e=>e.scope.fields.pop(),e=>delete e.rows[0].values.rol,
        e=>e.rowsObservedAt='2020-01-01',e=>e.truncatedFields.push('placas'),
        e=>e.scope.filters.push({field:'tipo_cuenta',op:'==',value:'B2C'}),
        e=>e.scope.implicitExistenceFields.push('estado'),e=>e.source='CACHE']){
        const r=receipt();mutate(r.observation.recordEvidence);assert.equal(inspectB2cCensusEvidence([r]).ok,false);
    }
});
test('pagination requires complete chain, stable scope and no duplicate IDs',()=>{
    const first=receipt(),second=receipt();
    const a=first.observation.recordEvidence,b=second.observation.recordEvidence;
    a.rows=a.rows.slice(0,2);a.returnedCount=2;a.hasMore=true;a.queryExhausted=false;a.nextCursor='b';
    b.rows=b.rows.slice(2);b.returnedCount=1;b.previousCursor='b';
    assert.equal(inspectB2cCensusEvidence([first,second]).ok,true);
    b.previousCursor='wrong';assert.equal(inspectB2cCensusEvidence([first,second]).ok,false);
    b.previousCursor='b';b.scope.filters=[];assert.equal(inspectB2cCensusEvidence([first,second]).ok,false);
});
test('Qwen report must match every independently calculated fact',()=>{
    const r=receipt(),expected=inspectB2cCensusEvidence([r]).result;
    assert.equal(verifyB2cCensusReport({receipts:[r],proposedReport:JSON.stringify(expected)}).ok,true);
    expected.total=999;
    assert.equal(verifyB2cCensusReport({receipts:[r],proposedReport:JSON.stringify(expected)}).ok,false);
    assert.equal(verifyB2cCensusReport({receipts:[r],proposedReport:'All done'}).ok,false);
});

test('complete server field metadata proves absent aliases without inventing projections',()=>{
    const r=receipt(),e=r.observation.recordEvidence;
    e.scope.fields=e.scope.fields.filter(f=>f!=='account_type');
    for(const row of e.rows)delete row.values.account_type;
    e.fieldSchema={source:'SERVER_RECORD_FIELD_NAMES',collection:'users',sampledRows:3,
        completeForObservedRows:true,paths:e.scope.fields};
    assert.equal(inspectB2cCensusEvidence([r]).ok,true);
    e.fieldSchema.completeForObservedRows=false;
    assert.equal(inspectB2cCensusEvidence([r]).ok,false);
    e.fieldSchema.completeForObservedRows=true;e.fieldSchema.paths=[...e.scope.fields,'account_type'];
    assert.equal(inspectB2cCensusEvidence([r]).ok,false);
});

test('census feedback names the invalid population or missing projected fields',()=>{
    const r=receipt();r.observation.recordEvidence.scope.filters.push({field:'tipo_cuenta',op:'==',value:'b2c'});
    assert.equal(inspectB2cCensusEvidence([r]).reason,'CENSUS_SCOPE_EXCLUDES_LEGACY_ACCOUNTS');
    r.observation.recordEvidence.scope.filters=[];r.observation.recordEvidence.scope.fields=['__name__'];
    const result=inspectB2cCensusEvidence([r]);assert.equal(result.reason,'CENSUS_FIELD_PROJECTION_INCOMPLETE');
    assert.deepEqual(result.evidenceNeeded.missingFields,[...B2C_CENSUS_FIELDS]);
});
