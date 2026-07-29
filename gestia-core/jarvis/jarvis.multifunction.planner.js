const VERSION = "4.14.0-identity-fidelity";
const ENDPOINT = "https://us-central1-fixgo-44e4d.cloudfunctions.net/jarvisSemanticPlan";
const CACHE_TTL_MS = 30000;
const planCache = new Map();
const pendingPlans = new Map();

const CLOUD_MISSION_CONTRACT_TIMEOUT_MS =
    45000;

const BROWSER_MISSION_ATTEMPT_TIMEOUT_MS =
    20000;

const BROWSER_PLAN_ATTEMPT_TIMEOUT_MS =
    15000;

function extractJsonObject(value = "") {
    const source = String(value || "");
    let start = -1;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        if (quoted) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === '"') quoted = false;
            continue;
        }
        if (character === '"') quoted = true;
        else if (character === "{") {
            if (start < 0) start = index;
            depth += 1;
        } else if (character === "}" && start >= 0) {
            depth -= 1;
            if (depth === 0) return JSON.parse(source.slice(start, index + 1));
        }
    }
    throw new Error("CLIENT_MISSION_CONTRACT_JSON_REQUIRED");
}

const EXPLICIT_TOOL_PLAN_START =
    "[[JARVIS_TOOL_PLAN]]";

const EXPLICIT_TOOL_PLAN_END =
    "[[/JARVIS_TOOL_PLAN]]";

function explicitGovernedCallKey(
    name = "",
    args = {}
) {
    return `${String(name || "")}:${JSON.stringify(
        args &&
        typeof args ===
            "object" &&
        !Array.isArray(args)
            ? args
            : {}
    )}`;
}

function explicitGovernedHistoryKeys(
    missionState = null
) {
    const entries = [
        ...(
            Array.isArray(
                missionState
                    ?.completedTasks
            )
                ? missionState
                    .completedTasks
                : []
        ),
        ...(
            Array.isArray(
                missionState
                    ?.blockedTasks
            )
                ? missionState
                    .blockedTasks
                : []
        )
    ];

    return new Set(
        entries.map(item =>
            explicitGovernedCallKey(
                item?.name,
                item?.args
            )
        )
    );
}

function extractExplicitGovernedToolPlan(
    input = "",
    catalog = [],
    missionState = null
) {
    const source =
        String(
            input ||
            ""
        );

    const start =
        source.indexOf(
            EXPLICIT_TOOL_PLAN_START
        );

    if (start < 0) {
        return null;
    }

    if (
        source.indexOf(
            EXPLICIT_TOOL_PLAN_START,
            start +
            EXPLICIT_TOOL_PLAN_START
                .length
        ) >= 0
    ) {
        return null;
    }

    const payloadStart =
        start +
        EXPLICIT_TOOL_PLAN_START
            .length;

    const end =
        source.indexOf(
            EXPLICIT_TOOL_PLAN_END,
            payloadStart
        );

    if (end < payloadStart) {
        return null;
    }

    if (
        source.indexOf(
            EXPLICIT_TOOL_PLAN_END,
            end +
            EXPLICIT_TOOL_PLAN_END
                .length
        ) >= 0
    ) {
        return null;
    }

    let envelope;

    try {
        envelope =
            JSON.parse(
                source
                    .slice(
                        payloadStart,
                        end
                    )
                    .trim()
            );
    }
    catch {
        return null;
    }

    const requestedCalls =
        Array.isArray(
            envelope
                ?.toolCalls
        )
            ? envelope
                .toolCalls
                .slice(
                    0,
                    6
                )
            : [];

    const catalogByName =
        new Map(
            catalog.map(tool => [
                String(
                    tool?.name ||
                    ""
                ),
                tool
            ])
        );

    const validated =
        [];

    for (
        const candidate
        of requestedCalls
    ) {
        const name =
            String(
                candidate?.name ||
                ""
            ).trim();

        const tool =
            catalogByName.get(
                name
            );

        if (!tool) {
            continue;
        }

        const isTerminalCertification =
            name ===
                "system.certify" &&
            candidate
                ?.terminal ===
                true;

        const isGovernedArtifact =
            tool
                ?.userArtifact ===
                true &&
            tool
                ?.requiresApproval !==
                true &&
            !name.startsWith(
                "repo."
            ) &&
            !name.startsWith(
                "codex."
            );

        if (
            !isTerminalCertification &&
            !isGovernedArtifact
        ) {
            continue;
        }

        const rawArgs =
            candidate?.args &&
            typeof candidate.args ===
                "object" &&
            !Array.isArray(
                candidate.args
            )
                ? candidate.args
                : {};

        const args =
            filterSemanticArguments(
                rawArgs,
                tool.inputSchema
            );

        if (
            Object.keys(
                args
            ).length === 0
        ) {
            continue;
        }

        validated.push({
            name,
            args,
            reason:
                "EXPLICIT_GOVERNED_TOOL_ENVELOPE",
            terminal:
                isTerminalCertification
        });
    }

    const artifactCalls =
        validated.filter(call =>
            call.terminal !==
            true
        );

    if (
        artifactCalls.length ===
        0
    ) {
        return null;
    }

    const phase =
        String(
            missionState
                ?.phase ||
            ""
        );

    const history =
        explicitGovernedHistoryKeys(
            missionState
        );

    if (
        phase ===
        "COMPLETION_AUDIT"
    ) {
        const certification =
            validated.find(call =>
                call.terminal ===
                    true &&
                !history.has(
                    explicitGovernedCallKey(
                        call.name,
                        call.args
                    )
                )
            ) ||
            null;

        if (certification) {
            return {
                ok:
                    true,
                status:
                    "EXPLICIT_TOOL_PLAN_READY",
                provider:
                    "local-explicit-envelope",
                model:
                    null,
                planKind:
                    "EXPLICIT_COMPLETION_AUDIT",
                missionComplete:
                    false,
                toolCalls: [
                    certification
                ]
            };
        }

        return {
            ok:
                true,
            status:
                "EXPLICIT_TOOL_PLAN_READY",
            provider:
                "local-explicit-envelope",
            model:
                null,
            planKind:
                "EXPLICIT_COMPLETION_AUDIT",
            missionComplete:
                true,
            toolCalls:
                [],
            completionAssessment: {
                explicitEnvelope:
                    true,
                terminalCertificationAccounted:
                    validated.some(call =>
                        call.terminal ===
                        true
                    )
            }
        };
    }

    const outstandingArtifacts =
        artifactCalls.filter(call =>
            !history.has(
                explicitGovernedCallKey(
                    call.name,
                    call.args
                )
            )
        );

    return {
        ok:
            true,
        status:
            "EXPLICIT_TOOL_PLAN_READY",
        provider:
            "local-explicit-envelope",
        model:
            null,
        planKind:
            phase ===
                "MISSION_CONTRACT"
                ? "MISSION_CONTRACT_EXPLICIT"
                : "EXPLICIT_GOVERNED_TOOL_PLAN",
        missionComplete:
            false,
        toolCalls:
            outstandingArtifacts
    };
}


const ATTACHMENT_MANIFEST_MARKER =
    "Archivos adjuntos reales entregados por el usuario:";

function normalizeRoutingText(
    value = ""
) {
    return String(
        value ||
        ""
    )
        .normalize(
            "NFD"
        )
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toLowerCase()
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}

function instructionBeforeAttachmentManifest(
    input = ""
) {
    const source =
        String(
            input ||
            ""
        );

    const markerIndex =
        source.lastIndexOf(
            ATTACHMENT_MANIFEST_MARKER
        );

    const instruction =
        markerIndex >=
            0
            ? source.slice(
                0,
                markerIndex
            )
            : source;

    return instruction
        .replace(
            /\nExpediente soberano:[^\n]*/gi,
            ""
        )
        .trim();
}

function extractGroundedAttachments(
    input = ""
) {
    const source =
        String(
            input ||
            ""
        );

    const markerIndex =
        source.lastIndexOf(
            ATTACHMENT_MANIFEST_MARKER
        );

    if (markerIndex < 0) {
        return [];
    }

    const payload =
        source
            .slice(
                markerIndex +
                ATTACHMENT_MANIFEST_MARKER
                    .length
            )
            .trim();

    let manifest;

    try {
        manifest =
            JSON.parse(
                payload
            );
    }
    catch {
        return [];
    }

    return (
        Array.isArray(
            manifest
        )
            ? manifest
            : []
    )
        .filter(item =>
            item &&
            typeof item ===
                "object" &&
            typeof item.artifact ===
                "string" &&
            item.artifact.startsWith(
                ".jarvis-artifacts/"
            )
        )
        .slice(
            0,
            30
        )
        .map(item => ({
            name:
                String(
                    item.name ||
                    ""
                ),
            mimeType:
                String(
                    item.mimeType ||
                    ""
                )
                    .trim()
                    .toLowerCase(),
            artifact:
                String(
                    item.artifact ||
                    ""
                ),
            sha256:
                String(
                    item.sha256 ||
                    ""
                )
        }));
}

function selectGroundedImageAttachment(
    attachments = [],
    instruction = ""
) {
    const images =
        attachments.filter(item =>
            item.mimeType.startsWith(
                "image/"
            )
        );

    if (images.length === 1) {
        return images[0];
    }

    if (images.length === 0) {
        return null;
    }

    const normalizedInstruction =
        normalizeRoutingText(
            instruction
        );

    const mentioned =
        images.filter(item => {
            const normalizedName =
                normalizeRoutingText(
                    item.name
                );

            const stem =
                normalizedName.replace(
                    /\.[a-z0-9]+$/,
                    ""
                );

            return (
                (
                    normalizedName &&
                    normalizedInstruction.includes(
                        normalizedName
                    )
                ) ||
                (
                    stem.length >= 5 &&
                    normalizedInstruction.includes(
                        stem
                    )
                )
            );
        });

    return mentioned.length === 1
        ? mentioned[0]
        : null;
}

function requestsGroundedVisualReference(
    instruction = "",
    candidates = []
) {
    const text =
        normalizeRoutingText(
            instructionBeforeAttachmentManifest(
                instruction
            )
        );

    const negativeSignals = [
        "sin usar mi foto",
        "sin usar la foto",
        "sin usar esta foto",
        "sin usar mi imagen",
        "no uses mi foto",
        "no uses la foto",
        "no uses esta imagen",
        "no tomar la foto como referencia",
        "no tomes la foto como referencia",
        "persona ficticia",
        "rostro distinto",
        "sin mi cara",
        "independiente de la foto"
    ];

    if (
        negativeSignals.some(signal =>
            text.includes(
                signal
            )
        )
    ) {
        return false;
    }

    if (
        candidates.some(candidate =>
            candidate?.name ===
            "image.edit"
        )
    ) {
        return true;
    }

    const referenceSignals = [
        "mi foto",
        "mi imagen",
        "foto mia",
        "imagen mia",
        "con mi cara",
        "con mi rostro",
        "mis rasgos",
        "mi identidad",
        "misma persona",
        "hazme ",
        "creame ",
        "generame ",
        "ponme ",
        "yo en ",
        "a mi en ",
        "esta foto",
        "esta imagen",
        "esa foto",
        "esa imagen",
        "foto adjunta",
        "imagen adjunta",
        "foto que subi",
        "imagen que subi",
        "foto que envie",
        "imagen que envie",
        "usa mi foto",
        "usa esta foto",
        "usa esta imagen",
        "usando mi foto",
        "usando esta foto",
        "usando esta imagen",
        "a partir de mi foto",
        "a partir de esta foto",
        "preserva mi identidad",
        "conserva mi identidad",
        "conserva la cara",
        "conserva el rostro",
        "use my photo",
        "using my photo",
        "same person",
        "preserve my identity",
        "keep my face"
    ];

    if (
        referenceSignals.some(signal =>
            text.includes(
                signal
            )
        )
    ) {
        return true;
    }

    const hasGeneration =
        candidates.some(candidate =>
            candidate?.name ===
            "image.generate"
        );

    const hasMediaAnalysis =
        candidates.some(candidate =>
            candidate?.name ===
            "media.analyze"
        );

    const hasReferenceNoun =
        /\b(mi|mio|mia|me|yo|esta|este|esa|ese|adjunta|adjunto|subi|envie)\b/
            .exec(
                text
            );

    const hasPortraitObjective =
        /\b(retrato|persona|hombre|mujer|rostro|cara|identidad|vestuario|fondo|escenario|playa)\b/
            .exec(
                text
            );

    return (
        hasGeneration &&
        hasMediaAnalysis &&
        hasReferenceNoun &&
        hasPortraitObjective
    );
}

function requestsAttachmentAnalysis(
    instruction = ""
) {
    const text =
        normalizeRoutingText(
            instructionBeforeAttachmentManifest(
                instruction
            )
        );

    const signals = [
        "analiza",
        "analice",
        "describe",
        "describeme",
        "compara",
        "identifica",
        "extrae",
        "lee la imagen",
        "lee la foto",
        "revisa la imagen",
        "revisa la foto",
        "que ves",
        "dime que hay",
        "analyze",
        "describe",
        "compare",
        "identify"
    ];

    return signals.some(signal =>
        text.includes(
            signal
        )
    );
}


function candidateArgumentObject(
    candidate = {}
) {
    const value =
        candidate?.args ||
        candidate?.arguments;

    return (
        value &&
        typeof value ===
            "object" &&
        !Array.isArray(
            value
        )
    )
        ? {
            ...value
        }
        : {};
}

function imageVariantIdentity(
    candidate = {}
) {
    const args =
        candidateArgumentObject(
            candidate
        );

    const declared =
        String(
            args.variantId ||
            ""
        )
            .trim()
            .slice(
                0,
                120
            );

    return declared ||
        "PRIMARY";
}

function attachmentDateScore(
    value = ""
) {
    const source =
        String(
            value ||
            ""
        );

    let best =
        0;

    for (
        let index = 0;
        index <= source.length - 8;
        index += 1
    ) {
        const candidate =
            source.slice(
                index,
                index + 8
            );

        let numeric =
            true;

        for (
            const character
            of candidate
        ) {
            const code =
                character.charCodeAt(
                    0
                );

            if (
                code < 48 ||
                code > 57
            ) {
                numeric =
                    false;
                break;
            }
        }

        if (!numeric) {
            continue;
        }

        const year =
            Number(
                candidate.slice(
                    0,
                    4
                )
            );

        const month =
            Number(
                candidate.slice(
                    4,
                    6
                )
            );

        const day =
            Number(
                candidate.slice(
                    6,
                    8
                )
            );

        if (
            year < 1900 ||
            year > 2199 ||
            month < 1 ||
            month > 12 ||
            day < 1 ||
            day > 31
        ) {
            continue;
        }

        best =
            Math.max(
                best,
                Number(candidate)
            );
    }

    return best;
}

function selectPreferredIdentityAttachment(
    images = [],
    fallback = null
) {
    const candidates =
        Array.isArray(
            images
        )
            ? images
            : [];

    if (candidates.length === 0) {
        return null;
    }

    const dated =
        candidates
            .map((item, index) => ({
                item,
                index,
                score:
                    attachmentDateScore(
                        item?.name ||
                        item?.artifact ||
                        ""
                    )
            }))
            .sort((left, right) =>
                right.score -
                    left.score ||
                right.index -
                    left.index
            );

    if (
        dated[0]
            ?.score >
        0
    ) {
        return dated[0]
            .item;
    }

    if (
        fallback &&
        candidates.some(item =>
            item?.artifact ===
            fallback?.artifact
        )
    ) {
        return fallback;
    }

    return candidates[
        candidates.length -
        1
    ];
}

function groundedReferenceTransformations(
    value = []
) {
    const transformations =
        Array.isArray(
            value
        )
            ? value
                .map(item =>
                    String(
                        item ||
                        ""
                    ).trim()
                )
                .filter(Boolean)
            : [];

    const identityGuard =
        "Conservar la identidad, estructura facial, tono de piel, cabello, proporciones y rasgos distintivos del sujeto u objeto de la imagen fuente.";

    const changeGuard =
        "Modificar ?nicamente el escenario, vestuario, iluminaci?n, encuadre y estilo solicitados; no sustituir el sujeto por una persona u objeto gen?rico.";

    const normalized =
        transformations.map(
            normalizeRoutingText
        );

    if (
        !normalized.some(item =>
            item.includes(
                "identidad"
            ) ||
            item.includes(
                "rasgos"
            )
        )
    ) {
        transformations.push(
            identityGuard
        );
    }

    if (
        !normalized.some(item =>
            item.includes(
                "no sustituir"
            ) ||
            item.includes(
                "sujeto generico"
            )
        )
    ) {
        transformations.push(
            changeGuard
        );
    }

    return [
        ...new Set(
            transformations
        )
    ].slice(
        0,
        20
    );
}


function normalizeGroundedImageReferenceCandidates(
    candidates = [],
    catalog = [],
    context = {}
) {
    const sourceCandidates =
        Array.isArray(
            candidates
        )
            ? candidates
            : [];

    const instruction =
        String(
            context
                ?.originalInstruction ||
            ""
        );

    const attachments =
        extractGroundedAttachments(
            instruction
        );

    const imageAttachments =
        attachments.filter(item =>
            item.mimeType.startsWith(
                "image/"
            )
        );

    if (
        imageAttachments.length ===
        0
    ) {
        return sourceCandidates;
    }

    const userInstruction =
        instructionBeforeAttachmentManifest(
            instruction
        );

    const mentionedSource =
        selectGroundedImageAttachment(
            imageAttachments,
            userInstruction
        );

    const preferredSource =
        mentionedSource ||
        selectPreferredIdentityAttachment(
            imageAttachments
        );

    if (!preferredSource) {
        return sourceCandidates;
    }

    const imageEditAvailable =
        catalog.some(tool =>
            tool?.name ===
            "image.edit"
        );

    const referenceRequested =
        requestsGroundedVisualReference(
            instruction,
            sourceCandidates
        );

    const analysisRequested =
        requestsAttachmentAnalysis(
            instruction
        );

    const normalized =
        [];

    const groundedKeys =
        new Set();

    for (
        const candidate
        of sourceCandidates
    ) {
        if (!candidate?.name) {
            continue;
        }

        if (
            candidate.name ===
                "media.analyze" &&
            referenceRequested &&
            !analysisRequested
        ) {
            continue;
        }

        const isImageEdit =
            candidate.name ===
            "image.edit";

        const shouldConvertGeneration =
            candidate.name ===
                "image.generate" &&
            referenceRequested &&
            imageEditAvailable;

        if (
            !isImageEdit &&
            !shouldConvertGeneration
        ) {
            normalized.push(
                candidate
            );

            continue;
        }

        const baseArgs =
            candidateArgumentObject(
                candidate
            );

        const declaredPrimary =
            imageAttachments.find(item =>
                item.artifact ===
                String(
                    baseArgs.sourceOutput ||
                    ""
                )
            ) ||
            null;

        const primarySource =
            mentionedSource ||
            selectPreferredIdentityAttachment(
                imageAttachments,
                declaredPrimary ||
                preferredSource
            );

        if (!primarySource) {
            continue;
        }

        const declaredReferences =
            (
                Array.isArray(
                    baseArgs
                        .referenceOutputs
                )
                    ? baseArgs
                        .referenceOutputs
                    : []
            )
                .map(value =>
                    String(
                        value ||
                        ""
                    )
                )
                .map(output =>
                    imageAttachments.find(item =>
                        item.artifact ===
                        output
                    )
                )
                .filter(Boolean);

        const includeEveryReference =
            !mentionedSource &&
            imageAttachments.length >
                1;

        const referenceOutputs =
            [
                primarySource,
                ...declaredReferences,
                ...(
                    includeEveryReference
                        ? imageAttachments
                        : []
                )
            ]
                .map(item =>
                    item.artifact
                )
                .filter(
                    (
                        output,
                        index,
                        values
                    ) =>
                        Boolean(output) &&
                        values.indexOf(
                            output
                        ) ===
                        index
                )
                .slice(
                    0,
                    4
                );

        const variantId =
            imageVariantIdentity(
                candidate
            );

        const groundedKey =
            primarySource.artifact +
            ":" +
            variantId;

        if (
            groundedKeys.has(
                groundedKey
            )
        ) {
            continue;
        }

        groundedKeys.add(
            groundedKey
        );

        const prompt =
            String(
                baseArgs.prompt ||
                userInstruction ||
                "Edita la imagen fuente respetando la identidad visual."
            )
                .trim()
                .slice(
                    0,
                    3000
                );

        normalized.push({
            ...candidate,
            name:
                "image.edit",
            args: {
                ...baseArgs,
                sourceOutput:
                    primarySource
                        .artifact,
                referenceOutputs,
                variantId,
                identityMode:
                    "strict",
                ageMode:
                    "preserve",
                prompt,
                transformations:
                    groundedReferenceTransformations(
                        baseArgs
                            .transformations
                    ),
                preserveLogos:
                    baseArgs
                        .preserveLogos !==
                    false,
                preserveApprovedText:
                    baseArgs
                        .preserveApprovedText ===
                    true
            },
            reason:
                "MULTI_REFERENCE_IDENTITY_ROUTE"
        });
    }

    return normalized;
}

async function fetchBrowserPlanText(
    url = "",
    timeoutMs =
        BROWSER_PLAN_ATTEMPT_TIMEOUT_MS
) {
    const controller =
        new AbortController();

    let timedOut =
        false;

    const timer =
        setTimeout(
            () => {
                timedOut =
                    true;

                controller.abort();
            },
            timeoutMs
        );

    try {
        const response =
            await fetch(
                url,
                {
                    signal:
                        controller.signal
                }
            );

        const responseText =
            await response.text();

        return {
            response,
            responseText
        };
    }
    catch(error) {
        if (
            timedOut ||
            controller.signal.aborted
        ) {
            throw new Error(
                `BROWSER_PLAN_ATTEMPT_TIMEOUT_${timeoutMs}`
            );
        }

        throw error;
    }
    finally {
        clearTimeout(
            timer
        );
    }
}

async function callBrowserMissionContract(
    input = "",
    catalog = [],
    missionState = null
) {
    if (typeof fetch !== "function") throw new Error("CLIENT_MISSION_CONTRACT_FETCH_REQUIRED");
    const instruction = String(input || "");
    const boundedInstruction = instruction.length <= 12000
        ? instruction
        : `${instruction.slice(0, 8000)}\n[PARTE_MEDIA_PERSISTIDA]\n${instruction.slice(-3500)}`;
    const initialToolNames =
        Array.isArray(
            missionState
                ?.existingInitialTools
        )
            ? missionState
                .existingInitialTools
                .map(String)
                .filter(Boolean)
                .slice(0, 20)
            : [];
    const prompt = [
        "Eres el planificador semantico de Jarvis V7.",
        "Devuelve solamente JSON valido.",
        "CONTRATO COMPLETO: enumera en toolCalls todas las herramientas read-only y userArtifact necesarias para TODOS los entregables. Para crear una landing usa page.plan, page.compose y page.create; para crear un documento usa document.compose y document.create; para crear una hoja estructurada usa spreadsheet.compose y document.create. Para EDITAR un PDF existente usa document.pdf.edit; para EDITAR un XLSX existente usa document.xlsx.edit; para EDITAR una imagen existente usa image.edit. Nunca sustituyas una edicion solicitada por document.create, spreadsheet.compose o image.generate. Si una imagen adjunta representa a la persona, producto u objeto que debe aparecer en el resultado, usa image.edit con sourceOutput igual al artifact real del manifiesto; media.analyze no transmite identidad visual ni sustituye los bytes de la fuente. Las ediciones crean una copia nueva y deben preservar el original. system.certify es terminal: no lo incluyas en el contrato inicial; seleccionalo solamente durante COMPLETION_AUDIT cuando los demas objetivos est?n completados o bloqueados. Para image.edit genera una sola salida por defecto. La cantidad de fotos adjuntas o referencias nunca significa cantidad de variantes. Si el usuario pide varias salidas, asigna un variantId distinto y explicito a cada salida. Cuando haya varias fotos de identidad, usa la imagen mas reciente y limpia como sourceOutput y copia las referencias pertinentes en referenceOutputs. Para cada artefacto usa exactamente una composicion y una creacion salvo que el usuario pida variantes. Conserva el orden y usa missionComplete=false.",
        "Las HERRAMIENTAS_INICIALES son un borrador semantico ya seleccionado para la misma instruccion. Conserva sus entregables y agrega solamente una herramienta que cubra un objetivo independiente pedido de forma explicita y no cubierto por ese borrador. No agregues diagnostico, supervision, forense, repositorio, navegador, conectores, investigacion ni otros artefactos solo porque existan en el catalogo.",
        "No colapses sujetos u objetivos independientes. Repite el mismo nombre de herramienta cuando necesite argumentos distintos para cubrirlos por separado.",
        "agent.delegate no es una optimizacion automatica. Incluyela solamente si la instruccion original pide explicitamente delegar, usar agentes o ejecutar en paralelo, y copia esa frase literal en delegationDirective. En cualquier otra mision conserva las herramientas directas.",
        "repo.architectReview es autocontenida: construye su grafo y ranking y ejecuta los 11 controles sobre el plan recibido. Para una revision de plan no agregues herramientas repo adyacentes salvo que la instruccion pida por separado inspeccionar fuentes adicionales.",
        "Para web.research usa researchGoal=RESEARCH_1, RESEARCH_2, etc. segun el orden inmutable de objetivos de investigacion en la instruccion. Reutiliza la misma identidad al auditar el mismo objetivo y no dupliques llamadas para simples reformulaciones.",
        `HERRAMIENTAS_INICIALES=${initialToolNames.join(",")}`,
        `CATALOGO=${catalog.map(tool => tool.name).join(",")}`,
        `INSTRUCCION=${boundedInstruction}`
    ].join("\n");
    let lastError = null;
    let auditedPlan = null;

    for (const seed of [84, 85, 86]) {
            try {
                const attemptPrompt = auditedPlan
                    ? [
                        prompt,
                        `BORRADOR_DE_CONTRATO=${JSON.stringify(auditedPlan).slice(0, 16000)}`,
                        "AUDITORIA SEMANTICA DE COBERTURA: descompone la instruccion en todos sus sujetos, archivos, entidades, preguntas y entregables independientes. Devuelve solamente toolCalls read-only o userArtifact faltantes. No elimines ni sustituyas el borrador. Si ya cubre todo devuelve toolCalls=[] y missionComplete=false."
                    ].join("\n")
                    : prompt;
                const {
                    response,
                    responseText
                } = await fetchBrowserPlanText(
                    `https://text.pollinations.ai/${encodeURIComponent(attemptPrompt)}?model=openai-fast&seed=${seed}&json=true`,
                    BROWSER_MISSION_ATTEMPT_TIMEOUT_MS
                );

                if (!response.ok) {
                    throw new Error(
                        `CLIENT_MISSION_CONTRACT_HTTP_${response.status}`
                    );
                }

                const plan =
                    extractJsonObject(
                        responseText
                    );
                if (!Array.isArray(plan?.toolCalls)) {
                    throw new Error("CLIENT_MISSION_CONTRACT_EMPTY");
                }
                if (!auditedPlan) {
                    if (plan.toolCalls.length === 0) {
                        throw new Error("CLIENT_MISSION_CONTRACT_EMPTY");
                    }
                    auditedPlan = {
                        ...plan,
                        toolCalls:
                            trustedPlanCalls(
                                {
                                    ...plan,
                                    planKind:
                                        "MISSION_CONTRACT"
                                },
                                catalog,
                                {
                                    originalInstruction:
                                        instruction
                                }
                            )
                    };
                    continue;
                }
                const coverageCalls =
                    trustedPlanCalls(
                        {
                            ...plan,
                            planKind:
                                "MISSION_CONTRACT_AUDIT"
                        },
                        catalog,
                        {
                            originalInstruction:
                                instruction
                        }
                    );
                const merged = mergeJarvisToolCalls(
                    auditedPlan.toolCalls || [],
                    coverageCalls
                );
                return {
                    ...auditedPlan,
                    toolCalls: merged,
                    completionAssessment: {
                        draft: auditedPlan.completionAssessment || null,
                        coverageAudit: plan.completionAssessment || null
                    },
                    missionComplete: false,
                    ok: true,
                    status: "SEMANTIC_PLAN_READY",
                    provider: "pollinations-browser-json",
                    model: "openai-fast",
                    planKind: "MISSION_CONTRACT_AUDITED"
                };
            } catch (error) {
                lastError = error;
            }
        }

    if (auditedPlan) {
        return {
            ...auditedPlan,
            missionComplete: false,
            ok: true,
            status: "SEMANTIC_PLAN_READY",
            provider: "pollinations-browser-json",
            model: "openai-fast",
            planKind: "MISSION_CONTRACT",
            coverageWarning: lastError?.message || "CLIENT_MISSION_COVERAGE_AUDIT_UNAVAILABLE"
        };
    }
    throw lastError || new Error("CLIENT_MISSION_CONTRACT_UNAVAILABLE");
}

async function callBrowserSemanticPlan(input = "", catalog = [], missionState = null) {
    if (typeof fetch !== "function") throw new Error("CLIENT_SEMANTIC_PLAN_FETCH_REQUIRED");
    const instruction = String(input || "");
    const boundedInstruction = instruction.length <= 12000
        ? instruction
        : `${instruction.slice(0, 8000)}\n[PARTE_MEDIA_PERSISTIDA]\n${instruction.slice(-3500)}`;
    const prompt = [
        "Eres el planificador semantico de herramientas de Jarvis V7.",
        "Interpreta significado, typos, negaciones y ordenes mixtas. Selecciona exclusivamente nombres exactos del catalogo.",
        "No autorices escrituras de repositorio, publicacion ni despliegue. Las herramientas userArtifact pueden crear entregables locales y editar copias de artefactos existentes cuando el usuario lo pide explicitamente; deben conservar el original y no equivalen a editar codigo, publicar o desplegar. Para editar PDF, XLSX o imagen usa respectivamente document.pdf.edit, document.xlsx.edit o image.edit y nunca los sustituyas por herramientas de creacion. Si una persona, producto u objeto debe conservarse desde una imagen adjunta, selecciona image.edit y copia el artifact real del manifiesto en sourceOutput; no uses image.generate ni una descripcion de media.analyze como reemplazo de la fuente visual. Conserva todas las intenciones independientes y usa herramientas especializadas para entregables operativos.",
        "agent.delegate no es una optimizacion automatica. Seleccionala solamente si la instruccion original pide explicitamente delegar, usar agentes o ejecutar en paralelo. En ese caso copia literalmente esa frase en delegationDirective. Si solo hay varias herramientas directas, devuelve esas herramientas sin agent.delegate.",
        "repo.architectReview es autocontenida: ya construye el grafo y ranking y ejecuta los 11 controles sobre un plan recibido. Cuando se pida esa revision, no agregues repo.search, repo.read, repo.diagnose o repo.impact salvo que la instruccion pida de forma independiente inspeccionar fuentes adicionales.",
        "Si varios objetivos requieren la misma herramienta con argumentos distintos, devuelve una llamada separada para cada uno. En image.edit, varias fotos de referencia siguen siendo un solo objetivo y una sola salida; usa referenceOutputs. Solo devuelve varias llamadas de image.edit cuando el usuario pida varias imagenes finales y asigna variantId distinto a cada una.",
        "Si piden referencias, usos o pruebas de un archivo concreto, usa repo.search con la ruta exacta o basename como query, no con una pregunta completa.",
        "Si una investigacion limita fuentes a un dominio, copia el dominio exacto en allowedDomain de web.research.",
        "En web.research, query debe contener solo el objetivo concreto y los terminos distintivos de la investigacion; no copies toda la orden mixta, archivos ni otros entregables. Conserva conceptos tecnicos importantes como custom claims, roles, APIs o normas.",
        "Para web.research usa researchGoal=RESEARCH_1, RESEARCH_2, etc. segun el orden de objetivos independientes en la instruccion y reutiliza exactamente esa identidad para el mismo objetivo.",
        "Si se piden datos oficiales, usa allowedDomain con el dominio oficial de la autoridad identificada y no presentes fuentes secundarias como oficiales.",
        "Si una investigacion pide hechos sobre una entidad nombrada sin dominio, copia el nombre exacto en exactEntity de web.research.",
        missionState?.phase === "COMPLETION_AUDIT"
            ? "AUDITORIA DE CIERRE: compara cada entregable con la evidencia. Si todo esta satisfecho devuelve toolCalls=[] y missionComplete=true. Si falta algo devuelve exactamente una herramienta pertinente con argumentos completos y missionComplete=false. No explores capacidades no solicitadas. Si repo.search entrego sourceDefinitions o definitionFiles, prioriza esas rutas ejecutables sobre archivos que solo mencionan el simbolo y permite repetir lectura o diagnostico cuando el archivo sea distinto."
            : "Devuelve solamente JSON valido con toolCalls, missionComplete=false y explanation.",
        `CATALOGO=${catalog.map(tool => tool.name).join(",")}`,
        missionState ? `ESTADO_DE_MISION=${JSON.stringify(missionState).slice(0, 12000)}` : "",
        `INSTRUCCION=${boundedInstruction}`
    ].join("\n");
    let lastError = null;

    for (const seed of [42, 43, 44]) {
            try {
                const {
                    response,
                    responseText
                } = await fetchBrowserPlanText(
                    `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai-fast&seed=${seed}&json=true`,
                    BROWSER_PLAN_ATTEMPT_TIMEOUT_MS
                );

                if (!response.ok) {
                    throw new Error(
                        `CLIENT_SEMANTIC_PLAN_HTTP_${response.status}`
                    );
                }

                const plan =
                    extractJsonObject(
                        responseText
                    );
                if (
                    !Array.isArray(plan?.toolCalls) ||
                    (
                        plan.toolCalls.length === 0 &&
                        !(
                            missionState?.phase === "COMPLETION_AUDIT" &&
                            plan?.missionComplete === true
                        )
                    )
                ) {
                    throw new Error("CLIENT_SEMANTIC_PLAN_EMPTY");
                }
                return {
                    ...plan,
                    ok: true,
                    status: "SEMANTIC_PLAN_READY",
                    provider: "pollinations-browser-json",
                    model: "openai-fast"
                };
            } catch (error) {
                lastError = error;
            }
        }

    throw lastError ||
        new Error(
            "CLIENT_SEMANTIC_PLAN_UNAVAILABLE"
        );
}

function runtimeCatalog(context = {}) {
    const supplied = Array.isArray(context.toolCatalog)
        ? context.toolCatalog
        : null;
    const registered = globalThis?.JarvisToolRuntime?.list?.();
    const source = supplied || (Array.isArray(registered) ? registered : []);

    return source
        .filter(tool => tool?.name && typeof tool.name === "string")
        .slice(0, 80)
        .map(tool => ({
            name: tool.name,
            description: String(tool.description || "").slice(0, 500),
            mutates: tool.mutates === true,
            requiresApproval: tool.requiresApproval === true,
            userArtifact: tool.userArtifact === true,
            missionIsolation:
                tool.missionIsolation === "exclusive"
                    ? "exclusive"
                    : null,
            missionDedupeBy: Array.isArray(tool.missionDedupeBy)
                ? [...tool.missionDedupeBy]
                : null,
            inputSchema: tool.inputSchema && typeof tool.inputSchema === "object"
                ? tool.inputSchema
                : null
        }));
}

function missionDedupeKey(tool = {}, args = {}) {
    if (!Array.isArray(tool?.missionDedupeBy)) return "";
    return `${tool.name}:${JSON.stringify(
        tool.missionDedupeBy.map(field =>
            Object.prototype.hasOwnProperty.call(args, field)
                ? args[field]
                : null
        )
    )}`;
}

function stableResearchGoal(
    value = "",
    fallbackOrdinal = 1
) {
    const candidate =
        String(value || "")
            .trim()
            .toUpperCase();
    const prefix =
        "RESEARCH_";
    const suffix =
        candidate.startsWith(prefix)
            ? candidate.slice(
                prefix.length
            )
            : "";
    const numericSuffix =
        suffix.length > 0 &&
        [
            ...suffix
        ].every(character => {
            const code =
                character.charCodeAt(0);
            return (
                code >= 48 &&
                code <= 57
            );
        });

    return numericSuffix
        ? `${prefix}${Math.max(
            1,
            Number(suffix)
        )}`
        : `${prefix}${Math.max(
            1,
            Number(fallbackOrdinal) ||
            1
        )}`;
}

function trustedPlanCalls(plan = {}, catalog = [], context = {}) {
    const allowed = new Map(catalog.map(tool => [tool.name, tool]));
    const candidates =
        normalizeGroundedImageReferenceCandidates(
            Array.isArray(
                plan?.toolCalls
            )
                ? plan.toolCalls
                : [],
            catalog,
            context
        );
    const allowDeferred =
        String(plan?.planKind || "")
            .startsWith("MISSION_CONTRACT");
    const seen = new Set();
    const seenMissionDedupeKeys = new Set();
    const calls = [];
    let webResearchOrdinal = 0;
    const missionPhase =
        String(
            context?.missionState?.phase ||
            ""
        );

    for (const candidate of candidates.slice(0, 12)) {
        const tool = allowed.get(String(candidate?.name || ""));
        let args =
            (candidate?.args || candidate?.arguments) &&
            typeof (candidate.args || candidate.arguments) === "object" &&
            !Array.isArray(candidate.args || candidate.arguments)
                ? {
                    ...(candidate.args || candidate.arguments)
                }
                : {};
        if (!tool) continue;
        if (
            tool.name === "system.certify" &&
            missionPhase !== "COMPLETION_AUDIT"
        ) {
            continue;
        }
        if (
            tool.name ===
                "agent.delegate" &&
            !hasGroundedDelegationDirective(
                args,
                context
                    ?.originalInstruction ||
                ""
            )
        ) {
            continue;
        }
        if (
            usesRegisteredToolAsRepositoryFile(
                tool,
                args,
                allowed
            )
        ) {
            continue;
        }
        if (
            tool.name ===
                "web.research" &&
            Array.isArray(
                tool.missionDedupeBy
            ) &&
            tool.missionDedupeBy.includes(
                "researchGoal"
            )
        ) {
            webResearchOrdinal += 1;
            args = {
                ...args,
                researchGoal:
                    stableResearchGoal(
                        args.researchGoal,
                        webResearchOrdinal
                    )
            };
        }
        const signature =
            `${tool.name}:${JSON.stringify(args)}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        const dedupeKey =
            missionDedupeKey(
                tool,
                args
            );
        if (
            dedupeKey &&
            seenMissionDedupeKeys.has(dedupeKey)
        ) {
            continue;
        }
        if (dedupeKey) {
            seenMissionDedupeKeys.add(dedupeKey);
        }

        const argumentsComplete =
            hasRequiredToolArguments(
                tool,
                args
            );
        if (
            !argumentsComplete &&
            !allowDeferred
        ) {
            continue;
        }

        calls.push({
            name: tool.name,
            args,
            reason: String(candidate?.reason || "MODEL_SEMANTIC_TOOL_SELECTION").slice(0, 240),
            mutates: tool.mutates,
            approved: tool.mutates === true && context.approved === true,
            ...(dedupeKey ? { missionDedupeKey: dedupeKey } : {}),
            ...(
                argumentsComplete
                    ? {}
                    : {
                        deferred:
                            true
                    }
            )
        });
    }

    return enforceMissionIsolation(
        calls,
        allowed
    );
}

function enforceMissionIsolation(
    calls = [],
    catalogByName =
        new Map()
) {
    const isolated =
        calls.filter(call =>
            catalogByName
                .get(call?.name)
                ?.missionIsolation ===
            "exclusive"
        );

    return isolated.length > 0
        ? isolated.slice(0, 1)
        : calls;
}

function usesRegisteredToolAsRepositoryFile(
    tool = {},
    args = {},
    catalogByName =
        new Map()
) {
    if (
        !String(
            tool?.name ||
            ""
        ).startsWith(
            "repo."
        )
    ) {
        return false;
    }
    const target =
        String(
            args?.file ||
            args?.path ||
            ""
        ).trim();
    return (
        target.length >
            0 &&
        catalogByName.has(
            target
        )
    );
}

function hasGroundedDelegationDirective(
    args = {},
    instruction = ""
) {
    const directive =
        String(
            args
                ?.delegationDirective ||
            ""
        ).trim();
    const source =
        String(
            instruction ||
            ""
        );
    return (
        directive.length >
            0 &&
        source.includes(
            directive
        )
    );
}

function hasRequiredToolArguments(tool = {}, args = {}) {
    if (!args || typeof args !== "object" || Array.isArray(args)) return false;
    const required = Array.isArray(tool?.inputSchema?.required)
        ? tool.inputSchema.required
        : [];

    return required.every(name => {
        if (!Object.prototype.hasOwnProperty.call(args, name)) return false;
        const value = args[name];
        const fieldSchema =
            tool?.inputSchema
                ?.properties
                ?.[name] ||
            {};
        return schemaValueIsExecutable(
            value,
            fieldSchema
        );
    });
}

function schemaValueIsExecutable(
    value,
    schema = {}
) {
    if (value == null) {
        return false;
    }
    const type =
        String(schema?.type || "")
            .trim()
            .toLowerCase();
    if (
        type ===
            "string" ||
        (
            !type &&
            typeof value ===
                "string"
        )
    ) {
        return (
            typeof value ===
                "string" &&
            value.trim().length >
                0
        );
    }
    if (
        type ===
            "array" ||
        (
            !type &&
            Array.isArray(value)
        )
    ) {
        if (!Array.isArray(value)) {
            return false;
        }
        const minimum =
            Math.max(
                1,
                Number(
                    schema?.minItems
                ) ||
                0
            );
        if (
            value.length <
            minimum
        ) {
            return false;
        }
        return value.every(item =>
            schemaValueIsExecutable(
                item,
                schema?.items ||
                {}
            )
        );
    }
    if (
        type ===
            "object" ||
        (
            !type &&
            typeof value ===
                "object" &&
            !Array.isArray(value)
        )
    ) {
        if (
            typeof value !==
                "object" ||
            Array.isArray(value) ||
            Object.keys(value)
                .length ===
                0
        ) {
            return false;
        }
        const required =
            Array.isArray(
                schema?.required
            )
                ? schema.required
                : [];
        return required.every(name =>
            Object.prototype
                .hasOwnProperty
                .call(
                    value,
                    name
                ) &&
            schemaValueIsExecutable(
                value[name],
                schema
                    ?.properties
                    ?.[name] ||
                {}
            )
        );
    }
    if (
        type ===
            "number" ||
        type ===
            "integer"
    ) {
        return Number.isFinite(
            Number(value)
        );
    }
    if (type === "boolean") {
        return (
            typeof value ===
            "boolean"
        );
    }
    return true;
}

function attachPlanMetadata(calls = [], plan = {}) {
    Object.defineProperties(calls, {
        missionComplete: {
            value: plan?.missionComplete === true,
            enumerable: false
        },
        completionAssessment: {
            value: plan?.completionAssessment || null,
            enumerable: false
        }
    });
    return calls;
}

async function callSemanticPlanner(input = "", catalog = [], missionState = null) {
    const user = globalThis?.auth?.currentUser || globalThis?.window?.auth?.currentUser || null;
    if (!user) {
        throw new Error("SEMANTIC_PLANNER_AUTH_REQUIRED");
    }

    const token =
        await user.getIdToken();

    const controller =
        new AbortController();

    const timeoutMs =
        missionState?.phase ===
            "MISSION_CONTRACT"
            ? CLOUD_MISSION_CONTRACT_TIMEOUT_MS
            : 110000;

    const timer =
        setTimeout(
            () =>
                controller.abort(),
            timeoutMs
        );

    try {
        const response = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ data: { input, catalog, missionState } }),
            signal: controller.signal
        });
        const text = await response.text();
        let payload;

        try {
            payload = JSON.parse(text);
        } catch {
            throw new Error(`SEMANTIC_PLANNER_INVALID_RESPONSE_${response.status}`);
        }

        const result = payload?.result || payload?.data;
        if (!response.ok || !result?.ok) {
            throw new Error(
                payload?.error?.message ||
                result?.error ||
                `SEMANTIC_PLANNER_HTTP_${response.status}`
            );
        }

        return result;
    }
    catch(error) {
        if (
            controller.signal.aborted
        ) {
            throw new Error(
                `SEMANTIC_PLANNER_TIMEOUT_${timeoutMs}`
            );
        }

        throw error;
    }
    finally {
        clearTimeout(
            timer
        );
    }
}

function planCacheKey(input = "", catalog = [], missionState = null) {
    return JSON.stringify({
        input,
        missionState,
        tools: catalog.map(tool => ({
            name: tool.name,
            mutates: tool.mutates,
            requiresApproval: tool.requiresApproval
        }))
    });
}

async function resolveSemanticPlan(input = "", catalog = [], semanticPlanner = null, missionState = null) {
    const key = planCacheKey(input, catalog, missionState);
    const cached = planCache.get(key);

    if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
        return cached.plan;
    }

    if (pendingPlans.has(key)) {
        return pendingPlans.get(key);
    }

    const request = Promise.resolve()
        .then(() => typeof semanticPlanner === "function"
            ? semanticPlanner({ input, catalog, missionState })
            : callSemanticPlanner(input, catalog, missionState))
        .then(plan => {
            planCache.set(key, { plan, savedAt: Date.now() });
            return plan;
        })
        .finally(() => pendingPlans.delete(key));

    pendingPlans.set(key, request);
    return request;
}

function boundedEvidenceSources(value = []) {
    return (Array.isArray(value) ? value : [])
        .filter(source => source && typeof source === "object")
        .slice(0, 12)
        .map(source => ({
            title: String(source.title || "").slice(0, 180),
            url: String(source.url || "").slice(0, 700),
            snippet: String(source.snippet || source.summary || "").slice(0, 700)
        }));
}

function filterSemanticArguments(args = {}, inputSchema = null) {
    if (!args || typeof args !== "object" || Array.isArray(args)) return {};
    const properties =
        inputSchema?.type === "object" && inputSchema?.properties
            ? inputSchema.properties
            : inputSchema && typeof inputSchema === "object"
                ? inputSchema
                : null;
    if (!properties || Array.isArray(properties)) return { ...args };
    const allowed = new Set(Object.keys(properties));
    return Object.fromEntries(
        Object.entries(args).filter(([key]) => allowed.has(key))
    );
}

export async function completeJarvisPlanningArguments({
    toolName = "",
    description = "",
    inputSchema = null,
    instruction = "",
    currentArgs = {},
    validSources = [],
    semanticPlanner = null
} = {}) {
    const name = String(toolName || "").trim();
    const originalInstruction = String(instruction || "").trim();
    const sources = boundedEvidenceSources(validSources);
    if (!name || !originalInstruction) {
        throw new Error("SEMANTIC_ARGUMENT_CONTEXT_REQUIRED");
    }

    const catalog = [{
        name,
        description: [
            String(description || "").trim(),
            "Devuelve argumentos completos para un entregable read-only y específico.",
            "Usa exclusivamente la instrucción original y las fuentes verificadas incluidas.",
            "No inventes hechos, resultados, testimonios ni publicaciones."
        ].filter(Boolean).join(" ").slice(0, 500),
        mutates: false,
        requiresApproval: false,
        inputSchema
    }];
    const briefingInstruction = [
        `Prepara solamente los argumentos ejecutables para ${name}.`,
        "Completa los campos semánticos que puedan derivarse de la orden y la evidencia.",
        "Los mensajes de campaña, problemas, promesas y diferenciadores son propuestas estratégicas; no los presentes como hechos verificados.",
        "Para landing, imagen y reel entrega una especificación concreta y sustentada, sin crear archivos, generar medios, publicar ni desplegar.",
        "Si se pide un reel, la suma de la duración de escenas debe coincidir exactamente con la duración total.",
        `INSTRUCCION_ORIGINAL=${originalInstruction.slice(0, 12000)}`,
        `ARGUMENTOS_EXISTENTES=${JSON.stringify(currentArgs || {}).slice(0, 6000)}`,
        `FUENTES_VERIFICADAS=${JSON.stringify(sources).slice(0, 12000)}`,
        `ESQUEMA_DE_ARGUMENTOS=${JSON.stringify(inputSchema || {}).slice(0, 12000)}`
    ].join("\n");

    let plan;
    try {
        plan = await resolveSemanticPlan(
            briefingInstruction,
            catalog,
            semanticPlanner,
            {
                phase: "GROUNDED_ARGUMENT_COMPLETION",
                toolName: name,
                sourceCount: sources.length,
                writeAllowed: false
            }
        );
    } catch (cloudError) {
        if (typeof semanticPlanner === "function") throw cloudError;
        const fallback = await callBrowserSemanticPlan(
            briefingInstruction,
            catalog,
            {
                phase: "GROUNDED_ARGUMENT_COMPLETION",
                toolName: name,
                sourceCount: sources.length,
                writeAllowed: false
            }
        );
        plan = fallback;
    }

    const call = trustedPlanCalls(plan, catalog, {})[0] || null;
    const args = filterSemanticArguments(call?.args || {}, inputSchema);
    if (Object.keys(args).length === 0) {
        throw new Error("SEMANTIC_ARGUMENTS_REQUIRED");
    }

    return {
        ok: true,
        status: "GROUNDED_ARGUMENTS_READY",
        toolName: name,
        args,
        provider: plan?.provider || "semantic_planner",
        model: plan?.model || null,
        sourceCount: sources.length
    };
}

export function mergeJarvisToolCalls(...groups) {
    const merged = [];
    const seen = new Set();
    const seenMissionDedupeKeys =
        new Set();

    for (const call of groups.flat()) {
        if (!call?.name) continue;
        if (
            call.missionDedupeKey &&
            seenMissionDedupeKeys.has(
                call.missionDedupeKey
            )
        ) {
            continue;
        }
        const key = `${call.name}:${JSON.stringify(call.args || call.arguments || {})}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (call.missionDedupeKey) {
            seenMissionDedupeKeys.add(
                call.missionDedupeKey
            );
        }
        merged.push(call);
    }

    return merged.slice(0, 12);
}

export function isJarvisTechnicalDiagnosticRequest(planOrCalls = []) {
    const calls = Array.isArray(planOrCalls)
        ? planOrCalls
        : Array.isArray(planOrCalls?.toolCalls)
            ? planOrCalls.toolCalls
            : [];

    return calls.some(call =>
        String(call?.name || "").startsWith("repo.") &&
        call?.name !== "repo.gitStatus" &&
        call?.name !== "repo.gitDiff"
    );
}

export function isJarvisCapabilityForensicsRequest(planOrCalls = []) {
    const calls = Array.isArray(planOrCalls)
        ? planOrCalls
        : Array.isArray(planOrCalls?.toolCalls)
            ? planOrCalls.toolCalls
            : [];
    return calls.some(call => call?.name === "system.forensics");
}

export async function buildJarvisMultifunctionToolCalls(input = "", context = {}) {
    const instruction = String(input || "").trim();
    if (!instruction) return [];

    const catalog = runtimeCatalog(context);
    if (catalog.length === 0) {
        globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
            ok: false,
            status: "TOOL_CATALOG_REQUIRED",
            checkedAt: new Date().toISOString()
        };
        return [];
    }

    const explicitPlan =
        extractExplicitGovernedToolPlan(
            instruction,
            catalog,
            context.missionState ||
            null
        );

    if (explicitPlan) {
        const explicitCalls =
            trustedPlanCalls(
                explicitPlan,
                catalog,
                {
                    ...context,
                    originalInstruction:
                        instruction
                }
            );

        globalThis
            .__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
                ok:
                    true,
                status:
                    explicitPlan.status,
                provider:
                    explicitPlan.provider,
                model:
                    null,
                toolCount:
                    explicitCalls.length,
                toolNames:
                    explicitCalls.map(
                        call =>
                            call.name
                    ),
                deterministic:
                    true,
                checkedAt:
                    new Date()
                        .toISOString()
            };

        return attachPlanMetadata(
            explicitCalls,
            explicitPlan
        );
    }

    try {
        const contractPlanner = context?.missionState?.phase === "MISSION_CONTRACT" &&
            typeof context.semanticPlanner !== "function"
            ? async ({ input: contractInput, catalog: contractCatalog, missionState }) => {
                try {
                    return await callSemanticPlanner(
                        contractInput,
                        contractCatalog,
                        missionState
                    );
                } catch (cloudError) {
                    try {
                        return await callBrowserMissionContract(
                            contractInput,
                            contractCatalog,
                            missionState
                        );
                    } catch (browserError) {
                        throw new Error(
                            `CLOUD_${cloudError?.message || "FAILED"}__BROWSER_${browserError?.message || "FAILED"}`
                        );
                    }
                }
            }
            : context.semanticPlanner;
        const plan = await resolveSemanticPlan(
            instruction,
            catalog,
            contractPlanner,
            context.missionState || null
        );
        const calls = trustedPlanCalls(
            plan,
            catalog,
            {
                ...context,
                originalInstruction:
                    instruction
            }
        );

        globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
            ok: plan?.ok === true,
            status: plan?.status || "SEMANTIC_PLAN_READY",
            provider: plan?.provider || "injected",
            model: plan?.model || null,
            toolCount: calls.length,
            checkedAt: new Date().toISOString()
        };

        return attachPlanMetadata(calls, plan);
    } catch (error) {
        if (
            context?.missionState?.phase !== "MISSION_CONTRACT" &&
            typeof context.semanticPlanner !== "function"
        ) {
            try {
                const fallbackPlan = await callBrowserSemanticPlan(
                    instruction,
                    catalog,
                    context.missionState || null
                );
                const fallbackCalls = trustedPlanCalls(
                    fallbackPlan,
                    catalog,
                    {
                        ...context,
                        originalInstruction:
                            instruction
                    }
                );
                globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
                    ok: true,
                    status: fallbackPlan.status,
                    provider: fallbackPlan.provider,
                    model: fallbackPlan.model,
                    toolCount: fallbackCalls.length,
                    toolNames: fallbackCalls.map(call => call.name),
                    recoveredFrom: error?.message || String(error),
                    checkedAt: new Date().toISOString()
                };
                return attachPlanMetadata(fallbackCalls, fallbackPlan);
            } catch (browserFallbackError) {
                error = new Error(
                    `CLOUD_${error?.message || "FAILED"}__BROWSER_${browserFallbackError?.message || "FAILED"}`
                );
            }
        }
        globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
            ok: false,
            status: "SEMANTIC_PLANNER_UNAVAILABLE",
            error: error?.message || String(error),
            checkedAt: new Date().toISOString()
        };
        if (context.throwOnUnavailable === true) throw error;
        return [];
    }
}

export function describeJarvisMultifunctionPlanner() {
    return {
        ok: true,
        version: VERSION,
        maximumToolCalls: 12,
        architecture: "model_selected_runtime_catalog",
        mutates: false,
        failMode: "closed",
        approvalSource: "trusted_runtime_context"
    };
}

export const __test = {
    runtimeCatalog,
    trustedPlanCalls,
    enforceMissionIsolation,
    hasRequiredToolArguments,
    planCacheKey,
    extractJsonObject,
    callBrowserMissionContract,
    callBrowserSemanticPlan,
    extractExplicitGovernedToolPlan,
    extractGroundedAttachments,
    requestsGroundedVisualReference,
    attachmentDateScore,
    selectPreferredIdentityAttachment,
    imageVariantIdentity,
    normalizeGroundedImageReferenceCandidates
};
