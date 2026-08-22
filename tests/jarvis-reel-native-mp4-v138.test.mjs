import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { buildReelStudioHtml, describeReelStudio } from "../jarvis-reel-artifact.js";
import {
    assertReelVideoContainer,
    reelVideoExtensionFromMime,
    reelVideoFormatFromMime,
    reelVideoOutputTarget
} from "../jarvis-fs-bridge.js";

function input(audioDataUrl = "") {
    return {
        brandName: "Taquería El Dorado",
        title: "Sabor que sí se ve",
        cta: "Visítanos",
        durationSeconds: 30,
        audioDataUrl,
        scenes: [
            { durationSeconds: 10, overlay: "Tacos al momento", subtitle: "Cancún", mediaType: "video", assetDataUrl: "data:video/mp4;base64,AAAA" },
            { durationSeconds: 10, overlay: "Sabor dorado", subtitle: "Hecho para antojar", assetDataUrl: "data:image/jpeg;base64,/9j/" },
            { durationSeconds: 10, overlay: "Ven por los tuyos", subtitle: "Taquería El Dorado", assetDataUrl: "data:image/jpeg;base64,/9j/" }
        ]
    };
}

function mp4Buffer() {
    const buffer = Buffer.alloc(24);
    buffer.writeUInt32BE(24, 0);
    buffer.write("ftyp", 4, "ascii");
    buffer.write("isom", 8, "ascii");
    buffer.write("avc1", 16, "ascii");
    return buffer;
}

function webmBuffer() {
    return Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);
}

test("v138 Reel Studio prefers native H264 AAC MP4 before WebM fallback", () => {
    const html = buildReelStudioHtml(input("data:audio/wav;base64,UklGRg=="));
    const mp4 = html.indexOf("video/mp4;codecs=avc1.42E01E,mp4a.40.2");
    const webm = html.indexOf("video/webm;codecs=vp9");
    assert.ok(mp4 >= 0);
    assert.ok(webm > mp4);
    assert.match(html, /audioRouting\.audioTracksAdded>0/);
    assert.match(html, /recorder\.mimeType\|\|mime/);
    assert.match(html, /extension=actualMime\.startsWith\('video\/mp4'\)\?'mp4':'webm'/);
    assert.match(html, /formatFallback:extension!=='mp4'/);
    const report = describeReelStudio(input("data:audio/wav;base64,UklGRg=="), html);
    assert.equal(report.checks.nativeMp4Preferred, true);
    assert.equal(report.checks.webmFallback, true);
    assert.equal(report.checks.actualRecorderMime, true);
    assert.ok(Object.values(report.checks).every(Boolean));
});

test("v138 silent reel still prefers H264 MP4 and preserves WebM fallback", () => {
    const html = buildReelStudioHtml(input());
    assert.match(html, /mp4Types=audioRouting\.audioTracksAdded>0\?/);
    assert.match(html, /\['video\/mp4;codecs=avc1\.42E01E','video\/mp4'\]/);
    assert.match(html, /fallbackTypes=\['video\/webm;codecs=vp9','video\/webm;codecs=vp8','video\/webm'\]/);
});

test("v138 bridge derives extension only from actual recorder MIME", () => {
    assert.equal(reelVideoFormatFromMime("video/mp4;codecs=avc1.420034,mp4a.40.2"), "mp4");
    assert.equal(reelVideoExtensionFromMime("video/mp4;codecs=avc1.420034"), ".mp4");
    assert.equal(reelVideoFormatFromMime("video/webm;codecs=vp9"), "webm");
    assert.equal(reelVideoExtensionFromMime("video/webm"), ".webm");
    assert.throws(() => reelVideoFormatFromMime("video/quicktime"), /REEL_VIDEO_MIME_UNSUPPORTED/);
});

test("v138 bridge validates physical MP4 and WebM container signatures", () => {
    assert.deepEqual(assertReelVideoContainer(mp4Buffer(), "video/mp4;codecs=avc1.420034"), {
        ok: true,
        format: "mp4",
        extension: ".mp4"
    });
    assert.deepEqual(assertReelVideoContainer(webmBuffer(), "video/webm;codecs=vp9"), {
        ok: true,
        format: "webm",
        extension: ".webm"
    });
    assert.throws(() => assertReelVideoContainer(webmBuffer(), "video/mp4"), /REEL_MP4_SIGNATURE_INVALID/);
    assert.throws(() => assertReelVideoContainer(mp4Buffer(), "video/webm"), /REEL_WEBM_SIGNATURE_INVALID/);
});

test("v138 never writes MP4 bytes under a WebM extension or vice versa", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-v138-output-"));
    try {
        const mp4 = reelVideoOutputTarget(
            ".jarvis-artifacts/reels/social.webm",
            "video/mp4;codecs=avc1.420034,mp4a.40.2",
            root
        );
        assert.equal(mp4.relativeOutput, ".jarvis-artifacts/reels/social.mp4");
        assert.equal(path.extname(mp4.target), ".mp4");
        assert.equal(mp4.format, "mp4");

        const webm = reelVideoOutputTarget(
            ".jarvis-artifacts/reels/social.mp4",
            "video/webm;codecs=vp9",
            root
        );
        assert.equal(webm.relativeOutput, ".jarvis-artifacts/reels/social.webm");
        assert.equal(path.extname(webm.target), ".webm");
        assert.equal(webm.format, "webm");
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("v138 actuator advertises MP4 preference without removing verified WebM fallback", () => {
    const actuator = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url), "utf8");
    const runtime = fs.readFileSync(new URL("../gestia-core/tools.runtime.js", import.meta.url), "utf8");
    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    assert.match(actuator, /MP4 H\.264\/AAC cuando Chrome lo soporta/);
    assert.match(actuator, /WebM como fallback verificado/);
    assert.match(runtime, /v139-transient-resilience-20260813/);
    assert.match(bridge, /exportReelVideoWithChrome/);
    assert.match(bridge, /REEL_VIDEO_SHA256_MISMATCH/);
    assert.doesNotMatch(bridge, /REEL_WEBM_BYTE_COUNT_INVALID/);
});

test("V142 waits for the real browser export completion state", () => {
  const source = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
  assert.match(source, /2\.46\.0-reel-export-completion-v142/);
  assert.doesNotMatch(source, /await sleepMs\(duration \* 1000 \+ 2600\)/);
  assert.match(source, /__JARVIS_REEL_EXPORT_ERROR__/);
  assert.match(source, /REEL_EXPORT_COMPLETION_TIMEOUT/);
  assert.match(source, /setTimeout\(finish, 100\)/);
  assert.match(source, /Math\.max\(45000, duration \* 1000 \+ 30000\)/);
});
