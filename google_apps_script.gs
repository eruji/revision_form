/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Pepper & Olive Interiors — Revision Request → Google Sheet + Email
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  This is the bridge between the revision form and your staff's Google
 *  Sheet. It receives a notification from the form backend, appends one row
 *  per revision item to a "work queue" sheet (with Status / Assigned / Notes
 *  columns your team fills in), and emails the office.
 *
 *  ── ONE-TIME SETUP ────────────────────────────────────────────────────────
 *   1. Go to https://script.google.com → New project.
 *   2. Paste this file. Edit CONFIG below (notification email, sheet name).
 *   3. Run → setup()  and authorize. Copy the logged Spreadsheet ID (or just
 *      let it create one; it remembers the ID in Script Properties).
 *   4. Deploy → New deployment → type "Web app".
 *        - Execute as: Me
 *        - Who has access: Anyone
 *      Copy the Web app URL (ends in /exec).
 *   5. In Netlify, set the form's NOTIFY_WEBHOOK to that URL.
 *
 *  ── COLUMNS CREATED ───────────────────────────────────────────────────────
 *   Timestamp · Project · Phase · Client · Item # · Type · Location · Change ·
 *   Why · Reference · View Link · Status · Assigned To · Completed · Notes
 *   (Status/Assigned/Completed/Notes are for your team to maintain.)
 * ═══════════════════════════════════════════════════════════════════════════
 */

var CONFIG = {
  // Where new-request notifications are emailed. Comma-separate for several.
  NOTIFY_EMAIL: 'studio@pepperandolive.com',
  // Set false to send email only and skip the Google Sheet entirely.
  WRITE_TO_SHEET: true,
  // A new spreadsheet is created with this name if none is configured yet.
  SPREADSHEET_NAME: 'Revision Requests — Work Queue',
  SHEET_TAB: 'Work Queue',
  DEFAULT_STATUS: 'New'
};

var COLUMNS = [
  'Timestamp', 'Project', 'Phase', 'Client', 'Item #', 'Type', 'Room / Area',
  'Change', 'Why', 'Reference', 'View Link', 'Status', 'Assigned To',
  'Completed', 'Notes'
];

// Label matching so this keeps working if the form wording changes.
var MATCH = {
  client: /client name/i,
  project: /project/i,
  phase: /phase/i,
  category: /type of revision|category/i,
  location: /location|room/i,
  description: /what would you like changed|change/i,
  reason: /why/i,
  reference: /reference|inspiration|link/i
};

function pick(obj, pattern) {
  var keys = Object.keys(obj || {});
  for (var i = 0; i < keys.length; i++) {
    if (pattern.test(keys[i])) return obj[keys[i]];
  }
  return '';
}

function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* recreate below */ }
  }
  var ss = SpreadsheetApp.create(CONFIG.SPREADSHEET_NAME);
  props.setProperty('SHEET_ID', ss.getId());
  Logger.log('Created spreadsheet. ID: ' + ss.getId());
  Logger.log('URL: ' + ss.getUrl());
  return ss;
}

function getSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(CONFIG.SHEET_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_TAB);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
  }
  return sheet;
}

/** Run once to create the sheet and print its URL. */
function setup() {
  var ss = getSpreadsheet_();
  getSheet_();
  Logger.log('Spreadsheet: ' + ss.getUrl());
}

function doPost(e) {
  var data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'invalid json' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    if (data.event === 'revision.submitted') {
      if (CONFIG.WRITE_TO_SHEET) appendSubmission_(data);
      emailOffice_(data);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function appendSubmission_(data) {
  var sheet = getSheet_();
  var about = data.about || {};
  var items = data.items || [];
  var client = pick(about, MATCH.client);
  var project = pick(about, MATCH.project);
  var phase = pick(about, MATCH.phase);
  var viewUrl = data.viewUrl || '';
  var timestamp = data.submittedAt || new Date().toISOString();

  items.forEach(function (item, i) {
    sheet.appendRow([
      timestamp,
      project,
      phase,
      client,
      i + 1,
      pick(item, MATCH.category),
      pick(item, MATCH.location),
      pick(item, MATCH.description),
      pick(item, MATCH.reason),
      pick(item, MATCH.reference),
      viewUrl,
      CONFIG.DEFAULT_STATUS,
      '', // Assigned To
      '', // Completed
      ''  // Notes
    ]);
  });
}

function emailOffice_(data) {
  if (!CONFIG.NOTIFY_EMAIL) return;
  var about = data.about || {};
  var items = data.items || [];
  var client = pick(about, MATCH.client) || 'A client';
  var project = pick(about, MATCH.project) || 'a project';
  var phase = pick(about, MATCH.phase) || '';
  var viewUrl = data.viewUrl || '';
  var ss = CONFIG.WRITE_TO_SHEET ? getSpreadsheet_() : null;

  var lines = items.map(function (item, i) {
    return (i + 1) + '. ' + [pick(item, MATCH.category), pick(item, MATCH.location)].filter(String).join(' — ') +
      '\n   ' + pick(item, MATCH.description) +
      (pick(item, MATCH.reference) ? '\n   Ref: ' + pick(item, MATCH.reference) : '');
  });

  var subject = 'New revision request — ' + project + ' (' + items.length + ' item' + (items.length === 1 ? '' : 's') + ')';
  var body =
    client + ' submitted a revision request for ' + project + (phase ? ' (' + phase + ')' : '') + '.\n\n' +
    items.length + ' item(s):\n\n' + lines.join('\n\n') + '\n\n' +
    (viewUrl ? 'Read-only copy: ' + viewUrl + '\n' : '') +
    (ss ? 'Work queue: ' + ss.getUrl() + '\n' : '');

  MailApp.sendEmail(CONFIG.NOTIFY_EMAIL, subject, body);
}
