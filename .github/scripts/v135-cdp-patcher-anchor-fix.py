from pathlib import Path

path = Path('.github/scripts/v135-cdp-response-body-apply.py')
text = path.read_text(encoding='utf-8')
old = '''replace_once(\n    "nexo-web-media-bridge.js",\n    ''' + "'''" + '''                networkObserved: candidate.networkObserved === true,\\n                sourcePageUrl: candidate.sourcePageUrl || page.toString(),''' + "'''" + ''',\n    ''' + "'''" + '''                networkObserved: candidate.networkObserved === true,\\n                bodyCaptured: candidate.bodyCaptured === true,\\n                sourcePageUrl: candidate.sourcePageUrl || page.toString(),''' + "'''" + '''\n)'''
new = '''p = Path("nexo-web-media-bridge.js")\ntext = p.read_text(encoding="utf-8")\nold = "                networkObserved: candidate.networkObserved === true,\\n                sourcePageUrl: candidate.sourcePageUrl || page.toString(),"\nnew = "                networkObserved: candidate.networkObserved === true,\\n                bodyCaptured: candidate.bodyCaptured === true,\\n                sourcePageUrl: candidate.sourcePageUrl || page.toString(),"\ncount = text.count(old)\nif count != 2:\n    raise SystemExit(f"nexo-web-media-bridge.js: expected two asset/skip body-capture anchors, found {count}")\np.write_text(text.replace(old, new, 2), encoding="utf-8")'''
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected one patcher block to relax, found {count}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('v135 CDP patcher anchor cardinality fixed')
