import { db, collection, query, where, onSnapshot } from "./firebase.js";
import "./gestia-core/contracts/b2c-platform-contract.js";
import { ceoAdminCaseUrl, ceoQueryState, ceoDistinctRecords } from "./ceo-daily-model.js";

export function startCeoDailyOperations({ start, end, setHealth }) {
    const contract = globalThis.GestiaB2CPlatformContract;
    const activeStates = [...Object.values(contract.SERVICE_STATES)
        .filter(value => ![contract.SERVICE_STATES.COMPLETED, contract.SERVICE_STATES.CANCELLED].includes(value)),
        "disputed", "warranty_requested"];
    const disposers = [];
    const listen = (name, targetId, source, detail, render = null) => {
        const target = document.getElementById(targetId);
        target.textContent = "Consultando…";
        disposers.push(onSnapshot(source, { includeMetadataChanges: true }, snap => {
            const state = ceoQueryState(snap);
            target.textContent = state.available ? String(state.count) : "N/D";
            target.title = state.available ? `${detail} · Lectura: ${state.observedAt}` : state.label;
            setHealth(name, state.available, state.available ? null : new Error(state.label));
            render?.(state.available ? snap.docs : null);
        }, error => {
            target.textContent = "N/D";
            target.title = "Lectura no disponible; no equivale a cero";
            setHealth(name, false, error);
            render?.(null);
        }));
    };
    const dayQuery = (root, field) => query(collection(db, root), where(field, ">=", start), where(field, "<", end));
    listen("activeServices", "valActive", query(collection(db, "services"), where("estado", "in", activeStates)),
        "Servicios actualmente abiertos, incluidos los iniciados en días anteriores");
    listen("closedServices", "valClosed", dayQuery("services", "finalizado_at"), "Cierres con fecha finalizado_at en el día seleccionado");
    listen("activeB2b", "valActiveB2b", query(collection(db, "servicios_b2b"), where("status", "in", ["pendiente", "programado", "en_proceso"])), "Órdenes B2B actualmente abiertas");
    listen("createdB2b", "valCreatedB2b", dayQuery("servicios_b2b", "fecha_creacion"), "Órdenes B2B creadas en el día seleccionado");
    listen("closedB2b", "valClosedB2b", dayQuery("servicios_b2b", "fecha_cierre"), "Órdenes B2B con cierre registrado en el día seleccionado");
    // The marketplace cancellation writer also uses this audited timestamp.
    // Merge both routes by record identity; a service is counted once.
    const cancellations = new Map();
    const mergeCancelled = (key, docs) => {
        cancellations.set(key, docs);
        const ids = ceoDistinctRecords([...cancellations.values()]);
        if (cancellations.size < 2 || ids === null) {
            document.getElementById("valCancelled").textContent = "N/D";
            return;
        }
        document.getElementById("valCancelled").textContent = String(ids.length);
    };
    listen("cancelledServices", "valCancelled", dayQuery("services", "cancelado_at"), "Cancelaciones registradas en ambas rutas de fecha", docs => mergeCancelled("workflow", docs));
    listen("cancelledMarketplace", "valCancelled", dayQuery("services", "auditoria.cancelled_at"), "Cancelaciones registradas en ambas rutas de fecha", docs => mergeCancelled("marketplace", docs));
    listen("openedCases", "valDisputes", dayQuery("support_tickets", "createdAt"), "Tickets de disputa o garantía abiertos en el día seleccionado");
    listen("pendingCases", "valPendingCases", query(collection(db, "support_tickets"), where("status", "==", "open")),
        "Tickets abiertos ahora, incluidos pendientes de días anteriores", docs => {
            const container = document.getElementById("ceoPendingCases");
            container.replaceChildren();
            if (docs === null) { container.textContent = "No fue posible comprobar los casos pendientes."; return; }
            if (!docs.length) { container.textContent = "No hay tickets abiertos en la fuente consultada."; return; }
            for (const ticket of docs) {
                const data = ticket.data();
                const row = document.createElement("div");
                row.className = "glass-card p-3 rounded-xl flex justify-between items-center gap-3 text-xs";
                const description = document.createElement("span");
                description.textContent = `${data.issueType || "Caso de soporte"} · ${data.serviceId || "Sin servicio vinculado"}`;
                row.append(description);
                const href = ceoAdminCaseUrl(data.serviceId, ticket.id);
                if (href) {
                    const link = document.createElement("a");
                    link.href = href; link.textContent = "Ver y resolver en Admin";
                    link.className = "text-blue-400 underline";
                    row.append(link);
                }
                container.append(row);
            }
        });
    return () => disposers.forEach(dispose => dispose());
}
