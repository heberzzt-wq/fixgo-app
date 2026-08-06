export function normalizedLocalText(value = "") {
    return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function classifyLocalRequest(input = "") {
    const text = normalizedLocalText(input);
    if (/(que avanzamos este mes|que hicimos durante|durante agosto)/i.test(text)) return "MONTHLY_MEMORY_QUERY";
    if (/(que recuerdas|que hicimos|que quedo pendiente|decisiones vigentes|memoria persistente|recuerdas realmente)/i.test(text)) return "PROJECT_MEMORY_QUERY";
    if (/plan de marketing completo/i.test(text)) return "MARKETING_START";
    if (/(negocio|mercado inicial|audiencia|oferta|problema|promesa|diferenciador|objetivo|canales|cta|presupuesto|horizonte)\s*:/i.test(text)) return "MARKETING_CONTINUATION";
    return "NEW_REQUEST";
}

export function selectResumableMarketingMission(pointer = {}, identity = {}, requestKind = "NEW_REQUEST", contractVersion = "") {
    const compatible = pointer.contractVersion === contractVersion &&
        pointer.status === "WAITING_FOR_INPUT" && pointer.intent === "marketing" &&
        pointer.userId === identity.userId && pointer.workspaceId === identity.workspaceId &&
        pointer.projectId === identity.projectId && pointer.conversationId === identity.conversationId;
    return compatible && requestKind === "MARKETING_CONTINUATION" ? String(pointer.missionId || "") : "";
}
