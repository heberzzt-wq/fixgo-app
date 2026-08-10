import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
    identityNearCopyMismatch,
    rejectCorruptedIdentityArgs,
    repairCanonicalIdentityCopy,
    repairCanonicalIdentityValue
} from "../gestia-core/jarvis/jarvis.identity.integrity.js";
import {
    buildJarvisMultifunctionToolCalls
} from "../gestia-core/jarvis/jarvis.multifunction.planner.js";
import {
    createOfficialPageSpec
} from "../gestia-core/jarvis/jarvis.page.creator.js";

const pageSchema = {
    type: "object",
    properties: {
        pageName: { type: "string" },
        brandName: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        sections: { type: "array", items: { type: "string" } }
    },
    required: ["pageName", "brandName", "title", "description", "sections"],
    additionalProperties: false
};

const pageCatalog = [{
    name: "page.plan",
    description: "Planea cualquier tipo de página a partir del turno actual.",
    inputSchema: pageSchema,
    missionDedupeBy: ["pageName"]
}];

const semanticPlan = args => async () => ({
    ok: true,
    status: "SEMANTIC_PLAN_READY",
    provider: "v120-test",
    model: "generalist",
    missionComplete: false,
    toolCalls: [{ name: "page.plan", args }]
});

test("near-copy corruption of an explicit identity is rejected generically", async () => {
    const instruction = "Crea una página para Multiservicios Peninsulares HMH .com";
    assert.equal(
        identityNearCopyMismatch("Multiservicios Peninsulares SMH", instruction),
        true
    );
    const filtered = rejectCorruptedIdentityArgs({
        brandName: "Multiservicios Peninsulares SMH",
        pageName: "Multiservicios Peninsulares SMH",
        title: "Multiservicios Peninsulares SMH"
    }, instruction);
    assert.deepEqual(filtered, {});

    const calls = await buildJarvisMultifunctionToolCalls(instruction, {
        toolCatalog: pageCatalog,
        missionState: { phase: "CURRENT_TURN" },
        semanticPlanner: semanticPlan({
            pageName: "Multiservicios Peninsulares SMH",
            brandName: "Multiservicios Peninsulares SMH",
            title: "Multiservicios Peninsulares SMH",
            description: "Página corporativa específica y verificable.",
            sections: ["Servicios", "Contacto"]
        }),
        throwOnUnavailable: true
    });
    assert.equal(calls.length, 0);
});

test("exact explicit identities survive while unrelated creative identities remain possible", async () => {
    const explicitInstruction = "Crea una página para Clínica Aurora Norte con Urgencias, Especialidades y Citas";
    assert.equal(identityNearCopyMismatch("Clínica Aurora Norte", explicitInstruction), false);
    assert.equal(identityNearCopyMismatch("Clínica Aurora Nortf", explicitInstruction), true);

    const exactCalls = await buildJarvisMultifunctionToolCalls(explicitInstruction, {
        toolCatalog: pageCatalog,
        missionState: { phase: "CURRENT_TURN" },
        semanticPlanner: semanticPlan({
            pageName: "Clínica Aurora Norte",
            brandName: "Clínica Aurora Norte",
            title: "Clínica Aurora Norte",
            description: "Información clara para pacientes y visitantes.",
            sections: ["Urgencias", "Especialidades", "Citas"]
        }),
        throwOnUnavailable: true
    });
    assert.equal(exactCalls.length, 1);
    assert.equal(exactCalls[0].args.brandName, "Clínica Aurora Norte");

    const creativeInstruction = "Diseña una web para un hotel boutique y crea un nombre original para la marca";
    const creativeCalls = await buildJarvisMultifunctionToolCalls(creativeInstruction, {
        toolCatalog: pageCatalog,
        missionState: { phase: "CURRENT_TURN" },
        semanticPlanner: semanticPlan({
            pageName: "Luna Coral",
            brandName: "Luna Coral",
            title: "Luna Coral",
            description: "Hotel boutique con una experiencia editorial contemporánea.",
            sections: ["Habitaciones", "Experiencias", "Reservas"]
        }),
        throwOnUnavailable: true
    });
    assert.equal(creativeCalls.length, 1);
    assert.equal(creativeCalls[0].args.brandName, "Luna Coral");
});

test("canonical identity repairs model near-copies throughout nested page copy", () => {
    const canonical = "Multiservicios Peninsulares HMH";
    assert.equal(
        repairCanonicalIdentityCopy(
            "Conoce a Multiservicios Peninsulares SMH y solicita una visita.",
            canonical
        ),
        "Conoce a Multiservicios Peninsulares HMH y solicita una visita."
    );
    const nested = repairCanonicalIdentityValue({
        title: "Multiservicios Peninsulares SMH",
        services: [{
            title: "Atención de Multiservicios Peninsulares SMH",
            description: "Contenido sustentado."
        }]
    }, canonical);
    assert.equal(nested.title, canonical);
    assert.equal(nested.services[0].title, `Atención de ${canonical}`);

    assert.equal(
        repairCanonicalIdentityCopy(
            "Clínica Aurora Nortf atiende con cita.",
            "Clínica Aurora Norte"
        ),
        "Clínica Aurora Norte atiende con cita."
    );
});

test("page creator preserves arbitrary mission sections instead of imposing a universal landing template", () => {
    const cases = [
        {
            brandName: "Bistró Nube",
            sections: ["Menú", "Reservas", "Ubicación"]
        },
        {
            brandName: "Vector SaaS",
            sections: ["Producto", "Integraciones", "Precios", "FAQ"]
        },
        {
            brandName: "Hotel Marea",
            sections: ["Habitaciones", "Servicios", "Galería", "Reservas"]
        }
    ];

    for (const [index, fixture] of cases.entries()) {
        const spec = createOfficialPageSpec({
            pageName: fixture.brandName,
            brandName: fixture.brandName,
            title: fixture.brandName,
            description: "Descripción específica de la solicitud actual.",
            sections: fixture.sections
        }, {
            objectiveId: `v120-${index}`,
            instruction: `Crear la página ${fixture.brandName}`
        });
        assert.deepEqual(spec.page.sections, fixture.sections);
        assert.equal(spec.page.title, fixture.brandName);
    }
});

test("production page code uses generic integrity machinery and canonical compose wins deterministically", () => {
    const sources = {
        planner: fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multifunction.planner.js", import.meta.url), "utf8"),
        pack: fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multitool.pack.js", import.meta.url), "utf8"),
        creator: fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.page.creator.js", import.meta.url), "utf8"),
        identity: fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.identity.integrity.js", import.meta.url), "utf8")
    };

    for (const [name, source] of Object.entries(sources)) {
        assert.equal(source.includes("Multiservicios Peninsulares HMH"), false, `${name}:HMH`);
        assert.equal(source.includes("Multiservicios Peninsulares SMH"), false, `${name}:SMH`);
    }

    assert.match(sources.planner, /rejectCorruptedIdentityArgs/);
    assert.match(sources.pack, /repairCanonicalIdentityValue/);
    assert.match(sources.pack, /MARCA_CANONICA/);
    assert.match(sources.pack, /identityPreserved/);
    assert.match(sources.pack, /brandName:\s*clean\(canonicalBrand,/);
    assert.match(sources.creator, /sections:\s*Array\.isArray\(input\.sections\)/);
    for (const residue of [
        '"beneficios"',
        '"servicios"',
        '"como_funciona"',
        '"prueba_social"'
    ]) {
        assert.equal(sources.creator.includes(residue), false, residue);
    }
});
