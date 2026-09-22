# V142 — hotfix de seguridad de Functions legacy

## Alcance

Este hotfix recupera tres nombres de Cloud Functions históricas que pueden permanecer desplegadas aunque ya no formen parte del entrypoint actual.

- `requestPayout`: queda como alias exacto de `solicitarRetiro`, la autoridad B2C canónica basada en `users + transacciones + retiros`.
- `generarModulo`: queda retirado con HTTP 410 y no inicializa ni llama a proveedor de IA.
- `procesarCierreServicio`: usa `completeB2cService` cuando esa autoridad física exista; mientras tanto falla cerrado y nunca devuelve un cierre ficticio.

## Concurrencia de retiros

`createRequestB2cWithdrawalHandler` usa `withdrawal_guards/{uid}` como mutex estable. Dos solicitudes simultáneas leen/escriben el mismo guard dentro de la transacción, por lo que Firestore serializa/reintenta la segunda. Los documentos históricos de `retiros` conservan sus IDs aleatorios.

## Límites

Este commit no migra datos, no mueve saldo, no ejecuta retiros, no llama Gemini, no cierra servicios reales y no modifica Multiservicios. El cierre B2C físicamente verificado de la auditoría forense sigue siendo un release posterior separado.
