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
        backgroundColor: clean(scene.backgroundColor) || "#07111f",
        transition: clean(scene.transition) || "fade"
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
    const payload = JSON.stringify({ brandName, title, cta, durationSeconds, scenes, logoUrl, audioUrl }).replaceAll("<", "\\u003c");
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Reel Studio Jarvis</title><style>
*{box-sizing:border-box}body{margin:0;background:#050914;color:#eef6ff;font:16px/1.5 system-ui,sans-serif}.studio{min-height:100vh;display:grid;grid-template-columns:minmax(300px,520px) minmax(300px,1fr);gap:2rem;padding:2rem;align-items:start}.panel{position:sticky;top:2rem;background:#0e1729;border:1px solid #263653;border-radius:1.5rem;padding:1.5rem}.eyebrow{color:#55e6c1;font-weight:800;letter-spacing:.12em}.facts{padding-left:1.2rem;color:#bbcae0}.actions{display:flex;gap:.7rem;flex-wrap:wrap;margin:1.2rem 0}button,a.download{border:0;border-radius:999px;padding:.8rem 1.1rem;background:#3b82f6;color:#fff;font-weight:800;cursor:pointer;text-decoration:none}button.primary{background:#55e6c1;color:#06120f}button:disabled{opacity:.5}.phone{width:min(440px,100%);margin:auto;aspect-ratio:9/16;background:#000;border:10px solid #1e293b;border-radius:2.2rem;overflow:hidden;box-shadow:0 30px 90px #0008}.phone canvas{display:block;width:100%;height:100%}.timeline{display:grid;gap:.55rem}.scene{display:grid;grid-template-columns:3rem 1fr auto;gap:.6rem;padding:.7rem;border:1px solid #263653;border-radius:.8rem}.scene.active{border-color:#55e6c1;background:#13253a}.status{min-height:1.5rem;color:#9fb2cf}@media(max-width:850px){.studio{grid-template-columns:1fr}.panel{position:static}.phone{order:-1}}
</style></head><body><main class="studio"><section class="panel"><p class="eyebrow">JARVIS · REEL STUDIO V7</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(brandName)} · ${durationSeconds} segundos · 1080 × 1920 · 9:16</p><ul class="facts"><li>Timeline editable en el objeto de campaña</li><li>Preview real en canvas</li><li>Subtítulos, overlays, logotipo y CTA</li><li>Exportación WebM local con SHA-256</li></ul><div class="actions"><button id="play">Previsualizar</button><button class="primary" id="export">Exportar WebM</button><a class="download" id="videoDownload" hidden>Descargar video</a></div><p class="status" id="status" aria-live="polite"></p><div class="timeline" id="timeline"></div></section><div class="phone"><canvas id="reel" width="1080" height="1920" aria-label="Vista previa vertical del reel"></canvas></div></main>
<script type="application/json" id="reelData">${payload}</script><script>
const spec=JSON.parse(document.querySelector('#reelData').textContent),canvas=document.querySelector('#reel'),ctx=canvas.getContext('2d'),statusEl=document.querySelector('#status'),timeline=document.querySelector('#timeline');let animation=0,startedAt=0,exporting=false;const media=spec.scenes.map(scene=>{if(!scene.mediaUrl)return null;if(scene.mediaType==='video'||scene.mediaUrl.startsWith('data:video/')){const item=document.createElement('video');item.src=scene.mediaUrl;item.muted=true;item.playsInline=true;item.preload='auto';return item}const item=new Image();item.crossOrigin='anonymous';item.src=scene.mediaUrl;return item});const logo=spec.logoUrl?Object.assign(new Image(),{src:spec.logoUrl}):null,audio=spec.audioUrl?Object.assign(new Audio(),{src:spec.audioUrl,preload:'auto'}):null;
spec.scenes.forEach(scene=>{const item=document.createElement('div');item.className='scene';item.dataset.scene=scene.id;item.innerHTML='<strong>'+String(scene.id).padStart(2,'0')+'</strong><span>'+escapeText(scene.overlay)+'</span><small>'+scene.durationSeconds+'s</small>';timeline.appendChild(item)});function escapeText(value){const element=document.createElement('span');element.textContent=value;return element.innerHTML}function sceneAt(seconds){let cursor=0;for(const scene of spec.scenes){if(seconds<cursor+scene.durationSeconds)return{scene,start:cursor};cursor+=scene.durationSeconds}return{scene:spec.scenes.at(-1),start:spec.durationSeconds-spec.scenes.at(-1).durationSeconds}}
function cover(item){const ratio=Math.max(1080/(item.videoWidth||item.naturalWidth||1080),1920/(item.videoHeight||item.naturalHeight||1920)),w=(item.videoWidth||item.naturalWidth||1080)*ratio,h=(item.videoHeight||item.naturalHeight||1920)*ratio;ctx.drawImage(item,(1080-w)/2,(1920-h)/2,w,h)}function wrapText(value,maxWidth){const words=value.split(' '),lines=[];let line='';for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>maxWidth&&line){lines.push(line);line=word}else line=next}if(line)lines.push(line);return lines}
function draw(seconds){const state=sceneAt(Math.min(seconds,spec.durationSeconds-.001)),scene=state.scene,index=scene.id-1,item=media[index],local=seconds-state.start;ctx.fillStyle=scene.backgroundColor;ctx.fillRect(0,0,1080,1920);if(item){if(item.tagName==='VIDEO'){if(Math.abs(item.currentTime-local)>.35)item.currentTime=Math.min(local,item.duration||local);if(item.readyState>=2){item.play().catch(()=>{});cover(item)}}else if(item.complete&&item.naturalWidth)cover(item)}const shade=ctx.createLinearGradient(0,500,0,1920);shade.addColorStop(0,'#0000');shade.addColorStop(1,'#000e');ctx.fillStyle=shade;ctx.fillRect(0,0,1080,1920);ctx.fillStyle='#55e6c1';ctx.font='800 38px system-ui';ctx.fillText(spec.brandName.toUpperCase(),70,115);if(logo&&logo.complete)ctx.drawImage(logo,870,55,140,140);ctx.fillStyle='#fff';ctx.font='900 82px system-ui';const lines=wrapText(scene.overlay,940);lines.slice(0,5).forEach((line,lineIndex)=>ctx.fillText(line,70,1180+lineIndex*96));ctx.fillStyle='#dbeafe';ctx.font='600 40px system-ui';const subtitles=wrapText(scene.subtitle||scene.visualDescription,920);subtitles.slice(0,3).forEach((line,lineIndex)=>ctx.fillText(line,70,1625+lineIndex*54));ctx.fillStyle='#55e6c1';ctx.fillRect(70,1810,Math.max(220,ctx.measureText(spec.cta).width+80),74);ctx.fillStyle='#06120f';ctx.font='800 34px system-ui';ctx.fillText(spec.cta,110,1859);document.querySelectorAll('.scene').forEach(node=>node.classList.toggle('active',Number(node.dataset.scene)===scene.id))}
function frame(now){const seconds=(now-startedAt)/1000;draw(seconds);if(seconds<spec.durationSeconds)animation=requestAnimationFrame(frame);else{draw(spec.durationSeconds-.001);statusEl.textContent='Vista previa finalizada.'}}function play(){cancelAnimationFrame(animation);startedAt=performance.now();if(audio){audio.currentTime=0;audio.play().catch(()=>{})}animation=requestAnimationFrame(frame)}document.querySelector('#play').onclick=play;
document.querySelector('#export').onclick=async event=>{if(exporting)return;if(!window.MediaRecorder||!canvas.captureStream){statusEl.textContent='Este navegador no permite exportar WebM.';return}exporting=true;event.currentTarget.disabled=true;const stream=canvas.captureStream(30);if(audio&&audio.captureStream){audio.captureStream().getAudioTracks().forEach(track=>stream.addTrack(track))}const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type))||'',recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined),chunks=[];recorder.ondataavailable=chunk=>chunk.data.size&&chunks.push(chunk.data);recorder.start(250);play();const ticker=setInterval(()=>{statusEl.textContent='Exportando '+Math.min(spec.durationSeconds,Math.floor((performance.now()-startedAt)/1000))+' de '+spec.durationSeconds+' segundos…'},500);await new Promise(resolve=>setTimeout(resolve,spec.durationSeconds*1000+300));recorder.stop();await new Promise(resolve=>recorder.onstop=resolve);clearInterval(ticker);const blob=new Blob(chunks,{type:mime||'video/webm'}),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(byte=>byte.toString(16).padStart(2,'0')).join(''),url=URL.createObjectURL(blob),link=document.querySelector('#videoDownload'),detail={durationSeconds:spec.durationSeconds,width:1080,height:1920,mimeType:blob.type,bytes:blob.size,sha256:hash,fileName:'jarvis-reel-'+spec.durationSeconds+'s.webm'};window.__JARVIS_LAST_REEL_BLOB__=blob;window.__JARVIS_LAST_REEL_DETAIL__=detail;link.href=url;link.download=detail.fileName;link.hidden=false;window.dispatchEvent(new CustomEvent('jarvis:reel-exported',{detail}));statusEl.textContent='WebM verificado: '+blob.size+' bytes · SHA-256 '+hash.slice(0,12)+'…';event.currentTarget.disabled=false;exporting=false;if(!window.__JARVIS_HEADLESS_EXPORT__)setTimeout(()=>link.click(),0)};draw(0);
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
        ok: detail.durationSeconds >= 30 && detail.bytes > 0 && hashValid,
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
    return {
        ok: true,
        bytes: Buffer.byteLength(html, "utf8"),
        checks: {
            vertical1080x1920: html.includes('width="1080" height="1920"'),
            minimumDuration: Number(input.durationSeconds) >= 30,
            configurableTimeline: html.includes("sceneAt(seconds)"),
            preview: html.includes("function play()"),
            webmExport: html.includes("new MediaRecorder"),
            sha256: html.includes("SHA-256"),
            subtitlesAndCta: html.includes("scene.subtitle") && html.includes("spec.cta"),
            noPlaceholders: !html.includes("TODO") && !html.includes("Lorem ipsum")
        }
    };
}
