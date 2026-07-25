const VERSION = "1.0.0-docx-contract-gate";

const SPANISH_NUMBERS = new Map([
    ["un", 1], ["una", 1], ["uno", 1], ["dos", 2], ["tres", 3],
    ["cuatro", 4], ["cinco", 5], ["seis", 6], ["siete", 7],
    ["ocho", 8], ["nueve", 9], ["diez", 10], ["once", 11],
    ["doce", 12], ["trece", 13], ["catorce", 14], ["quince", 15],
    ["dieciseis", 16], ["dieciséis", 16], ["diecisiete", 17],
    ["dieciocho", 18], ["diecinueve", 19], ["veinte", 20],
    ["veinticinco", 25], ["treinta", 30]
]);

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

function numberFromToken(value = "") {
    const cleaned = normalize(value).replace(/\s+/g, "");
    if (/^\d+$/.test(cleaned)) return Number(cleaned);
    return SPANISH_NUMBERS.get(cleaned) || 0;
}

function matchMinimum(source, patterns = []) {
    for (const pattern of patterns) {
        const match = source.match(pattern);
        if (!match) continue;
        const numeric = numberFromToken(match[1]);
        if (numeric > 0) return numeric;
    }
    return 0;
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

function extractRequiredSections(instruction = "") {
    const candidates = [];
    for (const line of text(instruction).split("\n")) {
        const match = line.match(/^\s*(\d{1,2})\.\s+(.{3,140})\s*$/);
        if (!match) continue;
        candidates.push({ number: Number(match[1]), title: match[2].trim() });
    }
    const sections = [];
    let expected = 1;
    for (const candidate of candidates) {
        if (candidate.number === expected) {
            sections.push(candidate.title);
            expected += 1;
        } else if (sections.length > 0 && candidate.number === 1) {
            break;
        }
    }
    return sections;
}

export function extractDocumentContract(instruction = "") {
    const source = text(instruction);
    const normalized = normalize(source);
    const minWords = matchMinimum(source, [
        /(?:mínimo|m[ií]nimo|no\s+menos\s+de|al\s+menos)\s+([\d.,]+|[\p{L}]+)\s+palabras/iu,
        /([\d.,]+|[\p{L}]+)\s+palabras\s+(?:mínimas|m[ií]nimas|como\s+m[ií]nimo)/iu
    ]);
    const minSections = matchMinimum(source, [
        /([\d.,]+|[\p{L}]+)\s+secciones/iu
    ]);
    const minQuestions = matchMinimum(source, [
        /(?:examen\s+de\s+)?([\d.,]+|[\p{L}]+)\s+preguntas/iu,
        /([\d.,]+|[\p{L}]+)\s+reactivos/iu
    ]);
    const minTemplates = matchMinimum(source, [
        /([\d.,]+|[\p{L}]+)\s+(?:plantillas|formatos\s+operativos)/iu
    ]);
    const minTables = matchMinimum(source, [
        /([\d.,]+|[\p{L}]+)\s+tablas/iu
    ]);
    const requiredSections = extractRequiredSections(source);
    return {
        minWords: minWords || 80,
        minSections: Math.max(minSections, requiredSections.length),
        minQuestions,
        minTemplates,
        minTables: minTables || (/tablas?\s+reales?/i.test(source) ? 1 : 0),
        requireAnswerKey: /clave\s+(?:completa\s+)?de\s+respuestas|clave\s+completa/i.test(source),
        requiredSections,
        requireCompletionMarker: true,
        sourceLength: source.length,
        normalizedInstruction: normalized
    };
}

function splitCells(line = "") {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|").map(cell => cell.trim());
}

function isTableSeparator(line = "") {
    const cells = splitCells(line);
    return cells.length >= 2 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

export function extractMarkdownTables(content = "") {
    const lines = text(content).split("\n");
    const tables = [];
    let index = 0;
    while (index < lines.length - 1) {
        if (!lines[index].includes("|") || !isTableSeparator(lines[index + 1])) {
            index += 1;
            continue;
        }
        const headers = splitCells(lines[index]);
        const rows = [];
        index += 2;
        while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
            const row = splitCells(lines[index]);
            if (row.length < 2) break;
            rows.push(row);
            index += 1;
        }
        tables.push({ headers, rows });
    }
    return tables;
}

function headingLines(content = "") {
    return text(content)
        .split("\n")
        .map(line => line.trim())
        .filter(line =>
            /^#{1,6}\s+\S/.test(line) ||
            /^\d{1,2}(?:\.\d+)*[.)]?\s+[\p{L}]/u.test(line) ||
            (/^[\p{Lu}\d][\p{Lu}\d\sÁÉÍÓÚÜÑ,:;()/-]{4,120}$/u.test(line) && !/[.!?]$/.test(line))
        );
}

function sectionPresence(content = "", requiredSections = []) {
    const headings = headingLines(content).map(normalize);
    const missing = [];
    for (const section of requiredSections) {
        const tokens = significantTokens(section);
        if (tokens.length === 0) continue;
        const present = headings.some(heading => {
            const matches = tokens.filter(token => heading.includes(token)).length;
            return matches >= Math.min(2, tokens.length);
        });
        if (!present) missing.push(section);
    }
    return { headings, missing };
}

function countNumberedItems(value = "") {
    return text(value)
        .split("\n")
        .filter(line => /^\s*(?:pregunta\s+)?\d{1,3}[.)]\s+\S/i.test(line))
        .length;
}

function questionMetrics(content = "") {
    const source = text(content);
    const evaluationIndex = source.search(/evaluaci[oó]n\s+final|examen\s+(?:final|simulacro)/i);
    const keyIndex = source.search(/clave\s+(?:completa\s+)?de\s+respuestas|respuestas\s+correctas/i);
    const questionBlock = evaluationIndex >= 0
        ? source.slice(evaluationIndex, keyIndex > evaluationIndex ? keyIndex : undefined)
        : "";
    const keyBlock = keyIndex >= 0 ? source.slice(keyIndex) : "";
    return {
        questionCount: countNumberedItems(questionBlock),
        answerKeyCount: countNumberedItems(keyBlock),
        answerKeyPresent: keyIndex >= 0
    };
}

function placeholderSignals(content = "") {
    const normalized = normalize(content);
    const wordList = words(content).map(word => normalize(word)).filter(Boolean);
    const uniqueRatio = wordList.length > 0 ? new Set(wordList).size / wordList.length : 0;
    const phraseMatch = [
        /el contenido completo .* generado por document compose/,
        /contenido generado por document compose/,
        /agregar contenido aqui/,
        /contenido pendiente/,
        /lorem ipsum/,
        /texto de relleno/
    ].find(pattern => pattern.test(normalized));
    return {
        placeholderPhrase: phraseMatch ? String(phraseMatch) : null,
        suspiciouslyShort: wordList.length < 20,
        lowLexicalDiversity: wordList.length >= 200 && uniqueRatio < 0.04,
        uniqueRatio
    };
}

export function validateDocumentBlueprint({
    content = "",
    instruction = "",
    completionMarkerPresent = false,
    tables = null
} = {}) {
    const contract = extractDocumentContract(instruction);
    const tableBlueprints = Array.isArray(tables) ? tables : extractMarkdownTables(content);
    const wordCount = words(content).length;
    const headings = headingLines(content);
    const sections = sectionPresence(content, contract.requiredSections);
    const questions = questionMetrics(content);
    const placeholders = placeholderSignals(content);
    const sectionCount = headings.length;
    const tableBlueprintCount = tableBlueprints.length;
    const templateCount = tableBlueprints.filter(table => {
        const first = normalize(table.headers.join(" "));
        return /responsable|firma|fecha|observacion|accion|autorizacion|reporte|orden|entrega|cierre|control/.test(first);
    }).length;
    const failures = [];

    if (!completionMarkerPresent) failures.push("DOCUMENT_COMPLETION_MARKER_MISSING");
    if (wordCount < contract.minWords) failures.push(`DOCUMENT_WORD_COUNT_BELOW_MINIMUM:${wordCount}:${contract.minWords}`);
    if (contract.minSections > 0 && sectionCount < contract.minSections) failures.push(`DOCUMENT_SECTION_COUNT_BELOW_MINIMUM:${sectionCount}:${contract.minSections}`);
    if (sections.missing.length > 0) failures.push(`DOCUMENT_REQUIRED_SECTIONS_MISSING:${sections.missing.join("|")}`);
    if (contract.minTables > 0 && tableBlueprintCount < contract.minTables) failures.push(`DOCUMENT_TABLE_COUNT_BELOW_MINIMUM:${tableBlueprintCount}:${contract.minTables}`);
    if (contract.minQuestions > 0 && questions.questionCount < contract.minQuestions) failures.push(`DOCUMENT_QUESTION_COUNT_BELOW_MINIMUM:${questions.questionCount}:${contract.minQuestions}`);
    if (contract.requireAnswerKey && !questions.answerKeyPresent) failures.push("DOCUMENT_ANSWER_KEY_MISSING");
    if (contract.requireAnswerKey && contract.minQuestions > 0 && questions.answerKeyCount < contract.minQuestions) failures.push(`DOCUMENT_ANSWER_KEY_INCOMPLETE:${questions.answerKeyCount}:${contract.minQuestions}`);
    if (contract.minTemplates > 0 && templateCount < contract.minTemplates) failures.push(`DOCUMENT_TEMPLATE_COUNT_BELOW_MINIMUM:${templateCount}:${contract.minTemplates}`);
    if (placeholders.placeholderPhrase) failures.push("DOCUMENT_PLACEHOLDER_DETECTED");
    if (placeholders.suspiciouslyShort) failures.push("DOCUMENT_CONTENT_SUSPICIOUSLY_SHORT");
    if (placeholders.lowLexicalDiversity) failures.push("DOCUMENT_CONTENT_LOW_DIVERSITY");

    return {
        ok: failures.length === 0,
        version: VERSION,
        failures,
        contract,
        wordCount,
        sectionCount,
        headingCount: headings.length,
        tableBlueprintCount,
        templateCount,
        questionCount: questions.questionCount,
        answerKeyCount: questions.answerKeyCount,
        answerKeyPresent: questions.answerKeyPresent,
        completionMarkerPresent,
        compositionComplete: failures.length === 0,
        validationPassed: failures.length === 0,
        missingSections: sections.missing,
        placeholderDetected: Boolean(placeholders.placeholderPhrase),
        lexicalDiversity: placeholders.uniqueRatio,
        tables: tableBlueprints
    };
}

export function describeDocumentValidator() {
    return {
        ok: true,
        version: VERSION,
        checks: [
            "completion-marker",
            "word-count",
            "required-sections",
            "real-table-blueprints",
            "questions-and-answer-key",
            "operational-templates",
            "placeholder-and-diversity"
        ]
    };
}
