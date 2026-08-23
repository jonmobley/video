---
name: Config-driven show pages
description: Presentation behavior for standalone show galleries is configured through a validated page configuration object.
---

Show-specific presentation—empty states, artwork fallbacks, themed backgrounds, filter labels, and song/group mappings—belongs in the page configuration presentation object, not a frontend page-name branch.

**Why:** This keeps creating a new show page an editorial configuration task rather than a copy-and-modify code task, while retaining page-scoped authorization for changes.

**How to apply:** Add reusable display options to the validated presentation schema and shared template runtime. Keep only generic gallery behavior in the browser code; seed any special defaults as page configuration.