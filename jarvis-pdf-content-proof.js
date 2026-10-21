import fs from 'node:fs';
import {createHash} from 'node:crypto';
export async function verifyPdfContentPhysically(file,{minCharacters=80}={}){
 const bytes=fs.readFileSync(file);
 const sourceSha256=createHash('sha256').update(bytes).digest('hex');
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const pdf=await pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true,disableFontFace:true}).promise;
 let extractedText='';
 for(let p=1;p<=pdf.numPages;p++){
  const page=await pdf.getPage(p),content=await page.getTextContent();
  extractedText+=content.items.map(x=>x.str||'').join(' ')+'\n';
 }
 const verified=pdf.numPages>=1&&extractedText.trim().length>=minCharacters;
 return {verified,sourceSha256,extractedText:extractedText.slice(0,60000),
  extractedTextSha256:createHash('sha256').update(extractedText).digest('hex'),
  pages:pdf.numPages,characters:extractedText.length,provider:'pdfjs-dist-local'};
}
