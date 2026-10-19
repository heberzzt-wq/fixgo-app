// Local-only decision adapter for the isolated V142 read-only agent pilot.
// The selected model decides a next action; the host still authorizes and
// executes every tool and independently certifies mission completion.
export const LOCAL_QWEN_ACTION_ADAPTER_VERSION='v142-qwen-local-decision-1';

function jsonSchema(tools){
    const branch=(action,name,args,report)=>({type:'object',properties:{
        action:{const:action},name:{const:name},args,report
    },required:['action','name','args','report'],additionalProperties:false});
    const alternatives=schema=>{
        if(!Array.isArray(schema.anyOf))return [schema];
        const {anyOf,...base}=schema;
        return anyOf.map(choice=>({...base,...choice,
            properties:Object.fromEntries([...new Set([...Object.keys(base.properties||{}),...Object.keys(choice.properties||{})])]
                .map(key=>{const a=base.properties?.[key]||{},b=choice.properties?.[key]||{};
                    return [key,{...a,...b,...(a.items||b.items?{items:{...a.items,...b.items}}:{})}];})),
            required:[...new Set([...(base.required||[]),...(choice.required||[])])]}));
    };
    return {anyOf:[...tools.flatMap(tool=>alternatives(tool.parameters).map(args=>branch('CALL',tool.name,args,{const:''}))),
        branch('FINISH','',{type:'object',additionalProperties:false},{type:'string'})]};
}

export function createLocalQwenActionSelector({
    fetchImpl=fetch,
    model='qwen3.5:9b',
    endpoint='http://127.0.0.1:11434/api/chat',
    requestTimeoutMs=120000,
    maxOutputTokens=256,
    onInference=()=>{}
}={}){
    if(typeof window!=='undefined')throw new Error('LOCAL_QWEN_SERVER_ONLY');
    const target=new URL(endpoint);
    if(!['127.0.0.1','localhost','::1'].includes(target.hostname)||
        target.protocol!=='http:'||target.pathname!=='/api/chat'){
        throw new Error('LOCAL_QWEN_LOOPBACK_ENDPOINT_REQUIRED');
    }
    if(model!=='qwen3.5:9b')throw new Error('LOCAL_QWEN_SINGLE_MODEL_REQUIRED');
    return async function selectNextAction({
        instruction,repositoryMap,tools=[],observations=[],evidenceSummary=null,iteration=0,signal
    }={}){
        if(typeof instruction!=='string'||!instruction.trim())throw new Error('MISSION_INSTRUCTION_REQUIRED');
        if(!Array.isArray(tools)||!tools.length||tools.some(tool=>
            !tool?.name||!tool?.inputSchema)){
            throw new Error('QWEN_TOOL_CATALOG_REQUIRED');
        }
        const toolsForModel=tools.map(tool=>({
            name:tool.name,description:tool.description||'',
            parameters:tool.inputSchema,requiresEvidence:tool.requiresEvidence||[],evidenceKinds:tool.evidenceKinds||[]
        }));
        const observedFiles=[...new Set(observations.filter(item=>item.ok===true)
            .flatMap(item=>item.name==='repo.search'?(item.observation?.results||[]).map(result=>result.file):
                item.name==='repo.read'?[item.observation?.verifiedRead?.file]:[])
            .filter(file=>typeof file==='string'&&file.length>0&&file.length<=500))].slice(0,64);
        if(observedFiles.length){
            const read=toolsForModel.find(tool=>tool.name==='repo.read');
            if(read)read.parameters={...read.parameters,properties:{...read.parameters.properties,
                file:{...read.parameters.properties?.file,enum:observedFiles}}};
        }
        const fieldNames=[...new Set(observations.filter(item=>item.ok===true &&
            item.observation?.recordEvidence?.source==='FIRESTORE_SERVER_AUTHENTICATED' &&
            item.observation?.recordEvidence?.fieldSchema?.source==='SERVER_RECORD_FIELD_NAMES')
            .flatMap(item=>item.observation.recordEvidence.fieldSchema.paths||[]))];
        if(fieldNames.length){
            const query=toolsForModel.find(tool=>tool.name==='platform.query');
            if(query){
                query.parameters=structuredClone(query.parameters);
                const properties=query.parameters.properties;
                if(properties?.fields?.items){
                    const allowed=properties.fields.items.enum;
                    properties.fields.items.enum=['__name__',...fieldNames].filter(field=>!allowed||allowed.includes(field));
                }
                if(properties?.filters?.items?.properties?.field)properties.filters.items.properties.field.enum=fieldNames;
                if(properties?.orderBy?.items?.properties?.field)properties.orderBy.items.properties.field.enum=['__name__',...fieldNames];
            }
        }
        const latest=observations.slice(-6);
        const outputSchema=jsonSchema(toolsForModel);
        const policy='Eres Qwen3.5:9b, unico modelo local que dirige esta mision. '+
            'Decide UNA siguiente herramienta de la lista y sus argumentos. '+
            'Si falta evidencia, elige CALL: nunca FINISH antes de contar con lecturas verificadas. '+
            'Si ya tienes evidencia necesaria, elige FINISH y redacta un reporte conciso, '+
            'sin inventar fuentes ni completar objetivos basados solo en el indice. '+
            'Responde exclusivamente JSON segun el formato provisto. '+
            'La autorizacion y la certificacion las comprueba el ejecutor externo, no tu. '+
            'Respeta requiresEvidence: primero ejecuta una herramienta que produzca ese evidenceKind y verifica sus valores observados. El mapa no sustituye un recibo de lectura. '+
            'Para CALL usa name de una herramienta, args objeto y report vacio. '+
            'Para FINISH usa name vacio, args {} y report con los resultados observados.';
        const messages=[
            {role:'system',content:policy},
            ...(repositoryMap?[{role:'system',content:String(repositoryMap).slice(0,6000)}]:[]),
            {role:'user',content:instruction},
            {role:'user',content:'HERRAMIENTAS_DE_SOLO_LECTURA='+JSON.stringify(toolsForModel)},
            {role:'user',content:'RESULTADOS_VERIFICADOS='+JSON.stringify(latest)},
            ...(evidenceSummary?[{role:'user',content:'COMPROBACION_INDEPENDIENTE='+JSON.stringify(evidenceSummary)}]:[])
        ];
        const timeout=AbortSignal.timeout(Math.max(1000,Math.min(240000,Number(requestTimeoutMs)||120000)));
        const controller=signal?AbortSignal.any([signal,timeout]):timeout;
        const startedAt=Date.now();
        const response=await fetchImpl(endpoint,{
            method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',
            body:JSON.stringify({
                model,stream:false,think:false,
                format:outputSchema,
                options:{temperature:0,num_ctx:16384,num_predict:
                    Math.max(64,Math.min(1024,Number(maxOutputTokens)||256))},
                messages
            }),
            signal:controller
        });
        if(!response.ok)throw new Error('LOCAL_QWEN_HTTP_'+response.status);
        const result=await response.json();
        if(result.done_reason==='length')throw new Error('LOCAL_QWEN_ACTION_INCOMPLETE');
        let parsed;
        try{parsed=JSON.parse(String(result.message?.content||''));}
        catch{throw new Error('LOCAL_QWEN_ACTION_JSON_REQUIRED');}
        if(!parsed||typeof parsed!=='object'||!['CALL','FINISH'].includes(parsed.action))
            throw new Error('LOCAL_QWEN_ACTION_INVALID');
        const usage={
            stage:'DIRECT_READ_ONLY_ACTION',iteration,
            durationMs:Date.now()-startedAt,
            promptTokens:Number(result.prompt_eval_count)||0,
            outputTokens:Number(result.eval_count)||0,
            toolCount:tools.length
        };
        onInference(usage);
        if(parsed.action==='FINISH'){
            if(!observations.some(ob=>ob.ok===true))
                throw new Error('LOCAL_QWEN_PREMATURE_FINISH');
            return {finish:true,report:String(parsed.report||'')};
        }
        if(typeof parsed.name!=='string'||!tools.some(tool=>tool.name===parsed.name))
            throw new Error('LOCAL_QWEN_UNKNOWN_TOOL');
        if(!parsed.args||Array.isArray(parsed.args)||typeof parsed.args!=='object')
            throw new Error('LOCAL_QWEN_ARGS_REQUIRED');
        return {toolCall:{name:parsed.name,args:parsed.args}};
    };
}
