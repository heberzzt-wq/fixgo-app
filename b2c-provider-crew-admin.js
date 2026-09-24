import { revisarMiembroCuadrillaB2C } from "./firebase.js";
import { escaparHTML } from "./app-utils.js";

function safeUrl(value){
  try{const parsed=new URL(String(value||""));return parsed.protocol==="https:"?parsed.href:"";}catch{return"";}
}

function renderMember(member,providerId){
  const photo=safeUrl(member.profile_photo_url);
  const evidence=member.evidence||{};
  const links=["profile_photo","ine_front","ine_back"].map(kind=>{
    const url=safeUrl(evidence[kind]?.url);
    return url?`<a href="${escaparHTML(url)}" target="_blank" class="text-[9px] text-blue-300 underline">${kind}</a>`:`<span class="text-[9px] text-red-400">${kind} faltante</span>`;
  }).join(" · ");
  const provider=JSON.stringify(providerId),id=JSON.stringify(member.member_id),canApprove=member.identity_machine_status==="verified"&&member.status!=="activo";
  return `<div class="rounded-xl border border-zinc-700 bg-zinc-950 p-3 mb-3">
    <div class="flex items-center gap-3">
      ${photo?`<img src="${escaparHTML(photo)}" class="w-10 h-10 rounded-full object-cover border border-white/10">`:'<div class="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center"><i class="fas fa-user"></i></div>'}
      <div class="min-w-0 flex-1"><p class="text-xs text-white font-black">${escaparHTML(member.full_name||"Integrante")}</p><p class="text-[9px] text-zinc-500 uppercase">${escaparHTML(member.role||"otro")} · ${escaparHTML(member.status||"pendiente")}</p><p class="text-[9px] ${member.identity_duplicate_suspected?"text-red-400":member.identity_machine_status==="verified"?"text-emerald-400":"text-amber-400"}">Identidad: ${escaparHTML(member.identity_machine_status||"pending_capture")}</p></div>
    </div>
    <div class="mt-2">${links}</div>
    ${member.identity_duplicate_suspected?'<p class="mt-2 text-[9px] text-red-400 font-black">BLOQUEO: identidad duplicada.</p>':""}
    ${canApprove?`<button data-crew-review='${escaparHTML(JSON.stringify({providerId,memberId:member.member_id,action:"approve"}))}' class="mt-3 w-full bg-emerald-600 text-white text-[9px] font-black py-2 rounded-lg">APROBAR INTEGRANTE</button>`:""}
    ${["pendiente_revision","correccion_requerida"].includes(member.status)?`<button data-crew-review='${escaparHTML(JSON.stringify({providerId,memberId:member.member_id,action:"return"}))}' class="mt-2 w-full bg-amber-600 text-black text-[9px] font-black py-2 rounded-lg">DEVOLVER / RECAPTURAR</button>`:""}
    ${member.status==="activo"?`<button data-crew-review='${escaparHTML(JSON.stringify({providerId,memberId:member.member_id,action:"suspend"}))}' class="mt-2 w-full border border-red-700 text-red-300 text-[9px] font-black py-2 rounded-lg">SUSPENDER</button>`:""}
  </div>`;
}

async function handleReview(payload,target){
  let reason="";
  if(payload.action==="return"){reason=prompt("¿Qué debe corregir este integrante?")||"";if(reason.trim().length<8)return;}
  else if(payload.action==="suspend"){reason=prompt("Motivo de suspensión:")||"Suspensión administrativa";if(!confirm("¿Suspender a este integrante?"))return;}
  else if(!confirm("¿Aprobar a este integrante para formar parte de cuadrillas declaradas?"))return;
  try{await revisarMiembroCuadrillaB2C({...payload,reason});await renderAdminCrewReview({providerId:payload.providerId,target});}catch(e){alert(e?.message||"No fue posible revisar al integrante.");}
}

async function renderAdminCrewReview({providerId,target}){
  const node=typeof target==="string"?document.getElementById(target):target;if(!node)return;
  node.innerHTML='<p class="text-[10px] text-zinc-500"><i class="fas fa-circle-notch fa-spin mr-2"></i>Cargando plantilla...</p>';
  try{
    const result=await revisarMiembroCuadrillaB2C({action:"list",providerId}),members=Array.isArray(result?.members)?result.members:[];
    node.innerHTML='<p class="text-[10px] text-blue-400 font-black uppercase mb-3"><i class="fas fa-users"></i> Plantilla B2C</p>'+(members.length?members.map(member=>renderMember(member,providerId)).join(""):'<p class="text-[10px] text-zinc-500">Sin integrantes registrados.</p>');
    node.querySelectorAll("[data-crew-review]").forEach(btn=>btn.addEventListener("click",()=>{try{handleReview(JSON.parse(btn.getAttribute("data-crew-review")),node);}catch{}}));
  }catch(e){console.error("[ADMIN_B2C_CREW_LIST]",e);node.innerHTML='<p class="text-[10px] text-red-300">No fue posible cargar la plantilla.</p>';}
}

export { renderAdminCrewReview };
