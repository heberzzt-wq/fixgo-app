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

## Continuación: contrato general y entrega, 3 de octubre

El contrato local se divide semánticamente en fuentes, una operación completa de creación, verificación ejecutable expresamente solicitada y entrega. Qwen describe las operaciones y selecciona entre candidatos recuperados por embeddings; no se incorpora un router por palabras ni un cerebro alterno. Se conservan los propósitos de las obligaciones diferidas y el orden seleccionado. Las explicaciones de datos leídos y los botones de descarga corresponden a la respuesta/interfaz, no a herramientas adicionales. Los contratos anteriores con `work` en array mantienen compatibilidad.

La evidencia distingue originales de artefactos producidos. El historial completo sigue protegiendo contra duplicados; sólo los antecedentes con contenido creativo legible se envían al modelo. Los argumentos se generan con el nombre de herramienta ya seleccionado fijo y campos libres, y después se validan independientemente. Una consulta `list` que apunta a un artefacto producido ahora falla: no puede contarse como entrega. Los generadores externos de imagen y video se excluyen cuando la política los deshabilita.

Nueva evidencia física local: Qwen2.5:3b redactó y seleccionó la composición de `Summit_Fiscal_Advocacy_1080x1080-variant-1.png`; Jarvis produjo los bytes. La primera misión terminó con una consulta equivocada en vez de exportación, por lo que su cierre no constituye éxito de entrega. Tras corregir el formato y los límites, se reanudó únicamente la obligación pendiente usando el contrato y evidencia reales. Qwen eligió `media.library(action=export)` y el runtime confirmó `MATERIAL_EXPORTED_VERIFIED`, `historyRecorded=true`, el 3 de octubre a las 19:41:38 UTC.

Archivo real: `C:\Users\heber\Desktop\Jarvis Material\Salidas\95009bdd19b8-Summit_Fiscal_Advocacy_1080x1080-variant-1.png`; 1080×1080, 353860 bytes, SHA-256 `95009bdd19b89c8fbf6610655b8276a66ee052396ea553c0af5d3f40e8a4ce20`. Conserva el logo original, sin placeholders ni leyenda ilustrativa. Se observó vista previa y enlace de descarga en la interfaz local; el evento de descarga de Chrome no quedó confirmado. Recibos: `.jarvis-artifacts/material-handoff-20261002/grounded-qwen25-20261003/mission-receipt.json`, con el intento anterior preservado en `prior`.

Las comparaciones de modelos son diagnósticas, secuenciales y locales. No modifican el modelo de producción ni establecen fallback. Qwen2.5:3b y Qwen3:4b inicialmente separaron atributos de web/video en tareas y eligieron herramientas incorrectas. El contrato Qwen3:4b de lectura simple sí seleccionó sólo `repo.read` en 120189 ms. Estos resultados no certifican alineación general ni una campaña mensual. El modelo predeterminado permanece `qwen3:1.7b` hasta comprobar un reemplazo único.

La suite focal de biblioteca, propagación, compositor, historial, recuperación y transporte pasó 95/95 después de los cambios de entrega, política y transporte. La selección compacta usa llamadas nativas de herramientas y rechaza llamadas múltiples o nombres no ofrecidos. El shortlist semántico máximo se amplió de 8 a 12 candidatos. La creación y las verificaciones permanecen separadas; la comprobación física continúa en el runtime.

Qwen3:4b seleccionó biblioteca, `page.create` y exportación tras ajustar el contrato y las descripciones (255654 ms; recibo `general-qwen4b-proof-v3/case-1.json`). Su prueba de video seleccionó `reel.create` y exportación pero conservó una operación extra de contenido; no se considera aprobada. La posterior prueba de imagen sin razonamiento introdujo requisitos no solicitados. Qwen2.5:3b también eligió `artifact.list` para originales en una prueba posterior, por lo que tampoco se adopta como reemplazo. La interfaz hospedada, el flujo completo actualizado y la ejecución general siguen pendientes; no se confunden los recibos locales con aceptación de Hosting.

La plantilla Qwen3 instalada en Ollama 0.35.1 termina abriendo `<think>`. Una selección nativa con `think=false` devolvió razonamiento en `message.content` y agotó el presupuesto sin seleccionar herramienta. El transporte conserva `think=false` y añade el control oficial `/no_think` al sistema de Qwen3, sin modificar el turno original ni usar otro modelo. Documentación del control: https://qwenlm.github.io/blog/qwen3/ ; llamadas nativas: https://docs.ollama.com/capabilities/tool-calling .

Con la configuración final, Qwen3:1.7b produjo el contrato exacto `media.library → image.adapt → media.library`, sin obligaciones duplicadas, en 174119 ms. Recibo: `.jarvis-artifacts/general-alignment-20261003/image-qwen17-final-proof/case-0.json`. El modelo predeterminado no se cambia. La ejecución física actualizada se está verificando por separado; este contrato por sí solo no demuestra entrega.

## Entrega física con el modelo predeterminado

Misión `MISSION-b315dd47-cd0a-46d9-8209-4455e0c97f49`, completada en 185798 ms: Qwen3:1.7b seleccionó biblioteca, adaptación y exportación; el runtime produjo el PNG y confirmó la copia con historial. Archivo `C:\Users\heber\Desktop\Jarvis Material\Salidas\9be93b4bb7a9-anuncio-var1.png`, 1080×1080, 737979 bytes, SHA-256 `9be93b4bb7a94d711461f277898c913c07cdb9c9b5ebb764c61aa505d3780471`. Logo original SHA-256 `65d8e085b9e82f5e738efe944b70b1fafe9ff9fa61d3ad8b352afbbc2c851a6b`. Recibo: `.jarvis-artifacts/material-handoff-20261002/grounded-qwen17-text-repair-20261003/mission-receipt.json`.

La primera propuesta de texto repetía el historial y fue rechazada antes de renderizar. La reparación acotada pidió al mismo Qwen solamente titular y cuerpo nuevos; conservó los medios, recorte, logo y formato previamente elegidos. No se sustituyó la autoría por texto de Codex. También se rechazan contactos no aportados y recortes fuera de la fotografía verificada. Tras dos errores de validación se detiene el intento; no hay bucles ilimitados ni cambio de cerebro. La auditoría final recibió la evidencia como contexto y cerró sin volver a crear el anuncio.

La vista previa y enlaces Abrir/Descargar se observaron en la interfaz local. Captura `local-ui.jpg` en el mismo directorio de evidencia. El evento de descarga del navegador no quedó confirmado; la copia física en Salidas sí. Hosting actualizado y aceptación en Chrome se verifican por separado. Un anuncio no certifica campaña mensual, minidramas ni autonomía general.

La suite focal pasó 102/102. Las pruebas generales del contrato seleccionaron `repo.read` para lectura, `media.library → page.create → media.library` para HTML y `media.library → reel.create → media.library` para MP4. Son selección de herramientas, no ejecución física de sitios o video. La prueba de corrección de código descubrió una recuperación incompleta: la herramienta de preparación no aparecía entre los candidatos. Se añade esquema ejecutable compatible a `repo.prepareWrite`, se precisa su descripción y se utiliza el formato de consulta instruida documentado por Qwen Embedding: https://huggingface.co/Qwen/Qwen3-Embedding-0.6B . Los documentos del catálogo y la decisión exclusiva de Qwen se conservan; no se incorpora routing por palabras ni se amplían permisos de escritura.

La etapa que Qwen asigna se conserva al seleccionar herramientas. Fuentes, creación y entrega utilizan llamadas nativas con parámetros vacíos, sin duplicar el catálogo en el mensaje del usuario; sus argumentos ejecutables se completan después. La etapa `verification` pide solamente un nombre con schema JSON para evitar preparar otra corrección. Qwen elige entre candidatos recuperados por embeddings y los nombres se validan independientemente, sin routing por palabras. Una prueba fresca de código seleccionó `repo.read → repo.prepareWrite → tests.run`; recibo `code-retrieval-repair-proof/case-1.json`. No ejecuta ni certifica un cambio del repositorio: la escritura conserva la autorización humana exacta de un solo uso. Suite focal: 104/104.

La recuperación de selección vacía del contrato ahora conserva la misma operación y etapa y cambia solamente a un schema de nombre, usando el mismo modelo y candidatos. No pierde el contexto con un último mensaje genérico ni solicita argumentos prematuros. Regresión con operaciones registradas por Qwen y nuevas selecciones reales: imagen `media.library → image.adapt → media.library`, video `media.library → reel.create → media.library`; recibos `media-selection-regression-proof/case-0.json` y `case-2.json`. HTML pasó después de corregir esa recuperación: `web-selection-recovery-proof/case-1.json`, `media.library → page.create → media.library`. Estas regresiones reutilizan la descomposición registrada y no equivalen a ejecutar los artefactos de web/video. Suite final tras este cambio: 105/105.
