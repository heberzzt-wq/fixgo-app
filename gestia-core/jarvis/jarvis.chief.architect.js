const VERSION = "1.1.0-grounded-plan-contract";

function clean(value) {
    return String(value || "").trim();
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function mutationCalls(plan = {}) {
    return (Array.isArray(plan.toolCalls) ? plan.toolCalls : [])
        .filter(call => call?.mutates === true || call?.requiresApproval === true);
}

function targetFiles(plan = {}) {
    return unique([
        ...(Array.isArray(plan.targetFiles) ? plan.targetFiles : []),
        ...mutationCalls(plan).map(call => call?.args?.file || call?.args?.path)
    ].map(file => clean(file).replaceAll("\\", "/")));
}

function check(id, passed, evidence, remediation, severity = "BLOCK") {
    return {
        id,
        status: passed ? "PASS" : severity,
        evidence,
        remediation: passed ? null : remediation
    };
}

export function reviewChiefArchitectPlan({
    instruction = "",
    plan = {},
    graph = null,
    ranking = null,
    authority = {}
} = {}) {
    const originalInstruction = clean(instruction);
    const preservedInstruction = clean(plan.originalInstruction || plan.instruction);
    const mutations = mutationCalls(plan);
    const files = targetFiles(plan);
    const nodes = graph?.nodes || {};
    const rankedFiles = (ranking?.candidates || []).map(candidate => candidate.file);
    const topRankedFiles = rankedFiles.slice(0, 3);
    const rootCause = clean(plan.rootCause);
    const rootCauseEvidence = Array.isArray(plan.rootCauseEvidence) ? plan.rootCauseEvidence.filter(Boolean) : [];
    const plannedToolCalls =
        Array.isArray(
            plan.toolCalls
        )
            ? plan.toolCalls
            : [];
    const plannedTests = unique([
        ...(Array.isArray(plan.tests) ? plan.tests : []),
        ...plannedToolCalls.filter(call => call?.name === "tests.run").map(call => call?.args?.mode || "tests.run")
    ]);
    const relatedTests = unique(files.flatMap(file => nodes[file]?.relatedTests || []));
    const ownerAuthority = ["heberto_mendoza", "human_owner", "owner"].includes(clean(authority.authorityId || authority.role).toLowerCase());
    const graphReady = graph?.ok === true && Object.keys(nodes).length > 0;
    const rankingReady = ranking?.ok === true && rankedFiles.length > 0;
    const everyTargetGrounded = files.length > 0 && files.every(file => nodes[file]);
    const everyTargetRanked = files.length > 0 && files.every(file => topRankedFiles.includes(file) || originalInstruction.toLowerCase().includes(file.toLowerCase()));
    const mutationApprovalSafe = mutations.every(call => call.requiresApproval === true && call.approved !== true);
    const scope = plan.scope && typeof plan.scope === "object" ? plan.scope : {};

    const checks = [
        check("instruction_conservation", Boolean(originalInstruction) && originalInstruction === preservedInstruction,
            { originalPresent: Boolean(originalInstruction), exactMatch: originalInstruction === preservedInstruction },
            "Conservar literalmente originalInstruction dentro del plan."),
        check("correct_file", mutations.length === 0 || (everyTargetGrounded && everyTargetRanked),
            { targetFiles: files, graphGrounded: everyTargetGrounded, topRankedFiles },
            "Rehacer candidate ranking y justificar cada archivo objetivo con evidencia del grafo."),
        check("localized_solution", mutations.length === 0 || (files.length > 0 && files.length <= 3),
            { mutationCalls: mutations.length, targetFiles: files },
            "Reducir el cambio a tres archivos o menos, o dividirlo en fases aprobables."),
        check("root_cause", mutations.length === 0 || (rootCause.length >= 20 && rootCauseEvidence.length > 0),
            { rootCause, evidenceCount: rootCauseEvidence.length },
            "Documentar causa raíz y al menos una evidencia verificable antes de proponer escritura."),
        check("scope", mutations.length === 0 || (Array.isArray(scope.included) && scope.included.length > 0 && Array.isArray(scope.excluded)),
            { included: scope.included || [], excluded: scope.excluded || [] },
            "Declarar alcance incluido y excluido."),
        check("duplication", graphReady && Number(graph?.summary?.duplicateEndpoints || 0) === 0,
            { duplicateEndpoints: graph?.summary?.duplicateEndpoints ?? null },
            "Resolver o excluir explícitamente duplicados que puedan competir con el cambio.", "WARN"),
        check("regressions", mutations.length === 0 || plannedTests.length > 0 || relatedTests.length > 0,
            { plannedTests, relatedTests },
            "Agregar pruebas de regresión o identificar pruebas existentes del flujo."),
        check("architecture", graphReady && (mutations.length === 0 || everyTargetGrounded),
            { graphStatus: graph?.status || null, dependencyEdges: graph?.summary?.dependencyEdges || 0 },
            "Construir el grafo vivo y resolver dependencias antes de ejecutar."),
        check("security", mutationApprovalSafe,
            { mutationCalls: mutations.map(call => ({ name: call.name, requiresApproval: call.requiresApproval, approved: call.approved === true })) },
            "Toda mutación debe quedar sin autoaprobación y requerir aprobación humana."),
        check("authorization", ownerAuthority,
            { authorityId: authority.authorityId || null, role: authority.role || null },
            "Vincular el plan a la autoridad humana exclusiva de Heberto Mendoza."),
        check("candidate_evidence", mutations.length === 0 || rankingReady,
            { rankingStatus: ranking?.status || null, candidates: topRankedFiles },
            "Ejecutar repo.rankCandidates con desglose de evidencia.")
    ];

    const blockers = checks.filter(item => item.status === "BLOCK");
    const warnings = checks.filter(item => item.status === "WARN");
    const ready = blockers.length === 0;

    return {
        ok: true,
        version: VERSION,
        status: ready ? "READY_FOR_HUMAN_APPROVAL" : "PLAN_BLOCKED",
        decision: ready ? "READY_FOR_HUMAN_APPROVAL" : "BLOCKED",
        canExecute: false,
        grantsApproval: false,
        requiresHumanApproval: mutations.length > 0,
        instruction: originalInstruction,
        targetFiles: files,
        checks,
        blockers,
        warnings,
        summary: ready
            ? "El plan conserva autoridad y evidencia suficientes para solicitar aprobación humana; esta revisión no autoriza ejecución."
            : `Plan detenido por ${blockers.length} control(es) arquitectónico(s).`,
        reviewedAt: new Date().toISOString()
    };
}

export function describeChiefArchitect() {
    return {
        ok: true,
        version: VERSION,
        readOnly: true,
        grantsApproval: false,
        checks: [
            "instruction_conservation", "correct_file", "localized_solution", "root_cause", "scope",
            "duplication", "regressions", "architecture", "security", "authorization", "candidate_evidence"
        ]
    };
}
