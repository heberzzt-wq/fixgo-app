# V142 — hotfix aislado, sin despliegue

Base local: 504dbecc2eb5df300bfd4b639960abee60ef697b. La auditoría verificó producción 3a81f4b2635ca767e04d5f6d2b87fd2091f7e7ca; entre ambas bases sólo cambiaron workflow/exclusiones Hosting. Este hotfix no publica Hosting ni cambia workflow.

## Archivos exactos del primer commit

1. `functions/secure-entry.js`: registra la factoría de compatibilidad, sin cambios de API Stripe/cierre/liquidación.
2. `functions/legacy-security-hotfix.js`: conserva tres nombres; no importa proveedores.
3. `functions/b2c-service-marketplace.js`: exclusivamente handler canónico de retiro, importe numérico positivo representable en centavos y requestId obligatorio; reserva determinista/transaccional, replay sin segunda escritura.
4. `tests/hotfix-legacy.test.mjs`: exports, alias, retiros inválidos y retiro seguro de rutas antiguas.
5. `tests/hotfix-legacy-emulator.test.mjs`: concurrencia y replay sobre Firestore local.
6. `functions/test-b2c-service-marketplace.js`: fixture existente actualizado al requestId obligatorio.
7. `docs/v142-security-hotfix.md`: alcance, compatibilidad, prueba y rollback.

## Exports afectados y compatibilidad

- `requestPayout` es exactamente el mismo callable que `solicitarRetiro`. Nunca usa `wallet_balance` como saldo ni lo modifica; el saldo proviene del ledger canónico. El cliente debe enviar `{ amount: number, requestId: string }`, con requestId estable de 8–128 caracteres alfanuméricos, guion o guion bajo.
- `solicitarRetiro` incorpora el mismo control durable. Sin requestId rechaza antes de acceder a datos. Durante el hotfix aislado, el frontend antiguo de retiros queda bloqueado de forma explícita; el segundo commit incorpora recuperación compatible. No rellenar requestId aleatorio en cada retry.
- `generarModulo`: anónimo/token inválido → 401; token válido y no revocado → 410. No hay generación, consumo de proveedor ni sustituto público.
- `procesarCierreServicio`: sin sesión → unauthenticated; autenticado → failed-precondition `VERIFIED_CLOSURE_RELEASE_REQUIRED`, sin escribir ni responder éxito ficticio. El segundo commit conecta exactamente el callable `completeB2cService`; no se copia su motor al hotfix.

Alcance futuro de publicación: **sólo esos cuatro exports**. No usar despliegue global de Functions ni aceptar borrado de funciones ausentes del checkout. Ninguna regla, Hosting, scheduler, cuenta, configuración, saldo o servicio forma parte de la publicación del hotfix.

## B2B preservado

`robotPreventivo_v2` y `robotPredictivo_v2` son Functions remotas PubSub antiguas, ausentes de los exports locales antes y después. La auditoría ya guardó metadata y hashes de fuente. No se importan, editan, publican o eliminan aquí; los tests exigen que la nueva factoría sólo exponga los tres nombres legacy previstos. El despliegue futuro debe excluir explícitamente ambos robots. Comprobar metadata remota después de ese despliegue queda PROD-UNVERIFIED; no afirmar una comprobación productiva que aún no ocurrió.

## Rollback

Código local: revertir este commit sólo tras revertir los commits posteriores dependientes. No aplicar ese revert a producción: restauraría el comportamiento vulnerable o retiraría exports que deben seguir neutralizados. Rollback operativo seguro = mantener los nombres legacy en rechazo seguro y corregir hacia adelante; nunca restaurar el generador público, el retiro original ni el cierre ficticio. No hay rollback de datos porque no se modifica ningún dato productivo en esta preparación.

## Verificación antes de versionar

Se verifica una copia aislada de la base con sólo los siete archivos enumerados, utilizando dependencias locales existentes y proyecto de emulador `fixgo-b2c-rules-test`. Los resultados frescos se registran antes del commit. No se ejecutan endpoints productivos ni proveedores.

Resultado previo a versionar: **8/8 PASS**, cero omisiones (5 unitarias + 3 Firestore real emulado), exit 0; log `%TEMP%/fixgo-v142-hotfix-isolated-emulator.log`. Negativos incluyen amount/monto, tipos inválidos y requestId ausente; cuatro llamadas concurrentes con igual ID reservan una sola vez, replay posterior a procesado no escribe, cambio de importe con mismo ID se rechaza, dos IDs distintos no sobregiran. Ledger y wallet permanecen sin cambios en fixtures. `git diff --check` PASS. No se extrapola este resultado a producción.
