# JARVIS V142 — Integración y certificación de documentos nativos

**Fecha:** 22 de octubre de 2026
**Destino:** rama oficial `v142-official`
**Capacidad relacionada:** NS1-07 (PDF y Excel)

## Qué existía

El bridge de JARVIS ya posee el endpoint `/document` con generación de
PDF mediante PDFKit y XLSX mediante ExcelJS, recalculadora
`verifyXlsxWorkbookCalculations`, validación física
`verifyPdfContentPhysically`, registro de artefactos, lectura y
`media.library` para exportación física a `Salidas`.

El catálogo `generalToolCatalog` expone `document.create`,
`artifact.read` y `media.library`, y el ejecutor independiente
requiere esos tres pasos antes de certificar formatos solicitados.

## Falla real reproducida y reparada

El verificador `unfulfilledDownloadFormats` aceptaba un recibo
`experimental:true` como sustituto del archivo realmente
exportado, incluso si no existían `status`, `bytes`,
`directory` y `relativePath` físicos. Una prueba creada en
`tests/jarvis-qwen-native-office-proof.test.mjs` mostró dos
fallos RED antes de la reparación.

Se implementó `verifiedOfficeExportReceipt` y se adoptó en
`unfulfilledDownloadFormats` y
`verifiedFinancialPdfFromWorkbook`: para PDF, XLSX, DOCX,
PPTX y CSV se exige recibo `MATERIAL_EXPORTED_VERIFIED`,
SHA-256, tamaño, ruta `Salidas/<hash>-<nombre>`, directorio,
salida y artefacto de origen consistentes. El estado
`experimental:true` puede coexistir, pero nunca sustituye
esos campos. Las piezas multimedia conservan reglas propias.

## Prueba física de integración

`tests/jarvis-qwen-native-office-integration.test.mjs`
crea un repositorio Git temporal con contrato y remoto local
válidos, levanta `createJarvisFsBridgeApp` en loopback
y utiliza **el endpoint real `/document`**. Verifica:
- Libro XLSX con fórmulas `SUM(B3:B5)`, `B2-B6`, cálculo y hash.
- Documento PDF con validación de contenido y hash.
- Bytes de origen reabiertos y artefacto registrado.
- Exportaciones físicas de ambos archivos a `Salidas`,
  con bytes y SHA-256 iguales a los originales.
- `unfulfilledDownloadFormats` vacío solo después de
  los recibos físicos y rechazando marcas experimentales
  sin entrega real.

El bridge rechazó primero un servidor de prueba sin contrato
con `BRIDGE_IDENTITY_INVALID`; se corrigió **el fixture**
y no se debilitó el guard de identidad.

## Pruebas

- Regresión específica: **24/24 PASS**.
- Regresión relacionada (11 suites): **68/68 PASS**.
- Un test histórico fuera de la selección moderna intenta
  abrir un XLSX que no está disponible en su ruta antigua;
  eso dio 71 PASS / 1 FAIL en una batería ampliada inicial.
  No se falsificó ni reconstruyó como supuesta evidencia
  del expediente viejo.

## Límites

Esta verificación demuestra generadores y exportadores
**nativos dentro del backend JARVIS**, con identidades,
comprobaciones y un servidor temporal real.
No reemplaza una misión enviada desde el navegador de
Terminal Heberto autenticado ni acredita selección libre de
herramientas por Qwen o las tres repeticiones NS1-07
exigidas para la certificación formal de la matriz.
No autoriza pagos, publicación ni despliegues Firebase.
