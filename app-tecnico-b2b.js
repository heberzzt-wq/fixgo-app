/**
 * =====================================================
 * GESTIA PREMIUM
 * B2B ENGINE V5.22
 * Arquitectura Optimizada Offline + Cache
 * Lead Architect: Heberto Mendoza
 * =====================================================
 */

import { auth, db, storage, signOut } from "./firebase.js";

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

window.addEventListener("online",()=>{
window.addEventListener("online",async ()=>{
isOnline=true;
const badge = document.getElementById("networkBadge");
if(badge){
badge.innerText = "ONLINE";
badge.className = "badge-online";
}
showToast("Conexión restaurada");
pwait procesarSyncPendiente();
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


function initLocalDB(){

return new Promise((resolve,reject)=>{

const request=indexedDB.open(DB_NAME,DB_VERSION);

request.onupgradeneeded=e=>{

const db=e.target.result;

db.createObjectStore("tareas",{keyPath:"id"});
db.createObjectStore("historial",{keyPath:"id"});
db.createObjectStore("sync_queue",{autoIncrement:true});

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

objectStore.put(data);

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

async function guardarFotoOffline(data){

return new Promise((resolve,reject)=>{

const tx=localDB.transaction("fotos_pendientes","readwrite");

const store=tx.objectStore("fotos_pendientes");

store.add(data);

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

await uploadBytes(storageRef,foto.file);

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
"seccion-perfil"
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

};


/* =====================================================
BOTTOM SHEET OT
===================================================== */

function inicializarBottomSheet(){

if(document.getElementById("ot-bottom-sheet")) return;

const sheet=document.createElement("div");

sheet.id="ot-bottom-sheet";

sheet.className="fixed inset-0 z-[100] hidden";

sheet.innerHTML=`
<div class="absolute inset-0 bg-black/80 backdrop-blur-sm"
onclick="cerrarHojaReporte()"></div>

<div id="ot-sheet-content"
class="absolute bottom-0 left-0 right-0 bg-zinc-950 p-6 rounded-t-3xl transform translate-y-full transition">

<h2 id="ot-equipo" class="text-xl font-black mb-2"></h2>

<p id="ot-descripcion" class="text-xs text-zinc-300 mb-4"></p>

<button id="btn-iniciar-ot"
class="w-full bg-emerald-500 text-black py-3 rounded-xl font-black">
INICIAR SERVICIO
</button>

</div>
`;

document.body.appendChild(sheet);

}


window.abrirHojaReporte=(id)=>{

const tarea=window.tareasDiariasGlobal[id];

if(!tarea) return;

document.getElementById("ot-equipo").innerText=tarea.equipo;

document.getElementById("ot-descripcion").innerText=tarea.descripcion;

document.getElementById("btn-iniciar-ot").onclick=()=>{

cerrarHojaReporte();
seleccionarTarea(id);

};

const sheet=document.getElementById("ot-bottom-sheet");

const content=document.getElementById("ot-sheet-content");

sheet.classList.remove("hidden");

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
INIT AUTH
===================================================== */

auth.onAuthStateChanged(async(user)=>{

if(!user){

window.location.href="login.html";
return;

}

await initLocalDB();

inicializarBottomSheet();

const userDoc=await getDoc(doc(db,"users",user.uid));

const data=userDoc.data();

edificioIdGlobal=data.edificioId;

if(!edificioIdGlobal){

alert("Perfil sin edificio asignado");
return;

}

if(ordenId){

document.getElementById("listaTareasHoy").classList.add("hidden");

document.getElementById("flujoTecnico").classList.remove("hidden");

}else{

cargarTareasProgramadas();
cargarRutinaPreventiva();

}

});
/* =====================================================
CARGA DE TAREAS PROGRAMADAS (OPTIMIZADA CON CACHE)
===================================================== */

async function cargarTareasProgramadas(){

const contenedor=document.getElementById("contenedor-tareas-diarias");

if(!contenedor || !edificioIdGlobal) return;


/* ----------------------------------
1️⃣ CARGAR DESDE CACHE PRIMERO
---------------------------------- */

const cacheTareas=await cacheLeerTodos("tareas");

if(cacheTareas.length>0){

renderizarTareas(cacheTareas);

}


/* ----------------------------------
2️⃣ SI OFFLINE → SALIR
---------------------------------- */

if(!isOnline){

console.log("Modo offline: usando cache");

return;

}


/* ----------------------------------
3️⃣ CONSULTA FIRESTORE
---------------------------------- */

const q=query(

collection(db,"servicios_b2b"),

where("edificioId","==",edificioIdGlobal),

where("status","in",["pendiente","programado","en_proceso"])

);


onSnapshot(q,async(snapshot)=>{

contenedor.innerHTML="";

window.tareasDiariasGlobal={};

await cacheLimpiar("tareas");

if(snapshot.empty){

contenedor.innerHTML=`
<div class="p-8 text-center text-zinc-600 text-xs">
Sin tareas activas
</div>`;

sincronizarRutinasMaestras();

return;

}


snapshot.forEach(async(docSnap)=>{

const tarea=docSnap.data();

const id=docSnap.id;

const data={id,...tarea};

await cacheGuardar("tareas",data);

window.tareasDiariasGlobal[id]=tarea;

});

renderizarTareas(await cacheLeerTodos("tareas"));

});

}


/* =====================================================
RENDER TARJETAS TAREAS
===================================================== */

function renderizarTareas(tareas){

const contenedor=document.getElementById("contenedor-tareas-diarias");

contenedor.innerHTML="";

tareas.forEach(tarea=>{

window.tareasDiariasGlobal[tarea.id]=tarea;

const div=document.createElement("div");

div.className="mb-3 p-4 glass-card rounded-2xl border border-zinc-800 flex justify-between items-center cursor-pointer";

div.onclick=()=>abrirHojaReporte(tarea.id);

div.innerHTML=`

<div>

<h4 class="text-lg font-black italic uppercase">
${tarea.equipo || "Mantenimiento"}
</h4>

<p class="text-xs text-emerald-500">
${tarea.descripcion || "Revisión técnica"}
</p>

</div>

<div class="text-xs text-zinc-500">
VER OT
</div>

`;

contenedor.appendChild(div);

});

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
RENDER HISTORIAL
===================================================== */

function renderizarHistorial(items){

const contenedor=document.getElementById("lista-historial-unificada");

contenedor.innerHTML="";

if(items.length===0){

contenedor.innerHTML=`
<div class="p-6 text-center text-zinc-600">
Sin historial
</div>
`;

return;

}


items.forEach(item=>{

const div=document.createElement("div");

div.className="p-4 rounded-xl border border-zinc-800 mb-2";

div.innerHTML=`

<p class="text-xs font-black text-emerald-400">
${item.tipo} — ${item.titulo}
</p>

<p class="text-[10px] text-zinc-500">
${new Date(item.fecha).toLocaleString()}
</p>

<p class="text-xs text-zinc-300">
${item.descripcion}
</p>

`;

contenedor.appendChild(div);

});

}



/* =====================================================
SINCRONIZACIÓN PLAN MAESTRO RUTINAS
===================================================== */

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

const diag=document.getElementById("diagInput").value.trim();

const file=document.getElementById("fileAntes").files[0];

const btn=document.querySelector('#step1 button[onclick="enviarDiagnostico()"]');

if(!diag || !file){

showToast("Falta diagnóstico o foto",true);

return;

}

setButtonLoading(btn,true);

try{

let urlAntes=null;

if(isOnline){

ponst storageRef=ref(storage,path);
const storageRef=ref(storage,path);

await uploadBytes(storageRef,file);

urlAntes=await getDownloadURL(storageRef);

}else{

await guardarFotoOffline({
tipo:"antes",
ordenId,
file,
timestamp:Date.now()
});

}

const dataUpdate={

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


document.getElementById("step1").classList.add("step-inactive");

document.getElementById("step2").classList.remove("step-inactive");

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

const nombre=document.getElementById("mat-nombre").value.trim();

const cantidad=document.getElementById("mat-cantidad").value;

if(!nombre || !cantidad) return;

MaterialesTemporales.push({

nombre,

cantidad,

id:Date.now()

});

renderizarMateriales();

document.getElementById("mat-nombre").value="";

document.getElementById("mat-cantidad").value="";

};



function renderizarMateriales(){

const lista=document.getElementById("lista-materiales-acumulados");

lista.innerHTML="";

MaterialesTemporales.forEach(m=>{

const div=document.createElement("div");

div.className="flex justify-between bg-zinc-900 p-2 rounded";

div.innerHTML=`

<span>${m.cantidad}x ${m.nombre}</span>

<button onclick="removerMaterial(${m.id})">X</button>

`;

lista.appendChild(div);

});

}



window.removerMaterial=(id)=>{

MaterialesTemporales=MaterialesTemporales.filter(m=>m.id!==id);

renderizarMateriales();

};



window.confirmarMateriales=async()=>{

const btn=document.querySelector('#step2 button[onclick="confirmarMateriales()"]');

setButtonLoading(btn,true);

try{

const dataUpdate={

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


document.getElementById("step2").classList.add("step-inactive");

document.getElementById("step3").classList.remove("step-inactive");

showToast("Materiales guardados");

}catch(e){

showToast("Error guardando materiales",true);

}

setButtonLoading(btn,false);

};



/* =====================================================
PASO 3 EVIDENCIA FINAL
===================================================== */

window.subirEvidenciaFinal=async()=>{

const file=document.getElementById("fileDespues").files[0];

const obs=document.getElementById("obs-finales").value.trim();

const btn=document.getElementById("btnUploadDespues");

if(!file || !obs){

showToast("Falta evidencia o notas",true);

return;

}

setButtonLoading(btn,true);

try{

let urlDespues=null;

if(isOnline){

const path=`evidencias/${ordenId}/despues_${Date.now()}.jpg`;

const storageRef=ref(storage,path);

await uploadBytes(storageRef,file);

urlDespues=await getDownloadURL(storageRef);

}else{

await guardarFotoOffline({
tipo:"despues",
ordenId,
file,
timestamp:Date.now()
});

}

const dataUpdate={

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

document.getElementById("step3").classList.add("step-inactive");

document.getElementById("step4").classList.remove("step-inactive");

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

}true);

return;

}

const btn=document.querySelector('#step4 button[onclick="finalizarOrden()"]');

setButtonLoading(btn,true);

try{

let firmaUrl=null;

if(isOnline){

const firmaData=canvas.toDataURL("image/png");

const blob=await (await fetch(firmaData)).blob();

const storageRef=ref(soage,`firmas/${ordenId}.png`);
const storageRef=ref(storage,`firmas/${ordenId}.png`);

await ploadByts(storageRef,blob
await uploadBytes(storageRef,blob);

ficmaUrl=await gotDownloadURL(snorageRef);
firmaUrl=await getDownloadURL(storageRef);

}

const dataUpdate={

statss:"finalizado",
status:"finalizado",

fitma_co formidad:firmaUrl,
firma_conformidad:firmaUrl,

fecha_cierre:serverTimestamp()

};


if(isOnline){

await updateDoc(doc(db,"servicios_b2b",ordenId),dataUpdate)b
await updateDoc(doc(db,"servicios_b2b",ordenId),dataUpdate);

}else{

await agregarSyncPendiente({

type:"update",

collection:"servicios_b2b",
tn=document.querySelector('#step4 button[onclick="finalizarOrden()"]');

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
FIN ARCHIVO
GESTIA PREMIUM V5.22
===================================================== */
