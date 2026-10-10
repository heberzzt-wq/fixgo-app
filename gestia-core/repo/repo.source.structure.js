import { parse as parseSourceAst } from "../vendor/acorn.mjs";

function compactWhitespace(value = "") {
    let result = "";
    let pendingSpace = false;

    for (const character of String(value || "")) {
        const isWhitespace =
            character === " " ||
            character === "\t" ||
            character === "\r" ||
            character === "\n";

        if (isWhitespace) {
            pendingSpace =
                result.length > 0;
            continue;
        }

        if (pendingSpace) {
            result += " ";
            pendingSpace = false;
        }

        result += character;
    }

    return result.trim();
}

function readPropertyValue(line = "", property = "") {
    const trimmed =
        String(line || "").trim();

    if (!trimmed.startsWith(property)) {
        return "";
    }

    let cursor =
        property.length;

    while (
        cursor < trimmed.length &&
        (
            trimmed[cursor] === " " ||
            trimmed[cursor] === "\t"
        )
    ) {
        cursor += 1;
    }

    if (trimmed[cursor] !== ":") {
        return "";
    }

    cursor += 1;

    while (
        cursor < trimmed.length &&
        (
            trimmed[cursor] === " " ||
            trimmed[cursor] === "\t"
        )
    ) {
        cursor += 1;
    }

    const quote =
        trimmed[cursor];

    if (
        quote === "\"" ||
        quote === "'" ||
        quote === "`"
    ) {
        cursor += 1;
        let value = "";
        let escaped = false;

        while (cursor < trimmed.length) {
            const character =
                trimmed[cursor];

            if (escaped) {
                value += character;
                escaped = false;
                cursor += 1;
                continue;
            }

            if (character === "\\") {
                escaped = true;
                cursor += 1;
                continue;
            }

            if (character === quote) {
                return value.trim();
            }

            value += character;
            cursor += 1;
        }

        return value.trim();
    }

    let value = "";

    while (
        cursor < trimmed.length &&
        trimmed[cursor] !== ","
    ) {
        value += trimmed[cursor];
        cursor += 1;
    }

    return value.trim();
}

function countStructuralCharacter(line = "", expected = "") {
    let total = 0;

    for (const character of String(line || "")) {
        if (character === expected) {
            total += 1;
        }
    }

    return total;
}

export function extractQualifiedSourceIdentifiers(value = "") {
    const identifiers = [];
    const seen = new Set();
    let token = "";

    const flush = function() {
        let candidate = token;
        token = "";

        while (candidate.startsWith(".")) {
            candidate = candidate.slice(1);
        }

        while (candidate.endsWith(".")) {
            candidate = candidate.slice(0, -1);
        }

        const segments = candidate.split(".");
        if (
            segments.length < 2 ||
            segments.some(segment => !segment)
        ) {
            return;
        }

        const key = candidate.toLocaleLowerCase();
        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        identifiers.push(candidate);
    };

    for (const character of String(value || "")) {
        const code = character.charCodeAt(0);
        const allowed =
            (code >= 48 && code <= 57) ||
            (code >= 65 && code <= 90) ||
            (code >= 97 && code <= 122) ||
            character === "_" ||
            character === "-" ||
            character === ".";

        if (allowed) {
            token += character;
            continue;
        }

        flush();
    }

    flush();
    return identifiers.slice(0, 12);
}

export function resolveExplicitRepositoryTargets(
    value = "",
    {
        registeredToolNames = []
    } = {}
) {
    const toolNames =
        new Set(
            (Array.isArray(registeredToolNames)
                ? registeredToolNames
                : []
            )
                .map(name =>
                    String(name || "")
                        .trim()
                        .toLocaleLowerCase()
                )
                .filter(Boolean)
        );
    const candidates = [];
    const seen = new Set();
    let token = "";

    const flush = function() {
        let candidate =
            token.replaceAll("\\", "/");
        token = "";

        while (
            candidate.startsWith(".") ||
            candidate.startsWith("/")
        ) {
            candidate =
                candidate.slice(1);
        }

        while (
            candidate.endsWith(".") ||
            candidate.endsWith("/")
        ) {
            candidate =
                candidate.slice(0, -1);
        }

        if (!candidate.includes(".")) {
            return;
        }

        const hasPath =
            candidate.includes("/");
        const dotCount =
            [...candidate]
                .filter(character =>
                    character === "."
                )
                .length;

        if (
            !hasPath &&
            dotCount !== 1
        ) {
            return;
        }

        const key =
            candidate.toLocaleLowerCase();
        if (
            toolNames.has(key) ||
            seen.has(key)
        ) {
            return;
        }

        seen.add(key);
        candidates.push(candidate);
    };

    for (
        const character of
        String(value || "")
    ) {
        const code =
            character.charCodeAt(0);
        const allowed =
            (code >= 48 && code <= 57) ||
            (code >= 65 && code <= 90) ||
            (code >= 97 && code <= 122) ||
            character === "_" ||
            character === "-" ||
            character === "." ||
            character === "/" ||
            character === "\\";

        if (allowed) {
            token += character;
            continue;
        }

        flush();
    }

    flush();
    return candidates.slice(0, 16);
}

function normalizedRepositoryPath(value = "") {
    let clean =
        String(value || "")
            .trim()
            .replaceAll("\\", "/");

    while (
        clean.startsWith("./") ||
        clean.startsWith("/")
    ) {
        clean =
            clean.startsWith("./")
                ? clean.slice(2)
                : clean.slice(1);
    }

    return clean.toLocaleLowerCase();
}

export function addRepositoryDiscoveryPreflights({
    toolCalls = [],
    catalog = [],
    repositoryIndex = {},
    explicitTargets = []
} = {}) {
    const calls =
        Array.isArray(toolCalls)
            ? toolCalls
            : [];
    const tools =
        Array.isArray(catalog)
            ? catalog
            : [];
    const searchTool =
        tools.find(tool =>
            tool?.name === "repo.search" &&
            tool?.mutates !== true
        ) ||
        null;
    const indexedPaths =
        new Set();

    if (
        repositoryIndex &&
        typeof repositoryIndex === "object"
    ) {
        for (
            const [key, metadata] of
            Object.entries(repositoryIndex)
        ) {
            const path =
                normalizedRepositoryPath(
                    metadata?.path ||
                    metadata?.file ||
                    key
                );

            if (!path) continue;
            indexedPaths.add(path);

            const segments =
                path.split("/")
                    .filter(Boolean);
            const basename =
                segments[segments.length - 1] ||
                "";

            if (basename) {
                indexedPaths.add(basename);
            }
        }
    }

    if (
        !searchTool ||
        indexedPaths.size === 0
    ) {
        return calls.slice(0, 20);
    }

    const result = [];
    const scheduledSearches =
        new Set();

    for (const call of calls) {
        const definition =
            tools.find(tool =>
                tool?.name === call?.name
            ) ||
            null;
        const required =
            Array.isArray(
                definition?.inputSchema?.required
            )
                ? definition.inputSchema.required
                : [];
        const requiresVerifiedFile =
            String(call?.name || "")
                .startsWith("repo.") &&
            required.includes("file");
        const rawTarget =
            call?.args?.file ||
            call?.args?.path ||
            call?.args?.target ||
            "";
        const normalizedTarget =
            normalizedRepositoryPath(
                rawTarget
            );

        if (
            requiresVerifiedFile &&
            normalizedTarget &&
            !indexedPaths.has(normalizedTarget) &&
            // The browser index is incomplete. An exact user-supplied read
            // goes to the filesystem, which verifies existence and containment.
            !(call.name === "repo.read" && definition?.mutates !== true &&
                explicitTargets.some(file => normalizedRepositoryPath(file) === normalizedTarget))
        ) {
            if (
                !scheduledSearches.has(
                    normalizedTarget
                )
            ) {
                scheduledSearches.add(
                    normalizedTarget
                );
                result.push({
                    name:
                        searchTool.name,
                    args: {
                        query:
                            String(rawTarget)
                                .trim()
                                .slice(0, 600)
                    },
                    approved:
                        false,
                    reason:
                        "REPOSITORY_TARGET_DISCOVERY_PREFLIGHT"
                });
            }
        }

        result.push(call);
    }

    return result.slice(0, 20);
}

export function buildExecutableSourceView(source = "") {
    const input =
        String(source || "");

    let output = "";
    let state = "code";
    let quote = "";
    let escaped = false;
    let regexCharacterClass = false;

    for (
        let index = 0;
        index < input.length;
        index += 1
    ) {
        const character =
            input[index];

        const next =
            input[index + 1] || "";

        if (state === "line_comment") {
            if (character === "\n") {
                state = "code";
                output += "\n";
            }
            else {
                output += " ";
            }

            continue;
        }

        if (state === "block_comment") {
            if (
                character === "*" &&
                next === "/"
            ) {
                output += "  ";
                index += 1;
                state = "code";
            }
            else {
                output +=
                    character === "\n"
                        ? "\n"
                        : " ";
            }

            continue;
        }

        if (state === "string") {
            if (escaped) {
                escaped = false;
                output +=
                    character === "\n"
                        ? "\n"
                        : " ";
                continue;
            }

            if (character === "\\") {
                escaped = true;
                output += " ";
                continue;
            }

            if (character === quote) {
                state = "code";
                quote = "";
                output += " ";
                continue;
            }

            output +=
                character === "\n"
                    ? "\n"
                    : " ";
            continue;
        }

        if (state === "regex") {
            if (escaped) {
                escaped = false;
                output += " ";
                continue;
            }

            if (character === "\\") {
                escaped = true;
                output += " ";
                continue;
            }

            if (character === "[") {
                regexCharacterClass = true;
                output += " ";
                continue;
            }

            if (
                character === "]" &&
                regexCharacterClass
            ) {
                regexCharacterClass = false;
                output += " ";
                continue;
            }

            if (
                character === "/" &&
                !regexCharacterClass
            ) {
                state = "code";
                output += " ";
                continue;
            }

            output +=
                character === "\n"
                    ? "\n"
                    : " ";
            continue;
        }

        if (
            character === "/" &&
            next === "/"
        ) {
            output += "  ";
            index += 1;
            state = "line_comment";
            continue;
        }

        if (
            character === "/" &&
            next === "*"
        ) {
            output += "  ";
            index += 1;
            state = "block_comment";
            continue;
        }

        if (
            character === "/" &&
            next !== "/" &&
            next !== "*"
        ) {
            let previousIndex = index - 1;
            while (
                previousIndex >= 0 &&
                /\s/.test(input[previousIndex])
            ) {
                previousIndex -= 1;
            }
            const previous =
                previousIndex >= 0
                    ? input[previousIndex]
                    : "";
            if (
                !previous ||
                "=(:,[!&|?{};".includes(previous)
            ) {
                output += " ";
                state = "regex";
                regexCharacterClass = false;
                escaped = false;
                continue;
            }
        }

        if (
            character === "\"" ||
            character === "'" ||
            character === "`"
        ) {
            output += " ";
            state = "string";
            quote = character;
            escaped = false;
            continue;
        }

        output += character;
    }

    return output;
}

export async function resolveRepoReadSourceStructure(read = {}, readFull = null) {
    const initial = analyzeRepoSourceStructure(read.content || "");
    if (read.partial !== true || initial.dataBindings?.complete === true || typeof readFull !== "function") return initial;
    let full;
    try { full = await readFull(); } catch { return initial; }
    if (full?.ok !== true || full.partial === true || full.truncated === true || typeof full.content !== "string") return initial;
    const structure = analyzeRepoSourceStructure(full.content);
    if (structure.dataBindings?.complete !== true) return initial;
    structure.dataBindings.structuralRead = {
        coverage:"COMPLETE_FILE", source:"SUPPLEMENTAL_READ_OF_SAME_FILE",
        startLine:1, endLine:full.content.split("\n").length,
        contentLength:full.content.length,
        requestedExcerptStartLine:read.startLine || null,
        requestedExcerptEndLine:read.endLine || null
    };
    return structure;
}

export function analyzeRepoSourceStructure(source = "") {
    const originalLines =
        String(source || "").split("\n");

    const executableLines =
        buildExecutableSourceView(source).split("\n");

    const registrations = [];
    let activeRegistration = null;
    let activeDepth = 0;

    executableLines.forEach((line, index) => {
        const compactLine =
            compactWhitespace(line)
                .split(" ")
                .join("");

        if (!activeRegistration) {
            const startsHelperRegistration =
                compactLine.includes("register(runtime,{");

            const startsDirectRegistration =
                compactLine.includes(".register({");

            if (
                startsHelperRegistration ||
                startsDirectRegistration
            ) {
                activeRegistration = {
                    line:
                        index + 1,
                    name:
                        "",
                    description:
                        "",
                    output:
                        "",
                    inputSchema:
                        ""
                };

                activeDepth = 0;
            }
        }

        if (!activeRegistration) {
            return;
        }

        const originalLine =
            originalLines[index] || "";

        activeRegistration.name ||=
            readPropertyValue(
                originalLine,
                "name"
            );

        activeRegistration.description ||=
            readPropertyValue(
                originalLine,
                "description"
            );

        activeRegistration.output ||=
            readPropertyValue(
                originalLine,
                "output"
            );

        activeRegistration.inputSchema ||=
            readPropertyValue(
                originalLine,
                "inputSchema"
            );

        activeDepth +=
            countStructuralCharacter(
                line,
                "{"
            );

        activeDepth -=
            countStructuralCharacter(
                line,
                "}"
            );

        if (activeDepth > 0) {
            return;
        }

        if (activeRegistration.name) {
            registrations.push({
                ...activeRegistration,
                description:
                    activeRegistration.description
                        .slice(0, 240)
            });
        }

        activeRegistration = null;
        activeDepth = 0;
    });

    return {
        kind:
            registrations.length > 0
                ? "tool_registry"
                : "source_file",
        dataBindings: inspectSourceDataBindings(source),
        registrationCount:
            registrations.length,
        registrations:
            registrations.slice(0, 80)
    };
}


// These are AST references from the source just read, not a repository dictionary.
// They describe code destinations; they never prove records exist or how many.
export function inspectSourceDataBindings(source = "") {
    const content = String(source || "");
    const scriptBodies = [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(match => ({code:match[1],offset:match.index+match[0].indexOf(">")+1}));
    const units = scriptBodies.length ? scriptBodies : [{code:content,offset:0}];
    const collections = new Set(), referenceGroups = new Map(), fieldPaths = new Set(), writeShapes = [];
    let parsedUnits = 0;
    const string = node => node?.type === "Literal" && typeof node.value === "string" ? node.value : null;
    for (const sourceUnit of units) {
        const unit = sourceUnit.code;
        let program;
        try { program = parseSourceAst(unit, {ecmaVersion:"latest",sourceType:"module",allowHashBang:true}); }
        catch { try { program = parseSourceAst(unit, {ecmaVersion:"latest",sourceType:"script",allowHashBang:true}); } catch { continue; } }
        parsedUnits++;
        const operations = ["collection", "doc", "addDoc", "setDoc", "updateDoc"];
        const functions = new Map(operations.map(name => [name,name]));
        for (const statement of program.body) {
            if (statement.type !== "ImportDeclaration" || !String(statement.source?.value || "").includes("firebase")) continue;
            for (const specifier of statement.specifiers || []) if (operations.includes(specifier.imported?.name)) functions.set(specifier.local.name,specifier.imported.name);
        }
        const declarations = new Map(), constants = new Set();
        const indexDeclarations = node => {
            if (!node || typeof node !== "object") return;
            if (node.type === "VariableDeclaration" && node.kind === "const") {
                for (const declaration of node.declarations) if (declaration.id?.type === "Identifier") constants.add(declaration.id.name);
            }
            if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") declarations.set(node.id.name,[...(declarations.get(node.id.name)||[]),node]);
            for (const value of Object.values(node)) {if(Array.isArray(value)) value.forEach(indexDeclarations); else if(value && typeof value === "object" && value.type) indexDeclarations(value);}
        };
        indexDeclarations(program);
        const scopeByNode = new WeakMap();
        const patternNames = node => !node ? [] : node.type === "Identifier" ? [node.name]
            : node.type === "RestElement" ? patternNames(node.argument)
            : node.type === "AssignmentPattern" ? patternNames(node.left)
            : node.type === "ArrayPattern" ? node.elements.flatMap(patternNames)
            : node.type === "ObjectPattern" ? node.properties.flatMap(item=>patternNames(item.type === "RestElement" ? item.argument : item.value)) : [];
        const bind = (scope, name, entry) => scope.bindings.set(name,[...(scope.bindings.get(name)||[]),entry]);
        const indexScopes = (node, parentScope = null) => {
            if (!node || typeof node !== "object") return;
            const functionScope = ["FunctionDeclaration","FunctionExpression","ArrowFunctionExpression"].includes(node.type);
            const opensScope = functionScope || ["Program","BlockStatement","CatchClause","ForStatement","ForOfStatement","ForInStatement","SwitchStatement"].includes(node.type);
            const scope = opensScope ? {parent:parentScope,bindings:new Map(),functionScope:functionScope || node.type === "Program"} : parentScope;
            scopeByNode.set(node,scope);
            if (node.type === "FunctionDeclaration" && node.id && parentScope) bind(parentScope,node.id.name,{kind:"function"});
            if (node.type === "FunctionExpression" && node.id) bind(scope,node.id.name,{kind:"function"});
            if (node.type === "ClassDeclaration" && node.id) bind(scope,node.id.name,{kind:"class"});
            if (functionScope) for (const param of node.params || []) for (const name of patternNames(param)) bind(scope,name,{kind:"parameter"});
            if (node.type === "CatchClause") for (const name of patternNames(node.param)) bind(scope,name,{kind:"parameter"});
            if (node.type === "VariableDeclaration") for (const declaration of node.declarations) {
                let owner = scope;
                if (node.kind === "var") while (owner?.parent && !owner.functionScope) owner = owner.parent;
                for (const name of patternNames(declaration.id)) bind(owner,name,{kind:node.kind,declaration});
            }
            for (const value of Object.values(node)) {if(Array.isArray(value)) value.forEach(item=>{if(item?.type)indexScopes(item,scope);}); else if(value && typeof value === "object" && value.type) indexScopes(value,scope);}
        };
        indexScopes(program);
        const initializer = (node, before) => {
            if (node?.type !== "Identifier") return null;
            for (let scope=scopeByNode.get(node); scope; scope=scope.parent) {
                if (!scope.bindings.has(node.name)) continue;
                const entries=scope.bindings.get(node.name);
                const entry=entries.length === 1 ? entries[0] : null;
                return entry?.kind === "const" && entry.declaration.id.type === "Identifier" && entry.declaration.start < before ? entry.declaration.init : null;
            }
            return null;
        };
        const segmentValue = (node, before) => {
            const literal = string(node);
            if (literal !== null) return literal;
            const bound = initializer(node, before);
            if (string(bound) !== null) return string(bound);
            return node?.type === "Identifier" ? `{${node.name}}` : null;
        };
        const collectionPath = (node, before = Infinity, depth = 0) => {
            if (depth > 5) return null;
            if (node?.type === "Identifier") return collectionPath(initializer(node, before), node.start, depth + 1);
            if (node?.type !== "CallExpression") return null;
            const member = node.callee?.type === "MemberExpression" && !node.callee.computed;
            const operation = member ? node.callee.property?.name : functions.get(node.callee?.name);
            if (!["collection", "doc"].includes(operation) || (member && operation === "doc")) return null;
            let parts = (member ? node.arguments : node.arguments.slice(1)).map(arg => segmentValue(arg, node.start));
            if (!parts.length || !parts.every(part => typeof part === "string" && part.length > 0 && part.length <= 500 && !part.includes("/") && ![".",".."].includes(part))) return null;
            if (operation === "doc") {
                if (parts.length % 2 !== 0) return null;
                parts = parts.slice(0,-1);
            }
            return parts.length % 2 === 1 ? parts.join("/") : null;
        };
        const staticKey = node => node?.type === "Identifier" ? node.name : string(node);
        const memberKeys = node => {
            if (node?.type === "ChainExpression") return memberKeys(node.expression);
            if (node?.type !== "MemberExpression") return [];
            const key = node.computed ? string(node.property) : staticKey(node.property);
            return key === null ? [] : [...memberKeys(node.object), key];
        };
        const addPath = (parts, minimumLength = 2) => {
            if (parts.length >= minimumLength && parts.every(part => typeof part === "string" && /^[\w$]+$/.test(part))) {
                fieldPaths.add(parts.join("."));
            }
        };
        const objectPaths = (node, prefix = []) => {
            if (node?.type !== "ObjectExpression") return;
            for (const property of node.properties || []) {
                if (property.type !== "Property") continue;
                const key = property.computed ? string(property.key) : staticKey(property.key);
                if (key === null) continue;
                const parts = [...prefix, ...key.split(".")];
                addPath(parts);
                objectPaths(property.value, parts);
            }
        };
        const visit = (node, parent = null) => {
            if (!node || typeof node !== "object") return;
            if (node.type === "ObjectExpression") objectPaths(node);
            if (node.type === "MemberExpression") {
                // A call's property is an operation, not a stored nested field.
                // Retain the receiver's data path without inventing method fields.
                const invoked = parent?.type === "CallExpression" && parent.callee === node;
                const keys = memberKeys(invoked ? node.object : node);
                for (let index = 0; index < keys.length - (invoked ? 0 : 1); index++) addPath(keys.slice(index), invoked ? 1 : 2);
            }
            if (node.type === "CallExpression") {
                const operation = node.callee?.property?.name || node.callee?.name;
                const writeOperation = functions.get(node.callee?.name);
                if (["addDoc", "setDoc", "updateDoc"].includes(writeOperation)) {
                    const destination = collectionPath(node.arguments?.[0], node.start);
                    const supplied = node.arguments?.[1];
                    const payload = supplied?.type === "ObjectExpression" ? supplied : initializer(supplied, node.start);
                    if (destination && payload?.type === "ObjectExpression") {
                        const fields = new Set();
                        const collectFields = (object, prefix = []) => {
                            for (const property of object.properties || []) {
                                if (property.type !== "Property") continue;
                                const key = property.computed ? string(property.key) : staticKey(property.key);
                                if (key === null) continue;
                                const parts = [...prefix,...key.split(".")];
                                if (parts.every(part => /^[\w$]+$/.test(part))) {fields.add(parts.join("."));fieldPaths.add(parts.join("."));}
                                if (property.value?.type === "ObjectExpression") collectFields(property.value, parts);
                            }
                        };
                        collectFields(payload);
                        collections.add(destination);
                        if (writeShapes.length < 8) writeShapes.push({collection:destination,operation:writeOperation,
                            startLine:content.slice(0,sourceUnit.offset+payload.start).split("\n").length,
                            fields:[...fields].slice(0,200),fieldsComplete:fields.size<=200 && !payload.properties.some(property=>property.type==="SpreadElement"),
                            content:unit.slice(payload.start,payload.end).slice(0,1200),truncated:payload.end-payload.start>1200});
                    }
                }
                if (["where", "orderBy", "get"].includes(operation) && string(node.arguments?.[0])) {
                    addPath(string(node.arguments[0]).split("."));
                }
                const member = node.callee?.type === "MemberExpression" && !node.callee.computed;
                const name = member ? node.callee.property?.name : functions.get(node.callee?.name);
                const pathTemplate = collectionPath(node);
                const arg = member ? node.arguments?.[0] : node.arguments?.[1];
                const literal = string(arg);
                if ((name === "collection" || (!member && name === "doc")) && literal && pathTemplate) {
                    collections.add(pathTemplate);
                    const from = Math.max(0,unit.lastIndexOf("\n",Math.max(0,node.start-650))+1);
                    const limit = Math.min(unit.length,from+1100,node.end+400);
                    const lastNewline = unit.lastIndexOf("\n",limit);
                    const to = lastNewline > node.end ? lastNewline+1 : limit;
                    const excerpt = unit.slice(from,to), startLine = content.slice(0,sourceUnit.offset+from).split("\n").length;
                    const reference = {collection:pathTemplate || literal,rootCollection:literal,...(pathTemplate ? {pathTemplate} : {}),startLine,endLine:startLine+excerpt.split("\n").length-1-(excerpt.endsWith("\n")?1:0),content:excerpt};
                    const observedDeclarations = new Map();
                    const addDeclaration = (name,depth=0) => {
                        if(depth>1 || observedDeclarations.size>=2 || observedDeclarations.has(name)) return;
                        const candidates=declarations.get(name)||[];
                        if(candidates.length!==1 || candidates[0].start>=node.start) return;
                        const declaration=candidates[0],text=unit.slice(declaration.start,declaration.end);
                        observedDeclarations.set(name,{name,startLine:content.slice(0,sourceUnit.offset+declaration.start).split("\n").length,content:text.slice(0,600),truncated:text.length>600});
                        const scan = value => {if(!value || typeof value!=="object")return;if(value.type==="Identifier")addDeclaration(value.name,depth+1);for(const child of Object.values(value)){if(Array.isArray(child))child.forEach(scan);else if(child && typeof child==="object" && child.type)scan(child);}};
                        scan(declaration.init);
                    };
                    for(const arg of parent?.type === "CallExpression" ? parent.arguments : [])if(arg?.type === "Identifier")addDeclaration(arg.name);
                    reference.declarations=[...observedDeclarations.values()];
                    const referenceKey = pathTemplate || literal;
                    const prior = referenceGroups.get(referenceKey) || [];
                    if (prior.length < 4) prior.push(reference);
                    referenceGroups.set(referenceKey, prior);
                }
            }
            for (const [key,value] of Object.entries(node)) {
                if (["start","end","loc"].includes(key)) continue;
                if (Array.isArray(value)) value.forEach(child => visit(child,node));
                else if (value && typeof value === "object" && typeof value.type === "string") visit(value,node);
            }
        };
        visit(program);
    }
    const references = [...referenceGroups.values()].flat();
    return {source:"ACORN_SOURCE_REFERENCES",collections:[...collections].slice(0,100),fieldPaths:[...fieldPaths].slice(0,200),fieldPathsComplete:fieldPaths.size<=200 && parsedUnits===units.length,writeShapes,references:references.slice(0,4),referencesComplete:references.length<=4,complete:parsedUnits===units.length && collections.size<=100,scope:"Static code references and bounded source excerpts, not a database inventory or query result."};
}
