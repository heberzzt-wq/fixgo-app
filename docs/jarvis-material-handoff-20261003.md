# Jarvis: originales locales hasta un anuncio físico

## Alcance

Continuación de la misión visible `MISSION-d5a76d47-3b96-4711-b8be-1829fb8d88ac`, que terminó parcialmente con un JSON y errores de imagen. Se conserva Qwen local como única autoridad semántica. Este cambio habilita y verifica una pieza antes de certificar una campaña mensual.

## Defectos y corrección

- El inventario se descartaba de la evidencia canónica. Sus referencias exactas, descripciones y regiones fotográficas ahora llegan a la siguiente llamada.
- Las operaciones diferidas de consulta y exportación usaban la misma herramienta con argumentos vacíos y se eliminaba la segunda. Se conserva la identidad de cada obligación y su propósito hasta la ejecución. Las acciones completas idénticas siguen deduplicándose.
- La herramienta de imagen sólo redimensionaba carteles. Ahora compone textos seleccionados por Qwen, la región fotográfica y los píxeles del logo original. Mantiene proporciones y rechaza texto que no cabe.
- El catálogo ofrecía generadores externos deshabilitados por la política local. Se excluyen antes de recuperar candidatos; la restricción del servidor sigue vigente.
- Nombres simples de archivo y IDs con guion bajo provocaban errores de formato. Se aceptan dentro de los límites del directorio de artefactos.
- Una exportación con la ruta exacta en `relativePath` se normaliza a `output`, únicamente con `action=export`. Referencias contradictorias se rechazan. La exportación sigue comprobando ledger, hash y límites de directorio.

## Biblioteca

La configuración de esta estación apunta a `C:\Users\heber\Desktop\Jarvis Material`. `Entradas`, `Logos`, `Audio` y `Video` son originales; `Salidas` recibe copias de resultados. Los sidecars opcionales `archivo.material.json` aportan descripción y región de foto, ligadas al SHA-256 del original. Si cambian los bytes se rechaza la metadata anterior.

Las descripciones y regiones iniciales fueron curadas por Codex. La selección de herramientas, originales y textos de la prueba corresponde a Qwen. No se atribuyen a Jarvis los paquetes anteriores preparados manualmente.

## No repetir publicidad

Por petición expresa del usuario, `Historial/publicidad.jsonl` conserva las piezas entregadas entre días y sesiones. Al iniciar se registran las entregas anteriores de Salidas. El planificador recibe los 30 antecedentes más recientes y el servidor compara la exportación contra todo el historial.

Se rechaza el mismo contenido binario, incluso renombrado, y el mismo texto creativo normalizado, incluso con otro tamaño, composición, mayúsculas o puntuación. Los videos guardan también el guion de escenas. Logo, contacto y música pueden conservar la identidad de marca: el bloqueo no los trata por sí solos como publicidad repetida.

El criterio determinista detecta duplicados de bytes o texto; Qwen debe decidir un enfoque nuevo usando el historial. Esto no equivale a una certificación de similitud conceptual de cualquier imagen externa sin metadata.

## Verificación y límites

Las pruebas focalizadas cubren inventario, referencias, deduplicación, propagación hasta el ejecutor, composición, límites de archivo y exportación. Los recibos de la prueba real están en `.jarvis-artifacts/material-handoff-20261002/`; no se publican.

La suite general del planificador tiene cuatro fallos previos en conversación/aclaración, reproducidos también con su código de HEAD `7171a38c`: 59/63 en la línea base. No se modifican como parte de esta corrección.

La prueba física local usa los módulos reales y Qwen de esta estación en una interfaz de diagnóstico. No certifica por sí sola la interfaz hospedada ni la autonomía de 12 piezas mensuales, TikTok o sitios. No se invocan generadores externos ni APIs de pago.

Prueba física completada: `MISSION-2ef51542-6701-44ff-87d0-9b129f6304d8`, `media.library(list) → image.adapt → media.library(export)`. Archivo PNG 1080×1080, 742483 bytes, SHA-256 `82113fff75f32fcf15293b42fe2b65a4f970882fae2a7f9275a8400bd7423fe1`; copia real en Salidas. Selección, texto y argumentos generados por Qwen. Cierre en 417027 ms; el archivo quedó exportado antes de la revisión semántica final. Reexportación posterior bloqueada como `ADVERTISING_DUPLICATE_BLOCKED`.
