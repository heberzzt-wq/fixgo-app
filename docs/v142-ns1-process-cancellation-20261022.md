# V142 / NS1-12 — Cancelación de comandos del bridge

Fecha: 22 de octubre de 2026
Destino: rama oficial `v142-official`.

## Causa raíz

El endpoint `POST /run` ejecutaba comandos de prueba permitidos mediante
`spawn(command,{shell:true})`. Si el navegador cancelaba la solicitud,
el ejecutor carecía de vínculo con la desconexión HTTP; el proceso podía
continuar, aunque la interfaz hubiera mostrado "misión cancelada".

Además, el manejo de TIMEOUT sólo hacía `child.kill("SIGTERM")`.
En Windows, eso puede terminar el shell `cmd.exe` dejando procesos
descendientes (por ejemplo `npm.cmd` y `node.exe`) en ejecución.

## Reparación

`jarvis-run-command-cancellation.js` introduce dos primitivas:

- `bindOwnedCommandLifecycle`: conecta el objeto de respuesta HTTP
  y la solicitud con **el proceso exacto iniciado por ese /run**;
  la desconexión o `req.aborted` cancela una sola vez, elimina
  listeners y no actúa después de un cierre normal.
- `terminateOwnedProcessTree`: en Windows ejecuta
  `taskkill /PID <pid-propio> /T /F` sin shell ni búsqueda por
  nombre, puerto o procesos del sistema; en POSIX usa SIGTERM.
  Un PID nulo o inválido nunca provoca kill.

Se integró en el endpoint existente `POST /run`. El timeout también
usa el terminador del árbol del proceso propio y no responde a una
conexión HTTP ya destruida. Sin cambios en el catálogo ni en permisos
de escrituras de producción.

## Pruebas físicas

- `tests/jarvis-run-cancellation.test.mjs`:
  validación de ciclo de vida, cancelaciones duplicadas,
  ausencia de terminación tras respuesta exitosa, PID inválidos,
  argumentos fijos de Windows, POSIX y un Node hijo desechable real.
- `tests/jarvis-run-http-abort.test.mjs`:
  levanta el propio `createJarvisFsBridgeApp` con un repositorio Git
  temporal que tiene contrato y remoto válidos;
  `npm run check:syntax` inicia un Node de prueba que intenta
  emitir un recibo 1.5 s después.
  Se aborta la petición HTTP tras observar el PID real y se comprueba
  que **el recibo tardío NO se creó**.
- La misma prueba deja que otro `/run` termine normalmente y comprueba
  `HTTP 200`, `PASSED`, `exitCode=0` y recibo de finalización.
- **9/9 pruebas propias de cancelación aprobadas**.

## Qué no está demostrado

Esta reparación cubre **los comandos disparados por `/run`** cuando
la conexión HTTP se interrumpe; no certifica todos los caminos de
ejecución de Qwen, procesamiento distribuido o rollback de operaciones
completadas. Los comandos ejecutados antes del abort pueden haber
producido otros efectos autorizados y sus recibos deben permanecer
visibles. Tampoco permite ejecutar comandos arbitrarios ni escribir
en los repositorios sin la autoridad correspondiente.

**NS1-12 formal permanece pendiente** de pruebas de misión auténtica,
concurrencia, cancelación y recuperación multi-herramienta.

## Dependencia separada: NS1-10

WSL2 y la distribución `docker-desktop` están instalados, pero
en este corte Docker Desktop/engine Linux permanece apagado.
No ejecutar código no confiable en host como sustituto.
El verificador aislado debe devolver `SANDBOX_RUNTIME_NOT_READY`
hasta que el motor y la imagen fijada sean válidos.
