# Reconfiguracion local del agente V142 — 2026-10-25

## Dictamen y evidencia propia

La mision web autentica MISSION-ca4ba493-c89e-4562-a39d-bb72afd81208, sobre62dc56ff, termino PARTIAL/PLANNER_UNAVAILABLE. GitHistory/GitStatus y lectura fisica de jarvis-repomix-context.js funcionaron. Repomix rechazo functions/jarvis-semantic-planner.js con REPO_CONTEXT_FILE_SCOPE_DENIED. Hubo dos auditorias de150s. Duracion de pared aproximadamente19m03s; duracion interna676647ms, que excluye planificacion inicial. Ningun ONLINE ni prueba simulada certifica COMPLETED.

No se ha reentrenado Qwen. La reparacion trata contratos de herramientas, cantidad de inferencias, presupuesto de evidencia y comprobacion de objetivos.

## Fuentes primarias consultadas

- [Ollama: tool calling y agent loop](https://docs.ollama.com/capabilities/tool-calling): seleccionar herramientas, ejecutarlas y devolver sus resultados al modelo.
- [Ollama: structured outputs](https://docs.ollama.com/capabilities/structured-outputs): formato JSON Schema y validacion; recomienda temperatura baja para respuestas deterministas.
- [Ollama: contexto](https://docs.ollama.com/context-length): aumentar contexto requiere memoria; su recomendacion general de64k para agentes no es una configuracion certificada para esta laptop CPU/16GB.
- [Ollama: memoria, concurrencia y keep_alive](https://docs.ollama.com/faq): paralelismo multiplica la memoria de contexto; keep_alive controla retencion, no resuelve la inferencia activa.
- [Qwen3.5-9B: instrucciones oficiales](https://huggingface.co/Qwen/Qwen3.5-9B): usar el parametro API para non-thinking, no /nothink; ajustes de muestreo dependen de tarea y modo. Sus valores generales no sustituyen pruebas de JSON/herramientas.
- [Repomix: opciones](https://repomix.com/guide/command-line-options): include/ignore acotan fuentes; token-budget rechaza un resultado que excede el limite, no lo reduce automaticamente. La documentacion usa o200k_base por defecto: ese conteo no debe confundirse con tokens exactos de Qwen.
- [Repomix: FAQ](https://repomix.com/guide/faq): compress conserva estructura y elimina implementacion; no equivale a lectura completa.
- [Investigacion sobre interfaces de herramientas en Qwen3.5-9B](https://arxiv.org/abs/2610.23342): reporta utilidad de validar schema y reparar una seleccion acotada; no prueba esos resultados en Jarvis.

## Configuracion y flujo propuestos

| Capa | Decision | Evidencia/estado |
|---|---|---|
| Cerebro | Solo qwen3.5:9b local; sin proveedores externos | Invariante del propietario |
| Recursos |8192 tokens, una inferencia por vez, keep_alive45s, prewarm0, limite individual150000ms | Perfil Bridge ya verificado; runner np1 observado |
| Protocolo | Parser/renderer qwen3.5; non-thinking mediante API; JSON validado para decisiones | Ollama0.40.11 y parser/renderer reales comprobados |
| Seleccion | El schema debe impedir prefijos de ruta no admitidos; backend sigue validando secretos, traversal, bytes y symlinks | Reparacion local y regresion RED→GREEN |
| Planificacion | Reutilizar un ID exacto de lectura ya elegido por Qwen en su salida estructurada; argumentos permanecen diferidos | Reparacion local; alias, mutaciones y aprobaciones no usan el atajo |
| Evidencia | Recibos originales conservados; vista acotada con identidad/rangos/hashes; contexto comprimido sigue siendo preview | Parte existente; no completar objetivos desde memoria historica |
| Cierre | Objetivos tipados y auditoria por objetivo con recibos pertinentes, seguida de cobertura de la solicitud completa | PENDIENTE; auditoria global sigue fallando |
| Recuperacion | Un rechazo debe generar una propuesta nueva fundamentada, sin otra identidad ni ampliacion de permisos; no repetir el mismo paquete agotado | Recuperacion por tamano probada localmente; falta cerrar flujo general |

No se aplico un preset universal de temperatura/presence_penalty. El modelo instalado declara temperature1, top_p0.95, top_k20, presence_penalty1.5; cada peticion puede sobrescribirlos. Las decisiones estructuradas ya usan temperatura0. Cualquier otro ajuste requiere comparar respuestas reales con el mismo contrato y permisos.

## Experimentos y limites

1. RED: el schema de repo.context admitia cualquier string aunque su descripcion ya advertia los prefijos permitidos.
2. RED: los IDs canonicos elegidos por Qwen volvían a pasar por ranking y seleccion de nombre.
3. GREEN:24 regresiones dirigidas con casos negativos para alias, mutaciones, aprobaciones y rutas.
4. Replay local Qwen del mismo contrato:12 inferencias de contrato en la traza original frente a4 en el replay corregido; aproximadamente264s frente a92.351s. Un solo replay, no un benchmark general ni una mision web nueva.
5. NEGATIVO conservado: limitar la salida de auditoria y omitir narrativas antiguas no evito otro timeout150190ms. Se retiro ese ajuste y su chequeo de parametros, que no demostraba el resultado real.
6. Sigue sin certificarse el cierre global de la mision. No aumentar contexto, retirar seguridad o introducir otro modelo para esconder el fallo.

## Siguiente aceptacion

Certificar los cambios con CI local/Windows/Ubuntu y SHA sincronizado. Probar argumentos reales de Repomix con su schema corregido. Redisenar el cierre en pasos acotados por objetivo y probar las trazas capturadas. Despues repetir una sola mision autenticada y verificar cada fuente/recibo, recuperacion, duracion y ausencia de falsos COMPLETED.
