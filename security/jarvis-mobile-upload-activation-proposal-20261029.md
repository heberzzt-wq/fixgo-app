# ADJUNTO V142 — propuesta de activación de adjuntos móviles (29/10/2026)

Estado: **NO PUBLICADA**. Este documento es una propuesta de cambio mínimo, no un archivo de reglas para desplegar.

## Ubicación de la regla

En las reglas **actuales verificadas desde Firebase Console** del proyecto `fixgo-44e4d`, localizar exactamente `match /jarvis_private_relay/{ownerUid}` y dentro `match /requests/{requestId}` la función `validRequest()` y su lista `data.route in [...]`.

La última copia local inspeccionada se llama `security/firestore-console-snapshot-2026-07-30.rules.txt`. Es histórica; **no debe sobrescribir las reglas vigentes de producción**.

## Único cambio propuesto a la lista existente

Añadir exclusivamente estas cuatro entradas a la misma lista autorizada, conservando todas las reglas actuales y sin eliminar sus restricciones:

```js
'/upload/start', '/upload/chunk', '/upload/complete', '/upload/cancel'
```

Los controles existentes que deben mantenerse intactos son: `relayOwner()`, `relayLive()`, `isRelayWorker()`, `releaseId`, control de `workerId`, estados de la solicitud, vencimiento, `requestId` con UUID v4 y `data.body.size() <= 393216`.

## Controles de aplicación ya comprobados

El móvil solo envía a un enlace privado del propietario; el worker validará también la estructura de cada ruta y obtendrá un token Firebase nuevo, que nunca entra al documento Firestore. El Bridge distingue solicitudes del relay con `X-Jarvis-Private-Relay`, verifica ese token y conserva la ruta local original de la laptop. Solo se permiten archivos .jpg, .jpeg, .png, .webp, .gif, .pdf, .txt, .md, .csv, .json, .docx, .xlsx y .pptx. Máximo 8 archivos, 8 MiB por archivo, 16 MiB por lote y fragmentos de 128 KiB. Los fragmentos no se reintentan automáticamente cuando falta una confirmación.

No quedan autorizados `/git`, `/repo/write`, `/platform/query`, `/upload` genérico, rutas de comandos, despliegues, fuentes del repositorio ni reglas de Storage adicionales.

## Antes de activar

1. Obtener y comparar las reglas vigentes con la copia histórica.
2. Aplicar el cambio mínimo en una copia actualizada de esas reglas y probarlo en el emulador Firestore con: propietario correcto, usuario diferente, solicitud caducada, versión diferente, worker diferente y ruta no permitida.
3. Requerir autorización específica del propietario para publicar **solo** las reglas de Firestore verificadas.
4. Comprobar una subida real desde el móvil de un archivo pequeño; revisar SHA-256 del recibo local y confirmar que el móvil no pudo leer o modificar archivos del repositorio.

**No se ha modificado la política desplegada ni el almacenamiento de producción.** El canal de pruebas puede mostrar la interfaz, pero la subida no funcionará hasta activar las reglas exactas.
