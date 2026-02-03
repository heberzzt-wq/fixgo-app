import { db, doc, updateDoc, serverTimestamp } from "./firebase.js";

// --- CONFIGURACIÓN DEL MOTOR ---
const CONFIG = {
    distanciaMinima: 10, // Metros mínimos para actualizar base de datos
    precisionAlta: true,
    timeout: 5000
};

export const MotorGPS = {
    watchId: null,
    ultimaPosicion: null,

    // 1. Iniciar Rastreo para el Técnico
    iniciarRastreo: (userId, onUpdate) => {
        if (!navigator.geolocation) return alert("GPS no disponible");

        MotorGPS.watchId = navigator.geolocation.watchPosition(
            async (pos) => {
                const { latitude, longitude } = pos.coords;
                const nuevaPos = { lat: latitude, lng: longitude };

                // Solo actualizamos si se ha movido lo suficiente (Ahorro de Datos)
                if (!MotorGPS.ultimaPosicion || MotorGPS.calcularDistancia(MotorGPS.ultimaPosicion, nuevaPos) > CONFIG.distanciaMinima) {
                    
                    MotorGPS.ultimaPosicion = nuevaPos;

                    // Actualizar Firebase
                    try {
                        await updateDoc(doc(db, "tecnicos", userId), {
                            ubicacion: nuevaPos,
                            lastSeen: serverTimestamp(),
                            online: true
                        });
                        if (onUpdate) onUpdate(nuevaPos);
                    } catch (e) {
                        console.error("Error al reportar GPS:", e);
                    }
                }
            },
            (err) => console.warn("Error capturando GPS:", err),
            { 
                enableHighAccuracy: CONFIG.precisionAlta, 
                timeout: CONFIG.timeout 
            }
        );
    },

    // 2. Detener Rastreo
    detenerRastreo: () => {
        if (MotorGPS.watchId) {
            navigator.geolocation.clearWatch(MotorGPS.watchId);
            MotorGPS.watchId = null;
        }
    },

    // 3. Cálculo de distancia (Haversine) para evitar escrituras basura
    calcularDistancia: (pos1, pos2) => {
        const R = 6371e3; // Radio de la Tierra en metros
        const φ1 = pos1.lat * Math.PI / 180;
        const φ2 = pos2.lat * Math.PI / 180;
        const Δφ = (pos2.lat - pos1.lat) * Math.PI / 180;
        const Δλ = (pos2.lng - pos1.lng) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distancia en metros
    }
};

// --- LÓGICA DE INTERPOLACIÓN (SUAVIZADO DE MAPA) ---
export const SuavizadorMapa = {
    // Mueve el marcador poco a poco en lugar de dar saltos
    moverSuave: (marker, nuevaPos, pasos = 100) => {
        let inicio = {
            lat: marker.getPosition().lat(),
            lng: marker.getPosition().lng()
        };
        let i = 0;
        
        const intervalo = setInterval(() => {
            i++;
            let lat = inicio.lat + (nuevaPos.lat - inicio.lat) * (i / pasos);
            let lng = inicio.lng + (nuevaPos.lng - inicio.lng) * (i / pasos);
            marker.setPosition({ lat, lng });

            if (i === pasos) clearInterval(intervalo);
        }, 10); // 10ms por micro-paso
    }
};
