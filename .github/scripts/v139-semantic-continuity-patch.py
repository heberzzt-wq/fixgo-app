from pathlib import Path

memory = Path('gestia-core/jarvis/jarvis.semantic.memory.js')
s = memory.read_text()
anchor = '\nexport const JarvisSemanticMemory = createJarvisSemanticMemory();\n'
if s.count(anchor) != 1:
    raise SystemExit('SEMANTIC_MEMORY_EXPORT_ANCHOR_MISMATCH')
helper = r'''

export function compactJarvisSemanticMemoryForPlanner(memory = {}) {
    const currentConversationId = clean(memory?.currentConversationId, 240);
    const belongsToCurrentConversation = item =>
        Boolean(currentConversationId) && clean(item?.conversationId, 240) === currentConversationId;
    const turns = (Array.isArray(memory?.turns) ? memory.turns : [])
        .filter(belongsToCurrentConversation)
        .slice(-12)
        .map(item => ({
            role: clean(item?.role, 40),
            content: clean(item?.content, 4000),
            missionId: clean(item?.missionId, 240),
            status: clean(item?.status, 120)
        }));
    const missions = (Array.isArray(memory?.missions) ? memory.missions : [])
        .filter(belongsToCurrentConversation)
        .slice(-6)
        .map(item => ({
            missionId: clean(item?.missionId, 240),
            instruction: clean(item?.instruction, 6000),
            missionStatus: clean(item?.missionStatus, 120),
            missionReason: clean(item?.missionReason, 160),
            completedTools: Array.isArray(item?.completedTools)
                ? item.completedTools.map(value => clean(value, 120)).filter(Boolean).slice(0, 30)
                : [],
            blockedTools: Array.isArray(item?.blockedTools)
                ? item.blockedTools.map(value => clean(value, 120)).filter(Boolean).slice(0, 30)
                : [],
            finalText: clean(item?.finalText, 8000),
            producedArtifacts: Array.isArray(item?.producedArtifacts)
                ? item.producedArtifacts.map(artifact => ({
                    label: clean(artifact?.label, 240),
                    output: clean(artifact?.output, 800)
                })).filter(artifact => artifact.label || artifact.output).slice(0, 20)
                : []
        }));
    return {
        authority: 'ADVISORY_SEMANTIC_MEMORY',
        currentConversationId,
        turns,
        missions,
        policy: {
            currentInstructionPrimary: true,
            memoryNeverBecomesCurrentMissionEvidence: true,
            noLexicalRouting: true,
            relevanceDecidedBySemanticModel: true
        }
    };
}
'''
s = s.replace(anchor, helper + anchor, 1)
memory.write_text(s)

core = Path('gestia-core/gestia-core.js')
s = core.read_text()
old_import = "import {\n    JarvisSemanticMemory\n} from '/gestia-core/jarvis/jarvis.semantic.memory.js?v=v94-semantic-memory-v1-20260809';"
new_import = "import {\n    JarvisSemanticMemory,\n    compactJarvisSemanticMemoryForPlanner\n} from '/gestia-core/jarvis/jarvis.semantic.memory.js?v=v139-semantic-continuity-20260813';"
if s.count(old_import) != 1:
    raise SystemExit('GESTIA_CORE_MEMORY_IMPORT_MISMATCH')
s = s.replace(old_import, new_import, 1)

current = 'semanticMemoryAvailable: Boolean(semanticMemory),\n                        writeAllowed: false'
current_new = 'semanticMemoryAvailable: Boolean(semanticMemory),\n                        semanticMemoryContext: compactJarvisSemanticMemoryForPlanner(semanticMemory),\n                        writeAllowed: false'
if s.count(current) != 1:
    raise SystemExit(f'CURRENT_TURN_MEMORY_ANCHOR_MISMATCH:{s.count(current)}')
s = s.replace(current, current_new, 1)

contract = 'semanticMemoryAvailable: Boolean(semanticMemoryContext)'
contract_new = 'semanticMemoryAvailable: Boolean(semanticMemoryContext),\n                        semanticMemoryContext: compactJarvisSemanticMemoryForPlanner(semanticMemoryContext)'
count = s.count(contract)
if count < 3 or count > 4:
    raise SystemExit(f'MISSION_MEMORY_ANCHOR_MISMATCH:{count}')
s = s.replace(contract, contract_new)
core.write_text(s)

test = Path('tests/jarvis-semantic-memory-integrity.test.mjs')
s = test.read_text()
old_test_import = 'import {\n    createJarvisSemanticMemory\n} from "../gestia-core/jarvis/jarvis.semantic.memory.js";'
new_test_import = 'import {\n    createJarvisSemanticMemory,\n    compactJarvisSemanticMemoryForPlanner\n} from "../gestia-core/jarvis/jarvis.semantic.memory.js";'
if s.count(old_test_import) != 1:
    raise SystemExit('SEMANTIC_MEMORY_TEST_IMPORT_MISMATCH')
s = s.replace(old_test_import, new_test_import, 1)
insertion = r'''

test("planner semantic context is bounded to the current conversation and remains advisory", () => {
    const memory = {
        currentConversationId: "current",
        turns: [
            { conversationId: "old", role: "user", content: "No contaminar" },
            { conversationId: "current", role: "user", content: "Prepara el plan de marketing" },
            { conversationId: "current", role: "assistant", content: "Plan preparado" },
            { conversationId: "current", role: "user", content: "Ahora crea los archivos" }
        ],
        missions: [
            { conversationId: "old", instruction: "Misión ajena", finalText: "No usar" },
            {
                conversationId: "current",
                missionId: "marketing-1",
                instruction: "Prepara un plan de marketing para Multiservicios Peninsulares HMH",
                missionStatus: "COMPLETED",
                completedTools: ["web.research", "marketing.plan"],
                finalText: "Plan de marketing preparado con piezas listas para producción.",
                producedArtifacts: []
            }
        ]
    };
    const context = compactJarvisSemanticMemoryForPlanner(memory);
    assert.equal(context.authority, "ADVISORY_SEMANTIC_MEMORY");
    assert.equal(context.currentConversationId, "current");
    assert.equal(context.turns.length, 3);
    assert.equal(context.missions.length, 1);
    assert.match(context.missions[0].instruction, /Multiservicios Peninsulares HMH/);
    assert.match(context.turns.at(-1).content, /crea los archivos/);
    assert.equal(JSON.stringify(context).includes("No contaminar"), false);
    assert.equal(JSON.stringify(context).includes("Misión ajena"), false);
    assert.equal(context.policy.memoryNeverBecomesCurrentMissionEvidence, true);
    assert.equal(context.policy.noLexicalRouting, true);
});

test("terminal planner receives advisory semantic context instead of a boolean-only memory flag", () => {
    const core = fs.readFileSync(new URL("../gestia-core/gestia-core.js", import.meta.url), "utf8");
    assert.match(core, /phase: "CURRENT_TURN"[\s\S]{0,500}semanticMemoryContext: compactJarvisSemanticMemoryForPlanner\(semanticMemory\)/);
    assert.match(core, /phase: "MISSION_CONTRACT"[\s\S]{0,900}semanticMemoryContext: compactJarvisSemanticMemoryForPlanner\(semanticMemoryContext\)/);
    assert.doesNotMatch(core, /lexicalRouting\s*:\s*true/);
});
'''
marker = '\ntest("active terminal boot no longer loads lexical context memory or duplicate runtime module URLs", () => {'
if s.count(marker) != 1:
    raise SystemExit('SEMANTIC_MEMORY_TEST_INSERTION_MISMATCH')
s = s.replace(marker, insertion + marker, 1)
test.write_text(s)
