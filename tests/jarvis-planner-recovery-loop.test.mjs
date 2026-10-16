import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runJarvisMission } from '../gestia-core/jarvis/jarvis.mission.orchestrator.js';
import { analyzeRepoSourceStructure } from '../gestia-core/repo/repo.source.structure.js';
import { grepRepo } from '../jarvis-fs-bridge.js';

const { runJarvisSemanticPlanner, hasRequiredToolArguments } = createRequire(import.meta.url)('../functions/jarvis-semantic-planner.js');

// Model responses and operational storage are simulated. The planner, source
// analysis, receipt compaction, continuation budget and closure are production.
// Contracts, catalog, executed empty query and rejected proposals are frozen
// from live-9dcbd99e-repeat2. Historical missions never become current evidence.
const receipt = JSON.parse(readFileSync(new URL('./fixtures/jarvis-planner-recovery-receipt.json', import.meta.url), 'utf8'));
const input = receipt.input, goals = receipt.objectives, catalog = receipt.catalog;
const file = receipt.readTask.args.file;
const read = catalog.find(tool => tool.name === 'repo.read');
const grep = catalog.find(tool => tool.name === 'repo.grep');
const query = catalog.find(tool => tool.name === 'platform.query');
const initial = { name: query.name, args: receipt.emptyQueryTask.args };
const rejected = receipt.rejections[0].proposed;
const invalid = receipt.rejections[2].proposed;
const technicians = rejected.args.collection;

for (const discover of [true, false]) test(discover
    ? 'receipt rejection reaches objective-informed discovery inside the real mission loop before closure'
    : 'repeated invalid recovery reuses all six reviews without changing the mission continuation budget', async t => {
    const startedAt = Date.parse('2026-10-15T04:13:12.000Z');
    t.mock.timers.enable({ apis: ['Date'], now: startedAt });
    const stages = [], executed = [], plans = [];
    let sourceQueries = 0, discoveredRead = false;
    const ai = { objectiveCoverageCache: new Map(), models: { generateContent: async request => {
        const stage = request.config.semanticStage;
        stages.push(stage);
        if (stage === 'EVIDENCE_NEXT_ACTION') return { text: JSON.stringify({ toolCalls: sourceQueries ?
            (discoveredRead ? [] : [{ name: read.name, args: { file: 'modulo-flotilla.js' } }]) : [rejected] }) };
        if (stage === 'QUERY_POPULATION_VERIFICATION') return { text: JSON.stringify({ matchesRequest: false,
            schemaDiscoveryRelevant: false, rejectionReason: 'La proyección de técnicos no acredita los objetivos de unidades y documentos.' }) };
        if (stage === 'READ_ONLY_EVIDENCE_CONTINUATION') {
            const pending = JSON.parse(request.config.chatMessages.find(m => m.content.startsWith('OBJETIVOS_PENDIENTES=')).content.slice('OBJETIVOS_PENDIENTES='.length));
            // A model boundary driven by independently reviewed gaps, not by a
            // hardcoded second invocation or an arbitrary next.js selection.
            const reviewed = pending.length === 3 && pending.every(o => o.pendingSources?.length && o.objectiveGaps?.length);
            const search = { name: grep.name, args: { term: 'placas' } };
            if (reviewed) {
                const choice = request.config.responseJsonSchema.properties.toolCalls.items.anyOf.find(c => c.properties.name.enum.includes(grep.name));
                assert.ok(hasRequiredToolArguments({ inputSchema: choice.properties.args }, search.args), 'an observed schema literal must remain usable for discovery');
            }
            return { text: JSON.stringify({ toolCalls: reviewed && discover ? [search] : [invalid] }) };
        }
        if (stage === 'OBJECTIVE_SOURCE_SCOPE_VERIFICATION') {
            const payload = JSON.parse(request.config.chatMessages.at(-1).content);
            return { text: JSON.stringify({ sourceRelevance: Object.fromEntries(payload.sources.map(collection =>
                [collection, { relevantToObjective: true, reason: 'El alcance de este objetivo sigue sin comprobarse.' }])) }) };
        }
        assert.ok(['RECORD_OBJECTIVE_COVERAGE', 'RECORD_OBJECTIVE_COVERAGE_CONSISTENCY'].includes(stage), stage);
        const payload = JSON.parse(request.config.chatMessages.at(-1).content);
        if(discover)assert.equal(discoveredRead,true,'independent operational closure must see the completed discovery, not an earlier pending state');
        assert.equal(payload.request, payload.contract.requestQuote);
        assert.ok(goals.some(g => g.objective === payload.request));
        return { text: JSON.stringify({ proven: false, missing: ['Falta localizar la fuente de este objetivo; el cero sólo acredita vehicles.'],
            groups: [], sources: payload.observedSources.map(collection => ({ collection, relevant: true,
                reason: 'Fuente pendiente de comprobar para este objetivo.', taskIndexes: collection.endsWith('/vehicles') ? [1] : [] })) }) };
    } } };
    const result = await runJarvisMission({ instruction: input, initialEvidenceObjectives: goals,
        initialToolCalls: [{ name: read.name, args: { file } }, initial], toolCatalog: catalog,
        execute: async call => {
            executed.push(call);
            if (call.name === read.name) {
                discoveredRead ||= call.args.file === 'modulo-flotilla.js';
                const content = readFileSync(new URL('../' + call.args.file, import.meta.url), 'utf8');
                return { ok: true, data: { file: call.args.file, content,
                    numberedContent: content.split('\n').map((line, i) => `${i + 1}: ${line}`).join('\n'),
                    sourceStructure: analyzeRepoSourceStructure(content) } };
            }
            if (call.name === grep.name) {
                sourceQueries++;
                const result = grepRepo({ term: call.args.term, root: fileURLToPath(new URL('..', import.meta.url)) });
                assert.equal(result.ok, true);
                assert.ok(result.matches.some(match => match.file === 'modulo-flotilla.js'), 'the production repository search must discover the fleet source');
                return result;
            }
            assert.deepEqual(call.args, initial.args, 'no rejected or fabricated query may execute');
            return { ok: true, data: { recordEvidence: structuredClone(receipt.emptyQueryTask.observation.recordEvidence) } };
        },
        planner: async ({ mission }) => {
            assert.ok(plans.length < 4, 'the fix must not increase continuation attempts');
            t.mock.timers.setTime(startedAt + (plans.length + 1) * 1000);
            const plan = await runJarvisSemanticPlanner({ input, catalog,
                missionState: { ...mission, tenantId: 'uxmal39', phase: 'EVIDENCE_NEXT_ACTION' }, ai });
            plans.push(plan);
            return plan;
        }, storage: { getItem() { return null; }, setItem() {}, removeItem() {} }
    });
    if (!discover) {
        assert.equal(sourceQueries, 0);
        assert.equal(plans.length, 2, 'only the original one orchestrator continuation is permitted');
        assert.equal(stages.filter(s => s === 'RECORD_OBJECTIVE_COVERAGE').length, 3);
        assert.equal(stages.filter(s => s === 'OBJECTIVE_SOURCE_SCOPE_VERIFICATION').length, 3);
        assert.equal(stages.filter(s => s === 'QUERY_POPULATION_VERIFICATION').length, 1, 'unchanged rejected projections stay rejected');
        assert.equal(result.reason, 'PLANNER_RECOVERY_EXHAUSTED');
        assert.equal(result.status, 'PARTIAL');
        assert.ok(result.completionAssessment.objectives.every(o => !o.satisfied));
        assert.equal(executed.filter(c => c.name === query.name).length, 1, 'the invented cutoff never reaches execution');
        return;
    }
    assert.equal(sourceQueries, 1, JSON.stringify({ reason: result.reason, errors: result.errors, stages }));
    assert.equal(discoveredRead, true, 'the discovered fleet source must be read before closure');
    assert.equal(stages.filter(s => s === 'READ_ONLY_EVIDENCE_CONTINUATION').length, 1);
    assert.ok(stages.indexOf('OBJECTIVE_SOURCE_SCOPE_VERIFICATION') < stages.indexOf('READ_ONLY_EVIDENCE_CONTINUATION'),'recovery retains independent source pertinence');
    assert.ok(stages.indexOf('RECORD_OBJECTIVE_COVERAGE') > stages.indexOf('READ_ONLY_EVIDENCE_CONTINUATION'),'operational closure review follows discovery instead of delaying recovery');
    assert.equal(result.status, 'PARTIAL', 'discovery is not operational completion');
    assert.equal(result.reason, 'PLANNER_NO_GROUNDED_ACTION');
    assert.deepEqual(result.completionAssessment.objectives.map(o => [o.objective, o.satisfied]), goals.map(o => [o.objective, false]));
    assert.equal(executed.filter(c => c.name === query.name).length, 1);
    const rejections = plans[0].completionAssessment.evidenceDecision.rejections;
    assert.equal(rejections.length, 2, 'both the value projection and rejected ID probe must survive recovery');
    assert.ok(rejections.every(r => r.operationalEvidence === false && r.objectiveSatisfied === false));
    assert.ok(rejections.some(r => JSON.stringify(r.proposed.args) === JSON.stringify(rejected.args)));
    assert.ok(rejections.some(r => r.proposed.args.collection === technicians && JSON.stringify(r.proposed.args.fields) === '["__name__"]'));
});
