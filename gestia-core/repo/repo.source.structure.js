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

export function buildExecutableSourceView(source = "") {
    const input =
        String(source || "");

    let output = "";
    let state = "code";
    let quote = "";
    let escaped = false;

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
        registrationCount:
            registrations.length,
        registrations:
            registrations.slice(0, 80)
    };
}
