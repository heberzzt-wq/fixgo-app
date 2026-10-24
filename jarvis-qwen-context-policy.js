// The single Ollama context is shared by warmup, semantic planning and Qwen decisions.
// Default stays unchanged until the low-memory profile is explicitly certified.
export function resolveLocalQwenContextTokens(value) {
    if (value === undefined || value === null || String(value).trim() === '') return 16384;
    const tokens = Number(value);
    if (![4096, 8192, 16384].includes(tokens)) throw new Error('LOCAL_QWEN_CONTEXT_UNSUPPORTED');
    return tokens;
}

// Reject clearly oversized prompts BEFORE starting a costly CPU-only inference.
// This is a conservative character-based preflight, not a tokenizer: prompts near
// the limit still rely on Ollama's truncate:false/shift:false to fail closed.
// Nothing is removed from user instructions, tool schemas or verified evidence.
export function assertLocalQwenPromptPreflight({contextTokens,messages=[],tools=[],format=null,maxOutputTokens=256}={}) {
    const tokens=resolveLocalQwenContextTokens(contextTokens);
    if(tokens===16384)return;
    const payloadCharacters=JSON.stringify({messages,tools,format}).length;
    const outputReservation=Math.max(128,Math.min(tokens/2,Number(maxOutputTokens)||256));
    const characterCeiling=Math.floor(Math.min(tokens*3,Math.max(0,tokens-outputReservation)*4));
    if(payloadCharacters>characterCeiling)throw new Error('LOCAL_QWEN_CONTEXT_NEEDS_SEGMENTATION');
}
