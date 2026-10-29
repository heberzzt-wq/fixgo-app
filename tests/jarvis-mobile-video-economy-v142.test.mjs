import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mobileVideoCompressionDecision,chooseMobileVideoMime,
 optimizeSelectedMobileVideo,MOBILE_VIDEO_ECONOMY_POLICY}
 from '../modules/terminal/jarvis-video-economy.js';

test('video input uses B2C-style bounded bitrate but no cloud encoder, no automatic compression of small files',()=>{
 assert.equal(MOBILE_VIDEO_ECONOMY_POLICY.videoBitsPerSecond,750000);
 assert.equal(MOBILE_VIDEO_ECONOMY_POLICY.audioBitsPerSecond,96000);
 assert.equal(MOBILE_VIDEO_ECONOMY_POLICY.maxOutputBytes,8*1024*1024);
 assert.equal(mobileVideoCompressionDecision({name:'clip.mp4',type:'video/mp4',size:1024}).kind,'passthrough');
 assert.equal(mobileVideoCompressionDecision({name:'clip.mp4',type:'video/mp4',size:9*1024*1024}).kind,'optimize');
 assert.equal(mobileVideoCompressionDecision({name:'clip.mov',type:'video/quicktime',size:9*1024*1024}).kind,'optimize');
 assert.equal(mobileVideoCompressionDecision({name:'clip.webm',type:'video/webm',size:9*1024*1024}).kind,'optimize');
 assert.equal(mobileVideoCompressionDecision({name:'video.zip',type:'application/zip',size:9*1024*1024}).kind,'unsupported');
 assert.equal(mobileVideoCompressionDecision({name:'clip.mp4',type:'video/mp4',size:80*1024*1024}).kind,'unsupported');
});
test('encoder output must include an audio-capable codec and never choose video-only format',()=>{
 assert.equal(chooseMobileVideoMime({isTypeSupported:s=>s==='video/webm;codecs=vp8,opus'}),
  'video/webm;codecs=vp8,opus');
 assert.equal(chooseMobileVideoMime({isTypeSupported:s=>s==='video/mp4;codecs=avc1.42E01E,mp4a.40.2'}),
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2');
 assert.equal(chooseMobileVideoMime({isTypeSupported:s=>s==='video/webm;codecs=vp8'}),null);
});
test('source file passes through untouched below the 8MB limit, including its audio',async()=>{
 const source={name:'original.mp4',type:'video/mp4',size:1024};
 const result=await optimizeSelectedMobileVideo(source);
 assert.equal(result.file,source);
 assert.equal(result.compressed,false);
});
test('DOM/recorder path creates smaller video requiring an audio track at encoding; original is unchanged',async t=>{
 const original={name:'voz.mp4',type:'video/mp4',size:10*1024*1024,lastModified:42};
 const before={document:globalThis.document,MediaRecorder:globalThis.MediaRecorder,
  createObjectURL:URL.createObjectURL,revokeObjectURL:URL.revokeObjectURL};
 t.after(()=>{
  if(before.document===undefined)delete globalThis.document;else globalThis.document=before.document;
  if(before.MediaRecorder===undefined)delete globalThis.MediaRecorder;else globalThis.MediaRecorder=before.MediaRecorder;
  URL.createObjectURL=before.createObjectURL; URL.revokeObjectURL=before.revokeObjectURL;
 });
 const events=[];
 const stream={getVideoTracks:()=>[{kind:'video',stop(){events.push('stopVideo');}}],
  getAudioTracks:()=>[{kind:'audio',stop(){events.push('stopAudio');}}],
  getTracks:()=>[...stream.getVideoTracks(),...stream.getAudioTracks()]};
 let gotVideo=null,played=0,recorderCreated=0,revoked=false;
 class MockVideo extends EventTarget{
  constructor(){super();this.duration=5;this.currentTime=0;this.ended=false;}
  set src(value){this._src=value;}
  get src(){return this._src;}
  load(){if(this._src)queueMicrotask(()=>this.dispatchEvent(new Event('loadedmetadata')));}
  captureStream(){return stream;}
  async play(){
   played++;
   if(played===1){this.currentTime=0.1;return;}
   queueMicrotask(()=>{
    this.currentTime=this.duration;this.ended=true;
    this.dispatchEvent(new Event('ended'));
   });
  }
  pause(){}
  set currentTime(value){this._currentTime=value;if(value===0)queueMicrotask(()=>this.dispatchEvent(new Event('seeked')));}
  get currentTime(){return this._currentTime;}
  removeAttribute(){this._src='';}
 }
 class MockRecorder extends EventTarget{
  static isTypeSupported(x){return x==='video/webm;codecs=vp8,opus';}
  constructor(s,o){super();assert.equal(s,stream);assert.equal(o.audioBitsPerSecond,96000);this.mimeType=o.mimeType;this.state='inactive';recorderCreated++;}
  start(){this.state='recording';}
  stop(){
   this.state='inactive';
   const e=new Event('dataavailable');e.data=new Blob([new Uint8Array(2500)],{type:this.mimeType});
   this.dispatchEvent(e);this.dispatchEvent(new Event('stop'));
  }
 }
 globalThis.document={createElement:tag=>{assert.equal(tag,'video');gotVideo=new MockVideo();return gotVideo;}};
 globalThis.MediaRecorder=MockRecorder;
 URL.createObjectURL=()=> 'blob:mock-original';
 URL.revokeObjectURL=()=>{revoked=true;};
 const progress=[];
 const result=await optimizeSelectedMobileVideo(original,{onProgress:value=>progress.push(value)});
 assert.equal(result.compressed,true);
 assert.equal(result.file.name,'voz-optimizado.webm');
 assert.equal(result.file.type,'video/webm');
 assert.equal(result.file.size,2500);
 assert.equal(result.originalBytes,original.size);
 assert.equal(result.audioTrackPresentAtEncode,true);
 assert.equal(original.name,'voz.mp4');
 assert.equal(original.size,10*1024*1024);
 assert.equal(played,2);
 assert.equal(recorderCreated,1);
 assert.equal(progress.at(-1),100);
 assert.equal(revoked,true);
 assert.ok(events.includes('stopAudio'));
 assert.ok(events.includes('stopVideo'));
});
test('upload integrates optimizer before bounded upload without altering desktop limits',()=>{
 const uploader=readFileSync('modules/terminal/jarvis-attachments.js','utf8');
 const economy=readFileSync('modules/terminal/jarvis-video-economy.js','utf8');
 assert.match(uploader,/import \{optimizeSelectedMobileVideo,mobileVideoCompressionDecision\}/);
 assert.match(uploader,/uploadFile=optimized.file/);
 assert.match(uploader,/expectedBytes: uploadFile.size/);
 assert.match(uploader,/uploadFile.slice\(offset/);
 assert.match(uploader,/compressionController\?\.abort\(\)/);
 assert.match(uploader,/signal:item\.compressionController\.signal/);
 assert.match(uploader,/Comprimiendo video/);
 assert.match(uploader,/El original no se modificó ni se subió/);
 assert.match(uploader,/MOBILE_CHUNK_BYTES/);
 assert.match(uploader,/file.size > maxFileBytes && !\(mobile &&/);
 assert.match(economy,/VIDEO_COMPRESSION_AUDIO_PRESERVATION_UNVERIFIED/);
 assert.match(economy,/video\.captureStream\(\)/);
 assert.match(economy,/audioBitsPerSecond:policy\.audioBitsPerSecond/);
 assert.doesNotMatch(economy,/getUserMedia|fetch\(|localStorage|Firebase/);
});
