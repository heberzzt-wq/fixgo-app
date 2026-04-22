/**
 * ==================================================
 * JARVIS AUTOPATCH ENGINE v1.0
 * ==================================================
 */

export function buildAutoPatch(scan = {}) {

  const file = scan.file || "";
  const flags = scan.flags || [];

  const patches = [];

  if (flags.includes("GLOBAL_WINDOW_USAGE")) {
    patches.push({
      title: "Namespace único global",
      risk: "LOW",
      code:
`window.Gestia = window.Gestia || {};
Gestia.core = Gestia.core || {};
Gestia.modules = Gestia.modules || {};`
    });
  }

  if (flags.includes("LARGE_FILE")) {
    patches.push({
      title: "Bootstrap modular",
      risk: "MEDIUM",
      code:
`import "./ui.module.js";
import "./auth.module.js";
import "./data.module.js";
import "./events.module.js";`
    });
  }

  if (flags.includes("MIXED_UI_AUTH_DB")) {
    patches.push({
      title: "Separar capas",
      risk: "MEDIUM",
      code:
`export const uiEngine = {};
export const authEngine = {};
export const dbEngine = {};`
    });
  }

  if (!patches.length) {
    patches.push({
      title: "Sin parche crítico",
      risk: "LOW",
      code: "// Sin cambios urgentes"
    });
  }

  return {
    ok: true,
    file,
    total: patches.length,
    patches
  };
}