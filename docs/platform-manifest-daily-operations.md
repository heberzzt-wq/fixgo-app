# ADJUNTO V142 — Manifiesto diario automático

El catálogo maestro de B2C, B2B, Jarvis, ciberseguridad y operaciones sigue
versionado en docs/platform-master-manifest-v142.json (vista Markdown generada
desde scripts/platform-master-manifest-v142.mjs). Contiene los 57 frentes,
evidencia y condiciones para autorizar cierres.

## Corte automático sin bloquear el bridge

- Tarea en Windows: Jarvis V142 Manifiesto Diario
- Frecuencia: diaria a las 08:30 de la zona horaria configurada en Windows
- Usuario: propietario actual, privilegios limitados
- Si el equipo está dormido: StartWhenAvailable ejecuta al estar disponible
- Ejecutable: scripts/platform-manifest-daily-v142.mjs con Node local
- Salida: Documents/Jarvis-V142-Manifiestos/ultimo.md y ultimo.json
- Histórico: Documents/Jarvis-V142-Manifiestos/AAAA-MM-DD.md/json
- No necesita servicios pagados, credenciales de Firebase ni Internet para el corte local.
- El diario incluye: SHA actual, cambios desde el corte previo, frentes afectados
  por dominio, prioridades, 5000/3344/3345/11434, estado Git y pruebas dirigidas.
- Un commit no significa que una función esté terminada ni que producción esté certificada.
- No escribe en archivos seguidos por Git, no hace commit ni push:
  el bridge requiere mantener el repositorio oficial limpio.
- Las pruebas matutinas son dirigidas; no reemplazan pruebas E2E completas.

## Comandos del propietario

Actualizar después de un avance importante (desde la raíz del repositorio):

    node scripts/platform-manifest-daily-v142.mjs

Instalar o actualizar la tarea con PowerShell normal:

    powershell -ExecutionPolicy Bypass -File .\scripts\install-platform-manifest-daily-task.ps1

Consultar cuándo se ejecutó:

    Get-ScheduledTaskInfo -TaskName "Jarvis V142 Manifiesto Diario"

Leer el último reporte:

    Get-Content "$env:USERPROFILE\Documents\Jarvis-V142-Manifiestos\ultimo.md"

## Actualizar los estados del manifiesto maestro

Cuando un frente cumpla su criterio de aceptación:
1. Referenciar pruebas físicas, alcance, fecha y SHA exacto.
2. Obtener aprobación del propietario cuando proceda.
3. Editar únicamente el frente correspondiente del JSON maestro.
4. Regenerar su Markdown, ejecutar la opción --check y las regresiones.
5. Revisar y versionar en GitHub la modificación por actor autorizado.
6. La tarea diaria recogerá automáticamente el estado nuevo.

## Seguridad y no-lockout

Este programa jamás cambia contraseñas, roles, MFA, IP, sesiones, Firestore,
pagos, publicación, contenedores ni despliegues. Cambiar de red no es
intrusión por sí mismo. Un fallo de pruebas se registra como fallo real; no
se desactiva una barrera para producir un reporte verde.

No es vigilancia permanente: si la laptop está apagada o sin iniciar sesión,
el informe se actualizará cuando el Programador pueda ejecutar la tarea.
