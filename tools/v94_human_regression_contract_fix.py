from pathlib import Path


test_path = Path("tests/jarvis-conversation-composer.test.mjs")
tests = test_path.read_text(encoding="utf-8")

old_contract = '''    assert.match(
        terminal,
        /finalResponse\\?\\.source !== "EVIDENCE_GROUNDED_CONVERSATION"/
    );'''
new_contract = '''    assert.match(
        terminal,
        /finalResponse\\?\\.source === "EVIDENCE_GROUNDED_CONVERSATION"\\s*\\?\\s*\\[\\]/
    );'''

if old_contract not in tests:
    raise SystemExit("missing stale grounded-conversation telemetry assertion")
tests = tests.replace(old_contract, new_contract, 1)

marker = '\ntest("terminal exposes live operational work trace without raw telemetry"'
index = tests.find(marker)
if index < 0:
    raise SystemExit("missing appended human work trace regressions")

corrected_regressions = r'''
test("terminal exposes live operational work trace without raw telemetry", () => {
    const terminalSource = fs.readFileSync(
        path.join(process.cwd(), "gestia-terminal.html"),
        "utf8"
    );
    const runtimeSource = fs.readFileSync(
        path.join(process.cwd(), "gestia-core/tools.runtime.js"),
        "utf8"
    );

    assert.match(terminalSource, /ADJUNTO LIVE WORK TRACE V94/);
    assert.match(
        terminalSource,
        /wrapper\.dataset\.testid\s*=\s*"jarvis-work-trace"/
    );
    assert.match(terminalSource, /jarvis:work-progress/);
    assert.match(terminalSource, /Analizando imágenes y archivos/);
    assert.match(terminalSource, /Entendiendo qué necesita la misión/);
    assert.match(terminalSource, /Preparando la respuesta final/);
    assert.match(terminalSource, /Trabajo completado/);

    const progressStart = terminalSource.indexOf("ADJUNTO LIVE WORK TRACE V94");
    const progressEnd = terminalSource.indexOf(
        "function isTerminalBrainRuntimeReady",
        progressStart
    );
    assert.ok(progressStart >= 0 && progressEnd > progressStart);
    const progressBlock = terminalSource.slice(progressStart, progressEnd);
    assert.doesNotMatch(progressBlock, /JSON\.stringify|args:|result:|prompt:/);

    assert.match(runtimeSource, /function emitJarvisWorkProgress/);
    assert.match(runtimeSource, /state: "started"/);
    assert.match(runtimeSource, /state: "completed"/);
    assert.match(runtimeSource, /state: "failed"/);
    assert.doesNotMatch(
        runtimeSource.slice(
            runtimeSource.indexOf("function emitJarvisWorkProgress"),
            runtimeSource.indexOf("export const JarvisToolRuntime")
        ),
        /args|result|prompt|reasoning/
    );
});


test("terminal hides grounded multimodal telemetry from the human chat surface", () => {
    const terminalSource = fs.readFileSync(
        path.join(process.cwd(), "gestia-terminal.html"),
        "utf8"
    );
    const start = terminalSource.indexOf("const multiToolSummarySource =");
    const end = terminalSource.indexOf("const multiToolSummary =", start);
    assert.ok(start >= 0 && end > start);
    const summaryBlock = terminalSource.slice(start, end);

    assert.match(
        summaryBlock,
        /finalResponse\?\.source === "EVIDENCE_GROUNDED_CONVERSATION"\s*\?\s*\[\]/
    );
    assert.match(
        terminalSource,
        /finalResponse\?\.source === "EVIDENCE_GROUNDED_CONVERSATION"\s*\?\s*"Jarvis"/
    );
});
'''

tests = tests[:index].rstrip() + "\n\n" + corrected_regressions.strip() + "\n"
test_path.write_text(tests, encoding="utf-8")
