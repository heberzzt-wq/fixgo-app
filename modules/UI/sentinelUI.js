/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - UI SENTINEL V1.2 (AUTHORITY INTERFACE) - REFACTORED
 * ======================================================================================
 * Objetivo: Renderizar el diagnóstico del Sentinel con seguridad y trazabilidad.
 * Fixes: Scoped queries, XSS protection, concurrency control, and decision logging.
 * ======================================================================================
 */

/**
 * Helper para prevenir XSS en el renderizado de JSON o strings dinámicos.
 * Garantiza que el ADN inyectado no contenga scripts maliciosos.
 */
function escaparHTML(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

/**
 * Renderiza la tarjeta de intervención en el chat de la terminal.
 * @param {Object} diagnostico - El objeto retornado por el SelfRepairSentinel.
 * @param {Function} onApprove - Callback si se autoriza (pasa el ADN corregido).
 * @param {Function} onReject - Callback si se aborta (pasa el diagnóstico para log).
 */
export function mostrarPropuestaCorreccion(diagnostico, onApprove, onReject) {
    const chatContainer = document.getElementById('gestia-output'); 
    
    // 🔍 RASTREADOR DE SEGURIDAD
    console.warn("🔍 Buscando contenedor 'gestia-output'...", chatContainer);

    if (!chatContainer) {
        console.error("❌ ERROR CRÍTICO: No se encontró el contenedor 'gestia-output' en el DOM.");
        return;
    }

    console.log("✅ Contenedor encontrado. Procediendo a inyectar tarjeta...");

    // ... (el resto de tu código sigue igual)

    // 🔴 4. CONTROL DE MÚLTIPLES INTERVENCIONES
    // Si ya hay una tarjeta activa, la removemos para evitar saturación y errores de estado.
    const existing = document.querySelector('.sentinel-active');
    if (existing) existing.remove();

    const card = document.createElement('div');
    card.classList.add('sentinel-active'); // Marcamos la instancia actual

    // 🟡 5. MEJORA UX - Estado visual según criticidad
    const borderColor = diagnostico.nivelCriticidad === "CRITICO"
        ? "border-red-500"
        : "border-amber-500";

    const accentColor = diagnostico.nivelCriticidad === "CRITICO" 
        ? "text-red-500" 
        : "text-amber-500";

    const dotColor = diagnostico.nivelCriticidad === "CRITICO" 
        ? "bg-red-500" 
        : "bg-amber-500";

    card.className = `flex flex-col my-4 p-5 bg-slate-900 border-l-4 ${borderColor} rounded-r-xl shadow-2xl animate-in fade-in slide-in-from-left-4 duration-300`;

    // 1. Cabecera del Sentinel
    const header = `
        <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
                <span class="${accentColor}">🧠</span>
                <h3 class="${accentColor} font-black text-sm tracking-widest uppercase">Self-Repair Diagnostic V1.2</h3>
            </div>
            <span class="text-[10px] text-slate-500 font-mono">${diagnostico.timestamp}</span>
        </div>
    `;

    // 2. Mapeo de Anomalías
    const erroresHTML = diagnostico.reporte.map(err => `
        <div class="mb-3 pl-3 border-l border-slate-700">
            <div class="text-xs font-bold text-slate-100 uppercase flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
                ${err.codigo}
            </div>
            <p class="text-xs text-slate-400 mt-1">${err.descripcion}</p>
            <p class="text-xs text-emerald-400 mt-1 font-mono">✔ Propuesta: ${err.solucion}</p>
        </div>
    `).join("");

    // 🔴 2. FALTA DE ESCAPE -> RIESGO XSS INTERNO
    const safeJSON = escaparHTML(JSON.stringify(diagnostico.payloadCorregido, null, 2));

    // 3. Preview del ADN Corregido
    const previewADN = `
        <details class="mt-2 group">
            <summary class="cursor-pointer text-[10px] text-blue-400 hover:text-blue-300 font-bold uppercase tracking-tighter transition-colors">
                Ver ADN Corregido (JSON)
            </summary>
            <div class="mt-2 bg-black/50 p-3 rounded-lg overflow-x-auto border border-slate-800">
                <pre class="text-[10px] text-blue-200 leading-tight font-mono">${safeJSON}</pre>
            </div>
        </details>
    `;

    // 🔴 1. COLISIÓN DE IDs EN BOTONES
    // Cambiamos IDs por data-actions para usar queries locales a la tarjeta.
    const footer = `
        <div class="flex gap-3 mt-5">
            <button data-action="approve" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black py-2 rounded uppercase transition-all transform active:scale-95 shadow-lg shadow-emerald-900/20">
                Autorizar Reparación
            </button>
            <button data-action="reject" class="flex-1 bg-slate-800 hover:bg-red-900/40 text-slate-400 hover:text-white text-[11px] font-black py-2 rounded uppercase transition-all border border-slate-700">
                Abortar
            </button>
        </div>
    `;

    card.innerHTML = header + erroresHTML + previewADN + footer;
    chatContainer.appendChild(card);
    
    card.scrollIntoView({ behavior: 'smooth', block: 'end' });

    // Referencias directas dentro del scope de la tarjeta
    const approveBtn = card.querySelector('[data-action="approve"]');
    const rejectBtn = card.querySelector('[data-action="reject"]');

    // Event Listeners
    approveBtn.onclick = () => {
        // 🟡 6. BLOQUEO DE DOBLE CLICK
        approveBtn.disabled = true;
        rejectBtn.disabled = true;

        // 🟡 7. LOG DE DECISIÓN
        console.log("🧠 [SENTINEL_DECISION]: APPROVED", diagnostico);

        card.innerHTML = `
            <div class="flex items-center gap-3 p-2">
                <div class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
                <span class="text-xs font-bold text-emerald-500 uppercase tracking-widest">
                    ADN Autorizado. Inyectando en Búnker...
                </span>
            </div>
        `;
        
        setTimeout(() => card.remove(), 1500); 
        onApprove(diagnostico.payloadCorregido);
    };

    rejectBtn.onclick = () => {
        // 🟡 7. LOG DE DECISIÓN (Warning para auditoría)
        console.warn("🧠 [SENTINEL_DECISION]: REJECTED", diagnostico);
        
        card.remove();
        
        // 🔴 3. onReject AHORA RECIBE CONTEXTO
        onReject(diagnostico);
    };
}