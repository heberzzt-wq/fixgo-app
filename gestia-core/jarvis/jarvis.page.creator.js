const VERSION = "1.0.0-sia7-page-creator";

function clean(value, fallback = "") {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function createOfficialPageSpec(input = {}, authority = {}) {
    const objectiveId = clean(authority.objectiveId);
    const instruction = clean(authority.instruction);

    if (!objectiveId) throw new Error("OBJECTIVE_ID_REQUIRED");
    if (!instruction) throw new Error("INSTRUCTION_REQUIRED");

    const brandName = clean(input.brandName);
    const pageName = clean(input.pageName, brandName || "pagina-oficial");
    const slug = pageName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    return {
        ok: true,
        engine: "jarvis_page_creator",
        version: VERSION,
        trace: {
            objectiveId,
            authorityId: clean(authority.authorityId, "HEBERTO_MENDOZA"),
            controllerId: clean(authority.controllerId, "CODEX_SIA7"),
            instruction,
            generatedAt: Date.now()
        },
        page: {
            pageName,
            slug,
            fileName: `${slug || "pagina-oficial"}.html`,
            title: clean(input.title, brandName || pageName),
            description: clean(input.description, "Página generada a partir de la solicitud actual."),
            responsive: true,
            editable: true,
            sections: Array.isArray(input.sections)
                ? input.sections.slice(0, 32)
                : [],
            design: {
                style: clean(input.style, "premium technology"),
                mobileFirst: true,
                accessible: true,
                semanticHtml: true
            }
        },
        outputContract: {
            format: "html_css_js",
            previewRequired: true,
            writeAllowed: false,
            deployAllowed: false,
            requiresHumanApproval: true,
            targetPath: clean(input.targetPath, `${slug || "pagina-oficial"}.html`)
        },
        checks: [
            "responsive_layout",
            "semantic_structure",
            "editable_copy",
            "accessible_navigation",
            "no_external_publish_without_approval"
        ]
    };
}

export function authorizePageOutput(spec, approval = {}) {
    if (!spec?.trace?.objectiveId) {
        return { ok: false, allowed: false, reason: "PAGE_SPEC_REQUIRED" };
    }

    if (approval.objectiveId !== spec.trace.objectiveId) {
        return { ok: false, allowed: false, reason: "OBJECTIVE_MISMATCH" };
    }

    if (approval.authorityId !== spec.trace.authorityId) {
        return { ok: false, allowed: false, reason: "AUTHORITY_MISMATCH" };
    }

    if (approval.controllerId !== spec.trace.controllerId) {
        return { ok: false, allowed: false, reason: "CONTROLLER_MISMATCH" };
    }

    return {
        ok: true,
        allowed: approval.approved === true,
        reason: approval.approved === true ? "PAGE_OUTPUT_AUTHORIZED" : "HUMAN_APPROVAL_REQUIRED"
    };
}

export function describePageCreator() {
    return {
        ok: true,
        version: VERSION,
        capabilities: [
            "functional_page_spec",
            "responsive_page_spec",
            "editable_content",
            "approval_bound_write",
            "approval_bound_deploy"
        ]
    };
}
