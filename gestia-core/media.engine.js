// ==========================================
// 📸 GESTIA CORE: MEDIA ENGINE V1.0
// ==========================================
// Procesamiento multimodal: Optimización de imágenes y absorción de documentos.

/**
 * OPTIMIZACIÓN WEBP:
 * Reduce el peso de las imágenes un 90% manteniendo la calidad para la IA.
 */
export async function optimizarImagen(file, maxWidth = 1280) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = maxWidth / img.width;
                canvas.width = maxWidth;
                canvas.height = img.height * scale;

                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                // Exportación en WebP 0.5 (Balance perfecto para el Modo Tacaño)
                resolve(canvas.toDataURL('image/webp', 0.5));
            };
        };
        reader.onerror = () => reject(new Error("ERROR_LECTURA_FILESYSTEM"));
    });
}

/**
 * ABSORCIÓN DE DOCUMENTOS:
 * Convierte PDFs o archivos de código en texto o base64 para el buche de la IA.
 */
export async function procesarDocumento(file) {
    if (file.type === 'application/pdf') {
        return new Promise((res) => {
            const r = new FileReader();
            r.onload = e => res(e.target.result);
            r.readAsDataURL(file);
        });
    } else {
        // Para JS, HTML, CSS, TXT
        return await file.text();
    }
}
