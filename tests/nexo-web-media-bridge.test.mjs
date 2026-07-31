import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
    collectNexoRealWebMedia,
    __test
} from "../nexo-web-media-bridge.js";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const mp4 = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from("ftypisom0000isom", "ascii")
]);

function temporaryRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "nexo-real-media-"));
}

async function startFixture() {
    const server = http.createServer((req, res) => {
        if (req.url === "/photo.jpg") {
            res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": jpeg.length });
            return res.end(jpeg);
        }
        if (req.url === "/clip.mp4") {
            res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": mp4.length });
            return res.end(mp4);
        }
        const includeVideo = req.url !== "/image-only";
        const html = [
            "<!doctype html><html><head>",
            '<meta property="og:image" content="/photo.jpg">',
            includeVideo ? '<meta property="og:video" content="/clip.mp4">' : "",
            "</head><body>",
            '<img src="/photo.jpg" alt="Trabajo real">',
            includeVideo ? '<video controls><source src="/clip.mp4" type="video/mp4"></video>' : "",
            "</body></html>"
        ].join("");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(html);
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    return {
        server,
        baseUrl: `http://127.0.0.1:${address.port}`
    };
}

test("collector persists verified real JPEG and MP4 bytes with SHA-256", async t => {
    const fixture = await startFixture();
    t.after(() => fixture.server.close());
    const root = temporaryRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const result = await collectNexoRealWebMedia({
        url: fixture.baseUrl,
        requireImages: true,
        requireVideos: true,
        root,
        allowPrivateHostsForTesting: true
    });

    assert.equal(result.ok, true);
    assert.equal(result.requirementsMet, true);
    assert.equal(result.counts.images >= 1, true);
    assert.equal(result.counts.videos >= 1, true);
    assert.equal(result.mediaAssets.every(asset => /^[a-f0-9]{64}$/.test(asset.sha256)), true);
    assert.equal(result.mediaAssets.every(asset => fs.existsSync(path.join(root, asset.output))), true);
    assert.equal(fs.existsSync(path.join(root, result.output)), true);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, result.output), "utf8"));
    assert.equal(manifest.requirementsMet, true);
    assert.equal(manifest.assets.length, result.mediaAssets.length);
});

test("collector fails closed when a requested real video is absent", async t => {
    const fixture = await startFixture();
    t.after(() => fixture.server.close());
    const root = temporaryRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const result = await collectNexoRealWebMedia({
        url: `${fixture.baseUrl}/image-only`,
        requireImages: true,
        requireVideos: true,
        root,
        allowPrivateHostsForTesting: true
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "WEB_REAL_MEDIA_REQUIREMENTS_UNMET");
    assert.equal(result.counts.images >= 1, true);
    assert.equal(result.counts.videos, 0);
    assert.equal(result.blocked, true);
});

test("collector blocks localhost and private addresses outside explicit test mode", async () => {
    await assert.rejects(
        () => collectNexoRealWebMedia({ url: "http://127.0.0.1:9", root: temporaryRoot() }),
        /WEB_MEDIA_PRIVATE_ADDRESS_BLOCKED/
    );
    assert.equal(__test.isPrivateAddress("127.0.0.1"), true);
    assert.equal(__test.isPrivateAddress("8.8.8.8"), false);
});
