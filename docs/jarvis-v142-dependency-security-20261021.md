# Jarvis V142 — auditar dependencias sin bloquear al propietario

Fecha: 21 de octubre de 2026. Entorno: laptop adjunto-jarvis,
rama v142-official, Windows 11, Qwen local y Firebase.

## Evidencia inicial

npm audit --omit=dev --json detecto 11 alertas: 2 criticas,
6 altas, 2 moderadas y 1 baja. Esto no prueba explotabilidad
ni intrusion exitosa; enumera advisories de dependencias.

## Remediacion segura de las 2 criticas

- proxy-addr 2.0.7 -> 2.0.8, para advisory sobre IP spoofing
  (GHSA-jqcg-44mw-7w3h).
- websocket-driver 0.7.4 -> 0.7.5, para controles de parseo
  de mensajes y compresion (GHSA-mp7j-qc5w-4988 y
  GHSA-xv26-6w52-cph6).
- Se fijaron versiones en package.json overrides y lockfile.
- NO se ejecuto npm audit fix --omit=dev porque su dry-run
  quitaba las dependencias de desarrollo Firebase necesarias
  para verificar login y sesiones.
- Se uso npm install sin omitir dependencias de desarrollo,
  con scripts de instalacion deshabilitados. Firebase se conservo
  en la version 10.8.0.
- Auditoria posterior: 0 criticas, 6 altas, 2 moderadas, 1 baja.
- Regresiones despues de la instalacion: 34/34 auth/seguridad,
  369/369 Qwen/perimetro, 110/110 bridge.
- Prueba dedicada impide reintroducir versiones vulnerables en
  package.json y package-lock.json y confirma Firebase intacto.

## Riesgos pendientes

Las seis alertas altas incluyen pdfjs-dist, pptxgenjs/image-size,
@grpc/grpc-js, @fastify/busboy y brace-expansion. Hay que revisar
si se invocan en rutas expuestas, y actualizar con contratos de
documentos, multimedia y sesion. Evitar actualizaciones masivas
o cambios semver major sin pruebas fisicas.

## Limites operativos

- Estos cambios estan en el repositorio; cualquier Hosting publicamente
  desplegado conserva su estado anterior hasta un release autorizado.
- El modulo del perimetro local no bloquea cuentas, no cierra sesion,
  no revoca tokens y no cambia permisos Firebase.
- Las alertas npm no son un pentest de nivel alto.
- No se realizaron inicios de sesion con contrasenas reales ni cambios
  de credenciales.
