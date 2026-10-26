import test from 'node:test';
import assert from 'node:assert/strict';
import * as composer from '../gestia-core/jarvis/jarvis.conversation.composer.js';

const failed = (files, error = 'REPO_CONTEXT_SOURCE_TOO_LARGE') => ({
    name: 'repo.context', args: { files }, observation: { ok: false, executionOk: false, status: 'ERROR', error }
});
const runtime = item => ({ ...item.observation, missionExecution: { name: item.name, args: item.args } });

test('final evidence excludes only correlated recovered attempts and retains the original diagnostic', () => {
    const recovered = failed(['large.js']), unresolved = failed(['other.js']);
    const mission = { completedTasks: [{ name: 'repo.context', args: { files: ['small.js'] }, observation: { ok: true } }],
        blockedTasks: [unresolved], recoveredToolAttempts: [recovered] };
    const observations = [runtime(recovered), runtime(unresolved)];
    const before = JSON.stringify({ mission, observations });
    const evidence = composer.buildMissionConversationEvidence(mission, observations);
    assert.equal(evidence.some(item => item.args?.files?.includes('large.js')), false);
    assert.equal(evidence.some(item => item.args?.files?.includes('small.js')), true);
    assert.equal(evidence.some(item => item.args?.files?.includes('other.js')), true);
    assert.equal(JSON.stringify({ mission, observations }), before);
    const recurring = composer.buildMissionConversationEvidence({ ...mission, blockedTasks: [recovered] }, observations);
    assert.equal(recurring.some(item => item.args?.files?.includes('large.js') && item.observation.error), true);
});

test('partial repository answer reports current cause and exact observed facts without promoting completion', async () => {
    const result = await composer.composeEvidenceGroundedConversation({
        instruction: 'Revisa commits, lee los archivos y explica pruebas y pendientes.',
        evidenceItems: [
            { name: 'repo.gitHistory', observation: { ok: true, gitEvidence: { commits: [{ sha: 'a'.repeat(40), subject: 'A real observed commit' }] } } },
            { name: 'repo.read', observation: { ok: true, verifiedRead: { file: 'small.js', partial: false, startLine: 1, endLine: 3, totalLines: 3 } } },
            { name: 'repo.read', observation: { ok: false, verifiedRead: { file: 'not-read.js', partial: false, startLine: 1, endLine: 3, totalLines: 3 } } },
            { name: 'mission.outcome', observation: { status: 'PARTIAL', reason: 'PLANNER_NO_EXECUTABLE_PLAN',
                completionAssessment: { objectives: [{ satisfied: false, limitation: 'Falta acreditar las pruebas.' }] } } }
        ], executeConversation: async () => { throw Error('NO_EXTRA_PROSE_PASS'); }
    });
    assert.equal(result.status, 'CONVERSATIONAL_EVIDENCE_INSUFFICIENT');
    assert.match(result.text, /PLANNER_NO_EXECUTABLE_PLAN/);
    assert.match(result.text, /aaaaaaaaaaaa.*A real observed commit/);
    assert.match(result.text, /small\.js.*1.*3/);
    assert.match(result.text, /Falta acreditar las pruebas/);
    assert.doesNotMatch(result.text, /not-read\.js|misión completada|pruebas aprobadas/);
});
