from pathlib import Path

path = Path("tests/nexo-browser-media-fallback-v135.test.mjs")
text = path.read_text(encoding="utf-8")
marker = 'test("v135 captured CDP bytes avoid a second network fetch"'
if marker in text:
    raise SystemExit("v135 captured-body regressions already present")

addition = r'''

test("v135 captured CDP bytes avoid a second network fetch", async t => {
    let requestCount = 0;
    const server = http.createServer((req, res) => {
        requestCount += 1;
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("blocked");
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(() => server.close());
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const root = temporaryRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const capturedJpeg = Buffer.concat([jpeg, Buffer.alloc(25000)]);

    const result = await collectNexoRealWebMedia({
        url: baseUrl,
        discoveredMedia: [{
            kind: "image",
            url: `${baseUrl}/session-only.jpg`,
            mimeType: "image/jpeg",
            resourceType: "Image",
            declaredBytes: capturedJpeg.length,
            bodyCaptured: true,
            bodyBytes: capturedJpeg.length,
            bodyBase64: capturedJpeg.toString("base64")
        }],
        requireImages: true,
        requireAnyVisual: true,
        maxImages: 2,
        root,
        allowPrivateHostsForTesting: true
    });

    assert.equal(result.ok, true);
    assert.equal(result.requirementsMet, true);
    assert.equal(result.counts.images, 1);
    assert.equal(result.mediaAssets[0].bodyCaptured, true);
    assert.equal(result.mediaAssets[0].bytes, capturedJpeg.length);
    assert.equal(requestCount, 0);
});

test("v135 browser-network reel media keeps only the largest primary video when images were not requested", async t => {
    const server = http.createServer((req, res) => {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("should not fetch captured bodies");
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(() => server.close());
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const root = temporaryRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const mp4Header = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x18]),
        Buffer.from("ftypisom", "ascii")
    ]);
    const primary = Buffer.concat([mp4Header, Buffer.alloc(70000)]);
    const generic = Buffer.concat([mp4Header, Buffer.alloc(55000)]);
    const decorativeImage = Buffer.concat([jpeg, Buffer.alloc(90000)]);

    const result = await collectNexoRealWebMedia({
        url: baseUrl,
        discoveredMedia: [
            {
                kind: "video",
                url: `${baseUrl}/primary.mp4`,
                mimeType: "video/mp4",
                resourceType: "Fetch",
                declaredBytes: primary.length,
                bodyCaptured: true,
                bodyBytes: primary.length,
                bodyBase64: primary.toString("base64")
            },
            {
                kind: "video",
                url: `${baseUrl}/playback1.mp4`,
                mimeType: "video/mp4",
                resourceType: "Media",
                declaredBytes: generic.length,
                bodyCaptured: true,
                bodyBytes: generic.length,
                bodyBase64: generic.toString("base64")
            },
            {
                kind: "image",
                url: `${baseUrl}/ui-performance.jpg`,
                mimeType: "image/jpeg",
                resourceType: "Image",
                declaredBytes: decorativeImage.length,
                bodyCaptured: true,
                bodyBytes: decorativeImage.length,
                bodyBase64: decorativeImage.toString("base64")
            }
        ],
        requireAnyVisual: true,
        maxImages: 6,
        maxVideos: 4,
        root,
        allowPrivateHostsForTesting: true
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.counts, { images: 0, videos: 1, total: 1 });
    assert.equal(result.mediaAssets[0].sourceUrl, `${baseUrl}/primary.mp4`);
    assert.equal(result.mediaAssets[0].bodyCaptured, true);
});
'''
path.write_text(text + addition, encoding="utf-8")
print("v135 captured-body regressions appended")
