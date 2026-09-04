/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  PEPPER & OLIVE INTERIORS — DESIGN REVISION REQUEST FORM (Google Forms)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Builds a client-facing Google Form based on the firm's design revision
 *  policy: ONE consolidated round of revisions per design phase is included;
 *  anything after this form is billed at the hourly rate.
 *
 *  HOW TO RUN (one time):
 *    1. Go to https://script.google.com  →  New project
 *    2. Delete the placeholder code, paste this entire file, save.
 *    3. Run the function  →  createRevisionRequestForm()
 *    4. Authorize when prompted (the script only creates a Form + Spreadsheet
 *       in your Google Drive).
 *    5. The Form edit URL, share URL, and responses spreadsheet URL are logged
 *       at the bottom — click View → Logs to see them.
 *
 *  AFTER RUNNING, see README.md in this repo for recommended settings
 *  (collect email, confirmation message, per-phase copies, etc.).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ═════════════════════════════════════════════════════════════════════════════
//  CONFIGURATION — edit these to re-template for other clients / rates
// ═════════════════════════════════════════════════════════════════════════════
var BUSINESS      = 'Pepper & Olive Interiors';
var HOURLY_RATE   = 225;                    // $ per hour for out-of-round work
var FORM_TITLE    = BUSINESS + ' — Design Revision Request Form';
var SHEET_NAME    = BUSINESS + ' — Revision Request Responses';

/**
 * PREVIEW_MODE
 *   true  → ONE single page: every question listed top-to-bottom, nothing
 *           required, no routing. Use this to review the structure quickly.
 *   false → Production layout: multi-section with conditional routing,
 *           required key fields, and acknowledgment checkboxes.
 */
var PREVIEW_MODE  = true;

// How many numbered revision "blocks" to include per revision section.
// (Google Forms has no native "add another item" — so we provide N numbered
//  blocks per section. In production only Block #1 is required.)
var BLOCKS_PER_SECTION = 4;

/**
 * Adds a group heading.
 *  PREVIEW_MODE → SectionHeaderItem (bold heading on the same page)
 *  production   → PageBreakItem (starts a new section/page; returned so
 *                 question choices can route to it)
 */
function addHeading(form, label, help) {
  var item = PREVIEW_MODE
    ? form.addSectionHeaderItem()
    : form.addPageBreakItem();
  item.setTitle(label);
  if (help) item.setHelpText(help);
  return item;
}

function createRevisionRequestForm() {

  var form = FormApp.create(FORM_TITLE);
  form.setTitle(FORM_TITLE);

  // ── Intro copy on the cover page ───────────────────────────────────────────
  form.setDescription(
    'Thank you for reviewing your design! The design process is collaborative, and ' +
    'your feedback is an important part of making sure the final space feels ' +
    'thoughtful, functional, and uniquely yours.\n\n' +
    'As outlined in your Letter of Agreement, one (1) consolidated round of ' +
    'revisions is included with each design phase. Please review the design in its ' +
    'entirety before submitting, and include ALL requested changes for this design ' +
    'phase in this single submission. Once submitted, this form counts as your one ' +
    'included round for the current design phase.\n\n' +
    'Additional revisions, new requests, or changes submitted after this form will ' +
    'be considered additional design services and billed at our current hourly rate ' +
    'of $' + HOURLY_RATE + '/hour, in accordance with your Letter of Agreement.\n\n' +
    'We also understand that design is nuanced and communication is not always ' +
    'perfect. If a change stems from a misunderstanding or something our team did ' +
    'not interpret or execute as you intended, we will review it with care and find ' +
    'the most appropriate path forward. Our goal is to protect the integrity of the ' +
    'process while making sure you feel heard and confident in the final design.'
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  GROUP — ABOUT YOUR REVISION ROUND
  // ═══════════════════════════════════════════════════════════════════════════
  addHeading(form, 'About Your Revision Round',
    'Tell us who you are and which design phase this request applies to.');

  var clientName = form.addTextItem()
    .setTitle('Client Name')
    .setRequired(true);

  var projectName = form.addTextItem()
    .setTitle('Project Name')
    .setRequired(true);

  var designPhase = form.addListItem()  // renders as a dropdown
    .setTitle('Design Phase')
    .setHelpText('Select the design phase this revision request applies to (one included round per phase).')
    .setRequired(true);
  designPhase.setChoiceValues([
    'Concept / Space Planning',
    'Design Development',
    'Construction Documents',
    'Other (please note in the final section)'
  ]);

  var submitDate = form.addDateItem()
    .setTitle('Date Submitted')
    .setHelpText('Date you are submitting this revision request.')
    .setIncludesYear(true)
    .setRequired(true);

  // Type selector — choices are wired to sections in production mode only.
  var revisionType = form.addMultipleChoiceItem()
    .setTitle('What type of revision(s) are you requesting?')
    .setHelpText('Architectural / space planning, material & finish, or both.')
    .setRequired(true);

  // ═══════════════════════════════════════════════════════════════════════════
  //  GROUP — 01 ARCHITECTURAL + SPACE PLANNING REVISIONS
  // ═══════════════════════════════════════════════════════════════════════════
  var pageArch = addHeading(form, '01 | Architectural + Space Planning Revisions',
    'Use this section for changes to layouts, floor plans, cabinetry, built-ins, ' +
    'elevations, architectural details, plumbing locations, lighting locations, or ' +
    'other architectural elements.\n\n' +
    'A few numbered rows are provided — complete as many as you need. ' +
    'Paste Pinterest / Houzz / retailer / Instagram links in the reference field.');

  for (var i = 1; i <= BLOCKS_PER_SECTION; i++) {
    addRevisionBlock(form, 'ARCH', i, (i === 1));
  }

  // Binder question (production only) — routes to the material section if needed.
  var archBinder = null;
  if (!PREVIEW_MODE) {
    archBinder = form.addMultipleChoiceItem()
      .setTitle('Do you also have material & finish revisions to include?')
      .setHelpText('If yes, you will be taken to the Material + Finish section next.')
      .setRequired(true);
    archBinder.setChoiceValues(['Yes', 'No']);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GROUP — 02 MATERIAL + FINISH REVISIONS
  // ═══════════════════════════════════════════════════════════════════════════
  var pageMat = addHeading(form, '02 | Material + Finish Revisions',
    'Use this section for changes to tile, flooring, countertops, cabinetry ' +
    'finishes, paint, wallpaper, plumbing fixtures, lighting, hardware, ' +
    'furnishings, textiles, or other specified materials and finishes.\n\n' +
    'A few numbered rows are provided — complete as many as you need. ' +
    'Paste Pinterest / Houzz / retailer / Instagram links in the reference field.');

  for (var j = 1; j <= BLOCKS_PER_SECTION; j++) {
    addRevisionBlock(form, 'MAT', j, (j === 1));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GROUP — 03 ANYTHING ELSE WE SHOULD KNOW?
  // ═══════════════════════════════════════════════════════════════════════════
  var pageExtra = addHeading(form, '03 | Anything Else We Should Know?',
    'Sometimes the why behind a request matters as much as the request itself. ' +
    'If something does not fit neatly into the sections above — or your thoughts ' +
    'about the overall direction have changed — tell us here.');

  form.addParagraphTextItem()
    .setTitle('Additional notes or context for our team')
    .setHelpText('Optional — use this space for anything that does not fit in the revision rows above (including any revisions beyond the numbered rows).');

  // ═══════════════════════════════════════════════════════════════════════════
  //  GROUP — REVISION ROUND ACKNOWLEDGMENT
  // ═══════════════════════════════════════════════════════════════════════════
  var pageAck = addHeading(form, 'Revision Round Acknowledgment',
    'Before submitting, please confirm that you have reviewed the current design and ' +
    'included all requested revisions for this phase.');

  form.addCheckboxItem()
    .setTitle('Please confirm each statement below:')
    .setRequired(true)
    .setChoiceValues([
      'I have reviewed the design in its entirety and understand that this submission ' +
      'represents my one (1) included round of revisions for this design phase.'
    ]);

  form.addCheckboxItem()
    .setTitle('And this one:')
    .setRequired(true)
    .setChoiceValues([
      'I understand that revisions, additions, or changes requested after submission of ' +
      'this form may be considered additional design services and billed at ' + BUSINESS +
      '\u2019s current hourly rate of $' + HOURLY_RATE + '/hour, as outlined in my Letter of Agreement.'
    ]);

  form.addTextItem()
    .setTitle('Client Name (typing your name below serves as your electronic signature)')
    .setRequired(true);

  form.addDateItem()
    .setTitle('Signature Date')
    .setIncludesYear(true)
    .setRequired(true);

  form.setConfirmationMessage(
    'Thank you — your revision request has been received!\n\n' +
    'Our design team will review your feedback and be in touch shortly. ' +
    'Please note this submission represents your one included round of revisions ' +
    'for this design phase.'
  );
  form.setShowLinkToRespondAgain(false);

  // ═══════════════════════════════════════════════════════════════════════════
  //  FINALIZE QUESTION OPTIONS + ROUTING
  // ═══════════════════════════════════════════════════════════════════════════
  if (PREVIEW_MODE) {
    // Flat structure: plain options, no navigation, nothing required.
    revisionType.setChoiceValues([
      'Architectural / Space Planning',
      'Material & Finish',
      'Both'
    ]);

    // Clear the "required" flag on every question so the preview is friction-free.
    var ItemType = FormApp.ItemType;
    var requiredTypes = [ItemType.TEXT, ItemType.PARAGRAPH_TEXT, ItemType.MULTIPLE_CHOICE,
                         ItemType.LIST, ItemType.CHECKBOX, ItemType.DATE];
    var items = form.getItems();
    for (var k = 0; k < items.length; k++) {
      if (requiredTypes.indexOf(items[k].getType()) !== -1) {
        items[k].setRequired(false);
      }
    }
  } else {
    revisionType.setChoices([
      revisionType.createChoice('Architectural / Space Planning', pageArch),
      revisionType.createChoice('Material & Finish', pageMat),
      revisionType.createChoice('Both', pageArch)   // guided to materials by binder Q
    ]);
    archBinder.setChoices([
      archBinder.createChoice('Yes', pageMat),
      archBinder.createChoice('No', pageExtra)      // jump past the material section
    ]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RESPONSES SPREADSHEET  (creates + links a Google Sheet for records)
  // ═══════════════════════════════════════════════════════════════════════════
  var sheet = SpreadsheetApp.create(SHEET_NAME);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  // ═══════════════════════════════════════════════════════════════════════════
  //  REPORT LINKS  (View → Logs to see these)
  // ═══════════════════════════════════════════════════════════════════════════
  Logger.log('FORM CREATED ✔  (PREVIEW_MODE = ' + PREVIEW_MODE + ')');
  Logger.log('Edit URL      : ' + form.getEditUrl());
  Logger.log('Share URL     : ' + form.shortenFormUrl(form.getPublishedUrl()));
  Logger.log('Responses SS  : ' + sheet.getUrl());
}

/**
 * Adds one numbered revision block (Location → Request → Why → Reference link).
 *
 * @param {Form} form
 * @param {string} kind  'ARCH' or 'MAT'  (controls which fields appear)
 * @param {number} n     block number (1-based)
 * @param {boolean} required  whether the core fields of this block are required
 *                            (only honored in production mode; the preview
 *                            pass clears required flags at the end)
 */
function addRevisionBlock(form, kind, n, required) {

  if (kind === 'ARCH') {
    form.addTextItem()
      .setTitle('Architectural Revision #' + n + ' — Location / Room')
      .setHelpText('e.g., Primary bathroom, Kitchen island, Mudroom layout')
      .setRequired(required);

    form.addParagraphTextItem()
      .setTitle('Architectural Revision #' + n + ' — What would you like changed?')
      .setHelpText('Describe the specific architectural element you would like us to revisit (layout, cabinetry, elevations, lighting/plumbing locations, etc.).')
      .setRequired(required);

    form.addParagraphTextItem()
      .setTitle('Architectural Revision #' + n + ' — Why would you like this changed?')
      .setHelpText('Understanding what is not working helps our designers determine the best solution.')
      .setRequired(required);

    // Google Forms has no "URL" question type — a short-answer field is the
    // standard way to collect a reference link (it accepts pasted URLs).
    form.addTextItem()
      .setTitle('Architectural Revision #' + n + ' — Inspiration / reference link')
      .setHelpText('Paste a Pinterest, Houzz, retailer, or Instagram link (optional)')
      .setRequired(false);
  } else {
    form.addTextItem()
      .setTitle('Material Revision #' + n + ' — Location / Room')
      .setHelpText('e.g., Primary bathroom, Kitchen counters, Powder room')
      .setRequired(required);

    form.addTextItem()
      .setTitle('Material Revision #' + n + ' — Material / item')
      .setHelpText('e.g., the 4×12 zellige tile, the quartzite countertop, cabinet hardware')
      .setRequired(required);

    form.addParagraphTextItem()
      .setTitle('Material Revision #' + n + ' — What would you like changed?')
      .setHelpText('Describe the specific change to the material or finish.')
      .setRequired(required);

    form.addParagraphTextItem()
      .setTitle('Material Revision #' + n + ' — Why would you like this changed?')
      .setHelpText('Understanding what is not working helps our designers determine the best solution.')
      .setRequired(required);

    form.addTextItem()
      .setTitle('Material Revision #' + n + ' — Inspiration / reference link')
      .setHelpText('Paste a Pinterest, Houzz, retailer, or Instagram link (optional)')
      .setRequired(false);
  }
}
