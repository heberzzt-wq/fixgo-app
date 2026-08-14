# JARVIS V139 — Certification State

> Fuente de verdad: la rama y GitHub Actions del HEAD actual. Si este archivo contiene un SHA anterior al HEAD, prevalece GitHub.

## RAMA

`v94-media-v4n-negative-claims`

## HEAD CANDIDATO PRE-CHECKPOINT

`5cf4a2e54f8a6fb386f37c2773b86dfed572395d`

El commit que actualiza este checkpoint pasa a ser el candidato de certificación. No debe modificarse de nuevo salvo para corregir un rojo real.

## OBJETIVO

Cerrar V139 con focal, Guards, Full CI y misión Windows canónica verdes sobre el mismo HEAD; después ejecutar únicamente Hosting y verificar la web.

## RESTRICCIONES

- No merge ni trabajo sobre `main`.
- No modificar ni desplegar Firebase Functions.
- No modificar ni desplegar Multiservicios.
- Hosting únicamente después de certificación completa verde.
- Rama aislada obligatoria: `v94-media-v4n-negative-claims`.

## GATES

- Focal: `PENDING` sobre el HEAD de este checkpoint.
- Guards de rama/Functions: `PENDING` sobre el HEAD de este checkpoint.
- Full CI: `PENDING` sobre el HEAD de este checkpoint.
- Windows canónico: `PENDING` sobre el HEAD de este checkpoint.
- Hosting: `PENDING`.

## CAUSAS CONFIRMADAS Y CORREGIDAS

1. El workflow focal usaba `npm test -- <archivos>` y anexaba los archivos focales a la suite definida por `npm test`; no era un focal aislado. Ahora ejecuta cada archivo focal directamente y anota el archivo culpable.
2. `v139-certification-diagnostics.yml` intentaba reaplicar parches ya materializados y fallaba antes de probar producto. Ahora verifica read-only.
3. El diagnóstico Windows intentaba extraer un script inline que el canónico ya no contiene. Ahora arranca el bridge y ejecuta directamente `.github/scripts/v139-canonical-real-reel.mjs`.
4. El focal aislado reveló tres fallos reales de linaje: V124, V117 y V115.
5. V124 expuso una regresión real: `productionRequested: true` sin artefacto declarado convertía herramientas de planificación en producción. Se corrigió para que el intento semántico sólo sobreviva al contrato planning-only cuando existe al menos un artefacto de producción declarado; V124 y V125 se probaron juntos.
6. V117 fijaba el cache exacto del shell a una versión histórica. Se conserva el contrato de dos referencias cache-busteadas y la identidad V117 de media ingestion sin impedir versiones posteriores del shell.
7. V115 exigía que GestiaCore siguiera cargando `tools.bridge.js` con cache V115, contradiciendo V139. Ahora verifica que el bridge siga versionado, que el cache V115 viejo no sobreviva en GestiaCore y que el bootstrap terminal V115 sí permanezca donde corresponde.
8. Los cuatro contratos V124 + V125 + V117 + V115 pasaron juntos antes del commit de reparación `f315c3f99b6f193de227a4a25411678f7c90f923`.
9. El workflow temporal de reparación con permiso de escritura fue eliminado en `5cf4a2e54f8a6fb386f37c2773b86dfed572395d` después de cumplir su función.
10. El `deploy.yml` histórico no es apto para este cierre porque contempla Functions. Existe `.github/workflows/v139-hosting-only.yml`, manual y exclusivo de Hosting; NO debe ejecutarse hasta que todos los gates estén verdes.

## ROJO ACTUAL

Ninguno debe darse por vigente por historia. El primer rojo válido será cualquier fallo que GitHub Actions reporte sobre el HEAD creado por este checkpoint.

## ÚLTIMOS CAMBIOS

- `49a5ee96d19e18d758f278412562bed35c06f13b` — aislar comando focal.
- `e7400c2d2cdf53e70ed0914c4bb4d09f665a7c05` — certificación read-only y misión Windows canónica directa.
- `8c6e560f8c34bf887b8fc5c536c9b9616839a676` — focal por archivo con anotaciones de fallo.
- `e6bbf89cb2b41fb07594f5b1f7c2acbf47abd10e` — workflow V139 Hosting-only preparado, sin ejecutar.
- `f315c3f99b6f193de227a4a25411678f7c90f923` — corregir producción semántica y alinear contratos legacy V117/V115; V124+V125+V117+V115 verdes juntos.
- `5cf4a2e54f8a6fb386f37c2773b86dfed572395d` — retirar workflow temporal de reparación.

## SIGUIENTE ACCIÓN EJECUTABLE

1. Exigir focal + Guards + Full CI + Windows canónico verdes sobre el HEAD de este checkpoint.
2. Si aparece un rojo, aislar sólo ese fallo real, corregirlo y recertificar el nuevo HEAD.
3. Ejecutar la certificación canónica V139 sobre el HEAD final si aún no existe evidencia canónica para ese SHA.
4. Sólo con todo verde, ejecutar `v139-hosting-only.yml`.
5. Verificar Hosting/web y confirmar que Functions y Multiservicios permanecieron fuera de la superficie.
