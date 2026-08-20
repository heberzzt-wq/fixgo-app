import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
    JARVIS_FS_BRIDGE_VERSION,
    appendChunkedUpload,
    cancelChunkedUpload,
    completeChunkedUpload,
    createJarvisFsBridgeApp,
    saveUploadedArtifact,
    startChunkedUpload
} from "./jarvis-fs-bridge.js";
import {
    runResilientLocalWebResearch
} from "./jarvis-local-web-research.js";

export const JARVIS_UPLOAD_BRIDGE_VERSION =
    "1.3.0-resilient-local-research-v123";

const MODULE_FILE =
    fileURLToPath(import.meta.url);

const LEGACY_UPLOAD_ROUTE_PATHS =
    new Set([
        "/upload",
        "/upload/start",
        "/upload/chunk",
        "/upload/complete",
        "/upload/cancel"
    ]);

const REPLACED_ROUTE_PATHS =
    new Set([
        ...LEGACY_UPLOAD_ROUTE_PATHS,
        "/research"
    ]);

function resolveBridgeRoot(root = "") {
    return path.resolve(
        root ||
        process.env.FIXGO_REPO_ROOT ||
        process.cwd()
    );
}

function routePaths(layer = {}) {
    const pathValue =
        layer?.route?.path;

    return (
        Array.isArray(pathValue)
            ? pathValue
            : [pathValue]
    )
        .map(value =>
            String(value || "")
                .trim()
        )
        .filter(Boolean);
}

export function removeLegacyUploadRoutes(app) {
    const router =
        app?.router ||
        app?._router ||
        null;
    const stack =
        router?.stack;

    if (!Array.isArray(stack)) {
        throw new Error("EXPRESS_ROUTER_STACK_REQUIRED");
    }

    let removed =
        0;

    for (
        let index = stack.length - 1;
        index >= 0;
        index -= 1
    ) {
        const paths =
            routePaths(stack[index]);

        if (
            paths.some(routePath =>
                REPLACED_ROUTE_PATHS.has(
                    routePath
                )
            )
        ) {
            stack.splice(index, 1);
            removed += 1;
        }
    }

    return {
        ok: true,
        status:
            removed > 0
                ? "LEGACY_UPLOAD_ROUTES_REMOVED"
                : "LEGACY_UPLOAD_ROUTES_NOT_PRESENT",
        removed,
        protectedPaths:
            [...REPLACED_ROUTE_PATHS]
    };
}

function uploadErrorStatus(error = "") {
    const message = String(error || "UPLOAD_FAILED");

    if (message === "UPLOAD_SESSION_NOT_FOUND") {
        return 404;
    }

    if (
        message.startsWith("UPLOAD_") ||
        message.startsWith("ARTIFACT_")
    ) {
        return 400;
    }

    return 500;
}

function sendUploadError(
    res,
    error,
    status = "UPLOAD_FAILED"
) {
    const message =
        error?.message ||
        String(error || status);

    return res
        .status(uploadErrorStatus(message))
        .json({
            ok: false,
            status,
            error: message,
            bridgeVersion:
                JARVIS_FS_BRIDGE_VERSION,
            uploadTransportVersion:
                JARVIS_UPLOAD_BRIDGE_VERSION
        });
}

function verifiedUploadPayload(result = {}) {
    return {
        ...result,
        ok:
            result?.ok === true,
        persisted:
            result?.ok === true,
        artifactId:
            result?.sha256 ||
            result?.output ||
            null,
        attachmentId:
            result?.sha256 ||
            result?.output ||
            null,
        bridgeVersion:
            JARVIS_FS_BRIDGE_VERSION,
        uploadTransportVersion:
            JARVIS_UPLOAD_BRIDGE_VERSION
    };
}

export function registerJarvisUploadRoutes(
    app,
    {
        root = ""
    } = {}
) {
    if (!app || typeof app.post !== "function") {
        throw new Error("EXPRESS_APP_REQUIRED");
    }

    const repoRoot =
        resolveBridgeRoot(root);

    app.post("/research", async (req, res) => {
        try {
            const result =
                await runResilientLocalWebResearch(
                    req.body?.query ||
                    req.body?.prompt ||
                    "",
                    req.body?.timeoutMs ||
                    20000,
                    {
                        allowedDomain:
                            req.body?.allowedDomain ||
                            "",
                        exactEntity:
                            req.body?.exactEntity ||
                            "",
                        seedUrl:
                            req.body?.seedUrl ||
                            ""
                    }
                );

            return res.json({
                ...result,
                bridgeVersion:
                    JARVIS_FS_BRIDGE_VERSION,
                uploadTransportVersion:
                    JARVIS_UPLOAD_BRIDGE_VERSION
            });
        }
        catch(error) {
            const message =
                String(
                    error?.message ||
                    error ||
                    "WEB_RESEARCH_FAILED"
                );

            return res
                .status(
                    message === "WEB_RESEARCH_QUERY_REQUIRED"
                        ? 400
                        : 502
                )
                .json({
                    ok: false,
                    grounded: false,
                    status:
                        "WEB_RESEARCH_FAILED",
                    error:
                        message,
                    bridgeVersion:
                        JARVIS_FS_BRIDGE_VERSION,
                    uploadTransportVersion:
                        JARVIS_UPLOAD_BRIDGE_VERSION
                });
        }
    });

    app.get("/upload/health", (req, res) => {
        return res.json({
            ok: true,
            status:
                "UPLOAD_TRANSPORT_READY",
            bridgeVersion:
                JARVIS_FS_BRIDGE_VERSION,
            uploadTransportVersion:
                JARVIS_UPLOAD_BRIDGE_VERSION
        });
    });

    app.post("/upload/start", (req, res) => {
        try {
            const result =
                startChunkedUpload({
                    ...(req.body || {}),
                    root:
                        repoRoot
                });

            return res.json({
                ...result,
                persisted:
                    false,
                bridgeVersion:
                    JARVIS_FS_BRIDGE_VERSION,
                uploadTransportVersion:
                    JARVIS_UPLOAD_BRIDGE_VERSION
            });
        }
        catch(error) {
            return sendUploadError(
                res,
                error,
                "UPLOAD_START_FAILED"
            );
        }
    });

    app.post("/upload/chunk", (req, res) => {
        try {
            const result =
                appendChunkedUpload({
                    ...(req.body || {}),
                    root:
                        repoRoot
                });

            return res.json({
                ...result,
                persisted:
                    false,
                bridgeVersion:
                    JARVIS_FS_BRIDGE_VERSION,
                uploadTransportVersion:
                    JARVIS_UPLOAD_BRIDGE_VERSION
            });
        }
        catch(error) {
            return sendUploadError(
                res,
                error,
                "UPLOAD_CHUNK_FAILED"
            );
        }
    });

    app.post("/upload/complete", (req, res) => {
        try {
            const result =
                completeChunkedUpload({
                    ...(req.body || {}),
                    root:
                        repoRoot
                });

            return res.json(
                verifiedUploadPayload(result)
            );
        }
        catch(error) {
            return sendUploadError(
                res,
                error,
                "UPLOAD_COMPLETE_FAILED"
            );
        }
    });

    app.post("/upload/cancel", (req, res) => {
        try {
            const result =
                cancelChunkedUpload({
                    ...(req.body || {}),
                    root:
                        repoRoot
                });

            return res.json({
                ...result,
                persisted:
                    false,
                bridgeVersion:
                    JARVIS_FS_BRIDGE_VERSION,
                uploadTransportVersion:
                    JARVIS_UPLOAD_BRIDGE_VERSION
            });
        }
        catch(error) {
            return sendUploadError(
                res,
                error,
                "UPLOAD_CANCEL_FAILED"
            );
        }
    });

    app.post("/upload", (req, res) => {
        try {
            const result =
                saveUploadedArtifact({
                    ...(req.body || {}),
                    root:
                        repoRoot
                });
            const target =
                path.resolve(
                    repoRoot,
                    result.output
                );
            const bytes =
                fs.readFileSync(target);
            const sha256 =
                createHash("sha256")
                    .update(bytes)
                    .digest("hex");

            return res.json(
                verifiedUploadPayload({
                    ...result,
                    sha256
                })
            );
        }
        catch(error) {
            return sendUploadError(
                res,
                error,
                "UPLOAD_LEGACY_FAILED"
            );
        }
    });

    app.use((req, res, next) => {
        if (!req.path.startsWith("/upload")) {
            return next();
        }

        return res.status(404).json({
            ok: false,
            status:
                "UPLOAD_ROUTE_NOT_FOUND",
            error:
                "UPLOAD_ROUTE_NOT_FOUND",
            method:
                req.method,
            path:
                req.path,
            bridgeVersion:
                JARVIS_FS_BRIDGE_VERSION,
            uploadTransportVersion:
                JARVIS_UPLOAD_BRIDGE_VERSION
        });
    });

    return app;
}

export function createJarvisUploadBridgeApp({
    root = ""
} = {}) {
    const repoRoot =
        resolveBridgeRoot(root);
    const app =
        createJarvisFsBridgeApp({
            root:
                repoRoot
        });

    const legacyUploadRoutes =
        removeLegacyUploadRoutes(app);

    const uploadApp =
        registerJarvisUploadRoutes(
            app,
            {
                root:
                    repoRoot
            }
        );

    uploadApp.locals.nexoUploadBridge = {
        version:
            JARVIS_UPLOAD_BRIDGE_VERSION,
        legacyUploadRoutes
    };

    return uploadApp;
}

export function startJarvisUploadBridge({
    port =
        Number(
            process.env.JARVIS_FS_BRIDGE_PORT
        ) ||
        3344,
    root = ""
} = {}) {
    const repoRoot =
        resolveBridgeRoot(root);
    const app =
        createJarvisUploadBridgeApp({
            root:
                repoRoot
        });

    return app.listen(port, () => {
        console.log(
            `[JARVIS_UPLOAD_BRIDGE] ${JARVIS_UPLOAD_BRIDGE_VERSION} online http://localhost:${port}`
        );
        console.log(
            `[JARVIS_UPLOAD_BRIDGE_ROOT] ${repoRoot}`
        );
    });
}

if (
    process.argv[1] &&
    path.resolve(process.argv[1]) === MODULE_FILE
) {
    startJarvisUploadBridge();
}
