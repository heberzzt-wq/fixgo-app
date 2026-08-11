from pathlib import Path

original = Path('.github/scripts/v131-reel-semantic-media-binding.py')
source = original.read_text()

old = '''source = replace_once(\n    source,\n    '''                runtimeMediaAuthority: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION\\n            };''',\n    '''                semanticMediaCoverage: reelSceneMediaCoverage(hydration.args),\\n                runtimeMediaAuthority: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION\\n            };''',\n    "runtime result coverage"\n)\n'''
if source.count(old) != 1:
    raise SystemExit(f'v131 correction block count={source.count(old)}')
source = source.replace(old, '', 1)

old_test = '    assert.equal(result.semanticMediaCoverage.complete, true);\\n'
new_test = '    assert.equal(received.scenes.length, 3);\\n'
if source.count(old_test) != 1:
    raise SystemExit(f'v131 correction test count={source.count(old_test)}')
source = source.replace(old_test, new_test, 1)

exec(compile(source, '/tmp/apply-v131-corrected.py', 'exec'), {'__name__': '__main__'})
Path('.github/scripts/v131-reel-semantic-media-binding-v2.py').unlink()
