/* =====================================================
   🔐 GESTIA LOGIN RUNTIME V1
   Runtime limpio de autenticación
===================================================== */

import * as FirebaseCore
from "./firebase.js";

const auth =
    FirebaseCore.auth;

const db =
    FirebaseCore.db;

import {

    signInWithEmailAndPassword,

    GoogleAuthProvider,

    signInWithPopup,

    onAuthStateChanged

}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {

    doc,
    getDoc

}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
/* =====================================================
   SESSION RESTORE
===================================================== */

onAuthStateChanged(

    auth,

    async (user) => {

        if (!user) {
            return;
        }

        try {

            const ref = doc(
                db,
                "users",
                user.uid
            );

            const snap =
                await getDoc(ref);

            let role =
                "cliente";

            if (snap.exists()) {

                role =
                    snap.data()?.rol ||
                    "cliente";
            }

            console.log(
                "🧠 [LOGIN_ROLE]",
                role
            );

            if (
                role === "admin"
            ) {

                window.location.href =
                    "admin.html";

                return;
            }

            if (

                role === "tecnico" ||

                role === "tecnico_gp" ||

                role === "tecnico_interno"

            ) {

                window.location.href =
                    "tecnico.html";

                return;
            }

            if (
                role === "b2b_admin"
            ) {

                window.location.href =
                    "panel-b2b-admin.html";

                return;
            }

            window.location.href =
                "cliente.html";

        }

        catch(err) {

            console.error(
                "🚨 [LOGIN_RESTORE_FATAL]",
                err
            );
        }
    }
);

/* =====================================================
   EMAIL LOGIN
===================================================== */

const form =
    document.getElementById(
        "formLogin"
    );

form?.addEventListener(

    "submit",

    async (e) => {

        e.preventDefault();

        try {

            const formData =
                new FormData(form);

            const email =
                String(
                    formData.get("email")
                ).trim();

            const password =
                String(
                    formData.get("password")
                );

            const btn =
                document.getElementById(
                    "btnLogin"
                );

            if (btn) {

                btn.disabled = true;

                btn.innerText =
                    "Autenticando...";
            }

            await signInWithEmailAndPassword(

                auth,
                email,
                password
            );

            console.log(
                "🧠 [LOGIN_SUCCESS]"
            );

        }

        catch(err) {

            console.error(
                "🚨 [LOGIN_ERROR]",
                err
            );

            alert(
                err?.message ||
                "Error de autenticación"
            );
        }

        finally {

            const btn =
                document.getElementById(
                    "btnLogin"
                );

            if (btn) {

                btn.disabled = false;

                btn.innerText =
                    "Entrar";
            }
        }
    }
);

/* =====================================================
   GOOGLE LOGIN
===================================================== */

document

    .getElementById(
        "btnLoginGoogle"
    )

    ?.addEventListener(

        "click",

        async () => {

            try {

                const provider =
                    new GoogleAuthProvider();

                await signInWithPopup(
                    auth,
                    provider
                );

                console.log(
                    "🧠 [GOOGLE_LOGIN_OK]"
                );

            }

            catch(err) {

                console.error(
                    "🚨 [GOOGLE_LOGIN_FAIL]",
                    err
                );

                alert(
                    "Google Login Error"
                );
            }
        }
    );

console.log(
    "🚀 [LOGIN_RUNTIME_V1] ONLINE"
);