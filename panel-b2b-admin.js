import { auth, db, doc, getDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where, orderBy, limit, setDoc } from "./firebase.js";

let adminContext = null; 

console.log("⚡ GESTIA MASTER: NOC B2B Cabina de Mando v5.19 Online.");

// ======================================================
// RELOJ EN TIEMPO REAL
// ======================================================

setInterval(() => {
    const clock = document.getElementById('clock');
    if(clock) clock.innerText = new Date().toLocaleTimeString('es-MX', { hour12: false });
}, 1000);


// ======================================================
// 1. MONITOR DE ACCESO MASTER & CONTEXTO B2B (FIX)
// ======================================================

auth.onAuthStateChanged((userAuth) => {

    if (!userAuth) {
        window.location.href = "login.html";
        return;
    }

    // Escuchamos el perfil del usuario en tiempo real
    onSnapshot(doc(db, "users", userAuth.uid), (docSnap) => {

        if (!docSnap.exists()) {
            console.error("⛔ Perfil no encontrado en Firestore.");
            return;
        }

        adminContext = docSnap.data();

        // ------------------------------------------------
        // REGLA DE SEGURIDAD
        // ------------------------------------------------

        if (!adminContext.edificioId) {

            console.error("⛔ ERROR CRÍTICO: Admin B2B sin edificioId.");

            alert(
                "⚠️ PERFIL INCOMPLETO:\n" +
                "Tu usuario no está vinculado a ningún edificio.\n\n" +
                "Contacta a soporte para completar la vinculación."
            );

            document.getElementById("panelAdminB2B").classList.add("hidden");
            return;
        }

        // ------------------------------------------------
        // ACTIVACIÓN DE UI
        // ------------------------------------------------

        document.getElementById("panelAdminB2B").classList.remove("hidden");

        // Normalización de nombre
        const nombreEdificio =
            adminContext.edificioNombre ||
            adminContext.nombre_edificio ||
            "EDIFICIO SIN NOMBRE";

        const lbl = document.getElementById("lblNombreEdificio");
        if (lbl) lbl.innerText = nombreEdificio.toUpperCase();


        // ------------------------------------------------
        // DISPARO DE MONITORES
        // ------------------------------------------------

        escucharPlantillaRealTime(adminContext.edificioId);
        conectarContadorTickets(adminContext.edificioId);
        conectarContadorMantenimientosHoy(adminContext.edificioId);
        escucharBitacoraRealTime(adminContext.edificioId);
        escucharAvanceRutina(adminContext.edificioId);

    });

});


// ======================================================
// 2. REGISTRO DE ACTIVOS HUMANOS
// ======================================================

document.getElementById("formAltaPersonal").addEventListener("submit", async (e) => {

    e.preventDefault();
    if (!adminContext?.edificioId) return;

    const btn = document.getElementById("btnGuardarPersonal");

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> PROCESANDO...';

    const nuevoEmpleado = {

        nombre: document.getElementById("regNombre").value.trim(),
        telefono: document.getElementById("regTelefono").value.trim(),
        email: document.getElementById("regCorreo").value.trim().toLowerCase(),

        rol: document.getElementById("regRol").value,
        especialidad: document.getElementById("regEspecialidad").value,

        tecnico_vehiculo: "PENDIENTE",
        tecnico_placas: "000-000",

        edificioId: adminContext.edificioId,
        edificioNombre: adminContext.edificioNombre,

        estado: "activo",
        disponible: true,

        fecha_registro: serverTimestamp()
    };

    try {

        await addDoc(collection(db, "users"), nuevoEmpleado);

        alert("✅ Activo desplegado en el sistema.");

        document.getElementById("formAltaPersonal").reset();

    } catch (err) {

        alert("❌ Error de Firebase. Revisa las reglas.");

    } finally {

        btn.disabled = false;
        btn.innerHTML = "Dar de Alta en Red B2B";

    }

});


// ======================================================
// 3. DESPACHO DE ORDENES DE TRABAJO
// ======================================================

document.getElementById("formTicketB2B").addEventListener("submit", async (e) => {

    e.preventDefault();
    if (!adminContext) return;

    const btn = document.getElementById("btnCrearTicket");

    btn.disabled = true;
    btn.innerHTML = "ENVIANDO ORDEN...";

    const ticketData = {

        edificioId: adminContext.edificioId,
        edificioNombre: adminContext.edificioNombre,

        ubicacion_especifica: document.getElementById("tickPunto").value.trim(),
        descripcion: document.getElementById("tickDesc").value.trim(),

        prioridad: document.getElementById("tickPrioridad").value,
        tecnicoId: document.getElementById("tickAsignado").value,

        status: "programado",

        fecha_programada: new Date().toISOString().split('T')[0],

        equipo_nombre: "Mantenimiento General",
        tipo: "mantenimiento",

        fecha_creacion: serverTimestamp(),

        creado_por: auth.currentUser.uid
    };

    try {

        await addDoc(collection(db, "servicios_b2b"), ticketData);

        alert("🚀 ORDEN DESPACHADA");

        document.getElementById("formTicketB2B").reset();

    } catch (err) {

        alert("❌ Error al despachar orden.");

    } finally {

        btn.disabled = false;
        btn.innerHTML = "Despachar Orden de Trabajo";

    }

});


// ======================================================
// 4. RADAR DE PLANTILLA
// ======================================================

function escucharPlantillaRealTime(edificioId) {

    const q = query(
        collection(db, "users"),
        where("edificioId", "==", edificioId)
    );

    onSnapshot(q, (snap) => {

        const tabla = document.getElementById("tablaEmpleadosB2B");
        const select = document.getElementById("tickAsignado");

        if (!tabla) return;

        tabla.innerHTML = "";
        select.innerHTML = '<option value="">-- Seleccionar Especialista --</option>';

        let tecnicosActivos = 0;

        snap.forEach(docSnap => {

            const emp = docSnap.data();
            const empId = docSnap.id;

            if(emp.rol === "admin_b2b" || emp.rol === "ceo") return;

            if (emp.rol === "tecnico" && emp.estado === "activo") {

                tecnicosActivos++;

                const opt = document.createElement("option");

                opt.value = empId;
                opt.textContent =
                    `${(emp.nombre || 'SIN NOMBRE').toUpperCase()} ` +
                    `[${(emp.especialidad || 'GENERAL').toUpperCase()}]`;

                select.appendChild(opt);

            }

        });

        document.getElementById("countTecnicosActivos").innerText = tecnicosActivos;

    });

}


// ======================================================
// 5. CONTADORES
// ======================================================

function conectarContadorTickets(edificioId) {

    const q = query(
        collection(db, "servicios_b2b"),
        where("edificioId", "==", edificioId),
        where("status", "in", ["programado", "en_proceso"])
    );

    onSnapshot(q, (snap) => {
        document.getElementById("countOrdenesPendientes").innerText = snap.size;
    });

}

function conectarContadorMantenimientosHoy(edificioId) {

    const hoy = new Date().toISOString().split('T')[0];

    const q = query(
        collection(db, "servicios_b2b"),
        where("edificioId", "==", edificioId),
        where("fecha_programada", "==", hoy)
    );

    onSnapshot(q, (snap) => {
        document.getElementById("countMantenimientosHoy").innerText = snap.size;
    });

}


// ======================================================
// IMPORTADOR DE PLAN MAESTRO (FIX ROBUSTO)
// ======================================================

window.importarRutinaMaestra = async () => {

    if (!adminContext?.edificioId) {
        return alert("❌ ERROR: El contexto del edificio no ha cargado correctamente.");
    }

    const confirmacion = confirm(
        `¿Deseas importar el plan maestro para ${
            adminContext.edificioNombre || "este edificio"
        }?\n\nEsto actualizará las rutinas diarias, semanales y mensuales.`
    );

    if (!confirmacion) return;

    const btn = document.activeElement;

    const originalHTML = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SINCRONIZANDO...';

    try {

        const response = await fetch('./mantenimiento_edificio.json');

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}. Verifica que mantenimiento_edificio.json exista en la raíz.`
            );
        }

        const rutinaData = await response.json();

        const rutinaRef = doc(db, "config_rutinas", adminContext.edificioId);

        await setDoc(
            rutinaRef,
            {
                ...rutinaData,

                edificioId: adminContext.edificioId,

                lastUpdated: serverTimestamp(),

                updatedBy: auth.currentUser.uid,

                version_core: "5.19"
            },
            { merge: true }
        );

        console.log(
            "✅ Plan Maestro guardado en config_rutinas/" +
            adminContext.edificioId
        );

        alert("✅ SINCRONIZACIÓN EXITOSA");

    } catch (error) {

        console.error("❌ Error Crítico:", error);

        alert(
            `❌ ERROR DE SINCRONIZACIÓN\n\n${error.message}\n\nRevisa el JSON.`
        );

    } finally {

        btn.innerHTML = originalHTML;
        btn.disabled = false;

    }

};


// ======================================================
// LOGOUT
// ======================================================

window.logout = () => auth.signOut();
