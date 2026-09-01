const ADMIN_RUNTIME_VERSION = "1.0.0";

function checkpoint(logger, name, detail = null) {
    if (detail) logger.info(`[${name}]`, detail);
    else logger.info(`[${name}]`);
}

function renderLocalizedFailure(documentRef, targetId, message) {
    const target = documentRef?.getElementById?.(targetId);
    if (!target) return;
    target.innerHTML = `
        <div class="rounded-2xl border border-red-500/30 bg-red-950/20 p-4 text-center text-xs font-bold text-red-300">
            <i class="fas fa-triangle-exclamation mr-2"></i>${message}
        </div>`;
}

async function startSurface({ name, start, logger, documentRef, targetId, errorMessage }) {
    try {
        const value = await start();
        checkpoint(logger, `${name}_DONE`);
        return { ok: true, value };
    } catch (error) {
        logger.error(`[${name}_FAILED]`, error);
        renderLocalizedFailure(documentRef, targetId, errorMessage);
        return { ok: false, error };
    }
}

export async function iniciarRuntimeAdmin({
    user,
    iniciarPanel,
    iniciarBI,
    documentRef = globalThis.document,
    logger = globalThis.console
}) {
    if (!user || user.rol !== "admin") {
        throw new Error("ADMIN_RUNTIME_AUTHORITY_REQUIRED");
    }
    if (typeof iniciarPanel !== "function" || typeof iniciarBI !== "function") {
        throw new Error("ADMIN_RUNTIME_DEPENDENCIES_REQUIRED");
    }

    checkpoint(logger, "APP_MAIN_ADMIN_ENTER", { version: ADMIN_RUNTIME_VERSION });

    const panel = startSurface({
        name: "PANEL_ADMIN",
        start: iniciarPanel,
        logger,
        documentRef,
        targetId: "listaTecnicos",
        errorMessage: "No fue posible iniciar Aprobación. Las demás superficies siguen disponibles."
    });

    checkpoint(logger, "BI_SCHEDULED");
    const bi = startSurface({
        name: "BI",
        start: iniciarBI,
        logger,
        documentRef,
        targetId: "dashboardAnalitico",
        errorMessage: "No fue posible iniciar BI/NOC. Las demás superficies siguen disponibles."
    });

    const [panelResult, biResult] = await Promise.all([panel, bi]);
    return {
        ok: panelResult.ok && biResult.ok,
        version: ADMIN_RUNTIME_VERSION,
        modules: {
            panel: panelResult,
            bi: biResult
        }
    };
}

export { ADMIN_RUNTIME_VERSION, renderLocalizedFailure };
