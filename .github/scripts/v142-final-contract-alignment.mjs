import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BASELINE_COMMIT = "9368ef8b0c0accb2edbe9a4050e3ca3e2340b9ea";
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

function replaceAllRequired(source, before, after, minimum, label) {
  const count = source.split(before).length - 1;
  if (count === 0 && source.includes(after)) return source;
  if (count < minimum) throw new Error(`${label}_MATCH_COUNT_${count}_MIN_${minimum}`);
  return source.split(before).join(after);
}

function appendOnce(source, marker, addition) {
  if (source.includes(marker)) return source;
  return `${source.trimEnd()}\n\n${addition.trim()}\n`;
}

function runPinnedBaseline() {
  const baseline = execFileSync(
    "git",
    ["show", `${BASELINE_COMMIT}:${SELF}`],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  if (!baseline.includes("V142_HUMO_PREINSTALLED_RUNTIME_REQUIRES_PHYSICAL_RECERTIFICATION")) {
    throw new Error("V142_PINNED_BASELINE_INVALID");
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

engine = replaceExactOnce(
  engine,
  '    const apiBase = String(env.JARVIS_RUNPOD_API_BASE || "https://rest.runpod.io/v1").replace(/\\/$/, "");',
  '    const apiBase = String(env.JARVIS_RUNPOD_API_BASE || "https://api.runpod.io/v2").replace(/\\/$/, "");',
  "V142_RUNPOD_REST_V2_BASE"
);

engine = replaceAllRequired(
  engine,
  "`${apiBase}/networkvolumes",
  "`${apiBase}/network-volumes",
  2,
  "V142_RUNPOD_REST_V2_NETWORK_VOLUME_PATH"
);

engine = replaceExactOnce(
  engine,
  [
    "        const volumes = Array.isArray(payload)",
    "            ? payload",
    "            : (Array.isArray(payload?.items) ? payload.items : []);"
  ].join("\n"),
  [
    "        const volumes = Array.isArray(payload?.networkVolumes)",
    "            ? payload.networkVolumes",
    "            : (Array.isArray(payload)",
    "                ? payload",
    "                : (Array.isArray(payload?.items) ? payload.items : []));"
  ].join("\n"),
  "V142_RUNPOD_REST_V2_NETWORK_VOLUME_ENVELOPE"
);

engine = replaceAllRequired(
  engine,
  'String(volume?.dataCenterId || volume?.dataCenter?.id || "").trim()',
  'String(volume?.dataCenter || volume?.dataCenterId || volume?.dataCenter?.id || "").trim()',
  2,
  "V142_RUNPOD_REST_V2_NETWORK_VOLUME_DATACENTER"
);

engine = replaceAllRequired(
  engine,
  'String(pod.desiredStatus || "") === "TERMINATED"',
  'String(pod.status || pod.desiredStatus || "") === "TERMINATED"',
  1,
  "V142_RUNPOD_REST_V2_TERMINATION_STATUS"
);

engine = replaceAllRequired(
  engine,
  'String(remaining.desiredStatus || "") !== "TERMINATED"',
  'String(remaining.status || remaining.desiredStatus || "") !== "TERMINATED"',
  1,
  "V142_RUNPOD_REST_V2_ORPHAN_STATUS"
);

engine = replaceExactOnce(
  engine,
  '                    `${apiBase}/pods/${encodeURIComponent(state.podId)}?includeMachine=true`,',
  '                    `${apiBase}/pods/${encodeURIComponent(state.podId)}`,',
  "V142_RUNPOD_REST_V2_POD_GET"
);

engine = replaceExactOnce(
  engine,
  '                if (String(pod?.desiredStatus || "") !== "RUNNING") {',
  '                if (String(pod?.status || pod?.desiredStatus || "") !== "RUNNING") {',
  "V142_RUNPOD_REST_V2_RUNNING_STATUS"
);

engine = replaceExactOnce(
  engine,
  [
    '                const publicIp = String(pod?.publicIp || "").trim();',
    '                const sshPort = Number(pod?.portMappings?.["22"] || 0);'
  ].join("\n"),
  [
    '                const runtimePorts = Array.isArray(pod?.runtime?.ports) ? pod.runtime.ports : [];',
    '                const sshRuntimePort = runtimePorts.find(port =>',
    '                    Number(port?.private ?? port?.privatePort) === 22 &&',
    '                    String(port?.type || port?.portType || "tcp").toLowerCase() === "tcp"',
    '                ) || null;',
    '                const publicIp = String(',
    '                    sshRuntimePort?.ip || pod?.publicIp || ""',
    '                ).trim();',
    '                const sshPort = Number(',
    '                    sshRuntimePort?.public ?? sshRuntimePort?.publicPort ?? pod?.portMappings?.["22"] ?? 0',
    '                );'
  ].join("\n"),
  "V142_RUNPOD_REST_V2_SSH_RUNTIME_PORT"
);

const launchAnchor = "    async function launch({ job }) {";
if (!engine.includes("async function provisionPodWithGraphQlV142(")) {
  const helper = [
    "    async function provisionPodWithGraphQlV142(body, operationId) {",
    "        const input = {",
    "            cloudType: body.cloudType,",
    "            containerDiskInGb: body.containerDiskInGb,",
    "            env: Object.entries(body.env || {}).map(([key, value]) => ({",
    "                key,",
    "                value: String(value)",
    "            })),",
    "            gpuCount: body.gpuCount,",
    "            gpuTypeId: body.gpuTypeIds?.[0],",
    "            imageName: body.imageName,",
    "            minMemoryInGb: body.minRAMPerGPU,",
    "            minVcpuCount: body.minVCPUPerGPU,",
    "            name: body.name,",
    "            ports: Array.isArray(body.ports) ? body.ports.join(\",\") : String(body.ports || \"\"),",
    "            startSsh: true,",
    "            supportPublicIp: true,",
    "            volumeMountPath: body.volumeMountPath || \"/workspace\"",
    "        };",
    "        if (Object.hasOwn(body, \"volumeInGb\")) input.volumeInGb = Number(body.volumeInGb || 0);",
    "        if (body.networkVolumeId) input.networkVolumeId = body.networkVolumeId;",
    "        if (Array.isArray(body.dataCenterIds) && body.dataCenterIds.length === 1) {",
    "            input.dataCenterId = body.dataCenterIds[0];",
    "        }",
    "        const query = [",
    "            \"mutation JarvisV142Provision($input: PodFindAndDeployOnDemandInput!) {\",",
    "            \"  podFindAndDeployOnDemand(input: $input) {\",",
    "            \"    id\",",
    "            \"    costPerHr\",",
    "            \"    desiredStatus\",",
    "            \"    lastStatusChange\",",
    "            \"  }\",",
    "            \"}\"",
    "        ].join(\"\\n\");",
    "        const separator = graphQlBase.includes(\"?\") ? \"&\" : \"?\";",
    "        const payload = await apiRequest(",
    "            `${graphQlBase}${separator}api_key=${encodeURIComponent(apiKey)}` ,",
    "            { method: \"POST\", body: JSON.stringify({ query, variables: { input } }) },",
    "            [200],",
    "            \"provision\",",
    "            operationId",
    "        );",
    "        if (Array.isArray(payload?.errors) && payload.errors.length > 0) {",
    "            const failure = new Error(\"RUNPOD_PROVISION_GRAPHQL_FAILED\");",
    "            failure.retryable = false;",
    "            failure.stage = \"provision\";",
    "            failure.providerCode = \"GRAPHQL_ERROR\";",
    "            failure.providerMessage = sanitizeProviderText(",
    "                payload.errors.map(item => item?.message || item).filter(Boolean).join(\"; \"),",
    "                1000",
    "            );",
    "            throw failure;",
    "        }",
    "        const pod = payload?.data?.podFindAndDeployOnDemand || null;",
    "        if (!String(pod?.id || \"\").trim()) {",
    "            const failure = new Error(\"RUNPOD_PROVISION_RESPONSE_INVALID\");",
    "            failure.retryable = false;",
    "            failure.stage = \"provision\";",
    "            throw failure;",
    "        }",
    "        return pod;",
    "    }",
    ""
  ].join("\n");
  engine = engine.replace(launchAnchor, `${helper}\n${launchAnchor}`);
}

engine = replaceExactOnce(
  engine,
  [
    '            const pod = await apiRequest(`${apiBase}/pods`, {',
    '                method: "POST",',
    '                body: JSON.stringify(body)',
    '            }, [200, 201], "provision", job.operationId);'
  ].join("\n"),
  '            const pod = await provisionPodWithGraphQlV142(body, job.operationId);',
  "V142_RUNPOD_GRAPHQL_PROVISION"
);

engine = replaceExactOnce(
  engine,
  '            const actualVram = Number(pod?.gpu?.memoryInGb || availability.vramGb || expectedVramGb);',
  '            const actualVram = Number(availability.vramGb || expectedVramGb);',
  "V142_RUNPOD_GRAPHQL_PROVISION_VRAM"
);

engine = replaceExactOnce(
  engine,
  [
    '            const hourlyRateUsd = Number(',
    '                pod?.adjustedCostPerHr || pod?.costPerHr || availability.hourlyRateUsd',
    '            );'
  ].join("\n"),
  [
    '            const hourlyRateUsd = Number(',
    '                pod?.cost ?? pod?.costPerHr ?? availability.hourlyRateUsd',
    '            );'
  ].join("\n"),
  "V142_RUNPOD_GRAPHQL_PROVISION_COST"
);

engine = replaceExactOnce(
  engine,
  [
    '                const billing = await apiRequest(',
    '                    `${apiBase}/billing/pods?podId=${encodeURIComponent(state.podId)}&grouping=podId&bucketSize=hour`,',
    '                    { method: "GET" },',
    '                    [200],',
    '                    "billing",',
    '                    state.operationId',
    '                );',
    '                actualCostUsd = (Array.isArray(billing) ? billing : [])',
    '                    .filter(item => item?.podId === state.podId)',
    '                    .reduce((sum, item) => sum + Number(item.amount || 0), 0);'
  ].join("\n"),
  [
    '                const billing = await apiRequest(',
    '                    `${apiBase}/billing/pods?podId=${encodeURIComponent(state.podId)}&bucketSize=hour&lastN=2`,',
    '                    { method: "GET" },',
    '                    [200],',
    '                    "billing",',
    '                    state.operationId',
    '                );',
    '                const billingRecords = Array.isArray(billing?.records)',
    '                    ? billing.records',
    '                    : (Array.isArray(billing) ? billing : []);',
    '                actualCostUsd = billingRecords',
    '                    .filter(item => !item?.podId || item.podId === state.podId)',
    '                    .reduce((sum, item) => sum + Number(item.totalAmount ?? item.amount ?? 0), 0);'
  ].join("\n"),
  "V142_RUNPOD_REST_V2_BILLING"
);

for (const marker of [
  'https://api.runpod.io/v2',
  'async function provisionPodWithGraphQlV142(',
  'PodFindAndDeployOnDemandInput!',
  'minMemoryInGb: body.minRAMPerGPU',
  'minVcpuCount: body.minVCPUPerGPU',
  '/network-volumes',
  'pod?.status || pod?.desiredStatus',
  'runtimePorts',
  'totalAmount ?? item.amount'
]) {
  if (!engine.includes(marker)) throw new Error(`V142_RUNPOD_V2_MARKER_MISSING:${marker}`);
}
if (engine.includes('https://rest.runpod.io/v1')) {
  throw new Error("V142_RUNPOD_V1_CONTROL_PLANE_REMAINS");
}
write(ENGINE, engine);

let tests = read(TEST);

tests = tests.split('\"/networkvolumes\"').join('\"/network-volumes\"');
tests = tests.split('\"networkvolumes\"').join('\"network-volumes\"');
tests = tests.split("https://rest.runpod.io/v1/pods").join("https://api.runpod.io/graphql");

tests = replaceExactOnce(
  tests,
  "    let createdBody = null;\n    let capturedJob = null;",
  "    let createdBody = null;\n    let createdGraphQlInput = null;\n    let capturedJob = null;",
  "V142_TEST_GRAPHQL_INPUT_STATE"
);

tests = replaceExactOnce(
  tests,
  '            const query = JSON.parse(options.body || "{}").query || "";',
  [
    '            const graphQlRequest = JSON.parse(options.body || "{}");',
    '            const query = graphQlRequest.query || "";',
    '            if (query.includes("podFindAndDeployOnDemand")) {',
    '                const input = graphQlRequest.variables?.input || {};',
    '                createdGraphQlInput = input;',
    '                const envObject = Object.fromEntries(',
    '                    (Array.isArray(input.env) ? input.env : [])',
    '                        .map(item => [String(item?.key || ""), String(item?.value || "")])',
    '                        .filter(([key]) => key)',
    '                );',
    '                createdBody = {',
    '                    cloudType: input.cloudType,',
    '                    containerDiskInGb: input.containerDiskInGb,',
    '                    volumeMountPath: input.volumeMountPath,',
    '                    gpuCount: input.gpuCount,',
    '                    gpuTypeIds: input.gpuTypeId ? [input.gpuTypeId] : [],',
    '                    imageName: input.imageName,',
    '                    minRAMPerGPU: input.minMemoryInGb,',
    '                    minVCPUPerGPU: input.minVcpuCount,',
    '                    ports: String(input.ports || "").split(",").filter(Boolean),',
    '                    supportPublicIp: input.supportPublicIp === true,',
    '                    name: input.name,',
    '                    env: envObject,',
    '                    ...(Object.hasOwn(input, "volumeInGb") ? { volumeInGb: input.volumeInGb } : {}),',
    '                    ...(input.networkVolumeId ? { networkVolumeId: input.networkVolumeId } : {}),',
    '                    ...(input.dataCenterId ? { dataCenterIds: [input.dataCenterId] } : {})',
    '                };',
    '                calls.at(-1).providerOperation = "provision";',
    '                if (scenario === "provision-fail") return mockHttpResponse(503, { error: "controlled" });',
    '                if (scenario === "provision-http-500-diagnostic") {',
    '                    return mockHttpResponse(500, {',
    '                        error: "internal scheduling error",',
    '                        credential: env.RUNPOD_API_KEY',
    '                    }, {',
    '                        "content-type": "application/json; charset=utf-8",',
    '                        "x-request-id": "req-v142-cpu-500",',
    '                        "set-cookie": "provider-session-must-not-persist"',
    '                    });',
    '                }',
    '                return mockHttpResponse(200, {',
    '                    data: {',
    '                        podFindAndDeployOnDemand: {',
    '                            id: "pod-l40s-v142",',
    '                            costPerHr: String(gpuTypeId === "NVIDIA L40S" ? 0.99 : 0.44),',
    '                            desiredStatus: "RUNNING",',
    '                            lastStatusChange: "2026-09-05T00:00:00.000Z"',
    '                        }',
    '                    }',
    '                });',
    '            }'
  ].join("\n"),
  "V142_TEST_GRAPHQL_PROVISION_FIXTURE"
);

tests = replaceExactOnce(
  tests,
  '        get createdBody() { return createdBody; },',
  '        get createdBody() { return createdBody; },\n        get createdGraphQlInput() { return createdGraphQlInput; },',
  "V142_TEST_GRAPHQL_INPUT_GETTER"
);

tests = tests.split('call.method === "POST" && call.url.endsWith("/pods")')
  .join('call.providerOperation === "provision"');
tests = tests.split('call.url.endsWith("/pods") && call.method === "POST"')
  .join('call.providerOperation === "provision"');

const v2Test = `test("V142 RunPod control plane avoids deprecated REST v1 while preserving hard placement constraints", async () => {
    const engineSource = fs.readFileSync(new URL("../jarvis-local-video-engine.js", import.meta.url), "utf8");
    assert.equal(engineSource.includes("https://rest.runpod.io/v1"), false);
    assert.equal(engineSource.includes("https://api.runpod.io/v2"), true);
    assert.equal(engineSource.includes("PodFindAndDeployOnDemandInput!"), true);
    assert.equal(engineSource.includes("minMemoryInGb: body.minRAMPerGPU"), true);
    assert.equal(engineSource.includes("minVcpuCount: body.minVCPUPerGPU"), true);
    assert.equal(engineSource.includes("/network-volumes"), true);
    assert.equal(engineSource.includes("totalAmount ?? item.amount"), true);

    const harness = runpodPhysicalHarness({ scenario: "rest-v2-graphql-provision" });
    const started = await harness.engine.start(harness.payload);
    assert.equal(started.ok, true, JSON.stringify(started));
    assert.equal(harness.createdGraphQlInput.gpuTypeId, "NVIDIA L40S");
    assert.equal(harness.createdGraphQlInput.gpuCount, 1);
    assert.equal(harness.createdGraphQlInput.minMemoryInGb, 62);
    assert.equal(harness.createdGraphQlInput.minVcpuCount, 16);
    assert.equal(harness.createdGraphQlInput.imageName, RUNPOD_WAN22_GPU_PROFILES["NVIDIA L40S"].provisionImageTag);
    assert.equal(harness.createdGraphQlInput.startSsh, true);
    assert.equal(harness.createdGraphQlInput.supportPublicIp, true);
    assert.equal(harness.calls.some(call =>
        call.providerOperation === "provision" &&
        call.url.startsWith("https://api.runpod.io/graphql")
    ), true);
    assert.equal(harness.calls.some(call =>
        call.url.startsWith("https://rest.runpod.io/")
    ), false);
    const cancelled = await harness.engine.cancel({ operationName: started.operationName });
    assert.equal(cancelled.workerRelease.terminationVerified, true);
});`;

tests = appendOnce(
  tests,
  'test("V142 RunPod control plane avoids deprecated REST v1 while preserving hard placement constraints"',
  v2Test
);

write(TEST, tests);

execFileSync(process.execPath, ["--check", ENGINE], { stdio: "inherit" });
execFileSync(process.execPath, ["--test", "--test-concurrency=1", TEST], {
  stdio: "inherit",
  maxBuffer: 64 * 1024 * 1024
});

console.log(JSON.stringify({
  ok: true,
  status: "V142_RUNPOD_V2_CONTROL_PLANE_WITH_GRAPHQL_PROVISIONING",
  restBase: "https://api.runpod.io/v2",
  deprecatedRestV1Allowed: false,
  podProvisioningTransport: "graphql",
  podLifecycleTransport: "rest-v2",
  hardPlacementConstraintsPreserved: {
    minimumRamGb: 62,
    minimumVcpu: 16
  },
  humoIdentityInferenceAuthorized: false,
  billableGpuCreated: false,
  newFiles: false,
  newWorkflow: false
}));
