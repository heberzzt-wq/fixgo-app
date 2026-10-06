import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { scanFile } from "../gestia-core/jarvis/jarvis.scanner.engine.js";
import { buildAutoFix } from "../gestia-core/jarvis/jarvis.autofix.engine.js";
import { buildAutoPatch } from "../gestia-core/jarvis/jarvis.autopatch.engine.js";
import * as responsiveRepair from "../gestia-core/jarvis/jarvis.autopatch.engine.js";
import { responsiveStylePatch } from "../modules/terminal/proposal-state.js";

const responsiveSource = '<!DOCTYPE html>\r\n<html><head><style>\r\n.existing { color: red; }\r\n</style></head>\r\n<body><header><div>Terminal</div><div><button id="history">Historial</button></div></header><div id="tray" hidden></div><script>const untouched = true;</script></body></html>';
function responsivePageFixture() {
    const elements = [
        { tag: "div", selector: "#tray", hiddenAttribute: true, display: "flex", rect: [0, 700, 360, 17] },
        { tag: "p", selector: "#muted", color: "rgb(100, 100, 100)", effectiveBackgroundColor: "rgb(15, 23, 42)", fontSize: "14px", fontWeight: "400", rect: [0, 80, 300, 20] },
        { tag: "p", selector: "#tiny", fontSize: "10px", rect: [0, 110, 300, 12] },
        { tag: "button", selector: "#history", interactive: true, rect: [300, 20, 14, 24] },
        { tag: "h1", selector: "#title", color: "rgb(255, 255, 255)", rect: [0, 0, 200, 30] }
    ];
    const findings = [
        { id: "hidden", selector: "#tray", kind: "hidden_element_rendered", classification: "defect", evidence: { hiddenAttribute: true, display: "flex" } },
        { id: "contrast", selector: "#muted", kind: "low_text_contrast", classification: "defect", evidence: { minimum: 4.5 } },
        { id: "text", selector: "#tiny", kind: "small_text", classification: "recommendation", evidence: { fontSize: "10px" } },
        { id: "target", selector: "#history", kind: "small_touch_target", classification: "recommendation", evidence: { rect: [300, 20, 14, 24] } }
    ];
    return { source: "RENDERED_DOM_LAYOUT_REPLAY", url: "https://platform.test/gestia-terminal.html",
        viewports: [{ viewport: { width: 360, height: 800 }, elements, findings }, { viewport: { width: 390, height: 844 }, elements, findings }] };
}

test("responsive translator offers measured CSS choices without automatic application", () => {
    const result = responsiveRepair.buildResponsiveRepairOptions({ page: responsivePageFixture(), source: responsiveSource, file: "gestia-terminal.html" });
    assert.equal(result.ok, true);
    assert.equal(result.autoApply, false);
    assert.equal(result.options.length, 4);
    assert.ok(result.options.every(option => option.viewports.length === 2));
    assert.equal(result.options.find(option => option.kind === "hidden_element_rendered").css, "#tray[hidden] { display: none; }");
    assert.match(result.options.find(option => option.kind === "low_text_contrast").css, /color: rgb\(255, 255, 255\)/);
    assert.match(result.options.find(option => option.kind === "small_text").css, /font-size: 12px/);
    const target = result.options.find(option => option.kind === "small_touch_target");
    assert.match(target.css, /min-width: 44px/);
    assert.match(target.css, /min-height: 44px/);
    assert.match(target.css, /body > header/);
    assert.match(target.css, /flex-wrap: wrap/);
    assert.equal(target.classification, "recommendation");
});

test("responsive translator only appends selected exact CSS inside the original first style", () => {
    const prepared = responsiveRepair.buildResponsiveRepairOptions({ page: responsivePageFixture(), source: responsiveSource, file: "gestia-terminal.html" });
    const selected = prepared.options.find(option => option.kind === "hidden_element_rendered");
    const patch = responsiveRepair.buildResponsiveRepairPatch({ options: prepared.options, selectedIds: [selected.id], source: responsiveSource, file: "gestia-terminal.html" });
    assert.equal(patch.ok, true);
    assert.equal(patch.autoApply, false);
    assert.equal(patch.matchCount, 1);
    assert.equal(patch.operation, "replace");
    assert.equal(patch.search, "\r\n.existing { color: red; }\r\n");
    const modified = responsiveSource.replace(patch.search, patch.replace);
    assert.equal(modified.split("</style>")[1], responsiveSource.split("</style>")[1]);
    assert.ok(modified.startsWith("<!DOCTYPE html>\r\n<html><head><style>\r\n.existing { color: red; }\r\n"));
    assert.match(patch.replace, /#tray\[hidden\] \{ display: none; \}/);
    assert.doesNotMatch(patch.replace, /min-width: 44px|font-size: 12px/);
});

test("responsive translator rejects missing or invented selections, mutated choices and changed source", () => {
    const prepared = responsiveRepair.buildResponsiveRepairOptions({ page: responsivePageFixture(), source: responsiveSource, file: "gestia-terminal.html" });
    const args = { options: prepared.options, source: responsiveSource, file: "gestia-terminal.html" };
    assert.equal(responsiveRepair.buildResponsiveRepairPatch({ ...args, selectedIds: [] }).ok, false);
    assert.equal(responsiveRepair.buildResponsiveRepairPatch({ ...args, selectedIds: ["invented"] }).ok, false);
    assert.equal(responsiveRepair.buildResponsiveRepairPatch({ ...args, selectedIds: [prepared.options[0].id], source: responsiveSource + "\n" }).ok, false);
    prepared.options[0].css = "body { display: none; }";
    assert.equal(responsiveRepair.buildResponsiveRepairPatch({ ...args, selectedIds: [prepared.options[0].id] }).ok, false);
});

test("responsive translator rejects ungrounded pages, non-Terminal files and selector injection", () => {
    assert.equal(responsiveRepair.buildResponsiveRepairOptions({ page: responsivePageFixture(), source: responsiveSource, file: "firebase.js" }).ok, false);
    assert.equal(responsiveRepair.buildResponsiveRepairOptions({ page: { ...responsivePageFixture(), source: "visual_capture" }, source: responsiveSource, file: "gestia-terminal.html" }).ok, false);
    const page = responsivePageFixture();
    page.viewports = [{ viewport: { width: 360, height: 800 },
        elements: [{ selector: "#tray;body{}", hiddenAttribute: true, display: "flex", rect: [0, 700, 360, 17] }],
        findings: [{ selector: "#tray;body{}", kind: "hidden_element_rendered", classification: "defect" }] }];
    const result = responsiveRepair.buildResponsiveRepairOptions({ page, source: responsiveSource, file: "gestia-terminal.html" });
    assert.equal(result.options.length, 0);
});

test("responsive translator preserves Terminal around a defective style fixture and does not prepare it twice", () => {
    const terminalSource = readFileSync(new URL("../gestia-terminal.html", import.meta.url), "utf8");
    const defectiveCss = "\r\n#jarvis-attachment-tray[hidden] { display: flex; }\r\n";
    // The installed page may already be repaired when post-write tests run.
    // Keep its real structure, but make this test's defect explicit in memory.
    const source = terminalSource.replace(/(<style\b[^>]*>)[\s\S]*?(<\/style\s*>)/i,
        (_match, opening, closing) => opening + defectiveCss + closing);
    assert.equal(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/i.exec(source)?.[1], defectiveCss);
    const page = responsivePageFixture();
    for (const sample of page.viewports) {
        sample.elements = [{ selector: "#jarvis-attachment-tray", hiddenAttribute: true, display: "flex", rect: [0, 700, 360, 17] }];
        sample.findings = [{ selector: "#jarvis-attachment-tray", kind: "hidden_element_rendered", classification: "defect" }];
    }
    const prepared = responsiveRepair.buildResponsiveRepairOptions({ page, source, file: "gestia-terminal.html" });
    assert.equal(prepared.ok, true);
    const patch = responsiveRepair.buildResponsiveRepairPatch({ options: prepared.options, selectedIds: [prepared.options[0].id], source, file: "gestia-terminal.html" });
    assert.equal(patch.ok, true);
    const approvedStyle = responsiveStylePatch(source, patch);
    assert.equal(approvedStyle.candidate, source.replace(patch.search, patch.replace));
    assert.match(approvedStyle.afterCss, /#jarvis-attachment-tray\[hidden\] \{ display: none; \}/);
    const offset = source.indexOf(patch.search);
    const candidate = source.replace(patch.search, patch.replace);
    assert.equal(candidate.slice(0, offset), source.slice(0, offset));
    assert.equal(candidate.slice(offset + patch.replace.length), source.slice(offset + patch.search.length));
    assert.ok(patch.replace.startsWith(patch.search));
    assert.doesNotMatch(patch.search + patch.replace, /<\/?style/);
    assert.match(patch.replace, /#jarvis-attachment-tray\[hidden\] \{ display: none; \}/);
    const alreadyApplied = responsiveRepair.buildResponsiveRepairOptions({ page, source: candidate, file: "gestia-terminal.html" });
    assert.equal(alreadyApplied.ok, false);
    assert.equal(alreadyApplied.status, "RESPONSIVE_REPAIR_NO_SAFE_OPTIONS");
    assert.deepEqual(alreadyApplied.options, []);
});

test("responsive contrast choices require an observed palette color valid on every measured background", () => {
    for (const incompatibleBackground of ["rgb(255, 255, 255)", "rgba(255, 255, 255, 0.5)"]) {
        const page = structuredClone(responsivePageFixture());
        page.viewports[1].elements.find(element => element.selector === "#muted").effectiveBackgroundColor = incompatibleBackground;
        const result = responsiveRepair.buildResponsiveRepairOptions({ page, source: responsiveSource, file: "gestia-terminal.html" });
        assert.equal(result.options.some(option => option.kind === "low_text_contrast"), false);
    }
    const page = responsivePageFixture();
    for (const sample of page.viewports) sample.elements = sample.elements.filter(element => element.selector !== "#title");
    const result = responsiveRepair.buildResponsiveRepairOptions({ page, source: responsiveSource, file: "gestia-terminal.html" });
    assert.equal(result.options.some(option => option.kind === "low_text_contrast"), false);
});

test("scanner V2 detects runtime Date.now casing and builds safe patch", () => {
    const source = `
export function runtimehealth() {
    return {
        status: "online",
        timestamp: date.now()
    };
}
`;

    const scan =
        scanFile(
            "runtime-health.js",
            source
        );

    assert.equal(scan.version, "2.0.0-structural-evidence");
    assert.equal(scan.structure.exports.length, 1);
    assert.equal(scan.structure.functions[0].name, "runtimehealth");
    assert.ok(scan.flags.includes("LOWERCASE_DATE_NOW"));
    assert.equal(scan.findings.find(item => item.id === "LOWERCASE_DATE_NOW").patchable, true);

    const autofix =
        buildAutoFix(
            scan
        );

    assert.equal(autofix.version, "2.0.0-evidence-actions");
    assert.equal(autofix.patchable, 1);
    assert.equal(autofix.fixes[0].id, "FIX_LOWERCASE_DATE_NOW");
    assert.equal(autofix.fixes[0].actions[0].replace, "Date.now()");

    const autopatch =
        buildAutoPatch(
            scan
        );

    assert.equal(autopatch.version, "2.0.0-safe-operations");
    assert.equal(autopatch.safePatches, 1);
    assert.equal(autopatch.patches[0].operations[0].find, "date.now()");
});

test("scanner V2 blocks hardcoded secret literals from autopatch", () => {
    const source = `
const auth_token = "Heberto_SIA7_2026_Secure!";
export function run() {
    return auth_token;
}
`;

    const scan =
        scanFile(
            "legacy-commit.js",
            source
        );

    const finding =
        scan.findings.find(item => item.id === "HARDCODED_SECRET_LITERAL");

    assert.equal(scan.risk, "CRITICAL");
    assert.equal(finding.severity, "CRITICAL");
    assert.equal(finding.patchable, false);
    assert.match(finding.evidence.snippet, /\*\*\*REDACTED\*\*\*/);

    const autofix =
        buildAutoFix(
            scan
        );

    assert.equal(autofix.blocking, true);
    assert.equal(autofix.fixes[0].id, "FIX_SECRET_TO_ENV");

    const autopatch =
        buildAutoPatch(
            scan
        );

    assert.equal(autopatch.safePatches, 0);
    assert.equal(autopatch.patches[0].safe, false);
});

test("scanner V2 preserves legacy summary fields and flags empty source", () => {
    const scan =
        scanFile(
            "empty.js",
            ""
        );

    assert.equal(scan.ok, true);
    assert.equal(scan.type, "JAVASCRIPT");
    assert.equal(scan.metrics.imports, 0);
    assert.ok(Array.isArray(scan.flags));
    assert.ok(Array.isArray(scan.recommendations));
    assert.ok(scan.flags.includes("EMPTY_SOURCE"));
    assert.equal(scan.findings[0].id, "EMPTY_SOURCE");

    const autofix =
        buildAutoFix(
            scan
        );

    assert.equal(autofix.blocking, true);
    assert.equal(autofix.fixes[0].type, "BLOCK");
});
