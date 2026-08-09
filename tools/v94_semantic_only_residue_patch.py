from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'RESIDUE_ANCHOR_FAILED:{label}:{count}')
    return text.replace(old, new, 1)


path = 'gestia-core/gestia-core.js'
text = read(path)

# Auto-layout patch generation was already retired. Remove its lexical class
# validators and ranking residue rather than preserving dead regex heuristics.
text = replace_once(
    text,
    '''    if (\n        /\\b(?:p[trblxy]?|gap)-\\d+(?:\\.\\d+){2,}(?=$|[\\s"'`<>;])/i.test(\n            replaceText\n        )\n    ) {\n        issues.push(\n            "INVALID_TAILWIND_DECIMAL_CLASS"\n        );\n    }\n\n    if (\n        /\\b(?:[a-z]+:)*scale-\\d+(?:\\.\\d+)+(?=$|[\\s"'`<>;])/i.test(\n            replaceText\n        )\n    ) {\n        issues.push(\n            "INVALID_SCALE_CLASS"\n        );\n    }\n\n''',
    '',
    'core-dead-tailwind-regex-validation'
)

text = replace_once(
    text,
    '''                const score =\n                    (signals.length * 12) +\n                    (\n                        /className\\s*=/i.test(\n                            block.search\n                        )\n                            ? 70\n                            : 0\n                    ) +\n                    (\n                        /innerHTML\\s*=/i.test(\n                            block.search\n                        )\n                            ? 25\n                            : 0\n                    ) -\n                    Math.min(nearestAnchorDistance, 80);''',
    '''                const score =\n                    (signals.length * 12) -\n                    Math.min(nearestAnchorDistance, 80);''',
    'core-dead-layout-score-regex'
)

start = '''    const prioritizeCausalFindings =\n        findings =>\n            [...(findings || [])]\n                .sort((a, b) => {\n                    const priorityFor =\n                        finding => {\n                            const signal =\n                                `${finding?.id || ""} ${finding?.title || ""}`\n                                    .toUpperCase();\n\n                            if (\n                                /ROLE_AUTHORITY_ROUTER|ROUTER CANONICO|AUTH_PENDING_GUARD|GUARD VISUAL/.test(signal)\n                            ) {\n                                return 0;\n                            }\n\n                            if (\n                                /AUTH_SESSION_OBSERVER|OBSERVER DE SESION|LEGACY_PROFILE_FALLBACK|FALLBACK DE PERFIL/.test(signal)\n                            ) {\n                                return 1;\n                            }\n\n                            return 2;\n                        };\n\n                    return priorityFor(a) - priorityFor(b);\n                });'''
text = replace_once(
    text,
    start,
    '''    const prioritizeCausalFindings =\n        findings =>\n            [...(findings || [])];''',
    'core-finding-name-dictionary'
)

old_count = '''    const findingCountWords = {\n        uno: 1,\n        una: 1,\n        dos: 2,\n        tres: 3,\n        cuatro: 4,\n        cinco: 5,\n        seis: 6,\n        siete: 7,\n        ocho: 8,\n        nueve: 9,\n        diez: 10\n    };\n\n    const findingCountMatch =\n        String(objective || "")\n            .toLowerCase()\n            .match(/\\b(\\d{1,2}|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\\s+(?:fallas?|errores?|riesgos?|problemas?|hallazgos?)\\b/);\n\n    const requestedFindingLimit =\n        Math.min(\n            12,\n            Math.max(\n                1,\n                findingCountMatch\n                    ? (\n                        Number(findingCountMatch[1]) ||\n                        findingCountWords[findingCountMatch[1]] ||\n                        12\n                    )\n                    : 12\n            )\n        );'''
text = replace_once(
    text,
    old_count,
    '''    const requestedFindingLimit = 12;''',
    'core-objective-count-dictionary'
)
write(path, text)


# Terminal repo summaries must trust structured critical flags. They no longer
# infer criticality from filenames such as runtime/engine/planner/repo.
path = 'gestia-terminal.js'
text = read(path)
old_filter = '''file.critical === true ||\n                    /jarvis|runtime|engine|terminal|bridge|executor|planner|repo/i\n                        .test(\n                            `${file.file || ""} ${file.module || ""} ${file.type || ""}`\n                        )'''
if text.count(old_filter) == 1:
    text = text.replace(old_filter, 'file.critical === true', 1)
else:
    raise SystemExit(f'RESIDUE_ANCHOR_FAILED:terminal-critical-filter-a:{text.count(old_filter)}')

old_filter_b = '''file.critical === true ||\n            /jarvis|runtime|engine|terminal|bridge|executor|planner|repo/i.test(\n                `${file.file || ""} ${file.module || ""} ${file.type || ""}`\n            )'''
if text.count(old_filter_b) == 1:
    text = text.replace(old_filter_b, 'file.critical === true', 1)
else:
    raise SystemExit(f'RESIDUE_ANCHOR_FAILED:terminal-critical-filter-b:{text.count(old_filter_b)}')
write(path, text)

print('V94_SEMANTIC_ONLY_RESIDUE_PATCH_APPLIED')
