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
| `index.html` | Client form shell (form + Team setup + in-browser Office view) |
| `view.html` / `view.js` | Private read-only copy (`?token=…`) with print/PDF + JSON |
| `admin.html` / `admin.js` | Password-protected office dashboard with CSV export |
| `styles.css` | Styling — olive/cream brand palette, responsive |
| `config.js` | **The questions and policy copy your team will iterate on** |
| `app.js` | Unlimited items, validation, draft autosave, backend calls |
| `netlify/functions/*` | Serverless API — `submit`, `get`, `draft`, `admin` (Netlify Blobs) |
| `netlify.toml` | Publish dir, functions dir, `/api/*` routing, headers |
| `.github/workflows/deploy.yml` | CI: install deps → stage files → deploy on push |
| `revision_request_form.gs` | Legacy Google Forms builder (alternative path) |

No build step for the front end; Netlify hosts the static app and runs the
functions.

## Run it (10 seconds)

**Option A — just open it:** double-click `index.html`.

**Option B — local server (best for sharing on your network):**
```bash
cd revision_form
python -m http.server 8080      # or: npx serve .
```
Then open <http://localhost:8080>.

> The app saves to the shared backend when it is reachable. If it isn't (for
example opening `index.html` directly, or on a plain static host), it falls back
to browser `localStorage` so you can still demo it offline.

## Reading responses, privacy & saving progress

| Requirement | How it works |
|---|---|
| **Office reads responses** | Password-protected `/admin.html` dashboard with **Export all CSV** (opens in Sheets). The in-app **Office view** shows same-browser submissions for demos. |
| **Client can't see others** | Every submission gets a secret 256-bit token. `/api/get` returns only the submission matching that token, and unknown tokens get a plain 404. There is **no public endpoint that lists submissions**. |
| **Save progress until submit** | Autosave in the browser, plus **Save & continue later** → a resume code stored server-side that works on any device via `/?resume=CODE`. Saved drafts **expire after 30 days**. |
| **Office can see and share drafts** | Saved drafts appear in the office dashboard with a **View** read-only link (`/view.html?draft=CODE`) and a **Copy client link** button to send the client back to finish. |
| **Client copy for records** | Private read-only page with **Print / Save as PDF** and **Download JSON**. |
| **Read-only online view** | `/view.html?token=…` — no edit fields. |

### Office dashboard
- URL: `/admin.html` on the live site.
- Shows **submitted requests** and **saved drafts**. For each draft you can
  **View** it read-only (`/view.html?draft=CODE`), **Copy client link** (the
  resume link to send back to the client), or **Delete** it. Drafts expire
  automatically after 30 days (a daily scheduled job purges them).
- Password: stored as the `ADMIN_PASSWORD` environment variable in Netlify.
- To change it:
  ```bash
  npx netlify-cli env:set ADMIN_PASSWORD "your-new-password" --context production
  ```
  then redeploy.

### Backend at a glance
- **Netlify Functions + Netlify Blobs** — no extra account, data stays in this
  Netlify site.
- Endpoints: `/api/submit`, `/api/get`, `/api/draft`, `/api/admin`.
- Env vars on the Netlify site: `ADMIN_PASSWORD` (secret), `BLOBS_SITE_ID`,
  `BLOBS_TOKEN` (secret).

> **Privacy notes:** submissions contain client PII. Tokens are stored hashed,
> drafts are deleted when a round is submitted, and responses are marked
> `no-store`. Before a real rollout, add a data-retention policy, rotate the
> Blobs token, and consider connecting the site to GitHub in Netlify (which
> injects the Blobs context and removes the need for `BLOBS_TOKEN`).

## Share for review

| Link | Use |
|---|---|
| **https://pepper-olive-revision-form.netlify.app/?review=1** | **Send this to reviewers** — shows a dismissible "Review mode" banner explaining what to click |
| https://pepper-olive-revision-form.netlify.app | The clean, client-facing version (no banner) |

Every push to `main` auto-deploys to Netlify via
`.github/workflows/deploy.yml`, using the `NETLIFY_AUTH_TOKEN` and
`NETLIFY_SITE_ID` repository secrets.

---

## What the client experiences

0. **Revision instructions (always visible)** — the one-round policy and billing
   terms are shown in full at the top of the page, never collapsed, and must be
   acknowledged before the form can be submitted.
1. **About the round** — client, project, design phase, date.
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

## The two tools for your team

These are the parts that directly answer *“what should we ask?”*

### 🔧 Team setup (top-right button)
A live admin panel over the form:
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

### 🗂 Office view (top-right button)
For live submissions, the office uses the password-protected **`/admin.html`**
dashboard (see “Reading responses” above), which lists all clients and exports
CSV. The in-app **Office view** button shows submissions stored in the current
browser — handy for demos when the backend isn't running.

---

## Suggested team exercise

1. Open **Team setup** and try toggling `Priority` on, adding a custom question,
   and rewording the intro. Save.
2. Submit a fake round with **10 items** to feel the unlimited flow.
3. Open **Office view** → *Export all CSV*. Is that the shape your team wants to
   triage from?
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
| **Current build: Netlify Functions + Blobs** | ✅ | Works today; office reads via `/admin.html` + CSV. |
| **Apps Script → Google Sheet** | ✅ | Swap the storage layer if the team prefers reading in Sheets. |
| **Airtable / Supabase** | ✅ | Managed DB with nicer admin tooling; modest setup. |
| **Jotform** | ✅ | Native *Configurable List* widget does repeatable rows; also has drawn signatures. Paid for volume. |
| **Typeform / Tally** | ⚠️ | Tally has repeating sections on higher tiers; verify before committing. |

Two POC gaps to decide on before production:
- **File/photo uploads** — not included here. Uploads need storage (Drive/S3) and
  were the reason the Google version used reference *links* instead.
- **Drawn signature** — this POC uses a typed e-signature. A canvas signature
  widget or Jotform is needed if you want a drawn one.

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

---

## Legacy: the Google Forms builder

The original script and its full instructions are still here for reference:

1. Open <https://script.google.com> → **New project**.
2. Paste `revision_request_form.gs`, set `PREVIEW_MODE`, run
   `createRevisionRequestForm()`, and authorize.
3. View → Logs for the Edit URL, Share URL, and responses Sheet.

It remains a valid no-backend option — it just can't do unlimited revision
items, which is why this POC exists.
