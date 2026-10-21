import {planImageAdaptation} from '../../gestia-core/jarvis/jarvis.image.adapter.js';
import {LOCAL_VIDEO_EVIDENCE_CAPABILITIES,MEDIA_TOOLS,mediaEntries,producedMedia,deliveredImageHistory,producedImageHistory} from './qwen-general-media.js';
import {createQwenBridgeActionSelector} from './qwen-direct-transport.js';
import {runQwenTerminalReadPilot} from './qwen-direct-pilot.js';
import {createGeneralToolPolicy,normalizeGeneralSchema} from '../../jarvis-qwen-general-policy.js?pilot=engineering-read-20261021-v9';
import {advertisingSourceText,generalObjectives,GENERAL_COUNT_FIELDS,summarizeGeneralEvidence,verifyGeneralMission,independentResearchProofs,researchOfficeContent,researchSourceProofs,researchQuoteRelevant,researchTopic,codeConcurrencyRequested} from './qwen-general-evidence.js?pilot=engineering-audit-20261021-v12';
import {receiptBoundProductionContent,prioritizeReceiptBoundProduction} from './qwen-production-document.js';
import {resumedMissionId,originalResumedMissionId,readSavedMission,verifiedResumeReceipts,verifiedResearchResumeReceipts} from './qwen-general-resume.js?pilot=research-resume-20261021-v4';
import {classifyEmptyGeneralCatalog,requestQwenGeneralConversation} from './qwen-empty-catalog.js?pilot=concise-20261021-v8';
// Session-only conversational memory, scoped to the authenticated Firebase user.
// Never persisted as proof of a tool result.
const localConversationHistory=new WeakMap();
import {requiredDeliveryFormats,missingMissionInputs,unavailableMissionOperations,unfulfilledDownloadFormats,prioritizeGeneralOfficeCatalog} from './qwen-general-contract.js';

function variantSelections(formats){
    const variants=formats.map(f=>({id:'w'+f.properties.width.const+'-h'+f.properties.height.const,width:f.properties.width.const,height:f.properties.height.const,mimeType:'image/png'}));
    const selections=[];
    const visit=(start,chosen)=>{if(chosen.length)selections.push(chosen);if(chosen.length===3)return;for(let i=start;i<variants.length;i++)visit(i+1,[...chosen,variants[i]]);};
    visit(0,[]);return selections;
}
export function generalToolCatalog(runtime,policy,objectives,instruction=''){
    const formats=[];
    for(const match of instruction.matchAll(/\b(\d{2,4})\s*[x×]\s*(\d{2,4})\b/gi)){
        try{formats.push(...planImageAdaptation({variants:[{id:'requested',width:Number(match[1]),height:Number(match[2]),mimeType:'image/png'}]}).variants);}catch{/* Outside the existing renderer contract. */}
    }
    if(objectives?.reel&&!formats.length)formats.push({width:1080,height:1920});
    if(!formats.length)formats.push(...planImageAdaptation().variants);
    const dimensions=[...new Map(formats.map(f=>[f.width+'x'+f.height,{width:f.width,height:f.height}])).values()];
    const needed=new Set([
        ...(objectives?.advertising?['advertising.research','media.library','image.adapt','media.analyze','artifact.read','browser.inspect',...(objectives.reel?['speech.synthesize','reel.create']:[])]:[]),
        ...(objectives?.capabilities?['system.capabilities']:[]),
        ...(objectives?.code?['repo.search','repo.grep','repo.read','repo.diagnose','repo.prepareWrite','tests.run','repo.gitStatus']:[]),
        ...(objectives?.research&&!objectives?.advertising?['web.research','browser.inspect']:[]),
        ...(objectives?.records?['repo.search','repo.read','platform.query']:[]),
        ...(objectives?.page?['page.create','browser.open','browser.inspect','browser.screenshot','media.analyze','artifact.read']:[]),
        ...(objectives?.document?['document.create','artifact.read','media.library']:[])
    ]);
    return runtime.list().filter(t=>policy.accept(t)&&needed.has(t.name)).map(tool=>{
        const t={...tool,inputSchema:normalizeGeneralSchema(tool.inputSchema)};
        const p=t.inputSchema.properties||{};
        if(tool.name.startsWith('browser.')){p.url={type:'string'};t.inputSchema.required=[...new Set([...(t.inputSchema.required||[]),'url'])];}
        if(tool.name==='advertising.research'){
            t.description='Investiga principios de publicidad y diseño de servicios profesionales sin nombres de marca o cliente. Busca guías independientes de marketing jurídico/fiscal y creatividad; jamás empresas homónimas. Necesitamos dos fuentes con contenido real comprobable.';
            p.query={type:'string',minLength:24,maxLength:200,description:'Consulta GENERICA sobre buenas practicas de marketing fiscal/legal, sin el nombre comercial ni el dominio del cliente'};
            t.inputSchema.required=[...new Set([...(t.inputSchema.required||[]),'query'])];
        }
        if(tool.name==='media.analyze'){t.description='Revisa con Qwen local los pixeles del PNG importado, grafico producido o captura, y tres fotogramas y audio del MP4 producido. Usa output exacto observado.';p.output={type:'string'};t.inputSchema.required=['output'];}
        if(tool.name==='repo.read'&&!objectives.code)p.file={type:'string',enum:['app-registro.js','panel-admin.js','b2c-technician-profile.js','gestia-core/contracts/b2c-platform-contract.js']};
        if(tool.name==='platform.query'){
            p.collection={type:'string',const:'users'};p.mode={type:'string',const:'query'};
            t.inputSchema.required=[...new Set([...(t.inputSchema.required||[]),'mode'])];
            p.filters={type:'array',enum:[[{field:'rol',op:'==',value:'tecnico'}]]};
            p.fields={type:'array',minItems:1,items:{type:'string',enum:['__name__',...GENERAL_COUNT_FIELDS]}};
            p.includeCount={type:'boolean',const:true};
            t.inputSchema.required=[...new Set([...(t.inputSchema.required||[]),'includeCount','fields','filters'])];
        }
        if(['page.create','document.create','browser.screenshot'].includes(tool.name)){
            p.output={type:'string',description:'Unique new file below '+policy.artifactRoot,pattern:'^\\.'+policy.artifactRoot.slice(1)+'[a-zA-Z0-9_-]{1,60}\\.(html|txt|md|json|png)$'};
            t.inputSchema.required=[...new Set([...(t.inputSchema.required||[]),'output'])];
        }
        if(tool.name==='page.create'){
            p.services={type:'array',items:{type:'object',properties:{title:{type:'string'},description:{type:'string'}},required:['title','description'],additionalProperties:false}};
            t.inputSchema.required.push('brandName','title','description','services');
        }
        if(tool.name==='document.create'){
            t.description=objectives.advertising?'Crea un documento de PRODUCCION, no un certificado ni un reporte de estado. content debe ser JSON con narration, durationSeconds, scenes [{durationSeconds,assetOutput,overlay,subtitle}], resources [{output,sha256}] (guion hablado, tiempos, subtitulos y recursos reales para reel) o socialCopy y formats (textos y piezas de campana), mas sources y limitations. Usa los argumentos y recibos reales. No incluyas status VERIFIED_COMPLETE: la certificacion pertenece al ejecutor.':'Crea y guarda un archivo fisico nuevo. Para exportar conteos usa format json y content igual al agregado independiente. Un reporte FINISH no crea un archivo.';
            if(objectives.advertising)p.content={...p.content,type:'string',description:objectives.reel?'JSON production screenplay: narration, durationSeconds, scenes [{durationSeconds,assetOutput,overlay,subtitle}], resources [{output,sha256}], sources, limitations. Every resource and timing must match physical receipts; no self-certification.':'JSON production brief: socialCopy, formats, resources [{output,sha256}], sources, limitations; match physical receipts, no self-certification.'};
            const formats=requiredDeliveryFormats(instruction);
            p.format=objectives.advertising?{type:'string',const:'json'}:
                {type:'string',enum:formats.length?formats:['txt','md','json']};
            if(formats.length&&!objectives.advertising){
                p.output={type:'string',pattern:'^\\.jarvis-artifacts/qwen-general/'+policy.artifactRoot.split('/').at(-2)+'/'+(/^(?:CONTINUAR_MISION:)\s*general-/iu.test(instruction)?'recovery-':'')+'[a-zA-Z0-9_-]{1,40}\\.('+formats.join('|')+')$'};
                p.requireDocumentValidation={type:'boolean',const:true};
                p.documentContract={type:'object',const:{documentKind:'original_draft',minWords:80,minSections:3}};
                p.requireFormulas={type:'boolean',const:/f[oó]rmulas|c[aá]lculos|totales/i.test(instruction)};
                p.sheets={type:'array',maxItems:5,items:{type:'object',properties:{
                    name:{type:'string',minLength:1,maxLength:31},
                    rows:{type:'array',minItems:1,maxItems:300,items:{type:'array',items:{type:['string','number','boolean','null']}}}
                },required:['name','rows'],additionalProperties:false}};
                p.rows={type:'array',maxItems:300,items:{type:'array',items:{type:['string','number','boolean','null']}}};
            }
            t.inputSchema.required.push('format','content','title',...(formats.length&&!objectives.advertising?['requireDocumentValidation']:[]));
        }
        if(tool.name==='speech.synthesize'){
            const segments=instruction.match(/tres fragmentos por escena\s*:\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"/iu);
            const duration=Number(instruction.match(/\b(\d{2})\s*segundos\b/iu)?.[1]||30);
            const timed=objectives.reel&&segments&&duration>=30&&duration<=60;
            p.output={type:'string',const:policy.audioPrefix+(timed?'timed-narration.wav':'narration.wav')};
            p.text=timed?{type:'string',const:segments.slice(1,4).join(' ')}:{type:'string',minLength:40,maxLength:1800};
            p.language={type:'string',const:'es-MX'};
            if(timed){
                const firstSentence=instruction.match(/(?:único texto comercial(?: permitido)?|texto comercial exacto)\s*:\s*["“]([^"”]+)["”]/iu)?.[1]?.split(/[.!?]/u)[0]?.trim();
                p.timingScenes={type:'array',const:segments.slice(1,4).map((text,i)=>({
                    text,durationSeconds:i===2?duration-2*Math.floor(duration/3):Math.floor(duration/3),
                    ...(i===0&&firstSentence&&firstSentence.toLowerCase()===text.replace(/[.!?]+$/u,'').trim().toLowerCase()&&/^[a-z0-9 -]+$/iu.test(firstSentence)?{speechLanguage:'en-US'}:{})
                }))};
            }
            t.inputSchema.required=['text','output','language',...(timed?['timingScenes']:[])];
        }
        if(tool.name==='image.adapt'){
            p.outputPrefix={type:'string',description:'New stem prefixed by '+policy.imagePrefix,pattern:'^'+policy.imagePrefix+'[a-zA-Z0-9_-]{1,40}$'};
            p.variants.items.properties.id={type:'string',pattern:'^[a-zA-Z0-9_-]{1,30}$'};
            p.variants.maxItems=3;p.variants.items.properties.mimeType={type:'string',const:'image/png'};
            p.variants.items.anyOf=dimensions.map(f=>({...p.variants.items,type:'object',properties:{...p.variants.items.properties,width:{...p.variants.items.properties.width,const:f.width},height:{...p.variants.items.properties.height,const:f.height}},required:[...new Set([...(p.variants.items.required||[]),'id','width','height','mimeType'])],additionalProperties:false}));
            t.inputSchema.required=[...new Set([...t.inputSchema.required,'outputPrefix','composition','creativeDirection','brandLogoOutput'])];
        }
        if(tool.name==='reel.create'){
            const authorizedCopy=exactAdvertisingCopyChoices(instruction);
            const phrases=authorizedCopy?.copy.split(/(?<=[.!?])\s+/u).map(s=>s.trim()).filter(Boolean)||[];
            if(phrases.length>=3){
                const brand=authorizedCopy.brandName||phrases[0].replace(/[.!?]+$/u,'').trim();
                if(brand){p.brandName={type:'string',const:brand};p.title={type:'string',const:phrases.slice(1,-1).join(' ')};p.cta={type:'string',const:phrases.at(-1)};}
            }
            t.inputSchema.required=[...new Set([...(t.inputSchema.required||[]),'brandName','title','cta'])];
            p.output={type:'string',const:policy.artifactRoot+'advertisement.mp4'};
            p.studioOutput={type:'string',const:policy.artifactRoot+'advertisement-studio.html'};
            p.durationSeconds={type:'number',minimum:30,maximum:60};p.scenes.maxItems=5;
            t.inputSchema.required=[...new Set([...t.inputSchema.required,'output','studioOutput','audioOutput','creativeDirection'])];
        }
        const bounded={
            'speech.synthesize':['text','output','language','rate','volume','timingScenes'], 'reel.create':['brandName','title','cta','durationSeconds','scenes','audioOutput','logoOutput','creativeDirection','output','studioOutput'], 'image.adapt':['sourceOutput','variants','fit','brandLogoOutput','composition','creativeDirection','outputPrefix'], 'media.analyze':['output'], 'browser.inspect':['url'], 'browser.open':['url'], 'browser.screenshot':['url','output'],
            'page.create':['brandName','title','description','services','output'],
            'document.create':['format','title','content','output','requireDocumentValidation','requireFormulas','sheets','rows','documentContract','documentValidation'], 'artifact.read':['output'],
            'web.research':['query','researchGoal','allowedDomain']
        }[tool.name];
        if(bounded){for(const key of Object.keys(p))if(!bounded.includes(key))delete p[key];
            t.inputSchema.required=(t.inputSchema.required||[]).filter(key=>bounded.includes(key));t.inputSchema.additionalProperties=false;}
        t.inputSchema.properties=p;
        return t;
    });
}
function imageChoices(p,entries,history){
    return entries.filter(e=>e.photoRegion).flatMap(entry=>(p.composition.properties.layout.enum||[]).flatMap(layout=>{
                const delivered=history.filter(h=>(h.visual?.sourceRef===entry.ref||h.format?.sourceSha256&&h.format.sourceSha256===entry.sha256)&&h.visual?.layout===layout);
                const hasFormat=h=>h.format&&Number.isInteger(h.format.width)&&h.format.width>0&&Number.isInteger(h.format.height)&&h.format.height>0&&h.format.sourceSha256===entry.sha256;
                if(delivered.some(h=>!hasFormat(h)))return [];
                const pairs=[...new Map(delivered.map(h=>[h.format.width+'x'+h.format.height,h.format])).values()];
                const formats=p.variants?.items?.anyOf||planImageAdaptation().variants.map(f=>({properties:{width:{const:f.width},height:{const:f.height}},required:['width','height']}));
                const {anyOf:ignoredVariants,...baseItem}=p.variants?.items||{};
                const allowed=formats.filter(f=>!pairs.some(pair=>pair.width===f.properties.width.const&&pair.height===f.properties.height.const)).map(f=>({...baseItem,...f,type:'object',properties:{...baseItem.properties,...f.properties},required:[...new Set([...(baseItem.required||[]),...(f.required||[]),'id','width','height','mimeType'])],additionalProperties:false}));
                if(p.variants&&!allowed.length)return [];
                return [{properties:{sourceOutput:{type:'string',const:entry.ref},
                    composition:{...p.composition,properties:{...p.composition.properties,layout:{type:'string',enum:[layout]},photoCrop:{type:'object',const:entry.photoRegion},...(entry.verifiedContacts?.length&&p.composition.properties.contact?.const===undefined?{contact:{type:'string',enum:[
                        ...((p.composition.properties.contact?.enum||[]).includes('')?['']:[]),
                        ...entry.verifiedContacts.filter(c=>!p.composition.properties.contact?.enum||p.composition.properties.contact.enum.includes(c))
                    ]}}:{})}},
                    ...(p.variants?{variants:{...p.variants,enum:variantSelections(allowed),items:{...p.variants.items,anyOf:allowed}}}:{})}}];
            }));
}
export function generalMediaPreflight(catalog,receipts,objectives={}){
    if(!objectives.advertising)return {ok:true,pending:false,missingFormats:[]};
    const observed=receipts.some(r=>r.ok&&['advertising.research','media.library'].includes(r.name)&&Array.isArray(r.observation?.entries));
    if(!observed)return {ok:false,pending:true,reason:'MATERIAL_PREFLIGHT_PENDING',missingFormats:[]};
    const failedVideos=new Set(receipts.filter(r=>r.name==='media.analyze'&&(r.observation?.status==='LOCAL_VIDEO_REVIEW_FAILED'||r.observation?.error?.code==='LOCAL_VIDEO_REVIEW_FAILED')).map(r=>r.args?.output||r.observation?.output));
    if(failedVideos.size>=2)return {ok:false,pending:false,reason:'LOCAL_VIDEO_REPAIR_EXHAUSTED',missingFormats:[],optionsExhausted:true};
    const entries=mediaEntries(receipts),tool=catalog.find(t=>t.name==='image.adapt');
    const history=[...deliveredImageHistory(receipts),...producedImageHistory(receipts)];
    const choices=tool?imageChoices(tool.inputSchema.properties,entries,history):[];
    const alternatives=choices.flatMap(c=>(c.properties.variants?.items?.anyOf||[]).map(f=>({sourceRef:c.properties.sourceOutput.const,sourceSha256:entries.find(e=>e.ref===c.properties.sourceOutput.const)?.sha256,layout:c.properties.composition.properties.layout.enum[0],width:f.properties.width.const,height:f.properties.height.const})));
    const images=producedMedia(receipts).filter(a=>a.mimeType==='image/png'&&a.sha256);
    const required=[...new Map([...(objectives.requestedImageFormats||[]),...(objectives.reel?[{width:1080,height:1920}]:[])].map(f=>[f.width+'x'+f.height,f])).values()];
    const missingFormats=required.filter(f=>!images.some(a=>a.width===f.width&&a.height===f.height)&&!alternatives.some(a=>a.width===f.width&&a.height===f.height));
    const verticalProduced=new Set(images.filter(a=>a.width===1080&&a.height===1920).map(a=>a.sha256)).size;
    const verticalAvailable=new Set(alternatives.filter(a=>a.width===1080&&a.height===1920).map(a=>(a.sourceSha256||a.sourceRef)+'|'+a.layout)).size;
    const verticalSequenceMissing=!!objectives.reel&&verticalProduced+verticalAvailable<3;
    const noImageOptions=images.length===0&&alternatives.length===0;
    return {ok:missingFormats.length===0&&!verticalSequenceMissing&&!noImageOptions,pending:false,
        reason:missingFormats.length?'REQUESTED_FORMAT_UNAVAILABLE':verticalSequenceMissing?'VERTICAL_SEQUENCE_UNAVAILABLE':noImageOptions?'MEDIA_OPTIONS_EXHAUSTED':null,
        missingFormats,requiredFormats:required,alternatives,optionsExhausted:alternatives.length===0,
        verticalSequence:objectives.reel?{required:3,produced:verticalProduced,available:verticalAvailable,missing:Math.max(0,3-verticalProduced-verticalAvailable)}:null,
        blockedLegacyCombinations:history.filter(h=>!h.format||!Number.isInteger(h.format.width)||!Number.isInteger(h.format.height))};
}
export function generalMissionPreflight(catalog,receipts,objectives={},audioReadiness=null){
 const material=generalMediaPreflight(catalog,receipts,objectives);
 const available=audioReadiness?.transcriptionAvailable===true&&audioReadiness?.synchronizationVerifierAvailable===true;
 const effective=available?{transcriptionVerified:true,synchronizationVerified:true}:LOCAL_VIDEO_EVIDENCE_CAPABILITIES;
 const missingCapabilities=objectives.reel?Object.entries(effective).filter(([,v])=>v!==true).map(([k])=>k):[];
 return {...material,missingCapabilities,...(material.ok&&missingCapabilities.length?{ok:false,reason:'NARRATION_SYNCHRONIZATION_NOT_VERIFIED'}:{})};
}
export function exactAdvertisingCopyChoices(instruction=''){
    const raw=String(instruction||'');
    const copy=raw.match(/(?:único texto comercial(?: permitido)?|texto comercial exacto)\s*:\s*["“]([^"”]+)["”]/iu)?.[1]?.trim();
    if(!copy)return null;
    const brandName=raw.match(/(?:^|[.\n;])\s*marca\s*:\s*([^.;\n]+)/iu)?.[1]?.trim()||null;
    const sentences=copy.split(/(?<=[.!?])\s+/u).map(s=>s.trim()).filter(Boolean).slice(0,7);
    const spans=[...new Set(sentences.flatMap((_,i)=>sentences.slice(i).map((__,k)=>sentences.slice(i,i+k+1).join(' '))))].filter(s=>s.length<=220);
    const contacts=[...new Set([...copy.matchAll(/(?:https?:\/\/|www\.)[^\s<>"']+/gi)].map(m=>m[0].replace(/[.,;!?)]*$/,'')))];
    return {copy,brandName,spans,contacts};
}
export function groundGeneralCatalog(catalog,receipts,instruction='',objectives=generalObjectives(instruction)){
    const exactCopy=exactAdvertisingCopyChoices(instruction);
    const good=receipts.filter(r=>r.ok);
    const failedVideos=new Set(receipts.filter(r=>r.name==='media.analyze'&&(r.observation?.status==='LOCAL_VIDEO_REVIEW_FAILED'||r.observation?.error?.code==='LOCAL_VIDEO_REVIEW_FAILED')).map(r=>r.args?.output||r.observation?.output));
    const reels=good.filter(r=>r.name==='reel.create');
    const repairVideo=reels.length===1&&failedVideos.has(reels[0].observation?.output);
    const sources=good.filter(r=>r.name==='repo.read').filter(r=>{
        const b=r.observation.verifiedRead?.sourceStructure?.dataBindings;
        return b?.collections?.includes('users')||[...(b?.writeShapes||[]),...(b?.queryShapes||[])].some(s=>s.collection==='users');
    }).map(r=>r.observation.verifiedRead.file);
    const groundedRole=good.some(r=>{const b=r.observation.verifiedRead?.sourceStructure?.dataBindings;return [...(b?.writeShapes||[]),...(b?.queryShapes||[])].some(s=>s.collection==='users'&&s.fields?.includes('rol'));});
    if(catalog.some(t=>t.name==='advertising.research')&&!good.some(r=>r.name==='advertising.research'))return catalog.filter(t=>t.name==='advertising.research');
    const advertisingPending=catalog.some(t=>t.name==='advertising.research')&&!good.some(r=>r.observation?.advertisingSemanticReview?.verified===true);
    const unreadAdvertisingSources=good.filter(r=>r.name==='advertising.research').flatMap(r=>r.observation.sources||[]).some(s=>s.url&&!/\.pdf(?:[?#]|$)/i.test(s.url)&&!good.some(r=>r.name==='browser.inspect'&&r.observation.url===s.url));
    const creativeWrites=new Set(['image.adapt','reel.create','speech.synthesize','page.create','document.create']);
    return catalog.filter(t=>!advertisingPending||!creativeWrites.has(t.name)).filter(t=>!(t.name==='advertising.research'&&(unreadAdvertisingSources||good.some(r=>r.observation?.advertisingSemanticReview?.verified===true)))).filter(t=>!(t.name==='speech.synthesize'&&good.some(r=>r.name===t.name))).filter(t=>!(t.name==='reel.create'&&reels.length>0&&!repairVideo)).filter(t=>!(t.name==='system.capabilities'&&good.some(r=>r.name===t.name&&r.observation?.workstation?.ok===true))).filter(t=>t.name!=='platform.query'||(sources.length&&groundedRole)).map(t=>{
        const tool=structuredClone(t),p=tool.inputSchema.properties;
        const entries=mediaEntries(receipts),artifacts=producedMedia(receipts);
        const images=[...entries.filter(e=>e.mimeType?.startsWith('image/')).map(e=>e.ref),...artifacts.filter(e=>e.mimeType?.startsWith('image/')).map(e=>e.output)];
        if(t.name==='media.library'){
            const exports=artifacts.filter(a=>!failedVideos.has(a.output)&&!good.some(r=>r.name==='media.library'&&r.args.action==='export'&&r.args.output===a.output)).map(a=>a.output);
            const imports=entries.filter(e=>!good.some(r=>r.name==='media.library'&&r.args.action==='import'&&r.args.relativePath===e.relativePath)).map(e=>e.relativePath);
            tool.inputSchema={type:'object',anyOf:[
                ...(!entries.length?[{properties:{action:{const:'list'}},required:['action'],additionalProperties:false}]:[]),
                ...(imports.length?[{properties:{action:{const:'import'},relativePath:{type:'string',enum:imports}},required:['action','relativePath'],additionalProperties:false}]:[]),
                ...(exports.length?[{properties:{action:{const:'export'},output:{type:'string',enum:exports}},required:['action','output'],additionalProperties:false}]:[])
            ]};
        }
        if(t.name==='image.adapt'){
            if(exactCopy){
                const c=p.composition.properties;
                if(exactCopy.brandName)c.brandName={type:'string',const:exactCopy.brandName};
                // One canonical placement for every authorized span. Do not let
                // the model render an entire paragraph again as CTA/contact.
                const sentences=exactCopy.copy.split(/(?<=[.!?])\s+/u).map(x=>x.trim()).filter(Boolean);
                const headline=sentences.length>1?sentences.slice(0,-1).join(' '):exactCopy.copy;
                const body=sentences.length>1?sentences.at(-1):'';
                c.headline={type:'string',const:headline};
                c.body={type:'string',const:body};
                c.cta={type:'string',const:''};
                c.contact={type:'string',const:''};
            }
            if(images.length)p.sourceOutput={type:'string',enum:images};
            const logos=entries.filter(e=>e.role==='official_logo_source').map(e=>e.ref);if(logos.length)p.brandLogoOutput={type:'string',enum:logos};
            const crops=entries.filter(e=>e.photoRegion).map(e=>e.photoRegion);if(crops.length)p.composition.properties.photoCrop={type:'object',enum:crops};
            const choices=imageChoices(p,entries,[...deliveredImageHistory(receipts),...producedImageHistory(receipts)]);
            // Exhausted choices must not fall back to the unconstrained schema.
            tool.inputSchema.anyOf=choices;
        }
        if(['image.adapt','reel.create'].includes(t.name)){
            const refs=[...new Set(good.filter(r=>r.observation?.advertisingSemanticReview?.verified===true).flatMap(r=>r.observation.advertisingSemanticReview.acceptedSourceURLs||[]))];
            p.creativeDirection.properties.references.items={type:'string',enum:refs};
        }
        if(t.name==='reel.create'){
            if(repairVideo){p.output={type:'string',const:reels[0].observation.output.replace(/\.mp4$/, '-repair-1.mp4')};p.studioOutput={type:'string',const:p.output.const.replace(/\.mp4$/, '-studio.html')};}
            const logos=entries.filter(e=>e.role==='official_logo_source').map(e=>e.ref);
            const generated=[...new Map(artifacts.filter(a=>a.mimeType==='image/png'&&a.width===1080&&a.height===1920&&a.sha256).map(a=>[a.sha256,a.output])).values()];
            const embeddedLogoByOutput=new Map(good.filter(receipt=>receipt.name==='image.adapt'&&receipt.args?.composition&&logos.includes(receipt.args?.brandLogoOutput))
                .flatMap(receipt=>(receipt.observation.outputs||[]).map(image=>[image.output,receipt.args.brandLogoOutput])));
            const allGeneratedBranded=generated.length>=3&&generated.every(output=>embeddedLogoByOutput.has(output));
            if(allGeneratedBranded){
                // Existing PNG pixels already contain the official logo.
                // Refuse the second overlay in the generated reel grammar.
                delete p.logoOutput;
                tool.inputSchema.required=(tool.inputSchema.required||[]).filter(name=>name!=='logoOutput');
                tool.description+=' Las tres escenas ya tienen el logo oficial; NO envíes logoOutput en reel.create.';
            }else if(logos.length)p.logoOutput={type:'string',enum:logos};
            {p.scenes.minItems=3;p.scenes.items.properties.assetOutput={type:'string',enum:generated};p.scenes.items.properties.presentation={type:'string',const:'poster'};p.scenes.items.properties.subtitle={type:'string',minLength:1,maxLength:160};}
            const audio=artifacts.filter(a=>a.mimeType?.startsWith('audio/')).map(a=>a.output);
            if(audio.length)p.audioOutput={type:'string',enum:audio};
        }
        if(t.name==='page.create'&&exactCopy){
            if(exactCopy.brandName)p.brandName={type:'string',const:exactCopy.brandName};
            p.title={type:'string',enum:exactCopy.spans};
            p.description={type:'string',enum:exactCopy.spans};
            if(p.services?.items?.properties){
                p.services.items.properties.title={type:'string',enum:exactCopy.spans};
                p.services.items.properties.description={type:'string',enum:exactCopy.spans};
            }
        }
        if(t.name==='platform.query')p.sourceFile={type:'string',enum:sources};
        if(['browser.open','browser.screenshot'].includes(t.name))p.url={type:'string',enum:good.filter(r=>r.name==='page.create'&&r.observation.url).map(r=>r.observation.url).filter(url=>!good.some(r=>r.name===t.name&&r.args?.url===url))};
        if(t.name==='browser.inspect'){
            const urls=good.flatMap(r=>[...(r.observation?.sources||[]).map(s=>s.url),...(r.name==='page.create'?[r.observation.url]:[])]).filter(Boolean);
            const advertising=good.some(r=>r.name==='advertising.research');
            const verified=advertising&&good.some(r=>r.observation?.advertisingSemanticReview?.verified===true);
            const previews=new Set(good.filter(r=>r.name==='page.create').map(r=>r.observation.url));
            p.url={type:'string',enum:[...new Set(urls)].filter(url=>(!verified||previews.has(url))&&(!advertising||! /\.pdf(?:[?#]|$)/i.test(url))&&!good.some(r=>r.name==='browser.inspect'&&r.observation.url===url))};
        }
        if(t.name==='media.analyze'){
            const images=[...producedMedia(receipts).filter(a=>/\.(png|mp4)$/.test(a.output||'')).map(a=>a.output),...good.filter(r=>r.name==='media.library'&&r.args.action==='import'&&r.observation.mimeType==='image/png').map(r=>r.observation.output)];
            p.output={type:'string',enum:[...new Set(images)].filter(output=>!failedVideos.has(output)&&!good.some(r=>r.name==='media.analyze'&&r.observation.output===output))};
        }
        if(t.name==='artifact.read'){
            const outputs=producedMedia(receipts).map(r=>r.output);
            p.output={type:'string',enum:[...new Set(outputs)].filter(output=>!good.some(r=>r.name==='artifact.read'&&r.observation.output===output))};
        }
        if(t.name==='document.create'&&objectives.advertising){
            const bound=receiptBoundProductionContent(receipts,objectives,instruction);
            if(bound)p.content={type:'string',const:bound};
            else tool.productionDocumentUnready=true;
        }
        return tool;
    }).filter(t=>t.name!=='document.create'||!t.productionDocumentUnready).filter(t=>t.name!=='image.adapt'||t.inputSchema.anyOf.length>0).filter(t=>!['artifact.read','media.analyze'].includes(t.name)||t.inputSchema.properties.output.enum.length>0).filter(t=>!['browser.inspect','browser.open','browser.screenshot'].includes(t.name)||t.inputSchema.properties.url.enum.length>0);
}
// Host narrows creative options to unmet physical formats after advertising sources
// have been independently accepted. Qwen still selects the tool and its arguments.
export function prioritizeGeneralAdvertisingCatalog(catalog,receipts,objectives={},instruction=''){
    const grounded=groundGeneralCatalog(catalog,receipts,instruction,objectives);
    if(objectives.code&&!objectives.advertising)return prioritizeGeneralCodeCatalog(grounded,receipts,instruction);
    // Keep the initial research phase separate from production. Imported photos,
    // vision probes and report writing cannot replace two verified sources.
    const reads=receipts.filter(r=>r.ok);
    const priorVerified=reads.some(r=>r.observation?.advertisingSemanticReview?.verified===true);
    const researches=reads.filter(r=>r.name==='advertising.research');
    if(objectives.advertising&&researches.length&&!priorVerified){
        const raw=String(instruction).match(/(?:^|[.\n;])\s*marca\s*:\s*([^.;\n]+)/iu)?.[1]||'';
        const words=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
        const first=words(raw)[0]||'';
        const latest=researches.at(-1).observation;
        const visited=new Set(reads.filter(r=>r.name==='browser.inspect').map(r=>r.observation?.url));
        const urls=(latest?.sources||[]).filter(s=>s?.url&&!visited.has(s.url)&&!(first&&words(s.title).includes(first))).map(s=>s.url);
        const inspector=grounded.find(t=>t.name==='browser.inspect');
        if(inspector&&urls.length){
            const next=structuredClone(inspector);
            next.inputSchema.properties.url={type:'string',enum:urls.slice(0,6)};
            return [next];
        }
        const nextResearch=catalog.find(t=>t.name==='advertising.research');
        if(nextResearch&&researches.length<3)return [nextResearch];
        return [];
    }
    if(!objectives.advertising){
        if(objectives.research&&requiredDeliveryFormats(instruction).length){
            const verifiedSources=independentResearchProofs(receipts,instruction);
            if(verifiedSources.length<3)return prioritizeResearchDiscovery(grounded,receipts,instruction);
        }
        const office=prioritizeGeneralOfficeCatalog(grounded,receipts,instruction);
        if(office!==null&&!objectives.records&&(!objectives.research||independentResearchProofs(receipts,instruction).length>=3)){
            if(!objectives.research)return office;
            const bound=researchOfficeContent(receipts,instruction);
            if(!bound)return [];
            return office.map(tool=>{
                if(tool.name!=='document.create')return tool;
                const format=tool.inputSchema.properties.format?.enum?.[0];
                if(!['docx','pdf'].includes(format))return tool;
                const continuation=String(instruction).match(/^CONTINUAR_MISION: +((?:general|resume)-([a-f0-9-]{36}))/iu);
                const token=continuation?continuation[2].split('-')[0]:'original';
                const name=(continuation?'recovery-'+token+'-':'research-')+format;
                const dir=String(tool.inputSchema.properties.output?.pattern||'').match(/general-[a-f0-9-]{36}/i)?.[0];
                if(!dir)return {...tool,inputSchema:{...tool.inputSchema,properties:{...tool.inputSchema.properties,content:{type:'string',const:bound}}}};
                const output='.jarvis-artifacts/qwen-general/'+dir+'/'+name+'.'+format;
                return {...tool,inputSchema:{...tool.inputSchema,properties:{
                    ...tool.inputSchema.properties,
                    content:{type:'string',const:bound},
                    format:{type:'string',const:format},
                    title:{type:'string',const:'Informe de investigación - fuentes comprobadas'},
                    output:{type:'string',const:output}
                }}};
            });
        }
        return grounded;
    }
    if(!receipts.some(r=>r.ok&&r.observation?.advertisingSemanticReview?.verified===true))return grounded;
    const physical=producedMedia(receipts).filter(a=>a.mimeType==='image/png'&&a.sha256);
    const formats=[...(objectives.requestedImageFormats||[]),...(objectives.reel?[{width:1080,height:1920}]:[])];
    const missingPhysicalFormat=formats.some(f=>!physical.some(a=>a.width===f.width&&a.height===f.height));
    const portraitCount=new Set(physical.filter(a=>a.width===1080&&a.height===1920).map(a=>a.sha256)).size;
    if(!missingPhysicalFormat&&(!objectives.reel||portraitCount>=3)){
        const next=prioritizeReceiptBoundProduction(grounded,receipts,objectives);
        return next===null?grounded:next;
    }
    const image=grounded.find(t=>t.name==='image.adapt');
    if(!image)return grounded;
    // Offer one host-verified source/layout choice per turn instead of
    // exploding 14 choices into the model grammar. Other choices remain in
    // the inventory and can be offered after the first physical receipt.
    const specific=structuredClone(image);
    const choices=specific.inputSchema.anyOf||[];
    if(choices.length>1){
        const rejected=receipts.filter(r=>!r.ok&&r.name==='image.adapt');
        const tried=new Set(rejected.map(r=>JSON.stringify([r.args?.sourceOutput,r.args?.composition?.layout])));
        const eligible=choices.find(c=>!tried.has(JSON.stringify([
          c.properties.sourceOutput.const,c.properties.composition.properties.layout.enum[0]
        ])))||choices[0];
        specific.inputSchema.anyOf=[eligible];
    }
    const library=grounded.find(t=>t.name==='media.library');
    return [specific,...(library?[library]:[])];
}
export function advertisingReviewInput(receipts,instruction,creative){
    const research=receipts.findLast(r=>r.ok&&r.name==='advertising.research')?.observation;
    const rejected=new Set();
    for(const r of receipts.filter(r=>r.ok))for(const s of r.observation?.advertisingSemanticReview?.review?.sources||[]){
        if(s.topicRelevant&&s.sectorRelevant&&s.identityCompatible&&s.objectiveRelevant)rejected.delete(s.url);
        else rejected.add(s.url);
    }
    const sources=(research?.sources||[]).filter(s=>!rejected.has(s.url)),urls=new Set(sources.map(s=>s.url));
    const openedSources=receipts.filter(r=>r.ok&&r.name==='browser.inspect'&&urls.has(r.observation?.url)&&r.observation.dom).map(r=>({url:r.observation.url,text:advertisingSourceText(r.observation.stdout||r.observation.dom).slice(0,12000)}));
    const entries=(research?.entries||[]).filter(e=>e.photoRegion||e.role==='official_logo_source').map(e=>({ref:e.ref,role:e.role,description:e.description,verifiedContacts:e.verifiedContacts,sha256:e.sha256}));
    return {instruction,query:research?.query||'',sources,entries,openedSources,...(creative?{creative}:{})};
}
export function compactGeneralObservation(o){
    const compactReview=r=>({hostClaimConstraint:r.hostClaimConstraint,hostCopyConstraint:r.hostCopyConstraint,verified:r.verified,status:r.status,reason:r.reason?.slice(0,220),inputSha256:r.inputSha256,acceptedSourceURLs:r.acceptedSourceURLs,issues:r.review?.issues?.slice(0,4).map(s=>s.slice(0,220)),unsupportedClaims:r.review?.creative?.unsupportedClaims,sources:r.review?.sources?.map(s=>({url:s.url,relevant:s.topicRelevant&&s.sectorRelevant&&s.identityCompatible&&s.objectiveRelevant,reason:s.reason.slice(0,180)}))});
    const base={ok:o?.ok===true,status:o?.status,error:o?.error,output:o?.output,url:o?.url,bytes:o?.bytes,sha256:o?.sha256,mimeType:o?.mimeType,...(o?.advertisingSemanticReview?{advertisingSemanticReview:compactReview(o.advertisingSemanticReview)}:{})};
    if(o?.status==='LOCAL_VIDEO_REVIEW_FAILED')return {...base,sourceSha256:o.sourceSha256,frames:o.frames?.map(f=>({timestampSeconds:f.timestampSeconds,review:f.review,visualPassed:f.visualPassed})),audioEvidence:o.audioEvidence,repairLimit:1};
    if(o?.ok!==true)return {...base,error:o?.error?.context?.runtimeResult?.error||o?.error,...(o?.creativeSemanticReview?{creativeSemanticReview:compactReview(o.creativeSemanticReview)}:{})};
    if(o?.status==='LOCAL_VISUAL_REVIEW')return {...base,imageSha256:o.imageSha256,model:o.model,review:o.review};
    if(o?.tool==='repo.search')return {...base,tool:o.tool,results:(o.results||[]).slice(0,12).map(r=>({file:r.file,score:r.score}))};
    if(o?.totalTools!==undefined)return {...base,totalTools:o.totalTools,groups:o.groups,inventory:o.inventory,readiness:o.readiness,workstation:o.workstation};
    if(o?.recordEvidence){const e=o.recordEvidence;return {...base,recordEvidence:{source:e.source,scope:e.scope,
        fieldSchema:e.fieldSchema,returnedCount:e.returnedCount,totalCount:e.totalCount,hasMore:e.hasMore,nextCursor:e.nextCursor},
        rowsOmitted:true,warning:'Use independently computed aggregate evidence; row IDs and values omitted.'};}
    if(o?.verifiedRead){const r=o.verifiedRead,b=r.sourceStructure?.dataBindings;const shapes=items=>(items||[]).map(x=>({collection:x.collection,fields:x.fields}));return {...base,verifiedRead:{file:r.file,sourceStructure:{dataBindings:{source:b?.source,collections:b?.collections,writeShapes:shapes(b?.writeShapes),queryShapes:shapes(b?.queryShapes)}}},sourceTextOmitted:true};}
    if(o?.entries)return {...base,reviewPending:o.advertisingSemanticReview?.verified!==true,sources:o.sources?.slice(0,8),entries:o.entries.map(e=>({ref:e.ref,relativePath:e.relativePath,role:e.role,mimeType:e.mimeType,sha256:e.sha256,width:e.width,height:e.height,description:e.description,photoRegion:e.photoRegion,verifiedContacts:e.verifiedContacts})),usedSourceAndLayouts:(o.deliveredCombinations||o.advertisingHistory)?.filter(h=>h.visual).map(h=>({...h.visual,format:h.format})),historicalCopyOmitted:true,historyCount:o.advertisingHistory?.length,answer:String(o.answer||'').slice(0,800)};
    if(o?.outputs)return {...base,outputs:o.outputs.map(p=>({output:p.output,mimeType:p.mimeType,sha256:p.sha256,bytes:p.bytes,width:p.width,height:p.height}))};
    if(o?.status==='LOCAL_VIDEO_REVIEW_VERIFIED'||o?.status==='LOCAL_VIDEO_REVIEW_FAILED')return {...base,sourceSha256:o.sourceSha256,video:o.video,audio:o.audio,durationSeconds:o.durationSeconds,frames:o.frames.map(f=>({timestampSeconds:f.timestampSeconds,sha256:f.sha256,review:f.review,visualPassed:f.visualPassed})),audioEvidence:o.audioEvidence};
    if(o?.sources)return {...base,sources:o.sources.slice(0,8),answer:String(o.answer||'').slice(0,1800)};
    if(o?.dom)return {...base,sourceDates:[...new Set(String(o.dom).match(/\b20\d{2}[-/]\d{2}[-/]\d{2}\b/g)||[])].slice(0,12),domText:advertisingSourceText(o.stdout||o.dom).slice(0,2800)};
    if(o?.dataBase64)return {...base,readBack:true,warning:'File bytes retained for independent verification; not repeated in model context.'};
    return base;
}
export function generalFailureReason(result){
    const failed=result.receipts?.findLast(r=>!r.ok)?.observation,inner=failed?.error?.context?.runtimeResult?.error;
    const candidates=[result.certification?.reason,failed?.reason,inner?.code,typeof inner==='string'?inner:null,failed?.error?.message,failed?.error?.code,result.failureCode,failed?.status,result.reason];
    return candidates.find(x=>typeof x==='string'&&/^[A-Z0-9_:.-]{4,160}$/.test(x)&&!['FAILED','ERROR'].includes(x))||'GENERAL_MISSION_INCOMPLETE';
}
async function persistEvidence(missionId,result){
    const serialized=JSON.stringify(result);
    const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialized))),x=>x.toString(16).padStart(2,'0')).join('');
    if(!globalThis.indexedDB)return {ok:false,reason:'LOCAL_EVIDENCE_STORE_UNAVAILABLE',sha256};
    await new Promise((resolve,reject)=>{
        const open=indexedDB.open('jarvis-qwen-general-evidence',1);
        open.onupgradeneeded=()=>open.result.createObjectStore('missions',{keyPath:'missionId'});
        open.onerror=()=>reject(open.error);
        open.onsuccess=()=>{const db=open.result,tx=db.transaction('missions','readwrite');tx.objectStore('missions').put({missionId,sha256,record:result,createdAt:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};};
    });
    return {ok:true,missionId,sha256,downloadUrl:URL.createObjectURL(new Blob([serialized],{type:'application/json'})),storage:'local-origin IndexedDB; no tokens retained'};
}
export async function runQwenGeneralPilot(options){
    const continuationId=resumedMissionId(options.instruction);
    const originalId=continuationId?.startsWith('resume-')?originalResumedMissionId(options.instruction):null;
    if(continuationId?.startsWith('resume-')&&!originalId)throw Error('QWEN_RESUME_ORIGINAL_MISSION_REQUIRED');
    const missionId=originalId||continuationId||'general-'+crypto.randomUUID();
    const objectives=generalObjectives(options.instruction);
    // Match the loaded code and bridge before the first model decision.
    const clientBytes=new TextEncoder().encode(generalPilotSourceSignature());
    const clientDigest=await crypto.subtle.digest('SHA-256',clientBytes);
    const clientFingerprint=Array.from(new Uint8Array(clientDigest),b=>b.toString(16).padStart(2,'0')).join('');
    const pilotVersion={clientFingerprint,clientStartedAt:globalThis.performance?.timeOrigin||Date.now()};
    let gate;
    try{gate=await options.bridge.requestJson('/qwen-pilot/preflight',pilotVersion,{});}
    catch{throw Error('QWEN_PILOT_PREFLIGHT_FAILED');}
    if(gate?.ok!==true||gate.clientFingerprint!==clientFingerprint)
        throw Error(gate?.reason||'QWEN_PILOT_VERSION_MISMATCH');
    const saved=continuationId?await readSavedMission(continuationId):null;
    const initialReceipts=saved?(objectives.research&&!objectives.advertising?
        await verifiedResearchResumeReceipts(saved,continuationId,options.bridge,options.auth,options.signal,options.instruction,missionId):
        await verifiedResumeReceipts(saved,continuationId,options.bridge,options.auth,options.signal,missionId,objectives.reel&&/tres fragmentos por escena/iu.test(options.instruction))):[];
    if(saved&&objectives.advertising){
        const exact=String(options.instruction).match(/(?:único texto comercial(?: permitido)?|texto comercial exacto)\s*:\s*["“]([^"”]+)["”]/iu)?.[1]||'';
        const images=initialReceipts.filter(r=>r.name==='image.adapt');
        if(!exact||images.length<2||images.some(r=>!exact.includes(r.args?.composition?.headline||'')||!exact.includes(r.args?.composition?.body||'')||!r.args?.brandLogoOutput?.startsWith('library:Logos/')))
            throw Error('QWEN_RESUME_COPY_OR_OFFICIAL_LOGO_MISMATCH');
    }
    // Authenticated, host-provided capability; no client-side or model self-attestation.
    let audioReadiness=null;
    if(objectives.reel){
      try{
        await options.auth.authStateReady?.();
        const user=options.auth.currentUser;
        if(user){
          const idToken=await user.getIdToken();
          if(options.auth.currentUser!==user)throw Error('QWEN_BROWSER_SESSION_CHANGED');
          const health=await options.bridge.requestJson('/workstation/health',{}, {idToken,timeoutMs:15000});
          if(options.auth.currentUser!==user)throw Error('QWEN_BROWSER_SESSION_CHANGED');
          if(health?.ok===true)audioReadiness=health.audioReviewCapabilities;
        }
      }catch{/* Fail closed if authenticated ASR health cannot be confirmed. */}
    }
    const policy=createGeneralToolPolicy({location:globalThis.location,missionId,objectives,instruction:options.instruction,mediaPreflight:receipts=>generalMissionPreflight(toolRuntime.list(),receipts,objectives,audioReadiness)});
    const toolRuntime={list:()=>generalToolCatalog(options.toolRuntime,policy,objectives,options.instruction)};
    const missingInputs=missingMissionInputs(options.instruction);
    const unavailableOps=unavailableMissionOperations(options.instruction).filter(operation=>
        !(objectives.code&&operation.includes('parches')));
    const unsupportedOutput=false;
    if(missingInputs.length||unavailableOps.length||!toolRuntime.list().length){
        await options.auth.authStateReady?.();
        const user=options.auth.currentUser;
        if(!user?.uid||typeof user.getIdToken!=='function'||!options.sessionContext?.tenantId)
            throw Error('QWEN_TERMINAL_SESSION_REQUIRED');
        const started=Date.now(),usages=[];
        const route=(missingInputs.length||unavailableOps.length)?'UNSUPPORTED_MISSION':classifyEmptyGeneralCatalog(options.instruction);
        let answer='',reason=missingInputs.length?'MISSION_INPUT_REQUIRED':unavailableOps.length?'PILOT_TOOL_SCOPE_NOT_AVAILABLE':'PILOT_CAPABILITY_NOT_ENABLED';
        if(route==='CONVERSATION'){
            const selector=createQwenBridgeActionSelector({
                bridge:options.bridge,auth:options.auth,pilotVersion,onInference:usage=>usages.push(usage)
            });
            try{
                const previous=localConversationHistory.get(user)||[];
                answer=await requestQwenGeneralConversation({instruction:options.instruction,selectAction:selector,signal:options.signal,history:previous});
                if(answer)localConversationHistory.set(user,[...previous,{role:'user',text:options.instruction},{role:'assistant',text:answer}].slice(-8));
                reason='LOCAL_QWEN_CONVERSATION';
            }catch(error){
                reason='LOCAL_QWEN_CONVERSATION_UNAVAILABLE';
            }
        }
        const answered=route==='CONVERSATION'&&Boolean(answer),metrics={
            firstUsefulToolMs:null,inferences:usages.length,
            promptTokens:usages.reduce((n,u)=>n+(Number(u.promptTokens)||0),0),
            outputTokens:usages.reduce((n,u)=>n+(Number(u.outputTokens)||0),0),
            inferenceMs:usages.reduce((n,u)=>n+(Number(u.durationMs)||0),0),
            objectivesCompletedPercent:null,totalMs:Date.now()-started
        };
        const message=answered?answer:
            missingInputs.length?'Para ejecutar esta misión sin inventar datos faltan: '+missingInputs.join('; ')+'. No se generaron archivos ni se declaró éxito.':
            unavailableOps.length?'Este piloto todavía no ofrece estas operaciones: '+unavailableOps.join('; ')+'. No se ejecutaron efectos ni se crearon archivos.':
            route==='CONVERSATION'?'Qwen local no pudo responder en este momento. Puedes enviar otra consulta; la Terminal sigue disponible.':
            'Esta solicitud necesita herramientas que no están habilitadas en el piloto general experimental. No se ejecutó la misión ni se creó un archivo. Jarvis sigue disponible para conversación e instrucciones compatibles.';
        const output={status:answered?'CONVERSATION':'PARTIAL',reason,report:message,receipts:[],
            decisions:[],certification:null,metrics};
        const evidence=await persistEvidence(missionId,output);
        return {ok:answered,blocked:false,status:output.status,reason,missionId,
            metrics,evidence,artifactDownloads:[],artifactPaths:[],
            finalResponse:{ok:answered,title:answered?'Jarvis · Qwen local':
                route==='CONVERSATION'?'Respuesta local no disponible':'Capacidad no habilitada en este piloto',
                text:message}};
    }
    const instruction=options.instruction+'\nFecha de ejecución UTC: '+new Date().toISOString()+'. Contrato V142 oficial: solo herramientas autorizadas. No escribir registros ni publicar. '+
        'Cada archivo debe usar un nombre nuevo dentro de '+policy.artifactRoot+'. '+
        (objectives.code?'AUDITORÍA DE INGENIERÍA: tras leer archivos y ejecutar las pruebas disponibles, finaliza con FINISH y un dictamen técnico propio de al menos 180 caracteres. Debe incluir el nombre requestPayout o solicitarRetiro, una ruta literal y exacta de los archivos realmente leídos, el resultado y alcance de tests.run, la validación de montos y lo que NO está demostrado. No repitas un mensaje genérico de éxito; no atribuyas cobertura de concurrencia a pruebas unitarias. Si no puedes fundamentar esas afirmaciones, termina PARCIAL. ': '')+
        (objectives.advertising?'Publicidad: investiga prácticas de composición publicitaria con advertising.research usando una consulta GENERICA sin nombre de marca o dominio del cliente; evita empresas homónimas, abre dos fuentes independientes realmente útiles y exige advertisingSemanticReview.verified antes de renderizar. Accesibilidad no acredita pertinencia. Si la revisión rechaza las fuentes, investiga de nuevo con una consulta distinta y pertinente al tema, sector, identidad y objetivo. No inventes descuentos, evaluaciones gratuitas, promociones ni ventajas comerciales. Usa la biblioteca compartida observada. usedSourceAndLayouts contiene combinaciones entregadas: no repitas fotografía, layout y dimensiones. Los formatos sin dimensiones conocidas bloquean ese par fotografía/layout. Si el usuario fijó texto comercial exacto, no escribas titulares, correos, CTA, especialidades o promesas distintos: utiliza solo los fragmentos autorizados del esquema. Si NO existe texto exacto, redacta contenido original sustentado. Elige una combinación de foto/layout no utilizada. El historial no es un ejemplo para copiar. Si el historial indica format, otras dimensiones sociales del mismo original pueden ser válidas; no repitas las dimensiones entregadas con el mismo diseño. Selecciona material por contenido y procedencia, conserva la identidad solicitada. No inventes logos ni contactos. Evita duplicar una misma URL entre body, cta y contact: incluyela visualmente una sola vez y deja cta vacio cuando uses contact; puedes colocar en body solo la frase autorizada sin repetir la URL. El logotipo oficial cuenta como identidad visual independiente. Importa el original seleccionado con media.library e inspecciona sus pixeles con media.analyze antes de componer. Usa photoRegion EXACTA para photoCrop, gráficos nuevos con image.adapt y logo observado. image.adapt outputPrefix debe comenzar '+policy.imagePrefix+'. Para reel sintetiza narración original española con speech.synthesize; reel.create requiere al menos tres escenas y 30 segundos. audioOutput debe usar el WAV real, escenas deben usar imágenes producidas; define creativeDirection con dos URLs exactas de advertising.research. Exporta cada pieza con media.library; export es local experimental, no publicación. Revisa pixeles PNG y MP4 con media.analyze y lee archivos con artifact.read; nunca uses modelos de imagen/video externos. FINISH solo al comprobar entregables. ': '')+
        (objectives.research&&!objectives.advertising?'Para investigación busca tres ORGANIZACIONES realmente distintas y pertinentes al tema, y verifica con browser.inspect sus textos antes de crear archivos. Dos sitios de la misma marca o sus filiales cuentan como una sola fuente; ayuda del sitio, publicidad de contacto y textos de navegación NO son evidencia temática. Si una página no tiene un párrafo pertinente con cita literal, busca otra URL y otra organización en web.research, sin reciclar llamadas. No inventes clasificación primaria/oficial. Entrega FINISH como JSON {sources:[{url,title,date,quote}]} con al menos tres fuentes: título y cita literal de 8 a 20 palabras (al menos 32 caracteres) presentes en DOM, fecha exacta observada o null si no se puede comprobar. Nunca inventes fecha; una fuente sin fecha solo aporta contexto. Esta tabla compara evidencia textual; no agregues afirmaciones sin soporte. ':'')+
        (objectives.page?'Para una página crea HTML con page.create y abre su url recibida con browser.open; inspecciona DOM, captura con browser.screenshot, revisa esa captura con media.analyze(output) y lee el archivo con artifact.read. ':'')+
        (objectives.records?'Para datos lee app-registro.js y panel-admin.js para fundamentar users; consulta rol == tecnico, includeCount=true. Si faltan nombres de campos, descubre con fields=["__name__"], luego proyecta los campos requeridos realmente presentes en fieldSchema.paths. La ausencia solo se acepta si el esquema de esa misma pagina la demuestra; IDs no son valores. '+
        'Solo exporta agregados: el informe de datos JSON debe ser exactamente COMPROBACION_INDEPENDIENTE.records.data, calculado desde los recibos. ':'')+
        'Lee cada archivo creado con artifact.read antes de FINISH. No inventes recibos de revisión visual. Si solo esta disponible system.capabilities, inspecciona una vez y termina informando el bloqueo; inventariar no ejecuta ni certifica esas capacidades.';
    const visualUsages=[];
    const visualSelector=createQwenBridgeActionSelector({bridge:options.bridge,auth:options.auth,pilotVersion,onInference:u=>visualUsages.push(u)});
    const sessionContext={...options.sessionContext,qwenCapabilityPolicy:tools=>tools.map(t=>({name:t.name,registered:true,executionStatus:policy.accept(t)?'ELIGIBLE_UNVERIFIED':t.requiresApproval||t.mutates?'BLOCKED_BY_SCOPE':'PENDING_INTEGRATION',physicallyVerified:false})),qwenWorkstationHealth:async()=>{
        await options.auth.authStateReady?.();
        const user=options.auth.currentUser;
        if(!user)throw Error('QWEN_BROWSER_SESSION_REQUIRED');
        const idToken=await user.getIdToken();
        if(options.auth.currentUser!==user)throw Error('QWEN_BROWSER_SESSION_CHANGED');
        const health=await options.bridge.requestJson('/workstation/health',{}, {idToken,timeoutMs:15000});
        if(options.auth.currentUser!==user)throw Error('QWEN_BROWSER_SESSION_CHANGED');
        return health;
    },qwenAdvertisingReview:async({receipts,creative,signal})=>{
        const decision=await visualSelector({advertisingEvidence:advertisingReviewInput(receipts,options.instruction,creative),signal});
        return decision.advertisingReview;
    },qwenArtifactVisualReview:async output=>{
        if(!policy.ownPath(output)&&!/^\.jarvis-artifacts\/material-library\/[a-f0-9]{64}\.png$/.test(output))throw Error('MISSION_VISUAL_SCOPE_INVALID');
        const decision=await visualSelector({visualOutput:output,signal:options.signal});
        return decision.visualReview;
    }};
    // A phase boundary is a checkpoint, not a failed mission. Preserve
    // authenticated receipts and continue automatically only after new verified
    // progress. The independent auditor still controls VERIFIED_COMPLETE.
    const autonomy=generalMissionAutonomyBudget(objectives,options.instruction);
    const result=await runGeneralAutonomousPhases({initialReceipts,budget:autonomy,
        signal:options.signal,onProgress:options.onProgress,
        executePhase:(carried,phase,stepsPerPhase)=>runQwenTerminalReadPilot({...options,pilotVersion,initialReceipts:carried,sessionContext,instruction,toolRuntime,hostToolPolicy:policy,
            maximumSteps:stepsPerPhase,repairIncomplete:!objectives.unsupported||objectives.advertising,requireFinalReport:objectives.code===true,
            compactObservation:compactGeneralObservation,catalogForEvidence:(catalog,receipts)=>prioritizeGeneralAdvertisingCatalog(catalog,receipts,objectives,options.instruction),
            summarizeEvidence:receipts=>{const preflight=generalMissionPreflight(toolRuntime.list(),receipts,objectives,audioReadiness);return {...summarizeGeneralEvidence(receipts,objectives,options.instruction),preflight,...(!preflight.ok&&!preflight.pending?{blockedReason:preflight.reason}:{})};},
            verifyObjectives:args=>verifyGeneralMission({...args,objectives})})
    });
    for(const u of visualUsages){result.metrics.inferences+=u.inferenceCount??1;result.metrics.promptTokens+=u.promptTokens||0;result.metrics.outputTokens+=u.outputTokens||0;result.metrics.inferenceMs+=u.durationMs||0;}
    const resultMissionId=continuationId?'resume-'+crypto.randomUUID():missionId;
    const evidence=await persistEvidence(resultMissionId,result);
    const reason=generalFailureReason(result);
    const ok=result.status==='SUCCESS'&&evidence.ok;
    const artifactDownloads=[];
    for(const r of result.receipts.filter(r=>r.ok&&r.name==='artifact.read'&&policy.ownPath(r.observation.output))){
        const o=r.observation;try{const bytes=Uint8Array.from(atob(o.dataBase64),c=>c.charCodeAt(0));
            const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
            if(bytes.length===o.bytes&&hash===o.sha256)artifactDownloads.push({output:o.output,sha256:hash,downloadUrl:URL.createObjectURL(new Blob([bytes],{type:o.mimeType}))});
        }catch{}
    }
    return {ok,artifactDownloads,blocked:!ok,status:ok?'VERIFIED_COMPLETE':'PARTIAL',reason,missionId:resultMissionId,resumedFrom:continuationId||null,metrics:result.metrics,evidence,
        artifactPaths:producedMedia(result.receipts).map(a=>a.output),
        finalResponse:{ok,title:ok?'Misión general verificada':'Misión general no certificada',text:[
            ok?result.report:'Causa: '+reason,
            'Misión: '+resultMissionId+(continuationId?' (continuación de '+continuationId+')':''),
            'Llamadas registradas: '+result.receipts.length+'; exitosas: '+result.receipts.filter(r=>r.ok).length+'; inferencias: '+result.metrics.inferences,
            'Tokens: '+result.metrics.promptTokens+' entrada / '+result.metrics.outputTokens+' salida; duración: '+result.metrics.totalMs+' ms.',
            'Evidencia local SHA-256: '+evidence.sha256,
            ...result.receipts.filter(r=>r.ok&&['page.create','document.create'].includes(r.name)).map(r=>'Archivo: '+r.observation.output),
            ...(!ok&&Array.isArray(result.certification?.objectives)?result.certification.objectives.filter(x=>x.satisfied!==true).map(x=>'Verificación pendiente: '+String(x.objective||'objetivo')+' — '+String(x.reason||'SIN_RECIBO')).slice(0,15):[]),
            ...(!ok?['No se declara VERIFIED_COMPLETE.']:[])
        ].join('\n')}};
}

export function generalPilotSourceSignature(){
    return [
        runQwenGeneralPilot,
        generalToolCatalog,
        groundGeneralCatalog,
        prioritizeGeneralAdvertisingCatalog,
        prioritizeResearchDiscovery,
        prioritizeGeneralCodeCatalog,
        generalMissionAutonomyBudget,
        runGeneralAutonomousPhases,
        verifiedResearchResumeReceipts,
        receiptBoundProductionContent,
        prioritizeReceiptBoundProduction,
        verifyGeneralMission,
        independentResearchProofs,
        researchSourceProofs,
        researchQuoteRelevant,
        researchTopic,
        researchOfficeContent,
        requiredDeliveryFormats,
        missingMissionInputs,
        unavailableMissionOperations,
        prioritizeGeneralOfficeCatalog,
        createGeneralToolPolicy,
        classifyEmptyGeneralCatalog,
        requestQwenGeneralConversation
    ].map(fn=>fn.toString()).join('\n---JARVIS_SOURCE---\n');
}

// Source discovery is host-bounded: no extra model, no external model calls,
// and no completed query is repeated merely by changing researchGoal.
export function prioritizeResearchDiscovery(catalog,receipts,instruction=''){
    const valid=independentResearchProofs(receipts,instruction);
    if(valid.length>=3)return null;
    const used=new Set(receipts.filter(r=>r.ok&&r.name==='browser.inspect').map(r=>r.args?.url));
    const organization=raw=>{
        try{
            const host=new URL(raw).hostname.replace(/^www\./i,'').toLowerCase();
            const p=host.split('.'),second=p.at(-2);
            return p.at(-1)?.length===2&&['com','net','org','co','gov','gob','edu','ac'].includes(second)?p.at(-3):second;
        }catch{return null;}
    };
    const credited=new Set(valid.map(s=>organization(s.url)).filter(Boolean));
    const options=[];
    const offeredOrgs=new Set();
    for(const receipt of receipts.filter(r=>r.ok&&r.name==='web.research')){
        for(const source of receipt.observation?.sources||[]){
            const url=String(source?.url||''),org=organization(url);
            if(!url.startsWith('https://')||!org||used.has(url)||credited.has(org)||offeredOrgs.has(org))continue;
            if(/\.pdf(?:[?#]|$)|wikipedia|\/login|\/productfinder|\/privacy|\/index(?:\.html)?$/i.test(url))continue;
            const hint=(String(source.title||'')+' '+url).toLowerCase();
            if(/\b(?:sign in|log in|privacy policy|terms of use|homepage|site map|user portal)\b/i.test(hint))continue;
            const topic=researchTopic(instruction).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
            const terms=topic.split(/[^a-z0-9]+/).filter(t=>t.length>=6&&!['investigacion','investigar','fuentes','general','divulgacion','medica'].includes(t));
            const text=hint.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
            const relevant=/aire acondicionado|climatizaci[oó]n|hvac|air condition/i.test(instruction)?
                /air.condition|hvac|heat|cool|filter|mainten|efficien|energy|energ|mantenim|filtro|climatiz|refriger/i.test(hint):
                terms.some(t=>text.includes(t.slice(0,6)));
            if(terms.length&&!relevant)continue;
            // Search results are only candidates. Source relevance is proved later
            // by DOM quotations; never hard-code HVAC vocabulary into discovery.
            options.push(url);
            offeredOrgs.add(org);
        }
    }
    const inspect=catalog.find(t=>t.name==='browser.inspect');
    if(inspect&&options.length){
        const next=structuredClone(inspect);
        next.inputSchema.properties.url={type:'string',enum:options.slice(0,5)};
        return [next];
    }
    const search=catalog.find(t=>t.name==='web.research');
    if(!search)return [];
    const past=receipts.filter(r=>r.ok&&r.name==='web.research');
    if(past.length>=24)return [];
    const normalized=q=>String(q||'').toLowerCase().replace(/\s+/g,' ').trim();
    const usedQueries=new Set(past.map(r=>normalized(r.args?.query)));
    const requestedDomains=[...new Set([...String(instruction).matchAll(/\b(?:[a-z0-9-]+\.)+(?:gov|org|edu|com|mx|ca|int|net|uk)\b/gi)].map(m=>m[0].toLowerCase()))];
    const subject=/aire acondicionado|climatizaci[oó]n|hvac|air condition/i.test(instruction)
        ?'air conditioner maintenance filters cleaning energy efficiency'
        :researchTopic(instruction);
    const candidates=[
        ...requestedDomains.filter(domain=>!credited.has(organization('https://'+domain)))
          .map(domain=>'site:'+domain+' '+subject),
        ...requestedDomains.filter(domain=>!credited.has(organization('https://'+domain))).map(domain=>subject+' '+domain+' official guidance'),
        subject+' official government research evidence',
        subject+' independent expert recommendations',
        subject+' authoritative public institution education'
    ];
    const query=candidates.find(q=>!usedQueries.has(normalized(q)));
    if(!query)return [];
    const next=structuredClone(search);
    next.inputSchema.properties.query={type:'string',const:query};
    next.description+=' Búsqueda diferenciada impuesta por el host para obtener tres fuentes temáticas de organizaciones distintas; no repetir consultas previas.';
    return [next];
}

// Mission work budget is determined by the host, never by Qwen's own claim.
// Checkpoints allow long tasks to continue with original receipts, while no
// progress, failed authorization or missing evidence must still stop.
export function generalMissionAutonomyBudget(objectives={},instruction=''){
    const fileFormats=requiredDeliveryFormats(instruction).length;
    if(objectives.advertising)return {stepsPerPhase:72,maxPhases:3};
    if(objectives.research)return {stepsPerPhase:fileFormats?72:64,maxPhases:3};
    if(objectives.records)return {stepsPerPhase:fileFormats?72:56,maxPhases:2};
    if(objectives.document||objectives.page)return {stepsPerPhase:56,maxPhases:2};
    if(objectives.capabilities)return {stepsPerPhase:16,maxPhases:1};
    return {stepsPerPhase:24,maxPhases:2};
}

export async function runGeneralAutonomousPhases({initialReceipts=[],budget,executePhase,onProgress=()=>{},signal}={}){
    if(!budget||!Number.isInteger(budget.stepsPerPhase)||budget.stepsPerPhase<1||
       budget.stepsPerPhase>96||!Number.isInteger(budget.maxPhases)||budget.maxPhases<1||
       budget.maxPhases>4||typeof executePhase!=='function')
        throw Error('QWEN_AUTONOMY_BUDGET_INVALID');
    const cumulative={inferences:0,promptTokens:0,outputTokens:0,inferenceMs:0,totalMs:0,firstUsefulToolMs:null};
    let result=null,carried=initialReceipts,phasesRun=0;
    for(let phase=0;phase<budget.maxPhases;phase++){
        signal?.throwIfAborted?.();
        const priorCount=carried.length;
        const phaseResult=await executePhase(carried,phase,budget.stepsPerPhase);
        if(!Array.isArray(phaseResult?.receipts))throw Error('QWEN_AUTONOMY_RECEIPTS_REQUIRED');
        result=phaseResult;
        phasesRun++;
        for(const key of ['inferences','promptTokens','outputTokens','inferenceMs','totalMs'])
            cumulative[key]+=Number(phaseResult.metrics?.[key])||0;
        if(cumulative.firstUsefulToolMs===null&&Number.isFinite(phaseResult.metrics?.firstUsefulToolMs))
            cumulative.firstUsefulToolMs=phaseResult.metrics.firstUsefulToolMs;
        if(phaseResult.reason!=='STEP_LIMIT_REACHED'||phaseResult.status!=='PARTIAL'||
           phaseResult.receipts.length<=priorCount||phaseResult.receipts.some(r=>r?.ok!==true))break;
        carried=phaseResult.receipts;
        onProgress({phase:'QWEN_AUTONOMOUS_CHECKPOINT',completed:carried.length,checkpointIndex:phase+1,maxPhases:budget.maxPhases});
    }
    return {...result,metrics:{...result.metrics,...cumulative,autonomousPhases:phasesRun,autonomyBudget:budget}};
}

// Controlled pilot engineering track: inspect actual code and run repository
// tests, optionally prepare a human-reviewable exact patch. Never authorize
// repo.write, repo.authorizeWrite, deployments, git mutations or payments.
export function prioritizeGeneralCodeCatalog(catalog,receipts,instruction=''){
    const completed=receipts.filter(r=>r.ok===true);
    const grep=completed.find(r=>r.name==='repo.grep');
    if(!grep){
        const tool=catalog.find(t=>t.name==='repo.grep');
        if(!tool)return [];
        const term=/requestpayout/i.test(instruction)?'requestPayout':
            /\b([a-z_$][a-z0-9_$]{5,})\s*\(/i.exec(instruction)?.[1]||null;
        if(!term)return [tool];
        return [{...tool,inputSchema:{...tool.inputSchema,properties:{...tool.inputSchema.properties,
            term:{type:'string',const:term}}}}];
    }
    const found=[...new Set((grep.observation?.matches||[]).map(m=>m.file||m.path||m.relativePath).filter(f=>typeof f==='string'&&
        /^(?:functions|modules|tests|gestia-core)\/[-\w./]+\.(?:js|mjs|ts)$/i.test(f)))];
    const already=new Set(completed.filter(r=>r.name==='repo.read').map(r=>r.args?.file));
    const unread=found.filter(f=>!already.has(f));
    if(unread.length&&already.size<4){
        const tool=catalog.find(t=>t.name==='repo.read');
        if(!tool)return [];
        return [{...tool,inputSchema:{...tool.inputSchema,properties:{...tool.inputSchema.properties,
            file:{type:'string',enum:unread.slice(0,6)}}}}];
    }
    const test=completed.find(r=>r.name==='tests.run'&&
        r.args?.command===(/requestpayout/i.test(instruction)?'pilot:security':'check:syntax'));
    const emulator=completed.find(r=>r.name==='tests.run'&&r.args?.command==='v142:security-emulator');
    const nextCommand=!test?(/requestpayout/i.test(instruction)?'pilot:security':'check:syntax'):
        codeConcurrencyRequested(instruction)&&!emulator?'v142:security-emulator':null;
    if(nextCommand){
        const tool=catalog.find(t=>t.name==='tests.run');
        if(!tool)return [];
        return [{...tool,inputSchema:{...tool.inputSchema,
          properties:{command:{type:'string',const:nextCommand}},required:['command'],additionalProperties:false}}];
    }
    // Tests alone never authorize a production write or a fictional patch.
    return [];
}
