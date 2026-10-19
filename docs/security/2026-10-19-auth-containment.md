# Private authentication table containment

## Applied change

On October 19, 2026 the owner explicitly approved narrowly blocking API access to three private authentication tables, accepting possible brief login disruption. Credential rotation, payment changes and application deployment were not included.

Supabase project: nlwcnhtenepsoubnimga (vidshare).

Applied migration: 20261019190937_contain_private_auth_api_access.

The migration revokes PUBLIC, anon and authenticated table privileges and enables row-level security on public.vs_meta, public.vs_auth_codes and public.vs_users. It does not create permissive client policies. It preserves the existing trusted server-role grants, does not force RLS on the table owner, and changes no application/customer rows, users, passwords or signing keys.

The SQL is one atomic DO statement with a short lock timeout, metadata guards and in-transaction verification. The stored migration is a record of the already-applied change, not authorization to replay changes on another project.

## Verification

- An exact-SQL local dry run passed 18 checks using ten synthetic tables in a throwaway PostgreSQL instance. The instance had no production credentials/connections and was removed afterward.
- Catalog checks confirm all three target tables have RLS enabled, anon/authenticated SELECT/INSERT/UPDATE/DELETE denied, and trusted service-role access retained.
- Anonymous GET requests selecting zero records returned HTTP 401 with database permission code 42501 on all three tables. Before containment these requests returned HTTP 200.
- Equivalent service-role GET requests selecting zero records returned HTTP 200 and empty arrays. No private records or secret values were retrieved.
- The seven non-target public tables have exactly the same inspected owner, RLS and table ACL metadata as before containment.
- Public root, login, oz, disc and vertical pages returned HTTP 200 after the change. This does not verify gallery contents, playback, signup or login.
- The public /health route returned HTML both before and after containment rather than an expected JSON database-readiness response. Runtime backend role/project mapping and end-to-end login remain unproven.
- The security advisor now reports seven RLS-disabled tables instead of ten. Three RLS-enabled/no-policy informational notices are intentional for server-only authentication tables.

No application build/UI change was made. No workflow was dispatched, production app deployed, real message sent, or live payment performed by this containment. Do not infer unchanged user sessions are safe: the signing key has not been replaced.

## Remaining risk

The seven other public tables and their API grants remain unchanged. Any previously exposed signing key can remain useful until a separately approved, tested replacement invalidates old cookies and protected-video passes. Default grants can expose newly created tables. Custom server authorization, public-field projections, role/tenant denial and real application health still need follow-up.

The separate legacy Stripe/QRGo credential work is not part of this migration. Do not rotate the current Classy/Nexus Stripe keys based only on a legacy repository name.

## Recovery boundary

Do not restore broad anonymous privileges or reuse an exposed signing key to recover availability. Correct the verified backend access policy or temporarily disable the affected route; reopen genuinely public non-sensitive fields only with a reviewed allowlist. Stop on unexpected target/schema/role, new column grants/policies, or any proposed customer-data modification. A full data restore is not the rollback for this permission-only change.

Full cross-app report: https://chatgpt.com/space/page_230e8eb599248191b768fd5f142daabe

Advisor references:
- https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
