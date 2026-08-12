const query = process.argv.slice(2).join(" ") || '"Taquería El Dorado" Cancún tacos';
const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36",
  "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
  "Referer": "https://duckduckgo.com/"
};

const landing = new URL("https://duckduckgo.com/");
landing.searchParams.set("q", query);
landing.searchParams.set("iax", "images");
landing.searchParams.set("ia", "images");
const landingResponse = await fetch(landing, { headers, redirect: "follow" });
const landingHtml = await landingResponse.text();
console.log("landing_status", landingResponse.status, landingResponse.url);
console.log("landing_bytes", Buffer.byteLength(landingHtml));

const patterns = [
  /vqd=['"]([^'"]+)['"]/i,
  /vqd=([^&\s"']+)/i,
  /"vqd"\s*:\s*"([^"]+)"/i
];
let vqd = "";
for (const pattern of patterns) {
  const match = landingHtml.match(pattern);
  if (match?.[1]) {
    vqd = match[1];
    break;
  }
}
console.log("vqd_found", Boolean(vqd));
if (!landingResponse.ok || !vqd) process.exit(2);

const endpoint = new URL("https://duckduckgo.com/i.js");
endpoint.searchParams.set("l", "wt-wt");
endpoint.searchParams.set("o", "json");
endpoint.searchParams.set("q", query);
endpoint.searchParams.set("vqd", vqd);
endpoint.searchParams.set("f", ",,,,");
endpoint.searchParams.set("p", "1");
const response = await fetch(endpoint, {
  headers: { ...headers, "Accept": "application/json,text/plain,*/*" },
  redirect: "follow"
});
console.log("api_status", response.status, response.url);
const text = await response.text();
console.log("api_bytes", Buffer.byteLength(text));
if (!response.ok) {
  console.log(text.slice(0, 500));
  process.exit(3);
}
let payload;
try { payload = JSON.parse(text); } catch {
  console.log(text.slice(0, 500));
  process.exit(4);
}
const results = Array.isArray(payload?.results) ? payload.results : [];
console.log("candidate_count", results.length);
for (const [index, item] of results.slice(0, 12).entries()) {
  console.log(JSON.stringify({
    index: index + 1,
    imageUrl: String(item?.image || ""),
    thumbnailUrl: String(item?.thumbnail || ""),
    pageUrl: String(item?.url || ""),
    title: String(item?.title || "").slice(0, 180),
    width: Number(item?.width || 0),
    height: Number(item?.height || 0),
    source: String(item?.source || "")
  }));
}
if (results.length < 3) process.exit(5);
