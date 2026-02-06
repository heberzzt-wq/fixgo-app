import {
  auth,
  db,
  onAuthStateChanged,
  signOut,
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  onSnapshot
} from "./firebase.js";

/* =========================
   FIXGO · ADMIN APP
   Torre de Control
========================= */

const $ = id => document.getElementById(id);
let map;
let markersTecnicos = {};

/* ---------- AUTENTICACIÓN ADMIN ---------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "login.html";

  // 🔐 Validación básica Admin (en prod: Claims)
  const adminRef = doc(db, "admins", user.uid);
  const adminSnap = await getDoc(adminRef);

  if (!adminSnap.exists()) {
    alert("Acceso restringido");
    return signOut(auth);
  }

  if ($("nombreAdmin")) $("nombreAdmin").innerText = user.email;

  iniciarMapa();
  escucharTecnicos();
  escucharSolicitudes();
});

/* ---------- MAPA CENTRAL ---------- */
function iniciarMapa() {
  if (!$("map")) return;

  map = L.map("map").setView([21.1619, -86.8515], 12);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "FixGo Admin",
    maxZoom: 19
  }).addTo(map);
}

/* ---------- TÉCNICOS EN TIEMPO REAL ---------- */
function escucharTecnicos() {
  const cont = $("sectionTecnicos");

  onSnapshot(collection(db, "tecnicos"), snap => {
    if (cont) cont.innerHTML = "";

    snap.forEach(docSnap => {
      const t = docSnap.data();
      const id = docSnap.id;
      const ocupado = t.estado === "EN SERVICIO";
      const color = ocupado ? "bg-amber-500" : "bg-emerald-500";

      // LISTA LATERAL
      if (cont) {
        cont.innerHTML += `
          <div class="bg-white p-4 rounded-2xl shadow mb-3 cursor-pointer"
               onclick="map.setView([${t.lat || 21.16}, ${t.lng || -86.85}], 16)">
            <div class="flex justify-between items-center">
              <div>
                <h4 class="font-bold text-sm">${t.nombre || "Técnico"}</h4>
                <p class="text-[10px] text-slate-400">${t.estado}</p>
              </div>
              <div class="w-2 h-2 rounded-full ${color} ${ocupado ? 'animate-pulse' : ''}"></div>
            </div>
          </div>
        `;
      }

      // MAPA
      if (t.lat && t.lng) {
        const icon = L.divIcon({
          className: "custom-marker",
          html: `
            <div class="w-4 h-4 rounded-full ${ocupado ? 'bg-amber-500' : 'bg-emerald-500'}
                        border-2 border-white shadow-lg"></div>
          `
        });

        if (markersTecnicos[id]) {
          markersTecnicos[id].setLatLng([t.lat, t.lng]);
        } else {
          markersTecnicos[id] = L.marker([t.lat, t.lng], { icon })
            .addTo(map)
            .bindPopup(`<b>${t.nombre}</b><br>${t.estado}`);
        }
      }
    });
  });
}

/* ---------- SOLICITUDES GLOBALES ---------- */
function escucharSolicitudes() {
  const cont = $("sectionServicios");

  const q = query(
    collection(db, "solicitudes"),
    orderBy("fechaCreacion", "desc")
  );

  onSnapshot(q, snap => {
    if (cont) cont.innerHTML = "";

    snap.forEach(docSnap => {
      const s = docSnap.data();

      const colores = {
        SOLICITADO: "bg-slate-100 text-slate-600",
        EN_CAMINO: "bg-blue-50 text-blue-600",
        EN_SITIO: "bg-amber-50 text-amber-600",
        FINALIZADO: "bg-emerald-50 text-emerald-600"
      };

      if (cont) {
        cont.innerHTML += `
          <div class="p-3 border-b border-slate-100">
            <div class="flex justify-between mb-1">
              <span class="text-[9px] font-black px-2 py-1 rounded ${colores[s.estado]}">
                ${s.estado}
              </span>
              <span class="text-[9px] text-slate-400">${s.categoria}</span>
            </div>
            <p class="text-xs font-bold truncate">${s.direccion}</p>
            <p class="text-[9px] text-slate-400">
              Técnico: ${s.tecnicoId ? "Asignado" : "Pendiente"}
            </p>
          </div>
        `;
      }
    });
  });
}

/* ---------- LOGOUT ---------- */
$("btnLogout")?.addEventListener("click", () => {
  signOut(auth).then(() => location.href = "login.html");
});
