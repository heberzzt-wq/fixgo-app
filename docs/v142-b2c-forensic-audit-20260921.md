# V142 — auditoría forense B2C y gate de producción

## Dictamen

**B2C NO está listo para apertura general.** Hay un defecto financiero crítico en una Function antigua que sigue activa en producción y diferencias materiales entre perfiles aparentemente migrables y perfiles realmente aptos. Se corrigieron fallos locales de identidad, KYC, creación, asignación, cotización, cierre, evidencia, pagos y recuperación. Ningún arreglo de esta auditoría se desplegó. No se ejecutaron cargos, retiros, liquidaciones productivas, migraciones de cuentas ni operaciones pagadas.

“Mejor que Uber o DiDi” no está demostrado: no existe aquí una medición comparativa de disponibilidad, tiempos de asignación, éxito del servicio, soporte o satisfacción. La evidencia de seguridad y consistencia que sigue es un requisito previo, no una comparación comercial.

## Fuente de verdad y evidencia

- Checkout: `fixgo-app-v142-worker`, rama `v94-media-v4n-negative-claims`, HEAD inicial `504dbecc2eb5df300bfd4b639960abee60ef697b`.
- Producción leída: `3a81f4b2635ca767e04d5f6d2b87fd2091f7e7ca`; [Actions 35673823751](https://github.com/heberzzt-wq/fixgo-app/actions/runs/35673823751), success confirmado por API. HEAD local es antecesor: sólo difieren workflow y exclusiones Hosting antes de esta auditoría. No se hizo pull, checkout, commit ni push.
- HTTP público: manifest y `/api/release-identity` coinciden y declaran `financial_authority=secure-entry`. Ocho archivos publicados coinciden byte a byte con el commit productivo: worker, bootstrap de release, Firebase, paneles cliente/técnico, HTML cliente/técnico y contrato compartido.
- API autenticada read-only: ambos rulesets publicados tienen marker del release y coinciden con la fuente del commit salvo sello; 59 Functions activas; 28 usuarios, 3 servicios, 7 técnicos B2C, 5 clientes B2C. Los artefactos del informe omiten UIDs, emails, nombres, teléfonos, documentos, claves y URLs de descarga privadas.
- Fuente oficial de cinco Functions antiguas descargada y leída sin ejecutarla. Los ZIP incluyen configuración sensible: permanecen fuera del repositorio, sin copiar su contenido al informe.
- [Snapshot productivo anonimizado](v142-forensic-production-20260921.json), [fuentes remotas e IAM](v142-forensic-orphan-functions-20260921.json), [hallazgos de Functions antiguas](v142-forensic-orphan-functions-20260921.md).
- [Identidad y KYC](v142-forensic-identity-20260921.md), [workflow y estados](v142-forensic-workflow-20260921.md), [finanzas y reglas](v142-forensic-finance-rules-20260921.md). Esos anexos contienen función, causa, reproducción, cambio, test y límites de cada hallazgo. Esta matriz integrada prevalece sobre estados provisionales de los anexos.

Las etiquetas `T1…T7`, `C1…C5`, `S1…S3` sólo identifican filas dentro del snapshot; no son identidades para ejecutar migraciones. El script de auditoría sólo efectúa GET de datos/metadata. La clasificación baseline usa el contrato del commit desplegado y la clasificación candidate usa el código corregido local.

En Chrome se observó una sesión técnica existente, sin accionar claim, pagos, retiros, registro ni revisión. Cargar ese panel ejecuta el runtime normal de la aplicación, que sincroniza push y puede iniciar seguimiento; no se certifica ausencia de toda escritura automática del navegador. Las consultas administrativas de esta auditoría sí fueron de sólo lectura. No se utilizaron datos visibles personales en los artefactos.

## MATRIZ FORENSE

El estado resume lo que impide cerrar cada frente completo. `VERIFIED` se limita a la evidencia indicada; no convierte un test local en una operación productiva. `BLOCKER` incluye defectos aún activos en producción aunque haya corrección local.

| # | Subsistema | Estado | Evidencia, corrección y límite |
|---|---|---|---|
| 1 | Identidad, registro y sesión | GAP | Auth creado/perfil ausente y reintento corregidos con función real en fixture; routing preserva autoridad Auth. Falta navegador email/Google, expiración/revocación y relogin en cada estado. |
| 2 | KYC y aprobación | BLOCKER | Baseline aprobaba URLs sin objetos y podía ocultar suspensión. Corrección verifica propietario, metadata, tamaño y generación; devolución/reenvío y congelación de expediente probados localmente. Producción sigue baseline. |
| 3 | Migración de técnicos | LEGACY | Los cinco auto_migratable baseline requieren revisión con el criterio seguro. Migrador sin elevación, con concurrencia/idempotencia, probado en fixtures. Cero cuentas migradas. |
| 4 | Clientes y permisos | LEGACY | C2 tiene política canónica de efectivo; C1/C3/C4/C5 requieren decisión administrativa. Historial de pago no habilita métodos. Stripe global apagado, efectivo global encendido. |
| 5 | Catálogo y solicitud | GAP | 19 entradas: 18 B2C y 1 B2B. Configuración y cobertura reales contrastadas; creación relee autoridad dentro de transacción. ROAD habilitado sin oferta, TECH perdería su único elegible legacy al aplicar el parche. |
| 6 | Marketplace, claim y locks | GAP | Emulador real demuestra un ganador, replay, claim/cancel, suspensión y lock terminal. Falta E2E notificado, recuperación operativa tras suspensión y carga de más de 50 listings. |
| 7 | Cotización | VERIFIED | Negativos y carreras de submit/respuesta con Firestore emulado; boolean/monto/autoría/KYC actuales validados. Cotización financiera rechazada y visita se tratan como deuda separada en cancelación. No se cotizó con usuarios reales. |
| 8 | Máquina de estados | GAP | Tabla y consumidores trazados; transición de liberar a pendiente no estaba declarada y el validador de tabla no es consumidor runtime. UI aún lee estados legacy. Falta refresh/relogin en todos los estados. |
| 9 | Evidencia y cierre | BLOCKER | Baseline podía cerrar/liquidar con strings de evidencia. Nuevo cierre backend reutiliza verificador físico, valida bytes/hash/metadata/actor y deriva URLs; cliente sólo prepara binding. Pendiente despliegue y conformidad humana real. |
| 10 | Stripe | GAP | Webhooks firmados de fixture HTTP real, duplicación y errores comprobados; corregidos moneda/status/modo, dedupe por sesión y checkout estable. Falta Stripe sandbox y resolución de pago tardío sobre cancelación. Sin cargo real. |
| 11 | Efectivo | VERIFIED | Permiso global/individual leído, cliente no puede autohabilitarlo; comisión única en ledger con emulador. No se cobró ni modificó saldo real. |
| 12 | Liquidación | BLOCKER | Concurrencia física emulada produce un ledger/un incremento; evidencia inexistente o sustituida bloquea. Baseline productivo aún carece del nuevo verificador; S2 finalizado es legacy sin bindings canónicos. |
| 13 | Reconciliación admin | VERIFIED | Handler exige admin, audita antes, conserva holds y usa mismo motor; negativos y retry emulados. No hubo retry de servicios productivos. |
| 14 | Cancelación y retiro | BLOCKER | Claim/cancel y locks corregidos/probados. `requestPayout` antiguo activo permite fabricar saldo con amount negativo. Falta política operativa/financiera para abandono postcotización, visita y devolución. |
| 15 | Offline y recuperación | GAP | ID persistente por UID+digest evita duplicación ante respuesta perdida; evidencia usa objetos deterministas y binding reutilizable; KYC/Auth recuperables. Falta corte físico navegador/red, ventanas simultáneas y cuenta cambiada durante todos los pasos. |
| 16 | Firestore Rules | BLOCKER | Positivos/negativos reales en emulador: autoridad financiera, roles, KYC, bindings, holds, estados. Reglas publicadas coinciden con release anterior a estas correcciones. No se confunde emulador con despliegue. |
| 17 | Storage Rules | BLOCKER | Reglas nuevas congelan expediente tras revisión y evidencia/firma tras creación; objetos ajenos/MIME/tamaño/generación probados. Regla productiva anterior todavía permite casos corregidos. |
| 18 | Functions/entrypoint | BLOCKER | Inventario físico y archivos oficiales prueban cinco exports huérfanos; retiro vulnerable, cierre ficticio y generador público. Reemplazos locales preparados, robots B2B preservados. |
| 19 | Hosting, SW y caché | GAP | SHA y ocho archivos coinciden en producción. Login y panel técnico con sesión existente cargan. No se demostró upgrade de pestaña abierta con SW antiguo; smoke existente asigna identidad runtime desde manifest, no prueba ese ciclo. |
| 20 | Notificaciones | GAP | 9 perfiles con 9 tokens distintos al snapshot. Envío, listing y dedupe trazados; falta revocación de token al logout/cambio de cuenta, replay de republicación y recepción física. FCM aceptado no acredita entrega al dispositivo. |
| 21 | Seguridad adversarial | BLOCKER | IDOR/cross-role/cross-tenant/payload/holds/Storage y carreras cubiertos parcialmente por fixtures/emulador. Vulnerabilidad financiera remota activa impide cerrar; quedan revocación real y otras pruebas de sesión. |
| 22 | Observabilidad y recuperación | GAP | `failed_events` vacío en lectura; errores webhook y cierre observables en pruebas; reconciliación auditada. Vacío no demuestra alarmas atendidas, SLA, dead letters/replay de marketplace ni respuesta operativa. |
| 23 | Producción read-only | VERIFIED | Metadata, código remoto, reglas, bytes Hosting, catálogo, perfiles y servicios inspeccionados sin writes. `withdrawals` antiguo vacío; eso no prueba ausencia de explotación histórica. |
| 24 | E2E autenticado | PROD-UNVERIFIED | Chrome conservaba una sesión técnica real: se observó perfil, listing y RADIO LISTO del release correcto, sin aceptar tickets ni realizar acciones de cartera. No es cuenta TEST inequívoca ni recorrido cliente↔técnico/admin. La navegación inicialmente agotó tiempo; inspección posterior mostró el panel. |

## Hallazgos críticos y correcciones integradas

### F-01 — CRITICAL: retiro remoto con importe negativo

Superficie: callable productivo `requestPayout`, versión 12, fuente oficial `src/index.js:104-139`. Sólo compara amount contra saldo; `increment(-amount)` permite acreditar saldo enviando un negativo y la lectura fuera de transacción permite sobregiro concurrente. La reproducción se demuestra por inspección de fuente remota; **no se ejecutó el ataque**. IAM permite invocación HTTP pública, aunque el callable exige una identidad Firebase autenticada.

Cambio local: nombre legacy `requestPayout` apunta al mismo callable canónico `solicitarRetiro`; no se crea otra autoridad monetaria. Regresión de exports exige identidad de ambas referencias; negativos/concurrencia del motor canónico se prueban con fixtures/emulador. Producción continúa vulnerable hasta despliegue autorizado que incluya expresamente ese nombre. `withdrawals` tiene cero documentos: no hay evidencia allí de explotación, pero no certifica wallets históricos.

### F-02 — HIGH: generador remoto sin autenticación y cierre remoto ficticio

`generarModulo` versión 12, archivo remoto `src/index.js:178-250`: endpoint público llama Gemini con credencial backend sin autenticación/cuota. No se llamó al proveedor. Reemplazo local cierra esa ruta legacy con rechazo explícito sin llamada externa. `procesarCierreServicio` versión 9, `src/index.js:146-159`, sólo responde éxito: reemplazo local apunta al cierre real verificado. Nombres preservados; los schedulers `robotPreventivo_v2` y `robotPredictivo_v2` no se desactivaron porque pertenecen a B2B. Test: `tests/secure-financial-entry.test.mjs`; fuente y hashes en anexo de huérfanas. Producción no cambiada.

### F-03 — CRITICAL: aprobación y elegibilidad KYC inferidas

`functions/b2c-technician-approval.js:createApproveTechnicianHandler/verifyTechnicianStorage` y contrato `normalizeTechnicianProfile/technicianEligibility`: referencias vacías de contenido físico y flags legacy habilitaban aprobación/elegibilidad; estado KYC podía ocultar suspensión. Corregido con objetos físicos, generaciones, estados coherentes, disponibilidad falsa al aprobar y aprobación explícita; sin eliminar aliases de lectura necesarios. Tests: `b2c-kyc-physical`, `b2c-kyc-emulator`, `b2c-platform-authority`, `b2c-migration-safety`. Producción tiene T2 elegible únicamente por mecanismo legacy; desplegar cambia su elegibilidad y requiere plan individual.

### F-04 — CRITICAL: cierre y liquidación basados en referencias declaradas

`functions/b2c-service-settlement.js:bindingValid/createStoredEvidenceVerifier/createB2cOperationalClosureHandler/createB2CServiceSettlementEngine`; UI `tecnico.html:canonicalClose`. Baseline aceptaba strings/hash declarados y el cliente escribía finalizado. Corrección: mismo verificador comprueba namespace/objeto/MIME/tamaño/metadata y SHA de generación descargada; backend cambia estado dentro de transacción y calcula campos de cierre. Rules niega finalizado directo. URLs renderizadas se derivan del objeto verificado, no de la URL proporcionada.

Reproducción: fixtures sin objeto, objeto sustituido, path/actor ajeno, digest falso; cero ledger y cierre denegado. Concurrencia de cierre/liquidación produce efectos únicos. Tests `b2c-finance-emulator`, `b2c-rules-emulator`, `b2c-close-recovery`. La firma demuestra bytes/propietario de carga, **no que el cliente humano haya consentido**; falta ese E2E. Cambios sin desplegar.

### F-05 — HIGH: autoridad obsoleta, cotización y lock huérfano

`functions/b2c-platform-authority.js:createB2cServiceHandler`, `functions/b2c-service-marketplace.js:createClaimB2cServiceHandler/createCancelB2cServiceHandler`, `functions/b2c-service-workflow.js:createSubmitB2cQuoteHandler/createRespondB2cQuoteHandler`. Se releen cliente/pagos/catálogo/perfil dentro de transacción, se rechaza suspensión y payload incompleto, no se cuenta retención estimada como crédito, se recupera sólo lock terminal propio y se impide republicación insegura tras cotizar. Tests `functions/test-b2c-workflow-forensic.cjs` y `tests/b2c-workflow-emulator.test.mjs`. Repro exacto por caso WF-01…09 en anexo. Resolver un abandono postcotización aún requiere flujo administrativo y política monetaria; no se inventaron reembolsos.

### F-06 — HIGH: webhook/reintento y ledger inconsistente

`functions/secure-entry.js` checkout/webhook; `functions/b2c-financial-policy.js`; motor de settlement. Corregidos validación paid/MXN/payment, dedupe transaccional por sesión además de event ID, pago completo en centavos y rechazo de doble garantía/cambio de efectivo a Stripe. Metadata del checkout estable y compensación de sesión si cambia el servicio. `liquidado=true` no se acepta sin ledger coherente. Tests de política y HTTP firmado en emulador. Falta Stripe sandbox: mocks no prueban expiración/cobro del proveedor ni devolución de pago tardío. No se contactó Stripe para cobrar.

### F-07 — HIGH: recuperación perdía identidad de operación

`panel-cliente.js:enviarSolicitudFinal` generaba ID en cada intento. `b2c-request-recovery.js` persiste sólo UID en clave, digest y ID opaco; respuesta incierta conserva ID y ACK lo elimina. Guard de actor antes de crear y después de upload; ninguna dirección/nombre/formulario se guarda en ese registro. `tecnico.html:uploadEvidence/uploadSignature/uploadOnce/canonicalClose` usa path derivado del contenido, reutiliza upload existente y binding tras respuesta perdida. Tests `b2c-request-recovery` y `b2c-close-recovery` ejecutan decisiones y funciones reales con colaboradores controlados. No hay cola de replay entre cuentas.

Límite: tras refresh el formulario no se restaura porque deliberadamente no se almacenó PII; reenviar exactamente la misma intención reutiliza ID. Cambiar contenido puede representar otra solicitud. Ventanas simultáneas y cortes reales de red/Storage siguen sin E2E físico. Producción no cambiada.

### F-08 — HIGH: caché de validación reutilizable entre personas/servicios

`functions/index.js:validarCierreIA`: consultaba caché por notas/tenant antes de verificar autoría y devolvía aprobado en terminal antes de comprobar técnico. Tres regresiones fallaron antes y pasan después. La clave ahora incluye actor y servicio, autorización precede caché/terminal y caché se sella en la transacción. Test `tests/b2c-closure-cache-forensic.test.mjs`. No confundir validación semántica con autoridad financiera; no se alteró Jarvis/NEXO. Producción no cambiada.

### F-09 — HIGH: registro y expediente podían quedar sin salida

`firebase.js:registrarUsuario`, `app-login.js`, `panel-tecnico.js:completarDocumentosTecnico`, nuevo retorno administrativo KYC. Auth sin users recupera sólo sesión propia, sin sobrescribir cuenta existente ni rol; último upload guardado sin write final permite reenviar; devolución conserva documentación previa y pide sustituciones explícitas. Foto de identidad ya no se guarda como dataURL/alias ni se reemplaza sobre aprobado. Tests `b2c-registration-recovery`, `b2c-kyc-physical`, `b2c-migration-safety`. Falta UI autenticada y recertificación histórica; no se migraron perfiles reales.

### F-10 — HIGH: HTML ejecutable en datos persistidos

`panel-cliente.js` y `panel-tecnico.js` interpolaban URLs de foto/evidencia y texto de cotización/logística sin escape contextual. Una cadena con comillas podía crear un atributo `onerror`; un enlace javascript era otro vector. `app-utils.js:urlHttpsParaHTML` ahora valida HTTPS sin credenciales y escapa el atributo; los textos y argumentos onclick afectados se codifican para su contexto. Se conservan URLs HTTPS Storage históricas. `tests/b2c-render-xss.test.cjs` reproduce el fragmento vulnerable y ejecuta siete TemplateLiteral reales con parser HTML y casos positivos/negativos. No se inyectó HTML malicioso en producción. El saldo mostrado usa `monto_pagado`, igual que el backend, no una retención estimada. Falta prueba autenticada de navegador; el cambio no declara auditados todos los sinks de toda la plataforma.

### F-11 — MEDIUM: la interfaz prometía efectos no confirmados

`panel-cliente.js` anunciaba unidades en camino al crear una solicitud, cobro Stripe automático y TOTAL PAGADO al finalizar. Ahora distingue solicitud registrada de asignación, pide completar el saldo mediante Stripe y muestra total del servicio. `panel-tecnico.js` muestra FINALIZADO en lugar de inferir COBRADO. No se cambiaron cobros.

`panel-tecnico.js` usaba fallback de comisión30% (70% neto), mientras `calculateSettlement` usa32% (68%) cuando no hay tarifa específica. `b2c-commission-display.js` alinea la referencia y respeta cero explícito; la UI aclara que prima la tarifa del servicio y que la promoción depende de revisión/strikes. Dos regresiones contrastan contra el cálculo backend real. No se alteró dinero ni niveles. Queda deuda: reputación sube0.1 por settlement sin tope y no es un promedio de valoraciones de cinco estrellas; la presentación actual de estrellas y los criterios de nivel requieren contrato de reputación real. El NOC de recalcular comisiones también conserva un caso BRONCE sin tarifa por su fallback30%; debe decidirse política explícita antes de modificar saldos/tarifas.

## MIGRACIÓN DE PRODUCCIÓN

### Técnicos auto_migratable y revisión humana

| Cuenta | Clasificación productiva | Hallazgo individual | Transformación segura propuesta | Reversibilidad / decisión |
|---|---|---|---|---|
| T1 | auto_migratable | Activo legacy, sin KYC/vehículo/documentos y sin tipo_cuenta explícito; no disponible | Recabar documentación y decisión de tipo/estado; no rellenar vehículo/banco/aprobación | Revisión humana, snapshot previo y diff de campos antes de eventual write |
| T2 | auto_migratable | Activo/disponible, vehículo+logistica, verificado/aprobadoEn, sin kyc; objetos foto/INE/CSF/licencia existen y ruta es propia | Revisar significado real de archivos y autoridad histórica; confirmar tipo B2C y nueva aprobación/pins; preservar aliases durante transición | Humana; candidato dejará de considerarlo elegible; no activar/desactivar disponibilidad por migración ciega |
| T3 | auto_migratable | Mismo patrón incompleto de T1 | Recabar KYC/operación, no inferir | Humana; sin escritura |
| T4 | canonical | Activo/disponible, aprobación explícita; cuatro objetos propios existentes, sin generación fijada en aprobación | Recertificar expediente histórico y pins con decisión explícita; shape no equivale a documentación revisada | Sin autoaprobación ni cambio financiero; snapshot/rollback de campos |
| T5 | auto_migratable | Mismo patrón incompleto de T1 | Recabar KYC/operación, no inferir | Humana; sin escritura |
| T6 | auto_migratable | Mismo patrón incompleto de T1 | Recabar KYC/operación, no inferir | Humana; sin escritura |
| T7 | canonical | Pendiente revisión/no aprobado/no disponible; referencias foto/INE/CSF no canónicas para el bucket | Devolver referencias concretas, subir documentos válidos y revisión; licencia se exige según vehículo, no inventarla | Permanece pendiente; no autorización por shape |

**Resultado seguro: cinco baseline auto_migratable pasan a requires_review; cero de esos cinco se certifican para aplicación automática.** Los dos canónicos mantienen su clasificación de forma, no una certificación de operación. En T2/T4 se verificó metadata física, no autenticidad semántica ni bytes de documentos personales. No se descargaron imágenes personales para este informe.

### Clientes

| Cuenta | Clase | Evidencia | Migración segura |
|---|---|---|---|
| C1 | requires_review | Sin permisos canónicos, sin historial efectivo observado | Decisión admin explícita para cada método; no usar valor inferido |
| C2 | canonical | Stripe false, efectivo true; historial efectivo; falta tipo_cuenta explícito | Preservar permisos, revisar clasificación de cuenta y ruta de sesión sin ampliar derechos |
| C3 | requires_review | Sólo rol entre campos operativos consultados; sin permisos/historial | Completar perfil con propietario y decisión admin; no fabricar dirección/coords |
| C4 | requires_review | Mismo patrón de C3 | Misma revisión, separada por cuenta |
| C5 | requires_review | Sin permisos canónicos; hay historial efectivo/sintético | El historial no autoriza cash ni Stripe; decisión humana y depurar lógicamente servicio de prueba sin borrar |

Dirección/coords personales no se imprimen. No se certificó domicilio real ni autorización mediante historial. Global productivo: Stripe false y efectivo true; cambiar global o individual requiere acción admin explícita, no forma parte de esta auditoría.

### Servicios legacy

- S1: pendiente, efectivo, C2, sin técnico, fix_plomeria y destino confirmado; sin ledger ni binding, coherente con no haber terminado. Faltan marcadores canónicos de tipo; comprobar proyección/intención con dueño antes de republicar.
- S2: finalizado, efectivo, C2/T4, fix_ac; sin destino confirmado ni flags/binding canónicos. **Tiene un registro de transacción vinculado, pero no el ledger canónico `txn_split_*`.** No reabrir ni liquidar automáticamente: podría duplicar un efecto histórico. Reconciliar evidencia e historial de forma humana.
- S3: pendiente, `tipo=b2c_e2e_sintetico`, efectivo, C5, categoría desconocida, destino confirmado, sin ledger/binding. Es residuo de prueba, no permiso de pago ni contrato de compatibilidad. Aislar mediante decisión explícita, sin borrado en esta auditoría.

Se contaron 14 documentos en `transacciones`; no se publicaron actores ni importes. Esta correlación no certifica saldos ni contabilidad histórica.

### Catálogo y cobertura

Hay 19 categorías configuradas; `maint_general` es B2B. Ocho categorías B2C habilitadas: road_llanta, road_cerrajero, fix_electricidad, fix_plomeria, fix_ac, tech_cctv, tech_alarma, tech_acceso. Las dos ROAD no tienen técnicos compatibles disponibles en el snapshot. FIX tiene dos con criterio desplegado y uno con criterio corregido; TECH uno desplegado y cero corregido hasta revisar T2. Las restantes diez B2C están deshabilitadas. No se apagaron categorías por falta de cobertura: `catalogo_global` sigue siendo la autoridad administrativa, cobertura es información para operación/UX.

## B2C — DEUDA RESTANTE

Orden de dependencia, no de conveniencia:

1. **CRITICAL / producción:** neutralizar `requestPayout` vulnerable mediante release autorizado que reemplace ese nombre; incluir mitigación del generador público y cierre ficticio. Una publicación que omita exports legacy mantiene la brecha. No borrar/desactivar schedulers B2B sin estudiar sus consumidores.
2. **Integración del release:** revisar diffs/entrypoints/reglas y confirmar que el release futuro incluya completeB2cService, returnB2cTechnicianKyc y alias protegidos. [Alcance concreto preparado](v142-b2c-release-scope-20260921.json), sin autorización ni ejecución. El workflow existente contiene listas explícitas; no crear otro workflow/versionar plataforma arbitrariamente. Recertificación local al final de este documento.
3. **Datos e identidad:** decisiones individuales T1–T7/C1–C5 y S1–S3; pins históricos, pruebas reales de documentos, cuenta B2C explícita cuando corresponda, preservación de dinero/roles/disponibilidad. No autohabilitar cash ni Stripe.
4. **Cancelación/pagos:** definir y demostrar circuito administrativo de abandono después de cotizar, rechazo con visita550, pago tardío, reembolso/retención y holds. El parche impide republicación insegura; eso no proporciona por sí mismo una resolución operativa.
5. **Proveedor financiero:** Stripe sandbox para checkout estable, expiración, replay, webhooks fuera de orden y cancelación mientras sesión está abierta. Las firmas HTTP locales cubren aplicación receptora, no comportamiento del proveedor. No usar dinero real para cerrar este gate.
6. **Sesiones y navegador:** E2E TEST cliente crea → técnico ve/reclama → cotiza → cliente responde → llegada/trabajo → evidencias → cierre backend; admin devuelve/reaprueba KYC. Repetir logout/relogin/expiración/revocación, refresh en cada estado, account swap y dos pestañas. No hay credenciales TEST inequívocas disponibles en esta auditoría.
7. **Offline:** cortes antes/después de commit y durante cada upload, Storage completado/Firestore fallido, cierre de navegador y restauración. ID/digest y binding reducen duplicación, pero falta ese ensayo físico. Probar reconstrucción de la misma intención sin formulario persistido y posibles solicitudes paralelas distintas.
8. **Máquina de estados:** alinear tabla declarada con actores/acciones reales y transición de liberar a pendiente; eliminar deriva entre UI/backend/rules mediante regresión por transición. Revisar lectores de pagado/liquidado/archivado sin eliminar compatibilidad necesaria.
9. **Oferta y escala:** cubrir ROAD/TECH, explicar falta de oferta al cliente y no prometer unidad en camino antes de asignación. `limit(50)` anterior al filtro de skill puede ocultar órdenes compatibles; necesita consulta/paginación e índices probados con >50. Resync lee pending secuencialmente: probar presupuesto, fallo parcial y checkpoint.
10. **FCM:** desvincular propiedad de token en logout/cambio de cuenta y comprobar revocados/duplicados; replay de eventos tras reactivar catálogo/disponibilidad; un evento sobrescrito con mismo ID no ejecuta de nuevo onCreate. Prueba física pantalla bloqueada/sonido/canal/foreground/background; las notificaciones nunca cambian autoridad del servicio.
11. **Release/caché:** ensayo con SW antiguo y pestaña abierta, actualización completa y rechazo de mezcla de HTML/JS. Comparación de bytes actual es positiva, pero no prueba una transición de caché. Considerar hashes de assets en certificación, no inferir identidad runtime sólo de manifest.
12. **Operación/soporte:** alarmas verificadas y responsables para failed_events, settlement bloqueado, locks, falta de técnico, disputas y dead letters. Simular falla y demostrar detección → actuación → recuperación auditada. Cero eventos en una colección no acredita este proceso.
13. **Autorización y despliegue:** sólo tras decisión expresa, release coordinado FixGo con rules/Functions/Hosting consistentes; sin Multiservicios ni nuevas operaciones pagadas. Repetir comparación bytes/exports/reglas y canarios seguros; separar despliegue de cualquier migración de datos, que necesita autorización específica.
14. **Validación de servicio real:** consentimiento del cliente, tiempos de asignación/llegada, incidencias, soporte y observabilidad con cohortes controladas. Definir objetivos medibles antes de declarar superioridad a otro producto. No existe garantía de que una auditoría elimine cualquier fallo posible.
15. **Reputación y comunicación económica:** definir valoración real frente a puntos operativos, límites y ascensos administrativos; corregir presentación de estrellas fuera de escala y reconciliar tarifa BRONCE implícita del NOC con la autoridad financiera. La referencia UI fue corregida sin cambiar dinero, pero no reemplaza esa decisión de producto/operación.

## GATE PARA DECLARAR B2C LISTO

**Demostrado:** release productivo identificado; bytes y rules comparados; inventario real de Functions y código huérfano; perfiles/categorías/objetos históricos clasificados; defectos reproducidos; correcciones locales con negativos y concurrencia Firestore/Storage real emulada; reintentos de operación propios y protección de campos autoritativos.

**Impide cerrar:** Function financiera vulnerable y generador público aún desplegados; arreglos sin desplegar; revisión/migración real pendiente; política y recuperación de cancelación monetaria incompletas; Stripe sandbox pendiente; E2E autenticado, revocación, offline físico, FCM y upgrade SW sin evidencia completa; oferta insuficiente en categorías habilitadas y recuperación/alertas operativas no certificadas.

No se declara “100%”, no se inventa porcentaje y no se transforma una prueba omitida en un éxito. La auditoría produce evidencia y un candidato local; la plataforma productiva no está certificada para lanzamiento general.

## Recertificación integrada

- `npm.cmd run ci:test`: 985 pruebas reportadas, 984 aprobadas, cero fallos y una omitida (Chrome NEXO existente), además de scripts B2C aprobados. Este pase general comenzó antes de los últimos cambios de cierre, XSS y presentación de comisión: no se presenta como certificación completa del árbol final. Log: `%TEMP%/fixgo-v142-forensic-ci-20260921.log`.
- Recertificación de los frentes afectados: `npm.cmd run test:platform-hardening` **44/44** y `npm.cmd run test:b2c-platform` **22/22**, más sus seis scripts aprobados; cero fallos/omisiones. Log: `%TEMP%/fixgo-v142-forensic-unit-certified.log`.
- Último pase `npm.cmd run test:b2c-forensic`: **59/59**, cero fallos/omisiones; incluye correcciones finales de XSS y comisión mostrada. Log: `%TEMP%/fixgo-v142-forensic-ui-final.log`.
- `npm.cmd run test:b2c-forensic-emulators`: **37/37**, cero fallos/omisiones, con Firestore y Storage reales emulados. Incluye cierre backend, carreras, liquidación, KYC, reglas y recuperación de webhooks. Log: `%TEMP%/fixgo-v142-forensic-integrated-emulators.log`.
- Foco posterior de Rules: **3/3**, cero fallos/omisiones. Dos nuevos positivos prueban escrituras de cliente SDK para asignado → en_camino → en_sitio, evidencia/Storage/tracking y respuesta recibido o disputa del cliente; el tercero conserva el negativo de cierre directo. Log: `%TEMP%/fixgo-v142-rules-arrival-positive-final.log`. No hubo cambio de reglas en este foco; se corrigió una ruta equivocada del fixture de disputa. No se afirma un nuevo pase integrado 39/39 ni atomicidad del conjunto de escrituras del frontend.
- Sintaxis de módulos cambiados y `git diff --check` comprobados; emuladores cerrados. Los primeros pases 31/31 y 33/33 preceden al cierre backend y quedan superados por el pase integrado de 37. No se suman suites solapadas como si fueran casos únicos.

Estas pruebas acreditan el alcance local descrito. No reemplazan Stripe sandbox, recorrido TEST autenticado, pruebas físicas offline/FCM, migración revisada ni publicación autorizada. Los cambios permanecen locales, sin commit, push o despliegue.
