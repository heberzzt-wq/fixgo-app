const test = require("node:test");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const path = require("node:path");
const { createHumanBiometricRuntime } = require("../functions/b2c-biometric-identity");

test("portable biometric runtime loads local Human models and executes CPU inference", { timeout: 120000 }, async () => {
    const requireFromFunctions = createRequire(path.resolve(__dirname, "../functions/package.json"));
    const jpeg = requireFromFunctions("jpeg-js");
    const width = 320;
    const height = 240;
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = 180;
        rgba[i + 1] = 180;
        rgba[i + 2] = 180;
        rgba[i + 3] = 255;
    }
    const encoded = jpeg.encode({ data: rgba, width, height }, 80).data;
    const runtime = await createHumanBiometricRuntime();
    const result = await runtime.analyze(encoded);
    assert.equal(typeof result.faceCount, "number");
    assert.ok(Array.isArray(result.faces));
    assert.equal(result.faceCount, 0);
    assert.equal(typeof runtime.similarity, "function");
});
