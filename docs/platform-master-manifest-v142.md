# Manifiesto maestro — Península Tech / FixGo / ADJUNTO V142

**Corte de evidencia:** 2026-10-22 · **Base local:** `v142-official` / `9dc302ba` · **Repositorio:** `heberzzt-wq/fixgo-app`

> Este documento es un INVENTARIO y plan de pruebas, NO una certificación de seguridad
> ni autorización de despliegue. Los reportes históricos no demuestran el estado productivo actual.

## LEE ESTO PRIMERO - relevo y continuidad inmediata

**Actualizado:** 2026-10-26 | **Candidato certificado en local:** `3caa2f3899aab488f90edef7535beac55f6ca96e` | **Rama:** `v142-official`

**Meta:** LEER PRIMERO: usar este documento y el informe diario, comprobar SHA real y recibos antes de continuar; no repetir preguntas resueltas ni dar por hecho un despliegue.

**Laptop:** `adjunto-jarvis` | **Repositorio:** `C:/Users/heber/Documents/Codex/2026-06-17/estas-conectado-a-github-y-a/work/fixgo-app-v142-worker`

**Resumen:** 2026-10-26 retest WEB9e442077: obtuvo Git8, estado limpio, contexto y lecturas completas de shim3lineas/policy13lineas, pero ciclo Git5/Git1. Cancelacion fisica diagnostica, Bridge14696 detenido inactivo; no COMPLETED. Causa comprobada: sharing lossless ocurria solo tras fallo total; vista expulsaba fuente completa124bytes mientras mantenia duplicados. Fix aplica sharing antes de truncar y preserva ambos contenidos completos dentro11607/12288chars; fixture real sin mutar originales. Frontera excluye prefijos Git integros ya obtenidos y revoca esa dedupe ante mutacion/historial distinto/truncacion. Auditoria repo.read resuelve archivos requeridos desde alcance/contexto, no agrega auxiliares; probe positivo4,5 y negativo falta4 rechaza. Replay exacto11inferencias: Git/contexto/doslecturas obtienen prueba independiente; siguiente lectura valida package.json desde31, explicacion/tests pendientes. Laptop vieja16/16 auxiliares snapshot contexto-frontier con hashes. CI del fix en curso; retest web pendiente. Sin push/deploy ni certificacion general. CI final retencion exit0 {"pass":1887,"fail":0,"skipped":2}. Regresion formato legacy detectada y corregida: compartir anticipadamente solo en auditoria por objetivo con scope resuelto; recibos legacy mantienen contrato previo. Prueba fuente positiva/negativa fisica y replay11calls preservados. Pendiente commit/arranque limpio/retest web.

### Autorizacion de trabajo y commits del propietario

**Decision:** AUTORIZACION_CONTINUA_DE_DESARROLLO_Y_COMMITS (2026-10-23).

**Alcance:** Resolver sin detener el trabajo por autorizaciones repetitivas para editar codigo, ejecutar pruebas y registrar commits..

**CI y push:** Un push hacia v142-official para CI debe validar previamente la rama, el SHA, el alcance de workflows y que no exista despliegue productivo automatico; nunca saltar controles de GitHub ni publicar por confusion entre push y deploy..

**Prueba web por cambio:** corregir -> pruebas -> commit -> desplegar canal web de pruebas y/o sincronizar Bridge local -> comprobar SHA y endpoints -> entregar URL -> siguiente pendiente.

**Limite:** Los commits no son despliegues; mantienen controles de produccion, dinero, secretos y acceso.

**Infraestructura actual al corte:** Bridge14696 mantenimiento9e442077 detenido tras cancelacion fisica del ciclo Git y activeInferenceCalls=0; supervisor3345 pausado.; Ollama qwen3.5:9b LOCAL_ONLY; puertos `5000`, `3344`, `3345`, `11434`.

**Control de ventanas:** Chrome extension conectado; Terminal autentica controlada y mision real enviada, sin nuevos bloqueos de permisos de navegador observados.

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
- 2026-10-23: el propietario fija la ESTRELLA POLAR de ADJUNTO: exclusivo y local para Peninsula Tech, no copiar ni competir con otras IA, excelencia original comprobable por misiones/servicios reales; registrada como objetivo no certificado, con refrigerios Tecate incluidos en gastos historicos reportados no auditados.
- 2026-10-23: gastos de refrigerios reportados por el propietario: 2 six Tecate diarios a MXN 112 cada uno, total MXN 224 por dia; costo calendario ilustrativo MXN 53,312-54,432, SIN recibos ni tratamiento fiscal determinado.
- 2026-10-23: nueva autorizacion continua de edicion, pruebas y commits locales verificados sin pedir permiso repetitivo; no habilita despliegue ni escrituras de produccion. Ver governance.ownerDevelopmentAuthorization.
- 2026-10-23: reparaciones locales de catalogo web/repositorio y retencion de fuentes en planificador; 463/463 regresiones PASS y Qwen local 1 mision SUCCESS/VERIFIED_COMPLETE con 4 pruebas fisicas. Cambios locales no publicados.
- 2026-10-23: bateria nueva de 20 pruebas-misiones locales de V142: 16 lecturas fisicas con SHA de fuente y 4 denegaciones/antiduplicacion; 20/20 PASS. Decisiones programadas para probar motor y permisos, no 20 inferencias de Qwen ni 20 envios autenticados desde la web. Script versionado tests/jarvis-v142-20-readonly-missions.test.mjs.
- 2026-10-24 relevo: SHA base 2f15e0c igual en HEAD/origin/Bridge/Firebase live y preview; CI GitHub 40146816281 Windows/Ubuntu SUCCESS; superficie live 17/17 HTTP. No acredita cierre de mision.
- 2026-10-24 relevo: mision autentica Git/Repomix cancelada tras errores fisicos; Stop no llegaba a grounded argument completion. Regresion fallo con signal=null; correccion local pasa. Retest web pendiente.
- 2026-10-24 relevo: RAM inicial 6736028 KiB; minimo muestreado 306012 KiB con Qwen; tras cancelacion y descarga automatica 8276160 KiB. No se termino llama-server a la fuerza.
- 2026-10-24 relevo: encontrado respaldo ivms.sia7.zip con DeviceManagement/Video/EventCenter junio-julio en Migrado laptop vieja; aun no demuestra detector de vehiculos. Sin inspeccion de red.
- Relevo segundo hito: ba91eb64 GitHub/Bridge/preview/live sincronizados; health efectivo confirmado, CI Windows/Ubuntu SUCCESS, superficie 17/17. Mision autentica 11 minutos aproximadamente termino PARTIAL por contexto; no confundir con duracion interna 338512 ms.
- Causa raiz reproducida con paquete real sanitizado: 8192 tokens rechazaba audit por contexto; campos de fuente repetidos en briefing y tareas. Ajustes locales con 58 pruebas PASS; sin elevar produccionCertified.
- Capturas antiguas: Desktop/respaldo usb 4/478 decodificables, muestra 3314 inicia FF. Otras 29 en Pictures/Screenshots son legibles pero no muestran camaras. ivms.sia7.zip sigue sin acreditar deteccion de vehiculos.
- Segunda reparacion: npm run ci:test final EXIT 0, 58 dirigidas PASS, compatibilidad con recibos genericos preservada; replay del paquete real grounded reducido a 16685 caracteres y audit 8192 llega al modelo. Son regresiones/replay, no mision autentica COMPLETED.
- 2026-10-25: reproducidas dos regresiones RED (auditoria real de cuatro pasos y mainModelWarm incorrecto); correcciones locales con35/35 dirigidas PASS. Preserva ventanas fuente, cada indice de tarea, errores y recibos brutos; metadatos AST operativos siguen completos si hay herramientas fuera de repo.
- 2026-10-25: replay fisico local de recuperacion con Qwen3.5:9b,8192/45s/150000ms en56.361s; Repomix1.18.1 preparo contexto de2 fuentes permitidas, verificador independiente confirmo bytes y SHA256. No certifica Terminal autenticada ni COMPLETED global.
- 2026-10-25: CI final completa EXIT0; 45 dirigidas PASS; arranque real sin precarga ni retencion30m (0 modelos antes/despues). No implica cierre global ni mision web COMPLETED.
- 2026-10-25: investigadas fuentes oficiales Qwen/Ollama/Repomix y paper de interfaces; doc docs/v142-local-agent-reconfiguration-20261025.md registra configuracion, evidencia y limites.24 regresiones PASS; replay real de contrato92.351s/4 llamadas; selector de argumentos98.089s dentro de alcance. Son replays locales, no mision completa.
- 2026-10-25: mision web e08333c0 verifica handoff6 objetivos y recuperacion Repomix real. PARTIAL por paquete global excesivo; no certificacion.
- 2026-10-25: RED6 objetivos por preflight y RED rutas de contexto ausentes -> GREEN;148 afectadas PASS. Replay atomico7 llamadas reales termina sin truncacion ni timeout, sin declarar COMPLETED.
- 2026-10-25: cd35faad web PARTIAL; captura exacta identifica contradiccion s=true/l no vacio. Nuevo schema correlacionado probado RED->GREEN, sin fabricar exito.
- 2026-10-26T02:51Z checkpoint: exclusividad confirmada por propietario. Reparacion EXPERIMENTAL local de alcance por objetivo: conserva texto literal, agrega alcance resuelto, selecciona recibos antes de auditar y verifica interpretacion contra pedido original. RED->GREEN 3 regresiones nuevas; 39 dirigidas PASS antes de ultimos ajustes de prompt y exclusion de metadata duplicada. Replay fisico scoped-audit-replay.json completo33.602s: auditor aprueba Git/contexto/lecturas pero verificador independiente rechaza los tres; missionComplete=false. NO resuelto ni certificado. Ultimo contrato real17.084s clasifica pruebas como repository_source pero copia fragmentos sin resolver pronombres; requiere correccion y negativos antes de Bridge/web. Sin commit/push/deploy/reinicio; cambios previos conservados. CI heredada muestra1799PASS/0FAIL/1SKIP, sin exit code comprobado. Diario anterior estaba obsoleto.
- 2026-10-26T03:33:48.086Z Reparacion local experimental, NO certificada: CI completa finalizo 03:28:14 UTC exit0; fallo previo exit1 por spawnSync python EPERM en sandbox reproducido y resuelto solo ejecutando pruebas autorizadas fuera de sandbox. Matrices Qwen local: verificador independiente 8/8 y auditor por tipo 8/8 (Git/contexto/lectura positivos; cantidad1/archivo faltante/truncado/equivocado/sin resultados tests negativos). Replay integrado coverage-scoped-audit-replay 38.510s: auditor+verificador acreditan primeros3 objetivos; explicacion y pruebas pendientes, missionComplete=false. Se conserva sourceStructure y schema correlacionado. Propuesta de eliminarlos rechazada y NO aplicada. Nuevo ajuste preserva recibos Git seleccionados como apoyo completo sin permitirlos como sustitutos de referencias repository_source: regresion RED->GREEN16/16, replay en curso. Bridge sin recargar, sin mision web ni commit/push/deploy. Ver semantic-milestone-evidence.json para hashes.
- 2026-10-26T03:41:05.716Z BLOQUEO: recarga autorizada detuvo Bridge PID2808 tras comprobar identidad y activeInferenceCalls=0 y UI inactiva. Arranque canonico npm run bridge falla exit1 JARVIS_WORKTREE_DIRTY_BEFORE_BRIDGE_SYNC (scripts/jarvis-workstation-start.cjs:24); 3344 offline, supervisor3345 sigue abierto. No se omitio guard, ni commit/stash/push/deploy; cambios conservados. Necesita decision del propietario sobre recuperar runtime con arbol sucio sin violar prohibicion de commit. CI final {"pass":0,"fail":0,"skipped":0} exit0 finalizo 2026-10-26T03:36:58.5831384Z; dirigidas45PASS. Matrices Qwen8/8 independientes y auditor por tipo son pruebas de componentes, NO certificacion web. Replay38.510s acredito3/5 con verificador; posterior apoyo Git completo revelo necesidad de fuentes pertinentes para explicar cambios y resultados de tests; no se marco exito. Ajuste posterior omite campo de apoyo vacio, CI pasa; sin nuevo replay completo ni mision web. sourceStructure/schema correlacionado conservados. No cambio de modelo/tiempos/permisos.
- 2026-10-26T03:41:36.293Z BLOQUEO: recarga autorizada detuvo Bridge PID2808 tras comprobar identidad y activeInferenceCalls=0 y UI inactiva. Arranque canonico npm run bridge falla exit1 JARVIS_WORKTREE_DIRTY_BEFORE_BRIDGE_SYNC (scripts/jarvis-workstation-start.cjs:24); 3344 offline, supervisor3345 sigue abierto. No se omitio guard, ni commit/stash/push/deploy; cambios conservados. Necesita decision del propietario sobre recuperar runtime con arbol sucio sin violar prohibicion de commit. CI final {"pass":1808,"fail":0,"skipped":1} exit0 finalizo 2026-10-26T03:36:58.5831384Z; dirigidas45PASS. Matrices Qwen8/8 independientes y auditor por tipo son pruebas de componentes, NO certificacion web. Replay38.510s acredito3/5 con verificador; posterior apoyo Git completo revelo necesidad de fuentes pertinentes para explicar cambios y resultados de tests; no se marco exito. Ajuste posterior omite campo de apoyo vacio, CI pasa; sin nuevo replay completo ni mision web. sourceStructure/schema correlacionado conservados. No cambio de modelo/tiempos/permisos.
- 2026-10-26T03:58:12.894Z Propietario autorizo modo mantenimiento explicito y commit SOLO local, sin push/deploy. Supervisor PID8632 identificado por comando+puerto3345 y pausado con sus hijos; 3344 y3345 cerrados, sin mision activa ni servicios nuevos. Implementado --maintenance/--preflight en arranque canonico: conserva Git limpio/modelo/identidad local, rechaza rebase, no sincroniza Git ni importa/ejecuta worker. Telemetria distingue mantenimiento; rollback documentado. RED->GREEN pruebas de modo/health8PASS; preflight fisico rechazo arbol sucio. CI inicial detecto2 fixtures sin process.argv; corregidas sin quitar assertions. CI retest {"pass":1815,"fail":0,"skipped":2} exit0. NUEVA FRONTERA: describeJarvisBridgeIdentity y refresh exigen HEAD==SHA remoto. No cambiados. Commit local aun no ejecutado: autenticacion lo rechazaria. Pendiente autorizacion especifica de identidad mantenimiento fijada al SHA local limpio, marcada no publicada, conservando owner auth/loopback/rutas/verificador. No usar refs remotas falsas ni push como atajo. Reparacion semantica y mision preview siguen sin certificar.
- 2026-10-26T04:11:33.364Z Relevo para continuar recibido; no pausa historica vigente. Lectura AGENTS/maestro JSON+Markdown/diario completada. HEAD y remoto d3e4a2a10dbf49024497c74a225c509fde6a1997; hashes previos sin cambios concurrentes. Ultima consulta fisica:3344/3345 sin listener,11434 PID19888 y5000 PID10628. Autoarranques login Bridge/hosting/Ollama conservados. Nueva regresion maintenance identity pins RED(0pass/1fail,exit1); cambio core jarvis-fs-bridge.js rechazado por revision automatica: requiere permiso especifico para aceptar HEAD local no publicado en identidad. Patch no ejecutado, guard hash 933c7b4cdbb7b7d5f006ade1ad5c430962900a575ec7db998f673369589fc57b. Sin commit/push/deploy/arranque. CI1815/0/2 exit0 corresponde al arbol previo; ahora hay regresion RED pendiente. No mision certificada. Requiere aprobacion especifica de esa frontera, no autorizacion generica de continuar.
- 2026-10-26T04:21:58.195Z Autorizacion especifica del propietario recibida para identidad SOLO mantenimiento: SHA local limpio fijado y descendiente del remoto real, marcado NO publicado; autenticacion/permisos intactos. Reintento unico aprobado y aplicado. RED->GREEN demostrado en identidad y bloqueo de publicador normal ante HEAD divergente. Integracion valida token requerido401 y cambio de HEAD/archivos503; negativos rama/repositorio/ascendencia/remoto redirigido. Arranque mantenimiento no importa/ejecuta worker, normal comprueba igualdad antes de importarlo. Autoarranques diarios conservados. CI completa {"pass":1821,"fail":0,"skipped":2} exit0; primer intento fallo por prueba de orden que buscaba llamada antigua, corregida con existencia+orden explicitos. Sin commit/push/deploy aun; siguiente commit SOLO local y preflight fisico, luego recuperar Bridge y mision preview. No certificacion semantica ni produccion.
- 2026-10-26T04:23:17.213Z Commit SOLO LOCAL d32636f84a2941ed596bfcfe844584f74fa86d99 creado con cambios conservados; remoto sigue d3e4a2a10dbf49024497c74a225c509fde6a1997. Preflight fisico exit0: Git limpio, SHA fijado descendiente, localPublished=false, sin worker/sync. CI del codigo1821pass0fail2skip exit0. Siguiente commit documental registra este hito; su SHA runtime se conservara fuera de Git para no ensuciar el arbol durante la mision. Bridge/supervisor aun apagados antes de recuperacion. No push/deploy/mision certificada.
- 2026-10-26: revision fresca HEAD87cd24a1 limpio al inicio, remoto d3e4a2a1; commits locales preservados. Diario reprodujo 2 fallos localhost (503 identidad antes del 409 esperado): tests dependian del checkout no publicado. Fixture Git temporal real, sin tocar guards ni assertions, RED4/6->GREEN6/6. CI completa exit0, totales por grupos {'pass': 1821, 'fail': 0, 'skipped': 2} (pueden solaparse). Supervisor19592 identificado por puerto3345/comando y pausado;3344/3345 cerrados comprobados. Terminal preview presenta input deshabilitado esperando sesion Firebase. Siguiente: commit local del test+relevo, preflight y arranque mantenimiento ya autorizado, comprobar autenticacion y mision. Sin push/deploy; no certificacion semantica.
- 2026-10-26: mision web autentica MISSION-bfa295ad-42df-46f1-9d2f-a759abd5779f, preview d3e4a2a1 + Bridge mantenimiento2da7b97c, termino PARTIAL/PLANNER_NO_EXECUTABLE_PLAN en159.328s.8 operaciones exitosas, contexto recuperado,53 inferencias locales,0 externas. Causa nueva comprobada en trazas: contrato devuelve scopeContext/resolvedScope/explicitTools y orquestador los elimina antes de la siguiente peticion; auditor por objetivo no se activa. Regresiones RED2/2->GREEN;52 orquestador PASS. Fix conserva exclusivamente campos del contrato y excluye satisfecho/indices como prueba inicial; conserva follow-up y storage. CI completa exit0 {'pass': 1823, 'fail': 0, 'skipped': 2}. Bridge8776 detenido sin inferencias activas antes de edicion. Pendiente commit local/arranque y mision autentica LOCAL puerto5000, que ya sirve el cambio. No push/deploy. Vieja HEBERTO-MENDOZA12GB/7.46GB libres, i3-5005U,IntelHD5500,45.1GB disco libre; snapshot aislado jarvis-aux-20261026 ejecuto4/4 pruebas proof con hashes iguales. No automatizacion distribuida ni descarga importante de carga certificada.
- 2026-10-26: scope transport certificado en mision local autentica MISSION-36775813-a7b7-4a88-9c5e-d6d03920728c sobre16ee3ba3, pero PARTIAL/PLANNER_UNAVAILABLE por SEMANTIC_EVIDENCE_CONTEXT_BUDGET_EXCEEDED (12751>12288 caracteres). Reparacion local comparte SOLO commits identicos y decodifica recibos antes de auditoria, sin elevar8192 tokens ni eliminar evidencia. Seleccion conserva recibos de herramientas exigidas, incluidos fallidos; no cambia veredictos. Replay exacto supera presupuesto y alcanza Qwen; ultimo replay limitado a12 llamadas termina DIAGNOSTIC_TWELVE_CALL_LIMIT: sigue pendiente cierre semantico por veredictos incompletos/repeticion. Laptop vieja ejecuto12/12 pruebas aisladas, hashes verificados, concurrencia1; sin segundo cerebro ni reparto automatico. Existe falla preexistente fuera de ci:test: recorded search and rehydrated read reach argument completion inside the mission loop (budget-baseline.txt). No push/deploy; no mision completa certificada.
- CI oficial final 2026-10-26 exit0 {'pass': 1825, 'fail': 0, 'skipped': 2}, dirigida18/18; auxiliar vieja12/12. Regresion fuera de CI documentada por separado.
- 2026-10-26 cierre: codigo local b81ebe2d, CI1825 PASS/0 FAIL/2 SKIP. Mision web autentica local MISSION-5b5549b2-eb43-4325-84f6-a97c3278dc9e termino PARTIAL/PLANNER_NO_EXECUTABLE_PLAN en140073ms; NO hubo presupuesto excedido en ese cierre. Git obtuvo proof intermedia, luego el auditor revirtio el veredicto; no hay certificacion estable. Contexto obtuvo proof final; lecturas/explicacion pendientes por seleccion vacia, confusion de alcance y repeticion. UI conserva error recuperado repo.context REPO_CONTEXT_SOURCE_TOO_LARGE, distinto al motivo final; pendiente corregir presentacion con recibo vigente. Top-level accounting declara0 llamadas aunque hay inferencia real en planner.response: no usar ese contador como prueba. Correcciones conservadas y no publicadas. Bridge11668 detenido inactivo para commit documental; siguiente arranque mantenimiento limpio. Vieja auxiliar12/12 con SHA256 y run-audit.ps1 reproducible probado; no reparto automatico ni alivio de RAM cuantificado. Regresion preexistente fuera de CI queda abierta en budget-baseline.txt.
- 2026-10-26 continuacion autorizada: corregido alcance de lecturas auxiliares, contrato Git y decodificacion de argumentos/defaults al continuar. Replay Qwen exacto obtiene3/5 objetivos con proof (Git,contexto,lecturas), explicacion/tests aun pendientes. UI parcial conserva hechos observados y motivo final; excluye solo fallos correlacionados como recuperados. Frontera de lectura ya no ofrece default repetido: exige rango explicito acotado para prefijo evictado; paquete real y hashes intactos. CI oficial exit0 {'pass': 1868, 'fail': 0, 'skipped': 2}. Cuatro suites antes externas incluidas en CI;3 aserciones obsoletas reemplazadas por comportamiento/evidencia sin rebajar negativos. Vieja14/14 con SHA256 en continuation-fix. Pendiente commit local, recuperacion autorizada Bridge mantenimiento y pruebas web de utilidad. Sin push/deploy ni certificacion general.
- 2026-10-26 hito contrato fuente: prueba WEB sobre32737df3 MISSION-3f13503a-7903-4ccc-be27-ccad6a5919c4 PARTIAL por LOCAL_QWEN_CONTEXT_NEEDS_SEGMENTATION. Causa fresca: core reemplaza contrato repository_source valido por OBJECTIVE_CONTRACT platform_records solo porque catalogo ofrece datos. Fix conserva contrato semantico validado y limita a7lectores existentes; mixtos/vacios/escritura siguen ruta anterior. Replay corregido exacto Qwen4 llamadas: objetivo independiente true y missionComplete=true, sin herramientas; no equivale a retest web. Fix adicional termina investigacion readonly tras todos los objetivos comprobados, no ejecuta propuesta opcional ajena; prueba negativa conserva investigacion. CI exit0 {'pass': 1873, 'fail': 0, 'skipped': 2}. Pendiente commit/recuperacion autorizada y retest WEB del mismo pedido simple y completo; no declarar Jarvis general terminado. Sin push/deploy.
- 2026-10-26 evidencia WEB fisica sobre315976d3: MISSION-2d1701c5-4492-4476-83a2-c3a21467f64f COMPLETED/ALL_EXECUTABLE_TASKS_COMPLETED en14134ms; repo.read jarvis.local.policy.js identifica qwen3.5:9b correctamente en Terminal local autenticada. Captura y traza guardadas. Pedido complejo exacto MISSION-562d3b08-c71e-4789-ba7f-61142cc87c98 PARTIAL/PLANNER_UNAVAILABLE en54352ms;6operaciones obtenidas, presupuesto12432>12288 al incorporar contexto y lectura parcial de compositor1383lineas. No implica Jarvis general certificado. Bridge11388 detenido inactivo; correccion reversible de metadatos duplicados en curso; sin push/deploy.
- 2026-10-26 continuacion de utilidad: transporte reversible de metadatos repo.context baja paquete real12432 a12174 caracteres sin perder excerpt ni hashes. Decoder retira solo instrucciones transporte ya resueltas. Auditoria por objetivo dispone razon hasta600caracteres/512tokens; contrato Git distingue historial de worktree y contexto distingue preparacion de lectura; referencias positivas requieren todas las herramientas explicitas. Seleccion vacia expone recibos compatibles a auditoria sin fabricar veredicto. Ventana totalmente evictada endLine=null ya exige rango; Git excluye limites exactos repetidos. Replay fisico paquete complejo9inferencias: Git y contexto probados independientemente, siguiente repo.read current-turn-scope.js1-58 valido; no COMPLETED global ni retest web aun. CI completa en curso. Consulta simple WEB315976d3 permanece certificada en su alcance. Sin push/deploy.
- CI oficial completa exit0 {"pass":1885,"fail":0,"skipped":2}; incluye nueva suite transporte contexto. Replay real9inferencias obtiene proofGit/contexto y lectura nueva1-58. Retest WEB exacto pendiente tras commit/arranque limpio, sin certificacion general.
- 2026-10-26 retest WEB9e442077: obtuvo Git8, estado limpio, contexto y lecturas completas de shim3lineas/policy13lineas, pero ciclo Git5/Git1. Cancelacion fisica diagnostica, Bridge14696 detenido inactivo; no COMPLETED. Causa comprobada: sharing lossless ocurria solo tras fallo total; vista expulsaba fuente completa124bytes mientras mantenia duplicados. Fix aplica sharing antes de truncar y preserva ambos contenidos completos dentro11607/12288chars; fixture real sin mutar originales. Frontera excluye prefijos Git integros ya obtenidos y revoca esa dedupe ante mutacion/historial distinto/truncacion. Auditoria repo.read resuelve archivos requeridos desde alcance/contexto, no agrega auxiliares; probe positivo4,5 y negativo falta4 rechaza. Replay exacto11inferencias: Git/contexto/doslecturas obtienen prueba independiente; siguiente lectura valida package.json desde31, explicacion/tests pendientes. Laptop vieja16/16 auxiliares snapshot contexto-frontier con hashes. CI del fix en curso; retest web pendiente. Sin push/deploy ni certificacion general.
- CI final retencion exit0 {"pass":1887,"fail":0,"skipped":2}. Regresion formato legacy detectada y corregida: compartir anticipadamente solo en auditoria por objetivo con scope resuelto; recibos legacy mantienen contrato previo. Prueba fuente positiva/negativa fisica y replay11calls preservados. Pendiente commit/arranque limpio/retest web.

### Evidencia tecnica certificada (sin elevarla a produccion)

- CI completa: 1692 PASS, 0 FAIL, 1 SKIP. `npm run ci:test` (exit 0).
- Hosting candidato: 269 archivos; 7 HTTP publicos 200, 9 privados 404, 0 imports ausentes.
- Pruebas fisicas de Qwen: 2. read-only local physical pilot; not authenticated web E2E.

### BLOQUEO ACTUAL: NO PUBLICADO

- Estado: `BLOCKED_NOT_DEPLOYED`; causa: `62dc56ff publicado solo Hosting y probado por web: PARTIAL. Nueva optimizacion local pendiente de CI; candidato3caa2f38 y BLOCKED_NOT_DEPLOYED conservan evidencia historica, sin certificacion general.`.
- SHA web: `62dc56ff5dfcf1b822633b622c8080810493e2a4`; candidato: `3caa2f3899aab488f90edef7535beac55f6ca96e`.
- No alterar gate; no escribir fondos, reglas ni Functions sin autorizacion.

### Ruta de recuperacion para el siguiente chat

1. VIGENTE: recuperacion autorizada de Bridge tras commit local, retest web exacto de consulta policy.js y pedido completo Git/contexto/lecturas/pruebas. Contrato fuente no se reemplaza por operativo; no depender solo del replay.
1. Cerrar explicacion de cambios/pruebas con fuente pertinente y comprobar continuacion con rangos explicitos. Contador superior de inferencias sigue pendiente; no inferir0 llamadas de ese agregado.
1. Ampliar ejecucion auxiliar en laptop vieja a snapshots reproducibles con hashes y concurrencia acotada; conservar Qwen en RTX5060 y no duplicar cerebro/supervisor.
1. Tras una mision completa, retestar negativos y las12 NS1; conservar pendientes OAuth, autorrecuperacion, aislamiento y pruebas sostenidas.
1. Actualizar manifiesto y diario tras cada hito. Produccion, dinero, secretos y acceso conservan sus controles.

### Recibos locales (en la laptop autorizada)

- `C:/Users/heber/Downloads/Jarvis-V142-certificacion-3caa2f38-20261022.zip`
- `C:/Users/heber/Downloads/jarvis-v142-hosting-preview-20261022.json`
- `C:/Users/heber/Downloads/jarvis-v142-browser-import-closure-20261022.json`
- `C:/Users/heber/Downloads/jarvis-ns1-web-12-missions-20261022.json`
- `C:/Users/heber/Downloads/jarvis-ns1-web-12-misiones-diagnostico-20261022.md`
- `C:/Users/heber/Downloads/v142-official-ci-certification-proposal.yml`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/v142-acceptance-telemetry-20261024.jsonl`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/v142-public-surface-relevo.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/v142-relevo-ci-local-20261024.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/v142-web-acceptance-ba91eb64-trace.jsonl`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/v142-acceptance-ba91eb64-telemetry.jsonl`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/v142-context-root-ci-final.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/v142-cierre-20261024.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/v142-f0cc2358-failed-audit-packet.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/regression-red-20261025.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/regression-green-20261025.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/ci-local-20261025.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/qwen-real-audit-20261025.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/qwen-recovery-physical-20261025.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/context-recovery-red-20261025.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/ci-final-20261025.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/startup-no-prewarm-20261025.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/web-acceptance-62dc56ff-20261025.jsonl`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/failed-web-audit-62dc56ff.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/compact-global-audit-20261025.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/contract-real-20261025.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/scope-real-20261025.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/canonical-routing-green-20261025.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/objectives-green-20261025.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/objectives-ci-20261025.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/audit-timing-probe-20261025.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/web-objective-handoff-6b82cd83-20261025.jsonl`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/objective-handoff-ci-final-20261025.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/web-acceptance-e08333c0-20261025.jsonl`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/failed-web-audit-e08333c0.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/six-goal-audit-red.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/atomic-repository-audit-real.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/atomic-audit-directed-final.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/compact-indexed-audit-result.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/compact-verdict-audit-result.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/atomic-audit-ci-final.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/web-acceptance-cd35faad-20261025.jsonl`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/web-acceptance-cd35faad-telemetry.jsonl`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/cd35-first-verdict-capture.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/publish-cd35faad-20261025.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/correlated-verdict-directed.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/replay-cd35-correlated-verdict.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/replay-cd35-continuation.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/correlated-verdict-ci-final.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/web-acceptance-3adcc9ec-20261025.jsonl`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/web-acceptance-3adcc9ec-telemetry.jsonl`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/cancelled-mission-3adcc9ec.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/source-acquisition-directed.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/probe-source-acquisition.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/probe-source-acquisition-second.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/probe-closure-after-recovery.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/context-file-shape-red.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/context-file-shape-green.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/probe-context-verdicts.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/probe-objective-scope.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/probe-literal-objectives.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/probe-literal-context-verdicts.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/literal-objectives-directed.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/literal-scope-directed-final.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/source-acquisition-ci.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/source-acquisition-security.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/source-audit-exact-model-request.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/probe-source-limitation-diagnostic.json`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/source-flags-red.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/source-flags-green.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/source-flags-directed.txt`
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/probe-source-flags.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/current-audit-baseline.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/probe-combined-isolation.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/probe-independent-context.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/probe-new-contract.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/scoped-audit-replay.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/semantic-scope-ci-exit.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/semantic-scope-ci-unsandboxed-exit.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/semantic-scope-ci-unsandboxed.txt`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/probe-literal-contract.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/probe-independent-literal.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/probe-coverage-semantics.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/coverage-scoped-audit-replay.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/semantic-milestone-evidence.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/semantic-final-ci-exit.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/semantic-final-ci.txt`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/semantic-final-targeted.txt`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/support-scoped-audit-replay.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/bridge-reload-before.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/bridge-reload-after.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/bridge-reload-blocked.txt`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/bridge-reload-blocked-exit.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/semantic-final-evidence.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/semantic-repair-checkpoint.md`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/maintenance-ci-retest.txt`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/maintenance-ci-retest-exit.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/supervisor-maintenance-pause.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/maintenance-final-evidence.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/maintenance-checkpoint.md`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/identity-denial-checkpoint.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/maintenance-ready-evidence.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/identity-maintenance-ci-final.txt`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/identity-maintenance-ci-final-exit.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/maintenance-local-commit.json`
- `C:/Users/heber/Documents/Codex/2026-10-25/task/maintenance-physical-preflight.txt`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/ci-exit.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/ci-20261026.txt`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/supervisor-pause.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/scope-ci-exit.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/orchestrator-green.txt`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/local-scope-trace.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/replay-budget-fixed.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/replay-selection-fixed.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/budget-baseline.txt`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/selection-green.txt`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/closure-ci.txt`
- `HEBERTO-MENDOZA:C:/Users/heber/Documents/Codex/jarvis-aux-20261026/audit-final-receipt.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/final-web-trace.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/closure-ci-exit.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/outputs/jarvis-retest-local.png`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/replay-continuation-decoded.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/usable-ci-exit.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/usable-ci-final.txt`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/ui-budget-compatibility-green.txt`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/prefix-reread-integrity.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/old-laptop-continuation-receipt.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/usable-simple-trace.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/simple-contract-retained.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/repository-contract-scope-green.txt`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/repository-contract-real-scope.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/source-contract-ci-exit.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/source-contract-ci-final.txt`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/policy-web-success-trace.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/complex-315976d3-trace.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/outputs/jarvis-consulta-verificada.png`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/replay-complex-context.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/context-metadata-decoded-green.txt`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/source-next-action-green.txt`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/context-frontier-ci.txt`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/context-frontier-ci-exit.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/frontier-web-trace.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/frontier-web-packet.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/replay-frontier-complete.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/source-scope-probe.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/source-scope-negative-probe.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/old-laptop-contexto-frontier-receipt.json`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/git-prefix-frontier-green.txt`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/retention-ci-final.txt`
- `C:/Users/heber/Documents/Codex/2026-10-26/bu/work/retention-ci-final-exit.json`

### Reporte diario automatico

- Leer `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/ultimo.md` y `ultimo.json` para observar cambios posteriores a este corte. Ese diario NO certifica cambios automaticamente.
- Fuente de verdad de los 57 frentes: `docs/platform-master-manifest-v142.json`; esta vista se regenera, nunca se edita a mano.

---

## Decision estrategica del propietario - ADJUNTO privado (2026-10-23)

**Identidad y posicionamiento:** ADJUNTO es infraestructura operativa privada de Peninsula Tech, no un producto IA para vender al publico ni un competidor de ChatGPT/Gemini/Claude.

- **Marca:** ADJUNTO. Jarvis solo como apodo interno; marca comercial propuesta ADJUNTO, sujeta a revision legal.
- **Modelo comercial:** Peninsula Tech vende resultados: publicidad, programacion, contenidos, servicios empresariales y operaciones B2C/B2B. No vende suscripciones ni acceso publico general al asistente IA.
- **Infraestructura:** Cerebro unico Qwen3.5:9b alojado localmente en entorno privado autorizado; sin fallback cognitivo a otras APIs de IA.
- **Conectores:** Permitir conectores/servicios de red autorizados para operar correo, GitHub, plataformas sociales, Firebase y clientes sin exponer el LLM como servicio publico.
- **Alcance previsto:** ADJUNTO coordina investigacion, programacion, diseno, campanas, soporte documental, operaciones, mantenimiento y desarrollo experimental de nuevas herramientas/IA.
- **Autoridad:** Investiga, ejecuta dentro de permisos, prueba y verifica; cambios de codigo con impacto, despliegues, dinero, cuentas y decisiones de alto riesgo bajo aprobacion del propietario.
- **Relación con el cliente:** El cliente contrata a Peninsula Tech por el trabajo, producto o servicio realizado; no compra ni opera el modelo Qwen ni el motor privado ADJUNTO.

> **Alcance de esta decisión:** Vision y mandato de producto; no evidencia de que cada funcion ya este operativa ni de autonomia 99.9%, seguridad certificada o equivalencia con otras IA.

## ESTRELLA POLAR - Meta irrenunciable de ADJUNTO

**Palabras y voluntad del propietario:** Ser el mejor sin meternos con otras plataformas o inteligencias artificiales: no copiar, no replicar productos existentes, sino construir algo unico, original y mejor en resultados verificables.

- **No competencia:** No competir por ser otro ChatGPT, Gemini, Claude, Codex ni similares; no enfocar roadmap en alcanzar listas de funciones ajenas.
- **Originalidad:** Arquitectura y procesos propios que resuelvan problemas reales de Peninsula Tech; no plagiar codigo, marca, experiencia de usuario, prompts ni productos ajenos. Utilizar componentes de terceros solo conforme a sus licencias.
- **Identidad unica:** ADJUNTO es el equipo digital privado que coordina produccion empresarial, desarrollo de software, publicidad, documentos, operaciones, ciberseguridad e investigacion de tecnologia, integrado con FixGo B2C y B2B.
- **Uso privado:** Cerebro local Qwen3.5:9b mediante Ollama; no vender ADJUNTO como IA publica, ni rentar acceso como chatbot; vender servicios y resultados a clientes.
- **Que significa ser el mejor:** Ser mejor significa alcanzar nuestro estandar original de confiabilidad, calidad, seguridad, autonomia, control del propietario y utilidad economica; se mide contra requisitos de nuestros clientes y pruebas objetivas, no contra promesas comerciales de otras IA.
- **Orden para llevarlo a la realidad:** Primero terminar ADJUNTO internamente (relay Firebase/Bridge, misiones reales, recuperacion, conectores); luego cerrar B2C/B2B, seguridad, estabilidad y evidencia de servicios vendibles. No cambiar criterios solo para declarar exito.
- **Autoridad:** El propietario mantiene autorizaciones sobre despliegues, dinero, permisos, secretos, cuentas y cambios sensibles; no autoaprobar ni suprimir barreras legitimas para aparentar eficiencia.
- **Regla para futuras decisiones:** Antes de proponer cualquier caracteristica, comprobar si desarrolla esta identidad propia y aporta evidencia medible; rechazar la imitacion por imitacion.

### Resultados que demostrarian la meta

- Misiones autorizadas concluidas con evidencia y archivos reales, sin falsos VERIFIED.
- Recuperacion ante errores reales con limites claros, sin bucles interminables ni bloqueos falsos.
- Seguridad sin bloquear al propietario, datos aislados, privacidad y permisos correctos.
- B2C y B2B funcionando de punta a punta, con dinero de prueba y protecciones activas.
- Entregables de publicidad, software y gestion con calidad y costo unitario medidos.
- Mejora del propio ecosistema por ciclos disenar-ejecutar-probar-corregir-verificar, cambios sensibles autorizados.

> **Sin triunfalismos:** Es una META del propietario y no prueba de ser el mejor del mercado, de autonomia general ilimitada ni de un 99.9% certificado. Comparaciones se permiten solo para aprender criterios generales sin copiar.

## Escuadra de robots guardianes — ADJUNTO CYBER GUARDIANS

**Decisión del propietario:** 2026-10-23 · **Estado:** `META_PENDIENTE_NO_IMPLEMENTADA_NI_CERTIFICADA`

**Inspiración B2B/Uxmal 39:** Como los robots de mantenimiento preventivo y predictivo de B2B/Uxmal 39: rondas sistematicas, bitacora, diagnostico, trabajo preventivo y escalamiento; sin compartir datos ni permisos entre B2B y ciberseguridad.

**Misión:** Proteger las superficies propias y autorizadas de ADJUNTO, Jarvis, B2C, B2B y la laptop; reconocer patrones de automatizacion hostil, contener intentos indebidos y ensayar la resiliencia continuamente con evidencia.

### Robots y responsabilidades

- **GUARD-01 Centinela:** Observa en produccion de forma pasiva logs, autenticaciones, cambios, puertos, integridad, accesos anormales y señales de abuso sin inspeccionar secretos en claro.
- **GUARD-02 Simulador adversarial:** En laboratorio aislado y con objetivos propios autorizados simula abuso de bots, credenciales de prueba, peticiones maliciosas, archivos peligrosos y fallos; no ataca terceros ni lanza pruebas invasivas en produccion.
- **GUARD-03 Escudo:** Aplica reglas defensivas preaprobadas de minimo privilegio, rate limiting, validacion, segmentacion y mitigacion reversible; no toma represalias ni contraataca sistemas externos.
- **GUARD-04 Inspector de entradas:** Examina documentos/enlaces de SharePoint, correo y conectores como datos no confiables; aisla adjuntos sospechosos y bloquea prompt injection, ejecucion de macros/comandos o exfiltracion desde el planner.
- **GUARD-05 Forense:** Conserva trazas pertinentes y evidencia de intentos, causa raiz y cobertura sin retener contrasenas, tokens o datos personales innecesarios.
- **GUARD-06 Rescate del propietario:** Verifica que despues de cualquier mitigacion el propietario autorizado pueda entrar por laptop y movil, aun al cambiar de Wi-Fi; dispone de rollback y recuperacion autenticada.

### Superficies protegidas

- Firebase Hosting, Functions, Firestore/Storage, IAM, reglas, IDOR y separacion de tenants B2C/B2B
- Bridge local 3344, terminal 5000, supervisor 3345, Ollama 11434, endpoints, equipos y credenciales
- Sesiones/OAuth, correo, SharePoint, Google Drive, GitHub/CI, TikTok/redes sociales y enlaces externos
- Codigo, dependencias, artefactos, archivos subidos, permisos de herramientas y manipulacion del LLM

### Rondas y simulaciones

- Vigilancia pasiva continua con alertas por umbrales y deduplicacion.
- Ronda diaria automatizada de comprobaciones seguras de configuracion, salud, logs, permisos, caducidad y deteccion de cambios.
- Ronda adversarial diaria en entorno aislado o de prueba autorizado, con casos negativos y comprobacion de acceso legitimo posterior.
- Prueba semanal de escenarios compuestos y recuperacion; regresiones al cambiar codigo o configuracion.
- Ensayo escalable de hasta 1000 clientes/bots SIMULADOS en laboratorio y con limites de recursos; nunca inundacion de servicios publicos.

### Reglas obligatorias

- Confianza cero: no conceder autoridad a peticiones, documentos, SharePoint, mensajes, herramientas ni resultados del LLM.
- Prohibido contraatacar, rastrear invasivamente, afectar sistemas de terceros o lanzar denegacion de servicio.
- Produccion en modo observacion y bloqueos preaprobados, reversibles, medidos y sujetos a limites para prevenir falsos positivos.
- Nunca borrar datos, bloquear al propietario, desactivar autenticacion, cambiar credenciales, revocar sesiones propias ni modificar pagos sin aprobacion humana verificable.
- No compartir tokens, historiales o datos entre tenants; secretos solo en gestores y herramientas con privilegios minimos.
- Cualquier cambio a firewalls, WAF, IAM, OAuth, reglas de Firebase o despliegues requiere canario, confirmacion del propietario y rollback probado.
- Bot y humano legitimo se distinguen por identidad, contexto y comportamiento; ningun mecanismo promete detectar el 100 por ciento de los atacantes.

### Pruebas de cierre

- Matriz por superficie y amenaza con casos positivos/negativos, fecha, version y recibos verificables.
- Bitacora de 30 dias de rondas diarias sin falsos VERIFICADO ni afectacion de clientes reales.
- Simulaciones documentadas de autenticacion indebida, scraping/abuso, IDOR, prompt injection desde SharePoint, archivos inseguros y acceso cruzado entre tenants.
- Prueba reproducible de hasta 1000 clientes sinteticos aislados sin degradar entornos reales.
- Tras toda simulacion o bloqueo: acceso legitimo del propietario en laptop/movil y recuperacion reversible verificados.
- Alertas, deteccion, contencion y restauracion con medicion de falsos positivos y tiempos; auditoria humana externa antes de declarar certificacion.

**Frentes enlazados:** `B2B-07`, `SEC-01`, `SEC-02`, `SEC-03`, `SEC-05`, `SEC-06`, `SEC-07`, `OPS-05`, `OPS-06`, `JARVIS-11`.

**Límite y orden de ejecución:** Primero cerrar el motor de misiones y la plataforma; implementar guardianes por fases antes de apertura publica. Solo con activos propios o autorizacion explicita. No implica que exista ya un SOC, red team operativo, pentest ni seguridad certificada.

## Certificacion operativa y valor de activos de Península Tech

**Proposito:** Demostrar la capacidad productiva, la independencia operativa y el valor interno de Península Tech. ADJUNTO permanece privado: no se venden suscripciones ni acceso público a la IA.
**Avance verificable:** 0/11 puertas certificadas; los 57 frentes de ingeniería continúan independientes.
**Precio referencial HOY:** MXN $900,000 (hipótesis conversacional, NO avalúo ni comprador).
**Escenario condicional sin clientes:** MXN $1,500,000–$4,000,000 (no automático y dependiente de evidencia y mercado).

| ID | Criterio de cierre | Evidencia exigida | Beneficio | Frentes | Estado |
|---|---|---|---|---|---|
| VAL-01 Versión productiva coherente | Firebase, Bridge, repo y modelo compatibles; release firmado/autorizado, relay autenticado y archivos internos privados. | SHA servidos, recibo del despliegue, smoke autenticado y casos denegados. | Elimina divergencias que impiden utilizar la plataforma. | `OPS-01`, `OPS-04`, `JARVIS-02` | `PENDIENTE` |
| VAL-02 ADJUNTO autónomo | 30/30 misiones reales de prueba, autorizadas y representativas, sin rescate humano y sin falsos VERIFIED. | IDs, entradas, salidas, artefactos, relectura, tiempos y fallos por categoría. | Sustituye promesas por productividad reproducible. | `JARVIS-02`, `JARVIS-03`, `JARVIS-11` | `PENDIENTE` |
| VAL-03 B2C funcionando de punta a punta | Registro, KYC, solicitud, asignación, ejecución, cancelación y cobro sandbox; rechazar importes negativos. | Usuarios TEST y recibos de navegador, funciones, Storage, reglas y proveedor sandbox. | Convierte código de marketplace en operación comprobable. | `B2C-02`, `B2C-08`, `B2C-10`, `B2C-11`, `B2C-16` | `PENDIENTE` |
| VAL-04 B2B con dos empresas | Dos empresas TEST; contratos, roles, expedientes y tareas; cero acceso cruzado; revocación efectiva. | Sesiones reales, aislamiento multi-tenant y auditoría reproducible. | Demuestra utilidad empresarial independiente. | `B2B-01`, `B2B-03`, `B2B-08`, `B2B-09` | `PENDIENTE` |
| VAL-05 Servicios internos vendibles | Tres entregables verificados por cada área: publicidad, software y documentos/administración; ADJUNTO no se comercializa como IA. | Brief, archivo original y final, QA, tiempo y aprobación humana. | Permite vender resultados de Península Tech, no modelos. | `JARVIS-04`, `JARVIS-05`, `JARVIS-07`, `JARVIS-17` | `PENDIENTE` |
| VAL-06 Costo por servicio y ahorro | Calcular costo unitario total por servicio y contrastarlo con una línea base manual de calidad comparable. | Horas y gastos comprobados, energía, equipo, infraestructura, mantenimiento, reprocesos y horas ahorradas. | Fundamenta valor de uso interno y margen potencial. | `OPS-06`, `JARVIS-05`, `JARVIS-18` | `PENDIENTE` |
| VAL-07 Seguridad y continuidad | Probar permisos, ataques de prueba autorizados, recuperación del propietario, backup/restauración y ausencia de críticos abiertos. | Pruebas adversariales, restauración física, verificación de roles y reporte de riesgos. | Reduce riesgo técnico y de operación. | `SEC-01`, `SEC-02`, `SEC-03`, `SEC-05`, `OPS-05` | `PENDIENTE` |
| VAL-08 Titularidad y licencias | Inventariar propiedad de código, contribuciones, software tercero, modelo Qwen, licencia y marca ADJUNTO. | Licencias, inventario de dependencias, historial de derechos y dictamen marcario cuando proceda. | Evita vender como propio lo que pertenece a terceros. | `OPS-07`, `JARVIS-01`, `JARVIS-17` | `PENDIENTE` |
| VAL-09 Portabilidad y mantenimiento | Instalación limpia en equipo autorizado alternativo, recuperación de secretos por vía segura, rollback, manual y soporte. | Manual versionado, instalación/reinstalación comprobada, checks de salud y restauración. | Disminuye dependencia de laptop y autor. | `OPS-04`, `OPS-05`, `OPS-07`, `JARVIS-18` | `PENDIENTE` |
| VAL-10 Estabilidad sostenida | Registrar disponibilidad, cancelación, reinicio, caídas de red, fallos y tiempos en cortes de 7 y 30 días. | Métricas y recibos con muestras, periodos, fallos incluidos e incidentes sin datos sensibles. | Demuestra confiabilidad operativa. | `OPS-03`, `OPS-06`, `JARVIS-12`, `JARVIS-18` | `PENDIENTE` |
| VAL-11 Valuación respaldada | Separar costo histórico, reposición, valor por ahorro y precio de venta; obtener referencias externas antes de declarar precio comercial comprobado. | Costos y contratos documentados; referencias independientes, pilotos o propuestas reales cuando existan; ingresos cero mientras no existan. | Evita inflar la cifra y permite negociar sobre evidencia. | `OPS-07`, `B2B-08` | `PENDIENTE` |

### Prueba de autonomía y límites

- **Muestra:** 30 misiones; 30/30 misiones representativas, ejecutables y autorizadas con entregable válido y recibo; ninguna requiere rescate humano; 0 éxitos falsos; bloqueos legítimos se documentan por separado.
- **Confiabilidad aspiracional:** 99.9% es un objetivo futuro de SLO, nunca demostrado por solo 30/30 misiones; requiere muchos más ensayos y periodo definido.

### Reglas que impiden inflar la valuación

- Las 11 puertas son un tablero complementario: no sustituyen ni duplican los 57 frentes técnicos.
- No se aumenta automáticamente el valor cuando pasan pruebas; debe existir respaldo de utilidad, riesgo, mercado o transferencia.
- Las protecciones legítimas y autorizaciones no son bloqueos falsos y no deben eliminarse para subir una métrica.
- Los costos por horas del propietario no se suman automáticamente al valor comercial, de reposición ni a los ingresos.
- No afirmar autonomía 99.9%, seguridad certificada ni ventas mientras no se demuestren.

## Historia e inversion de trabajo del fundador

- **Inicio aproximado:** finales de febrero de 2026.
- **Colaboracion inicial:** Propietario + ChatGPT + Gemini durante aproximadamente dos meses.
- **Continuidad:** Desde aproximadamente finales de abril de 2026: propietario + ChatGPT, sin Gemini.
- **Duracion historica:** aproximadamente ocho meses de trabajo desde el arranque; el atasco reciente de dos semanas no es la duracion total.
- **Suscripcion reportada:** 1990 y tantos MXN por mes (precio aproximado informado por el propietario; no se verificaron recibos). Sin comprobantes auditados.
- **Refrigerios de desarrollo reportados (sin comprobantes):** 2 six Tecate × MXN $112/six = **MXN $224/dia**; periodo ilustrativo de 238–243 dias: **MXN $53,312–$54,432**. Tratamiento contable y posible deducibilidad fiscal por verificar con contador; no asumir que es deducible ni aplicable a activos capitalizables. Incluir separado como egreso de refrigerios declarado dentro de los costos historicos reportados del desarrollo. No se suma automaticamente a un precio de venta de software.
- **Refrigerios del 2026-10-23 (declarado):** MXN $230; Declaracion del propietario en chat, sin recibo. No se suma dos veces al calculo ilustrativo.

**Trabajo personal reportado:** 12 horas diarias × 7 dias por semana = 84 h/semana.
**Rango temporal estimado:** 2026-02-23/2026-02-28 a 2026-10-23. **Horas aproximadas:** 2,856–2,916.

| Tarifa hipotetica MXN/h | Costo del trabajo estimado MXN |
|---:|---:|
| $100 | $285,600 – $291,600 |
| $200 | $571,200 – $583,200 |
| $300 | $856,800 – $874,800 |
| $500 | $1,428,000 – $1,458,000 |

**Contabilidad:** Sumar trabajo fundador por separado de efectivo erogado; evitar duplicar sueldos reales y tarifas externas. Confirmar fecha, horas efectivas y remuneracion de mercado antes de valuacion.
**Valoracion:** La inversion de trabajo no determina por si misma precio de venta, patrimonio o valuacion de la empresa.
**Estado del sueldo:** tarifa exacta no informada, pagos reales sin comprobar; se registra como costo de oportunidad, no efectivo pagado.

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
