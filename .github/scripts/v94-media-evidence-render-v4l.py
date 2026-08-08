from pathlib import Path

terminal_path = Path("gestia-terminal.html")
test_path = Path("tests/v94-media-evidence-render.test.cjs")

source = terminal_path.read_text(encoding="utf-8")

anchor = '''                        if (toolName === "repo.grep") {\n'''
insert = '''                        if (toolName === "media.analyze") {\n                            const mediaSources =\n                                Array.isArray(repoData?.sources)\n                                    ? repoData.sources\n                                    : [];\n\n                            const mediaEvidence = {\n                                ok:\n                                    repoData?.ok === true,\n                                status:\n                                    repoData?.status || null,\n                                engine:\n                                    repoData?.engine || null,\n                                version:\n                                    repoData?.version || null,\n                                expectedSources:\n                                    repoData?.expectedSources ?? null,\n                                receivedSources:\n                                    repoData?.receivedSources ?? null,\n                                analysisMode:\n                                    repoData?.analysisMode || null,\n                                repairCount:\n                                    repoData?.repairCount ?? null,\n                                sources:\n                                    mediaSources.map(item => ({\n                                        sourceId: item?.sourceId || null,\n                                        fileName: item?.fileName || null,\n                                        name: item?.name || null,\n                                        mimeType: item?.mimeType || null,\n                                        bytes: item?.bytes ?? null,\n                                        sha256: item?.sha256 || null,\n                                        description: item?.description || "",\n                                        observations: Array.isArray(item?.observations)\n                                            ? item.observations\n                                            : [],\n                                        inferences: Array.isArray(item?.inferences)\n                                            ? item.inferences\n                                            : [],\n                                        objects: Array.isArray(item?.objects)\n                                            ? item.objects\n                                            : [],\n                                        composition: item?.composition || {},\n                                        visibleData: Array.isArray(item?.visibleData)\n                                            ? item.visibleData\n                                            : [],\n                                        pages: Array.isArray(item?.pages)\n                                            ? item.pages\n                                            : [],\n                                        marketingUse: Array.isArray(item?.marketingUse)\n                                            ? item.marketingUse\n                                            : [],\n                                        quality: item?.quality || {},\n                                        uncertainty: Array.isArray(item?.uncertainty)\n                                            ? item.uncertainty\n                                            : [],\n                                        evidence: Array.isArray(item?.evidence)\n                                            ? item.evidence\n                                            : []\n                                    })),\n                                sourceManifest:\n                                    repoData?.sourceManifest || null,\n                                comparison:\n                                    repoData?.comparison || null,\n                                recommendations:\n                                    Array.isArray(repoData?.recommendations)\n                                        ? repoData.recommendations\n                                        : [],\n                                verifiedVisualClaims:\n                                    repoData?.verifiedVisualClaims || null,\n                                policy:\n                                    repoData?.policy || null\n                            };\n\n                            return JSON.stringify(\n                                mediaEvidence,\n                                null,\n                                2\n                            );\n                        }\n\n'''

if 'if (toolName === "media.analyze") {' in source:
    raise SystemExit("media.analyze renderer already present")
if anchor not in source:
    raise SystemExit("renderer insertion anchor not found")
source = source.replace(anchor, insert + anchor, 1)
terminal_path.write_text(source, encoding="utf-8")

test_path.write_text(r'''const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const terminalPath = path.join(process.cwd(), "gestia-terminal.html");
const terminal = fs.readFileSync(terminalPath, "utf8");

test("media.analyze evidence renderer preserves certification fields instead of 700-char truncation", () => {
    assert.match(terminal, /if \(toolName === "media\.analyze"\)/);
    assert.match(terminal, /expectedSources:/);
    assert.match(terminal, /receivedSources:/);
    assert.match(terminal, /description: item\?\.description \|\| ""/);
    assert.match(terminal, /inferences: Array\.isArray\(item\?\.inferences\)/);
    assert.match(terminal, /visibleData: Array\.isArray\(item\?\.visibleData\)/);
    assert.match(terminal, /sourceManifest:/);
    assert.match(terminal, /verifiedVisualClaims:/);
    assert.match(terminal, /policy:/);

    const mediaBranch = terminal.slice(
        terminal.indexOf('if (toolName === "media.analyze")'),
        terminal.indexOf('if (toolName === "repo.grep")')
    );

    assert.doesNotMatch(mediaBranch, /slice\(0,\s*700\)/);
});

test("generic observation renderer keeps its compact fallback for unrelated tools", () => {
    assert.match(
        terminal,
        /JSON\.stringify\(repoData, null, 2\)\.slice\(0, 700\)/
    );
});
''', encoding="utf-8")
