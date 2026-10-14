// One semantic authority for the active local workstation. Embeddings and
// deterministic tools do not grant permission to invoke another AI provider.
export const JARVIS_LOCAL_MODEL = 'qwen3.5:9b';
export function hasExactLocalModel(names, expected = JARVIS_LOCAL_MODEL) {
    return Array.isArray(names) && names.includes(expected);
}
export function externalInferenceBlocked(capability) {
    return {ok:false,executionOk:false,objectiveSatisfied:false,blocked:true,retryable:false,
        status:'LOCAL_CAPABILITY_UNAVAILABLE',error:'EXTERNAL_INFERENCE_DISABLED',
        capability,localOnly:true,fallbackAllowed:false,externalApiUsed:false,
        message:'Esta capacidad no tiene una implementación local disponible; la inferencia externa está deshabilitada.'};
}
