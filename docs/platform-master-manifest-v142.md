# Manifiesto maestro — Península Tech / FixGo / ADJUNTO V142

**Corte de evidencia:** 2026-10-22 · **Base local:** `v142-official` / `9dc302ba` · **Repositorio:** `heberzzt-wq/fixgo-app`

> Este documento es un INVENTARIO y plan de pruebas, NO una certificación de seguridad
> ni autorización de despliegue. Los reportes históricos no demuestran el estado productivo actual.

## LEE ESTO PRIMERO - relevo y continuidad inmediata

**Actualizado:** 2026-10-22 | **Candidato certificado en local:** `3caa2f3899aab488f90edef7535beac55f6ca96e` | **Rama:** `v142-official`

**Meta:** LEER PRIMERO: usar este documento y el informe diario, comprobar SHA real y recibos antes de continuar; no repetir preguntas resueltas ni dar por hecho un despliegue.

**Laptop:** `adjunto-jarvis` | **Repositorio:** `C:/Users/heber/Documents/Codex/2026-06-17/estas-conectado-a-github-y-a/work/fixgo-app-v142-worker`

**Resumen:** Jarvis/ADJUNTO V142: reparacion del nulo collections, token Firebase del propietario para /workstation/health, endurecimiento Hosting y tests del supervisor/frescura; CI completa verde sobre el candidato.

**Infraestructura actual al corte:** BRIDGE_IDENTITY_OK sobre el candidato; supervisor 3345; Ollama qwen3.5:9b LOCAL_ONLY; puertos `5000`, `3344`, `3345`, `11434`.

**Control de ventanas:** No tocar foco ni ventanas de Chrome; el propietario usa TikTok durante las pruebas.

### Entregas y acciones verificadas

- 12 NS1 originales se intentaron por web, todas fallaron por SEMANTIC_AUTHENTICATED_PROVIDER null collections; sin IDs de recibos. No repetir como exitos.
- NS1-08 RETEST WEB completado con repo.graph y conversation.respond; solo certifica alcance estructural, no E2E general ni relay multi-dispositivo.
- Correccion protegida contra catalogo null; solicitud health del relay con Firebase ID token del propietario, sin rebajar autorizacion.
- Pruebas desactualizadas de health supervisor y fixture de frescura corregidas; no se debilitaron gates de seguridad.
- CI oficial completa 1692 PASS, 0 FAIL, 1 SKIP sobre candidato; Qwen real ejecuto dos pruebas de lectura ingenieril sobre SHA anterior.
- Firebase Hosting candidato: reduccion 325 a 269 archivos al excluir modulos Node, herramientas MCP, backend admin, pruebas y configuraciones no web.
- Staging aislado de los archivos reales seleccionados por firebase-tools: 7 rutas publicas HTTP 200 + 9 privadas HTTP 404, 16/16 PASS.
- Verificacion de cierre de imports: 201 JS y 30 HTML; 0 importaciones locales ausentes y 0 errores de parseo.
- Dry-run Firebase solo Hosting EXIT 0, sin publicar; repositorio oficial limpio y bridge cargado desde el SHA candidato.
- Propuesta GitHub Actions Windows/Linux preparada pero envio rechazado por token OAuth sin scope workflow; se conservo fuera del repositorio y se restauro la rama.

### Evidencia tecnica certificada (sin elevarla a produccion)

- CI completa: 1692 PASS, 0 FAIL, 1 SKIP. `npm run ci:test` (exit 0).
- Hosting candidato: 269 archivos; 7 HTTP publicos 200, 9 privados 404, 0 imports ausentes.
- Pruebas fisicas de Qwen: 2. read-only local physical pilot; not authenticated web E2E.

### BLOQUEO ACTUAL: NO PUBLICADO

- Estado: `BLOCKED_NOT_DEPLOYED`; causa: `SOVEREIGN_DEPLOY_BLOCKED: DEPLOY_BRANCH_NOT_ALLOWED; workflow permissions also missing`.
- SHA web: `e1b0ed175754ca546210cf6068d84e7d47193d7d`; candidato: `3caa2f3899aab488f90edef7535beac55f6ca96e`.
- No alterar gate; no escribir fondos, reglas ni Functions sin autorizacion.

### Ruta de recuperacion para el siguiente chat

1. Resolver la promocion autorizada de Hosting desde una rama/revision permitida con CI y permiso workflow adecuados, sin saltarse protecciones ni desplegar otros sitios/Functions/reglas.
1. Verificar despues de publicacion SHA servido == SHA Bridge, relay /workstation/health autenticado sin 401, y que archivos privados devuelven 404.
1. Ejecutar mision real en Terminal Firebase con recibo verificable y luego las 12 NS1 seguidas; clasificar SUCCEEDED, PARTIAL, FAILED con evidencia y artefactos.
1. Seguir con E2E B2C/B2B, KYC camara, dinero, no-lockout y seguridad; pruebas locales NO certifican produccion.
1. Actualizar este manifiesto y el diario al cerrar cada hito; no confundir el diario automatico con certificacion de produccion.

### Recibos locales (en la laptop autorizada)

- `C:/Users/heber/Downloads/Jarvis-V142-certificacion-3caa2f38-20261022.zip`
- `C:/Users/heber/Downloads/jarvis-v142-hosting-preview-20261022.json`
- `C:/Users/heber/Downloads/jarvis-v142-browser-import-closure-20261022.json`
- `C:/Users/heber/Downloads/jarvis-ns1-web-12-missions-20261022.json`
- `C:/Users/heber/Downloads/jarvis-ns1-web-12-misiones-diagnostico-20261022.md`
- `C:/Users/heber/Downloads/v142-official-ci-certification-proposal.yml`

### Reporte diario automatico

- Leer `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/ultimo.md` y `ultimo.json` para observar cambios posteriores a este corte. Ese diario NO certifica cambios automaticamente.
- Fuente de verdad de los 57 frentes: `docs/platform-master-manifest-v142.json`; esta vista se regenera, nunca se edita a mano.

---

## Estado global verificable

- **57 frentes inventariados:** B2C: 16 · B2B: 9 · JARVIS: 18 · SEGURIDAD: 7 · OPERACIONES: 7.
- **33 prioridades P0:** dependencias críticas o bloqueos de lanzamiento, no necesariamente vulnerabilidades explotables.
- **B2C:** el forense de septiembre consideró bloqueada su apertura general; se necesita
  nueva verificación remota de retiros, KYC, liquidaciones, Functions y reglas.
- **B2B:** los módulos y pruebas de aislamiento existen, pero falta certificar E2E multiempresa en producción.
- **Jarvis:** Qwen local y varias misiones/artefactos reales demostrados; falta autonomía repetible
  de múltiples tareas, conectores OAuth y recuperación verdaderamente transversal.
- **Seguridad:** perímetro web local probado. Un pentest externo, el control uniforme de rutas
  privilegiadas y la seguridad pública son trabajos distintos.

## Qué hay local y qué está publicado

| Superficie | Evidencia de solo lectura | Conclusión segura |
|---|---|---|
| Código V142 auditado | `9dc302ba` | Código de la rama; NO prueba despliegue |
| Contrato servido desde https://fixgo-44e4d.web.app | `v94-media-v4n-negative-claims` | Rama diferente de V142 |
| Manifiesto release de Hosting | `e1b0ed17` | SHA publicado distinto del local |
| JS interno servido públicamente | `/jarvis-github-worker.js`, `/jarvis-semantic-http.js`, `/jarvis-qwen-decision-http.js`, `/jarvis-repo-intelligence.js`, `/jarvis-local-video-engine.js` | HTTP 200 observado; no implica acceso al proceso local |

**Fecha de observación pública:** 2026-10-22. Se requiere volver a consultar tras cualquier despliegue autorizado.

## Baterías observadas

| Suite | Pasaron | Fallaron | Alcance |
|---|---:|---:|---|
| B2B dirigida | 31 | 0 | Node local: b2b-* y auth-routing-consistency (2026-10-21) |
| B2C dirigida | 63 | 0 | Node local: selección física b2c-* (2026-10-21) |
| Bridge V142 | 110 | 0 | Node local con Python funcional, último pase registrado (2026-10-21) |
| Qwen / aislamiento | 367 | 0 | Node local de test bundles, no equivale a E2E productivo (2026-10-21) |
| CI oficial V142 SHA 3caa2f38 | 1692 | 0 | npm run ci:test; PowerShell Node real, B2C/B2B/Jarvis/artefactos; exit code 0; 8 grupos, pueden solaparse; no es E2E Firebase (2026-10-22) |
| Hosting staging filtrado SHA 3caa2f38 | 16 | 0 | Firebase Hosting emulator isolated; 7 rutas HTTP 200 y 9 rutas HTTP 404, candidato no publicado (2026-10-22) |
| Closure imports y seguridad SHA 3caa2f38 | 4 | 0 | tests/jarvis-hosting-web-surface-security.test.mjs; 269 files, 201 JS y 30 HTML, 0 missing imports (2026-10-22) |

Las suites pueden solaparse: NO se suman como número de casos independientes.

## B2C — cliente, técnico, marketplace, pagos y soporte

| ID | Prio | Capacidad | Estado de código | Evidencia productiva | Referencias | Próximo cierre |
|---|---|---|---|---|---|---|
| B2C-01 | **P0** | Registro, acceso y sesiones | Implementado y con pruebas locales | `sin_e2e_productivo` | `firebase.js`, `app-login.js`, `tests/b2c-registration-recovery.test.mjs` | **Pendiente:** E2E cliente email/Google, expiración, revocación, cambio de cuenta y recuperación sin expulsar al dueño. **Certificar:** Sesiones reales de prueba cubren entrada, refresh, cierre, revocación y regreso sin bucles. |
| B2C-02 | **P0** | KYC técnicos, rostro, INE y aprobación | Implementado y con pruebas locales | `bloqueo_historico` | `functions/b2c-technician-approval.js`, `tests/b2c-kyc-physical.test.cjs` | **Pendiente:** Revisar cámara móvil y documentos físicos; recertificar expedientes legacy sin autoaprobar. **Certificar:** Captura/recaptura móvil, retorno y aprobación humana con evidencia inmutable, E2E. |
| B2C-03 | **P1** | Roles cliente, técnico, jefe y ayudante | Existe código, falta certificación integral | `no_verificado` | `functions/b2c-platform-authority.js`, `functions/b2c-provider-crew.js`, `tests/b2c-platform-authority.test.mjs` | **Pendiente:** Probar límite de miembros, delegación, separación de cuentas y permisos reales. **Certificar:** Pruebas cross-role, cross-tenant y casos de equipo en sesión autenticada. |
| B2C-04 | **P0** | Catálogo, solicitudes y disponibilidad | Implementado y con pruebas locales | `sin_e2e_productivo` | `functions/b2c-service-marketplace.js`, `functions/b2c-platform-authority.js`, `tests/b2c-platform-authority.test.mjs` | **Pendiente:** Reconciliar oferta ROAD/TECH y validación de catálogo vivo y SLA de creación. **Certificar:** Solicitud verificada con categoría atendible, ningún técnico fantasma y confirmación de estado. |
| B2C-05 | **P0** | Asignación, claim, bloqueo y no-show | Implementado y con pruebas locales | `sin_e2e_productivo` | `functions/b2c-service-marketplace.js`, `b2c-technician-no-show.js`, `tests/b2c-workflow-emulator.test.mjs` | **Pendiente:** Correr flujo completo y concurrencia >50 listings; reintento de notificación y anulación. **Certificar:** Solo una adjudicación, locks liberados exactamente una vez y trazabilidad cliente-técnico. |
| B2C-06 | **P0** | Cotización y autorización de cliente | Implementado y con pruebas locales | `sin_e2e_productivo` | `functions/b2c-service-workflow.js`, `tests/b2c-workflow-emulator.test.mjs` | **Pendiente:** Probar presupuestos, rechazos, tiempos y concurrencia en navegadores reales. **Certificar:** Consentimiento y quote vinculados a servicio y actor con transacción verificable. |
| B2C-07 | **P0** | Evidencia de trabajo y firma | Implementado y con pruebas locales | `bloqueo_historico` | `b2c-evidence-orchestrator.js`, `functions/b2c-service-settlement.js`, `tests/b2c-close-recovery.test.mjs` | **Pendiente:** Comprobar consentimiento humano y bytes auténticos; inspeccionar Storage productivo. **Certificar:** Firma/imagen del actor correcto, no reuso cruzado, cierre bloqueado ante evidencia inexistente. |
| B2C-08 | **P0** | Cierre y liquidación | Implementado y con pruebas locales | `bloqueo_historico` | `functions/b2c-service-settlement.js`, `tests/b2c-finance-emulator.test.mjs` | **Pendiente:** Validar funciones legacy y sincronizar funciones/rules/hosting autorizadamente. **Certificar:** Un solo ledger y cierre por servicio, rollback operativo seguro. |
| B2C-09 | **P0** | Efectivo, comisiones y saldo | Implementado y con pruebas locales | `no_verificado` | `functions/b2c-financial-policy.js`, `b2c-commission-display.js`, `tests/b2c-commission-display.test.mjs` | **Pendiente:** Alinear catálogo de tasas, comisiones y reputación sin tocar wallets. **Certificar:** Política firmada, saldos reconciliados e informe financiero auditable. |
| B2C-10 | **P0** | Tarjeta, Stripe y webhooks | Existe código, falta certificación integral | `sin_sandbox_proveedor` | `functions/secure-entry.js`, `b2c-stripe-fail-closed-stub.js`, `tests/secure-financial-entry.test.mjs` | **Pendiente:** Flujo real en sandbox de Stripe y pago tardío tras cancelación. **Certificar:** Eventos firmados, idempotencia y refund reales sandbox, no solo mocks. |
| B2C-11 | **P0** | Retiros requestPayout y permisos financieros | Implementado y con pruebas locales | `bloqueo_historico` | `functions/index.js`, `tests/b2c-withdrawal-recovery.test.mjs`, `docs/v142-security-hotfix.md` | **Pendiente:** Revalidar versión REMOTA de requestPayout; auditoría histórica halló importe negativo. **Certificar:** Función antigua neutralizada en producción, pruebas negativas sin operaciones monetarias. |
| B2C-12 | **P0** | Cancelaciones, disputas y reembolsos | Existe código, falta certificación integral | `sin_e2e_productivo` | `b2c-client-dispute-ui-recovery.js`, `b2c-technician-no-show.js`, `tests/b2c-close-recovery.test.mjs` | **Pendiente:** Resolver abandono postcotización, soporte, visita y devoluciones financieras. **Certificar:** Matriz de motivos/autorización y E2E documentado por estado. |
| B2C-13 | **P1** | Notificaciones FCM y logout | Existe código, falta certificación integral | `no_verificado` | `b2c-client-arrival-notification.js`, `b2c-client-arrival-dispute-evidence.js`, `docs/v142-b2c-forensic-audit-20260921.md` | **Pendiente:** Entrega física en móviles, revocación de token por cuenta y replay. **Certificar:** Push recibido en dispositivo autorizado y token viejo rechazado. |
| B2C-14 | **P1** | Offline, sincronización, recuperación de solicitud | Implementado y con pruebas locales | `sin_e2e_productivo` | `b2c-request-recovery.js`, `tests/b2c-request-recovery.test.mjs` | **Pendiente:** Simular cambios de red, dos pestañas y reconexión sin duplicados. **Certificar:** Idempotencia física y usuario correcto tras cambios de red/refresh. |
| B2C-15 | **P0** | Cobertura de Firestore y Storage Rules | Implementado y con pruebas locales | `publicacion_no_verificada` | `security/firestore-console-snapshot-2026-07-30.rules.txt`, `security/storage-hardening-candidate.rules.txt`, `tests/b2c-security-rules-contract.test.mjs` | **Pendiente:** Comparar rules REMOTAS contra commit y emuladores; proteger cross-tenant. **Certificar:** Reglas productivas versionadas, sin permisos heredados inseguros. |
| B2C-16 | **P0** | E2E cliente → técnico → admin → cobro | Aún sin evidencia suficiente | `no_verificado` | `docs/v142-b2c-forensic-audit-20260921.md`, `tests/b2c-client-technician-contract.test.mjs` | **Pendiente:** Sin prueba completa certificada de dispositivos reales y cuentas TEST. **Certificar:** Recorrido completo con recibos, estrés, cancelación y tiempos de recuperación. |

## B2B — empresas, personal, supervisión y contratos

| ID | Prio | Capacidad | Estado de código | Evidencia productiva | Referencias | Próximo cierre |
|---|---|---|---|---|---|---|
| B2B-01 | **P0** | Aislamiento de empresas/tenants y roles | Implementado y con pruebas locales | `sin_e2e_productivo` | `b2b-supervisor-session.js`, `tests/b2b-supervisor-session.test.mjs` | **Pendiente:** Sesiones reales de varias empresas; alta baja y cambio de tenant. **Certificar:** Ninguna lectura, escucha ni edición cruzada entre empresas. |
| B2B-02 | **P1** | Supervisor, personal y sesiones | Implementado y con pruebas locales | `sin_e2e_productivo` | `panel-supervisor-b2b.js`, `tests/b2b-render-authority.test.mjs` | **Pendiente:** Validar refresh, sesiones expiradas, nueva red y recuperación de supervisor. **Certificar:** Acceso correcto tras revocar y reactivar, sin exponer datos de otra empresa. |
| B2B-03 | **P0** | Expedientes y KYC de personal | Implementado y con pruebas locales | `sin_e2e_productivo` | `functions/b2b-personnel-kyc.js`, `tests/b2b-personnel-kyc.test.cjs` | **Pendiente:** Revisión humana, documentos y almacenamiento real por tenant. **Certificar:** Aprobación administrativa y objetos físicos cruzados denegados. |
| B2B-04 | **P1** | Offline y cache por empresa | Implementado y con pruebas locales | `sin_e2e_productivo` | `b2b-offline-authority.js`, `tests/b2b-offline-authority.test.mjs` | **Pendiente:** Pruebas con desconexión real y cuentas alternadas. **Certificar:** Sin filas entre empresas, caché revocada y sincronización sin duplicados. |
| B2B-05 | **P1** | Panel técnico B2B y tareas | Existe código, falta certificación integral | `no_verificado` | `app-tecnico-b2b.js`, `tecnico-b2b.html` | **Pendiente:** Pruebas reales de asignación, bitácora, permisos jefe/ayudante. **Certificar:** Flujo en móvil y desktop, evidencia por empresa sin cross-tenant. |
| B2B-06 | **P1** | Panel administración y expedientes | Existe código, falta certificación integral | `no_verificado` | `panel-b2b-admin.js`, `expediente-b2b.js` | **Pendiente:** Conformidad de roles, KPIs, auditoría de cambios y desempeño en móvil. **Certificar:** Administración verificable con recuperación, permisos y trazas. |
| B2B-07 | **P1** | Robots preventivo/predictivo | Componente histórico por recertificar | `no_verificado` | `docs/v142-release-preparation.md`, `functions/index.js` | **Pendiente:** Verificar schedulers preservados, IAM, resultados y límites productivos. **Certificar:** Robots existentes intactos, ejecución y métricas verificadas. |
| B2B-08 | **P1** | Facturación/cobro y contratos | Aún sin evidencia suficiente | `no_verificado` | `modulo-b2b.js`, `docs/v142-release-preparation.md` | **Pendiente:** Definir facturación contractual, roles y conciliación de empresas. **Certificar:** Contrato económico B2B probado sin mezclar wallets B2C. |
| B2B-09 | **P0** | Pruebas E2E y multi-tenant adversarial | Aún sin evidencia suficiente | `no_verificado` | `tests/b2b-supervisor-session.test.mjs`, `tests/b2b-render-authority.test.mjs` | **Pendiente:** Falta certificación navegadores, desconexiones y tenants reales de prueba. **Certificar:** Suite E2E firmada con al menos dos tenants y revocación en caliente. |

## Jarvis — IA local, agentes, herramientas y artefactos

| ID | Prio | Capacidad | Estado de código | Evidencia productiva | Referencias | Próximo cierre |
|---|---|---|---|---|---|---|
| JARVIS-01 | **P1** | Qwen3.5:9b local como cerebro único | Demostrado en flujo local acotado | `local_only` | `jarvis-runtime-contract.json`, `jarvis-qwen-direct-cycle.js` | **Pendiente:** Métricas de disponibilidad, saturación memoria, reinicio por red. **Certificar:** Único LLM local, sin fallback externo ni llamadas pagadas. |
| JARVIS-02 | **P0** | Planner semántico y misiones largas | Implementado y con pruebas locales | `parciales_historicos` | `modules/terminal/qwen-general-pilot.js`, `tests/jarvis-qwen-autonomy-long-missions.test.mjs` | **Pendiente:** Misiones reales consecutivas sin bucles ni falsos VERIFIED. **Certificar:** ≥30 misiones E2E representativas, errores y cobertura evidenciados. |
| JARVIS-03 | **P0** | Herramientas, lectura, búsquedas y evidencia | Implementado y con pruebas locales | `sin_sla` | `jarvis-qwen-tool-bridge.js`, `tests/jarvis-qwen-tool-bridge.test.mjs` | **Pendiente:** Cobertura por herramienta, reintentos bounded y outputs autenticados. **Certificar:** Catálogo físico con tasa de éxito comprobada y límites claros. |
| JARVIS-04 | **P1** | Investigación y fuentes independientes | Implementado y con pruebas locales | `test_real_acotado` | `modules/terminal/qwen-general-evidence.js`, `tests/jarvis-qwen-research-delivery.test.mjs` | **Pendiente:** Verificar rastreo web actual, calidad y citas exactas en misión real. **Certificar:** Resultados reproducibles con evidencia original, no inferencias sueltas. |
| JARVIS-05 | **P1** | DOCX, PDF, XLSX y reporte descargable | Implementado y con pruebas locales | `test_real_acotado` | `jarvis-fs-bridge.js`, `tests/jarvis-xlsx-calculation.test.mjs` | **Pendiente:** Cobertura formatos, firmas/lecturas físicas y casos negativos. **Certificar:** Crear, leer de nuevo, verificar SHA y exportar en Terminal sin errores. |
| JARVIS-06 | **P1** | XML: validación y autorreparación limitada | Implementado y con pruebas locales | `no_integrado_ui` | `jarvis-structured-artifact-recovery.js`, `tests/jarvis-xml-self-repair-bridge.test.mjs` | **Pendiente:** Terminal aún no certifica descarga XML ni reparación semántica general. **Certificar:** XML autenticado completo: crear, corregir, revalidar, exportar, descargar. |
| JARVIS-07 | **P1** | Generación de anuncios/medios/video | Existe código, falta certificación integral | `parciales_historicos` | `jarvis-local-video-engine.js`, `tests/jarvis-qwen-advertising-integration.test.mjs` | **Pendiente:** E2E físico de videos, logo fiel, formatos sociales y derechos. **Certificar:** Archivo entregado, fuente autorizada y prueba visual humana. |
| JARVIS-08 | **P1** | Parche exacto para revisión humana | Demostrado en flujo local acotado | `no_aplicado` | `jarvis-qwen-direct-cycle.js`, `tests/jarvis-qwen-engineering-pilot.test.mjs` | **Pendiente:** Ampliar alcance a fuentes reales sin ceder autoridad de escritura. **Certificar:** Diff exacto, hashes, sesión y aprobación humana. |
| JARVIS-09 | **P1** | Prueba Docker antes/después | Demostrado en flujo local acotado | `fixture_only` | `scripts/jarvis-isolated-patch-probe.mjs`, `docs/jarvis-v142-mission09-isolated-result-20261021.md` | **Pendiente:** Integración del ejecutor con ciclo autónomo y aislamiento multiarchivo. **Certificar:** Antes falla caso correcto, después pasa y el origen sigue inalterado. |
| JARVIS-10 | **P1** | Evidencia aislada en Terminal | Implementado y con pruebas locales | `no_archivo_real_certificado_ui` | `jarvis-isolated-evidence-readback.js`, `tests/jarvis-isolated-evidence-readback.test.mjs` | **Pendiente:** Archivar run físico con --save-report y verificar estado positivo en navegador. **Certificar:** Recibo host autenticado, exacto y sin autoconceder escritura. |
| JARVIS-11 | **P0** | Motor transversal de autorrecuperación | Implementado y con pruebas locales | `parcial` | `jarvis-platform-self-healing.js`, `tests/jarvis-platform-self-healing.test.mjs` | **Pendiente:** Adaptadores por servicio/documento/conector y circuit-breakers. **Certificar:** Detectar → diagnosticar → reparar dentro de autoridad → verificar. |
| JARVIS-12 | **P1** | Detener misión y recuperar conversación | Demostrado en flujo local acotado | `solo_piloto` | `gestia-terminal.html`, `tests/jarvis-qwen-mission-cancel.test.mjs` | **Pendiente:** Interrumpir también herramientas largas sin efectos secundarios. **Certificar:** UI cancelar y poder relanzar sin busy ni operación fantasma. |
| JARVIS-13 | **P1** | Memoria y separación memoria/evidencia | Existe código, falta certificación integral | `sin_e2e_global` | `gestia-core/jarvis/jarvis.autonomy.engine.js`, `tests/jarvis-semantic-memory-integrity.test.mjs` | **Pendiente:** Pruebas multi-sesión y seguridad cross-user. **Certificar:** Memoria útil sin convertir recuerdo en evidencia del turno. |
| JARVIS-14 | **P0** | Gmail, Outlook, Zoho | Diseño/inventario sin conexión efectiva | `oauth_pendiente` | `jarvis-external-connector-contract.js`, `docs/jarvis-v142-external-connectors-plan.md` | **Pendiente:** OAuth/vault, scopes read-only, identidad y revocación. **Certificar:** Lecturas reales autorizadas sin exponer credenciales a Qwen. |
| JARVIS-15 | **P1** | Facebook, Instagram y TikTok | Diseño/inventario sin conexión efectiva | `oauth_pendiente` | `jarvis-external-connector-contract.js`, `tests/jarvis-external-connector-contract.test.mjs` | **Pendiente:** Autenticación Meta/TikTok, inspección cuentas y aprobación de publicación. **Certificar:** Read-only real, publish solo aprobado, recibos durables. |
| JARVIS-16 | **P1** | Drive y Calendar | Diseño/inventario sin conexión efectiva | `oauth_pendiente` | `jarvis-external-connector-contract.js` | **Pendiente:** Scopes mínimos, calendarios, archivos, control de escritura. **Certificar:** Readback OAuth y cuenta correcta, sin modificar recursos sin aprobación. |
| JARVIS-17 | **P0** | Código GitHub y operaciones gobernadas | Implementado y con pruebas locales | `no_autoreparacion_general` | `jarvis-qwen-general-policy.js`, `tests/jarvis-qwen-engineering-pilot.test.mjs` | **Pendiente:** Aprobar parche y rollback integrado, pruebas postcommit; sin libre push del modelo. **Certificar:** Permisos de rol, recertificación, CI y aprobación explícita. |
| JARVIS-18 | **P1** | Supervisor y restablecimiento de red | Demostrado en flujo local acotado | `sin_chaos` | `scripts/jarvis-workstation-supervisor.cjs`, `jarvis-workstation-health.js` | **Pendiente:** Caída de Wi-Fi, reposo, reinicio y reconexión automatizada completa. **Certificar:** 5000/3344/11434 recuperan con verificación SHA y latencia definida. |

## Ciberseguridad, privilegios e intrusiones

| ID | Prio | Capacidad | Estado de código | Evidencia productiva | Referencias | Próximo cierre |
|---|---|---|---|---|---|---|
| SEC-01 | **P0** | Perímetro localhost, Host/Origin y anti-rebinding | Implementado y con pruebas locales | `no_pentest` | `jarvis-local-intrusion-guard.js`, `tests/jarvis-local-intrusion-guard.test.mjs` | **Pendiente:** Probar más navegadores, controles CORS y ataques de origen contra rutas sensibles. **Certificar:** Rechazo de orígenes no autorizados sin bloquear dueño. |
| SEC-02 | **P0** | No bloqueo del dueño y cambios de red | Implementado y con pruebas locales | `sin_login_multidispositivo` | `tests/jarvis-local-intrusion-guard.test.mjs`, `docs/jarvis-v142-cybersecurity-boundaries-20261021.md` | **Pendiente:** Pruebas de renovación de token, nueva red y recuperación multi-dispositivo. **Certificar:** Doce intentos hostiles no bloquean una sesión legítima posterior. |
| SEC-03 | **P0** | Autenticación de rutas legacy /write y /git | Brecha o bloqueo conocido | `no_verificado` | `jarvis-fs-bridge.js`, `docs/jarvis-v142-cybersecurity-boundaries-20261021.md` | **Pendiente:** Unificar token del propietario en TODAS las rutas de efectos y sus clientes. **Certificar:** Pruebas negativas anónimas, replay, token ajeno y permiso humano por acción. |
| SEC-04 | **P0** | Código servidor expuesto en Firebase Hosting | Brecha o bloqueo conocido | `publico_expuesto_20261021` | `firebase.json`, `tests/jarvis-hosting-web-surface-security.test.mjs` | **Pendiente:** Release autorizado de exclusiones; verificar 404 y CDN posterior. **Certificar:** JS interno servidor NO descargable; frontend B2C/B2B/Jarvis no roto. |
| SEC-05 | **P0** | Firestore/Storage, IDOR y cross-tenant | Implementado y con pruebas locales | `reglas_productivas_no_certificadas` | `tests/b2c-security-rules-contract.test.mjs`, `security/storage-hardening-candidate.rules.txt` | **Pendiente:** Comparar reglas remotas + emulador, revocación y escalación. **Certificar:** Pentest dirigido autenticado y reglas producción verificadas. |
| SEC-06 | **P0** | CSP, XSS, cabeceras y dependencias | Implementado y con pruebas locales | `sin_pentest` | `tests/jarvis-critical-dependency-security.test.mjs`, `tests/b2c-render-xss.test.cjs` | **Pendiente:** CSP gradual sin romper OAuth; dependencia actualizada y CI auditoría. **Certificar:** Cero críticos explotables confirmados y navegador verificado. |
| SEC-07 | **P0** | Alertas, incidentes, respuesta y auditoría | Existe código, falta certificación integral | `sin_monitoreo_247` | `jarvis-observability.js`, `tests/jarvis-local-intrusion-guard.test.mjs` | **Pendiente:** Alertas reales dueño, rotación segura y procedimientos de intrusión. **Certificar:** Detección, triage, contención, revisión y recuperación reproducibles. |

## Operación, releases, respaldos y calidad

| ID | Prio | Capacidad | Estado de código | Evidencia productiva | Referencias | Próximo cierre |
|---|---|---|---|---|---|---|
| OPS-01 | **P0** | Firebase Hosting B2C/B2B/Jarvis | Rutas públicas observadas (no E2E) | `version_desalineada` | `firebase.json`, `release-manifest.json` | **Pendiente:** Alinear live branch v94 / manifest e1b0 con HEAD V142; sin deploy implícito. **Certificar:** Manifest, js servido, funciones y repo coinciden en SHA validado. |
| OPS-02 | **P0** | Cloud Functions legacy y 24 exports B2C | Existe código, falta certificación integral | `release_pendiente_verificar` | `docs/v142-b2c-release-scope-20260921.json`, `functions/index.js` | **Pendiente:** Read-only cotejo de 24 exports y versión remota; plan canario de hotfix. **Certificar:** Retiro y cierre canónicos activos, orphans inseguros retirados. |
| OPS-03 | **P1** | Batería local B2C, B2B y Jarvis | Implementado y con pruebas locales | `no_equivale_prod` | `package.json`, `tests/jarvis-fs-bridge-v2.test.mjs` | **Pendiente:** Matriz de CI inequívoca y suites de emuladores en release. **Certificar:** Ejecución CI limpia con logs/artefactos y gates sin skips. |
| OPS-04 | **P0** | Deploy, rollback, canarios y release | Existe código, falta certificación integral | `sin_rollback_prod_verificado` | `scripts/prepare-platform-release.mjs`, `docs/v142-release-preparation.md` | **Pendiente:** Canario real, rollback forward-only de saldos y compatibilidad SW. **Certificar:** Releases reproducibles con bloqueo por crítico y prueba postdeploy. |
| OPS-05 | **P0** | RTO/RPO, backups y restauración | Aún sin evidencia suficiente | `no_verificado` | `docs/v142-release-preparation.md` | **Pendiente:** Definir respaldo cifrado, RTO/RPO, prueba de restauración con permisos. **Certificar:** Restauración en entorno alterno y registro de tiempo/pérdida. |
| OPS-06 | **P1** | SLO, disponibilidad y trazas centralizadas | Parcialmente cubierto | `no_verificado` | `jarvis-observability.js`, `tests/jarvis-observability.test.mjs` | **Pendiente:** Medir % de misiones completas, latencias, errores, saturación y costo. **Certificar:** Tablero 7/30 días con alertas, sin registrar secretos. |
| OPS-07 | **P0** | Documentación de release y manifiesto maestro | Implementado y con pruebas locales | `no_verificado` | `docs/v142-b2c-forensic-audit-20260921.md`, `docs/jarvis-v142-platform-self-healing.md`, `scripts/platform-manifest-daily-v142.mjs` | **Pendiente:** Mantener al menos 7 cortes diarios consecutivos, recertificar avances con evidencia y cotejar el estado publico despues de releases autorizados. **Certificar:** Tarea diaria verificada, historico externo a Git, pruebas dirigidas y estado de 57 frentes sin bloquear al propietario ni inventar certificaciones productivas. |

## Orden de ejecución decidido por el propietario — 2026-10-22

1. **Autonomía real de JARVIS:** Misiones Qwen completas, recuperación, herramientas verificadas y entregables reales.
2. **Conectores:** Gmail, Outlook, Zoho, Drive, Calendar y redes sociales mediante autorización del propietario.
3. **Alineación y despliegue:** Versiones coherentes de código, Hosting, Functions y reglas, con canario y aprobación.
4. **Certificación E2E B2C/B2B/JARVIS:** Recorridos completos desde cuentas y dispositivos reales de prueba.
5. **Seguridad integral:** Auditoría ofensiva, controles avanzados, sesiones y operación resiliente.

**Alcance:** la clasificación P0 sigue indicando bloqueos de lanzamiento, no el orden de desarrollo.
Se mantienen permisos mínimos, prohibición de despliegue y operaciones financieras sin aprobación.
La auditoría integral de seguridad queda para la quinta etapa, antes de la apertura general.

## Requisito no-lockout del propietario

- Rechazar una solicitud no autorizada NO autoriza bloquear cuentas, banear IP,
  cerrar sesiones, cambiar credenciales, revocar tokens ni borrar información.
- Cambiar de red NO equivale a intrusión. Revalidar identidad por token, rol y sesión.
- Probar doce solicitudes hostiles y después acceso legítimo en laptop/móvil.
- Mantener recuperación autenticada y reversible, sin bypass anónimo de emergencia.
- No modificar autenticación de producción sin canario y plan de rollback.

## «Nivel NASA»: objetivos de ingeniería crítica, no certificación de NASA

| Control de calidad | Prueba exigida |
|---|---|
| Identidad | 0 accesos transversales, dueño recuperable, MFA y revocación verificadas |
| Seguridad | Auditoría independiente, controles de mínimos permisos y cero críticos abiertos |
| Disponibilidad | SLO e incident response medidos 30 días con pruebas de falla real |
| Datos | Backup cifrado y restauración ensayada con RTO/RPO |
| Finanzas | Conciliación, idempotencia y seguridad del ledger, cero doble cobro/retiro |
| IA autónoma | 30 misiones representativas de extremo a extremo, evidencias y correcciones bounded |
| Release | CI, revisión humana, canary, monitoreo de despliegue y rollback seguro |

## Cómo mantenerlo actualizado

- **Fuente editable:** `docs/platform-master-manifest-v142.json`.
- **Generador:** `node scripts/platform-master-manifest-v142.mjs`.
- **Verificador:** `node scripts/platform-master-manifest-v142.mjs --check`.
- Cada frente debe conservar prueba concreta, pendiente, criterio de cierre y estado productivo.
- Actualizar evidencias públicas después de cada release AUTORIZADO; este manifiesto es una instantánea.
