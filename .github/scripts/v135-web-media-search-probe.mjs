const query = process.argv.slice(2).join(" ") || "Taquería El Dorado Cancún";
const url = new URL("https://www.bing.com/images/search");
url.searchParams.set("q", query);
url.searchParams.set("form", "HDRSC2");
url.searchParams.set("first", "1");

const response = await fetch(url, {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8"
  },
  redirect: "follow"
});

console.log("status", response.status, response.url);
const html = await response.text();
console.log("html_bytes", Buffer.byteLength(html));

function decodeHtml(value = "") {
  return String(value)
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

const candidates = [];
const pattern = /<a\b[^>]*\bclass=(?:"[^"]*\biusc\b[^"]*"|'[^']*\biusc\b[^']*')[^>]*>/gi;
for (const tag of html.match(pattern) || []) {
  const match = tag.match(/\bm=(?:"([^"]*)"|'([^']*)')/i);
  if (!match) continue;
  try {
    const metadata = JSON.parse(decodeHtml(match[1] ?? match[2] ?? ""));
    const imageUrl = String(metadata.murl || "").trim();
    const pageUrl = String(metadata.purl || "").trim();
    const thumbnailUrl = String(metadata.turl || "").trim();
    if (!imageUrl || !pageUrl) continue;
    const image = new URL(imageUrl);
    const page = new URL(pageUrl);
    if (!["http:", "https:"].includes(image.protocol) || !["http:", "https:"].includes(page.protocol)) continue;
    candidates.push({
      imageUrl: image.href,
      pageUrl: page.href,
      thumbnailUrl,
      title: String(metadata.t || metadata.desc || "").slice(0, 180),
      width: Number(metadata.mw || 0),
      height: Number(metadata.mh || 0)
    });
  } catch {}
  if (candidates.length >= 20) break;
}

console.log("candidate_count", candidates.length);
for (const [index, item] of candidates.slice(0, 10).entries()) {
  console.log(JSON.stringify({ index: index + 1, ...item }));
}

if (!response.ok) process.exit(2);
if (candidates.length < 3) process.exit(3);
