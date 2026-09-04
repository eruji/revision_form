# Design Revision Request Form — Google Forms Build

Implements the revision-request workflow from the shared ChatGPT conversation
("Create revision form") as a **Google Form** for **Pepper & Olive Interiors**.

Policy encoded in the form (from the firm's Letter of Agreement):

- **One (1) consolidated round of revisions** per design phase.
- Anything requested **after** this form = additional design services at **$225/hr**.
- Empathetic language: requests arising from a misunderstanding will be reviewed with care.

---

## Two build modes — controlled by one flag

At the top of `revision_request_form.gs`:

```js
var PREVIEW_MODE = true;
```

| | `PREVIEW_MODE = true` (current) | `PREVIEW_MODE = false` |
|---|---|---|
| Layout | **One single page** — every question top-to-bottom | Multi-section pages |
| Grouping | Section headings on the same page | Separate form sections |
| Required fields | **None** — preview freely | Key fields required |
| Type selector | Plain choices | Conditional routing (Architectural → Material → …) |

> Use `true` to review the structure, then flip to `false` and re-run to build the
> production form. Each run creates a **fresh form**, so you can iterate safely.

## 1. How to create the form (one time, ~3 minutes)

> You do **not** build the form by hand — a script assembles every question for you.

1. Open <https://script.google.com> → **New project**.
2. Delete the placeholder `function myFunction(){}`.
3. Copy the entire contents of [`revision_request_form.gs`](./revision_request_form.gs) into the editor and **save** (💾 or `Ctrl+S`).
4. Make sure the function `createRevisionRequestForm` is selected in the dropdown, then press **Run ▶**.
5. Google will ask for authorization — click **Review permissions** → choose your Google account → **Allow**. (The script only creates a Google Form and a Google Sheet in your Drive.)
6. When it finishes, click **View → Logs** (or **Execution log**) to see:
   - **Edit URL** — opens the form builder so you can review it
   - **Share URL** — the link you send to clients
   - **Responses SS** — the Google Sheet where responses are recorded (already linked)

## 2. What the form contains

Structure (headings shown even in single-page preview):

1. **About Your Revision Round** — Client Name, Project Name, Design Phase
   (dropdown), Date Submitted
2. **Type of revision(s)** — Architectural / Space Planning · Material & Finish · Both
3. **01 | Architectural + Space Planning Revisions** — 4 numbered blocks ×
   (Location/Room, Requested Edit, Why, Reference link)
4. **02 | Material + Finish Revisions** — 4 numbered blocks × (Location/Room,
   Material/Item, Requested Edit, Why, Reference link)
5. **03 | Anything Else We Should Know?** — open notes
6. **Revision Round Acknowledgment** — two confirm statements, typed Client Name
   (electronic signature), Signature Date

In **production mode**, blocks #1 are the only required fields (blocks 2–4 optional),
plus Client Name / Project / Phase / Date and the acknowledgment items.

## 3. Recommended manual settings (form editor → Settings ⚙️)

| Setting | Recommendation | Why |
|---|---|---|
| Collect email addresses | **On** | Gives you a dated record of who submitted each revision round |
| Restrict to one response | Off (leave as-is) | A client may legitimately have multiple phases; see "Per-phase copies" below |
| Edit after submit | Your choice | Off keeps a cleaner contractual record |
| See summary charts | Off | N/A for clients |
| Confirmation message | Already set by script | Customize wording if desired |

## 4. Known Google Forms limitations & how this build handles them

1. **No native signature capture.** Google Forms can't collect a drawn signature.
   This build uses a **typed client name** as the electronic signature (per a note on
   the question itself). For a real drawn signature, Jotform (the chat's #1 pick) is
   the better platform.
2. **No "＋ Add another revision" pattern.** Google Forms has no repeatable blocks,
   so each section ships with **4 numbered blocks**. Block 1 is required (production);
   the rest are optional. Clients with more items can continue in *Anything Else*.
3. **File/image upload requires Google sign-in.** If you add a file-upload question,
   every client must sign in to a Google account to submit. This build therefore uses
   **reference links** (Pinterest/Houzz/Instagram) instead — zero sign-in friction.
4. **Section routing is one-way per question.** In production, "Both" routes clients
   through the Architectural section, where a binder question asks *"Do you also have
   material & finish revisions?"* — Yes → material section; No → skips ahead.

## 5. Using it as a per-phase template

Each design phase is entitled to its own round, so use **one form link per phase**:

- **Option A (separate links):** In the form editor, ⋮ menu → **Make a copy** for each
  phase (e.g., "— Concept Phase", "— Design Development"). Send each client the link
  for the current phase only. Responses stay in separate sheets.
- **Option B (single link, filter later):** Keep one form; the **Design Phase**
  dropdown records the phase per submission. Filter the responses sheet by phase when
  tracking each round.

## 6. Editing the template for another client / rate

All variables live at the top of `revision_request_form.gs`:

```js
var BUSINESS      = 'Pepper & Olive Interiors';
var HOURLY_RATE   = 225;
var BLOCKS_PER_SECTION = 4;   // numbered revision rows per section
var PREVIEW_MODE  = true;     // flip to false for the production build
```

Change them, re-run the script, and a fresh form is generated.
