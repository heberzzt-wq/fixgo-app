const VERSION =
    "1.18.0-safe-marketing-artifact-expansion-v12";
const REEL_MEDIA_RECOVERY_MAX_ATTEMPTS = 3;
const STORAGE_KEY = "jarvis.missions.v1";
const SINGLETON_MISSION_TOOLS = new Set(["marketing.plan", "reel.plan"]);
const COMPLETED_SINGLETON_MISSION_TOOLS = new Set(["reel.plan"]);

function text(value = "", maximum = 120000) {
    return String(value ?? "").trim().slice(0, maximum);
}

function diagnosticErrorText(
    value,
    maximum = 1000,
    depth = 0
) {
    if (
        value == null ||
        depth > 5
    ) {
        return "";
    }

    if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return text(
            value,
            maximum
        );
    }

    if (value instanceof Error) {
        return text(
            value.message ||
            value.name ||
            String(value),
            maximum
        );
    }

    if (
        typeof value === "object"
    ) {
        const candidates = [
            value.message,
            value.error,
            value.details?.message,
            value.details?.error,
            value.cause,
            value.status,
            value.code
        ];

        for (
            const candidate
            of candidates
        ) {
            const resolved =
                diagnosticErrorText(
                    candidate,
                    maximum,
                    depth + 1
                );

            if (resolved) {
                return resolved;
            }
        }

        try {
            return text(
                JSON.stringify(value),
                maximum
            );
        }
        catch {
            return "";
        }
    }

    return text(
        value,
        maximum
    );
}

function storageOrMemory(storage) {
    if (storage) return storage;
    if (typeof localStorage !== "undefined") return localStorage;
    const values = new Map();
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value))
    };
}

function identifier(prefix) {
    const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${value}`;
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function callSignature(call = {}) {
    return JSON.stringify(stable({ name: text(call.name, 100), args: call.args || {} }));
}

function marketingArtifactOutput(task = {}) {
    return text(
        task?.observation?.artifact ||
        task?.observation?.evidence?.output ||
        task?.observation?.evidence?.artifact?.output ||
        "",
        500
    );
}

function taskMatchesMarketingRequirement(task = {}, requirement = {}, requirements = []) {
    const toolName = text(requirement?.toolName, 120);
    if (!toolName || text(task?.name, 120) !== toolName) return false;
    const requiredFormat = text(requirement?.format, 40).toLowerCase();
    if (toolName === "document.create" && requiredFormat) {
        if (text(task?.args?.format, 40).toLowerCase() !== requiredFormat) return false;
    }
    const requirementId = text(requirement?.id, 120);
    const taskIdentity = text(
        task?.args?.marketingRequirementId ||
        task?.args?.variantId,
        120
    );
    const siblingCount = (Array.isArray(requirements) ? requirements : []).filter(item =>
        text(item?.toolName, 120) === toolName &&
        text(item?.format, 40).toLowerCase() === requiredFormat
    ).length;
    if (siblingCount > 1) {
        return Boolean(requirementId && taskIdentity) && requirementId === taskIdentity;
    }
    if (requirementId && taskIdentity) return requirementId === taskIdentity;
    return true;
}

function unresolvedMarketingProductionRequirements(mission = {}) {
    const completed = Array.isArray(mission?.completedTasks)
        ? mission.completedTasks
        : [];
    const marketing = [...completed].reverse().find(item =>
        item?.name === "marketing.plan" &&
        item?.observation?.productionRequested === true
    );
    const requirements = Array.isArray(marketing?.observation?.requiredArtifacts)
        ? marketing.observation.requiredArtifacts
        : [];
    return requirements.filter(requirement => {
        const completedTask = completed.find(item =>
            taskMatchesMarketingRequirement(item, requirement, requirements)
        );
        return !completedTask || !marketingArtifactOutput(completedTask);
    }).map((requirement, index) => ({
        id: text(requirement?.id || `artifact-${index + 1}`, 120),
        type: text(requirement?.type, 120),
        toolName: text(requirement?.toolName, 120),
        format: text(requirement?.format, 40),
        label: text(requirement?.label, 200)
    }));
}

function marketingRequirementExecutionArgs(requirement = {}) {
    const id = text(requirement?.id, 120) || "artifact";
    const toolName = text(requirement?.toolName, 120);
    const format = text(requirement?.format, 40).toLowerCase();
    const label = text(requirement?.label || requirement?.type || id, 300);
    if (toolName === "document.create") {
        const extension = format === "markdown" ? "md" : format;
        return {
            marketingRequirementId: id,
            contentSource: "marketing.plan",
            ...(format ? { format } : {}),
            ...(extension ? { output: `.jarvis-artifacts/documents/marketing-${id}.${extension}` } : {})
        };
    }
    if (toolName === "image.edit") {
        return {
            marketingRequirementId: id,
            variantId: id,
            identityMode: "brand-scene",
            preserveLogos: true,
            preserveApprovedText: false,
            prompt: label
                ? `Crear la pieza "${label}" usando exclusivamente medios visuales reales verificados de esta mision. No generar ni redibujar logotipos; el emblema oficial se compone despues desde su archivo fuente.`
                : "Crear una pieza social usando exclusivamente medios visuales reales verificados. No generar ni redibujar logotipos."
        };
    }
    if (toolName === "image.generate") {
        return {
            marketingRequirementId: id,
            variantId: id,
            prompt: label || "Pieza visual de marketing"
        };
    }
    if (toolName === "reel.create") {
        return { marketingRequirementId: id };
    }
    if (toolName === "marketing.package.real-media") {
        return { marketingRequirementId: id, title: label || "Paquete de marketing" };
    }
    if (toolName === "page.create") {
        return { marketingRequirementId: id };
    }
    return { marketingRequirementId: id };
}

function marketingPendingTaskCompatible(task = {}, requirement = {}) {
    const toolName = text(requirement?.toolName, 120);
    if (!toolName || text(task?.name, 120) !== toolName) return false;
    if (toolName === "document.create") {
        const requiredFormat = text(requirement?.format, 40).toLowerCase();
        const taskFormat = text(task?.args?.format, 40).toLowerCase();
        return !requiredFormat || !taskFormat || requiredFormat === taskFormat;
    }
    return true;
}

function reconcileDeclaredMarketingProduction(mission = {}, requirements = []) {
    const normalizedRequirements = (Array.isArray(requirements) ? requirements : [])
        .map((requirement, index) => ({
            id: text(requirement?.id || `artifact-${index + 1}`, 120),
            type: text(requirement?.type, 120),
            toolName: text(requirement?.toolName, 120),
            format: text(requirement?.format, 40).toLowerCase(),
            label: text(requirement?.label, 300)
        }))
        .filter(requirement => requirement.toolName);
    const reservedPendingIndexes = new Set();
    const missingCalls = [];

    for (const requirement of normalizedRequirements) {
        const completed = (Array.isArray(mission?.completedTasks) ? mission.completedTasks : [])
            .some(task => taskMatchesMarketingRequirement(task, requirement, normalizedRequirements) && marketingArtifactOutput(task));
        if (completed) continue;

        const pendingIndex = (Array.isArray(mission?.pendingTasks) ? mission.pendingTasks : [])
            .findIndex((task, index) =>
                !reservedPendingIndexes.has(index) &&
                marketingPendingTaskCompatible(task, requirement)
            );
        const requiredArgs = marketingRequirementExecutionArgs(requirement);
        if (pendingIndex >= 0) {
            reservedPendingIndexes.add(pendingIndex);
            const pending = mission.pendingTasks[pendingIndex];
            pending.args = { ...(pending.args || {}), ...requiredArgs };
            pending.signature = callSignature({ name: pending.name, args: pending.args });
            pending.marketingRequirementId = requirement.id;
            continue;
        }
        if (requirement.toolName === "document.create") {
            missingCalls.push({
                name: requirement.toolName,
                args: requiredArgs,
                approved: false,
                reason: "MARKETING_DECLARED_PHYSICAL_REQUIREMENT"
            });
        }
    }

    return {
        requirements: normalizedRequirements,
        missingCalls
    };
}

async function sha256(value = "") {
    const bytes = new TextEncoder().encode(String(value));
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function compactRoutingInstruction(instruction = "", maximum = 12000) {
    const source = text(instruction);
    if (source.length <= maximum) return source;
    const marker = "\n[INSTRUCCION_COMPLETA_PERSISTIDA_EN_EXPEDIENTE]\n";
    const available = maximum - marker.length;
    const beginning = Math.ceil(available * 0.7);
    return `${source.slice(0, beginning)}${marker}${source.slice(source.length - (available - beginning))}`;
}

function readMissions(storage) {
    try {
        const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function compactMissionStorageValue(
    value,
    depth = 0
) {
    if (
        value == null ||
        typeof value ===
            "number" ||
        typeof value ===
            "boolean"
    ) {
        return value;
    }
    if (
        typeof value ===
        "string"
    ) {
        return value;
    }
    if (
        depth >
        10
    ) {
        return null;
    }
    if (
        Array.isArray(
            value
        )
    ) {
        return value.map(item =>
            compactMissionStorageValue(
                item,
                depth + 1
            )
        );
    }
    if (
        typeof value !==
        "object"
    ) {
        return null;
    }

    const compacted =
        {};
    for (
        const [key, item]
        of Object.entries(
            value
        )
    ) {
        if (
            key ===
                "content" &&
            typeof item ===
                "string" &&
            item.length >
                4000
        ) {
            compacted
                .contentLength =
                item.length;
            compacted
                .contentPersisted =
                false;
            continue;
        }
        compacted[key] =
            compactMissionStorageValue(
                item,
                depth + 1
            );
    }
    return compacted;
}

function compactMissionForStorage(
    mission
) {
    return compactMissionStorageValue(
        mission
    );
}

function saveMission(storage, mission) {
    const missions = readMissions(storage);
    const index = missions.findIndex(item => item.missionId === mission.missionId);
    const persistableMission =
        compactMissionForStorage(
            mission
        );
    if (index >= 0) missions[index] = persistableMission;
    else missions.push(persistableMission);
    const compactedMissions =
        missions
            .slice(-30)
            .map(
                compactMissionForStorage
            );
    try {
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify(
                compactedMissions
            )
        );
    }
    catch(error) {
        if (
            !/quota/i.test(
                String(
                    error?.name ||
                    error?.message ||
                    error
                )
            )
        ) {
            throw error;
        }
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify(
                compactedMissions
                    .slice(-5)
                    .map(item => ({
                        ...item,
                        observations:
                            Array.isArray(
                                item
                                    ?.observations
                            )
                                ? item
                                    .observations
                                    .slice(-20)
                                : []
                    }))
            )
        );
    }
    return structuredClone(mission);
}

function compactEvidence(value, depth = 0) {
    if (value == null || depth > 4) return null;
    if (typeof value === "string") return text(value, 700);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) {
        return value.slice(0, 24).map(item => compactEvidence(item, depth + 1));
    }
    if (typeof value !== "object") return null;
    return Object.fromEntries(
        Object.entries(value)
            .slice(0, 30)
            .map(([key, item]) => [text(key, 100), compactEvidence(item, depth + 1)])
            .filter(([, item]) => item !== null)
    );
}

function isFailureStatus(status = "") {
    const normalizedStatus = text(status, 120).toUpperCase();
    return (
        normalizedStatus === "FAILED" ||
        normalizedStatus === "TOOL_FAILED" ||
        normalizedStatus === "ERROR" ||
        normalizedStatus.endsWith("_FAILED") ||
        normalizedStatus.endsWith("_FAILURE") ||
        normalizedStatus.endsWith("_ERROR")
    );
}


function genericRuntimeEnvelopeStatus(
    value = ""
) {
    const status =
        text(value, 120)
            .toUpperCase();
    return (
        !status ||
        status === "SUCCESS" ||
        status === "COMPLETED" ||
        status === "OK"
    );
}

function unwrapObservationPayload(
    result = {}
) {
    let current =
        result;
    const seen =
        new Set();

    for (
        let depth = 0;
        depth < 8;
        depth += 1
    ) {
        if (
            !current ||
            typeof current !== "object" ||
            Array.isArray(current) ||
            seen.has(current)
        ) {
            break;
        }
        seen.add(current);

        const observation =
            current
                ?.observations
                ?.[0]
                ?.data;
        if (
            observation &&
            typeof observation === "object" &&
            !Array.isArray(observation)
        ) {
            current =
                observation;
            continue;
        }

        const currentStatus =
            text(
                current?.status,
                120
            )
                .toUpperCase();
        const outerFailureEnvelope =
            depth === 0 &&
            isFailureStatus(
                currentStatus
            );
        if (
            !genericRuntimeEnvelopeStatus(
                currentStatus
            ) &&
            !outerFailureEnvelope
        ) {
            break;
        }

        const nested =
            [
                current?.result,
                current?.data,
                current?.response
            ].find(value =>
                value &&
                typeof value === "object" &&
                !Array.isArray(value)
            );
        if (!nested) {
            break;
        }
        current =
            nested;
    }

    return current &&
        typeof current === "object" &&
        !Array.isArray(current)
        ? current
        : result;
}

function safeObservation(result = {}) {
    const payload =
        unwrapObservationPayload(
            result
        );
    const envelopeStatus = text(result?.status, 120);
    const payloadStatus = text(payload?.status, 120);
    const genericEnvelopeStatus =
        !envelopeStatus ||
        envelopeStatus.toUpperCase() === "SUCCESS" ||
        envelopeStatus.toUpperCase() === "COMPLETED";
    const status = text(
        genericEnvelopeStatus
            ? payloadStatus || envelopeStatus || (result?.ok === false ? "FAILED" : "COMPLETED")
            : envelopeStatus || payloadStatus || (result?.ok === false ? "FAILED" : "COMPLETED"),
        120
    );
    const normalizedStatus = status.toUpperCase();
    const failedStatus = isFailureStatus(normalizedStatus);
    const executionOk =
        result?.executionOk !== false &&
        result?.ok !== false &&
        payload?.executionOk !== false &&
        payload?.ok !== false &&
        !failedStatus;
    const missingInputs = [
        ...new Set([
            ...(Array.isArray(payload?.missingInputs) ? payload.missingInputs : []),
            ...(Array.isArray(result?.missingInputs) ? result.missingInputs : [])
        ].filter(Boolean))
    ].slice(0, 20);
    const requiresInput =
        result?.requiresInput === true ||
        payload?.requiresInput === true ||
        normalizedStatus.includes("INPUT_REQUIRED") ||
        missingInputs.length > 0;
    const requiresApproval =
        result?.requiresApproval === true ||
        payload?.requiresApproval === true ||
        normalizedStatus.includes("PENDING_APPROVAL");
    const degraded =
        result?.degraded === true ||
        payload?.degraded === true ||
        normalizedStatus.includes("DEGRADED") ||
        normalizedStatus === "GROUNDED_LOCAL_FALLBACK" ||
        Boolean(result?.cloudError) ||
        Boolean(payload?.cloudError);
    const explicitObjectiveSatisfied =
        typeof payload?.objectiveSatisfied === "boolean"
            ? payload.objectiveSatisfied
            : typeof result?.objectiveSatisfied === "boolean"
                ? result.objectiveSatisfied
                : null;
    const marketingPackageReady = normalizedStatus === "MARKETING_PACKAGE_READY";
    const marketingProductionRequested =
        marketingPackageReady &&
        payload?.productionRequested === true;
    const marketingRequiredArtifacts =
        marketingPackageReady &&
        Array.isArray(payload?.requiredArtifacts)
            ? payload.requiredArtifacts.slice(0, 12).map((item, index) => ({
                id: text(item?.id || `artifact-${index + 1}`, 120),
                type: text(item?.type, 120),
                toolName: text(item?.toolName, 120),
                format: text(item?.format, 40),
                label: text(item?.label, 200)
            })).filter(item => item.toolName)
            : [];
    const marketingDeliverableReady =
        !marketingPackageReady ||
        (
            payload?.plan &&
            typeof payload.plan === "object" &&
            Object.keys(payload.plan).length >= 25 &&
            typeof payload?.userVisible === "string" &&
            payload.userVisible.trim().length > 0
        );
    const objectiveSatisfied =
        executionOk &&
        !requiresInput &&
        !requiresApproval &&
        marketingDeliverableReady &&
        (
            explicitObjectiveSatisfied !== null
                ? explicitObjectiveSatisfied
                : payload?.readyForProduction !== false &&
                    result?.readyForProduction !== false
        );
    const blocked =
        result?.blocked === true ||
        payload?.blocked === true ||
        requiresInput ||
        requiresApproval;
    const explicitRetryable =
        typeof payload?.retryable === "boolean"
            ? payload.retryable
            : typeof result?.retryable === "boolean"
                ? result.retryable
                : null;
    const retryable =
        explicitRetryable !== null
            ? explicitRetryable
            : !executionOk && !blocked;
    const preparedArtifact =
        normalizedStatus === "DOCUMENT_CONTENT_COMPOSED" &&
        payload?.validationPassed === true &&
        payload?.compositionComplete === true &&
        payload?.completionMarkerPresent === true
            ? {
                kind:
                    "document",
                title:
                    text(payload?.title, 300),
                format:
                    text(payload?.format, 30),
                content:
                    String(payload?.content ?? "").slice(0, 500000),
                contract:
                    compactEvidence(
                        payload?.contract ||
                        {}
                    ),
                wordCount:
                    Number(
                        payload?.wordCount
                    ) ||
                    0,
                sectionCount:
                    Number(
                        payload?.sectionCount
                    ) ||
                    0,
                headingCount:
                    Number(
                        payload?.headingCount
                    ) ||
                    0,
                tableBlueprintCount:
                    Number(
                        payload?.tableBlueprintCount
                    ) ||
                    0,
                templateCount:
                    Number(
                        payload?.templateCount
                    ) ||
                    0,
                questionCount:
                    Number(
                        payload?.questionCount
                    ) ||
                    0,
                answerKeyCount:
                    Number(
                        payload?.answerKeyCount
                    ) ||
                    0,
                vehicleCount:
                    Number(
                        payload?.vehicleCount
                    ) ||
                    0,
                partCount:
                    Number(
                        payload?.partCount
                    ) ||
                    0,
                kpiCount:
                    Number(
                        payload?.kpiCount
                    ) ||
                    0,
                implementationDayCoverage:
                    Number(
                        payload
                            ?.implementationDayCoverage
                    ) ||
                    0,
                completionMarkerPresent:
                    true,
                compositionComplete:
                    true,
                validationPassed:
                    true,
                validationFailures:
                    [],
                continuationCount:
                    Number(
                        payload?.continuationCount
                    ) ||
                    0
            }
            : normalizedStatus === "SPREADSHEET_BLUEPRINT_READY"
                ? {
                    kind:
                        "spreadsheet",
                    title:
                        text(payload?.title, 300),
                    format:
                        "xlsx",
                    sheets:
                        Array.isArray(payload?.sheets)
                            ? payload.sheets.slice(0, 12).map((sheet, index) => ({
                                name:
                                    text(
                                        sheet?.name ||
                                        `Hoja ${index + 1}`,
                                        31
                                    ),
                                rows:
                                    Array.isArray(sheet?.rows)
                                        ? sheet.rows.slice(0, 2000).map(row =>
                                            (
                                                Array.isArray(row)
                                                    ? row
                                                    : Object.values(row || {})
                                            )
                                                .slice(0, 80)
                                                .map(cell =>
                                                    typeof cell === "string"
                                                        ? text(cell, 500)
                                                        : cell
                                                )
                                        )
                                        : []
                            }))
                            : [],
                    formulaCount:
                        Number(
                            payload?.formulaCount
                        ) ||
                        0,
                    formulaValidationPassed:
                        payload
                            ?.formulaValidationPassed ===
                        true
                }
                : normalizedStatus === "REEL_PLAN_READY"
                    ? {
                        kind:
                            "reel",
                        brandName:
                            text(payload?.brandName, 300),
                        title:
                            text(payload?.title, 500),
                        cta:
                            text(payload?.cta, 500),
                        durationSeconds:
                            Number(payload?.durationSeconds) || 0,
                        timelineSeconds:
                            Number(payload?.timelineSeconds) || 0,
                        scenes:
                            compactEvidence(
                                Array.isArray(payload?.scenes)
                                    ? payload.scenes.slice(0, 18)
                                    : []
                            )
                    }
                : normalizedStatus === "PAGE_CONTENT_COMPOSED"
                    ? {
                        kind:
                            "page",
                        pageInput:
                            compactEvidence(
                                payload?.pageInput ||
                                {}
                            )
                    }
                    : null;
    const verifiedRead =
        typeof payload?.numberedContent === "string" &&
        payload.numberedContent.trim()
            ? {
                tool:
                    "repo.read",
                file:
                    text(
                        payload?.file ||
                        payload?.path,
                        500
                    ),
                path:
                    text(
                        payload?.path ||
                        payload?.file,
                        500
                    ),
                partial:
                    payload?.partial === true,
                startLine:
                    Number(payload?.startLine) ||
                    1,
                endLine:
                    Number(payload?.endLine) ||
                    null,
                totalLines:
                    Number(payload?.totalLines) ||
                    null,
                numberedContent:
                    String(
                        payload.numberedContent
                    ).slice(0, 60000),
                sourceStructure:
                    compactEvidence(
                        payload?.sourceStructure ||
                        {}
                    )
            }
            : null;

    return {
        ok: executionOk,
        executionOk,
        objectiveSatisfied,
        status,
        requiresInput,
        requiresApproval,
        blocked,
        degraded,
        retryable,
        sourceCount: Number(payload?.sourceCount || payload?.sources?.length || 0),
        validSources: Array.isArray(payload?.sources) ? payload.sources.slice(0, 12) : [],
        discardedSources: Array.isArray(payload?.discardedSources) ? payload.discardedSources.slice(0, 12) : [],
        summary: text(
            [
                payload?.message,
                payload?.answer,
                payload?.summary,
                payload?.text,
                result?.message,
                result?.summary,
                result?.text
            ].find(value =>
                typeof value === "string" &&
                value.trim()
            ) || "",
            3000
        ),
        userVisible:
            marketingPackageReady && marketingDeliverableReady
                ? text(payload.userVisible, 120000)
                : "",
        planReady:
            marketingPackageReady &&
            marketingDeliverableReady &&
            payload?.planReady !== false,
        readyForProduction:
            marketingPackageReady &&
            payload?.readyForProduction === true,
        productionRequested:
            marketingProductionRequested,
        requiredArtifacts:
            marketingRequiredArtifacts,
        deliverable:
            marketingPackageReady && marketingDeliverableReady
                ? payload.plan
                : null,
        error:
            diagnosticErrorText(
                payload?.error ||
                result?.error ||
                payload?.result?.error ||
                result?.data?.error ||
                "",
                1000
            ) ||
            null,
        validationFailures:
            Array.isArray(
                payload
                    ?.validationFailures
            )
                ? payload
                    .validationFailures
                    .slice(0, 30)
                    .map(value =>
                        text(
                            value,
                            500
                        )
                    )
                    .filter(Boolean)
                : [],
        wordCount:
            Number(
                payload?.wordCount
            ) ||
            0,
        sectionCount:
            Number(
                payload?.sectionCount
            ) ||
            0,
        tableBlueprintCount:
            Number(
                payload
                    ?.tableBlueprintCount
            ) ||
            0,
        templateCount:
            Number(
                payload?.templateCount
            ) ||
            0,
        questionCount:
            Number(
                payload?.questionCount
            ) ||
            0,
        answerKeyCount:
            Number(
                payload?.answerKeyCount
            ) ||
            0,
        vehicleCount:
            Number(
                payload?.vehicleCount
            ) ||
            0,
        partCount:
            Number(
                payload?.partCount
            ) ||
            0,
        kpiCount:
            Number(
                payload?.kpiCount
            ) ||
            0,
        implementationDayCoverage:
            Number(
                payload
                    ?.implementationDayCoverage
            ) ||
            0,
        continuationCount:
            Number(
                payload
                    ?.continuationCount
            ) ||
            0,
        segmentedComposition:
            payload
                ?.segmentedComposition ===
            true,
        artifact: text(
            payload?.output ||
            (
                typeof payload?.artifact === "string"
                    ? payload.artifact
                    : payload?.artifact?.file ||
                        payload?.artifact?.output ||
                        ""
            ),
            500
        ) || null,
        preparedArtifact,
        verifiedRead,
        evidence: compactEvidence({
            ...payload,
            envelope: {
                status: result?.status || null,
                executionOk: result?.executionOk,
                objectiveSatisfied: result?.objectiveSatisfied,
                requiresInput: result?.requiresInput,
                requiresApproval: result?.requiresApproval,
                blocked: result?.blocked,
                degraded: result?.degraded,
                retryable: result?.retryable
            },
            missingInputs
        })
    };
}

function canonicalMissionEvidence(mission = {}) {
    const completed = Array.isArray(mission?.completedTasks)
        ? mission.completedTasks
        : [];
    return completed
        .filter(item => {
            const name = text(item?.name, 120);
            const observation = item?.observation || {};
            return name === "media.analyze" ||
                name === "web.research" ||
                name.startsWith("repo.") ||
                Boolean(observation?.verifiedRead) ||
                (Array.isArray(observation?.validSources) && observation.validSources.length > 0);
        })
        .map(item => ({
            tool: text(item?.name, 120),
            status: text(item?.observation?.status, 120),
            summary: text(item?.observation?.summary, 3000),
            validSources: compactEvidence(item?.observation?.validSources || []),
            verifiedRead: compactEvidence(item?.observation?.verifiedRead || null),
            evidence: compactEvidence(item?.observation?.evidence || null)
        }))
        .slice(-20);
}

function mediaOnlyRequiredContractSatisfied(mission = {}) {
    const required = Array.isArray(mission?.requiredToolNames)
        ? mission.requiredToolNames
        : [];
    if (
        required.length !== 1 ||
        required[0] !== "media.analyze"
    ) {
        return false;
    }
    const completed = new Set(
        (Array.isArray(mission?.completedTasks)
            ? mission.completedTasks
            : [])
            .map(item => item?.name)
            .filter(Boolean)
    );
    const blocked = new Set(
        (Array.isArray(mission?.blockedTasks)
            ? mission.blockedTasks
            : [])
            .map(item => item?.name)
            .filter(Boolean)
    );
    return completed.has("media.analyze") &&
        !blocked.has("media.analyze");
}

function trustedCalls(calls = [], mission) {
    const completed = new Set(mission.completedTasks.map(item => item.signature));
    const pending = new Set(mission.pendingTasks.map(item => item.signature));
    const blocked = new Set(mission.blockedTasks.map(item => item.signature));
    const missionDedupeKeys = new Set(
        [
            ...mission.completedTasks,
            ...mission.pendingTasks,
            ...mission.blockedTasks
        ]
            .map(item => item?.missionDedupeKey)
            .filter(Boolean)
    );
    const accepted = [];
    const scheduledNames = new Set([
        ...mission.completedTasks,
        ...mission.pendingTasks,
        ...mission.blockedTasks
    ].map(item => item?.name).filter(Boolean));
    const completedNames = new Set(
        mission.completedTasks
            .map(item => item.name)
    );
    for (const candidate of Array.isArray(calls) ? calls : []) {
        const name = text(candidate?.name, 100);
        if (!name) continue;
        if (SINGLETON_MISSION_TOOLS.has(name) && scheduledNames.has(name)) continue;
        if (COMPLETED_SINGLETON_MISSION_TOOLS.has(name) && completedNames.has(name)) continue;
        const call = { name, args: candidate?.args && typeof candidate.args === "object" ? candidate.args : {}, approved: false };
        const missionDedupeKey =
            text(
                candidate?.missionDedupeKey,
                500
            );
        if (
            missionDedupeKey &&
            missionDedupeKeys.has(missionDedupeKey)
        ) {
            continue;
        }
        const signature = callSignature(call);
        if (completed.has(signature) || pending.has(signature) || blocked.has(signature)) continue;
        pending.add(signature);
        if (missionDedupeKey) {
            missionDedupeKeys.add(missionDedupeKey);
        }
        accepted.push({
            ...call,
            ...(missionDedupeKey ? { missionDedupeKey } : {}),
            signature,
            attempts: 0,
            status: "PENDING"
        });
        scheduledNames.add(name);
    }
    return accepted;
}

function normalizedHttpSourceUrl(value = "") {
    try {
        const url = new URL(String(value || "").trim());
        if (!["http:", "https:"].includes(url.protocol)) return "";
        if (url.username || url.password) return "";
        url.hash = "";
        return url.toString();
    }
    catch {
        return "";
    }
}

function explicitMissionHttpSourceUrls(input = "") {
    const source = String(input || "");
    const values = [];
    const seen = new Set();
    let cursor = 0;
    while (cursor < source.length && values.length < 8) {
        const httpIndex = source.indexOf("http://", cursor);
        const httpsIndex = source.indexOf("https://", cursor);
        let start = -1;
        if (httpIndex < 0) start = httpsIndex;
        else if (httpsIndex < 0) start = httpIndex;
        else start = Math.min(httpIndex, httpsIndex);
        if (start < 0) break;
        let end = start;
        while (end < source.length) {
            const character = source[end];
            if (character.charCodeAt(0) <= 32 || "<>\"'`".includes(character)) break;
            end += 1;
        }
        let candidate = source.slice(start, end);
        while (candidate && ".,;:!?)]}".includes(candidate.at(-1))) {
            candidate = candidate.slice(0, -1);
        }
        const normalized = normalizedHttpSourceUrl(candidate);
        if (normalized && !seen.has(normalized)) {
            seen.add(normalized);
            values.push(normalized);
        }
        cursor = Math.max(end, start + 1);
    }
    return values;
}

function verifiedResearchMediaSourceUrls(mission = {}) {
    const values = [];
    const seen = new Set();
    for (const task of Array.isArray(mission?.completedTasks) ? mission.completedTasks : []) {
        if (task?.name !== "web.research" || task?.observation?.objectiveSatisfied !== true) continue;
        const sources = Array.isArray(task?.observation?.validSources)
            ? task.observation.validSources
            : [];
        for (const source of sources) {
            const normalized = normalizedHttpSourceUrl(source?.url || source?.href || "");
            if (normalized && !seen.has(normalized)) {
                seen.add(normalized);
                values.push(normalized);
            }
        }
    }
    return values.slice(0, 12);
}

function reelArgsHaveExplicitVisualMedia(args = {}) {
    const scenes = Array.isArray(args?.scenes) ? args.scenes : [];
    return scenes.some(scene =>
        scene &&
        typeof scene === "object" &&
        !Array.isArray(scene) &&
        [scene.assetOutput, scene.assetDataUrl, scene.mediaUrl]
            .some(value => String(value || "").trim().length > 0)
    );
}

function verifiedCollectedVisualAssets(mission = {}) {
    const assets = [];
    for (const task of Array.isArray(mission?.completedTasks) ? mission.completedTasks : []) {
        if (task?.name !== "web.media.collect" || task?.observation?.objectiveSatisfied !== true) continue;
        const candidates = Array.isArray(task?.observation?.evidence?.mediaAssets)
            ? task.observation.evidence.mediaAssets
            : Array.isArray(task?.observation?.mediaAssets)
                ? task.observation.mediaAssets
                : [];
        for (const asset of candidates) {
            const kind = String(asset?.kind || "").trim().toLowerCase();
            const output = String(asset?.output || "").trim().replaceAll("\\", "/");
            const mimeType = String(asset?.mimeType || "").trim().toLowerCase();
            const sha256 = String(asset?.sha256 || "").trim().toLowerCase();
            const bytes = Number(asset?.bytes || 0);
            const hashValid = sha256.length === 64 && [...sha256].every(character =>
                (character >= "0" && character <= "9") ||
                (character >= "a" && character <= "f")
            );
            if (
                ["image", "video"].includes(kind) &&
                output.startsWith(".jarvis-artifacts/web-media/") &&
                mimeType.startsWith(`${kind}/`) &&
                Number.isFinite(bytes) &&
                bytes > 0 &&
                hashValid
            ) {
                assets.push(asset);
            }
        }
    }
    return assets;
}


function reelArgsHaveExplicitAudio(args = {}) {
    return [args?.audioOutput, args?.audioDataUrl, args?.audioUrl]
        .some(value => String(value || "").trim().length > 0);
}

function completedReelNarration(mission = {}) {
    const tasks = Array.isArray(mission?.completedTasks) ? mission.completedTasks : [];
    const task = [...tasks].reverse().find(item =>
        item?.name === "reel.plan" &&
        item?.observation?.objectiveSatisfied === true &&
        item?.observation?.status === "REEL_PLAN_READY" &&
        item?.observation?.preparedArtifact?.kind === "reel"
    );
    const scenes = Array.isArray(task?.observation?.preparedArtifact?.scenes)
        ? task.observation.preparedArtifact.scenes
        : [];
    let narration = scenes
        .map(scene => String(scene?.voiceover || "").trim())
        .filter(Boolean)
        .join(" ")
        .trim();

    if (!narration) {
        const marketing = [...tasks].reverse().find(item =>
            item?.name === "marketing.plan" &&
            item?.observation?.objectiveSatisfied === true &&
            item?.observation?.status === "MARKETING_PACKAGE_READY"
        );
        const videoPackage = marketing?.observation?.evidence?.videoPackage || {};
        const script = Array.isArray(videoPackage?.script) ? videoPackage.script : [];
        narration = script
            .map(item => String(item?.text || "").trim())
            .filter(Boolean)
            .join(" ")
            .trim();
        if (!narration) {
            const storyboard = Array.isArray(videoPackage?.storyboard) ? videoPackage.storyboard : [];
            narration = storyboard
                .map(item => String(item?.overlay || "").trim())
                .filter(Boolean)
                .join(" ")
                .trim();
        }
    }

    return narration.slice(0, 12000);
}

function verifiedSpeechArtifact(task = {}) {
    if (
        task?.name !== "speech.synthesize" ||
        task?.observation?.objectiveSatisfied !== true ||
        task?.observation?.status !== "SPEECH_AUDIO_CREATED_VERIFIED"
    ) return null;
    const evidence = task?.observation?.evidence || {};
    const output = String(task?.observation?.artifact || evidence?.output || "")
        .trim()
        .replaceAll("\\", "/");
    const mimeType = String(evidence?.mimeType || "").trim().toLowerCase();
    const bytes = Number(evidence?.bytes || 0);
    const sha256 = String(evidence?.sha256 || "").trim().toLowerCase();
    const hashValid = sha256.length === 64 && [...sha256].every(character =>
        (character >= "0" && character <= "9") ||
        (character >= "a" && character <= "f")
    );
    if (
        !output.startsWith(".jarvis-artifacts/audio/") ||
        output.includes("../") ||
        !output.toLowerCase().endsWith(".wav") ||
        mimeType !== "audio/wav" ||
        !Number.isFinite(bytes) ||
        bytes <= 0 ||
        !hashValid
    ) return null;
    return { output, mimeType, bytes, sha256 };
}

function reelSpeechDependencyCall(task = {}, mission = {}) {
    if (task?.name !== "reel.create") return null;
    if (reelArgsHaveExplicitAudio(task?.args || {})) return null;
    const completedSpeech = (Array.isArray(mission?.completedTasks) ? mission.completedTasks : [])
        .map(verifiedSpeechArtifact)
        .filter(Boolean);
    if (completedSpeech.length > 0) return null;
    const narration = completedReelNarration(mission);
    if (!narration) return null;
    return {
        name: "speech.synthesize",
        args: { text: narration },
        reason: "REEL_VOICEOVER_AUDIO_DEPENDENCY"
    };
}

function reelMediaDependencyCall(task = {}, mission = {}) {
    if (task?.name !== "reel.create") return null;
    if (reelArgsHaveExplicitVisualMedia(task?.args || {})) return null;
    if (verifiedCollectedVisualAssets(mission).length > 0) return null;

    const explicitSources = explicitMissionHttpSourceUrls(mission?.originalInstruction || "");
    const researchedSources = verifiedResearchMediaSourceUrls(mission);
    const sourceUrl = explicitSources.length === 1
        ? explicitSources[0]
        : explicitSources.length === 0 && researchedSources.length === 1
            ? researchedSources[0]
            : "";
    if (!sourceUrl) return null;

    return {
        name: "web.media.collect",
        args: {
            url: sourceUrl,
            requireAnyVisual: true,
            maxImages: 8,
            maxVideos: 4
        },
        reason: "REEL_REAL_MEDIA_DEPENDENCY"
    };
}


function reelMediaRecoveryState(task = {}, mission = {}) {
    if (task?.name !== "reel.create") return null;
    if (reelArgsHaveExplicitVisualMedia(task?.args || {})) return null;
    if (verifiedCollectedVisualAssets(mission).length > 0) return null;

    const attemptedUrls = [...new Set(
        (Array.isArray(mission?.blockedTasks) ? mission.blockedTasks : [])
            .filter(item => item?.name === "web.media.collect")
            .map(item => text(item?.args?.url, 2000))
            .filter(Boolean)
    )];
    const verifiedSources = [...new Set([
        ...explicitMissionHttpSourceUrls(mission?.originalInstruction || ""),
        ...verifiedResearchMediaSourceUrls(mission)
    ])];
    const attempted = new Set(attemptedUrls);
    const availableVerifiedSources = verifiedSources.filter(url => !attempted.has(url));
    const previous = mission?.reelMediaRecovery && typeof mission.reelMediaRecovery === "object"
        ? mission.reelMediaRecovery
        : {};

    return {
        active: true,
        reason: "REEL_VISUAL_MEDIA_SOURCE_RECOVERY",
        attempts: Math.max(0, Number(previous.attempts || 0)),
        maxAttempts: REEL_MEDIA_RECOVERY_MAX_ATTEMPTS,
        attemptedUrls,
        availableVerifiedSources,
        verifiedSourceCount: verifiedSources.length,
        originalInstruction: text(mission?.originalInstruction, 12000)
    };
}

function reelMediaRecoveryAllowedCalls(calls = [], recovery = {}) {
    const attempted = new Set(
        (Array.isArray(recovery?.attemptedUrls) ? recovery.attemptedUrls : [])
            .map(value => text(value, 2000))
            .filter(Boolean)
    );
    const verified = new Set(
        (Array.isArray(recovery?.availableVerifiedSources) ? recovery.availableVerifiedSources : [])
            .map(value => text(value, 2000))
            .filter(Boolean)
    );
    return (Array.isArray(calls) ? calls : []).filter(call => {
        const name = text(call?.name, 100);
        if (name === "web.research") return true;
        if (name !== "web.media.collect") return false;
        const url = text(call?.args?.url, 2000);
        if (!url || attempted.has(url)) return false;
        return verified.size > 0 && verified.has(url);
    });
}

function deterministicReelMediaRecoveryCall(recovery = {}) {
    const sources = Array.isArray(recovery?.availableVerifiedSources)
        ? recovery.availableVerifiedSources
        : [];
    if (sources.length !== 1) return null;
    return {
        name: "web.media.collect",
        args: {
            url: sources[0],
            requireAnyVisual: true,
            maxImages: 8,
            maxVideos: 4
        },
        reason: "REEL_MEDIA_RECOVERY_VERIFIED_SOURCE"
    };
}

function archiveRecoveredMediaSourceAttempts(mission = {}, now = () => new Date().toISOString()) {
    const blocked = Array.isArray(mission?.blockedTasks) ? mission.blockedTasks : [];
    const recovered = blocked.filter(item => item?.name === "web.media.collect");
    if (recovered.length === 0) return;
    mission.recoveredMediaSourceAttempts = [
        ...(Array.isArray(mission.recoveredMediaSourceAttempts)
            ? mission.recoveredMediaSourceAttempts
            : []),
        ...recovered.map(item => ({
            name: item.name,
            args: item.args,
            reason: item.reason,
            observation: item.observation,
            recoveredAt: now()
        }))
    ].slice(-12);
    mission.blockedTasks = blocked.filter(item => item?.name !== "web.media.collect");
    mission.errors = (Array.isArray(mission?.errors) ? mission.errors : [])
        .filter(item => item?.tool !== "web.media.collect");
    mission.reelMediaRecovery = {
        ...(mission.reelMediaRecovery || {}),
        active: false,
        recovered: true,
        recoveredAt: now()
    };
}

export async function runJarvisMission({
    instruction,
    initialToolCalls = [],
    requiredToolNames = [],
    planner,
    execute,
    storage,
    caseId,
    objectiveId,
    now = () => new Date().toISOString(),
    maximumSteps = 12,
    maximumRetries = 1,
    timeoutMs = 180000,
    signal,
    resumeMissionId,
    continuationContext = {},
    memoryContext = null
} = {}) {
    const originalInstruction = String(instruction ?? "").trim();
    if (!originalInstruction) throw new Error("MISSION_INSTRUCTION_REQUIRED");
    if (typeof planner !== "function" || typeof execute !== "function") throw new Error("MISSION_RUNTIME_REQUIRED");

    const persistence = storageOrMemory(storage);
    const startedAt = Date.now();
    const runtimeResults = [];
    const recovered = resumeMissionId
        ? readMissions(persistence).find(item => item.missionId === resumeMissionId)
        : null;
    if (resumeMissionId && !recovered) throw new Error("MISSION_NOT_FOUND");
    const mission = recovered ? structuredClone(recovered) : {
        schemaVersion: VERSION,
        missionId: identifier("MISSION"),
        caseId: text(caseId, 160) || identifier("CASE"),
        objectiveId: text(objectiveId, 160) || identifier("OBJ"),
        instructionHash: await sha256(originalInstruction),
        originalInstruction,
        rawInstructionLength: originalInstruction.length,
        routingInstruction: compactRoutingInstruction(originalInstruction),
        routingInstructionLength: compactRoutingInstruction(originalInstruction).length,
        status: "RUNNING",
        reason: null,
        plannedTools: [],
        requiredToolNames: [...new Set(
            (Array.isArray(requiredToolNames) ? requiredToolNames : [])
                .map(name => text(name, 100))
                .filter(Boolean)
        )],
        executedTools: [],
        completedTasks: [],
        pendingTasks: [],
        blockedTasks: [],
        observations: [],
        errors: [],
        iterations: 0,
        writeAllowed: false,
        approvalRequiredForWrite: true,
        startedAt: now(),
        updatedAt: now()
    };
    if (recovered) {
        const resumable = mission.blockedTasks.filter(item => item?.observation?.requiresInput === true);
        const resumableNames = new Set(resumable.map(item => item.name));
        mission.inputHistory = [
            ...(Array.isArray(mission.inputHistory) ? mission.inputHistory : []),
            ...resumable.map(item => ({
                name: item.name,
                status: item.observation?.status || item.reason || "INPUT_REQUIRED",
                missingInputs: item.observation?.evidence?.missingInputs || [],
                at: item.completedAt || now()
            }))
        ];
        mission.blockedTasks = mission.blockedTasks.filter(item => item?.observation?.requiresInput !== true);
        mission.errors = mission.errors.filter(item => item?.requiresInput !== true);
        mission.executedTools = mission.executedTools.filter(name => !resumableNames.has(name));
        mission.observations = mission.observations.filter(item =>
            !(resumableNames.has(item?.tool) && item?.requiresInput === true)
        );
        mission.pendingTasks = mission.pendingTasks.filter(item => !resumableNames.has(item?.name));
        mission.pendingTasks.unshift(...resumable.map(item => ({
            ...item,
            args: { ...(item.args || {}), ...(continuationContext || {}) },
            status: "PENDING",
            attempts: 0
        })));
        mission.status = "RUNNING";
        mission.reason = null;
        mission.resumedAt = now();
        mission.resumeCount = Number(mission.resumeCount || 0) + 1;
        mission.contractMissingTools = [];
    } else {
        mission.pendingTasks.push(...trustedCalls(initialToolCalls, mission));
    }
    saveMission(persistence, mission);

    while (mission.iterations < maximumSteps) {
        if (signal?.aborted) {
            mission.reason = "CANCELLED";
            break;
        }
        if (Date.now() - startedAt >= timeoutMs) {
            mission.reason = "DEADLINE_EXCEEDED";
            break;
        }

        if (mission.pendingTasks.length === 0) {
            if (mediaOnlyRequiredContractSatisfied(mission)) {
                mission.contractMissingTools = [];
                mission.reason = "ALL_EXECUTABLE_TASKS_COMPLETED";
                break;
            }

            let plan;
            try {
                plan = await planner({
                    originalInstruction,
                    routingInstruction: mission.routingInstruction,
                    mission: structuredClone(mission),
                    memoryContext: memoryContext && typeof memoryContext === "object"
                        ? structuredClone(memoryContext)
                        : null
                });
            } catch (error) {
                mission.reason = "PLANNER_UNAVAILABLE";
                mission.errors.push({
                    tool: "semantic.planner",
                    status: text(error?.message || "PLANNER_UNAVAILABLE", 500),
                    retryable: true,
                    at: now()
                });
                break;
            }
            const additions = trustedCalls(plan?.toolCalls || plan || [], mission);
            mission.pendingTasks.push(...additions);
            mission.plannedTools.push(...additions.map(item => item.name));
            mission.updatedAt = now();
            saveMission(persistence, mission);
            if (additions.length === 0) {
                const completedNames = new Set(mission.completedTasks.map(item => item.name));
                const blockedNames = new Set(mission.blockedTasks.map(item => item.name));
                mission.contractMissingTools = mission.requiredToolNames.filter(
                    name => !completedNames.has(name)
                );
                const contractUnaccountedTools =
                    mission.contractMissingTools.filter(
                        name => !blockedNames.has(name)
                    );
                const unresolvedProductionArtifacts =
                    unresolvedMarketingProductionRequirements(mission);
                mission.unresolvedProductionArtifacts =
                    unresolvedProductionArtifacts;
                const contractSatisfied =
                    contractUnaccountedTools.length === 0 &&
                    unresolvedProductionArtifacts.length === 0;
                const verifiedContractSatisfied =
                    contractSatisfied &&
                    mission.requiredToolNames.length > 0 &&
                    mission.completedTasks.length > 0;
                mission.reason = (
                    plan?.missionComplete === true ||
                    verifiedContractSatisfied
                ) && contractSatisfied
                    ? mission.blockedTasks.length > 0
                        ? "PARTIAL_CAPABILITY_BLOCKED"
                        : "ALL_EXECUTABLE_TASKS_COMPLETED"
                    : contractSatisfied
                        ? "PLANNER_NO_EXECUTABLE_PLAN"
                        : "MISSION_CONTRACT_INCOMPLETE";
                break;
            }
        }

        const task = mission.pendingTasks.shift();
        const speechDependency =
            reelSpeechDependencyCall(
                task,
                mission
            );
        if (speechDependency) {
            const dependencyTasks =
                trustedCalls(
                    [speechDependency],
                    mission
                );
            if (dependencyTasks.length > 0) {
                if (!mission.requiredToolNames.includes("speech.synthesize")) {
                    mission.requiredToolNames.push("speech.synthesize");
                }
                mission.pendingTasks.unshift(task);
                mission.pendingTasks.unshift(...dependencyTasks);
                mission.plannedTools.push(...dependencyTasks.map(item => item.name));
                mission.updatedAt = now();
                saveMission(persistence, mission);
                continue;
            }
        }

        const mediaDependency =
            reelMediaDependencyCall(
                task,
                mission
            );
        if (mediaDependency) {
            const dependencyTasks =
                trustedCalls(
                    [mediaDependency],
                    mission
                );
            if (dependencyTasks.length > 0) {
                if (!mission.requiredToolNames.includes("web.media.collect")) {
                    mission.requiredToolNames.push("web.media.collect");
                }
                mission.pendingTasks.unshift(task);
                mission.pendingTasks.unshift(...dependencyTasks);
                mission.plannedTools.push(...dependencyTasks.map(item => item.name));
                mission.updatedAt = now();
                saveMission(persistence, mission);
                continue;
            }
        }

        const mediaRecovery =
            reelMediaRecoveryState(
                task,
                mission
            );
        if (mediaRecovery) {
            const deterministicRecovery =
                deterministicReelMediaRecoveryCall(
                    mediaRecovery
                );
            const deterministicTasks =
                deterministicRecovery
                    ? trustedCalls([deterministicRecovery], mission)
                    : [];
            if (deterministicTasks.length > 0) {
                if (!mission.requiredToolNames.includes("web.media.collect")) {
                    mission.requiredToolNames.push("web.media.collect");
                }
                mission.reelMediaRecovery = {
                    ...mediaRecovery,
                    strategy: "VERIFIED_UNUSED_SOURCE"
                };
                mission.pendingTasks.unshift(task);
                mission.pendingTasks.unshift(...deterministicTasks);
                mission.plannedTools.push(...deterministicTasks.map(item => item.name));
                mission.updatedAt = now();
                saveMission(persistence, mission);
                continue;
            }

            if (mediaRecovery.attempts >= mediaRecovery.maxAttempts) {
                const observation = {
                    ok: false,
                    executionOk: true,
                    objectiveSatisfied: false,
                    status: "REEL_MEDIA_SOURCE_RECOVERY_EXHAUSTED",
                    requiresInput: false,
                    requiresApproval: false,
                    blocked: true,
                    degraded: false,
                    retryable: false,
                    summary: "No se encontro una fuente visual verificable alternativa para completar el reel.",
                    error: "REEL_MEDIA_SOURCE_RECOVERY_EXHAUSTED",
                    evidence: {
                        attemptedUrls: mediaRecovery.attemptedUrls,
                        availableVerifiedSources: mediaRecovery.availableVerifiedSources,
                        attempts: mediaRecovery.attempts
                    }
                };
                mission.blockedTasks.push({
                    ...task,
                    status: "BLOCKED",
                    observation,
                    reason: observation.status,
                    completedAt: now()
                });
                mission.errors.push({
                    tool: "reel.create",
                    status: observation.status,
                    retryable: false,
                    at: now()
                });
                mission.observations.push({
                    tool: "reel.create",
                    args: task.args,
                    signature: task.signature,
                    ...observation,
                    at: now()
                });
                mission.reelMediaRecovery = {
                    ...mediaRecovery,
                    active: false,
                    exhausted: true,
                    exhaustedAt: now()
                };
                mission.reason = observation.status;
                mission.updatedAt = now();
                saveMission(persistence, mission);
                break;
            }

            const recoveryForPlanner = {
                ...mediaRecovery,
                attempts: mediaRecovery.attempts + 1
            };
            mission.reelMediaRecovery = recoveryForPlanner;
            let recoveryPlan;
            try {
                const plannerMission = structuredClone(mission);
                plannerMission.phase = "REEL_MEDIA_SOURCE_RECOVERY";
                plannerMission.reelMediaRecovery = structuredClone(recoveryForPlanner);
                recoveryPlan = await planner({
                    originalInstruction,
                    routingInstruction: mission.routingInstruction,
                    mission: plannerMission,
                    memoryContext: memoryContext && typeof memoryContext === "object"
                        ? structuredClone(memoryContext)
                        : null
                });
            } catch (error) {
                mission.errors.push({
                    tool: "semantic.planner",
                    status: text(error?.message || "REEL_MEDIA_RECOVERY_PLANNER_UNAVAILABLE", 500),
                    retryable: true,
                    at: now()
                });
                mission.pendingTasks.unshift(task);
                mission.updatedAt = now();
                saveMission(persistence, mission);
                continue;
            }
            const recoveryCandidates =
                reelMediaRecoveryAllowedCalls(
                    recoveryPlan?.toolCalls || recoveryPlan || [],
                    recoveryForPlanner
                );
            const recoveryTasks =
                trustedCalls(
                    recoveryCandidates,
                    mission
                );
            if (recoveryTasks.length > 0) {
                mission.pendingTasks.unshift(task);
                mission.pendingTasks.unshift(...recoveryTasks);
                mission.plannedTools.push(...recoveryTasks.map(item => item.name));
                mission.updatedAt = now();
                saveMission(persistence, mission);
                continue;
            }
            mission.pendingTasks.unshift(task);
            mission.updatedAt = now();
            saveMission(persistence, mission);
            continue;
        }
        mission.iterations += 1;
        task.attempts += 1;
        let result;
        try {
            result = await execute({ name: task.name, args: task.args, approved: false }, {
                missionId: mission.missionId,
                caseId: mission.caseId,
                objectiveId: mission.objectiveId,
                rawInput: originalInstruction,
                requiredToolNames:
                    [...mission.requiredToolNames],
                completedTasks: mission.completedTasks.map(item => ({
                    name: item.name,
                    args: item.args,
                    observation: item.observation
                })),
                blockedTasks: mission.blockedTasks.map(item => ({
                    name: item.name,
                    args: item.args,
                    reason: item.reason,
                    observation: item.observation
                })),
                validSources: mission.completedTasks
                    .flatMap(item => item.observation?.validSources || [])
                    .slice(0, 20),
                marketingContext: continuationContext,
                semanticMemory: memoryContext && typeof memoryContext === "object"
                    ? structuredClone(memoryContext)
                    : null,
                canonicalEvidence: canonicalMissionEvidence(mission),
                writeAllowed: false,
                approved: false
            });
        } catch (error) {
            result = { ok: false, status: "TOOL_FAILED", error: error?.message || String(error) };
        }

        const observation = safeObservation(result);
        if (
            task.name === "marketing.plan" &&
            observation.productionRequested === true
        ) {
            for (const requirement of observation.requiredArtifacts || []) {
                const toolName = text(requirement?.toolName, 120);
                if (toolName && !mission.requiredToolNames.includes(toolName)) {
                    mission.requiredToolNames.push(toolName);
                }
            }
        }
        const executedArgs =
            result?.missionExecution?.args &&
            typeof result.missionExecution.args === "object" &&
            !Array.isArray(result.missionExecution.args)
                ? result.missionExecution.args
                : task.args;
        runtimeResults.push(result);
        const recordStatus = observation.objectiveSatisfied
            ? "COMPLETED"
            : observation.blocked
                ? "BLOCKED"
                : "FAILED";
        const record = {
            ...task,
            args: executedArgs,
            status: recordStatus,
            observation,
            completedAt: now()
        };
        mission.executedTools.push(task.name);
        mission.observations.push({
            tool: task.name,
            args: executedArgs,
            signature: task.signature,
            ...observation,
            at: now()
        });

        if (observation.objectiveSatisfied) {
            if (task.name === "web.media.collect") {
                archiveRecoveredMediaSourceAttempts(mission, now);
            }
            mission.completedTasks.push(record);
            if (
                task.name === "marketing.plan" &&
                observation.productionRequested === true
            ) {
                const reconciliation = reconcileDeclaredMarketingProduction(
                    mission,
                    observation.requiredArtifacts || []
                );
                const recoveredTasks = trustedCalls(
                    reconciliation.missingCalls,
                    mission
                );
                if (recoveredTasks.length > 0) {
                    mission.pendingTasks.push(...recoveredTasks);
                    mission.plannedTools.push(...recoveredTasks.map(item => item.name));
                }
                mission.marketingProductionContract = {
                    requirementCount: reconciliation.requirements.length,
                    requirementIds: reconciliation.requirements.map(item => item.id),
                    recoveredTaskCount: recoveredTasks.length,
                    reconciledAt: now()
                };
            }
        } else if (observation.blocked) {
            mission.blockedTasks.push({
                ...record,
                reason: observation.status
            });
            mission.errors.push({
                tool: task.name,
                status: observation.status,
                retryable: false,
                requiresInput: observation.requiresInput,
                requiresApproval: observation.requiresApproval,
                at: now()
            });

            if (
                observation.requiresInput ||
                observation.requiresApproval
            ) {
                const completedNames = new Set(
                    mission.completedTasks.map(item => item.name)
                );
                mission.contractMissingTools =
                    mission.requiredToolNames.filter(
                        name =>
                            !completedNames.has(name)
                    );
                mission.reason = observation.requiresInput
                    ? "MISSION_INPUT_REQUIRED"
                    : "MISSION_APPROVAL_REQUIRED";
                break;
            }
        } else if (
            observation.retryable &&
            task.attempts <= maximumRetries
        ) {
            mission.pendingTasks.push({
                ...task,
                status: "RETRY_PENDING"
            });
            mission.errors.push({
                tool: task.name,
                status: observation.status,
                retryable: true,
                at: now()
            });
        } else {
            mission.blockedTasks.push({
                ...record,
                reason: observation.status
            });
            mission.errors.push({
                tool: task.name,
                status: observation.status,
                retryable: false,
                at: now()
            });
        }

        mission.updatedAt = now();
        saveMission(persistence, mission);
    }

    if (!mission.reason) mission.reason = mission.iterations >= maximumSteps ? "MAXIMUM_STEPS_REACHED" : "MISSION_STOPPED";
    mission.status = mission.reason === "ALL_EXECUTABLE_TASKS_COMPLETED" ? "COMPLETED" : "PARTIAL";
    mission.durationMs = Date.now() - startedAt;
    mission.pendingTasks = mission.pendingTasks.map(item => ({ ...item, status: "PENDING" }));
    mission.updatedAt = now();
    saveMission(persistence, mission);
    return { ...mission, runtimeResults };
}

export function recoverJarvisMission(missionId, { storage } = {}) {
    return readMissions(storageOrMemory(storage)).find(item => item.missionId === missionId) || null;
}

export const __test = {
    callSignature,
    compactRoutingInstruction,
    isFailureStatus,
    safeObservation,
    trustedCalls,
    canonicalMissionEvidence,
    unwrapObservationPayload,
    explicitMissionHttpSourceUrls,
    verifiedResearchMediaSourceUrls,
    reelArgsHaveExplicitVisualMedia,
    reelArgsHaveExplicitAudio,
    completedReelNarration,
    verifiedSpeechArtifact,
    reelSpeechDependencyCall,
    verifiedCollectedVisualAssets,
    reelMediaDependencyCall,
    reelMediaRecoveryState,
    reelMediaRecoveryAllowedCalls,
    deterministicReelMediaRecoveryCall,
    archiveRecoveredMediaSourceAttempts
};
