# Península Tech — continuidad del laboratorio de logo

Fecha de corte: 1 de agosto de 2026, 00:43 (UTC-5)

## Repositorio y rama

- Repositorio: `heberzzt-wq/fixgo-app`
- Rama obligatoria: `v5.9-polish`
- No hacer merge a `main`.
- No desplegar Firebase Hosting ni Functions.
- Preservar siempre el archivo no rastreado: `V95-multimodal-batch-integrity.patch`.

## Estado actual del laboratorio

Archivos activos:

- `prototypes/peninsula-tech-logo-lab.html`
- `prototypes/peninsula-tech-logo-v12.css`
- `prototypes/peninsula-tech-logo-v12.js`
- `prototypes/ABRIR-LAB-PENINSULA-TECH.cmd`

Último commit confirmado del laboratorio:

- `65e041d26f4038a6b7eda9aba434e3ef5aec149f`

Commits relacionados con V12:

- `aa93362eb0b117f2897bac4c979045e5092d8655` — CSS V12.
- `93b45e09f6340fb2e6e6412a719b1de42f48ccda` — JavaScript V12.
- `e63b1117003e054da4cfbec29d449ef1c3217fec` — HTML V12.
- `65e041d26f4038a6b7eda9aba434e3ef5aec149f` — ocultamiento previo de trazos para la autoconstrucción.

## Dirección visual aprobada conceptualmente

La dirección que sí gustó fue la propuesta visual generada con:

- estética SIA7;
- fondo negro/azul profundo;
- cian y blanco muy intensos;
- HUD circular tecnológico;
- mapa real de Quintana Roo;
- sin el número 7;
- líneas tecnológicas extendiéndose fuera del círculo;
- texto `PENÍNSULA TECH` fuerte, premium y separado del emblema;
- sensación de plataforma tecnológica de primer nivel, no de una app genérica.

## Requisitos obligatorios del logo animado

1. El mapa debe conservar la geometría real de Quintana Roo; no deformarlo ni sustituirlo por una silueta inventada.
2. El emblema debe usar el lenguaje visual de SIA7, pero sin mostrar el número 7.
3. Todo debe autoconstruirse:
   - núcleo;
   - mapa;
   - circuitos internos;
   - aros;
   - ticks;
   - arcos;
   - nodos;
   - líneas y ramificaciones exteriores;
   - puntos pequeños;
   - islas y detalles geográficos.
4. Cada elemento debe iluminarse por completo, incluso el punto y la línea más pequeños.
5. El brillo final debe ser muy intenso, con núcleo blanco-cian y halo azul/cian, hasta bañar la pantalla del teléfono o computadora.
6. El trazo de construcción debe ser limpio, suave y continuo; no debe parecer lápiz, soldadura sucia, chispas amarillas ni dejar residuos.
7. El emblema y las letras deben permanecer separados; el wordmark no debe encimarse sobre el mapa o el aro.
8. `PENÍNSULA` debe aparecer letra por letra, con acento correcto; después aparece `TECH`.
9. Las letras deben sentirse metálicas, premium, futuristas y con más fuerza que las versiones anteriores.
10. Mantener los colores cian, blanco y azul inspirados en SIA7.

## Problemas detectados y que no deben repetirse

- letras con mojibake o caracteres raros;
- quitar el acento de `PENÍNSULA` como solución permanente;
- mapa inventado que parece montaña, pez o forma genérica;
- mapa demasiado pequeño o fuera del aro;
- wordmark encimado sobre el emblema;
- aro parcialmente iluminado;
- ticks, nodos o líneas exteriores apagados;
- brillo débil o difuso sin núcleo blanco;
- chispas amarillas o rastros de soldadura;
- parches PowerShell largos que dejan el archivo inconsistente;
- comandos pegados accidentalmente dentro del HTML;
- abrir archivos HTML en VS Code en vez del navegador.

## Próximo objetivo

Retomar desde V12 y producir una versión V13 enfocada únicamente en:

- usar el mapa real de Quintana Roo dentro del emblema SIA7 sin el 7;
- hacer que todas las capas se construyan y se iluminen al 100%;
- aumentar mucho el brillo blanco-cian;
- separar claramente el emblema del wordmark;
- mejorar el tratamiento tipográfico de `PENÍNSULA TECH`;
- probar primero en computadora y después resolver una vista móvil accesible desde el teléfono.

## Acceso móvil pendiente

Los intentos de servidor local y QR no quedaron resueltos. Para la siguiente sesión conviene elegir una sola ruta estable:

- servidor local en la misma red Wi‑Fi con una URL verificada; o
- despliegue temporal no productivo, únicamente con autorización expresa.

No desplegar Firebase ni modificar infraestructura sin autorización.
