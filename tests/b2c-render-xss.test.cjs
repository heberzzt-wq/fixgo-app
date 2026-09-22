const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const acorn = require('acorn');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
function walk(node, visit) {
    if (!node || typeof node !== 'object') return;
    if (node.type) visit(node);
    for (const [key, value] of Object.entries(node)) if (key !== 'parent') {
        if (Array.isArray(value)) value.forEach(child => walk(child, visit));
        else if (value && typeof value === 'object') walk(value, visit);
    }
}
function nodes(text, type) {
    const found = [];
    walk(acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module' }), n => { if (n.type === type) found.push(n); });
    return found;
}
const utilSource = source('app-utils.js');
const context = vm.createContext({ URL });
for (const name of ['escaparHTML', 'urlHttpsParaHTML']) {
    const declaration = nodes(utilSource, 'VariableDeclarator').find(n => n.id.name === name);
    vm.runInContext(`globalThis.${name} = ${utilSource.slice(declaration.init.start, declaration.init.end)}`, context);
}
function parseHTML(html) {
    const script = `import json,sys\nfrom html.parser import HTMLParser\nclass Parser(HTMLParser):\n def __init__(self): super().__init__(convert_charrefs=True); self.tags=[]\n def handle_starttag(self,tag,attrs): self.tags.append([tag,dict(attrs)])\np=Parser();p.feed(sys.stdin.read());print(json.dumps(p.tags))`;
    const result = spawnSync('python', ['-c', script], { input: html, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}
const attack = `https://example.test/x" onerror="alert(1)" data-x="`;
const textAttack = `<img src=x onerror="alert(1)"><script>alert(1)</script>`;
const storage = 'https://firebasestorage.googleapis.com/v0/b/fixgo-44e4d.firebasestorage.app/o/evidencias%2Ffoto.jpg?alt=media&token=legacy';
function assertSafe(html) {
    for (const [tag, attrs] of parseHTML(html)) {
        assert.notEqual(tag, 'script');
        assert.equal(Object.keys(attrs).some(key => /^on/i.test(key)), false, html);
        for (const key of ['href', 'src']) if (attrs[key]) assert.equal(new URL(attrs[key]).protocol, 'https:');
    }
}
test('baseline raw photo interpolation demonstrates quote-injection; shared helper rejects active schemes', () => {
    assert.equal(parseHTML(`<img src="${attack}">`)[0][1].onerror, 'alert(1)');
    for (const invalid of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', '//example.test/x', 'http://example.test/x', 'https://user:pass@example.test/x', null]) {
        assert.equal(context.urlHttpsParaHTML(invalid), '');
    }
    assert.equal(context.urlHttpsParaHTML(storage), storage.replace('&', '&amp;'));
});
test('actual client and technician photo/evidence template literals cannot create executable attributes', () => {
    let count = 0;
    for (const filename of ['panel-cliente.js', 'panel-tecnico.js']) {
        const code = source(filename);
        const templates = nodes(code, 'TemplateLiteral').filter(n => {
            const raw = code.slice(n.start, n.end);
            return raw.includes('<img src="${urlHttpsParaHTML(') && !n.expressions.some(e => e.type === 'ConditionalExpression');
        }).filter(n => !nodes(code, 'TemplateLiteral').some(child => child.start > n.start && child.end < n.end && code.slice(child.start, child.end).includes('<img')));
        for (const template of templates) {
            const raw = code.slice(template.start, template.end);
            // Photo fragments are leaf templates; larger card templates have additional unrelated bindings.
            if (!/urlHttpsParaHTML\((s\.foto_problema|f_[ad][12])\)/.test(raw)) continue;
            for (const url of [attack, storage, 'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
                Object.assign(context, { s: { foto_problema: url }, f_a1: url, f_a2: url, f_d1: url, f_d2: url });
                const html = vm.runInContext(raw, context);
                assertSafe(html);
                if (url === storage) assert.equal(parseHTML(html).find(([t]) => t === 'img')[1].src, storage);
            }
            count++;
        }
    }
    assert.equal(count, 7, 'three initial photo fragments and four evidence images');
});
test('actual quote fields escape arbitrary strings and logistics text expressions retain no injected tags', () => {
    const code = source('panel-cliente.js');
    const row = nodes(code, 'TemplateLiteral').find(n => code.slice(n.start,n.end).includes('<tr>') && code.slice(n.start,n.end).includes('escaparHTML(item.cantidad)') && n.expressions.length === 5);
    assert.ok(row);
    context.item = {cantidad:textAttack, unidad:textAttack, descripcion:textAttack, precio:textAttack};
    const html = vm.runInContext(code.slice(row.start,row.end), context);
    assertSafe(html);
    assert.equal(parseHTML(html).some(([tag]) => tag === 'img'), false);
    for (const field of ['techNombre','techVehiculo','techPlacas','s.desglose.subtotal','s.desglose.iva']) {
        assert.ok(code.includes(`escaparHTML(${field})`), field);
    }
    const attr = /onclick="(navigator\.clipboard\.writeText\([^\n]+)"/.exec(code)[1];
    context.techPlacas = `');alert(1);//${textAttack}`;
    const markup = vm.runInContext('`<button onclick="'+attr+'">Placas</button>`', context);
    const handler = parseHTML(markup)[0][1].onclick;
    const actions = [];
    vm.runInNewContext(handler, {navigator:{clipboard:{writeText:v=>actions.push(v)}},alert:v=>actions.push(v)});
    assert.deepEqual(actions, [context.techPlacas, 'Placas copiadas: '+context.techPlacas]);
});
test('balance uses confirmed monto_pagado, not estimated retencion_inicial', () => {
    const code = source('panel-cliente.js');
    const start = code.indexOf('let saldoPendiente =');
    const end = code.indexOf('let btnAprobarHTML', start);
    const fragment = code.slice(start, end);
    assert.ok(!fragment.includes('retencion_inicial'));
    assert.equal(vm.runInNewContext(fragment+';saldoPendiente', {s:{costo_final:1000,monto_pagado:200,retencion_inicial:500}}),800);
});
