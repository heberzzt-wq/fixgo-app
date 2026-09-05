import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BASELINE_COMMIT = "e59167566b10737bed3d94538b64c73752dae25e";
const SELF = ".github/scripts/v142-final-contract-alignment.mjs";
const ENGINE = "jarvis-local-video-engine.js";
const TEST = "tests/jarvis-local-video-engine-v142.test.mjs";

const read = file => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const write = (file, source) => fs.writeFileSync(file, source, "utf8");

function replaceExactOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
  return source.replace(before, after);
}

function appendOnce(source, marker, addition) {
  if (source.includes(marker)) return source;
  return `${source.trimEnd()}\n\n${addition.trim()}\n`;
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`${label}_SCOPE_MISSING`);
  if (source.slice(start, end).includes(replacement.trim())) return source;
  return source.slice(0, start) + replacement + source.slice(end);
}

function runPinnedBaseline() {
  const baseline = execFileSync(
    "git",
    ["show", `${BASELINE_COMMIT}:${SELF}`],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  if (!baseline.includes("V142_RUNPOD_CONTROL_PLANE_V2_MATERIALIZED")) {
    throw new Error("V142_PINNED_V2_BASELINE_INVALID");
  }
  const temp = path.join(
    os.tmpdir(),
    `fixgo-v142-final-contract-${process.pid}-${Date.now()}.mjs`
  );
  try {
    fs.writeFileSync(temp, baseline, "utf8");
    execFileSync(process.execPath, [temp], {
      cwd: process.cwd(),
      stdio: "inherit",
      maxBuffer: 64 * 1024 * 1024
    });
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

runPinnedBaseline();

let engine = read(ENGINE);

const apiRequestReplacement = [
'    async function apiRequest(',
'        url,',
'        options = {},',
'        accepted = [200],',
'        stage = "runpod_api",',
'        operationId = null',
'    ) {',
'        const method = String(options.method || "GET").toUpperCase();',
'        const idempotentTransportRetry = method === "GET" || method === "DELETE";',
'        const maximumTransportAttempts = idempotentTransportRetry ? 3 : 1;',
'        let response;',
'        let transportAttempt = 0;',
'        while (transportAttempt < maximumTransportAttempts) {',
'            transportAttempt += 1;',
'            try {',
'                response = await fetchImpl(url, {',
'                    ...options,',
'                    headers: {',
'                        Authorization: `Bearer ${apiKey}`,',
'                        ...(options.body ? { "Content-Type": "application/json" } : {}),',
'                        ...(options.headers || {})',
'                    }',
'                });',
'                break;',
'            }',
'            catch(error) {',
'                if (idempotentTransportRetry && transportAttempt < maximumTransportAttempts) {',
'                    await new Promise(resolve => setTimeout(resolve, Math.min(1000, 250 * transportAttempt)));',
'                    continue;',
'                }',
'                const failure = new Error("RUNPOD_API_TRANSPORT_FAILED");',
'                failure.cause = error;',
'                Object.assign(failure, safeProviderDiagnostic(error));',
'                failure.retryable = true;',
'                failure.stage = stage;',
'                failure.transportAttempts = transportAttempt;',
'                failure.transportRetryPolicy = idempotentTransportRetry',
'                    ? "IDEMPOTENT_GET_DELETE_MAX_3"',
'                    : "NON_IDEMPOTENT_NO_RETRY";',
'                throw failure;',
'            }',
'        }',
'        let text = "";',
'        if (Number(response.status) !== 204 && typeof response.text === "function") {',
'            try { text = await response.text(); }',
'            catch {}',
'        }',
'        const headers = sanitizeProviderHeaders(response.headers);',
'        const providerHttp = {',
'            status: Number(response.status || 0),',
'            body: sanitizeProviderText(text) || null,',
'            headers,',
'            requestId: providerRequestId(headers),',
'            stage,',
'            operationId: operationId || null,',
'            endpoint: safeProviderEndpoint(url),',
'            method,',
'            contentType: headers["content-type"] || null,',
'            timestampUtc: now().toISOString(),',
'            transportAttempts: transportAttempt',
'        };',
'        if (!accepted.includes(Number(response.status))) {',
'            const failure = new Error(`RUNPOD_API_HTTP_${Number(response.status || 0)}`);',
'            failure.retryable = Number(response.status) >= 500 || Number(response.status) === 429;',
'            failure.httpStatus = Number(response.status || 0);',
'            failure.stage = stage;',
'            failure.providerCode = `HTTP_${Number(response.status || 0)}`;',
'            failure.providerMessage = providerHttp.body || failure.message;',
'            failure.providerHttp = providerHttp;',
'            throw failure;',
'        }',
'        if (Number(response.status) === 204) return null;',
'        if (!text) return null;',
'        try { return JSON.parse(text); }',
'        catch { throw new Error("RUNPOD_API_RESPONSE_INVALID"); }',
'    }',
''
].join("\n");

engine = replaceSection(
  engine,
  "    async function apiRequest(",
  "    async function queryAvailability(",
  apiRequestReplacement,
  "V142_RUNPOD_IDEMPOTENT_TRANSPORT_RETRY"
);

for (const marker of [
  'idempotentTransportRetry = method === "GET" || method === "DELETE"',
  'maximumTransportAttempts = idempotentTransportRetry ? 3 : 1',
  '"IDEMPOTENT_GET_DELETE_MAX_3"',
  '"NON_IDEMPOTENT_NO_RETRY"',
  'transportAttempts: transportAttempt',
  'https://api.runpod.io/v2',
  'podFindAndDeployOnDemand'
]) {
  if (!engine.includes(marker)) throw new Error(`V142_RUNPOD_TRANSPORT_MARKER_MISSING:${marker}`);
}
if (engine.includes('https://rest.runpod.io/v1')) {
  throw new Error("V142_RUNPOD_V1_CONTROL_PLANE_REGRESSION");
}
write(ENGINE, engine);

let tests = read(TEST);

tests = replaceExactOnce(
  tests,
  '    let availabilityTransportFailures = scenario === "availability-transport-once" ? 1 : 0;',
  [
    '    let availabilityTransportFailures = scenario === "availability-transport-once" ? 1 : 0;',
    '    let restGetTransportFailures = scenario === "rest-get-connect-timeout-once" ? 1 : 0;',
    '    let restDeleteTransportFailures = scenario === "rest-delete-connect-timeout-once" ? 1 : 0;'
  ].join("\n"),
  "V142_TEST_REST_TRANSPORT_COUNTERS"
);

tests = replaceExactOnce(
  tests,
  '        if (String(url).endsWith("/pods") && (options.method || "GET") === "GET") {',
  [
    '        if (String(url).endsWith("/pods") && (options.method || "GET") === "GET") {',
    '            if (restGetTransportFailures > 0) {',
    '                restGetTransportFailures -= 1;',
    '                const error = new Error("Connect Timeout Error (controlled REST GET)");',
    '                error.code = "UND_ERR_CONNECT_TIMEOUT";',
    '                throw error;',
    '            }'
  ].join("\n"),
  "V142_TEST_REST_GET_CONNECT_TIMEOUT"
);

tests = replaceExactOnce(
  tests,
  '        if (String(url).includes("/pods/pod-l40s-v142") && options.method === "DELETE") {',
  [
    '        if (String(url).includes("/pods/pod-l40s-v142") && options.method === "DELETE") {',
    '            if (restDeleteTransportFailures > 0) {',
    '                restDeleteTransportFailures -= 1;',
    '                const error = new Error("Connect Timeout Error (controlled REST DELETE)");',
    '                error.code = "UND_ERR_CONNECT_TIMEOUT";',
    '                throw error;',
    '            }'
  ].join("\n"),
  "V142_TEST_REST_DELETE_CONNECT_TIMEOUT"
);

const transportRetryTest = [
'test("V142 RunPod retries transient REST GET and DELETE transport but never retries provisioning", async () => {',
'    const getHarness = runpodPhysicalHarness({ scenario: "rest-get-connect-timeout-once" });',
'    const started = await getHarness.engine.start(getHarness.payload);',
'    assert.equal(started.ok, true, JSON.stringify(started));',
'    assert.equal(',
'        getHarness.calls.filter(call =>',
'            call.kind === "http" && call.method === "GET" && call.url.endsWith("/pods")',
'        ).length,',
'        2',
'    );',
'    assert.equal(',
'        getHarness.calls.filter(call => call.providerOperation === "provision").length,',
'        1,',
'        "billable provisioning must never be retried"',
'    );',
'    const getCancelled = await getHarness.engine.cancel({ operationName: started.operationName });',
'    assert.equal(getCancelled.ok, true, JSON.stringify(getCancelled));',
'',
'    const deleteHarness = runpodPhysicalHarness({ scenario: "rest-delete-connect-timeout-once" });',
'    const deleteStarted = await deleteHarness.engine.start(deleteHarness.payload);',
'    assert.equal(deleteStarted.ok, true, JSON.stringify(deleteStarted));',
'    const deleted = await deleteHarness.engine.cancel({ operationName: deleteStarted.operationName });',
'    assert.equal(deleted.ok, true, JSON.stringify(deleted));',
'    assert.equal(deleted.terminationVerified, true, JSON.stringify(deleted));',
'    assert.equal(',
'        deleteHarness.calls.filter(call =>',
'            call.kind === "http" &&',
'            call.method === "DELETE" &&',
'            call.url.includes("/pods/pod-l40s-v142")',
'        ).length,',
'        2',
'    );',
'    assert.equal(',
'        deleteHarness.calls.filter(call => call.providerOperation === "provision").length,',
'        1,',
'        "cleanup retry must never create a replacement Pod"',
'    );',
'});'
].join("\n");

tests = appendOnce(
  tests,
  "V142 RunPod retries transient REST GET and DELETE transport but never retries provisioning",
  transportRetryTest
);

write(TEST, tests);

execFileSync(process.execPath, ["--check", ENGINE], { stdio: "inherit" });
if (fs.existsSync(path.join(process.cwd(), "node_modules"))) {
  execFileSync(
    process.execPath,
    ["--test", "--test-concurrency=1", TEST],
    { stdio: "inherit", maxBuffer: 64 * 1024 * 1024 }
  );
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_RUNPOD_IDEMPOTENT_TRANSPORT_RETRY_MATERIALIZED",
  baselineCommit: BASELINE_COMMIT,
  restApi: "https://api.runpod.io/v2",
  safeTransportRetries: {
    GET: 3,
    DELETE: 3,
    POST: 1
  },
  provisioningRetryAllowed: false,
  cleanupRetryAllowed: true,
  humoInferenceAuthorized: false,
  billableGpuCreated: false,
  newFiles: false,
  newWorkflow: false
}));
