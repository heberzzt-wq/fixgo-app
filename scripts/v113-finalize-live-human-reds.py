from pathlib import Path


def replace_exact(path, old, new, expected=1):
    p = Path(path)
    source = p.read_text(encoding="utf-8")
    count = source.count(old)
    if count != expected:
        raise SystemExit(
            f"{path}: expected {expected} occurrences of {old!r}, got {count}"
        )
    p.write_text(source.replace(old, new), encoding="utf-8")


# Align historical cache/status assertions with v113.
replace_exact(
    "tests/jarvis-marketing-terminal-delivery.e2e.test.mjs",
    "v94-repo-marketing-integrity-v112-20260809",
    "v94-live-human-reds-v113-20260809",
    2,
)
replace_exact(
    "tests/jarvis-reel-artifact.test.mjs",
    "assert.match(actuator, /REEL_STUDIO_CREATED_VERIFIED/);",
    "assert.match(actuator, /REEL_VIDEO_CREATED_VERIFIED/);\n"
    "    assert.match(bridge, /exportReelWebmWithChrome/);\n"
    "    assert.match(bridge, /REEL_WEBM_SHA256_MISMATCH/);",
)
replace_exact(
    "tests/jarvis-fs-bridge-v2.test.mjs",
    'assert.equal(description.version, "2.36.0-structural-repo-targets");',
    'assert.equal(description.version, "2.37.0-verified-reel-webm");',
)
replace_exact(
    "tests/jarvis-multifunction-tools.test.mjs",
    "v94-repo-marketing-integrity-v112-20260809",
    "v94-live-human-reds-v113-20260809",
    5,
)
replace_exact(
    "tests/jarvis-semantic-memory-integrity.test.mjs",
    "assert.match(html, /v94-semantic-memory-repo-v111-20260809/);",
    "assert.match(html, /v94-live-human-reds-v113-20260809/);",
)
replace_exact(
    "tests/jarvis-semantic-memory-integrity.test.mjs",
    r"assert.match(core, /tools\.runtime\.js\?v=v94-semantic-memory-repo-v111-20260809/);",
    r"assert.match(core, /tools\.runtime\.js\?v=v94-live-human-reds-v113-20260809/);",
)

# User-facing reel response: the physical WebM is the primary artifact.
p = Path("gestia-core/tools.bridge.js")
source = p.read_text(encoding="utf-8")
old = '''    if (["page.create", "reel.create"].includes(toolName)) {
        queueActuatorArtifact(toolName, data);
        const isPage =
            toolName === "page.create";
        return composer.composeJarvis(
            [
                isPage
                    ? "Landing creada"
                    : "Estudio de reel creado",
                "",
                `Estado: **${data?.status || "COMPLETED"}**.`,
                `Archivo: **${data?.output || "sin ruta"}**.`,
                `Tamano: ${Number(data?.bytes || 0)} bytes.`,
                isPage
                    ? "El HTML local quedo disponible para vista previa y descarga; no fue publicado ni desplegado."
                    : "El estudio local quedo disponible para vista previa y descarga; la exportacion WebM se realiza desde el navegador."
            ].join("\\n"),
            data,
            {
                type:
                    isPage
                        ? "PAGE_CREATE_RESPONSE"
                        : "REEL_CREATE_RESPONSE",
                analysisId:
                    context.analysisId
            }
        );
    }'''
new = '''    if (toolName === "page.create") {
        queueActuatorArtifact(toolName, data);
        return composer.composeJarvis(
            [
                "Landing creada",
                "",
                `Estado: **${data?.status || "COMPLETED"}**.`,
                `Archivo: **${data?.output || "sin ruta"}**.`,
                `Tamano: ${Number(data?.bytes || 0)} bytes.`,
                "El HTML local quedo disponible para vista previa y descarga; no fue publicado ni desplegado."
            ].join("\\n"),
            data,
            {
                type: "PAGE_CREATE_RESPONSE",
                analysisId: context.analysisId
            }
        );
    }

    if (toolName === "reel.create") {
        const videoOutput =
            data?.videoOutput ||
            data?.output ||
            "";
        const reelData = {
            ...data,
            output: videoOutput,
            mimeType:
                data?.mimeType ||
                "video/webm"
        };
        queueActuatorArtifact(toolName, reelData);
        return composer.composeJarvis(
            [
                "Reel creado",
                "",
                `Estado: **${data?.status || "COMPLETED"}**.`,
                `Video: **${videoOutput || "sin ruta"}**.`,
                `Formato: **${data?.mimeType || "video/webm"}**.`,
                `Tamano: ${Number(data?.bytes || 0)} bytes.`,
                data?.sha256
                    ? `SHA-256: **${data.sha256}**.`
                    : "SHA-256: no informado.",
                Number(data?.durationSeconds || 0) > 0
                    ? `Duracion: ${Number(data.durationSeconds)} segundos.`
                    : "",
                Number(data?.width || 0) > 0 && Number(data?.height || 0) > 0
                    ? `Resolucion: ${Number(data.width)}x${Number(data.height)}.`
                    : "",
                data?.studioOutput
                    ? `Estudio editable auxiliar: **${data.studioOutput}**.`
                    : "",
                "El WebM fue generado fisicamente por el bridge local y verificado antes de reportar la mision como completada; no fue publicado automaticamente."
            ].filter(Boolean).join("\\n"),
            reelData,
            {
                type: "REEL_CREATE_RESPONSE",
                analysisId: context.analysisId
            }
        );
    }'''
if source.count(old) != 1:
    raise SystemExit(f"TOOLS_BRIDGE_REEL_PAGE_BLOCK_COUNT_{source.count(old)}")
p.write_text(source.replace(old, new), encoding="utf-8")

# Browser runtime must reject an already-running pre-v113 local Node bridge.
p = Path("gestia-core/tools.runtime.js")
source = p.read_text(encoding="utf-8")
anchor = '''window.JarvisLocalBridge ||= {};
window.JarvisLocalBridge.verifyIdentity ||= async function({'''
inserted = '''const JARVIS_REQUIRED_LOCAL_BRIDGE_VERSION =
    "2.37.0-verified-reel-webm";

function jarvisBridgeVersionTuple(value = "") {
    const core =
        String(value || "")
            .trim()
            .split("-")[0];
    const parts =
        core
            .split(".")
            .slice(0, 3)
            .map(part => Number(part));
    if (
        parts.length !== 3 ||
        parts.some(part => !Number.isInteger(part) || part < 0)
    ) {
        return null;
    }
    return parts;
}

function jarvisBridgeVersionAtLeast(
    actual = "",
    required = JARVIS_REQUIRED_LOCAL_BRIDGE_VERSION
) {
    const actualTuple =
        jarvisBridgeVersionTuple(actual);
    const requiredTuple =
        jarvisBridgeVersionTuple(required);
    if (!actualTuple || !requiredTuple) return false;
    for (let index = 0; index < 3; index += 1) {
        if (actualTuple[index] > requiredTuple[index]) return true;
        if (actualTuple[index] < requiredTuple[index]) return false;
    }
    return true;
}

window.JarvisLocalBridge ||= {};
window.JarvisLocalBridge.verifyIdentity ||= async function({'''
if source.count(anchor) != 1:
    raise SystemExit(f"TOOLS_RUNTIME_IDENTITY_ANCHOR_COUNT_{source.count(anchor)}")
source = source.replace(anchor, inserted, 1)
old = '''        const actual =
            bridgeHealth?.identity || null;

        const compatible =
            expectedResponse.ok === true &&
            bridgeResponse.ok === true &&
            actual?.ok === true &&
            actual?.contract?.projectId === expected.projectId &&
            actual?.contract?.releaseId === expected.releaseId &&
            actual?.contract?.branch === expected.branch &&
            actual?.git?.branch === expected.branch;

        const result = {
            ok: compatible,
            status:
                compatible
                    ? "BRIDGE_IDENTITY_OK"
                    : "BRIDGE_IDENTITY_MISMATCH",
            bridgeVersion:
                bridgeHealth?.version ||
                null,
            expected,'''
new = '''        const actual =
            bridgeHealth?.identity || null;
        const bridgeVersion =
            String(bridgeHealth?.version || "").trim();
        const bridgeVersionCompatible =
            jarvisBridgeVersionAtLeast(
                bridgeVersion,
                JARVIS_REQUIRED_LOCAL_BRIDGE_VERSION
            );
        const identityCompatible =
            expectedResponse.ok === true &&
            bridgeResponse.ok === true &&
            actual?.ok === true &&
            actual?.contract?.projectId === expected.projectId &&
            actual?.contract?.releaseId === expected.releaseId &&
            actual?.contract?.branch === expected.branch &&
            actual?.git?.branch === expected.branch;
        const compatible =
            identityCompatible &&
            bridgeVersionCompatible;

        const result = {
            ok: compatible,
            status:
                compatible
                    ? "BRIDGE_IDENTITY_OK"
                    : identityCompatible && !bridgeVersionCompatible
                        ? "LOCAL_BRIDGE_VERSION_MISMATCH"
                        : "BRIDGE_IDENTITY_MISMATCH",
            bridgeVersion,
            requiredBridgeVersion:
                JARVIS_REQUIRED_LOCAL_BRIDGE_VERSION,
            bridgeVersionCompatible,
            expected,'''
if source.count(old) != 1:
    raise SystemExit(f"TOOLS_RUNTIME_COMPATIBILITY_BLOCK_COUNT_{source.count(old)}")
p.write_text(source.replace(old, new, 1), encoding="utf-8")

# Human regressions for response truthfulness and local bridge compatibility.
p = Path("tests/jarvis-live-human-reds-v113.test.mjs")
source = p.read_text(encoding="utf-8")
addition = r'''

test("reel human response reports the physical WebM as primary artifact", () => {
    const bridge = fs.readFileSync(path.join(process.cwd(), "gestia-core", "tools.bridge.js"), "utf8");
    assert.match(bridge, /"Reel creado"/);
    assert.match(bridge, /data\?\.videoOutput/);
    assert.match(bridge, /SHA-256/);
    assert.match(bridge, /WebM fue generado fisicamente/);
    assert.match(bridge, /Estudio editable auxiliar/);
    assert.doesNotMatch(bridge, /exportacion WebM se realiza desde el navegador/);
    assert.doesNotMatch(bridge, /"Estudio de reel creado"/);
});

test("browser runtime rejects a pre-v113 local bridge before actuator calls", () => {
    const runtime = fs.readFileSync(path.join(process.cwd(), "gestia-core", "tools.runtime.js"), "utf8");
    assert.match(runtime, /2\.37\.0-verified-reel-webm/);
    assert.match(runtime, /jarvisBridgeVersionAtLeast/);
    assert.match(runtime, /LOCAL_BRIDGE_VERSION_MISMATCH/);
    assert.match(runtime, /requiredBridgeVersion/);
    assert.match(runtime, /bridgeVersionCompatible/);
});
'''
if "reel human response reports the physical WebM as primary artifact" in source:
    raise SystemExit("V113_HUMAN_RESPONSE_TEST_ALREADY_PRESENT")
p.write_text(source + addition, encoding="utf-8")

print("V113_FINALIZER_APPLIED")
