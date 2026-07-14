import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { JarvisAttachments } from "../modules/terminal/jarvis-attachments.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("multimodal composer exposes bounded upload capabilities", () => {
    const description = JarvisAttachments.describe();
    assert.equal(description.version, "1.0.0-multimodal-composer");
    assert.equal(description.maxFiles, 4);
    assert.equal(description.maxFileBytes, 12 * 1024 * 1024);
});

test("terminal exposes a GPT-style plus menu, file input and artifact renderer", () => {
    const terminal = fs.readFileSync(path.resolve(__dirname, "../gestia-terminal.html"), "utf8");
    const attachments = fs.readFileSync(path.resolve(__dirname, "../modules/terminal/jarvis-attachments.js"), "utf8");

    assert.match(terminal, /data-testid="jarvis-attach-toggle"/);
    assert.match(terminal, /Añadir fotos y archivos/);
    assert.match(terminal, /Crear una imagen/);
    assert.match(terminal, /Búsqueda en Internet/);
    assert.match(terminal, /JarvisAttachments\.composePrompt/);
    assert.match(terminal, /renderArtifactsFromObservations/);
    assert.match(attachments, /\/upload/);
    assert.match(attachments, /\/artifact\/read/);
    assert.match(attachments, /jarvis-artifact-download/);
});
