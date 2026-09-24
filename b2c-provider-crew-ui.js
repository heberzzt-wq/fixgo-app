import { storage, gestionarCuadrillaB2C, verificarIdentidadMiembroB2C } from "./firebase.js";
import { ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { TECHNICIAN_KYC_STATES, B2C_PROVIDER_MAX_MEMBERS, storagePathForCrewMemberEvidence } from "./b2c-technician-profile.js";
import { escaparHTML, urlHttpsParaHTML } from "./app-utils.js";

function ensureSection(anchor){
  let section=document.getElementById("miPlantillaB2C");
  if(!section&&anchor?.parentElement){section=document.createElement("section");section.id="miPlantillaB2C";anchor.parentElement.insertBefore(section,anchor);}
  return section;
}

function memberCard(member){
  const photo=urlHttpsParaHTML(member.profile_photo_url)||"assets/gestiapremium-icon.svg";
  const state=member.status==="activo"?"border-emerald-500/30":member.identity_duplicate_suspected?"border-red-500/40":"border-amber-500/30";
  const id=JSON.stringify(member.member_id);
  return `<div class="rounded-xl border ${state} bg-black/40 p-3">
    <div class="flex items-center gap-3">
      <img src="${photo}" class="w-11 h-11 rounded-full object-cover border border-white/10" alt="Integrante">
      <div class="min-w-0 flex-1">
        <p class="text-white text-xs font-black truncate">${escaparHTML(member.full_name||"Integrante")}</p>
        <p class="text-[9px] text-zinc-500 uppercase">${escaparHTML(member.role||"otro")} · ${escaparHTML(member.status||"pendiente")}</p>
        <p class="text-[9px] mt-1 ${member.identity_machine_status==="verified"?"text-emerald-400":member.identity_duplicate_suspected?"text-red-400":"text-amber-400"}">Identidad: ${escaparHTML(member.identity_machine_status||"pending_capture")}</p>
      </div>
      ${member.status==="activo"?`<label class="text-[9px] text-zinc-400 flex items-center gap-2">TURNO <input type="checkbox" ${member.on_duty?"checked":""} data-crew-duty=${id} class="accent-emerald-500"></label>`:""}
    </div>
    ${member.status==="activo"?`<button type="button" data-crew-deactivate=${id} class="mt-3 w-full rounded-lg border border-red-900/50 py-2 text-[9px] font-black text-red-300">DAR DE BAJA</button>`:""}
  </div>`;
}

async function renderManager({user,profile,anchor}){
  const section=ensureSection(anchor),provider=profile?.provider_profile||{};
  if(!section)return;
  if(!provider.crew_enabled){section.innerHTML="";return;}
  if(profile.estado!==TECHNICIAN_KYC_STATES.ACTIVE||profile.kyc?.aprobado!==true){
    section.innerHTML=`<div class="bg-zinc-950 border border-zinc-800 rounded-xl p-4 mb-4"><p class="text-[10px] text-blue-400 font-black tracking-widest">MI PLANTILLA B2C</p><p class="text-xs text-zinc-400 mt-2">Tu modalidad <strong class="text-white">${escaparHTML(provider.mode||"equipo")}</strong> ya quedó registrada. Podrás agregar integrantes cuando Administración apruebe tu cuenta principal.</p></div>`;return;
  }
  section.innerHTML='<div class="bg-zinc-950 border border-zinc-800 rounded-xl p-4 mb-4 text-xs text-zinc-500"><i class="fas fa-circle-notch fa-spin mr-2"></i>Cargando plantilla...</div>';
  try{
    const result=await gestionarCuadrillaB2C({action:"list"}),members=Array.isArray(result?.members)?result.members:[],active=members.filter(m=>m.status==="activo").length;
    section.innerHTML=`<div class="bg-zinc-950 border border-blue-500/20 rounded-xl p-4 mb-4">
      <div class="flex justify-between gap-3 items-start mb-3"><div><p class="text-[10px] text-blue-400 font-black tracking-widest">MI PLANTILLA B2C</p><p class="text-sm text-white font-black mt-1">${escaparHTML(provider.display_name||profile.nombre||"Mi equipo")}</p><p class="text-[9px] text-zinc-500 mt-1">${escaparHTML(provider.mode||"equipo")} · ${active} aprobados · máximo ${B2C_PROVIDER_MAX_MEMBERS-1} integrantes + responsable</p></div><button type="button" data-crew-add class="bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-black px-3 py-2 rounded-lg"><i class="fas fa-user-plus mr-1"></i> AGREGAR</button></div>
      <div class="space-y-2">${members.length?members.map(memberCard).join(""):'<p class="text-[10px] text-zinc-500 text-center py-4">Aún no has registrado integrantes.</p>'}</div>
      <p class="mt-3 text-[9px] text-zinc-600">Sólo integrantes aprobados y marcados EN TURNO se declararán en nuevos servicios.</p>
    </div>`;
    section.querySelector("[data-crew-add]")?.addEventListener("click",()=>openMemberModal({user,profile,anchor}));
    section.querySelectorAll("[data-crew-duty]").forEach(input=>input.addEventListener("change",async()=>{try{await gestionarCuadrillaB2C({action:"set_on_duty",memberId:JSON.parse(input.getAttribute("data-crew-duty")),onDuty:input.checked});}catch(e){alert(e?.message||"No fue posible actualizar el turno.");}await renderManager({user,profile,anchor});}));
    section.querySelectorAll("[data-crew-deactivate]").forEach(btn=>btn.addEventListener("click",async()=>{if(!confirm("¿Dar de baja a este integrante?"))return;try{await gestionarCuadrillaB2C({action:"deactivate",memberId:JSON.parse(btn.getAttribute("data-crew-deactivate"))});}catch(e){alert(e?.message||"No fue posible darlo de baja.");}await renderManager({user,profile,anchor});}));
  }catch(e){console.error("[B2C_CREW_LIST]",e);section.innerHTML='<div class="bg-red-950/20 border border-red-500/30 rounded-xl p-4 mb-4 text-xs text-red-300">No fue posible cargar tu plantilla.</div>';}
}

function openMemberModal({user,profile,anchor}){
  document.getElementById("modalAltaMiembroB2C")?.remove();
  document.body.insertAdjacentHTML("beforeend",`<div id="modalAltaMiembroB2C" class="fixed inset-0 z-[95] bg-black/95 p-4 flex items-center justify-center"><div class="bg-zinc-900 border border-blue-500/30 rounded-3xl p-5 w-full max-w-md max-h-[92vh] overflow-y-auto">
    <div class="flex justify-between items-start mb-4"><div><p class="text-[10px] text-blue-400 font-black tracking-widest">NUEVO INTEGRANTE B2C</p><h3 class="text-xl font-black text-white mt-1">Registrar persona</h3></div><button type="button" data-crew-close class="text-zinc-500"><i class="fas fa-times"></i></button></div>
    <input data-crew-name type="text" maxlength="160" placeholder="Nombre completo" class="uber-input w-full px-4 py-3 rounded-xl mb-3">
    <select data-crew-role class="uber-input w-full px-4 py-3 rounded-xl mb-3"><option value="ayudante">Ayudante</option><option value="tecnico">Técnico</option><option value="especialista">Especialista</option><option value="oficial">Oficial</option><option value="supervisor">Supervisor / encargado</option><option value="ingeniero">Ingeniero</option><option value="otro">Otro</option></select>
    <input data-crew-phone type="tel" maxlength="20" placeholder="Teléfono" class="uber-input w-full px-4 py-3 rounded-xl mb-4">
    <label class="block text-[10px] text-zinc-400 font-black mb-1">SELFIE FRONTAL</label><input data-crew-photo type="file" accept="image/jpeg,image/png,image/webp" capture="user" class="w-full text-xs text-zinc-400 mb-3">
    <label class="block text-[10px] text-zinc-400 font-black mb-1">INE FRENTE</label><input data-crew-front type="file" accept="image/jpeg,image/png,image/webp" capture="environment" class="w-full text-xs text-zinc-400 mb-3">
    <label class="block text-[10px] text-zinc-400 font-black mb-1">INE REVERSO</label><input data-crew-back type="file" accept="image/jpeg,image/png,image/webp" capture="environment" class="w-full text-xs text-zinc-400 mb-3">
    <p class="text-[9px] text-zinc-500 mb-4">La identidad se compara contra el registro biométrico global. El cliente nunca verá la INE.</p>
    <button data-crew-submit type="button" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl">VERIFICAR Y ENVIAR</button>
  </div></div>`);
  const modal=document.getElementById("modalAltaMiembroB2C");modal.querySelector("[data-crew-close]").onclick=()=>modal.remove();
  modal.querySelector("[data-crew-submit]").onclick=async()=>{
    const button=modal.querySelector("[data-crew-submit]"),fullName=modal.querySelector("[data-crew-name]").value.trim(),role=modal.querySelector("[data-crew-role]").value,phone=modal.querySelector("[data-crew-phone]").value.trim();
    const files={profile_photo:modal.querySelector("[data-crew-photo]").files[0],ine_front:modal.querySelector("[data-crew-front]").files[0],ine_back:modal.querySelector("[data-crew-back]").files[0]};
    if(fullName.length<3||phone.replace(/\D/g,"").length<7||Object.values(files).some(f=>!f)){alert("Completa nombre, teléfono, selfie e INE por ambos lados.");return;}
    const allowed=new Set(["image/jpeg","image/png","image/webp"]);if(Object.values(files).some(f=>!allowed.has(f.type)||f.size<=0||f.size>10*1024*1024)){alert("Usa JPG, PNG o WebP de máximo 10 MB.");return;}
    button.disabled=true;button.innerHTML='<i class="fas fa-spinner fa-spin mr-2"></i>VERIFICANDO...';
    try{
      const memberId=`m_${crypto.randomUUID().replace(/-/g,"")}`,evidence={};
      for(const [kind,file] of Object.entries(files)){const path=storagePathForCrewMemberEvidence(user.uid,memberId,kind,crypto.randomUUID().replace(/-/g,""),file.name);await uploadBytes(ref(storage,path),file,{contentType:file.type});evidence[kind]={path};}
      await gestionarCuadrillaB2C({action:"submit_member",memberId,fullName,role,phone,evidence});
      const identity=await verificarIdentidadMiembroB2C(memberId);modal.remove();
      if(identity?.status==="verified")alert("✅ Identidad verificada. Queda pendiente de aprobación administrativa.");
      else if(identity?.status==="duplicate_suspected")alert("🛡️ Identidad duplicada detectada. El integrante quedó bloqueado.");
      else alert("⚠️ La identidad requiere recaptura/revisión y no puede operar.");
      await renderManager({user,profile,anchor});
    }catch(e){console.error("[B2C_CREW_SUBMIT]",e);alert(e?.message||"No fue posible registrar al integrante.");button.disabled=false;button.textContent="VERIFICAR Y ENVIAR";}
  };
}

async function mountProviderCrewManager({user,profile,anchor}){return renderManager({user,profile,anchor});}

export { mountProviderCrewManager };
