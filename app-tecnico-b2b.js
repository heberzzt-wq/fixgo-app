/**
 * =====================================================
 * GESTIA PREMIUM
 * B2B ENGINE V5.32 (ULTRA-FORCE)
 * Arquitectura Optimizada Offline + Cache
 * Lead Architect: Heberto Mendoza
 * =====================================================
 */

import { auth, db, storage, signOut } from "./firebase.js";
import {
    getPlatformServiceWorkerRegistration,
    initializePlatformRelease
} from "./platform-release.js";

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
    addDoc,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Importación del motor de mensajería (El Radio B2B)
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";

/* =====================================================
    REGISTRO DE SERVICE WORKER (LA ANTENA B2B) - V5.32
    ===================================================== */
initializePlatformRelease().catch(error => console.error("[GESTIA_RELEASE_AUTHORITY_FAILED]", error));

/* =====================================================
GLOBAL STATE
===================================================== */

let ordenId = new URLSearchParams(window.location.search).get("id");

let canvas;
let ctx;
let isDrawing=false;

let edificioIdGlobal=null;

let MaterialesTemporales=[];

let rutinaDiariaTareas=[];
let rutinaCompletadaIds=new Set();

window.tareasDiariasGlobal={};


/* =====================================================
NETWORK MANAGER
===================================================== */

let isOnline=navigator.onLine;

window.addEventListener("online",async ()=>{
isOnline=true;
const badge = document.getElementById("networkBadge");
if(badge){
badge.innerText = "ONLINE";
badge.className = "badge-online";
}
showToast("Conexión restaurada");
await procesarFotosPendientes();
await procesarSyncPendiente();
});

window.addEventListener("offline",()=>{
isOnline=false;
const badge = document.getElementById("networkBadge");
if(badge){
badge.innerText = "OFFLINE";
badge.className = "badge-offline";
}
showToast("Modo Offline activado",true);
});


/* =====================================================
INDEXED DB CACHE ENGINE
===================================================== */

const DB_NAME="gestia_cache";
const DB_VERSION=2;

let localDB;

function initLocalDB(){

return new Promise((resolve,reject)=>{

const request=indexedDB.open(DB_NAME,DB_VERSION);

request.onupgradeneeded=e=>{

const db=e.target.result;

if(!db.objectStoreNames.contains("tareas")){
db.createObjectStore("tareas",{keyPath:"id"});
}

if(!db.objectStoreNames.contains("historial")){
db.createObjectStore("historial",{keyPath:"id"});
}

if(!db.objectStoreNames.contains("sync_queue")){
db.createObjectStore("sync_queue",{autoIncrement:true});
}

if(!db.objectStoreNames.contains("fotos_pendientes")){
db.createObjectStore("fotos_pendientes",{autoIncrement:true});
}

};

request.onsuccess=e=>{
localDB=e.target.result;
resolve();
};

request.onerror=e=>{
reject(e);
};

});

}


function cacheGuardar(store,data){

return new Promise((resolve,reject)=>{

const tx=localDB.transaction(store,"readwrite");

const objectStore=tx.objectStore(store);

if(store==="sync_queue" || store==="fotos_pendientes"){
objectStore.add(data);
}else{
objectStore.put(data);
}

tx.oncomplete=resolve;
tx.onerror=reject;

});

}


function cacheLeerTodos(store){

return new Promise((resolve,reject)=>{

const tx=localDB.transaction(store,"readonly");

const objectStore=tx.objectStore(store);

const req=objectStore.getAll();

req.onsuccess=()=>resolve(req.result);
req.onerror=reject;

});

}


function cacheLimpiar(store){

return new Promise((resolve,reject)=>{

const tx=localDB.transaction(store,"readwrite");

tx.objectStore(store).clear();

tx.oncomplete=resolve;
tx.onerror=reject;

});

}


/* =====================================================
SYNC QUEUE
===================================================== */

async function agregarSyncPendiente(data){

await cacheGuardar("sync_queue",data);

}

/**
 * Guarda fotos en IndexedDB convirtiéndolas a Base64.
 * Evita problemas de serialización de objetos File/Blob.
 */
async function guardarFotoOffline(data){

// 1. Convertimos el archivo a Base64 antes de tocar la DB
const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(data.file);
});

// 2. Guardamos en el store con la transacción limpia
return new Promise((resolve,reject)=>{

const tx=localDB.transaction("fotos_pendientes","readwrite");

const store=tx.objectStore("fotos_pendientes");

store.add({
    tipo: data.tipo,
    ordenId: data.ordenId,
    timestamp: data.timestamp,
    base64: base64
});

tx.oncomplete=resolve;
tx.onerror=reject;

});

}


async function procesarSyncPendiente(){

if(!isOnline) return;

const items=await cacheLeerTodos("sync_queue");

if(items.length===0) return;

console.log("🔄 Procesando sync offline:",items.length);

for(const item of items){

try{

if(item.type==="update"){

await updateDoc(
doc(db,item.collection,item.id),
item.data
);

}

}catch(e){

console.error("Sync error",e);

}

}

await cacheLimpiar("sync_queue");

}

/**
 * Procesa fotos pendientes convirtiendo Base64 de vuelta a Blob
 * para ser compatible con uploadBytes de Firebase.
 */
async function procesarFotosPendientes(){

if(!isOnline) return;

const tx=localDB.transaction("fotos_pendientes","readonly");
const store=tx.objectStore("fotos_pendientes");

const req=store.getAll();

req.onsuccess=async ()=>{

const fotos=req.result;

if(!fotos.length) return;

console.log("📷 Subiendo fotos offline:",fotos.length);

for(const foto of fotos){

try{

const path=`evidencias/${foto.ordenId}/${foto.tipo}_${foto.timestamp}.jpg`;

const storageRef=ref(storage,path);

// Convertimos el Base64 almacenado a Blob para la subida
const response = await fetch(foto.base64);
const blob = await response.blob();

await uploadBytes(storageRef, blob);

const url=await getDownloadURL(storageRef);

const campo= foto.tipo==="antes" ? "foto_antes" : "foto_despues";

await updateDoc(doc(db,"servicios_b2b",foto.ordenId),{
[campo]:url
});

}catch(e){

console.error("Error subiendo foto offline",e);

}

}

await limpiarFotosPendientes();

};

}

function limpiarFotosPendientes(){

return new Promise((resolve,reject)=>{

const tx=localDB.transaction("fotos_pendientes","readwrite");

tx.objectStore("fotos_pendientes").clear();

tx.oncomplete=resolve;
tx.onerror=reject;

});

}


/* =====================================================
UTILIDADES UI
===================================================== */

function showToast(message,isError=false){

const toast=document.createElement("div");

toast.className=`fixed bottom-24 left-1/2 -translate-x-1/2 p-3 rounded-lg text-white text-xs font-bold shadow-lg z-50 ${isError?'bg-red-600':'bg-emerald-600'}`;

toast.innerText=message;

document.body.appendChild(toast);

setTimeout(()=>{

toast.remove();

},3000);

}



function setButtonLoading(button,state,text="Procesando"){

if(!button) return;

if(state){

button.disabled=true;
button.innerHTML=`<i class="fas fa-spinner fa-spin"></i> ${text}`;

}else{

button.disabled=false;

}

}


/* =====================================================
AUTENTICACIÓN
===================================================== */

window.logout=()=>{

if(confirm("¿Cerrar sesión?")){

signOut(auth).then(()=>{

window.location.href="login.html";

});

}

};


/* =====================================================
NAVEGACIÓN
===================================================== */

window.cambiarSeccion=(id)=>{

const secciones=[
"seccion-tareas",
"seccion-historial",
"seccion-perfil",
"seccion-operador"
];

secciones.forEach(sec=>{

const el=document.getElementById(sec);

if(el){

el.classList.toggle("hidden",sec!==id);

}

});

if(id==="seccion-historial"){

cargarHistorialUnificado();

}

// Lógica para encender el botón activo en verde
const navButtons = document.querySelectorAll('nav button');
navButtons.forEach(btn => {
if (btn.getAttribute('onclick').includes(id)) {
btn.classList.remove('text-zinc-600');
btn.classList.add('text-emerald-500'); 
} else {
btn.classList.remove('text-emerald-500');
btn.classList.add('text-zinc-600'); 
}
});

};


/* =====================================================
PUENTE A TERMINAL HEBERTO - REPORTE FLOTILLA (B2B)
===================================================== */

window.reportarFallaVehiculo = () => {

    if (typeof showToast === 'function') {
        showToast("Abriendo Terminal Operativa..."); 
    }

    setTimeout(() => {
        window.location.href = "./terminal-chofer.html";
    }, 600);

};

/* =====================================================
    BOTTOM SHEET OT (DISEÑO B2B INQUILINO ADAPTATIVO)
    REWRITE v5.32: Soporte para Unidades e Inquilinos
   ===================================================== */

function inicializarBottomSheet(){

    if(document.getElementById("ot-bottom-sheet")) return;

    const sheet=document.createElement("div");

    sheet.id="ot-bottom-sheet";

    sheet.className="fixed inset-0 z-[100] hidden";

    // HTML Enriquecido: Agregamos id="ot-inquilino-tag" para identificar al cliente B2B
    sheet.innerHTML=`
    <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"
    onclick="cerrarHojaReporte()"></div>

    <div id="ot-sheet-content"
    class="absolute bottom-0 left-0 right-0 bg-zinc-950 p-6 rounded-t-3xl transform translate-y-full transition-transform duration-300 border-t border-white/5">

    <div class="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mb-6"></div>

    <div class="flex items-start justify-between mb-4">
        <div class="w-3/4">
            <h2 id="ot-equipo" class="text-xl font-black italic uppercase text-white leading-tight"></h2>
            <p id="ot-inquilino-tag" class="text-[10px] text-blue-400 font-black uppercase tracking-widest mt-1 hidden italic"></p>
        </div>
        <span id="ot-prioridad-badge" class="text-[9px] px-2 py-1 rounded font-black tracking-widest uppercase mt-1"></span>
    </div>

    <div class="space-y-4 mb-8">
        <div class="bg-black/50 p-3 rounded-xl border border-white/5">
            <p class="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1"><i class="fas fa-map-marker-alt"></i> Ubicación Exacta</p>
            <p id="ot-ubicacion" class="text-xs text-white font-bold uppercase"></p>
        </div>

        <div class="bg-black/50 p-3 rounded-xl border border-white/5">
            <p class="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1"><i class="fas fa-clipboard-list"></i> Instrucciones / Fallo</p>
            <p id="ot-descripcion" class="text-xs text-zinc-300 leading-relaxed"></p>
        </div>
    </div>

    <button id="btn-iniciar-ot"
    class="w-full bg-emerald-500 text-black py-4 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-transform">
    <i class="fas fa-play-circle mr-2"></i> INICIAR SERVICIO
    </button>

    </div>
    `;

    document.body.appendChild(sheet);

}


window.abrirHojaReporte=(id)=>{

    const tarea=window.tareasDiariasGlobal[id];

    if(!tarea) return;

    // 1. Mapeo de Identidad Base
    document.getElementById("ot-equipo").innerText=tarea.equipo || "MANTENIMIENTO";
    document.getElementById("ot-descripcion").innerText=tarea.descripcion || "Sin instrucciones detalladas.";

    // 2. LÓGICA DE UBICACIÓN B2B: Priorizamos la unidad del inquilino si existe
    const ubicacionFinal = tarea.unidad ? `OFICINA/DEPTO: ${tarea.unidad}` : (tarea.ubicacion_especifica || "Ubicación General");
    document.getElementById("ot-ubicacion").innerText = ubicacionFinal;

    // 3. TAG DE INQUILINO: Visibilidad para reportes directos
    const inqTag = document.getElementById("ot-inquilino-tag");
    if(tarea.inquilino_nombre){
        inqTag.innerText = `Reportado por: ${tarea.inquilino_nombre}`;
        inqTag.classList.remove("hidden");
    } else {
        inqTag.classList.add("hidden");
    }

    // 4. Manejo visual de la Prioridad
    const badgePrioridad = document.getElementById("ot-prioridad-badge");
    if(tarea.prioridad === "alta") {
        badgePrioridad.innerText = "🚨 ALTA";
        badgePrioridad.className = "text-[9px] px-2 py-1 rounded font-black tracking-widest uppercase mt-1 bg-red-500/20 text-red-500 border border-red-500/20";
    } else if (tarea.prioridad === "media") {
        badgePrioridad.innerText = "⚠️ MEDIA";
        badgePrioridad.className = "text-[9px] px-2 py-1 rounded font-black tracking-widest uppercase mt-1 bg-amber-500/20 text-amber-500 border border-amber-500/20";
    } else {
        badgePrioridad.innerText = "NORMAL";
        badgePrioridad.className = "text-[9px] px-2 py-1 rounded font-black tracking-widest uppercase mt-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20";
    }

    // 5. Asignación de Acción
    document.getElementById("btn-iniciar-ot").onclick=()=>{
        cerrarHojaReporte();
        seleccionarTarea(id);
    };

    const sheet=document.getElementById("ot-bottom-sheet");
    const content=document.getElementById("ot-sheet-content");

    sheet.classList.remove("hidden");

    // Pequeño delay para asegurar que el display:block se aplicó antes de animar
    setTimeout(()=>{
        content.classList.remove("translate-y-full");
    },10);

};


window.cerrarHojaReporte=()=>{

    const sheet=document.getElementById("ot-bottom-sheet");
    const content=document.getElementById("ot-sheet-content");

    content.classList.add("translate-y-full");

    setTimeout(()=>{
        sheet.classList.add("hidden");
    },300);

};
/* =====================================================
SEGURIDAD PASE CASETA
===================================================== */

async function validarPaseCaseta(){

const user=auth.currentUser;

if(!user) return false;

const userDoc=await getDoc(doc(db,"users",user.uid));

const data=userDoc.data();

const tienePlacas =
data.tecnico_placas ||
data.placas ||
(data.logistica && data.logistica.placas);

if(!tienePlacas){

alert("🚨 Debes registrar placas para iniciar servicio.");

return false;

}

return true;

}

window.validarPaseCaseta=validarPaseCaseta;


/* =====================================================
    INIT AUTH - V5.28 (CORRECCIÓN SINTAXIS Y FLUJO ÚNICO)
    Arquitectura: GestiaPremium B2B
    Lead Architect: Heberto Mendoza
   ===================================================== */

auth.onAuthStateChanged(async (user) => {

    if (!user) {
        // Si no hay sesión, redirección inmediata
        window.location.href = "login.html";
        return;
    }

    // 1. Inicialización de Entorno Local
    await initLocalDB();
    inicializarBottomSheet();

    try {
        // 2. Extracción de Credenciales Operativas
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (!userDoc.exists()) {
            console.error("No se encontró el documento del usuario");
            return;
        }

        const data = userDoc.data();

        if (!data || !data.edificioId) {
            alert("🚨 Perfil sin nodo de edificio asignado. Contacta al NOC.");
            return;
        }

        // -----------------------------------------------------
        // NORMALIZACIÓN QUIRÚRGICA DE ID
        // -----------------------------------------------------
        // Garantizamos match con el despacho del Admin (case insensitive y sin espacios)
        edificioIdGlobal = data.edificioId.toLowerCase().trim().replace(/\s+/g, '');
        
        console.log("🛠️ Nodo Operativo Conectado:", edificioIdGlobal);
        // -----------------------------------------------------


        // 🔥 DISPARO DE SEÑAL DE RADIO (FCM TOKEN)
        // Insertamos aquí el registro para que Jonathan tenga radio en el bolsillo
        activarNotificacionesBolsillo(user.uid);


        // 3. Inyección en Cabecera (UI Premium)
        const txtEdificio = document.getElementById("txtEdificio");
        if (txtEdificio) {
            txtEdificio.innerText = data.edificioNombre || data.edificioId.toUpperCase();
        }

        // 4. Inyección de Identidad en Perfil (Fase B)
        const pNombre = document.getElementById("perfilNombre");
        const pEspecialidad = document.getElementById("perfilEspecialidad");
        const pEdificio = document.getElementById("perfilEdificio");
        const pTelefono = document.getElementById("perfilTelefono");
        const pEmail = document.getElementById("perfilEmail");
        const imgTag = document.getElementById("perfilFotoImg");
        const icon = document.getElementById("iconAstronauta");

        if (pNombre) pNombre.innerText = data.nombre || "Técnico de Campo";
        if (pEspecialidad) pEspecialidad.innerText = data.especialidad || "General";
        if (pEdificio) pEdificio.innerText = data.edificioNombre || "No Asignado";
        if (pTelefono) pTelefono.innerText = data.telefono || "Sin registrar";
        if (pEmail) pEmail.innerText = data.email || user.email;

        // 5. Carga de Avatar Operativo
        if (data.foto_perfil) {
            if (imgTag && icon) {
                imgTag.src = data.foto_perfil;
                imgTag.classList.remove("hidden");
                icon.classList.add("hidden");
            }
        } else {
            if (imgTag && icon) {
                imgTag.classList.add("hidden");
                icon.classList.remove("hidden");
            }
        }

        // 6. LÓGICA DE NAVEGACIÓN Y DISPARO DE NEGOCIO
        // Todo esto debe vivir aquí dentro para que edificioIdGlobal ya tenga valor
        const listaTareasHoy = document.getElementById("listaTareasHoy");
        const flujoTecnico = document.getElementById("flujoTecnico");
        const txtPunto = document.getElementById("txtPunto");

        if (ordenId) {
            // Jonathan está ejecutando una OT específica
            if (listaTareasHoy) listaTareasHoy.classList.add("hidden");
            if (flujoTecnico) flujoTecnico.classList.remove("hidden");

            if (txtPunto) txtPunto.innerText = "Ejecutando OT...";
            
            console.log("🚀 Modo OT Activo:", ordenId);
        } else {
            // Dashboard normal: Limpiamos vista y cargamos datos
            if (listaTareasHoy) listaTareasHoy.classList.remove("hidden");
            if (flujoTecnico) flujoTecnico.classList.add("hidden");

            if (txtPunto) txtPunto.innerText = "Dashboard Diario";

            // Solo disparamos las cargas si NO estamos dentro de una OT
            await cargarTareasProgramadas();
            await cargarRutinaPreventiva();
        }

    } catch (error) {
        console.error("Error en Init Auth:", error);
        showToast("Error de conexión con el servidor", true);
    }

});
/* =====================================================
CARGA DE TAREAS PROGRAMADAS (V5.31 - PUSH SAFE ENGINE)
Arquitectura: Snapshot Sync + Push Worker
===================================================== */

async function cargarTareasProgramadas(){

const contenedor=document.getElementById("contenedor-tareas-diarias");

if(!contenedor || !edificioIdGlobal){
console.warn("⚠️ Abortando carga: Contenedor o edificioIdGlobal ausentes.");
return;
}

console.log("🔍 Buscando OTs para el nodo operativo:", edificioIdGlobal);

/* ----------------------------------
1️⃣ CARGAR CACHE LOCAL
---------------------------------- */

try{

const cacheTareas=await cacheLeerTodos("tareas");

if(cacheTareas.length>0){

console.log("📦 Datos locales encontrados:", cacheTareas.length);

renderizarTareas(cacheTareas);

}

}catch(err){

console.error("Error cache:",err);

}

/* ----------------------------------
2️⃣ OFFLINE EXIT
---------------------------------- */

if(!isOnline){

console.log("📡 Modo offline activo");

return;

}

/* ----------------------------------
3️⃣ FIRESTORE REALTIME
---------------------------------- */

const q=query(

collection(db,"servicios_b2b"),

where("edificioId","==",edificioIdGlobal),

where("status","in",["pendiente","programado","en_proceso"])

);


/* ----------------------------------
CONTROL DE ALERTAS
---------------------------------- */

let primeraCarga=true;


onSnapshot(q, async(snapshot)=>{

console.log("📥 Snapshot recibido. Documentos:",snapshot.size);

contenedor.innerHTML="";

window.tareasDiariasGlobal={};

if(snapshot.empty){

contenedor.innerHTML=`<div class="p-8 text-center text-zinc-600 text-xs">Sin tareas activas hoy</div>`;

await sincronizarRutinasMaestras();

primeraCarga=false;

return;

}

await cacheLimpiar("tareas");

const tareasParaRender=[];

snapshot.forEach(docSnap=>{

const tarea=docSnap.data();

const id=docSnap.id;

const data={id,...tarea};

window.tareasDiariasGlobal[id]=tarea;

tareasParaRender.push(data);

});


/* ----------------------------------
ALERTA LOCAL SOLO SI APP ACTIVA
---------------------------------- */

if(!primeraCarga){

snapshot.docChanges().forEach(change=>{

if(change.type==="added"){

const nuevaTarea=change.doc.data();

if(nuevaTarea.prioridad==="alta"){

console.log("🚨 OT PRIORIDAD ALTA DETECTADA");

sonarAlerta();

showToast(`🚨 NUEVA EMERGENCIA: ${nuevaTarea.equipo}`,true);

}

}

});

}


for(const tarea of tareasParaRender){

await cacheGuardar("tareas",tarea);

}


renderizarTareas(tareasParaRender);

primeraCarga=false;

},

(error)=>{

console.error("❌ Error Firestore listener:",error);

showToast("Error sincronizando con NOC",true);

});

}
/* =====================================================
SINCRONIZACIÓN PLAN MAESTRO RUTINAS
===================================================== */

/**
 * Trigger de carga para rutinas preventivas.
 * Valida edificio y conexión antes de sincronizar.
 */
async function cargarRutinaPreventiva(){

if(!edificioIdGlobal) return;

if(!isOnline) return;

try{

await sincronizarRutinasMaestras();

}catch(e){

console.error("Error rutinas preventivas",e);

}

}


async function sincronizarRutinasMaestras(){

if(!isOnline) return;

const inicioDia=new Date();

inicioDia.setHours(0,0,0,0);

const qCheck=query(

collection(db,"servicios_b2b"),

where("edificioId","==",edificioIdGlobal),

where("fecha_creacion",">=",inicioDia),

where("origen","==","sistema_rutinas")

);

const snap=await getDocs(qCheck);

if(!snap.empty){

return;

}


const rutinaRef=doc(db,"config_rutinas",edificioIdGlobal);

const rutinaSnap=await getDoc(rutinaRef);

if(!rutinaSnap.exists()) return;

const master=rutinaSnap.data();

let tareas=[];

if(master.Diaria) tareas.push(...master.Diaria);

if(tareas.length===0) return;


const promesas=tareas.map(t=>{

return addDoc(collection(db,"servicios_b2b"),{

edificioId:edificioIdGlobal,

descripcion:t.descripcion,

equipo:t.equipo,

status:"pendiente",

origen:"sistema_rutinas",

fecha_creacion:serverTimestamp()

});

});


await Promise.all(promesas);

showToast("Rutinas sincronizadas");

}


/* =====================================================
    RENDER TARJETAS TAREAS (V5.32 - B2B TENANT UPGRADE)
    Arquitectura: Prioridad + Identidad de Inquilino
    Lead Architect: Heberto Mendoza
   ===================================================== */

function renderizarTareas(tareas) {

    const contenedor = document.getElementById("contenedor-tareas-diarias");

    if (!contenedor) return;

    // 1. Limpieza total del contenedor para refrescar la vista
    contenedor.innerHTML = "";

    /**
     * 2. LÓGICA DE ORDENAMIENTO (SORTING V5.32)
     * Priorizamos: 
     * 1ro: Emergencias (Prioridad ALTA).
     * 2do: Reportes de Inquilinos VIP.
     * 3ro: Rutinas de Sistema.
     */
    const tareasOrdenadas = [...tareas].sort((a, b) => {
        // Prioridad ALTA manda sobre todo
        const pA = (a.priority === "alta" || a.prioridad === "alta");
        const pB = (b.priority === "alta" || b.prioridad === "alta");
        
        if (pA && !pB) return -1;
        if (pB && !pA) return 1;

        // Si no son altas, priorizamos las que tienen Unidad (Inquilinos)
        if (a.unidad && !b.unidad) return -1;
        if (b.unidad && !a.unidad) return 1;
        
        // Finalmente por fecha (más nuevas arriba)
        const fechaA = a.fecha_creacion?.seconds || 0;
        const fechaB = b.fecha_creacion?.seconds || 0;
        return fechaB - fechaA;
    });

    // 3. GENERACIÓN DINÁMICA DE TARJETAS
    tareasOrdenadas.forEach(tarea => {

        // Sincronización con el estado global para el Bottom Sheet
        window.tareasDiariasGlobal[tarea.id] = tarea;

        const esAlta = (tarea.priority === "alta" || tarea.prioridad === "alta");
        const esManual = tarea.origen !== "sistema_rutinas";
        const esInquilino = tarea.unidad ? true : false;

        const div = document.createElement("div");

        /**
         * ESTILOS DINÁMICOS V5.32:
         * - ALTA: Rojo/Pulso.
         * - INQUILINO: Borde azul y fondo sutil.
         * - NORMAL: Glass-card zinc.
         */
        let borderClass = 'border-zinc-800 bg-zinc-900/40';
        if (esAlta) {
            borderClass = 'bg-red-950/10 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.1)] animate-pulse';
        } else if (esInquilino) {
            borderClass = 'bg-blue-900/5 border-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.05)]';
        }

        div.className = `mb-1 px-2 py-1.5 rounded-lg w-full max-w-[680px] mx-auto border transition-all active:scale-95 flex justify-between items-center cursor-pointer ${borderClass}`;

        div.onclick = () => abrirHojaReporte(tarea.id);

        // Badge de identificación: Reportado (B2C) vs Inquilino (B2B) vs Sistema
        let badgeHTML = esManual 
            ? `<span class="bg-emerald-500 text-black text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter mb-1 inline-block">REPORTADO</span>`
            : `<span class="bg-zinc-800 text-zinc-500 text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter mb-1 inline-block">SISTEMA</span>`;

        if (esInquilino) {
            badgeHTML = `<span class="bg-blue-600 text-white text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter mb-1 inline-block">INQUILINO VIP</span>`;
        }

        // Color de la barra vertical indicadora
        let barraColor = 'bg-zinc-700';
        if (esAlta) barraColor = 'bg-red-500';
        else if (esInquilino) barraColor = 'bg-blue-500';

        div.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="w-1 h-6 rounded-full ${barraColor}"></div>
                
                <div>
                    ${badgeHTML}
                    <h4 class="text-xs font-black italic uppercase leading-tight ${esAlta ? 'text-red-500' : (esInquilino ? 'text-blue-400' : 'text-zinc-100')}">
                        ${tarea.equipo || "MANTENIMIENTO"}
                    </h4>
                    <p class="text-[9px] font-bold uppercase tracking-wide flex items-center gap-1 ${esAlta ? 'text-red-400' : (esInquilino ? 'text-blue-300' : 'text-emerald-500')}">
                        <i class="fas ${esInquilino ? 'fa-building' : 'fa-map-marker-alt'} text-[9px]"></i> 
                        ${tarea.unidad ? `OFICINA: ${tarea.unidad}` : (tarea.ubicacion_especifica || 'General')}
                    </p>
                </div>
            </div>

            <div class="text-right">
                <i class="fas ${esAlta ? 'fa-exclamation-circle text-red-500' : 'fa-chevron-right text-zinc-700'} text-xs"></i>
                <p class="text-[8px] font-bold text-zinc-600 mt-1">VER OT</p>
            </div>
        `;

        contenedor.appendChild(div);
    });

    console.log(`🚀 Renderizado B2B (Tenant Support): ${tareasOrdenadas.length} tareas procesadas.`);
}

/* =====================================================
HISTORIAL UNIFICADO OPTIMIZADO
===================================================== */

async function cargarHistorialUnificado(){

const contenedor=document.getElementById("lista-historial-unificada");

if(!contenedor || !edificioIdGlobal) return;


/* ----------------------------------
1️⃣ CACHE
---------------------------------- */

const cacheHistorial=await cacheLeerTodos("historial");

if(cacheHistorial.length>0){

renderizarHistorial(cacheHistorial);

}


/* ----------------------------------
2️⃣ OFFLINE
---------------------------------- */

if(!isOnline){

console.log("Historial offline");

return;

}


/* ----------------------------------
3️⃣ FIRESTORE
---------------------------------- */

const qServicios=query(

collection(db,"servicios_b2b"),

where("edificioId","==",edificioIdGlobal),

where("status","==","finalizado"),

orderBy("fecha_cierre","desc"),

limit(40)

);


const qRutinas=query(

collection(db,"log_rutinas"),

where("edificioId","==",edificioIdGlobal),

orderBy("timestamp","desc"),

limit(80)

);


const [serviciosSnap,rutinasSnap]=await Promise.all([

getDocs(qServicios),
getDocs(qRutinas)

]);


let historial=[];


/* ----------------------------------
MAP SERVICIOS
---------------------------------- */

serviciosSnap.forEach(docSnap=>{

const data=docSnap.data();

historial.push({

id:docSnap.id,

tipo:"OT",

titulo:data.equipo || "Servicio",

fecha:data.fecha_cierre?.toDate() || new Date(),

descripcion:data.observaciones_finales || ""

});

});


/* ----------------------------------
MAP RUTINAS
---------------------------------- */

rutinasSnap.forEach(docSnap=>{

const data=docSnap.data();

historial.push({

id:docSnap.id,

tipo:"RUTINA",

titulo:"Rutina preventiva",

fecha:data.timestamp?.toDate() || new Date(),

descripcion:data.status

});

});


/* ----------------------------------
ORDENAR
---------------------------------- */

historial.sort((a,b)=>b.fecha-a.fecha);


/* ----------------------------------
GUARDAR CACHE
---------------------------------- */

await cacheLimpiar("historial");

for(const item of historial){

await cacheGuardar("historial",item);

}


renderizarHistorial(historial);

}



/* =====================================================
RENDER HISTORIAL - VERSION CORREGIDA V5.22
===================================================== */

function renderizarHistorial(items) {
    const contenedor = document.getElementById("lista-historial-unificada");

    if (!contenedor) return;

    // Limpiamos el contenedor
    contenedor.innerHTML = "";

    // Si no hay items, mostramos el mensaje de vacío
    if (!items || items.length === 0) {
        contenedor.innerHTML = `
            <div class="p-6 text-center text-zinc-600 italic">
                Sin historial para mostrar
            </div>
        `;
        return;
    }

    // Ordenamos por fecha de la más reciente a la más antigua antes de pintar
    const itemsOrdenados = [...items].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    itemsOrdenados.forEach(item => {
        const div = document.createElement("div");
        div.className = "p-4 rounded-xl border border-zinc-800 mb-3 bg-zinc-900/50";

        // Formateo seguro de fecha para evitar el error de "Invalid Date"
        let fechaDisplay = "Fecha no disponible";
        try {
            if (item.fecha) {
                const d = new Date(item.fecha);
                // Si la fecha es válida, la formateamos amigablemente para el técnico
                if (!isNaN(d.getTime())) {
                    fechaDisplay = d.toLocaleString('es-MX', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            }
        } catch (e) {
            console.error("Error formateando fecha del item:", item);
        }

        div.innerHTML = `
            <div class="flex justify-between items-start mb-1">
                <p class="text-[10px] font-black text-emerald-400 uppercase tracking-wider">
                    ${item.tipo || 'SERVICIO'}
                </p>
                <p class="text-[10px] text-zinc-500 font-mono">
                    ${fechaDisplay}
                </p>
            </div>
            
            <h5 class="text-sm font-bold text-zinc-200 mb-1">
                ${item.titulo || 'Mantenimiento General'}
            </h5>

            <p class="text-xs text-zinc-400 leading-relaxed">
                ${item.descripcion || 'Sin observaciones adicionales'}
            </p>
        `;

        contenedor.appendChild(div);
    });
    
    console.log(`✅ Renderizados ${itemsOrdenados.length} elementos en la bitácora.`);
}

/* =====================================================
SELECCIONAR TAREA
===================================================== */

window.seleccionarTarea = async(id)=>{

const tienePase = await validarPaseCaseta();

if(!tienePase) return;

ordenId=id;

cerrarHojaReporte();

document.getElementById("listaTareasHoy").classList.add("hidden");

document.getElementById("flujoTecnico").classList.remove("hidden");

};


/* =====================================================
PASO 1 DIAGNOSTICO
===================================================== */

window.enviarDiagnostico = async()=>{

const diagInput = document.getElementById("diagInput");
const fileAntes = document.getElementById("fileAntes");

if(!diagInput || !fileAntes) return;

const diag = diagInput.value.trim();
const file = fileAntes.files[0];

const btn = document.querySelector('#step1 button[onclick="enviarDiagnostico()"]');

if(!diag || !file){

showToast("Falta diagnóstico o foto",true);

return;

}

setButtonLoading(btn,true);

try{

let urlAntes = null;

if(isOnline){

const path = `evidencias/${ordenId}/antes_${Date.now()}.jpg`;
const storageRef = ref(storage,path);

await uploadBytes(storageRef,file);

urlAntes = await getDownloadURL(storageRef);

}else{

await guardarFotoOffline({
tipo:"antes",
ordenId,
file,
timestamp:Date.now()
});

}

const dataUpdate = {

diagnostico_inicial:diag,

foto_antes:urlAntes,

status:"en_proceso",

fecha_diagnostico:serverTimestamp()

};


if(isOnline){

await updateDoc(doc(db,"servicios_b2b",ordenId),dataUpdate);

}else{

await agregarSyncPendiente({

type:"update",

collection:"servicios_b2b",

id:ordenId,

data:dataUpdate

});

}


const step1 = document.getElementById("step1");
if(step1) step1.classList.add("step-inactive");

const step2 = document.getElementById("step2");
if(step2) step2.classList.remove("step-inactive");

showToast("Diagnóstico guardado");

}catch(e){

showToast("Error diagnóstico",true);

}

setButtonLoading(btn,false);

};



/* =====================================================
PASO 2 MATERIALES
===================================================== */

window.agregarMaterial = ()=>{

const matNombreInput = document.getElementById("mat-nombre");
const matCantidadInput = document.getElementById("mat-cantidad");

if(!matNombreInput || !matCantidadInput) return;

const nombre = matNombreInput.value.trim();
const cantidad = matCantidadInput.value;

if(!nombre || !cantidad) return;

MaterialesTemporales.push({

nombre,

cantidad,

id:Date.now()

});

renderizarMateriales();

matNombreInput.value = "";
matCantidadInput.value = "";

};



function renderizarMateriales(){

const lista = document.getElementById("lista-materiales-acumulados");

if(!lista) return;

lista.innerHTML = "";

MaterialesTemporales.forEach(m=>{

const div = document.createElement("div");

div.className = "flex justify-between bg-zinc-900 p-2 rounded";

div.innerHTML = `

<span>${m.cantidad}x ${m.nombre}</span>

<button onclick="removerMaterial(${m.id})">X</button>

`;

lista.appendChild(div);

});

}



window.removerMaterial = (id)=>{

MaterialesTemporales = MaterialesTemporales.filter(m=>m.id!==id);

renderizarMateriales();

};



window.confirmarMateriales = async()=>{

const btn = document.querySelector('#step2 button[onclick="confirmarMateriales()"]');

setButtonLoading(btn,true);

try{

const dataUpdate = {

materiales_utilizados:MaterialesTemporales

};


if(isOnline){

await updateDoc(doc(db,"servicios_b2b",ordenId),dataUpdate);

}else{

await agregarSyncPendiente({

type:"update",

collection:"servicios_b2b",

id:ordenId,

data:dataUpdate

});

}


const step2 = document.getElementById("step2");
if(step2) step2.classList.add("step-inactive");

const step3 = document.getElementById("step3");
if(step3) step3.classList.remove("step-inactive");

showToast("Materiales guardados");

}catch(e){

showToast("Error guardando materiales",true);

}

setButtonLoading(btn,false);

};



/* =====================================================
PASO 3 EVIDENCIA FINAL
===================================================== */

window.subirEvidenciaFinal = async()=>{

const fileDespuesInput = document.getElementById("fileDespues");
const obsFinalesInput = document.getElementById("obs-finales");

if(!fileDespuesInput || !obsFinalesInput) return;

const file = fileDespuesInput.files[0];
const obs = obsFinalesInput.value.trim();

const btn = document.getElementById("btnUploadDespues");

if(!file || !obs){

showToast("Falta evidencia o notas",true);

return;

}

setButtonLoading(btn,true);

try{

let urlDespues = null;

if(isOnline){

const path = `evidencias/${ordenId}/despues_${Date.now()}.jpg`;

const storageRef = ref(storage,path);

await uploadBytes(storageRef,file);

urlDespues = await getDownloadURL(storageRef);

}else{

await guardarFotoOffline({
tipo:"despues",
ordenId,
file,
timestamp:Date.now()
});

}

const dataUpdate = {

foto_despues:urlDespues,

observaciones_finales:obs

};


if(isOnline){

await updateDoc(doc(db,"servicios_b2b",ordenId),dataUpdate);

}else{

await agregarSyncPendiente({

type:"update",

collection:"servicios_b2b",

id:ordenId,

data:dataUpdate

});

}

const step3 = document.getElementById("step3");
if(step3) step3.classList.add("step-inactive");

const step4 = document.getElementById("step4");
if(step4) step4.classList.remove("step-inactive");

initSignaturePad();

showToast("Evidencia guardada");

}catch(e){

showToast("Error evidencia",true);

}

setButtonLoading(btn,false);

};

/* =====================================================
FIRMA MOVIL
===================================================== */

let hasFirma=false;

function initSignaturePad(){

canvas=document.getElementById("signaturePad");

ctx=canvas.getContext("2d");

const rect=canvas.getBoundingClientRect();

canvas.width=rect.width;

canvas.height=rect.height;

const getPoint=(e)=>{

const r=canvas.getBoundingClientRect();

if(e.touches){

return{

x:e.touches[0].clientX-r.left,

y:e.touches[0].clientY-r.top

};

}

return{

x:e.clientX-r.left,

y:e.clientY-r.top

};

};


const start=e=>{

isDrawing=true;

const p=getPoint(e);

ctx.beginPath();

ctx.moveTo(p.x,p.y);

};


const draw=e=>{

if(!isDrawing) return;

hasFirma=true;

const p=getPoint(e);

ctx.lineTo(p.x,p.y);

ctx.strokeStyle="#10b981";

ctx.lineWidth=2;

ctx.stroke();

};


const stop=()=>{

isDrawing=false;

};


canvas.addEventListener("mousedown",start);

canvas.addEventListener("mousemove",draw);

window.addEventListener("mouseup",stop);


/* MOBILE */

canvas.addEventListener("touchstart",start);

canvas.addEventListener("touchmove",draw);

canvas.addEventListener("touchend",stop);

}



window.clearSignature=()=>{

ctx.clearRect(0,0,canvas.width,canvas.height);

hasFirma=false;

};



/* =====================================================
FINALIZAR ORDEN
===================================================== */

window.finalizarOrden=async()=>{

if(!hasFirma){
showToast("Firma requerida",true);
return;
}

const btn=document.querySelector('#step4 button[onclick="finalizarOrden()"]');

setButtonLoading(btn,true);

try{

let firmaUrl=null;

if(isOnline){

const firmaData=canvas.toDataURL("image/png");

const blob=await (await fetch(firmaData)).blob();

const storageRef=ref(storage,`firmas/${ordenId}.png`);

await uploadBytes(storageRef,blob);

firmaUrl=await getDownloadURL(storageRef);

}

const dataUpdate={

status:"finalizado",

firma_conformidad:firmaUrl,

fecha_cierre:serverTimestamp()

};


if(isOnline){

await updateDoc(doc(db,"servicios_b2b",ordenId),dataUpdate);

}else{

await agregarSyncPendiente({

type:"update",

collection:"servicios_b2b",

id:ordenId,

data:dataUpdate

});

}


showToast("Servicio cerrado");

window.location.reload();

}catch(e){

showToast("Error cierre",true);

}

setButtonLoading(btn,false);

};



/* =====================================================
PREVIEW IMAGEN
===================================================== */

window.previewImg=(input,id)=>{

const file=input.files[0];

if(!file) return;

const reader=new FileReader();

reader.onload=e=>{

document.getElementById(id).innerHTML=

`<img src="${e.target.result}" class="w-full h-full object-cover rounded-xl">`;

};

reader.readAsDataURL(file);

};

/* =====================================================
   MÓDULO: GESTIÓN DE FOTO DE PERFIL (V5.23)
   ===================================================== */

/**
 * Procesa la subida de la foto de perfil de Jonathan.
 * Maneja el flujo de Storage -> Firestore -> UI Update.
 * @param {HTMLInputElement} input - El input file disparado desde el perfil.
 */
window.subirFotoPerfil = async (input) => {
    const file = input.files[0];
    if (!file) return;

    const user = auth.currentUser;
    if (!user) {
        showToast("Sesión no válida", true);
        return;
    }

    // Referencias de UI
    const container = document.getElementById("containerAvatar");
    const imgTag = document.getElementById("perfilFotoImg");
    const icon = document.getElementById("iconAstronauta");
    
    // Feedback visual inmediato (Loading state)
    if (container) container.style.opacity = "0.5";
    showToast("Subiendo foto oficial...");

    try {
        if (!isOnline) {
            // Nota: Para fotos de perfil (identidad), forzamos online para evitar 
            // que el NOC vea un perfil vacío durante el despliegue.
            showToast("Se requiere conexión para actualizar perfil", true);
            if (container) container.style.opacity = "1";
            return;
        }

        // 1. Definir ruta en Storage: perfiles_tecnicos/{uid}.jpg
        // Usamos el UID para que cada técnico solo tenga una foto activa (sobrescribe)
        const storagePath = `perfiles_tecnicos/${user.uid}.jpg`;
        const storageRef = ref(storage, storagePath);

        // 2. Upload directo a Firebase Storage
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);

        // 3. Actualizar el documento del técnico en Firestore (V2.0 Security Rules)
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, {
            foto_perfil: downloadURL,
            ultima_actualizacion_perfil: serverTimestamp()
        });

        // 4. Actualización de la Interfaz (UI)
        if (imgTag && icon) {
            imgTag.src = downloadURL;
            imgTag.classList.remove("hidden");
            icon.classList.add("hidden");
        }

        showToast("Foto actualizada correctamente");

    } catch (error) {
        console.error("Error en subirFotoPerfil:", error);
        showToast("Error al subir la imagen", true);
    } finally {
        if (container) container.style.opacity = "1";
    }
};
/* =====================================================
    4. MOTOR DE PUSH & ALERTAS (V5.32 - ULTRA-FORCE)
    Arquitectura: Registro explícito de sw.js para Radio B2B
    Lead Architect: Heberto Mendoza
   ===================================================== */

/**
 * Registra el ID del radio del técnico en la central.
 * Fuerza el registro del sw.js para evitar conflictos de segundo plano.
 */
async function activarNotificacionesBolsillo(userId) {
    console.log("🛰️ PROTOCOLO PUSH: Iniciando para user:", userId);
    
    try {
        const messaging = getMessaging();
        
        // 1. Pedimos permiso al navegador (Cámara y Notificaciones son ley)
        const permission = await Notification.requestPermission();
        console.log("🔔 Resultado del permiso:", permission);

        if (permission === 'granted') {
            console.log("🎫 Sincronizando Antena con sw.js...");
            
            /**
             * 🚨 FIX TÁCTICO: No esperamos a que el SW esté "ready" al azar.
             * Registramos explícitamente el archivo que tiene el blindaje V6.1
             * para que el Token de Google sepa quién va a manejar la vibración.
             */
            const registration = await getPlatformServiceWorkerRegistration();
            if (!registration) throw new Error("SERVICE_WORKER_NOT_SUPPORTED");

            console.log("🎫 Solicitando Token a Google (FCM) vinculado al SW...");

            // 2. Pedimos el Token usando el registro explícito del SW v6.1
            const currentToken = await getToken(messaging, { 
                vapidKey: 'BJ_qj7caLzTumvHvJxy3kdTK50gW1NYJBFKso7Imx_shSMBFqLwQbzRTyNFCEs9n3b3OlEIoJI4U4jXPx6CLsYQ',
                serviceWorkerRegistration: registration 
            });

            if (currentToken) {
                console.log("✅ TOKEN RECIBIDO Y VINCULADO:", currentToken);
                
                // 3. Guardamos el ID en el perfil de Firestore para el NOC
                const userRef = doc(db, "users", userId);
                await updateDoc(userRef, {
                    fcmToken: currentToken,
                    ultimaSincronizacionPush: serverTimestamp()
                });
                
                console.log("💾 BASE DE DATOS: Token guardado en Firestore.");
                if (typeof showToast === 'function') showToast("Radio B2B Sintonizado");
            } else {
                console.warn("⚠️ Google no generó Token. Revisa la configuración en Consola.");
            }
        } else {
            console.error("🚫 Permiso de notificaciones denegado por el usuario.");
            if (typeof showToast === 'function') showToast("Sin radio: Permisos denegados", true);
        }
    } catch (error) {
        console.error("❌ ERROR CRÍTICO EN RADIO:", error);
    }
}

/**
 * Dispara el sonido de alerta del sistema.
 * Útil para avisos inmediatos cuando la app está en primer plano.
 */
function sonarAlerta() {
    try {
        // Sonido de alerta táctica
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(e => console.log("Audio bloqueado por el navegador. Esperando interacción."));
    } catch (e) {
        console.error("No se pudo reproducir la alerta sonora.");
    }
}

/**
 * Envía la notificación local al Service Worker.
 * Se asegura de que el velador muestre el aviso con vibración.
 */
function lanzarNotificacionPush(titulo, mensaje) {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(titulo, {
            body: mensaje,
            icon: "/icono-192.png",
            badge: "/icono-192.png",
            vibrate: [500, 110, 500, 110, 450, 110], // Patrón ULTRA-FORCE
            requireInteraction: true, 
            data: { url: window.location.href }
        });
    });
}

/* =====================================================
    FIN DEL MÓDULO 4: GESTIA PREMIUM V5.32
   ===================================================== */
