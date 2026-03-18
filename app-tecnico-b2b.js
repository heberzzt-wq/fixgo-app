/**
 * GESTIA PREMIUM - V5.21
 * MOTOR DE OPERACIONES B2B
 * Archivo: app-tecnico-b2b.js
 * Parte 1/3
 * Arquitectura: Firebase v10 + JS Modules
 */

// ======================================================
// IMPORTACIONES
// ======================================================

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

// ======================================================
// EXPOSICIÓN GLOBAL BASE
// ======================================================

window.auth = auth;

// ======================================================
// ESTADO GLOBAL
// ======================================================

let ordenId = new URLSearchParams(window.location.search).get("id");

let canvas = null;
let ctx = null;
let isDrawing = false;

let MaterialesTemporales = [];

let edificioIdGlobal = null;

let rutinaDiariaTareas = [];
let rutinaCompletadaIds = new Set();

window.tareasDiariasGlobal = {};

let hasFirmaDrawn = false;

// ======================================================
// UTILIDADES UI
// ======================================================

function showToast(message, isError = false) {

const toast = document.createElement("div");

toast.className =
`fixed bottom-24 left-1/2 -translate-x-1/2 p-3 rounded-lg text-white text-xs font-bold z-50
${isError ? "bg-red-600" : "bg-emerald-600"}`;

toast.innerText = message;

document.body.appendChild(toast);

setTimeout(() => {
toast.style.opacity = "0";
setTimeout(() => toast.remove(), 300);
}, 3000);

}

function setButtonLoading(button, isLoading, originalText = "Acción") {

if (!button) return;

if (isLoading) {

button.disabled = true;
button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> PROCESANDO`;

} else {

button.disabled = false;
button.innerHTML = originalText;

}

}

// ======================================================
// NAVEGACIÓN
// ======================================================

function cambiarSeccion(seccionDestino) {

const secciones = [
"seccion-tareas",
"seccion-historial",
"seccion-perfil"
];

secciones.forEach(seccion => {

const el = document.getElementById(seccion);

if (!el) return;

if (seccion === seccionDestino) {
el.classList.remove("hidden");
} else {
el.classList.add("hidden");
}

});

if (seccionDestino === "seccion-historial") {

cargarHistorialUnificado();

}

}

window.cambiarSeccion = cambiarSeccion;

// ======================================================
// LOGOUT
// ======================================================

function logout() {

if (!confirm("¿Cerrar sesión del técnico?")) return;

signOut(auth)
.then(() => {

window.location.href = "login.html";

})
.catch((error) => {

console.error("Error logout", error);

});

}

window.logout = logout;

// ======================================================
// BOTTOM SHEET OT
// ======================================================

function inicializarBottomSheet() {

if (document.getElementById("ot-bottom-sheet")) return;

const sheet = document.createElement("div");

sheet.id = "ot-bottom-sheet";

sheet.className =
"fixed inset-0 z-[100] flex flex-col justify-end hidden";

sheet.innerHTML = `

<div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="cerrarHojaReporte()"></div>

<div id="ot-sheet-content"
class="relative bg-zinc-950 border-t border-zinc-800 rounded-t-3xl p-6 transform translate-y-full transition-transform duration-300 w-full max-w-md mx-auto">

<div class="flex justify-between items-center mb-4">

<h2 id="ot-equipo" class="text-xl font-black text-white">EQUIPO</h2>

<button onclick="cerrarHojaReporte()" class="text-zinc-400 text-lg">✕</button>

</div>

<p id="ot-descripcion" class="text-sm text-zinc-300 mb-4"></p>

<div class="flex justify-between text-xs text-zinc-500 mb-6">

<span id="ot-ubicacion"></span>
<span id="ot-fecha"></span>

</div>

<button id="btn-iniciar-ot"
class="w-full bg-emerald-500 text-black font-bold py-3 rounded-xl">
INICIAR SERVICIO
</button>

</div>
`;

document.body.appendChild(sheet);

}

// ======================================================
// ABRIR HOJA OT
// ======================================================

function abrirHojaReporte(id) {

const tarea = window.tareasDiariasGlobal[id];

if (!tarea) return;

document.getElementById("ot-equipo").innerText =
tarea.equipo || "Mantenimiento";

document.getElementById("ot-descripcion").innerText =
tarea.descripcion || "";

document.getElementById("ot-ubicacion").innerText =
tarea.ubicacion_especifica || "Ubicación general";

document.getElementById("ot-fecha").innerText =
tarea.fecha_programada || new Date().toLocaleDateString();

document.getElementById("btn-iniciar-ot").onclick = () => {

cerrarHojaReporte();
seleccionarTarea(id);

};

const sheet = document.getElementById("ot-bottom-sheet");
const content = document.getElementById("ot-sheet-content");

sheet.classList.remove("hidden");

setTimeout(() => {

content.classList.remove("translate-y-full");

}, 10);

}

window.abrirHojaReporte = abrirHojaReporte;

// ======================================================
// CERRAR HOJA OT
// ======================================================

function cerrarHojaReporte() {

const sheet = document.getElementById("ot-bottom-sheet");
const content = document.getElementById("ot-sheet-content");

if (!sheet || !content) return;

content.classList.add("translate-y-full");

setTimeout(() => {

sheet.classList.add("hidden");

}, 300);

}

window.cerrarHojaReporte = cerrarHojaReporte;

// ======================================================
// SEGURIDAD CASETA
// FIX JONATHAN
// ======================================================

async function validarPaseCaseta() {

const user = auth.currentUser;

if (!user) return false;

const userDoc = await getDoc(doc(db, "users", user.uid));

if (!userDoc.exists()) return false;

const data = userDoc.data();

const tienePlacas =
data.tecnico_placas ||
data.placas ||
(data.logistica && data.logistica.placas);

if (!tienePlacas) {

alert("🚨 BLOQUEO DE SEGURIDAD: Debes registrar placas para pase de caseta.");

return false;

}

return true;

}

window.validarPaseCaseta = validarPaseCaseta;

// ======================================================
// SELECCIÓN OT
// ======================================================

async function seleccionarTarea(id) {

const ok = await validarPaseCaseta();

if (!ok) return;

ordenId = id;

cerrarHojaReporte();

document.getElementById("listaTareasHoy").classList.add("hidden");

document.getElementById("flujoTecnico").classList.remove("hidden");

}

window.seleccionarTarea = seleccionarTarea;

// ======================================================
// AUTH INIT
// ======================================================

auth.onAuthStateChanged(async (user) => {

if (!user) {

window.location.href = "login.html";
return;

}

inicializarBottomSheet();

try {

const userDoc = await getDoc(doc(db, "users", user.uid));

if (!userDoc.exists()) {

document.body.innerHTML = "<h1>Error perfil</h1>";
return;

}

const data = userDoc.data();

if (!data.edificioId) {

document.body.innerHTML =
"<h1>Perfil sin edificio asignado</h1>";
return;

}

edificioIdGlobal = data.edificioId;

} catch (e) {

console.error("Error perfil:", e);
return;

}

if (ordenId) {

document.getElementById("listaTareasHoy").classList.add("hidden");

document.getElementById("flujoTecnico").classList.remove("hidden");

} else {

cargarTareasProgramadas();
cargarRutinaPreventiva();

}

});
// ======================================================
// SINCRONIZACIÓN AUTOMÁTICA DE RUTINAS
// ======================================================

async function sincronizarRutinasMaestras() {

if (!edificioIdGlobal) return;

const inicioDia = new Date();
inicioDia.setHours(0,0,0,0);

const qCheck = query(
collection(db,"servicios_b2b"),
where("edificioId","==",edificioIdGlobal),
where("fecha_creacion",">=",inicioDia),
where("origen","==","sistema_rutinas")
);

const checkSnap = await getDocs(qCheck);

if (!checkSnap.empty) {

console.log("Rutinas ya generadas hoy");
return;

}

console.log("Sincronizando plan maestro de rutinas");

try {

const rutinaRef = doc(db,"config_rutinas",edificioIdGlobal);

const rutinaSnap = await getDoc(rutinaRef);

if (!rutinaSnap.exists()) {

console.log("No existe configuración de rutinas");
return;

}

const master = rutinaSnap.data();

let tareasAInyectar = [];

const hoy = new Date();
const diaSemana = hoy.getDay();
const diaMes = hoy.getDate();
const mes = hoy.getMonth();

if (master.Diaria && Array.isArray(master.Diaria)) {

tareasAInyectar.push(...master.Diaria);

}

if (diaSemana === 1 && master.Semanal_Quincenal) {

tareasAInyectar.push(...master.Semanal_Quincenal);

}

if (diaMes === 1 && master.Mensual) {

tareasAInyectar.push(...master.Mensual);

}

if (diaMes === 1 && mes === 0 && master.Semestral_Anual) {

tareasAInyectar.push(...master.Semestral_Anual);

}

if (tareasAInyectar.length === 0) {

console.log("Sin tareas para hoy");
return;

}

const promesas = tareasAInyectar.map(tarea => {

return addDoc(collection(db,"servicios_b2b"),{

edificioId: edificioIdGlobal,

descripcion: tarea.descripcion || "Mantenimiento general",

equipo: tarea.equipo || "General",

ubicacion_especifica: tarea.ubicacion || "Sin definir",

prioridad: tarea.prioridad || "media",

status: "pendiente",

tipo: "preventivo",

fecha_programada: hoy.toISOString().split("T")[0],

fecha_creacion: serverTimestamp(),

origen: "sistema_rutinas",

creado_por_nombre: "Sistema automático"

});

});

await Promise.all(promesas);

showToast(`Rutinas sincronizadas: ${tareasAInyectar.length}`);

} catch(e){

console.error("Error sincronizando rutinas",e);

}

}

// ======================================================
// CARGAR TAREAS PROGRAMADAS
// ======================================================

function cargarTareasProgramadas(){

const cont = document.getElementById("contenedor-tareas-diarias");

if(!cont || !edificioIdGlobal) return;

const q = query(
collection(db,"servicios_b2b"),
where("edificioId","==",edificioIdGlobal),
where("status","in",["pendiente","programado","en_proceso"])
);

onSnapshot(q,(snapshot)=>{

cont.innerHTML="";

window.tareasDiariasGlobal={};

if(snapshot.empty){

cont.innerHTML=`
<div class="p-8 text-center text-xs text-zinc-500">
Sin tareas activas. Verificando plan maestro...
</div>
`;

sincronizarRutinasMaestras();

return;

}

snapshot.forEach(docSnap=>{

const tarea = docSnap.data();
const id = docSnap.id;

window.tareasDiariasGlobal[id] = tarea;

const div = document.createElement("div");

div.className="mb-3 p-4 border border-zinc-800 rounded-xl cursor-pointer";

div.onclick=()=>abrirHojaReporte(id);

div.innerHTML=`

<h4 class="font-bold text-white">
${tarea.equipo || "Equipo"}
</h4>

<p class="text-xs text-emerald-500">
${tarea.descripcion || ""}
</p>

<p class="text-[10px] text-zinc-500">
${tarea.ubicacion_especifica || "Ubicación general"}
</p>

`;

cont.appendChild(div);

});

},(error)=>{

console.error("Error snapshot tareas",error);

});

}

// ======================================================
// MOTOR RUTINA PREVENTIVA
// ======================================================

async function cargarRutinaPreventiva(){

if(!edificioIdGlobal) return;

const rutinaContainer=document.getElementById("rutinaPreventiva");

const checklistContainer=document.getElementById("checklist-rutinas");

if(!rutinaContainer || !checklistContainer) return;

try{

const rutinaRef = doc(db,"config_rutinas",edificioIdGlobal);

const rutinaSnap = await getDoc(rutinaRef);

if(!rutinaSnap.exists()){

rutinaContainer.classList.add("hidden");
return;

}

rutinaContainer.classList.remove("hidden");

const rutinaMaster=rutinaSnap.data();

let tareasDelDia=[];

const hoy=new Date();
const diaSemana=hoy.getDay();
const diaMes=hoy.getDate();

if(rutinaMaster.Diaria)
tareasDelDia.push(...rutinaMaster.Diaria);

if(diaSemana===1 && rutinaMaster.Semanal_Quincenal)
tareasDelDia.push(...rutinaMaster.Semanal_Quincenal);

if(diaMes===1 && rutinaMaster.Mensual)
tareasDelDia.push(...rutinaMaster.Mensual);

rutinaDiariaTareas=tareasDelDia;

const fechaHoyStr=hoy.toISOString().split("T")[0];

const qLogs=query(
collection(db,"log_rutinas"),
where("edificioId","==",edificioIdGlobal),
where("fechaCompletado","==",fechaHoyStr)
);

const logSnapshot=await getDocs(qLogs);

rutinaCompletadaIds=new Set(
logSnapshot.docs.map(d=>d.data().tareaId)
);

renderizarChecklist();

}catch(e){

console.error("Error rutina preventiva",e);

}

}

// ======================================================
// RENDER CHECKLIST
// ======================================================

function renderizarChecklist(){

const checklistContainer=document.getElementById("checklist-rutinas");

if(!checklistContainer) return;

if(rutinaDiariaTareas.length===0){

checklistContainer.innerHTML=
`<p class="text-xs text-zinc-500">No hay tareas hoy</p>`;

return;

}

checklistContainer.innerHTML=rutinaDiariaTareas.map(tarea=>{

const completed=rutinaCompletadaIds.has(tarea.id_tarea);

return`

<div class="border border-zinc-800 p-3 rounded-lg mb-2 flex justify-between">

<div>
<p class="text-xs font-bold ${completed?'line-through text-emerald-400':'text-white'}">
${tarea.descripcion}
</p>

<p class="text-[9px] text-zinc-500">
${tarea.equipo}
</p>
</div>

<div>

${!completed ? `

<button onclick="marcarRutinaOK('${tarea.id_tarea}',this)"
class="bg-emerald-600 text-white text-[10px] px-3 py-1 rounded">
OK
</button>

<button onclick="reportarHallazgoEnRutina('${encodeURIComponent(JSON.stringify(tarea))}')"
class="bg-red-600 text-white text-[10px] px-2 py-1 rounded">
!
</button>

` : `<span class="text-emerald-500">✔</span>`}

</div>

</div>

`;

}).join("");

}

// ======================================================
// MARCAR RUTINA OK
// ======================================================

async function marcarRutinaOK(tareaId,button){

if(rutinaCompletadaIds.has(tareaId)) return;

setButtonLoading(button,true,"OK");

try{

const fechaHoyStr=new Date().toISOString().split("T")[0];

await addDoc(collection(db,"log_rutinas"),{

edificioId:edificioIdGlobal,
tecnicoId:auth.currentUser.uid,
tecnicoNombre:auth.currentUser.displayName || "Tecnico",
tareaId:tareaId,
fechaCompletado:fechaHoyStr,
timestamp:serverTimestamp(),
status:"ok",
novedad:false

});

rutinaCompletadaIds.add(tareaId);

renderizarChecklist();

showToast("Rutina registrada");

}catch(e){

console.error(e);
showToast("Error guardando rutina",true);

setButtonLoading(button,false,"OK");

}

}

// ======================================================
// REPORTAR HALLAZGO
// ======================================================

async function reportarHallazgoEnRutina(tareaString){

const tarea=JSON.parse(decodeURIComponent(tareaString));

if(!confirm(`Crear OT por hallazgo en "${tarea.descripcion}"?`))
return;

try{

const newTicket={

edificioId:edificioIdGlobal,

ubicacion_especifica:tarea.ubicacion,

descripcion:`HALLAZGO EN RUTINA: ${tarea.descripcion}`,

equipo:tarea.equipo,

prioridad:tarea.prioridad || "media",

status:"en_proceso",

fecha_programada:new Date().toISOString().split("T")[0],

tipo:"correctivo_rutina",

fecha_creacion:serverTimestamp(),

origen_rutina_id:tarea.id_tarea

};

const docRef=await addDoc(
collection(db,"servicios_b2b"),
newTicket
);

showToast("OT correctiva creada");

window.location.href=`?id=${docRef.id}`;

}catch(e){

console.error("Error hallazgo",e);
showToast("Error creando OT",true);

}

}

window.reportarHallazgoEnRutina = reportarHallazgoEnRutina;

// ======================================================
// HISTORIAL UNIFICADO
// ======================================================

async function cargarHistorialUnificado(){

const cont=document.getElementById("lista-historial-unificada");

if(!cont || !edificioIdGlobal) return;

try{

const qServicios=query(
collection(db,"servicios_b2b"),
where("edificioId","==",edificioIdGlobal),
where("status","==","finalizado"),
orderBy("fecha_cierre","desc"),
limit(50)
);

const qRutinas=query(
collection(db,"log_rutinas"),
where("edificioId","==",edificioIdGlobal),
orderBy("timestamp","desc"),
limit(100)
);

const [serviciosSnap,rutinasSnap]=await Promise.all([
getDocs(qServicios),
getDocs(qRutinas)
]);

let historial=[];

serviciosSnap.forEach(d=>{

const data=d.data();

historial.push({

fecha:data.fecha_cierre?.toDate() || new Date(),
tipo:"OT",
titulo:data.equipo,
desc:data.observaciones_finales || ""

});

});

rutinasSnap.forEach(d=>{

const data=d.data();

historial.push({

fecha:data.timestamp?.toDate() || new Date(),
tipo:"RUTINA",
titulo:data.tareaId,
desc:data.status

});

});

historial.sort((a,b)=>b.fecha-a.fecha);

cont.innerHTML=historial.map(item=>`

<div class="border border-zinc-800 p-3 rounded-xl mb-2">

<p class="text-xs font-bold">
${item.tipo} - ${item.titulo}
</p>

<p class="text-[10px] text-zinc-500">
${item.fecha.toLocaleString()}
</p>

<p class="text-xs text-zinc-300">
${item.desc}
</p>

</div>

`).join("");

}catch(e){

console.error("Error historial",e);

}

}
// ======================================================
// PASO 1 - DIAGNÓSTICO
// ======================================================

async function enviarDiagnostico() {

const diag = document.getElementById("diagInput")?.value.trim();
const file = document.getElementById("fileAntes")?.files[0];

const btn = document.querySelector('#step1 button[onclick="enviarDiagnostico()"]');
const originalText = btn ? btn.innerHTML : "ENVIAR";

if (!diag || !file) {

showToast("Falta diagnóstico o foto inicial", true);
return;

}

setButtonLoading(btn, true);

try {

const path = `evidencias/${ordenId}/antes_${Date.now()}.jpg`;

const storageRef = ref(storage, path);

await uploadBytes(storageRef, file);

const urlAntes = await getDownloadURL(storageRef);

await updateDoc(doc(db,"servicios_b2b",ordenId),{

diagnostico_inicial: diag,
foto_antes: urlAntes,
status: "en_proceso",
fecha_diagnostico: serverTimestamp()

});

showToast("Diagnóstico guardado");

document.getElementById("step1")?.classList.add("step-inactive");
document.getElementById("step2")?.classList.remove("step-inactive");

} catch(e){

console.error(e);
showToast("Error subiendo diagnóstico",true);

} finally {

setButtonLoading(btn,false,originalText);

}

}

window.enviarDiagnostico = enviarDiagnostico;


// ======================================================
// PASO 2 - MATERIALES
// ======================================================

function agregarMaterial(){

const nombre = document.getElementById("mat-nombre")?.value.trim();
const cantidad = document.getElementById("mat-cantidad")?.value;

if(!nombre || !cantidad) return;

const item = {
nombre,
cantidad,
id: Date.now()
};

MaterialesTemporales.push(item);

renderizarMateriales();

document.getElementById("mat-nombre").value="";
document.getElementById("mat-cantidad").value="";

}

window.agregarMaterial = agregarMaterial;

function renderizarMateriales(){

const lista = document.getElementById("lista-materiales-acumulados");

if(!lista) return;

lista.innerHTML = MaterialesTemporales.map(m=>`

<div class="flex justify-between bg-zinc-900 p-2 rounded mb-2 text-[10px]">

<span>${m.cantidad}x <b>${m.nombre}</b></span>

<button onclick="removerMaterial(${m.id})" class="text-red-500">X</button>

</div>

`).join("");

}

function removerMaterial(id){

MaterialesTemporales = MaterialesTemporales.filter(m=>m.id!==id);

renderizarMateriales();

}

window.removerMaterial = removerMaterial;

async function confirmarMateriales(){

const btn = document.querySelector('#step2 button[onclick="confirmarMateriales()"]');
const originalText = btn ? btn.innerHTML : "CONFIRMAR";

setButtonLoading(btn,true);

try{

await updateDoc(doc(db,"servicios_b2b",ordenId),{

materiales_utilizados: MaterialesTemporales

});

showToast("Materiales guardados");

document.getElementById("step2")?.classList.add("step-inactive");
document.getElementById("step3")?.classList.remove("step-inactive");

}catch(e){

console.error(e);
showToast("Error guardando materiales",true);

}finally{

setButtonLoading(btn,false,originalText);

}

}

window.confirmarMateriales = confirmarMateriales;


// ======================================================
// PASO 3 - EVIDENCIA FINAL
// ======================================================

async function subirEvidenciaFinal(){

const file = document.getElementById("fileDespues")?.files[0];
const obs = document.getElementById("obs-finales")?.value.trim();

if(!file || !obs){

showToast("Falta evidencia o observaciones",true);
return;

}

const btn = document.getElementById("btnUploadDespues");
const originalText = btn ? btn.innerHTML : "SUBIR";

setButtonLoading(btn,true);

try{

const path = `evidencias/${ordenId}/despues_${Date.now()}.jpg`;

const storageRef = ref(storage,path);

await uploadBytes(storageRef,file);

const urlDespues = await getDownloadURL(storageRef);

await updateDoc(doc(db,"servicios_b2b",ordenId),{

foto_despues: urlDespues,
observaciones_finales: obs

});

showToast("Evidencia final subida");

document.getElementById("step3")?.classList.add("step-inactive");
document.getElementById("step4")?.classList.remove("step-inactive");

initSignaturePad();

}catch(e){

console.error(e);
showToast("Error subiendo evidencia",true);

}finally{

setButtonLoading(btn,false,originalText);

}

}

window.subirEvidenciaFinal = subirEvidenciaFinal;


// ======================================================
// FIRMA DIGITAL (SOPORTE MÓVIL)
// ======================================================

function initSignaturePad(){

canvas = document.getElementById("signaturePad");

if(!canvas) return;

ctx = canvas.getContext("2d");

const rect = canvas.getBoundingClientRect();

canvas.width = rect.width;
canvas.height = rect.height;

function getPos(e){

const r = canvas.getBoundingClientRect();

if(e.touches){

return {
x: e.touches[0].clientX - r.left,
y: e.touches[0].clientY - r.top
};

}

return {
x: e.clientX - r.left,
y: e.clientY - r.top
};

}

function start(e){

isDrawing = true;

const p = getPos(e);

ctx.beginPath();
ctx.moveTo(p.x,p.y);

}

function draw(e){

if(!isDrawing) return;

hasFirmaDrawn = true;

const p = getPos(e);

ctx.lineTo(p.x,p.y);

ctx.strokeStyle="#10b981";
ctx.lineWidth=2;

ctx.stroke();

}

function stop(){

isDrawing=false;

}

canvas.addEventListener("mousedown",start);
canvas.addEventListener("mousemove",draw);
window.addEventListener("mouseup",stop);

canvas.addEventListener("touchstart",start);
canvas.addEventListener("touchmove",draw);
canvas.addEventListener("touchend",stop);

}

function clearSignature(){

if(!ctx || !canvas) return;

ctx.clearRect(0,0,canvas.width,canvas.height);

hasFirmaDrawn=false;

}

window.clearSignature = clearSignature;


// ======================================================
// CIERRE DE ORDEN
// ======================================================

async function finalizarOrden(){

const btn = document.querySelector('#step4 button[onclick="finalizarOrden()"]');
const originalText = btn ? btn.innerHTML : "FINALIZAR";

setButtonLoading(btn,true);

try{

if(!hasFirmaDrawn){

throw new Error("Firma obligatoria");

}

const firmaData = canvas.toDataURL("image/png");

const storageRef = ref(storage,`firmas/${ordenId}.png`);

const blob = await (await fetch(firmaData)).blob();

await uploadBytes(storageRef,blob);

const firmaUrl = await getDownloadURL(storageRef);

await updateDoc(doc(db,"servicios_b2b",ordenId),{

status:"finalizado",
firma_conformidad:firmaUrl,
fecha_cierre:serverTimestamp()

});

await addDoc(collection(db,"bitacora_edificios"),{

edificioId:edificioIdGlobal,
servicioId:ordenId,
fecha:serverTimestamp(),
tecnico:auth.currentUser.displayName || "Tecnico",
tecnico_uid:auth.currentUser.uid,
resumen:document.getElementById("obs-finales")?.value,
materiales_utilizados:MaterialesTemporales

});

showToast("Orden finalizada");

window.location.reload();

}catch(e){

console.error(e);

showToast(e.message,true);

}finally{

setButtonLoading(btn,false,originalText);

}

}

window.finalizarOrden = finalizarOrden;


// ======================================================
// PREVIEW IMAGEN
// ======================================================

function previewImg(input,divId){

const file = input.files[0];

if(!file) return;

const reader = new FileReader();

reader.onload = e => {

document.getElementById(divId).innerHTML =
`<img src="${e.target.result}" class="w-full h-full object-cover rounded">`;

};

reader.readAsDataURL(file);

}

window.previewImg = previewImg;


// ======================================================
// CIERRE RUTINA DIARIA
// ======================================================

async function finalizarRutinaDiaria(){

const total = rutinaDiariaTareas.length;
const completadas = rutinaCompletadaIds.size;

if(completadas < total){

alert(`Faltan ${total-completadas} tareas`);

return;

}

if(!confirm("Cerrar bitácora de rutina diaria?")) return;

const btn = document.getElementById("btnFinalizarRutina");

setButtonLoading(btn,true,"FINALIZANDO");

try{

await addDoc(collection(db,"bitacora_edificios"),{

edificioId:edificioIdGlobal,

servicioId:`RUTINA-${new Date().toISOString().split("T")[0]}`,

fecha:serverTimestamp(),

tecnico:auth.currentUser.displayName || "Tecnico",

tecnico_uid:auth.currentUser.uid,

resumen:`Rutina preventiva completada ${completadas}/${total}`,

tipo:"RUTINA_PREVENTIVA"

});

showToast("Rutina cerrada");

btn.innerHTML="RUTINA CERRADA";
btn.disabled=true;

}catch(e){

console.error(e);
showToast("Error cerrando rutina",true);

setButtonLoading(btn,false,"FINALIZAR");

}

}

window.finalizarRutinaDiaria = finalizarRutinaDiaria;
