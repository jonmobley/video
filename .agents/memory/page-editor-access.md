---
name: Page editor access
description: Security boundary for legacy standalone page editors and the global dashboard.
---

Each standalone page editor uses its own page-specific secret, while the site-wide dashboard uses `ADMIN_TOKEN`; neither credential is accepted in the other scope.

**Why:** A shared admin credential allowed a page editor password to become a cross-page and dashboard credential.

**How to apply:** Any new standalone editor write or verification endpoint must validate the requested page before authorization and use only that page's dedicated secret with constant-time comparison.