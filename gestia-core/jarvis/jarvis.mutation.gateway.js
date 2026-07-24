/* =========================================================
   JARVIS V7 MUTATION GATEWAY FOUNDATION
   Canonical authorize -> simulate -> approve -> execute -> verify pipeline.
   V7 is the Jarvis product codename, not a semantic version number.
========================================================= */

const MUTATION_GATEWAY_VERSION = "1.0.0-foundation";

function requiredFunction(value, name) {
    if (typeof value !== "function") {
        throw new Error(`JARVIS_MUTATION_GATEWAY_${name}_REQUIRED`);
    }
    return value;
}

export function createJarvisMutationGateway({
    authorize,
    simulate,
    execute,
    verify,
    audit = () => undefined
} = {}) {
    const authorizeFn = requiredFunction(authorize, "AUTHORIZE");
    const executeFn = requiredFunction(execute, "EXECUTE");
    const verifyFn = requiredFunction(verify, "VERIFY");
    const simulateFn = typeof simulate === "function"
        ? simulate
        : async mutation => ({ ok: true, mutation });

    async function run(mutation = {}, context = {}) {
        const trace = {
            gatewayVersion: MUTATION_GATEWAY_VERSION,
            codename: "JARVIS_V7",
            mutationId: mutation.mutationId || globalThis.crypto?.randomUUID?.() || `mutation-${Date.now()}`,
            startedAt: new Date().toISOString(),
            stages: []
        };

        const record = async (stage, fn) => {
            const startedAt = Date.now();
            try {
                const result = await fn();
                trace.stages.push({
                    stage,
                    ok: result?.ok !== false,
                    durationMs: Date.now() - startedAt
                });
                return result;
            } catch (error) {
                trace.stages.push({
                    stage,
                    ok: false,
                    durationMs: Date.now() - startedAt,
                    error: error?.message || String(error)
                });
                throw error;
            }
        };

        try {
            const authorization = await record("AUTHORIZE", () => authorizeFn(mutation, context));
            if (authorization?.ok === false || authorization?.authorized === false) {
                return {
                    ok: false,
                    status: "MUTATION_NOT_AUTHORIZED",
                    authorization,
                    trace
                };
            }

            const simulation = await record("SIMULATE", () => simulateFn(mutation, context));
            if (simulation?.ok === false) {
                return {
                    ok: false,
                    status: "MUTATION_SIMULATION_FAILED",
                    simulation,
                    trace
                };
            }

            const requiresApproval =
                mutation.requiresApproval !== false &&
                authorization?.requiresApproval !== false;

            if (requiresApproval && context.approved !== true) {
                return {
                    ok: false,
                    status: "MUTATION_APPROVAL_REQUIRED",
                    requiresApproval: true,
                    simulation,
                    trace
                };
            }

            trace.stages.push({
                stage: "APPROVAL",
                ok: true,
                approved: context.approved === true || !requiresApproval
            });

            const execution = await record("EXECUTE", () => executeFn(mutation, context, simulation));
            if (execution?.ok === false) {
                return {
                    ok: false,
                    status: "MUTATION_EXECUTION_FAILED",
                    execution,
                    trace
                };
            }

            const verification = await record("VERIFY", () => verifyFn(mutation, context, execution));
            if (verification?.ok === false) {
                return {
                    ok: false,
                    status: "MUTATION_VERIFICATION_FAILED",
                    execution,
                    verification,
                    trace
                };
            }

            const result = {
                ok: true,
                status: "MUTATION_VERIFIED",
                execution,
                verification,
                trace: {
                    ...trace,
                    completedAt: new Date().toISOString()
                }
            };

            await audit({ mutation, context, result });
            return result;
        } catch (error) {
            const result = {
                ok: false,
                status: "MUTATION_GATEWAY_FAILED",
                error: error?.message || String(error),
                trace: {
                    ...trace,
                    completedAt: new Date().toISOString()
                }
            };

            try {
                await audit({ mutation, context, result });
            } catch {
                // Auditing must never hide the original mutation failure.
            }

            return result;
        }
    }

    return Object.freeze({
        version: MUTATION_GATEWAY_VERSION,
        codename: "JARVIS_V7",
        run
    });
}

export const JarvisMutationGatewayVersion = MUTATION_GATEWAY_VERSION;
