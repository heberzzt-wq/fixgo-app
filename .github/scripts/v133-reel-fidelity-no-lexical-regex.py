from pathlib import Path

path = Path("gestia-core/jarvis/jarvis.multifunction.planner.js")
source = path.read_text(encoding="utf-8")
old = '''function normalizedMissionFidelityTerms(\n    value = ""\n) {\n    return [\n        ...String(value || "")\n            .normalize("NFC")\n            .toLocaleLowerCase()\n            .matchAll(/[\\p{L}\\p{N}]+/gu)\n    ]\n        .map(match => match[0])\n        .filter(term => term.length >= 3)\n        .slice(0, 1200);\n}\n'''
new = '''function normalizedMissionFidelityTerms(\n    value = ""\n) {\n    const source =\n        String(value || "")\n            .normalize("NFC")\n            .toLocaleLowerCase()\n            .trim();\n    if (!source) return [];\n\n    if (\n        typeof Intl !== "undefined" &&\n        typeof Intl.Segmenter === "function"\n    ) {\n        const segmenter =\n            new Intl.Segmenter(\n                undefined,\n                { granularity: "word" }\n            );\n        const terms = [];\n        for (\n            const item\n            of segmenter.segment(source)\n        ) {\n            const term =\n                String(item?.segment || "")\n                    .trim();\n            if (\n                item?.isWordLike === true &&\n                term.length >= 3\n            ) {\n                terms.push(term);\n            }\n            if (terms.length >= 1200) break;\n        }\n        return terms;\n    }\n\n    return source.length >= 3\n        ? [source]\n        : [];\n}\n'''
count = source.count(old)
if count != 1:
    raise SystemExit(f"V133_ZERO_REGEX_TARGET_COUNT={count}")
source = source.replace(old, new, 1)
path.write_text(source, encoding="utf-8")
print("V133_ZERO_LEXICAL_REGEX_PATCHED=true")
