<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FixGo | Panel Cliente</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-slate-50 min-h-screen p-4">

    <!-- 🔐 PANEL CLIENTE -->
    <div class="max-w-3xl mx-auto bg-white rounded-3xl shadow-2xl p-8 border border-slate-100">

        <div class="text-center mb-8">
            <div class="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
                <i class="fas fa-user-circle text-white text-2xl"></i>
            </div>
            <h1 id="nombreCliente" class="text-3xl font-black text-slate-800 tracking-tight">Cargando...</h1>
            <p class="text-slate-500 font-medium">Bienvenido al panel de cliente</p>
        </div>

        <!-- 📝 FORMULARIO NUEVA SOLICITUD -->
        <form id="clienteForm" class="space-y-5" data-rol="CLIENTE">
            <div>
                <input type="text" name="nombre" placeholder="Tu nombre" required
                    class="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none">
            </div>

            <div>
                <input type="tel" name="telefono" placeholder="WhatsApp o Celular" required
                    class="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none">
            </div>

            <div>
                <input type="text" name="direccion" placeholder="Dirección / Colonia" required
                    class="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none">
            </div>

            <div>
                <input type="email" name="correo" placeholder="Email" required
                    class="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none">
            </div>

            <button type="submit" id="submitBtn"
                class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-5 rounded-2xl text-xl shadow-lg shadow-indigo-500/30 transition-all transform active:scale-[0.98] mt-4">
                Crear Solicitud
            </button>
        </form>

        <!-- 🔔 LISTA DE SOLICITUDES -->
        <div class="mt-10">
            <h2 class="text-xl font-bold mb-4 text-slate-700">Mis Solicitudes</h2>
            <ul id="listaSolicitudes" class="space-y-4">
                <!-- Se llenará con JS -->
            </ul>
        </div>

    </div>

    <!-- 🔐 SCRIPT PANEL CLIENTE -->
    <script type="module">
        import { auth, onAuthStateChanged } from "./firebase-auth.js";
        import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
        import { app } from "./firebase-config.js";
        import "./app-cliente.js"; // Formularios y envíos

        const db = getFirestore(app);
        const nombreCliente = document.getElementById("nombreCliente");
        const lista = document.getElementById("listaSolicitudes");

        let clienteUid = null;

        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                window.location.href = "login.html";
                return;
            }
            clienteUid = user.uid;

            // Mostrar nombre del cliente
            const clienteRef = collection(db, "clientes");
            const q = query(clienteRef, where("uid", "==", clienteUid));
            onSnapshot(q, (snap) => {
                snap.forEach(doc => {
                    nombreCliente.innerText = doc.data().nombre || "Cliente";
                });
            });

            // Mostrar solicitudes en tiempo real
            const solicitudesRef = collection(db, "solicitudes");
            const qSolicitudes = query(solicitudesRef, where("clienteUid", "==", clienteUid));
            onSnapshot(qSolicitudes, (snap) => {
                lista.innerHTML = "";
                snap.forEach(doc => {
                    const data = doc.data();
                    const li = document.createElement("li");
                    li.className = "bg-slate-100/50 p-4 rounded-2xl shadow flex justify-between items-center";
                    li.innerHTML = `
                        <div>
                            <p><strong>Dirección:</strong> ${data.direccion}</p>
                            <p><strong>Teléfono:</strong> ${data.telefono}</p>
                            <p><strong>Estado:</strong> ${data.estado}</p>
                            <p><strong>Técnico:</strong> ${data.tecnicoUid || "Pendiente"}</p>
                        </div>
                    `;
                    lista.appendChild(li);
                });
            });
        });
    </script>

</body>
</html>
