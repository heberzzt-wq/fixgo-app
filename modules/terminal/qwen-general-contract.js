// Host-side contract for new general missions. Qwen cannot narrow requested files
// or invent missing inputs by deciding to finish.
export const OFFICE_FORMATS=Object.freeze(['pdf','docx','xlsx','pptx','csv']);
export function requiredDeliveryFormats(instruction){
 const s=String(instruction||'').toLowerCase();
 if(!/\b(?:crea|crear|genera|generar|entrega|entregar|descarga|descargar|exporta|exportar|produce|producir|prepara|preparar|hacer|haz|informe|reporte)\b/iu.test(s))return [];
 const requested=OFFICE_FORMATS.filter(x=>new RegExp('(?:^|[^a-z])'+x+'(?:$|[^a-z])','iu').test(s));
 if(/\b(?:excel|hoja(?:s)? de c[aá]lculo)\b/iu.test(s)&&!requested.includes('xlsx'))requested.push('xlsx');
 if(/\b(?:word|documento word)\b/iu.test(s)&&!requested.includes('docx'))requested.push('docx');
 if(/\b(?:powerpoint|diapositivas)\b/iu.test(s)&&!requested.includes('pptx'))requested.push('pptx');
 return requested;
}
export function missingMissionInputs(instruction){
 const s=String(instruction||'').trim();
 if(!s)return ['instrucción'];
 const norm=s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
 if(/(?:crear|crea|generar|genera|entregar|entrega).{0,100}(?:excel|xlsx|saldo|control financiero)/iu.test(norm)&&
    /(?:pago|saldo|presupuesto|movimientos)/iu.test(norm)&&
    !/(?:[$€]\s*\d+[\d,.]*|\b\d+[.,]\d{2}\b|\b\d+\s*(?:mxn|usd|pesos|dolares)\b)/iu.test(norm) &&
    !/(?:archivo|adjunt|movimientos concretos|datos de prueba|ejemplo|fictici)/iu.test(norm))
    return ['montos y movimientos o autorización explícita para datos ficticios'];
 if(/(?:investigar|investiga).{0,75}(?:un tema real|un asunto|un tema)\b/iu.test(norm)&&
    !/(?:sobre|acerca de|relacionad[oa] con)\s+\S{4}/iu.test(norm))
    return ['tema específico de investigación'];
 if(/(?:crear|crea|producir|produce).{0,100}(?:campana|publicidad|marketing|video|mp4)/iu.test(norm)&&
   !/(?:marca\s*:|texto comercial|summit|nombre comercial|cliente\s*:|producto\s*:)/iu.test(norm))
   return ['marca y contenido comercial autorizado'];
 if(/(?:proyecto de prueba|reparar el codigo|analizar un proyecto)/iu.test(norm)&&
   !/(?:repositorio\s*:|ruta\s*:|archivo adjunt|proyecto\s*:\s*\S{3}|bug\s*:)/iu.test(norm))
   return ['repositorio o proyecto de prueba y fallo reproducible'];
 return [];
}
const digest=o=>o?.sha256||(o?.artifact?.file===o?.output?o.artifact.sha256:undefined);
export function unfulfilledDownloadFormats(instruction,receipts=[]){
 const formats=requiredDeliveryFormats(instruction);
 return formats.filter(format=>{
  const candidate=receipts.filter(r=>r?.ok===true&&r?.name==='document.create'&&r.args?.format===format&&r.observation?.ok===true)
    .find(r=>typeof r.observation.output==='string'&&r.observation.output.endsWith('.'+format)&&
      /^[a-f0-9]{64}$/i.test(digest(r.observation)||'')&&r.observation?.artifact?.file===r.observation.output&&
      r.observation?.artifact?.mimeType);
  if(!candidate)return true;
  const output=candidate.observation.output,sha=digest(candidate.observation);
  const read=receipts.some(r=>{
    if(!(r.ok===true&&r.name==='artifact.read'&&r.observation?.output===output&&
       r.observation.sha256===sha&&r.observation?.bytes>32&&typeof r.observation.dataBase64==='string'))return false;
    try{
      const bytes=Uint8Array.from(atob(r.observation.dataBase64),c=>c.charCodeAt(0));
      return bytes.length===r.observation.bytes&&documentStructureVerified(format,bytes,candidate,instruction);
    }catch{return false;}
  });
  const exported=receipts.some(r=>r.ok===true&&r.name==='media.library'&&r.args?.action==='export'&&r.args.output===output&&
      r.observation?.sha256===sha&&r.observation?.experimental===true);
  if(format==='pdf'&&financialRequestedAmounts(instruction).length>0&&!verifiedFinancialPdfContent(instruction,receipts))return true;
  return !(read&&exported);
 });
}

export function prioritizeGeneralOfficeCatalog(catalog,receipts,instruction=''){
 const formats=requiredDeliveryFormats(instruction);
 if(!formats.length)return null;
 const rows=receipts.filter(r=>r.ok===true&&r.observation?.ok===true);
 const created=rows.filter(r=>r.name==='document.create'&&formats.includes(r.args?.format)&&r.observation?.output);
 const missingReads=created.filter(r=>!rows.some(x=>x.name==='artifact.read'&&x.observation?.output===r.observation.output&&
    x.observation.sha256===(r.observation.sha256||r.observation.artifact?.sha256)));
 if(missingReads.length){
  const t=catalog.find(t=>t.name==='artifact.read');
  if(!t)return [];
  const output=missingReads[0].observation.output;
  return [{...t,inputSchema:{type:'object',properties:{output:{type:'string',const:output}},
    required:['output'],additionalProperties:false}}];
 }
 const missingExports=created.filter(r=>!rows.some(x=>x.name==='media.library'&&x.args?.action==='export'&&
  x.args.output===r.observation.output&&x.observation.sha256===(r.observation.sha256||r.observation.artifact?.sha256)));
 if(missingExports.length){
  const t=catalog.find(t=>t.name==='media.library');
  if(!t)return [];
  const output=missingExports[0].observation.output;
  return [{...t,inputSchema:{type:'object',properties:{action:{type:'string',const:'export'},output:{type:'string',const:output}},
   required:['action','output'],additionalProperties:false}}];
 }
 const remaining=formats.filter(f=>!created.some(r=>r.args?.format===f));
 if(remaining.length){
  const t=catalog.find(t=>t.name==='document.create');
  if(!t)return [];
  const inputSchema=structuredClone(t.inputSchema);
  const financial=financialRequestedAmounts(instruction).length>0;
  const next=financial&&remaining.includes('xlsx')?['xlsx']:remaining;
  inputSchema.properties.format={type:'string',enum:next};
  if(financial&&next.length===1&&next[0]==='xlsx'){
    const workbook=financialWorkbookFromInstruction(instruction);
    if(!workbook)return [];
    inputSchema.properties.sheets={type:'array',const:workbook.sheets};
    inputSchema.properties.requireFormulas={type:'boolean',const:true};
    inputSchema.required=[...new Set([...inputSchema.required,'sheets','requireFormulas'])];
  }
  if(financial&&next.length===1&&next[0]==='pdf'){
    const grounded=verifiedFinancialPdfFromWorkbook(instruction,receipts);
    if(!grounded)return [];
    inputSchema.properties.content={type:'string',const:grounded};
  }
  inputSchema.required=[...new Set([...(inputSchema.required||[]),'output','format','title','requireDocumentValidation','documentContract'])];
  inputSchema.properties.requireDocumentValidation={type:'boolean',const:true};
  return [{...t,inputSchema}];
 }
 return [];
}

export function unavailableMissionOperations(instruction=''){
 const t=String(instruction||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
 const out=[];
 const hasPositive=pattern=>[...t.matchAll(new RegExp(pattern.source,'giu'))].some(match=>{
  const prefix=t.slice(0,match.index).split(/[;.,\n]/u).at(-1);
  return !/\b(?:no|sin|ni|nunca|evita|prohibido|prohibida)(?:\s+[a-z]+){0,5}\s*$/iu.test(prefix);
 });
 if(hasPositive(/\b(?:reparar|corregir|modificar)\b.{0,90}\b(?:codigo|repo|repositorio|proyecto)\b|\b(?:parche|patch)\b|\bproyecto de prueba\b/iu))
  out.push('aplicación segura de parches y pruebas de código desde este piloto');
 if(/\b(?:consultar|consulta)\b[\s\S]{0,150}\btecnicos\b[\s\S]{0,130}\b(?:servicios|vehiculos|vencidos)\b/iu.test(t))
  out.push('consulta completa de colecciones operativas de técnicos, servicios, vehículos y vencimientos');
 // Only explicit browser *actions* require interactive authorization.
 // Merely researching responsive web forms, login usability or page designs does not.
 const interactiveAction=/(?:\b(?:haz|hacer|da|dar|pulsa|pulsar|realiza|realizar)\s+(?:un\s+)?(?:click|clic)\b|\b(?:click|clic)\s+en\b|\b(?:rellena|rellenar|completa|completar|envia|enviar|introduce|introducir|inicia|iniciar)\b[\s\S]{0,90}\b(?:formulario|form|login|sesion|cuenta|credenciales)\b|\b(?:navega|navegar|entra|entrar|accede|acceder)\b[\s\S]{0,90}\b(?:sitio|pagina|web)\b[\s\S]{0,90}\b(?:login|inicia\s+sesion|credenciales|autenticado)\b)/iu;
 if(hasPositive(interactiveAction))
  out.push('navegación interactiva autenticada con acciones en formularios');
 return out;
}
export function documentStructureVerified(format,bytes,receipt,instruction=''){
 if(!(bytes instanceof Uint8Array)||bytes.length<36)return false;
 const latin=Array.from(bytes.slice(0,12),c=>String.fromCharCode(c)).join('');
 const tail=Array.from(bytes.slice(-100),c=>String.fromCharCode(c)).join('');
 if(format==='pdf'){
  if(!latin.startsWith('%PDF-')||!tail.includes('%%EOF'))return false;
  if(financialRequestedAmounts(instruction).length){
   const proof=receipt.observation?.pdfContentProof;
   return proof?.verified===true&&proof.sourceSha256===digest(receipt.observation)&&
     typeof proof.extractedText==='string'&&proof.pages>=1;
  }
  return true;
 }
 if(['xlsx','docx','pptx'].includes(format)){
   if(!latin.startsWith('PK\x03\x04'))return false;
   if(!Array.from(bytes.slice(-Math.min(bytes.length,60000)),c=>String.fromCharCode(c)).join('')
     .includes(({xlsx:'xl/workbook.xml',docx:'word/document.xml',pptx:'ppt/presentation.xml'})[format]))return false;
   if(format==='docx'&&receipt.observation?.documentValidation?.ok!==true)return false;
   if(format==='xlsx'&&/f[oó]rmulas|c[aá]lculos|totales/i.test(String(instruction))&&
      !(receipt.observation?.workbookCalculationVerified===true&&
        receipt.observation?.workbookCalculation?.sourceSha256===digest(receipt.observation)&&
        receipt.observation?.workbookCalculation?.verified===true&&
        receipt.observation?.workbookCalculation?.formulaCount>0))return false;
   return true;
 }
 if(format==='csv')return !bytes.slice(0,4).some(b=>b===0)&&
     Array.from(bytes.slice(0,Math.min(bytes.length,500)),c=>String.fromCharCode(c)).join('').includes(',');
 return false;
}

export function financialRequestedAmounts(instruction=''){
 if(!/pago|deuda|saldo|movimientos/i.test(instruction)||
    !requiredDeliveryFormats(instruction).includes('pdf')||
    !requiredDeliveryFormats(instruction).includes('xlsx'))return [];
 const norm=String(instruction).replace(/,/g,'');
 const numbers=[...norm.matchAll(/\b(?:deuda inicial|saldo inicial|pago(?:\s+\d+)?(?:\s+de)?|total pagado|saldo pendiente)\s*\$?\s*(\d+(?:\.\d{2})?)\s*(?:mxn|pesos)?/giu)]
   .map(x=>Number(x[1])).filter(x=>Number.isFinite(x));
 return [...new Set(numbers)];
}
export function verifiedFinancialPdfFromWorkbook(instruction,receipts=[]){
 const amounts=financialRequestedAmounts(instruction);
 if(!amounts.length)return null;
 const completed=receipts.filter(r=>r.ok===true&&r.observation?.ok===true);
 const book=completed.find(r=>r.name==='document.create'&&r.args?.format==='xlsx'&&
   r.observation?.workbookCalculationVerified===true&&r.observation?.workbookCalculation?.verified===true);
 if(!book)return null;
 const asset=book.observation,sha=digest(asset);
 if(!sha||asset.workbookCalculation?.sourceSha256!==sha)return null;
 const read=completed.find(r=>r.name==='artifact.read'&&r.observation?.output===asset.output&&
    r.observation?.sha256===sha&&typeof r.observation?.dataBase64==='string');
 const exportReceipt=completed.find(r=>r.name==='media.library'&&r.args?.action==='export'&&
    r.args.output===asset.output&&r.observation?.sha256===sha&&r.observation?.experimental===true);
 if(!read||!exportReceipt)return null;
 const sums=asset.workbookCalculation.results;
 if(!Array.isArray(sums)||!sums.length)return null;
 const sheets=book.args?.sheets;
 if(!Array.isArray(sheets)||sheets.length!==1||!Array.isArray(sheets[0]?.rows))return null;
 const lines=[],known=[];
 const sheet=sheets[0];
 for(let i=1;i<sheet.rows.length;i++){
  const row=sheet.rows[i],label=String(row?.[0]||'').trim();
  const value=row?.[1];
  if(!label||typeof value!=='number'&&typeof value!=='string')return null;
  const calc=typeof value==='string'&&value.startsWith('=')?
    sums.find(x=>x.sheet===sheet.name&&x.cell==='B'+(i+1)&&x.formula===value.slice(1)):null;
  const numerical=calc?.value??(typeof value==='number'?value:NaN);
  if(!Number.isFinite(numerical))return null;
  known.push(numerical);
  lines.push(label+': $'+numerical.toLocaleString('en-US',{maximumFractionDigits:2})+' MXN'+
    (calc?' (fórmula '+calc.formula+')':''));
 }
 if(amounts.some(n=>!known.includes(n)))return null;
 if(!lines.some(l=>/total pagado/i.test(l))||!lines.some(l=>/saldo pendiente/i.test(l)))return null;
 return 'REPORTE FINANCIERO - DATOS DE PRUEBA\n'+
  'Movimientos ficticios. No se han realizado pagos reales.\n\n'+lines.join('\n')+
  '\n\nLos importes y las fórmulas proceden del libro XLSX de esta misma misión, con SHA-256 '+sha+
  '. El total y el saldo se verificaron por cálculo local independiente.';
}
export function verifiedFinancialPdfContent(instruction,receipts=[]){
 const expected=verifiedFinancialPdfFromWorkbook(instruction,receipts);
 const pdf=receipts.find(r=>r.ok===true&&r.name==='document.create'&&r.args?.format==='pdf'&&r.observation?.ok===true);
 if(!expected)return financialRequestedAmounts(instruction).length===0;
 if(!pdf||pdf.args?.content!==expected)return false;
 const sha=digest(pdf.observation),proof=pdf.observation.pdfContentProof;
 if(!proof||proof.verified!==true||proof.sourceSha256!==sha||
    typeof proof.extractedText!=='string'||proof.pages<1)return false;
 const normalized=proof.extractedText.replace(/[,$\s]/gu,'').toLowerCase();
 return financialRequestedAmounts(instruction).every(n=>
   normalized.includes(String(n).replace(/[^\d.]/g,'')))&&
   ['totalpagado','saldopendiente'].every(s=>normalized.includes(s));
}

export function financialWorkbookFromInstruction(instruction=''){
 const formats=requiredDeliveryFormats(instruction);
 if(!formats.includes('xlsx')||!financialRequestedAmounts(instruction).length)return null;
 const text=String(instruction).replace(/,/g,'');
 const debt=/\b(?:deuda|saldo)\s+inicial\s+(?:de\s*)?\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:mxn|pesos)?/iu.exec(text);
 const payments=[...text.matchAll(/\bpago\s+(\d+)\s+de\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:mxn|pesos)?/giu)]
   .map(m=>({id:Number(m[1]),amount:Number(m[2])}));
 if(!debt||!payments.length||payments.length>50||payments.some((p,i)=>p.id!==i+1||!Number.isFinite(p.amount)||p.amount<0))return null;
 const initial=Number(debt[1]),paid=payments.reduce((s,p)=>s+p.amount,0),balance=initial-paid;
 if(!Number.isFinite(initial)||initial<0||!Number.isFinite(balance))return null;
 const explicitTotal=/\btotal\s+pagado\s+(?:de\s*)?\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:mxn|pesos)?/iu.exec(text);
 const explicitBalance=/\bsaldo\s+pendiente\s+(?:de\s*)?\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:mxn|pesos)?/iu.exec(text);
 if(explicitTotal&&Math.abs(Number(explicitTotal[1])-paid)>.00001)return null;
 if(explicitBalance&&Math.abs(Number(explicitBalance[1])-balance)>.00001)return null;
 const lastPaymentRow=payments.length+2,totalRow=lastPaymentRow+1;
 const firstFormula='=SUM(B3:B'+lastPaymentRow+')',secondFormula='=B2-B'+totalRow;
 const namedFormulas=[...text.matchAll(/=(?:SUM\([A-Z]\d+:[A-Z]\d+\)|B\d+\s*[-+]\s*B\d+)/giu)].map(m=>m[0].replace(/\s+/g,'').toUpperCase());
 if(namedFormulas.length&&(!namedFormulas.includes(firstFormula.toUpperCase())||!namedFormulas.includes(secondFormula.toUpperCase())))return null;
 const name=text.match(/hoja\s+llamada\s+([a-zA-ZÁÉÍÓÚáéíóúÑñ_][a-zA-ZÁÉÍÓÚáéíóúÑñ_0-9 -]{0,28})/iu)?.[1]?.trim().split(/\s+(?:con|que|y)\b/iu)[0]||'Control';
 if(!name||name.length>31||/[\\/?*[\]:]/.test(name))return null;
 const rows=[['Concepto','Monto'],['Saldo inicial',initial],...payments.map(p=>['Pago '+p.id,p.amount]),
   ['Total pagado',firstFormula],['Saldo pendiente',secondFormula]];
 return {sheets:[{name,rows}],expected:{initial,paid,balance,payments,formulas:[firstFormula,secondFormula]}};
}
