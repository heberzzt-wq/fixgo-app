import { db, collection, addDoc } from './firebase-config.js';

console.log("📱 Sistema de Clientes FixGo activado");

const form = document.getElementById('clienteForm');

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submitBtn');
        submitBtn.innerText = "REGISTRANDO...";
        submitBtn.disabled = true;

        try {
            const campos = form.querySelectorAll('input');
            
            const datos = {
                nombre: campos[0].value,
                telefono: campos[1].value,
                direccion: campos[2].value,
                email: campos[3].value,
                tipo: "cliente_particular",
                fechaAlta: new Date().toISOString()
            };

            // Guardamos en una colección DIFERENTE: "clientes"
            await addDoc(collection(db, "clientes"), datos);

            alert("¡Bienvenido a FixGo! Tu cuenta ha sido creada.");
            form.reset();

        } catch (error) {
            console.error("Error:", error);
            alert("No pudimos registrarte. Revisa tu conexión.");
        } finally {
            submitBtn.innerText = "CREAR MI CUENTA";
            submitBtn.disabled = false;
        }
    });
}
