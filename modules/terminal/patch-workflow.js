/* =====================================================================================
   PATCH WORKFLOW MODULE V2
   Extracted from gestia-terminal.js to keep terminal orchestration scalable.
===================================================================================== */

const PATCH_WORKFLOW_VERSION = "2.0.0-full-repo-authority";

/* =====================================================
   PATCH ENGINE V2
===================================================== */




window.generatePatch = async function(config = {}) {
    console.log("🧪 GENERATE_PATCH_ENTRY", config);

    try {
        const {
            file,
            search,
            replace,
            strategy // 🔥 Agregamos strategy aquí
        } = config;

        // 🔥 SIA7: Bypass de validación para Auditorías (Modo Lectura)
        if (strategy === "ANALYZE_ONLY") {
            return {
                ok: true,
                file,
                isReadOnly: true,
                analysis: config.analysisResult
            };
        }

        if (!file) {
            throw new Error("FILE_REQUIRED");
        }

        // Si NO es modo lectura, exigimos el search
        if (!search) {
            throw new Error("SEARCH_REQUIRED");
        }

        const loaded = await window.loadRepoContext(file);

        if (!loaded?.ok) {
            throw new Error(
                loaded?.error ||
                "LOAD_FAIL"
            );
        }

        const source =
            loaded.source || "";

            /* =====================================================
   SAFE ZONE SIGNAL
   Full-repo authority: safe zone is advisory, not a hard cage.
===================================================== */

const safe =
    window.isSafeEditZone?.(
        source
    );

if (!safe) {
    console.warn(
        "[PATCH_FULL_REPO_AUTHORITY]",
        {
            file,
            reason:
                "SAFE_ZONE_NOT_PRESENT_REVIEW_REQUIRED"
        }
    );
}

        const exists =
            source.includes(search);

        if (!exists) {

            return {
                ok: false,
                reason: "SEARCH_NOT_FOUND",
                file
            };
        }

        const patched =
            source.replace(
                search,
                replace || ""
            );

        const diffPreview = {

            file,

            search,

            replace,

            beforeLength:
                source.length,

            afterLength:
                patched.length,

            changed:
                source !== patched,

            safeZone:
                !!safe,

            fullRepoAuthority:
                !safe,

            reviewRequired:
                !safe
        };

        console.log(
            "🧠 [PATCH_GENERATED]:",
            diffPreview
        );

        return {

            ok: true,

            file,

            original: source,

            patched,

            diff: diffPreview,

            safeZone:
                !!safe,

            fullRepoAuthority:
                !safe,

            reviewRequired:
                !safe
        };

    } catch (err) {

        console.warn(
            "⚠️ PATCH_ENGINE_FAIL:",
            err
        );

        return {
            ok: false,
            error: err.message
        };
    }
};



/* =====================================================
   PATCH APPLY ENGINE V2
===================================================== */




window.applyPatch = async function(patch = {}) {

    console.log(
        "🧪 APPLY_PATCH_ENTRY",
        patch
    );

    try {

        const {
            file,
            patched,
            diff,
            isReadOnly, // 🔥 Capturamos el nuevo flag de auditoría
            analysis
        } = patch;

        // 🔥 SIA7: Bypass de ejecución para modo Auditoría
        if (isReadOnly) {
            console.log("🧠 [AUDIT_RESULT_DISPLAYED]:", analysis);
            return {
                ok: true,
                file,
                runtimeOnly: true,
                filesystem: false
            };
        }

        if (!file) {
            throw new Error(
                "PATCH_FILE_REQUIRED"
            );
        }

        const safeRepoPath =
            window.isSafeRepoPath?.(
                file
            ) === true;

        if (!safeRepoPath) {

            console.warn(
                "[PATCH_UNSAFE_REPO_PATH]",
                file
            );
        }

        if (!patched) {
            throw new Error(
                "PATCH_CONTENT_REQUIRED"
            );
        }

        const found =
            window.findRepoFile(file);

        if (!found) {
            throw new Error(
                "PATCH_TARGET_NOT_FOUND"
            );
        }

        const [
            key,
            meta
        ] = found;

        /* =====================================================
   AUTO SNAPSHOT
===================================================== */

await window.createRepoSnapshot?.({

    file: key,

    source:
        patch?.original || ""
});

        // 🔥 runtime patched cache
        window.__PATCHED_RUNTIME__ ||= {};

        window.__PATCHED_RUNTIME__[key] = {

            patched,

            diff,

            updatedAt:
                Date.now(),

            path:
                meta?.path ||

                key
        };

        console.log(
            "🧠 [PATCH_APPLIED]:",
            key
        );

        // 🔥 HUD
        window.showJarvisPersistent?.(
            `patch aplicado: ${key}`
        );

        /* =====================================================
   FILESYSTEM WRITE
===================================================== */

let fsWrite = null;

try {
      console.log(
        "🧪 PATCH_READY_FOR_GITHUB",
        {
            file:
                meta?.path || key,

            size:
                patched?.length,

            preview:
                String(patched)
                    .slice(0, 200)
        }
    );

    /*fsWrite = await fetch(
        "http://localhost:3344/write",
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({

                file:
                    meta?.path || key,

                content:
                    patched
            })
        }
    );

    fsWrite =
        await fsWrite.json();

    console.log(
        "🧠 [FS_WRITE_RESULT]:",
        fsWrite
    );
    */

} catch (fsErr) {

    console.warn(
        "⚠️ FS_WRITE_FAIL:",
        fsErr
    );
}

return {

    ok: true,

    file: key,

    patched,

    runtimeOnly: true,

    safeRepoPath,

    filesystem:
        !!fsWrite?.ok,

    patchSize:
        patched.length
};

    } catch (err) {

        console.warn(
            "⚠️ PATCH_APPLY_FAIL:",
            err
        );

        return {
            ok: false,
            error: err.message
        };
    }
};

/* =====================================================
   PATCH WORKFLOW BRIDGE V2
===================================================== */

window.runPatchWorkflow = async function({
    file = "",
    search = "",
    replace = "",
    strategy = "",
    apply = false,
    analysisResult = null
} = {}) {

    try {

        const patch =
            await window.generatePatch({
                file,
                search,
                replace,
                strategy,
                analysisResult
            });

        if (!patch?.ok) {

            return {
                ok: false,
                stage:
                    "GENERATE",
                patch
            };
        }

        const applied =
            apply
                ? await window.applyPatch(
                    patch
                )
                : null;

        return {
            ok: true,
            file,
            generated:
                patch,
            applied:
                !!apply,
            result:
                applied
        };

    } catch (error) {

        console.warn(
            "[PATCH_WORKFLOW_FAIL]",
            error
        );

        return {
            ok: false,
            error:
                error.message
        };
    }
};

/* =====================================================
   SAFE EDIT VALIDATOR V2
===================================================== */

window.isSafeEditZone = function(source = "") {

    try {

        const normalizedSource =
            String(source)
                .toUpperCase();

        return (

            normalizedSource.includes(
                "FIXGO_SAFE_EDIT_START"
            ) &&

            normalizedSource.includes(
                "FIXGO_SAFE_EDIT_END"
            )
        );

    } catch (err) {

        console.warn(
            "⚠️ SAFE_ZONE_CHECK_FAIL:",
            err
        );

        return false;
    }
};

/* =====================================================
   SAFE REPO PATH VALIDATOR V2
===================================================== */

window.isSafeRepoPath = function(file = "") {

    try {

        const normalized =
            String(file)
                .replace(/\\/g, "/")
                .trim();

        if (
            !normalized ||
            normalized.startsWith("/") ||
            normalized.includes("..")
        ) {
            return false;
        }

        const blockedPaths = [

            /^\.git\//i,
            /^node_modules\//i,
            /^functions\/node_modules\//i,
            /^\.env(\.|$)/i,
            /serviceaccount.*\.json$/i,
            /firebase-adminsdk.*\.json$/i,
            /private[-_]?key/i,
            /secret/i
        ];

        return !blockedPaths.some(
            pattern =>
                pattern.test(normalized)
        );

    } catch(err) {

        console.warn(

            "⚠️ SAFE_REPO_PATH_FAIL:",
            err
        );

        return false;
    }
};

/* =====================================================
   SNAPSHOT ENGINE V2
===================================================== */

window.__REPO_SNAPSHOTS__ ||= {};

window.createRepoSnapshot = function(config = {}) {

    try {

        const {
            file,
            source
        } = config;

        if (!file) {
            throw new Error(
                "SNAPSHOT_FILE_REQUIRED"
            );
        }

        window.__REPO_SNAPSHOTS__[file] ||= [];

        const snapshot = {

            createdAt:
                Date.now(),

            source:
                source || "",

            size:
                (source || "").length
        };

        window.__REPO_SNAPSHOTS__[file]
            .push(snapshot);

        console.log(
            "🧠 [SNAPSHOT_CREATED]:",
            file
        );

        return {

            ok: true,

            file,

            totalSnapshots:
                window.__REPO_SNAPSHOTS__[file]
                    .length
        };

    } catch (err) {

        console.warn(
            "⚠️ SNAPSHOT_FAIL:",
            err
        );

        return {
            ok: false,
            error: err.message
        };
    }
};

window.writeSandboxFile = async function(payload = {}) {

    try {

        const {
            file,
            content
        } = payload;

        if (!file) {
            throw new Error("FILE_REQUIRED");
        }

        const safePath =
            String(file)
            .replace(/\.\./g, "")
            .replace(/\\/g, "/");

        console.log(
            "🧠 [SANDBOX_WRITE]:",
            safePath
        );

        // 🔥 escritura sandbox memoria
        window.JARVIS_SANDBOX_FILES[safePath] = {
            content: content || "",
            updatedAt: Date.now()
        };

        // 🔥 HUD
        window.showJarvisPersistent?.(
            `archivo escrito: ${safePath}`
        );

        // 🔥 ledger
        const ledger =
            window.__GESTIA_LEDGER__;

        if (
            ledger &&
            typeof ledger.log === "function"
        ) {

            await ledger.log(
                "SANDBOX_FILE_WRITTEN",
                {
                    file: safePath,
                    bytes: (content || "").length
                }
            );
        }

        return {
            ok: true,
            file: safePath,
            bytes: (content || "").length
        };

    } catch (err) {

        console.error(
            "❌ [SANDBOX_WRITE_FAIL]:",
            err
        );

        return {
            ok: false,
            error: err.message
        };
    }
};

window.PatchWorkflowV2 = {
    version:
        PATCH_WORKFLOW_VERSION,
    authority:
        "full_repo_private_owner",
    safeZone:
        "advisory",
    blockedPathPolicy:
        "deny_secrets_git_node_modules"
};
