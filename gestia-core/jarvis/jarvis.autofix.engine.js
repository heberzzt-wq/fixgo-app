/**
 * ==================================================
 * JARVIS AUTOFIX ENGINE v1.0
 * ==================================================
 */

export function buildAutoFix(scan = {}) {

  const fixes = [];

  const flags = scan.flags || [];
  const file = scan.file || "archivo";

  if (flags.includes("LARGE_FILE")) {
    fixes.push({
      type: "REFACTOR",
      priority: "HIGH",
      title: "Dividir archivo monolítico",
      patch:
`Separar ${file} en módulos:
- ui.module.js
- auth.module.js
- data.module.js
- events.module.js`
    });
  }

  if (flags.includes("GLOBAL_WINDOW_USAGE")) {
    fixes.push({
      type: "CLEANUP",
      priority: "MEDIUM",
      title: "Reducir variables globales",
      patch:
`Crear namespace único:

window.Gestia = window.Gestia || {};
Gestia.core = {};`
    });
  }

  if (flags.includes("MIXED_UI_AUTH_DB")) {
    fixes.push({
      type: "ARCHITECTURE",
      priority: "HIGH",
      title: "Separar UI/Auth/DB",
      patch:
`Mover lógica a capas:

ui.engine.js
auth.engine.js
db.engine.js`
    });
  }

  if (!fixes.length) {
    fixes.push({
      type: "OK",
      priority: "LOW",
      title: "Sin correcciones críticas",
      patch: "Estructura estable."
    });
  }

  return {
    ok: true,
    file,
    total: fixes.length,
    fixes
  };
}

