import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
    addRepositoryDiscoveryPreflights,
    analyzeRepoSourceStructure,
    buildExecutableSourceView,
    extractQualifiedSourceIdentifiers,
    resolveExplicitRepositoryTargets
} from "../gestia-core/repo/repo.source.structure.js";

const __dirname =
    path.dirname(
        fileURLToPath(import.meta.url)
    );

test('namespaced writes retain exact nested collection ownership and ignore unrelated setters', () => {
 const bindings=analyzeRepoSourceStructure('const ref=db.collection("accounts").doc(accountId).collection("devices").doc(); ref.set({details:{serial:value}}); db.collection("owners").doc(uid).update({name:value}); db.collection("entries").add({label:value}); cache.set({invented:value});').dataBindings;
 assert.deepEqual(bindings.writeShapes.map(shape=>[shape.collection,shape.fields]),[
  ['accounts/{accountId}/devices',['details','details.serial']],['owners',['name']],['entries',['label']]
 ]);
 assert.ok(!bindings.writeShapes.some(shape=>shape.fields.includes('invented')));
});

test("an explicit file read uses the filesystem even when absent from the browser index", () => {
    const catalog = [
        { name: "repo.search", mutates: false, inputSchema: { required: ["query"] } },
        { name: "repo.read", mutates: false, inputSchema: { required: ["file"] } }
    ];
    const read = { name: "repo.read", args: { file: "jarvis-runtime-contract.json" } };
    const options = { toolCalls: [read], catalog, repositoryIndex: { app: { path: "app.js" } } };
    const explicitTargets = resolveExplicitRepositoryTargets("Lee jarvis-runtime-contract.json sin modificar nada.");
    assert.deepEqual(addRepositoryDiscoveryPreflights({ ...options, explicitTargets }), [read]);
    assert.deepEqual(addRepositoryDiscoveryPreflights(options).map(call => call.name), ["repo.search", "repo.read"]);
});

test("source structure indexes real multifunction registrations with lines", () => {
    const source =
        fs.readFileSync(
            path.join(
                __dirname,
                "..",
                "gestia-core",
                "jarvis",
                "jarvis.multitool.pack.js"
            ),
            "utf8"
        );

    const structure =
        analyzeRepoSourceStructure(source);

    const marketing =
        structure.registrations.find(item =>
            item.name === "marketing.plan"
        );

    const image =
        structure.registrations.find(item =>
            item.name === "image.plan"
        );

    assert.equal(
        structure.kind,
        "tool_registry"
    );

    assert.ok(
        structure.registrationCount >= 13
    );

    assert.ok(marketing);
    assert.ok(image);
    assert.ok(marketing.line > 0);
    assert.ok(image.line > marketing.line);
    assert.equal(
        marketing.inputSchema,
        "MARKETING_ARGUMENT_SCHEMA"
    );
    assert.equal(
        image.inputSchema,
        "IMAGE_PLAN_ARGUMENT_SCHEMA"
    );
    assert.equal(
        marketing.output,
        "SIA7_MARKETING_PLAN"
    );
    assert.equal(
        image.output,
        "SIA7_IMAGE_REQUIREMENTS_PLAN"
    );
});

test("source structure ignores backticks inside regex literals before tool registrations", () => {
    const tick = String.fromCharCode(96);
    const source = [
        "const quoted = /[\"" + "'" + tick + "]/g;",
        "register(runtime, {",
        '  name: "conversation.respond",',
        '  description: "Respuesta semántica local",',
        '  output: "SIA7_CONVERSATION_RESPONSE",',
        "  inputSchema: CONVERSATION_SCHEMA,",
        "  execute: async () => ({ ok: true })",
        "});"
    ].join("\n");

    const executable =
        buildExecutableSourceView(source);

    assert.equal(
        executable.includes(tick),
        false
    );

    const structure =
        analyzeRepoSourceStructure(source);

    assert.equal(
        structure.kind,
        "tool_registry"
    );
    assert.equal(
        structure.registrationCount,
        1
    );
    assert.equal(
        structure.registrations[0].name,
        "conversation.respond"
    );
    assert.equal(
        structure.registrations[0].inputSchema,
        "CONVERSATION_SCHEMA"
    );
});

test("executable source view excludes documentary role markers", () => {
    const source = [
        "const markers = [",
        "  \"resolveGestiaRouteDecision\",",
        "  \"[ROLE_AUTHORITY_REDIRECT]\",",
        "  \"gestia-auth-pending\"",
        "];",
        "runtime.register({",
        "  name: \"example.tool\",",
        "  execute: async () => window.ToolsBridge.executeMany([])",
        "});"
    ].join("\n");

    const executable =
        buildExecutableSourceView(source);

    assert.equal(
        executable.includes(
            "resolveGestiaRouteDecision"
        ),
        false
    );
    assert.equal(
        executable.includes(
            "ROLE_AUTHORITY_REDIRECT"
        ),
        false
    );
    assert.equal(
        executable.includes(
            "gestia-auth-pending"
        ),
        false
    );
    assert.equal(
        executable.includes(
            "ToolsBridge.executeMany"
        ),
        true
    );
});

test("qualified identifier extraction finds tool symbols without phrase rules", () => {
    assert.deepEqual(
        extractQualifiedSourceIdentifiers(
            "MODO READ ONLY. Busca marketing.plan e image.plan; revisa gestia-core/jarvis/jarvis.multitool.pack.js."
        ),
        [
            "marketing.plan",
            "image.plan",
            "jarvis.multitool.pack.js"
        ]
    );
});

test("explicit repository targets keep every named file and exclude runtime tool identifiers", () => {
    assert.deepEqual(
        resolveExplicitRepositoryTargets(
            "Revisa app-login.js, firebase.js, app-main.js y gestia-terminal.html; confirma marketing.plan en gestia-core/jarvis/jarvis.multitool.pack.js.",
            {
                registeredToolNames: [
                    "marketing.plan",
                    "image.plan"
                ]
            }
        ),
        [
            "app-login.js",
            "firebase.js",
            "app-main.js",
            "gestia-terminal.html",
            "gestia-core/jarvis/jarvis.multitool.pack.js"
        ]
    );
});

test("unresolved schema-required repo files receive discovery preflights from the live index", () => {
    const catalog = [{
        name: "repo.search",
        mutates: false,
        inputSchema: {
            type: "object",
            required: ["query"]
        }
    }, {
        name: "repo.diagnose",
        mutates: false,
        inputSchema: {
            type: "object",
            required: ["file"]
        }
    }, {
        name: "repo.read",
        mutates: false,
        inputSchema: {
            type: "object",
            required: ["file"]
        }
    }];
    const calls =
        addRepositoryDiscoveryPreflights({
            toolCalls: [{
                name: "repo.diagnose",
                args: {
                    file: "tecnico b2b"
                }
            }, {
                name: "repo.read",
                args: {
                    file: "app-login.js"
                }
            }],
            catalog,
            repositoryIndex: {
                login: {
                    path: "app-login.js"
                },
                tecnico: {
                    path: "tecnico-b2b.html"
                }
            }
        });

    assert.deepEqual(
        calls.map(call => ({
            name: call.name,
            args: call.args
        })),
        [{
            name: "repo.search",
            args: {
                query: "tecnico b2b"
            }
        }, {
            name: "repo.diagnose",
            args: {
                file: "tecnico b2b"
            }
        }, {
            name: "repo.read",
            args: {
                file: "app-login.js"
            }
        }]
    );
});


test('snapshot reads retain collection ownership through lexical aliases without crediting alert fallbacks', () => {
 const source = [
  'import {collection as col, query as select, getDocs as rows, getDoc as one, doc as ref} from "firebase/firestore";',
  'async function first(db) {',
  ' const registry = col(db,"entries"); const q = select(registry);',
  ' const snapshot = await rows(q); const alias = snapshot;',
  ' alias.forEach(item => { const record = item.data(); const copy = record;',
  '   consume(copy.owner.id, record["due"], {metadata:{holder:record.holder || "fallback"}}); });',
  '}',
  'async function second(db) {',
  ' const registry = col(db,"profiles"); const snapshot = await rows(registry);',
  ' snapshot.forEach(item => { const record = item.data(); consume(record.label); });',
  ' const summary = await one(ref(db,"totals", "current")); consume(summary.data().count);',
  '}'
 ].join('\n');
 const bindings=analyzeRepoSourceStructure(source).dataBindings;
 const fields=collection=>[...new Set(bindings.queryShapes.filter(s=>s.collection===collection).flatMap(s=>s.fields))].sort();
 assert.deepEqual(fields('entries'),['due','holder','owner','owner.id']);
 assert.deepEqual(fields('profiles'),['label']);assert.deepEqual(fields('totals'),['count']);
 assert.ok(bindings.queryShapes.every(s=>Number.isInteger(s.startLine)&&s.endLine>=s.startLine));
 assert.ok(!fields('entries').includes('metadata.holder'));assert.ok(!JSON.stringify(bindings.queryShapes).includes('fallback'));
});

test('snapshot provenance rejects unrelated callbacks, shadowed imports and reassigned aliases', () => {
 const source=[
  'import {collection,getDocs} from "firebase/firestore";',
  'async function scan(db,unrelated) {const snap=await getDocs(collection(db,"entries"));',
  ' unrelated.forEach(doc=>consume(doc.data().fake));',
  ' snap.forEach(doc=>{ doc=unrelated; consume(doc.data().reassigned); });',
  ' snap.forEach(doc=>{const data=doc.data(); data.injected=true; consume(data.injected);});',
  ' snap.forEach(doc=>{const data=doc.data(); const alias=data; alias.aliasInjected=true; consume(data.aliasInjected);});',
  ' snap.forEach(doc=>{({doc}=unrelated); consume(doc.data().destructured);});',
  ' snap.forEach(doc=>{const data=doc.data(); {const data=unrelated; consume(data.shadow);} consume(data.valid);});}',
  'async function other(db,getDocs){const snap=await getDocs(collection(db,"profiles"));snap.forEach(doc=>consume(doc.data().fake));}'
 ].join('\n');
 const shapes=analyzeRepoSourceStructure(source).dataBindings.queryShapes;
 assert.deepEqual([...new Set(shapes.flatMap(s=>s.fields))],['valid']);
 assert.ok(shapes.every(s=>s.collection==='entries'));
 const foreign=analyzeRepoSourceStructure('import {collection,getDocs} from "unrelated-store"; async function scan(db){const rows=await getDocs(collection(db,"foreign"));rows.forEach(doc=>consume(doc.data().fake));}').dataBindings.queryShapes;
 assert.deepEqual(foreign,[]);
});
