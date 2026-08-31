const SHA_PATTERN = /^[0-9a-f]{40}$/;
const MANIFEST_URL = "/release-manifest.json";

let initializationPromise = null;

async function fetchReleaseManifest() {
    const response = await fetch(MANIFEST_URL, {
        cache: "no-store",
        headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`RELEASE_MANIFEST_HTTP_${response.status}`);
    const manifest = await response.json();
    if (!SHA_PATTERN.test(String(manifest?.git_sha || ""))) {
        throw new Error("RELEASE_MANIFEST_SHA_INVALID");
    }
    return Object.freeze(manifest);
}

function queryWorkerIdentity(worker, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        if (!worker) return reject(new Error("RELEASE_SERVICE_WORKER_MISSING"));
        const channel = new MessageChannel();
        const timeout = setTimeout(() => reject(new Error("RELEASE_SERVICE_WORKER_IDENTITY_TIMEOUT")), timeoutMs);
        channel.port1.onmessage = event => {
            clearTimeout(timeout);
            resolve(event.data || {});
        };
        worker.postMessage({ type: "GESTIA_RELEASE_IDENTITY" }, [channel.port2]);
    });
}

function workerMatchesRelease(worker, gitSha) {
    if (!worker?.scriptURL) return false;
    return new URL(worker.scriptURL).searchParams.get("release_sha") === gitSha;
}

async function waitForReleaseWorker(registration, gitSha, timeoutMs = 10000) {
    const find = () => [registration.active, registration.waiting, registration.installing]
        .find(worker => workerMatchesRelease(worker, gitSha));
    const immediate = find();
    if (immediate && immediate.state !== "installing") return immediate;
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("RELEASE_SERVICE_WORKER_ACTIVATION_TIMEOUT")), timeoutMs);
        const inspect = () => {
            const worker = find();
            if (worker && worker.state !== "installing") {
                clearTimeout(timeout);
                resolve(worker);
            }
        };
        registration.addEventListener("updatefound", () => {
            registration.installing?.addEventListener("statechange", inspect);
            inspect();
        });
        immediate?.addEventListener("statechange", inspect);
        inspect();
    });
}

async function initializePlatformRelease() {
    if (initializationPromise) return initializationPromise;
    initializationPromise = (async () => {
        const manifest = await fetchReleaseManifest();
        globalThis.GESTIA_RELEASE = manifest;
        if (!("serviceWorker" in navigator)) {
            return { manifest, registration: null, supported: false };
        }
        const registration = await navigator.serviceWorker.register(
            `/sw.js?release_sha=${encodeURIComponent(manifest.git_sha)}`,
            { scope: "/", updateViaCache: "none" }
        );
        await registration.update();
        const worker = await waitForReleaseWorker(registration, manifest.git_sha);
        const identity = await queryWorkerIdentity(worker);
        if (identity.git_sha !== manifest.git_sha) {
            throw new Error(`RELEASE_IDENTITY_MISMATCH:${identity.git_sha || "missing"}:${manifest.git_sha}`);
        }
        const ready = await navigator.serviceWorker.ready;
        return { manifest, registration: ready, supported: true };
    })();
    return initializationPromise;
}

export function getPlatformServiceWorkerRegistration() {
    return initializePlatformRelease().then(result => result.registration);
}

export {
    fetchReleaseManifest,
    initializePlatformRelease,
    queryWorkerIdentity,
    SHA_PATTERN,
    waitForReleaseWorker,
    workerMatchesRelease
};
