/* =========================================================
   JARVIS V7 VOICE RUNTIME
   Natural browser voice selection, pacing and interruption control.
   V7 is the Jarvis product codename, not a semantic version number.
========================================================= */

const VOICE_RUNTIME_VERSION = "1.0.0-natural-voice";

const DEFAULT_PROFILE = Object.freeze({
    lang: "es-MX",
    rate: 1.02,
    pitch: 0.96,
    volume: 1,
    preferredNameHints: [
        "natural",
        "neural",
        "premium",
        "microsoft jorge",
        "microsoft dalia",
        "google español",
        "google spanish"
    ]
});

function normalize(value = "") {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function scoreVoice(voice, profile) {
    const name = normalize(voice?.name);
    const lang = normalize(voice?.lang);
    const requestedLang = normalize(profile.lang);
    let score = 0;

    if (lang === requestedLang) score += 100;
    else if (lang.startsWith("es")) score += 70;

    for (const hint of profile.preferredNameHints || []) {
        if (name.includes(normalize(hint))) score += 15;
    }

    if (voice?.localService) score += 3;
    if (voice?.default) score += 2;
    return score;
}

function splitSpeech(text = "", maximum = 220) {
    const source = String(text || "").replace(/\s+/g, " ").trim();
    if (!source) return [];
    if (source.length <= maximum) return [source];

    const sentences = source.match(/[^.!?¡¿]+[.!?]?/g) || [source];
    const chunks = [];
    let current = "";

    for (const sentence of sentences) {
        const next = `${current} ${sentence}`.trim();
        if (next.length <= maximum) {
            current = next;
            continue;
        }
        if (current) chunks.push(current);
        current = sentence.trim();
    }
    if (current) chunks.push(current);
    return chunks;
}

export function createJarvisVoiceRuntime({
    speechSynthesis = globalThis.speechSynthesis,
    Utterance = globalThis.SpeechSynthesisUtterance,
    profile = {}
} = {}) {
    const config = { ...DEFAULT_PROFILE, ...profile };
    let generation = 0;
    let selectedVoice = null;

    function available() {
        return Boolean(speechSynthesis && Utterance);
    }

    function refreshVoice() {
        if (!available()) return null;
        const voices = speechSynthesis.getVoices?.() || [];
        selectedVoice = voices
            .map(voice => ({ voice, score: scoreVoice(voice, config) }))
            .sort((a, b) => b.score - a.score)[0]?.voice || null;
        return selectedVoice;
    }

    function stop() {
        generation += 1;
        speechSynthesis?.cancel?.();
    }

    async function speak(text, options = {}) {
        if (!available()) {
            return { ok: false, status: "VOICE_API_UNAVAILABLE" };
        }

        const cleanText = String(text || "").trim();
        if (!cleanText) return { ok: false, status: "VOICE_TEXT_REQUIRED" };

        stop();
        const myGeneration = generation;
        const chunks = splitSpeech(cleanText, Number(options.maximumChunkLength || 220));
        const voice = refreshVoice();

        for (const chunk of chunks) {
            if (myGeneration !== generation) {
                return { ok: false, status: "VOICE_INTERRUPTED" };
            }

            await new Promise(resolve => {
                const utterance = new Utterance(chunk);
                utterance.lang = options.lang || config.lang;
                utterance.rate = Number(options.rate || config.rate);
                utterance.pitch = Number(options.pitch || config.pitch);
                utterance.volume = Number(options.volume || config.volume);
                if (voice) utterance.voice = voice;
                utterance.onend = resolve;
                utterance.onerror = resolve;
                speechSynthesis.speak(utterance);
            });
        }

        return {
            ok: true,
            status: "VOICE_COMPLETED",
            voice: selectedVoice?.name || null,
            chunks: chunks.length
        };
    }

    speechSynthesis?.addEventListener?.("voiceschanged", refreshVoice);
    refreshVoice();

    return Object.freeze({
        version: VOICE_RUNTIME_VERSION,
        profile: Object.freeze({ ...config }),
        available,
        refreshVoice,
        speak,
        stop,
        describe() {
            return {
                ok: true,
                runtime: "jarvis_v7_voice",
                version: VOICE_RUNTIME_VERSION,
                available: available(),
                selectedVoice: selectedVoice?.name || null,
                lang: config.lang
            };
        }
    });
}

export const JarvisVoiceRuntimeVersion = VOICE_RUNTIME_VERSION;
