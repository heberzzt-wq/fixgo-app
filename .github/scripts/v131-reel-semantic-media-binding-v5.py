from pathlib import Path

original = Path('.github/scripts/v131-reel-semantic-media-binding.py')
source = original.read_text()

label = '"runtime result coverage"'
label_index = source.find(label)
if label_index < 0:
    raise SystemExit('v131 runtime result coverage label missing')
start = source.rfind('source = replace_once(', 0, label_index)
if start < 0:
    raise SystemExit('v131 runtime result coverage start missing')
end_marker = ')\npath.write_text(source)'
end = source.find(end_marker, label_index)
if end < 0:
    raise SystemExit('v131 runtime result coverage end missing')
source = source[:start] + source[end + 2:]

old_test = '    assert.equal(result.semanticMediaCoverage.complete, true);'
new_test = '    assert.equal(received.scenes.length, 3);'
if source.count(old_test) != 1:
    raise SystemExit(f'v131 correction test count={source.count(old_test)}')
source = source.replace(old_test, new_test, 1)

exec(compile(source, '/tmp/apply-v131-corrected.py', 'exec'), {'__name__': '__main__'})

legacy_path = Path('tests/nexo-real-media-runtime-guard-v128.test.mjs')
legacy = legacy_path.read_text()
old_block = '''test("v128 caches the real collector result by mission and injects it into the actual reel executor", async () => {\n    const runtime = makeRuntime();\n    let reelArgs = null;\n\n    runtime.register({\n        name: "web.media.collect",\n        version: "1.3.0-real-media-reel-hydration-v127",\n        execute: async () => ({\n            ok: true,\n            executionOk: true,\n            objectiveSatisfied: true,\n            status: "WEB_REAL_MEDIA_COLLECTED",\n            requirementsMet: true,\n            mediaAssets: [verifiedImage]\n        })\n    });\n    runtime.register({\n        name: "reel.create",\n        version: "1.3.0-real-media-reel-hydration-v127",\n        execute: async args => {\n            reelArgs = args;\n            return {\n                ok: true,\n                executionOk: true,\n                objectiveSatisfied: true,\n                status: "REEL_VIDEO_CREATED_VERIFIED",\n                checks: { sourceMediaRendering: true }\n            };\n        }\n    });\n\n    const installation = registerNexoRealMediaRuntimeGuard(runtime);\n    assert.equal(installation.active, true);\n    assert.equal(installation.version, NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION);\n\n    await runtime.get("web.media.collect").execute(\n        { url: "https://source.example/post/1" },\n        { analysisId: "analysis-v128", objectiveId: "objective-v128" }\n    );\n\n    const result = await runtime.get("reel.create").execute({\n        brandName: "Marca",\n        title: "Reel",\n        cta: "Conoce más",\n        durationSeconds: 30,\n        scenes: [\n            { durationSeconds: 10, overlay: "Uno" },\n            { durationSeconds: 10, overlay: "Dos" },\n            { durationSeconds: 10, overlay: "Tres" }\n        ]\n    }, {\n        analysisId: "analysis-v128",\n        objectiveId: "objective-v128"\n    });\n\n    assert.equal(result.ok, true);\n    assert.equal(result.mediaHydration.hydrated, true);\n    assert.equal(result.mediaHydration.verifiedAssetCount, 1);\n    assert.equal(reelArgs.scenes[0].assetOutput, verifiedImage.output);\n    assert.equal(reelArgs.scenes[1].assetOutput, verifiedImage.output);\n});'''
new_block = '''test("v131 caches collected media but refuses positional injection into reel.create", async () => {\n    const runtime = makeRuntime();\n    let reelArgs = null;\n\n    runtime.register({\n        name: "web.media.collect",\n        version: "1.3.0-real-media-reel-hydration-v127",\n        execute: async () => ({\n            ok: true,\n            executionOk: true,\n            objectiveSatisfied: true,\n            status: "WEB_REAL_MEDIA_COLLECTED",\n            requirementsMet: true,\n            mediaAssets: [verifiedImage]\n        })\n    });\n    runtime.register({\n        name: "reel.create",\n        version: "1.3.0-real-media-reel-hydration-v127",\n        execute: async args => {\n            reelArgs = args;\n            return {\n                ok: true,\n                executionOk: true,\n                objectiveSatisfied: true,\n                status: "REEL_VIDEO_CREATED_VERIFIED",\n                checks: { sourceMediaRendering: true }\n            };\n        }\n    });\n\n    const installation = registerNexoRealMediaRuntimeGuard(runtime);\n    assert.equal(installation.active, true);\n    assert.equal(installation.version, NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION);\n\n    await runtime.get("web.media.collect").execute(\n        { url: "https://source.example/post/1" },\n        { analysisId: "analysis-v128", objectiveId: "objective-v128" }\n    );\n\n    const result = await runtime.get("reel.create").execute({\n        brandName: "Marca",\n        title: "Reel",\n        cta: "Conoce más",\n        durationSeconds: 30,\n        scenes: [\n            { durationSeconds: 10, overlay: "Uno" },\n            { durationSeconds: 10, overlay: "Dos" },\n            { durationSeconds: 10, overlay: "Tres" }\n        ]\n    }, {\n        analysisId: "analysis-v128",\n        objectiveId: "objective-v128"\n    });\n\n    assert.equal(result.ok, false);\n    assert.equal(result.status, "REEL_MEDIA_SEMANTIC_BINDING_REQUIRED");\n    assert.equal(result.semanticMediaCoverage.complete, false);\n    assert.equal(result.mediaHydration.verifiedAssetCount, 1);\n    assert.equal(reelArgs, null);\n});'''
if legacy.count(old_block) != 1:
    raise SystemExit(f'legacy runtime test block count={legacy.count(old_block)}')
legacy_path.write_text(legacy.replace(old_block, new_block, 1))
