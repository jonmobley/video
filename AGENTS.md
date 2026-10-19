# Security operating notes

- Authentication is custom server-side email-code and signed-cookie authentication, not Supabase Auth. Do not add generic auth.uid() policies to server-only authentication tables.
- Production Supabase project nlwcnhtenepsoubnimga has an owner-approved containment migration, 20261019190937_contain_private_auth_api_access. It removes PUBLIC/anon/authenticated table privileges and enables RLS on vs_meta, vs_auth_codes and vs_users. No permissive API policies on these three tables is intentional; do not add allow-all policies to silence the informational advisor.
- The migration in supabase/migrations records the already-applied production change. This repository did not have an existing local Supabase migration pipeline at containment time. Do not run schema scripts, deploys or further production migrations without explicit owner approval.
- Seven other public tables, default privileges, signing-key replacement and legacy credential rotation remain separate work. The containment is not a complete security fix.
- The inspected server loads its signing key from vs_meta even though the Worker secret catalog lists SESSION_SECRET. Setting that binding alone does not replace the database-held key. It also signs protected-video passes, so a tested key replacement requires fresh sign-in/password entry and explicit production approval.
- A GET to /health returned HTML at the live public domain during containment. HTTP 200 there does not prove database readiness. Do not claim a completed login or backend health test from the public page checks.
- Main pushes can deploy production through .github/workflows/ci.yml. Use an isolated branch for reviewed follow-ups; no production deploy or real email/SMS/payment test without approval.
- Keep secrets in the associated 1Password app vault and use ~/.moxie/bin/mop. Never log or commit credential values. See docs/security/2026-10-19-auth-containment.md for evidence and limits.
