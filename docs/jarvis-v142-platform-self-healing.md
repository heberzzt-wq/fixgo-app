# Jarvis V142 — recuperación transversal controlada

## Objetivo
Un error de cualquier componente debe producir diagnóstico verificable, una
decisión de recuperación del host y prueba independiente antes de afirmar éxito.
Qwen puede proponer pasos, pero no autorizar mutaciones por su cuenta.

## Estado implementado
- `jarvis-platform-self-healing.js`: clasifica fallos de herramientas,
  documentos, servicios, conectores, seguridad y operaciones sensibles.
- `jarvis-qwen-direct-cycle.js`: un solo reintento para fallos transitorios
  de lecturas autorizadas. Se revalida la autoridad en cada intento; el
  diagnóstico conserva código de error y cantidad de ejecuciones.
- `jarvis-structured-artifact-recovery.js`: valida XML mediante parser;
  únicamente escapa ampersands mal formados en texto. Rechaza DTD, estructuras
  incompletas y casos que requieren reconstrucción semántica.
- `jarvis-fs-bridge.js`: crea XML nuevo, lo relee, verifica su contenido,
  registra SHA y evita sobrescrituras. No despliega ni publica.
- El motor central devuelve planes, no acciones con autoridad para pagos,
  cuentas, reconfiguraciones de servicios o cambios de producción.

## Evidencia y límites
Las pruebas dirigidas ejercitaron recuperación de lecturas, permiso denegado,
fallo persistente y creación física de XML desde el bridge con una identidad
Git de prueba válida. Las baterías Qwen y bridge se ejecutaron completas
antes de publicar.

La Terminal todavía NO anuncia XML como una entrega descargable certificada;
esta fase deja disponible únicamente la capacidad gobernada del bridge.
Los planes de supervisor y OAuth no son reinicios ni reconexiones reales.
No hay automatización de aplicación de parches de código.

## Siguientes componentes
Implementar adaptadores autenticados de estado y reinicio local, reparación
de archivos con nueva versión y prueba de contenido, y OAuth del propietario.
Toda reparación debe dejar recibos de antes/error/acción/después con el alcance,
un límite de reintentos y una vía clara de cancelación.

## Integración de códigos JAR (octubre 2026)

- El catálogo de fallas estable está en `gestia-core/jarvis/jarvis.error-catalog.js`.
- `planPlatformRecovery` ahora conserva la decisión de seguridad del host y adjunta `incidentCode`, `incidentTitle`, `incidentAction` y `recoveryDisposition`.
- El ciclo de lectura autorizado conserva el código en recibos de error, registra el código de la recuperación reautorizada y no convierte un intento fallido en `SUCCESS`.
- `BOUNDED_AUTHORIZED_READ_RETRY`: permitido solo para lectura transitoria, hasta dos ejecuciones en total y con reautorización independiente.
- `ALTERNATIVE_SOURCE_REQUIRED`: el origen no existe o el sitio denegó lectura; se necesita una fuente distinta sin eludir permisos.
- `SECURITY_HOLD`: se detiene ante permisos insuficientes o mutaciones sin autoridad.
- `OPERATOR_REVIEW_REQUIRED`: problemas de enlace, credenciales, servicios, tamaños excesivos y demás fallas sin adaptador autocorrector certificado.
- **No implementado aún:** reparación automática de código y parches, reinicio real de servicios desde el catálogo JAR, toma automática de un lease de Firebase, recuperación de OAuth, solución de misiones complejas sin evidencia y aprendizaje persistente aprobado por pruebas posteriores.
- Los códigos son un índice de diagnóstico, NO instrucciones para el modelo. La selección de herramientas sigue en Qwen y la autorización en el host.
- La verificación física de la nueva integración debe demostrar recibos de error/acción/después y no solo pruebas unitarias.
