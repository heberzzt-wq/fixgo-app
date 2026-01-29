import { db, collection, addDoc } from './firebase-config.js';

console.log("🚀 El archivo app-registro.js se ha cargado correctamente");

const form = document.getElementById('registroForm');

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button');
        submitBtn.innerText = "PROCESANDO...";
        submitBtn.disabled = true;

        try {
            const campos = form.querySelectorAll('input[type="text"]');
            const datos = {
                nombre: campos[0]?.value || "Sin nombre",
                cedula: campos[1]?.value || "Sin cédula",
                vehiculo: campos[2]?.value || "Sin vehículo",
                placas: campos[3]?.value || "Sin placas",
                estatus: "pendiente",
                fechaRegistro: new Date().toISOString()
            };

            await addDoc(collection(db, "solicitudes_tecnicos"), datos);
            alert("¡ÉXITO! Datos guardados en la base de datos.");
            form.reset();
        } catch (error) {
            console.error("Error:", error);
            alert("Error de conexión: " + error.message);
        } finally {
            submitBtn.innerText = "ENVIAR SOLICITUD DE ALTA";
            submitBtn.disabled = false;
        }
    });
}
