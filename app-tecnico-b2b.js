/**
 * GESTIA PREMIUM - V5.20
 * MOTOR DE OPERACIONES B2B (Uxmal 39)
 * FEATURE: Historial Unificado + Logout Scope Fix + Sincronización Automática
 * Lead Architect: Heberto Mendoza
 */

// 1. IMPORTAR INSTANCIAS LOCALES
import { auth, db, storage, signOut } from "./firebase.js";
window.auth = auth; // 🔥 EXPOSICIÓN GLOBAL: Soluciona error "auth is not defined" en HTML

// 2. IMPORTAR FUNCIONES DESDE LA LIBRERÍA (CDN)
import {
    doc,
    getDoc,
    getDocs,
    updateDoc,
    serverTimestamp,
    collection,
    query,
    where,
    onSnapshot,
    addDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// ESTADO GLOBAL
let ordenId = new URLSearchParams(window.location.search).get("id");
let canvas, ctx, isDrawing = false;
let MaterialesTemporales = [];
// REFACTOR 1: La ID del edificio ahora es dinámica y se carga desde el perfil.
let edificioIdGlobal = null;
let rutinaDiariaTareas = []; // To keep track of tasks for the day
let rutinaCompletadaIds = new Set(); // To track completed tasks
window.tareasDiariasGlobal = {}; // NUEVO: Diccionario para guardar datos completos de la OT

// --- MOTOR DE AUTENTICACIÓN ---
window.logout = () => {
    if (confirm("¿Estás seguro de que deseas cerrar tu sesión de técnico?")) {
        signOut(auth).then(() => {
            window.location.href = "login.html";
        }).catch((error) => {
            console.error("Error al cerrar sesión:", error);
        });
    }
};
// --- MOTOR DE NAVEGACIÓN (BOTTOM TABS) ---
window.cambiarSeccion = (seccionDestino) => {
    const secciones = ['seccion-tareas', 'seccion-historial', 'seccion-perfil'];
    
    secciones.forEach(seccion => {
        const elemento = document.getElementById(seccion);
        if (elemento) {
            if (seccion === seccionDestino) {
                elemento.classList.remove('hidden');
            } else {
                elemento.classList.add('hidden');
            }
        }
    });

    // 🔥 INYECCIÓN: Si vamos al historial, cargamos la data unificada.
    if (seccionDestino === 'seccion-historial') {
        cargarHistorialUnificado();
    }
};

// --- MOTOR UI: BOTTOM SHEET (HOJA DE REPORTE OT) ---
function inicializarBottomSheet() {
    if (document.getElementById('ot-bottom-sheet')) return;
    
    const sheet = document.createElement('div');
    sheet.id = 'ot-bottom-sheet';
    // Comienza oculto
    sheet.className = 'fixed inset-0 z-[100] flex flex-col justify-end hidden';
    sheet.innerHTML = `
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onclick="cerrarHojaReporte()"></div>
        
        <div id="ot-sheet-content" class="relative bg-zinc-950 border-t border-zinc-800 rounded-t-3xl p-6 transform translate-y-full transition-transform duration-300 w-full max-w-md mx-auto shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
            
            <div class="w-12 h-1.5 bg-zinc-700 rounded-full mx-auto mb-6"></div>
            
            <div class="flex justify-between items-start mb-4">
                <div class="pr-4">
                    <p id="ot-id" class="text-zinc-500 text-[10px] font-mono mb-1 tracking-widest">#OT-0000</p>
                    <h2 id="ot-equipo" class="text-2xl font-black text-white italic leading-tight uppercase">EQUIPO</h2>
                    <p id="ot-ubicacion" class="text-xs text-emerald-500 font-bold mt-2"><i class="fas fa-map-marker-alt"></i> UBICACIÓN</p>
                </div>
                <span id="ot-prioridad" class="text-[9px] font-black px-3 py-1.5 rounded-md uppercase border tracking-wider mt-1">MEDIA</span>
            </div>

            <hr class="border-zinc-800/80 my-5">

            <div class="space-y-5">
                <div>
                    <p class="text-[10px] text-zinc-500 uppercase font-bold mb-1 tracking-wider">Falla / Acción a Realizar</p>
                    <p id="ot-descripcion" class="text-sm text-zinc-200 leading-relaxed">...</p>
                </div>
                
                <div class="flex gap-4">
                    <div class="flex-1 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/50">
                        <p class="text-[9px] text-zinc-500 uppercase font-bold mb-1"><i class="far fa-calendar-alt"></i> Fecha Prog.</p>
                        <p id="ot-fecha" class="text-xs text-zinc-300 font-medium">...</p>
                    </div>
                    <div class="flex-1 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/50">
                        <p class="text-[9px] text-zinc-500 uppercase font-bold mb-1"><i class="far fa-user"></i> Reportó</p>
                        <p id="ot-reporta" class="text-xs text-zinc-300 font-medium">Administración</p>
                    </div>
                </div>

                <div class="bg-zinc-900 p-4 rounded-xl border border-zinc-700/50 relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-bl-[100px] blur-xl"></div>
                    <p class="text-[10px] text-emerald-500 uppercase font-bold mb-2 tracking-wider"><i class="fas fa-toolbox"></i> Herramientas / Notas Mantenimiento</p>
                    <p id="ot-herramientas" class="text-xs text-zinc-300 leading-relaxed italic">Sin herramientas especiales requeridas. Procedimiento estándar de mantenimiento.</p>
                </div>
            </div>

            <div class="mt-8 flex flex-col gap-3">
                <button id="btn-iniciar-ot" class="w-full bg-emerald-500 text-black font-black py-4 rounded-2xl text-[13px] tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.3)] active:scale-95 transition-all">
                    INICIAR SERVICIO
                </button>
                <button onclick="cerrarHojaReporte()" class="w-full bg-transparent text-zinc-500 hover:text-white font-bold py-3 rounded-2xl text-xs tracking-wider transition-colors">
                    CERRAR REPORTE
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(sheet);
}

window.abrirHojaReporte = (id) => {
    const tarea = window.tareasDiariasGlobal[id];
    if(!tarea) return;

    // 1. Llenar los datos de la UI
    document.getElementById('ot-id').innerText = `#OT-${id.substring(0,6).toUpperCase()}`;
    document.getElementById('ot-equipo').innerText = tarea.equipo || "Mantenimiento General";
    document.getElementById('ot-ubicacion').innerHTML = `<i class="fas fa-map-marker-alt"></i> ${tarea.ubicacion_especifica || tarea.direccion || "General"}`;
    document.getElementById('ot-descripcion').innerText = tarea.descripcion || "Sin descripción detallada de falla o acción.";
    document.getElementById('ot-fecha').innerText = tarea.fecha_programada || new Date().toLocaleDateString();
    document.getElementById('ot-reporta').innerText = tarea.creado_por_nombre || "Admin B2B";
    
    // Si tienes un campo de herramientas en tu DB, lo lee, si no, pone un fallback
    document.getElementById('ot-herramientas').innerText = tarea.herramientas_sugeridas || tarea.notas_especiales || "Revisar el manual del equipo antes de intervenir. Sin herramientas especiales sugeridas por administración.";

    // 2. Configurar la etiqueta de prioridad
    const prioBadge = document.getElementById('ot-prioridad');
    const prio = (tarea.prioridad || "media").toLowerCase();
    prioBadge.innerText = prio;
    prioBadge.className = 'text-[9px] font-black px-3 py-1.5 rounded-md uppercase border tracking-wider mt-1 ' + 
        (prio === 'alta' || prio === 'critica' ? 'bg-red-500/10 text-red-500 border-red-500/30' : 
         prio === 'baja' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 
         'bg-yellow-500/10 text-yellow-500 border-yellow-500/30');

    // 3. Conectar el botón de Iniciar
    document.getElementById('btn-iniciar-ot').onclick = () => {
        cerrarHojaReporte();
        seleccionarTarea(id); // Dispara el candado y pasa al flujo
    };

    // 4. Mostrar y Animar el Bottom Sheet
    const sheet = document.getElementById('ot-bottom-sheet');
    const content = document.getElementById('ot-sheet-content');
    sheet.classList.remove('hidden');
    
    // Pequeño timeout para que el CSS registre el display:block antes de animar el slide-up
    setTimeout(() => {
        content.classList.remove('translate-y-full');
    }, 10);
};

window.cerrarHojaReporte = () => {
    const sheet = document.getElementById('ot-bottom-sheet');
    const content = document.getElementById('ot-sheet-content');
    if(!sheet || !content) return;

    // 1. Animar slide-down
    content.classList.add('translate-y-full');
    
    // 2. Ocultar contenedor después de la transición
    setTimeout(() => {
        sheet.classList.add('hidden');
    }, 300);
};

// --- UTILIDADES DE UI ---
function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-24 left-1/2 -translate-x-1/2 p-3 rounded-lg text-white text-xs font-bold shadow-lg z-50 transition-opacity duration-300 ${isError ? 'bg-red-600' : 'bg-emerald-600'}`;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function setButtonLoading(button, isLoading, originalText = 'Acción') {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> PROCESANDO...`;
    } else {
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

// 🛡️ REGLA 2: EL CANDADO JONATHAN
async function validarPaseCaseta() {
    const user = auth.currentUser;
    if (!user) return false;
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const data = userDoc.data();
    
    if (!data.placas && !data.logistica?.placas) {
        alert("🚨 BLOQUEO DE SEGURIDAD: No tienes placas registradas. Jonathan, no puedes iniciar servicios sin datos de vehículo para el pase de caseta.");
        return false;
    }
    return true;
}

// --- INICIALIZACIÓN ---
auth.onAuthStateChanged(async (user) => {
    if(!user) return window.location.href = "login.html";

    // Inyectar el HTML de la Orden de Trabajo
    inicializarBottomSheet();

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (userDoc.exists()) {
            const data = userDoc.data();

            if (data.tipo_cuenta === "B2B") {
                console.log("🛠️ Perfil B2B detectado. Despejando panel visual...");
                
                const elementosOcultar = [
                    "wallet", "billetera", "seccion-wallet", "contenedor-wallet", "caja-wallet",
                    "documentos", "seccion-documentos", "contenedor-documentos", "documentos_requeridos"
                ];
                
                elementosOcultar.forEach(id => {
                    const elemento = document.getElementById(id);
                    if (elemento) {
                        elemento.classList.add("hidden");
                        elemento.style.display = "none";
                    }
                });
            }

            if (data.edificioId) {
                edificioIdGlobal = data.edificioId;
                console.log(`🏢 Técnico autenticado para el edificio: ${edificioIdGlobal}`);
            } else {
                document.body.innerHTML = `<div class="p-8 text-center text-red-500 text-lg font-black">ERROR DE ACCESO: Tu perfil no está asignado a ningún edificio. Contacta a tu administrador.</div>`;
                showToast("Error de perfil: No tienes un edificio B2B asignado.", true);
                return;
            }
        }
    } catch (error) {
        console.error("Error crítico al obtener perfil:", error);
        showToast("Error de conexión al verificar tu perfil. No se puede continuar.", true);
        return;
    }

    if(ordenId) {
        document.getElementById("listaTareasHoy").classList.add("hidden");
        document.getElementById("flujoTecnico").classList.remove("hidden");
    } else {
        cargarTareasProgramadas();
        cargarRutinaPreventiva();
    }
});

// --- MOTOR DE HISTORIAL UNIFICADO (OTs + RUTINAS) ---
async function cargarHistorialUnificado() {
    const contenedor = document.getElementById("lista-historial-unificada");
    if (!contenedor || !edificioIdGlobal) return;

    contenedor.innerHTML = `<div class="p-8 mt-4 text-center text-zinc-600 text-[10px] font-bold uppercase tracking-widest border border-dashed border-zinc-800 rounded-2xl animate-pulse">
        <i class="fas fa-sync fa-spin mb-2"></i> CARGANDO BITÁCORA COMPLETA...
    </div>`;

    try {
        // 1. Definir ambas consultas
        const qServicios = query(
            collection(db, "servicios_b2b"),
            where("edificioId", "==", edificioIdGlobal),
            where("status", "==", "finalizado"),
            orderBy("fecha_cierre", "desc"),
            limit(50)
        );

        const qRutinas = query(
            collection(db, "log_rutinas"),
            where("edificioId", "==", edificioIdGlobal),
            orderBy("timestamp", "desc"),
            limit(100)
        );

        // 2. Ejecutar consultas en paralelo con Promise.all()
        const [serviciosSnap, rutinasSnap] = await Promise.all([
            getDocs(qServicios),
            getDocs(qRutinas)
        ]);

        // 3. Mapear resultados a un formato común
        const historialServicios = serviciosSnap.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                fecha: data.fecha_cierre?.toDate() || new Date(0),
                tipo: 'OT',
                titulo: data.equipo || 'Servicio Correctivo',
                descripcion: data.observaciones_finales || data.diagnostico_inicial || 'Sin resumen.',
                status: 'Finalizado',
                color: 'border-blue-500/30 bg-blue-900/10'
            };
        });

        const rutinaDescMap = new Map(rutinaDiariaTareas.map(t => [t.id_tarea, t.descripcion]));
        const historialRutinas = rutinasSnap.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                fecha: data.timestamp?.toDate() || new Date(0),
                tipo: 'RUTINA',
                titulo: rutinaDescMap.get(data.tareaId) || 'Tarea de Rutina',
                descripcion: `Tarea de rutina completada. Estado: ${data.status}`,
                status: data.status === 'ok' ? 'OK' : 'Reportado',
                color: data.status === 'ok' ? 'border-emerald-500/30 bg-emerald-900/10' : 'border-red-500/30 bg-red-900/10'
            };
        });

        // 4. Combinar y ordenar
        const historialCompleto = [...historialServicios, ...historialRutinas];
        historialCompleto.sort((a, b) => b.fecha - a.fecha);

        // 5. Renderizar
        if (historialCompleto.length === 0) {
            contenedor.innerHTML = `<div class="p-8 mt-4 text-center text-zinc-700 text-xs italic">No hay registros en tu historial.</div>`;
            return;
        }

        contenedor.innerHTML = historialCompleto.map(item => `
            <div class="p-4 rounded-2xl border ${item.color} mb-3">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <p class="text-xs font-black uppercase ${item.tipo === 'OT' ? 'text-blue-400' : 'text-emerald-400'}">
                            <i class="fas ${item.tipo === 'OT' ? 'fa-tools' : 'fa-clipboard-check'}"></i> ${item.tipo}: ${item.titulo}
                        </p>
                        <p class="text-[10px] text-zinc-500 font-bold">${item.fecha.toLocaleString()}</p>
                    </div>
                    <span class="text-[9px] font-bold bg-black/50 px-2 py-1 rounded border border-zinc-700">${item.status}</span>
                </div>
                <p class="text-xs text-zinc-300 italic">"${item.descripcion}"</p>
            </div>
        `).join('');

    } catch (error) {
        console.error("Error cargando historial unificado:", error);
        contenedor.innerHTML = `<div class="p-4 mt-4 text-red-500 text-center text-[10px] font-bold border border-red-500/20 rounded-xl bg-red-500/5">
            ERROR DE CONEXIÓN AL CARGAR LA BITÁCORA
        </div>`;
    }
}

// --- MOTOR DE SINCRONIZACIÓN AUTOMÁTICA (FALLBACK CLIENT-SIDE) ---
async function sincronizarRutinasMaestras() {
    if (!edificioIdGlobal) return;
    
    // 1. Candado: Verificar si ya existen tareas generadas HOY para evitar duplicados (incluso si están finalizadas)
    const inicioDia = new Date();
    inicioDia.setHours(0,0,0,0);
    
    // Buscamos cualquier tarea creada hoy para este edificio, sin importar el estado
    const qCheck = query(
        collection(db, "servicios_b2b"),
        where("edificioId", "==", edificioIdGlobal),
        where("fecha_creacion", ">=", inicioDia),
        where("origen", "==", "sistema_rutinas") // Tag para identificar auto-generadas
    );
    
    const checkSnap = await getDocs(qCheck);
    if (!checkSnap.empty) {
        console.log("🔄 Rutinas del día ya existen en BD (Activas o Finalizadas). No se requiere sincronización.");
        return;
    }

    console.log("⚙️ Sincronizando Plan Maestro de Rutinas (Cliente-Side Fallback)...");
    
    try {
        const rutinaRef = doc(db, "config_rutinas", edificioIdGlobal);
        const rutinaSnap = await getDoc(rutinaRef);
        
        if (!rutinaSnap.exists()) {
            console.log("⚠️ No se encontró configuración de rutinas para este edificio.");
            return;
        }
        
        const master = rutinaSnap.data();
        let tareasAInyectar = [];
        
        // Lógica de fechas (Diaria, Semanal, etc)
        const hoy = new Date();
        const diaSemana = hoy.getDay(); // 0 = Domingo, 1 = Lunes...
        const diaMes = hoy.getDate();
        const mes = hoy.getMonth();

        // 1. Rutinas Diarias
        if (master.Diaria && Array.isArray(master.Diaria)) {
            tareasAInyectar.push(...master.Diaria);
        }
        // 2. Semanales/Quincenales (Solo Lunes)
        if (diaSemana === 1 && master.Semanal_Quincenal && Array.isArray(master.Semanal_Quincenal)) {
            tareasAInyectar.push(...master.Semanal_Quincenal);
        }
        // 3. Mensuales (Día 1)
        if (diaMes === 1 && master.Mensual && Array.isArray(master.Mensual)) {
            tareasAInyectar.push(...master.Mensual);
        }
        // 4. Anuales (1ro Enero)
        if (diaMes === 1 && mes === 0 && master.Semestral_Anual && Array.isArray(master.Semestral_Anual)) {
            tareasAInyectar.push(...master.Semestral_Anual);
        }

        if (tareasAInyectar.length === 0) {
            console.log("ℹ️ No hay tareas programadas en el plan maestro para hoy.");
            return;
        }

        // Inyección Masiva (Promise.all para velocidad)
        const promesas = tareasAInyectar.map(tarea => {
            return addDoc(collection(db, "servicios_b2b"), {
                edificioId: edificioIdGlobal,
                descripcion: tarea.descripcion || "Mantenimiento General",
                equipo: tarea.equipo || "General",
                ubicacion_especifica: tarea.ubicacion || "Sin definir",
                prioridad: tarea.prioridad || "Media",
                herramientas_sugeridas: tarea.herramientas || "",
                notas_especiales: tarea.notas || "",
                status: "pendiente",
                estado: "pendiente", // Compatibilidad
                fecha_programada: hoy.toISOString().split('T')[0],
                fecha_creacion: serverTimestamp(),
                origen: "sistema_rutinas",
                tipo: "preventivo",
                creado_por_nombre: "Sistema Automático B2B"
            });
        });

        await Promise.all(promesas);
        console.log(`✅ Se inyectaron ${tareasAInyectar.length} tareas maestras exitosamente.`);
        showToast(`Plan Maestro Sincronizado: ${tareasAInyectar.length} tareas cargadas.`, false);

    } catch (e) {
        console.error("Error crítico sincronizando rutinas:", e);
        showToast("Error al sincronizar rutinas del día.", true);
    }
}

// --- CARGA DE DATOS ---
function cargarTareasProgramadas() {
    const contenedor = document.getElementById("contenedor-tareas-diarias");
    if (!contenedor || !edificioIdGlobal) return;

    const q = query(
        collection(db, "servicios_b2b"),
        where("edificioId", "==", edificioIdGlobal),
        where("status", "in", ["pendiente", "programado", "en_proceso"])
    );

    onSnapshot(q, (snapshot) => {
        contenedor.innerHTML = "";
        
        // Limpiamos la caché global de tareas en cada actualización
        window.tareasDiariasGlobal = {};

        if (snapshot.empty) {
            contenedor.innerHTML = `
            <div class="p-8 mt-4 text-center text-zinc-600 text-[10px] font-bold uppercase tracking-widest border border-dashed border-zinc-800 rounded-2xl animate-pulse">
                <i class="fas fa-sync fa-spin mb-2"></i> VERIFICANDO PLAN MAESTRO...
            </div>`;
            
            // 🔥 DISPARADOR AUTOMÁTICO: Si no hay tareas activas, intentamos sincronizar
            sincronizarRutinasMaestras();
            return;
        }

        snapshot.forEach((docSnap) => {
            const tarea = docSnap.data();
            const id = docSnap.id;
            
            // Guardamos la tarea en el diccionario global para usarla en el Bottom Sheet
            window.tareasDiariasGlobal[id] = tarea;

            const div = document.createElement("div");
            // Nuevo diseño de la tarjeta: ahora toda la tarjeta es clickeable
            div.className = "mb-3 p-4 glass-card rounded-2xl border border-zinc-800 flex justify-between items-center cursor-pointer hover:bg-zinc-900/50 transition-colors active:scale-95";
            div.onclick = () => abrirHojaReporte(id);

            div.innerHTML = `
                <div class="flex-1">
                    <h4 class="text-lg font-black italic text-white leading-tight uppercase">
                        ${tarea.equipo || "Mantenimiento General"}
                    </h4>
                    <p class="text-xs text-emerald-500 font-bold mb-1">
                        ${tarea.descripcion || "Revisión Técnica"}
                    </p>
                    <p class="text-[10px] text-zinc-500 uppercase font-medium">
                        <i class="fas fa-map-marker-alt"></i> ${tarea.ubicacion_especifica || tarea.direccion || "General"}
                    </p>
                </div>
                <div class="ml-3 flex flex-col items-center">
                    <div class="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 mb-1 border border-zinc-700">
                        <i class="fas fa-file-signature"></i>
                    </div>
                    <span class="text-[8px] text-zinc-500 font-bold uppercase">Ver OT</span>
                </div>
            `;

            contenedor.appendChild(div);
        });

    }, (error) => {
        console.error("Error en Snapshot:", error);
        contenedor.innerHTML =
            `<div class="p-4 mt-4 text-red-500 text-center text-[10px] font-bold border border-red-500/20 rounded-xl bg-red-500/5">
                ERROR DE CONEXIÓN CON LA BITÁCORA
            </div>`;
    });
}

window.seleccionarTarea = async (id) => {
    const tienePase = await validarPaseCaseta();
    if (!tienePase) return;

    ordenId = id;

    // Asegurarnos de que el modal esté cerrado por si acaso
    cerrarHojaReporte();

    document.getElementById("listaTareasHoy").classList.add("hidden");
    document.getElementById("flujoTecnico").classList.remove("hidden");
};

// --- MOTOR DE RUTINAS PREVENTIVAS ---
async function cargarRutinaPreventiva() {
    if (!edificioIdGlobal) return;

    const rutinaContainer = document.getElementById("rutinaPreventiva");
    const checklistContainer = document.getElementById("checklist-rutinas");
    if (!rutinaContainer || !checklistContainer) return;

    try {
        const rutinaRef = doc(db, "config_rutinas", edificioIdGlobal);
        const rutinaSnap = await getDoc(rutinaRef);

        if (!rutinaSnap.exists()) {
            rutinaContainer.classList.add("hidden");
            return;
        }
        rutinaContainer.classList.remove("hidden");

        const rutinaMaster = rutinaSnap.data();
        let tareasDelDia = [];

        const hoy = new Date();
        const diaSemana = hoy.getDay(); 
        const diaMes = hoy.getDate();

        if (rutinaMaster.Diaria) tareasDelDia.push(...rutinaMaster.Diaria);

        if (diaSemana === 1 && rutinaMaster.Semanal_Quincenal) {
            tareasDelDia.push(...rutinaMaster.Semanal_Quincenal);
        }

        if (diaMes === 1 && rutinaMaster.Mensual) {
            tareasDelDia.push(...rutinaMaster.Mensual);
        }
        
        if (diaMes === 1 && hoy.getMonth() === 0 && rutinaMaster.Semestral_Anual) {
            tareasDelDia.push(...rutinaMaster.Semestral_Anual);
        }

        rutinaDiariaTareas = tareasDelDia; 

        const fechaHoyStr = hoy.toISOString().split('T')[0];
        const qLogs = query(
            collection(db, "log_rutinas"),
            where("edificioId", "==", edificioIdGlobal),
            where("fechaCompletado", "==", fechaHoyStr)
        );
        const logSnapshot = await getDocs(qLogs);
        rutinaCompletadaIds = new Set(logSnapshot.docs.map(d => d.data().tareaId));

        renderizarChecklist();

    } catch (error) {
        console.error("Error cargando rutina preventiva:", error);
        checklistContainer.innerHTML = `<p class="text-red-500 text-xs">Error al cargar rutina.</p>`;
    }
}

function renderizarChecklist() {
    const checklistContainer = document.getElementById("checklist-rutinas");
    if (!checklistContainer) return;

    if (rutinaDiariaTareas.length === 0) {
        checklistContainer.innerHTML = `<p class="text-zinc-500 text-xs italic">No hay tareas de rutina programadas para hoy.</p>`;
        return;
    }

    checklistContainer.innerHTML = rutinaDiariaTareas.map(tarea => {
        const isCompleted = rutinaCompletadaIds.has(tarea.id_tarea);
        return `
            <div class="glass-card p-3 rounded-lg border ${isCompleted ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-zinc-800'} flex items-center justify-between gap-3 mb-2">
                <div class="flex-1">
                    <p class="text-xs font-bold ${isCompleted ? 'text-emerald-400 line-through' : 'text-white'}">${tarea.descripcion}</p>
                    <p class="text-[9px] text-zinc-500 uppercase">${tarea.sistema} - ${tarea.equipo}</p>
                </div>
                <div class="flex items-center gap-2">
                    ${!isCompleted ? `
                    <button onclick="window.reportarHallazgoEnRutina('${encodeURIComponent(JSON.stringify(tarea))}')" class="bg-red-600/20 text-red-400 text-[9px] font-bold px-2 py-2 rounded-lg border border-red-500/30 hover:bg-red-500 hover:text-white transition-all">
                        <i class="fas fa-exclamation-triangle"></i>
                    </button>
                    <button onclick="window.marcarRutinaOK('${tarea.id_tarea}', this)" class="bg-zinc-700 text-white text-[9px] font-bold px-3 py-2 rounded-lg border border-zinc-600 hover:bg-emerald-600 transition-all">
                        OK
                    </button>
                    ` : `
                    <span class="text-emerald-500 text-lg"><i class="fas fa-check-circle"></i></span>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

window.marcarRutinaOK = async (tareaId, button) => {
    if (rutinaCompletadaIds.has(tareaId)) return;

    setButtonLoading(button, true, 'OK');
    try {
        const fechaHoyStr = new Date().toISOString().split('T')[0];
        await addDoc(collection(db, "log_rutinas"), {
            edificioId: edificioIdGlobal,
            tecnicoId: auth.currentUser.uid,
            tecnicoNombre: auth.currentUser.displayName || "Técnico",
            tareaId: tareaId,
            fechaCompletado: fechaHoyStr,
            timestamp: serverTimestamp(),
            status: 'ok',
            novedad: false
        });

        rutinaCompletadaIds.add(tareaId);
        renderizarChecklist(); 
        showToast("Tarea de rutina completada.", false);

    } catch (error) {
        console.error("Error al marcar rutina:", error);
        showToast("Error al guardar. Intenta de nuevo.", true);
        setButtonLoading(button, false, 'OK');
    }
};

// --- PASO 1: DIAGNÓSTICO ---
window.enviarDiagnostico = async () => {
    const diag = document.getElementById("diagInput").value.trim();
    const file = document.getElementById("fileAntes").files[0];
    const btn = document.querySelector('#step1 button[onclick="enviarDiagnostico()"]');
    const originalText = btn.innerHTML;

    if(!diag || !file) return showToast("Falta diagnóstico o foto inicial.", true);

    setButtonLoading(btn, true);
    try {
        showToast("Subiendo diagnóstico...");
        const path = `evidencias/${ordenId}/antes_${Date.now()}.jpg`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const urlAntes = await getDownloadURL(storageRef);

        await updateDoc(doc(db, "servicios_b2b", ordenId), {
            diagnostico_inicial: diag,
            foto_antes: urlAntes,
            status: "en_proceso",
            fecha_diagnostico: serverTimestamp()
        });

        showToast("Diagnóstico subido con éxito.", false);
        document.getElementById("step1").classList.add("step-inactive");
        document.getElementById("step2").classList.remove("step-inactive");
    } catch (e) {
        showToast("Error al subir diagnóstico. Reintenta.", true);
    } finally {
        setButtonLoading(btn, false, originalText);
    }
};

// --- PASO 2: INSUMOS ---
window.agregarMaterial = () => {
    const nombre = document.getElementById("mat-nombre").value.trim();
    const cantidad = document.getElementById("mat-cantidad").value;

    if(!nombre || !cantidad) return;

    const item = { nombre, cantidad, id: Date.now() };
    MaterialesTemporales.push(item);
    renderizarMateriales();
    document.getElementById("mat-nombre").value = "";
    document.getElementById("mat-cantidad").value = "";
};

function renderizarMateriales() {
    const lista = document.getElementById("lista-materiales-acumulados");
    lista.innerHTML = MaterialesTemporales.map(m => `
        <div class="flex justify-between items-center bg-zinc-900 p-2 rounded-lg border border-white/5 text-[9px] mb-2">
            <span>${m.cantidad}x <b>${m.nombre}</b></span>
            <button onclick="removerMaterial(${m.id})" class="text-red-500"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
}

window.removerMaterial = (id) => {
    MaterialesTemporales = MaterialesTemporales.filter(m => m.id !== id);
    renderizarMateriales();
};

window.confirmarMateriales = async () => {
    const btn = document.querySelector('#step2 button[onclick="confirmarMateriales()"]');
    const originalText = btn.innerHTML;
    setButtonLoading(btn, true);

    try {
        showToast("Guardando insumos...");
        await updateDoc(doc(db, "servicios_b2b", ordenId), {
            materiales_utilizados: MaterialesTemporales
        });
        showToast("Insumos confirmados.", false);
        document.getElementById("step2").classList.add("step-inactive");
        document.getElementById("step3").classList.remove("step-inactive");
    } catch (e) { 
        showToast("Error al guardar materiales.", true);
    } finally {
        setButtonLoading(btn, false, originalText);
    }
};

// --- PASO 3: CIERRE ---
window.subirEvidenciaFinal = async () => {
    const file = document.getElementById("fileDespues").files[0];
    const obs = document.getElementById("obs-finales").value.trim();

    if(!file || !obs) return showToast("Falta la foto final o las notas de cierre.", true);

    const btn = document.getElementById("btnUploadDespues");
    const originalText = btn.innerHTML;
    setButtonLoading(btn, true);

    try {
        showToast("Subiendo evidencia final...");
        const path = `evidencias/${ordenId}/despues_${Date.now()}.jpg`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const urlDespues = await getDownloadURL(storageRef);

        await updateDoc(doc(db, "servicios_b2b", ordenId), {
            foto_despues: urlDespues,
            observaciones_finales: obs
        });

        showToast("Evidencia validada.", false);
        document.getElementById("step3").classList.add("step-inactive");
        document.getElementById("step4").classList.remove("step-inactive");
        initSignaturePad();
    } catch (e) { 
        showToast("Error al subir reporte final.", true);
    } finally {
        setButtonLoading(btn, false, originalText);
    }
};

// --- PASO 4: FIRMA ---
let hasFirmaDrawn = false; 

function initSignaturePad() {
    canvas = document.getElementById("signaturePad");
    ctx = canvas.getContext("2d", { willReadFrequently: true });
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width;
    canvas.height = r.height;

    const start = (e) => { isDrawing = true; ctx.beginPath(); const p = getP(e); ctx.moveTo(p.x, p.y); };
    const draw = (e) => { 
        if(!isDrawing) return; 
        hasFirmaDrawn = true; 
        const p = getP(e); 
        ctx.lineTo(p.x, p.y); 
        ctx.strokeStyle = "#10b981"; 
        ctx.lineWidth = 2; 
        ctx.stroke(); 
    };
    const stop = () => isDrawing = false;
    const getP = (e) => {
        const rect = canvas.getBoundingClientRect();
        const ex = e.touches ? e.touches[0].clientX : e.clientX;
        const ey = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: ex - rect.left, y: ey - rect.top };
    };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", draw);
    window.addEventListener("mouseup", stop);
    canvas.addEventListener("touchstart", start);
    canvas.addEventListener("touchmove", draw);
    canvas.addEventListener("touchend", stop);
}

window.clearSignature = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasFirmaDrawn = false; 
};

window.finalizarOrden = async () => {
    const btn = document.querySelector('#step4 button[onclick="finalizarOrden()"]');
    const originalText = btn.innerHTML;
    setButtonLoading(btn, true);

    try {
        if (!hasFirmaDrawn) {
            throw new Error("La firma de conformidad es obligatoria.");
        }

        const uid = auth.currentUser?.uid;
        if (!uid) throw new Error("Usuario no autenticado.");
        const userDoc = await getDoc(doc(db, "users", uid));
        if (!userDoc.exists()) throw new Error("Perfil de usuario no encontrado.");

        const nombreTecnico = userDoc.data().nombre || "Técnico";

        const firmaData = canvas.toDataURL("image/png");
        const storageRef = ref(storage, `firmas/${ordenId}.png`);
        const blob = await (await fetch(firmaData)).blob();
        await uploadBytes(storageRef, blob);
        const firmaUrl = await getDownloadURL(storageRef);

        await updateDoc(doc(db, "servicios_b2b", ordenId), {
            status: "finalizado",
            firma_conformidad: firmaUrl,
            fecha_cierre: serverTimestamp()
        });

        // INYECCIÓN A BITÁCORA
        await addDoc(collection(db, "bitacora_edificios"), {
            edificioId: edificioIdGlobal,
            servicioId: ordenId,
            fecha: serverTimestamp(),
            tecnico: nombreTecnico,
            tecnico_uid: uid,
            resumen: document.getElementById("obs-finales").value,
            materiales_utilizados: MaterialesTemporales 
        });

        showToast(`Bitácora de ${edificioIdGlobal.toUpperCase()} actualizada.`);
        window.location.reload();
    } catch (e) {
        console.error("Error al cerrar bitácora:", e);
        showToast(e.message || "Error al cerrar bitácora. Reintenta.", true);
    } finally {
        setButtonLoading(btn, false, originalText);
    }
};

window.previewImg = (input, divId) => {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById(divId).innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover rounded-xl">`;
        };
        reader.readAsDataURL(file);
    }
};

window.reportarHallazgoEnRutina = async (tareaString) => {
    const tarea = JSON.parse(decodeURIComponent(tareaString));
    if (!confirm(`¿Deseas reportar un hallazgo para la tarea "${tarea.descripcion}"?\n\nEsto creará una nueva orden de trabajo correctiva que deberás atender.`)) return;

    try {
        const newTicket = {
            edificioId: edificioIdGlobal,
            edificioNombre: "Uxmal 39", 
            ubicacion_especifica: tarea.ubicacion,
            descripcion: `HALLAZGO EN RUTINA: ${tarea.descripcion}`,
            prioridad: tarea.prioridad || 'media',
            tecnicoId: auth.currentUser.uid, 
            status: "en_proceso", 
            fecha_programada: new Date().toISOString().split('T')[0],
            equipo_nombre: tarea.equipo,
            tipo: "correctivo_de_rutina",
            fecha_creacion: serverTimestamp(),
            creado_por: auth.currentUser.uid,
            origen_rutina_id: tarea.id_tarea
        };

        const docRef = await addDoc(collection(db, "servicios_b2b"), newTicket);
        showToast("Orden correctiva creada. Completa el diagnóstico.", false);

        const fechaHoyStr = new Date().toISOString().split('T')[0];
        await addDoc(collection(db, "log_rutinas"), {
            edificioId: edificioIdGlobal,
            tecnicoId: auth.currentUser.uid,
            tecnicoNombre: auth.currentUser.displayName || "Técnico",
            tareaId: tarea.id_tarea,
            fechaCompletado: fechaHoyStr,
            timestamp: serverTimestamp(),
            status: 'reportado',
            novedada: true,
            servicio_b2b_id: docRef.id
        });

        window.location.href = `?id=${docRef.id}`;

    } catch (error) {
        console.error("Error reportando hallazgo:", error);
        showToast("Error al crear la orden correctiva.", true);
    }
};

window.finalizarRutinaDiaria = async () => {
    const totalTareas = rutinaDiariaTareas.length;
    const completadas = rutinaCompletadaIds.size;

    if (completadas < totalTareas) {
        alert(`Aún no has completado toda la rutina. Faltan ${totalTareas - completadas} tareas.`);
        return;
    }

    if (!confirm("¿Confirmas el cierre de la bitácora de rutina preventiva de hoy?")) return;

    const btn = document.getElementById('btnFinalizarRutina');
    setButtonLoading(btn, true, 'FINALIZAR...');

    try {
        await addDoc(collection(db, "bitacora_edificios"), {
            edificioId: edificioIdGlobal,
            servicioId: `RUTINA-${new Date().toISOString().split('T')[0]}`,
            fecha: serverTimestamp(),
            tecnico: auth.currentUser.displayName || "Técnico",
            tecnico_uid: auth.currentUser.uid,
            resumen: `Rutina Preventiva Diaria completada al 100% (${completadas}/${totalTareas}). Sin novedades reportadas directamente desde el checklist.`,
            tipo: "RUTINA_PREVENTIVA"
        });

        showToast("Bitácora de rutina cerrada con éxito.", false);
        btn.innerHTML = '<i class="fas fa-check-circle"></i> RUTINA CERRADA';
        btn.disabled = true;

    } catch (error) {
        console.error("Error al finalizar rutina:", error);
        showToast("Error al cerrar la bitácora de rutina.", true);
        setButtonLoading(btn, false, 'FINALIZAR Y CERRAR BITÁCORA DE RUTINA');
    }
};
