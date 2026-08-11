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
