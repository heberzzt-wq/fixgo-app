from pathlib import Path

path = Path('tests/nexo-browser-media-fallback-v135.test.mjs')
text = path.read_text(encoding='utf-8')
old = 'const jpeg = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0xff,0xd9]);'
new = 'const jpeg = Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0xff,0xd9]), Buffer.alloc(25000)]);'
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected one tiny browser-scene fixture, found {count}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('v135 browser scene fixture aligned above UI-noise floor')
