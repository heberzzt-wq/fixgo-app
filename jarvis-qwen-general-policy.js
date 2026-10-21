import {validateProductionDocument,codePreviewOnlyRequested} from './modules/terminal/qwen-general-evidence.js';
import {MEDIA_TOOLS,mediaPaths,authorizeMedia,producedMedia} from './modules/terminal/qwen-general-media.js';
// Host-owned capability policy. Model arguments never grant authority.
const READS=new Set(['repo.search','repo.grep','repo.read','repo.diagnose','repo.gitStatus','tests.run','platform.query','web.research','browser.inspect','artifact.read','media.analyze','system.capabilities','advertising.research']);
const PREPARES=new Set(['repo.prepareWrite']);
const CREATES=new Set(['page.create','document.create']);
const BROWSER=new Set(['browser.open','browser.screenshot']);
export function localGeneralPilot(location){
    const mode=new URLSearchParams(location?.search||'').get('qwenPilot');
    return location?.protocol==='http:' && ['127.0.0.1','localhost'].includes(location.hostname) &&
        location.port==='5000' && (!mode||mode==='general-v1');
}
export function createGeneralToolPolicy({location,missionId,objectives={},instruction='',mediaPreflight}={}){
    if(!localGeneralPilot(location)||!/^general-[a-zA-Z0-9-]{8,80}$/.test(missionId||''))throw Error('QWEN_GENERAL_LOCAL_SCOPE_REQUIRED');
    const artifactRoot='.jarvis-artifacts/qwen-general/'+missionId+'/';
    const media=mediaPaths(missionId);
    const ownPath=value=>media.owns(value)||typeof value==='string'&&value.startsWith(artifactRoot)&&
        /^[a-zA-Z0-9._-]+\.(html|pdf|docx|txt|md|csv|json|xlsx|pptx|png|mp4)$/.test(value.slice(artifactRoot.length));
    const created=(receipts,path)=>producedMedia(receipts).some(p=>p.output===path)||receipts.some(r=>r.ok&&r.name==='media.library'&&r.args.action==='import'&&r.observation.output===path);
    const preview=path=>'http://127.0.0.1:3344/qwen-artifact?output='+encodeURIComponent(path);
    return {artifactRoot,preview,ownPath,...media,
        accept:tool=>MEDIA_TOOLS.has(tool.name)?tool.userArtifact===true&&tool.requiresApproval===false:READS.has(tool.name)?tool.mutates!==true&&tool.requiresApproval!==true:
            PREPARES.has(tool.name)?objectives.code===true&&tool.mutates!==true&&tool.requiresApproval!==true:
            CREATES.has(tool.name)?tool.userArtifact===true&&tool.requiresApproval===false:
            BROWSER.has(tool.name)&&tool.requiresApproval===true,
        authorize(call,receipts=[]){
            if(Object.keys(call.args||{}).some(k=>/^(approved|approvedBy|writeAllowed|writeAuthorization|tenantId|userId|role|rol|root|cwd)$/i.test(k)))return {ok:false,reason:'MODEL_AUTHORITY_ARGUMENT_FORBIDDEN'};
            if(['image.adapt','speech.synthesize','reel.create','page.create'].includes(call.name)&&mediaPreflight){const preflight=mediaPreflight(receipts);if(!preflight.ok)return {ok:false,reason:preflight.reason,preflight};}
            // Advertising research must be about transferable advertising guidance,
            // not other businesses that happen to share the client's brand name.
            if(objectives.advertising&&call.name==='advertising.research'){
                const words=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
                const brand=String(instruction).match(/(?:^|[.\n;])\s*marca\s*:\s*([^.;\n]+)/iu)?.[1]||'';
                const key=words(brand)[0],query=words(call.args?.query);
                if(key&&query.includes(key))return {ok:false,reason:'ADVERTISING_RESEARCH_CLIENT_BRAND_QUERY_FORBIDDEN'};
            }
            if(call.name==='repo.prepareWrite'){
                const file=call.args?.file,search=call.args?.search,matchCount=call.args?.matchCount;
                if(codePreviewOnlyRequested(instruction)&&!/^tests\/fixtures\/[a-zA-Z0-9_-]+\.(?:js|mjs)$/.test(file||''))
                    return {ok:false,reason:'CODE_PREVIEW_TEST_FIXTURE_SCOPE_ONLY'};
                const origin=receipts.find(r=>r.ok===true&&r.name==='repo.read'&&r.args?.file===file&&r.observation?.verifiedRead?.file===file);
                const content=origin?.observation?.verifiedRead?.content;
                if(!objectives.code||!origin||typeof content!=='string'||typeof search!=='string'||!search.length||!Number.isInteger(matchCount)||matchCount!==1||content.split(search).length!==2||call.args?.operation==='create')
                    return {ok:false,reason:'CODE_PREPARE_EXACT_SOURCE_REQUIRED'};
            }
            if(MEDIA_TOOLS.has(call.name))return authorizeMedia(call,receipts,{ownPath,...media,instruction});
            if(call.name==='document.create'&&objectives.advertising){
                const validation=validateProductionDocument(call.args?.content,receipts,{...objectives,advertising:true,reel:objectives.reel||receipts.some(r=>r.name==='reel.create')});
                if(!validation.ok)return validation;
            }
            if(CREATES.has(call.name)||call.name==='browser.screenshot'){
                if(!ownPath(call.args?.output))return {ok:false,reason:'EXPERIMENTAL_ARTIFACT_PATH_REQUIRED'};
                if(receipts.some(r=>r.ok&&r.observation?.output===call.args.output))return {ok:false,reason:'EXISTING_ARTIFACT_OVERWRITE_FORBIDDEN'};
            }
            if(call.name==='media.analyze'&&!created(receipts,call.args?.output))return {ok:false,reason:'MISSION_SCREENSHOT_RECEIPT_REQUIRED'};
            if(call.name==='artifact.read'&&!created(receipts,call.args?.output))return {ok:false,reason:'MISSION_ARTIFACT_RECEIPT_REQUIRED'};
            if(BROWSER.has(call.name)){
                const urls=receipts.filter(r=>r.ok&&r.name==='page.create'&&ownPath(r.observation?.output)).map(r=>preview(r.observation.output));
                if(!urls.includes(call.args?.url))return {ok:false,reason:'MISSION_PREVIEW_URL_REQUIRED'};
            }
            if(call.name==='browser.inspect'){
                const urls=receipts.flatMap(r=>r.ok?[...(r.observation?.sources||[]).map(s=>s.url),...(r.name==='page.create'?[preview(r.observation.output)]:[])]:[]);
                if(!urls.includes(call.args?.url))return {ok:false,reason:'OBSERVED_URL_REQUIRED'};
            }
            if(call.name==='platform.query'){
                const fields=call.args?.fields||[];
                if(fields.some(f=>!['__name__','rol','role','account_type','b2b_activo','sub_type','subtype','tipo_cuenta','empresa_id','empresaId','tenantId','estado','kyc_status','disponible','registro_completo','tipoTransporte','vehiculo','transporte'].includes(f)))return {ok:false,reason:'GENERAL_AGGREGATE_PROJECTION_REQUIRED'};
            }
            return {ok:true,approved:BROWSER.has(call.name)};
        }
    };
}
export function normalizeGeneralSchema(schema={}){
    if(schema.type==='object')return structuredClone(schema);
    const properties={};
    for(const [key,kind]of Object.entries(schema)){
        if(typeof kind!=='string')continue;
        properties[key]=kind.includes('|')?{type:'string',enum:kind.split('|')}:
            kind.startsWith('array')?{type:'array',items:{}}:{type:['string','boolean','number','object'].includes(kind)?kind:'string'};
    }
    return {type:'object',properties,additionalProperties:false};
}
