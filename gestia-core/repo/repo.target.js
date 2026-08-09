const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

function clean(value = "", maximum = 2000) {
    return String(value ?? "").trim().slice(0, maximum);
}

function decodePart(value = "") {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function normalizeRef(value = "") {
    let ref = clean(value, 300).replaceAll("\\", "/");
    for (const prefix of ["refs/remotes/origin/", "refs/heads/", "origin/"]) {
        if (ref.startsWith(prefix)) {
            ref = ref.slice(prefix.length);
            break;
        }
    }
    return ref.replace(/^\/+|\/+$/g, "");
}

export function parseRepositoryTarget(value = "") {
    const raw = clean(value, 4000);
    if (!raw) {
        return {
            ok: false,
            kind: "empty",
            raw,
            error: "REPOSITORY_TARGET_REQUIRED"
        };
    }

    let parsedUrl = null;
    try {
        parsedUrl = new URL(raw);
    } catch {
        parsedUrl = null;
    }

    if (parsedUrl && GITHUB_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
        const parts = parsedUrl.pathname
            .split("/")
            .filter(Boolean)
            .map(decodePart);
        const owner = clean(parts[0], 200);
        const repository = clean(parts[1], 240).replace(/\.git$/i, "");
        const marker = clean(parts[2], 30).toLowerCase();
        const selector = ["blob", "tree"].includes(marker)
            ? parts.slice(3).join("/")
            : "";

        if (!owner || !repository) {
            return {
                ok: false,
                kind: "github_invalid",
                raw,
                error: "GITHUB_REPOSITORY_INVALID"
            };
        }

        return {
            ok: true,
            kind: selector ? "github_selector" : "github_repository",
            raw,
            provider: "github",
            owner,
            repository,
            marker: ["blob", "tree"].includes(marker) ? marker : "",
            selector,
            ref: "",
            path: ""
        };
    }

    return {
        ok: true,
        kind: "repo_path",
        raw,
        provider: "local",
        path: raw
            .replaceAll("\\", "/")
            .replace(/^\.\/+/, "")
            .replace(/^\/+/, "")
    };
}

export function normalizeRepositoryRefs(refs = []) {
    return [...new Set(
        (Array.isArray(refs) ? refs : [])
            .map(normalizeRef)
            .filter(Boolean)
    )].sort((left, right) => right.length - left.length || left.localeCompare(right));
}

export function resolveRepositorySelector(target = {}, refs = []) {
    if (!target?.ok) return target;
    if (target.kind !== "github_selector") return target;

    const selector = clean(target.selector, 1000).replace(/^\/+|\/+$/g, "");
    const knownRefs = normalizeRepositoryRefs(refs);
    const matchedRef = knownRefs.find(ref =>
        selector === ref || selector.startsWith(`${ref}/`)
    );

    if (!matchedRef) {
        return {
            ...target,
            ok: false,
            kind: "github_selector_unresolved",
            error: "GITHUB_REF_UNRESOLVED",
            candidateSelector: selector,
            knownRefCount: knownRefs.length
        };
    }

    const path = selector === matchedRef
        ? ""
        : selector.slice(matchedRef.length + 1);

    return {
        ...target,
        ok: true,
        kind: path ? "github_path" : "github_ref",
        ref: matchedRef,
        path,
        candidateSelector: selector,
        knownRefCount: knownRefs.length
    };
}

export function isRepositoryUrlTarget(value = "") {
    const parsed = parseRepositoryTarget(value);
    return parsed.ok === true && String(parsed.kind).startsWith("github_");
}

export const REPO_TARGET_VERSION = "1.0.0-structural-github-targets";
