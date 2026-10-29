// Reuses the bounded MediaRecorder bitrate principle from B2C consented video
// evidence. The original selected File stays untouched. No camera permission,
// no cloud encoder and no silent removal of soundtrack.
export const MOBILE_VIDEO_ECONOMY_POLICY = Object.freeze({
    maxOriginalBytes: 64 * 1024 * 1024,
    maxOutputBytes: 8 * 1024 * 1024,
    maxDurationSeconds: 45,
    videoBitsPerSecond: 750000,
    audioBitsPerSecond: 96000
});
const MIME_CANDIDATES = Object.freeze([
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2'
]);
export function mobileVideoCompressionDecision(file, policy = MOBILE_VIDEO_ECONOMY_POLICY) {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    const compatible = /\.(mp4|webm|mov)$/.test(name) &&
        ['video/mp4','video/webm','video/quicktime'].includes(type);
    if (!compatible) return {kind:'unsupported',reason:'VIDEO_COMPRESSION_UNSUPPORTED_FORMAT'};
    if (!Number.isSafeInteger(file?.size) || file.size < 1)
        return {kind:'unsupported',reason:'VIDEO_COMPRESSION_INVALID_SOURCE'};
    if (file.size <= policy.maxOutputBytes) return {kind:'passthrough'};
    if (file.size > policy.maxOriginalBytes)
        return {kind:'unsupported',reason:'VIDEO_COMPRESSION_SOURCE_TOO_LARGE'};
    return {kind:'optimize'};
}
export function chooseMobileVideoMime(Recorder = globalThis.MediaRecorder) {
    if (typeof Recorder?.isTypeSupported !== 'function') return null;
    return MIME_CANDIDATES.find(mime=>Recorder.isTypeSupported(mime)) || null;
}
function videoError(code) {const error = new Error(code);error.code=code;return error;}
function awaitEvent(target, ok, bad, timeoutMs, signal) {
    return new Promise((resolve,reject)=>{
        let settled=false;
        const finish = error => {
            if(settled)return;settled=true;
            clearTimeout(timer);
            target.removeEventListener(ok,onOk);
            for(const name of bad)target.removeEventListener(name,onBad);
            signal?.removeEventListener('abort',onAbort);
            error?reject(error):resolve();
        };
        const onOk=()=>finish();
        const onBad=()=>finish(videoError('VIDEO_COMPRESSION_SOURCE_UNREADABLE'));
        const onAbort=()=>finish(videoError('VIDEO_COMPRESSION_ABORTED'));
        const timer=setTimeout(()=>finish(videoError('VIDEO_COMPRESSION_MEDIA_TIMEOUT')),timeoutMs);
        target.addEventListener(ok,onOk,{once:true});
        for(const name of bad)target.addEventListener(name,onBad,{once:true});
        signal?.addEventListener('abort',onAbort,{once:true});
        if(signal?.aborted)onAbort();
    });
}
export async function optimizeSelectedMobileVideo(file, {
    policy=MOBILE_VIDEO_ECONOMY_POLICY, onProgress=()=>{}, signal
}={}) {
    const decision=mobileVideoCompressionDecision(file,policy);
    if(decision.kind==='passthrough')return {file,compressed:false};
    if(decision.kind!=='optimize')throw videoError(decision.reason);
    const mime=chooseMobileVideoMime();
    if(!mime||typeof document==='undefined'||typeof URL?.createObjectURL!=='function')
        throw videoError('VIDEO_COMPRESSION_UNAVAILABLE');
    const url=URL.createObjectURL(file);
    const video=document.createElement('video');
    video.preload='auto';video.playsInline=true;video.muted=true;
    let stream=null, recorder=null, ticker=null, onAbort=null, onHidden=null;
    const chunks=[];
    try {
        signal?.throwIfAborted();
        const ready=awaitEvent(video,'loadedmetadata',['error','abort'],12000,signal);
        video.src=url;video.load();await ready;
        const duration=Number(video.duration);
        if(!Number.isFinite(duration)||duration<=0||duration>policy.maxDurationSeconds)
            throw videoError('VIDEO_COMPRESSION_DURATION_LIMIT');
        if(typeof video.captureStream!=='function')
            throw videoError('VIDEO_COMPRESSION_CAPTURE_UNAVAILABLE');
        // captureStream returns both video and original audio tracks when the
        // browser supports preserving them. No audio track = cannot certify
        // that a source with sound would stay intact, so refuse compression.
        stream=video.captureStream();
        await video.play();
        const deadline=Date.now()+1500;
        while(Date.now()<deadline&&(!stream.getVideoTracks().length||!stream.getAudioTracks().length)){
            signal?.throwIfAborted();
            await new Promise(resolve=>setTimeout(resolve,75));
        }
        if(!stream.getVideoTracks().length||!stream.getAudioTracks().length)
            throw videoError('VIDEO_COMPRESSION_AUDIO_PRESERVATION_UNVERIFIED');
        video.pause();
        if(video.currentTime > 0.03) {
            const rewind=awaitEvent(video,'seeked',['error','abort'],4000,signal);
            video.currentTime=0;
            await rewind;
        }
        recorder=new MediaRecorder(stream,{mimeType:mime,
            videoBitsPerSecond:policy.videoBitsPerSecond,
            audioBitsPerSecond:policy.audioBitsPerSecond});
        const completed=new Promise((resolve,reject)=>{
            recorder.addEventListener('dataavailable',event=>{if(event.data?.size)chunks.push(event.data);});
            recorder.addEventListener('error',event=>reject(event.error||videoError('VIDEO_COMPRESSION_RECORDER_FAILED')),{once:true});
            recorder.addEventListener('stop',resolve,{once:true});
        });
        onAbort=()=>{
            if(recorder?.state!=='inactive')recorder?.stop();
            video.pause();
        };
        signal?.addEventListener('abort',onAbort,{once:true});
        onHidden=()=>{
            if(document.hidden){onAbort();video.dispatchEvent(new Event('abort'));}
        };
        document.addEventListener?.('visibilitychange',onHidden);
        if(document.hidden)throw videoError('VIDEO_COMPRESSION_BACKGROUND_INTERRUPTED');
        recorder.start(1000);
        const playbackEnd=awaitEvent(video,'ended',['error','abort'],(duration+6)*1000,signal);
        ticker=setInterval(()=>onProgress(Math.min(99,Math.round(video.currentTime/duration*100))),1000);
        await video.play();
        await playbackEnd;
        if(recorder.state!=='inactive')recorder.stop();
        await completed;
        signal?.throwIfAborted();
        const type=recorder.mimeType||mime;
        const extension=type.startsWith('video/mp4')?'mp4':'webm';
        const blob=new Blob(chunks,{type});
        // Upload policy permits media MIME families, not codec parameters.
        const uploadMime=extension==='mp4'?'video/mp4':'video/webm';
        if(blob.size<1000||blob.size>=file.size||blob.size>policy.maxOutputBytes)
            throw videoError('VIDEO_COMPRESSION_TARGET_NOT_MET');
        const name=String(file.name).replace(/\.[^.]+$/,'')+'-optimizado.'+extension;
        onProgress(100);
        return {file:new File([blob],name,{type:uploadMime,lastModified:file.lastModified||Date.now()}),
            compressed:true,originalBytes:file.size,optimizedBytes:blob.size,
            audioTrackPresentAtEncode:true,mediaRecorderType:type};
    } finally {
        if(ticker)clearInterval(ticker);
        signal?.removeEventListener('abort',onAbort);
        document?.removeEventListener?.('visibilitychange',onHidden);
        if(recorder?.state&&recorder.state!=='inactive')try{recorder.stop();}catch{}
        video.pause?.();
        if(stream?.getTracks)for(const track of stream.getTracks())try{track.stop();}catch{}
        video.removeAttribute?.('src');video.load?.();
        URL.revokeObjectURL(url);
    }
}
