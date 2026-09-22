/* =====================================================
   🔐 GESTIA LOGIN RUNTIME V1
   Runtime limpio de autenticación
===================================================== */

import * as FirebaseCore
from "./firebase.js";
import { initializePlatformRelease } from "./platform-release.js";

initializePlatformRelease().catch(error => console.error("[GESTIA_RELEASE_AUTHORITY_FAILED]", error));

import {
    resolveGestiaRole
}
from "./gestia-core/auth/role-authority.js?v=role-authority-v3-single-navigation-20260713";

const auth =
    FirebaseCore.auth;

const db =
    FirebaseCore.db;

const loginParams =
    new URLSearchParams(window.location.search);

const customerIdentityResumeRequested =
    loginParams.get("resume") === "cliente-identity";

function customerIdentityNeedsCapture(profile = {}) {
    if (
        profile?.rol !== "cliente" ||
        profile?.tipo_cuenta !== "B2C" ||
        profile?.kyc?.identity_required !== true ||
        profile?.kyc?.identity_verified === true
    ) {
        return false;
    }

    return !(
        profile?.foto_perfil &&
        profile?.documentos?.ine &&
        profile?.documentos?.ine_reverso &&
        profile?.documentos?.selfie_liveness_left &&
        profile?.documentos?.selfie_liveness_right
    );
}

import {

    signInWithEmailAndPassword,
    sendPasswordResetEmail,

    GoogleAuthProvider,

    signInWithPopup,

    onAuthStateChanged

}
from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

document.getElementById('btnResetPassword')?.addEventListener('click', async () => {
    const email = document.querySelector('#formLogin [name="email"]')?.value.trim();
    if (!email) { alert('Escribe tu correo para establecer o recuperar tu contraseña.'); return; }
    try {
        await sendPasswordResetEmail(auth, email);
        alert('Si existe una cuenta para ese correo, recibirás las instrucciones de acceso.');
    } catch (error) {
        alert(error.code === 'auth/too-many-requests' ? 'Espera antes de volver a intentarlo.' : 'No se pudo solicitar la recuperación. Revisa el correo y tu conexión.');
    }
});

import {

    doc,
    getDoc

}
from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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

            let profile = {};

            if (snap.exists()) {

                profile =
                    snap.data() || {};
            }

            const roleResolution =
                resolveGestiaRole(
                    user,
                    profile
                );

            const role =
                roleResolution.role;

            console.log(
                "🧠 [LOGIN_ROLE]",
                role
            );

            if (!role) {
                if (!snap.exists()) {
                    let recovery = document.getElementById('registration-recovery');
                    if (!recovery) {
                        recovery = document.createElement('p'); recovery.id = 'registration-recovery';
                        const link = document.createElement('a'); link.href = 'registro.html';
                        link.textContent = 'Completar registro de esta cuenta';
                        recovery.append('Tu sesión está iniciada, pero falta guardar tu perfil. ', link);
                        (document.getElementById('formLogin') || document.body).append(recovery);
                    }
                }
                console.warn(
                    "⚠️ [LOGIN_ROLE_PENDING] Perfil sin rol confirmado"
                );
                return;
            }

            const resumeCustomerIdentity =
                customerIdentityNeedsCapture(profile) &&
                (customerIdentityResumeRequested || profile?.kyc?.identity_machine_status === "pending_capture");

            if (resumeCustomerIdentity) {
                console.log("🪪 [LOGIN_IDENTITY_RECOVERY] Reanudando misma cuenta B2C", user.uid);
                window.location.replace("registro.html?resume=cliente-identity");
                return;
            }

            FirebaseCore.verificarYRedireccionar({
                ...user,
                ...profile,
                rol: role
            });

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
