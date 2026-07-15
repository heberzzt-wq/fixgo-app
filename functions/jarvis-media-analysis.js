"use strict";

const VERSION = "1.0.0-grounded-multimodal-analysis";
const DEFAULT_MODEL = "gemini-2.5-flash";
const ALLOWED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const MAX_FILES = 8;
const MAX_FILE_BYTES = 7 * 1024 * 1024;
const MAX_TOTAL_BYTES = 9 * 1024 * 1024;

function normalizeMediaFiles(files = []) {
    if (!Array.isArray(files) || files.length < 1 || files.length > MAX_FILES) {
        throw new Error("MEDIA_FILES_COUNT_INVALID");
    }
    let totalBytes = 0;
    return files.map((file, index) => {
        const name = String(file?.name || `archivo-${index + 1}`).trim().slice(0, 180);
        const mimeType = String(file?.mimeType || "").toLowerCase().trim();
        const dataBase64 = String(file?.dataBase64 || "").trim();
        if (!ALLOWED_TYPES.has(mimeType)) throw new Error("MEDIA_TYPE_UNSUPPORTED");
        if (!dataBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) throw new Error("MEDIA_BASE64_INVALID");
        const bytes = Buffer.byteLength(dataBase64, "base64");
        if (bytes < 1 || bytes > MAX_FILE_BYTES) throw new Error("MEDIA_FILE_SIZE_INVALID");
        totalBytes += bytes;
        if (totalBytes > MAX_TOTAL_BYTES) throw new Error("MEDIA_TOTAL_SIZE_INVALID");
        return { name, mimeType, dataBase64, bytes };
    });
}

function validateAnalysis(parsed, files) {
    const sources = Array.isArray(parsed?.sources) ? parsed.sources : [];
    if (sources.length !== files.length) throw new Error("MEDIA_ANALYSIS_SOURCE_COUNT_MISMATCH");
    return {
        ok: true,
        status: "MEDIA_ANALYSIS_GROUNDED",
        engine: "jarvis_gemini_multimodal_analysis",
        version: VERSION,
        sources: sources.map((source, index) => ({
            name: files[index].name,
            mimeType: files[index].mimeType,
            bytes: files[index].bytes,
            description: String(source?.description || "").slice(0, 4000),
            objects: Array.isArray(source?.objects) ? source.objects.slice(0, 60) : [],
            composition: source?.composition && typeof source.composition === "object" ? source.composition : {},
            visibleData: Array.isArray(source?.visibleData) ? source.visibleData.slice(0, 100) : [],
            pages: Array.isArray(source?.pages) ? source.pages.slice(0, 100) : [],
            marketingUse: Array.isArray(source?.marketingUse) ? source.marketingUse.slice(0, 20) : [],
            quality: source?.quality && typeof source.quality === "object" ? source.quality : {},
            uncertainty: Array.isArray(source?.uncertainty) ? source.uncertainty.slice(0, 50) : [],
            evidence: Array.isArray(source?.evidence) ? source.evidence.slice(0, 120) : []
        })),
        comparison: parsed?.comparison && typeof parsed.comparison === "object" ? parsed.comparison : null,
        recommendations: Array.isArray(parsed?.recommendations) ? parsed.recommendations.slice(0, 50) : [],
        policy: {
            readOnly: true,
            evidenceRequired: true,
            illegibleContentMustRemainUnknown: true,
            authenticatedAdminOnly: true
        }
    };
}

async function runJarvisMediaAnalysis({ ai, input = {}, model = DEFAULT_MODEL } = {}) {
    const modernClient = Boolean(ai?.models?.generateContent);
    const legacyClient = Boolean(ai?.getGenerativeModel);
    if (!modernClient && !legacyClient) throw new Error("MEDIA_AI_REQUIRED");
    const files = normalizeMediaFiles(input.files);
    const question = String(input.question || input.instruction || "Analiza los materiales entregados.").trim().slice(0, 3000);
    const prompt = `Eres el analista visual y documental privado de Heberto Mendoza. Analiza exclusivamente los archivos adjuntos. No inventes texto, objetos, cifras ni páginas ilegibles. Distingue observación de inferencia. Devuelve JSON estricto con esta forma: {"sources":[{"description":"","objects":[],"composition":{"framing":"","lighting":"","visualHierarchy":""},"visibleData":[{"value":"","page":null,"confidence":0,"evidence":""}],"pages":[{"page":1,"summary":"","tables":[],"images":[],"evidence":[],"uncertainty":[]}],"marketingUse":[],"quality":{"score":0,"issues":[],"improvements":[]},"uncertainty":[],"evidence":[]}],"comparison":{"beforeAfter":false,"differences":[],"confidence":0},"recommendations":[]}. Debe existir una entrada sources por archivo y en el mismo orden. Para PDF aporta evidencia por página. Para imágenes evalúa hero, galería, servicio, equipo, testimonio y antes/después sólo cuando haya evidencia. Si algo no se lee, colócalo en uncertainty. Pregunta: ${question}`;
    const parts = [prompt, ...files.map(file => ({ inlineData: { mimeType: file.mimeType, data: file.dataBase64 } }))];
    let text = "";

    if (modernClient) {
        const generated = await ai.models.generateContent({
            model,
            contents: [{ role: "user", parts }],
            config: {
                temperature: 0.05,
                maxOutputTokens: 8192,
                responseMimeType: "application/json"
            }
        });
        text = String(generated?.text || "");
    }
    else {
        const generator = ai.getGenerativeModel({
            model,
            generationConfig: { temperature: 0.05, maxOutputTokens: 8192, responseMimeType: "application/json" }
        });
        const generated = await generator.generateContent(parts);
        text = String(generated?.response?.text?.() || "");
    }

    if (!text) throw new Error("MEDIA_ANALYSIS_OUTPUT_MISSING");
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw new Error("MEDIA_ANALYSIS_JSON_INVALID");
    }
    return {
        ...validateAnalysis(parsed, files),
        provider: String(ai.lastProvider || (modernClient ? "gemini-modern" : "gemini-legacy")),
        model,
        analyzedAt: new Date().toISOString()
    };
}

module.exports = {
    VERSION,
    DEFAULT_MODEL,
    ALLOWED_TYPES,
    MAX_FILES,
    MAX_FILE_BYTES,
    MAX_TOTAL_BYTES,
    normalizeMediaFiles,
    validateAnalysis,
    runJarvisMediaAnalysis
};
