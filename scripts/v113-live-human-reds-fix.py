from pathlib import Path
import textwrap

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


def replace_once(content, old, new, label):
    count = content.count(old)
    if count != 1:
        raise SystemExit(f'{label}_COUNT_{count}')
    return content.replace(old, new, 1)

# -----------------------------------------------------------------------------
# 1) Terminal: never lose a valid GestiaCore final response behind Brain Router.
# -----------------------------------------------------------------------------
terminal_path = 'gestia-terminal.html'
terminal = read(terminal_path)
old = '''            const preferredAgentFinalResponse =
                coreResult?.result?.finalResponse ||
                coreResult?.result?.followUp?.finalResponse ||
                null;

            const shouldPreferAgentFinalResponse =
                coreResult?.type === "AGENT_TOOL_RESULT" &&
                typeof preferredAgentFinalResponse?.text === "string" &&
                preferredAgentFinalResponse.text.trim().length > 0;'''
new = '''            const preferredAgentFinalResponse =
                coreResult?.finalResponse ||
                coreResult?.result?.finalResponse ||
                coreResult?.result?.followUp?.finalResponse ||
                null;

            const shouldPreferAgentFinalResponse =
                typeof preferredAgentFinalResponse?.text === "string" &&
                preferredAgentFinalResponse.text.trim().length > 0;'''
terminal = replace_once(terminal, old, new, 'TERMINAL_FINAL_RESPONSE_GATE')
old = '''                if (!handled) {
                    window.renderJarvisResponse?.(
                        "Brain Router SIA7",
                        [
                            "No ejecute rutas legacy de KernelHeberto ni IA conversacional antigua.",
                            "La orden quedo contenida para que el Brain Router sea la autoridad principal.",
                            "Pide una aclaracion o reformula el objetivo tecnico para reentrar por GestiaCore."
                        ].join("\\n"),
                        "warning"
                    );

                    handled =
                        true;
                }'''
new = '''                if (!handled) {
                    window.renderJarvisResponse?.(
                        "Jarvis",
                        [
                            "GestiaCore no entregó una respuesta presentable para esta ejecución.",
                            "La solicitud técnica sigue siendo válida y no necesita reformulación.",
                            "Estado interno: TERMINAL_CORE_RESPONSE_NOT_PRESENTED."
                        ].join("\\n"),
                        "error"
                    );

                    recordTerminalLearningIncident?.({
                        category: "TERMINAL_CORE_PRESENTATION",
                        status: "error",
                        stage: "terminal_core_final_response",
                        operation: "PRESENT_CORE_RESULT",
                        reason: "TERMINAL_CORE_RESPONSE_NOT_PRESENTED",
                        symptom: comando,
                        wrongBehavior: "GestiaCore terminó la ejecución pero Terminal no presentó un resultado útil.",
                        fixRule: "Present any valid GestiaCore finalResponse regardless of envelope type; never ask the user to reformulate a valid technical objective.",
                        sourceTraceId: currentTraceId,
                        confidence: 1
                    });

                    handled =
                        true;
                }'''
terminal = replace_once(terminal, old, new, 'TERMINAL_BRAIN_FALLBACK')
terminal = terminal.replace('v94-repo-marketing-integrity-v112-20260809', 'v94-live-human-reds-v113-20260809')
write(terminal_path, terminal)

# -----------------------------------------------------------------------------
# 2) Preserve a completed reel.plan storyboard in mission evidence.
# -----------------------------------------------------------------------------
orch_path = 'gestia-core/jarvis/jarvis.mission.orchestrator.js'
orch = read(orch_path)
marker = '''                : normalizedStatus === "PAGE_CONTENT_COMPOSED"
                    ? {'''
insert = '''                : normalizedStatus === "REEL_PLAN_READY"
                    ? {
                        kind:
                            "reel",
                        brandName:
                            text(payload?.brandName, 300),
                        title:
                            text(payload?.title, 500),
                        cta:
                            text(payload?.cta, 500),
                        durationSeconds:
                            Number(payload?.durationSeconds) || 0,
                        timelineSeconds:
                            Number(payload?.timelineSeconds) || 0,
                        scenes:
                            compactEvidence(
                                Array.isArray(payload?.scenes)
                                    ? payload.scenes.slice(0, 18)
                                    : []
                            )
                    }
                : normalizedStatus === "PAGE_CONTENT_COMPOSED"
                    ? {'''
orch = replace_once(orch, marker, insert, 'ORCHESTRATOR_REEL_PREPARED_ARTIFACT')
write(orch_path, orch)

# -----------------------------------------------------------------------------
# 3) Deterministic dependency adapter reel.plan -> reel.create.
# -----------------------------------------------------------------------------
presenter_path = 'gestia-core/jarvis/jarvis.reel.presenter.js'
presenter = '''const VERSION = "1.0.0-plan-to-video-v113";

function clean(value = "") {
    return typeof value === "string" ? value.trim() : "";
}

function completedReelPlan(completedTasks = []) {
    return [...(Array.isArray(completedTasks) ? completedTasks : [])]
        .reverse()
        .find(item =>
            item?.name === "reel.plan" &&
            item?.observation?.objectiveSatisfied === true &&
            item?.observation?.status === "REEL_PLAN_READY"
        ) || null;
}

export function reelArtifactArgsFromCompletedTasks(
    completedTasks = [],
    fallbackArgs = {}
) {
    const task = completedReelPlan(completedTasks);
    const plan = task?.observation?.preparedArtifact;
    if (!plan || plan.kind !== "reel") return null;

    const durationSeconds = Number(plan.durationSeconds);
    const scenes = Array.isArray(plan.scenes)
        ? plan.scenes
            .filter(scene => scene && typeof scene === "object")
            .slice(0, 18)
            .map(scene => ({
                durationSeconds: Number(scene.durationSeconds),
                overlay: clean(scene.overlay),
                subtitle: clean(scene.voiceover || scene.subtitle),
                visualDescription: clean(scene.visual || scene.visualDescription),
                transition: clean(scene.transition) || "fade",
                ...(clean(scene.mediaType)
                    ? { mediaType: clean(scene.mediaType) }
                    : {}),
                ...(clean(scene.assetOutput)
                    ? { assetOutput: clean(scene.assetOutput) }
                    : {})
            }))
        : [];
    const timelineSeconds = scenes.reduce(
        (sum, scene) => sum + (Number.isFinite(scene.durationSeconds) ? scene.durationSeconds : 0),
        0
    );
    const valid =
        clean(plan.brandName) &&
        clean(plan.title) &&
        clean(plan.cta) &&
        Number.isFinite(durationSeconds) &&
        durationSeconds >= 30 &&
        durationSeconds <= 180 &&
        scenes.length >= 3 &&
        Math.abs(timelineSeconds - durationSeconds) <= 0.01 &&
        scenes.every(scene =>
            Number.isFinite(scene.durationSeconds) &&
            scene.durationSeconds >= 1 &&
            scene.overlay
        );
    if (!valid) return null;

    return {
        ...(fallbackArgs && typeof fallbackArgs === "object" ? fallbackArgs : {}),
        brandName: clean(plan.brandName),
        title: clean(plan.title),
        cta: clean(plan.cta),
        durationSeconds,
        scenes
    };
}

export function describeReelPresenter() {
    return {
        ok: true,
        version: VERSION,
        dependency: "reel.plan -> reel.create",
        factualPolicy: "PLAN_OUTPUT_ONLY"
    };
}
'''
write(presenter_path, presenter)

# -----------------------------------------------------------------------------
# 4) Core hydrates reel.create from completed reel.plan before semantic fallback.
# -----------------------------------------------------------------------------
core_path = 'gestia-core/gestia-core.js'
core = read(core_path)
import_anchor = '''import {
    marketingArtifactArgsFromCompletedTasks,
    marketingFinalResponseFromMission
} from '/gestia-core/jarvis/jarvis.marketing.presenter.js?v=v94-repo-marketing-integrity-v112-20260809';'''
import_new = '''import {
    marketingArtifactArgsFromCompletedTasks,
    marketingFinalResponseFromMission
} from '/gestia-core/jarvis/jarvis.marketing.presenter.js?v=v94-repo-marketing-integrity-v112-20260809';
import {
    reelArtifactArgsFromCompletedTasks
} from '/gestia-core/jarvis/jarvis.reel.presenter.js?v=v94-live-human-reds-v113-20260809';'''
core = replace_once(core, import_anchor, import_new, 'CORE_REEL_PRESENTER_IMPORT')
anchor = '''                    if (
                        call?.name === "document.create" &&
                        Array.isArray(missionContext?.completedTasks)
                    ) {'''
reel_block = '''                    if (
                        call?.name === "reel.create" &&
                        Array.isArray(missionContext?.completedTasks)
                    ) {
                        const completedReelPlan =
                            [...missionContext.completedTasks]
                                .reverse()
                                .find(item =>
                                    item?.name === "reel.plan"
                                ) ||
                            null;
                        const reelArtifactArgs =
                            reelArtifactArgsFromCompletedTasks(
                                missionContext.completedTasks,
                                executionCall.args
                            );

                        if (reelArtifactArgs) {
                            executionCall.args =
                                reelArtifactArgs;
                            argumentGrounded =
                                true;
                        }
                        else if (completedReelPlan) {
                            return {
                                ok: false,
                                executionOk: false,
                                objectiveSatisfied: false,
                                blocked: true,
                                retryable: false,
                                status: "REEL_PLAN_DEPENDENCY_INVALID",
                                error: "REEL_PLAN_CONTENT_REQUIRED",
                                message: "No se creó el video porque reel.plan terminó sin un storyboard ejecutable compatible con reel.create.",
                                dependency: "reel.plan",
                                dependencyStatus:
                                    completedReelPlan?.observation?.status ||
                                    null,
                                missionExecution: {
                                    name: call.name,
                                    args: executionCall.args
                                }
                            };
                        }
                    }

                    if (
                        call?.name === "document.create" &&
                        Array.isArray(missionContext?.completedTasks)
                    ) {'''
core = replace_once(core, anchor, reel_block, 'CORE_REEL_HYDRATION')
core = core.replace('v94-repo-marketing-integrity-v112-20260809', 'v94-live-human-reds-v113-20260809')
write(core_path, core)

# -----------------------------------------------------------------------------
# 5) Marketing scope comes from the already-selected mission production tools.
# -----------------------------------------------------------------------------
multi_path = 'gestia-core/jarvis/jarvis.multitool.pack.js'
multi = read(multi_path)
anchor = '''function canonicalEvidenceEnvelope(context = {}) {
    const evidence = Array.isArray(context?.canonicalEvidence)
        ? context.canonicalEvidence
        : [];
    try {
        return JSON.stringify(evidence).slice(0, 30000);
    } catch {
        return "[]";
    }
}
'''
helper = anchor + '''
const MARKETING_PRODUCTION_TOOL_TYPES = Object.freeze({
    "document.create": "document",
    "page.create": "page",
    "image.generate": "image",
    "image.edit": "image",
    "reel.create": "reel"
});

export function resolveMarketingMissionProductionScope(
    args = {},
    context = {}
) {
    const current =
        args && typeof args === "object" && !Array.isArray(args)
            ? { ...args }
            : {};
    if (typeof current.productionRequested === "boolean") {
        return current;
    }

    const requiredToolNames =
        Array.isArray(context?.requiredToolNames)
            ? context.requiredToolNames.map(String).filter(Boolean)
            : [];
    if (requiredToolNames.length === 0) {
        return current;
    }

    const productionToolNames =
        [...new Set(
            requiredToolNames.filter(name =>
                Object.prototype.hasOwnProperty.call(
                    MARKETING_PRODUCTION_TOOL_TYPES,
                    name
                )
            )
        )];
    const productionRequested =
        productionToolNames.length > 0;

    return {
        ...current,
        productionRequested,
        ...(productionRequested &&
        (!Array.isArray(current.productionArtifacts) ||
            current.productionArtifacts.length === 0)
            ? {
                productionArtifacts:
                    productionToolNames.map(toolName => ({
                        id: `mission-${toolName.replaceAll(".", "-")}`,
                        type: MARKETING_PRODUCTION_TOOL_TYPES[toolName],
                        toolName,
                        label: toolName
                    }))
            }
            : {})
    };
}
'''
multi = replace_once(multi, anchor, helper, 'MARKETING_SCOPE_HELPER')
old = '''                    planningArgs =
                        semanticEnrichment?.args ||
                        planningArgs;
                }
                catch(error) {'''
new = '''                    planningArgs =
                        semanticEnrichment?.args ||
                        planningArgs;
                }
                catch(error) {'''
# Keep the semantic block intact; inject structural mission scope after catch block.
# Use the first exact marker following semanticEnrichmentError assignment.
marker = '''                }

                if (typeof planningArgs.productionRequested !== "boolean") {
                    return {'''
replacement = '''                }

                planningArgs =
                    resolveMarketingMissionProductionScope(
                        planningArgs,
                        context
                    );

                if (typeof planningArgs.productionRequested !== "boolean") {
                    return {'''
multi = replace_once(multi, marker, replacement, 'MARKETING_SCOPE_APPLICATION')
multi = replace_once(
    multi,
    'durationSeconds >= 15 && durationSeconds <= 180',
    'durationSeconds >= 30 && durationSeconds <= 180',
    'REEL_PLAN_DURATION_ALIGNMENT'
)
write(multi_path, multi)

# -----------------------------------------------------------------------------
# 6) Reel studio exposes the verified Blob to CDP and suppresses headless download.
# -----------------------------------------------------------------------------
reel_path = 'jarvis-reel-artifact.js'
reel = read(reel_path)
reel = replace_once(
    reel,
    ";link.href=url;link.download=detail.fileName;link.hidden=false;window.dispatchEvent",
    ";window.__JARVIS_LAST_REEL_BLOB__=blob;window.__JARVIS_LAST_REEL_DETAIL__=detail;link.href=url;link.download=detail.fileName;link.hidden=false;window.dispatchEvent",
    'REEL_EXPOSE_BLOB'
)
reel = replace_once(
    reel,
    ";exporting=false;setTimeout(()=>link.click(),0)};draw(0);",
    ";exporting=false;if(!window.__JARVIS_HEADLESS_EXPORT__)setTimeout(()=>link.click(),0)};draw(0);",
    'REEL_HEADLESS_DOWNLOAD_SUPPRESSION'
)
write(reel_path, reel)

# -----------------------------------------------------------------------------
# 7) Local bridge: export the Reel Studio Blob through Chrome DevTools to WebM.
# -----------------------------------------------------------------------------
bridge_path = 'jarvis-fs-bridge.js'
bridge = read(bridge_path)
bridge = replace_once(
    bridge,
    'import { fileURLToPath } from "url";',
    'import { fileURLToPath, pathToFileURL } from "url";',
    'BRIDGE_PATH_TO_FILE_URL'
)
helper_anchor = '''export function readJarvisRuntimeContract(
    root = DEFAULT_ROOT
) {'''
bridge_helper = r'''function sleepMs(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function readChromeDevToolsPort(profileDir, child, timeoutMs = 12000) {
    const activePortFile = path.join(profileDir, "DevToolsActivePort");
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (child?.exitCode !== null) {
            throw new Error("REEL_CHROME_EXITED_BEFORE_CDP_READY");
        }
        if (fs.existsSync(activePortFile)) {
            const lines = fs.readFileSync(activePortFile, "utf8")
                .split(/\r?\n/)
                .map(value => value.trim())
                .filter(Boolean);
            const port = Number(lines[0]);
            if (Number.isInteger(port) && port > 0) return port;
        }
        await sleepMs(100);
    }
    throw new Error("REEL_CDP_PORT_TIMEOUT");
}

async function evaluateCdpExpression(webSocketDebuggerUrl, expression, timeoutMs = 15000) {
    if (typeof globalThis.WebSocket !== "function") {
        throw new Error("REEL_CDP_WEBSOCKET_UNAVAILABLE");
    }
    const socket = new globalThis.WebSocket(webSocketDebuggerUrl);
    const pending = new Map();
    let nextId = 1;
    let timeoutHandle = null;
    const opened = new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = () => reject(new Error("REEL_CDP_SOCKET_OPEN_FAILED"));
    });
    socket.onmessage = event => {
        let message;
        try { message = JSON.parse(String(event.data)); }
        catch { return; }
        if (!message?.id || !pending.has(message.id)) return;
        const current = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) current.reject(new Error(message.error.message || "REEL_CDP_ERROR"));
        else current.resolve(message.result);
    };
    await opened;
    const call = (method, params = {}) => new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
    });
    try {
        await call("Runtime.enable");
        const result = await Promise.race([
            call("Runtime.evaluate", {
                expression,
                awaitPromise: true,
                returnByValue: true
            }),
            new Promise((_, reject) => {
                timeoutHandle = setTimeout(
                    () => reject(new Error("REEL_CDP_EVALUATION_TIMEOUT")),
                    timeoutMs
                );
            })
        ]);
        if (result?.exceptionDetails) {
            throw new Error(
                `REEL_CDP_EVALUATION_EXCEPTION:${result.exceptionDetails.text || "unknown"}`
            );
        }
        return result?.result?.value;
    }
    finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        try { socket.close(); } catch {}
    }
}

export async function exportReelWebmWithChrome({
    studioPath = "",
    output = "",
    durationSeconds = 0,
    root = DEFAULT_ROOT
} = {}) {
    const chrome = resolveChromeExecutable();
    if (!chrome) {
        return { ok: false, status: "REEL_BROWSER_EXECUTABLE_NOT_FOUND", error: "BROWSER_EXECUTABLE_NOT_FOUND" };
    }
    const duration = Number(durationSeconds);
    if (!Number.isFinite(duration) || duration < 30 || duration > 180) {
        return { ok: false, status: "REEL_DURATION_NOT_ALLOWED", error: "REEL_DURATION_NOT_ALLOWED" };
    }
    const resolvedStudioPath = path.resolve(studioPath);
    if (!fs.existsSync(resolvedStudioPath)) {
        return { ok: false, status: "REEL_STUDIO_FILE_REQUIRED", error: "REEL_STUDIO_FILE_REQUIRED" };
    }
    const requestedOutput = String(output || "").trim().replaceAll("\\", "/");
    const normalizedOutput =
        requestedOutput.startsWith(".jarvis-artifacts/") && requestedOutput.toLowerCase().endsWith(".webm")
            ? requestedOutput
            : `.jarvis-artifacts/reels/reel-${Date.now()}.webm`;
    const videoTarget = artifactPath(normalizedOutput, root, [".webm"]);
    fs.mkdirSync(path.dirname(videoTarget), { recursive: true });

    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-reel-cdp-"));
    const child = spawn(
        chrome,
        [
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--autoplay-policy=no-user-gesture-required",
            "--allow-file-access-from-files",
            "--remote-debugging-port=0",
            "--remote-allow-origins=*",
            `--user-data-dir=${profileDir}`,
            "about:blank"
        ],
        {
            cwd: path.resolve(root),
            stdio: "ignore",
            windowsHide: true
        }
    );

    try {
        const port = await readChromeDevToolsPort(profileDir, child, 12000);
        const studioUrl = pathToFileURL(resolvedStudioPath).href;
        const targetResponse = await fetch(
            `http://127.0.0.1:${port}/json/new?${encodeURIComponent(studioUrl)}`,
            { method: "PUT" }
        );
        if (!targetResponse.ok) {
            throw new Error(`REEL_CDP_NEW_TARGET_${targetResponse.status}`);
        }
        const target = await targetResponse.json();
        if (!target?.webSocketDebuggerUrl) {
            throw new Error("REEL_CDP_PAGE_WS_REQUIRED");
        }

        await sleepMs(1200);
        const startResult = await evaluateCdpExpression(
            target.webSocketDebuggerUrl,
            `(() => { window.__JARVIS_HEADLESS_EXPORT__ = true; const button = document.querySelector('#export'); if (!button) return 'REEL_EXPORT_BUTTON_MISSING'; button.click(); return 'REEL_EXPORT_STARTED'; })()`,
            12000
        );
        if (startResult !== "REEL_EXPORT_STARTED") {
            throw new Error(String(startResult || "REEL_EXPORT_START_FAILED"));
        }

        await sleepMs(duration * 1000 + 2600);
        const payloadText = await evaluateCdpExpression(
            target.webSocketDebuggerUrl,
            `(() => new Promise(async (resolve, reject) => { try { const blob = window.__JARVIS_LAST_REEL_BLOB__; const detail = window.__JARVIS_LAST_REEL_DETAIL__; if (!blob || !detail) throw new Error('REEL_EXPORTED_BLOB_MISSING'); const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = ''; const step = 0x8000; for (let index = 0; index < bytes.length; index += step) binary += String.fromCharCode(...bytes.subarray(index, index + step)); resolve(JSON.stringify({ ...detail, base64: btoa(binary) })); } catch (error) { reject(error); } }))()`,
            Math.max(30000, duration * 1000)
        );
        const payload = JSON.parse(String(payloadText || "{}"));
        const buffer = Buffer.from(String(payload.base64 || ""), "base64");
        if (buffer.length < 1000 || buffer.length !== Number(payload.bytes || 0)) {
            throw new Error("REEL_WEBM_BYTE_COUNT_INVALID");
        }
        const sha256 = createHash("sha256").update(buffer).digest("hex");
        if (sha256 !== String(payload.sha256 || "").toLowerCase()) {
            throw new Error("REEL_WEBM_SHA256_MISMATCH");
        }
        fs.writeFileSync(videoTarget, buffer);
        if (!fs.existsSync(videoTarget) || fs.statSync(videoTarget).size !== buffer.length) {
            throw new Error("REEL_WEBM_WRITE_VERIFY_FAILED");
        }
        const relativeOutput = path.relative(path.resolve(root), videoTarget).replaceAll("\\", "/");
        const artifact = registerArtifact({
            root,
            output: relativeOutput,
            metadata: {
                type: "video",
                origin: "reel.create",
                provider: path.basename(chrome),
                mimeType: payload.mimeType || "video/webm",
                status: "REEL_VIDEO_CREATED_VERIFIED",
                approvalRequired: false,
                approved: true,
                approvedBy: "LOCAL_ARTIFACT_POLICY",
                editable: false,
                preview: true,
                downloadable: true,
                publishable: false,
                sha256,
                durationSeconds: duration,
                width: Number(payload.width || 1080),
                height: Number(payload.height || 1920)
            }
        });
        return {
            ok: true,
            status: "REEL_VIDEO_CREATED_VERIFIED",
            output: relativeOutput,
            mimeType: payload.mimeType || "video/webm",
            bytes: buffer.length,
            sha256,
            durationSeconds: duration,
            width: Number(payload.width || 1080),
            height: Number(payload.height || 1920),
            artifact
        };
    }
    catch(error) {
        try { fs.rmSync(videoTarget, { force: true }); } catch {}
        return {
            ok: false,
            status: "REEL_VIDEO_EXPORT_FAILED",
            error: error?.message || String(error)
        };
    }
    finally {
        try { child.kill("SIGTERM"); } catch {}
        await sleepMs(150);
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
    }
}

'''
bridge = replace_once(bridge, helper_anchor, bridge_helper + helper_anchor, 'BRIDGE_CDP_HELPER')

reel_index = bridge.find('const html = buildReelStudioHtml(hydrated);')
if reel_index < 0:
    raise SystemExit('BRIDGE_REEL_ROUTE_NOT_FOUND')
requested_index = bridge.find('const requestedOutput =', reel_index)
if requested_index < 0:
    raise SystemExit('BRIDGE_REEL_REQUESTED_OUTPUT_NOT_FOUND')
requested_end = bridge.find('const target =', requested_index)
if requested_end < 0:
    raise SystemExit('BRIDGE_REEL_TARGET_NOT_FOUND')
old_requested = bridge[requested_index:requested_end]
new_requested = '''const requestedOutput =
                String(req.body?.output || "").trim().replaceAll("\\\\", "/");
            const requestedStudioOutput =
                String(req.body?.studioOutput || "").trim().replaceAll("\\\\", "/") ||
                (requestedOutput.toLowerCase().endsWith(".html") ? requestedOutput : "");
            const output =
                requestedStudioOutput.startsWith(".jarvis-artifacts/")
                    ? requestedStudioOutput
                    : `.jarvis-artifacts/reels/${slug}-${Date.now()}-studio.html`;
            '''
bridge = bridge[:requested_index] + new_requested + bridge[requested_end:]

reel_index = bridge.find('const html = buildReelStudioHtml(hydrated);')
write_index = bridge.find('fs.writeFileSync(target, html, "utf8");', reel_index)
if write_index < 0:
    raise SystemExit('BRIDGE_REEL_STUDIO_WRITE_NOT_FOUND')
write_end = write_index + len('fs.writeFileSync(target, html, "utf8");')
video_inject = '''
            const requestedVideoOutput =
                String(req.body?.videoOutput || "").trim().replaceAll("\\\\", "/") ||
                (requestedOutput.toLowerCase().endsWith(".webm") ? requestedOutput : "");
            const videoExport = await exportReelWebmWithChrome({
                studioPath: target,
                output:
                    requestedVideoOutput ||
                    `.jarvis-artifacts/reels/${slug}-${Date.now()}.webm`,
                durationSeconds: Number(hydrated.durationSeconds),
                root
            });
            if (videoExport?.ok !== true) {
                throw new Error(
                    videoExport?.error ||
                    videoExport?.status ||
                    "REEL_VIDEO_EXPORT_FAILED"
                );
            }
'''
bridge = bridge[:write_end] + video_inject + bridge[write_end:]

video_marker = 'videoExportStatus: "REQUIRES_BROWSER_EXPORT"'
marker_index = bridge.find(video_marker, reel_index)
if marker_index < 0:
    raise SystemExit('BRIDGE_OLD_REEL_RESPONSE_NOT_FOUND')
response_start = bridge.rfind('return res.json({', reel_index, marker_index)
response_end = bridge.find('            });', marker_index)
if response_start < 0 or response_end < 0:
    raise SystemExit('BRIDGE_REEL_RESPONSE_BOUNDS_NOT_FOUND')
response_end += len('            });')
new_response = '''return res.json({
                ok: true,
                status: "REEL_VIDEO_CREATED_VERIFIED",
                output: videoExport.output,
                videoOutput: videoExport.output,
                studioOutput: path.relative(root, target).replaceAll("\\\\", "/"),
                mimeType: videoExport.mimeType,
                bytes: videoExport.bytes,
                sha256: videoExport.sha256,
                embeddedBytes,
                checks: verification.checks,
                durationSeconds: Number(hydrated.durationSeconds),
                width: videoExport.width,
                height: videoExport.height,
                downloadable: true,
                previewable: true,
                videoExportStatus: "VERIFIED",
                artifact: videoExport.artifact,
                studioArtifact: artifact,
                version: JARVIS_FS_BRIDGE_VERSION
            });'''
bridge = bridge[:response_start] + new_response + bridge[response_end:]
bridge = bridge.replace('"2.36.0-structural-repo-targets"', '"2.37.0-verified-reel-webm"', 1)
write(bridge_path, bridge)

# -----------------------------------------------------------------------------
# 8) Actuator expects actual video, not merely the HTML studio.
# -----------------------------------------------------------------------------
actuator_path = 'gestia-core/jarvis/jarvis.actuator.pack.js'
actuator = read(actuator_path)
actuator = replace_once(
    actuator,
    'description: "Crea un estudio de reel 9:16 local nuevo, configurable, descargable y previsualizable, capaz de exportar WebM y verificar SHA-256 en el navegador. No publica.",\n            output: "REEL_STUDIO_ARTIFACT",',
    'description: "Crea un reel 9:16 local, genera su estudio editable y exporta automáticamente un WebM físico verificado por SHA-256. No publica.",\n            output: "REEL_VIDEO_ARTIFACT",',
    'ACTUATOR_REEL_DESCRIPTION'
)
actuator = replace_once(
    actuator,
    'scenes: "array", logoOutput: "string", audioOutput: "string", output: "string",',
    'scenes: "array", logoOutput: "string", audioOutput: "string", output: "string", videoOutput: "string", studioOutput: "string",',
    'ACTUATOR_REEL_SCHEMA'
)
old = '''                }, 120000);
                if (result?.ok === true && result?.status === "REEL_STUDIO_CREATED_VERIFIED") {
                    recordCapabilityEvidence("reel_studio", {
                        ok: true,
                        status: result.status,
                        output: result.output,
                        bytes: result.bytes,
                        durationSeconds: result.durationSeconds,
                        checks: result.checks,
                        videoExportStatus: result.videoExportStatus,
                        checkedAt: new Date().toISOString()
                    });
                }
                return result;'''
new = '''                }, Math.max(
                    120000,
                    (Number(args.durationSeconds) || 30) * 1000 + 60000
                ));
                if (result?.ok === true && result?.status === "REEL_VIDEO_CREATED_VERIFIED") {
                    recordCapabilityEvidence("reel_video", {
                        ok: true,
                        status: result.status,
                        output: result.videoOutput || result.output,
                        studioOutput: result.studioOutput,
                        bytes: result.bytes,
                        sha256: result.sha256,
                        mimeType: result.mimeType,
                        durationSeconds: result.durationSeconds,
                        width: result.width,
                        height: result.height,
                        checks: result.checks,
                        videoExportStatus: result.videoExportStatus,
                        checkedAt: new Date().toISOString()
                    });
                }
                return result;'''
actuator = replace_once(actuator, old, new, 'ACTUATOR_REEL_RESULT')
write(actuator_path, actuator)

# -----------------------------------------------------------------------------
# 9) Human regression tests.
# -----------------------------------------------------------------------------
test_path = 'tests/jarvis-live-human-reds-v113.test.mjs'
test = r'''import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

if (!globalThis.window) globalThis.window = {};

const { __test: missionTest } = await import(
    "../gestia-core/jarvis/jarvis.mission.orchestrator.js?v113-human-reds"
);
const {
    reelArtifactArgsFromCompletedTasks
} = await import(
    "../gestia-core/jarvis/jarvis.reel.presenter.js?v113-human-reds"
);
const {
    resolveMarketingMissionProductionScope
} = await import(
    "../gestia-core/jarvis/jarvis.multitool.pack.js?v113-human-reds"
);

const validReelPlan = {
    ok: true,
    executionOk: true,
    objectiveSatisfied: true,
    status: "REEL_PLAN_READY",
    brandName: "Multiservicios Peninsulares HMH",
    title: "Mantenimiento que se nota",
    cta: "Solicita atención",
    durationSeconds: 30,
    timelineSeconds: 30,
    scenes: [
        { durationSeconds: 10, visual: "Inspección", overlay: "Detecta antes", voiceover: "Revisión preventiva", evidence: "sitio oficial" },
        { durationSeconds: 10, visual: "Reparación", overlay: "Resuelve a tiempo", voiceover: "Atención técnica", evidence: "sitio oficial" },
        { durationSeconds: 10, visual: "Resultado", overlay: "Mantén tu espacio", voiceover: "Soluciones integrales", evidence: "sitio oficial" }
    ]
};

test("safeObservation preserves executable reel.plan storyboard", () => {
    const observation = missionTest.safeObservation(validReelPlan);
    assert.equal(observation.status, "REEL_PLAN_READY");
    assert.equal(observation.objectiveSatisfied, true);
    assert.equal(observation.preparedArtifact.kind, "reel");
    assert.equal(observation.preparedArtifact.scenes.length, 3);
    assert.equal(observation.preparedArtifact.durationSeconds, 30);
});

test("reel.create args are hydrated deterministically from completed reel.plan", () => {
    const observation = missionTest.safeObservation(validReelPlan);
    const args = reelArtifactArgsFromCompletedTasks([
        { name: "reel.plan", observation }
    ], { objectiveId: "OBJ-1" });
    assert.ok(args);
    assert.equal(args.durationSeconds, 30);
    assert.equal(args.scenes.length, 3);
    assert.equal(args.scenes[0].overlay, "Detecta antes");
    assert.equal(args.scenes[0].subtitle, "Revisión preventiva");
    assert.equal(args.scenes[0].visualDescription, "Inspección");
});

test("marketing production scope inherits tools already selected by mission contract", () => {
    const args = resolveMarketingMissionProductionScope(
        { brandName: "HMH" },
        { requiredToolNames: ["web.research", "marketing.plan", "reel.plan", "reel.create", "document.create"] }
    );
    assert.equal(args.productionRequested, true);
    assert.deepEqual(
        args.productionArtifacts.map(item => item.toolName).sort(),
        ["document.create", "reel.create"]
    );
});

test("terminal accepts finalResponse without requiring AGENT_TOOL_RESULT and never asks valid repo objective to be reformulated", () => {
    const terminal = fs.readFileSync(path.join(process.cwd(), "gestia-terminal.html"), "utf8");
    assert.match(terminal, /coreResult\?\.finalResponse\s*\|\|/);
    assert.doesNotMatch(terminal, /coreResult\?\.type === "AGENT_TOOL_RESULT"\s*&&\s*typeof preferredAgentFinalResponse/);
    assert.doesNotMatch(terminal, /reformula el objetivo tecnico para reentrar por GestiaCore/);
    assert.match(terminal, /TERMINAL_CORE_RESPONSE_NOT_PRESENTED/);
});

test("reel creator and bridge require a physical verified WebM", () => {
    const reelArtifact = fs.readFileSync(path.join(process.cwd(), "jarvis-reel-artifact.js"), "utf8");
    const bridge = fs.readFileSync(path.join(process.cwd(), "jarvis-fs-bridge.js"), "utf8");
    const actuator = fs.readFileSync(path.join(process.cwd(), "gestia-core", "jarvis", "jarvis.actuator.pack.js"), "utf8");
    assert.match(reelArtifact, /__JARVIS_LAST_REEL_BLOB__/);
    assert.match(bridge, /exportReelWebmWithChrome/);
    assert.match(bridge, /REEL_VIDEO_CREATED_VERIFIED/);
    assert.match(bridge, /REEL_WEBM_SHA256_MISMATCH/);
    assert.match(actuator, /REEL_VIDEO_CREATED_VERIFIED/);
    assert.doesNotMatch(actuator, /result\?\.status === "REEL_STUDIO_CREATED_VERIFIED"/);
});
'''
write(test_path, test)

print('V113_PATCH_APPLIED')
