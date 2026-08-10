import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildReelStudioHtml } from "../jarvis-reel-artifact.js";
import { exportReelWebmWithChrome } from "../jarvis-fs-bridge.js";

const input = {
    brandName: "Multiservicios Peninsulares HMH",
    title: "Mantenimiento que se nota",
    cta: "Solicita atención",
    durationSeconds: 30,
    scenes: [
        {
            durationSeconds: 10,
            overlay: "Detecta antes",
            subtitle: "Mantenimiento preventivo",
            visualDescription: "Inspección técnica"
        },
        {
            durationSeconds: 10,
            overlay: "Resuelve a tiempo",
            subtitle: "Atención especializada",
            visualDescription: "Trabajo técnico"
        },
        {
            durationSeconds: 10,
            overlay: "Mantén tu espacio",
            subtitle: "Soluciones integrales",
            visualDescription: "Resultado final"
        }
    ]
};

const studioPath = path.join(
    os.tmpdir(),
    "v113-reel-studio.html"
);
const output =
    ".jarvis-artifacts/reels/v113-human-regression.webm";

fs.writeFileSync(
    studioPath,
    buildReelStudioHtml(input),
    "utf8"
);

const result = await exportReelWebmWithChrome({
    studioPath,
    output,
    durationSeconds: 30,
    root: process.cwd()
});

console.log(JSON.stringify(result, null, 2));

if (
    result?.ok !== true ||
    result?.status !== "REEL_VIDEO_CREATED_VERIFIED" ||
    !String(result?.output || "").endsWith(".webm") ||
    Number(result?.bytes || 0) < 1000 ||
    !/^[a-f0-9]{64}$/.test(String(result?.sha256 || "")) ||
    !fs.existsSync(result.output)
) {
    process.exitCode = 1;
}
