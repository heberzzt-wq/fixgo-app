# V142 — auditoría forense de finanzas, evidencia y reglas

Fecha: 2026-09-21. Base inspeccionada: `504dbecc`, rama `v94-media-v4n-negative-claims`, checkout `fixgo-app-v142-worker`. Cambios locales; ningún despliegue, cargo, migración ni modificación productiva. Las pruebas usan Firestore/Storage emulados y firmas Stripe de fixture local, nunca la API de cobro Stripe.

## Matriz forense

| Subsistema | Estado | Severidad y evidencia | Corrección local / demostración | Producción |
|---|---|---|---|---|
| Evidencia financiera | VERIFIED | CRITICAL: `functions/b2c-service-settlement.js`, `bindingValid` sólo exigía strings no vacíos; URLs, SHA y rutas arbitrarias eran suficientes. | `bindingValid` exige namespace servicio/técnico; `createStoredEvidenceVerifier` lee metadata y bytes de bucket autoritativo, verifica propietario/evento/tamaño/MIME y SHA256, descarga generation específica y persiste generación/hash verificados en ledger. Emulador: falta objeto, objeto reemplazado, ruta ajena, metadata ajena => cero ledger y bloqueo observable. | PROD-UNVERIFIED; corrección sin desplegar. |
| Liquidación concurrente | VERIFIED | Riesgo duplicación de ledger/estadísticas/saldo. El fixture unitario previo no simulaba transacciones reales. | Cuatro invocaciones simultáneas con SDK Admin/Firestore real emulado producen un `settled` y tres `already_settled`, un ledger, un incremento. Dos liquidaciones B2B descuentan saldo una vez; efectivo genera un cargo de comisión negativo una vez. | PROD-UNVERIFIED; no hubo liquidación productiva. |
| Bandera liquidado inconsistente | VERIFIED | HIGH: early-return anterior aceptaba `liquidado=true` incluso sin ledger. | Exige ledger determinista existente con servicio, técnico y clave coincidentes; falla `SETTLED_LEDGER_INCONSISTENT`. No recrea dinero por inferencia. | PROD-UNVERIFIED. |
| Webhook Stripe | VERIFIED | HIGH: no validaba `payment_status`, moneda ni modo; dedupe sólo por event ID. | Exige paid/MXN/payment; marca sesión en la misma transacción. HTTP local con firma Stripe real de fixture: 3 solicitudes simultáneas, 2 event IDs y misma sesión acreditan una vez. Unpaid/USD/cliente ajeno/cancelado/servicio cash/monto parcial rechazados, `failed_events.retry_required=true`. | PROD-UNVERIFIED; no contacto Stripe ni prueba sandbox remota. |
| Segundo depósito y cambio de método | VERIFIED | HIGH: `cotizando` podía aceptar nuevamente garantía inicial aunque ya había depósito; Stripe podía sobreescribir método efectivo. | Política exige servicio Stripe, ningún crédito anterior para garantía, holds también para depósito. Dinero se compara por centavos exactos; se rechaza faltante de un centavo. | PROD-UNVERIFIED. |
| Checkout/reintento | GAP | HIGH corregido: mismo idempotency key enviaba `traceId` cambiante a Stripe; descripción controlada por cliente también cambiaba parámetros. | Metadata estable; descripción backend. Revalida servicio en transacción después de crear sesión y expira sesión si cambió estado/importe. Código y regresiones de política comprobados; falta replay contra API Stripe sandbox. | PROD-UNVERIFIED. |
| Reconciliación admin | VERIFIED | Debe reutilizar mismo motor sin aceptar valores financieros del navegador. | Fixture real registra intento antes del retry, niega actor no admin en handler, ignora monto/hold inyectados y conserva hold/importe; entry real prueba denegación de sesión anónima. | PROD-UNVERIFIED. |
| Storage/Firestore KYC | VERIFIED | HIGH: técnico aprobado podía reemplazar expediente/metadata de perfil propio tras aprobación. | Uploads y cambios documentos/foto/vehículo/banco/KYC limitados a estados anteriores a revisión; `kyc.evidencias` sólo backend. Rutas de evidencia/firma requieren `resource==null` al crear. Pruebas de reglas: upload legítimo previo y rechazo post-aprobación/ajeno. | PROD-UNVERIFIED; companion approval físico es ownership de agente KYC. |
| Otros bloqueos financieros | VERIFIED | HIGH: campos de incidencia distintos de `*_revision_requerida` podían desactivarse. | Sticky `llegada_resolucion_automatica_bloqueada`, respuesta `ubicacion_disputada`, `ausencia_cliente_estado` pendiente. Backend administrativo mantiene autoridad para resolver. | PROD-UNVERIFIED. |
| Entry legado | LEGACY | `index.js` conserva primer cuerpo muerto solicitarRetiro, sustituido posteriormente por handler canónico; trigger viejo falla explícitamente. `validarCierreIA` cache era compartido entre servicios/usuarios (root corrige). | `secure-entry-alias.js -> secure-entry -> api/onServiceCompleted`; stripewebhook proxy delega secure. Root confirmó requestPayout remoto con monto negativo y procesarCierreServicio remoto no-op. Secure entry ahora exporta requestPayout como misma función solicitarRetiro canónica y procesarCierreServicio como mismo completeB2cService. generarModulo remoto sin Auth queda sustituible por endpoint local retirado (401 anónimo, 410 autenticado, sin provider). | BLOCKER hasta certificar/retirar autoridad remota huérfana mediante autorización. |

## Reproducción y evidencia ejecutable

- `tests/b2c-finance-emulator.test.mjs`: SDK Admin auténtico, transacciones Firestore, archivos Storage con bytes reales, checksum/generation y servidor HTTP que ejecuta `secure-entry.api`. Stripe únicamente firma mensajes localmente con secreto fijo de fixture. La semántica de fotografía/conformidad humana no queda probada por un checksum.
- `tests/b2c-rules-emulator.test.mjs`: clientes Firebase sujetos a reglas; payloads financieros/roles/tenants/holds/KYC adversarios y positivos legítimos.
- `functions/test-b2c-financial-policy.js`: política pura, doble depósito, cash vs Stripe y montos.
- `functions/test-b2c-service-settlement.js`: regresión previa con verifier de fixture explícito; no se confunde con prueba física. La verificación física se demuestra en suite emulador.
- Ejecución integrada inicial: **31/31**, 0 fallos, 0 omitidos (finance 6, rules 19, workflow 6), exit 0; log `C:/Users/heber/AppData/Local/Temp/fixgo-v142-forensic-finance-2.log`.
- Recertificación final agrega integración física KYC, liquidado sin ledger y monto menor por un centavo. **33/33 PASS**, 0 fallos, 0 omitidos, exit 0, 99.8 s. Log: `C:/Users/heber/AppData/Local/Temp/fixgo-v142-forensic-finance-final.log`. Suites: finance 7, KYC 1, reglas 19, workflow 6. Emuladores apagados y puertos 8180/9299 sin listeners.

Comando reproducible (en checkout V142):

```powershell
$env:JAVA_HOME='C:\Users\heber\.vscode\extensions\redhat.java-1.56.0-win32-x64\jre\21.0.12.1-win32-x86_64'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
$env:CI='true'
firebase.cmd emulators:exec --non-interactive --project fixgo-b2c-rules-test --only firestore,storage "node --test --test-concurrency=1 tests/b2c-finance-emulator.test.mjs tests/b2c-rules-emulator.test.mjs tests/b2c-workflow-emulator.test.mjs tests/b2c-kyc-emulator.test.mjs"
```

Serialización de archivos es obligatoria: la suite de reglas borra sólo Firestore emulado al preparar su fixture. Java predeterminado es un shim Oracle; usar JRE21 explícito. Firebase CLI instalado 15.10.1. Ningún test debe ejecutarse sin variables localhost del emulador.

## B2C — deuda restante de este frente

1. Inspeccionar código oficial remoto de exports financieros huérfanos; no asumir que el inventario de source local neutraliza functions antiguas desplegadas.
2. Autorización explícita de despliegue de arreglos y posterior comparación de versiones/reglas productivas.
3. Auditar servicios ya `liquidado=true` con ledger ausente/inconsistente; sólo lectura. No recomputar pagos automáticamente.
4. Cierre operativo corregido: completeB2cService reutiliza verifier físico antes de escribir finalizado; la UI guarda binding y llama backend; las reglas niegan finalizado/flags desde cliente. Pendiente desplegar y demostrar E2E autenticado del wrapper real.
5. Stripe sandbox: sesión/replay/expiración y cancelación mientras hay sesión abierta. La expiración posterior a detectar conflicto es compensación; no es transacción distribuida con Stripe. Un pago real tardío en cancelado queda bloqueado y observable, requiere política autorizada de devolución.
6. Revisar evidencia preexistente legacy: URLs o hashes ajenos ya no bastan. Datos sin objetos íntegros requieren revisión, nunca inventar bytes ni generaciones.
7. E2E autenticado cliente/técnico/admin con cuentas TEST, notificaciones físicas y conformidad real. Emulador no certifica producción ni aceptación del usuario.

## Gate para declarar listo

No puede declararse B2C listo desde esta auditoría local. El dinero está protegido por los casos emulados descritos, pero siguen pendientes superficie remota huérfana, deploy autorizado, Stripe sandbox, integridad de datos existentes y E2E autenticado. No se efectuó movimiento de dinero real.

## Reproducción antes/después


Reproducción read-only contra módulos de HEAD obtenidos con `git show HEAD:functions/...` y evaluación aislada (sin Firebase ni red): binding inventado con SHA `fake`, ruta `foreign`, URL externa producía `true`; versión corregida devuelve `false`. Garantía inicial en `cotizando` con `monto_pagado=350` devolvía siguiente estado `pendiente`; corregida falla `INITIAL_PAYMENT_ALREADY_CREDITED`. Así se demuestra el defecto previo, además de positivos y adversarios reales de emulador.

Verificación secundaria: `node --test tests/secure-financial-entry.test.mjs tests/b2c-security-rules-contract.test.mjs` **14/14 PASS**; ambos scripts unitarios financieros exit 0; syntax y diff whitespace revisados.


## Cierre operativo backend y alias remotos

CRITICAL adicional mitigado localmente: finalizado se decidía en cliente. createB2cOperationalClosureHandler exige técnico B2C canónico elegible asignado, estado trabajando, binding current del mismo servicio/técnico/cliente y ausencia de holds; verifica bytes antes de la transacción final. La transacción serializa concurrencia de estado/asignación/perfil/binding. before2/after2 opcionales pasan por el mismo verifier. Las URLs de UI derivan de metadata Firebase del objeto, nunca de download_url aportado por cliente. Desglose conserva campo `desglose` y tipos existentes. Devuelve completed/already_completed sin escribir ledger ni saldo: trigger único efectúa liquidación.

Emulador extendido: **36/36 PASS**, 0 fallos, 0 omitidos, exit0, 113 s. Log `C:/Users/heber/AppData/Local/Temp/fixgo-v142-forensic-closure-final.log`. Dos llamadas de cierre simultáneas: un completed, un already_completed, cero ledger; caller ajeno, evidencia URL sin objeto, bytes reemplazados, técnico suspendido: estado sigue trabajando. Reglas niegan cerrar desde cliente. Unit entry+reglas: **16/16 PASS**, incluye identidad exacta de alias y HTTP generarModulo anónimo 401.

### Punteros actuales

- functions/b2c-service-settlement.js:36 — function bindingValid
- functions/b2c-service-settlement.js:65 — function createStoredEvidenceVerifier
- functions/b2c-service-settlement.js:100 — function createB2cOperationalClosureHandler
- functions/b2c-service-settlement.js:510 — function createB2CServiceReconciliationHandler
- functions/secure-entry.js:131 — async function createAuthoritativeCheckout
- functions/secure-entry.js:312 — async function processAuthoritativeWebhook
- functions/secure-entry.js:608 — const completeB2cService
- functions/secure-entry.js:618 — const retiredGenerateModule
- security/firestore-console-snapshot-2026-07-30.rules.txt:126 — function serviceFinancialFieldsUnchanged
- security/firestore-console-snapshot-2026-07-30.rules.txt:165 — function technicianServiceTransitionIsSafe
- security/storage-hardening-candidate.rules.txt:154 — match /expedientes/

Recertificación focal después del ajuste al campo canónico `desglose`: **2/2 PASS**, cero omitidos, exit0, ~36 s (`node --test --test-name-pattern=closure tests/b2c-finance-emulator.test.mjs` dentro del mismo comando emulators:exec). Aserción exacta subtotal `862.07`, IVA `137.93`, total `1000`; concurrencia de cierre y adversarios Storage/identidad verdes. Log `C:/Users/heber/AppData/Local/Temp/fixgo-v142-closure-shape.log`. Puertos 8180/9299 liberados al cerrar emuladores.

## Recuperación observable de webhook

`processAuthoritativeWebhook` marca `failed_events` resuelto en la misma transacción exitosa: `retry_required=false`, `resolved_at`, `resolved_by_event_id`; conserva `error_code` e historial previo mediante merge. El bookkeeping de error comprueba transaccionalmente si otro intento ya procesó el evento para no reabrir un fallo viejo. Fixture HTTP firmado: primero hold provoca 500 y error persistido, después Admin emulado elimina hold y el mismo evento retorna 200; saldo acreditado una vez, error original conservado y retry desactivado. Focus **2/2 PASS** (incluye carrera/dedupe webhook), exit0, ~32 s; log `C:/Users/heber/AppData/Local/Temp/fixgo-v142-webhook-recovery-final.log`. Emuladores apagados, puertos liberados. Los cambios de este apartado son locales y requieren despliegue expresamente autorizado.

## Límite de evidencia de las reglas — revisión independiente de cobertura

Estado **GAP**, sin modificación de reglas por inferencia. En los logs varias escrituras adversarias de `services` se deniegan por alcanzar el límite de 1000 expresiones. Esto demuestra que esas solicitudes concretas fueron denegadas; NO demuestra que cada campo protegido haya sido rechazado específicamente por su condición y NO certifica todas las operaciones legítimas.

Positivos actuales sujetos a Rules: actualización same-state `observaciones_finales`; activación individual de cuatro flags de revisión; creación de binding íntegro por técnico asignado; uploads de firma/evidencia autorizados. No hay positivos Rules completos de `asignado -> en_camino -> en_sitio`, respuesta normal del cliente a llegada ni payload completo de disputa. Las suites workflow Admin SDK omiten reglas por diseño y no cubren ese hueco.

El payload real de llegada está en `b2c-arrival-integration.js:147`; la respuesta del cliente en `b2c-client-arrival-notification.js:197`; la disputa con evidencia en `b2c-client-arrival-dispute-evidence.js:276`. Deben probarse esos payloads positivos en clientes sujetos a reglas antes de afirmar paridad operativa completa. No hay evidencia ejecutada que permita atribuirles un bloqueo por presupuesto; por eso no se modifica fuente sólo por sospecha. El backend de cierre usa Admin y tiene sus propios positivos/adversarios reales; esto no sustituye la cobertura pendiente de los pasos anteriores.

### Cierre acotado del GAP de llegada — pruebas positivas Rules

Se añadieron dos recorridos de SDK cliente autenticado en `tests/b2c-rules-emulator.test.mjs`: técnico asignado → en_camino → en_sitio, tracking, upload de bytes real en Storage, evento de llegada enlazado desde `evidencia_llegada`, aviso mostrado al cliente, y respuesta recibido o disputa con foto, hash local y flags de revisión. Los payloads corresponden a panel-tecnico, b2c-arrival-integration, b2c-client-arrival-notification y b2c-customer-dispute-service-scope. La disputa usa el namespace cliente y metadatos service_only vigentes. Se verifica que el servicio conserve monto_pagado y quede en_sitio. La primera tentativa del fixture de disputa usó por error el namespace técnico y fue denegada; se corrigió sólo el fixture, no reglas ni aplicación.

Foco final: `firebase.cmd emulators:exec --non-interactive --project fixgo-b2c-rules-test --only firestore,storage "node --test --test-name-pattern=operational tests/b2c-rules-emulator.test.mjs"` con el JAVA_HOME ya documentado. Log `C:/Users/heber/AppData/Local/Temp/fixgo-v142-rules-arrival-positive-final.log`: 3/3 PASS, 0 skip, exit0, 21.74s (dos positivos nuevos y negativo de cierre preexistente). Los positivos pasan sin límite de expresiones. El negativo de cierre sigue denegado con diagnóstico 1000 expresiones: no prueba causalidad individual del denylist. No hubo cambios de reglas. Estos fixtures validan permisos de cada escritura y bytes subidos; no afirman cámara/GPS auténticos, navegación de navegador ni atomicidad del conjunto de escrituras frontend. El pase integrado del coordinador previo era 37/37; este foco agrega dos casos nuevos, no equivale a una nueva ejecución integrada 39/39.
