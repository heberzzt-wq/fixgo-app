// v135 diagnostic: exact TikTok-handle provenance only.
const query = process.argv.slice(2).join(" ") || 'site:tiktok.com "taqueria.eldorado"';
const expected = "tiktok.com/@taqueria.eldorado/";
const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36",
  "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
  "Referer": "https://duckduckgo.com/"
};
const landing = new URL("https://duckduckgo.com/");
landing.searchParams.set("q", query);
landing.searchParams.set("iax", "images");
landing.searchParams.set("ia", "images");
const r0 = await fetch(landing, { headers, redirect: "follow" });
const html = await r0.text();
const patterns = [/vqd=['"]([^'"]+)['"]/i,/vqd=([^&\s"']+)/i,/"vqd"\s*:\s*"([^"]+)"/i];
let vqd = "";
for (const p of patterns) { const m = html.match(p); if (m?.[1]) { vqd = m[1]; break; } }
if (!r0.ok || !vqd) { console.log("vqd_failed"); process.exit(2); }
const endpoint = new URL("https://duckduckgo.com/i.js");
for (const [k,v] of Object.entries({l:"wt-wt",o:"json",q:query,vqd,f:",,,,",p:"1"})) endpoint.searchParams.set(k,v);
const r1 = await fetch(endpoint, { headers: { ...headers, Accept: "application/json,text/plain,*/*" }, redirect: "follow" });
const payload = await r1.json();
const results = Array.isArray(payload?.results) ? payload.results : [];
const exact = results.filter(item => String(item?.url || "").toLowerCase().includes(expected));
console.log("query", query);
console.log("total", results.length);
console.log("exact_handle_count", exact.length);
for (const item of exact) {
  console.log(JSON.stringify({imageUrl:item.image,thumbnailUrl:item.thumbnail,pageUrl:item.url,title:item.title,width:item.width,height:item.height,source:item.source}));
}
