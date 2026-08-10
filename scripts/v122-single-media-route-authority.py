from pathlib import Path

ROOT = Path('.')


def patch(path, old, new, expected=1):
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'V122_ROUTE_AUTHORITY_COUNT:{path}:{count}:{expected}:{old[:80]}')
    target.write_text(text.replace(old, new), encoding='utf-8')

upload = 'jarvis-upload-bridge.js'
patch(
    upload,
    'import {\n    registerNexoWebMediaRoutes\n} from "./nexo-web-media-bridge.js";\n',
    ''
)
patch(
    upload,
    '    registerNexoWebMediaRoutes(\n        app,\n        {\n            root:\n                repoRoot\n        }\n    );\n\n',
    ''
)
patch(
    upload,
    '    "1.1.0-nexo-real-media-routes";',
    '    "1.2.0-fs-media-route-authority-v122";'
)

test_path = 'tests/jarvis-generalist-execution-contract-v122.test.mjs'
patch(
    test_path,
    'import {\n    createJarvisFsBridgeApp\n} from "../jarvis-fs-bridge.js";\n',
    'import {\n    createJarvisFsBridgeApp\n} from "../jarvis-fs-bridge.js";\nimport {\n    createJarvisUploadBridgeApp\n} from "../jarvis-upload-bridge.js";\n'
)

target = ROOT / test_path
text = target.read_text(encoding='utf-8')
append = r'''

test("upload bridge inherits exactly one real-media route authority from the FS bridge", async () => {
    const uploadSource = fs.readFileSync(path.resolve("jarvis-upload-bridge.js"), "utf8");
    assert.doesNotMatch(uploadSource, /registerNexoWebMediaRoutes/);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-v122-upload-media-authority-"));
    execFileSync("git", ["init", "-b", "v94-media-v4n-negative-claims"], { cwd: root, stdio: "ignore" });
    fs.writeFileSync(path.join(root, "jarvis-runtime-contract.json"), JSON.stringify({
        projectId: "fixgo-test",
        branch: "v94-media-v4n-negative-claims",
        releaseId: "v122-upload-media-test"
    }));

    const app = createJarvisUploadBridgeApp({ root });
    const mediaLayers = (app?.router?.stack || app?._router?.stack || [])
        .filter(layer => layer?.route?.path === "/web/media/collect");
    assert.equal(mediaLayers.length, 1);

    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/web/media/collect`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-jarvis-release-id": "v122-upload-media-test"
            },
            body: JSON.stringify({ url: "not-a-valid-url" })
        });
        const payload = await response.json();
        assert.notEqual(response.status, 404);
        assert.equal(payload.ok, false);
    } finally {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(root, { recursive: true, force: true });
    }
});
'''
if 'upload bridge inherits exactly one real-media route authority' in text:
    raise SystemExit('V122_ROUTE_AUTHORITY_TEST_ALREADY_PRESENT')
target.write_text(text + append, encoding='utf-8')

print('V122_SINGLE_MEDIA_ROUTE_AUTHORITY_APPLIED')
