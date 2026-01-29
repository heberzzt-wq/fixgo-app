import { db, storage, collection, addDoc, ref, uploadBytes, getDownloadURL } from './firebase-config.js';

const form = document.getElementById('registroForm');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Cambiamos el botón para mostrar que está cargando
    const submitBtn = form.querySelector('button');
    submitBtn.innerText = "PROCESANDO SOLICITUD...";
    submitBtn.disabled = true;

    try {
        // 1. Capturamos los datos del formulario
        const nombre = form.querySelector('input[placeholder*="Nombre"]').value;
        const cedula = form.querySelector('input[placeholder*="Cédula"]').value;
        const vehiculoDesc = form.querySelector('input[placeholder*="Marca"]').value;
        const placas = form.querySelector('input[placeholder*="Placas"]').value;
        
        // 2. Subir imagen del vehículo (si existe)
        const fotoVehiculo = form.querySelectorAll('input[type="file"]')[1].files[0];
        let fotoURL = "";
        
        if (fotoVehiculo) {
            const storageRef = ref(storage, `vehiculos/${Date.now()}_${fotoVehiculo.name}`);
            await uploadBytes(storageRef, fotoVehiculo);
            fotoURL = await getDownloadURL(storageRef);
        }

        // 3. Guardar todo en la base de datos Firestore
        await addDoc(collection(db, "solicitudes_tecnicos"), {
            nombre,
            cedula,
            vehiculo: {
                descripcion: vehiculoDesc,
                placas: placas,
                foto: fotoURL
            },
            estatus: "pendiente",
            fechaRegistro: new Date().toISOString()
        });

        alert("¡Solicitud enviada con éxito! Revisaremos tus documentos pronto.");
        form.reset();
        window.location.href = "index.html";

    } catch (error) {
        console.error("Error al registrar:", error);
        alert("Hubo un error al enviar. Revisa tu conexión.");
    } finally {
        submitBtn.innerText = "ENVIAR SOLICITUD DE ALTA";
        submitBtn.disabled = false;
    }
});
