// Evidence-bounded excerpts for local Qwen engineering missions.
// The independent auditor receives the original verifiedRead receipt;
// excerpts never upgrade incomplete or unrelated source into proof.
export function compactVerifiedEngineeringSource(verifiedRead={}, {maxChars=3200}={}){
 const file=String(verifiedRead?.file||'');
 const content=typeof verifiedRead?.content==='string'?verifiedRead.content:'';
 if(!file || !content.trim())return {
  file,sourceTextOmitted:true,sourceExcerpt:null,
  reason:'VERIFIED_SOURCE_CONTENT_NOT_AVAILABLE'
 };
 const lines=content.split(/\r?\n/);
 const first=Number.isInteger(verifiedRead.startLine)&&verifiedRead.startLine>0?verifiedRead.startLine:1;
 const relevant=/requestPayout|solicitarRetiro|amount|monto|importe|cantidad|saldo|Number\.isFinite|NaN|Infinity|negative|negativ|assert|describe\s*\(|test\s*\(|it\s*\(|idempot|concurr|duplicad|wallet|payment|retiro|withdraw|module\.exports|https\.onCall|getIdToken|verifyIdToken|createWorkstationAuthorization|validateAuthenticatedContext|principalId|tenantId|Authorization|sessionContext|auth\.currentUser|QWEN_BROWSER_SESSION|QWEN_PILOT_OWNER_REQUIRED|role/iu;
 const authSource=/qwen-direct-transport|workstation-health|qwen-tool-bridge|auth|session/i.test(file);
 const authAnchor=/getIdToken|verifyIdToken|createWorkstationAuthorization|validateAuthenticatedContext|principalId|X-Jarvis-Release-Id|auth\.currentUser|QWEN_PILOT_OWNER_REQUIRED|role/iu;
 const indices=[];
 const anchors=[];
 for(let i=0;i<lines.length;i++){
  if(/\b(?:requestPayout|solicitarRetiro)\b/u.test(lines[i]))anchors.push(i);
  else if(authSource&&authAnchor.test(lines[i])&&(!anchors.length||i-anchors[anchors.length-1]>9))anchors.push(i);
  if(relevant.test(lines[i]))indices.push(i);
 }
 const chosen=new Set();
 // Canonical function definitions outrank unrelated early matches, especially
 // in large index.js files where the payout handler is near the end.
 const hits=[...anchors.slice(0,authSource?4:3),...indices.filter(i=>!anchors.includes(i)).slice(0,authSource?8:15)];
 for(const idx of (hits.length?hits:[0])){
  const radius=anchors.includes(idx)?(authSource?7:12):3;
  for(let j=Math.max(0,idx-2);j<=Math.min(lines.length-1,idx+radius);j++)chosen.add(j);
 }
 const gathered=[...chosen];
 let length=0;const excerpts=[];
 for(const i of gathered){
  let text=lines[i];
  // Never pass credential literals or key material into the LLM transcript.
  if(/(?:PRIVATE[_-]?KEY|BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY|api[_-]?key\s*[:=]|password\s*[:=]|client[_-]?secret\s*[:=])/iu.test(text))
   text='[LINE_REDACTED_POTENTIAL_SECRET]';
  const entry=(first+i)+': '+text;
  if(length+entry.length+1>maxChars)break;
  excerpts.push(entry);length+=entry.length+1;
 }
 if(!excerpts.length)return {file,sourceTextOmitted:true,sourceExcerpt:null,reason:'SOURCE_EXCERPT_LIMIT'};
 return {
  file,sourceTextOmitted:false,sourceExcerpt:excerpts.join('\n'),
  sourceExcerptPartial:true,shownLines:excerpts.length,sourceLines:lines.length,
  startLine:first,sourceContentTruncated:excerpts.length<lines.length
 };
}
