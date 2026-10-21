# Jarvis V142: external account integration contract

Today GitHub/Firebase have read-only operational probes. Gmail, Outlook,
Zoho, Facebook Pages, Instagram Business, Google Drive, Calendar and TikTok
do NOT have authenticated local OAuth provider connections inside Jarvis.
The bridge /connectors inspection exposes this honestly through externalReadiness.

## Scope and least authority

1. Each provider/account must go through its own OAuth authorization and real
   account identity probe. No reuse of ChatGPT connector credentials.
2. Tokens live in an OS-protected vault, never in model prompts, files
   committed to GitHub, logs, uploaded receipts or Firestore records.
3. Mark connected only after a live, authenticated provider read probe.
4. Separate listing/reading from composing/sending/publishing/deleting.
   Every outbound action requires specific human approval and durable receipts.
5. Scope initial read-only access as narrowly as the providers permit,
   e.g. Microsoft Mail.Read, Google gmail.readonly, ZohoMail.messages.READ.
6. Facebook Pages/Instagram business assets need Meta permissions and
   asset ownership. TikTok uses its own authorization; not all provider
   accounts qualify for publishing.
7. Test token expiry/revocation, cross-account isolation, rate limits,
   sender identity, attachments and idempotent retry.

## Implementation still missing

Provider OAuth callbacks and refresh, token vault, authenticated API adapters,
provider read receipts, per-action approval UI and production connector
certification are NOT implemented by this catalog. A name in the catalog is
never proof of an authorized session.

Priority: email read-only, then Drive/Calendar, then social account inspection,
then optional send/publish permissions after human authorization.
