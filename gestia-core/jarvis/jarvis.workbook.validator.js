const VERSION = "1.0.0-structural-formula-validation";
const MAX_FORMULA_RANGE_CELLS = 10000;

function columnName(column = 1) {
    let value = Math.max(1, Number(column) || 1);
    let name = "";
    while (value > 0) {
        value -= 1;
        name =
            String.fromCharCode(65 + (value % 26)) +
            name;
        value =
            Math.floor(value / 26);
    }
    return name;
}

function cellAddress(row = 1, column = 1) {
    return `${columnName(column)}${row}`;
}

function cellId(sheet = "", row = 1, column = 1) {
    return [
        String(sheet),
        String(row),
        String(column)
    ].join("\u0000");
}

function isLetter(character = "") {
    const code =
        String(character).toUpperCase().charCodeAt(0);
    return code >= 65 && code <= 90;
}

function isDigit(character = "") {
    const code =
        String(character).charCodeAt(0);
    return code >= 48 && code <= 57;
}

function isIdentifierCharacter(character = "") {
    return (
        isLetter(character) ||
        isDigit(character) ||
        character === "_" ||
        character === "."
    );
}

function isReferenceBoundary(character = "") {
    return (
        !character ||
        (
            !isLetter(character) &&
            !isDigit(character) &&
            character !== "_" &&
            character !== "."
        )
    );
}

function parseCellReferenceAt(source = "", offset = 0) {
    let cursor =
        Number(offset) || 0;
    const start =
        cursor;

    if (source[cursor] === "$") {
        cursor += 1;
    }

    const lettersStart =
        cursor;
    let column = 0;
    while (
        cursor < source.length &&
        isLetter(source[cursor]) &&
        cursor - lettersStart < 3
    ) {
        column =
            column * 26 +
            (
                source[cursor]
                    .toUpperCase()
                    .charCodeAt(0) -
                64
            );
        cursor += 1;
    }

    if (
        cursor === lettersStart ||
        isLetter(source[cursor])
    ) {
        return null;
    }

    if (source[cursor] === "$") {
        cursor += 1;
    }

    const digitsStart =
        cursor;
    while (
        cursor < source.length &&
        isDigit(source[cursor])
    ) {
        cursor += 1;
    }

    if (cursor === digitsStart) {
        return null;
    }

    if (
        !isReferenceBoundary(source[start - 1]) ||
        !isReferenceBoundary(source[cursor]) ||
        source[cursor] === "("
    ) {
        return null;
    }

    const row =
        Number.parseInt(
            source.slice(digitsStart, cursor),
            10
        );
    if (
        !Number.isFinite(row) ||
        row < 1 ||
        column < 1 ||
        column > 16384
    ) {
        return null;
    }

    return {
        start,
        end:
            cursor,
        row,
        column,
        address:
            cellAddress(row, column)
    };
}

function readQuotedSheetAt(source = "", offset = 0) {
    if (source[offset] !== "'") {
        return null;
    }

    let cursor =
        offset + 1;
    let name = "";
    while (cursor < source.length) {
        const character =
            source[cursor];
        if (
            character === "'" &&
            source[cursor + 1] === "'"
        ) {
            name += "'";
            cursor += 2;
            continue;
        }
        if (character === "'") {
            if (source[cursor + 1] !== "!") {
                return null;
            }
            return {
                name,
                end:
                    cursor + 2
            };
        }
        name += character;
        cursor += 1;
    }
    return null;
}

function arithmeticOperatorNear(
    source = "",
    before = 0,
    after = 0
) {
    let left =
        before - 1;
    let right =
        after;
    while (
        left >= 0 &&
        (
            source[left] === " " ||
            source[left] === "\t"
        )
    ) {
        left -= 1;
    }
    while (
        right < source.length &&
        (
            source[right] === " " ||
            source[right] === "\t"
        )
    ) {
        right += 1;
    }
    const operators =
        new Set(["+", "-", "*", "/", "^"]);
    return (
        operators.has(source[left]) ||
        operators.has(source[right])
    );
}

function expandReferenceRange(
    first,
    second,
    sheet,
    numericRequired
) {
    const rowStart =
        Math.min(first.row, second.row);
    const rowEnd =
        Math.max(first.row, second.row);
    const columnStart =
        Math.min(first.column, second.column);
    const columnEnd =
        Math.max(first.column, second.column);
    const cellCount =
        (
            rowEnd -
            rowStart +
            1
        ) *
        (
            columnEnd -
            columnStart +
            1
        );
    if (cellCount > MAX_FORMULA_RANGE_CELLS) {
        return {
            references: [],
            issue:
                "FORMULA_RANGE_TOO_LARGE"
        };
    }

    const references = [];
    for (
        let row = rowStart;
        row <= rowEnd;
        row += 1
    ) {
        for (
            let column = columnStart;
            column <= columnEnd;
            column += 1
        ) {
            references.push({
                sheet,
                row,
                column,
                address:
                    cellAddress(row, column),
                numericRequired
            });
        }
    }
    return {
        references,
        issue:
            null
    };
}

function readFormulaReferences(
    formula = "",
    defaultSheet = ""
) {
    const serializedFormula =
        String(formula || "");
    const source =
        serializedFormula.startsWith("=")
            ? serializedFormula.slice(1)
            : serializedFormula;
    const references = [];
    const issues = [];
    let cursor = 0;

    const appendReference = function(
        sheet,
        first,
        tokenStart
    ) {
        let tokenEnd =
            first.end;
        let second =
            null;
        if (source[tokenEnd] === ":") {
            second =
                parseCellReferenceAt(
                    source,
                    tokenEnd + 1
                );
            if (second) {
                tokenEnd =
                    second.end;
            }
        }
        const numericRequired =
            arithmeticOperatorNear(
                source,
                tokenStart,
                tokenEnd
            );
        if (second) {
            const expanded =
                expandReferenceRange(
                    first,
                    second,
                    sheet,
                    numericRequired
                );
            references.push(
                ...expanded.references
            );
            if (expanded.issue) {
                issues.push(
                    expanded.issue
                );
            }
        }
        else {
            references.push({
                sheet,
                row:
                    first.row,
                column:
                    first.column,
                address:
                    first.address,
                numericRequired
            });
        }
        return tokenEnd;
    };

    while (cursor < source.length) {
        const character =
            source[cursor];

        if (character === "\"") {
            cursor += 1;
            while (cursor < source.length) {
                if (
                    source[cursor] === "\"" &&
                    source[cursor + 1] === "\""
                ) {
                    cursor += 2;
                    continue;
                }
                if (source[cursor] === "\"") {
                    cursor += 1;
                    break;
                }
                cursor += 1;
            }
            continue;
        }

        if (character === "'") {
            const quotedSheet =
                readQuotedSheetAt(
                    source,
                    cursor
                );
            if (quotedSheet) {
                const first =
                    parseCellReferenceAt(
                        source,
                        quotedSheet.end
                    );
                if (first) {
                    cursor =
                        appendReference(
                            quotedSheet.name,
                            first,
                            cursor
                        );
                    continue;
                }
            }
        }

        if (
            isLetter(character) ||
            character === "$"
        ) {
            let sheetCursor =
                cursor;
            while (
                sheetCursor < source.length &&
                isIdentifierCharacter(
                    source[sheetCursor]
                )
            ) {
                sheetCursor += 1;
            }
            if (source[sheetCursor] === "!") {
                const first =
                    parseCellReferenceAt(
                        source,
                        sheetCursor + 1
                    );
                if (first) {
                    cursor =
                        appendReference(
                            source.slice(
                                cursor,
                                sheetCursor
                            ),
                            first,
                            cursor
                        );
                    continue;
                }
            }

            const first =
                parseCellReferenceAt(
                    source,
                    cursor
                );
            if (first) {
                cursor =
                    appendReference(
                        defaultSheet,
                        first,
                        cursor
                    );
                continue;
            }
        }

        cursor += 1;
    }

    return {
        references,
        issues
    };
}

function normalizedSheets(value = []) {
    return (
        Array.isArray(value)
            ? value
            : []
    )
        .map((sheet, index) => ({
            name:
                String(
                    sheet?.name ||
                    `Hoja ${index + 1}`
                ),
            rows:
                Array.isArray(sheet?.rows)
                    ? sheet.rows.map(row =>
                        Array.isArray(row)
                            ? row
                            : Object.values(
                                row ||
                                {}
                            )
                    )
                    : []
        }));
}

function literalNumericIssue(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "FORMULA_NUMERIC_REFERENCE_EMPTY";
    }
    if (
        typeof value === "number" &&
        Number.isFinite(value)
    ) {
        return null;
    }
    if (value instanceof Date) {
        return null;
    }
    if (
        typeof value === "string" &&
        value.startsWith("=")
    ) {
        return null;
    }
    return "FORMULA_NUMERIC_REFERENCE_IS_NOT_NUMBER";
}

export function validateWorkbookFormulaStructure(
    value = []
) {
    const sheets =
        normalizedSheets(value);
    const sheetMap =
        new Map(
            sheets.map(sheet => [
                sheet.name,
                {
                    ...sheet,
                    rowCount:
                        sheet.rows.length,
                    columnCount:
                        sheet.rows.reduce(
                            (maximum, row) =>
                                Math.max(
                                    maximum,
                                    row.length
                                ),
                            0
                        )
                }
            ])
        );
    const formulaCells =
        new Map();
    const invalidFormulas = [];
    const issueKeys =
        new Set();
    let formulaCount = 0;

    const addIssue = function(
        meta,
        issue,
        detail = ""
    ) {
        const issueKey = [
            meta.sheet,
            meta.row,
            meta.column,
            issue,
            detail
        ].join("\u0000");
        if (issueKeys.has(issueKey)) {
            return;
        }
        issueKeys.add(issueKey);
        invalidFormulas.push({
            sheet:
                meta.sheet,
            row:
                meta.row,
            column:
                meta.column,
            address:
                cellAddress(
                    meta.row,
                    meta.column
                ),
            formula:
                String(meta.formula)
                    .slice(0, 500),
            issue:
                detail
                    ? `${issue}:${detail}`
                    : issue
        });
    };

    for (const sheet of sheets) {
        sheet.rows.forEach(
            (row, rowIndex) =>
                row.forEach(
                    (value, columnIndex) => {
                        if (
                            typeof value !== "string" ||
                            !value.startsWith("=")
                        ) {
                            return;
                        }
                        const meta = {
                            sheet:
                                sheet.name,
                            row:
                                rowIndex + 1,
                            column:
                                columnIndex + 1,
                            formula:
                                value,
                            references:
                                []
                        };
                        formulaCells.set(
                            cellId(
                                meta.sheet,
                                meta.row,
                                meta.column
                            ),
                            meta
                        );
                        formulaCount += 1;
                    }
                )
        );
    }

    for (const meta of formulaCells.values()) {
        const parsed =
            readFormulaReferences(
                meta.formula,
                meta.sheet
            );
        meta.references =
            parsed.references;
        for (const issue of parsed.issues) {
            addIssue(meta, issue);
        }

        for (const reference of meta.references) {
            const targetSheet =
                sheetMap.get(
                    reference.sheet
                );
            if (!targetSheet) {
                addIssue(
                    meta,
                    "FORMULA_SHEET_NOT_FOUND",
                    reference.sheet
                );
                continue;
            }
            if (
                reference.row >
                    targetSheet.rowCount ||
                reference.column >
                    targetSheet.columnCount
            ) {
                addIssue(
                    meta,
                    "FORMULA_CELL_OUTSIDE_DECLARED_GRID",
                    `${reference.sheet}!${reference.address}`
                );
                continue;
            }

            if (!reference.numericRequired) {
                continue;
            }
            const targetValue =
                targetSheet
                    .rows[reference.row - 1]
                    ?.[reference.column - 1];
            const numericIssue =
                literalNumericIssue(
                    targetValue
                );
            if (numericIssue) {
                addIssue(
                    meta,
                    numericIssue,
                    `${reference.sheet}!${reference.address}`
                );
            }
        }
    }

    const colors =
        new Map();
    const visit = function(meta, path = []) {
        const id =
            cellId(
                meta.sheet,
                meta.row,
                meta.column
            );
        const color =
            colors.get(id) ||
            "white";
        if (color === "black") {
            return;
        }
        if (color === "gray") {
            return;
        }

        colors.set(id, "gray");
        for (const reference of meta.references) {
            const targetId =
                cellId(
                    reference.sheet,
                    reference.row,
                    reference.column
                );
            const target =
                formulaCells.get(
                    targetId
                );
            if (!target) {
                continue;
            }
            if (
                targetId === id ||
                colors.get(targetId) === "gray"
            ) {
                const cycle =
                    [
                        ...path,
                        `${meta.sheet}!${cellAddress(meta.row, meta.column)}`,
                        `${target.sheet}!${cellAddress(target.row, target.column)}`
                    ]
                        .slice(-8)
                        .join(" -> ");
                addIssue(
                    meta,
                    "FORMULA_CIRCULAR_REFERENCE",
                    cycle
                );
                continue;
            }
            visit(
                target,
                [
                    ...path,
                    `${meta.sheet}!${cellAddress(meta.row, meta.column)}`
                ]
                    .slice(-8)
            );
        }
        colors.set(id, "black");
    };

    for (const meta of formulaCells.values()) {
        visit(meta);
    }

    return {
        ok:
            formulaCount > 0 &&
            invalidFormulas.length === 0,
        version:
            VERSION,
        formulaCount,
        invalidFormulas,
        sheets:
            sheets.map(sheet => ({
                name:
                    sheet.name,
                rowCount:
                    sheet.rows.length,
                columnCount:
                    sheet.rows.reduce(
                        (maximum, row) =>
                            Math.max(
                                maximum,
                                row.length
                            ),
                        0
                    )
            }))
    };
}

export const JarvisWorkbookValidator = {
    version:
        VERSION,
    validateWorkbookFormulaStructure
};
