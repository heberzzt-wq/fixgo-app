// A narrow, deterministic capability boundary. It is not a second planner:
 // Qwen remains the only semantic authority for any substantive request.
const fold = text => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function simpleJarvisGreeting(text = "") {
    const s = fold(text).replace(/[!¡¿?.,]+/g, "").replace(/\s+/g, " ").trim();
    if (!/^(hola|buenos dias|buen dia|buenas tardes|buenas noches|que onda|que tal)$/.test(s)) return null;
    return /buenas noches/.test(s) ? "¡Buenas noches! ¿En qué te ayudo?" :
        /buenas tardes/.test(s) ? "¡Buenas tardes! ¿En qué te ayudo?" :
        "¡Hola! ¿En qué te ayudo?";
}

export function jarvisExternalEducationQuery(text = "") {
    const s=fold(text);
    const education=/\b(uveg|universidad|universidades|plan de estudios|materias|asignaturas|licenciatura|carrera|ingenieria de sistemas|modulos de estudio|programa academico|oferta educativa)\b/.test(s);
    const request=/\b(busca|buscar|investiga|investigar|averigua|consulta|consultar|informacion|dime|explica|cuales|cuantos|que|quiero saber|plan de estudios)\b/.test(s);
    const coding=/\b(mi repositorio|nuestro repositorio|codigo fuente|github|gitlab|fixgo|adjunto|jarvis|\brepo\b|\bscript\b|\bdebug\b|\bpatch\b)\b/.test(s) ||
        /\b[\w-]+\.(js|mjs|ts|cjs|py)\b/.test(s);
    return education && request && !coding;
}
// Hard evidence boundary, not an intent-to-tool mapping or a second model.
// A request to inspect *current* changes in the owner's repo cannot be
// satisfied by conversation.respond without ever reading repository state.
export function jarvisRepositoryEvidenceRequest(text = "") {
    const s=fold(text);
    const repository=/\b(?:repositorios?|repo|git|github|checkout|commits?|diff|rama|branch|codigo fuente)\b/u.test(s);
    const changes=/\b(?:ultimos?|recientes?|actuales?|cambios?|modificad[oa]s?|modificaciones?|estado|historial|diferencias?|commits?|diff|sin publicar)\b/u.test(s);
    const request=/\b(?:revisa|revisar|verifica|verificar|consulta|consultar|investiga|investigar|busca|buscar|muestra|mostrar|enumera|enumerar|lista|listar|dime|identifica|identificar|compara|comparar|analiza|analizar|checa|checar)\b/u.test(s);
    return repository && changes && request;
}
const gitEvidenceNames=new Set(["repo.gitStatus","repo.gitHistory","repo.gitDiff","repo.search","repo.grep","repo.read","repo.context"]);
// This follows an already validated semantic contract, never user keywords.
// It only reduces the supplied authority; mixed or incomplete missions keep
// their existing operational contract path.
export function scopeValidatedRepositoryMission({catalog=[],toolCalls=[],objectives=[],validated=false}={}) {
    const kinds=new Set(['repository_source','repository_search','repository_inventory']);
    if(validated!==true || !Array.isArray(objectives) || !objectives.length ||
        objectives.some(goal=>!goal || typeof goal.objective!=='string' || !goal.objective.trim() || !kinds.has(goal.requiredEvidenceKind)) ||
        !Array.isArray(toolCalls) || !toolCalls.length || !Array.isArray(catalog))return null;
    const readers=catalog.filter(tool=>gitEvidenceNames.has(tool?.name) && tool.mutates===false &&
        tool.requiresApproval!==true && tool.userArtifact!==true);
    const names=new Set(readers.map(tool=>tool.name));
    if(toolCalls.some(call=>!names.has(call?.name) || call.mutates===true || call.requiresApproval===true || call.userArtifact===true) ||
        objectives.some(goal=>goal.explicitTools!==undefined && (!Array.isArray(goal.explicitTools) || goal.explicitTools.some(name=>!names.has(name)))))return null;
    return readers;
}
export function scopeJarvisToolsForQuestion(tools = []) {
    // A topic does not establish the whole mission: repository reviews can
    // require tests or a document, and external research can require exports.
    // Preserve the supplied catalog and its approval metadata until the model
    // establishes a complete contract. Only validated contracts may narrow it.
    return Array.isArray(tools) ? tools.slice() : [];
}

/**
 * Narrow an explicitly single-tool Git status request to its evidenced goal.
 * This reduces a model-proposed contract; it never supplies missing evidence
 * or certifies completion. Mixed requests retain the original contract.
 */
export function constrainExplicitGitStatusContract({instruction="",toolCalls=[],objectives=[],catalog=[]}={}) {
    const s=fold(instruction);
    const explicit=/\b(?:unicamente|solamente|solo|utiliza|usa|consulta|ejecuta|emplea|mediante)\s+(?:(?:la|el)\s+)?(?:(?:herramienta|comando)\s+)?repo\.gitstatus\b/u.test(s);
    // HEAD, branch and worktree can be evidenced by one Git status receipt.
    // Do not substitute history or read .git internals on mobile.
    const asksMore=/\b(?:system\.(?:health|observability)|salud|telemetria|observabilidad|cpu|ram|temperatura|servicios|puertos|historial|commits?\s+recientes?|ultimos?\s+commits?|diferencias|diff)\b/u.test(s) ||
        /\brepo\.(?!gitstatus\b)[a-z]+/u.test(s) ||
        /\b(?:y|tambien|ademas)\s+(?:lee|leer|consulta|revisa)\s+archivos?\b/u.test(s);
    const gitTool=catalog.find(item=>item?.name==="repo.gitStatus");
    const validTool=gitTool?.mutates===false && gitTool?.requiresApproval!==true &&
        gitTool?.evidenceKinds?.includes("repository_search");
    const statusCalls=toolCalls.filter(call=>call?.name==="repo.gitStatus" &&
        (call.args==null || (typeof call.args==="object" && !Array.isArray(call.args) &&
            Object.keys(call.args).every(key=>["cwd","timeoutMs"].includes(key)) &&
            (call.args.cwd==null || call.args.cwd==="."))));
    const repoGoals=objectives.filter(goal=>goal?.requiredEvidenceKind==="repository_search" &&
        (goal.explicitTools===undefined || (Array.isArray(goal.explicitTools) &&
            goal.explicitTools.includes("repo.gitStatus"))));
    if(!explicit || asksMore || !validTool || statusCalls.length!==1 || repoGoals.length<1) {
        return {toolCalls,objectives,restricted:false};
    }
    return {toolCalls:statusCalls,objectives:repoGoals,restricted:true};
}
