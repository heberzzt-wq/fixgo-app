import {
    recordCapabilityEvidence
} from "../../gestia-core/jarvis/jarvis.capability.evidence.js";
import {
    JarvisCaseLedger
} from "../../gestia-core/jarvis/jarvis.case.ledger.js";

const VERSION = "2.4.0-user-artifact-preview-download";
const MAX_FILES = 30;
const MAX_FILE_BYTES = 250 * 1024 * 1024;
const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
const CHUNK_BYTES = 2 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 3;
const STORAGE_KEY = "jarvis.multimodal.completed.v2";
const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "xml", "yaml", "yml", "js", "mjs", "cjs", "ts", "tsx", "jsx", "css", "html", "py", "sql"]);
const state = {
    items: [],
    objectUrls: new Set(),
    renderingOutputs: new Set(),
    renderedOutputs: new Set(),
    batchId: `batch-${crypto.randomUUID?.() || Date.now()}`,
    pendingBatch: null,
    caseRecord: null
};

function ensureCase() {
    state.caseRecord = state.caseRecord || JarvisCaseLedger.ensure({ domain: "multimodal_ingestion" });
    return state.caseRecord;
}

function itemName(item) { return item?.file?.name || item?.name || "archivo"; }
function itemType(item) { return item?.file?.type || item?.mimeType || "application/octet-stream"; }
function itemBytes(item) { return Number(item?.file?.size ?? item?.bytes ?? 0); }

function persistReadyItems() {
    try {
        const completed = state.items.filter(item => item.status === "ready" && item.output).map(item => ({
            id: item.id,
            name: itemName(item),
            mimeType: itemType(item),
            bytes: itemBytes(item),
            status: "ready",
            output: item.output,
            extractedText: String(item.extractedText || "").slice(0, 50000),
            saved: item.saved || null,
            caseId: item.caseId || state.caseRecord?.caseId || null,
            objectiveId: item.objectiveId || state.caseRecord?.objectiveId || null,
            recovered: true
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(completed.slice(-MAX_FILES)));
    } catch {}
}

function restoreReadyItems() {
    try {
        const restored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (Array.isArray(restored)) state.items = restored.filter(item => item?.output && item?.status === "ready").slice(-MAX_FILES);
        state.caseRecord = JarvisCaseLedger.active();
    } catch { state.items = []; }
}

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

async function removeItem(id) {
    const index = state.items.findIndex(item => item.id === id);
    if (index < 0) return;
    const [item] = state.items.splice(index, 1);
    item.cancelled = true;
    if (item.uploadId && item.status === "uploading" && typeof window.JarvisLocalBridge?.requestJson === "function") {
        await window.JarvisLocalBridge.requestJson("/upload/cancel", { uploadId: item.uploadId }, { timeoutMs: 15000 }).catch(() => null);
    }
    if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
        state.objectUrls.delete(item.previewUrl);
    }
    persistReadyItems();
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
        if (item.previewUrl && itemType(item).startsWith("image/")) {
            const image = createElement("img", "h-10 w-10 rounded-lg object-cover border border-slate-600");
            image.src = item.previewUrl;
            image.alt = itemName(item);
            chip.appendChild(image);
        } else {
            const icon = createElement("div", "h-10 w-10 rounded-lg bg-slate-700 flex items-center justify-center text-blue-300");
            icon.appendChild(createElement("i", `fa-solid ${itemType(item).startsWith("video/") ? "fa-film" : itemType(item).startsWith("audio/") ? "fa-wave-square" : "fa-file"}`));
            chip.appendChild(icon);
        }
        const details = createElement("div", "min-w-0 flex-1");
        details.appendChild(createElement("div", "text-xs text-white truncate", itemName(item)));
        const statusText = item.status === "failed"
            ? `Error: ${item.error || "no se pudo guardar"}`
            : item.status === "ready"
                ? `${formatBytes(itemBytes(item))} · ${item.recovered ? "recuperado" : "listo"}${item.saved?.sha256 ? ` · ${item.saved.sha256.slice(0, 10)}` : ""}`
                : `${formatBytes(itemBytes(item))} · ${Number(item.progress || 0)}%`;
        details.appendChild(createElement("div", `text-[10px] ${item.status === "failed" ? "text-red-300" : item.status === "ready" ? "text-emerald-300" : "text-slate-400"}`, statusText));
        chip.appendChild(details);
        if (item.status === "failed" && item.file) {
            const retry = createElement("button", "h-7 px-2 rounded-lg hover:bg-slate-700 text-[10px] text-blue-200", "Reintentar");
            retry.type = "button";
            retry.addEventListener("click", () => prepareFile(item.file, item));
            chip.appendChild(retry);
        }
        const remove = createElement("button", "h-7 w-7 rounded-full hover:bg-slate-700 text-slate-300", "×");
        remove.type = "button";
        remove.title = `${item.status === "uploading" ? "Cancelar" : "Quitar"} ${itemName(item)}`;
        remove.addEventListener("click", () => removeItem(item.id));
        chip.appendChild(remove);
        tray.appendChild(chip);
    });
}

async function requestChunkWithRetry(payload, item, attempts = 3) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (item.cancelled) throw new Error("UPLOAD_CANCELLED");
        const response = await window.JarvisLocalBridge.requestJson("/upload/chunk", payload, { timeoutMs: 45000 });
        if (response?.ok === true) return response;
        lastError = new Error(response?.error || response?.status || "UPLOAD_CHUNK_FAILED");
    }
    throw lastError;
}

async function prepareFile(file, existingItem = null) {
    const item = existingItem || {
        id: crypto.randomUUID?.() || `attachment-${Date.now()}-${state.items.length}`,
        file,
        previewUrl: file.type.startsWith("image/") || file.type.startsWith("video/") ? URL.createObjectURL(file) : null,
        status: "uploading",
        output: null,
        extractedText: ""
    };
    if (!existingItem) state.items.push(item);
    if (item.previewUrl) state.objectUrls.add(item.previewUrl);
    item.cancelled = false;
    item.status = "uploading";
    item.error = "";
    item.progress = 0;
    renderTray();
    item.pending = (async () => {
        try {
            if (TEXT_EXTENSIONS.has(extensionOf(file.name))) {
                const textBuffer = await file.slice(0, 100000).arrayBuffer();
                item.extractedText = new TextDecoder("utf-8", { fatal: false }).decode(textBuffer).slice(0, 50000);
            }
            if (typeof window.JarvisLocalBridge?.requestJson !== "function") throw new Error("LOCAL_BRIDGE_REQUIRED");
            const started = await window.JarvisLocalBridge.requestJson("/upload/start", {
                batchId: state.batchId,
                name: file.name,
                mimeType: file.type || "application/octet-stream",
                expectedBytes: file.size,
                caseId: ensureCase().caseId,
                objectiveId: ensureCase().objectiveId
            }, { timeoutMs: 30000 });
            if (started?.ok !== true) throw new Error(started?.error || started?.status || "UPLOAD_START_FAILED");
            item.uploadId = started.uploadId;
            const chunkSize = Math.min(Number(started.maxChunkBytes || CHUNK_BYTES), CHUNK_BYTES);
            for (let offset = 0; offset < file.size; offset += chunkSize) {
                const buffer = await file.slice(offset, Math.min(offset + chunkSize, file.size)).arrayBuffer();
                const chunk = await requestChunkWithRetry({
                    uploadId: item.uploadId,
                    offset,
                    dataBase64: arrayBufferToBase64(buffer)
                }, item);
                item.progress = chunk.progress;
                renderTray();
            }
            if (item.cancelled) throw new Error("UPLOAD_CANCELLED");
            const saved = await window.JarvisLocalBridge.requestJson("/upload/complete", {
                uploadId: item.uploadId
            }, { timeoutMs: 45000 });
            if (saved?.ok !== true) throw new Error(saved?.error || saved?.status || "UPLOAD_FAILED");
            item.output = saved.output;
            item.status = "ready";
            item.progress = 100;
            item.saved = saved;
            item.caseId = saved.caseId;
            item.objectiveId = saved.objectiveId;
            state.caseRecord = JarvisCaseLedger.recordAttachment(saved.caseId, saved);
            recordCapabilityEvidence("persistent_cases", {
                ok: false,
                status: "PERSISTENT_CASE_PENDING_ORIGINAL_INSTRUCTION",
                caseId: state.caseRecord.caseId,
                objectiveId: state.caseRecord.objectiveId,
                originalInstructionBound: Boolean(state.caseRecord.originalInstruction),
                attachmentCount: state.caseRecord.attachments.length,
                checkedAt: new Date().toISOString()
            });
            persistReadyItems();
            window.__JARVIS_MULTIMODAL_HEALTH__ = recordCapabilityEvidence("multimodal_inputs", {
                ok: true,
                status: "MULTIMODAL_CHUNKED_UPLOAD_VERIFIED",
                receivedFiles: state.items.filter(entry => entry.status === "ready").length,
                lastMimeType: saved.mimeType,
                lastOutput: saved.output,
                lastSha256: saved.sha256,
                batchId: state.batchId,
                checkedAt: new Date().toISOString()
            });
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
    ensureCase();
    let acceptedBytes = state.items.reduce((total, item) => total + itemBytes(item), 0);
    const known = new Set(state.items.map(item => `${itemName(item)}:${itemBytes(item)}:${item.lastModified || 0}`));
    const queued = [];
    for (const file of files) {
        const dedupeKey = `${file.name}:${file.size}:${file.lastModified || 0}`;
        if (known.has(dedupeKey)) continue;
        if (state.items.length >= MAX_FILES) {
            setComposerMessage(`Se alcanzó el límite seguro de ${MAX_FILES} archivos por orden.`, "error");
            break;
        }
        const item = {
            id: crypto.randomUUID?.() || `attachment-${Date.now()}-${state.items.length}`,
            file,
            lastModified: file.lastModified || 0,
            previewUrl: file.type.startsWith("image/") || file.type.startsWith("video/") ? URL.createObjectURL(file) : null,
            status: "uploading",
            progress: 0,
            output: null,
            extractedText: ""
        };
        if (file.size < 1 || file.size > MAX_FILE_BYTES) {
            item.status = "failed";
            item.error = `tamaño fuera del límite de ${formatBytes(MAX_FILE_BYTES)}`;
        } else if (acceptedBytes + file.size > MAX_TOTAL_BYTES) {
            item.status = "failed";
            item.error = `el lote supera ${formatBytes(MAX_TOTAL_BYTES)}`;
        } else {
            acceptedBytes += file.size;
            queued.push(item);
        }
        known.add(dedupeKey);
        state.items.push(item);
        if (item.previewUrl) state.objectUrls.add(item.previewUrl);
    }
    renderTray();
    let cursor = 0;
    const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queued.length) }, async () => {
        while (cursor < queued.length) {
            const item = queued[cursor++];
            await prepareFile(item.file, item);
        }
    });
    state.pendingBatch = Promise.all(workers);
    await state.pendingBatch;
    state.pendingBatch = null;
}

export function inspectAttachmentBatch(items = state.items) {
    const selected = Array.isArray(items) ? items : [];
    const incomplete = selected
        .filter(item => item?.status !== "ready" || !item?.output)
        .map(item => ({
            id: item?.id || null,
            name: itemName(item),
            status: item?.status || "unknown",
            error: item?.error || null,
            artifact: item?.output || null
        }));
    const readyFiles = selected.length - incomplete.length;
    return {
        ok: incomplete.length === 0,
        status: incomplete.length === 0
            ? "ATTACHMENT_BATCH_COMPLETE"
            : "ATTACHMENT_BATCH_INCOMPLETE",
        selectedFiles: selected.length,
        readyFiles,
        incompleteFiles: incomplete.length,
        incomplete
    };
}

async function composePrompt(rawPrompt = "") {
    if (state.pendingBatch) await state.pendingBatch;
    await Promise.all(state.items.map(item => item.pending).filter(Boolean));
    const batch = inspectAttachmentBatch();
    if (!batch.ok) {
        setComposerMessage(
            `No se envio la orden: ${batch.incompleteFiles} archivo(s) no terminaron de persistirse.`,
            "error"
        );
        const error = new Error("ATTACHMENT_BATCH_INCOMPLETE");
        error.code = "ATTACHMENT_BATCH_INCOMPLETE";
        error.details = batch;
        throw error;
    }
    const ready = state.items.filter(item => item.status === "ready" && item.output);
    const normalizedPrompt = String(rawPrompt || "Analiza los archivos adjuntos").trim();
    if (ready.length === 0) return normalizedPrompt;
    const caseRecord = ensureCase();
    state.caseRecord = JarvisCaseLedger.bindInstruction(caseRecord.caseId, normalizedPrompt);
    recordCapabilityEvidence("persistent_cases", {
        ok: true,
        status: "PERSISTENT_CASE_VERIFIED",
        caseId: state.caseRecord.caseId,
        objectiveId: state.caseRecord.objectiveId,
        originalInstructionBound: true,
        attachmentCount: state.caseRecord.attachments.length,
        checkedAt: new Date().toISOString()
    });
    const manifest = ready.map(item => ({
        name: itemName(item),
        mimeType: itemType(item) || item.saved?.detectedMimeType || "application/octet-stream",
        bytes: itemBytes(item),
        artifact: item.output,
        sha256: item.saved?.sha256 || undefined,
        caseId: item.caseId || state.caseRecord.caseId,
        objectiveId: item.objectiveId || state.caseRecord.objectiveId,
        extractedText: item.extractedText || undefined
    }));
    return [normalizedPrompt, "", `Expediente soberano: caseId=${state.caseRecord.caseId}; objectiveId=${state.caseRecord.objectiveId}; authorityId=${state.caseRecord.authorityId}`, "Archivos adjuntos reales entregados por el usuario:", JSON.stringify(manifest)].join("\n");
}

function clear() {
    state.items.forEach(item => { item.cancelled = true; });
    state.objectUrls.forEach(url => URL.revokeObjectURL(url));
    state.objectUrls.clear();
    state.items = [];
    if (state.caseRecord?.caseId) JarvisCaseLedger.close(state.caseRecord.caseId, "CLEARED");
    state.caseRecord = null;
    state.batchId = `batch-${crypto.randomUUID?.() || Date.now()}`;
    state.pendingBatch = null;
    localStorage.removeItem(STORAGE_KEY);
    renderTray();
    const input = document.getElementById("jarvis-file-input");
    if (input) input.value = "";
}

function observationTool(observation = {}) {
    return observation?.tool || observation?.name || observation?.meta?.tool || observation?.result?.tool || "";
}

function collectDirectArtifact(value, tool = "") {
    if (!value || typeof value !== "object") return [];
    const output = typeof value.output === "string" ? value.output : "";
    if (output.startsWith(".jarvis-artifacts/")) {
        return [{
            output,
            mimeType:
                value.mimeType ||
                "",
            tool
        }];
    }
    return [];
}

function currentMissionArtifactPayloads(observation = {}) {
    return [
        observation?.response?.data,
        observation?.data?.response?.data,
        observation?.result?.response?.data,
        observation?.data,
        observation?.result?.data
    ]
        .filter(value =>
            value &&
            typeof value ===
                "object"
        );
}

async function renderArtifact(output, mimeType = "", toolName = "") {
    const outputContainer = document.getElementById("gestia-output");
    if (!outputContainer || !output || typeof window.JarvisLocalBridge?.requestJson !== "function") return;
    const alreadyInDocument =
        Array.from(
            outputContainer.querySelectorAll(
                "[data-jarvis-artifact-output]"
            )
        ).some(
            item =>
                item.dataset
                    .jarvisArtifactOutput === output
        );
    if (state.renderingOutputs.has(output)) return;
    if (state.renderedOutputs.has(output)) {
        if (alreadyInDocument) return;
        state.renderedOutputs.delete(output);
    }
    else if (alreadyInDocument) {
        state.renderedOutputs.add(output);
        return;
    }
    state.renderingOutputs.add(output);
    try {
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
        else if ((payload.mimeType || mimeType) === "text/html") {
            const frame = document.createElement("iframe");
            frame.src = objectUrl;
            frame.title = payload.fileName || "Vista previa de página creada por Jarvis";
            frame.sandbox = "allow-forms allow-scripts allow-popups";
            frame.className = "w-full h-[32rem] rounded-lg bg-white mb-3 border border-slate-700";
            frame.dataset.testid = "jarvis-html-preview";
            card.appendChild(frame);
        }
    else if ((payload.mimeType || mimeType) === "application/pdf") {
        const frame = document.createElement("iframe");
        frame.src = objectUrl;
        frame.title = payload.fileName || "Vista previa del PDF creado por NEXO";
        frame.className = "w-full h-[32rem] rounded-lg bg-white mb-3 border border-slate-700";
        frame.dataset.testid = "jarvis-pdf-preview";
        card.appendChild(frame);
    }
        const row = createElement("div", "flex items-center justify-between gap-3");
        const details = createElement("div", "min-w-0");
        details.appendChild(createElement("div", "text-sm text-white truncate", payload.fileName || output));
        details.appendChild(createElement("div", "text-xs text-slate-400", `${formatBytes(payload.bytes)} · ${toolName || "artefacto"}`));
        row.appendChild(details);
        const actions = createElement("div", "shrink-0 flex items-center gap-2");
    const resolvedMimeType = String(payload.mimeType || mimeType || "").toLowerCase();
    const canOpen =
        resolvedMimeType === "application/pdf" ||
        resolvedMimeType === "text/html" ||
        resolvedMimeType.startsWith("image/") ||
        resolvedMimeType.startsWith("text/");
    if (canOpen) {
        const open = createElement("a", "inline-flex items-center gap-2 rounded-lg border border-slate-500 hover:border-slate-300 px-3 py-2 text-xs font-semibold text-slate-100", "Abrir");
        open.href = objectUrl;
        open.target = "_blank";
        open.rel = "noopener noreferrer";
        open.dataset.testid = "jarvis-artifact-open";
        actions.appendChild(open);
    }
    const download = createElement("a", "inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2 text-xs font-semibold text-white", "Descargar");
    download.href = objectUrl;
    download.download = payload.fileName || "nexo-artifact";
    download.dataset.testid = "jarvis-artifact-download";
    actions.appendChild(download);
    row.appendChild(actions);
        card.appendChild(row);
        host.appendChild(card);
        state.renderedOutputs.add(output);
    }
    finally {
        state.renderingOutputs.delete(output);
    }
}

async function renderArtifactsFromObservations(observations = []) {
    const artifacts = (Array.isArray(observations) ? observations : [])
        .flatMap(observation =>
            currentMissionArtifactPayloads(
                observation
            )
                .flatMap(payload =>
                    collectDirectArtifact(
                        payload,
                        observationTool(
                            observation
                        )
                    )
                )
        )
        .filter((artifact, index, items) => items.findIndex(item => item.output === artifact.output) === index);
    for (const artifact of artifacts) await renderArtifact(artifact.output, artifact.mimeType, artifact.tool);
}

async function renderPendingArtifacts() {
    const pending = Array.isArray(window.__JARVIS_PENDING_ARTIFACTS__)
        ? window.__JARVIS_PENDING_ARTIFACTS__.splice(0)
        : [];
    for (const artifact of pending) {
        await renderArtifact(artifact.output, artifact.mimeType, artifact.tool);
    }
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
    restoreReadyItems();
    renderTray();
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
    inspectAttachmentBatch,
    clear,
    hasFiles: () => state.items.length > 0,
    renderArtifact,
    renderArtifactsFromObservations,
    renderPendingArtifacts,
    describe: () => ({
        version: VERSION,
        transport: "chunked_progressive",
        maxFiles: MAX_FILES,
        maxFileBytes: MAX_FILE_BYTES,
        maxTotalBytes: MAX_TOTAL_BYTES,
        chunkBytes: CHUNK_BYTES,
        concurrency: UPLOAD_CONCURRENCY,
        recoverableCompletedArtifacts: true
    })
};

if (typeof window !== "undefined") {
    window.JarvisAttachments = JarvisAttachments;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
}
