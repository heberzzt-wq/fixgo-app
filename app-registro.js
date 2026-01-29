import { db, storage, collection, addDoc, ref, uploadBytes, getDownloadURL } from './firebase-config.js';

const form = document.getElementById('registroForm');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log("Formulario detectado, iniciando envío...");
    
    const submitBtn = form.querySelector('button');
    submitBtn.innerText = "PROCESANDO...";
    submitBtn.disabled = true;

    try {
        // Capturamos los campos
        const nombre = form.querySelector('input[type="text"]').value;
        // Buscamos el campo de cédula (el segundo input de texto)
        const inputs = form.querySelectorAll('input[type="text"]');
        const cedula = inputs[1] ? inputs[1].value : "No provista";

        console.log("Enviando datos de:", nombre);

        // Guardar en Firestore
        await addDoc(collection(db, "solicitudes_tecnicos"), {
            nombre: nombre,
            cedula: cedula,
            estatus: "pendiente",
            fechaRegistro: new Date().toISOString()
        });

        alert("¡ÉXITO! Datos guardados en la base de datos.");
        form.reset();

    } catch (error) {
        console.error("Error detallado:", error);
        alert("Error de conexión: " + error.message);
    } finally {
        submitBtn.innerText = "ENVIAR SOLICITUD DE ALTA";
        submitBtn.disabled = false;
    }
});
