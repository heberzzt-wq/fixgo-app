from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)


def append_once(text, marker, addition):
    if marker in text:
        return text
    return text.rstrip() + "\n\n" + addition.strip() + "\n"


# -----------------------------------------------------------------------------
# 1) Human multimodal response. Keep the deterministic evidence engine intact;
#    only change the user-facing wording.
# -----------------------------------------------------------------------------
composer_path = Path("gestia-core/jarvis/jarvis.conversation.composer.js")
composer = composer_path.read_text(encoding="utf-8")

replacements = [
    (
        '`Analisis visual verificado de ${sources.length} archivos, con evidencia separada por fuente.`',
        '`Pariente, revisé visualmente ${sources.length} archivos y esto es lo que sí pude confirmar.`',
        "human media intro",
    ),
    (
        'appendNaturalList(lines, "Elementos visuales confirmados:", objects);',
        'appendNaturalList(lines, "Lo que se ve con claridad:", objects);',
        "human objects label",
    ),
    (
        'appendNaturalList(lines, "Observaciones visuales verificadas:", observations);',
        'appendNaturalList(lines, "Lo que pude confirmar:", observations);',
        "human observations label",
    ),
    (
        '            lines.push("Lecturas literales verificadas:");',
        '            lines.push("Texto que pude leer con certeza:");',
        "human literal label",
    ),
    (
        '                "Lecturas literales verificadas: ninguna con confianza suficiente."',
        '                "No pude leer texto con suficiente claridad como para asegurarlo."',
        "human no literal label",
    ),
    (
        '            "Detalles inciertos o ilegibles:",',
        '            "Lo que prefiero dejar como incierto:",',
        "human uncertainty label",
    ),
    (
        '        "Diferencias verificadas:",',
        '        "Diferencias que sí pude comprobar:",',
        "human differences label",
    ),
    (
        '            "Diferencias verificadas: se omitieron comparaciones con etiquetas literales o afirmaciones de ausencia que no quedaron respaldadas por visibleData verificado."',
        '            "Había comparaciones que no quedaron suficientemente respaldadas, así que preferí dejarlas fuera en vez de asumir."',
        "human omitted comparison note",
    ),
    (
        '        "Mejoras sugeridas para la experiencia de adjuntos:",',
        '        "Si quieres mejorar esta experiencia:",',
        "human recommendations label",
    ),
    (
        '            "Mejoras sugeridas: no se muestran propuestas que dependan de etiquetas o capacidades no verificadas visualmente."',
        '            "Dejé fuera sugerencias que dependían de datos o capacidades que no pude comprobar visualmente."',
        "human omitted recommendation note",
    ),
    (
        '        "La mision uso una sola ejecucion efectiva de media.analyze con dos pases independientes de verificacion."',
        '        "Me quedé sólo con lo que pude verificar en las imágenes; lo dudoso lo dejé fuera."',
        "human closing",
    ),
]

for old, new, label in replacements:
    composer = replace_once(composer, old, new, label)

composer_path.write_text(composer, encoding="utf-8")


# -----------------------------------------------------------------------------
# 2) Tool runtime emits a sanitized operational lifecycle event. It never puts
#    args, results, prompts or reasoning into the event detail.
# -----------------------------------------------------------------------------
runtime_path = Path("gestia-core/tools.runtime.js")
runtime = runtime_path.read_text(encoding="utf-8")

runtime = replace_once(
    runtime,
    "export const JarvisToolRuntime = {",
    '''function emitJarvisWorkProgress(detail = {}) {
    if (
        typeof window === "undefined" ||
        typeof window.dispatchEvent !== "function" ||
        typeof CustomEvent !== "function"
    ) {
        return;
    }

    try {
        window.dispatchEvent(
            new CustomEvent("jarvis:work-progress", {
                detail: {
                    phase: "tool",
                    state: String(detail.state || ""),
                    tool: String(detail.tool || ""),
                    executionId: String(detail.executionId || ""),
                    analysisId: String(detail.analysisId || ""),
                    timestamp: Number(detail.timestamp || Date.now())
                }
            })
        );
    }
    catch(error) {
        console.warn("[JARVIS_WORK_PROGRESS_EVENT_FAILED]", error);
    }
}

export const JarvisToolRuntime = {''',
    "tool progress emitter",
)

runtime = replace_once(
    runtime,
    '''        try {
            for (const mw of this._middleware) {''',
    '''        emitJarvisWorkProgress({
            state: "started",
            tool: name,
            executionId: executionContext.executionId,
            analysisId:
                context.analysisId ||
                context.traceId ||
                "",
            timestamp: Date.now()
        });

        try {
            for (const mw of this._middleware) {''',
    "tool progress start",
)

runtime = replace_once(
    runtime,
    '''            if (result && result.ok === false) {
                return {
                    ...result,
                    tool: name,
                    executionId: executionContext.executionId,
                    timestamp: Date.now()
                };
            }

            return {
                ok: true,''',
    '''            if (result && result.ok === false) {
                emitJarvisWorkProgress({
                    state: "failed",
                    tool: name,
                    executionId: executionContext.executionId,
                    analysisId:
                        context.analysisId ||
                        context.traceId ||
                        "",
                    timestamp: Date.now()
                });

                return {
                    ...result,
                    tool: name,
                    executionId: executionContext.executionId,
                    timestamp: Date.now()
                };
            }

            emitJarvisWorkProgress({
                state: "completed",
                tool: name,
                executionId: executionContext.executionId,
                analysisId:
                    context.analysisId ||
                    context.traceId ||
                    "",
                timestamp: Date.now()
            });

            return {
                ok: true,''',
    "tool progress completed",
)

runtime = replace_once(
    runtime,
    '''        } catch (error) {
            console.error(
                `[RUNTIME_CRITICAL] Fallo en ${name}:`,
                error
            );

            return {
                ok: false,''',
    '''        } catch (error) {
            console.error(
                `[RUNTIME_CRITICAL] Fallo en ${name}:`,
                error
            );

            emitJarvisWorkProgress({
                state: "failed",
                tool: name,
                executionId: executionContext.executionId,
                analysisId:
                    context.analysisId ||
                    context.traceId ||
                    "",
                timestamp: Date.now()
            });

            return {
                ok: false,''',
    "tool progress failed",
)

runtime_path.write_text(runtime, encoding="utf-8")


# -----------------------------------------------------------------------------
# 3) Terminal live work trace: ChatGPT/Codex-like operational progress, but only
#    real phases and tool lifecycle. No private chain-of-thought, prompts or raw
#    tool payloads are displayed.
# -----------------------------------------------------------------------------
terminal_path = Path("gestia-terminal.html")
terminal = terminal_path.read_text(encoding="utf-8")

progress_ui = r'''

    /* =====================================================
       ADJUNTO LIVE WORK TRACE V94
       Superficie humana de actividad verificable.
       No muestra prompts internos, argumentos, resultados crudos ni razonamiento.
    ===================================================== */
    window.JarvisWorkTrace = (() => {
        let activeTracker = null;

        const toolLabels = {
            "media.analyze": "Analizando imágenes y archivos",
            "web.research": "Consultando información en Internet",
            "repo.scan": "Revisando la estructura del repositorio",
            "repo.search": "Buscando evidencia en el repositorio",
            "repo.grep": "Buscando coincidencias en el código",
            "repo.read": "Leyendo archivos relevantes",
            "repo.diagnose": "Diagnosticando el archivo objetivo",
            "repo.impact": "Calculando impacto del cambio",
            "repo.patchPreview": "Preparando una vista previa segura",
            "tests.run": "Ejecutando pruebas",
            "system.health": "Verificando el estado del sistema",
            "system.forensics": "Verificando capacidades y límites",
            "system.capabilities": "Revisando capacidades disponibles",
            "system.certify": "Certificando el resultado",
            "conversation.respond": "Preparando la respuesta",
            "business.assist": "Preparando el análisis de negocio",
            "marketing.plan": "Preparando el plan de marketing",
            "page.plan": "Preparando la propuesta de página"
        };

        const safeText = value =>
            String(value || "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/\"/g, "&quot;")
                .replace(/'/g, "&#039;");

        const scrollToLatest = () => {
            if (!output) return;
            requestAnimationFrame(() => {
                output.scrollTop = output.scrollHeight;
            });
        };

        const yieldToPaint = () =>
            new Promise(resolve => requestAnimationFrame(() => resolve()));

        const toolLabel = name =>
            toolLabels[String(name || "")] ||
            (String(name || "").startsWith("repo.")
                ? "Trabajando con el repositorio"
                : "Ejecutando una herramienta");

        const start = ({ traceId = "", hasAttachments = false } = {}) => {
            if (activeTracker && !activeTracker.isFinished()) {
                activeTracker.finish("Trabajo anterior cerrado");
            }

            const wrapper = document.createElement("div");
            wrapper.className = "flex gap-4 animate-fade-in max-w-4xl mx-auto w-full";
            wrapper.dataset.testid = "jarvis-work-trace";
            wrapper.innerHTML = `
                <div class="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                    <i class="fa-solid fa-gears text-blue-300 text-sm"></i>
                </div>
                <details open class="flex-1 bg-slate-900/70 border border-slate-700 rounded-2xl rounded-tl-none shadow-md overflow-hidden">
                    <summary class="cursor-pointer select-none px-4 py-3 flex items-center gap-3 text-sm text-slate-200 list-none">
                        <span data-role="summary-icon" class="text-blue-300"><i class="fa-solid fa-circle-notch fa-spin"></i></span>
                        <span data-role="summary" class="font-medium">ADJUNTO está trabajando</span>
                        <span data-role="count" class="ml-auto text-xs text-slate-500">0 pasos</span>
                    </summary>
                    <div data-role="steps" aria-live="polite" class="px-4 pb-4 space-y-2"></div>
                </details>
            `;

            output?.appendChild(wrapper);
            scrollToLatest();

            const details = wrapper.querySelector("details");
            const stepsNode = wrapper.querySelector('[data-role="steps"]');
            const summaryNode = wrapper.querySelector('[data-role="summary"]');
            const summaryIcon = wrapper.querySelector('[data-role="summary-icon"]');
            const countNode = wrapper.querySelector('[data-role="count"]');
            const rows = new Map();
            let finished = false;
            let boundTraceId = String(traceId || "");
            let sequence = 0;

            const updateCount = () => {
                if (countNode) {
                    countNode.textContent = `${rows.size} ${rows.size === 1 ? "paso" : "pasos"}`;
                }
            };

            const setRow = (id, label, state = "active") => {
                if (finished || !stepsNode) return null;
                const safeId = String(id || `step-${++sequence}`);
                let row = rows.get(safeId);
                if (!row) {
                    row = document.createElement("div");
                    row.className = "flex items-start gap-2 text-sm leading-5";
                    row.dataset.workStep = safeId;
                    stepsNode.appendChild(row);
                    rows.set(safeId, row);
                }

                const icon =
                    state === "completed"
                        ? '<i class="fa-solid fa-check text-emerald-400"></i>'
                        : state === "failed"
                            ? '<i class="fa-solid fa-xmark text-rose-400"></i>'
                            : '<i class="fa-solid fa-circle-notch fa-spin text-blue-300"></i>';
                const tone =
                    state === "failed"
                        ? "text-rose-300"
                        : state === "completed"
                            ? "text-slate-400"
                            : "text-slate-200";

                row.dataset.state = state;
                row.innerHTML = `
                    <span class="w-4 pt-0.5 shrink-0">${icon}</span>
                    <span class="${tone}">${safeText(label)}</span>
                `;
                updateCount();
                scrollToLatest();
                return row;
            };

            const tracker = {
                wrapper,
                hasAttachments,
                bindTrace(nextTraceId = "") {
                    boundTraceId = String(nextTraceId || "");
                },
                acceptsEvent(detail = {}) {
                    if (finished) return false;
                    const eventTrace = String(detail.analysisId || "");
                    return !eventTrace || !boundTraceId || eventTrace === boundTraceId;
                },
                activate(id, label) {
                    return setRow(id, label, "active");
                },
                complete(id, label) {
                    return setRow(id, label, "completed");
                },
                failStep(id, label) {
                    return setRow(id, label, "failed");
                },
                toolEvent(detail = {}) {
                    if (!this.acceptsEvent(detail)) return;
                    const state = String(detail.state || "");
                    const name = String(detail.tool || "");
                    const id = `tool:${String(detail.executionId || name || ++sequence)}`;
                    const label = toolLabel(name);
                    if (state === "completed") this.complete(id, label);
                    else if (state === "failed") this.failStep(id, label);
                    else this.activate(id, label);
                },
                isFinished() {
                    return finished;
                },
                finish(label = "Trabajo completado") {
                    if (finished) return;
                    for (const [id, row] of rows) {
                        if (row?.dataset?.state === "active") {
                            const text = row.textContent?.trim() || "Paso completado";
                            setRow(id, text, "completed");
                        }
                    }
                    finished = true;
                    if (summaryNode) summaryNode.textContent = label;
                    if (summaryIcon) summaryIcon.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i>';
                    if (details) details.open = true;
                    updateCount();
                    scrollToLatest();
                },
                fail(label = "No pude completar la misión") {
                    if (finished) return;
                    finished = true;
                    if (summaryNode) summaryNode.textContent = label;
                    if (summaryIcon) summaryIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-amber-400"></i>';
                    if (details) details.open = true;
                    updateCount();
                    scrollToLatest();
                }
            };

            activeTracker = tracker;
            return tracker;
        };

        window.addEventListener("jarvis:work-progress", event => {
            activeTracker?.toolEvent?.(event?.detail || {});
        });

        return {
            start,
            yieldToPaint,
            current: () => activeTracker
        };
    })();
'''

terminal = replace_once(
    terminal,
    '    const btnGenerate = document.getElementById("btn-generate");\n',
    '    const btnGenerate = document.getElementById("btn-generate");\n' + progress_ui + '\n',
    "live work trace UI",
)

terminal = replace_once(
    terminal,
    '''            let handled = false; 
            
            try {''',
    '''            let handled = false;
            let activeWorkTracker = null;

            try {''',
    "work tracker lifetime",
)

core_route_old = '''if (
    window.GestiaCore?.procesarIntencion &&
    !["arre", "confirmar", "ok"].includes(cmd)
) {
    try {
                const terminalBrainRoute =
            await routeTerminalNaturalIntent(
                comando,
                {
                    activePatchProposal:
                        window.__SIA7_ACTIVE_VISUAL_PATCH_PROPOSAL__ ||
                        null,
                    lastPatchPreview:
                        readLastPatchPreviewCandidate?.() ||
                        null,
                    traceId:
                        currentTraceId
                }
            );'''

core_route_new = '''if (
    window.GestiaCore?.procesarIntencion &&
    !["arre", "confirmar", "ok"].includes(cmd)
) {
    try {
        activeWorkTracker =
            window.JarvisWorkTrace?.start?.({
                traceId: currentTraceId,
                hasAttachments:
                    window.JarvisAttachments?.hasFiles?.() === true
            }) || null;

        activeWorkTracker?.activate(
            "request",
            window.JarvisAttachments?.hasFiles?.() === true
                ? "Preparando la solicitud y los adjuntos"
                : "Analizando la solicitud"
        );
        await window.JarvisWorkTrace?.yieldToPaint?.();
        activeWorkTracker?.complete(
            "request",
            window.JarvisAttachments?.hasFiles?.() === true
                ? "Solicitud y adjuntos preparados"
                : "Solicitud recibida"
        );
        activeWorkTracker?.activate(
            "routing",
            "Entendiendo qué necesita la misión"
        );

        const terminalBrainRoute =
            await routeTerminalNaturalIntent(
                comando,
                {
                    activePatchProposal:
                        window.__SIA7_ACTIVE_VISUAL_PATCH_PROPOSAL__ ||
                        null,
                    lastPatchPreview:
                        readLastPatchPreviewCandidate?.() ||
                        null,
                    traceId:
                        currentTraceId
                }
            );

        activeWorkTracker?.complete(
            "routing",
            "Misión comprendida"
        );'''

terminal = replace_once(
    terminal,
    core_route_old,
    core_route_new,
    "core route live progress",
)

terminal = replace_once(
    terminal,
    '''        const coreResult =
            await window.GestiaCore.procesarIntencion(''',
    '''        activeWorkTracker?.activate(
            "core",
            window.JarvisAttachments?.hasFiles?.() === true
                ? "Analizando adjuntos y ejecutando herramientas"
                : "Ejecutando la misión"
        );
        await window.JarvisWorkTrace?.yieldToPaint?.();

        const coreResult =
            await window.GestiaCore.procesarIntencion(''',
    "core execution active",
)

terminal = replace_once(
    terminal,
    '''            );

            const preferredAgentFinalResponse =''',
    '''            );

            activeWorkTracker?.complete(
                "core",
                "Ejecución principal completada"
            );
            activeWorkTracker?.activate(
                "evidence",
                "Integrando la evidencia verificada"
            );

            const preferredAgentFinalResponse =''',
    "core execution completed",
)

old_trace = '''                        ...(
                            finalResponse?.text &&
                            finalResponse?.source !== "EVIDENCE_GROUNDED_CONVERSATION"
                                ? [
                                    "Evidencia ejecutada:",
                                    ...agentObservations
                                        .map((item, index) =>
                                            `- ${getObservationToolName(item, index)}`
                                        )
                                        .filter((name, index, items) =>
                                            items.indexOf(name) === index
                                        )
                                ]
                                : agentObservations
                                    .map((item, index) =>
                                        [
                                            `Paso ${index + 1}`,
                                            summarizeObservation(item, index)
                                        ]
                                            .join("\\n")
                                    )
                        )'''

new_trace = '''                        ...(
                            finalResponse?.text
                                ? (
                                    finalResponse?.source === "EVIDENCE_GROUNDED_CONVERSATION"
                                        ? []
                                        : [
                                            "Evidencia ejecutada:",
                                            ...agentObservations
                                                .map((item, index) =>
                                                    `- ${getObservationToolName(item, index)}`
                                                )
                                                .filter((name, index, items) =>
                                                    items.indexOf(name) === index
                                                )
                                        ]
                                )
                                : agentObservations
                                    .map((item, index) =>
                                        [
                                            `Paso ${index + 1}`,
                                            summarizeObservation(item, index)
                                        ]
                                            .join("\\n")
                                    )
                        )'''

terminal = replace_once(
    terminal,
    old_trace,
    new_trace,
    "grounded conversation raw trace suppression",
)

old_title = '''                const multiToolTitle =
                    visualPatchProposal
                        ? "Propuesta visual SIA7"
                        : finalResponse?.title ||
                            (
                                isRepoGlobalAnalysis
                                    ? "Análisis del repositorio"
                                    : "Resultado de Jarvis"
                            );'''

new_title = '''                const multiToolTitle =
                    visualPatchProposal
                        ? "Propuesta visual SIA7"
                        : finalResponse?.source === "EVIDENCE_GROUNDED_CONVERSATION"
                            ? "Jarvis"
                            : finalResponse?.title ||
                                (
                                    isRepoGlobalAnalysis
                                        ? "Análisis del repositorio"
                                        : "Resultado de Jarvis"
                                );'''

terminal = replace_once(
    terminal,
    old_title,
    new_title,
    "grounded conversation title",
)

terminal = replace_once(
    terminal,
    '''                const multiToolSummarySource =
                    [''',
    '''                activeWorkTracker?.complete(
                    "evidence",
                    "Evidencia integrada"
                );
                activeWorkTracker?.activate(
                    "response",
                    "Preparando la respuesta final"
                );

                const multiToolSummarySource =
                    [''',
    "response preparation progress",
)

terminal = replace_once(
    terminal,
    '''                window.renderJarvisResponse?.(
                    multiToolTitle,
                    visualPatchProposal ||
                        multiToolSummary,
                    coreResult?.status === "FAILED"
                        ? "warning"
                        : "info"
                );

                window.JarvisAttachments''',
    '''                window.renderJarvisResponse?.(
                    multiToolTitle,
                    visualPatchProposal ||
                        multiToolSummary,
                    coreResult?.status === "FAILED"
                        ? "warning"
                        : "info"
                );

                activeWorkTracker?.complete(
                    "response",
                    "Respuesta preparada"
                );
                activeWorkTracker?.finish(
                    "Trabajo completado"
                );

                window.JarvisAttachments''',
    "response completion progress",
)

terminal = replace_once(
    terminal,
    '''                    window.renderJarvisResponse?.(
                        "Jarvis",
                        conversationText,
                        "success"
                    );
                    await window.hablarJarvis?.(conversationText);''',
    '''                    activeWorkTracker?.complete(
                        "evidence",
                        "Respuesta conversacional verificada"
                    );
                    activeWorkTracker?.activate(
                        "response",
                        "Preparando la respuesta"
                    );
                    window.renderJarvisResponse?.(
                        "Jarvis",
                        conversationText,
                        "success"
                    );
                    activeWorkTracker?.complete(
                        "response",
                        "Respuesta preparada"
                    );
                    activeWorkTracker?.finish(
                        "Trabajo completado"
                    );
                    await window.hablarJarvis?.(conversationText);''',
    "conversation-only completion progress",
)

terminal = replace_once(
    terminal,
    '''                if (window.hablarJarvis) window.hablarJarvis("Error crítico en la ráfaga de comandos.");
            } finally {''',
    '''                activeWorkTracker?.fail?.(
                    "No pude completar la misión"
                );
                if (window.hablarJarvis) window.hablarJarvis("Error crítico en la ráfaga de comandos.");
            } finally {
                if (
                    activeWorkTracker &&
                    !activeWorkTracker.isFinished?.()
                ) {
                    if (handled) {
                        activeWorkTracker.finish?.(
                            "Trabajo completado"
                        );
                    }
                    else {
                        activeWorkTracker.fail?.(
                            "Trabajo detenido"
                        );
                    }
                }''',
    "work tracker finally close",
)

terminal_path.write_text(terminal, encoding="utf-8")


# -----------------------------------------------------------------------------
# 4) Regressions. Update only assertions tied to the presentation wording and
#    add a source-contract test for the live progress lifecycle.
# -----------------------------------------------------------------------------
test_path = Path("tests/jarvis-conversation-composer.test.mjs")
tests = test_path.read_text(encoding="utf-8")

presentation_assertion_replacements = [
    (
        'assert.match(result.text, /una sola ejecucion efectiva de media\\.analyze/);',
        'assert.match(result.text, /Me quedé sólo con lo que pude verificar/i);',
    ),
    (
        'assert.match(result.text, /Observaciones visuales verificadas:/);',
        'assert.match(result.text, /Lo que pude confirmar:/);',
    ),
    (
        '/se omitieron comparaciones con etiquetas literales/i',
        '/preferí dejarlas fuera en vez de asumir/i',
    ),
    (
        '/no se muestran propuestas/i',
        '/Dejé fuera sugerencias/i',
    ),
]

for old, new in presentation_assertion_replacements:
    tests = tests.replace(old, new)

marker = "terminal exposes live operational work trace without raw telemetry"
regression = r'''
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
    assert.match(terminalSource, /data-testid=\\?"jarvis-work-trace\\?"/);
    assert.match(terminalSource, /jarvis:work-progress/);
    assert.match(terminalSource, /Analizando imágenes y archivos/);
    assert.match(terminalSource, /Entendiendo qué necesita la misión/);
    assert.match(terminalSource, /Preparando la respuesta final/);
    assert.match(terminalSource, /Trabajo completado/);

    const progressStart = terminalSource.indexOf("ADJUNTO LIVE WORK TRACE V94");
    const progressEnd = terminalSource.indexOf("function isTerminalBrainRuntimeReady", progressStart);
    assert.ok(progressStart >= 0 && progressEnd > progressStart);
    const progressBlock = terminalSource.slice(progressStart, progressEnd);
    assert.doesNotMatch(progressBlock, /JSON\\.stringify|args:|result:|prompt:/);

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
        /finalResponse\\?\\.source === "EVIDENCE_GROUNDED_CONVERSATION"\\s*\\? \\[\\]/
    );
    assert.match(
        terminalSource,
        /finalResponse\\?\\.source === "EVIDENCE_GROUNDED_CONVERSATION"\\s*\\? "Jarvis"/
    );
});
'''

tests = append_once(tests, marker, regression)
test_path.write_text(tests, encoding="utf-8")
