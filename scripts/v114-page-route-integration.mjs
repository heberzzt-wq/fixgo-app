import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createJarvisFsBridgeApp } from "../jarvis-fs-bridge.js";

const root = process.cwd();
const contractPath = path.join(root, "jarvis-runtime-contract.json");
const originalContractText = fs.readFileSync(contractPath, "utf8");
const contract = JSON.parse(originalContractText);
const currentBranch = execFileSync("git", ["branch", "--show-current"], {
    cwd: root,
    encoding: "utf8"
}).trim();
contract.branch = currentBranch;
fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");

let server = null;
try {
    const app = createJarvisFsBridgeApp({ root });
    server = await new Promise((resolve, reject) => {
        const current = app.listen(0, "127.0.0.1", () => resolve(current));
        current.on("error", reject);
    });

    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/page/create`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "X-Jarvis-Release-Id": String(contract.releaseId || "")
        },
        body: JSON.stringify({
            brandName: "Península Tech",
            title: "Tecnología para coordinar servicios con claridad",
            description: "Plataforma para solicitar, coordinar y dar seguimiento a servicios desde una experiencia digital.",
            services: [
                { title: "Solicitud digital", description: "Inicia y organiza una solicitud de servicio desde una sola experiencia." },
                { title: "Seguimiento", description: "Consulta el estado operativo y la evidencia disponible del servicio." },
                { title: "Coordinación", description: "Centraliza la comunicación y los pasos necesarios para atender el servicio." }
            ],
            whatsapp: "",
            whatsappRequested: false,
            contactEmail: "",
            sourceImages: [],
            gallery: [],
            testimonials: [],
            beforeAfter: [],
            output: ".jarvis-artifacts/pages/v114-peninsula-tech-human-regression.html"
        })
    });
    const payload = await response.json();
    console.log(JSON.stringify({
        currentBranch,
        temporaryContractBranch: contract.branch,
        releaseId: contract.releaseId,
        payload
    }, null, 2));

    if (!response.ok) throw new Error(`PAGE_ROUTE_HTTP_${response.status}:${payload?.error || payload?.status || "unknown"}`);
    if (payload?.ok !== true) throw new Error(payload?.error || "PAGE_ROUTE_NOT_OK");
    if (payload?.status !== "PAGE_ARTIFACT_CREATED_VERIFIED") throw new Error("PAGE_ROUTE_STATUS_INVALID");
    if (!String(payload?.output || "").endsWith(".html")) throw new Error("PAGE_HTML_OUTPUT_REQUIRED");
    if (Number(payload?.bytes || 0) < 5000) throw new Error("PAGE_HTML_BYTES_TOO_SMALL");
    if (!/^[a-f0-9]{64}$/i.test(String(payload?.sha256 || ""))) throw new Error("PAGE_SHA256_REQUIRED");

    const output = path.resolve(root, payload.output);
    if (!fs.existsSync(output)) throw new Error("PAGE_PHYSICAL_FILE_REQUIRED");
    const html = fs.readFileSync(output, "utf8");
    if (!html.includes("Península Tech")) throw new Error("PAGE_BRAND_REQUIRED");
    if (!html.includes("Tecnología para coordinar servicios con claridad")) throw new Error("PAGE_TITLE_REQUIRED");
    if (!html.includes('href="#servicios"')) throw new Error("PAGE_HONEST_INTERNAL_CTA_REQUIRED");
    if (/mailto:|wa\.me/i.test(html)) throw new Error("PAGE_FABRICATED_CONTACT_ROUTE");
    if (/lorem ipsum|placeholder|undefined|\[\[.*?\]\]|PAGE_.*ERROR/i.test(html)) throw new Error("PAGE_FALSE_CONTENT_MARKER");

    fs.writeFileSync("/tmp/v114-page-output-path.txt", output, "utf8");
    fs.writeFileSync("/tmp/v114-page-route-result.json", JSON.stringify(payload, null, 2), "utf8");
} finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(contractPath, originalContractText, "utf8");
}
