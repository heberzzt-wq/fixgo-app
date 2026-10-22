# Jarvis V142 — Ciberseguridad local y hosting (21 octubre 2026)

## Hechos verificados

- La laptop adjunto-jarvis escucha en 127.0.0.1 para 5000, 3344,
  3345 y 11434. Esto impide el acceso TCP directo desde la LAN, pero
  no protege contra una página maliciosa abierta en el propio navegador.
- Antes de este cambio, el sitio público https://fixgo-44e4d.web.app
  respondió HTTP 200 al consultar por HEAD jarvis-fs-bridge.js y
  jarvis-upload-bridge.js. Exposición de código fuente servidor no
  demuestra por sí sola ejecución remota o robo de credenciales.
- El release ID de jarvis-runtime-contract.json lo necesita el frontend.
  No se trata como contraseña ni secreto; excluirlo rompería el bridge.
- La protección de propietario con token Firebase YA existe en las
  decisiones del piloto local y en /qwen-isolated/evidence.
- Los endpoints históricos de operaciones privilegiadas no tienen todos
  una autorización de propietario uniforme. Los nombres de aprobador
  y los release IDs no son prueba criptográfica de identidad.

## Endurecimiento implementado

- jarvis-local-intrusion-guard.js bloquea, antes de cualquier ruta,
  Host no loopback o con puerto manipulado, orígenes no permitidos,
  peticiones cross-site sin Origin confiable, Host duplicados y
  llamadas que no llegan por escucha loopback.
- La lista de orígenes permitidos vive en un solo módulo y CORS la
  reutiliza: FixGo Hosting oficial y localhost/127.0.0.1 puertos 5000/5500.
- Se registran únicamente fecha, verbo, ruta acotada y código de bloqueo:
  ningún token, cookie, contenido del cuerpo, contraseña ni parámetro.
- /security/local/status es una lectura POST no cacheable solo del
  propietario, mediante verificación de identidad/versión/token.
- firebase.json agrega reglas de exclusión de ocho módulos
  exclusivamente del servidor, sin excluir importaciones del navegador.
  También prepara nosniff y Referrer-Policy strict-origin-when-cross-origin,
  conservando el origen de referencia entre sitios para compatibilidad OAuth.
- Las pruebas incluyen HTTP con Host falsificado realmente enviado,
  origin rechazado, host correcto, origen oficial, credenciales
  denegadas e informes sin secretos.

## Límites y tareas todavía pendientes

- Los cambios de firebase.json SOLO aplican a un siguiente release de
  Firebase Hosting. Hasta ese despliegue, los archivos ya publicados
  continúan accesibles. NO hubo despliegue de producción aquí.
- Firebase Hosting local sirve archivos de la raíz incluso si figuran
  en ignore: la exclusión es de empaquetado, no un firewall local.
- La guarda protege el servidor local 3344; NO es WAF/CDN,
  antivirus, EDR, firewall de red, monitoreo del sitio público, ni
  auditoría externa de penetración.
- Migrar las rutas /write/authorize, /write, /git y otras privilegiadas
  a autorización de propietario uniforme, verificar identidad y sesión
  para cada acción, y actualizar los consumidores antes de activarlo.
- Añadir alertas owner-only y límites de abuso por sesión sin bloquear
  el trabajo legítimo, un circuito de revocación y detección de
  anomalías web más allá del localhost.
- Revisar Firestore/Storage rules, CSP y las integraciones OAuth antes
  de certificar protección de producción; los conectores aún no están
  autorizados dentro de Jarvis.
- Ninguna barrera garantiza que una plataforma sea invulnerable.

## Comprobación de despliegue pendiente

En un release autorizado, verificar HTTP 404 para:
- /jarvis-fs-bridge.js
- /jarvis-upload-bridge.js

Y HTTP 200 para los recursos públicos que usa la Terminal. El HEAD
previo fue HTTP 200 para ambos archivos internos y 200 para
gestia-terminal.html; NO indicar resuelto en Internet hasta probar
un nuevo release y su caché/CDN.

## Acceso del propietario y pruebas de no-bloqueo

- El perímetro rechaza SOLO la solicitud actual; nunca hace signOut,
  revocación de token, bloqueo de IP, deshabilitación de cuenta ni cambio de
  credenciales por un intento fallido. Cambiar de red no implica bloqueo.
- Prueba HTTP con 12 intentos fraudulentos y, después, acceso legítimo 200
  desde localhost:5000, 127.0.0.1:5000 y los dos orígenes oficiales.
- La protección existente de login y token sigue siendo independiente.
  Un 409 de releaseId exige actualizar Terminal/bridge; no es un baneo.
- Para diagnosticar un falso positivo, el propietario puede revisar los
  registros locales desde acceso autorizado a la laptop; NO auto-desactivar
  autenticación ni el firewall. No se han cambiado contraseñas, permisos
  de Firebase Auth, recuperación de acceso ni roles de usuarios.
- La prueba 34/34 cubrió contratos de sesión y regresiones, pero no equivale
  a una auditoría completa de login OAuth real con múltiples dispositivos.
- No existe evidencia de que se haya completado previamente un pentest
  sofisticado. Los controles verificados antes eran alcance limitado.
