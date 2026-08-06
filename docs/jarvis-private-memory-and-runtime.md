# Jarvis: runtime local y memoria privada

La validación local usa el entrypoint real `gestia-terminal.html` con `jarvisLocal=1`. El formulario conserva su ruta de render real, pero evita autenticación y APIs pagadas en `localhost`. `window.__FIXGO_BUILD__` expone build, commit base y versiones del core, orquestador, marketing, presentador y memoria.

La memoria se guarda en `localStorage` bajo `jarvis.private.memory.v1::<userId>::<workspaceId>::<projectId>`. Los registros clasifican hechos, decisiones, restricciones, resultados, pendientes, misiones, supuestos y correcciones; incluyen fuente, conversación, misión, fechas, confianza y etiquetas. El ámbito impide lecturas cruzadas entre usuarios o proyectos. Se limita a 1,000 registros por ámbito y 40,000 caracteres por contenido; los candidatos con patrones de secretos se rechazan.

Las coincidencias exactas se deduplican. Una decisión nueva puede indicar `supersedes`; la anterior queda sustituida. `correct(id, contenido)` crea una corrección trazable y sustituye el dato previo. `forget(id)` redacta el contenido y lo excluye de consultas. El adaptador `missionStorage` aplica el mismo ámbito a los snapshots del orquestador, permitiendo reconstruir instancias y reanudar el mismo `missionId`.

Validación manual:

1. Ejecutar `python -m http.server 4173 --bind 127.0.0.1` desde la raíz.
2. Abrir `/gestia-terminal.html?jarvisLocal=1&userId=owner-a&workspaceId=fixgo&projectId=hmh&conversationId=e2e`.
3. Enviar la solicitud del plan, recargar, aportar el contexto, recargar y preguntar qué se hizo con el plan.
4. Comprobar `window.__FIXGO_BUILD__`, el mismo Mission ID, una ejecución por envío y 25 secciones en el DOM.

Prueba enfocada: `node --test tests/jarvis-project-memory.test.mjs`.
