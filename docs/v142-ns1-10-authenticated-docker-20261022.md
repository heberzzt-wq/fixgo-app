# JARVIS V142 — Integración de NS1-10 con Docker real

**Fecha:** 22 de octubre de 2026
**Rama:** `v142-official`
**Alcance:** verificación física RED → GREEN de un parche ya preparado y aprobado como *preview* de solo lectura, sin aplicación a producción.

## Recuperación de Docker

En `adjunto-jarvis` se abrió Docker Desktop con el usuario ordinario.
Se comprobó `docker info`, motor Linux **29.9.2** y WSL2
`docker-desktop` en ejecución. La imagen local
`node:24-alpine` coincide exactamente con el digest fijado
`sha256:feb76650b7195319268c59cb2d419c732d6c499b13bf5296f16ab59eb1f0a4f3`.

No se reinstaló Docker, no se cambió el límite WSL2 (`memory=4GB`) ni se reinició Windows.

## Evidencia auténtica

Se localizó en Descargas el expediente previamente generado por Qwen
`general-38f6031b-b7cc-4ead-b056-43d349e9fa3a-prepared-patch.json`.

Se cotejaron el archivo original
`tests/fixtures/v142-rebate-preview.js`, el `repo.read`, las
pruebas previas, el parche `WRITE_PREPARED`, el fingerprint y los
SHA de código original/propuesto. Luego se ejecutó **físicamente**
`scripts/jarvis-isolated-patch-probe.mjs --receipt ... --save-report`.

- **RED:** el original falla exactamente en la aserción solicitada;
  3 aprobadas y 1 fallida, exitCode 1.
- **GREEN:** el parche propuesto pasa los cuatro casos, exitCode 0.
- Código original no modificado; archivos temporales destruidos.
- Docker: `--network none`, `--read-only`,
  `--cap-drop ALL`, `--security-opt no-new-privileges`,
  usuario no root, `--memory 384m`, `--cpus 1`,
  `--pids-limit 64`, bind-mount de solo lectura **solo** del
  fixture, sin acceso al árbol de repositorio ni socket Docker.
- Recibo host archivado:
  `.jarvis-artifacts/isolated-repair/general-38f6031b-b7cc-4ead-b056-43d349e9fa3a/684a6272-8642-48f3-8c10-50ad57690b44.json`.
- Hash de evidencia:
  `5870685a419a14c6783696881227ab8eea08169bf3985d2a93b5b5227bee7d2d`.

## Integración de verificación controlada

Se implementó `jarvis-isolated-evidence-verify.js`:
- Acepta únicamente misión de preview terminada y certificada, un solo
  `repo.prepareWrite` exacto, sin escrituras, y `tests.run`
  limitado a `check:syntax`.
- Solo permite el fixture
  `tests/fixtures/v142-rebate-preview.js`; valida fuente local y
  hashes original/propuesto antes de ejecutar cualquier hijo.
- No recibe nombres de ejecutables, comandos, tests, cwd, imágenes ni
  rutas provenientes del modelo.
- Lanza un único proceso Node hijo con el script confiable y
  argumentos exactos (sin shell), con límite de tiempo y captura acotada.
- Solo certifica resultado si `inspectArchivedIsolatedEvidence`
  valida el archivo de evidencia host con ID, fuente, fingerprint,
  hash, alcance y fallos/aciertos físicos.
- Una misión ya verificada reutiliza el archivo firmado por digest,
  sin nuevos contenedores; se rechaza una segunda ejecución concurrente.
- Si Docker no está disponible, o el recibo está corrupto, se devuelve
  fallo: **nunca** una certificación inventada.

El bridge expone `POST /qwen-isolated/verify` **únicamente cuando el
núcleo Qwen está habilitado**. El endpoint usa la misma autorización
con verificación de ID token y `ownerUid` que
`/qwen-isolated/evidence`.

En `modules/terminal/qwen-code-preview-download.js`, al restaurar
el último preview genuino desde la conversación autenticada se
recupera primero el recibo ya archivado. Solo para el fixture
controlado y si falta ese archivo se solicita verificación física
al bridge; `verifiedHostIsolatedProof` valida el resultado antes de
mostrarlo. La UI sigue indicando **PARCHE NO APLICADO**.

## Pruebas realizadas

- Prueba **real** del expediente auténtico en Docker: RED 3/4,
  GREEN 4/4, `ISOLATED_BEFORE_AFTER_VERIFIED`.
- Pruebas de servicio con Docker real y fixture sintético:
  **5/5** incluyendo archivo archivado/reutilizado.
- Pruebas unitarias adicionales: autorización previa, rechazo de
  cambios de SHA, rutas, comandos ajenos, duplicados, fraude de misión,
  y ejecución simultánea bloqueada.
- Regresión amplia del bridge, política, vista, versiones y evidencia
  aislada: **175/175 aprobadas**, una prueba opcional Docker
  deliberadamente omitida en modo CI (ejecutada por separado con
  `JARVIS_NS1_PHYSICAL_DOCKER=1`).

## Límites pendientes

Esto integra el ciclo de verificación **de un parche controlado ya
preparado**, no un ejecutor autónomo de parches arbitrarios:
- Aún no está certificado el ciclo completo RED → GREEN → REFACTOR
  desde una nueva solicitud libre de Qwen en la Terminal.
- No se ha integrado aplicación de parches a producción;
  toda escritura continúa sujeta a autorización humana, tests y
  rollback verificados.
- La sesión autenticada de Chrome debe validarse de extremo a extremo
  tras sincronizar UI; los tests de seguridad inyectan autorización
  controlada o comprueban las rutas, sin simular login real como éxito.
- No se ha desplegado Firebase.

**NS1-10 formal sigue `NOT_CERTIFIED` hasta esas pruebas.**
