---
name: Slug normalization
description: Case handling for user-facing folder URLs.
---

User-facing folder slugs are canonicalized to lowercase at the HTTP route boundary before validation, redirects, or database access.

**Why:** Generated slugs are lowercase, but users may manually capitalize shared URLs; treating case as significant creates avoidable not-found errors.

**How to apply:** New folder routes and compatibility redirects should normalize the route parameter first, while generated and returned slugs remain lowercase.