import fs from "node:fs";

const VERSION = "1.0.0-docx-post-write-gate";

function text(value = "") {
    return String(value ?? "").replace(/\r\n/g, "\n");
}

function normalize(value = "") {
    return text(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function words(value = "") {
    return text(value).match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) || [];
}

function decodeXml(value = "") {
    return String(value)
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&apos;", "'")
        .replaceAll("&amp;", "&");
}

function significantTokens(value = "") {
    const stop = new Set([
        "de", "del", "la", "las", "el", "los", "y", "o", "para", "por",
        "con", "sin", "un", "una", "en", "al", "e", "a"
    ]);
    return normalize(value)
        .split(/\s+/)
        .filter(token => token.length > 2 && !stop.has(token));
}

function splitMarkdownCells(line = "") {
    return String(line)
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map(cell => cell.trim());
}

function isMarkdownSeparator(line = "") {
    const cells = splitMarkdownCells(line);
    return cells.length >= 2 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function isUpperHeading(line = "") {
    const value = String(line).trim();
    return value.length >= 5 &&
        value.length <= 140 &&
        /^[\p{Lu}\d][\p{Lu}\d\sÁÉÍÓÚÜÑ,:;()/-]+$/u.test(value) &&
        !/[.!?]$/.test(value);
}

function headingDescriptor(line = "") {
    const value = String(line).trim();
    const markdown = value.match(/^(#{1,6})\s+(.+)$/);
    if (markdown) {
        return {
            level: Math.min(markdown[1].length, 6),
            value: markdown[2].trim()
        };
    }
    if (
        /^\d{1,2}(?:\.\d+)*[.)]?\s+[\p{L}]/u.test(value) &&
        !/[¿?]/.test(value) &&
        value.length <= 160
    ) {
        const depth = Math.min((value.match(/\./g) || []).length + 1, 6);
        return { level: depth, value };
    }
    if (isUpperHeading(value)) return { level: 2, value };
    return null;
}

function nextNonEmptyLine(lines = [], start = 0) {
    for (let index = Math.max(0, Number(start) || 0); index < lines.length; index += 1) {
        if (String(lines[index] ?? "").trim()) return index;
    }
    return -1;
}

function parseMarkdownBlocks(content = "") {
    const lines = text(content).split("\n");
    const blocks = [];
    let index = 0;
    while (index < lines.length) {
        const line = lines[index];
        const separatorIndex = line.includes("|")
            ? nextNonEmptyLine(lines, index + 1)
            : -1;
        if (
            line.includes("|") &&
            separatorIndex >= 0 &&
            isMarkdownSeparator(lines[separatorIndex])
        ) {
            const headers = splitMarkdownCells(line);
            const rows = [];
            let rowIndex = nextNonEmptyLine(lines, separatorIndex + 1);
            while (
                rowIndex >= 0 &&
                lines[rowIndex].includes("|") &&
                !isMarkdownSeparator(lines[rowIndex])
            ) {
                const row = splitMarkdownCells(lines[rowIndex]);
                if (row.length < 2) break;
                rows.push(row);
                rowIndex = nextNonEmptyLine(lines, rowIndex + 1);
            }
            blocks.push({ type: "table", headers, rows });
            index = rowIndex >= 0 ? rowIndex : lines.length;
            continue;
        }
        const heading = headingDescriptor(line);
        if (heading) blocks.push({ type: "heading", ...heading });
        else if (/^\s*[-*]\s+\S/.test(line)) {
            blocks.push({ type: "bullet", value: line.replace(/^\s*[-*]\s+/, "").trim() });
        }
        else if (line.trim()) blocks.push({ type: "paragraph", value: line.trim() });
        else blocks.push({ type: "blank" });
        index += 1;
    }
    return blocks;
}

function headingLevel(docx, level) {
    const names = [
        docx.HeadingLevel.HEADING_1,
        docx.HeadingLevel.HEADING_2,
        docx.HeadingLevel.HEADING_3,
        docx.HeadingLevel.HEADING_4,
        docx.HeadingLevel.HEADING_5,
        docx.HeadingLevel.HEADING_6
    ];
    return names[Math.max(0, Math.min(Number(level) - 1, names.length - 1))];
}

function cellParagraph(docx, value, bold = false) {
    return new docx.Paragraph({
        children: [new docx.TextRun({ text: String(value ?? ""), bold })],
        spacing: { after: 40 }
    });
}

export async function buildDocxArtifactBuffer({ title = "Documento Jarvis", content = "" } = {}) {
    const docx = await import("docx");
    const blocks = parseMarkdownBlocks(content);
    const children = [
        new docx.Paragraph({
            text: String(title || "Documento Jarvis"),
            heading: docx.HeadingLevel.TITLE,
            spacing: { after: 320 }
        })
    ];

    for (const block of blocks) {
        if (block.type === "table") {
            const width = Math.max(block.headers.length, ...block.rows.map(row => row.length));
            const normalizeRow = row => Array.from({ length: width }, (_, index) => row[index] ?? "");
            const tableRows = [
                new docx.TableRow({
                    tableHeader: true,
                    children: normalizeRow(block.headers).map(value =>
                        new docx.TableCell({
                            children: [cellParagraph(docx, value, true)]
                        })
                    )
                }),
                ...block.rows.map(row =>
                    new docx.TableRow({
                        children: normalizeRow(row).map(value =>
                            new docx.TableCell({
                                children: [cellParagraph(docx, value)]
                            })
                        )
                    })
                )
            ];
            children.push(new docx.Table({
                rows: tableRows,
                width: { size: 100, type: docx.WidthType.PERCENTAGE }
            }));
            children.push(new docx.Paragraph({ text: "", spacing: { after: 120 } }));
            continue;
        }
        if (block.type === "heading") {
            children.push(new docx.Paragraph({
                text: block.value,
                heading: headingLevel(docx, block.level),
                spacing: { before: 220, after: 120 },
                pageBreakBefore: block.level === 1 && children.length > 1
            }));
            continue;
        }
        if (block.type === "bullet") {
            children.push(new docx.Paragraph({
                text: block.value,
                bullet: { level: 0 },
                spacing: { after: 80 }
            }));
            continue;
        }
        if (block.type === "paragraph") {
            children.push(new docx.Paragraph({
                text: block.value,
                spacing: { after: 120 }
            }));
            continue;
        }
        children.push(new docx.Paragraph({ text: "", spacing: { after: 60 } }));
    }

    const document = new docx.Document({ sections: [{ children }] });
    const buffer = await docx.Packer.toBuffer(document);
    return {
        ok: true,
        version: VERSION,
        buffer,
        blocks: blocks.length,
        sourceTableCount: blocks.filter(block => block.type === "table").length,
        sourceHeadingCount: blocks.filter(block => block.type === "heading").length
    };
}

function extractTextNodes(xml = "") {
    return [...String(xml).matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map(match => decodeXml(match[1]))
        .join("");
}

function extractParagraphs(xml = "") {
    return [...String(xml).matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)]
        .map(match => {
            const raw = match[0];
            const style = raw.match(/<w:pStyle[^>]*w:val="([^"]+)"/i)?.[1] || "";
            return { text: extractTextNodes(raw).trim(), style };
        })
        .filter(item => item.text);
}

function extractTables(xml = "") {
    return [...String(xml).matchAll(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g)]
        .map(tableMatch => {
            const rows = [...tableMatch[0].matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)]
                .map(rowMatch =>
                    [...rowMatch[0].matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)]
                        .map(cellMatch => extractTextNodes(cellMatch[0]).trim())
                );
            return {
                headers: rows[0] || [],
                rows: rows.slice(1)
            };
        });
}

function sectionPresence(headings = [], requiredSections = []) {
    const normalizedHeadings = headings.map(normalize);
    const missing = [];
    for (const section of Array.isArray(requiredSections) ? requiredSections : []) {
        const tokens = significantTokens(section);
        if (tokens.length === 0) continue;
        const present = normalizedHeadings.some(heading => {
            const matches = tokens.filter(token => heading.includes(token)).length;
            return matches >= Math.min(2, tokens.length);
        });
        if (!present) missing.push(section);
    }
    return missing;
}

function countNumberedItems(lines = []) {
    return lines.filter(line => /^\s*(?:pregunta\s+)?\d{1,3}[.)]\s+\S/i.test(line)).length;
}

function questionMetrics(lines = []) {
    const evaluationIndex = lines.findIndex(line => /evaluaci[oó]n\s+final|examen\s+(?:final|simulacro)/i.test(line));
    const keyIndex = lines.findIndex(line => /clave\s+(?:completa\s+)?de\s+respuestas|respuestas\s+correctas/i.test(line));
    const questionLines = evaluationIndex >= 0
        ? lines.slice(evaluationIndex + 1, keyIndex > evaluationIndex ? keyIndex : undefined)
        : [];
    const answerLines = keyIndex >= 0 ? lines.slice(keyIndex + 1) : [];
    return {
        questionCount: countNumberedItems(questionLines),
        answerKeyCount: countNumberedItems(answerLines),
        answerKeyPresent: keyIndex >= 0
    };
}

function placeholderDetected(value = "") {
    const normalized = normalize(value);
    return [
        /el contenido completo .* generado por document compose/,
        /contenido generado por document compose/,
        /agregar contenido aqui/,
        /contenido pendiente/,
        /lorem ipsum/,
        /texto de relleno/
    ].some(pattern => pattern.test(normalized));
}

function templateTableCount(tables = []) {
    return tables.filter(table => {
        const headers = normalize((table.headers || []).join(" "));
        return /responsable|firma|fecha|observacion|accion|autorizacion|reporte|orden|entrega|cierre|control/.test(headers);
    }).length;
}

export async function validateDocxArtifactFile({
    file = "",
    contract = {},
    expectedValidation = {}
} = {}) {
    const buffer = fs.readFileSync(file);
    const JSZip = (await import("jszip")).default;
    const archive = await JSZip.loadAsync(buffer, { checkCRC32: true, createFolders: false });
    const documentEntry = archive.file("word/document.xml");
    if (!documentEntry) {
        return {
            ok: false,
            version: VERSION,
            failures: ["DOCX_DOCUMENT_XML_MISSING"],
            bytes: buffer.length
        };
    }
    const xml = await documentEntry.async("string");
    const paragraphs = extractParagraphs(xml);
    const tables = extractTables(xml);
    const lines = paragraphs.map(item => item.text).filter(Boolean);
    const documentText = lines.join("\n");
    const headingParagraphs = paragraphs.filter(item =>
        /^(?:heading[1-6]|title|titulo[1-6]?)$/i.test(item.style) ||
        headingDescriptor(item.text)
    );
    const headings = headingParagraphs.map(item => item.text);
    const questions = questionMetrics(lines);
    const actual = {
        bytes: buffer.length,
        paragraphCount: paragraphs.length,
        wordCount: words(documentText).length,
        headingCount: headingParagraphs.length,
        sectionCount: headingParagraphs.length,
        tableCount: tables.length,
        templateCount: templateTableCount(tables),
        questionCount: questions.questionCount,
        answerKeyCount: questions.answerKeyCount,
        answerKeyPresent: questions.answerKeyPresent,
        placeholderDetected: placeholderDetected(documentText),
        missingSections: sectionPresence(headings, contract?.requiredSections || [])
    };
    const required = {
        minWords: Number(contract?.minWords || 0),
        minSections: Math.max(
            Number(contract?.minSections || 0),
            Number(expectedValidation?.sectionCount || 0)
        ),
        minTables: Math.max(
            Number(contract?.minTables || 0),
            Number(expectedValidation?.tableBlueprintCount || 0)
        ),
        minTemplates: Math.max(
            Number(contract?.minTemplates || 0),
            Number(expectedValidation?.templateCount || 0)
        ),
        minQuestions: Math.max(
            Number(contract?.minQuestions || 0),
            Number(expectedValidation?.questionCount || 0)
        ),
        minAnswers: Math.max(
            contract?.requireAnswerKey ? Number(contract?.minQuestions || 0) : 0,
            Number(expectedValidation?.answerKeyCount || 0)
        ),
        requireAnswerKey: contract?.requireAnswerKey === true || Number(expectedValidation?.answerKeyCount || 0) > 0
    };
    const failures = [];
    if (actual.bytes < 1000) failures.push(`DOCX_BYTES_SUSPICIOUSLY_SMALL:${actual.bytes}`);
    if (actual.paragraphCount < 2) failures.push(`DOCX_PARAGRAPH_COUNT_TOO_LOW:${actual.paragraphCount}`);
    if (actual.wordCount < required.minWords) failures.push(`DOCX_WORD_COUNT_BELOW_MINIMUM:${actual.wordCount}:${required.minWords}`);
    if (actual.sectionCount < required.minSections) failures.push(`DOCX_SECTION_COUNT_BELOW_MINIMUM:${actual.sectionCount}:${required.minSections}`);
    if (actual.tableCount < required.minTables) failures.push(`DOCX_TABLE_COUNT_BELOW_MINIMUM:${actual.tableCount}:${required.minTables}`);
    if (actual.templateCount < required.minTemplates) failures.push(`DOCX_TEMPLATE_COUNT_BELOW_MINIMUM:${actual.templateCount}:${required.minTemplates}`);
    if (actual.questionCount < required.minQuestions) failures.push(`DOCX_QUESTION_COUNT_BELOW_MINIMUM:${actual.questionCount}:${required.minQuestions}`);
    if (required.requireAnswerKey && !actual.answerKeyPresent) failures.push("DOCX_ANSWER_KEY_MISSING");
    if (actual.answerKeyCount < required.minAnswers) failures.push(`DOCX_ANSWER_KEY_INCOMPLETE:${actual.answerKeyCount}:${required.minAnswers}`);
    if (actual.missingSections.length > 0) failures.push(`DOCX_REQUIRED_SECTIONS_MISSING:${actual.missingSections.join("|")}`);
    if (actual.placeholderDetected) failures.push("DOCX_PLACEHOLDER_DETECTED");
    if (expectedValidation?.validationPassed !== true) failures.push("DOCX_SOURCE_BLUEPRINT_NOT_VALIDATED");

    return {
        ok: failures.length === 0,
        version: VERSION,
        failures,
        required,
        actual,
        documentText,
        tables
    };
}

export function describeDocxArtifactGate() {
    return {
        ok: true,
        version: VERSION,
        checks: [
            "post-write-ooxml-open",
            "paragraphs-and-words",
            "heading-and-section-count",
            "real-word-tables",
            "questions-and-answer-key",
            "operational-templates",
            "placeholder-rejection"
        ]
    };
}
