# Revision Log

Track changes to the revision form. Newest first.

---

## Rev 5 — Email the client when a link is created (current)

### What changed

| # | Item | Status |
|---|---|---|
| 1 | Round-created modal | ✅ Done | After **Create link**, a card pops up with the link, all round details, and Created / Reminder / Due dates. |
| 2 | Send email action | ✅ Done | `POST /api/rounds` `{ action:'send' }` → emails the client their link via `onRoundLink`. |
| 3 | Customizable message | ✅ Done | Editable Subject + Message (prefilled with a sensible default). |
| 4 | From-address reminder | ✅ Done | Shows “Sent from …purchasing@pepperandolive.com” (reads `EMAIL_FROM`). |
| 5 | No-email guard | ✅ Done | If the round has no client email, the modal says so instead of showing Send. |
| 6 | Send email from Request links | ✅ Done | Each open round card now has a **Send email** button (when a client email is set). |

### Files touched

- `netlify/functions/lib/notify.js` — `roundInviteEmail` + `onRoundLink`.
- `netlify/functions/rounds.js` — `send` action; `emailFrom` on create.
- `index.html` — `roundCreatedOverlay`.
- `admin.js` — `showRoundCreated` / `sendRoundEmail` / date chips.
- `styles.css` — `rc-date` / `rc-email-title` styles.

---

## Rev 4 — WhatsApp goes to an office group chat

**Decision:** WhatsApp notifications go to a single office **group chat** (via
TextMeBot). No client WhatsApp numbers are collected or used.

### What changed

| # | Item | Status |
|---|---|---|
| 1 | WhatsApp → office group | ✅ Done | `TEXTMEBOT_APIKEY` + `TEXTMEBOT_RECIPIENT` (e.g. `1203630…@g.us`). |
| 2 | Removed client phone capture | ✅ Done | Dropped `nrPhone` field + `round.clientPhone` + client WhatsApp sends. |
| 3 | Kept single-number fallbacks | ✅ Done | Twilio / CallMeBot / generic webhook still work (one recipient). |
| 4 | TextMeBot 8s throttle | ✅ Done | Space sends to avoid TextMeBot's anti-spam delay error. |
| 5 | Group caveat documented | ✅ Done | Group sending requires <support@textmebot.com>; demo is 2 days / ~$6/mo. |

### Files touched

- `netlify/functions/lib/notify.js` — TextMeBot group sender; single-destination WhatsApp; removed client sends.
- `netlify/functions/rounds.js`, `round.js`, `submit.js`, `admin.js`, `index.html` — removed client phone.
- `README.md` — TextMeBot group setup.

### Env vars added

`TEXTMEBOT_APIKEY`, `TEXTMEBOT_RECIPIENT`.

---

## Rev 3 — Gmail SMTP + WhatsApp

**Decision:** use **Gmail SMTP** (own mailbox, app password) — not Resend.
**Scope:** concrete WhatsApp integration (Twilio + CallMeBot) and a client
WhatsApp number so reminders/confirmations can reach clients.

### What changed

| # | Item | Status |
|---|---|---|
| 1 | Gmail SMTP is the documented email path | ✅ Done | `smtp.gmail.com:587` + app password; see README. |
| 2 | WhatsApp sender (Twilio) | ✅ Done | `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_WHATSAPP_FROM`/`TWILIO_WHATSAPP_TO`. |
| 3 | WhatsApp sender (CallMeBot, free) | ✅ Done | `CALLMEBOT_APIKEY` + `CALLMEBOT_PHONE`. |
| 4 | Generic `WHATSAPP_WEBHOOK_URL` kept | ✅ Done | Fallback that accepts `{ text, to }`. |
| 5 | Client WhatsApp number | ✅ Done | New `Client WhatsApp number` field on the link form → `round.clientPhone`; used for client confirmations + reminders. |
| 6 | Discord now posts the office summary (was client text) | ✅ Done | Cleaner for a team channel. |

### Files touched

- `netlify/functions/lib/notify.js` — Twilio + CallMeBot + generic WhatsApp, office/client destinations.
- `netlify/functions/rounds.js`, `round.js` — `clientPhone` create/summary/reopen/expose.
- `netlify/functions/submit.js` — passes `clientPhone` into notifications.
- `index.html`, `admin.js` — `Client WhatsApp number` field + display.
- `README.md` — Gmail SMTP steps + Twilio/CallMeBot setup.

### Env vars added

`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WHATSAPP_TO`, `CALLMEBOT_APIKEY`, `CALLMEBOT_PHONE`.

---

## Rev 2 — Robust notifications + reminders

**Date:** (this change set)
**Scope:** email/notification system, client email + expiry dates, automatic reminders, WhatsApp/Discord channels.

### What changed

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Robust email (no dormant 3rd party) | ✅ Done | New `netlify/functions/lib/notify.js`. Sends via **your own mailbox (SMTP)** or **Resend** — not Netlify Forms / Apps Script web app. |
| 2 | Better email verbiage on receipt | ✅ Done | New office + client email templates (HTML + plain text). See `lib/notify.js`. |
| 3 | 7-day "not submitted" reminder to client + office | ✅ Done | `netlify/functions/reminders.js`, scheduled daily at 09:00. |
| 4 | Reminder includes the expiration date | ✅ Done | Rounds now carry `expiresAt` (default +14 days). Shown to client and included in reminder copy. |
| 5 | Expiring-soon reminder (48h before expiry) | ✅ Done | Same scheduled function, second trigger. |
| 6 | Client email captured | ✅ Done | Office enters it on the link form; client can also type it in the form banner. |
| 7 | WhatsApp / Discord channels | ✅ Done | Optional `DISCORD_WEBHOOK_URL` + `WHATSAPP_WEBHOOK_URL`. Can replace email later. |
| 8 | Legacy fallbacks kept working | ✅ Done | Netlify Forms relay + Apps Script still work when no new provider is set; Apps Script skips its email when the new one is active. |

### Files touched

- `netlify/functions/lib/notify.js` — **new** — email (SMTP/Resend), Discord, WhatsApp, templates.
- `netlify/functions/reminders.js` — **new** — scheduled 7-day + expiring-soon reminders.
- `netlify/functions/submit.js` — email stamping, calls `onSubmission`, legacy fallback logic.
- `netlify/functions/rounds.js` — `clientEmail`, `expiresAt` on create/reopen; `DEFAULT_EXPIRY_DAYS = 14`.
- `netlify/functions/round.js` — exposes `clientEmail` + `expiresAt` to the client form.
- `google_apps_script.gs` — honors `skipEmail` (no double office email).
- `config.js` — added `email` field to the about section.
- `clients/form.html` — email input + expiry note in the context banner.
- `app.js` — email field type, context-banner email binding, email captured on submit.
- `index.html` — `Client email` + `Expiration date` fields on the new-link form.
- `admin.js` — sends/displays client email + expiry.
- `styles.css` — banner email/expiry styles.
- `netlify.toml` — scheduled `reminders` function.
- `package.json` / `package-lock.json` — added `nodemailer` (for SMTP).
- `README.md` — documented the new setup.

### Recommended setup (suggestions)

The concern — *"don't rely on third-party services that go dormant after non-use"* — is handled by making the email path first-party and swap-friendly:

**Option A — your own mailbox (most self-reliant, nothing to go dormant)**
Use the studio's existing Google Workspace / Microsoft 365 mailbox over SMTP with an app password. This is your own account, so there is no idle cutoff. Set:

```
SMTP_HOST, SMTP_PORT=587, SMTP_SECURE=false, SMTP_USER, SMTP_PASS
```

**Option B — Resend (recommended managed provider)**
`RESEND_API_KEY`. Resend is a transactional email API: reliable, domain-verified, and does not go dormant. Free tier is ~3,000 emails/month.

Both are configured with:

```
EMAIL_FROM = "Pepper & Olive Interiors <studio@pepperandolive.com>"
NOTIFY_EMAIL = "studio@pepperandolive.com, …"   (office recipients)
```

**Why not the old path?** Netlify Forms has a monthly submission allowance and
form detection can lapse; Google Apps Script web apps can be rate-limited or
disabled on free accounts. Both are now *fallbacks only*.

**WhatsApp / Discord path**
- Discord: `DISCORD_WEBHOOK_URL` → channel webhook; posts a summary on every submission + reminder.
- WhatsApp: `WHATSAPP_WEBHOOK_URL` → any webhook accepting `{ "text": "…" }`. Point it at a Twilio/WhatsApp Business relay or a gateway like CallMeBot (phone + apikey in the URL).
- To make WhatsApp primary later: leave `NOTIFY_EMAIL` empty and keep the webhook set — email silently stops, chat keeps working.

### Env var reference (new)

| Var | Required | Purpose |
|---|---|---|
| `EMAIL_FROM` | yes (email) | From address for all email |
| `NOTIFY_EMAIL` | for office email | Comma-separated office recipients |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | one of SMTP or Resend | Your own mailbox |
| `RESEND_API_KEY` | one of SMTP or Resend | Resend transactional API |
| `DISCORD_WEBHOOK_URL` | no | Discord summary channel |
| `TEXTMEBOT_APIKEY` / `TEXTMEBOT_RECIPIENT` | no | TextMeBot WhatsApp **group** (recommended) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` / `TWILIO_WHATSAPP_TO` | no | Twilio WhatsApp (single number) |
| `CALLMEBOT_APIKEY` / `CALLMEBOT_PHONE` | no | CallMeBot WhatsApp (single number, free) |
| `WHATSAPP_WEBHOOK_URL` | no | Generic WhatsApp webhook (`{ text }`) |
| `NOTIFY_WEBHOOK` | no (legacy) | Apps Script Sheet work queue |
| `NETLIFY_FORM_NAME` | no (legacy) | Netlify Forms relay fallback |

---

## Rev 1 — (baseline)

Initial working proof of concept: unlimited revision items, Netlify Functions +
Blobs backend, office dashboard, client form + read-only view, drafts, rooms/
areas, attachments, drawn signature, Google Sheet work queue, Netlify Forms
notification relay.
