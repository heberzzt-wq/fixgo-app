# JARVIS V142 — NS1-08: grafo nativo integrado al planificador general

Fecha: 22 de octubre de 2026
Rama de entrega: `v142-official`

## Estado anterior

La herramienta `repo.graph` ya existía en `gestia-core/tools.runtime.js`,
con un endpoint autenticado local `/repo/graph` en el bridge y un
escáner AST/dependencias en `jarvis-repo-intelligence.js`.

Sin embargo, el planificador `qwen-general-pilot.js` no la incluía
en sus misiones de ingeniería. Solo ofrecía grep, lectura de unas
pocas fuentes y pruebas; no podía aprovechar el inventario completo
de fuentes compatibles ni sus dependencias antes de elegir lecturas.

## Integración realizada

- La clasificación del objetivo distingue auditorías de arquitectura
  de preguntas de código ordinarias.
- `createGeneralToolPolicy` admite `repo.graph` exclusivamente
  como herramienta de **solo lectura**, sin permiso de escritura.
- `generalToolCatalog` ofrece la herramienta solo a las auditorías,
  fijando por host `refresh:true`, `maxFiles:5000` y
  `maxFileSizeBytes:800000`: el modelo no puede cambiar destino,
  ruta ni tamaño.
- `prioritizeGeneralCodeCatalog` exige leer el grafo nativo primero,
  antes de grep, lecturas focalizadas y pruebas; si el grafo llega
  truncado/inconsistente no lo cuenta como éxito.
- `compactGeneralObservation` comunica a Qwen resumen, número de
  nodos y hasta 12 rutas, sin volcar texto de todos los archivos.
- `verifyGeneralMission` comprueba fuente, identidad de herramienta,
  parámetros obligatorios, conteos de nodos y relaciones y exige
  todavía grep, lecturas verificadas, pruebas reales e informe citado.
- Se incorporó el verificador a la firma de fuente del piloto,
  conservando protección de versión contra clientes obsoletos.

## Evidencia física del bridge oficial

Prueba en loopback con el endpoint `/repo/graph` y el contrato
de versión vigente. Respuesta: HTTP 200, `REPO_GRAPH_READY`.
Se pasó íntegramente al verificador independiente, que dio `ok:true`.

Resultados observados:
- **634** archivos de código compatibles escaneados.
- **634** nodos materiales; ningún nodo ausente en la muestra.
- **824** relaciones de dependencia.
- **4,171** funciones, **25,472** referencias de llamada.
- **335** listeners, **66** endpoints y **51** colecciones.
- **267** archivos de prueba entre las fuentes escaneadas.

Los totales corresponden al código que soporta el constructor del grafo
y entra en sus límites físicos. **No son todo el árbol de archivos del
repositorio**: quedan fuera binarios, documentación no analizada y
archivos demasiado grandes/no soportados. No se puede declarar revisión
semántica exhaustiva de cada función por parte de Qwen.

## Pruebas y límites

- **4/4** pruebas de integración dirigidas, con rechazo por conteos
  inconsistentes, parámetros falsos, origen no verificado y grafo vacío.
- **73/73** pruebas de regresión de ingeniería, política, versión,
  documentos y comportamiento general del planificador.
- Se comprobó el endpoint real además de los fixtures.
- No se habilitó `repo.write`, despliegues ni acceso a datos privados.
- La certificación formal NS1-08 aún requiere al menos tres misiones
  completas desde Terminal Heberto, con criterios y fuentes fijadas,
  evaluador independiente y cobertura declarada con honestidad.
