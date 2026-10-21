import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptImageSource} from '../gestia-core/jarvis/jarvis.image.adapter.js';

test('Summit mission 2026-10-20: render 1080-square and 1200-landscape with exact copy and no empty CTA/contact', async t=>{
 const oldBitmap=globalThis.createImageBitmap,oldCanvas=globalThis.OffscreenCanvas;
 t.after(()=>{globalThis.createImageBitmap=oldBitmap;globalThis.OffscreenCanvas=oldCanvas;});
 const text=[],fills=[],images=[];let count=0;
 globalThis.createImageBitmap=async()=>++count===1
  ?{width:2048,height:1365,close(){}}
  :{width:200,height:80,close(){}};
 globalThis.OffscreenCanvas=class{
   constructor(width,height){this.width=width;this.height=height}
   getContext(){return {
    fillRect:(...x)=>fills.push(x),
    drawImage:(...x)=>images.push(x),
    measureText:value=>({width:String(value).length*10}),
    fillText:value=>text.push(value),
    getImageData:()=>({data:new Uint8ClampedArray(200*80*4).fill(255)})
   }}
   async convertToBlob({type}){return new Blob(['realistically-sized-mock-raster'],{type})}
 };
 const input={sourceBase64:btoa('unmodified-stock'),sourceMimeType:'image/png',
  logoBase64:btoa('unmodified-summit-logo'),logoMimeType:'image/png',
  variants:[{id:'w1080-h1080',width:1080,height:1080,mimeType:'image/png'},
   {id:'w1200-h628',width:1200,height:628,mimeType:'image/png'}],
  composition:{layout:'split',brandName:'Summit Consulting Group',
   headline:'Summit. Asesoría fiscal y legal.',body:'Conoce el servicio en www.summ.com.mx',
   cta:'',contact:'',photoCrop:{x:0,y:0,width:2048,height:1365}}};
 const out=await adaptImageSource(input);
 assert.deepEqual(out.outputs.map(v=>[v.width,v.height]),[[1080,1080],[1200,628]]);
 assert.equal(out.outputs.every(v=>v.compositionApplied&&v.logoOverlayApplied&&v.bytes>0),true);
 assert.ok(text.includes('Summit Consulting Group'));
 assert.ok(text.some(x=>x.includes('Summit.')||x.includes('Asesoría')));
 assert.ok(text.some(x=>x.includes('www.summ.com.mx')));
 assert.equal(text.some(x=>x.includes('info@')||x.includes('Descargar Guía')),false);
 assert.equal(fills.length,4,'two rectangles per image: white base and photo panel, no extra empty CTA background');
 assert.equal(images.length,5,'one logo bounds inspection, then photo plus official logo in each of the two formats');
 count=0;
 await assert.rejects(adaptImageSource({...input,composition:{...input.composition,brandName:''}}),/IMAGE_COMPOSITION_TEXT_INVALID:brandName/);
 count=0;
 await assert.rejects(adaptImageSource({...input,composition:{...input.composition,cta:'X'.repeat(91)}}),/IMAGE_COMPOSITION_TEXT_INVALID:cta/);
});
