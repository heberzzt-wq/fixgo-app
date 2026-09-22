# V142: auditoría forense de identidad y KYC B2C — 2026-09-21

Alcance: registro, recuperación de sesión/perfil, KYC, aprobación y migrador. Checkout `fixgo-app-v142-worker`, rama `v94-media-v4n-negative-claims`, HEAD de partida `504dbecc`. Los cambios aquí descritos son locales, sin despliegue ni escritura productiva. La observación de producción proviene del snapshot anonimizado y read-only `docs/v142-forensic-production-20260921.json` obtenido por el coordinador; no contiene identificadores personales. Su baseline declarado es `3a81f4b2635ca767e04d5f6d2b87fd2091f7e7ca`. Este informe no declara equivalencia entre ese baseline y el checkout modificado.

## Camino real y autoridad

1. `app-registro.js` consume `firebase.js:registrarUsuario`; Firebase Auth crea la identidad y luego se escribe `users/{uid}`. Son dos operaciones, no una transacción distribuida aunque el comentario antiguo diga “atómico”. Cliente B2C nace activo con ambos permisos de pago falsos. Técnico usa `createTechnicianRegistrationProfile` en `b2c-technician-profile.js`, nace `documentos_pendientes`, no disponible y KYC no aprobado.
2. `app-login.js` autentica por email/Google; lee `users/{uid}` y delega navegación a `firebase.js:verificarYRedireccionar`/`role-authority.js`. `firebase.js:observarAuth` conserva UID y email de Firebase Auth tras mezclar perfil. La falta de perfil no autoriza un rol por defecto; ahora ofrece completar registro.
3. Técnico: `app-registro.js:subirDocumentoExpedienteRecuperable` guarda marcador previo, sube a `expedientes/{uid}/{kind}/current.ext`, obtiene URL y confirma cada archivo en Firestore antes del siguiente. `panel-tecnico.js:completarDocumentosTecnico` reanuda los faltantes y finalmente escribe `pendiente_revision` con `buildTechnicianReviewPatch`.
4. Admin: `panel-admin.js:window.aprobarTecnico` → `firebase.js:aprobarTecnicoB2C` → callable `approveB2cTechnician` exportado por la entrada segura → `createApproveTechnicianHandler`. El backend ahora verifica los objetos del bucket real configurado, propietario, tipo, tamaño y generación antes de activar. Devuelve disponibilidad falsa.
5. Correcciones: modal administrativo → `devolverExpedienteTecnicoB2C` → `returnB2cTechnicianKyc` → `createReturnTechnicianHandler`. Sólo admin, conserva referencias de documentos y dinero, marca `rechazado`, lista archivos a sustituir y observaciones. El técnico puede reponer únicamente esos archivos y reenviar. La congelación de referencias/documentos tras envío es implementada por el propietario de Rules y debe verificarse conjuntamente.
6. Marketplace consume `technicianEligibility` del contrato neutral compartido, que ya no transforma `verificado`/`aprobadoEn` en aprobación canónica. Se mantienen los aliases de lectura de vehículo/documentos, pero no crean una aprobación alternativa.

## Matriz forense

| Subsistema | Estado | Evidencia y límite |
|---|---|---|
| Recuperación Auth creado / users ausente | VERIFIED | Fixture ejecuta la función real: primer write falla, reintento del dueño autenticado no duplica Auth y conserva perfil previo. No hay navegador productivo autenticado. |
| Persistencia parcial y reenvío después de refresh | VERIFIED | La decisión real del panel muestra envío aunque todos los archivos estén guardados y falte el write final; archivos confirmados se conservan. No simula corte físico de navegador/teléfono. |
| Aprobación física y devolución backend | VERIFIED | Fixtures adversarios pasan; integración Firestore+Storage real pasó dentro del comando coordinado de 33/33 pruebas, cero skips. Ver log citado abajo. |
| KYC histórico T1–T7 | LEGACY | Cinco perfiles que el contrato productivo llama `auto_migratable` carecen de aprobación canónica y de tipo de cuenta explícito. No se migró ninguno. |
| Migrador sobre fixtures | VERIFIED | Transaccional en callable, precondición updateTime CLI, repetición sin write, no inventa aprobación/vehículo, no altera dinero, mantiene aliases y tipos timestamp. |
| Objetos Storage históricos reales | PROD-UNVERIFIED | No se verificaron bytes/generaciones de los expedientes de T1–T7 desde este subtrabajo. T4 aprobado no tiene pins en el snapshot. |
| Logout/relogin/revocación/caducidad autenticados | PROD-UNVERIFIED | Existe wiring Firebase; no se ensayó una sesión real revocada ni cuentas TEST inequívocas. La validez del token callable no demuestra invalidación inmediata de tokens ya emitidos. |
| UI administrativa y técnica de corrección en Chrome autenticado | PROD-UNVERIFIED | Wiring y decisiones ejecutables locales; faltan interacciones reales con cuentas controladas, especialmente reupload tras devolución. |

## Hallazgos y reproducción

### ID-01 — CRITICAL — aprobación sin evidencia física

- Archivo/función: `functions/b2c-technician-approval.js:28`, `verifyTechnicianStorage`; consumidor `createApproveTechnicianHandler:59`.
- Antes: bastaba un string no vacío por documento. URL de otro usuario, URL externa, objeto inexistente o vacío aprobaban. `kyc.estado` también podía ocultar una suspensión de `estado` durante normalización.
- Repro: `node --test tests/b2c-kyc-physical.test.cjs`. Antes del cambio fallaron cuatro tests por aceptación indebida/retry no idempotente; después pasan seis.
- Cambio: bucket/namespace del dueño, metadata existente, 0 < tamaño <= 10 MiB, MIME documental/foto válido, generación y metageneración guardadas; rechazo de conflictos de estado y suspensión; evaluación administrativa dentro de la transacción. Doble aprobación conserva un único write y retry sólo después de reverificar generaciones.
- Riesgo residual: un pin histórico aún no es revalidado automáticamente en cada claim; las reglas deben congelar el expediente aprobado. No se afirma validación de contenido semántico de la INE: corresponde a revisión humana.
- Producción: corrección no desplegada.

### ID-02 — CRITICAL — legacy se convertía en autoridad y podía borrar una suspensión

- Archivo/funciones: `gestia-core/contracts/b2c-platform-contract.js:202` `normalizeState`, `:215` `normalizeTechnicianProfile`, `:307` `technicianEligibility`.
- Antes: `verificado` o `aprobadoEn` convertían `kyc.aprobado` a true; normalización priorizaba `kyc.estado` y sustituía estado/status. T2 es un caso productivo observado de elegibilidad basada en aprobación legacy.
- Cambio: aprobación explícita `kyc.aprobado === true`; estado/status/KYC divergentes se conservan y bloquean operación. Rol ausente no se inventa como técnico. Aliases documentales/logísticos siguen siendo legibles.
- Test: `tests/b2c-platform-authority.test.mjs` y `tests/b2c-migration-safety.test.cjs`.
- Producción: T2 sigue bajo comportamiento baseline hasta release autorizado. El parche reduciría su elegibilidad hasta revisión explícita; esto es un impacto conocido, no una migración ejecutada.

### ID-03 — HIGH — migración podía elevar autoridad, sobrescribir carrera o perder foto/tipos

- Archivo/funciones: contrato `technicianMigration:503`; `functions/b2c-platform-authority.js:createMigrateTechnicianProfileHandler:449`; `scripts/migrate-b2c-technician.mjs:encodeWithSource:61` y rama apply `:94`.
- Antes: la clasificación aceptaba legacy aprobado sin KYC explícito como auto; confirmación genérica permitía aplicar requires_review; callable leía fuera de transacción; se borraba `fotoPerfil` sin agregar `foto_perfil` al patch; CLI reconstruía timestamps como strings; agregaba defaults de reputación/nivel/conteos.
- Cambio: casos ambiguos, cuenta B2C ausente, rol contradictorio o aprobación inferida requieren revisión y no admiten override genérico. Callable vuelve a leer dentro de transacción. CLI conserva updateTime, bloquea requires_review y preserva timestamp de aprobación. Se incluye foto canónica, se preservan aliases, no se escriben nivel/reputación/conteos/dinero, repetición no vuelve a escribir.
- Test: seis pruebas en `tests/b2c-migration-safety.test.cjs`, incluidas ejecuciones del script CLI con transporte fixture.
- Producción: ninguna migración ejecutada; hace falta snapshot de respaldo, revisión individual y autorización explícita.

### ID-04 — HIGH — expediente completo podía quedar huérfano antes del envío

- Archivo/función: `panel-tecnico.js:327`, listener del perfil; `completarDocumentosTecnico`.
- Antes: tras guardar el último archivo y fallar el write `pendiente_revision`, el refresh veía KYC completo y ocultaba todo el formulario, sin poder reenviar. Tampoco había devolución administrativa usable para reemplazar referencias inválidas.
- Cambio: el panel muestra envío en registro/documentos pendientes/rechazado aunque todas las referencias existan. Admin devuelve con motivo y lista controlada; archivos sustituidos salen de la lista pendiente después de su confirmación individual. No se borra el expediente previo.
- Test: `tests/b2c-registration-recovery.test.mjs` ejecuta la decisión real del panel; `tests/b2c-kyc-physical.test.cjs` verifica retorno, estados y autoridad.
- Producción: nuevo flujo sin desplegar; falta E2E autenticado.

### ID-05 — HIGH — Auth sin perfil bloqueaba el reintento de registro

- Archivo/función: `firebase.js:296` `registrarUsuario`, recuperación en `app-login.js:104`.
- Antes: Auth podía crearse antes de fallar Firestore; siguiente intento creaba Auth otra vez y recibía email-already-in-use. Login se quedaba sin rol y sólo emitía console.warn.
- Cambio: reintento reutiliza exclusivamente la sesión autenticada del mismo correo; perfil existente de otro rol/cuenta se rechaza y perfil existente compatible no se sobrescribe. Login sin users muestra enlace visible para completar registro.
- Test: `tests/b2c-registration-recovery.test.mjs` simula fallo de primer write y reintento, comprueba una sola creación Auth, conservación de wallet y rechazo de cambio de rol.
- Producción: sin desplegar. Quedan pendientes pruebas visuales de registro email y Google, logout/relogin entre interrupciones y caducidad real.

### ID-06 — HIGH — avatar escribía una imagen inline como si fuera evidencia KYC

- Superficies: `panel-tecnico.js:window.cambiarFotoPerfil` y `panel-admin.js:window.adminCambiarFotoTecnico`.
- Antes: FileReader generaba dataURL y se escribía tanto `foto_perfil` como el alias `fotoPerfil`, sin Storage, metadata ni ciclo de revisión.
- Cambio: técnico sólo puede subir foto real a su expediente pre-review, con MIME/tamaño y referencia canónica; activo/en revisión se bloquea con mensaje. Admin no reemplaza identidad aprobada desde un avatar; expediente en revisión se devuelve explícitamente para que el dueño reenvíe foto.
- Test: tercer caso de `tests/b2c-registration-recovery.test.mjs` ejecuta ambas funciones y demuestra que no suben ni escriben sobre identidad aprobada.
- Deuda: una recertificación de identidad ya activa necesita un proceso administrativo separado y aprobado; este parche no inventa activaciones ni altera expedientes reales.
- Producción: sin desplegar.

## Matriz de migración individual anonimizada

Observación del coordinador, no inferencia de valores personales. Clasificación baseline frente a decisión local segura:

| Cuenta | Baseline | Datos relevantes presentes/ausentes | Decisión segura y riesgo | Reversibilidad |
|---|---|---|---|---|
| T1 | auto_migratable | activo, verificado/aprobadoEn; sin KYC, documentos, vehículo ni tipo_cuenta explícito | requires_review; falta evidencia completa, no inventar vehículo/banco/documentos/aprobación | Sin escritura; restauración sólo desde snapshot antes de cualquier futuro cambio |
| T2 | auto_migratable | activo/disponible, documentos y vehículo con alias logistica; verificado/aprobadoEn; sin kyc ni tipo_cuenta | requires_review; baseline lo considera elegible por inferencia legacy; revisar documentos físicos y decisión de aprobación | Preservar aliases; no cambiar disponibilidad ni dinero automáticamente |
| T3 | auto_migratable | mismo patrón incompleto T1 | requires_review; no basta normalizar strings | Sin escritura |
| T4 | canonical | B2C, activo/disponible, kyc.aprobado; sin evidencias metadata en kyc | shape canónico, pero pin físico histórico pendiente; no inventar pins ni declarar Storage probado | Revalidación read-only primero; write aprobado aparte |
| T5 | auto_migratable | mismo patrón incompleto T1 | requires_review | Sin escritura |
| T6 | auto_migratable | mismo patrón incompleto T1 | requires_review | Sin escritura |
| T7 | canonical | B2C, pendiente_revision, documentos/vehículo, kyc no aprobado | revisión administrativa con validación física antes de activar; no autoaprobar | Mantener pendiente hasta revisión |

Los cinco `auto_migratable` productivos NO constituyen cinco aplicaciones automáticas seguras. El contrato anterior expresaba normalización de forma, no certificación de KYC ni de autoridad. Cambiar su clasificación local no modifica producción.

## Evidencia local y deuda restante

Comandos frescos: `node --test tests/b2c-platform-authority.test.mjs tests/b2c-migration-safety.test.cjs tests/b2c-kyc-physical.test.cjs tests/b2c-registration-recovery.test.mjs` → 29/29. `node functions/test-b2c-platform-authority.js` y `node functions/test-b2c-technician-approval.js` pasan. Sintaxis de UI/backend modificados pasa. El test de integración emulador fuera de entorno se omite expresamente. Posteriormente el coordinador de emuladores ejecutó `firebase.cmd emulators:exec --non-interactive --project fixgo-b2c-rules-test --only firestore,storage "node --test --test-concurrency=1 tests/b2c-finance-emulator.test.mjs tests/b2c-rules-emulator.test.mjs tests/b2c-workflow-emulator.test.mjs tests/b2c-kyc-emulator.test.mjs"` con JRE 21: 33/33, cero skips, exit 0. Inspeccioné `C:/Users/heber/AppData/Local/Temp/fixgo-v142-forensic-finance-final.log`: línea 50 prueba KYC física y líneas 294–299 resumen. Esa prueba demuestra uploads reales de objetos de fixture, rechazo de persistencia parcial, devolución, concurrencia de aprobación y rechazo tras reemplazo de generación; NO demuestra producción.

Deuda por dependencia:

1. Mantener la recertificación integrada de Rules y backend: el pase coordinado físico quedó verde; repetir tras la integración final de todo el equipo.
2. Verificar read-only Storage de T2/T4/T7, referencias legacy y generaciones; diseñar decisión individual sin escribir por inferencia.
3. Resolver T1/T3/T5/T6 con propietario/admin y documentación real. No elevar permisos mediante migrador genérico.
4. Ensayar en navegador controlado registro email/Google, interrupción de cada upload, refresh/logout/relogin y devolución/reenvío. Probar que cuenta A no continúa documentos de B.
5. Ensayar revocación/caducidad reales y documentar latencia de tokens; una llamada con context.auth fixture no demuestra esa propiedad.
6. Autorizar release coordinado sólo después de evidencia integrada. Después, comparar SHA y repetir canarios read-only. Ningún cambio de este informe está declarado productivo.

Gate identidad/KYC: no hay evidencia suficiente para declarar B2C listo de extremo a extremo. Corregir código y clasificar perfiles no equivale a migrarlos ni a validar sus documentos físicos.


## Anexo: XSS almacenado en tarjetas B2C y saldo mostrado

**Alta — tarjetas cliente/técnico, foto del problema y evidencia.** `panel-cliente.js` (fragmentos alrededor de 800/838), `panel-tecnico.js` (865/1285) interpolaban una URL persistida directamente en atributos HTML. Un valor `https://example.test/x" onerror="alert(1)" data-x="` crea un atributo ejecutable al parsear el HTML anterior. No se necesita una URL JavaScript para explotar la comilla. Reproducción local positiva del baseline con parser HTML, sin escribir payloads en producción.

Corrección: `app-utils.js::urlHttpsParaHTML` admite solamente HTTPS sin credenciales y escapa el atributo con `escaparHTML`; ambos portales reutilizan esa autoridad. Se conservan URLs HTTPS legacy de Firebase Storage. Se escapan cantidades/precios de cotización, subtotal/IVA, nombre del técnico, vehículo, placas, estado y folio; los argumentos inline de placas/identificadores usan literales JSON escapados para HTML. Teléfono queda restringido al alfabeto telefónico. Dirección/descripción/categoría de las tarjetas ya estaban escapadas. No es una certificación global de cada sink de la plataforma.

**Media — saldo de cotización cliente.** La tarjeta restaba `retencion_inicial` estimada. Ahora resta `monto_pagado` confirmado, como el backend. Fixture: costo 1000, anticipo real 200, estimado 500 muestra 800, no 500.

Evidencia nueva: `node --test tests/b2c-render-xss.test.cjs`: **4/4**, cero omitidos. Acorn extrae los TemplateLiteral reales, VM los ejecuta y Python HTMLParser inspecciona los atributos/tag resultantes. Siete fragmentos de foto/evidencia se prueban con quote injection, JavaScript/data y HTTPS Storage válido. Prueba de handler de placas confirma que el payload sigue siendo texto y sólo ocurren las dos acciones originales. Sintaxis de los tres módulos y `git diff --check` pasan. Ningún payload ni cambio se desplegó en producción.
