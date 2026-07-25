const VERSION = "1.1.0-docx-quantitative-gate";

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
    const normalizedRequirements =
        normalize(
            source
                .split("\n")
                .filter(line =>
                    !/^\s*\d{1,2}\.\s+/.test(line)
                )
                .join("\n")
        );
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
    const minVehicles = matchMinimum(normalizedRequirements, [
        /(?:inventario|lista|padron)\s+de\s+([\d.]+|[a-z]+)\s+vehiculos/iu
    ]);
    const minParts = matchMinimum(normalizedRequirements, [
        /(?:catalogo|lista|control)\s+de\s+([\d.]+|[a-z]+)\s+refacciones/iu,
        /([\d.]+|[a-z]+)\s+refacciones/iu
    ]);
    const minKpis = matchMinimum(normalizedRequirements, [
        /([\d.]+|[a-z]+)\s+(?:indicadores\s+)?kpi/iu
    ]);
    const implementationDays = matchMinimum(normalizedRequirements, [
        /plan\s+de\s+implementacion\s+de\s+([\d.]+|[a-z]+)\s+dias/iu
    ]);
    const requiredSections = extractRequiredSections(source);
    return {
        minWords: minWords || 80,
        minSections: Math.max(minSections, requiredSections.length),
        minQuestions,
        minTemplates,
        minTables: minTables || (/tablas?\s+reales?/i.test(source) ? 1 : 0),
        minVehicles,
        minParts,
        minKpis,
        implementationDays,
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
        let contextHeading = "";
        for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
            const candidate = String(lines[cursor] || "").trim();
            if (!candidate) continue;
            if (
                /^#{1,6}\s+\S/.test(candidate) ||
                /^\d{1,2}(?:\.\d+)*[.)]?\s+[\p{L}]/u.test(candidate)
            ) {
                contextHeading = candidate.replace(/^#{1,6}\s+/, "").trim();
            }
            break;
        }
        index += 2;
        while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
            const row = splitCells(lines[index]);
            if (row.length < 2) break;
            rows.push(row);
            index += 1;
        }
        tables.push({ headers, rows, contextHeading });
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

function numberedItem(line = "") {
    const match = String(line).match(
        /^\s*(?:pregunta\s+)?(\d{1,3})[.)]\s+(.+)/i
    );
    if (!match) return null;
    return {
        number: Number(match[1]),
        value: match[2].trim()
    };
}

function countConsecutiveItems(lines = [], {
    requireQuestion = false
} = {}) {
    let expected = 1;
    let count = 0;
    let started = false;
    for (const line of lines) {
        const item = numberedItem(line);
        if (!item) {
            if (started && String(line || "").trim()) break;
            continue;
        }
        if (item.number !== expected) {
            if (started) break;
            continue;
        }
        if (
            requireQuestion &&
            !/[¿?]/.test(item.value)
        ) {
            if (started) break;
            continue;
        }
        started = true;
        count += 1;
        expected += 1;
    }
    return count;
}

function questionMetrics(content = "") {
    const lines = text(content).split("\n");
    const keyIndex = lines.findIndex(line =>
        /clave\s+(?:completa\s+)?de\s+respuestas|respuestas\s+correctas/i.test(line)
    );
    const evaluationLimit =
        keyIndex >= 0
            ? keyIndex
            : lines.length;
    let evaluationIndex = -1;
    for (
        let index = 0;
        index < evaluationLimit;
        index += 1
    ) {
        if (
            /evaluaci[oó]n\s+final|examen\s+(?:final|simulacro)|examen\s+de\s+\d+\s+preguntas/i
                .test(lines[index])
        ) {
            evaluationIndex = index;
        }
    }
    const questionLines =
        evaluationIndex >= 0
            ? lines.slice(
                evaluationIndex + 1,
                keyIndex > evaluationIndex
                    ? keyIndex
                    : lines.length
            )
            : [];
    const answerLines =
        keyIndex >= 0
            ? lines.slice(keyIndex + 1)
            : [];
    return {
        questionCount:
            countConsecutiveItems(
                questionLines,
                { requireQuestion: true }
            ),
        answerKeyCount:
            countConsecutiveItems(
                answerLines
            ),
        answerKeyPresent: keyIndex >= 0
    };
}

function normalizedHeaders(table = {}) {
    return normalize(
        Array.isArray(table?.headers)
            ? table.headers.join(" ")
            : ""
    );
}

function tableWithHeaders(tables = [], required = []) {
    return tables.find(table => {
        const headers = normalizedHeaders(table);
        return required.every(token =>
            headers.includes(token)
        );
    }) || null;
}

function operationalTemplateCount(tables = []) {
    return tables.filter(table => {
        const heading =
            normalize(
                table?.contextHeading ||
                ""
            );
        const headers =
            normalizedHeaders(table);
        const signatureCount = [
            "responsable",
            "firma",
            "fecha",
            "observacion",
            "accion",
            "autorizacion",
            "cierre"
        ].filter(token =>
            headers.includes(token)
        ).length;
        return (
            /(?:^|\s)(?:formato|plantilla)(?:\s|$)/
                .test(heading) &&
            signatureCount >= 2
        );
    }).length;
}

function implementationDayCoverage(table = null) {
    const days = new Set();
    for (const row of Array.isArray(table?.rows) ? table.rows : []) {
        const value =
            String(row?.[0] ?? "")
                .trim();
        const range =
            value.match(
                /^(\d{1,3})\s*(?:-|a|al)\s*(\d{1,3})$/i
            );
        if (range) {
            const start = Number(range[1]);
            const end = Number(range[2]);
            for (
                let day = start;
                day <= end && day <= 366;
                day += 1
            ) {
                days.add(day);
            }
            continue;
        }
        const single =
            value.match(/^(\d{1,3})$/);
        if (single) days.add(Number(single[1]));
    }
    let coverage = 0;
    while (days.has(coverage + 1)) {
        coverage += 1;
    }
    return coverage;
}

function quantitativeTableMetrics(tables = []) {
    const vehicleTable =
        tableWithHeaders(
            tables,
            ["unidad", "kilometraje"]
        );
    const partsTable =
        tableWithHeaders(
            tables,
            ["codigo", "refaccion"]
        ) ||
        tableWithHeaders(
            tables,
            ["parte", "cantidad"]
        );
    const kpiTable =
        tableWithHeaders(
            tables,
            ["indicador", "formula"]
        );
    const planTable =
        tableWithHeaders(
            tables,
            ["dias", "fase"]
        ) ||
        tableWithHeaders(
            tables,
            ["dia", "actividad"]
        );
    return {
        vehicleCount:
            vehicleTable?.rows?.length ||
            0,
        partCount:
            partsTable?.rows?.length ||
            0,
        kpiCount:
            kpiTable?.rows?.length ||
            0,
        implementationDayCoverage:
            implementationDayCoverage(
                planTable
            )
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
    const templateCount =
        operationalTemplateCount(
            tableBlueprints
        );
    const quantitative =
        quantitativeTableMetrics(
            tableBlueprints
        );
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
    if (contract.minVehicles > 0 && quantitative.vehicleCount < contract.minVehicles) failures.push(`DOCUMENT_VEHICLE_COUNT_BELOW_MINIMUM:${quantitative.vehicleCount}:${contract.minVehicles}`);
    if (contract.minParts > 0 && quantitative.partCount < contract.minParts) failures.push(`DOCUMENT_PART_COUNT_BELOW_MINIMUM:${quantitative.partCount}:${contract.minParts}`);
    if (contract.minKpis > 0 && quantitative.kpiCount < contract.minKpis) failures.push(`DOCUMENT_KPI_COUNT_BELOW_MINIMUM:${quantitative.kpiCount}:${contract.minKpis}`);
    if (contract.implementationDays > 0 && quantitative.implementationDayCoverage < contract.implementationDays) failures.push(`DOCUMENT_IMPLEMENTATION_DAY_COVERAGE_BELOW_MINIMUM:${quantitative.implementationDayCoverage}:${contract.implementationDays}`);
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
        vehicleCount:
            quantitative.vehicleCount,
        partCount:
            quantitative.partCount,
        kpiCount:
            quantitative.kpiCount,
        implementationDayCoverage:
            quantitative
                .implementationDayCoverage,
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
            "vehicle-parts-kpi-and-plan-cardinality",
            "placeholder-and-diversity"
        ]
    };
}
