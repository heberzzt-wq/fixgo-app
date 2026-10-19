import '../../gestia-core/contracts/b2c-platform-contract.js';

const contract=globalThis.GestiaB2CPlatformContract;
// A bounded acceptance contract for the explicitly requested census, not an
// intent classifier or an executor. Every value must come from current reads.
export const B2C_CENSUS_FIELDS=Object.freeze(['rol','role','tipo_cuenta','account_type',
    'b2b_activo','sub_type','subtype','estado','status','kyc.estado','kyc.aprobado',
    'disponible','vehiculo.tipo','vehiculo.placas','vehiculo_tipo','placas',
    'logistica.vehiculo','logistica.placas','nombre','suspendido']);

const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?
    Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
const same=(a,b)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b));

export function inspectB2cCensusEvidence(receipts,{now=Date.now()}={}){
    const fail=reason=>({ok:false,reason,objectives:[{objective:'Censo B2C completo',satisfied:false}]});
    const rows=new Map();let total=null,cursor=null,started=false,exhausted=false,lastTime=null,scope=null,lastGap=null;
    for(const receipt of receipts){
        if(receipt.name!=='platform.query'||receipt.ok!==true)continue;
        const observation=receipt.observation,e=observation?.recordEvidence,s=e?.scope;
        if(observation?.ok!==true||observation.blocked===true||observation.executionOk===false||
            e?.source!=='FIRESTORE_SERVER_AUTHENTICATED'||e.readOnly!==true||s?.collection!=='users'||s.mode!=='query')continue;
        // Only the exact full technician population or the whole users
        // population can establish this census; a B2C equality filter can
        // silently omit legacy accounts whose account-type field is absent.
        if(!same(s.filters,[])&&!same(s.filters,[{field:'rol',op:'==',value:'tecnico'}])){
            lastGap={reason:'CENSUS_SCOPE_EXCLUDES_LEGACY_ACCOUNTS',acceptedFilters:[[],[{field:'rol',op:'==',value:'tecnico'}]]};continue;
        }
        const schema=e.fieldSchema;
        const knownAbsent=field=>schema?.source==='SERVER_RECORD_FIELD_NAMES'&&schema.collection==='users'&&
            schema.completeForObservedRows===true&&schema.sampledRows===e.rows?.length&&
            Array.isArray(schema.paths)&&!schema.paths.includes(field);
        const missingFields=B2C_CENSUS_FIELDS.filter(field=>!s.fields?.includes(field)&&!knownAbsent(field));
        if(missingFields.length){lastGap={reason:'CENSUS_FIELD_PROJECTION_INCOMPLETE',missingFields,
            observedFieldPaths:schema?.paths||[],schemaComplete:schema?.completeForObservedRows===true};continue;}
        if(!Array.isArray(s.implicitExistenceFields)||s.implicitExistenceFields.length||
            !Array.isArray(e.truncatedFields)||e.truncatedFields.length)return fail('CENSUS_FIELDS_INCOMPLETE');
        const time=Date.parse(e.rowsObservedAt);
        if(!Number.isFinite(time)||time>now+5000||now-time>300000)return fail('CENSUS_EVIDENCE_STALE');
        if(!Number.isInteger(e.totalCount)||e.totalCount<0||!Array.isArray(e.rows)||
            e.returnedCount!==e.rows.length)return fail('CENSUS_COUNT_UNVERIFIED');
        if(exhausted)return fail('CENSUS_MULTIPLE_POPULATIONS');
        const populationScope={...s,fields:undefined};
        if(!started){if(e.previousCursor)return fail('CENSUS_FIRST_PAGE_MISSING');total=e.totalCount;scope=populationScope;started=true;}
        else if(!same(scope,populationScope)||e.previousCursor!==cursor||total!==e.totalCount)return fail('CENSUS_PAGE_CHAIN_INVALID');
        for(const row of e.rows){
            if(!row?.id||rows.has(row.id)||!row.values||
                !B2C_CENSUS_FIELDS.every(field=>Object.hasOwn(row.values,field)||knownAbsent(field)))return fail('CENSUS_ROW_INCOMPLETE');
            rows.set(row.id,Object.fromEntries(B2C_CENSUS_FIELDS.map(field=>[field,
                Object.hasOwn(row.values,field)?row.values[field]:null])));
        }
        cursor=e.nextCursor;exhausted=e.hasMore===false&&e.queryExhausted===true;
        if(!exhausted&&(!cursor||e.hasMore!==true))return fail('CENSUS_CURSOR_INVALID');
        lastTime=e.rowsObservedAt;
    }
    if(!started||!exhausted||rows.size!==total)return {...fail(lastGap?.reason||'CENSUS_POPULATION_INCOMPLETE'),...(lastGap?{evidenceNeeded:lastGap}:{})};
    const result={total:0,pendientesRevision:0,registroIncompleto:0,aprobadosActivos:0,
        disponiblesDeclarados:0,excluidosB2B:0,transportes:{auto:0,moto:0,camioneta:0,bicicleta:0,peaton:0,otroOSinDeclarar:0},tecnicos:[]};
    for(const [id,values] of rows){
        const raw={};
        for(const field of B2C_CENSUS_FIELDS){
            const value=values[field];
            if(value===null)continue;
            const parts=field.split('.');let target=raw;
            for(const part of parts.slice(0,-1))target=target[part]||=( {} );
            target[parts.at(-1)]=value;
        }
        if(raw.rol!=='tecnico')continue;
        if(contract.isB2BAccountProfile(raw)){result.excluidosB2B++;continue;}
        const profile=contract.normalizeTechnicianProfile(raw),states=contract.TECHNICIAN_STATES;
        result.total++;
        if([states.PENDING_REVIEW,states.DOCUMENTS_UPLOADED].includes(profile.estado))result.pendientesRevision++;
        if([states.REGISTRATION_STARTED,states.DOCUMENTS_PENDING].includes(profile.estado))result.registroIncompleto++;
        if(profile.estado===states.ACTIVE&&profile.status===states.ACTIVE&&profile.kyc.aprobado===true)result.aprobadosActivos++;
        if(profile.disponible)result.disponiblesDeclarados++;
        const tipo=profile.vehiculo.tipo;
        const key=Object.hasOwn(result.transportes,tipo)?tipo:'otroOSinDeclarar';result.transportes[key]++;
        result.tecnicos.push({id,nombre:typeof raw.nombre==='string'?raw.nombre:'',
            transporte:tipo,placas:raw.vehiculo?.placas??raw.placas??raw.logistica?.placas??''});
    }
    result.tecnicos.sort((a,b)=>a.id.localeCompare(b.id));
    return {ok:true,result,observedAt:lastTime,
        limits:['Disponibilidad declarada; no certifica elegibilidad operativa.',
            'Lecturas paginadas de servidor; no transaccion atomica.'],
        objectives:[{objective:'Censo B2C completo',satisfied:true}]};
}

export function verifyB2cCensusReport({receipts,proposedReport}){
    const evidence=inspectB2cCensusEvidence(receipts);
    if(!evidence.ok)return evidence;
    let proposed;
    try {proposed=JSON.parse(proposedReport);}catch{return {...evidence,ok:false,reason:'CENSUS_REPORT_JSON_REQUIRED',
        objectives:[...evidence.objectives,{objective:'Respuesta verificada',satisfied:false}]};}
    const ok=same(proposed,evidence.result);
    return {...evidence,ok,reason:ok?'VERIFIED_COMPLETE':'CENSUS_REPORT_MISMATCH',
        objectives:[...evidence.objectives,{objective:'Respuesta verificada',satisfied:ok}]};
}
