import assert from "node:assert/strict";
import { test } from "node:test";

import {
    validateWorkbookFormulaStructure
} from "../gestia-core/jarvis/jarvis.workbook.validator.js";

test("workbook validator rejects text operands, missing grid cells and circular formulas", () => {
    const validation =
        validateWorkbookFormulaStructure([
            {
                name: "APU",
                rows: [
                    [
                        "Concepto",
                        "Cantidad",
                        "Precio",
                        "Importe"
                    ],
                    [
                        "Block",
                        13,
                        "SUPUESTO",
                        "=B2*C2"
                    ],
                    [
                        "Circular",
                        "",
                        "",
                        "=D3"
                    ],
                    [
                        "Fuera de rango",
                        "",
                        "",
                        "=B20*2"
                    ]
                ]
            }
        ]);
    const issues =
        validation.invalidFormulas.map(
            item => item.issue
        );

    assert.equal(validation.ok, false);
    assert.equal(validation.formulaCount, 3);
    assert.ok(
        issues.some(issue =>
            issue.startsWith(
                "FORMULA_NUMERIC_REFERENCE_IS_NOT_NUMBER"
            )
        )
    );
    assert.ok(
        issues.some(issue =>
            issue.startsWith(
                "FORMULA_CELL_OUTSIDE_DECLARED_GRID"
            )
        )
    );
    assert.ok(
        issues.some(issue =>
            issue.startsWith(
                "FORMULA_CIRCULAR_REFERENCE"
            )
        )
    );
});

test("workbook validator accepts numeric assumptions with labels in a separate column", () => {
    const validation =
        validateWorkbookFormulaStructure([
            {
                name: "APU",
                rows: [
                    [
                        "Concepto",
                        "Cantidad",
                        "Precio",
                        "Importe",
                        "Criterio"
                    ],
                    [
                        "Block",
                        13,
                        20,
                        "=B2*C2",
                        "SUPUESTO"
                    ],
                    [
                        "Costo directo",
                        "",
                        "",
                        "=SUM(D2:D2)",
                        ""
                    ]
                ]
            },
            {
                name: "Criterios",
                rows: [
                    [
                        "Dato",
                        "Tratamiento"
                    ],
                    [
                        "Precio de block",
                        "SUPUESTO; validar cotizacion"
                    ]
                ]
            }
        ]);

    assert.equal(validation.ok, true);
    assert.equal(validation.formulaCount, 2);
    assert.deepEqual(
        validation.invalidFormulas,
        []
    );
});
