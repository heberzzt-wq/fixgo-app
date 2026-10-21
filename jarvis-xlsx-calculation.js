import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

// Limited independent evaluator for common arithmetic spreadsheet formulas.
// No eval, macros, external links, network calls or mutation.
const CELL=/^([A-Z]{1,3})([1-9]\d{0,5})$/iu;
const decode=label=>[...label.toUpperCase()].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0);
export async function verifyXlsxWorkbookCalculations(file,{requireFormulas=false}={}){
 const sha256=createHash('sha256').update(readFileSync(file)).digest('hex');
 const ExcelJS=(await import('exceljs')).default;
 const workbook=new ExcelJS.Workbook();
 await workbook.xlsx.readFile(file);
 const results=[],failures=[];
 for(const sheet of workbook.worksheets){
  const cache=new Map(),active=new Set();
  const valueAt=address=>{
   const key=address.toUpperCase(),parsed=CELL.exec(key);
   if(!parsed||decode(parsed[1])>16384||Number(parsed[2])>100000)throw Error('XLSX_CELL_REFERENCE_INVALID');
   if(cache.has(key))return cache.get(key);
   if(active.has(key))throw Error('XLSX_CIRCULAR_REFERENCE');
   active.add(key);
   try{
    const c=sheet.getCell(key),v=c.value;
    let n;
    if(typeof v==='number'&&Number.isFinite(v))n=v;
    else if(v&&typeof v==='object'&&typeof v.formula==='string')n=compute(v.formula);
    else throw Error('XLSX_NON_NUMERIC_FORMULA_INPUT:'+key);
    if(!Number.isFinite(n))throw Error('XLSX_NON_FINITE_RESULT');
    cache.set(key,n);return n;
   }finally{active.delete(key);}
  };
  const compute=formula=>{
   const expr=String(formula).trim().replace(/^\s*=/,'');
   let m=/^SUM\(([A-Z]{1,3}[1-9]\d{0,5}):([A-Z]{1,3}[1-9]\d{0,5})\)$/iu.exec(expr);
   if(m){
    const a=CELL.exec(m[1]),b=CELL.exec(m[2]);
    const left=decode(a[1]),right=decode(b[1]),first=Number(a[2]),last=Number(b[2]);
    if(left>right||first>last||(right-left+1)*(last-first+1)>10000)throw Error('XLSX_RANGE_UNSAFE');
    let sum=0;
    for(let col=left;col<=right;col++){
     let name='',n=col;
     while(n>0){n--;name=String.fromCharCode(65+n%26)+name;n=Math.floor(n/26);}
     for(let row=first;row<=last;row++)sum+=valueAt(name+row);
    }return sum;
   }
   m=/^([A-Z]{1,3}[1-9]\d{0,5})\s*([+-])\s*([A-Z]{1,3}[1-9]\d{0,5})$/iu.exec(expr);
   if(m)return m[2]==='+'?valueAt(m[1])+valueAt(m[3]):valueAt(m[1])-valueAt(m[3]);
   throw Error('XLSX_FORMULA_NOT_SUPPORTED_FOR_VERIFIED_RECALC');
  };
  sheet.eachRow({includeEmpty:false},row=>row.eachCell({includeEmpty:false},cell=>{
   if(typeof cell.value?.formula!=='string')return;
   try{results.push({sheet:sheet.name,cell:cell.address,formula:cell.value.formula,value:valueAt(cell.address)});}
   catch(error){failures.push({sheet:sheet.name,cell:cell.address,reason:String(error.message||error)});}
  }));
 }
 if(requireFormulas&&!results.length)failures.push({reason:'XLSX_FORMULAS_REQUIRED'});
 return {verified:failures.length===0,sourceSha256:sha256,formulaCount:results.length,results,failures};
}
