import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const sourcePath = '.github/scripts/v146-source-freshness-verification.mjs';
const targetPath = '/tmp/v146-source-freshness-verification-fixed.mjs';
let source = fs.readFileSync(sourcePath, 'utf8');

const replacements = [
    [
        "        `Las fuentes anteriores no demostraron una fecha suficientemente reciente${cutoffDate ? ` (corte ${cutoffDate})` : ''}.`,",
        "        'Las fuentes anteriores no demostraron una fecha suficientemente reciente' + (cutoffDate ? ' (corte ' + cutoffDate + ')' : '') + '.',"
    ],
    [
        "        return { ...request, contents: `${contents}\\n${directive}` };",
        "        return { ...request, contents: String(contents) + '\\n' + directive };"
    ]
];

for (const [before, after] of replacements) {
    if (!source.includes(before)) {
        throw new Error(`V146_RUNNER_ESCAPE_MARKER_MISSING:${before.slice(0, 48)}`);
    }
    source = source.replace(before, after);
}

fs.writeFileSync(targetPath, source);
await import(`${pathToFileURL(targetPath).href}?v=${Date.now()}`);
