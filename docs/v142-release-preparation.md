# V142 — separación de seguridad, B2C y datos

Estado: preparación local. **Ningún despliegue ni migración autorizado o ejecutado.** Rama `v94-media-v4n-negative-claims`; sin V143/V144, workflow nuevo ni cambios a Multiservicios. El informe forense anterior es evidencia histórica; sus menciones a cambios sin commit describen ese momento, no este empaquetado posterior.

## Commit 1: hotfix

`fe33ec3c` — `fix(security): neutralize legacy endpoints with canonical replay-safe withdrawals`.

Siete archivos exactos en [alcance del hotfix](v142-security-hotfix.md). Prueba aislada 8/8, sin cargar correcciones del segundo commit. Ninguna regla cambiada. Los cuatro exports a publicar, únicamente con autorización posterior: `requestPayout`, `solicitarRetiro`, `generarModulo`, `procesarCierreServicio`.

Los clientes anteriores sin requestId no pueden solicitar retiros después de publicar esta versión. Cierre legacy rechazado hasta instalar el backend verificado. Son rechazos explícitos de compatibilidad, no operaciones financieras silenciosas. Robots B2B excluidos, nunca borrar las Functions remotas ausentes del checkout.

## Commit 2: B2C forense completo

Depende del hotfix. Contiene KYC físico y devolución, cierre backend y evidencia ligada a bytes/actor/servicio, settlement, claim/locks, cotización, webhook/retry, recovery, XSS, reglas y UI económica. El cliente de retiro persiste requestId hasta éxito confirmado; se prueba recarga/reintento, aislamiento de cuenta/importe, cambio de sesión y persistencia fallida. El identificador no se reutiliza para otra intención.

### Exports Functions exactos incluidos en la revisión coordinada

`api`, `stripewebhook`, `onServiceCompleted`, `reconciliarLiquidacionB2C`, `completeB2cService`, `procesarCierreServicio`, `solicitarRetiro`, `requestPayout`, `generarModulo`, `approveB2cTechnician`, `returnB2cTechnicianKyc`, `migrateB2cTechnicianProfile`, `createB2cService`, `claimB2cService`, `cancelB2cService`, `releaseB2cTechnicianLock`, `submitB2cQuote`, `respondB2cQuote`, `syncB2cMarketplace`, `resyncB2cMarketplaceConfig`, `resyncB2cCustomerPayments`, `dispatchB2cMarketplaceNotification`, `executeB2cAdminNocAction`, `validarCierreIA`.

Esta lista incluye dependencias compartidas y preservación del hotfix, no afirma que cada cuerpo cambie directamente. `stripewebhook` existe en el main real `secure-entry-alias.js` y deriva a API. `releaseB2cTechnicianLock` y `executeB2cAdminNocAction` conservan cuerpo pero comparten módulos/contrato. `generarModulo` permanece retirado. `procesarCierreServicio` pasa del rechazo transitorio al mismo objeto callable que `completeB2cService`.

No publicar por inferencia `submitB2bPersonnelKyc`/`reviewB2bPersonnelKyc`: usan `personnelKycRequirements`, que no cambió. No afirmar B2B globalmente certificado: reglas de usuarios/expedientes, Hosting y ramas financieras compartidas exigen validación coordinada. Preservar `robotPreventivo_v2`, `robotPredictivo_v2` y Functions de Jarvis ajenas a este alcance.

### Reglas exactas

- Firestore: `security/firestore-console-snapshot-2026-07-30.rules.txt`.
- Storage: `security/storage-hardening-candidate.rules.txt`.

Son las rutas declaradas en `firebase.json`. El segundo commit impide cierre directo por cliente y endurece autoridad KYC, bindings y evidencia inmutable. El hotfix no toca estas reglas.

### Rollback B2C

En código local, revertir el segundo commit conserva el hotfix. No equivale a un rollback productivo seguro: coordinar la versión de Hosting, Functions y Rules, manteniendo los tres nombres legacy neutralizados y el retiro durable. Conservar registros de deduplicación, evidencias, reservas y ledger existentes; no borrar ni deshacer liquidaciones con un rollback de código. No retroceder a reglas que permiten cierre sin verificación. Si aparece una incompatibilidad, cerrar temporalmente el flujo afectado y corregir hacia adelante con revisión específica. Probar rollback operativo con fixtures antes de autorizarlo; actualmente PROD-UNVERIFIED.

## Publicación y datos son autorizaciones distintas

El hotfix puede instalarse sin migración, sin invocar retiros/cierres ni cobrar: reemplaza cuatro Functions. El release B2C puede publicar código/Rules/Hosting sin ejecutar scripts de migración, pero cambia elegibilidad y compatibilidad; no equivale a habilitar operación general. Los triggers publicados pueden responder a actividad concurrente: no prometer ausencia de efectos de usuarios reales mientras la plataforma está abierta. Preparar ventana controlada y canarios antes del release autorizado.

El código del migrador se endureció; **no se ejecutó migración**. Ninguna publicación autoriza aprobar técnicos, cambiar wallets, habilitar métodos de pago, reconciliar S2 ni borrar residuo de prueba. Las decisiones individuales T1–T7, C1–C5 y S1–S3 siguen en el informe forense y requieren autorización aparte.

## PROD-UNVERIFIED

Ambos cambios continúan sin publicar. Pendientes: versiones remotas reemplazadas y robots intactos después del futuro deploy; KYC/migración revisada; recorrido TEST cliente/técnico/admin; Stripe sandbox y cancelaciones/reembolsos; offline físico, expiración/revocación de sesión, push físico y transición de SW antiguo; cobertura operativa, alarmas y soporte. El rollback productivo tampoco se ha ejecutado. Las pruebas locales no cierran estos gates.

## Archivos y validación

El inventario exacto del segundo commit se conserva en `v142-b2c-commit-files.json`. Las pruebas frescas y sus logs se registran al finalizar su preparación. Las mejoras responsive posteriores se mantienen fuera de los dos commits de seguridad/B2C.

Verificación final del segundo commit: `test:b2c-forensic` **69/69**, `test:platform-hardening` **44/44**, `test:b2c-platform` **22/22** y sus scripts PASS; `test:b2c-forensic-emulators` **42/42** con cero fallos/omisiones. Logs `%TEMP%/fixgo-v142-split-{forensic,hardening,platform-final,integrated-final}.log`. Dos fixtures antiguos de retiro se adaptaron al requestId obligatorio tras reproducir su fallo; pase final integrado exit0. Sintaxis de todos los módulos modificados y `git diff --check` PASS. Inventario de 24 exports comprobado cargando el main real. No se suman suites solapadas como pruebas únicas.
