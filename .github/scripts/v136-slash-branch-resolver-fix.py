from pathlib import Path

path = Path('jarvis-fs-bridge.js')
text = path.read_text(encoding='utf-8')

old_refs = '''function repositoryRefs(root = DEFAULT_ROOT) {
    const output = gitText([
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/heads",
        "refs/remotes/origin"
    ], root, { allowFailure: true });
    return normalizeRepositoryRefs(output.split(/\\r?\\n/).filter(Boolean));
}
'''
new_refs = '''function repositoryRefs(root = DEFAULT_ROOT) {
    const output = gitText([
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/heads",
        "refs/remotes/origin"
    ], root, { allowFailure: true });
    return normalizeRepositoryRefs(output.split(/\\r?\\n/).filter(Boolean));
}

function advertisedRepositoryRefs(root = DEFAULT_ROOT) {
    const output = gitText([
        "ls-remote",
        "--heads",
        "origin"
    ], root, {
        allowFailure: true,
        maxBuffer: 4 * 1024 * 1024
    });
    const refs = output
        .split(/\\r?\\n/)
        .map(line => String(line || "").trim())
        .filter(Boolean)
        .map(line => line.split(/\\s+/).at(-1) || "")
        .filter(ref => ref.startsWith("refs/heads/"))
        .map(ref => ref.slice("refs/heads/".length));
    return normalizeRepositoryRefs(refs);
}
'''
if text.count(old_refs) != 1:
    raise SystemExit(f'repositoryRefs anchor count={text.count(old_refs)}')
text = text.replace(old_refs, new_refs, 1)

old_decl = '    const refs = repositoryRefs(root);'
new_decl = '    let refs = repositoryRefs(root);'
if text.count(old_decl) != 1:
    raise SystemExit(f'refs declaration anchor count={text.count(old_decl)}')
text = text.replace(old_decl, new_decl, 1)

old_selector = '''    if (parsed.kind === "github_selector") {
        parsed = resolveRepositorySelector(parsed, refs);
        if (parsed.ok !== true) return parsed;
    }
'''
new_selector = '''    if (parsed.kind === "github_selector") {
        const unresolvedSelector = parsed;
        parsed = resolveRepositorySelector(unresolvedSelector, refs);
        if (
            parsed.ok !== true &&
            parsed.error === "GITHUB_REF_UNRESOLVED"
        ) {
            const remoteRefs = advertisedRepositoryRefs(root);
            if (remoteRefs.length > 0) {
                refs = normalizeRepositoryRefs([
                    ...refs,
                    ...remoteRefs
                ]);
                parsed = resolveRepositorySelector(
                    unresolvedSelector,
                    refs
                );
            }
        }
        if (parsed.ok !== true) return parsed;
    }
'''
if text.count(old_selector) != 1:
    raise SystemExit(f'github selector anchor count={text.count(old_selector)}')
text = text.replace(old_selector, new_selector, 1)

path.write_text(text, encoding='utf-8')
print('v136 slash-branch remote ref fallback applied')
