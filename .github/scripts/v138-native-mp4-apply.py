from pathlib import Path
import re

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(path, old, new):
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise SystemExit(f'ANCHOR_MISMATCH:{path}:{count}:{old[:140]!r}')
    write(path, content.replace(old, new, 1))


def regex_once(path, pattern, replacement, flags=0):
    content = read(path)
    updated, count = re.subn(pattern, replacement, content, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'REGEX_ANCHOR_MISMATCH:{path}:{count}:{pattern[:160]!r}')
    write(path, updated)


# --- Reel Studio: prefer native H.264/AAC MP4 while retaining verified WebM fallback.
replace_once(
    'jarvis-reel-artifact.js',
    '<li>Exportación WebM local con control de carga y SHA-256</li>',
    '<li>Exportación MP4 H.264/AAC preferida, fallback WebM y SHA-256</li>'
)
replace_once(
    'jarvis-reel-artifact.js',
    '<button class="primary" id="export">Exportar WebM</button>',
    '<button class="primary" id="export">Exportar video</button>'
)
replace_once(
    'jarvis-reel-artifact.js',
    "statusEl.textContent='Este navegador no permite exportar WebM.'",
    "statusEl.textContent='Este navegador no permite exportar video.'"
)
replace_once(
    'jarvis-reel-artifact.js',
    "const stream=canvas.captureStream(30),audioRouting=await attachExportAudioTracks(stream);const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type))||'',recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined),chunks=[];",
    "const stream=canvas.captureStream(30),audioRouting=await attachExportAudioTracks(stream),mp4Types=audioRouting.audioTracksAdded>0?['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1.42E01E','video/mp4']:['video/mp4;codecs=avc1.42E01E','video/mp4'],fallbackTypes=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'],mime=[...mp4Types,...fallbackTypes].find(type=>MediaRecorder.isTypeSupported(type))||'',recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined),chunks=[];"
)
replace_once(
    'jarvis-reel-artifact.js',
    "const blob=new Blob(chunks,{type:mime||'video/webm'}),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(byte=>byte.toString(16).padStart(2,'0')).join(''),url=URL.createObjectURL(blob),link=document.querySelector('#videoDownload'),detail={durationSeconds:spec.durationSeconds,width:1080,height:1920,mimeType:blob.type,bytes:blob.size,sha256:hash,fileName:'jarvis-reel-'+spec.durationSeconds+'s.webm',qualityGatePassed,...readiness,...audioRouting};",
    "const actualMime=recorder.mimeType||mime||'video/webm',blob=new Blob(chunks,{type:actualMime}),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(byte=>byte.toString(16).padStart(2,'0')).join(''),url=URL.createObjectURL(blob),link=document.querySelector('#videoDownload'),extension=actualMime.startsWith('video/mp4')?'mp4':'webm',detail={durationSeconds:spec.durationSeconds,width:1080,height:1920,mimeType:actualMime,bytes:blob.size,sha256:hash,fileName:'jarvis-reel-'+spec.durationSeconds+'s.'+extension,container:extension,formatFallback:extension!=='mp4',qualityGatePassed,...readiness,...audioRouting};"
)
replace_once(
    'jarvis-reel-artifact.js',
    "statusEl.textContent='WebM verificado: '+blob.size+' bytes · SHA-256 '+hash.slice(0,12)+'…';",
    "statusEl.textContent=(extension==='mp4'?'MP4':'WebM fallback')+' verificado: '+blob.size+' bytes · SHA-256 '+hash.slice(0,12)+'…';"
)
replace_once(
    'jarvis-reel-artifact.js',
    '            webmExport: html.includes("new MediaRecorder"),',
    '            videoExport: html.includes("new MediaRecorder"),\n            nativeMp4Preferred: html.indexOf("video/mp4;codecs=avc1.42E01E") >= 0 && html.indexOf("video/mp4;codecs=avc1.42E01E") < html.indexOf("video/webm;codecs=vp9"),\n            webmFallback: html.includes("video/webm;codecs=vp9"),\n            actualRecorderMime: html.includes("recorder.mimeType||mime"),'
)

# --- Bridge: select extension from actual recorder MIME and validate container bytes.
replace_once(
    'jarvis-fs-bridge.js',
    'export const JARVIS_FS_BRIDGE_VERSION =\n    "2.44.0-local-speech-synthesis-v137";',
    'export const JARVIS_FS_BRIDGE_VERSION =\n    "2.45.0-native-mp4-reel-export-v138";'
)
replace_once(
    'jarvis-fs-bridge.js',
    'export async function exportReelWebmWithChrome({',
    '''export function reelVideoFormatFromMime(mimeType = "") {
    const family = String(mimeType || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
    if (family === "video/mp4") return "mp4";
    if (family === "video/webm") return "webm";
    throw new Error("REEL_VIDEO_MIME_UNSUPPORTED");
}

export function reelVideoExtensionFromMime(mimeType = "") {
    return `.${reelVideoFormatFromMime(mimeType)}`;
}

export function assertReelVideoContainer(buffer, mimeType = "") {
    if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
        throw new Error("REEL_VIDEO_CONTAINER_TOO_SMALL");
    }
    const format = reelVideoFormatFromMime(mimeType);
    if (format === "mp4") {
        if (buffer.length < 12 || buffer.toString("ascii", 4, 8) !== "ftyp") {
            throw new Error("REEL_MP4_SIGNATURE_INVALID");
        }
    }
    else {
        const webmMagic = [0x1a, 0x45, 0xdf, 0xa3];
        if (!webmMagic.every((value, index) => buffer[index] === value)) {
            throw new Error("REEL_WEBM_SIGNATURE_INVALID");
        }
    }
    return { ok: true, format, extension: `.${format}` };
}

export function reelVideoOutputTarget(output = "", mimeType = "", root = DEFAULT_ROOT) {
    const extension = reelVideoExtensionFromMime(mimeType);
    const requested = String(output || "").trim().replaceAll("\\\\", "/");
    let stem = `.jarvis-artifacts/reels/reel-${Date.now()}`;
    if (
        requested.startsWith(".jarvis-artifacts/") &&
        !requested.includes("../") &&
        (/\\.(?:mp4|webm)$/i.test(requested) || !path.posix.extname(requested))
    ) {
        stem = requested.replace(/\\.(?:mp4|webm)$/i, "");
    }
    const relativeOutput = `${stem}${extension}`;
    return {
        relativeOutput,
        target: artifactPath(relativeOutput, root, [extension]),
        extension,
        format: extension.slice(1)
    };
}

export async function exportReelVideoWithChrome({'''
)
replace_once(
    'jarvis-fs-bridge.js',
    '''    const requestedOutput = String(output || "").trim().replaceAll("\\\\", "/");
    const normalizedOutput =
        requestedOutput.startsWith(".jarvis-artifacts/") && requestedOutput.toLowerCase().endsWith(".webm")
            ? requestedOutput
            : `.jarvis-artifacts/reels/reel-${Date.now()}.webm`;
    const videoTarget = artifactPath(normalizedOutput, root, [".webm"]);
    fs.mkdirSync(path.dirname(videoTarget), { recursive: true });

    const profileDir =''',
    '''    const requestedOutput = String(output || "").trim().replaceAll("\\\\", "/");
    let videoTarget = "";
    let relativeOutput = "";

    const profileDir ='''
)
replace_once(
    'jarvis-fs-bridge.js',
    '''        if (buffer.length < 1000 || buffer.length !== Number(payload.bytes || 0)) {
            throw new Error("REEL_WEBM_BYTE_COUNT_INVALID");
        }
        const sha256 = createHash("sha256").update(buffer).digest("hex");
        if (sha256 !== String(payload.sha256 || "").toLowerCase()) {
            throw new Error("REEL_WEBM_SHA256_MISMATCH");
        }
        fs.writeFileSync(videoTarget, buffer);
        if (!fs.existsSync(videoTarget) || fs.statSync(videoTarget).size !== buffer.length) {
            throw new Error("REEL_WEBM_WRITE_VERIFY_FAILED");
        }
        const relativeOutput = path.relative(path.resolve(root), videoTarget).replaceAll("\\\\", "/");''',
    '''        if (buffer.length < 1000 || buffer.length !== Number(payload.bytes || 0)) {
            throw new Error("REEL_VIDEO_BYTE_COUNT_INVALID");
        }
        const actualMimeType = String(payload.mimeType || "").trim();
        const container = assertReelVideoContainer(buffer, actualMimeType);
        const sha256 = createHash("sha256").update(buffer).digest("hex");
        if (sha256 !== String(payload.sha256 || "").toLowerCase()) {
            throw new Error("REEL_VIDEO_SHA256_MISMATCH");
        }
        const outputTarget = reelVideoOutputTarget(requestedOutput, actualMimeType, root);
        videoTarget = outputTarget.target;
        relativeOutput = outputTarget.relativeOutput;
        fs.mkdirSync(path.dirname(videoTarget), { recursive: true });
        fs.writeFileSync(videoTarget, buffer);
        if (!fs.existsSync(videoTarget) || fs.statSync(videoTarget).size !== buffer.length) {
            throw new Error("REEL_VIDEO_WRITE_VERIFY_FAILED");
        }
        if (path.extname(videoTarget).toLowerCase() !== container.extension) {
            throw new Error("REEL_VIDEO_EXTENSION_MISMATCH");
        }'''
)
replace_once(
    'jarvis-fs-bridge.js',
    '                mimeType: payload.mimeType || "video/webm",',
    '                mimeType: actualMimeType,\n                container: container.format,\n                formatFallback: container.format !== "mp4",'
)
replace_once(
    'jarvis-fs-bridge.js',
    '            mimeType: payload.mimeType || "video/webm",',
    '            mimeType: actualMimeType,\n            container: container.format,\n            formatFallback: container.format !== "mp4",'
)
replace_once(
    'jarvis-fs-bridge.js',
    '        try { fs.rmSync(videoTarget, { force: true }); } catch {}',
    '        try { if (videoTarget) fs.rmSync(videoTarget, { force: true }); } catch {}'
)
replace_once(
    'jarvis-fs-bridge.js',
    'const videoExport = await exportReelWebmWithChrome({',
    'const videoExport = await exportReelVideoWithChrome({' 
)
replace_once(
    'jarvis-fs-bridge.js',
    '''                String(req.body?.videoOutput || "").trim().replaceAll("\\\\", "/") ||
                (requestedOutput.toLowerCase().endsWith(".webm") ? requestedOutput : "");''',
    '''                String(req.body?.videoOutput || "").trim().replaceAll("\\\\", "/") ||
                (/\\.(?:mp4|webm)$/i.test(requestedOutput) ? requestedOutput : "");'''
)
replace_once(
    'jarvis-fs-bridge.js',
    '                    `.jarvis-artifacts/reels/${slug}-${Date.now()}.webm`,',
    '                    `.jarvis-artifacts/reels/${slug}-${Date.now()}`,'
)

# Accurate tool wording + browser cache-buster.
replace_once(
    'gestia-core/jarvis/jarvis.actuator.pack.js',
    'description: "Crea un reel 9:16 local, genera su estudio editable y exporta automáticamente un WebM físico verificado por SHA-256. Mezcla audioOutput explícito o el WAV verificado producido por speech.synthesize en la misma misión. No publica.",',
    'description: "Crea un reel 9:16 local, genera su estudio editable y exporta automáticamente MP4 H.264/AAC cuando Chrome lo soporta, con WebM como fallback verificado. Mezcla audioOutput explícito o el WAV verificado producido por speech.synthesize en la misma misión. No publica.",'
)
replace_once(
    'gestia-core/tools.runtime.js',
    './jarvis/jarvis.actuator.pack.js?v=v137-local-speech-synthesis-20260812',
    './jarvis/jarvis.actuator.pack.js?v=v138-native-mp4-reel-export-20260812'
)

# Existing contracts move from WebM-only wording to format-coherent video export.
replace_once(
    'tests/jarvis-reel-artifact.test.mjs',
    'test("reel studio creates a configurable 9:16 WebM production artifact", () => {',
    'test("reel studio creates a configurable 9:16 MP4-preferred production artifact", () => {'
)
replace_once(
    'tests/jarvis-reel-artifact.test.mjs',
    "    assert.match(html, /jarvis-reel-'\\+spec\\.durationSeconds\\+'s\\.webm/);",
    "    assert.match(html, /fileName:'jarvis-reel-'\\+spec\\.durationSeconds\\+'s\\.'\\+extension/);"
)
replace_once(
    'tests/jarvis-reel-artifact.test.mjs',
    '    assert.match(bridge, /exportReelWebmWithChrome/);\n    assert.match(bridge, /REEL_WEBM_SHA256_MISMATCH/);',
    '    assert.match(bridge, /exportReelVideoWithChrome/);\n    assert.match(bridge, /REEL_VIDEO_SHA256_MISMATCH/);\n    assert.match(bridge, /REEL_MP4_SIGNATURE_INVALID/);\n    assert.match(bridge, /REEL_WEBM_SIGNATURE_INVALID/);'
)
replace_once(
    'tests/jarvis-fs-bridge-v2.test.mjs',
    '    assert.equal(description.version, "2.44.0-local-speech-synthesis-v137");',
    '    assert.equal(description.version, "2.45.0-native-mp4-reel-export-v138");'
)

print('v138 native MP4 reel export patch applied')
