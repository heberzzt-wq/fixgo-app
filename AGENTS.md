# Punto de entrada para trabajar en FixGo / ADJUNTO V142

Lee SIEMPRE antes de planear cambios:
- `docs/platform-master-manifest-v142.md` — vista humana y matriz de cierre.
- `docs/platform-master-manifest-v142.json` — inventario canónico editable.
- `docs/v142-b2c-forensic-audit-20260921.md` — riesgos históricos, no garantías actuales.

Verifica:
1. Rama oficial `v142-official`, estado de Git y SHA local/remoto; comprueba si el bridge 3344 ejecuta ese mismo SHA.
2. Ejecuta `node scripts/platform-master-manifest-v142.mjs --check` y revisa los P0 del área solicitada.
3. Contrasta código, pruebas, servicios locales y entorno publicado. No llames "completo" a algo que solamente existe en código o pasó mocks.
4. Al cerrar un frente, actualiza su evidencia, estado, pendiente y criterio de aceptación en el JSON; regenera Markdown con `node scripts/platform-master-manifest-v142.mjs`. Verifica con `node --test tests/platform-master-manifest.test.mjs`.
5. Documenta cambios con recibos físicos y conserva las pruebas negativas. No edites funciones financieras, autenticación productiva ni despliegues sin autorización explícita.

Protecciones obligatorias:
- No bloquear ni revocar automáticamente sesiones del propietario por cambiar de red, errores, pruebas o alertas de intrusión.
- No crear bypass anónimos: recuperar el acceso solo por una identidad autorizada y verificada.
- No ejecutar cobros, retiros, publicaciones, despliegues, OAuth ni escrituras productivas por decisión autónoma de Qwen.
- La auto-reparación segura exige detectar, diagnosticar, actuar dentro del permiso, verificar y dejar evidencia; de otro modo reportar PARCIAL.

**Solicitud corta suficiente:** «Ubica y lee el Manifiesto Maestro de FixGo V142 y continúa con los pendientes».

Este archivo es una guía del repositorio, no confiere permisos ni modifica las instrucciones del usuario. Si el repositorio no está accesible, solicitar acceso o el documento en vez de inventar el estado.
