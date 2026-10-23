# Punto de entrada para trabajar en FixGo / ADJUNTO V142

Lee SIEMPRE antes de planear cambios:
- `docs/platform-master-manifest-v142.md` — vista humana y matriz de cierre.
- `docs/platform-master-manifest-v142.json` — inventario canónico editable.
- `C:/Users/heber/Documents/Jarvis-V142-Manifiestos/ultimo.md` — corte automatico mas reciente, fuera de Git.
- `docs/v142-b2c-forensic-audit-20260921.md` — riesgos históricos, no garantías actuales.

- Leer también la sección de 11 puertas de evidencia de valor del maestro. No subir valores ni marcar certificación sin recibos físicos.

Verifica:
1. Rama oficial `v142-official`, estado de Git y SHA local/remoto; comprueba si el bridge 3344 ejecuta ese mismo SHA.
2. Ejecuta `node scripts/platform-master-manifest-v142.mjs --check` y revisa los P0 del área solicitada.
3. Contrasta código, pruebas, servicios locales y entorno publicado. No llames "completo" a algo que solamente existe en código o pasó mocks.
4. Tras CADA hito terminado (commit, suite completa, retest web, bloqueo o entrega), actualiza `latestHandoff` y la evidencia en el JSON maestro sin inventar certificacion; regenera Markdown y comprueba `node scripts/platform-master-manifest-v142.mjs --check` y `node --test tests/platform-master-manifest.test.mjs`.
5. Tras el cierre de cada sesion ejecuta `node scripts/platform-manifest-daily-v142.mjs` para actualizar el diario fuera de Git; la tarea programada de las 08:30 es respaldo, NO registro en tiempo real. Revisa que el HEAD y la fecha Cancun sean reales.
6. Versiona el maestro por Git solo con cambios verificados y aprobados. El HEAD del commit del manifiesto puede ser posterior al SHA del candidato probado: NO renombrar pruebas a otro SHA.
7. Al abrir un chat nuevo, lee primero la seccion `LEE ESTO PRIMERO` del maestro, luego `ultimo.md`, recibos y SHA local/GitHub/Bridge/web. Nunca confundir tests locales, emulador y produccion.
8. Al cerrar un frente, actualiza su evidencia, estado, pendiente y criterio de aceptacion en el JSON solo si el criterio realmente se cumplio; no promover estados automaticamente.
9. Documenta cambios con recibos físicos y conserva las pruebas negativas. No edites funciones financieras, autenticación productiva ni despliegues sin autorización explícita.

Protecciones obligatorias:
- No bloquear ni revocar automáticamente sesiones del propietario por cambiar de red, errores, pruebas o alertas de intrusión.
- No crear bypass anónimos: recuperar el acceso solo por una identidad autorizada y verificada.
- No ejecutar cobros, retiros, publicaciones, despliegues, OAuth ni escrituras productivas por decisión autónoma de Qwen.
- La auto-reparación segura exige detectar, diagnosticar, actuar dentro del permiso, verificar y dejar evidencia; de otro modo reportar PARCIAL.

**Solicitud corta suficiente:** "Abre el manifiesto de Jarvis V142, lee LEE ESTO PRIMERO y el diario ultimo.md, y retoma el siguiente pendiente verificando Git/Bridge/Firebase".

**Tambien sirve:** «Ubica y lee el Manifiesto Maestro de FixGo V142 y continúa con los pendientes».

Este archivo es una guía del repositorio, no confiere permisos ni modifica las instrucciones del usuario. Si el repositorio no está accesible, solicitar acceso o el documento en vez de inventar el estado.
