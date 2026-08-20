import fs from 'node:fs';

const providerPath = 'functions/jarvis-genai-provider-chain.js';
const researchPath = 'functions/jarvis-web-research.js';

function replaceOnce(source, before, after, label) {
    if (!source.includes(before)) {
        throw new Error(`V147_PATCH_MARKER_MISSING:${label}`);
    }
    return source.replace(before, after);
}

let provider = fs.readFileSync(providerPath, 'utf8');

if (!provider.includes('require("./jarvis-web-fact-freshness")')) {
    provider = replaceOnce(
        provider,
        '"use strict";\n\nfunction normalizeProviders',
        '"use strict";\n\nconst {\n    assessGroundingSupportFreshness\n} = require("./jarvis-web-fact-freshness");\n\nfunction normalizeProviders',
        'provider_import'
    );
}

if (!provider.includes('supportFreshCount: supportFreshness.freshCount')) {
    const before = [
        '    const freshCount = inspected.filter(item => item.fresh).length;',
        '    const datedCount = inspected.filter(item => item.publishedAt).length;',
        '    return {',
        '        required: true,',
        '        verified: freshCount > 0,',
        '        windowDays,',
        '        cutoffDate,',
        '        freshCount,',
        '        datedCount,',
        '        inspectedCount: inspected.length,',
        '        sources: inspected',
        '    };',
        '}'
    ].join('\n');

    const after = [
        '    const sourceFreshCount = inspected.filter(item => item.fresh).length;',
        '    const sourceDatedCount = inspected.filter(item => item.publishedAt).length;',
        '    const supportFreshness = assessGroundingSupportFreshness({',
        '        response,',
        '        inspectedSources: inspected,',
        '        cutoffMs,',
        '        referenceMs: reference.getTime()',
        '    });',
        '    return {',
        '        required: true,',
        '        verified: supportFreshness.freshCount > 0,',
        '        windowDays,',
        '        cutoffDate,',
        '        freshCount: supportFreshness.freshCount,',
        '        datedCount: supportFreshness.datedCount,',
        '        supportFreshCount: supportFreshness.freshCount,',
        '        supportStaleCount: supportFreshness.staleCount,',
        '        sourceFreshCount,',
        '        sourceDatedCount,',
        '        inspectedCount: inspected.length,',
        '        sources: inspected,',
        '        supports: supportFreshness.supports',
        '    };',
        '}'
    ].join('\n');

    provider = replaceOnce(provider, before, after, 'provider_support_gate');
}

fs.writeFileSync(providerPath, provider);

let research = fs.readFileSync(researchPath, 'utf8');

if (!research.includes('require("./jarvis-web-fact-freshness")')) {
    research = replaceOnce(
        research,
        '"use strict";\n\nconst DEFAULT_MODEL',
        '"use strict";\n\nconst {\n    filterGroundingSupportsByFreshness\n} = require("./jarvis-web-fact-freshness");\n\nconst DEFAULT_MODEL',
        'research_import'
    );
}

if (!research.includes('const freshnessFilteredSupports =')) {
    const before = [
        '    const allSupports =',
        '        extractGroundingSupports(response);',
        '    const supports = allSupports',
        '        .map(support => ({ ...support, sourceIds: support.sourceIds.filter(id => acceptedIds.has(id)) }))',
        '        .filter(support => support.sourceIds.length > 0);',
        '    const relevantSourceIds = new Set(supports.flatMap(support => support.sourceIds));',
        '    const sources = acceptedSources.filter(source => relevantSourceIds.has(source.id));'
    ].join('\n');
    const after = [
        '    const allSupports =',
        '        extractGroundingSupports(response);',
        '    const freshnessFilteredSupports =',
        '        filterGroundingSupportsByFreshness(',
        '            allSupports,',
        '            response?.jarvisFreshness',
        '        );',
        '    const supports = freshnessFilteredSupports',
        '        .map(support => ({ ...support, sourceIds: support.sourceIds.filter(id => acceptedIds.has(id)) }))',
        '        .filter(support => support.sourceIds.length > 0);',
        '    const relevantSourceIds = new Set(supports.flatMap(support => support.sourceIds));',
        '    const freshnessSourceByUrl = new Map(',
        '        (Array.isArray(response?.jarvisFreshness?.sources)',
        '            ? response.jarvisFreshness.sources',
        '            : [])',
        '            .map(item => [String(item?.url || "").trim(), item])',
        '            .filter(([url]) => Boolean(url))',
        '    );',
        '    const sources = acceptedSources',
        '        .filter(source => relevantSourceIds.has(source.id))',
        '        .map(source => {',
        '            const freshness = freshnessSourceByUrl.get(source.url);',
        '            return freshness?.publishedAt',
        '                ? { ...source, publishedAt: freshness.publishedAt }',
        '                : source;',
        '        });'
    ].join('\n');
    research = replaceOnce(research, before, after, 'research_grounded_support_and_source_filter');
}

if (!research.includes('freshness: support.freshness || null')) {
    const before = [
        '    const facts = supports.map((support, index) => ({',
        '        id: index + 1,',
        '        type: "VERIFIED_FACT",',
        '        claim: support.text,',
        '        sourceIds: support.sourceIds',
        '    }));'
    ].join('\n');
    const after = [
        '    const facts = supports.map((support, index) => ({',
        '        id: index + 1,',
        '        type: "VERIFIED_FACT",',
        '        claim: support.text,',
        '        sourceIds: support.sourceIds,',
        '        freshness: support.freshness || null',
        '    }));'
    ].join('\n');
    research = replaceOnce(research, before, after, 'research_fact_freshness');
}

if (!research.includes('freshnessRequired: Boolean(response?.jarvisFreshness?.required)')) {
    const before = [
        '            modelSynthesisFiltered:',
        '                Boolean(requestedDomain) &&',
        '                !modelSynthesisAllowed,',
        '            factsSeparatedFromInference: true,',
        '            duplicatesRemoved: true,'
    ].join('\n');
    const after = [
        '            modelSynthesisFiltered:',
        '                Boolean(requestedDomain) &&',
        '                !modelSynthesisAllowed,',
        '            factsSeparatedFromInference: true,',
        '            freshnessRequired: Boolean(response?.jarvisFreshness?.required),',
        '            freshnessVerified: response?.jarvisFreshness?.required',
        '                ? facts.length > 0',
        '                : null,',
        '            staleFactsFiltered: Math.max(',
        '                0,',
        '                allSupports.length - supports.length',
        '            ),',
        '            duplicatesRemoved: true,'
    ].join('\n');
    research = replaceOnce(research, before, after, 'research_grounded_policy');
}

fs.writeFileSync(researchPath, research);
console.log('V147_FACT_FRESHNESS_PATCH_APPLIED=true');
