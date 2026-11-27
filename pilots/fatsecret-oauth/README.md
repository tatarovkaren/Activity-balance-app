# FatSecret OAuth 1.0 — diagnostic pilot

**Isolated code, no configured credentials.** GitHub Issue #63. No changes to Activity Balance Production or Supabase.

Purpose: establish whether an existing FatSecret user can authorize the app via three-legged OAuth 1.0 and read daily calories/protein/fat/carbohydrate for one month using food_entries.get_month.v2 with the current Free Edition account.

## Endpoints

- POST /api/unlock — 24+ character private pilot access code. Encrypted HttpOnly/Secure/SameSite=Lax gate cookie, 1 hour.
- GET /api/start — signed request_token POST; pending token in AES-256-GCM cookie, 10 minutes.
- GET /api/callback — verifies token and verifier, exchanges for temporary access token, redirects to / after setting 15-minute encrypted cookie.
- GET /api/month?month=YYYY-MM — signed read-only FatSecret request, returns daily summary fields only; no persistence.
- POST /api/clear — clear all cookies.
- GET /api/status — displays unconfigured/locked/connected without sensitive details.

The pilot does not store data in Supabase, the app diary or localStorage, does not perform imports, and has no cron. It does not deploy or change any Supabase function.

## Owner-only configuration, inside a dedicated Vercel project

Settings → Environment Variables, in the **separate pilot Vercel project**, not the existing Activity Balance project:

- FS_CONSUMER_KEY — OAuth 1.0 Consumer Key from the FatSecret developer account.
- FS_CONSUMER_SECRET — OAuth 1.0 Consumer Secret.
- PILOT_ORIGIN — exact HTTPS URL of pilot deployment, no trailing slash (e.g. https://YOUR-PILOT.vercel.app).
- PILOT_ACCESS_CODE — fresh long random code, at least 24 characters, different from other passwords.
- PILOT_SESSION_KEY — 64 hexadecimal characters (32 random bytes), generated locally with a password manager or: openssl rand -hex 32.

Never send values into ChatGPT, GitHub, Google Drive, or screenshots. Do not prefix values with NEXT_PUBLIC_ or expose them to the browser.

**After adding variables, redeploy the isolated pilot.**

## First verification procedure

1. Open pilot URL: should show 'Ожидает настройки' until all five variables are correctly set.
2. Once configured, enter the access code (not your FatSecret password).
3. Click 'Разрешить доступ через FatSecret', grant permission on the official FatSecret authorization site.
4. On return, request one month's daily totals. Compare privately with your FatSecret diary.
5. End and clear the diagnostic session. The cookie expires automatically after 15 minutes; ending the session does not revoke OAuth consent at FatSecret. Review authorized applications at FatSecret if revocation is needed.

## Limitations and risks

- The user-specific API permission of Free Edition is **not confirmed** until a real read succeeds.
- The implementation displays a generic failure rather than leaking tokens, raw responses or credentials.
- The pilot access code is not an enterprise-grade multi-user identity system or full rate limiter. Use only for a private first test, protect deployment with Vercel access controls/WAF and avoid publishing the code.
- For a real product, use encrypted server-side tokens tied to verified individual Supabase users and enforce RLS, rotation/revocation, clear retention terms, processing region, consent, repeat sync scheduling, deduplication, and write-conflict rules.
- Do not merge this pilot into main. Keep Production 0.45.0 intact.

Sources:
https://platform.fatsecret.com/docs/guides/authentication/oauth1/three-legged
https://platform.fatsecret.com/docs/v2/food_entries.get_month
