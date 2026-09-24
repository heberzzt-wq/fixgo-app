import { escaparHTML, urlHttpsParaHTML } from "./app-utils.js";

function renderB2cCrewSnapshot(service={}){
  const snapshot=service.crew_snapshot&&typeof service.crew_snapshot==="object"?service.crew_snapshot:null;
  if(!snapshot)return"";
  const members=Array.isArray(snapshot.members)?snapshot.members:[];
  const responsible=snapshot.responsible||{};
  const photo=urlHttpsParaHTML(responsible.foto);
  return `<div class="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-3">
    <p class="text-[9px] text-emerald-400 font-black uppercase tracking-widest"><i class="fas fa-people-group"></i> Personas declaradas para este servicio</p>
    <p class="text-[10px] text-zinc-400 mt-1">${escaparHTML(snapshot.provider_name||service.tecnico_nombre||"Proveedor")} · ${Number(snapshot.member_count||1+members.length)} persona(s)</p>
    <div class="mt-3 space-y-2">
      <div class="flex items-center gap-2 rounded-lg bg-black/30 p-2">
        ${photo?`<img src="${photo}" class="w-8 h-8 rounded-full object-cover">`:'<div class="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center"><i class="fas fa-user-shield text-zinc-500"></i></div>'}
        <div><p class="text-[10px] text-white font-black">${escaparHTML(responsible.nombre||service.tecnico_nombre||"Responsable")}</p><p class="text-[8px] text-emerald-400 uppercase">Responsable verificado</p></div>
      </div>
      ${members.map(member=>{const memberPhoto=urlHttpsParaHTML(member.foto);return `<div class="flex items-center gap-2 rounded-lg bg-black/30 p-2">${memberPhoto?`<img src="${memberPhoto}" class="w-8 h-8 rounded-full object-cover">`:'<div class="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center"><i class="fas fa-user text-zinc-500"></i></div>'}<div><p class="text-[10px] text-white font-black">${escaparHTML(member.nombre||"Integrante")}</p><p class="text-[8px] text-zinc-500 uppercase">${escaparHTML(member.funcion||"integrante")}</p></div></div>`;}).join("")}
    </div>
  </div>`;
}

export { renderB2cCrewSnapshot };
