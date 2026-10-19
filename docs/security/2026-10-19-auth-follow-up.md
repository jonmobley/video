# Authentication containment follow-up

## Scope and current status

The owner explicitly requested verification of login, containment of the seven remaining exposed tables, and credential rotations with replacement values saved in associated 1Password vaults. No live payments or real email/SMS tests were authorized or performed.

The actual legacy Vidshare backend is https://old.vidshare.link, on Cloudflare Worker vidshare. The primary vidshare.link and www.vidshare.link domains now belong to the newer showtime-cloud Worker. Earlier HTTP 200 page/health checks at the primary domain did not prove the legacy backend was healthy. The checked-in Wrangler domain routes are stale and must not be deployed over this current routing.

## Database controls applied

Supabase project nlwcnhtenepsoubnimga now records migration 20261019204129_contain_remaining_vidshare_api_tables, following the earlier three-table migration.

- The remaining four private vs_* tables deny PUBLIC/anon/authenticated table access and have RLS without permissive client policies.
- videos and categories retain public SELECT with SELECT-only policies; client mutation grants are removed.
- page_config permits only the documented fifteen public gallery columns. Editor/setup hashes, setup state and image byte fields are not readable by API clients.
- All ten public tables have RLS. Service-role grants remain intact; the table owner is not forced through RLS.
- New public tables and sequences created by postgres no longer inherit broad client grants. supabase_admin creator defaults and function defaults are not changed and remain follow-ups.
- No application/customer rows, user accounts or passwords are changed by this migration. The migration refuses unexpected policies/column grants instead of silently overwriting concurrent changes.

The exact migration passed 36 checks in a private temporary PostgreSQL instance with synthetic rows and no production connection. Production catalog checks and eighteen zero-record API probes confirm the intended grants. The earlier three-table API checks still pass. The security advisor has no remaining RLS-disabled-table errors; seven RLS/no-policy informational findings are intentional server-only boundaries.

## Signing-key replacement

A fresh 256-bit key was generated directly into the new vidshare app vault, item secrets, field SESSION_SECRET. It was privately verified, then replaced the existing public.vs_meta session_secret value; the former value was not retrieved.

The already-deployed container image was reused without an application-code build or main-branch push:

- Application a03e0830-d319-467c-b4d7-73f8d2c21ebf, vidshare-vidshare.
- Image digest sha256:84151738196b9cc6738c89a3bfdd8add15adb18a389c16c155c2e174caa15172.
- Rollout 776ff2f4-d6ab-4b18-ab55-8f9a3445537d replaced version 22 with version 23.
- All listed instances subsequently run version 23 and the legacy JSON /health reports ok=true and db=true.

Existing cookies and protected-video passes use the old signing key and must be renewed. No old-key fallback was configured. Verification did not forge a real user's cookie or access customer data. A regression test checks that the actual video-pass verifier rejects old-key tokens after replacement.

The existing server still loads its key from vs_meta rather than process.env.SESSION_SECRET. The replacement has a 1Password home, but a future reviewed code change should move runtime loading to a required server secret; setting the binding alone is ineffective. The old DB value must not be restored.

## Separate QRGo and Classy rotation

The legacy getclassy QRGO_API_KEY matched QRGo's active SERVICE_API_KEY and the current Classy vault copy. Empty, schema-invalid API requests verified that the leaked key was accepted before rotation without creating links.

The replacement was saved first in QRGo/rotation-pending, configured in both Classy Render environments, and installed as the QRGo Worker secret. Active vault fields QRGo/secrets/SERVICE_API_KEY and Classy/secrets/QRGO_API_KEY now match it. New-key requests reach validation (HTTP 400); old-key and invalid-control requests return HTTP 401 on both qrgo.work and qrgo.link.

Classy production and staging deploy the same already-live commit 71c58d3731cf16e7e411b644900db5b3f1d052d1 with the new variable. The configuration update itself triggered deploys; subsequent redundant requests also deployed that same commit. Do not trigger further deploys merely to verify them.

This is not a successful link-creation test: the existing Classy helper posts snake_case fields to the root URL, whereas QRGo accepts camelCase fields at /api/links. An empty root POST returned HTTP 405. Review that pre-existing integration mismatch separately; do not claim a credential rotation fixes it.

## Unfinished and blocked

1. Full legacy login needs an approved private receiving inbox. No dedicated Vidshare/Showtime Cloud Login item exists. The unrelated Studio Showtime preview credential did not authenticate to Showtime Cloud staging; it was not reset or copied into a new valid Login item. No owner account was used.
2. The exposed Stripe live key belongs to older account acct_19CCMzALuMmc4nzV, absent from the connected Stripe session. It still authenticates. Two enabled webhook endpoints on that account target classy.rsvp; do not assume the old account is unused or disable them blindly.
3. Owner Dashboard handoff is required for standard Stripe secret-key/webhook-secret changes. Store older-account replacements in a clearly labeled legacy item in the Classy vault, never over the current Classy/Nexus account's secret. Current account acct_1TcQUFRAlfV4bC7z was not changed.
4. Legacy Resend, Google OAuth, admin/bootstrap/session credentials and the inaccessible legacy Supabase project's service-role credential still need provider-specific consumer/revocation confirmation. A different current vault value does not prove an exposed legacy value is revoked.
5. Follow up on editor/setup credential replacement, remaining defaults, log/integrity review, authorization/cross-owner tests and private email/SMS capture.

Full report: https://chatgpt.com/space/page_230e8eb599248191b768fd5f142daabe
