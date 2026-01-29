import { db, collection, addDoc } from './firebase-config.js';

console.log("🚀 Sistema FixGo activado");

const form = document.getElementById('registroForm');

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submitBtn');
        submitBtn.innerText = "PROCESANDO...";
        submitBtn.disabled = true;

        try {
            const campos = form.querySelectorAll('input[type="text"]');
            const datos = {
                nombre: campos[0].value,
                cedula: campos[1].value,
                vehiculo: campos[2].value,
                placas: campos[3].value,
                estatus: "pendiente",
                fechaRegistro: new Date().toISOString()
            };

            await addDoc(collection(db, "solicitudes_tecnicos"), datos);

            alert("¡ÉXITO! Tu solicitud ha sido enviada correctamente.");
            form.reset();

        } catch (error) {
            console.error("Error:", error);
            alert("Error al enviar. Revisa tu conexión.");
        } finally {
            submitBtn.innerText = "ENVIAR SOLICITUD DE ALTA";
            submitBtn.disabled = false;
        }
    });
}
