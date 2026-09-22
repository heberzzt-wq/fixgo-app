# Correcciones de plataforma V142 — 2026-09-21

Checkout: `fixgo-app-v142-worker`, rama `v94-media-v4n-negative-claims`.
Base inspeccionada: `dbef1c30aae5fe64ff17d3747836b089e3a2b6bb`.
Cambios locales sin commit, push ni despliegue. Se conservaron los tres archivos no rastreados preexistentes y los otros checkouts.

## Resultado implementado

| Requisito | Cambio y prueba |
| --- | --- |
| Autoridad B2B activa y por edificio | Helper de perfil compartido entre routing, runtime y portales; reglas exigen cuenta B2B activa, no suspendida, edificio exacto y rol por operación. Pruebas de routing y emulador. |
| Cierre y evidencia B2B | Asignación exacta al técnico activo tanto en callable como Firestore/Storage; firma sólo en proceso. Pruebas negativas para pendiente, suspendido, otro rol/edificio y orden sin asignación. |
| KYC B2B utilizable | `expediente-b2b.html`, confirmación por archivo en backend, metadata/generación real Storage, envío a revisión, devolución y aprobación por administrador del mismo edificio desde su panel. |
| Requisitos de personal | INE y foto de perfil en el contrato existente; no se imponen requisitos bancarios/vehiculares del marketplace a recepcionistas, supervisores o inquilinos. |
| Impedir autoaprobación | Estado, KYC y referencias B2B sólo cambian desde backend; objetos B2B de expediente inmutables para el propietario. `restore_technician` exige sanción previa y expediente aprobado/completo; aprobación B2C rechaza B2B. |
| Aislamiento offline | IndexedDB por cuenta, edificio y superficie. La base antigua se conserva; sólo se recuperan pendientes cuya cuenta y asignación se verifican contra la orden. |
| Supervisores | Pantalla de órdenes de su edificio de sólo lectura, con revocación y limpieza de listeners. El módulo de seguridad elimina el edificio fijo y usa la autoridad existente. |
| Documentos B2C recuperables | Texto y cada archivo confirmado se persisten antes de continuar; prueba de fallo en segunda subida y posterior reanudación. |
| Liquidación recuperable | Callable `reconciliarLiquidacionB2C`, acción en administración y auditoría previa por intento. Reutiliza el motor de liquidación; no elimina holds ni acepta montos del navegador. No hay reconciliación automática. |
| Concurrencia financiera | Un fallo anterior ya no vuelve a bloquear una liquidación completada por otro intento; marcado transaccional. |
| Autoridad financiera | Reglas protegen saldos, comisiones, importes pagados, ledger, liquidación, tenant, revisión administrativa y holds. Las solicitudes de revisión no se pueden desactivar desde cliente. |
| Fósiles y entrypoint | Retirados cálculo/pagos legacy del backend y cierre financiero del panel. El entrypoint retirado falla sin escribir dinero. Test carga el paquete real y verifica overrides y exports B2C/B2B/Jarvis. |
| Evidencia de despliegue | El endpoint seguro declara su autoridad financiera; el smoke exige esa declaración además de concordancia de SHA de Hosting, Functions y reglas. Candidato B2B incorpora los dos nuevos callables KYC. |

## Verificación y límites

- `npm run test:platform-hardening`: **42/42 PASS**, además de la prueba de recuperación de documentos; autoridad, KYC, caché, supervisor, render y entrypoint.
- `npm run ci:test`: **exit 0**, **935 PASS, 0 FAIL, 1 SKIP** en 936 pruebas Node, además de los scripts de pruebas B2C y los smoke. Bloques: 42/42 hardening, 22/22 plataforma/release, 102/102 misión/continuidad, 44/45 Nexo (una omisión), 118/118 bridge/artefactos y 607/607 multimedia. La omisión existente corresponde al E2E Chrome del bridge, no a una prueba KYC ni financiera.
- Emuladores Firestore/Storage: **18/18 PASS**, ejecución del integrador, exit 0. Se usó Firebase CLI 15.10.1 y JRE 21 de VSCode; puertos 8180/9299 se cerraron al finalizar.
- Sintaxis del runtime y smoke de bridge/worker: PASS.
- Chrome local: expediente y portal técnico sin sesión terminan en login. La verificación del panel admin sufrió timeouts del control de Chrome. No se ejecutó un flujo KYC con cuentas reales autenticadas ni una liquidación real.
- Se repararon fixtures de pruebas Jarvis: salto de línea literal inválido, expectativas de routing sin perfil activo, remotos Git de prueba explícitamente locales y selección de Git nativo en Windows. No se quitaron checks financieros ni se relajó la identidad de repositorio.
- Hubo fallos intermitentes `Permission denied` al escribir objetos Git en fixtures temporales de Windows, incluso en un foco con Git nativo. La causa ambiental no quedó demostrada. La ejecución final completa pasó, pero no se considera resuelta esa intermitencia; no se cambiaron permisos del sistema ni se añadieron reintentos para ocultarla.
- `git diff --check`: PASS. Registro completo de la CI final: `%TEMP%/fixgo-v142-platform-ci-final-20260921.log`; emuladores: `%TEMP%/fixgo-v142-integrated-rules-20260921.log`.

## Producción observada, sólo lectura

El 21 de septiembre, `https://fixgo-44e4d.web.app/api/release-identity` devolvió HTTP 200 con:

- `git_sha`: `bc6209a3b4d15ade643b6ca8247fa6e92c578999`.
- `prepared_at`: `2026-09-01T13:12:21.031Z`.
- `b2c_contract_sha256`: `457884fed2d3b9decd5b5e3a20b83deb36bff490260753fc52cad0bbaeac30f0`.

`/release-manifest.json` devolvió HTTP 404. Firebase CLI no pudo listar Functions y gcloud no proporcionó un access token utilizable. El identificador público no demuestra por sí mismo el código de todos los triggers o las reglas desplegadas. **Producción no está certificada contra estos cambios.**

## Antes de publicar

Revisar y versionar el diff; ejecutar las verificaciones finales desde ese commit. Preparar la identidad con `npm run prepare:release` en checkout limpio. Publicar Functions, reglas y Hosting FixGo como una versión coordinada, con autorización explícita. No usar el despliegue audiovisual parcial de V142 como sustituto del despliegue B2C/B2B. Conservar Jarvis y excluir el sitio independiente Multiservicios de esta operación.

Después del despliegue: comparar exports y reglas reales, ejecutar `npm run smoke:release` con credencial de lectura de reglas y completar pruebas autenticadas de personal pendiente, aprobación, revocación, evidencia y reconciliación. No promover pruebas locales a certificación de producción.
