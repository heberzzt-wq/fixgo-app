import {mediaDeliveryGaps} from './qwen-general-media.js';
import {validateProductionDocument} from './qwen-general-evidence.js';

// Only the host assembles the production inventory. Qwen decides to create
// a document, but cannot replace physical receipts with a success statement.
export function receiptBoundProductionContent(receipts,objectives={},instruction=''){
  if(!objectives.advertising||mediaDeliveryGaps(receipts,objectives).length)return null;
  const rows=receipts.filter(r=>r.ok&&r.observation?.ok===true);
  const images=rows.filter(r=>r.name==='image.adapt').flatMap(r=>r.observation.outputs||[]);
  if(!images.length)return null;
  for(const f of objectives.requestedImageFormats||[])
    if(!images.some(i=>i.width===f.width&&i.height===f.height))return null;
  const page=rows.findLast(r=>r.name==='page.create');
  if(objectives.page&&(!page||
      !rows.some(r=>r.name==='browser.open'&&r.observation.url===page.observation.url)||
      !rows.some(r=>r.name==='browser.inspect'&&r.observation.url===page.observation.url&&r.observation.dom)||
      !rows.some(r=>r.name==='browser.screenshot'&&r.args?.url===page.observation.url)||
      !rows.some(r=>r.name==='artifact.read'&&r.observation.output===page.observation.output)))return null;
  const reel=rows.findLast(r=>r.name==='reel.create');
  const speech=reel&&rows.find(r=>r.name==='speech.synthesize'&&r.observation.output===reel.args?.audioOutput);
  if(objectives.reel&&(!reel||!speech))return null;
  const validSha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/i.test(v);
  const resourceRows=[...images,...(page?[page.observation]:[]),...(speech?[speech.observation]:[]),...(reel?[reel.observation]:[])];
  const resources=[...new Map(resourceRows.filter(v=>typeof v?.output==='string'&&validSha(v.sha256)).map(v=>[v.output,{output:v.output,sha256:v.sha256}])).values()];
  if(resources.length!==resourceRows.length)return null;
  const approved=new Set(rows.flatMap(r=>r.observation?.advertisingSemanticReview?.verified===true?
      r.observation.advertisingSemanticReview.acceptedSourceURLs||[]:[]));
  const opened=new Set(rows.filter(r=>r.name==='browser.inspect'&&r.observation?.dom).map(r=>r.observation.url));
  const sources=[...approved].filter(url=>opened.has(url));
  if(sources.length<2)return null;
  const exact=String(instruction).match(/(?:único texto comercial(?: permitido)?|texto comercial exacto)\s*:\s*["“]([^"”]+)["”]/iu)?.[1]?.trim();
  const socialCopy=exact||[...new Set(rows.filter(r=>r.name==='image.adapt').flatMap(r=>
     ['headline','body','cta','contact'].map(k=>r.args?.composition?.[k]).filter(v=>typeof v==='string'&&v.trim())))].join(' ');
  const doc={
    ...(objectives.reel?{
      narration:speech.args.text,
      durationSeconds:reel.args.durationSeconds,
      scenes:reel.args.scenes.map(s=>({
        durationSeconds:s.durationSeconds,assetOutput:s.assetOutput,overlay:s.overlay,subtitle:s.subtitle
      }))
    }:{
      socialCopy,
      formats:images.map(i=>({width:i.width,height:i.height,output:i.output}))
    }),
    sources,
    resources,
    limitations:['Archivos de producción local experimental; no se acredita publicación ni resultados comerciales.']
  };
  const text=JSON.stringify(doc);
  return validateProductionDocument(text,receipts,objectives).ok?text:null;
}


// Offer the next verifiable physical step instead of asking Qwen to rediscover
// unfinished read-backs and exports from a growing, contradictory tool list.
// Return null only when this gate is not applicable; [] means request FINISH.
export function prioritizeReceiptBoundProduction(catalog,receipts,objectives={}){
  if(!objectives.advertising)return null;
  const rows=receipts.filter(r=>r.ok&&r.observation?.ok===true);
  const images=rows.filter(r=>r.name==='image.adapt').flatMap(r=>r.observation.outputs||[]);
  const requested=objectives.requestedImageFormats||[];
  if(!images.length||requested.some(f=>!images.some(i=>i.width===f.width&&i.height===f.height)))return null;
  const tool=(name,field,value,action)=>{
    const existing=catalog.find(t=>t.name===name);
    if(!existing)return [];
    const next=structuredClone(existing),p=next.inputSchema?.properties;
    if(name==='media.library'){
      next.inputSchema.anyOf=(next.inputSchema.anyOf||[]).filter(s=>
          s.properties?.action?.const===action&&s.properties?.output?.enum?.includes(value))
         .map(s=>({...s,properties:{...s.properties,output:{type:'string',const:value}}}));
      return next.inputSchema.anyOf.length?[next]:[];
    }
    if(field&&p?.[field]?.enum){
      if(!p[field].enum.includes(value))return [];
      p[field]={type:'string',const:value};
    }
    return [next];
  };
  const pending=(name,predicate,field,value,action)=>
    rows.some(predicate)?null:tool(name,field,value,action);
  const page=rows.findLast(r=>r.name==='page.create');
  if(objectives.page){
    if(!page)return tool('page.create');
    const url=page.observation.url;
    for(const [name,pred,field] of [
      ['browser.open',r=>r.name==='browser.open'&&r.observation.url===url,'url'],
      ['browser.inspect',r=>r.name==='browser.inspect'&&r.observation.url===url&&r.observation.dom,'url'],
      ['browser.screenshot',r=>r.name==='browser.screenshot'&&r.args?.url===url,'url']
    ]){
      const next=pending(name,pred,field,url);
      if(next!==null)return next;
    }
  }
  const outputs=[...images,...rows.filter(r=>['browser.screenshot','reel.create'].includes(r.name)).map(r=>r.observation)];
  for(const item of outputs){
    const out=item.output;
    const analyzed=rows.some(r=>r.name==='media.analyze'&&r.observation.output===out);
    if(!analyzed)return tool('media.analyze','output',out);
    if(!rows.some(r=>r.name==='artifact.read'&&r.observation.output===out))
      return tool('artifact.read','output',out);
    if(!rows.some(r=>r.name==='media.library'&&r.args?.action==='export'&&r.args.output===out))
      return tool('media.library',null,out,'export');
  }
  if(page&&!rows.some(r=>r.name==='artifact.read'&&r.observation.output===page.observation.output))
    return tool('artifact.read','output',page.observation.output);
  if(objectives.reel){
    const speech=rows.findLast(r=>r.name==='speech.synthesize');
    const reel=rows.findLast(r=>r.name==='reel.create');
    if(!speech)return tool('speech.synthesize');
    if(!rows.some(r=>r.name==='artifact.read'&&r.observation.output===speech.observation.output))
      return tool('artifact.read','output',speech.observation.output);
    if(!reel)return tool('reel.create');
  }
  const doc=rows.findLast(r=>r.name==='document.create');
  if(!doc){
    if(mediaDeliveryGaps(receipts,objectives).length)return null;
    return tool('document.create');
  }
  if(!rows.some(r=>r.name==='artifact.read'&&r.observation.output===doc.observation.output))
    return tool('artifact.read','output',doc.observation.output);
  if(!rows.some(r=>r.name==='media.library'&&r.args?.action==='export'&&r.args.output===doc.observation.output))
    return tool('media.library',null,doc.observation.output,'export');
  return [];
}
