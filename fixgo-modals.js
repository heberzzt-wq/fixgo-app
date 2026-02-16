/**
 * FIXGO 2026 - DICCIONARIO DE PLANTILLAS HTML (UI TEMPLATES)
 * Archivo: fixgo-modals.js
 * Versión: 1.0.0
 */

export const MODAL_TEMPLATES = {
    // Plantilla para el Cotizador Pro (Línea 655 de app-panel)
    COTIZACION: (id) => `
        <div id="modalCot" class="fixed inset-0 bg-black/95 z-[60] flex flex-col p-4">
            <div class="bg-zinc-900 w-full max-w-lg mx-auto rounded-3xl p-6 border border-zinc-700">
                <h3 class="text-white font-black text-xl mb-4">COTIZADOR PRO (ALAMO)</h3>
                <div class="flex-1 overflow-y-auto mb-4 bg-black/50 p-2" id="listaPartidas"></div>
                <div class="bg-zinc-800 p-3 rounded-xl mb-4 space-y-2">
                    <input id="inCant" type="number" placeholder="Cant." class="w-full bg-black text-white p-2 rounded">
                    <input id="inDesc" type="text" placeholder="Descripción" class="w-full bg-black text-white p-2 rounded">
                    <input id="inPrecio" type="number" placeholder="Precio Unitario" class="w-full bg-black text-white p-2 rounded">
                    <button id="btnAddItem" class="w-full bg-emerald-600 text-white py-2 rounded font-bold">AGREGAR ITEM</button>
                </div>
                <button id="btnEnviarCot" class="w-full bg-blue-600 text-white font-bold py-4 rounded-xl">ENVIAR AL CLIENTE</button>
            </div>
        </div>`,

    // Plantilla para Reporte de Evidencia (Línea 695 de app-panel)
    EVIDENCIA: `
        <div id="modalEvidencia" class="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div class="bg-zinc-900 w-full max-w-md rounded-3xl p-6 border border-zinc-700 shadow-2xl">
                <h3 class="text-white font-black text-xl mb-4 text-center">REPORTE FINAL OBLIGATORIO</h3>
                <p class="text-gray-400 text-xs mb-6 text-center">Para liberar el pago, sube la evidencia fotográfica.</p>
                <div class="space-y-4">
                    <div class="bg-black p-4 rounded-xl border border-zinc-800 text-center">
                        <label class="block text-xs font-bold text-emerald-500 mb-2 uppercase">FOTO DEL ANTES</label>
                        <input type="file" id="fileAntes" accept="image/*" class="text-xs text-white">
                    </div>
                    <div class="bg-black p-4 rounded-xl border border-zinc-800 text-center">
                        <label class="block text-xs font-bold text-emerald-500 mb-2 uppercase">FOTO DEL DESPUÉS</label>
                        <input type="file" id="fileDespues" accept="image/*" class="text-xs text-white">
                    </div>
                </div>
                <div class="flex gap-3 mt-8">
                    <button onclick="document.getElementById('modalEvidencia').remove()" class="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-bold text-sm">CANCELAR</button>
                    <button id="btnSubirEvidencia" class="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black py-3 rounded-xl font-black text-sm transition-colors">ENVIAR AL BRIDGE</button>
                </div>
            </div>
        </div>`
};
