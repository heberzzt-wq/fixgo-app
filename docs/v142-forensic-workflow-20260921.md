# V142 — auditoría forense B2C: workflow, marketplace y cotización

Fecha: 2026-09-21. Checkout `fixgo-app-v142-worker`, rama `v94-media-v4n-negative-claims`, base local `504dbecc`. El coordinador confirmó que el código de este frente coincide con el SHA productivo aportado `3a81f4b2635ca767e04d5f6d2b87fd2091f7e7ca`; no se ejecutó despliegue ni se modificaron cuentas reales. Este informe no certifica la sesión autenticada de producción. Sin B2B/Jarvis, cobros, proveedores externos ni puertos de emulador iniciados por este frente.

## Cadena real de consumidores

| Superficie | Camino realmente presente en código | Estado |
|---|---|---|
| Catálogo cliente | `panel-cliente.js:cargarServiciosCliente` escucha `configuracion/catalogo_global`, recorre `platformContract.SERVICE_CATALOG`, filtra `isServiceAllowedForCustomer` e `isServiceCategoryEnabled`. El contrato contiene 19 entradas: ROAD 5, FIX 7, TECH 6, MAINT 1; MAINT pertenece a la audiencia B2B. | VERIFIED |
| Crear solicitud | `panel-cliente.js` submit → `firebase.js:114 crearServicioB2C` → callable `createB2cService` exportado en `functions/index.js:363` → `functions/b2c-platform-authority.js:35`. UID deriva de Auth; categoría, método, estado y precio inicial se construyen en servidor. | VERIFIED |
| Publicación | `functions/index.js:381 syncB2cMarketplace`, onWrite `services/{serviceId}` → `syncMarketplaceService` → `service_marketplace/{serviceId}` y `platform_events`. Catálogo/permiso efectivo se vuelven a evaluar; destino confirmado y Stripe inicial pagado son requisitos. Listing omite dirección, coordenadas, teléfono, foto privada y cliente. | VERIFIED |
| Lista técnica | `panel-tecnico.js:808 escucharBolsa` consulta listing disponible con `limit(50)` y después aplica compatibilidad de skill/local hidden UID. | VERIFIED |
| Claim | `panel-tecnico.js:tomarServicio` → `firebase.js:96 reclamarServicioB2C` → `functions/index.js:357 claimB2cService` → transacción backend. Cambia servicio, elimina listing y crea lock en el mismo commit. | VERIFIED |
| Cotización | `panel-tecnico.js:mostrarModalCotizacionDetallada` → `enviarCotizacionB2C` → `submitB2cQuote`. Cliente `window.responderCotizacion` → `responderCotizacionB2C` → `respondB2cQuote`. Ambas Functions están exportadas, no son exports huérfanos. | VERIFIED |
| Cancelar/liberar | Cliente `window.cancelarTicketFantasma` y técnico `window.cancelarMisionActiva` → `cancelarServicioB2C` → `cancelB2cService`. Cliente sólo antes de asignación y sin pago Stripe confirmado; liberación técnica aplica penalización backend determinística. | VERIFIED |
| Unlock | `functions/index.js:378 releaseB2cTechnicianLock` onUpdate, elimina sólo lock cuyo `service_id` coincide. Nuevo claim recupera lock terminal verificado si el trigger faltó. | VERIFIED |
| E2E con cuentas/FCM reales | No se efectuó sesión cliente↔técnico productiva en este frente. | PROD-UNVERIFIED |

VERIFIED en esta sección prueba conexión estática y/o ejecución local indicada; no equivale a producción operativa.

## Máquina de estados y contradicciones

Matriz declarada: `gestia-core/contracts/b2c-platform-contract.js:111 SERVICE_TRANSITIONS`.

```text
iniciado_stripe → pendiente | cancelado
pendiente → asignado | cancelado
asignado → en_camino | cancelado
en_camino → en_sitio | cancelado
en_sitio → cotizando | cancelado
cotizando → procesando_saldo | trabajando | cancelado
procesando_saldo → trabajando | cancelado
trabajando → finalizado
```

- `isServiceTransitionAllowed` sólo se define y exporta; búsqueda del código runtime no encontró consumidores. Los callables y Rules hacen sus propios checks usando constantes/strings. Estado **GAP**, severidad MEDIUM: la tabla describe intención pero no constituye el validador operativo único.
- La liberación técnica controlada `asignado/en_camino/en_sitio → pendiente` existe y no está representada en esa tabla. No se cambió el contrato concurrentemente con su propietario; corregir la tabla requiere nombrar explícitamente el actor/acción y no habilitar esa transición a cualquier cliente.
- `panel-tecnico.js` aún interpreta `pagado` y muestra botón para `pagado → trabajando`; la política Stripe actual deriva `trabajando`, y las Rules B2C no habilitan aquel salto legacy. Estado **LEGACY**, severidad HIGH si existen servicios `pagado`: deben clasificarse en producción antes de migrar o retirar compatibilidad.
- Rechazo de cotización escribe `cancelado` y `costo_final:550` (`functions/b2c-service-workflow.js:125`); la UI instruye pagar la visita. No hay en ese handler ledger de visita, reembolso ni reconciliación de fondos cobrados; el motor de cierre normal atiende `finalizado`. Estado **GAP**, severidad HIGH. No se inventó una política monetaria ni se ejecutaron cargos.

## Hallazgos reproducidos y correcciones locales

| ID / severidad | Archivo, función y causa | Reproducción y evidencia | Cambio | Estado local / producción |
|---|---|---|---|---|
| WF-01 HIGH | `functions/b2c-service-marketplace.js:77 createClaimB2cServiceHandler`; confiaba en listing eventual sin releer permisos/catálogo. | Con listing aún disponible, revocar `configuracion/catalogo_global.fix_plomeria` o permiso efectivo del cliente; baseline reclamaba exitosamente. Reproducer forense falló por falta de rechazo. | Lecturas autoridad actuales dentro de la transacción (`:132`) antes de asignar. | VERIFIED / PROD-UNVERIFIED |
| WF-02 HIGH | `functions/b2c-platform-authority.js:35 createB2cServiceHandler`; cliente, pagos y catálogo se leían antes de empezar transacción. | Fixture cambia gateway tras lectura y antes de transacción; baseline creaba con autorización obsoleta. | Lecturas y validación dentro de la misma transacción (`:49`). | VERIFIED / PROD-UNVERIFIED |
| WF-03 HIGH | `functions/b2c-service-marketplace.js:154`; todo lock existente impedía operar, aunque su servicio ya estuviera finalizado y el trigger hubiera fallado. | Seed lock → servicio propio `finalizado`; baseline siempre denegaba nueva solicitud. | Se lee objetivo del lock en transacción y se reemplaza sólo si pertenece al mismo técnico y es terminal; lock desconocido, vivo o ajeno continúa bloqueando. | VERIFIED / PROD-UNVERIFIED |
| WF-04 HIGH | `functions/b2c-service-workflow.js:51 createSubmitB2cQuoteHandler`; sólo verificaba assignment/estado/evidencia declarada y no perfil actual. | Asignación antigua + técnico suspendido + estado en_sitio; baseline permitía cotizar. | Lectura transaccional y `technicianEligibility(... requireAvailable:false)`; permite terminar asignación estando offline/disponibilidad apagada, no suspendido ni KYC inválido. | VERIFIED / PROD-UNVERIFIED |
| WF-05 HIGH | `functions/b2c-service-workflow.js:100 createRespondB2cQuoteHandler`; omitir `accepted` equivalía a rechazar y NaN en costo podía pasar a trabajando. Además `retencion_inicial` estimada se consideraba crédito. | Payload sin accepted y costo inválido; baseline cancelaba/aceptaba. Retención550 sin monto_pagado y quote500 ya no autoriza trabajo. | Boolean estricto, total/pago finitos y válidos; crédito exclusivamente `monto_pagado`, nunca retención estimada. | VERIFIED / PROD-UNVERIFIED |
| WF-06 MEDIUM | `functions/b2c-service-marketplace.js:451 createRequestB2cWithdrawalHandler`; valida positivo antes de redondear. | amount0.001 creaba retiro de0.00 con saldo0. | Rechaza amount cuyo redondeo monetario no sea positivo antes de transacción. | VERIFIED / PROD-UNVERIFIED |
| WF-07 HIGH | `functions/b2c-service-marketplace.js:234 createCancelB2cServiceHandler`; permitía republicar desde cotizando/procesando_saldo/trabajando conservando evidencia de técnico previo. | Baseline release desde los tres estados regresaba a pendiente y penalizaba sin revisión; test falló. | Deniega esas liberaciones con `failed-precondition` y mensaje explícito de revisión administrativa (`:299`); antes de cotización invalida bandera/evidencia diagnóstica (`:331`). No limpia holds ni reembolsa. | VERIFIED / PROD-UNVERIFIED |
| WF-08 MEDIUM | `tests/b2c-client-technician-contract.test.mjs:243` recortaba fuente desde primer onclick HTML y no desde definición del handler. | Selector podía incluir updateDoc ajenos y reportar falso fallo de ruta canónica. | Inicio/fin buscan `window.cancelarTicketFantasma = async` y `window.iniciarPagoSaldo = async`. Mantiene prohibición de updateDoc directo en ese handler. 16 tests PASS. | VERIFIED / PROD-UNVERIFIED |
| WF-09 HIGH | `createB2cServiceHandler` y `createClaimB2cServiceHandler` no comprobaban suspensión explícita del cliente. | Fixture cliente con `suspendido:true` y métodos autorizados aún creaba solicitud (FAIL reproducido). | Rechazo transaccional por flag suspendido, también ante listing anterior todavía visible. Proyección elimina listing suspendido y trigger del cliente observa cambios de suspensión. No infiere estados ni permisos de clientes legacy. | VERIFIED / PROD-UNVERIFIED |

Los cambios no reemplazan los callables ni agregan otra autoridad financiera. Las pruebas de identidad utilizan fixtures sintéticos sin PII.

## Pruebas ejecutadas y límites

- Baseline `node --test functions/test-b2c-workflow-forensic.cjs`: 8 casos, 2 PASS / 6 FAIL por defectos; tras cambios iniciales 8 PASS. Prueba nueva de release produjo otro FAIL esperado antes de corregir.
- Resultado final del frente: `node --test functions/test-b2c-workflow-forensic.cjs`: **13 PASS**, 0 FAIL. Incluye claim/cancel, dos técnicos, respuestas contrapuestas, replay, categoría, identidad, disponibilidad, KYC, lock desconocido, bloqueo tras cotización y retención estimada.
- `node functions/test-b2c-service-marketplace.js`, `node functions/test-b2c-service-workflow.js`, `node functions/test-b2c-platform-authority.js`: PASS.
- `node --test tests/b2c-client-technician-contract.test.mjs`: 16 PASS.
- Sintaxis de módulos tocados y `git diff --check`: PASS.
- El reproducer de Functions usa transacciones **serializadas en memoria**; comprueba atomicidad lógica e intercalado explícito, NO acredita concurrencia Firestore real.
- Se entregó `tests/b2c-workflow-emulator.test.mjs`: seis escenarios con **Admin SDK y transacciones reales**: dos claims/replay, claim-cancel, suspensión concurrente/previa, lock terminal/desconocido, doble submit/respuesta y doble retiro. Rechaza iniciar sin `FIRESTORE_EMULATOR_HOST` loopback. Proyecto aislado `fixgo-b2c-rules-test`, prefijos UUID, sólo limpia sus documentos y restaura config. Ejecución delegada al coordinador dueño de emuladores; hasta incorporar su salida, estado **PROD-UNVERIFIED**. Scripts deben correr secuenciales porque Rules limpia el emulador al iniciar.
- Suspensión concurrente tiene semántica de serialización: si el claim se confirma antes, queda una asignación previa a suspensión que exige intervención operativa; si la suspensión gana, claim se deniega. No afirmar que una carrera atómica desasigna retrospectivamente una orden válida.

## B2C — deuda restante de este frente

1. **HIGH / GAP — cancelación y visita:** política explícita para solicitudes pagadas, rechazo de cotización, visita550 y abandono después de cotizar. La nueva denegación evita republicación insegura, pero la recuperación operativa/admin aún necesita ruta demostrada. No usar NOC para inventar reembolso.
2. **HIGH / GAP — recovery de creación:** baseline `panel-cliente.js` generaba ID nuevo en cada submit; commit backend con respuesta perdida → retry podía duplicar orden. El coordinador implementó recuperación UID+digest e id persistido sin PII y pruebas propias; este frente no revalida su UI. Ver informe integrado para estado final.
3. **HIGH / PROD-UNVERIFIED — carreras reales/E2E:** incorporar salida del emulador real y navegador autenticado cliente↔técnico, incluidas suspensión durante misión, refresh, logout/relogin, permisos revocados y reconexión.
4. **MEDIUM / GAP — descubrimiento incompleto:** `escucharBolsa` limita50 antes del filtro de skill en cliente. Con50 solicitudes incompatibles anteriores, otras compatibles pueden no mostrarse. No hay paginación; necesita caso de carga >50 y query/índice por compatibilidad.
5. **MEDIUM / GAP — notificaciones/republicación:** evento dedupe usa serviceId+marketplace_revision. Deshabilitar/reabilitar catálogo recrea listing pero sobrescribe evento del mismo ID y trigger es onCreate; no garantiza nuevo envío. Técnicos que pasan a disponibles después del evento tampoco causan replay automático. El listing puede seguir visible, pero no confundirlo con recepción FCM física.
6. **MEDIUM / GAP — escala/reintentos:** resync de configuración lee todos los pending y los procesa secuencialmente, sin cursor durable/budget. Falla intermedia requiere mecanismo de recuperación demostrado; no se inspeccionaron dead letters productivas en este frente.
7. **MEDIUM / GAP — autoridad de transición:** alinear contrato declarativo con actores y release a pendiente; usar/validar sistemáticamente la matriz en backends y Rules sin abrir transiciones por genérica equivalencia de estado.
8. **LEGACY — inventario pagado/liquidado/archivado:** UI y locks contemplan aliases fuera de la tabla canonical. Auditar servicios existentes antes de retirar compatibilidad; no se migró ninguno.
9. **PROD-UNVERIFIED — cobertura real catálogo:** 19 definiciones en código no demuestran configuración productiva ni oferta de técnicos por cada categoría. Correlacionar read-only configuraciones y perfiles efectivos por categoría, con informe anonimizado del coordinador.

## Gate de este frente

No declarar B2C operativo completo por estos tests. Requiere recuperar cancelaciones pagadas/visitas sin doble cobro, validar carreras reales y recuperación UI, clasificar estados productivos legacy, demostrar catálogo/oferta y completar E2E autenticado. Los cambios locales quedan sin desplegar.

## Anexo: referencia de comisión y reputación visible

P1 de presentación confirmado: `panel-tecnico.js` mostraba 70% por defecto y «Libres para ti»; `functions/b2c-service-settlement.js:165` usa comisión default32%, por tanto68% para el técnico. La liquidación prioriza tasa_comision_aplicada del servicio, luego comision_asignada del servicio, luego perfil; no deriva comisión desde nivel. Una comisión explícita0 es válida y significa100% de referencia. Corregido sólo UI con `b2c-commission-display.js`: default coherente68%,0 conservado, dato inválido «Por revisar», aviso de que tarifa efectiva depende del servicio. Se retiró la promesa de73/76% por subir nivel y se informó revisión administrativa/strikes. No se cambió tarifa, saldo, nivel ni backend.

`functions/b2c-platform-authority.js:236-268` sí tiene acción ADMIN manual recalculate_commissions; `app-bi.js:804-810` la solicita. PLATA requiere >=20 servicios, reputación>=4.5 y strikes<=1; ORO >=50,>=4.8 y strikes0. Cumplir contador no asciende automáticamente. Hay un gap operativo adicional: la detección stable usa default0.30 y puede no escribir tarifa faltante en BRONCE, aunque la liquidación default es0.32; no se modificó por ser política monetaria.

Reputación7.7/8 estrellas no prueba fraude: settlement441 incrementa0.1 por cierre sin tope, contrato normaliza número sin máximo, UI132 repite round(reputación) estrellas. No es un promedio de reseñas validado ni una escala0–5 aplicada. Se deja GAP de definición de reputación; no se truncó/migró valor ni se alteró promoción. Datos observados anonimizados.

Verificación fresca: `node --test tests/b2c-commission-display.test.mjs` 2PASS; contraste contra calculateSettlement para null/undefined/0/0.30/string, dato inválido y override de servicio. `node --check panel-tecnico.js` y diff check PASS. Producción permanece sin modificar.
