from pathlib import Path

artifact_path = Path("jarvis-page-artifact.js")
source = artifact_path.read_text(encoding="utf-8")
old = '''    const phoneHref = whatsapp
        ? `https://wa.me/${whatsapp}`
        : whatsappRequested
            ? "https://wa.me/"
            : "";
'''
new = '''    const phoneHref = whatsapp
        ? `https://wa.me/${whatsapp}`
        : "";
'''
if source.count(old) != 1:
    raise SystemExit(f"expected one unverified WhatsApp fallback, found {source.count(old)}")
artifact_path.write_text(source.replace(old, new, 1), encoding="utf-8")

test_path = Path("tests/jarvis-page-artifact.test.mjs")
test_source = test_path.read_text(encoding="utf-8")
old_test = '''test("page studio supports an honest generic WhatsApp CTA without inventing a number", () => {
    const html = buildPageArtifactHtml({
        ...input,
        whatsapp: "",
        contactEmail: "",
        whatsappRequested: true
    });
    assert.match(html, /https:\\/\\/wa\\.me\\/\\?text=/);
    assert.doesNotMatch(html, /529981234567/);
});
'''
new_test = '''test("page studio never invents a generic WhatsApp route when no verified number exists", () => {
    const pageInput = {
        ...input,
        whatsapp: "",
        contactEmail: "",
        whatsappRequested: true
    };
    const html = buildPageArtifactHtml(pageInput);
    const report = describePageArtifact(pageInput, html);
    assert.doesNotMatch(html, /wa\\.me/);
    assert.doesNotMatch(html, /529981234567/);
    assert.match(html, /href="#servicios"/);
    assert.match(html, /Explorar servicios/);
    assert.equal(report.hasContactRoute, false);
    assert.ok(Object.values(report.checks).every(Boolean));
});
'''
if test_source.count(old_test) != 1:
    raise SystemExit(f"expected one obsolete generic WhatsApp test, found {test_source.count(old_test)}")
test_path.write_text(test_source.replace(old_test, new_test, 1), encoding="utf-8")

print("v118 verified contact route repair applied")
