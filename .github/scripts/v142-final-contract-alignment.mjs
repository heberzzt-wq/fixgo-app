import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const BASE_MATERIALIZER_COMMIT = "20e627289205b08e679389432c8376bbf45799f2";
const MATERIALIZER_PATH = ".github/scripts/v142-final-contract-alignment.mjs";

const baseMaterializer = execFileSync(
  "git",
  ["show", `${BASE_MATERIALIZER_COMMIT}:${MATERIALIZER_PATH}`],
  { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
).replace(/\r\n/g, "\n");

const materialized = spawnSync(process.execPath, ["--input-type=module", "-"], {
  cwd: process.cwd(),
  input: baseMaterializer,
  encoding: "utf8",
  stdio: ["pipe", "inherit", "inherit"]
});
if (materialized.error) throw materialized.error;
if (materialized.status !== 0) {
  throw new Error(`V142_BASE_MATERIALIZER_EXIT_${materialized.status}`);
}

if (process.platform === "linux" && process.env.GITHUB_JOB === "certify-linux") {
  const fileName = "flash_attn-2.6.3+cu124torch2.5-cp311-cp311-linux_x86_64.whl";
  const wheelUrl = "https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.0.0/flash_attn-2.6.3%2Bcu124torch2.5-cp311-cp311-linux_x86_64.whl";
  const expectedBytes = 182448572;
  const wheelFile = `/tmp/${fileName}`;
  try {
    execFileSync(
      "curl",
      ["--fail", "--location", "--retry", "2", "--output", wheelFile, wheelUrl],
      { stdio: "inherit", maxBuffer: 4 * 1024 * 1024 }
    );
    const bytes = fs.statSync(wheelFile).size;
    if (bytes !== expectedBytes) {
      throw new Error(`V142_HUMO_FLASH_ATTN_WHEEL_BYTES_${bytes}`);
    }
    const sha256 = execFileSync("sha256sum", [wheelFile], { encoding: "utf8" })
      .trim()
      .split(/\s+/)[0]
      .toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new Error("V142_HUMO_FLASH_ATTN_WHEEL_SHA256_INVALID");
    }
    console.log(JSON.stringify({
      ok: true,
      status: "V142_HUMO_FLASH_ATTN_WHEEL_SHA256_DISCOVERED",
      fileName,
      bytes,
      sha256,
      runpodTrafficUsed: false,
      paidProviderTrafficUsed: false,
      billableGpuCreated: false
    }));
  }
  finally {
    fs.rmSync(wheelFile, { force: true });
  }
}

console.log(JSON.stringify({
  ok: true,
  status: "V142_HUMO_FLASH_ATTN_WHEEL_FINGERPRINT_PROBE_READY",
  baseMaterializerCommit: BASE_MATERIALIZER_COMMIT,
  runpodTrafficUsed: false,
  paidProviderTrafficUsed: false,
  billableGpuCreated: false,
  runtimeCertificationOnly: true,
  inferenceAuthorized: false,
  newFiles: false,
  newBrains: false
}));
