# Biblioteca oficial y entrega de publicidad

La estación usa `Escritorio/Jarvis Material` como única biblioteca de originales. La configuración local, no publicada, está en `.jarvis-artifacts/material-library.config.json`: `directory` indica la carpeta y `officialOnly: true` exige su procedencia. La generación externa queda deshabilitada por defecto cuando existe esta configuración; no se modifica el proveedor semántico Qwen.

- `Entradas`: anuncios e imágenes aportados, separados por cliente.
- `Logos`: archivos originales de identidad.
- `Audio` y `Video`: fuentes propias o autorizadas.
- `Salidas`: copias exportadas con `media.library action=export`.

Los chats normales de ChatGPT/Gemini no reciben acceso al disco. El usuario coloca sus resultados en esta carpeta. Jarvis consulta con `media.library action=list`, importa los `relativePath` elegidos y obtiene artefactos registrados en el ledger existente. Las copias de expediente conservan SHA-256 y originales; no constituyen otra biblioteca de autoridad. No se aceptan rutas externas, recorridos `..`, enlaces simbólicos, contenido incompatible con la extensión ni archivos mayores de 100 MiB. El inventario está acotado y declara si es parcial.

`image.adapt` exporta PNG/JPEG localmente, con `fit=contain` por defecto para conservar textos y logos. Puede componer el archivo original del logo cuando se aporta `brandLogoOutput`. No elimina leyendas ya dibujadas en los originales ni certifica fidelidad de un logo recreado por otro generador.

`page.create` incrusta `sourceImages` y `logoOutput` importados. `reel.create` acepta escenas `presentation=poster` para reutilizar anuncios completos sin añadir textos encima; permite `audioOutput` importado. No se añade música inexistente. La política oficial rechaza referencias directas externas en esas composiciones.

Para publicidad, Qwen declara `deliveryMode=publishable_media` y requisitos por pieza. El orquestador conserva los argumentos y exige bytes, hash, dimensiones y formato físico; MP4 requiere H.264 y audio cuando se solicitó. Un documento o manifiesto no completa publicidad. La respuesta pone primero archivos y pendientes; la revisión visual sigue siendo necesaria antes de publicar.

## Evidencia local de este cambio

- Copias de los tres anuncios aportados y del logo de Summit verificadas por hash.
- Chrome ejecutó los actuadores reales: PNG 1080×1080, 1080×1350, 1080×1920 y HTML con fuentes importadas.
- Qwen3:1.7b eligió `media.library action=list` desde el catálogo en 40.7 s: una inferencia local, cero llamadas semánticas externas.
- Render técnico de escenas poster: MP4 1080×1920, H.264/AAC, 29.78 s, 7,325,934 bytes, inspección física válida. Audio sintético de prueba, **no música final de campaña**. El primer intento agotó la espera CDP; el segundo pasó. Se añadieron fase y diagnóstico de exportación para identificar futuros fallos, sin declarar éxito si falla.
- Recibos locales: `.jarvis-artifacts/material-library-verification/`. Estos archivos y los originales están excluidos de Hosting.
- Validación focal: 93/93 pruebas de biblioteca, publicidad, orquestación y render; 8/8 pruebas de herramientas de marketing e identidad. Sintaxis de los módulos modificados y `git diff --check` correctos. Se estabilizó el reloj de una prueba de deadline y se sustituyó una comprobación de aprobación basada en contar caracteres por inspección del registro real.

Esto verifica importación y composición local. No certifica una campaña mensual autónoma completa, una publicación en redes ni la revisión final de las imágenes. Los originales aportados todavía contienen «Imagen ilustrativa»; copiarlos o adaptarlos conserva esa leyenda. La música final debe aportarse en Audio.
