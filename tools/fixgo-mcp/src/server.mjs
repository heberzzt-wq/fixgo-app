import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import {
    diff,
    listFiles,
    patchApply,
    patchCheck,
    readFile,
    repoStatus,
    runEngineeringMission,
    runTests,
    searchCode
} from "./repo-tools.mjs";

function result(payload, isError = false) {
    return {
        content: [{
            type: "text",
            text: JSON.stringify(payload, null, 2)
        }],
        structuredContent: payload,
        isError
    };
}

function guarded(handler) {
    return async args => {
        try {
            const payload = await handler(args);
            return result(payload, payload?.ok === false);
        } catch (error) {
            return result({
                ok: false,
                status: "FIXGO_MCP_TOOL_FAILED",
                error: error?.message || String(error)
            }, true);
        }
    };
}

function createServer() {
    const server = new McpServer({
        name: "fixgo-workspace",
        version: "0.1.0-local-stdio"
    });

    server.registerTool(
        "fixgo_repo_status",
        {
            title: "FixGo repository status",
            description: "Use this before any patch or test to read the local FixGo branch, HEAD, remote and worktree status.",
            inputSchema: z.object({}),
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false
            }
        },
        guarded(async () => repoStatus())
    );

    server.registerTool(
        "fixgo_list_files",
        {
            title: "List FixGo repository files",
            description: "Use this to discover tracked and non-ignored files before reading or searching. Results are bounded and sensitive paths remain blocked.",
            inputSchema: z.object({
                pathspec: z.array(z.string().min(1).max(300)).max(12).default([]),
                maxResults: z.number().int().min(1).max(2000).default(500)
            }),
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false
            }
        },
        guarded(async args => listFiles(args))
    );

    server.registerTool(
        "fixgo_read_file",
        {
            title: "Read a FixGo source range",
            description: "Use this to read one bounded non-sensitive file range inside FixGo.",
            inputSchema: z.object({
                file: z.string().min(1).max(300),
                startLine: z.number().int().min(1).default(1),
                endLine: z.number().int().min(1).nullable().default(null)
            }),
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false
            }
        },
        guarded(async args => readFile(args))
    );

    server.registerTool(
        "fixgo_search_code",
        {
            title: "Search FixGo source",
            description: "Use this for fixed-string code search without arbitrary shell execution.",
            inputSchema: z.object({
                query: z.string().min(2).max(160),
                pathspec: z.array(z.string().min(1).max(300)).max(12).default([]),
                maxResults: z.number().int().min(1).max(200).default(80)
            }),
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false
            }
        },
        guarded(async args => searchCode(args))
    );

    server.registerTool(
        "fixgo_diff",
        {
            title: "Read FixGo diff",
            description: "Use this to read the current bounded Git diff for selected safe paths.",
            inputSchema: z.object({
                staged: z.boolean().default(false),
                paths: z.array(z.string().min(1).max(300)).max(30).default([])
            }),
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false
            }
        },
        guarded(async args => diff(args))
    );

    server.registerTool(
        "fixgo_patch_check",
        {
            title: "Validate a minimal FixGo patch",
            description: "Use this before applying a unified diff. It checks branch, optional HEAD, safe paths and git apply --check without changing files.",
            inputSchema: z.object({
                patch: z.string().min(1).max(200 * 1024),
                expectedHead: z.string().max(64).default("")
            }),
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false
            }
        },
        guarded(async args => patchCheck(args))
    );

    server.registerTool(
        "fixgo_patch_apply",
        {
            title: "Apply a validated minimal FixGo patch",
            description: "Use this only after patch validation. It applies one unified diff inside v5.9-polish and cannot commit, push, merge, deploy or run arbitrary commands.",
            inputSchema: z.object({
                patch: z.string().min(1).max(200 * 1024),
                expectedHead: z.string().min(7).max(64)
            }),
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: false
            }
        },
        guarded(async args => patchApply(args))
    );

    server.registerTool(
        "fixgo_engineering_mission",
        {
            title: "Run a verified FixGo engineering mission",
            description: "Runs the complete bounded repository cycle: status, discovery, search, read, patch validation, patch application, allowlisted tests and final diff. Success is returned only when every stage produces verified evidence.",
            inputSchema: z.object({
                query: z.string().min(2).max(160),
                file: z.string().min(1).max(300),
                patch: z.string().min(1).max(200 * 1024),
                expectedHead: z.string().min(7).max(64),
                testProfile: z.enum([
                    "media",
                    "multimodal",
                    "ci",
                    "diff_check"
                ]).default("diff_check")
            }),
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: false
            }
        },
        guarded(async args => runEngineeringMission(args))
    );

    server.registerTool(
        "fixgo_run_tests",
        {
            title: "Run an approved FixGo test profile",
            description: "Use this after a patch to run one allowlisted profile. Arbitrary commands are unavailable.",
            inputSchema: z.object({
                profile: z.enum([
                    "media",
                    "multimodal",
                    "ci",
                    "diff_check"
                ])
            }),
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false
            }
        },
        guarded(async args => runTests(args))
    );

    return server;
}

await serveStdio(createServer);
