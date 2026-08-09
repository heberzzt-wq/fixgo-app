from pathlib import Path

bridge_path = Path("jarvis-fs-bridge.js")
bridge = bridge_path.read_text(encoding="utf-8")

anchor = '''export function resolveBridgeRepositoryTarget({ target = "", ref = "", file = "" } = {}, root = DEFAULT_ROOT) {\n'''
helper = '''function localGitHubRepositoryIdentity(root = DEFAULT_ROOT) {\n    const remote = gitText(["remote", "get-url", "origin"], root, { allowFailure: true });\n    if (!remote) return null;\n    let normalized = remote;\n    if (normalized.startsWith("git@github.com:")) {\n        normalized = `https://github.com/${normalized.slice("git@github.com:".length)}`;\n    }\n    const parsed = parseRepositoryTarget(normalized);\n    if (parsed?.ok !== true || parsed.provider !== "github") return null;\n    return {\n        owner: String(parsed.owner || "").toLowerCase(),\n        repository: String(parsed.repository || "").toLowerCase()\n    };\n}\n\n'''
if helper not in bridge:
    if anchor not in bridge:
        raise SystemExit("resolveBridgeRepositoryTarget anchor missing")
    bridge = bridge.replace(anchor, helper + anchor, 1)

old = '''    if (parsed.ok !== true) return parsed;\n    if (parsed.kind === "github_selector") {\n'''
new = '''    if (parsed.ok !== true) return parsed;\n    if (parsed.provider === "github") {\n        const localRepository = localGitHubRepositoryIdentity(root);\n        if (!localRepository) {\n            return {\n                ...parsed,\n                ok: false,\n                status: "REPOSITORY_REMOTE_IDENTITY_UNAVAILABLE",\n                error: "REPOSITORY_REMOTE_IDENTITY_UNAVAILABLE"\n            };\n        }\n        const requestedOwner = String(parsed.owner || "").toLowerCase();\n        const requestedRepository = String(parsed.repository || "").toLowerCase();\n        if (\n            localRepository.owner !== requestedOwner ||\n            localRepository.repository !== requestedRepository\n        ) {\n            return {\n                ...parsed,\n                ok: false,\n                status: "REPOSITORY_REMOTE_MISMATCH",\n                error: "REPOSITORY_REMOTE_MISMATCH",\n                localRepository,\n                requestedRepository: {\n                    owner: requestedOwner,\n                    repository: requestedRepository\n                }\n            };\n        }\n    }\n    if (parsed.kind === "github_selector") {\n'''
if old not in bridge:
    raise SystemExit("remote identity guard insertion anchor missing")
bridge = bridge.replace(old, new, 1)
bridge_path.write_text(bridge, encoding="utf-8")

# Static regression: the bridge must fail closed rather than silently analyze the local repo.
test_path = Path("tests/jarvis-repo-target-runtime.test.mjs")
test_text = test_path.read_text(encoding="utf-8")
anchor_test = '''    assert.match(bridge, /buildGraphForResolvedTarget\\(resolved/);\n});\n'''
replacement = '''    assert.match(bridge, /buildGraphForResolvedTarget\\(resolved/);\n    assert.match(bridge, /REPOSITORY_REMOTE_MISMATCH/);\n    assert.match(bridge, /localGitHubRepositoryIdentity/);\n});\n'''
if anchor_test not in test_text:
    raise SystemExit("repo bridge guard regression anchor missing")
test_path.write_text(test_text.replace(anchor_test, replacement, 1), encoding="utf-8")

print("Repository remote identity guard applied")
