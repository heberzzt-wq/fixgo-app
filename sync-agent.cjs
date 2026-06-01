/**
 * GESTIAPREMIUM SYNC AGENT V1
 * Puente entre Firestore y el Sistema de Archivos Local
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Cargamos las credenciales que guardaste en el Paso 1
const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

console.log("🦾 [SYNC_AGENT_ONLINE] Escuchando cambios en repo_files...");

// Escuchamos la colección repo_files
db.collection('repo_files')
  .where('status', '==', 'active')
  .onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
        if (change.type === "added" || change.type === "modified") {
            const data = change.doc.data();
            const filePath = path.join(__dirname, data.file);

            try {
                // Escribimos en el repo real
                fs.writeFileSync(filePath, data.content, 'utf8');
                console.log(`✅ [FILE_SYNCED] ${data.file} actualizado por Jarvis`);
            } catch (err) {
                console.error(`🚨 [SYNC_FAIL] No se pudo escribir ${data.file}:`, err);
            }
        }
    });
});