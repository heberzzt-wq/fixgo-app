import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {buildReelStudioHtml} from '../jarvis-reel-artifact.js';
test('poster subtitles occupy a reserved band without covering original artwork or adding a second logo',()=>{
 const subtitle='Una explicación clara para tomar decisiones con confianza.';
 const html=buildReelStudioHtml({brandName:'Example',title:'Demo',cta:'Consultar',durationSeconds:30,scenes:Array.from({length:3},()=>({durationSeconds:10,presentation:'poster',mediaType:'image',assetDataUrl:'data:image/png;base64,aW1hZ2U=',subtitle}))});
 const data=html.match(/id="reelData">([\s\S]*?)<\/script>/)[1],script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 const images=[],texts=[];const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),measureText:s=>({width:s.length*22}),drawImage:(...a)=>images.push(a),fillText:(...a)=>texts.push(a)},{get:(o,k)=>o[k]||(()=>{})});
 const el=()=>({dataset:{},classList:{toggle(){}},appendChild(){},querySelectorAll:()=>[],getContext:()=>ctx});const elements={};
 class Image{constructor(){this.complete=true;this.naturalWidth=1080;this.naturalHeight=1920;}}
 vm.runInNewContext(script,{document:{querySelector:s=>elements[s]??=(s==='#reelData'?{textContent:data}:el()),createElement:()=>el()},Image,window:{},console});
 assert.equal(images.length,1);const imageBottom=images[0][2]+images[0][4];assert.ok(imageBottom<1920);assert.ok(texts.every(t=>t[2]>imageBottom&&t[2]<1920));assert.equal(texts.map(t=>t[0]).join(' '),subtitle);
});
