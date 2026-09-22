import { auth, db, doc, collection, query, where, onSnapshot, signOut } from './firebase.js';
import { watchB2bSupervisor } from './b2b-supervisor-session.js';
const status = document.getElementById('status');
const orders = document.getElementById('orders');
let stop = null;
document.getElementById('logout').onclick = () => signOut(auth);
auth.onAuthStateChanged(user => {
    stop?.(); stop = null;
    if (!user) { location.replace('login.html'); return; }
    stop = watchB2bSupervisor({
        subscribeProfile: (next, error) => onSnapshot(doc(db, 'users', user.uid), snapshot => next(snapshot.data()), error),
        subscribeOrders: (tenantId, next, error) => onSnapshot(query(collection(db, 'servicios_b2b'), where('edificioId', '==', tenantId)), snapshot => next(snapshot.docs.map(item => ({ ...item.data(), id: item.id }))), error),
        onProfile: profile => { document.getElementById('building').textContent = profile.edificioNombre || profile.edificioId; },
        onOrders: rows => {
            orders.replaceChildren(); status.textContent = rows.length ? `${rows.length} órdenes del edificio` : 'No hay órdenes para mostrar.';
            for (const row of rows) {
                const article = document.createElement('article'); const title = document.createElement('h2');
                title.textContent = row.equipo || row.ubicacion_especifica || `Orden ${row.id}`; article.append(title);
                for (const text of [`Estado: ${row.status || 'Sin estado'}`, `Prioridad: ${row.prioridad || 'Normal'}`, `Responsable: ${row.tecnico_nombre || 'Sin asignar'}`, row.descripcion || 'Sin descripción']) {
                    const line = document.createElement('p'); line.textContent = text; article.append(line);
                }
                orders.append(article);
            }
        },
        onError: error => { orders.replaceChildren(); status.textContent = `No se pudieron cargar las órdenes: ${error.message}`; }
    });
});
window.addEventListener('pagehide', () => stop?.());
