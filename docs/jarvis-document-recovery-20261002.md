# Recuperación de documentos y diagnóstico del bloqueo

Base: `68c58df946ecad2da7c3f8686eacdd90f1408738`, rama `v94-media-v4n-negative-claims`, checkout `fixgo-app-v142-worker`.

## Evidencia del incidente

El expediente visible `MISSION-a53fb5d6-d726-4f3c-804d-8d4084917e20` quedó `PARTIAL / PARTIAL_CAPABILITY_BLOCKED` el 2026-10-02 a las 03:56:37 UTC. Conservó `marketing.plan`, `web.media.collect` y `repo.search` como completados. `document.compose` acumuló tres ejecuciones; el último resultado conservaba `DOCUMENT_COMPLETION_MARKER_MISSING` y tres continuaciones. Tras interrumpir el bridge que seguía generando, el paquete y una lectura posterior registraron `Failed to fetch`. No se interpreta la interrupción como éxito de la misión.

El código anterior permitía seis reparaciones internas sin comprobar avance y dejaba que el orquestador reiniciara el documento completo. La redacción segmentada lanzaba tres solicitudes simultáneas mediante `Promise.all`. El progreso de cualquier `/semantic/respond`, incluidos documentos, se presentaba como respuesta final.

También hubo cortes de red independientes: el registro del navegador contiene errores de DNS y desconexión de Firestore; Desktop Commander Remote perdió heartbeat, canal y publicación de disponibilidad. Dos comprobaciones HTTPS locales a Hosting/Firestore agotaron diez segundos pese a Wi-Fi conectado. Posteriormente Hosting, `mcp.desktopcommander.app`, su configuración pública y la salud de autenticación de su Supabase respondieron HTTP 200. Esto prueba recuperación de acceso HTTP, no entrega de comandos por el canal remoto. No se modificó Desktop Commander, autenticación ni configuración de red.

## Cambios acotados

- `jarvis.multitool.pack.js`: una inferencia por segmento, contrato común para generación y validación, reparación de secciones faltantes, sustitución de borradores con contenido inválido, comparación de requisitos pendientes tras cada reparación y corte cuando no hay mejora. Conserva el último borrador aceptado en el resultado; no promete persistencia completa de borradores largos tras cerrar el navegador.
- La herramienta devuelve `retryable:false` y `fullRestartAllowed:false` al terminar su recuperación. Reutiliza el bloqueo de reinicios del orquestador existente. No añade otro cerebro, enrutador, worker ni supervisor. Mantiene Qwen local y el máximo existente de seis continuaciones, sin plazo artificial de inferencia.
- `jarvis-semantic-http.js` y `gestia-terminal.html`: progreso diferenciado entre documento inicial, segmento y reparación con número de intento. El heartbeat sigue siendo señal de actividad, no evidencia de éxito.
- Pruebas de regresión y registro en el comando existente de pruebas del bridge.

## Verificación

43 pruebas focales de recuperación, validador y transporte; 18 pruebas cercanas de composición, entrega y orquestación: aprobadas. Sintaxis y `git diff --check`: aprobados antes de publicar.

Prueba física con fallo controlado: el primer borrador era una fixture sin las dos tablas exigidas; cada reparación posterior la generó el motor de producción con `qwen3:1.7b` real y sin proveedor externo. La primera reparación redujo el déficit de tablas de 2 a 1 y la segunda a 0. Validador aprobado, dos reparaciones, 98.529 segundos. El borrador comprobado tiene 1716 bytes y SHA-256 `0583e401ac3733430010ba86e041264cb4102e3e3f64863f28f078237fc99a3f`. Es prueba de la recuperación del componente, no una nueva misión completa desde la interfaz ni una certificación factual del marketing.

Evidencia local: `C:\Users\heber\Documents\firebase-deploy-temp\document-recovery-physical-20261002\`, `document-recovery-focused-20261002.log` y `document-recovery-neighbor-20261002.log` en el mismo directorio temporal.

La pasada amplia previa terminó 147/150. Los tres fallos fuera del cambio son: prueba con plazo de 1 ms que espera expirar antes de ejecutar un plan vacío; sonda física `repo.search` que espera `REPO_SEMANTIC_SEARCH_READY` pero recibe el sobre `COMPLETED`; comprobación de versión HTML que todavía exige `v94` frente a `v142`. No se sustituyeron esas expectativas para presentar toda la suite como verde.

## Límites

La misión original quedó parcial y no se inventó su entrega completa. La recuperación implementada cubre composición documental y su integración con los bloqueos existentes. No autoriza a Jarvis a autopublicar parches, cambiar credenciales ni repetir operaciones de pago. La prueba visible completa de una misión nueva requiere evidencia separada.
