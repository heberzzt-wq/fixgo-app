# V142 — Recibo de activación de carga móvil (29/10/2026)

## Cambios verificados

- Proyecto Firebase: `fixgo-44e4d`.
- Canal: **reglas de Cloud Firestore únicamente**, sin deploy de Hosting principal, Storage, Functions ni datos B2C/B2B.
- Release anterior: `projects/fixgo-44e4d/rulesets/fc1c652a-fa30-481a-bff1-e55d1b3513e5`.
- Release activo: `projects/fixgo-44e4d/rulesets/84fdac84-2c5f-4d7e-89a7-72877d819547`.
- Publicado y confirmado a las `2026-10-29T19:21:45.747141Z` (`14:21:45` Cancún).
- SHA-256 de reglas anteriores: `125c07219cc2b4e58b639115fa62c37c4283eb863a287460d9858435ec552275`.
- SHA-256 de reglas activadas: `b76abec92fac1cd09866741a18058eaa2b471e57a26f86d03fb55d2d3d89b249`.
- Única modificación textual: añadir `'/upload/start'`, `'/upload/chunk'`, `'/upload/complete'`, `'/upload/cancel'` a `validRequest().route` dentro del enlace privado `jarvis_private_relay/{ownerUid}/requests/{requestId}`.
- Compilación de reglas: HTTP 200, **0 errores**. Se preservó una advertencia preexistente `Unused variable: technicianId`; se confirmó compilando también las reglas originales.
- Verificación posterior: el Ruleset activo coincide con SHA-256 de la nueva versión.
- El conjunto de reglas anterior se conserva como respaldo en Firebase.
- No se cambió la rama `v142-official` ni se crearon ramas nuevas.

## Restricciones conservadas

Solicitud solamente del propietario autenticado y desde el worker vigente; validación de identidad, fecha de caducidad, releaseId, rutas permitidas, respuesta correlacionada e historial de estados. La laptop conserva la subida local original.

La implementación móvil limita formatos, tamaño y lotes; esos controles del cliente y del Bridge deben conservarse en código y someterse a regresiones. **Permitir una ruta en las reglas no significa garantizar que una subida del teléfono haya terminado.**

## Pruebas que faltan

- Subir desde Android una imagen JPG o PNG pequeña y confirmar recibo, SHA-256 y descarga/uso.
- Subir un archivo PDF o texto pequeño.
- Subir un video MP4 menor de 8 MB una vez publicada la versión de pruebas con soporte del formato; videos más grandes continúan limitados.
- Rechazar identidad ajena, credenciales introducidas en el cuerpo y rutas de comandos, Git y escritura en repositorio. Las baterías locales automatizadas no sustituyen la prueba autenticada desde Android.

Este archivo registra una acción efectivamente ejecutada, no una autorización futura ni evidencia de una subida móvil aún no realizada.
