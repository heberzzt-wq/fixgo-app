/**
 * ==================================================
 * JARVIS PATCH DIFF ENGINE v2.0
 * ==================================================
 */

export function buildPatchDiff(scan = {}) {

  const file = scan.file || "";
  const flags = scan.flags || [];

  const diffs = [];

  if (flags.includes("GLOBAL_WINDOW_USAGE")) {
    diffs.push({
      file,
      target: "variables globales",
      risk: "LOW",
      before:
`window.someModule = {};`,
      after:
`window.Gestia = window.Gestia || {};
Gestia.someModule = {};`
    });
  }

  if (flags.includes("LARGE_FILE")) {
    diffs.push({
      file,
      target: "bootstrap principal",
      risk: "MEDIUM",
      before:
`initUI();
initAuth();
initData();
initEvents();`,
      after:
`import "./ui.module.js";
import "./auth.module.js";
import "./data.module.js";
import "./events.module.js";`
    });
  }

  if (flags.includes("MIXED_UI_AUTH_DB")) {
    diffs.push({
      file,
      target: "bloque mixto",
      risk: "MEDIUM",
      before:
`login();
renderUI();
saveFirestore();`,
      after:
`authEngine.login();
uiEngine.render();
dbEngine.save();`
    });
  }

  return {
    ok: true,
    file,
    total: diffs.length,
    diffs
  };
}

