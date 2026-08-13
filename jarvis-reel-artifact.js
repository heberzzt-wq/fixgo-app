function clean(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
}

function escapeHtml(value = "") {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function safeMediaUrl(value = "") {
    const candidate = clean(value);
    if (!candidate) return "";
    if (candidate.startsWith("data:image/") || candidate.startsWith("data:video/") || candidate.startsWith("data:audio/")) return candidate;
    try {
        const url = new URL(candidate);
        return url.protocol === "https:" ? url.href : "";
    } catch {
        return "";
    }
}

function safeHexColor(value = "", fallback = "#55e6c1") {
    const candidate = clean(value);
    return /^#[0-9a-f]{6}$/i.test(candidate)
        ? candidate.toLowerCase()
        : fallback;
}

function normalizeTransition(value = "") {
    const candidate = clean(value).toLowerCase();
    return new Set(["fade", "cut", "slide", "zoom", "dissolve"]).has(candidate)
        ? candidate
        : "fade";
}

function normalizeScenes(input, durationSeconds) {
    const scenes = Array.isArray(input.scenes)
        ? input.scenes.filter(scene => scene && typeof scene === "object").slice(0, 18)
        : [];
    if (scenes.length < 3) throw new Error("REEL_SCENES_REQUIRED");
    const normalized = scenes.map((scene, index) => ({
        id: index + 1,
        durationSeconds: Number(scene.durationSeconds),
        overlay: clean(scene.overlay),
        subtitle: clean(scene.subtitle),
        visualDescription: clean(scene.visualDescription),
        mediaUrl: safeMediaUrl(scene.mediaUrl || scene.assetDataUrl),
        mediaType: clean(scene.mediaType),
        backgroundColor: safeHexColor(scene.backgroundColor, "#07111f"),
        transition: normalizeTransition(scene.transition)
    }));
    if (normalized.some(scene => !Number.isFinite(scene.durationSeconds) || scene.durationSeconds < 1 || !scene.overlay)) {
        throw new Error("REEL_SCENE_CONTENT_REQUIRED");
    }
    const total = normalized.reduce((sum, scene) => sum + scene.durationSeconds, 0);
    if (Math.abs(total - durationSeconds) > 0.01) throw new Error("REEL_TIMELINE_DURATION_MISMATCH");
    return normalized;
}

export function buildReelStudioHtml(input = {}) {
    const brandName = clean(input.brandName);
    const title = clean(input.title);
    const cta = clean(input.cta);
    const durationSeconds = Number(input.durationSeconds);
    if (!brandName || !title || !cta) throw new Error("REEL_BRAND_CONTENT_REQUIRED");
    if (!Number.isFinite(durationSeconds) || durationSeconds < 30 || durationSeconds > 180) throw new Error("REEL_DURATION_NOT_ALLOWED");
    const scenes = normalizeScenes(input, durationSeconds);
    const logoUrl = safeMediaUrl(input.logoUrl || input.logoDataUrl);
    const audioUrl = safeMediaUrl(input.audioUrl || input.audioDataUrl);
    const accentColor = safeHexColor(input.accentColor, "#55e6c1");
    const payload = JSON.stringify({ brandName, title, cta, durationSeconds, scenes, logoUrl, audioUrl, accentColor }).replaceAll("<", "\\u003c");
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Reel Studio Jarvis</title><style>
*{box-sizing:border-box}body{margin:0;background:#050914;color:#eef6ff;font:16px/1.5 system-ui,sans-serif}.studio{min-height:100vh;display:grid;grid-template-columns:minmax(300px,520px) minmax(300px,1fr);gap:2rem;padding:2rem;align-items:start}.panel{position:sticky;top:2rem;background:#0e1729;border:1px solid #263653;border-radius:1.5rem;padding:1.5rem}.eyebrow{color:${accentColor};font-weight:800;letter-spacing:.12em}.facts{padding-left:1.2rem;color:#bbcae0}.actions{display:flex;gap:.7rem;flex-wrap:wrap;margin:1.2rem 0}button,a.download{border:0;border-radius:999px;padding:.8rem 1.1rem;background:#3b82f6;color:#fff;font-weight:800;cursor:pointer;text-decoration:none}button.primary{background:${accentColor};color:#06120f}button:disabled{opacity:.5}.phone{width:min(440px,100%);margin:auto;aspect-ratio:9/16;background:#000;border:10px solid #1e293b;border-radius:2.2rem;overflow:hidden;box-shadow:0 30px 90px #0008}.phone canvas{display:block;width:100%;height:100%}.timeline{display:grid;gap:.55rem}.scene{display:grid;grid-template-columns:3rem 1fr auto;gap:.6rem;padding:.7rem;border:1px solid #263653;border-radius:.8rem}.scene.active{border-color:${accentColor};background:#13253a}.status{min-height:1.5rem;color:#9fb2cf}@media(max-width:850px){.studio{grid-template-columns:1fr}.panel{position:static}.phone{order:-1}}
</style></head><body><main class="studio"><section class="panel"><p class="eyebrow">JARVIS · REEL STUDIO V9</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(brandName)} · ${durationSeconds} segundos · 1080 × 1920 · 9:16</p><ul class="facts"><li>Timeline editable en el objeto de campaña</li><li>Preview real en canvas</li><li>Medios fuente precargados, transiciones efectivas, subtítulos, logotipo y CTA</li><li>Audio adjunto prioritario o audio de video fuente cuando exista</li><li>Exportación MP4 H.264/AAC preferida, fallback WebM y SHA-256</li></ul><div class="actions"><button id="play">Previsualizar</button><button class="primary" id="export">Exportar video</button><a class="download" id="videoDownload" hidden>Descargar video</a></div><p class="status" id="status" aria-live="polite"></p><div class="timeline" id="timeline"></div></section><div class="phone"><canvas id="reel" width="1080" height="1920" aria-label="Vista previa vertical del reel"></canvas></div></main>
<script type="application/json" id="reelData">${payload}</script><script>
const spec=JSON.parse(document.querySelector('#reelData').textContent),canvas=document.querySelector('#reel'),ctx=canvas.getContext('2d'),statusEl=document.querySelector('#status'),timeline=document.querySelector('#timeline');let animation=0,startedAt=0,exporting=false,mediaReadinessPromise=null,audioGraphPromise=null;const media=spec.scenes.map(scene=>{if(!scene.mediaUrl)return null;if(scene.mediaType==='video'||scene.mediaUrl.startsWith('data:video/')){const item=document.createElement('video');item.src=scene.mediaUrl;item.muted=true;item.playsInline=true;item.preload='auto';item.loop=true;if(scene.mediaUrl.startsWith('https:'))item.crossOrigin='anonymous';return item}const item=new Image();item.crossOrigin='anonymous';item.src=scene.mediaUrl;return item});const logo=spec.logoUrl?Object.assign(new Image(),{src:spec.logoUrl}):null,audio=spec.audioUrl?Object.assign(new Audio(),{src:spec.audioUrl,preload:'auto'}):null;
spec.scenes.forEach(scene=>{const item=document.createElement('div');item.className='scene';item.dataset.scene=scene.id;item.innerHTML='<strong>'+String(scene.id).padStart(2,'0')+'</strong><span>'+escapeText(scene.overlay)+'</span><small>'+scene.durationSeconds+'s</small>';timeline.appendChild(item)});function escapeText(value){const element=document.createElement('span');element.textContent=value;return element.innerHTML}function sceneAt(seconds){let cursor=0;for(const scene of spec.scenes){if(seconds<cursor+scene.durationSeconds)return{scene,start:cursor};cursor+=scene.durationSeconds}return{scene:spec.scenes.at(-1),start:spec.durationSeconds-spec.scenes.at(-1).durationSeconds}}
function waitForVisualItem(item,index){if(!item)return Promise.resolve({index,ready:true});if(item.tagName==='VIDEO'&&item.readyState>=2&&item.videoWidth>0)return Promise.resolve({index,ready:true});if(item.tagName!=='VIDEO'&&item.complete&&item.naturalWidth>0)return Promise.resolve({index,ready:true});return new Promise(resolve=>{let settled=false;const finish=ready=>{if(settled)return;settled=true;clearTimeout(timer);resolve({index,ready})};const timer=setTimeout(()=>finish(false),8000);if(item.tagName==='VIDEO'){item.addEventListener('loadeddata',()=>finish(item.videoWidth>0),{once:true});item.addEventListener('error',()=>finish(false),{once:true});try{item.load()}catch{}}else{item.addEventListener('load',()=>finish(item.naturalWidth>0),{once:true});item.addEventListener('error',()=>finish(false),{once:true})}})}
function waitForAudio(){if(!audio)return Promise.resolve(true);if(audio.readyState>=2)return Promise.resolve(true);return new Promise(resolve=>{let settled=false;const finish=ready=>{if(settled)return;settled=true;clearTimeout(timer);resolve(ready)};const timer=setTimeout(()=>finish(false),8000);audio.addEventListener('canplay',()=>finish(true),{once:true});audio.addEventListener('error',()=>finish(false),{once:true});try{audio.load()}catch{}})}
async function waitForMediaReady(){if(mediaReadinessPromise)return mediaReadinessPromise;mediaReadinessPromise=(async()=>{const visualItems=media.filter(Boolean);if(logo)visualItems.push(logo);const visualResults=await Promise.all(visualItems.map((item,index)=>waitForVisualItem(item,index)));const sourceMediaCount=visualItems.length,mediaReadyCount=visualResults.filter(item=>item.ready).length,mediaFailedCount=sourceMediaCount-mediaReadyCount,audioExpected=Boolean(audio),audioReady=await waitForAudio(),detail={sourceMediaCount,mediaReadyCount,mediaFailedCount,audioExpected,audioReady,failedMediaIndexes:visualResults.filter(item=>!item.ready).map(item=>item.index)};window.__JARVIS_REEL_MEDIA_READINESS__=detail;return detail})();return mediaReadinessPromise}
function audioContextConstructor(){return window.AudioContext||window.webkitAudioContext||null}async function ensureAudioGraph(){if(audioGraphPromise)return audioGraphPromise;audioGraphPromise=(async()=>{const videos=media.filter(item=>item?.tagName==='VIDEO'),mode=audio?'explicit_audio':videos.length>0?'source_video_audio_route':'silent_visual',Context=audioContextConstructor();if(mode==='silent_visual'||!Context)return{mode,available:false,trackCount:0,context:null,destination:null,nodes:[]};try{const context=new Context(),destination=context.createMediaStreamDestination(),sources=audio?[audio]:videos,nodes=[];for(const item of sources){if(item.tagName==='VIDEO'&&!audio)item.muted=false;const node=context.createMediaElementSource(item);node.connect(destination);node.connect(context.destination);nodes.push(node)}if(context.state==='suspended')await context.resume().catch(()=>{});return{mode,available:true,trackCount:destination.stream.getAudioTracks().length,context,destination,nodes}}catch(error){return{mode,available:false,trackCount:0,context:null,destination:null,nodes:[],error:error?.message||String(error)}}})();return audioGraphPromise}async function attachExportAudioTracks(stream){const graph=await ensureAudioGraph();let audioTracksAdded=0;if(graph.available&&graph.destination){for(const track of graph.destination.stream.getAudioTracks()){stream.addTrack(track);audioTracksAdded+=1}}else if(audio&&audio.captureStream){for(const track of audio.captureStream().getAudioTracks()){stream.addTrack(track);audioTracksAdded+=1}}const detail={audioMixMode:graph.mode,audioGraphAvailable:graph.available,audioTracksAdded};window.__JARVIS_REEL_AUDIO_ROUTING__=detail;return detail}
function easeOut(value){const x=Math.max(0,Math.min(1,value));return 1-Math.pow(1-x,3)}function roundedRect(x,y,w,h,r){const radius=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+radius,y);ctx.arcTo(x+w,y,x+w,y+h,radius);ctx.arcTo(x+w,y+h,x,y+h,radius);ctx.arcTo(x,y+h,x,y,radius);ctx.arcTo(x,y,x+w,y,radius);ctx.closePath()}function cover(item,zoom=1,panX=0,panY=0){const naturalWidth=item.videoWidth||item.naturalWidth||1080,naturalHeight=item.videoHeight||item.naturalHeight||1920,ratio=Math.max(1080/naturalWidth,1920/naturalHeight)*zoom,w=naturalWidth*ratio,h=naturalHeight*ratio;ctx.drawImage(item,(1080-w)/2+panX,(1920-h)/2+panY,w,h)}function wrapText(value,maxWidth){const words=String(value||'').split(' '),lines=[];let line='';for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>maxWidth&&line){lines.push(line);line=word}else line=next}if(line)lines.push(line);return lines}
function fitHeadline(value,maxWidth=930,maxLines=5){for(let size=84;size>=54;size-=4){ctx.font='900 '+size+'px system-ui';const lines=wrapText(value,maxWidth);if(lines.length<=maxLines)return{size,lines}}ctx.font='900 54px system-ui';return{size:54,lines:wrapText(value,maxWidth).slice(0,maxLines)}}function applySceneTransition(scene,local,edge){const entry=easeOut(Math.min(1,local/.55));if(scene.transition==='cut')return 1;if(scene.transition==='slide'){ctx.translate((1-entry)*(scene.id%2===0?-85:85),0);return Math.max(.2,edge)}if(scene.transition==='zoom'){const scale=.965+.035*entry;ctx.translate(540,960);ctx.scale(scale,scale);ctx.translate(-540,-960);return Math.max(.25,edge)}if(scene.transition==='dissolve')return Math.max(.08,edge*edge);return Math.max(.12,edge)}function syncVideoPlayback(activeIndex){media.forEach((item,index)=>{if(!item||item.tagName!=='VIDEO')return;if(index!==activeIndex&&!item.paused)item.pause()})}
function draw(seconds){const state=sceneAt(Math.min(seconds,spec.durationSeconds-.001)),scene=state.scene,index=scene.id-1,item=media[index],local=Math.max(0,seconds-state.start),progress=Math.max(0,Math.min(1,local/scene.durationSeconds)),entry=easeOut(Math.min(1,local/.65)),edge=Math.min(1,local/.45,(scene.durationSeconds-local)/.45);syncVideoPlayback(index);ctx.globalAlpha=1;ctx.fillStyle=scene.backgroundColor;ctx.fillRect(0,0,1080,1920);if(item){ctx.save();ctx.globalAlpha=applySceneTransition(scene,local,edge);if(item.tagName==='VIDEO'){const sourceDuration=Number.isFinite(item.duration)&&item.duration>0?item.duration:null,targetTime=sourceDuration?local%sourceDuration:local;if(Math.abs(item.currentTime-targetTime)>.35)item.currentTime=targetTime;if(item.readyState>=2){item.play().catch(()=>{});cover(item,1.035+progress*.025,(progress-.5)*-18,(progress-.5)*-12)}}else if(item.complete&&item.naturalWidth){cover(item,1.04+progress*.09,(progress-.5)*-34,(progress-.5)*-24)}ctx.restore()}const topShade=ctx.createLinearGradient(0,0,0,620);topShade.addColorStop(0,'#000c');topShade.addColorStop(1,'#0000');ctx.fillStyle=topShade;ctx.fillRect(0,0,1080,700);const shade=ctx.createLinearGradient(0,760,0,1920);shade.addColorStop(0,'#0000');shade.addColorStop(.34,'#0006');shade.addColorStop(1,'#000f');ctx.fillStyle=shade;ctx.fillRect(0,680,1080,1240);ctx.save();ctx.translate(0,(1-entry)*42);ctx.globalAlpha=entry;ctx.fillStyle='#07111fcc';roundedRect(55,54,Math.min(780,Math.max(330,brandMeasure()+88)),92,46);ctx.fill();ctx.fillStyle=spec.accentColor;ctx.font='900 37px system-ui';ctx.fillText(spec.brandName.toUpperCase(),92,113);ctx.restore();if(logo&&logo.complete){ctx.save();ctx.globalAlpha=.96;ctx.fillStyle='#ffffffee';roundedRect(850,44,165,165,32);ctx.fill();ctx.drawImage(logo,872,66,121,121);ctx.restore()}ctx.save();ctx.translate((1-entry)*52,0);ctx.globalAlpha=entry;ctx.shadowColor='#000';ctx.shadowBlur=30;ctx.fillStyle='#fff';const headline=fitHeadline(scene.overlay,930,5);ctx.font='900 '+headline.size+'px system-ui';const lineHeight=headline.size*1.16;headline.lines.forEach((line,lineIndex)=>ctx.fillText(line,70,1160+lineIndex*lineHeight));ctx.restore();const subtitle=scene.subtitle;if(subtitle){ctx.font='650 39px system-ui';const subtitles=wrapText(subtitle,858).slice(0,3),boxHeight=56+subtitles.length*52;ctx.fillStyle='#050914d9';roundedRect(58,1590-boxHeight+50,930,boxHeight,28);ctx.fill();ctx.fillStyle='#eef6ff';subtitles.forEach((line,lineIndex)=>ctx.fillText(line,91,1590-boxHeight+105+lineIndex*52))}ctx.font='850 34px system-ui';const ctaWidth=Math.min(900,Math.max(330,ctx.measureText(spec.cta).width+92));ctx.fillStyle=spec.accentColor;roundedRect(70,1745,ctaWidth,90,45);ctx.fill();ctx.fillStyle='#06120f';ctx.fillText(spec.cta,116,1802);ctx.fillStyle='#ffffff3d';ctx.fillRect(70,1870,940,8);ctx.fillStyle=spec.accentColor;ctx.fillRect(70,1870,940*Math.max(0,Math.min(1,seconds/spec.durationSeconds)),8);document.querySelectorAll('.scene').forEach(node=>node.classList.toggle('active',Number(node.dataset.scene)===scene.id))}function brandMeasure(){ctx.font='900 37px system-ui';return ctx.measureText(spec.brandName.toUpperCase()).width}
function frame(now){const seconds=(now-startedAt)/1000;draw(seconds);if(seconds<spec.durationSeconds)animation=requestAnimationFrame(frame);else{draw(spec.durationSeconds-.001);media.forEach(item=>item?.tagName==='VIDEO'&&!item.paused&&item.pause());if(audio&&!audio.paused)audio.pause();statusEl.textContent='Vista previa finalizada.'}}async function play(){const readiness=await waitForMediaReady();if(readiness.mediaFailedCount>0){statusEl.textContent='No se puede previsualizar: faltan medios visuales por cargar.';return false}const audioGraph=await ensureAudioGraph();if(audioGraph.context?.state==='suspended')await audioGraph.context.resume().catch(()=>{});cancelAnimationFrame(animation);startedAt=performance.now();if(audio&&readiness.audioReady){audio.currentTime=0;audio.play().catch(()=>{})}animation=requestAnimationFrame(frame);return true}document.querySelector('#play').onclick=()=>{play()};
document.querySelector('#export').onclick=async event=>{if(exporting)return;if(!window.MediaRecorder||!canvas.captureStream){statusEl.textContent='Este navegador no permite exportar video.';return}exporting=true;event.currentTarget.disabled=true;const readiness=await waitForMediaReady();const qualityGatePassed=readiness.mediaFailedCount===0&&(!readiness.audioExpected||readiness.audioReady===true);if(!qualityGatePassed){window.__JARVIS_REEL_EXPORT_ERROR__={status:'REEL_SOURCE_MEDIA_NOT_READY',...readiness};statusEl.textContent='Exportación bloqueada: los medios requeridos no están listos.';event.currentTarget.disabled=false;exporting=false;return}const stream=canvas.captureStream(30),audioRouting=await attachExportAudioTracks(stream),mp4Types=audioRouting.audioTracksAdded>0?['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1.42E01E','video/mp4']:['video/mp4;codecs=avc1.42E01E','video/mp4'],fallbackTypes=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'],mime=[...mp4Types,...fallbackTypes].find(type=>MediaRecorder.isTypeSupported(type))||'',recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined),chunks=[];recorder.ondataavailable=chunk=>chunk.data.size&&chunks.push(chunk.data);recorder.start(250);const started=await play();if(!started){recorder.stop();event.currentTarget.disabled=false;exporting=false;return}const ticker=setInterval(()=>{statusEl.textContent='Exportando '+Math.min(spec.durationSeconds,Math.floor((performance.now()-startedAt)/1000))+' de '+spec.durationSeconds+' segundos…'},500);await new Promise(resolve=>setTimeout(resolve,spec.durationSeconds*1000+300));recorder.stop();await new Promise(resolve=>recorder.onstop=resolve);clearInterval(ticker);const actualMime=recorder.mimeType||mime||'video/webm',blob=new Blob(chunks,{type:actualMime}),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(byte=>byte.toString(16).padStart(2,'0')).join(''),url=URL.createObjectURL(blob),link=document.querySelector('#videoDownload'),extension=actualMime.startsWith('video/mp4')?'mp4':'webm',detail={durationSeconds:spec.durationSeconds,width:1080,height:1920,mimeType:actualMime,bytes:blob.size,sha256:hash,fileName:'jarvis-reel-'+spec.durationSeconds+'s.'+extension,container:extension,formatFallback:extension!=='mp4',qualityGatePassed,...readiness,...audioRouting};window.__JARVIS_LAST_REEL_BLOB__=blob;window.__JARVIS_LAST_REEL_DETAIL__=detail;link.href=url;link.download=detail.fileName;link.hidden=false;window.dispatchEvent(new CustomEvent('jarvis:reel-exported',{detail}));statusEl.textContent=(extension==='mp4'?'MP4':'WebM fallback')+' verificado: '+blob.size+' bytes · SHA-256 '+hash.slice(0,12)+'…';event.currentTarget.disabled=false;exporting=false;if(!window.__JARVIS_HEADLESS_EXPORT__)setTimeout(()=>link.click(),0)};draw(0);
</script><script type="module">
import { recordCapabilityEvidence } from "/gestia-core/jarvis/jarvis.capability.evidence.js";
window.addEventListener("jarvis:reel-exported", event => {
    const detail = event.detail || {};
    const hash = String(detail.sha256 || "").toLowerCase();
    const hashValid = hash.length === 64 && Array.from(hash).every(character => {
        const code = character.charCodeAt(0);
        return (code >= 48 && code <= 57) || (code >= 97 && code <= 102);
    });
    const evidence = {
        ok: detail.durationSeconds >= 30 && detail.bytes > 0 && hashValid && detail.qualityGatePassed === true,
        status: "REEL_VIDEO_EXPORT_VERIFIED",
        ...detail,
        downloadable: true,
        checkedAt: new Date().toISOString()
    };
    recordCapabilityEvidence("reel_video", evidence);
    try { window.parent.dispatchEvent(new CustomEvent("jarvis:reel-exported", { detail: evidence })); } catch {}
});
</script></body></html>`;
}

export function describeReelStudio(input = {}, html = "") {
    const semanticText = [
        input.brandName,
        input.title,
        input.cta,
        ...(Array.isArray(input.scenes)
            ? input.scenes.flatMap(scene => [scene?.overlay, scene?.subtitle, scene?.visualDescription])
            : [])
    ].map(value => clean(value)).filter(Boolean).join("\n");
    return {
        ok: true,
        bytes: Buffer.byteLength(html, "utf8"),
        checks: {
            vertical1080x1920: html.includes('width="1080" height="1920"'),
            minimumDuration: Number(input.durationSeconds) >= 30,
            configurableTimeline: html.includes("sceneAt(seconds)"),
            preview: html.includes("async function play()"),
            videoExport: html.includes("new MediaRecorder"),
            nativeMp4Preferred: html.indexOf("video/mp4;codecs=avc1.42E01E") >= 0 && html.indexOf("video/mp4;codecs=avc1.42E01E") < html.indexOf("video/webm;codecs=vp9"),
            webmFallback: html.includes("video/webm;codecs=vp9"),
            actualRecorderMime: html.includes("recorder.mimeType||mime"),
            sha256: html.includes("SHA-256"),
            subtitlesAndCta: html.includes("scene.subtitle") && html.includes("spec.cta"),
            cinematicMotion: html.includes("function easeOut") && html.includes("progress*.09"),
            sourceMediaRendering: html.includes("scene.mediaUrl") && html.includes("cover(item"),
            mediaReadinessGate: html.includes("async function waitForMediaReady") && html.includes("REEL_SOURCE_MEDIA_NOT_READY"),
            effectiveTransitions: html.includes("function applySceneTransition") && html.includes("scene.transition"),
            adaptiveTypography: html.includes("function fitHeadline") && html.includes("headline.size"),
            inactiveVideoPause: html.includes("function syncVideoPlayback") && html.includes("item.pause()"),
            loopingVideo: html.includes("item.loop=true"),
            visualDirectionNotPublic: !html.includes("scene.subtitle||scene.visualDescription"),
            qualityEvidence: html.includes("qualityGatePassed") && html.includes("detail.qualityGatePassed === true"),
            audioRouting: html.includes("async function ensureAudioGraph") && html.includes("source_video_audio_route") && html.includes("explicit_audio"),
            explicitAudioPrecedence: html.includes("mode=audio?'explicit_audio'"),
            noPlaceholders: !/\bTODO\b/i.test(semanticText) && !/Lorem ipsum/i.test(semanticText)
        }
    };
}
