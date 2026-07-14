const VERSION = "1.0.0-multimodal-composer";
const MAX_FILES = 4;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json"]);
const state = { items: [], objectUrls: new Set() };

function extensionOf(name = "") {
    return String(name || "").split(".").pop()?.toLowerCase() || "";
}

function formatBytes(bytes = 0) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    }
    return btoa(binary);
}

function base64ToBlob(dataBase64, mimeType) {
    const binary = atob(dataBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}

function createElement(tag, className = "", text = "") {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

function setComposerMessage(message = "", tone = "info") {
    const tray = document.getElementById("jarvis-attachment-tray");
    if (!tray) return;
    tray.hidden = false;
    tray.querySelectorAll("[data-jarvis-attachment-status='true']").forEach(item => item.remove());
    const status = createElement("div", `text-xs px-3 py-2 rounded-lg ${tone === "error" ? "bg-red-500/15 text-red-200" : "bg-blue-500/10 text-blue-200"}`, message);
    status.dataset.jarvisAttachmentStatus = "true";
    tray.appendChild(status);
}

function removeItem(id) {
    const index = state.items.findIndex(item => item.id === id);
    if (index < 0) return;
    const [item] = state.items.splice(index, 1);
    if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
        state.objectUrls.delete(item.previewUrl);
    }
    renderTray();
}

function renderTray() {
    const tray = document.getElementById("jarvis-attachment-tray");
    if (!tray) return;
    tray.querySelectorAll("[data-jarvis-attachment-chip='true']").forEach(item => item.remove());
    tray.hidden = state.items.length === 0 && !tray.querySelector("[data-jarvis-attachment-status='true']");

    state.items.forEach(item => {
        const chip = createElement("div", "flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-2.5 py-2 max-w-full");
        chip.dataset.jarvisAttachmentChip = "true";
        if (item.previewUrl && item.file.type.startsWith("image/")) {
            const image = createElement("img", "h-10 w-10 rounded-lg object-cover border border-slate-600");
            image.src = item.previewUrl;
            image.alt = item.file.name;
            chip.appendChild(image);
        } else {
            const icon = createElement("div", "h-10 w-10 rounded-lg bg-slate-700 flex items-center justify-center text-blue-300");
            icon.appendChild(createElement("i", `fa-solid ${item.file.type.startsWith("video/") ? "fa-film" : item.file.type.startsWith("audio/") ? "fa-wave-square" : "fa-file"}`));
            chip.appendChild(icon);
        }
        const details = createElement("div", "min-w-0 flex-1");
        details.appendChild(createElement("div", "text-xs text-white truncate", item.file.name));
        details.appendChild(createElement("div", `text-[10px] ${item.status === "failed" ? "text-red-300" : item.status === "ready" ? "text-emerald-300" : "text-slate-400"}`, item.status === "failed" ? "No se pudo guardar" : item.status === "ready" ? `${formatBytes(item.file.size)} · listo` : "guardando..."));
        chip.appendChild(details);
        const remove = createElement("button", "h-7 w-7 rounded-full hover:bg-slate-700 text-slate-300", "×");
        remove.type = "button";
        remove.title = `Quitar ${item.file.name}`;
        remove.addEventListener("click", () => removeItem(item.id));
        chip.appendChild(remove);
        tray.appendChild(chip);
    });
}

async function prepareFile(file) {
    const id = crypto.randomUUID?.() || `attachment-${Date.now()}-${state.items.length}`;
    const previewUrl = file.type.startsWith("image/") || file.type.startsWith("video/") ? URL.createObjectURL(file) : null;
    if (previewUrl) state.objectUrls.add(previewUrl);
    const item = { id, file, previewUrl, status: "uploading", output: null, extractedText: "" };
    state.items.push(item);
    renderTray();
    item.pending = (async () => {
        try {
            const buffer = await file.arrayBuffer();
            if (TEXT_EXTENSIONS.has(extensionOf(file.name))) {
                item.extractedText = new TextDecoder("utf-8", { fatal: false }).decode(buffer.slice(0, 100000)).slice(0, 50000);
            }
            if (typeof window.JarvisLocalBridge?.requestJson !== "function") throw new Error("LOCAL_BRIDGE_REQUIRED");
            const saved = await window.JarvisLocalBridge.requestJson("/upload", {
                name: file.name,
                mimeType: file.type || "application/octet-stream",
                dataBase64: arrayBufferToBase64(buffer)
            }, { timeoutMs: 45000 });
            if (saved?.ok !== true) throw new Error(saved?.error || saved?.status || "UPLOAD_FAILED");
            item.output = saved.output;
            item.status = "ready";
            item.saved = saved;
            window.__JARVIS_MULTIMODAL_HEALTH__ = {
                ok: true,
                status: "MULTIMODAL_UPLOAD_VERIFIED",
                receivedFiles: state.items.filter(entry => entry.status === "ready").length,
                lastMimeType: saved.mimeType,
                lastOutput: saved.output,
                checkedAt: new Date().toISOString()
            };
        } catch (error) {
            item.status = "failed";
            item.error = error?.message || String(error);
        }
        renderTray();
        return item;
    })();
    return item.pending;
}

async function acceptFiles(fileList) {
    const files = Array.from(fileList || []);
    const existingBytes = state.items.reduce((total, item) => total + item.file.size, 0);
    if (state.items.length + files.length > MAX_FILES) return setComposerMessage(`Puedes adjuntar hasta ${MAX_FILES} archivos por orden.`, "error");
    if (files.some(file => file.size === 0 || file.size > MAX_FILE_BYTES)) return setComposerMessage("Cada archivo debe pesar entre 1 byte y 12 MB.", "error");
    if (existingBytes + files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) return setComposerMessage("El total de adjuntos no puede superar 24 MB.", "error");
    await Promise.all(files.map(prepareFile));
}

async function composePrompt(rawPrompt = "") {
    await Promise.all(state.items.map(item => item.pending).filter(Boolean));
    const ready = state.items.filter(item => item.status === "ready" && item.output);
    if (ready.length === 0) return String(rawPrompt || "").trim();
    const manifest = ready.map(item => ({
        name: item.file.name,
        mimeType: item.file.type || item.saved?.detectedMimeType || "application/octet-stream",
        bytes: item.file.size,
        artifact: item.output,
        extractedText: item.extractedText || undefined
    }));
    return [String(rawPrompt || "Analiza los archivos adjuntos").trim(), "", "Archivos adjuntos reales entregados por el usuario:", JSON.stringify(manifest)].join("\n");
}

function clear() {
    state.objectUrls.forEach(url => URL.revokeObjectURL(url));
    state.objectUrls.clear();
    state.items = [];
    renderTray();
    const input = document.getElementById("jarvis-file-input");
    if (input) input.value = "";
}

function observationData(observation = {}) {
    return observation?.data?.data || observation?.data || observation?.result?.data || observation?.result || observation;
}

function observationTool(observation = {}) {
    return observation?.tool || observation?.name || observation?.meta?.tool || observation?.result?.tool || "";
}

async function renderArtifact(output, mimeType = "", toolName = "") {
    const outputContainer = document.getElementById("gestia-output");
    if (!outputContainer || !output || typeof window.JarvisLocalBridge?.requestJson !== "function") return;
    if (Array.from(outputContainer.querySelectorAll("[data-jarvis-artifact-output]")).some(item => item.dataset.jarvisArtifactOutput === output)) return;
    const payload = await window.JarvisLocalBridge.requestJson("/artifact/read", { output }, { timeoutMs: 30000 });
    if (payload?.ok !== true || !payload?.dataBase64) return;
    const blob = base64ToBlob(payload.dataBase64, payload.mimeType || mimeType);
    const objectUrl = URL.createObjectURL(blob);
    state.objectUrls.add(objectUrl);
    const host = outputContainer.lastElementChild?.querySelector(".bg-gestia-panel") || outputContainer.lastElementChild;
    if (!host) return;
    const card = createElement("div", "mt-4 rounded-xl border border-slate-600 bg-slate-900/80 p-3");
    card.dataset.jarvisArtifactOutput = output;
    card.dataset.testid = "jarvis-artifact-card";
    if ((payload.mimeType || mimeType).startsWith("image/")) {
        const image = createElement("img", "w-full max-h-96 object-contain rounded-lg bg-black/30 mb-3");
        image.src = objectUrl;
        image.alt = payload.fileName || "Imagen generada por Jarvis";
        card.appendChild(image);
    }
    const row = createElement("div", "flex items-center justify-between gap-3");
    const details = createElement("div", "min-w-0");
    details.appendChild(createElement("div", "text-sm text-white truncate", payload.fileName || output));
    details.appendChild(createElement("div", "text-xs text-slate-400", `${formatBytes(payload.bytes)} · ${toolName || "artefacto"}`));
    row.appendChild(details);
    const download = createElement("a", "shrink-0 inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2 text-xs font-semibold text-white", "Descargar");
    download.href = objectUrl;
    download.download = payload.fileName || "jarvis-artifact";
    download.dataset.testid = "jarvis-artifact-download";
    row.appendChild(download);
    card.appendChild(row);
    host.appendChild(card);
}

async function renderArtifactsFromObservations(observations = []) {
    const artifacts = (Array.isArray(observations) ? observations : []).map(observation => ({ tool: observationTool(observation), data: observationData(observation) })).filter(item => typeof item.data?.output === "string" && item.data.output.startsWith(".jarvis-artifacts/"));
    for (const artifact of artifacts) await renderArtifact(artifact.data.output, artifact.data.mimeType, artifact.tool);
}

function insertPrompt(text = "") {
    const textarea = document.getElementById("gestia-input");
    if (!textarea) return;
    textarea.value = text;
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function initialize() {
    const toggle = document.getElementById("jarvis-attach-toggle");
    const menu = document.getElementById("jarvis-attach-menu");
    const input = document.getElementById("jarvis-file-input");
    if (!toggle || !menu || !input || toggle.dataset.bound === "true") return;
    toggle.dataset.bound = "true";
    toggle.addEventListener("click", () => {
        menu.hidden = !menu.hidden;
        toggle.setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.getElementById("jarvis-menu-upload")?.addEventListener("click", () => { menu.hidden = true; input.click(); });
    document.getElementById("jarvis-menu-image")?.addEventListener("click", () => { menu.hidden = true; insertPrompt("Genera una imagen profesional de "); });
    document.getElementById("jarvis-menu-web")?.addEventListener("click", () => { menu.hidden = true; insertPrompt("Investiga en la web con fuentes verificables "); });
    input.addEventListener("change", async () => { await acceptFiles(input.files); input.value = ""; });
}

export const JarvisAttachments = {
    version: VERSION,
    acceptFiles,
    composePrompt,
    clear,
    hasFiles: () => state.items.length > 0,
    renderArtifactsFromObservations,
    describe: () => ({ version: VERSION, maxFiles: MAX_FILES, maxFileBytes: MAX_FILE_BYTES })
};

if (typeof window !== "undefined") {
    window.JarvisAttachments = JarvisAttachments;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
}
