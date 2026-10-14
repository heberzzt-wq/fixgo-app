import test from "node:test";
import assert from "node:assert/strict";
import { ceoDayBounds, ceoDayKey, ceoAdminCaseUrl, ceoQueryState, ceoDistinctRecords } from "../ceo-daily-model.js";
import { showCeoAdminCase } from "../ceo-admin-case.js";

test("CEO day boundaries use Cancun rather than the workstation timezone", () => {
    assert.equal(ceoDayKey(new Date("2026-10-14T04:59:59Z")), "2026-10-13");
    const { start, end } = ceoDayBounds("2026-10-13");
    assert.equal(start.toISOString(), "2026-10-13T05:00:00.000Z");
    assert.equal(end.toISOString(), "2026-10-14T05:00:00.000Z");
    for (const invalid of ["2026-02-30", "2026-13-01", "x", "2014-01-01"]) assert.throws(() => ceoDayBounds(invalid));
});
test("CEO only treats a server-confirmed empty query as zero", () => {
    assert.equal(ceoQueryState({ size: 0, metadata: { fromCache: true } }).available, false);
    assert.equal(ceoQueryState({ size: 0, metadata: { fromCache: false } }).count, 0);
});
test("CEO deduplicates cancellation routes without hiding a missing source", () => {
    assert.deepEqual(ceoDistinctRecords([[{id:"a"}], [{id:"a"}, {id:"b"}]]), ["a","b"]);
    assert.equal(ceoDistinctRecords([[{id:"a"}],null]), null);
});
test("CEO routes the exact service identity to Admin and rejects paths", () => {
    assert.equal(ceoAdminCaseUrl("case & one"), "admin.html?serviceId=case%20%26%20one#expediente-ceo");
    assert.equal(ceoAdminCaseUrl("services/id"), null);
    assert.equal(ceoAdminCaseUrl("old-case", "ticket-two"), "admin.html?serviceId=old-case&ticketId=ticket-two#expediente-ceo");
});

test("Admin does not expose resolution for an unrelated or already resolved CEO ticket", async () => {
    for (const data of [{serviceId:"other",status:"open"},{serviceId:"case",status:"resolved"}]) {
        const children=[];
        const target={replaceChildren(){children.length=0;},append(x){children.push(x);}};
        const documentRef={getElementById:()=>target,createElement:()=>({addEventListener(){throw new Error("Unexpected action");}})};
        await showCeoAdminCase({serviceId:"case",ticketId:"ticket",documentRef,
            getService:async()=>({exists:()=>true,data:()=>({estado:"disputed"})}),
            getTicket:async()=>({exists:()=>true,data:()=>data}),judge:()=>{throw new Error("Unexpected resolution");}});
        assert.equal(children.length,1);
        assert.match(children[0].textContent,/ya no corresponde/);
    }
});
test("Admin deep link reads the requested case but resolution requires its existing button", async () => {
    const children=[]; let writes=0; let fetched;
    const target={replaceChildren(){children.length=0;},append(x){children.push(x);},scrollIntoView(){}};
    const documentRef={getElementById(){return target;},createElement(){return {addEventListener(event, handler){this.click=handler;}};}};
    await showCeoAdminCase({serviceId:"old-case",documentRef,getService:async id=>{fetched=id;return {exists:()=>true,data:()=>({estado:"disputed"})};},judge:()=>writes++});
    assert.equal(fetched,"old-case"); assert.equal(writes,0);
    children[1].click(); assert.equal(writes,1);
});
