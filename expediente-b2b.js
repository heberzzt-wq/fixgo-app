import { auth, db, storage, app, doc, onSnapshot, signOut } from './firebase.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';
import { resolveB2bProfileAuthority, resolveGestiaRouteDecision } from './gestia-core/auth/role-authority.js';
import './gestia-core/contracts/b2c-platform-contract.js';
const submit = httpsCallable(getFunctions(app), 'submitB2bPersonnelKyc');
const status = document.getElementById('status');
const documents = document.getElementById('documents');
const send = document.getElementById('submit');
let profile = null;
let stop = null;
document.getElementById('logout').onclick = () => signOut(auth);
auth.onAuthStateChanged(user => {
    stop?.();
    if (!user) { location.replace('login.html'); return; }
    stop = onSnapshot(doc(db, 'users', user.uid), snapshot => {
        profile = snapshot.data();
        documents.replaceChildren(); documents.hidden = true; send.hidden = true;
        if (!profile || profile.tipo_cuenta !== 'B2B') { status.textContent = 'Esta cuenta no tiene un expediente B2B.'; return; }
        if (resolveB2bProfileAuthority(profile).authorized) {
            status.textContent = 'Expediente aprobado. Tu acceso está habilitado.';
            const link = document.createElement('a'); link.textContent = 'Entrar a mi plataforma';
            const route = resolveGestiaRouteDecision({ user, metadata: profile, pathname: '/expediente-b2b.html' });
            if (!route.target) { status.textContent = 'Acceso aprobado. Consulta con tu administrador la superficie de tu rol.'; return; }
            link.href = route.target;
            documents.append(link); documents.hidden = false; return;
        }
        if (profile.suspendido === true || profile.estado !== profile.status || !['documentos_pendientes', 'pendiente_revision'].includes(profile.estado)) {
            status.textContent = 'Tu cuenta requiere atención del administrador del edificio.'; return;
        }
        if (profile.estado === 'pendiente_revision') { status.textContent = 'Documentos enviados. El administrador de tu edificio debe revisar y aprobar tu expediente.'; return; }
        status.textContent = profile.kyc?.observaciones ? `Correcciones solicitadas: ${profile.kyc.observaciones}` : 'Sube tu identificación oficial y una foto de tu rostro. Cada archivo confirmado queda guardado para continuar después.';
        documents.hidden = false;
        for (const [kind, title] of [['ine', 'Identificación oficial (INE)'], ['foto_perfil', 'Foto de tu rostro']]) {
            const label = document.createElement('label'); label.textContent = title;
            const saved = kind === 'ine' ? profile.documentos?.ine : profile.foto_perfil;
            if (saved) { const link = document.createElement('a'); link.textContent = 'Ver archivo guardado'; link.href = saved; link.target = '_blank'; link.rel = 'noopener'; label.append(link); }
            const input = document.createElement('input'); input.type = 'file'; input.accept = kind === 'ine' ? 'image/jpeg,image/png,application/pdf' : 'image/jpeg,image/png';
            input.onchange = async () => {
                const file = input.files[0]; if (!file) return;
                const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' }[file.type];
                if (!ext || (kind === 'foto_perfil' && ext === 'pdf') || file.size <= 0 || file.size > 10 * 1024 * 1024) { status.textContent = 'Usa JPG, PNG o PDF de hasta 10 MB (foto: JPG o PNG).'; return; }
                input.disabled = true; send.disabled = true; status.textContent = `Guardando ${title}…`;
                try {
                    const path = `expedientes/${user.uid}/b2b/${kind}/${Date.now()}_${crypto.randomUUID()}.${ext}`;
                    const object = ref(storage, path);
                    await uploadBytes(object, file, { contentType: file.type });
                    await getDownloadURL(object);
                    await submit({ action: 'save_document', kind, path });
                    status.textContent = 'Archivo guardado. Puedes continuar o cerrar sesión y volver después.';
                } catch (error) { status.textContent = error.message; input.disabled = false; }
                finally { send.disabled = false; }
            };
            label.append(input); documents.append(label);
        }
        send.hidden = !globalThis.GestiaB2CPlatformContract.personnelKycRequirements(profile).complete;
    }, error => { status.textContent = `No se pudo abrir el expediente: ${error.message}`; });
});
send.onclick = async () => {
    send.disabled = true;
    try { await submit({ action: 'submit' }); }
    catch (error) { status.textContent = error.message; }
    finally { send.disabled = false; }
};
