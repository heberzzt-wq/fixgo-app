import { db, collection, addDoc } from './firebase-config.js';

// Esto nos confirmará en la consola que el cerebro está encendido
console.log("🚀 Cerebro de FixGo activado y conectado");

const form = document.getElementById('registroForm');

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submitBtn');
        const originalText = submitBtn.innerText;
        
        // Bloqueamos el botón para evitar múltiples envíos
        submitBtn.innerText = "ENVIANDO...";
        submitBtn.disabled = true;

        try {
            // Capturamos los datos de los 4 campos
            const campos = form.querySelectorAll('input');
            
            const datos = {
                nombre: campos[0].value,
                cedula: campos[1].value,
                vehiculo: campos[2].value,
                placas: campos[3].value,
                estatus: "pendiente",
                fechaRegistro: new Date().toISOString()
            };

            // Enviamos a la colección "solicitudes_tecnicos"
            await addDoc(collection(db, "solicitudes_tecnicos"), datos);

            alert("¡ÉXITO! Tu registro ha sido enviado a la base de datos.");
            form.reset();

        } catch (error) {
            console.error("Error al guardar:", error);
            alert("Hubo un error de conexión. Intenta de nuevo.");
        } finally {
            // Devolvemos el botón a su estado normal
            submitBtn.innerText = originalText;
            submitBtn.disabled = false;
        }
    });
} else {
    console.error("❌ No se encontró el formulario con ID 'registroForm'");
}
