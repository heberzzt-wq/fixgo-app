if (["127.0.0.1", "localhost"].includes(window.location.hostname) && new URLSearchParams(window.location.search).get("jarvisLocal") === "1") {
    window.__FIXGO_LOCAL_BOOTSTRAP_SEEN__ = true;
    setTimeout(() => import("./jarvis.local.runtime.js?v=fixgo-memory-isolation-v2-20260806")
        .catch(error => console.error("[FIXGO_LOCAL_RUNTIME_LOAD_FAILED]", error)), 2500);
}
