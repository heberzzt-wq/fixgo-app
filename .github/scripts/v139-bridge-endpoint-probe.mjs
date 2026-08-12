const base = 'http://127.0.0.1:3344';

async function call(path, payload) {
    const response = await fetch(base + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const text = await response.text();
    console.log('V139_HTTP', JSON.stringify({
        path,
        status: response.status,
        contentType: response.headers.get('content-type'),
        body: text.slice(0, 12000)
    }));
    try {
        return JSON.parse(text);
    }
    catch {
        throw new Error(`NON_JSON:${path}:${response.status}:${text.slice(0, 300)}`);
    }
}

const speech = await call('/speech/synthesize', {
    text: 'Prueba de narración ADJUNTO v139',
    output: '.jarvis-artifacts/audio/v139-direct.wav'
});
console.log('V139_SPEECH_ENVELOPE', JSON.stringify({
    ok: speech.ok,
    status: speech.status,
    error: speech.error,
    output: speech.output,
    mimeType: speech.mimeType,
    bytes: speech.bytes,
    sha256: speech.sha256
}));

const media = await call('/web/media/collect', {
    url: 'https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004',
    requireAnyVisual: true,
    maxImages: 8,
    maxVideos: 4,
    timeoutMs: 45000
});
console.log('V139_MEDIA_ENVELOPE', JSON.stringify({
    ok: media.ok,
    status: media.status,
    error: media.error,
    discoveryMode: media.discoveryMode,
    requirementsMet: media.requirementsMet,
    counts: media.counts,
    assets: (media.mediaAssets || []).slice(0, 4).map(item => ({
        kind: item.kind,
        output: item.output,
        mimeType: item.mimeType,
        bytes: item.bytes,
        sha256: item.sha256,
        sourceUrl: item.sourceUrl,
        sourceTag: item.sourceTag
    }))
}));
