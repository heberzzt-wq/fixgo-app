# Mantenimiento local sin publicador

Modo explícito para pruebas autorizadas del Bridge en `v142-official`. No certifica misiones ni producción.

Modo autorizado expresamente por el propietario el 2026-10-26: identidad `local_maintenance_pinned`, SHA local limpio fijado y descendiente del remoto real, marcado `localPublished:false`. El SHA remoto sigue en `contractHead`; el local no se presenta como publicado. El arranque normal conserva igualdad con el remoto y rechaza divergencia antes de importar el publicador. Arranque físico y misión se certifican con recibos separados, nunca con el preflight.

1. Comprobar que no hay misión ni inferencia activa. Identificar el supervisor por su puerto 3345 y comando, y pausarlo antes de dejar limpio el árbol. No detener procesos por nombre genérico.
2. Conservar/revisar cambios y obtener autorización para commit exclusivamente local. No hacer push ni usar `bridge:ensure` o `workstation`: esos comandos activan automatización normal.
3. Ejecutar `node scripts/jarvis-workstation-start.cjs --maintenance --preflight`. Exige Git limpio, HEAD válido, rama/repositorio oficiales, modelo local y ausencia de rebase pendiente; consulta el SHA remoto mediante ls-remote y comprueba ascendencia. Rechaza redirección del remoto. No hace fetch/rebase ni inicia servicios.
4. Ejecutar `node scripts/jarvis-workstation-start.cjs --maintenance` en el repositorio. En Windows usar proceso oculto con logs propios. Rechaza un supervisor en 3345 o cualquier servicio existente en 3344; no los termina. No importa ni arranca el worker GitHub y no hace sincronización Git.
5. Verificar `/health`: identidad/SHA reales, `maintenanceMode:true`, `workerStarted:false`, `gitSyncEnabled:false`, `remoteWorkerEnabled:false`, Qwen local y límites esperados. Autenticación, autorización, contención de rutas y controles de herramientas permanecen intactos.
6. Probar la misión desde preview y conservar recibos. Un proceso ONLINE no acredita resultado semántico.

## Parada y recuperación

Ante fallo, conservar logs y cambios. Detener únicamente el PID identificado del proceso de mantenimiento, sin misión activa. Corregir dentro del alcance autorizado, repetir pruebas y commit local, y volver a los pasos 3–5. Nunca restaurar archivos con reset/clean ni iniciar el publicador para sortear un error.

El supervisor normal debe seguir pausado durante este modo: exige worker activo y podría reciclar el Bridge. Restaurarlo requiere autorización explícita para volver a su sincronización y worker publicador; **no forma parte de la recuperación sin publicaciones**. No hay restauración automática a modo normal ni cambio persistente de configuración del sistema. Se conservan las entradas de inicio de sesión y automatismos diarios existentes; mantenimiento es temporal. Si el HEAD sigue solo local, el arranque normal lo rechaza antes de importar el worker. No falsificar refs, publicar ni sustituir el supervisor para resolver ese rechazo.
