/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - MÓDULO B2B (FACILITY MANAGEMENT)
 * ======================================================================================
 * Archivo: modulo-b2b.js
 * Descripción: Motor independiente para selección de ubicaciones por piso y área.
 * ======================================================================================
 */

const DICCIONARIO_B2B = {
    residencial: {
        niveles: ["PB", "Piso 1", "Piso 2", "Piso 3", "Piso 4", "Piso 5", "Penthouse", "Azotea", "Sótano"],
        areas: ["Lobby", "Pasillo Común", "Elevador", "Alberca", "Gimnasio", "Cuarto de Máquinas", "Estacionamiento", "Departamento Privado"]
    },
    oficinas: {
        niveles: ["PB", "Piso 1", "Piso 2", "Piso 3", "Piso 4", "Mezzanine", "Azotea", "Sótano"],
        areas: ["Recepción", "Sala de Juntas", "Site / Data Center", "Comedor", "Sanitarios", "Cubículos", "Estacionamiento"]
    },
    hospital: {
        niveles: ["Urgencias (PB)", "Piso 1 (Hospitalización)", "Piso 2 (Cirugía)", "Piso 3 (Maternidad)", "Azotea"],
        areas: ["Quirófano", "Central de Enfermeras", "Consultorio", "Sala de Espera", "Cuarto de Máquinas", "Planta de Emergencia", "Sanitarios"]
    },
    comercial: {
        niveles: ["Nivel Calle", "Nivel 1", "Nivel 2", "Sótano 1", "Sótano 2"],
        areas: ["Pasillo Central", "Baños Públicos", "Food Court", "Andén de Carga", "Local Específico", "Escaleras Eléctricas"]
    }
};

// 1. INICIALIZAR LOS LISTENERS DE LA UI
export function iniciarSelectorB2B() {
    console.log("🏢 Iniciando Módulo B2B (Facility Management)...");

    const selectTipo = document.getElementById("inmuebleTipoB2B");
    const selectNivel = document.getElementById("inmuebleNivelB2B");
    const selectArea = document.getElementById("inmuebleAreaB2B");
    const contenedorNivelArea = document.getElementById("contenedorNivelAreaB2B");
    const contenedorDetalle = document.getElementById("contenedorDetalleB2B");

    if (!selectTipo) return; // Salir si la UI no está en la pantalla actual

    selectTipo.addEventListener("change", (e) => {
        const tipo = e.target.value;
        
        if (!tipo) {
            contenedorNivelArea.classList.add("hidden");
            contenedorDetalle.classList.add("hidden");
            return;
        }

        // Llenar Niveles dinámicamente
        selectNivel.innerHTML = '<option value="">Piso...</option>';
        DICCIONARIO_B2B[tipo].niveles.forEach(nivel => {
            selectNivel.innerHTML += `<option value="${nivel}">${nivel}</option>`;
        });

        // Llenar Áreas dinámicamente
        selectArea.innerHTML = '<option value="">Área...</option>';
        DICCIONARIO_B2B[tipo].areas.forEach(area => {
            selectArea.innerHTML += `<option value="${area}">${area}</option>`;
        });

        // Mostrar los selectores
        contenedorNivelArea.classList.remove("hidden");
        contenedorNivelArea.classList.add("grid");
        contenedorDetalle.classList.remove("hidden");
    });
}

// 2. EXPORTAR LOS DATOS PARA FIREBASE
export function obtenerMetadatosB2B() {
    return {
        tipo_inmueble: document.getElementById("inmuebleTipoB2B")?.value || "general",
        piso_nivel: document.getElementById("inmuebleNivelB2B")?.value || "N/A",
        area_especifica: document.getElementById("inmuebleAreaB2B")?.value || "N/A",
        detalle_ubicacion: document.getElementById("inmuebleDetalleB2B")?.value || ""
    };
}
