# JARVIS V139 — Certification State

> Fuente de verdad: la rama y GitHub Actions del HEAD actual. Si este archivo contiene un SHA anterior al HEAD, prevalece GitHub.

## RAMA

`v94-media-v4n-negative-claims`

## HEAD CANDIDATO PRE-CHECKPOINT

`e6bbf89cb2b41fb07594f5b1f7c2acbf47abd10e`

El commit que agrega este checkpoint pasa a ser el nuevo HEAD y debe certificarse completo antes de Hosting.

## OBJETIVO

Cerrar V139 con focal, Guards, Full CI y misión Windows canónica verdes sobre el mismo HEAD; después ejecutar únicamente Hosting y verificar la web.

## RESTRICCIONES

- No merge ni trabajo sobre `main`.
- No modificar ni desplegar Firebase Functions.
- No modificar ni desplegar Multiservicios.
- Hosting únicamente después de certificación completa verde.
- Rama aislada obligatoria: `v94-media-v4n-negative-claims`.

## GATES

- Focal: `PENDING` sobre el HEAD del checkpoint.
- Guards de rama/Functions: `PENDING` sobre el HEAD del checkpoint.
- Full CI: `PENDING` sobre el HEAD del checkpoint.
- Windows canónico: `PENDING` sobre el HEAD del checkpoint.
- Hosting: `PENDING`.

## CAUSAS YA CONFIRMADAS Y CORREGIDAS

1. El workflow focal usaba `npm test -- <archivos>` y anexaba los archivos focales a la suite definida por `npm test`, por lo que no era un focal aislado. Corregido primero a `node --test` y después a ejecución independiente por archivo con anotaciones de fallo.
2. `v139-certification-diagnostics.yml` intentaba reaplicar parches que ya estaban materializados en el repositorio; fallaba antes de probar producto. Corregido a verificación read-only.
3. El diagnóstico Windows intentaba extraer un bloque inline que ya no existe en el workflow canónico. Corregido para ejecutar directamente `.github/scripts/v139-canonical-real-reel.mjs`, igual que el canónico vigente.
4. El workflow histórico `deploy.yml` no cumple el aislamiento requerido porque contempla Functions. Se creó `.github/workflows/v139-hosting-only.yml`, manual y exclusivo de Hosting; NO debe ejecutarse hasta que todos los gates anteriores estén verdes.

## ROJO ACTUAL

No asumir rojos históricos. El próximo rojo válido será el primero que reporte GitHub Actions sobre el HEAD actual después de este checkpoint.

## ÚLTIMOS CAMBIOS

- `49a5ee96d19e18d758f278412562bed35c06f13b` — aislar comando focal.
- `e7400c2d2cdf53e70ed0914c4bb4d09f665a7c05` — certificación read-only y misión Windows canónica directa.
- `8c6e560f8c34bf887b8fc5c536c9b9616839a676` — focal por archivo con anotaciones de fallo.
- `e6bbf89cb2b41fb07594f5b1f7c2acbf47abd10e` — workflow V139 Hosting-only preparado, sin ejecutar.

## SIGUIENTE ACCIÓN EJECUTABLE

1. Exigir focal + certificación Linux/Full CI + Windows canónico verdes sobre el HEAD del checkpoint.
2. Si hay rojo, corregir el primer fallo real y repetir sobre el nuevo HEAD.
3. Cuando todo esté verde, disparar la certificación canónica V139 si no corresponde ya al HEAD final.
4. Sólo entonces ejecutar `v139-hosting-only.yml` y verificar Hosting/web.
