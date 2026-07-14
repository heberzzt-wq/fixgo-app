/* =====================================================
   GESTIA ANALYSIS HUB V2
   Sovereign Cognitive Analysis Layer
===================================================== */

export const ANALYSIS_HUB_VERSION = "2.0.0-analysis-contract";

export function describeAnalysisHub() {

    return {
        ok: true,
        hub: "analysis",
        version:
            ANALYSIS_HUB_VERSION,
        capabilities: [
            "intent_analysis",
            "semantic_context",
            "runtime_awareness",
            "scanner_v2",
            "health_score"
        ]
    };
}

/* =====================================================
   INTENT FABRIC
===================================================== */

export {

    analyzeIntent

}

from "../jarvis/jarvis.vision.engine.js";

/* =====================================================
   SEMANTIC FABRIC
===================================================== */

export {

    getSemanticMatrix,
    getRuntimeAwareness,
    getSemanticContext

}

from "../semantic.engine.js";

/* =====================================================
   BRAIN FABRIC
===================================================== */

export {

    invocarArquitectoIA

}

from "../brain.engine.js?v=mixed-intent-v2-20260714-multifunction-planner-v1.9-native-docs";

/* =====================================================
   SCANNER FABRIC
===================================================== */

export {

    scanFile

}

from "../jarvis/jarvis.scanner.engine.js";

/* =====================================================
   DATA ANALYZER
===================================================== */

export {

    analizarDatosSistema,
    generateHealthScore

}

from "../data-analyzer.engine.js";

console.log(
    "🧠 [ANALYSIS_HUB] ONLINE"
);
