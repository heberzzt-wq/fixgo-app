# Auditoría de funciones huérfanas activas

Observado 2026-09-22 01:40 UTC. Proyecto `fixgo-44e4d`, región `us-central1`. Lectura autenticada de metadata e IAM; descarga oficial mediante `generateDownloadUrl`. No invocación de funciones, ejecución de fuente, despliegue ni escritura de datos productivos. Evidencia estructurada y hashes: `v142-forensic-orphan-functions-20260921.json`.

Los cinco exports siguen ACTIVE desde 2026-07-13 aunque no aparecen entre los exports locales actuales. Runtime nodejs20 y principal de ejecución `fixgo-44e4d@appspot.gserviceaccount.com` para todos. Eso identifica identidad de ejecución, no autor humano ni dueño organizacional: éstos no están verificados. Todos los archivos fuente indicados abajo son rutas **dentro del ZIP remoto**, no archivos locales del producto.

| Export | Versión | updateTime UTC | Archivo y líneas |
| --- | --- | --- | --- |
| requestPayout | 12 | 2026-07-13T22:15:53.401578849Z | src/index.js:104-139 |
| procesarCierreServicio | 9 | 2026-07-13T22:15:52.848706579Z | src/index.js:146-159 |
| generarModulo | 12 | 2026-07-13T22:15:53.096345403Z | src/index.js:178-250, su ZIP propio |
| robotPreventivo_v2 | 6 | 2026-07-13T22:15:52.514151071Z | src/index.js:169, src/scheduler_rutinas.js:258 |
| robotPredictivo_v2 | 6 | 2026-07-13T22:15:52.820414260Z | src/index.js:170, src/scheduler_predictivo.js |

## P0 — requestPayout permite fabricar saldo y sobregirar wallet

VERIFIED-CODE / BLOCKER productivo. IAM permite `allUsers`; el callable exige un Firebase usuario autenticado, pero no valida rol, estado, KYC, suspensión, moneda, importe positivo/finito, idempotencia o reserva. Lee `users/{auth.uid}.wallet_balance` fuera de transacción (113-120); su única condición financiera es `amount > balance` (122). Incrementa el saldo con `-amount` (126-128) y después añade un registro aleatorio en `withdrawals` (130-135).

Reproducción razonada sin invocar: un usuario existente con balance 0 envía amount=-100. La comparación -100>0 es falsa; increment(-(-100)) acredita 100 y crea retiro negativo pending. Dos solicitudes paralelas de 80 sobre saldo 100 pueden leer 100, pasar ambas y terminar saldo -60. Un fallo entre update y add descuenta sin registrar retiro. Un reintento genera otro retiro/descuento. No se ejecutó ninguno de estos payloads contra producción ni se ejecutó fuente descargada.

Lectura completa `withdrawals` al momento observado: 0 documentos; negativos, cero, inválidos, pending y grupos mismo actor/importe/status: todos 0. No hay evidencia de explotación en esa colección actual; esto no prueba ausencia histórica ni integridad del wallet. No analizar pagos reales ni modificar saldo. El reemplazo local por autoridad vigente necesita posterior despliegue autorizado para neutralizar el export remoto existente: corregir sólo nombres nuevos no lo elimina.

## P1 — procesarCierreServicio devuelve éxito sin cerrar

VERIFIED-CODE / LEGACY. Firebase auth solamente (148-150), log de `data.serviceId` (152) y `{success:true,message:'Cierre procesado'}` (154-157). Ninguna escritura financiera ni cierre real, validación de servicio o autorización de participante. IAM público, auth de callable requerida. No es un bypass monetario en esta versión; sí respuesta de éxito engañosa.

Búsqueda JS/HTML actual: ningún caller `httpsCallable` de este nombre. Único símbolo `fixgo-core-backend.js:87` es una función local exportada de dos argumentos `(serviceId, tecnicoId)`, sin consumidores encontrados salvo índice estático del repositorio. No confundir esa implementación local con este callable desplegado. Puede reemplazarse por rechazo explícito o alias al cierre canónico con sus validaciones completas; no preservar el falso éxito.

## P1 — generarModulo permite consumo Gemini sin autenticación

VERIFIED-CODE / BLOCKER de control de costos. Su archivo propio activo `src/index.js:178-250` permite CORS para un origen, pero no autentica, limita importe, cuota ni tokens. Lee prompt en 191 y llama Gemini con credencial del servidor en 204-212. IAM confirma invoker `allUsers`. CORS no autentica clientes HTTP. No se llamó Gemini ni este endpoint; disponibilidad/validez de clave y costo efectivo PROD-UNVERIFIED. No divulgar `.runtimeconfig.json`, variables de entorno ni URLs firmadas.

## Schedulers heredados

VERIFIED-CODE / LEGACY, eventos Pub/Sub. Alias de scheduler preventivo y predictivo de B2B. El preventivo lee `config_rutinas` activas, busca duplicado diario fuera de transacción, crea `servicios_b2b` con ID aleatorio y actualiza rutina después; consulta de técnicos legacy en colección `tecnicos` por activo/skills, no contrato B2C. El predictivo consulta `servicios_b2b`, cuenta correctivos y crea `config_rutinas` tras consulta previa. No modificar/remover automáticamente: pertenecen a B2B; comprobar dueño funcional y scheduler antes de migrar. No se probó ejecución ni equivalencia con schedulers nuevos, y no se considera evidencia de fallo B2C.

## Evidencia conservada

ZIP local restringido al directorio temporal `C:/Users/heber/AppData/Local/Temp/fixgo-orphan-source-ffca4956b1ad4c2a862486c2af725af4`. No copiar ZIP al repo: contiene configuración sensible. ZIP SHA256 común requestPayout/procesarCierreServicio/robots: `676D9FDB3F3D4F8EE71494E224038D965D49EF3FBE85223454A1BA89B3F940EE`; generarModulo: `CC4DAE713A4D90A18C773FE08D15D5C31F0846FD49FBE47EFFEC03CF9FF05EFD`. Se leyeron archivos JS dentro del ZIP sin ejecutar ni extraer archivos arbitrarios.

La fuente fue obtenida por API oficial [Cloud Functions generateDownloadUrl](https://docs.cloud.google.com/functions/docs/reference/rest/v1/projects.locations.functions/generateDownloadUrl), permiso de lectura `cloudfunctions.functions.sourceCodeGet`. Esta evidencia prueba código y configuración remotos actuales; no afirma que el arreglo local ya esté desplegado.
