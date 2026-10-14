// Opens the existing Admin controls; never decides or resolves a case itself.
export async function showCeoAdminCase({ serviceId, ticketId = "", getService, getTicket, documentRef = document, judge, audit }) {
    if (!serviceId || serviceId.includes("/") || serviceId.length > 1500) return;
    const target = documentRef.getElementById("expediente-ceo");
    if (!target) return;
    target.hidden = false;
    target.replaceChildren();
    const message = documentRef.createElement("p");
    message.textContent = "Consultando el expediente seleccionado en CEO…";
    target.append(message);
    try {
        const snapshot = await getService(serviceId);
        if (!snapshot.exists()) { message.textContent = "El servicio seleccionado no existe o ya no está disponible."; return; }
        const service = snapshot.data();
        if (ticketId) {
            if (ticketId.includes("/") || ticketId.length > 1500) throw new Error("CASE_ID_INVALID");
            const ticket = await getTicket(ticketId);
            if (!ticket.exists() || ticket.data().serviceId !== serviceId || ticket.data().status !== "open") {
                message.textContent = "Este ticket ya no corresponde a un caso abierto de este servicio.";
                return;
            }
        }
        message.textContent = `Servicio ${serviceId} · ${service.categoria || "Sin categoría"} · ${service.estado || "Sin estado"}`;
        const disputed = ["disputed", "warranty_requested"].includes(service.estado);
        const action = disputed ? judge : service.estado === "finalizado" ? audit : null;
        if (typeof action === "function") {
            const button = documentRef.createElement("button");
            button.className = "mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold";
            button.textContent = disputed ? "Revisar y resolver caso" : "Auditar servicio";
            button.addEventListener("click", () => action(serviceId, service.estado, ticketId));
            target.append(button);
        } else {
            const note = documentRef.createElement("p");
            note.textContent = "Este estado no tiene una resolución de disputa disponible. Revisa el expediente desde los controles existentes de Admin.";
            target.append(note);
        }
    } catch {
        message.textContent = "No fue posible leer este expediente. No se ha cambiado el servicio.";
    }
    target.scrollIntoView?.({ block: "center" });
}
