import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const JARVIS_DOCUMENT_EXTRACTOR_VERSION =
    "1.0.0-source-scoped-office-extraction";

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
    ".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml",
    ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".css", ".html",
    ".py", ".java", ".kt", ".c", ".h", ".cpp", ".hpp", ".sql"
]);

const MIME_BY_EXTENSION = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".xml": "application/xml",
    ".yaml": "text/yaml",
    ".yml": "text/yaml",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
};

function decodeXml(value = "") {
    return String(value || "")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&apos;", "'")
        .replaceAll("&amp;", "&");
}

function cleanText(value = "") {
    return String(value ?? "")
        .replace(/\r\n?/g, "\n")
        .replace(/[\t ]+\n/g, "\n")
        .replace(/\n{4,}/g, "\n\n\n")
        .trim();
}

function sha256(buffer) {
    return createHash("sha256")
        .update(buffer)
        .digest("hex");
}

function normalizeArtifactPath(output = "", root = process.cwd()) {
    const candidate = String(output || "")
        .trim()
        .replaceAll("\\", "/");
    if (!candidate) throw new Error("ARTIFACT_OUTPUT_REQUIRED");
    if (path.isAbsolute(candidate) || candidate.includes("../") || candidate.includes("//")) {
        throw new Error("ARTIFACT_PATH_INVALID");
    }
    if (!candidate.startsWith(".jarvis-artifacts/")) {
        throw new Error("ARTIFACT_PATH_OUTSIDE_LEDGER");
    }
    const repoRoot = path.resolve(root);
    const target = path.resolve(repoRoot, candidate);
    if (!target.startsWith(repoRoot + path.sep)) {
        throw new Error("ARTIFACT_PATH_OUTSIDE_ROOT");
    }
    if (!fs.existsSync(target)) throw new Error("ARTIFACT_NOT_FOUND");
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) throw new Error("ARTIFACT_SYMLINK_BLOCKED");
    if (!stat.isFile()) throw new Error("ARTIFACT_NOT_FILE");
    if (stat.size < 1) throw new Error("ARTIFACT_EMPTY");
    if (stat.size > MAX_DOCUMENT_BYTES) throw new Error("ARTIFACT_TOO_LARGE_FOR_EXTRACTION");
    return { target, candidate, stat };
}

function csvRow(line = "") {
    const cells = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"') {
            if (quoted && line[index + 1] === '"') {
                current += '"';
                index += 1;
            }
            else {
                quoted = !quoted;
            }
            continue;
        }
        if (character === "," && !quoted) {
            cells.push(current.trim());
            current = "";
            continue;
        }
        current += character;
    }
    cells.push(current.trim());
    return cells;
}

function csvTable(text = "") {
    const rows = cleanText(text)
        .split("\n")
        .filter(line => line.trim())
        .slice(0, 5000)
        .map(csvRow);
    if (rows.length < 2) return [];
    return [{
        name: "CSV",
        headers: rows[0],
        rows: rows.slice(1)
    }];
}

function visibleTextFromWordXml(xml = "") {
    const paragraphs = [...String(xml).matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)]
        .map(paragraph =>
            [...paragraph[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
                .map(match => decodeXml(match[1]))
                .join("")
                .trim()
        )
        .filter(Boolean);
    return cleanText(paragraphs.join("\n"));
}

function wordTables(xml = "") {
    return [...String(xml).matchAll(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g)]
        .map((tableMatch, tableIndex) => {
            const rows = [...tableMatch[0].matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)]
                .map(rowMatch =>
                    [...rowMatch[0].matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)]
                        .map(cellMatch =>
                            [...cellMatch[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
                                .map(match => decodeXml(match[1]))
                                .join("")
                                .trim()
                        )
                );
            return {
                name: `Tabla ${tableIndex + 1}`,
                headers: rows[0] || [],
                rows: rows.slice(1)
            };
        })
        .filter(table => table.headers.length || table.rows.length);
}

async function extractDocx(buffer) {
    const JSZip = (await import("jszip")).default;
    const archive = await JSZip.loadAsync(buffer, {
        checkCRC32: true,
        createFolders: false
    });
    const documentEntry = archive.file("word/document.xml");
    if (!documentEntry) throw new Error("DOCX_DOCUMENT_XML_MISSING");
    const xml = await documentEntry.async("string");
    const text = visibleTextFromWordXml(xml);
    const tables = wordTables(xml);

    const secondaryParts = [
        "word/footnotes.xml",
        "word/endnotes.xml",
        "word/comments.xml"
    ];
    const secondaryText = [];
    for (const part of secondaryParts) {
        const entry = archive.file(part);
        if (!entry) continue;
        const partXml = await entry.async("string");
        const partText = visibleTextFromWordXml(partXml);
        if (partText) secondaryText.push({ part, text: partText });
    }

    return {
        documentType: "docx",
        coverageUnit: "document-body",
        pages: [{
            pageNumber: 1,
            label: "Cuerpo del documento",
            text,
            tables,
            images: [],
            regions: secondaryText,
            confidence: text || tables.length ? 1 : 0
        }],
        metadata: {
            logicalParts: 1,
            physicalPageCountKnown: false,
            secondaryParts: secondaryText.map(item => item.part),
            extractionScope: "visible-wordprocessingml-body-plus-notes"
        }
    };
}

function presentationRelationshipMap(xml = "") {
    const map = new Map();
    for (const match of String(xml).matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/g)) {
        const attrs = match[1] || "";
        const id = attrs.match(/\bId="([^"]+)"/i)?.[1] || "";
        const target = attrs.match(/\bTarget="([^"]+)"/i)?.[1] || "";
        if (id && target) map.set(id, target);
    }
    return map;
}

function presentationSlideOrder(presentationXml = "", relsXml = "") {
    const relationships = presentationRelationshipMap(relsXml);
    return [...String(presentationXml).matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"[^>]*\/?>(?:<\/p:sldId>)?/g)]
        .map(match => relationships.get(match[1]) || "")
        .filter(Boolean)
        .map(target => {
            const normalized = target.replace(/^\.\//, "");
            return normalized.startsWith("ppt/")
                ? normalized
                : `ppt/${normalized.replace(/^\.\.\//, "")}`;
        });
}

function slideParagraphs(xml = "") {
    return [...String(xml).matchAll(/<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/g)]
        .map(paragraph =>
            [...paragraph[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
                .map(match => decodeXml(match[1]))
                .join("")
                .trim()
        )
        .filter(Boolean);
}

function slideTables(xml = "") {
    return [...String(xml).matchAll(/<a:tbl(?:\s[^>]*)?>[\s\S]*?<\/a:tbl>/g)]
        .map((tableMatch, tableIndex) => {
            const rows = [...tableMatch[0].matchAll(/<a:tr(?:\s[^>]*)?>[\s\S]*?<\/a:tr>/g)]
                .map(rowMatch =>
                    [...rowMatch[0].matchAll(/<a:tc(?:\s[^>]*)?>[\s\S]*?<\/a:tc>/g)]
                        .map(cellMatch =>
                            [...cellMatch[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
                                .map(match => decodeXml(match[1]))
                                .join("")
                                .trim()
                        )
                );
            return {
                name: `Tabla ${tableIndex + 1}`,
                headers: rows[0] || [],
                rows: rows.slice(1)
            };
        })
        .filter(table => table.headers.length || table.rows.length);
}

async function extractPptx(buffer) {
    const JSZip = (await import("jszip")).default;
    const archive = await JSZip.loadAsync(buffer, {
        checkCRC32: true,
        createFolders: false
    });
    const presentationEntry = archive.file("ppt/presentation.xml");
    const relsEntry = archive.file("ppt/_rels/presentation.xml.rels");
    let slidePaths = [];
    if (presentationEntry && relsEntry) {
        const [presentationXml, relsXml] = await Promise.all([
            presentationEntry.async("string"),
            relsEntry.async("string")
        ]);
        slidePaths = presentationSlideOrder(presentationXml, relsXml);
    }
    if (!slidePaths.length) {
        slidePaths = Object.keys(archive.files)
            .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
            .sort((left, right) => {
                const a = Number(left.match(/slide(\d+)\.xml/i)?.[1] || 0);
                const b = Number(right.match(/slide(\d+)\.xml/i)?.[1] || 0);
                return a - b;
            });
    }
    if (!slidePaths.length) throw new Error("PPTX_SLIDES_MISSING");

    const pages = [];
    for (let index = 0; index < slidePaths.length; index += 1) {
        const entry = archive.file(slidePaths[index]);
        if (!entry) continue;
        const xml = await entry.async("string");
        const paragraphs = slideParagraphs(xml);
        const tables = slideTables(xml);
        pages.push({
            pageNumber: index + 1,
            label: `Diapositiva ${index + 1}`,
            text: cleanText(paragraphs.join("\n")),
            tables,
            images: [],
            regions: [],
            confidence: paragraphs.length || tables.length ? 1 : 0
        });
    }

    return {
        documentType: "pptx",
        coverageUnit: "slide",
        pages,
        metadata: {
            logicalParts: pages.length,
            physicalPageCountKnown: true,
            extractionScope: "ordered-visible-slide-text-and-tables"
        }
    };
}

function cellDisplayValue(cell) {
    const value = cell?.value;
    if (value == null) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") {
        if (Array.isArray(value?.richText)) {
            return value.richText.map(part => part?.text || "").join("");
        }
        if (typeof value?.formula === "string") {
            const result = value?.result == null ? "" : String(value.result);
            return result
                ? `=${value.formula} => ${result}`
                : `=${value.formula}`;
        }
        if (value?.text != null) return String(value.text);
        if (value?.hyperlink) return String(value.text || value.hyperlink);
        try {
            return JSON.stringify(value);
        }
        catch {
            return String(value);
        }
    }
    return String(value);
}

async function extractXlsx(buffer) {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    if (!workbook.worksheets.length) throw new Error("XLSX_WORKSHEETS_MISSING");

    const pages = workbook.worksheets.map((worksheet, sheetIndex) => {
        const rows = [];
        worksheet.eachRow({ includeEmpty: false }, row => {
            const values = [];
            const maxColumn = Math.max(1, row.cellCount || row.actualCellCount || 1);
            for (let column = 1; column <= maxColumn; column += 1) {
                values.push(cellDisplayValue(row.getCell(column)));
            }
            while (values.length && !values[values.length - 1]) values.pop();
            if (values.some(Boolean)) rows.push(values);
        });
        const text = rows.map(row => row.join("\t")).join("\n");
        return {
            pageNumber: sheetIndex + 1,
            label: worksheet.name,
            text: cleanText(text),
            tables: rows.length
                ? [{
                    name: worksheet.name,
                    headers: rows[0] || [],
                    rows: rows.slice(1)
                }]
                : [],
            images: [],
            regions: [],
            confidence: rows.length ? 1 : 0
        };
    });

    return {
        documentType: "xlsx",
        coverageUnit: "worksheet",
        pages,
        metadata: {
            logicalParts: pages.length,
            physicalPageCountKnown: false,
            worksheetNames: pages.map(page => page.label),
            extractionScope: "all-used-worksheet-cells-with-formulas-and-results"
        }
    };
}

async function extractPdf(buffer) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({
        data: new Uint8Array(buffer),
        disableWorker: true,
        useSystemFonts: true
    });
    const document = await task.promise;
    const pages = [];
    for (let index = 1; index <= document.numPages; index += 1) {
        const page = await document.getPage(index);
        const content = await page.getTextContent();
        const text = cleanText(
            (content.items || [])
                .map(item => typeof item?.str === "string" ? item.str : "")
                .filter(Boolean)
                .join(" ")
        );
        pages.push({
            pageNumber: index,
            label: `Página ${index}`,
            text,
            tables: [],
            images: [],
            regions: [],
            confidence: text ? 1 : 0
        });
        page.cleanup?.();
    }
    await document.destroy?.();
    return {
        documentType: "pdf",
        coverageUnit: "page",
        pages,
        metadata: {
            logicalParts: pages.length,
            physicalPageCountKnown: true,
            extractionScope: "pdf-text-layer",
            scannedPagesRemainUnverifiedWithout-visual-analysis": true
        }
    };
}

function textDocument(buffer, extension) {
    const text = buffer.toString("utf8");
    if (/\u0000/.test(text)) throw new Error("TEXT_DOCUMENT_BINARY_CONTENT");
    return {
        documentType: extension.slice(1) || "text",
        coverageUnit: "document",
        pages: [{
            pageNumber: 1,
            label: "Documento",
            text: cleanText(text),
            tables: extension === ".csv" ? csvTable(text) : [],
            images: [],
            regions: [],
            confidence: text.trim() ? 1 : 0
        }],
        metadata: {
            logicalParts: 1,
            physicalPageCountKnown: false,
            extractionScope: extension === ".csv"
                ? "complete-utf8-text-plus-csv-table"
                : "complete-utf8-text"
        }
    };
}

export function describeJarvisDocumentExtractor() {
    return {
        ok: true,
        version: JARVIS_DOCUMENT_EXTRACTOR_VERSION,
        maxBytes: MAX_DOCUMENT_BYTES,
        extensions: [
            ...TEXT_EXTENSIONS,
            ".pdf", ".docx", ".xlsx", ".pptx"
        ],
        readOnly: true,
        sourceHashRequired: true
    };
}

export async function extractJarvisDocumentArtifact({
    output = "",
    sourceName = "",
    mimeType = "",
    root = process.cwd()
} = {}) {
    const resolved = normalizeArtifactPath(output, root);
    const extension = path.extname(sourceName || resolved.candidate).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension) && ![".pdf", ".docx", ".xlsx", ".pptx"].includes(extension)) {
        return {
            ok: false,
            status: "DOCUMENT_EXTRACTION_TYPE_UNSUPPORTED",
            error: "DOCUMENT_EXTRACTION_TYPE_UNSUPPORTED",
            sourceName: sourceName || path.basename(resolved.candidate),
            extension
        };
    }

    const buffer = fs.readFileSync(resolved.target);
    const digest = sha256(buffer);
    let extraction;
    if (TEXT_EXTENSIONS.has(extension)) extraction = textDocument(buffer, extension);
    else if (extension === ".docx") extraction = await extractDocx(buffer);
    else if (extension === ".xlsx") extraction = await extractXlsx(buffer);
    else if (extension === ".pptx") extraction = await extractPptx(buffer);
    else extraction = await extractPdf(buffer);

    const canonicalMimeType = MIME_BY_EXTENSION[extension] || String(mimeType || "application/octet-stream");
    const pages = Array.isArray(extraction.pages) ? extraction.pages : [];
    const analyzableParts = pages.filter(page =>
        String(page?.text || "").trim() ||
        (Array.isArray(page?.tables) && page.tables.length > 0)
    ).length;

    return {
        ok: true,
        status: "DOCUMENT_EXTRACTION_READY",
        version: JARVIS_DOCUMENT_EXTRACTOR_VERSION,
        readOnly: true,
        output: resolved.candidate,
        sourceName: sourceName || path.basename(resolved.candidate),
        mimeType: canonicalMimeType,
        extension,
        bytes: buffer.length,
        sha256: digest,
        documentType: extraction.documentType,
        coverageUnit: extraction.coverageUnit,
        pages,
        metadata: {
            ...(extraction.metadata || {}),
            extractedParts: pages.length,
            analyzableParts,
            exhaustiveLogicalExtraction: pages.length > 0 && analyzableParts === pages.length
        },
        policy: {
            sourceBytesHashed: true,
            sourceScoped: true,
            noSyntheticText: true,
            physicalPageClaimsRequirePhysicalPageCount: true,
            unreadablePartsRemainUnknown: true
        }
    };
}
