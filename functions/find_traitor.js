try {
    console.log("⏳ Intentando cargar index.js...");
    const mod = require('./index.js');
    console.log("✅ CARGA EXITOSA.");
    console.log("📦 Funciones detectadas:", Object.keys(mod));
} catch (e) {
    console.error("❌ ERROR CRÍTICO EN CARGA:", e.message);
    console.error(e.stack);
}