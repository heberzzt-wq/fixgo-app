# Corrección de la publicidad breve de SUMMIT

Checkout: `fixgo-app-v142-worker`, rama `v94-media-v4n-negative-claims`, base `dab94afad0ac4bb412fc43902a963fe83f5eec33`. El checkout `fixgo-app` de la conversación permanece intacto. Se conserva Qwen3:1.7b local y Qwen3 Embedding como recuperación mecánica, sin proveedor alternativo ni API pagada.

## Fallo observado y reproducido

La misión visible `MISSION-6cf881c4-cc3f-4408-94df-87256a9fa604` recibió `“créame una publicidad nueva para SUMMIT`. Añadió una lectura de código no solicitada, inventó `publicidad_summit` y seleccionó HTML para creación y exportación. La investigación genérica llevó a la composición a confundir la marca con Meta Performance Marketing Summit e inventar un correo. La creación se bloqueó y no hubo entregables.

La sonda con el código base reprodujo la operación de lectura de repositorio sobrante. El paso correspondía literalmente al ejemplo de revisión de producción introducido en el último cambio. Evidencia local: `.jarvis-artifacts/reconfiguration-20261004/baseline/qwen-1-response.json`.

## Cambio y límites

- El contrato conserva los ejemplos como formato y elimina el ejemplo que contaminó la publicidad con revisión de producción. Qwen declara el tipo de fuente y resultado del trabajo; un pedido breve de publicidad se resuelve como anuncio gráfico local.
- El catálogo declara las etapas y tipos de resultado de las capacidades afectadas. El runtime filtra por esos datos, no por palabras del usuario. Una consulta no satisface creación; HTML no satisface imagen; exportar no vuelve a crear. La selección sigue perteneciendo a Qwen.
- La selección usa llamadas nativas sin argumentos prematuros; la recuperación conserva una selección de nombre y la misma operación. Los argumentos se completan tras sus dependencias reales.
- La investigación de publicidad consulta primero originales oficiales e historial y completa su búsqueda con el mismo Qwen a partir de esa evidencia. Las fuentes externas sólo orientan la propuesta, no sustituyen identidad, contactos ni originales del cliente.
- Los argumentos se vinculan a referencias de investigación observadas, contactos oficiales, combinaciones de foto y diseño aún no entregadas y artefactos producidos. La composición y dirección creativa son obligatorias cuando existe investigación publicitaria suficiente. El logo original es obligatorio. Un recorte fuera de la región verificada se vincula mecánicamente a la región de la foto elegida por Qwen; el validador independiente se conserva. La reparación semántica admite hasta tres errores distintos y corta la repetición del mismo fallo. Se conservan los validadores de identidad y novedad.
- El plazo de cliente para esa investigación cubre los tres intentos públicos de 20 segundos del bridge. Se conservan los límites del servidor y el bloqueo cuando faltan fuentes.

No se cambian aprobaciones, contratos de escritura, supervisor, biblioteca, historial anterior ni credenciales. No se despliega ni se certifica producción desde pruebas locales.

## Evidencia

Qwen real, con la misma frase corta, seleccionó `advertising.research → image.adapt → media.library` en 128259 ms. Recibo: `.jarvis-artifacts/reconfiguration-20261004/typed/case-0.json`. Esto demuestra selección, no entrega.

Suite focal de recuperación, transporte, investigación publicitaria, materiales, compositor de respuesta y adaptación de imágenes: 124/124, exit 0. Log: `.jarvis-artifacts/reconfiguration-20261004/final-focal-tests.log`.

La suite amplia previa tuvo cuatro fallos conversacionales además de dos incompatibilidades de selección corregidas. Los cuatro fallos conversacionales también se reprodujeron con una copia del planner de HEAD, sin sustituir archivos activos. Log: `.jarvis-artifacts/reconfiguration-20261004/preexisting-baseline-tests.log`. No se declaran resueltos en esta corrección. La repetición final del suite del planner conserva exactamente esos mismos cuatro fallos, sin fallos adicionales; log `.jarvis-artifacts/reconfiguration-20261004/broad-planner-final-tests.log`.

La reparación creativa usa el mismo Qwen, con instrucciones de redacción y contexto de mensajes rechazados, en lugar de tratar el historial como texto inmutable por copiar. El compositor calcula la escala tipográfica con el lado menor del lienzo, evitando el desbordamiento inevitable del contacto en formatos horizontales. El esquema condicional de la biblioteca se compila como alternativas completas para la gramática de Ollama: exportar exige un output producido, consultar no lo exige. Una salida incompleta se rechaza independientemente.

Prueba física local: Qwen produjo un mensaje distinto, foto 2 con layout stack y logo oficial. Se reutilizaron la investigación y el borrador reales capturados en esta misma sesión; no se repitió la búsqueda ni se modificó el texto a mano. El mismo compositor de la aplicación se ejecutó con Node Canvas y un decodificador raster Sharp, dado que Chrome devolvió `Debugger unattached` y la nueva pestaña de prueba agotó su plazo. La prueba Canvas no constituye aceptación del navegador.

Se generaron JPEG reales de 1200x600 y 1600x900. Qwen completó la exportación del primero y el runtime lo entregó en `C:\Users\heber\Desktop\Jarvis Material\Salidas\2bb703b1fa21-adapted-1791148763747-var1.jpg`, 62214 bytes, SHA-256 `2bb703b1fa2177548d682834cb69ce8d71b776e2be280a05807a8e54f6c6ec90`; el archivo fue inspeccionado visualmente y el recibo declara `historyRecorded=true`. Logo original SHA-256 `65d8e085b9e82f5e738efe944b70b1fafe9ff9fa61d3ad8b352afbbc2c851a6b`. Recibo: `.jarvis-artifacts/reconfiguration-20261004/physical-accepted/delivery-receipt.json`.

No se declara éxito de una misión nueva completa en el terminal alojado: las sondas anteriores quedaron parciales y la entrega final se verificó por etapas con evidencia reutilizada. La activación del cambio en el bridge existente, Hosting y una misión nueva en el terminal público permanecen pendientes. No se hizo commit, push ni despliegue.



