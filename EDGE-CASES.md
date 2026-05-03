# VidShare Edge-Case Hardening

This document captures the edge cases that were hardened in task #14 across
the upload pipeline (chunked + external links), auth/account pages, and the
admin save endpoints. It is the reference for *what defensive behaviour each
endpoint guarantees* so future changes don't silently regress them.

## Standard error response shape

All JSON API endpoints (Express in `server.js` and the Netlify save-* /
upload-page-image functions) now return errors in a single shape:

```json
{ "error": { "code": "MACHINE_CODE", "message": "Human-readable text." } }
```

* `code` is a stable machine-readable identifier (e.g. `BAD_VIDEO_ID`,
  `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`). UIs may branch on it.
* `message` is end-user-safe copy and may be displayed verbatim.
* The legacy `{ error: "string" }` shape is no longer emitted by the server,
  but client code (login, account, admin, upload widget) **tolerates both**
  via small helpers (`parseErrJson`, `errMsg`) so any cached pages keep
  working through the rollout.

The Express server has a top-level middleware that converts
`express.json` parse failures and oversized bodies into this shape so
callers never receive an HTML stack trace.

| code                 | typical status |
| -------------------- | -------------- |
| `BAD_JSON`           | 400            |
| `PAYLOAD_TOO_LARGE`  | 413            |
| `MISSING_FIELDS`     | 400            |
| `BAD_VIDEO_ID`       | 400            |
| `BAD_CHUNK_INDEX`    | 400            |
| `BAD_TOTAL_CHUNKS`   | 400            |
| `EMPTY_CHUNK`        | 400            |
| `EMPTY_FILE`         | 400            |
| `UNSUPPORTED_TYPE`   | 415            |
| `UNSUPPORTED_HOST`   | 400            |
| `BAD_LINK`           | 400            |
| `URL_TOO_LONG`       | 400            |
| `URL_REQUIRED`       | 400            |
| `TITLE_REQUIRED`     | 400            |
| `TITLE_TOO_LONG`     | 400            |
| `BAD_PASSWORD`       | 400            |
| `PASSWORD_TOO_LONG`  | 400            |
| `BAD_EXPIRY`         | 400            |
| `BAD_EMAIL`          | 400            |
| `EMAIL_TOO_LONG`     | 400            |
| `BAD_CODE`           | 400            |
| `CODE_EXPIRED`       | 400            |
| `CODE_LOCKED`        | 400            |
| `NO_CODE`            | 400            |
| `EMAIL_SEND_FAILED`  | 502            |
| `RATE_LIMITED`       | 429            |
| `AUTH_REQUIRED`      | 401            |
| `FORBIDDEN`          | 403            |
| `PASSWORD_REQUIRED`  | 403            |
| `NOT_FOUND`          | 404            |
| `EXPIRED`            | 410            |
| `CHUNK_INTEGRITY`    | 400            |
| `FILE_TOO_LARGE`     | 413            |
| `INTERNAL`           | 500            |

## Upload pipeline

### `POST /api/upload-chunk`

* `videoId` is required and must match the canonical `[a-f0-9]{12,64}(.ext)?`
  shape. Anything else returns `BAD_VIDEO_ID` instead of touching the DB.
* `chunkIndex` and `totalChunks` are validated as integers in the range
  `[0, 100000]`. Off-range or non-integer values return `BAD_CHUNK_INDEX` /
  `BAD_TOTAL_CHUNKS`.
* `contentType` must start with `video/` or be `application/octet-stream`,
  otherwise `UNSUPPORTED_TYPE` (415).
* The base64 `data` field is rejected if missing, a non-string, or empty
  after decoding (`EMPTY_CHUNK`).
* The IP-based rate limiter only counts the **first** chunk of each upload
  so a 100-chunk video doesn't burn 100 quota.

### `POST /api/finalize-video`

* All the upload-chunk validations above also apply on finalize.
* `title` is required, trimmed, and capped at 120 chars.
* `password` (optional) must be a string ≤ 200 chars.
* `expiryDays` accepts `'never'` or an integer in `[1, 3650]`. Invalid
  values return `BAD_EXPIRY`.
* Chunk continuity is enforced (`COUNT(*) = totalChunks` AND
  `MIN(idx) = 0` AND `MAX(idx) = totalChunks - 1`); on mismatch the
  endpoint returns `CHUNK_INTEGRITY` and the client is told to retry the
  whole upload.
* The assembled buffer is rejected if 0 bytes (`EMPTY_FILE`) or if it
  exceeds the global `MAX_FILE_SIZE` (`FILE_TOO_LARGE`, 413). In both
  cases the partial `vs_upload_chunks` rows are deleted before responding
  so we never leak orphan storage.
* On any 500 the orphan-chunk cleanup job (`cleanupExpired`) eventually
  reaps stragglers anyway.

### Client (`js/upload-widget.js`)

* The "Upload" button is debounced via `if (uploading) return;` at the top
  of `startUpload` — double-clicks no longer kick off two parallel
  uploads.
* 0-byte files are rejected client-side before any chunk is sent, with a
  friendly message.
* Each chunk POST is wrapped in `retryChunk(...)`:
  * Up to 4 attempts.
  * Retries only on transient failures: network errors, 5xx responses,
    `408`, `429`. Validation 4xx responses fail fast.
  * Exponential backoff with jitter, capped at 6 s.
  * Server-side UPSERT on `(video_id, chunk_index)` makes retries
    idempotent.
* All error parsing now goes through `parseErrJson(res)`, which
  understands both the new `{ error: { code, message } }` shape and the
  legacy `{ error: 'string' }` shape.

### `POST /api/create-link-video` (YouTube / Vimeo)

* `url` is required, trimmed, and capped at 2048 chars.
* Hosts that we cannot embed (Dropbox, Google Drive, OneDrive, iCloud)
  are rejected up front with `UNSUPPORTED_HOST` and an actionable
  message ("upload the file directly").
* Same title / password / expiry validation as `finalize-video`.
* Same per-IP rate limit.
* `js/link-parser.js` now exposes `isUnsupportedHost()` and the upload
  widget uses it to show the same helpful copy in the live preview as
  the user types a link.

## Auth + account/admin pages

### Server

* `POST /api/auth/request-code` and `verify-code` both validate that
  `email` and `code` are strings of the expected shape before doing
  anything else — non-string inputs no longer crash on `.trim()`.
* `requireAdmin` now does a constant-time comparison via
  `crypto.timingSafeEqual` and distinguishes "no token" (401) from
  "wrong token" (403). The previous code used `!==`, which was a timing
  side-channel.
* `requireUser` returns `AUTH_REQUIRED` so the client can branch on the
  code.

### `account.html`

* The page already redirected to `/login?next=/account` when `/api/auth/me`
  returned a non-OK status. We now also redirect when **any** subsequent
  authenticated call (`/api/my-videos`, `DELETE /api/my-videos/:id`)
  returns 401, so a session that expires *between* page-load and an
  action no longer leaves the user staring at a "Could not delete" toast
  with no path forward.
* Network errors on the initial fetch now show an "empty" panel instead
  of leaving the spinner spinning forever.
* The delete button surfaces the server's `error.message` when present
  rather than always saying "Could not delete video."

### `admin.html`

* The "Sign in" and per-row "Delete" buttons are debounced (`if
  (btn.disabled) return;`).
* Both 401 (no/expired token) and 403 (wrong token) bounce the user back
  to the token-entry form by calling `logout()`.
* Server error messages are now displayed instead of a generic "Delete
  failed."
* On network error during sign-in the form unlocks and shows "Network
  error. Please try again." rather than silently re-enabling.

### `login.html`

* Submit buttons were already debounced via `disabled = true`. The
  resend button now soft-cools for 15 s after success and 2 s after
  failure to prevent rapid-fire requests beating the server-side
  rate-limit.
* Error rendering goes through `errMsg(data, fallback)` which
  understands both the new and legacy error shapes.

## Netlify save-* / upload-page-image functions

These are admin-write endpoints (Supabase-backed). They were previously
running with auth disabled behind a `TODO: RE-ENABLE BEFORE
DEPLOYMENT` comment.

* `requireAuth(event)` is now invoked at the top of `save-videos`,
  `save-categories`, `save-page-config`, and `upload-page-image`. The
  `ADMIN_TOKEN` env var must be set and the caller must send
  `Authorization: Bearer <token>`.
* Each function now:
  * Caps the request body length up front (returns
    `PAYLOAD_TOO_LARGE` 413).
  * Wraps `JSON.parse(event.body)` in try/catch (returns `BAD_JSON`
    400) instead of letting the function crash with a 500.
  * Returns the standard `{ error: { code, message } }` shape.
* `save-page-config` additionally validates the `page` slug
  (`^[a-zA-Z0-9_-]+$`, ≤ 64 chars).
* `upload-page-image` validates content type against an explicit
  allow-list, rejects 0-byte buffers (`EMPTY_FILE`), and switches the
  too-large response to a proper 413 with `FILE_TOO_LARGE`.

## Things we explicitly do NOT do

* We do not retry `finalize-video` from the client. A finalize failure
  that wasn't a 5xx may indicate chunk loss; the user is asked to retry
  the whole upload (which is cheap thanks to chunk UPSERT idempotency).
* We do not surface raw `err.message` from server-side exceptions to the
  client — only sanitised `INTERNAL` copy. Real diagnostics go to
  `console.error` for the workflow logs.
* We do not allow Dropbox / Drive / OneDrive / iCloud links to be saved
  as embeds even if a future regex change accidentally matched one — the
  hostname blacklist is enforced both client- and server-side.
