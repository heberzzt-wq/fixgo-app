import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { registerArtifact, findArtifact } from "./jarvis-artifact-studio.js";

const TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".wav": "audio/wav", ".mp3": "audio/mpeg" };
const ROLES = { Entradas: "input", Logos: "official_logo_source", Audio: "audio", Video: "video" };
const MAX_BYTES = 100 * 1024 * 1024;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const inside = (base, file) => file.startsWith(base + path.sep);

export function officialMaterialPolicy(root = process.cwd()) {
    const file = path.resolve(root, ".jarvis-artifacts/material-library.config.json");
    return fs.existsSync(file) && JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")).officialOnly === true;
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

function describe(file, relativePath) {
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
    return { relativePath, role: ROLES[relativePath.split("/")[0]] || "output", mimeType, bytes: bytes.length, sha256: hash(bytes),
        ...(png ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : {}) };
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
                    try { entries.push(describe(boundedFile(library, next), next)); } catch { /* Invalid media is not usable evidence. */ }
                }
            }
        };
        Object.keys(ROLES).forEach(role => walk(role));
        return { ok: true, status: "MATERIAL_LIBRARY_LISTED", directory: library, entries, partial: scanned >= 500 || entries.length >= 100,
            message: "Importa los relativePath elegidos con media.library action=import. Son recursos aportados, no pruebas de resultados ni contenido publicado. No inventar archivos; conservar logo original. Las imágenes con textos provisionales o marcas requieren revisión antes de entregar." };
    }
    if (action === "import") {
        const relative = String(relativePath).replaceAll("\\", "/");
        if (!Object.hasOwn(ROLES, relative.split("/")[0])) throw new Error("MATERIAL_SOURCE_FOLDER_REQUIRED");
        const file = boundedFile(library, relative);
        const info = describe(file, relative);
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
        fs.writeFileSync(target, bytes);
        return { ok: true, status: "MATERIAL_EXPORTED_VERIFIED", output, directory: library, relativePath: `Salidas/${name}`, bytes: bytes.length, sha256: artifact.sha256,
            message: "Copia local exportada. La exportación por sí sola no certifica que la publicidad esté lista para publicar." };
    }
    throw new Error("MATERIAL_LIBRARY_ACTION_INVALID");
}
