
/* =====================================================================================
   JARVIS COGNITION ENGINE V1.2
   Semantic runtime + single-channel social terminal guard.
===================================================================================== */

(function(global) {

    function normalizeSocial(text = "") {

        return String(text)
            .toLowerCase()
            .trim()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function isSocialJarvis(input = "") {

        const text = normalizeSocial(input);

        return (
            text === "hola" ||
            text === "buenos dias" ||
            text === "buen dia" ||
            text === "buenas tardes" ||
            text === "buenas noches" ||
            text === "gracias" ||
            text === "muchas gracias" ||
            text === "que tal" ||
            text === "que onda" ||
            text === "como estas" ||
            text.includes("buenos dias") ||
            text.includes("buen dia") ||
            text.includes("buenas tardes") ||
            text.includes("buenas noches") ||
            text.includes("como estas") ||
            text.includes("que tal") ||
            text.includes("que onda")
        );
    }

    function socialReply(input = "") {

        const text = normalizeSocial(input);

        if (text.includes("buenos dias") || text.includes("buen dia")) {
            return "Buenos días, Arquitecto. Jarvis en línea y listo para operar.";
        }

        if (text.includes("buenas tardes")) {
            return "Buenas tardes, Arquitecto. Núcleo estable y atento.";
        }

        if (text.includes("buenas noches")) {
            return "Buenas noches, Arquitecto. Núcleo vigilante y operativo.";
        }

        if (text.includes("como estas")) {
            return "Operando estable, Arquitecto. Sin incidencias críticas registradas.";
        }

        if (text.includes("gracias")) {
            return "Siempre a la orden, Arquitecto.";
        }

        if (text.includes("que tal") || text.includes("que onda")) {
            return "Aquí estoy, Arquitecto. Jarvis listo para analizar, crear, reparar o escanear.";
        }

        return "Hola, Arquitecto. Jarvis en línea.";
    }

    function escapeHtml(value = "") {

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function renderSingleSocialReply(message = "") {

        const output =
            global.document
                ?.getElementById("gestia-output");

        if (!output) {
            console.log("🧠 [JARVIS_SOCIAL_REPLY]", message);
            return false;
        }

        const card =
            global.document.createElement("div");

        card.className =
            "flex gap-4 animate-fade-in max-w-4xl mx-auto w-full mt-4";

        card.innerHTML = `
            <div class="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/30">
                <i class="fa-solid fa-check text-white text-sm"></i>
            </div>
            <div class="bg-gestia-panel border border-emerald-700/60 p-5 rounded-2xl rounded-tl-none shadow-md flex-1">
                <h3 class="font-semibold text-white mb-3 text-lg">Jarvis</h3>
                <p class="text-slate-300 text-sm leading-relaxed font-mono whitespace-pre-wrap">${escapeHtml(message)}</p>
            </div>
        `;

        output.appendChild(card);
        output.scrollTop = output.scrollHeight;

        return true;
    }

    global.isSocialJarvis = isSocialJarvis;
    global.jarvisSocialReply = socialReply;
    global.renderJarvisSocialReply = renderSingleSocialReply;

    function stopTerminalSocialSubmit(event) {

        try {

            const form = event?.target;

            if (!form || form.id !== "gestia-form") {
                return;
            }

            const input =
                global.document
                    ?.getElementById("gestia-input");

            const text =
                String(input?.value || "").trim();

            if (!isSocialJarvis(text)) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();

            global.__JARVIS_SOCIAL_HANDLED__ = {
                text,
                at: Date.now()
            };

            const msg = socialReply(text);

            console.warn(
                "🧠 [TERMINAL_SOCIAL_GUARD_STOP]",
                text
            );

            if (input) {
                input.value = "";
            }

            renderSingleSocialReply(msg);

            if (typeof global.hablarJarvis === "function") {
                try {
                    global.hablarJarvis(msg);
                }
                catch (_) {}
            }

            global.JarvisMemory?.dispatch?.({
                type: "PUSH_HISTORY",
                payload: {
                    role: "user",
                    message: text
                }
            });

            global.JarvisMemory?.dispatch?.({
                type: "PUSH_HISTORY",
                payload: {
                    role: "assistant",
                    message: msg
                }
            });

        }
        catch(err) {

            console.warn(
                "⚠️ [TERMINAL_SOCIAL_GUARD_FAIL]",
                err
            );
        }
    }

    if (global.document?.addEventListener) {

        global.document.addEventListener(
            "submit",
            stopTerminalSocialSubmit,
            true
        );
    }

    const CognitionEngine = {

        version:
            "V1_2_SEMANTIC_RUNTIME_SINGLE_SOCIAL_GUARD",

        isSocial:
            isSocialJarvis,

        socialReply,

        renderSocialReply:
            renderSingleSocialReply,

        analyze(input = "") {

            const text =
                String(input)
                    .toLowerCase()
                    .trim();

            const cognition = {

                original:
                    input,

                timestamp:
                    Date.now(),

                intent:
                    "UNKNOWN",

                domain:
                    "general",

                target:
                    null,

                expectedOutput:
                    "generic",

                cognitionLayer:
                    "semantic_runtime",

                confidence:
                    0.5
            };

            if (isSocialJarvis(input)) {

                cognition.intent =
                    "SOCIAL";

                cognition.type =
                    "SOCIAL";

                cognition.domain =
                    "conversation";

                cognition.target =
                    "jarvis";

                cognition.expectedOutput =
                    "social_reply";

                cognition.cognitionLayer =
                    "social_guard";

                cognition.confidence =
                    1;

                cognition.reply =
                    socialReply(input);

                return cognition;
            }

            if (
                text.startsWith("buscar ") ||
                text.startsWith("search ") ||
                text.startsWith("find ")
            ) {

                cognition.intent =
                    "REPO_SEARCH";

                cognition.domain =
                    "repository";

                cognition.target =
                    text
                        .replace(/^buscar\s+/i, "")
                        .replace(/^search\s+/i, "")
                        .replace(/^find\s+/i, "");

                cognition.expectedOutput =
                    "repo_search_results";

                cognition.confidence =
                    0.99;

                return cognition;
            }

            if (
                /\bcrear archivo\b/i.test(text) ||
                /\bgenerar archivo\b/i.test(text) ||
                /\bnuevo archivo\b/i.test(text) ||
                /\bescribir archivo\b/i.test(text)
            ) {

                cognition.intent =
                    "CODE_WRITE";

                cognition.domain =
                    "repository";

                cognition.expectedOutput =
                    "file_write";

                cognition.cognitionLayer =
                    "repo_write";

                cognition.confidence =
                    0.98;

                const fileMatch =
                    text.match(
                        /([a-z0-9\-_]+\.(txt|js|html|css|json))/i
                    );

                if (fileMatch) {
                    cognition.target = fileMatch[1];
                }

                return cognition;
            }

            const removeIntent =
                /\belimina\b/i.test(text) ||
                /\bborra\b/i.test(text) ||
                /\bquita\b/i.test(text) ||
                /\bremueve\b/i.test(text) ||
                /\bsuprime\b/i.test(text);

            if (removeIntent) {

                cognition.intent =
                    "FUNCTION_REMOVE";

                cognition.domain =
                    "repository";

                cognition.expectedOutput =
                    "repo_patch";

                cognition.cognitionLayer =
                    "repo_surgeon";

                cognition.confidence =
                    0.95;

                const targetMatch =
                    text.match(
                        /(?:elimina|borra|quita|remueve|suprime)\s+([a-z0-9_]+)/i
                    );

                if (targetMatch) {
                    cognition.target = targetMatch[1];
                }

                const fileMatch =
                    text.match(
                        /([a-z0-9\-_]+\.js)/i
                    );

                if (fileMatch) {

                    cognition.targetFile =
                        fileMatch[1];

                    const found =
                        window.findRepoFile?.(
                            cognition.targetFile
                        );

                    if (found) {
                        cognition.repoNode = found[1];
                        cognition.repoAware = true;
                    }
                }

                return cognition;
            }

            const wantsRepair =
                /\brepara\b/i.test(text) ||
                /\bcorrige\b/i.test(text) ||
                /\bajusta\b/i.test(text) ||
                /\bmodifica\b/i.test(text) ||
                /\baplica patch\b/i.test(text) ||
                /\bgenera patch\b/i.test(text) ||
                /\bcrear patch\b/i.test(text) ||
                /\baplicar patch\b/i.test(text) ||
                /\bfix\b/i.test(text);

            if (
                text.includes(".html") ||
                text.includes("responsive") ||
                text.includes("ui") ||
                text.includes("frontend") ||
                text.includes("layout")
            ) {

                cognition.intent =
                    wantsRepair
                        ? "REPAIR_UI"
                        : "ANALYZE_UI";

                cognition.domain =
                    "frontend";

                cognition.expectedOutput =
                    "human_ui_analysis";

                cognition.cognitionLayer =
                    "ui_audit";

                cognition.confidence =
                    0.92;

                const fileMatch =
                    text.match(
                        /([a-z0-9\-_]+\.html)/i
                    );

                if (fileMatch) {
                    cognition.target = fileMatch[1];
                }
                else {

                    const humanFileMatch =
                        text.match(
                            /([a-z0-9\-_ ]+)\s+html/i
                        );

                    if (humanFileMatch) {
                        cognition.target =
                            humanFileMatch[1]
                                .trim()
                                .replace(/\s+/g, "-") +
                            ".html";
                    }
                }
            }

            if (
                text.includes(".js") ||
                text.includes("firebase") ||
                text.includes("runtime")
            ) {

                cognition.intent =
                    "ANALYZE_RUNTIME";

                cognition.domain =
                    "backend";

                cognition.expectedOutput =
                    "technical_runtime_analysis";

                cognition.cognitionLayer =
                    "runtime_audit";

                cognition.confidence =
                    0.90;

                const fileMatch =
                    text.match(
                        /([a-z0-9\-_]+\.js)/i
                    );

                if (fileMatch) {

                    cognition.target =
                        fileMatch[1];

                    const found =
                        window.findRepoFile?.(
                            cognition.target
                        );

                    if (found) {

                        cognition.repoNode =
                            found[1];

                        cognition.repoAware =
                            true;

                        console.log(
                            "🧠 [REPO_NODE_FOUND]",
                            cognition.target,
                            cognition.repoNode
                        );
                    }
                }
            }

            if (
                cognition.target &&
                window.__REPO_COGNITION__?.[
                    cognition.target
                ]
            ) {

                cognition.repoNode =
                    window.__REPO_COGNITION__[
                        cognition.target
                    ];

                cognition.repoAware =
                    true;

                console.log(
                    "🧠 [REPO_NODE_FOUND]",
                    cognition.target,
                    cognition.repoNode
                );
            }

            return cognition;
        }
    };

    global.JarvisCognitionEngine =
        CognitionEngine;

    console.log(
        "🧠 [JARVIS_COGNITION_ENGINE] ONLINE V1.2 SINGLE SOCIAL GUARD"
    );

})(window);
