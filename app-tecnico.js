import {
  auth,
  db,
  onAuthStateChanged,
  signOut,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from "./firebase.js";

/* =========================
   FIXGO · TÉCNICO APP
========================= */

const $ = id => document.getElementById(id);
let gpsWatch = null;

/* ---------- SESIÓN ---------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "login.html";

  const ref = doc(db, "tecnicos", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      nombre: "Técnico FixGo",
      estado: "DISPONIBLE",
      nivel: "BRONCE",
      gpsActivo: false
    });
  }

  escucharRadar();
  escucharMision(user.uid);
});

/* ---------- GPS ---------- */
$("btnGps")?.addEventListener("click", () => {
  gpsWatch ? detenerGPS() : iniciarGPS();
});

function iniciarGPS() {
  gpsWatch = navigator.geolocation.watchPosition(async pos => {
    const user = auth.currentUser;
    if (!user) return;

    await updateDoc(doc(db, "tecnicos", user.uid), {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      gpsActivo: true,
      ultimaActualizacion: serverTimestamp()
    });
  });

  $("gpsStatus").innerText = "GPS ACTIVO";
}

function detenerGPS() {
  navigator.geolocation.clearWatch(gpsWatch);
  gpsWatch = null;
  $("gpsStatus").innerText = "GPS OFF";
}

/* ---------- RADAR ---------- */
function escucharRadar() {
  const cont = $("listaServicios");
  if (!cont) return;

  const q = query(collection(db, "solicitudes"), where("estado", "==", "SOLICITADO"));

  onSnapshot(q, snap => {
    cont.innerHTML = "";
    snap.forEach(docSnap => {
      const s = docSnap.data();
      cont.innerHTML += `
        <div class="bg-slate-800 p-6 rounded-2xl mb-4">
          <p class="text-white font-black">${s.direccion}</p>
          <button onclick="aceptar('${docSnap.id}')" class="mt-4 w-full bg-blue-600 text-white py-3 rounded-xl">
            Aceptar
          </button>
        </div>
      `;
    });
  });
}

window.aceptar = async (id) => {
  const user = auth.currentUser;
  if (!user) return;

  await updateDoc(doc(db, "solicitudes", id), {
    estado: "EN_CAMINO",
    tecnicoId: user.uid,
    fechaAceptado: serverTimestamp()
  });

  await updateDoc(doc(db, "tecnicos", user.uid), {
    estado: "EN SERVICIO",
    servicioActualId: id
  });

  iniciarGPS();
};

/* ---------- MISIÓN ---------- */
function escucharMision(uid) {
  const q = query(collection(db, "solicitudes"), where("tecnicoId", "==", uid));

  onSnapshot(q, snap => {
    const activo = snap.docs.find(d =>
      ["EN_CAMINO", "EN_SITIO"].includes(d.data().estado)
    );

    if (!activo) return;

    $("panelAccionesTecnico").innerHTML = `
      <button onclick="finalizar('${activo.id}')" class="w-full bg-emerald-600 text-white py-4 rounded-xl">
        Finalizar Servicio
      </button>
    `;
  });
}

window.finalizar = async (id) => {
  const user = auth.currentUser;
  if (!user) return;

  await updateDoc(doc(db, "solicitudes", id), {
    estado: "FINALIZADO",
    fechaFin: serverTimestamp()
  });

  await updateDoc(doc(db, "tecnicos", user.uid), {
    estado: "DISPONIBLE",
    servicioActualId: null
  });
};

$("btnLogout")?.addEventListener("click", () => signOut(auth));
