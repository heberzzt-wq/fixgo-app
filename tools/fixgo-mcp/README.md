# FixGo Workspace MCP — fase 1

Adaptador MCP **tool-only**. No crea otro agente. Expone herramientas mínimas para inspeccionar y parchear el repositorio local mediante diffs unificados.

Herramientas: `fixgo_repo_status`, `fixgo_list_files`, `fixgo_read_file`, `fixgo_search_code`, `fixgo_diff`, `fixgo_patch_check`, `fixgo_patch_apply`, `fixgo_run_tests` y `fixgo_engineering_mission`.

`fixgo_engineering_mission` compone el ciclo completo y sólo devuelve
`ENGINEERING_MISSION_COMPLETED` si descubrimiento, búsqueda, lectura,
validación, aplicación, pruebas y diff final terminan con evidencia.

El flujo recomendado para clientes como Codex, Claude Desktop u otros hosts MCP es:

1. `fixgo_repo_status` para fijar rama y `HEAD`.
2. `fixgo_list_files` para descubrir el repositorio sin adivinar rutas.
3. `fixgo_search_code` y `fixgo_read_file` para reunir evidencia.
4. `fixgo_patch_check` antes de cualquier escritura.
5. `fixgo_patch_apply` con el `expectedHead` observado.
6. `fixgo_run_tests` y `fixgo_diff` para verificar y revisar el resultado.

Bloqueos: rutas fuera del repo, `.git`, `node_modules`, `.env`, llaves/credenciales, ramas distintas de `v5.9-polish`, shell arbitrario, commit, push, merge, deploy y parches mayores de 200 KiB.

## Instalación

```powershell
$repo='C:\Users\heber\Documents\Codex\2026-06-17\estas-conectado-a-github-y-a\work\fixgo-app'
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\fixgo-mcp-phase1.zip" -DestinationPath "$env:TEMP\fixgo-mcp-phase1" -Force
Copy-Item -LiteralPath "$env:TEMP\fixgo-mcp-phase1\fixgo-mcp-phase1" -Destination "$repo\tools\fixgo-mcp" -Recurse
Set-Location "$repo\tools\fixgo-mcp"
npm install
$env:FIXGO_REPO_ROOT=$repo
npm run check
npm run inspector
```

La fase 1 usa `stdio` y MCP Inspector. Después añadiremos Streamable HTTP, autenticación y Secure MCP Tunnel.
