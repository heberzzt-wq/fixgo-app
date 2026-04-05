/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - UI SENTINEL V7 (NIVEL LUNAR - AUTHORITY INTERFACE)
 * ======================================================================================
 * Archivo: sentinelUI.js
 * Objetivo: Interfaz de decisión humana para el Motor de Autocuración V7.
 * Lógica: Detección B2B/B2C -> Propuesta de Sellado -> Autorización de Heber.
 * --------------------------------------------------------------------------------------
 * ⚠️ REGLA DE ORO: CÓDIGO ÍNTEGRO. SIN CORTES. 
 * ======================================================================================
 */

/**
 * 💉 PROTECCIÓN ATÓMICA XSS
 * Asegura que el ADN propuesto por la IA no ejecute scripts en la terminal.
 */
function escaparHTML(str) {
    if (!str) return "";
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * 🧠 RENDERIZADOR DE DECISIÓN SOBERANA V7
 * @param {Object} diagnostico - El objeto generado por SelfRepairSentinel V7.
 * @param {Function} onApprove - Callback para inyectar el ADN en el Búnker.
 * @param {Function} onReject - Callback para abortar y loguear el fallo.
 */
export function mostrarPropuestaCorreccionV7(diagnostico, onApprove, onReject) {
    const chatContainer = document.getElementById('gestia-output'); 

    if (!chatContainer) {
        console.error("❌ CRÍTICO: El Sentinel no encuentra 'gestia-output'. Abortando renderizado.");
        return;
    }

    // 🛑 CONTROL DE COLISIÓN NEURAL
    // Removemos cualquier intervención previa del Sentinel para evitar estados inconsistentes.
    const sentinelPrevio = document.querySelector('.sentinel-v7-active');
    if (sentinelPrevio) {
        sentinelPrevio.classList.add('opacity-50', 'pointer-events-none');
        sentinelPrevio.classList.remove('sentinel-v7-active');
    }

    const card = document.createElement('div');
    card.classList.add('sentinel-v7-active');

    // 🎨 CONFIGURACIÓN DE ESTILOS LUNARES SEGÚN CRITICIDAD
    const esCritico = diagnostico.nivelCriticidad === "CRITICO";
    const theme = {
        border: esCritico ? "border-red-500 shadow-red-900/20" : "border-cyan-500 shadow-cyan-900/20",
        text: esCritico ? "text-red-400" : "text-cyan-400",
        bgIcon: esCritico ? "bg-red-500/10" : "bg-cyan-500/10",
        btn: esCritico ? "bg-red-600 hover:bg-red-500" : "bg-emerald-600 hover:bg-emerald-500"
    };

    // 🛡️ FIX APLICADO AQUÍ: Se agregó 'shrink-0' para evitar que Flexbox aplaste la tarjeta
    card.className = `flex flex-col shrink-0 w-full my-6 p-6 bg-[#0a0f18] border-l-4 ${theme.border} rounded-r-2xl shadow-2xl animate-in zoom-in-95 duration-500 relative overflow-hidden`;

    // Decoración de fondo Nivel Lunar
    const bgDecoration = `
        <div class="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <i class="fas fa-microchip text-6xl text-white"></i>
        </div>
    `;

    // 1. CABECERA DE AUTORIDAD (HEBER MENDOZA CEO & ARCHITECT)
    const header = `
        <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
                <div class="p-2 ${theme.bgIcon} rounded-lg">
                    <i class="fas fa-brain ${theme.text} animate-pulse"></i>
                </div>
                <div>
                    <h3 class="text-white font-black text-xs tracking-[0.2em] uppercase">Sentinel V7 Core</h3>
                    <p class="${theme.text} text-[9px] font-bold tracking-widest uppercase">Nivel Lunar - Autocuración Activa</p>
                </div>
            </div>
            <div class="text-right">
                <span class="text-[9px] text-slate-500 font-mono block">${diagnostico.timestamp}</span>
                <span class="bg-slate-800 text-slate-400 text-[8px] px-2 py-0.5 rounded font-black mt-1 inline-block uppercase">Sincronización B2B/B2C</span>
            </div>
        </div>
    `;

    // 2. MOTOR DE REGLAS - RENDERIZADO DE ANOMALÍAS (Células Jonathan / Jorge / Split-Billing)
    const reglasHTML = diagnostico.reporte.map(err => {
        // Detectamos si es una regla de negocio específica para darle estilo diferenciado
        const esCélulaNegocio = ["FRACTURA_ID", "TENANT_DESALINEADO", "B2B_OVERRIDE_ERROR", "CASETA_PLACA_FAIL"].includes(err.codigo);
        const iconRule = esCélulaNegocio ? 'fa-shield-virus' : 'fa-exclamation-triangle';
        const colorRule = esCélulaNegocio ? 'text-amber-400' : theme.text;

        return `
            <div class="group mb-4 p-3 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-all">
                <div class="flex items-center gap-2 mb-2">
                    <i class="fas ${iconRule} ${colorRule} text-[10px]"></i>
                    <span class="text-[10px] font-black text-slate-200 tracking-wider uppercase">${err.codigo}</span>
                    <span class="ml-auto text-[8px] text-slate-500 font-mono">${err.archivo_origen || 'core'}</span>
                </div>
                <p class="text-[11px] text-slate-400 leading-relaxed mb-2">${err.descripcion}</p>
                <div class="flex items-start gap-2 bg-black/40 p-2 rounded-lg border border-emerald-500/20">
                    <i class="fas fa-magic text-emerald-400 text-[9px] mt-1"></i>
                    <p class="text-[10px] text-emerald-400 font-mono font-medium leading-tight">
                        <span class="font-black text-emerald-200">CURA:</span> ${err.solucion}
                    </p>
                </div>
            </div>
        `;
    }).join("");

    // 3. PREVIEW DEL ADN (JSON) - BLINDAJE XSS
    const safeJSON = escaparHTML(JSON.stringify(diagnostico.payloadCorregido, null, 2));
    const previewADN = `
        <div class="mt-2">
            <details class="group">
                <summary class="flex items-center gap-2 cursor-pointer text-[10px] text-blue-400 hover:text-blue-300 font-black uppercase tracking-widest transition-all">
                    <i class="fas fa-code transition-transform group-open:rotate-90"></i>
                    Inspeccionar ADN Corregido
                </summary>
                <div class="mt-3 relative">
                    <div class="absolute top-2 right-2 bg-blue-500/10 text-blue-400 text-[8px] px-2 py-1 rounded font-mono uppercase">Verified Payload</div>
                    <pre class="bg-black p-4 rounded-xl border border-slate-800 text-[10px] text-blue-200 leading-relaxed font-mono max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">${safeJSON}</pre>
                </div>
            </details>
        </div>
    `;

    // 4. FOOTER DE ACCIÓN SOBERANA (AUTORIZACIÓN DE HEBER)
    const footer = `
        <div class="flex gap-4 mt-8 pt-6 border-t border-white/5">
            <button data-action="reject" class="flex-1 px-4 py-3 bg-slate-800 hover:bg-red-900/30 text-slate-400 hover:text-red-400 text-[10px] font-black rounded-xl uppercase tracking-widest transition-all border border-white/5 flex items-center justify-center gap-2">
                <i class="fas fa-times-circle"></i> Abortar Misión
            </button>
            <button data-action="approve" class="flex-[2] px-4 py-3 ${theme.btn} text-white text-[10px] font-black rounded-xl uppercase tracking-[0.15em] transition-all transform active:scale-95 shadow-xl flex items-center justify-center gap-2">
                <i class="fas fa-fingerprint"></i> Autorizar Inyección ADN
            </button>
        </div>
        <p class="text-center text-[8px] text-slate-600 mt-4 uppercase tracking-[0.2em] font-bold">Heber Mendoza (CEO & Lead Architect) Authorization Required</p>
    `;

    card.innerHTML = bgDecoration + header + reglasHTML + previewADN + footer;
    chatContainer.appendChild(card);
    
    // Scroll suave a la tarjeta de intervención
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // SELECTORES DE ACCIÓN
    const approveBtn = card.querySelector('[data-action="approve"]');
    const rejectBtn = card.querySelector('[data-action="reject"]');

    // MÓDULO DE APROBACIÓN (SELLADO FINAL)
    approveBtn.onclick = () => {
        approveBtn.disabled = true;
        rejectBtn.disabled = true;

        console.log("🧬 [SENTINEL V7]: HEBER AUTORIZÓ LA INYECCIÓN.", diagnostico);

        card.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 animate-pulse">
                <div class="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4 border border-emerald-500/40">
                    <i class="fas fa-check text-emerald-500 text-xl"></i>
                </div>
                <h4 class="text-emerald-500 font-black text-xs uppercase tracking-[0.3em]">ADN Sellado en el Búnker</h4>
                <p class="text-slate-500 text-[9px] mt-2 font-mono uppercase">Ejecutando despliegue de autocuración...</p>
            </div>
        `;
        
        // Efecto visual de desintegración tras éxito
        setTimeout(() => {
            card.classList.add('opacity-0', 'scale-95');
            setTimeout(() => card.remove(), 500);
        }, 2000);

        // Disparamos la inyección real del ADN corregido
        onApprove(diagnostico.payloadCorregido);
    };

    // MÓDULO DE RECHAZO (AUDITORÍA DE FALLO)
    rejectBtn.onclick = () => {
        console.warn("⚠️ [SENTINEL V7]: HEBER ABORTÓ LA REPARACIÓN.", diagnostico);
        
        card.classList.add('opacity-0', 'translate-x-10');
        setTimeout(() => card.remove(), 500);
        
        // Pasamos el diagnóstico al reject para que el sistema aprenda por qué se rechazó
        onReject(diagnostico);
    };
}