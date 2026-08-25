import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
// V142 certification trigger: this source-level contract belongs to the native MP4 gate.

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");
}

test("reel.create terminal delivery cannot revive WebM after the V142 MP4 master contract", () => {
    const bridge = read("gestia-core/tools.bridge.js");
    const reelStart = bridge.indexOf('if (toolName === "reel.create")');
    const nextTool = bridge.indexOf('if (toolName === "image.generate")', reelStart);
    assert.ok(reelStart >= 0);
    assert.ok(nextTool > reelStart);
    const reelBlock = bridge.slice(reelStart, nextTool);

    assert.match(reelBlock, /data\?\.mimeType\s*\|\|\s*\n\s*"video\/mp4"/);
    assert.match(reelBlock, /Formato: \*\*\$\{reelData\.mimeType\}\*\*/);
    assert.doesNotMatch(reelBlock, /video\/webm/);
    assert.match(reelBlock, /queueActuatorArtifact\(toolName, reelData\)/);
});

test("verified MP4 artifacts expose both Open and Download through the existing renderer", () => {
    const attachments = read("modules/terminal/jarvis-attachments.js");

    assert.match(attachments, /resolvedMimeType\.startsWith\("video\/"\)/);
    assert.match(attachments, /jarvis-artifact-open/);
    assert.match(attachments, /jarvis-artifact-download/);
    assert.match(attachments, /open\.target = "_blank"/);
    assert.match(attachments, /download\.download = payload\.fileName/);
});

test("mission producedArtifacts continue into the existing terminal artifact renderer", () => {
    const terminal = read("gestia-terminal.html");

    assert.match(terminal, /finalResponse\?\.producedArtifacts/);
    assert.match(terminal, /JarvisAttachments\.renderArtifact\(/);
    assert.match(terminal, /item\.output\.startsWith\("\.jarvis-artifacts\/"\)/);
    assert.match(terminal, /JARVIS_FINAL_ARTIFACT_RENDER_FAILED/);
});
