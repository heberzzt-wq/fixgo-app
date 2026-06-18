/**
 * =====================================================================================
 * JARVIS SCANNER ENGINE v2.0
 * Structural File Scanner for Gestia / FixGo.
 *
 * Goals:
 * - Preserve the legacy summary contract used by executor/orchestrator.
 * - Add structured findings, evidence, safe-zone awareness and patchability.
 * - Avoid executing scanned code.
 * =====================================================================================
 */

const VERSION = "2.0.0-structural-evidence";

const SEVERITY_WEIGHT = {
    CRITICAL: 8,
    HIGH: 5,
    MEDIUM: 3,
    LOW: 1,
    INFO: 0
};

export function scanFile(fileName = "", content = "", options = {}) {
    const text = String(content || "");
    const linesArr = text.split(/\r?\n/);
    const lower = text.toLowerCase();
    const type = detectType(fileName);
    const structure = buildStructure(text, linesArr);

    const report = {
        ok: true,
        engine: "jarvis_scanner_engine",
        version: VERSION,
        file: fileName,
        type,
        language: resolveLanguage(type),
        lines: linesArr.length,
        chars: text.length,
        sourceHash: hashLight(text),

        metrics: {
            imports: structure.imports.length,
            exports: structure.exports.length,
            functions: structure.functions.filter(item => item.kind === "function").length,
            arrowFunctions: count(text, /=>/g),
            asyncFunctions: count(text, /\basync\s+/g),
            awaits: count(text, /\bawait\b/g),
            classes: structure.classes.length,
            ifs: count(text, /\bif\s*\(/g),
            loops: count(text, /\bfor\s*\(|\bwhile\s*\(/g)
        },

        dom: {
            querySelector: count(text, /querySelector/g),
            getById: count(text, /getElementById/g),
            listeners: count(text, /addEventListener/g),
            innerHTML: count(text, /innerHTML/g),
            createElement: count(text, /createElement/g)
        },

        globals: {
            windowRefs: count(text, /window\./g),
            documentRefs: count(text, /document\./g),
            localStorage: count(text, /localStorage/g),
            sessionStorage: count(text, /sessionStorage/g)
        },

        firebase: {
            auth: count(lower, /\bauth\b/g),
            firestore: count(lower, /getdoc|updatedoc|adddoc|setdoc|collection|doc\(/g),
            storage: count(lower, /uploadbytes|getdownloadurl|storageref|\bstorage\b/g),
            timestamps: count(lower, /servertimestamp/g)
        },

        structure,
        syntax: analyzeSyntaxBalance(text),
        findings: [],
        flags: [],
        risk: "LOW",
        riskScore: 0,
        recommendations: [],
        summary: {
            totalFindings: 0,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            patchable: 0
        },
        options: {
            mode: options.mode || "standard"
        }
    };

    analyzeFindings(report, text, lower, linesArr);
    analyzeFlags(report, lower);
    calculateRisk(report);
    buildRecommendations(report);

    return report;
}

function detectType(name = "") {
    const file = String(name || "").toLowerCase();

    if (file.endsWith(".html")) return "HTML";
    if (file.endsWith(".css")) return "CSS";
    if (file.endsWith(".json")) return "JSON";
    if (file.endsWith(".md")) return "MARKDOWN";
    if (file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".cjs")) {
        return "JAVASCRIPT";
    }

    return "UNKNOWN";
}

function resolveLanguage(type = "") {
    if (type === "JAVASCRIPT") return "javascript";
    if (type === "HTML") return "html";
    if (type === "CSS") return "css";
    if (type === "JSON") return "json";
    return "text";
}

function count(text, regex) {
    const found = String(text || "").match(regex);
    return found ? found.length : 0;
}

function hashLight(text = "") {
    let hash = 2166136261;

    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }

    return (hash >>> 0).toString(16);
}

function buildStructure(text = "", linesArr = []) {
    return {
        imports: collectMatches(text, /^\s*import\s+(.+?)\s+from\s+["']([^"']+)["']/gm, match => ({
            specifier: match[1].trim(),
            source: match[2]
        })),
        sideEffectImports: collectMatches(text, /^\s*import\s+["']([^"']+)["']/gm, match => ({
            source: match[1]
        })),
        exports: collectMatches(text, /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)?\s*([a-zA-Z0-9_$]*)/gm, match => ({
            name: match[1] || "default",
            declaration: match[0].trim()
        })),
        functions: [
            ...collectMatches(text, /\b(async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/g, match => ({
                kind: "function",
                async: !!match[1],
                name: match[2]
            })),
            ...collectMatches(text, /\b(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g, match => ({
                kind: "arrow",
                name: match[1],
                async: /async/.test(match[0])
            }))
        ],
        classes: collectMatches(text, /\bclass\s+([a-zA-Z0-9_$]+)/g, match => ({
            name: match[1]
        })),
        safeZones: collectSafeZones(linesArr)
    };
}

function collectMatches(text = "", regex, mapper) {
    const items = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        items.push({
            ...mapper(match),
            index: match.index,
            line: lineFromIndex(text, match.index),
            snippet: match[0].trim().slice(0, 160)
        });
    }

    return items;
}

function collectSafeZones(linesArr = []) {
    const zones = [];
    let active = null;

    linesArr.forEach((line, index) => {
        if (/fixgo_safe_edit_start/i.test(line)) {
            active = {
                startLine: index + 1,
                endLine: null
            };
        }

        if (/fixgo_safe_edit_end/i.test(line) && active) {
            active.endLine = index + 1;
            zones.push(active);
            active = null;
        }
    });

    if (active) {
        zones.push({
            ...active,
            open: true
        });
    }

    return zones;
}

function lineFromIndex(text = "", index = 0) {
    return text.slice(0, index).split(/\r?\n/).length;
}

function columnFromIndex(text = "", index = 0) {
    const before = text.slice(0, index);
    const lastLine = before.split(/\r?\n/).pop() || "";
    return lastLine.length + 1;
}

function lineText(linesArr = [], line = 1) {
    return String(linesArr[Math.max(0, line - 1)] || "").trim().slice(0, 220);
}

function analyzeSyntaxBalance(text = "") {
    const pairs = [
        ["{", "}"],
        ["(", ")"],
        ["[", "]"]
    ];

    const balance = {};
    let ok = true;

    for (const [open, close] of pairs) {
        const openCount = count(text, new RegExp(escapeRegExp(open), "g"));
        const closeCount = count(text, new RegExp(escapeRegExp(close), "g"));
        balance[`${open}${close}`] = openCount - closeCount;

        if (openCount !== closeCount) {
            ok = false;
        }
    }

    return {
        checked: true,
        ok,
        method: "balanced-delimiter-scan",
        balance
    };
}

function escapeRegExp(value = "") {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addFinding(report, finding) {
    const normalized = {
        id: finding.id,
        rule: finding.rule || finding.id,
        severity: finding.severity || "INFO",
        category: finding.category || "general",
        title: finding.title || finding.id,
        message: finding.message || finding.title || finding.id,
        confidence:
            typeof finding.confidence === "number"
                ? finding.confidence
                : 0.7,
        patchable: finding.patchable === true,
        safe: finding.safe !== false,
        evidence: finding.evidence || null,
        action: finding.action || null,
        tags: finding.tags || []
    };

    report.findings.push(normalized);

    if (normalized.patchable) {
        report.summary.patchable += 1;
    }

    const key = normalized.severity.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(report.summary, key)) {
        report.summary[key] += 1;
    }

    report.summary.totalFindings = report.findings.length;
}

function analyzeFindings(report, text, lower, linesArr) {
    if (text.trim().length === 0) {
        addFinding(report, {
            id: "EMPTY_SOURCE",
            severity: "CRITICAL",
            category: "write_guard",
            title: "Empty source blocked",
            message: "The file has no executable content.",
            confidence: 1,
            patchable: false,
            safe: false,
            tags: ["empty-write"]
        });
    }

    if (!report.syntax.ok) {
        addFinding(report, {
            id: "UNBALANCED_SYNTAX_DELIMITERS",
            severity: "HIGH",
            category: "syntax",
            title: "Possible syntax imbalance",
            message: "Delimiter counts are not balanced; run parser validation before writing.",
            confidence: 0.72,
            patchable: false,
            safe: false,
            evidence: {
                balance: report.syntax.balance
            },
            tags: ["syntax"]
        });
    }

    matchLines(text, /\bdate\.now\s*\(\s*\)/gi).forEach(item => {
        addFinding(report, {
            id: "LOWERCASE_DATE_NOW",
            severity: "HIGH",
            category: "runtime",
            title: "Invalid Date.now casing",
            message: "date.now() will fail at runtime. Use Date.now().",
            confidence: 0.99,
            patchable: true,
            safe: true,
            evidence: {
                line: item.line,
                column: item.column,
                snippet: lineText(linesArr, item.line),
                match: item.match
            },
            action: {
                type: "replace_all",
                find: "date.now()",
                replace: "Date.now()"
            },
            tags: ["runtime", "safe-replace"]
        });
    });

    matchLines(text, /\b(eval|Function)\s*\(/g).forEach(item => {
        addFinding(report, {
            id: "DYNAMIC_CODE_EXECUTION",
            severity: "CRITICAL",
            category: "security",
            title: "Dynamic code execution",
            message: "Dynamic execution is unsafe in Jarvis-managed code paths.",
            confidence: 0.9,
            patchable: false,
            safe: false,
            evidence: {
                line: item.line,
                column: item.column,
                snippet: lineText(linesArr, item.line),
                match: item.match
            },
            tags: ["security"]
        });
    });

    matchLines(text, /\b[a-z0-9_$-]*(?:token|secret|api[_-]?key|password)[a-z0-9_$-]*\b\s*[:=]\s*["'][^"']{8,}["']/gi).forEach(item => {
        if (/process\.env|defineSecret|import\.meta\.env/i.test(item.match)) {
            return;
        }

        addFinding(report, {
            id: "HARDCODED_SECRET_LITERAL",
            severity: "CRITICAL",
            category: "security",
            title: "Hardcoded secret literal",
            message: "A secret-looking literal is embedded in source. Move it to Secret Manager or environment configuration.",
            confidence: 0.86,
            patchable: false,
            safe: false,
            evidence: {
                line: item.line,
                column: item.column,
                snippet: redactSecret(lineText(linesArr, item.line)),
                match: redactSecret(item.match)
            },
            tags: ["security", "secret"]
        });
    });

    matchLines(text, /\.innerHTML\s*=/g).forEach(item => {
        addFinding(report, {
            id: "INNERHTML_ASSIGNMENT",
            severity: "MEDIUM",
            category: "dom",
            title: "innerHTML assignment",
            message: "innerHTML assignments need sanitization or replacement with textContent/template rendering.",
            confidence: 0.78,
            patchable: false,
            safe: true,
            evidence: {
                line: item.line,
                column: item.column,
                snippet: lineText(linesArr, item.line),
                match: item.match
            },
            tags: ["dom", "xss-review"]
        });
    });

    if (report.structure.safeZones.some(zone => zone.open)) {
        addFinding(report, {
            id: "OPEN_SAFE_EDIT_ZONE",
            severity: "HIGH",
            category: "repo_safety",
            title: "Open safe edit zone",
            message: "A fixgo safe edit zone starts but never closes.",
            confidence: 0.92,
            patchable: false,
            safe: false,
            tags: ["safe-zone"]
        });
    }

    if (report.lines > 800) {
        addFinding(report, {
            id: "LARGE_FILE",
            severity: report.lines > 1500 ? "HIGH" : "MEDIUM",
            category: "maintainability",
            title: "Large file",
            message: "Large files are harder for Jarvis to patch safely without stronger local context.",
            confidence: 0.95,
            patchable: false,
            safe: true,
            evidence: {
                lines: report.lines
            },
            tags: ["maintainability"]
        });
    }

    if (
        lower.includes("auth") &&
        lower.includes("innerhtml") &&
        /updateDoc|setDoc|addDoc|getDoc/i.test(text)
    ) {
        addFinding(report, {
            id: "MIXED_UI_AUTH_DB",
            severity: "HIGH",
            category: "architecture",
            title: "Mixed UI/Auth/DB responsibilities",
            message: "UI rendering, auth and Firestore access appear in the same file.",
            confidence: 0.82,
            patchable: false,
            safe: true,
            tags: ["architecture"]
        });
    }
}

function matchLines(text = "", regex) {
    const matches = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        matches.push({
            match: match[0],
            index: match.index,
            line: lineFromIndex(text, match.index),
            column: columnFromIndex(text, match.index)
        });
    }

    return matches;
}

function redactSecret(value = "") {
    return String(value).replace(/(["'])([^"']{6,})(["'])/g, "$1***REDACTED***$3");
}

function analyzeFlags(report, lower) {
    const flagSet = new Set();

    report.findings.forEach(finding => flagSet.add(finding.id));

    if (report.metrics.functions > 25) flagSet.add("HIGH_FUNCTION_COUNT");
    if (report.dom.listeners > 10) flagSet.add("MANY_EVENT_LISTENERS");
    if (report.globals.windowRefs > 8) flagSet.add("GLOBAL_WINDOW_USAGE");
    if (report.dom.innerHTML > 5) flagSet.add("INNERHTML_HEAVY");
    if (lower.includes("serviceworker") || lower.includes("navigator.serviceworker")) {
        flagSet.add("PWA_ENGINE");
    }
    if (lower.includes("jarvis")) flagSet.add("AI_MODULE");

    report.flags = [...flagSet];
}

function calculateRisk(report) {
    let score = 0;

    for (const finding of report.findings) {
        score += SEVERITY_WEIGHT[finding.severity] || 0;
    }

    score += report.dom.listeners > 10 ? 2 : 0;
    score += report.globals.windowRefs > 8 ? 2 : 0;
    score += report.dom.innerHTML > 5 ? 2 : 0;
    score += report.metrics.asyncFunctions > 10 ? 2 : 0;
    score += report.metrics.awaits > 15 ? 2 : 0;

    report.riskScore = score;

    if (report.summary.critical > 0) report.risk = "CRITICAL";
    else if (score <= 4) report.risk = "LOW";
    else if (score <= 9) report.risk = "MEDIUM";
    else if (score <= 16) report.risk = "HIGH";
    else report.risk = "CRITICAL";
}

function buildRecommendations(report) {
    const recommendations = [];

    if (report.flags.includes("EMPTY_SOURCE")) {
        recommendations.push("Block write until executable content is generated.");
    }

    if (report.flags.includes("LOWERCASE_DATE_NOW")) {
        recommendations.push("Replace date.now() with Date.now() before commit.");
    }

    if (report.flags.includes("HARDCODED_SECRET_LITERAL")) {
        recommendations.push("Move secrets to environment configuration or Secret Manager.");
    }

    if (report.flags.includes("DYNAMIC_CODE_EXECUTION")) {
        recommendations.push("Remove eval/Function usage from Jarvis-managed code.");
    }

    if (report.flags.includes("LARGE_FILE")) {
        recommendations.push("Split file into focused modules before broad edits.");
    }

    if (report.flags.includes("MANY_EVENT_LISTENERS")) {
        recommendations.push("Consolidate listeners with event delegation.");
    }

    if (report.flags.includes("GLOBAL_WINDOW_USAGE")) {
        recommendations.push("Reduce global exposure behind a single namespace.");
    }

    if (report.flags.includes("INNERHTML_ASSIGNMENT") || report.flags.includes("INNERHTML_HEAVY")) {
        recommendations.push("Review DOM rendering for sanitization or textContent/template usage.");
    }

    if (report.flags.includes("MIXED_UI_AUTH_DB")) {
        recommendations.push("Separate UI, Auth and Firestore into distinct modules.");
    }

    if (report.flags.includes("PWA_ENGINE")) {
        recommendations.push("Validate Service Worker lifecycle and cache versioning.");
    }

    if (recommendations.length === 0) {
        recommendations.push("Structure stable. No major scanner findings.");
    }

    report.recommendations = [...new Set(recommendations)];
}
