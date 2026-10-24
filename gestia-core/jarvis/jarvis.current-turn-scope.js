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
const researchNames=new Set(["web.research","browser.inspect","conversation.respond"]);
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
const gitEvidenceNames=new Set(["repo.gitStatus","repo.gitDiff","repo.search","repo.grep","repo.read"]);
export function scopeJarvisToolsForQuestion(tools = [], instruction = "") {
    const source=Array.isArray(tools)?tools:[];
    if (jarvisExternalEducationQuery(instruction)) return source.filter(tool =>
        researchNames.has(tool?.name) && tool?.mutates !== true &&
        tool?.requiresApproval !== true);
    if (jarvisRepositoryEvidenceRequest(instruction)) return source.filter(tool =>
        gitEvidenceNames.has(tool?.name) && tool?.mutates !== true &&
        tool?.requiresApproval !== true && tool?.userArtifact !== true);
    return source.slice();
}
