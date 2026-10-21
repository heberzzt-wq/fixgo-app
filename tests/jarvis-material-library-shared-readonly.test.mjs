import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {materialLibrary,assertOfficialMaterial} from '../jarvis-material-library.js';
import {registerArtifact,findArtifact} from '../jarvis-artifact-studio.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(t){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'shared-material-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const root=path.join(base,'repo'),library=path.join(base,'shared');
 fs.mkdirSync(path.join(root,'.jarvis-artifacts'),{recursive:true}); fs.mkdirSync(path.join(library,'Entradas'),{recursive:true});
 fs.writeFileSync(path.join(root,'.jarvis-artifacts/material-library.config.json'),JSON.stringify({directory:library,sharedReadOnly:true,officialOnly:true}));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64');
 fs.writeFileSync(path.join(library,'Entradas/source.png'),png);return {root,library,png};
}
function snapshot(root){const rows=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name),s=fs.statSync(f); rows.push([path.relative(root,f),e.isDirectory()?'directory':sha(fs.readFileSync(f)),s.mtimeMs]);if(e.isDirectory())walk(f);}}walk(root);return rows;}
test('shared list/import/export preserves all source bytes, directories, mtimes and shared history',t=>{
 const {root,library,png}=fixture(t);fs.mkdirSync(path.join(library,'Historial'));fs.writeFileSync(path.join(library,'Historial/publicidad.jsonl'),'');
 const before=snapshot(library);
 assert.equal(materialLibrary({root}).entries.length,1);
 assert.deepEqual(snapshot(library),before);
 const imported=materialLibrary({root,action:'import',relativePath:'Entradas/source.png'});
 const target=path.join(root,imported.output),stamp=new Date('2000-01-01');fs.utimesSync(target,stamp,stamp);
 assert.equal(materialLibrary({root,action:'import',relativePath:'Entradas/source.png'}).physicallyWritten,false);
 assert.equal(fs.statSync(target).mtimeMs,stamp.getTime());
 const output='.jarvis-artifacts/new.png';fs.writeFileSync(path.join(root,output),Buffer.concat([png,Buffer.from('new delivery')]));
 registerArtifact({root,output,metadata:{mimeType:'image/png',originalFile:imported.output}});
 const exported=materialLibrary({root,action:'export',output});assert.equal(exported.ok,true);assert.equal(exported.historyRecorded,true);
 assert.equal(exported.directory,path.join(root,'.jarvis-artifacts/material-library-deliveries'));
 const delivered='.jarvis-artifacts/material-library-deliveries/'+exported.relativePath;
 assert.equal(findArtifact({root,output:delivered}).sha256,exported.sha256);
 assert.equal(materialLibrary({root}).advertisingHistory.length,1);
 assert.deepEqual(snapshot(library),before);
 assert.equal(materialLibrary({root,action:'export',output}).status,'ADVERTISING_DUPLICATE_BLOCKED');assert.deepEqual(snapshot(library),before);
});
test('list without history is pure and import rejects occupied content-addressed destination',t=>{
 const {root,library,png}=fixture(t);const before=snapshot(library);materialLibrary({root});assert.deepEqual(snapshot(library),before);
 const dir=path.join(root,'.jarvis-artifacts/material-library');fs.mkdirSync(dir);const target=path.join(dir,sha(png)+'.png');fs.writeFileSync(target,'occupied');
 assert.throws(()=>materialLibrary({root,action:'import',relativePath:'Entradas/source.png'}),/MATERIAL_DESTINATION_CONFLICT/);
 assert.equal(fs.readFileSync(target,'utf8'),'occupied');assert.deepEqual(snapshot(library),before);
});
test('shared export rejects preexisting conflicting delivery without overwrite',t=>{
 const {root,library,png}=fixture(t),output='.jarvis-artifacts/final.png';fs.writeFileSync(path.join(root,output),png);registerArtifact({root,output,metadata:{mimeType:'image/png'}});
 const dir=path.join(root,'.jarvis-artifacts/material-library-deliveries/Salidas');fs.mkdirSync(dir,{recursive:true});const target=path.join(dir,sha(png).slice(0,12)+'-final.png');fs.writeFileSync(target,'occupied');const before=snapshot(library);
 assert.throws(()=>materialLibrary({root,action:'export',output}),/MATERIAL_DESTINATION_CONFLICT/);assert.equal(fs.readFileSync(target,'utf8'),'occupied');assert.deepEqual(snapshot(library),before);
});
test('official material permits verified local speech only with explicit opt-in and valid WAV',t=>{
 const {root}=fixture(t),output='.jarvis-artifacts/audio.wav';const bytes=Buffer.alloc(46);bytes.write('RIFF');bytes.writeUInt32LE(38,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(2,40);
 fs.writeFileSync(path.join(root,output),bytes);
 const metadata={type:'audio',origin:'speech.synthesize',provider:'windows-system-speech',status:'SPEECH_AUDIO_CREATED_VERIFIED',mimeType:'audio/wav',approved:true,approvedBy:'LOCAL_ARTIFACT_POLICY'};registerArtifact({root,output,metadata});
 assert.throws(()=>assertOfficialMaterial({root,output}),/MATERIAL_OFFICIAL_LIBRARY_REQUIRED/);assert.doesNotThrow(()=>assertOfficialMaterial({root,output,allowGeneratedSpeech:true}));
 registerArtifact({root,output,metadata:{...metadata,provider:'remote'}});assert.throws(()=>assertOfficialMaterial({root,output,allowGeneratedSpeech:true}),/MATERIAL_OFFICIAL_LIBRARY_REQUIRED/);
 registerArtifact({root,output,metadata});fs.appendFileSync(path.join(root,output),'changed');assert.throws(()=>assertOfficialMaterial({root,output,allowGeneratedSpeech:true}),/MATERIAL_OFFICIAL_LIBRARY_REQUIRED/);
});

test('adapted formats share approved creative but same dimensions or renamed bytes remain duplicates',t=>{
 const {root,png}=fixture(t);const imported=materialLibrary({root,action:'import',relativePath:'Entradas/source.png'});
 const create=(name,id,width,height,suffix=name)=>{
  const output=`.jarvis-artifacts/${name}.png`;
  fs.writeFileSync(path.join(root,output),Buffer.concat([png,Buffer.from(suffix)]));
  registerArtifact({root,output,metadata:{mimeType:'image/png',origin:'image.adapt',provider:'browser_canvas',originalFile:imported.output,
   transformations:[{type:'local_ad_composition',id,width,height,composition:{headline:'Servicios locales',body:'Conoce las opciones',layout:'split'}}]}});
  return output;
 };
 const first=materialLibrary({root,action:'export',output:create('portrait','portrait',1080,1350)});assert.equal(first.ok,true);assert.equal(first.experimental,true);assert.ok(findArtifact({root,output:first.deliveryOutput}));
 assert.equal(materialLibrary({root,action:'export',output:create('square','square',1080,1080)}).ok,true);
 assert.equal(materialLibrary({root,action:'export',output:create('renamed','another-id',1080,1350)}).status,'ADVERTISING_DUPLICATE_BLOCKED');
 assert.equal(materialLibrary({root,action:'export',output:create('renamed-bytes','landscape',1200,630,'portrait')}).status,'ADVERTISING_DUPLICATE_BLOCKED');
});

test('complete compact combinations include older shared and local deliveries without shared mutation',t=>{
 const {root,library}=fixture(t);
 const old={sha256:'a'.repeat(64),createdAt:'2020-01-01',visual:{sourceRef:'library:Entradas/source.png',layout:'split'},format:{id:'old-id',width:1080,height:1920,sourceSha256:'b'.repeat(64)},creative:{headline:'Do not repeat old copy'}};
 const recent=Array.from({length:35},(_,i)=>({sha256:i.toString(16).padStart(64,'0'),createdAt:'2026-01-01',visual:{sourceRef:'library:Entradas/another.png',layout:'stack'},format:{id:'renamed-'+i,width:1080,height:1080,sourceSha256:'c'.repeat(64)}}));
 fs.mkdirSync(path.join(library,'Historial'));fs.writeFileSync(path.join(library,'Historial/publicidad.jsonl'),[old,...recent].map(x=>JSON.stringify(x)).join('\n'));
 const local=path.join(root,'.jarvis-artifacts/material-library-deliveries/Historial');fs.mkdirSync(local,{recursive:true});
 fs.writeFileSync(path.join(local,'publicidad.jsonl'),JSON.stringify({...old,sha256:'d'.repeat(64),visual:{sourceRef:'library:Entradas/source.png',layout:'legacy'},format:undefined}));
 const before=snapshot(library),listed=materialLibrary({root});
 assert.equal(listed.advertisingHistory.length,30);
 assert.ok(!listed.advertisingHistory.some(h=>h.createdAt==='2020-01-01'));
 assert.equal(listed.deliveredCombinations.length,3);
 assert.ok(listed.deliveredCombinations.some(c=>c.visual.layout==='split'&&c.format.height===1920));
 assert.ok(listed.deliveredCombinations.some(c=>c.visual.layout==='legacy'&&!c.format));
 assert.equal(JSON.stringify(listed.deliveredCombinations).includes('Do not repeat old copy'),false);
 assert.equal(JSON.stringify(listed.deliveredCombinations).includes('renamed'),false);
 assert.deepEqual(snapshot(library),before);
});

test('Summit exact authorized copy can be exported in a different verified layout, but identical artwork or layout remains blocked', t=>{
 const {root,png}=fixture(t);
 const imported=materialLibrary({root,action:'import',relativePath:'Entradas/source.png'});
 const make=(name,layout,suffix=name)=>{
  const output=`.jarvis-artifacts/${name}.png`;
  fs.writeFileSync(path.join(root,output),Buffer.concat([png,Buffer.from(suffix)]));
  registerArtifact({root,output,metadata:{
   mimeType:'image/png',origin:'image.adapt',provider:'browser_canvas',originalFile:imported.output,
   transformations:[{type:'local_ad_composition',id:'w1200-h628',width:1200,height:628,
    composition:{brandName:'Summit Consulting Group',headline:'Summit. Asesoría fiscal y legal.',
      body:'Conoce el servicio en www.summ.com.mx',layout}}]
  }});
  return output;
 };
 const first=materialLibrary({root,action:'export',output:make('split-approved','split')});
 assert.equal(first.ok,true);
 const distinct=materialLibrary({root,action:'export',output:make('stack-new-pixels','stack')});
 assert.equal(distinct.ok,true,'same authorized text, different layout and verified physical bytes');
 assert.notEqual(distinct.sha256,first.sha256);
 assert.equal(materialLibrary({root,action:'export',output:make('stack-renamed-different-bytes','stack')}).status,'ADVERTISING_DUPLICATE_BLOCKED');
 assert.equal(materialLibrary({root,action:'export',output:make('stack-byte-copy','stack','split-approved')}).status,'ADVERTISING_DUPLICATE_BLOCKED');
});
