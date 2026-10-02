# CURRENT_TURN: recuperación de selección local vacía

Base: `a7e3e12e2d25be33667aa1af8e98f0f40b06251c`, rama `v94-media-v4n-negative-claims`, checkout `fixgo-app-v142-worker`. El checkout estaba limpio: los cuatro archivos descritos como pendientes en la rehidratación ya estaban incluidos en esa base.

## Fallo reproducido

La orden completa de Summit, con el catálogo real de 66 herramientas y el historial efectivo capturado del navegador, falló en **CURRENT_TURN_TOOL_SELECTION**. Gate, auditoría de aclaración y descripción de acción sí respondieron. En la selección:

| Campo | Intento 1 | Intento 2 anterior al fix |
| --- | --- | --- |
| Modelo / perfil | qwen3:1.7b / default | qwen3:1.7b / default |
| nativeChat / nativeToolChat / jsonOnlyNative | true / true / false | true / true / false |
| num_predict | 160 | 320 |
| done_reason | length | stop |
| message.content | cadena vacía | cadena vacía |
| message.tool_calls | ausente | ausente |
| messageKeys | role, content | role, content |
| Duración | 36 451 ms | 46 677 ms |

Una sonda con presupuesto 1024 conservó el mismo problema (`stop`, sin contenido ni llamadas). No había una llamada válida descartada por nuestro parser en esas respuestas. Esto demuestra el límite del aumento de tokens; no prueba cuál fue el texto interno descartado por Ollama.

## Cambios acotados

- El segundo intento de esa selección utiliza el mismo Qwen, mensajes y catálogo, con JSON limitado a los nombres y esquemas candidatos. No reinicia CURRENT_TURN ni cambia de proveedor. Dos intentos vacíos siguen fallando cerrados.
- Las etapas y cada intento registran modelo, perfil, modo, presupuesto, finalización, campos y duración; el error conserva esa evidencia hasta la consola web. Una llamada nativa válida con contenido vacío sigue aceptándose sin reintento.
- El gate existente pregunta a Qwen si la instrucción necesita conversación anterior. Una solicitud autosuficiente no hereda propuestas fallidas; las referencias y aclaraciones pendientes conservan su contexto. La instrucción actual completa permanece intacta.
- La prueba física de misión expuso un segundo defecto: `GROUNDED_ARGUMENT_COMPLETION` solicitaba una `toolCall` singular pero validaba sólo `toolCalls`. Se normaliza esa respuesta con el normalizador existente y se entrega al modelo el esquema exacto de la herramienta ya seleccionada. La validación de argumentos, catálogo y `missionComplete=false` permanece obligatoria.
- No se modifican la autoridad semántica, embeddings, dependencias de medios, publicación de campañas ni límites de aprobación. No se añade un timeout de inferencia.

## Evidencia

- Pruebas de recuperación y transporte: **32/32 PASS**.
- Regresiones focales de planner, argumentos, identidad, aclaraciones y grounding: **12/12 PASS**.
- Adaptador local: **6/6 PASS** en la verificación focal previa a la normalización de argumentos.
- Sonda física CURRENT_TURN: **134 602 ms**, cuatro inferencias de Qwen y una consulta de embeddings. Selección válida `marketing.package.real-media`, URL exacta `https://www.summ.com.mx/`; el helper existente agrega `web.media.collect`. Sin respuesta conversacional, pregunta al usuario, respuesta vacía ni respuesta incompleta. La solicitud completa conserva Summit, Cancún, alcance nacional y descargables.
- Prueba física de cuatro etapas del runtime: **PASS**, `web.research → marketing.plan → web.media.collect → marketing.package.real-media`. Ocho fuentes, dos inferencias locales para completar identidad/brief (aproximadamente 11,3 y 74,5 segundos), seis imágenes físicas y manifiesto de campaña de 40 572 bytes. Los siete archivos coinciden en tamaño y SHA-256 con sus recibos. El manifiesto conserva la instrucción completa, la URL canónica y el plan; no se publicó la campaña.
- Artefacto: `.jarvis-artifacts/campaigns/summit-empty-fix-20261002.json`, SHA-256 `c030d57d3aa015a5c5d043cfbd3b4b4b93ed0f9ca7be892e7774ea52311507cd`. La prueba utiliza el runtime real con el orden explícito solicitado y `requiredToolNames` igual que el contexto de ejecución normal. No equivale a aceptación visual ni a certificación de planificación autónoma de toda la misión.
- `node --check`: seis archivos JavaScript modificados válidos; `git diff --check` sin errores.
- Chrome: automatización no disponible (`Debugger unattached`); no se certifica una captura ni respuesta visible posterior al fix.

Evidencia local sin publicar el historial: `C:/Users/heber/Documents/firebase-deploy-temp/probe-web-trace-20261002.jsonl`, `probe-selection-budget-20261002.json`, `probe-context-certified-20261002.jsonl`, `empty-recovery-final-tests.log`, `empty-recovery-planner-regression.log` y carpeta `summit-mission-20261002-v3` del mismo directorio, incluido `physical-files-verified.json`. Las sondas se ejecutaron secuencialmente en CPU; no se usaron inferencias cloud ni API pagadas. Los intentos anteriores conservados no se cuentan como aprobados.
