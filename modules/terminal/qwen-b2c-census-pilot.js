import {runQwenTerminalReadPilot} from './qwen-direct-pilot.js';
import {B2C_CENSUS_FIELDS,inspectB2cCensusEvidence,verifyB2cCensusReport} from './qwen-b2c-census-evidence.js';

export const QWEN_B2C_CENSUS_INSTRUCTION='Consulta los tecnicos B2C registrados en users con rol = tecnico, excluyendo cuentas B2B. '+
    'Informa cuantos estan pendientes de revision, cuantos tienen registro incompleto, aprobados activos y disponibles declarados. '+
    'Cuenta automovil, moto, camioneta, bicicleta y desplazamiento a pie. Detalla transporte y placas registradas por tecnico. Solo lectura.';

// Explicit pilot entry, never keyword routing. Tool selection and arguments
// remain Qwen decisions, subject to existing runtime/Firestore authorization.
export async function runQwenB2cCensusPilot(options){
    const allowed=new Set(['repo.search','repo.read','platform.query']);
    const runtime=options.toolRuntime;
    const toolRuntime={list:()=>runtime.list().filter(tool=>allowed.has(tool.name)).map(tool=>{
        if(tool.name!=='platform.query')return tool;
        const inputSchema=structuredClone(tool.inputSchema),properties=inputSchema.properties;
        properties.collection={...properties.collection,const:'users'};
        properties.filters={...properties.filters,enum:[[],[{field:'rol',op:'==',value:'tecnico'}]]};
        properties.fields={...properties.fields,items:{type:'string',enum:['__name__',...B2C_CENSUS_FIELDS]}};
        properties.includeCount={...properties.includeCount,const:true};
        inputSchema.required=[...new Set([...(inputSchema.required||[]),'includeCount'])];
        return {...tool,inputSchema};
    })};
    const instruction=QWEN_B2C_CENSUS_INSTRUCTION+
        '\nContrato de entrega del piloto: lee fuentes y esquema antes de consultar; app-registro.js, panel-admin.js y b2c-technician-profile.js son pistas, no prueba de registros. '+
        'La cobertura requiere users sin filtros adicionales a rol == tecnico (o users completo), includeCount=true, todas las paginas y estos campos acreditados: '+JSON.stringify(B2C_CENSUS_FIELDS)+'. '+
        'Si faltan campos acreditados descubre nombres con fields=["__name__"] mediante platform.query. '+
        'Despues proyecta los campos pertinentes realmente presentes en fieldSchema.paths; no inventes campos ni proyectes alias ausentes. '+
        'La ausencia de un campo solo se acepta si fieldSchema.completeForObservedRows la acredita para esa misma pagina. '+
        'No sustituyas B2C por flotilla B2B. La comprobacion independiente calculara el censo exclusivamente desde recibos completos. '+
        'Cuando COMPROBACION_INDEPENDIENTE.ok sea true, elige FINISH y report debe ser el JSON exacto de su propiedad result. '+
        'No finalices si la comprobacion sigue incompleta.';
    return runQwenTerminalReadPilot({...options,instruction,toolRuntime,maximumSteps:12,
        summarizeEvidence:receipts=>inspectB2cCensusEvidence(receipts),
        verifyObjectives:verifyB2cCensusReport});
}
