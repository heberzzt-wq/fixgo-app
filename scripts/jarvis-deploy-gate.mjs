import fs from "node:fs";
import { evaluateDeployGate } from "../jarvis-deploy-gate.js";

const result = evaluateDeployGate({
    actor: process.env.GITHUB_ACTOR,
    eventName: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    commitSha: process.env.GITHUB_SHA,
    projectId: process.env.JARVIS_FIREBASE_PROJECT,
    ciPassed: process.env.JARVIS_CI_PASSED === "true",
    hostingOnly: process.env.JARVIS_HOSTING_ONLY === "true"
});

const summary = [
    "## Jarvis Sovereign Deploy Gate",
    "",
    `- Status: ${result.status}`,
    `- Authority: ${result.authorityId || "BLOCKED"}`,
    `- Commit: ${result.envelope.commitSha || "missing"}`,
    `- Ref: ${result.envelope.ref || "missing"}`,
    `- Scope: ${result.deploymentScope}`,
    `- Fingerprint: ${result.fingerprint}`,
    `- Failures: ${result.failures.join(", ") || "none"}`
].join("\n");

if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(result)}\n`);
if (!result.ok) process.exitCode = 1;
