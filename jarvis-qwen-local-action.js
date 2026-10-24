import {resolveLocalQwenContextTokens,assertLocalQwenPromptPreflight} from './jarvis-qwen-context-policy.js';

// Local-only decision adapter for the isolated V142 read-only agent pilot.
// The selected model decides a next action; the host still authorizes and
// executes every tool and independently certifies mission completion.
export const LOCAL_QWEN_ACTION_ADAPTER_VERSION='v142-qwen-local-decision-1';

function jsonSchema(tools,allowFinish=true,reportSchema={type:'string'}){
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
        ...(allowFinish?[branch('FINISH','',{type:'object',additionalProperties:false},reportSchema)]:[])]};
}

export function createLocalQwenActionSelector({
    fetchImpl=fetch,
    model='qwen3.5:9b',
    endpoint='http://127.0.0.1:11434/api/chat',
    requestTimeoutMs=120000,
    maxOutputTokens=256,
    retryIncompleteOnce=false,
    contextTokens=undefined,
    onInference=()=>{}
}={}){
    if(typeof window!=='undefined')throw new Error('LOCAL_QWEN_SERVER_ONLY');
    const target=new URL(endpoint);
    if(!['127.0.0.1','localhost','::1'].includes(target.hostname)||
        target.protocol!=='http:'||target.pathname!=='/api/chat'){
        throw new Error('LOCAL_QWEN_LOOPBACK_ENDPOINT_REQUIRED');
    }
    if(model!=='qwen3.5:9b')throw new Error('LOCAL_QWEN_SINGLE_MODEL_REQUIRED');
    const resolvedContext=resolveLocalQwenContextTokens(contextTokens ??
        (typeof process!=='undefined'?process.env.JARVIS_LOCAL_LLM_CONTEXT_TOKENS:undefined));
    return async function selectNextAction({
        instruction,repositoryMap,tools=[],observations=[],evidenceSummary=null,missionLedger=null,iteration=0,signal
    }={}){
        if(typeof instruction!=='string'||!instruction.trim())throw new Error('MISSION_INSTRUCTION_REQUIRED');
        if(!Array.isArray(tools)||(!tools.length&&!(observations.length&&evidenceSummary?.finishEligible===true))||tools.some(tool=>
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
            if(read&&!read.parameters.properties?.file?.enum)read.parameters={...read.parameters,properties:{...read.parameters.properties,
                file:{...read.parameters.properties?.file,enum:observedFiles}}};
        }
        const readTool=toolsForModel.find(tool=>tool.name==='repo.read');
        const readEnum=readTool?.parameters?.properties?.file?.enum;
        if(readEnum){
            const completed=new Set(missionLedger?.completedSources||[]);
            const unread=readEnum.filter(file=>!completed.has(file));
            if(unread.length)readTool.parameters={...readTool.parameters,properties:{...readTool.parameters.properties,
                file:{...readTool.parameters.properties.file,enum:unread}}};
            else toolsForModel.splice(toolsForModel.indexOf(readTool),1);
        }
        const sourceFields=observations.filter(item=>item.ok===true&&item.name==='repo.read')
            .flatMap(item=>{const b=item.observation?.verifiedRead?.sourceStructure?.dataBindings;
                return [...(b?.writeShapes||[]),...(b?.queryShapes||[])].filter(s=>s.collection==='users').flatMap(s=>s.fields||[]);});
        const fieldNames=[...new Set([...sourceFields,...observations.filter(item=>item.ok===true &&
            item.observation?.recordEvidence?.source==='FIRESTORE_SERVER_AUTHENTICATED' &&
            item.observation?.recordEvidence?.fieldSchema?.source==='SERVER_RECORD_FIELD_NAMES')
            .flatMap(item=>item.observation.recordEvidence.fieldSchema.paths||[])])];
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
                if(properties?.filters?.enum)properties.filters.enum=properties.filters.enum.filter(filters=>
                    filters.every(filter=>fieldNames.includes(filter.field)));
                if(properties?.orderBy?.items?.properties?.field)properties.orderBy.items.properties.field.enum=['__name__',...fieldNames];
            }
        }
        for(const tool of toolsForModel){
            if(tool.name.startsWith('browser.')&&tool.parameters.required?.includes('url')){
                const urls=[...new Set(observations.filter(r=>r.ok).flatMap(r=>[...(r.name==='page.create'&&r.observation?.url?[r.observation.url]:[]),...(tool.name==='browser.inspect'?(r.observation?.sources||[]).map(s=>s.url):[])]))];
                const narrowed=tool.parameters.properties?.url?.enum;
                const permitted=Array.isArray(narrowed)?urls.filter(url=>narrowed.includes(url)):urls;
                if(urls.length||Array.isArray(narrowed))tool.parameters={...tool.parameters,properties:{...tool.parameters.properties,url:{type:'string',enum:permitted}}};
            }
        }
        for(let i=toolsForModel.length-1;i>=0;i--)if(toolsForModel[i].name.startsWith('browser.')&&toolsForModel[i].parameters.properties?.url?.enum?.length===0)toolsForModel.splice(i,1);
        const latest=observations.slice(-6);
        const outputSchema=jsonSchema(toolsForModel,evidenceSummary?.finishEligible!==false,evidenceSummary?.reportSchema);
        const policy='Eres Qwen3.5:9b, unico modelo local que dirige esta mision. '+
            'Decide UNA siguiente herramienta de la lista y sus argumentos. Algunas son creativas, nunca asumas que todas son solo lectura o estan bloqueadas; el ejecutor comprueba autorizacion. '+
            'Si falta evidencia, elige CALL: nunca FINISH antes de contar con lecturas verificadas. '+
            'Si ya tienes evidencia necesaria, elige FINISH y redacta un reporte conciso, '+
            'sin inventar fuentes ni completar objetivos basados solo en el indice. '+
            'Responde exclusivamente JSON segun el formato provisto. '+
            'La autorizacion y la certificacion las comprueba el ejecutor externo, no tu. '+
            'Respeta requiresEvidence: primero ejecuta una herramienta que produzca ese evidenceKind y verifica sus valores observados. El mapa no sustituye un recibo de lectura. '+
            'Para CALL usa name de una herramienta, args objeto y report vacio. '+
            'Para FINISH usa name vacio, args {} y report con los resultados observados.';
        const finishEngineering=toolsForModel.length===0&&evidenceSummary?.reportOnly===true&&evidenceSummary?.objectives?.code===true;
        const sourcePaths=finishEngineering&&Array.isArray(evidenceSummary.engineeringSourceRequirements)?
            evidenceSummary.engineeringSourceRequirements.filter(file=>typeof file==='string').slice(0,6):[];
        const testCommands=finishEngineering&&Array.isArray(evidenceSummary.engineeringExecutedTests)?
            evidenceSummary.engineeringExecutedTests.filter(t=>t?.status==='PASSED'&&t.testsPassed===true&&t.exitCode===0).map(t=>t.command).filter(x=>typeof x==='string').slice(0,5):[];
        const finalReportContract=finishEngineering?
            'CONTRATO DE INFORME TECNICO PARA FINISH. Redacta en espanol un dictamen tecnico original de al menos 180 caracteres, concreto y fundamentado. '+
            'CITA LITERALMENTE las siguientes rutas completas, incluida su carpeta, y explica para cada una la responsabilidad observada: '+JSON.stringify(sourcePaths)+'. '+
            'Estas son las UNICAS suites con recibo de ejecucion exitosa; menciona su comando exacto, sin abreviarlo ni decir solo pruebas de sintaxis: '+JSON.stringify(testCommands)+'. '+
            'No confundas leer un test con ejecutarlo. Una prueba check:syntax comprueba sintaxis, NO ausencia de vulnerabilidades ni seguridad entre usuarios. '+
            'Para KYC diferencia vinculo UID-rutas-INE-rostro de comportamiento de autorizacion aun no probado. No afirmes que no hay fallos sin evidencia. '+
            (evidenceSummary.reportRevisionInstruction?'CORRECCION DEL RECHAZO PREVIO: '+evidenceSummary.reportRevisionInstruction+'. ':'')+
            'Estructura report como FUENTES LEIDAS, PRUEBAS EJECUTADAS y LIMITES NO DEMOSTRADOS. No inventes rutas, resultados ni cambios.':null;
        const messages=[
            {role:'system',content:policy},
            ...(repositoryMap&&!observations.length?[{role:'system',content:String(repositoryMap).slice(0,3000)}]:[]),
            {role:'user',content:instruction},
            {role:'user',content:'HERRAMIENTAS_AUTORIZADAS_DEL_PASO='+JSON.stringify(toolsForModel)},
            {role:'user',content:'RESULTADOS_VERIFICADOS='+JSON.stringify(latest)},
            ...(evidenceSummary?[{role:'user',content:'COMPROBACION_INDEPENDIENTE='+JSON.stringify(evidenceSummary)}]:[]),
            ...(missionLedger?[{role:'user',content:'ESTADO_PERSISTENTE_DE_ESTA_MISION='+JSON.stringify(missionLedger)+
                '\nElige una accion NUEVA que aporte la evidencia faltante. Los IDs no contienen valores de los campos. No repitas consultas completadas. Si el esquema ya acredita nombres, solicita sus valores pertinentes; si hay error de campo, lee fuentes especificas o descubre nombres antes de reintentar. FINISH requiere comprobacion independiente positiva.'}]:[]),
            ...(finalReportContract?[{role:'user',content:finalReportContract}]:[])
        ];
        const timeout=AbortSignal.timeout(Math.max(1000,Math.min(240000,Number(requestTimeoutMs)||120000)));
        const controller=signal?AbortSignal.any([signal,timeout]):timeout;
        const startedAt=Date.now();
        const numPredict=Math.max(64,Math.min(2400,Number(maxOutputTokens)||256));
        const request=async(predictionLimit,priorTruncated=false)=>{
            const outgoingMessages=priorTruncated?[...messages,{role:'user',content:
                'La respuesta anterior se truncó. Devuelve SOLO la siguiente llamada JSON completa, con cadenas breves y sin razonamiento ni informe adicional.'}]:messages;
            assertLocalQwenPromptPreflight({contextTokens:resolvedContext,messages:outgoingMessages,
                format:outputSchema,maxOutputTokens:predictionLimit});
            const response=await fetchImpl(endpoint,{
                method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',
                body:JSON.stringify({
                    model,stream:false,think:false,truncate:false,shift:false,
                    format:outputSchema,
                    options:{temperature:0,num_ctx:resolvedContext,num_predict:predictionLimit},
                    messages:outgoingMessages
                }),
                signal:controller
            });
            if(!response.ok)throw new Error('LOCAL_QWEN_HTTP_'+response.status);
            return response.json();
        };
        let result=await request(numPredict);
        let retries=0,usedPromptTokens=Number(result.prompt_eval_count)||0,
            usedOutputTokens=Number(result.eval_count)||0;
        if(result.done_reason==='length'&&retryIncompleteOnce){
            retries=1;
            result=await request(Math.min(4096,Math.max(3072,numPredict+512)),true);
            usedPromptTokens+=Number(result.prompt_eval_count)||0;
            usedOutputTokens+=Number(result.eval_count)||0;
        }
        if(result.done_reason==='length')throw new Error('LOCAL_QWEN_ACTION_INCOMPLETE');
        let parsed;
        try{parsed=JSON.parse(String(result.message?.content||''));}
        catch{throw new Error('LOCAL_QWEN_ACTION_JSON_REQUIRED');}
        if(!parsed||typeof parsed!=='object'||!['CALL','FINISH'].includes(parsed.action))
            throw new Error('LOCAL_QWEN_ACTION_INVALID');
        const usage={
            stage:'DIRECT_READ_ONLY_ACTION',iteration,
            durationMs:Date.now()-startedAt,
            promptTokens:usedPromptTokens,
            outputTokens:usedOutputTokens,
            incompleteRetries:retries,
            toolCount:tools.length
        };
        onInference(usage);
        if(parsed.action==='FINISH'){
            if(!observations.some(ob=>ob.ok===true))
                throw new Error('LOCAL_QWEN_PREMATURE_FINISH');
            return {finish:true,report:parsed.report&&typeof parsed.report==='object'?JSON.stringify(parsed.report):String(parsed.report||'')};
        }
        if(typeof parsed.name!=='string'||!tools.some(tool=>tool.name===parsed.name))
            throw new Error('LOCAL_QWEN_UNKNOWN_TOOL');
        if(!parsed.args||Array.isArray(parsed.args)||typeof parsed.args!=='object')
            throw new Error('LOCAL_QWEN_ARGS_REQUIRED');
        return {toolCall:{name:parsed.name,args:parsed.args}};
    };
}
