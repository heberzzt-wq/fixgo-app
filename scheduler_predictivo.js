// ======================================================
// MOTOR PREDICTIVO DE MANTENIMIENTO
// Analiza historial de OT y genera rutinas automáticamente
// ======================================================

const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

const TZ = "America/Mexico_City";

// ======================================================
// CONFIGURACION
// ======================================================

const CONFIG = {

    diasAnalisis: 30,

    umbralFallas: 3,

    frecuenciaSugerida: "mensual"

};

// ======================================================
// UTILIDADES
// ======================================================

function fechaHaceDias(dias){

    const d = new Date();

    d.setDate(d.getDate() - dias);

    return d;

}

// ======================================================
// ANALIZAR HISTORIAL DE FALLAS
// ======================================================

async function analizarEquipos(){

    const fechaInicio = fechaHaceDias(CONFIG.diasAnalisis);

    const snap = await db.collection("servicios_b2b")
        .where("tipo","==","correctivo")
        .where("creadoEn",">=",admin.firestore.Timestamp.fromDate(fechaInicio))
        .get();

    const contador = {};

    snap.docs.forEach(doc => {

        const s = doc.data();

        const key = `${s.edificioId}_${s.equipo}`;

        if(!contador[key]){

            contador[key] = {

                edificioId: s.edificioId,

                equipo: s.equipo,

                sistema: s.sistema,

                categoria: s.categoria,

                total: 0

            };

        }

        contador[key].total++;

    });

    return contador;

}

// ======================================================
// CREAR RUTINA AUTOMATICA
// ======================================================

async function crearRutinaAutomatica(data){

    const ref = db.collection("config_rutinas").doc();

    await ref.set({

        nombre:`Preventivo automático ${data.equipo}`,

        edificioId:data.edificioId,

        equipo:data.equipo,

        sistema:data.sistema,

        categoria:data.categoria,

        frecuencia:CONFIG.frecuenciaSugerida,

        prioridad:"alta",

        origen:"auto_predictivo",

        activo:true,

        creadoPor:"motor_predictivo",

        creadoEn:admin.firestore.FieldValue.serverTimestamp()

    });

    return ref.id;

}

// ======================================================
// VERIFICAR SI YA EXISTE RUTINA
// ======================================================

async function rutinaExiste(edificioId,equipo){

    const snap = await db.collection("config_rutinas")
        .where("edificioId","==",edificioId)
        .where("equipo","==",equipo)
        .limit(1)
        .get();

    return !snap.empty;

}

// ======================================================
// LOG
// ======================================================

async function logIA(data){

    await db.collection("logs_ia_mantenimiento").add({

        ...data,

        creadoEn:admin.firestore.FieldValue.serverTimestamp()

    });

}

// ======================================================
// MOTOR PRINCIPAL
// ======================================================

exports.schedulerAnalisisFallas = functions.pubsub
.schedule("0 3 * * *")
.timeZone(TZ)
.onRun(async ()=>{

    console.log("🔎 Analizando historial de fallas");

    try{

        const equipos = await analizarEquipos();

        let generadas = 0;

        for(const key in equipos){

            const eq = equipos[key];

            if(eq.total < CONFIG.umbralFallas){

                continue;

            }

            const existe = await rutinaExiste(eq.edificioId,eq.equipo);

            if(existe){

                continue;

            }

            const rutinaId = await crearRutinaAutomatica(eq);

            generadas++;

            await logIA({

                tipo:"rutina_auto_creada",

                rutinaId,

                equipo:eq.equipo,

                edificioId:eq.edificioId,

                fallasDetectadas:eq.total

            });

        }

        console.log(`Rutinas generadas: ${generadas}`);

        await logIA({

            tipo:"analisis_completado",

            rutinasGeneradas:generadas

        });

    }catch(err){

        console.error("Error motor predictivo:",err);

        await logIA({

            tipo:"error_motor_predictivo",

            error:err.message

        });

    }

});
