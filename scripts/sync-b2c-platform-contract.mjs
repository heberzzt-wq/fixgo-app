import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "gestia-core", "contracts", "b2c-platform-contract.js");
const target = path.join(root, "functions", "generated", "b2c-platform-contract.cjs");
const bytes = fs.readFileSync(source);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, bytes);

if (!fs.readFileSync(target).equals(bytes)) {
    throw new Error("B2C_PLATFORM_CONTRACT_SYNC_FAILED");
}

console.log(`B2C platform contract synchronized (${bytes.length} bytes)`);
