import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { registerArtifact, findArtifact, listArtifacts } from "./jarvis-artifact-studio.js";

const TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".wav": "audio/wav", ".mp3": "audio/mpeg" };
const ROLES = { Entradas: "input", Logos: "official_logo_source", Audio: "audio", Video: "video" };
const MAX_BYTES = 100 * 1024 * 1024;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const inside = (base, file) => file.startsWith(base + path.sep);

function advertisingRecord(artifact, relativePath) {
    const composition = artifact.transformations?.find(item => item?.type === "local_ad_composition")?.composition;
    const script = artifact.transformations?.find(item => item?.type === "advertising_script");
    const creative = composition
        ? { brandName: composition.brandName, headline: composition.headline, body: composition.body }
        : script ? { brandName: script.brandName, headline: script.title, body: script.text } : null;
    const normalize = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    return { sha256: artifact.sha256, relativePath, output: artifact.file || "",
        createdAt: artifact.createdAt || new Date().toISOString(), mimeType: artifact.mimeType || "",
        ...(creative ? { creative, creativeFingerprint: hash(JSON.stringify(Object.fromEntries(Object.entries(creative).map(([key, value]) => [key, normalize(value)])))) } : {}) };
}

function withAdvertisingHistory(library, root, operation) {
    const directory = path.join(library, "Historial");
    fs.mkdirSync(directory, { recursive: true });
    if (fs.lstatSync(directory).isSymbolicLink() || !inside(library, fs.realpathSync(directory))) throw new Error("MATERIAL_LINK_NOT_ALLOWED");
    const file = path.join(directory, "publicidad.jsonl"), lock = path.join(directory, ".publicidad.lock");
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error("MATERIAL_LINK_NOT_ALLOWED");
    let descriptor;
    try { descriptor = fs.openSync(lock, "wx"); }
    catch (error) { if (error.code === "EEXIST") throw new Error("MATERIAL_HISTORY_BUSY"); throw error; }
    try {
        const history = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(line => {
            const item = JSON.parse(line);
            if (!/^[a-f0-9]{64}$/.test(item.sha256 || "")) throw new Error("MATERIAL_HISTORY_INVALID");
            return item;
        }) : [];
        const append = record => { fs.appendFileSync(file, JSON.stringify(record) + "\n", "utf8"); history.push(record); };
        // Include deliveries predating this feature, without treating them as published.
        if (!fs.existsSync(file)) {
            const artifacts = listArtifacts({ root, limit: 500 });
            const scan = (relative, depth = 0) => {
                const folder = path.join(library, relative);
                if (depth > 5 || !fs.existsSync(folder) || fs.lstatSync(folder).isSymbolicLink()) return;
                for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
                    const next = relative + "/" + entry.name;
                    if (entry.isSymbolicLink()) continue;
                    if (entry.isDirectory()) scan(next, depth + 1);
                    else if (entry.isFile() && /\.(png|jpe?g|webp|mp4)$/i.test(entry.name)) {
                        const media = boundedFile(library, next), sha256 = hash(fs.readFileSync(media));
                        if (history.some(item => item.sha256 === sha256)) continue;
                        const artifact = artifacts.find(item => item.sha256 === sha256) || {
                            sha256, mimeType: TYPES[path.extname(entry.name).toLowerCase()], createdAt: fs.statSync(media).mtime.toISOString()
                        };
                        append({ ...advertisingRecord(artifact, next), recordedAt: new Date().toISOString(), origin: "existing_local_delivery" });
                    }
                }
            };
            scan("Salidas");
            if (!fs.existsSync(file)) fs.writeFileSync(file, "", { flag: "wx" });
        }
        return operation(history, append);
    } finally { fs.closeSync(descriptor); fs.unlinkSync(lock); }
}

export function officialMaterialPolicy(root = process.cwd()) {
    const file = path.resolve(root, ".jarvis-artifacts/material-library.config.json");
    return fs.existsSync(file) && JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")).officialOnly === true;
}

export function availableMaterialToolCatalog({ root = process.cwd(), catalog = [] } = {}) {
    const policy = materialLibrary({ root, action: "policy" });
    return policy.externalGenerationAllowed === false
        ? catalog.filter(tool => !["image.generate", "image.edit", "video.generate"].includes(tool?.name))
        : catalog;
}

// A reference selected by Qwen binds to one configured original; it never selects a different asset.
export function resolveMaterialReference({ root = process.cwd(), output = "", caseId = "", objectiveId = "" } = {}) {
    const reference = String(output || "");
    if (!reference.startsWith("library:")) return reference;
    const imported = materialLibrary({ root, action: "import", relativePath: reference.slice(8), caseId, objectiveId });
    if (imported.ok !== true || !imported.output) throw new Error("MATERIAL_IMPORT_REQUIRED");
    return imported.output;
}

export function assertOfficialMaterial({ root = process.cwd(), output = "", depth = 0 } = {}) {
    if (!officialMaterialPolicy(root)) return;
    if (depth > 12) throw new Error("MATERIAL_LINEAGE_INVALID");
    const record = findArtifact({ root, output });
    if (!record || hash(fs.readFileSync(boundedFile(path.resolve(root), output))) !== record.sha256) throw new Error("MATERIAL_OFFICIAL_LIBRARY_REQUIRED:Importar el original con media.library");
    if (record.origin === "media.library") return;
    if (record.originalFile?.startsWith(".jarvis-artifacts/")) {
        assertOfficialMaterial({ root, output: record.originalFile, depth: depth + 1 });
        return;
    }
    throw new Error("MATERIAL_OFFICIAL_LIBRARY_REQUIRED:Importar el original con media.library");
}

function boundedFile(base, relativePath) {
    const relative = String(relativePath || "").replaceAll("\\", "/");
    if (!relative || path.isAbsolute(relative) || relative.split("/").some(part => !part || part === ".." || part === "." || part.includes(":"))) throw new Error("MATERIAL_PATH_OUTSIDE_LIBRARY");
    const target = path.resolve(base, relative);
    if (!inside(base, target)) throw new Error("MATERIAL_PATH_OUTSIDE_LIBRARY");
    let current = base;
    for (const part of relative.split("/")) {
        current = path.join(current, part);
        if (fs.lstatSync(current).isSymbolicLink()) throw new Error("MATERIAL_LINK_NOT_ALLOWED");
    }
    if (!inside(fs.realpathSync(base), fs.realpathSync(target))) throw new Error("MATERIAL_PATH_OUTSIDE_LIBRARY");
    const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_BYTES) throw new Error("MATERIAL_BYTES_OUT_OF_RANGE");
    return target;
}

function describe(file, relativePath, library) {
    const mimeType = TYPES[path.extname(file).toLowerCase()];
    if (!mimeType) throw new Error("MATERIAL_TYPE_UNSUPPORTED");
    const bytes = fs.readFileSync(file);
    const png = bytes.length > 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const signatures = {
        "image/png": png,
        "image/jpeg": bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
        "image/webp": bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP",
        "video/mp4": bytes.toString("ascii", 4, 8) === "ftyp",
        "audio/wav": bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE",
        "audio/mpeg": bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224)
    };
    if (!signatures[mimeType]) throw new Error("MATERIAL_CONTENT_TYPE_MISMATCH");
    const info = { relativePath, ref: `library:${relativePath}`, role: ROLES[relativePath.split("/")[0]] || "output", mimeType, bytes: bytes.length, sha256: hash(bytes),
        ...(png ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : {}) };
    // Optional curation is data bound to these exact bytes, not executable instructions or model claims.
    if (library && fs.existsSync(file + ".material.json")) {
        try {
            const sidecar = boundedFile(library, relativePath + ".material.json");
            if (fs.statSync(sidecar).size > 16384) throw new Error("MATERIAL_METADATA_TOO_LARGE");
            const data = JSON.parse(fs.readFileSync(sidecar, "utf8").replace(/^\uFEFF/, ""));
            if (data.sourceSha256 !== info.sha256) throw new Error("MATERIAL_METADATA_SOURCE_CHANGED");
            if (typeof data.description === "string") info.description = data.description.slice(0, 600);
            const crop = data.photoRegion;
            if (crop && info.width && [crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) &&
                crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0 &&
                crop.x + crop.width <= info.width && crop.y + crop.height <= info.height) {
                info.photoRegion = { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
            }
            info.metadataSource = "USER_LIBRARY_SIDECAR";
        } catch (error) { info.metadataIssue = String(error.message); }
    }
    return info;
}

// The directory is set on the workstation, never accepted from a browser/tool argument.
export function materialLibrary({ root = process.cwd(), action = "list", relativePath = "", output = "", caseId = "", objectiveId = "" } = {}) {
    const config = path.resolve(root, ".jarvis-artifacts/material-library.config.json");
    if (action === "policy") {
        const settings = fs.existsSync(config) ? JSON.parse(fs.readFileSync(config, "utf8").replace(/^\uFEFF/, "")) : null;
        return { ok: true, status: "MATERIAL_LIBRARY_POLICY", configured: Boolean(settings),
            officialOnly: settings?.officialOnly === true,
            externalGenerationAllowed: settings ? settings.externalGenerationAllowed === true : true };
    }
    if (!fs.existsSync(config)) return { ok: false, status: "MATERIAL_LIBRARY_NOT_CONFIGURED", requiresInput: true, missingInputs: ["Configurar la carpeta de material en esta estación."] };
    const directory = JSON.parse(fs.readFileSync(config, "utf8").replace(/^\uFEFF/, "")).directory;
    if (!directory || !path.isAbsolute(directory)) throw new Error("MATERIAL_LIBRARY_CONFIG_INVALID");
    const library = fs.realpathSync(directory);
    if (action === "list") {
        const entries = [];
        let scanned = 0;
        const walk = (relative, depth = 0) => {
            if (depth > 5 || scanned >= 500 || entries.length >= 100) return;
            const current = path.join(library, relative);
            if (!fs.existsSync(current) || fs.lstatSync(current).isSymbolicLink()) return;
            for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
                if (++scanned > 500 || entries.length >= 100) break;
                if (entry.isSymbolicLink()) continue;
                const next = relative + "/" + entry.name;
                if (entry.isDirectory()) walk(next, depth + 1);
                else if (entry.isFile() && TYPES[path.extname(entry.name).toLowerCase()]) {
                    try { entries.push(describe(boundedFile(library, next), next, library)); } catch { /* Invalid media is not usable evidence. */ }
                }
            }
        };
        Object.keys(ROLES).forEach(role => walk(role));
        const advertisingHistory = withAdvertisingHistory(library, root, history => [...history]
            .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
            .slice(0, 30).map(({ sha256, createdAt, mimeType, creative }) => ({ sha256, createdAt, mimeType, ...(creative ? { creative } : {}) })));
        return { ok: true, status: "MATERIAL_LIBRARY_LISTED", directory: library, entries, advertisingHistory, partial: scanned >= 500 || entries.length >= 100,
            message: "Elige referencias ref exactas. image.adapt, reel.create y page.create aceptan library: y realizan la importación mecánica del original seleccionado. También puedes importar con action=import. photoRegion es una región fotográfica curada; úsala como composition.photoCrop para anuncios nuevos. Son recursos aportados, no pruebas de resultados ni publicaciones. Conserva el logo original. Exporta los outputs producidos con action=export." };
    }
    if (action === "import") {
        const relative = String(relativePath).replaceAll("\\", "/");
        if (!Object.hasOwn(ROLES, relative.split("/")[0])) throw new Error("MATERIAL_SOURCE_FOLDER_REQUIRED");
        const file = boundedFile(library, relative);
        const info = describe(file, relative, library);
        const bytes = fs.readFileSync(file);
        if (hash(bytes) !== info.sha256) throw new Error("MATERIAL_CHANGED_DURING_IMPORT");
        const importedOutput = `.jarvis-artifacts/material-library/${info.sha256}${path.extname(file).toLowerCase()}`;
        const target = path.resolve(root, importedOutput);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        // Recheck the destination so a local link cannot redirect this mechanical copy.
        if (fs.lstatSync(path.dirname(target)).isSymbolicLink() || (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())) throw new Error("MATERIAL_LINK_NOT_ALLOWED");
        fs.writeFileSync(target, bytes);
        const artifact = registerArtifact({ root, output: importedOutput, metadata: {
            type: info.role === "official_logo_source" ? "brand_logo" : "media_source", origin: "media.library", provider: "user_local_material",
            mimeType: info.mimeType, caseId, objectiveId, originalFile: relative,
            approved: true, approvedBy: "USER_CONFIGURED_LIBRARY", publishable: false
        } });
        return { ok: true, status: "MATERIAL_IMPORTED_VERIFIED", ...info, output: importedOutput, physicallyWritten: true, originalPreserved: true, artifact };
    }
    if (action === "export") {
        const artifact = findArtifact({ root, output });
        if (!artifact || !String(output).startsWith(".jarvis-artifacts/")) throw new Error("MATERIAL_EXPORT_ARTIFACT_REQUIRED");
        const file = boundedFile(path.resolve(root), output);
        const bytes = fs.readFileSync(file);
        if (hash(bytes) !== artifact.sha256) throw new Error("MATERIAL_EXPORT_ARTIFACT_CHANGED");
        const destination = path.join(library, "Salidas");
        fs.mkdirSync(destination, { recursive: true });
        if (fs.lstatSync(destination).isSymbolicLink()) throw new Error("MATERIAL_LINK_NOT_ALLOWED");
        const name = `${artifact.sha256.slice(0, 12)}-${path.basename(file)}`;
        const target = path.join(destination, name);
        if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error("MATERIAL_LINK_NOT_ALLOWED");
        if (!/^(image|video)\//.test(artifact.mimeType || "")) {
            fs.writeFileSync(target, bytes);
            return { ok: true, status: "MATERIAL_EXPORTED_VERIFIED", output, directory: library,
                relativePath: `Salidas/${name}`, bytes: bytes.length, sha256: artifact.sha256 };
        }
        return withAdvertisingHistory(library, root, (history, append) => {
            const record = advertisingRecord(artifact, `Salidas/${name}`);
            const previous = history.find(item => item.sha256 === record.sha256 ||
                (record.creativeFingerprint && item.creativeFingerprint === record.creativeFingerprint));
            if (previous) return { ok: false, status: "ADVERTISING_DUPLICATE_BLOCKED", objectiveSatisfied: false,
                error: "Esta publicidad ya fue entregada. Crear otra pieza con un mensaje y enfoque distintos.",
                previousDelivery: previous, physicallyWritten: false };
            fs.writeFileSync(target, bytes);
            append({ ...record, recordedAt: new Date().toISOString(), origin: "media.library.export" });
            return { ok: true, status: "MATERIAL_EXPORTED_VERIFIED", output, directory: library, relativePath: record.relativePath, bytes: bytes.length, sha256: artifact.sha256,
                historyRecorded: true, message: "Pieza nueva registrada en el historial local y exportada. No se publicó en redes." };
        });
    }
    throw new Error("MATERIAL_LIBRARY_ACTION_INVALID");
}
