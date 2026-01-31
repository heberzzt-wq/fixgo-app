// app-cliente.js
import { app } from "./firebase-config.js";
import { auth, onAuthStateChanged, signOut } from "./firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore(app);

// Elementos DOM
const listaServicios = document.getElementById("listaServicios");
const formSolicitud = document.getElementById("solicitudForm");
const btnCerrarSesion = document.getElementById("cerrarSesion");

// ===== PROTECCIÓN LOGIN =====
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {
        // Verificar rol en Firestore
        const q = query(collection(db, "clientes"), where("uid", "==", user.uid));
        const querySnap = await getDocs(q);
        if (querySnap.empty) {
            alert("❌ Acceso denegado. No eres cliente.");
            await signOut(auth);
            window.location.href = "login.html";
            return;
        }

        // Mostrar nombre del cliente
        const clienteData = querySnap.docs[0].data();
        document.getElementById("nombreCliente").innerText = clienteData.nombre || "Cliente";

        // Cargar solicitudes existentes
        cargarSolicitudes(user.uid);

    } catch (error) {
        console.error("Error verificando rol cliente:", error);
        alert("❌ Error verificando permisos.");
        await signOut(auth);
        window.location.href = "login.html";
    }
});

// ===== FUNCION CREAR NUEVA SOLICITUD =====
if (formSolicitud) {
    formSolicitud.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = formSolicitud.querySelector("button[type='submit']");
        btn.disabled = true;
        btn.innerText = "Enviando...";

        try {
            const user = auth.currentUser;
            if (!user) throw new Error("Usuario no autenticado.");

            const data = {
                clienteUid: user.uid,
                nombreCliente: formSolicitud.nombre.value.trim(),
                telefono: formSolicitud.telefono.value.trim(),
                direccion: formSolicitud.direccion.value.trim(),
                descripcion: formSolicitud.descripcion?.value.trim() || "",
                estado: "PENDIENTE",
                creadoEn: new Date().toISOString()
            };

            await addDoc(collection(db, "servicios"), data);
            alert("✅ Solicitud enviada correctamente.");
            formSolicitud.reset();
            btn.disabled = false;
            btn.innerText = "Enviar Solicitud";

            // Refrescar lista
            cargarSolicitudes(user.uid);

        } catch (error) {
            alert("❌ " + error.message);
            btn.disabled = false;
            btn.innerText = "Enviar Solicitud";
        }
    });
}

// ===== FUNCION PARA CARGAR SOLICITUDES =====
async function cargarSolicitudes(uid) {
    if (!listaServicios) return;

    listaServicios.innerHTML = "<p class='text-slate-400'>Cargando...</p>";

    try {
        const q = query(
            collection(db, "servicios"),
            where("clienteUid", "==", uid),
            orderBy("creadoEn", "desc")
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            listaServicios.innerHTML = "<p class='text-slate-400'>No tienes solicitudes registradas.</p>";
            return;
        }

        listaServicios.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            return `
                <div class="p-4 bg-slate-800/50 rounded-xl mb-3 shadow-md">
                    <p class="font-bold text-white">${data.descripcion || "Servicio sin descripción"}</p>
                    <p class="text-slate-400 text-sm">Dirección: ${data.direccion}</p>
                    <p class="text-slate-400 text-sm">Teléfono: ${data.telefono}</p>
                    <p class="text-slate-400 text-xs uppercase tracking-widest mt-1">Estado: ${data.estado}</p>
                </div>
            `;
        }).join("");

    } catch (error) {
        listaServicios.innerHTML = `<p class="text-red-500">Error cargando solicitudes: ${error.message}</p>`;
    }
}

// ===== CERRAR SESIÓN =====
if (btnCerrarSesion) {
    btnCerrarSesion.addEventListener("click", async () => {
        await signOut(auth);
        window.location.href = "login.html";
    });
}
