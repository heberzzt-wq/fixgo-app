export function normalizedLocalText(value = "") {
    const source =
        String(value || "")
            .normalize("NFD")
            .toLowerCase();
    let result = "";
    for (const character of source) {
        const code = character.charCodeAt(0);
        if (code >= 768 && code <= 879) {
            continue;
        }
        result += character;
    }
    return result.trim();
}

export function classifyLocalRequest(
    _input = "",
    semantic = null
) {
    const requestKind =
        semantic &&
        typeof semantic === "object" &&
        !Array.isArray(semantic)
            ? String(
                semantic.requestKind ||
                ""
            ).trim()
            : "";

    switch (requestKind) {
    case "MONTHLY_MEMORY_QUERY":
    case "PROJECT_MEMORY_QUERY":
    case "MARKETING_START":
    case "MARKETING_CONTINUATION":
    case "NEW_REQUEST":
        return requestKind;
    default:
        return "NEW_REQUEST";
    }
}

export function selectResumableMarketingMission(
    pointer = {},
    identity = {},
    requestKind = "NEW_REQUEST",
    contractVersion = ""
) {
    const compatible =
        pointer.contractVersion === contractVersion &&
        pointer.status === "WAITING_FOR_INPUT" &&
        pointer.intent === "marketing" &&
        pointer.userId === identity.userId &&
        pointer.workspaceId === identity.workspaceId &&
        pointer.projectId === identity.projectId &&
        pointer.conversationId === identity.conversationId;

    return compatible &&
        requestKind === "MARKETING_CONTINUATION"
        ? String(pointer.missionId || "")
        : "";
}
