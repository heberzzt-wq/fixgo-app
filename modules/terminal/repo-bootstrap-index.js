/* =====================================================
   REPO BOOTSTRAP INDEX
===================================================== */

window.__REPO_INDEX__ ||= {};
window.__REPO_COGNITION__ ||= {};
window.__REPO_DEP_GRAPH__ ||= {};
window.__MODULE_OWNERSHIP__ ||= {};


window.__REPO_INDEX__["gestia-terminal.js"] = {
    path: "gestia-terminal.js",
    module: "terminal",
    type: "runtime_ui",
    critical: true
};

window.__REPO_INDEX__["operations-executor.engine.js"] = {
    path: "gestia-core/operations-executor.engine.js",
    module: "executor",
    type: "transactional_engine",
    critical: true
};

window.__REPO_INDEX__["plans.engine.js"] = {
    path: "gestia-core/plans.engine.js",
    module: "planner",
    type: "approval_engine",
    critical: true
};

/* =====================================================
B2B ACCESS MODULE
===================================================== */
window.__REPO_INDEX__["app-main.js"] = {

    path:
        "app-main.js",

    module:
        "main_controller",

    type:
        "runtime_router",

    critical: true
};


window.__REPO_INDEX__["panel-admin.js"] = {

    path:
        "panel-admin.js",

    module:
        "admin_control_center",

    type:
        "financial_support_runtime",

    critical: true
};

window.__REPO_INDEX__["panel-tecnico.js"] = {

    path:
        "panel-tecnico.js",

    module:
        "field_operations",

    type:
        "technician_runtime",

    critical: true
};

window.__REPO_INDEX__["panel-cliente.js"] = {

    path:
        "panel-cliente.js",

    module:
        "customer_commerce",

    type:
        "customer_runtime",

    critical: true
};

window.__REPO_INDEX__["panel-b2b-admin.js"] = {

    path:
        "panel-b2b-admin.js",

    module:
        "b2b_command_center",

    type:
        "tenant_admin_runtime",

    critical: true
};

window.__REPO_INDEX__["firebase.js"] = {

    path:
        "firebase.js",

    module:
        "firebase_core",

    type:
        "infrastructure_runtime",

    critical: true
};

window.__REPO_INDEX__["gps-motor.js"] = {

    path:
        "gps-motor.js",

    module:
        "field_tracking",

    type:
        "telemetry_runtime",

    critical: true
};

window.__REPO_INDEX__["test-replace.js"] = {

    path: "./test-replace.js",

    module: "sandbox",

    governance: "LOW",

    runtimeRole: "test",

    engineType: "test"
};

window.__REPO_INDEX__["rastreo.html"] = {

    path:
        "rastreo.html",

    module:
        "field_tracking",

    type:
        "tracking_ui",

    critical: false
};


window.__REPO_INDEX__["gestia-render.js"] = {

    path:
        "gestia-render.js",

    module:
        "ui_orchestration",

    type:
        "render_runtime",

    critical: true
};

window.__REPO_INDEX__["modulo-flotilla.html"] = {

    path: "modulo-flotilla.html",

    module: "fleet_management",

    type: "fleet_ui",

    critical: false
};

window.__REPO_INDEX__["modulo-flotilla.js"] = {

    path: "modulo-flotilla.js",

    module: "fleet_management",

    type: "fleet_runtime",

    critical: true
};

window.__REPO_INDEX__["terminal-chofer.html"] = {

    path: "terminal-chofer.html",

    module: "fleet_operations",

    type: "driver_ui",

    critical: false
};

window.__REPO_INDEX__["terminal-chofer.js"] = {

    path: "terminal-chofer.js",

    module: "fleet_operations",

    type: "driver_runtime",

    critical: true
};

window.__REPO_INDEX__["visor-flota.html"] = {

    path: "visor-flota.html",

    module: "fleet_monitoring",

    type: "tracking_command_center",

    critical: false
};

window.__REPO_INDEX__["login.html"] = {

    path: "login.html",

    module: "auth_domain",

    type: "login_ui",

    critical: false
};

window.__REPO_INDEX__["app-login.js"] = {

    path: "app-login.js",

    module: "auth_domain",

    type: "login_runtime",

    critical: true
};

window.__REPO_INDEX__["registro.html"] = {

    path: "registro.html",

    module: "auth_domain",

    type: "registration_ui",

    critical: false
};

window.__REPO_INDEX__["app-registro.js"] = {

    path: "app-registro.js",

    module: "auth_domain",

    type: "registration_runtime",

    critical: true
};

window.__REPO_INDEX__["core_auth_tenant_v1.js"] = {

    path: "gestia-core/core_auth_tenant_v1.js",

    module: "tenant_security",

    type: "authority_runtime",

    critical: true
};

/* =====================================================
   JARVIS COGNITIVE SUITE
===================================================== */





window.__REPO_INDEX__["jarvis.memory.js"] = {
    path: "gestia-core/jarvis/jarvis.memory.js",
    module: "jarvis_memory",
    type: "memory_runtime",
    critical: true
};


window.__REPO_INDEX__["jarvis.business.engine.js"] = {
    path: "gestia-core/jarvis/jarvis.business.engine.js",
    module: "jarvis_business",
    type: "business_runtime",
    critical: false
};

window.__REPO_INDEX__["jarvis.marketing.engine.js"] = {
    path: "gestia-core/jarvis/jarvis.marketing.engine.js",
    module: "jarvis_marketing",
    type: "marketing_runtime",
    critical: false
};

window.__REPO_INDEX__["jarvis.company.registry.js"] = {
    path: "gestia-core/jarvis/jarvis.company.registry.js",
    module: "company_registry",
    type: "knowledge_runtime",
    critical: false
};

window.__REPO_INDEX__["jarvis.firestore.engine.js"] = {
    path: "gestia-core/jarvis/jarvis.firestore.engine.js",
    module: "jarvis_firestore",
    type: "data_runtime",
    critical: true
};

window.__REPO_INDEX__["jarvis.scanner.engine.js"] = {
    path: "gestia-core/jarvis/jarvis.scanner.engine.js",
    module: "jarvis_scanner",
    type: "analysis_runtime",
    critical: true
};

window.__REPO_INDEX__["jarvis.autofix.engine.js"] = {
    path: "gestia-core/jarvis/jarvis.autofix.engine.js",
    module: "jarvis_autofix",
    type: "repair_runtime",
    critical: true
};

window.__REPO_INDEX__["jarvis.autopatch.engine.js"] = {
    path: "gestia-core/jarvis/jarvis.autopatch.engine.js",
    module: "jarvis_autopatch",
    type: "repair_runtime",
    critical: true
};

window.__REPO_INDEX__["jarvis.patchdiff.engine.js"] = {
    path: "gestia-core/jarvis/jarvis.patchdiff.engine.js",
    module: "jarvis_patchdiff",
    type: "analysis_runtime",
    critical: false
};

window.__REPO_INDEX__["jarvis.snapshot.js"] = {
    path: "gestia-core/jarvis/jarvis.snapshot.js",
    module: "jarvis_snapshot",
    type: "recovery_runtime",
    critical: true
};




window.__REPO_INDEX__["jarvis-hud.js"] = {
    path: "gestia-core/jarvis-hud.js",
    module: "jarvis_hud",
    type: "observability_runtime",
    critical: false
};

window.__REPO_INDEX__["jarvis.bridge.js"] = {
    path: "gestia-core/jarvis/jarvis.bridge.js",
    module: "jarvis_bridge_legacy",
    type: "bridge_runtime",
    critical: true
};


window.__REPO_INDEX__["core_tenant_resolver_v2.js"] = {

    path: "gestia-core/core_tenant_resolver_v2.js",

    module: "tenant_security",

    type: "tenant_resolution_runtime",

    critical: true
};

window.__REPO_INDEX__["audit.engine.js"] = {

    path:
        "gestia-core/audit.engine.js",

    module:
        "audit",

    type:
        "audit_runtime",

    critical:
        true
};

window.__REPO_COGNITION__["audit.engine.js"] = {

    owner:
        "audit",

    governance:
        "NORMAL",

    runtimeRole:
        "security",

    engineType:
        "audit_runtime",

    dependencies: [

        "history.engine.js",

        "jarvis.memory.js"
    ],

    exports: [

        "validarSeguridadCodigo",

        "validarPesoCampos",

        "ejecutarAuditoriaCore"
    ]
};

window.__MODULE_OWNERSHIP__["audit.engine.js"] = {

    owner:
        "audit",

    governance:
        "NORMAL",

    runtimeRole:
        "security",

    engineType:
        "audit_runtime",

    dependencies: [

        "history.engine.js",

        "jarvis.memory.js"
    ]
};
/* =====================================================
   DATA ANALYZER
===================================================== */

window.__REPO_INDEX__["data-analyzer.engine.js"] = {
    path: "gestia-core/data-analyzer.engine.js",
    module: "data_analyzer",
    type: "analysis_runtime",
    critical: true
};

/* =====================================================
   GESTIA RUNTIME
===================================================== */

window.__REPO_INDEX__["gestia.runtime.v7.js"] = {
    path: "gestia-core/gestia.runtime.v7.js",
    module: "gestia_runtime",
    type: "runtime_kernel",
    critical: true
};

/* =====================================================
   HISTORY ENGINE
===================================================== */

window.__REPO_INDEX__["history.engine.js"] = {
    path: "gestia-core/history.engine.js",
    module: "history",
    type: "audit_runtime",
    critical: true
};

/* =====================================================
   INTENT ENGINE V7
===================================================== */


/* =====================================================
   MEDIA ENGINE
===================================================== */

window.__REPO_INDEX__["media.engine.js"] = {
    path: "gestia-core/media.engine.js",
    module: "media",
    type: "multimodal_runtime",
    critical: true
};

/* =====================================================
   AUTHORITY REGISTRY
===================================================== */

window.__REPO_INDEX__["authority.registry.js"] = {
    path: "gestia-core/authority/authority.registry.js",
    module: "authority_registry",
    type: "governance_runtime",
    critical: true
};

/* =====================================================
   PROPOSE ENGINE
===================================================== */

window.__REPO_INDEX__["propose.engine.js"] = {
    path: "gestia-core/propose.engine.js",
    module: "proposal_engine",
    type: "planning_runtime",
    critical: true
};

/* =====================================================
   REPO COGNITION INDEX
===================================================== */


/* =====================================================
   RESOURCE REGISTRY
===================================================== */

window.__REPO_INDEX__["resource.registry.js"] = {
    path: "gestia-core/repo/resource.registry.js",
    module: "resource_registry",
    type: "repository_runtime",
    critical: true
};


window.__REPO_INDEX__["jarvis.kernel.js"] = {

    path:
        "gestia-core/jarvis.kernel.js",

    module:
        "gestia_kernel",

    type:
        "sovereign_runtime",

    critical: true
};


window.__REPO_INDEX__["execution.hub.js"] = {

    path:
        "gestia-core/hubs/execution.hub.js",

    module:
        "execution_hub",

    type:
        "execution_fabric",

    critical: true
};

window.__REPO_INDEX__["repo.hub.js"] = {

    path:
        "gestia-core/hubs/repo.hub.js",

    module:
        "repo_hub",

    type:
        "repository_fabric",

    critical: true
};

window.__REPO_INDEX__["security.hub.js"] = {

    path:
        "gestia-core/hubs/security.hub.js",

    module:
        "security_hub",

    type:
        "governance_fabric",

    critical: true
};

window.__REPO_INDEX__["app-inquilino.js"] = {

    path:
        "app-inquilino.js",

    module:
        "tenant_communication",

    type:
        "tenant_runtime",

    critical: true
};

window.__REPO_INDEX__["firebase-node-adapter.js"] = {

    path:
        "firebase-node-adapter.js",

    module:
        "firebase_adapter",

    type:
        "infrastructure_runtime",

    critical: true
};

window.__REPO_INDEX__["firebase-shim.js"] = {

    path:
        "firebase-shim.js",

    module:
        "firebase_shim",

    type:
        "compatibility_runtime",

    critical: true
};

window.__REPO_INDEX__["fixgo-bridge.js"] = {

    path:
        "fixgo-bridge.js",

    module:
        "financial_bridge",

    type:
        "business_runtime",

    critical: true
};

window.__REPO_INDEX__["modulo-b2b.js"] = {

    path:
        "modulo-b2b.js",

    module:
        "facility_management",

    type:
        "b2b_runtime",

    critical: true
};

window.__REPO_INDEX__["scheduler_predictivo.js"] = {

    path:
        "scheduler_predictivo.js",

    module:
        "predictive_scheduler",

    type:
        "automation_runtime",

    critical: true
};

window.__REPO_INDEX__["scheduler_rutinas.js"] = {

    path:
        "scheduler_rutinas.js",

    module:
        "preventive_scheduler",

    type:
        "automation_runtime",

    critical: true
};

window.__REPO_INDEX__["app-utils.js"] = {

    path:
        "app-utils.js",

    module:
        "shared_utilities",

    type:
        "utility_runtime",

    critical: true
};

window.__REPO_INDEX__["app-panel.js"] = {

    path:
        "app-panel.js",

    module:
        "panel_router",

    type:
        "runtime_router",

    critical: true
};

window.__REPO_INDEX__["jarvis-fs-bridge.js"] = {

    path:
        "jarvis-fs-bridge.js",

    module:
        "filesystem_bridge",

    type:
        "bridge_runtime",

    critical: true
};

window.__REPO_INDEX__["sync-agent.cjs"] = {

    path:
        "sync-agent.cjs",

    module:
        "sync_agent",

    type:
        "synchronization_runtime",

    critical: true
};

window.__REPO_INDEX__["sw.js"] = {

    path:
        "sw.js",

    module:
        "service_worker",

    type:
        "offline_runtime",

    critical: true
};


window.__REPO_INDEX__["alert-engine.js"] = {
    path: "alert-engine.js",
    module: "alert_engine",
    type: "notification_runtime",
    critical: true
};

window.__REPO_INDEX__["fixgo-core-backend.js"] = {
    path: "fixgo-core-backend.js",
    module: "financial_core",
    type: "financial_runtime",
    critical: true
};

window.__REPO_INDEX__["fixgo-modals.js"] = {
    path: "fixgo-modals.js",
    module: "modal_templates",
    type: "ui_runtime",
    critical: true
};

window.__REPO_INDEX__["soporte-whatsapp.js"] = {
    path: "soporte-whatsapp.js",
    module: "support_channel",
    type: "communication_runtime",
    critical: false
};

window.__REPO_INDEX__["admin.html"] = {
    path: "admin.html",
    module: "admin_dashboard",
    type: "admin_interface",
    critical: true
};

window.__REPO_INDEX__["app-inquilino.html"] = {
    path: "app-inquilino.html",
    module: "tenant_portal",
    type: "tenant_interface",
    critical: true
};

window.__REPO_INDEX__["b2b.html"] = {
    path: "b2b.html",
    module: "b2b_control_center",
    type: "b2b_interface",
    critical: true
};

window.__REPO_INDEX__["ceo.html"] = {
    path: "ceo.html",
    module: "executive_dashboard",
    type: "executive_interface",
    critical: false
};

window.__REPO_INDEX__["cliente.html"] = {
    path: "cliente.html",
    module: "client_portal",
    type: "client_interface",
    critical: true
};

window.__REPO_INDEX__["index.html"] = {
    path: "index.html",
    module: "platform_entrypoint",
    type: "bootstrap_interface",
    critical: true
};

window.__REPO_INDEX__["gestia-terminal.html"] = {
    path: "gestia-terminal.html",
    module: "gestia_terminal",
    type: "operator_interface",
    critical: true
};

window.__REPO_INDEX__["tecnico.html"] = {
    path: "tecnico.html",
    module: "technician_portal",
    type: "technician_interface",
    critical: true
};

window.__REPO_INDEX__["panel-b2b-admin.html"] = {
    path: "panel-b2b-admin.html",
    module: "b2b_noc",
    type: "operations_interface",
    critical: true
};

window.__REPO_INDEX__["gestia-modulo.html"] = {
    path: "gestia-modulo.html",
    module: "module_builder",
    type: "management_interface",
    critical: true
};

window.__REPO_INDEX__["crm.html"] = {
    path: "crm.html",
    module: "crm_directory",
    type: "crm_interface",
    critical: false
};

window.__REPO_INDEX__["manual.html"] = {
    path: "manual.html",
    module: "operations_manual",
    type: "knowledge_interface",
    critical: false
};

window.__REPO_INDEX__["politicas.html"] = {
    path: "politicas.html",
    module: "service_policies",
    type: "governance_interface",
    critical: false
};




window.__REPO_INDEX__["tecnico-b2b.html"] = {

    path: "tecnico-b2b.html",

    module: "seguridad_accesos_b2b",

    type: "mobile_ui",

    critical: false
};

window.__REPO_INDEX__["app-tecnico-b2b.js"] = {

    path: "app-tecnico-b2b.js",

    module: "seguridad_accesos_b2b",

    type: "mobile_runtime",

    critical: true
};

window.__REPO_INDEX__["firewall.engine.js"] = {

    path:
        "gestia-core/firewall.engine.js",

    module:
        "firewall",

    type:
        "security_runtime",

    critical: true
};

window.__REPO_INDEX__["semantic.engine.js"] = {

    path:
        "gestia-core/semantic.engine.js",

    module:
        "semantic",

    type:
        "cognition_runtime",

    critical: true
};


window.__REPO_INDEX__["self-repair.engine.js"] = {

    path:
        "gestia-core/self-repair.engine.js",

    module:
        "self_repair",

    type:
        "repair_runtime",

    critical: true
};



window.__REPO_INDEX__["operations.engine.js"] = {

    path:
        "gestia-core/operations.engine.js",

    module:
        "operations",

    type:
        "execution_runtime",

    critical: true
};

window.__REPO_INDEX__["persistence.engine.js"] = {

    path:
        "gestia-core/persistence.engine.js",

    module:
        "persistence",

    type:
        "persistence_runtime",

    critical: true
};


window.__REPO_INDEX__["app-bi.js"] = {

    path:
        "app-bi.js",

    module:
        "business_intelligence",

    type:
        "analytics_ui_runtime",

    critical: false,

    cognition: {

        layer:
            "ui_analytics",

        runtime:
            "hybrid",

        visual:
            true,

        editable:
            true
    }
};

/* =====================================================
   REBUILD REPO COGNITION
===================================================== */

/*if (
    typeof window.buildRepoDependencyGraph ===
    "function"
) {

    window.buildRepoDependencyGraph();

    console.log(
        "🧠 [REPO_GRAPH_REBUILT]"
    );
}

if (
    typeof window.buildRepoCognitionIndex ===
    "function"
) {

    window.buildRepoCognitionIndex();

    console.log(
        "🧠 [REPO_COGNITION_REBUILT]"
    );
}

console.log(
    "🧠 [REPO_BOOTSTRAP_READY]"
);
*/

/* =====================================================================================
   HYBRID COGNITION REGISTRY V7
===================================================================================== */

/* =====================================================
   BRAIN ENGINE V7.5
===================================================== */

window.__REPO_INDEX__["brain.engine.js"] = {

    path:
        "gestia-core/brain.engine.js",

    module:
        "brain",

    type:
        "hybrid_cognition_runtime",

    critical: true,

    cognition: {

        layer:
            "reasoning",

        runtime:
            "hybrid",

        semanticAware:
            true,

        autonomous:
            true
    }
};

window.__REPO_INDEX__["repair-translator.engine.js"] = {

    path:
        "./gestia-core/repair-translator.engine.js",

    module:
        "repair.translator",

    governance:
        "HIGH",

    runtimeRole:
        "cognitive",

    engineType:
        "repair"
};

/* =====================================================
   SEMANTIC ENGINE V7
===================================================== */

window.__REPO_INDEX__["semantic.engine.js"] = {

    path:
        "gestia-core/semantic.engine.js",

    module:
        "semantic",

    type:
        "semantic_cognition_runtime",

    critical: true,

    cognition: {

        layer:
            "semantic",

        runtime:
            "hybrid",

        contextual:
            true,

        emotional:
            true,

        inferential:
            true
    }
};

/* =====================================================
   GESTIA CORE
===================================================== */

window.__REPO_INDEX__["gestia-core.js"] = {

    path:
        "gestia-core/gestia-core.js",

    module:
        "gestia_core",

    type:
        "cognitive_orchestrator",

    critical: true,

    cognition: {

        layer:
            "orchestration",

        runtime:
            "hybrid",

        executive:
            true,

        proposalGeneration:
            true
    }
};

/* =====================================================
   COGNITIVE BRIDGE
===================================================== */



// Legacy hand-curated catalog: metadata only. Real existence/analysis comes from repo.graph.
window.__REPO_INDEX_AUTHORITY__ = "LEGACY_METADATA_ONLY";
