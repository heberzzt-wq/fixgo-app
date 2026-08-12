import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { lookup } from "node:dns/promises";
import { createHash } from "node:crypto";

import { registerArtifact } from "./jarvis-artifact-studio.js";

export const NEXO_WEB_MEDIA_BRIDGE_VERSION =
    "1.5.0-cdp-response-body-media-v135";

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_MEDIA_BYTES = 120 * 1024 * 1024;
const MAX_REDIRECTS = 5;

const MIME_EXTENSIONS = Object.freeze({
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov"
});

const SOURCE_DECLARED_MEDIA_TAGS = new Set([
    "img",
    "video",
    "video-poster",
    "source",
    "og:image",
    "twitter:image",
    "twitter:image:src",
    "og:video",
    "og:video:url",
    "og:video:secure_url",
    "twitter:player:stream",
    "jsonld:logo",
    "itemprop:logo"
]);

function safeStem(value = "media", maximum = 80) {
    return String(value || "media")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, maximum) || "media";
}

function sha256(bytes) {
    return createHash("sha256")
        .update(bytes)
        .digest("hex");
}

function normalizeHttpUrl(value = "", base = undefined) {
    const url = new URL(String(value || "").trim(), base);
    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("WEB_MEDIA_URL_PROTOCOL_NOT_ALLOWED");
    }
    if (url.username || url.password) {
        throw new Error("WEB_MEDIA_URL_CREDENTIALS_NOT_ALLOWED");
    }
    url.hash = "";
    return url;
}

function isPrivateIpv4(address = "") {
    const parts = address.split(".").map(Number);
    if (parts.length !== 4 || parts.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
        return true;
    }
    const [a, b] = parts;
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 0) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19)) ||
        a >= 224
    );
}

function isPrivateAddress(address = "") {
    const normalized = String(address || "").trim().toLowerCase();
    if (!normalized) return true;
    if (normalized.startsWith("::ffff:")) {
        return isPrivateIpv4(normalized.slice(7));
    }
    const family = net.isIP(normalized);
    if (family === 4) return isPrivateIpv4(normalized);
    if (family !== 6) return true;
    return (
        normalized === "::" ||
        normalized === "::1" ||
        normalized.startsWith("fc") ||
        normalized.startsWith("fd") ||
        /^fe[89ab]/.test(normalized) ||
        normalized.startsWith("ff") ||
        normalized.startsWith("2001:db8:")
    );
}

async function assertPublicUrl(url, { allowPrivateHostsForTesting = false } = {}) {
    const hostname = String(url.hostname || "").toLowerCase();
    if (!hostname) throw new Error("WEB_MEDIA_HOST_REQUIRED");
    if (
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal") ||
        hostname.endsWith(".lan")
    ) {
        if (allowPrivateHostsForTesting) return true;
        throw new Error("WEB_MEDIA_PRIVATE_HOST_BLOCKED");
    }
    if (allowPrivateHostsForTesting) return true;
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!Array.isArray(addresses) || addresses.length === 0) {
        throw new Error("WEB_MEDIA_DNS_EMPTY");
    }
    if (addresses.some(item => isPrivateAddress(item.address))) {
        throw new Error("WEB_MEDIA_PRIVATE_ADDRESS_BLOCKED");
    }
    return true;
}

function hostAllowed(candidate, pageHost, allowedHosts = []) {
    const host = String(candidate || "").toLowerCase();
    const root = String(pageHost || "").toLowerCase();
    const allowed = new Set(
        [root, ...allowedHosts]
            .map(value => String(value || "").trim().toLowerCase())
            .filter(Boolean)
    );
    return [...allowed].some(item => host === item || host.endsWith(`.${item}`));
}

function sourceDeclaredMediaCandidate(candidate = {}) {
    const sourceTag = String(candidate?.sourceTag || "").trim().toLowerCase();
    return SOURCE_DECLARED_MEDIA_TAGS.has(sourceTag);
}

async function fetchBounded(
    inputUrl,
    {
        maxBytes,
        timeoutMs = 30000,
        allowedMimePrefixes = [],
        allowedExactMimes = [],
        allowPrivateHostsForTesting = false
    } = {}
) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 30000));
    let current = normalizeHttpUrl(inputUrl);

    try {
        for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
            await assertPublicUrl(current, { allowPrivateHostsForTesting });
            const response = await fetch(current, {
                method: "GET",
                redirect: "manual",
                signal: controller.signal,
                headers: {
                    "User-Agent": "NEXO-Real-Media/1.0 (+Peninsula-Tech)",
                    "Accept": "text/html,image/*,video/*;q=0.9,*/*;q=0.1"
                }
            });

            if ([301, 302, 303, 307, 308].includes(response.status)) {
                const location = response.headers.get("location");
                if (!location) throw new Error("WEB_MEDIA_REDIRECT_LOCATION_REQUIRED");
                current = normalizeHttpUrl(location, current);
                continue;
            }
            if (!response.ok) {
                throw new Error(`WEB_MEDIA_HTTP_${response.status}`);
            }

            const mimeType = String(response.headers.get("content-type") || "")
                .split(";")[0]
                .trim()
                .toLowerCase();
            const mimeAllowed =
                allowedExactMimes.includes(mimeType) ||
                allowedMimePrefixes.some(prefix => mimeType.startsWith(prefix));
            if (!mimeAllowed) {
                throw new Error(`WEB_MEDIA_MIME_NOT_ALLOWED:${mimeType || "unknown"}`);
            }

            const declaredLength = Number(response.headers.get("content-length") || 0);
            if (declaredLength > maxBytes) {
                throw new Error("WEB_MEDIA_DECLARED_SIZE_EXCEEDED");
            }
            if (!response.body) throw new Error("WEB_MEDIA_BODY_REQUIRED");

            const reader = response.body.getReader();
            const chunks = [];
            let total = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                total += value.byteLength;
                if (total > maxBytes) {
                    controller.abort();
                    throw new Error("WEB_MEDIA_SIZE_EXCEEDED");
                }
                chunks.push(Buffer.from(value));
            }

            return {
                url: current.toString(),
                mimeType,
                bytes: Buffer.concat(chunks, total),
                headers: Object.fromEntries(response.headers.entries())
            };
        }
        throw new Error("WEB_MEDIA_TOO_MANY_REDIRECTS");
    }
    catch(error) {
        if (controller.signal.aborted && error?.name === "AbortError") {
            throw new Error("WEB_MEDIA_FETCH_TIMEOUT");
        }
        throw error;
    }
    finally {
        clearTimeout(timer);
    }
}

function decodeHtml(value = "") {
    return String(value || "")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">");
}

function attributes(tag = "") {
    const result = {};
    const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let match;
    while ((match = pattern.exec(tag))) {
        result[String(match[1] || "").toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
    }
    return result;
}

function bestSrcset(value = "") {
    const candidates = String(value || "")
        .split(",")
        .map(item => item.trim().split(/\s+/)[0])
        .filter(Boolean);
    return candidates.at(-1) || "";
}

function structuredLogoUrls(value, urls = [], depth = 0) {
    if (value === null || value === undefined || depth > 12) return urls;
    if (Array.isArray(value)) {
        for (const item of value) structuredLogoUrls(item, urls, depth + 1);
        return urls;
    }
    if (typeof value !== "object") return urls;
    for (const [key, nested] of Object.entries(value)) {
        if (String(key || "").toLowerCase() === "logo") {
            if (typeof nested === "string") urls.push(nested);
            else if (nested && typeof nested === "object") {
                for (const field of ["url", "contentUrl", "@id"]) {
                    if (typeof nested[field] === "string") urls.push(nested[field]);
                }
                structuredLogoUrls(nested, urls, depth + 1);
            }
            continue;
        }
        structuredLogoUrls(nested, urls, depth + 1);
    }
    return urls;
}

function jsonLdLogoUrls(html = "") {
    const urls = [];
    const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = pattern.exec(String(html || "")))) {
        const attrs = attributes(`<script ${match[1] || ""}>`);
        if (String(attrs.type || "").trim().toLowerCase() !== "application/ld+json") continue;
        const body = decodeHtml(match[2] || "").trim();
        if (!body) continue;
        try { structuredLogoUrls(JSON.parse(body), urls); } catch {}
    }
    return [...new Set(urls.map(value => String(value || "").trim()).filter(Boolean))];
}

function mediaCandidates(html = "", pageUrl = "") {
    const page = normalizeHttpUrl(pageUrl);
    const candidates = [];
    const add = (kind, rawUrl, sourceTag, alt = "", mediaRole = "scene") => {
        const value = String(rawUrl || "").trim();
        if (!value || /^(data|blob|javascript):/i.test(value)) return;
        try {
            const url = normalizeHttpUrl(value, page);
            candidates.push({
                kind,
                url: url.toString(),
                sourceTag,
                alt: String(alt || "").slice(0, 300),
                mediaRole: mediaRole === "brand_logo" ? "brand_logo" : "scene"
            });
        } catch {}
    };

    for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
        const attrs = attributes(tag);
        const itemprop = String(attrs.itemprop || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
        const declaredLogo = itemprop.includes("logo");
        add(
            "image",
            attrs.src || attrs["data-src"] || attrs["data-lazy-src"] || bestSrcset(attrs.srcset),
            declaredLogo ? "itemprop:logo" : "img",
            attrs.alt,
            declaredLogo ? "brand_logo" : "scene"
        );
    }
    for (const tag of html.match(/<video\b[^>]*>/gi) || []) {
        const attrs = attributes(tag);
        add("video", attrs.src, "video", attrs.title);
        add("image", attrs.poster, "video-poster", attrs.title);
    }
    for (const tag of html.match(/<source\b[^>]*>/gi) || []) {
        const attrs = attributes(tag);
        if (String(attrs.type || "").toLowerCase().startsWith("video/") || /\.(mp4|webm|mov)(?:$|[?#])/i.test(attrs.src || "")) {
            add("video", attrs.src, "source", attrs.title);
        }
    }
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
        const attrs = attributes(tag);
        const key = String(attrs.property || attrs.name || "").toLowerCase();
        if (["og:image", "twitter:image", "twitter:image:src"].includes(key)) {
            add("image", attrs.content, key);
        }
        if (["og:video", "og:video:url", "og:video:secure_url", "twitter:player:stream"].includes(key)) {
            add("video", attrs.content, key);
        }
    }
    for (const logoUrl of jsonLdLogoUrls(html)) {
        add("image", logoUrl, "jsonld:logo", "", "brand_logo");
    }

    const deduped = new Map();
    for (const item of candidates) {
        const key = `${item.kind}:${item.url}`;
        const previous = deduped.get(key);
        if (!previous || (previous.mediaRole !== "brand_logo" && item.mediaRole === "brand_logo")) {
            deduped.set(key, item);
        }
    }
    return [...deduped.values()];
}

function detectedMime(bytes, declared = "") {
    const ascii = bytes.subarray(0, 32).toString("latin1");
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return "image/gif";
    if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
    if (ascii.slice(4, 8) === "ftyp") return declared === "video/quicktime" ? "video/quicktime" : "video/mp4";
    if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
    if (declared === "image/svg+xml" && bytes.subarray(0, 2048).toString("utf8").toLowerCase().includes("<svg")) return declared;
    return "";
}

function chooseOutputName(candidate, mimeType, index) {
    const sourcePath = new URL(candidate.url).pathname;
    const sourceStem = safeStem(path.basename(sourcePath, path.extname(sourcePath)) || `${candidate.kind}-${index + 1}`, 60);
    const extension = MIME_EXTENSIONS[mimeType];
    return `${String(index + 1).padStart(2, "0")}-${sourceStem}${extension}`;
}

export async function collectNexoRealWebMedia({
    url = "",
    requireImages = false,
    requireVideos = false,
    requireAnyVisual = false,
    maxImages = 12,
    maxVideos = 4,
    allowedHosts = [],
    discoveredMedia = [],
    timeoutMs = 30000,
    root = process.cwd(),
    allowPrivateHostsForTesting = false
} = {}) {
    const page = normalizeHttpUrl(url);
    let finalPageUrl = page.toString();
    let discoveryMode = "html_static";
    const networkCandidates = (Array.isArray(discoveredMedia) ? discoveredMedia : [])
        .map(item => {
            if (!item || typeof item !== "object") return null;
            const mimeType = String(item.mimeType || "").trim().toLowerCase();
            const declaredKind = String(item.kind || "").trim().toLowerCase();
            const kind = ["image", "video"].includes(declaredKind)
                ? declaredKind
                : mimeType.startsWith("image/")
                    ? "image"
                    : mimeType.startsWith("video/")
                        ? "video"
                        : "";
            if (!kind) return null;
            try {
                const candidateUrl = normalizeHttpUrl(item.url);
                return {
                    kind,
                    url: candidateUrl.toString(),
                    sourceTag: "browser-network",
                    alt: String(item.alt || "").slice(0, 300),
                    mediaRole: "scene",
                    networkObserved: true,
                    sourcePageUrl: String(item.sourcePageUrl || page.toString()),
                    declaredBytes: Math.max(0, Number(item.declaredBytes || 0)),
                    resourceType: String(item.resourceType || ""),
                    observedMimeType: mimeType,
                    bodyCaptured: item.bodyCaptured === true,
                    bodyBytes: Math.max(0, Number(item.bodyBytes || 0)),
                    bodyBase64: item.bodyCaptured === true
                        ? String(item.bodyBase64 || "")
                        : "",
                    bodyCaptureError: String(item.bodyCaptureError || "")
                };
            } catch {
                return null;
            }
        })
        .filter(Boolean);

    let discovered;
    if (networkCandidates.length > 0) {
        discoveryMode = "browser_network";
        discovered = networkCandidates;
    }
    else {
        const pageResponse = await fetchBounded(page, {
            maxBytes: MAX_HTML_BYTES,
            timeoutMs,
            allowedExactMimes: ["text/html", "application/xhtml+xml"],
            allowPrivateHostsForTesting
        });
        finalPageUrl = pageResponse.url;
        const html = pageResponse.bytes.toString("utf8");
        discovered = mediaCandidates(html, pageResponse.url)
            .filter(item => {
                const mediaHost = new URL(item.url).hostname;
                return (
                    hostAllowed(mediaHost, page.hostname, allowedHosts) ||
                    sourceDeclaredMediaCandidate(item)
                );
            });
    }
    const limits = {
        image: Math.max(0, Math.min(30, Number(maxImages) || 0)),
        video: Math.max(0, Math.min(10, Number(maxVideos) || 0))
    };
    const selected = [];
    const browserPrimaryVideoAvailable =
        discoveryMode === "browser_network" &&
        discovered.some(item =>
            item.kind === "video" &&
            (
                item.bodyCaptured === true ||
                Number(item.declaredBytes || 0) >= 50000
            )
        );
    for (const kind of ["image", "video"]) {
        let available = discovered.filter(item => item.kind === kind);
        if (discoveryMode === "browser_network") {
            available = available.filter(item => {
                const effectiveBytes = Math.max(
                    Number(item.bodyBytes || 0),
                    Number(item.declaredBytes || 0)
                );
                if (kind === "video") return effectiveBytes >= 50000;
                return effectiveBytes >= 20000 &&
                    String(item.resourceType || "").toLowerCase() === "image";
            });
        }
        const ordered = available.some(item => item.networkObserved === true)
            ? [...available].sort((left, right) =>
                Math.max(Number(right.bodyBytes || 0), Number(right.declaredBytes || 0)) -
                Math.max(Number(left.bodyBytes || 0), Number(left.declaredBytes || 0))
            )
            : kind === "image"
                ? [
                    ...available.filter(item => item.mediaRole === "brand_logo"),
                    ...available.filter(item => item.mediaRole !== "brand_logo")
                ]
                : available;
        let effectiveLimit = limits[kind];
        if (
            discoveryMode === "browser_network" &&
            kind === "image" &&
            browserPrimaryVideoAvailable &&
            requireImages !== true
        ) {
            effectiveLimit = 0;
        }
        if (
            discoveryMode === "browser_network" &&
            kind === "video" &&
            browserPrimaryVideoAvailable
        ) {
            effectiveLimit = Math.min(effectiveLimit, 1);
        }
        selected.push(...ordered.slice(0, effectiveLimit));
    }

    const batchDirectory = path.resolve(
        root,
        ".jarvis-artifacts/web-media",
        safeStem(page.hostname),
        String(Date.now())
    );
    fs.mkdirSync(batchDirectory, { recursive: true });

    const assets = [];
    const skipped = [];
    let totalBytes = 0;
    for (const candidate of selected) {
        try {
            let fetched;
            if (candidate.bodyCaptured === true && candidate.bodyBase64) {
                const candidateUrl = normalizeHttpUrl(candidate.url);
                await assertPublicUrl(candidateUrl, { allowPrivateHostsForTesting });
                const maximum = candidate.kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
                const bytes = Buffer.from(candidate.bodyBase64, "base64");
                if (
                    bytes.length < 1 ||
                    bytes.length > maximum ||
                    (Number(candidate.bodyBytes || 0) > 0 && bytes.length !== Number(candidate.bodyBytes))
                ) {
                    throw new Error("WEB_MEDIA_CAPTURED_BODY_SIZE_INVALID");
                }
                const observedMimeType = String(candidate.observedMimeType || "").toLowerCase();
                if (!observedMimeType.startsWith(`${candidate.kind}/`)) {
                    throw new Error("WEB_MEDIA_CAPTURED_BODY_MIME_INVALID");
                }
                fetched = {
                    url: candidateUrl.toString(),
                    mimeType: observedMimeType,
                    bytes,
                    headers: {}
                };
            }
            else {
                fetched = await fetchBounded(candidate.url, {
                    maxBytes: candidate.kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES,
                    timeoutMs,
                    allowedMimePrefixes: [candidate.kind === "video" ? "video/" : "image/"],
                    allowPrivateHostsForTesting
                });
            }
            const actualMimeType = detectedMime(fetched.bytes, fetched.mimeType);
            if (!actualMimeType || !actualMimeType.startsWith(`${candidate.kind}/`) || !MIME_EXTENSIONS[actualMimeType]) {
                throw new Error("WEB_MEDIA_MAGIC_MISMATCH");
            }
            if (totalBytes + fetched.bytes.length > MAX_TOTAL_MEDIA_BYTES) {
                throw new Error("WEB_MEDIA_TOTAL_SIZE_EXCEEDED");
            }
            totalBytes += fetched.bytes.length;
            const name = chooseOutputName(candidate, actualMimeType, assets.length);
            const target = path.join(batchDirectory, name);
            fs.writeFileSync(target, fetched.bytes);
            const output = path.relative(path.resolve(root), target).replaceAll("\\", "/");
            const digest = sha256(fetched.bytes);
            const artifact = registerArtifact({
                root,
                output,
                metadata: {
                    type: candidate.kind,
                    origin: "web.media.collect",
                    provider: "nexo_real_media_collector",
                    mimeType: actualMimeType,
                    status: "WEB_REAL_MEDIA_VERIFIED",
                    approvalRequired: false,
                    approved: true,
                    approvedBy: "OWNER_EXPLICIT_MEDIA_REQUEST",
                    editable: false,
                    preview: true,
                    downloadable: true,
                    publishable: false,
                    originalFile: fetched.url,
                    transformations: [{
                        type: candidate.bodyCaptured === true
                            ? "browser_network_response_body"
                            : "verbatim_download",
                        sha256: digest,
                        sourceDeclared: sourceDeclaredMediaCandidate(candidate),
                        networkObserved: candidate.networkObserved === true,
                        sourcePageUrl: candidate.sourcePageUrl || page.toString(),
                        mediaRole: candidate.mediaRole || "scene"
                    }]
                }
            });
            assets.push({
                kind: candidate.kind,
                sourceUrl: fetched.url,
                sourceTag: candidate.sourceTag,
                sourceDeclared: sourceDeclaredMediaCandidate(candidate),
                networkObserved: candidate.networkObserved === true,
                bodyCaptured: candidate.bodyCaptured === true,
                sourcePageUrl: candidate.sourcePageUrl || page.toString(),
                mediaRole: candidate.mediaRole || "scene",
                alt: candidate.alt,
                output,
                mimeType: actualMimeType,
                bytes: fetched.bytes.length,
                sha256: digest,
                artifactId: artifact?.artifactId || artifact?.id || null
            });
        } catch(error) {
            skipped.push({
                kind: candidate.kind,
                sourceUrl: candidate.url,
                sourceTag: candidate.sourceTag,
                sourceDeclared: sourceDeclaredMediaCandidate(candidate),
                networkObserved: candidate.networkObserved === true,
                bodyCaptured: candidate.bodyCaptured === true,
                sourcePageUrl: candidate.sourcePageUrl || page.toString(),
                mediaRole: candidate.mediaRole || "scene",
                reason: error?.message || String(error)
            });
        }
    }

    const imageCount = assets.filter(item => item.kind === "image").length;
    const videoCount = assets.filter(item => item.kind === "video").length;
    const requirementsMet =
        (!requireImages || imageCount > 0) &&
        (!requireVideos || videoCount > 0) &&
        (!requireAnyVisual || imageCount + videoCount > 0);
    const manifest = {
        engine: "NEXO",
        version: NEXO_WEB_MEDIA_BRIDGE_VERSION,
        sourceUrl: page.toString(),
        finalPageUrl,
        discoveryMode,
        capturedAt: new Date().toISOString(),
        requirements: { requireImages: Boolean(requireImages), requireVideos: Boolean(requireVideos), requireAnyVisual: Boolean(requireAnyVisual) },
        counts: { images: imageCount, videos: videoCount, total: assets.length },
        totalBytes,
        requirementsMet,
        assets,
        skipped
    };
    const manifestTarget = path.join(batchDirectory, "manifest.json");
    fs.writeFileSync(manifestTarget, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const manifestOutput = path.relative(path.resolve(root), manifestTarget).replaceAll("\\", "/");
    registerArtifact({
        root,
        output: manifestOutput,
        metadata: {
            type: "report",
            origin: "web.media.collect",
            provider: "nexo_real_media_collector",
            mimeType: "application/json",
            status: requirementsMet ? "WEB_REAL_MEDIA_COLLECTED" : "WEB_REAL_MEDIA_REQUIREMENTS_UNMET",
            approvalRequired: false,
            approved: true,
            approvedBy: "OWNER_EXPLICIT_MEDIA_REQUEST",
            editable: true,
            preview: true,
            downloadable: true,
            publishable: false,
            originalFile: page.toString()
        }
    });

    return {
        ok: requirementsMet,
        executionOk: true,
        objectiveSatisfied: requirementsMet,
        blocked: !requirementsMet,
        requiresInput: false,
        retryable: false,
        status: requirementsMet ? "WEB_REAL_MEDIA_COLLECTED" : "WEB_REAL_MEDIA_REQUIREMENTS_UNMET",
        sourceUrl: page.toString(),
        finalPageUrl,
        discoveryMode,
        requirementsMet,
        requirements: manifest.requirements,
        counts: manifest.counts,
        totalBytes,
        mediaAssets: assets,
        skipped,
        output: manifestOutput,
        sources: assets.map((asset, index) => ({
            id: index + 1,
            title: `${asset.kind === "image" ? "Imagen" : "Video"} real verificado`,
            url: asset.sourceUrl,
            snippet: `${asset.output} · ${asset.mimeType} · SHA-256 ${asset.sha256}`,
            output: asset.output,
            sha256: asset.sha256,
            mimeType: asset.mimeType,
            kind: asset.kind,
            mediaRole: asset.mediaRole || "scene"
        })),
        version: NEXO_WEB_MEDIA_BRIDGE_VERSION
    };
}

export function registerNexoWebMediaRoutes(app, { root = process.cwd() } = {}) {
    if (!app || typeof app.post !== "function") {
        throw new Error("EXPRESS_APP_REQUIRED");
    }
    app.post("/web/media/collect", async (req, res) => {
        try {
            const result = await collectNexoRealWebMedia({
                ...(req.body || {}),
                root,
                allowPrivateHostsForTesting: false
            });
            return res.status(result.ok ? 200 : 422).json(result);
        } catch(error) {
            const message = error?.message || String(error);
            const clientError =
                message.startsWith("WEB_MEDIA_") ||
                message === "Invalid URL";
            return res.status(clientError ? 400 : 500).json({
                ok: false,
                executionOk: false,
                objectiveSatisfied: false,
                blocked: true,
                requiresInput: false,
                retryable: false,
                status: "WEB_REAL_MEDIA_COLLECTION_FAILED",
                error: message,
                version: NEXO_WEB_MEDIA_BRIDGE_VERSION
            });
        }
    });
    return app;
}

export const __test = {
    safeStem,
    isPrivateAddress,
    hostAllowed,
    sourceDeclaredMediaCandidate,
    structuredLogoUrls,
    jsonLdLogoUrls,
    mediaCandidates,
    detectedMime
};
