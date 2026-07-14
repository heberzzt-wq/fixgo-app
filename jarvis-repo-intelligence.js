import fs from "node:fs";
import path from "node:path";
import { parse } from "./gestia-core/vendor/acorn.mjs";

const SOURCE_EXTENSIONS = new Set([
    ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".html", ".css", ".json"
]);

const IGNORED_DIRECTORIES = new Set([
    ".git", ".firebase", ".cache", ".next", "node_modules", "coverage", "dist", "build"
]);

const META_PATH_PARTS = new Set([
    "engine", "runtime", "guard", "bootstrap", "registry", "index", "generated"
]);

function safeRelative(root, absolutePath) {
    return path.relative(root, absolutePath).split(path.sep).join("/");
}

function listSourceFiles(root, maxFiles = 2500) {
    const files = [];
    const queue = [path.resolve(root)];

    while (queue.length && files.length < maxFiles) {
        const directory = queue.shift();
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
            const absolutePath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                queue.push(absolutePath);
            } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
                files.push({ absolutePath, file: safeRelative(root, absolutePath) });
            }
            if (files.length >= maxFiles) break;
        }
    }

    return files;
}

function tokenize(source = "") {
    const tokens = [];
    let index = 0;

    const isWordStart = char => Boolean(char) && (char === "_" || char === "$" || /[A-Za-z]/.test(char));
    const isWord = char => Boolean(char) && (isWordStart(char) || /[0-9]/.test(char));

    while (index < source.length) {
        const char = source[index];
        const next = source[index + 1];

        if (char === "/" && next === "/") {
            index += 2;
            while (index < source.length && source[index] !== "\n") index++;
            continue;
        }
        if (char === "/" && next === "*") {
            index += 2;
            while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index++;
            index += 2;
            continue;
        }
        if (char === "\"" || char === "'" || char === "`") {
            const quote = char;
            let value = "";
            index++;
            while (index < source.length) {
                if (source[index] === "\\") {
                    value += source[index + 1] || "";
                    index += 2;
                    continue;
                }
                if (source[index] === quote) {
                    index++;
                    break;
                }
                value += source[index++];
            }
            tokens.push({ type: "string", value });
            continue;
        }
        if (isWordStart(char)) {
            let value = char;
            index++;
            while (isWord(source[index])) value += source[index++];
            tokens.push({ type: "word", value });
            continue;
        }
        if (!/\s/.test(char)) tokens.push({ type: "punctuation", value: char });
        index++;
    }

    return tokens;
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function getCallName(tokens, index) {
    const parts = [];
    let cursor = index - 1;
    while (cursor >= 0 && parts.length < 5) {
        const token = tokens[cursor];
        if (token.type === "word") {
            parts.unshift(token.value);
            cursor--;
            continue;
        }
        if (token.value === ".") {
            parts.unshift(".");
            cursor--;
            continue;
        }
        break;
    }
    return parts.join("");
}

function extractTokenFacts(source) {
    const tokens = tokenize(source);
    const literals = unique(tokens.filter(token => token.type === "string" && token.value.length <= 240).map(token => token.value));
    const imports = [];
    const exports = [];
    const functions = [];
    const calls = [];
    const listeners = [];
    const endpoints = [];
    const collections = [];

    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (token.value === "import") {
            const direct = tokens[index + 1];
            if (direct?.type === "string") imports.push(direct.value);
            for (let cursor = index + 1; cursor < Math.min(tokens.length, index + 30); cursor++) {
                if (tokens[cursor].value === "from" && tokens[cursor + 1]?.type === "string") {
                    imports.push(tokens[cursor + 1].value);
                    break;
                }
                if (tokens[cursor].value === ";") break;
            }
        }
        if (token.value === "require" && tokens[index + 1]?.value === "(" && tokens[index + 2]?.type === "string") {
            imports.push(tokens[index + 2].value);
        }
        if (token.value === "export") {
            const candidate = tokens[index + 1]?.value === "default" ? tokens[index + 2] : tokens[index + 1];
            if (candidate?.type === "word") exports.push(candidate.value);
        }
        if (token.value === "function" && tokens[index + 1]?.type === "word") functions.push(tokens[index + 1].value);
        if (token.type === "word" && tokens[index + 1]?.value === "=" && tokens[index + 2]?.value === "(") {
            const closing = tokens.slice(index + 2, index + 15).findIndex(item => item.value === ")");
            if (closing >= 0 && tokens[index + 3 + closing]?.value === "=") functions.push(token.value);
        }
        if (token.value === "(") {
            const callName = getCallName(tokens, index);
            if (!callName) continue;
            calls.push(callName);
            const firstArgument = tokens[index + 1];
            if (callName.endsWith("addEventListener") || callName.endsWith("onSnapshot") || callName.endsWith("onAuthStateChanged")) {
                listeners.push({ call: callName, event: firstArgument?.type === "string" ? firstArgument.value : null });
            }
            const method = callName.split(".").pop();
            const endpointOwner = callName.split(".")[0];
            if (["app", "router", "server"].includes(endpointOwner) && ["get", "post", "put", "patch", "delete", "use"].includes(method) && firstArgument?.type === "string") {
                endpoints.push({ method: method.toUpperCase(), route: firstArgument.value });
            }
            if (callName.endsWith("collection") && firstArgument?.type === "string") collections.push(firstArgument.value);
        }
    }

    return {
        literals,
        imports: unique(imports),
        exports: unique(exports),
        functions: unique(functions),
        calls: unique(calls).slice(0, 300),
        listeners,
        endpoints,
        collections: unique(collections)
    };
}

function astCalleeName(node) {
    if (!node) return "";
    if (node.type === "Identifier") return node.name;
    if (node.type === "ThisExpression") return "this";
    if (node.type === "MemberExpression" && !node.computed) {
        const owner = astCalleeName(node.object);
        const property = astCalleeName(node.property);
        return owner && property ? `${owner}.${property}` : property;
    }
    return "";
}

function astString(node) {
    return node?.type === "Literal" && typeof node.value === "string"
        ? node.value
        : null;
}

function extractAstFacts(source) {
    let program;
    try {
        program = parse(source, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true });
    } catch (moduleError) {
        program = parse(source, { ecmaVersion: "latest", sourceType: "script", allowHashBang: true });
    }

    const facts = {
        literals: [], imports: [], exports: [], functions: [], calls: [],
        listeners: [], endpoints: [], collections: [], parser: "acorn_ast"
    };

    const visit = node => {
        if (!node || typeof node !== "object") return;
        if (node.type === "ImportDeclaration") facts.imports.push(astString(node.source));
        if (node.type === "ExportNamedDeclaration") {
            if (node.declaration?.id?.name) facts.exports.push(node.declaration.id.name);
            for (const declaration of node.declaration?.declarations || []) {
                if (declaration.id?.name) facts.exports.push(declaration.id.name);
            }
            for (const specifier of node.specifiers || []) facts.exports.push(specifier.exported?.name);
        }
        if (node.type === "ExportDefaultDeclaration") facts.exports.push(node.declaration?.id?.name || "default");
        if (node.type === "FunctionDeclaration" && node.id?.name) facts.functions.push(node.id.name);
        if (node.type === "VariableDeclarator" && node.id?.name && ["ArrowFunctionExpression", "FunctionExpression"].includes(node.init?.type)) {
            facts.functions.push(node.id.name);
        }
        if (node.type === "Literal" && typeof node.value === "string" && node.value.length <= 240) facts.literals.push(node.value);
        if (node.type === "CallExpression") {
            const call = astCalleeName(node.callee);
            if (call) facts.calls.push(call);
            const firstArgument = astString(node.arguments?.[0]);
            if (call === "require" && firstArgument) facts.imports.push(firstArgument);
            if (call.endsWith("addEventListener") || call.endsWith("onSnapshot") || call.endsWith("onAuthStateChanged")) {
                facts.listeners.push({ call, event: firstArgument });
            }
            const parts = call.split(".");
            const owner = parts[0];
            const method = parts.at(-1);
            if (["app", "router", "server"].includes(owner) && ["get", "post", "put", "patch", "delete", "use"].includes(method) && firstArgument) {
                facts.endpoints.push({ method: method.toUpperCase(), route: firstArgument });
            }
            if (call.endsWith("collection") && firstArgument) facts.collections.push(firstArgument);
        }

        for (const [key, value] of Object.entries(node)) {
            if (key === "start" || key === "end" || key === "loc") continue;
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === "object" && typeof value.type === "string") visit(value);
        }
    };
    visit(program);

    return {
        ...facts,
        literals: unique(facts.literals), imports: unique(facts.imports), exports: unique(facts.exports),
        functions: unique(facts.functions), calls: unique(facts.calls).slice(0, 300),
        collections: unique(facts.collections)
    };
}

function extractScriptFacts(source) {
    try {
        return extractAstFacts(source);
    } catch (error) {
        return { ...extractTokenFacts(source), parser: "bounded_token_fallback", parseError: error.message };
    }
}

function extractHtmlFacts(source) {
    const scripts = [];
    const lower = source.toLowerCase();
    let cursor = 0;
    while ((cursor = lower.indexOf("<script", cursor)) >= 0) {
        const end = lower.indexOf(">", cursor);
        if (end < 0) break;
        const tag = source.slice(cursor, end + 1);
        const srcAt = tag.toLowerCase().indexOf("src=");
        if (srcAt >= 0) {
            const quote = tag[srcAt + 4];
            const start = srcAt + 5;
            const finish = tag.indexOf(quote, start);
            if ((quote === "\"" || quote === "'") && finish > start) scripts.push(tag.slice(start, finish).split("?")[0]);
        }
        cursor = end + 1;
    }
    const inline = extractScriptFacts(source);
    return { ...inline, imports: unique([...inline.imports, ...scripts]), scripts: unique(scripts), page: true };
}

function resolveImport(fromFile, specifier, knownFiles) {
    if (!specifier?.startsWith(".")) return null;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
    const candidates = [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`, `${base}.ts`, `${base}.html`, `${base}/index.js`];
    return candidates.find(candidate => knownFiles.has(candidate)) || null;
}

function classifyFile(file, source) {
    const lower = file.toLowerCase();
    const segments = lower.split(/[/.\-_]/g);
    return {
        isTest: lower.includes("test") || lower.includes("spec"),
        isGenerated: lower.includes("generated") || lower.includes("package-lock"),
        isDecorative: source.trim().length < 40,
        isMeta: segments.some(segment => META_PATH_PARTS.has(segment)),
        authoritySensitive: source.includes("requiresApproval") || source.includes("validateAuthority") || source.includes("approved")
    };
}

export function buildRepoIntelligence({ root = process.cwd(), maxFiles = 2500, maxFileSizeBytes = 800000 } = {}) {
    const startedAt = Date.now();
    const files = listSourceFiles(root, maxFiles);
    const knownFiles = new Set(files.map(item => item.file));
    const nodes = {};

    for (const item of files) {
        const stat = fs.statSync(item.absolutePath);
        if (stat.size > maxFileSizeBytes) continue;
        const source = fs.readFileSync(item.absolutePath, "utf8");
        let facts;
        try {
            facts = path.extname(item.file).toLowerCase() === ".html" ? extractHtmlFacts(source) : extractScriptFacts(source);
        } catch (error) {
            facts = { literals: [], imports: [], exports: [], functions: [], calls: [], listeners: [], endpoints: [], collections: [], parseError: error.message };
        }
        nodes[item.file] = {
            file: item.file,
            bytes: stat.size,
            ...facts,
            ...classifyFile(item.file, source),
            dependencies: [],
            dependents: [],
            relatedTests: []
        };
    }

    for (const node of Object.values(nodes)) {
        node.dependencies = unique(node.imports.map(specifier => resolveImport(node.file, specifier, knownFiles)));
        for (const dependency of node.dependencies) nodes[dependency]?.dependents.push(node.file);
    }
    const testNodes = Object.values(nodes).filter(node => node.isTest);
    for (const node of Object.values(nodes)) {
        node.dependents = unique(node.dependents);
        node.relatedTests = testNodes
            .filter(test => test.dependencies.includes(node.file) || test.calls.some(call => node.functions.includes(call.split(".").pop())))
            .map(test => test.file)
            .slice(0, 20);
    }

    const endpoints = Object.values(nodes).flatMap(node => node.endpoints.map(endpoint => ({ ...endpoint, file: node.file })));
    const duplicateEndpoints = endpoints.filter((endpoint, index, all) => all.findIndex(other => other.method === endpoint.method && other.route === endpoint.route) !== index);
    return {
        ok: true,
        status: "REPO_GRAPH_READY",
        source: "live_repo_ast_graph",
        root: path.resolve(root),
        generatedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
        summary: {
            filesScanned: files.length,
            nodes: Object.keys(nodes).length,
            dependencyEdges: Object.values(nodes).reduce((sum, node) => sum + node.dependencies.length, 0),
            functions: Object.values(nodes).reduce((sum, node) => sum + node.functions.length, 0),
            calls: Object.values(nodes).reduce((sum, node) => sum + node.calls.length, 0),
            listeners: Object.values(nodes).reduce((sum, node) => sum + node.listeners.length, 0),
            endpoints: endpoints.length,
            firebaseCollections: unique(Object.values(nodes).flatMap(node => node.collections)).length,
            tests: testNodes.length,
            emptyOrDecorative: Object.values(nodes).filter(node => node.isDecorative).length,
            duplicateEndpoints: duplicateEndpoints.length
        },
        duplicateEndpoints,
        nodes
    };
}

function queryTerms(query = "") {
    return unique(String(query).toLowerCase().split(/[^a-z0-9_./-]+/g)).filter(term => term.length >= 3).slice(0, 20);
}

export function rankRepoCandidates({ graph, query = "", plannedFiles = [], limit = 8 } = {}) {
    if (!graph?.ok || !graph.nodes) throw new Error("REPO_GRAPH_REQUIRED");
    const rawTerms = queryTerms(query);
    const graphNodes = Object.values(graph.nodes);
    const termDocumentFrequency = Object.fromEntries(rawTerms.map(term => [
        term,
        graphNodes.filter(node => [node.file, ...(node.functions || []), ...(node.exports || []), ...(node.calls || []), ...(node.literals || [])].join(" ").toLowerCase().includes(term)).length
    ]));
    const terms = rawTerms.filter(term => termDocumentFrequency[term] <= Math.max(5, Math.ceil(graphNodes.length * 0.3)));
    const normalizedQuery = String(query).toLowerCase();
    const planned = new Set(plannedFiles.map(file => String(file).split("\\").join("/")));
    const ranked = graphNodes.map(node => {
        const searchable = [node.file, ...node.functions, ...node.exports, ...node.calls, ...(node.literals || []), ...node.endpoints.map(item => item.route), ...node.collections].join(" ").toLowerCase();
        const matchedTerms = terms.filter(term => searchable.includes(term));
        const pathTermMatches = terms.filter(term => node.file.toLowerCase().includes(term));
        const directMention = normalizedQuery.includes(node.file.toLowerCase()) || normalizedQuery.includes(path.posix.basename(node.file).toLowerCase());
        const breakdown = {
            directInstruction: directMention ? 120 : 0,
            lexicalSemantic: matchedTerms.length * 12 + pathTermMatches.length * 24,
            plannedFile: planned.has(node.file) ? 120 : 0,
            moduleRelation: node.dependencies.length + node.dependents.length > 0 ? Math.min(30, (node.dependencies.length + node.dependents.length) * 3) : 0,
            incomingCalls: Math.min(25, node.dependents.length * 5),
            outgoingCalls: Math.min(20, node.calls.length),
            imports: Math.min(20, node.dependencies.length * 4),
            uiContext: node.page || node.file.endsWith(".html") ? 25 : 0,
            executionEvidence: node.endpoints.length || node.listeners.length ? 20 : 0,
            existingTests: Math.min(30, node.relatedTests.length * 10),
            history: 0,
            falsePositivePenalty: matchedTerms.length === 0 && !directMention && !planned.has(node.file) ? -80 : 0,
            metaFilePenalty: node.isMeta && !directMention ? -35 : 0,
            decorativePenalty: node.isDecorative ? -50 : 0,
            testFilePenalty: node.isTest && !directMention && !planned.has(node.file) ? -100 : 0,
            generatedFilePenalty: node.isGenerated && !directMention ? -100 : 0,
            ownerMentionPriority: directMention ? 40 : 0
        };
        const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
        const reasons = Object.entries(breakdown).filter(([, value]) => value !== 0).map(([factor, value]) => `${factor}: ${value > 0 ? "+" : ""}${value}`);
        return {
            file: node.file,
            score,
            breakdown,
            reasons,
            matchedTerms,
            pathTermMatches,
            controls: unique([...node.functions, ...node.exports, ...node.endpoints.map(item => `${item.method} ${item.route}`)]).slice(0, 15),
            dependsOn: node.dependencies,
            dependedOnBy: node.dependents,
            coveredByTests: node.relatedTests,
            risks: [node.authoritySensitive ? "AUTHORITY_SENSITIVE" : null, node.isGenerated ? "GENERATED_FILE" : null, node.isMeta ? "META_FILE" : null].filter(Boolean)
        };
    }).filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score || a.file.localeCompare(b.file)).slice(0, Math.max(1, Math.min(25, Number(limit) || 8)));

    return {
        ok: true,
        status: "CANDIDATE_RANKING_READY",
        query,
        graphGeneratedAt: graph.generatedAt,
        scoring: "additive_evidence_breakdown_not_percentage",
        queryTerms: { accepted: terms, ignoredAsUbiquitous: rawTerms.filter(term => !terms.includes(term)), documentFrequency: termDocumentFrequency },
        candidates: ranked,
        recommendation: ranked[0]
            ? { file: ranked[0].file, why: ranked[0].reasons, doNotTouch: ranked.filter(item => item.risks.includes("GENERATED_FILE")).map(item => item.file) }
            : null
    };
}
