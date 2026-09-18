# Design Revision Request — Unlimited-Item Proof of Concept

**Pepper & Olive Interiors**

This repo now contains a **working web proof of concept** where clients can add
**as many revision items as they need** — the thing Google Forms could not do.

The original Google Forms builder script (`revision_request_form.gs`) is kept
below as an alternative, but the web app is the recommended direction to
evaluate with your team.

---

## Why the Google Form was hitting a wall

Google Forms has **no "＋ Add another item" / repeatable block** pattern. To work
around that, the script shipped a fixed number of numbered blocks (4 per
section) and told clients to cram anything extra into a free-text "Anything
else" box. That breaks down the moment a client has 9 changes — you lose
structure, the "why," and the reference links for items 5–9.

A real form needs to grow with the client. That's what this POC does.

---

## What's in the box

| File | Purpose |
|---|---|
| `index.html` / `admin.js` | Office dashboard at the site root (`/`) — behind Cloudflare Access; per-request JSON/CSV export |
| `clients/form.html` / `app.js` | Client revision form — opened via a generated link (`?r=…`, `?resume=…`) |
| `clients/view.html` / `view.js` | Private read-only copy (`?token=…`) with print/PDF + JSON |
| `setup.js` | Team setup panel (configurable wording), opened from the dashboard |
| `styles.css` | Styling — brand palette + fonts matched to pepperandolive.com |
| `clients/logo-*.svg`, `clients/favicon.ico` | Brand assets from the main site (served under public `/clients/`) |
| `config.js` | **The questions and policy copy your team will iterate on** |
| `netlify/functions/*` | API — office (`admin`, `rounds`) + public client (`submit`, `get`, `draft`, `round`, `upload`, `file`), with `lib/access.js` for Cloudflare Access verification |
| `google_apps_script.gs` | Apps Script bridge: Google Sheet work queue + email notification |
| `netlify.toml` | Publish dir, functions dir, `/api/*` routing, headers |
| `.github/workflows/deploy.yml` | CI: install deps → stage files → deploy on push |
| `revision_request_form.gs` | Legacy Google Forms builder (alternative path) |

No build step for the front end; Netlify hosts the static app and runs the
functions.

**URL map**

| URL | What it is |
|---|---|
| `/` | Office dashboard — **behind Cloudflare Access** |
| `/api/admin`, `/api/rounds` | Office APIs — **behind Cloudflare Access** |
| `/clients/form.html?r=…` | Client revision form, opened from a generated request link (public) |
| `/clients/form.html?resume=…` | Client form restored from a saved draft code (public) |
| `/clients/view.html?token=…` | Private read-only copy of a submission (public) |
| `/clients/api/*` | Public client API (submit, get, draft, round, upload, file) |

Clients only ever reach `/clients/…` through a link the dashboard generates; the
root and the office APIs are gated by Cloudflare Zero Trust.

## Run it (10 seconds)

**Option A — just open the client form:** double-click `clients/form.html`.

**Option B — local server (needed for the dashboard, best for sharing):**
```bash
cd revision_form
python -m http.server 8080      # or: npx serve .
```
Then open <http://localhost:8080> for the dashboard (it needs the API, so use the
full site or `netlify dev`), or <http://localhost:8080/clients/form.html> for the
form.

> The form and read-only copy call `/clients/api/*`; if the backend isn't
> reachable they fall back to browser `localStorage` so you can still demo the
> form offline. The dashboard itself requires the backend.

## Reading responses, privacy & saving progress

| Requirement | How it works |
|---|---|
| **Office reads responses** | The dashboard at the site root (`/`) is behind **Cloudflare Access** (team SSO, no shared password). It lists every submission; open one for **Print / PDF**, **JSON**, or **CSV**. |
| **Client can't see others** | Every submission gets a secret 256-bit token. `/clients/api/get` returns only the submission matching that token, and unknown tokens get a plain 404. There is **no public endpoint that lists submissions**. |
| **Save progress until submit** | Autosave in the browser, plus **Save & continue later** → a resume code stored server-side that works on any device via `/clients/form.html?resume=CODE`. Saved drafts **expire after 30 days**. |
| **Office can see and share drafts** | Saved drafts appear in the office dashboard with a **View** read-only link (`/clients/view.html?draft=CODE`) and a **Copy client link** button to send the client back to finish. |
| **Client copy for records** | Private read-only page with **Print / Save as PDF** and **Download JSON**. |
| **Photos & attachments** | Each revision item can attach up to 5 photos or PDFs (4 MB each; large images are resized in the browser first). Files live in Netlify Blobs and are reachable only by their random id — the read-only view and office dashboard show thumbnails, and CSV export lists the URLs. |
| **Drawn signature** | The acknowledgment step includes a canvas signature pad (mouse, finger, or stylus). The drawn PNG is stored with the submission and shown in the read-only view / dashboard alongside the typed name. |
| **Read-only online view** | `/clients/view.html?token=…` — no edit fields. |

### Office dashboard
- URL: `/` (the site root) on the live site.
- **Google Sheet work queue (currently hidden):** the dashboard has a card to
  paste the spreadsheet URL and Save, which adds **Sheet** links. It is hidden
  for now; the code remains for when Sheet sync is enabled.
- Shows **submitted requests** and **saved drafts**.
  - Each **submitted request** has **View** (full read-only detail), **JSON**,
    and **CSV** export, plus **Print / Save as PDF** from the detail view.
  - Submitted requests can be **Archived** (hidden from the main list but kept in
    full) and restored with **Unarchive**, or permanently **Delete**d (with a
    confirmation prompt). Archived requests live in their own
    **Archived requests** section and are still available in a per-request CSV/JSON export.
  - For each **draft** you can **View** it read-only (`/clients/view.html?draft=CODE`),
    **Copy client link** (the resume link to send back to the client), or
    **Delete** it. Drafts expire automatically after 30 days (a daily scheduled
    job purges them).
- **Access:** the dashboard and the office APIs (`/api/admin`, `/api/rounds`)
  are protected by **Cloudflare Access** (Zero Trust). No shared password —
  members sign in with the team IdP. The Netlify functions verify Cloudflare's
  `Cf-Access-Jwt-Assertion`, so the raw `*.netlify.app` origin cannot be used to
  bypass Cloudflare. `ADMIN_PASSWORD` remains an optional fallback for local dev
  when the Access env vars are unset (see “Custom domain + Cloudflare Zero Trust” below).

### Backend at a glance
- **Netlify Functions + Netlify Blobs** — no extra account, data stays in this
  Netlify site.
- Office endpoints (behind Access): `/api/admin`, `/api/rounds`.
- Public client endpoints: `/clients/api/submit`, `/clients/api/get`,
  `/clients/api/draft`, `/clients/api/round`, `/clients/api/upload`,
  `/clients/api/file`.
- Env vars on the Netlify site: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`
  (Cloudflare Access), `BLOBS_SITE_ID`, `BLOBS_TOKEN` (secret), and optional
  `ADMIN_PASSWORD` (local fallback).

> **Privacy notes:** submissions contain client PII. Tokens are stored hashed,
> drafts are deleted when a round is submitted, and responses are marked
> `no-store`. Uploaded attachments are served only via their random file id (no
> listing endpoint) and carry `Cache-Control: private`. Before a real rollout,
> add a data-retention policy for submissions **and their attachments**, rotate
> the Blobs token, and consider connecting the site to GitHub in Netlify (which
> injects the Blobs context and removes the need for `BLOBS_TOKEN`).

---

## Issuing a revision request link

The office no longer asks the client to type the project and phase. Instead:

1. Open the dashboard at `/` and use **New revision request link**.
2. Enter client, project, and design phase (a note to the client is optional),
   then **Create link**.
3. Copy the link and send it. It looks like
   `https://revision.pepperandolive.com/clients/form.html?r=AbC123xyz`.

When the client opens it, the form shows a context banner (*“Revision request
for Maple Residence — Design Development”*) and **section 01 is hidden** — the
project, phase, and client are baked into the link and stamped onto the
submission server-side.

### Reopening a request for one-off items
In the **Request links** list, click **Reopen** on a submitted round and send the
same link again. The client sees their previously submitted items in a
read-only panel and adds only the new ones. Each submission is recorded
separately, and the Sheet receives the new rows.

---

## Notifications + Google Sheet work queue

**Email (Netlify, no third party).** The backend relays each saved submission to
a hidden, registered Netlify Form (`revision-notification`); Netlify's own form
notification sends the email.

1. The hidden form is already in the page, and form detection is enabled.
2. In Netlify: **Forms → revision-notification → Notifications → Add
   notification → Email**, and enter the recipient.
3. `NETLIFY_FORM_NAME=revision-notification` must be set (it is).

The email is a plain field list (project, client, phase, item count, summary,
read-only link). Netlify Forms has a monthly submission allowance on lower plans.

**Google Sheet work queue (optional).** Deploy the Apps Script to also append one
row per revision item to a Sheet with `Status / Assigned To / Completed / Notes`
columns. One-time setup:

1. Open <https://script.google.com> → **New project**, paste
   [`google_apps_script.gs`](./google_apps_script.gs).
2. Edit `CONFIG.NOTIFY_EMAIL` (and the spreadsheet name if you like). Set
   `WRITE_TO_SHEET: false` for the script to email only and create no Sheet.
3. Run **`setup()`** and authorize — it creates the Sheet and logs its URL.
4. **Deploy → New deployment → Web app**; *Execute as: Me*,
   *Who has access: Anyone*. Copy the `/exec` URL.
5. In Netlify, set `NOTIFY_WEBHOOK` and redeploy:
   ```bash
   npx netlify-cli env:set NOTIFY_WEBHOOK "https://script.google.com/macros/s/.../exec" --context production
   ```

Notifications are optional: without `NOTIFY_WEBHOOK`, submissions still save to
the dashboard and the Netlify email still fires.

---

## Custom domain + Cloudflare Zero Trust (revision.pepperandolive.com)

The dashboard (`/`) and the office APIs (`/api/admin`, `/api/rounds`) sit behind
**Cloudflare Access**. The client pages and APIs under `/clients/` are public, so
request links work for clients who don't have a Cloudflare account.

1. **Netlify:** Project configuration → Domain management → Add a domain →
   `revision.pepperandolive.com`.
2. **DNS (Cloudflare):** add `CNAME revision → <your-site>.netlify.app`, set to
   **Proxied** (orange cloud), SSL/TLS mode **Full (strict)**, and enable
   **Always Use HTTPS**.
3. **Access app 1 — the office:** Zero Trust → Access → Applications →
   *Self-hosted*, application domain `revision.pepperandolive.com` (no path = the
   whole site), policy **Allow → your team** (Google Workspace / email OTP).
4. **Access app 2 — the client surface:** application domain
   `revision.pepperandolive.com/clients` with policy **Bypass → Everyone**.
   Because the client pages load shared assets from the root, add these as extra
   public hostnames on this same app: `/styles.css`, `/config.js`, `/setup.js`,
   `/app.js`, `/view.js`. (Access matches the most specific path, so `/clients/*`
   wins over the whole-site app.)
5. **Netlify env vars:** set `CF_ACCESS_TEAM_DOMAIN` (e.g.
   `pepperandolive.cloudflareaccess.com`) and `CF_ACCESS_AUD` (the Audience tag
   shown on the Access application). Redeploy. The office functions now accept
   requests carrying a valid Cloudflare `Cf-Access-Jwt-Assertion`.

**Why the JWT check matters:** Cloudflare Access only guards traffic through
Cloudflare. Your Netlify origin (`<your-site>.netlify.app`) stays publicly
reachable, so without this check someone could hit `/api/admin` directly and
bypass Zero Trust. The functions verify the Access JWT (RS256 against the team's
Access certs, matching the app `aud`) and reject anything that didn't come
through Cloudflare.

**Verify:** in a private window, `/` should prompt for Access (no password),
`/clients/form.html?r=…` should load with no prompt, and hitting
`https://<your-site>.netlify.app/api/admin` directly should return `401`.

> If your Cloudflare plan doesn't do path-specific bypass the way you expect, the
> fallback is to keep the dashboard at a path instead of the root: redirect `/` →
> `/admin` (Netlify), and protect only `/admin*` + `/api/admin*` + `/api/rounds*`.
> No Bypass app needed then.

Request links are built from the browser's current origin, so once the subdomain
is live the generated links automatically use
`https://revision.pepperandolive.com/clients/…`.

## Share for review

| Link | Use |
|---|---|
| **https://revision.pepperandolive.com/clients/form.html?review=1** | **Send this to reviewers** — shows a dismissible "Review mode" banner explaining what to click |
| https://revision.pepperandolive.com/clients/form.html | The clean, client-facing version (no banner) |

Every push to `main` auto-deploys to Netlify via
`.github/workflows/deploy.yml`, using the `NETLIFY_AUTH_TOKEN` and
`NETLIFY_SITE_ID` repository secrets.

---

## What the client experiences

0. **Revision instructions (always visible)** — the one-round policy and billing
   terms are shown in full at the top of the page, never collapsed, and must be
   acknowledged before the form can be submitted.
1. **Context from the request link** — project, phase, and client come from the
   link the office sent, so there is no section 01. (A fallback "about" section
   appears only if the form is opened without a link.)
2. **Revision items** — each item captures Type, Location/Room, What to change,
   Why, and an inspiration link.
   - Big **“＋ Add another revision”** button. No cap.
   - Each card can be **duplicated, reordered, or removed**.
   - Live item counter (“8 items”).
3. **Acknowledgment** — the client must confirm they have read and agree to the
   instructions, plus the one-round and hourly-rate confirmations, typed
   e-signature, and date.
4. **Submit** — success screen with a JSON/CSV download of exactly what the
   office receives.
5. **Read-only copy** — the private link renders every reference URL as a
   **clickable link**, and **Print / Save as PDF** preserves those links.

**Draft autosave:** everything the client types is saved as they go, so a
closed tab doesn't lose a long list of revisions. They can also click
**Save & continue later** to get a resume code that works on any device. There's
a *Clear draft* button too.

---

## The tools for your team

These are the parts that directly answer *“what should we ask?”*

### 🔧 Team setup (internal — hidden from clients)
Reachable from the office dashboard's **Team setup** button, which pops the
configuration panel open right over the dashboard — no page load, and the client
revision form is never involved. Clients never see it. A live panel over the
form:
- Turn any question **on/off** and mark it **required**.
- **Rename** question labels inline.
- **Reorder** the fields that appear on every revision item.
- **Add custom questions** (text, long text, dropdown, link) — e.g. *Budget
  impact*, *Deadline sensitivity*, *Already purchased?*.
- Edit the business name, hourly rate, and the full policy/intro copy.
- **Export config** to a JSON file to share with the team, and **Import config**
  to try someone else's version.
- **Reset to defaults** at any time.

Changes apply instantly and persist in your browser. This makes it cheap to
prototype three or four question sets, screenshot them, and pick one as a team.

### 🗂 Office dashboard (internal — the one place the team reads submissions)
The dashboard at **`/`** (behind Cloudflare Access — see “Reading responses”
above) lists every client, exports each request to JSON/CSV, manages request
links, and archives or deletes requests. Its **Team setup** button pops the
configuration panel open over the dashboard; there is no separate in-app office
view.

The same setup panel is available on the client form only with `?manage=1`
(hidden from clients).

---

## Suggested team exercise

1. Open **Team setup** and try toggling `Priority` on, adding a custom question,
   and rewording the intro. Save.
2. Submit a fake round with **10 items** to feel the unlimited flow.
3. Open the office dashboard (`/`), open a submission, and click *Download CSV*.
   Is that the shape your team wants to triage from?
4. Decide together:
   - Which fields are **required vs. nice-to-have**?
   - Do we want a **priority** or **deadline** field?
   - Should “Why” be required? (It's optional today.)
   - Do we need **photos**? (See production notes below.)
5. **Export config** and attach it to your decision notes.

---

## Turning it into a production form

A working backend is now included (Netlify Functions + Blobs). If your team
would rather store responses in a tool you already use, the **submission payload
is the contract** — the shape stored by `collectSubmission()` in `app.js`:

```json
{
  "id": "…",
  "submittedAt": "2025-…",
  "about":     { "clientName": "…", "projectName": "…", "designPhase": "…" },
  "revisions": [ { "category": "…", "location": "…", "description": "…",
                   "reason": "…", "reference": "…" } ],
  "acknowledgment": { "ackRound": true, "signature": "…" }
}
```

Options, roughly in order of effort:

| Option | Unlimited items | Notes |
|---|---|---|
| **Current build: Netlify Functions + Blobs** | ✅ | Works today; office reads via the `/` dashboard (per-request JSON/CSV). |
| **Apps Script → Google Sheet** | ✅ | Swap the storage layer if the team prefers reading in Sheets. |
| **Airtable / Supabase** | ✅ | Managed DB with nicer admin tooling; modest setup. |
| **Jotform** | ✅ | Native *Configurable List* widget does repeatable rows; also offers drawn signatures and uploads. Paid for volume. |
| **Typeform / Tally** | ⚠️ | Tally has repeating sections on higher tiers; verify before committing. |

Before production, decide on one remaining gap:
- **Attachment storage & retention** — this POC keeps uploads in Netlify Blobs (with
  per-file ids, no listing). A production rollout should set a retention/cleanup
  policy for submitted files alongside the submission itself.

---

## Editing the questions directly (optional)

All defaults live in `config.js`. Example — make “Why” required and turn on
“Priority”:

```js
{ id: 'reason',  label: 'Why would you like this changed?', type: 'textarea',
  required: true,  enabled: true },
{ id: 'priority', label: 'Priority', type: 'select',
  required: false, enabled: true, options: ['Nice to have','Important','Critical'] }
```

Reopen the app and it renders from the new config. (If you've saved overrides in
Team setup, click **Reset to defaults** to pick up file changes.)

The two special field types added for this build:

```js
// On a revision item — up to 5 photos/PDFs, uploaded on their own endpoint
{ id: 'attachments', label: 'Photos / attachments', type: 'file',
  help: 'Large images are resized automatically.', required: false, enabled: true },

// In the acknowledgment block — canvas signature pad (PNG data URL)
{ id: 'signatureDrawn', label: 'Draw your signature', type: 'signature',
  required: false, enabled: true }
```

Attachments appear in the read-only view and dashboard as thumbnails; a drawn
signature is shown as an image. In CSV exports the attachment column holds the
file URLs and the signature column reads “Signed (drawn signature)”.

---

## Legacy: the Google Forms builder

The original script and its full instructions are still here for reference:

1. Open <https://script.google.com> → **New project**.
2. Paste `revision_request_form.gs`, set `PREVIEW_MODE`, run
   `createRevisionRequestForm()`, and authorize.
3. View → Logs for the Edit URL, Share URL, and responses Sheet.

It remains a valid no-backend option — it just can't do unlimited revision
items, which is why this POC exists.
