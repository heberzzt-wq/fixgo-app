# Tabla de fallas ADJUNTO V142 — Península Tech

**Edición inicial:** 28 de octubre de 2026. **Estado:** catálogo de diagnóstico, no certificado de operación.

Al estilo de una tarjeta de fallas de aire acondicionado: ante un error la Terminal presenta
**código fijo**, **significado**, **qué revisar** y **código técnico original**.
El código no implica éxito, no inicia reintentos y no autoriza acciones adicionales.
El identificador de misión, los recibos y el SHA se mantienen por separado.

| Código | Sistema | Qué significa | Acción inicial |
|---|---|---|---|
| JAR-101 | Local | Bridge sin respuesta | Comprobar los servicios y su estado, sin duplicar misiones |
| JAR-102 | Qwen | Respuesta incompleta o vacía | Revisar recibo de inferencia |
| JAR-103 | Qwen | Tiempo agotado o flujo incompleto | Revisar estado previo a repetir |
| JAR-201 | Relay | Laptop sin enlace | Una Terminal local autenticada con cadena verde |
| JAR-202 | Relay | Otra Terminal ocupa el enlace | Verificar pestañas y registro anterior |
| JAR-203 | Relay | Versiones diferentes | Comparar SHA oficial, Bridge y Firebase |
| JAR-204 | Relay | Respuesta demasiado grande | Segmentar evidencia, conservar original |
| JAR-205 | Relay | Respuesta no confirmada | Revisar expediente, no ejecutar doble |
| JAR-206 | Seguridad | Sesión del propietario no autorizada | Recuperar autenticación legítima |
| JAR-207 | Relay | Solicitud vencida | Revisar cola y recibos antes de reenviar |
| JAR-208 | Seguridad | Operación no permitida desde móvil | Usar el canal autorizado |
| JAR-301 | Web | Sitio externo niega acceso | Buscar fuente independiente |
| JAR-302 | Navegador | Comando de navegador falló | Revisar resultado de inspección |
| JAR-303 | Navegador | Carpeta temporal ocupada | Revisar limpieza aislada |
| JAR-401 | Planner | Herramienta llamada repetidamente | Evitar repetir la misma evidencia |
| JAR-402 | Planner | Planificador no disponible | Revisar causa anterior |
| JAR-403 | Planner | Argumentos insuficientes | Validar esquema, alcance y fuente |
| JAR-404 | Planner | Falta plan local verificable | Exigir recibo real de Qwen |
| JAR-405 | Planner | Se agotó recuperación | Mantener resultado parcial |
| JAR-501 | Evidencia | Inventario incompleto/segmentación | Entrega parcial y continuaciones verificables |
| JAR-502 | Evidencia | Faltan fuentes | Investigar y certificar recibos |
| JAR-601 | Archivos | Archivo no disponible | Revisar ruta y recibo |
| JAR-900 | General | Causa no clasificada | Guardar error y expediente para añadir código |

## Protocolo para operar

1. **Leer el código.** Ejemplo: `JAR-201 — La laptop no está enlazada`.
2. **Seguir la acción sugerida.** El estado «Jarvis ONLINE» no sustituye la confirmación del relay.
3. **Conservar recibos.** Registrar misión, hora, herramienta, versión, código técnico y estado (parcial, fallido o completo).
4. **No duplicar llamadas.** Para errores de resultado no confirmado, verificar primero si ocurrió la ejecución real.
5. **Escalar nuevos errores.** `JAR-900` es temporal: añadir una clave específica después de comprobar la causa raíz, nunca por el nombre de la misión.
6. **Probar en tres niveles.** Prueba unitaria, CI oficial (Windows y Linux), prueba física desde Firebase/móvil.

**Seguridad:** No incluir tokens, UID privados, contraseñas ni contenido sensible en tarjetas públicas.
Las rutas privadas y permisos siguen sujetos al control original de Firestore.
El motor sigue usando Qwen local como único cerebro; esta tabla clasifica códigos de error del sistema, no instrucciones del usuario.

**Fuente técnica versionada:** `gestia-core/jarvis/jarvis.error-catalog.js`
