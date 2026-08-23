import fs from "node:fs/promises";

const paths = {
    bridge: "jarvis-fs-bridge.js",
    reelTest: "tests/jarvis-reel-native-mp4-v138.test.mjs",
    orchestrator: "gestia-core/jarvis/jarvis.mission.orchestrator.js"
};

async function read(file) {
    return (await fs.readFile(file, "utf8")).replace(/\r\n/g, "\n");
}

async function write(file, source) {
    await fs.writeFile(file, source, "utf8");
}

function replaceOnce(source, before, after, label) {
    if (source.includes(after)) return source;
    const count = source.split(before).length - 1;
    if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
    return source.replace(before, after);
}

function appendOnce(source, marker, addition) {
    if (source.includes(marker)) return source;
    return `${source.trimEnd()}\n\n${addition.trim()}\n`;
}

let bridge = await read(paths.bridge);

for (const marker of [
    "2.46.0-reel-export-completion-v142",
    "detached_contract_head",
    "requestedSpeechOutput",
    "REEL_EXPORT_COMPLETION_TIMEOUT"
]) {
    if (!bridge.includes(marker)) {
        throw new Error(`V142_BASELINE_REQUIRED:${marker}`);
    }
}

bridge = replaceOnce(
    bridge,
`export function createJarvisFsBridgeApp({
    root = DEFAULT_ROOT
} = {}) {`,
`function jarvisTikTokHandleFromUrl(value = "") {
    try {
        const parsed = new URL(String(value || ""));
        if (
            parsed.hostname.toLowerCase() !== "tiktok.com" &&
            !parsed.hostname.toLowerCase().endsWith(".tiktok.com")
        ) {
            return "";
        }
        const segment = parsed.pathname
            .split("/")
            .map(item => {
                try { return decodeURIComponent(item); }
                catch { return item; }
            })
            .find(item => String(item || "").startsWith("@"));
        return String(segment || "").trim().toLowerCase();
    }
    catch {
        return "";
    }
}

export function speechSynthesisRecoveryInputs(input = {}, error = null) {
    const requestedVoice = String(input?.voice || "").trim();
    const requestedLanguage = String(input?.language || "").trim();
    const message = String(error?.message || error || "");
    const recoverableVoiceFailure =
        Boolean(requestedVoice) &&
        (
            /SelectVoice/i.test(message) ||
            /SPEECH_LANGUAGE_VOICE_NOT_FOUND/i.test(message) ||
            /voz coincidente/i.test(message) ||
            /matching voice/i.test(message)
        );

    if (!recoverableVoiceFailure) return [];

    const attempts = [
        {
            ...(input || {}),
            voice: ""
        }
    ];

    if (
        requestedLanguage &&
        /^es(?:-|$)/i.test(requestedLanguage) &&
        requestedLanguage.toLowerCase() !== "es-mx"
    ) {
        attempts.push({
            ...(input || {}),
            voice: "",
            language: "es-MX"
        });
    }

    if (requestedLanguage) {
        attempts.push({
            ...(input || {}),
            voice: "",
            language: ""
        });
    }

    const seen = new Set();
    return attempts.filter(item => {
        const key = JSON.stringify({
            voice: String(item?.voice || ""),
            language: String(item?.language || "")
        });
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export async function tiktokOembedVisualSeed(
    sourceUrl = "",
    {
        timeoutMs = 15000,
        fetchImpl = globalThis.fetch
    } = {}
) {
    const seedUrl = String(sourceUrl || "").trim();
    const expectedHandle = jarvisTikTokHandleFromUrl(seedUrl);
    if (!expectedHandle || typeof fetchImpl !== "function") return [];

    const boundedTimeout = Math.min(
        Math.max(Number(timeoutMs) || 15000, 3000),
        30000
    );
    const oembedUrl =
        "https://www.tiktok.com/oembed?url=" +
        encodeURIComponent(seedUrl);

    const oembedResponse = await fetchImpl(oembedUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 JarvisLocalResearch/1.0",
            Accept: "application/json,*/*;q=0.8"
        },
        redirect: "follow",
        signal: AbortSignal.timeout(boundedTimeout)
    });

    if (!oembedResponse?.ok) return [];
    const payload = await oembedResponse.json();
    const actualHandle = jarvisTikTokHandleFromUrl(
        String(payload?.author_url || "")
    );
    if (!actualHandle || actualHandle !== expectedHandle) return [];

    const thumbnailUrl = String(payload?.thumbnail_url || "").trim();
    if (!/^https?:\/\//i.test(thumbnailUrl)) return [];

    const thumbnailResponse = await fetchImpl(thumbnailUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 JarvisLocalResearch/1.0",
            Accept: "image/*,*/*;q=0.8",
            Referer: seedUrl
        },
        redirect: "follow",
        signal: AbortSignal.timeout(boundedTimeout)
    });

    if (!thumbnailResponse?.ok) return [];
    const mimeType = String(
        thumbnailResponse.headers?.get?.("content-type") || ""
    )
        .split(";")[0]
        .trim()
        .toLowerCase();
    if (!mimeType.startsWith("image/")) return [];

    const bytes = Buffer.from(await thumbnailResponse.arrayBuffer());
    if (bytes.length < 20000 || bytes.length > 12 * 1024 * 1024) {
        return [];
    }

    return [
        {
            kind: "image",
            url: String(thumbnailResponse.url || thumbnailUrl),
            mimeType,
            observedMimeType: mimeType,
            resourceType: "Image",
            declaredBytes: bytes.length,
            bodyCaptured: true,
            bodyBytes: bytes.length,
            bodyBase64: bytes.toString("base64"),
            sourcePageUrl: seedUrl,
            sourceTag: "tiktok-oembed-thumbnail",
            alt: String(payload?.title || "").slice(0, 300)
        }
    ];
}

export function createJarvisFsBridgeApp({
    root = DEFAULT_ROOT
} = {}) {`,
    "V142_EXISTING_BRIDGE_RECOVERY_HELPERS"
);

bridge = replaceOnce(
    bridge,
`        return next();
    });

    registerNexoWebMediaRoutes(app, { root });`,
`        return next();
    });

    app.use("/web/media/collect", async (req, res, next) => {
        if (req.method !== "POST") return next();
        const body = req.body || {};
        if (
            Array.isArray(body.discoveredMedia) &&
            body.discoveredMedia.length > 0
        ) {
            return next();
        }
        try {
            const discoveredMedia = await tiktokOembedVisualSeed(
                body.url,
                {
                    timeoutMs:
                        Math.min(
                            Math.max(Number(body.timeoutMs) || 15000, 3000),
                            30000
                        )
                }
            );
            if (discoveredMedia.length > 0) {
                req.body = {
                    ...body,
                    discoveredMedia
                };
            }
        }
        catch {
            // Keep the existing static/CDP collector as the fallback.
        }
        return next();
    });

    registerNexoWebMediaRoutes(app, { root });`,
    "V142_TIKTOK_OEMBED_EXISTING_MEDIA_ROUTE"
);

bridge = replaceOnce(
    bridge,
`            const speech = synthesizeSpeechArtifact({
                ...(req.body || {}),
                output: speechOutput,
                root
            });
            const artifact = registerArtifact({`,
`            const speechInput = {
                ...(req.body || {}),
                output: speechOutput,
                root
            };
            let speech;
            let speechRecovery = null;
            try {
                speech = synthesizeSpeechArtifact(speechInput);
            }
            catch (initialSpeechError) {
                const recoveryInputs =
                    speechSynthesisRecoveryInputs(
                        speechInput,
                        initialSpeechError
                    );
                let lastSpeechError = initialSpeechError;
                for (const recoveryInput of recoveryInputs) {
                    try {
                        speech =
                            synthesizeSpeechArtifact(
                                recoveryInput
                            );
                        speechRecovery = {
                            recovered: true,
                            requestedVoice:
                                String(req.body?.voice || "") ||
                                null,
                            requestedLanguage:
                                String(req.body?.language || "") ||
                                null,
                            fallbackVoice:
                                String(recoveryInput?.voice || "") ||
                                null,
                            fallbackLanguage:
                                String(recoveryInput?.language || "") ||
                                null
                        };
                        break;
                    }
                    catch (recoveryError) {
                        lastSpeechError = recoveryError;
                    }
                }
                if (!speech) throw lastSpeechError;
            }
            const artifact = registerArtifact({`,
    "V142_EXISTING_SPEECH_VOICE_RECOVERY"
);

bridge = replaceOnce(
    bridge,
`            return res.json({
                ...speech,
                artifact,
                version: JARVIS_FS_BRIDGE_VERSION
            });`,
`            return res.json({
                ...speech,
                ...(speechRecovery ? { speechRecovery } : {}),
                artifact,
                version: JARVIS_FS_BRIDGE_VERSION
            });`,
    "V142_SPEECH_RECOVERY_RECEIPT"
);

await write(paths.bridge, bridge);

let reelTest = await read(paths.reelTest);

reelTest = replaceOnce(
    reelTest,
`    assertReelVideoContainer,
    createJarvisFsBridgeApp,
    reelVideoExtensionFromMime,`,
`    assertReelVideoContainer,
    createJarvisFsBridgeApp,
    speechSynthesisRecoveryInputs,
    tiktokOembedVisualSeed,
    reelVideoExtensionFromMime,`,
    "V142_RECOVERY_TEST_IMPORTS"
);

reelTest = appendOnce(
    reelTest,
    "V142 reuses installed speech capability when semantic voice is unavailable",
`test("V142 reuses installed speech capability when semantic voice is unavailable", () => {
  const attempts = speechSynthesisRecoveryInputs(
    {
      text: "Narracion",
      voice: "Voz que no existe",
      language: "es-ES"
    },
    new Error("SelectVoice: No se puede establecer voz. No hay una voz coincidente instalada.")
  );
  assert.deepEqual(
    attempts.map(item => ({
      voice: item.voice,
      language: item.language
    })),
    [
      { voice: "", language: "es-ES" },
      { voice: "", language: "es-MX" },
      { voice: "", language: "" }
    ]
  );
  assert.equal(
    speechSynthesisRecoveryInputs(
      { text: "Narracion", voice: "Voz que no existe", language: "es-MX" },
      new Error("SPEECH_OUTPUT_PATH_INVALID")
    ).length,
    0
  );
});`
);

reelTest = appendOnce(
    reelTest,
    "V142 reuses verified TikTok oEmbed thumbnail as input to the existing media collector",
`test("V142 reuses verified TikTok oEmbed thumbnail as input to the existing media collector", async () => {
  const seedUrl = "https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004";
  const jpeg = Buffer.alloc(22000);
  jpeg[0] = 0xff;
  jpeg[1] = 0xd8;
  jpeg[2] = 0xff;
  const calls = [];
  const fakeFetch = async url => {
    calls.push(String(url));
    if (String(url).startsWith("https://www.tiktok.com/oembed?")) {
      return {
        ok: true,
        status: 200,
        url: String(url),
        async json() {
          return {
            title: "El Taco Macho",
            author_name: "Taqueria ElDorado",
            author_url: "https://www.tiktok.com/@taqueria.eldorado",
            thumbnail_url: "https://1.1.1.1/taco-macho.jpg"
          };
        }
      };
    }
    return {
      ok: true,
      status: 200,
      url: String(url),
      headers: {
        get(name) {
          return String(name).toLowerCase() === "content-type"
            ? "image/jpeg"
            : null;
        }
      },
      async arrayBuffer() {
        return jpeg.buffer.slice(
          jpeg.byteOffset,
          jpeg.byteOffset + jpeg.byteLength
        );
      }
    };
  };

  const discovered = await tiktokOembedVisualSeed(
    seedUrl,
    {
      timeoutMs: 5000,
      fetchImpl: fakeFetch
    }
  );
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].kind, "image");
  assert.equal(discovered[0].resourceType, "Image");
  assert.equal(discovered[0].bodyCaptured, true);
  assert.equal(discovered[0].bodyBytes, jpeg.length);
  assert.equal(
    Buffer.from(discovered[0].bodyBase64, "base64").length,
    jpeg.length
  );
  assert.equal(discovered[0].sourcePageUrl, seedUrl);
  assert.equal(calls.length, 2);

  const rejected = await tiktokOembedVisualSeed(
    seedUrl,
    {
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return {
            author_url: "https://www.tiktok.com/@otra.cuenta",
            thumbnail_url: "https://1.1.1.1/otra.jpg"
          };
        }
      })
    }
  );
  assert.equal(rejected.length, 0);
});`
);

await write(paths.reelTest, reelTest);

const orchestrator = await read(paths.orchestrator);
for (const marker of [
    "verifiedSpeechArtifactForReel",
    "archiveRecoveredToolAttempts"
]) {
    if (!orchestrator.includes(marker)) {
        throw new Error(`V142_ORCHESTRATOR_BASELINE_REQUIRED:${marker}`);
    }
}

console.log("V142_REEL_CLOSEOUT_APPLIED=true");
