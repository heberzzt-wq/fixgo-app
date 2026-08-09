from pathlib import Path

path = Path('tests/jarvis-multifunction-tools.test.mjs')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'CONTRACT_PATCH_ANCHOR_FAILED:{label}:{count}')
    text = text.replace(old, new, 1)


replace_once(
    'test("pure attachment analysis deterministically rejects stale marketing, document and image generation routes", async () => {',
    'test("client planner does not override semantic intent with a lexical attachment router", async () => {',
    'semantic-authority-test-name'
)

replace_once(
    '''    assert.deepEqual(
        result.map(call => call.name),
        ["media.analyze"]
    );
    assert.equal(
        result[0].reason,
        "ATTACHMENT_ANALYSIS_ROUTE_ENFORCED"
    );
});

test("pure attachment analysis keeps only one existing media analysis call", () => {''',
    '''    assert.deepEqual(
        result.map(call => call.name),
        ["marketing.plan", "document.create", "image.generate"]
    );
    assert.equal(
        result.every(call => call.reason !== "ATTACHMENT_ANALYSIS_ROUTE_ENFORCED"),
        true
    );
});

test("trusted plan keeps model-selected calls instead of lexically collapsing the turn", () => {''',
    'semantic-authority-first-expectation'
)

replace_once(
    '''    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "media.analyze");
    assert.deepEqual(calls[0].args.questions, ["Compara"]);
    assert.equal(calls[0].reason, "MODEL_SELECTED_MEDIA");
});''',
    '''    assert.deepEqual(
        calls.map(call => call.name),
        ["media.analyze", "image.generate"]
    );
    assert.deepEqual(calls[0].args.questions, ["Compara"]);
    assert.equal(calls[0].reason, "MODEL_SELECTED_MEDIA");
});''',
    'semantic-authority-second-expectation'
)

replace_once(
    '        "4.15.0-attachment-analysis-route"',
    '        "4.16.0-generalist-current-turn"',
    'planner-version-contract'
)

path.write_text(text, encoding='utf-8')
print('V94_GENERALIST_SEMANTIC_CONTRACT_FIX_APPLIED')
