import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const sourcePath = '.github/scripts/v146-source-freshness-verification.mjs';
const targetPath = '/tmp/v146-source-freshness-verification-fixed.mjs';
let source = fs.readFileSync(sourcePath, 'utf8');

const badLine = "        `Las fuentes anteriores no demostraron una fecha suficientemente reciente${cutoffDate ? ` (corte ${cutoffDate})` : ''}.`,";
const goodLine = "        'Las fuentes anteriores no demostraron una fecha suficientemente reciente' + (cutoffDate ? ' (corte ' + cutoffDate + ')' : '') + '.',";

if (!source.includes(badLine)) {
    throw new Error('V146_RUNNER_ESCAPE_MARKER_MISSING');
}

source = source.replace(badLine, goodLine);
fs.writeFileSync(targetPath, source);
await import(`${pathToFileURL(targetPath).href}?v=${Date.now()}`);
