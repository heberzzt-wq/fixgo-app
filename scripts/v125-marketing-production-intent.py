from pathlib import Path

ROOT = Path('.')

pack_path = ROOT / 'gestia-core/jarvis/jarvis.multitool.pack.js'
pack = pack_path.read_text(encoding='utf-8')
start_marker = 'export function resolveMarketingMissionProductionScope(\n'
end_marker = '\nconst MARKETING_ARGUMENT_SCHEMA = {'
start = pack.index(start_marker)
end = pack.index(end_marker, start)
old_function = pack[start:end]
new_function = '''export function resolveMarketingMissionProductionScope(
    args = {},
    context = {}
) {
    const current =
        args && typeof args === "object" && !Array.isArray(args)
            ? { ...args }
            : {};
    const requiredToolNames =
        Array.isArray(context?.requiredToolNames)
            ? context.requiredToolNames.map(String).filter(Boolean)
            : [];
    const contractedProductionToolNames =
        [...new Set(
            requiredToolNames.filter(name =>
                Object.prototype.hasOwnProperty.call(
                    MARKETING_PRODUCTION_TOOL_TYPES,
                    name
                )
            )
        )];
    const declaredArtifacts =
        (Array.isArray(current.productionArtifacts)
            ? current.productionArtifacts
            : [])
            .filter(item =>
                item &&
                typeof item === "object" &&
                !Array.isArray(item) &&
                Object.prototype.hasOwnProperty.call(
                    MARKETING_PRODUCTION_TOOL_TYPES,
                    String(item.toolName || "")
                )
            );
    const semanticProductionRequested =
        current.productionRequested === true;
    const productionRequested =
        semanticProductionRequested ||
        contractedProductionToolNames.length > 0;
    const productionArtifacts =
        productionRequested
            ? (declaredArtifacts.length > 0
                ? declaredArtifacts
                : contractedProductionToolNames.map(toolName => ({
                    id: `mission-${toolName.replaceAll(".", "-")}`,
                    type: MARKETING_PRODUCTION_TOOL_TYPES[toolName],
                    toolName,
                    label: toolName
                })))
            : [];

    return {
        ...current,
        productionRequested,
        productionArtifacts
    };
}
'''
if old_function.count('productionRequested') < 2:
    raise SystemExit('V125_SCOPE_FUNCTION_UNEXPECTED')
pack = pack[:start] + new_function + pack[end:]
pack = pack.replace(
    'const VERSION = "1.52.0-source-grounded-research-v124";',
    'const VERSION = "1.53.0-marketing-production-intent-v125";',
    1
)
pack_path.write_text(pack, encoding='utf-8')

runtime_path = ROOT / 'gestia-core/tools.runtime.js'
runtime = runtime_path.read_text(encoding='utf-8')
old_runtime_import = './jarvis/jarvis.multitool.pack.js?v=v94-source-grounded-research-v124-20260810'
new_runtime_import = './jarvis/jarvis.multitool.pack.js?v=v94-marketing-production-intent-v125-20260810'
if runtime.count(old_runtime_import) != 1:
    raise SystemExit(f'V125_RUNTIME_IMPORT_COUNT:{runtime.count(old_runtime_import)}')
runtime = runtime.replace(old_runtime_import, new_runtime_import, 1)
runtime_path.write_text(runtime, encoding='utf-8')

core_path = ROOT / 'gestia-core/gestia-core.js'
core = core_path.read_text(encoding='utf-8')
old_core_import = '/gestia-core/tools.runtime.js?v=v94-source-grounded-research-v124-20260810'
new_core_import = '/gestia-core/tools.runtime.js?v=v94-marketing-production-intent-v125-20260810'
if core.count(old_core_import) != 1:
    raise SystemExit(f'V125_CORE_RUNTIME_IMPORT_COUNT:{core.count(old_core_import)}')
core = core.replace(old_core_import, new_core_import, 1)
core_path.write_text(core, encoding='utf-8')

terminal_path = ROOT / 'gestia-terminal.html'
terminal = terminal_path.read_text(encoding='utf-8')
old_terminal_import = '/gestia-core/gestia-core.js?v=v94-source-grounded-research-v124-20260810'
new_terminal_import = '/gestia-core/gestia-core.js?v=v94-marketing-production-intent-v125-20260810'
if terminal.count(old_terminal_import) != 1:
    raise SystemExit(f'V125_TERMINAL_CORE_IMPORT_COUNT:{terminal.count(old_terminal_import)}')
terminal = terminal.replace(old_terminal_import, new_terminal_import, 1)
terminal_path.write_text(terminal, encoding='utf-8')

multifunction_test_path = ROOT / 'tests/jarvis-multifunction-tools.test.mjs'
multifunction_test = multifunction_test_path.read_text(encoding='utf-8')
old_tool_pack_version = '1.52.0-source-grounded-research-v124'
new_tool_pack_version = '1.53.0-marketing-production-intent-v125'
if multifunction_test.count(old_tool_pack_version) != 1:
    raise SystemExit(f'V125_TOOL_PACK_EXPECTATION_COUNT:{multifunction_test.count(old_tool_pack_version)}')
multifunction_test = multifunction_test.replace(old_tool_pack_version, new_tool_pack_version, 1)
multifunction_test_path.write_text(multifunction_test, encoding='utf-8')

memory_test_path = ROOT / 'tests/jarvis-semantic-memory-integrity.test.mjs'
memory_test = memory_test_path.read_text(encoding='utf-8')
old_runtime_expectation = 'tools\\.runtime\\.js\\?v=v94-source-grounded-research-v124-20260810'
new_runtime_expectation = 'tools\\.runtime\\.js\\?v=v94-marketing-production-intent-v125-20260810'
if memory_test.count(old_runtime_expectation) != 1:
    raise SystemExit(f'V125_RUNTIME_EXPECTATION_COUNT:{memory_test.count(old_runtime_expectation)}')
memory_test = memory_test.replace(old_runtime_expectation, new_runtime_expectation, 1)
memory_test_path.write_text(memory_test, encoding='utf-8')

test_path = ROOT / 'tests/jarvis-marketing-production-intent-v125.test.mjs'
test_path.write_text('''import assert from "node:assert/strict";\nimport { test } from "node:test";\n\nimport {\n    resolveMarketingMissionProductionScope\n} from "../gestia-core/jarvis/jarvis.multitool.pack.js";\n\ntest("semantic marketing production intent survives an initial contract that only contains planning tools", () => {\n    const result = resolveMarketingMissionProductionScope(\n        {\n            productionRequested: true,\n            productionArtifacts: [{\n                id: "reel",\n                type: "reel",\n                toolName: "reel.create",\n                label: "Reel 9:16"\n            }]\n        },\n        {\n            requiredToolNames: [\n                "web.research",\n                "marketing.plan",\n                "reel.plan"\n            ]\n        }\n    );\n\n    assert.equal(result.productionRequested, true);\n    assert.deepEqual(\n        result.productionArtifacts.map(item => item.toolName),\n        ["reel.create"]\n    );\n});\n\ntest("planning-only semantic decision remains planning-only when no production actuator is contracted", () => {\n    const result = resolveMarketingMissionProductionScope(\n        {\n            productionRequested: false,\n            productionArtifacts: []\n        },\n        {\n            requiredToolNames: [\n                "web.research",\n                "marketing.plan",\n                "reel.plan"\n            ]\n        }\n    );\n\n    assert.equal(result.productionRequested, false);\n    assert.deepEqual(result.productionArtifacts, []);\n});\n\ntest("a contracted production actuator still forces production even when the semantic brief arrived incomplete", () => {\n    const result = resolveMarketingMissionProductionScope(\n        { productionRequested: false },\n        {\n            requiredToolNames: [\n                "marketing.plan",\n                "reel.create"\n            ]\n        }\n    );\n\n    assert.equal(result.productionRequested, true);\n    assert.deepEqual(\n        result.productionArtifacts.map(item => item.toolName),\n        ["reel.create"]\n    );\n});\n''', encoding='utf-8')

print('V125_MARKETING_PRODUCTION_INTENT_PATCHED=true')
print('V125_RUNTIME_EXPECTATIONS_UPDATED=true')
print('V125_TEST_CREATED=' + str(test_path))
