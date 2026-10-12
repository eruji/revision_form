/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Notification helpers — email, Discord, WhatsApp
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  This is the single place that decides HOW the office + clients are told
 *  about a revision round. It is deliberately self-contained so the form does
 *  not depend on Netlify Forms (monthly allowance) or a Google Apps Script web
 *  app (which can be rate-limited / go dormant on free accounts).
 *
 *  ── Email providers (pick one via env vars; both are "always-on") ─────────
 *    RESEND_API_KEY            → Resend (https://resend.com) transactional API.
 *                                Recommended: deliverability + no idle cutoff.
 *    SMTP_HOST + SMTP_USER     → Your own mailbox (Google Workspace / M365 /
 *                                any SMTP). First-party, nothing to go dormant.
 *
 *    EMAIL_FROM                → From address, e.g.
 *                                "Pepper & Olive Interiors <studio@pepperandolive.com>"
 *    NOTIFY_EMAIL              → Office recipients (comma separated).
 *
 *  ── Optional extra channels (can later replace email) ─────────────────────
 *    DISCORD_WEBHOOK_URL       → Discord channel webhook (post a summary).
 *    WHATSAPP_WEBHOOK_URL      → Any JSON webhook that accepts { text }.
 *                                (e.g. a Twilio/WhatsApp Business relay you
 *                                host, or a gateway like CallMeBot with the
 *                                phone + apikey in the URL.)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const EMAIL_FROM =
  process.env.EMAIL_FROM || 'Pepper & Olive Interiors <studio@pepperandolive.com>';

// TextMeBot enforces a minimum ~8s between sends; space them out within a run.
let lastTextMeBotAt = 0;
async function textMeBotThrottle() {
  const wait = lastTextMeBotAt + 9000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastTextMeBotAt = Date.now();
}

function envList(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function fromEmail() {
  const m = EMAIL_FROM.match(/<([^>]+)>/);
  return m ? m[1].trim() : EMAIL_FROM;
}

function officeRecipients() {
  return envList('NOTIFY_EMAIL');
}

function emailConfigured() {
  if (process.env.RESEND_API_KEY) return true;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return true;
  return false;
}

// ── Tiny label lookups (the payload uses human labels as keys) ────────────
function pick(obj, pattern) {
  const keys = Object.keys(obj || {});
  for (let i = 0; i < keys.length; i++) {
    if (pattern.test(keys[i])) return obj[keys[i]];
  }
  return '';
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function link(href, text) {
  const url = String(href || '');
  if (!url) return '';
  return '<a href="' + esc(url) + '" style="color:#8a6d3b;">' + esc(text || url) + '</a>';
}

function itemLine(item, i) {
  const cat = pick(item, /type of revision|category/i);
  const loc = pick(item, /room|area|location/i);
  const desc = pick(item, /what would you like changed|change|description/i);
  const ref = pick(item, /reference|inspiration|link/i);
  const head = [cat, loc].filter(Boolean).join(' — ');
  let s = '<strong>' + (i + 1) + '.</strong> ' + (head ? esc(head) + ': ' : '') + esc(desc);
  if (ref) s += ' <span style="color:#888;">(' + link(ref, 'reference') + ')</span>';
  return s;
}

// ── Email templates ────────────────────────────────────────────────────────
function officeSubmissionEmail(payload) {
  const about = payload.about || {};
  const items = payload.items || [];
  const client = pick(about, /client name/i) || 'A client';
  const project = pick(about, /project/i) || 'a project';
  const phase = pick(about, /phase/i);
  const clientEmail = pick(about, /email/i);
  const submittedAt = payload.submittedAt || '';
  const viewUrl = payload.viewUrl || '';

  const itemCount = items.length;
  const plural = itemCount === 1 ? 'item' : 'items';
  const subject =
    'Revision received — ' + client + ' · ' + project +
    ' (' + itemCount + ' ' + plural + ')';

  const lines = items.map(itemLine).join('<br />');
  const text = [
    'A revision round has been received.',
    '',
    'Client:    ' + client,
    'Project:   ' + project,
    phase ? 'Phase:     ' + phase : '',
    clientEmail ? 'Email:     ' + clientEmail : '',
    'Items:     ' + itemCount,
    '',
    items.map((it, i) => {
      const cat = pick(it, /type of revision|category/i);
      const loc = pick(it, /room|area|location/i);
      const desc = pick(it, /what would you like changed|change|description/i);
      const ref = pick(it, /reference|inspiration|link/i);
      return (i + 1) + '. ' + [cat, loc].filter(Boolean).join(' — ') + ': ' + desc +
        (ref ? ' (' + ref + ')' : '');
    }).join('\n'),
    '',
    viewUrl ? 'Read-only copy: ' + viewUrl : '',
    '',
    '— ' + (payload.business || 'Pepper & Olive Interiors') + ' revision form'
  ].filter((l) => l !== false).join('\n');

  const html =
    '<div style="font-family:Georgia,serif;color:#2b2b2b;max-width:640px;margin:0 auto;">' +
    '<h2 style="font-weight:normal;margin:0 0 4px;">Revision received</h2>' +
    '<p style="margin:0 0 16px;color:#666;">' + esc(project) + (phase ? ' — ' + esc(phase) : '') + '</p>' +
    '<table cellpadding="4" style="border-collapse:collapse;font-size:14px;">' +
    '<tr><td style="color:#888;">Client</td><td>' + esc(client) + '</td></tr>' +
    '<tr><td style="color:#888;">Project</td><td>' + esc(project) + '</td></tr>' +
    (phase ? '<tr><td style="color:#888;">Phase</td><td>' + esc(phase) + '</td></tr>' : '') +
    (clientEmail ? '<tr><td style="color:#888;">Email</td><td>' + link('mailto:' + clientEmail, clientEmail) + '</td></tr>' : '') +
    '<tr><td style="color:#888;">Items</td><td>' + itemCount + ' ' + plural + '</td></tr>' +
    '</table>' +
    '<h3 style="font-weight:normal;color:#444;">Revision items</h3>' +
    '<div style="font-size:14px;line-height:1.6;">' + (lines || '<em>None</em>') + '</div>' +
    (viewUrl ? '<p style="margin:16px 0;">' + link(viewUrl, 'Open the read-only copy') + '</p>' : '') +
    '<p style="color:#999;font-size:12px;margin-top:24px;">Sent automatically by the revision form.</p>' +
    '</div>';

  return { subject: subject, text: text, html: html };
}

function clientSubmissionEmail(payload, clientEmail) {
  const about = payload.about || {};
  const items = payload.items || [];
  const client = pick(about, /client name/i) || '';
  const project = pick(about, /project/i) || 'your project';
  const phase = pick(about, /phase/i);
  const viewUrl = payload.viewUrl || '';

  const itemCount = items.length;
  const plural = itemCount === 1 ? 'item' : 'items';
  const subject = 'We received your revision request — ' + project;

  const text = [
    'Hi' + (client ? ' ' + client : '') + ',',
    '',
    'Thank you — we received your revision request for ' + project +
    (phase ? ' (' + phase + ')' : '') + ' with ' + itemCount + ' ' + plural + '.',
    '',
    'Our team will review everything you sent and follow up shortly.',
    '',
    viewUrl ? 'Your private read-only copy (print/save as PDF): ' + viewUrl : '',
    '',
    'If anything needs to change after you have submitted, reply to this email ' +
    'and we will take care of it.',
    '',
    '— Pepper & Olive Interiors'
  ].join('\n');

  const html =
    '<div style="font-family:Georgia,serif;color:#2b2b2b;max-width:640px;margin:0 auto;">' +
    '<h2 style="font-weight:normal;margin:0 0 4px;">Revision request received</h2>' +
    '<p>Hi' + (client ? ' ' + esc(client) : '') + ',</p>' +
    '<p>Thank you — we received your revision request for <strong>' + esc(project) + '</strong>' +
    (phase ? ' (' + esc(phase) + ')' : '') + ' with <strong>' + itemCount + ' ' + plural + '</strong>.</p>' +
    '<p>Our team will review everything you sent and follow up shortly.</p>' +
    (viewUrl
      ? '<p>' + link(viewUrl, 'Open your private read-only copy') + '<br />' +
        '<span style="color:#888;font-size:12px;">Use this link to print or save a PDF for your records.</span></p>'
      : '') +
    '<p>If anything needs to change after you have submitted, just reply to this email.</p>' +
    '<p style="color:#999;font-size:12px;margin-top:24px;">— Pepper & Olive Interiors</p>' +
    '</div>';

  return { subject: subject, text: text, html: html };
}

function reminderEmails(round, kind) {
  const client = round.clientName || '';
  const project = round.projectName || 'your project';
  const phase = round.designPhase || '';
  const linkUrl = round.clientLink || '';
  const expiresAt = round.expiresAt || '';
  const expText = expiresAt
    ? new Date(expiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  const clientSubject =
    (kind === 'expiring' ? 'Reminder: ' : '') + 'Your revision request for ' + project +
    (kind === 'expiring' ? ' expires soon' : ' is waiting for you');

  let clientText, clientHtml;
  if (kind === 'expiring') {
    clientText = [
      'Hi' + (client ? ' ' + client : '') + ',',
      '',
      'A gentle reminder — we still have not received your revision request for ' +
      project + (phase ? ' (' + phase + ')' : '') + ', and it expires on ' + expText + '.',
      '',
      linkUrl ? 'Submit it here: ' + linkUrl : '',
      '',
      'If you have already submitted, please disregard this note.',
      '',
      '— Pepper & Olive Interiors'
    ].join('\n');
    clientHtml =
      '<div style="font-family:Georgia,serif;color:#2b2b2b;max-width:640px;margin:0 auto;">' +
      '<h2 style="font-weight:normal;">Your revision request expires soon</h2>' +
      '<p>Hi' + (client ? ' ' + esc(client) : '') + ',</p>' +
      '<p>A gentle reminder — we still have not received your revision request for <strong>' +
      esc(project) + '</strong>' + (phase ? ' (' + esc(phase) + ')' : '') +
      ', and it expires on <strong>' + esc(expText) + '</strong>.</p>' +
      (linkUrl ? '<p>' + link(linkUrl, 'Submit your revision request') + '</p>' : '') +
      '<p style="color:#888;font-size:12px;">If you have already submitted, please disregard this note.</p>' +
      '<p style="color:#999;font-size:12px;">— Pepper & Olive Interiors</p></div>';
  } else {
    clientText = [
      'Hi' + (client ? ' ' + client : '') + ',',
      '',
      'A quick reminder — we sent you a revision request for ' + project +
      (phase ? ' (' + phase + ')' : '') + ' a week ago and have not received it yet.',
      '',
      'Please submit your one consolidated round of revisions' + (expText ? ' by ' + expText : '') + '.',
      '',
      linkUrl ? 'Open the form here: ' + linkUrl : '',
      '',
      'If you have already submitted, please disregard this note.',
      '',
      '— Pepper & Olive Interiors'
    ].join('\n');
    clientHtml =
      '<div style="font-family:Georgia,serif;color:#2b2b2b;max-width:640px;margin:0 auto;">' +
      '<h2 style="font-weight:normal;">Reminder — your revision request is waiting</h2>' +
      '<p>Hi' + (client ? ' ' + esc(client) : '') + ',</p>' +
      '<p>A quick reminder — we sent you a revision request for <strong>' + esc(project) + '</strong>' +
      (phase ? ' (' + esc(phase) + ')' : '') + ' a week ago and have not received it yet.</p>' +
      '<p>Please submit your one consolidated round of revisions' + (expText ? ' by <strong>' + esc(expText) + '</strong>' : '') + '.</p>' +
      (linkUrl ? '<p>' + link(linkUrl, 'Open the revision form') + '</p>' : '') +
      '<p style="color:#888;font-size:12px;">If you have already submitted, please disregard this note.</p>' +
      '<p style="color:#999;font-size:12px;">— Pepper & Olive Interiors</p></div>';
  }

  const officeSubject =
    (kind === 'expiring' ? 'Expiring soon: ' : 'Reminder sent: ') + client + ' — ' + project;
  const officeText = [
    (kind === 'expiring'
      ? client + ' still has not submitted their revision round for ' + project + ' and it expires on ' + expText + '.'
      : 'A 7-day reminder was sent to ' + client + ' for ' + project + (expText ? ' (expires ' + expText + ')' : '') + '.'),
    linkUrl ? 'Client link: ' + linkUrl : '',
    '— revision form'
  ].join('\n');
  const officeHtml =
    '<div style="font-family:Georgia,serif;color:#2b2b2b;max-width:640px;margin:0 auto;">' +
    '<h2 style="font-weight:normal;">' + (kind === 'expiring' ? 'Expiring soon' : 'Reminder sent') + '</h2>' +
    '<p>' + esc(officeText.split('\n')[0]) + '</p>' +
    (linkUrl ? '<p>' + link(linkUrl, 'Client link') + '</p>' : '') +
    '<p style="color:#999;font-size:12px;">Sent automatically by the revision form.</p></div>';

  return {
    client: { subject: clientSubject, text: clientText, html: clientHtml },
    office: { subject: officeSubject, text: officeText, html: officeHtml }
  };
}

// ── Round-invite email (sent after the office creates a request link) ──────
function textToHtml(text) {
  return String(text || '')
    .split('\n')
    .map((line) => {
      const escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      return escaped.replace(/(https?:\/\/[^\s<"']+)/g, '<a href="$1" style="color:#8a6d3b;">$1</a>');
    })
    .join('<br />');
}

function defaultRoundInviteText(round, link) {
  const client = round.clientName || '';
  const project = round.projectName || 'your project';
  const phase = round.designPhase || '';
  const expires = round.expiresAt
    ? new Date(round.expiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const note = round.note || '';
  const rooms = (round.rooms || []).map((r) => r && r.name).filter(Boolean).join(', ');
  const lines = [];
  lines.push('Hi' + (client ? ' ' + client : '') + ',');
  lines.push('');
  lines.push('We have prepared your design revision request for ' + project + (phase ? ' (' + phase + ')' : '') + '.');
  lines.push('');
  lines.push('Please review everything in full and submit your one consolidated round of revisions' + (expires ? ' by ' + expires : '') + '.');
  lines.push('');
  lines.push('Open the form here: ' + link);
  if (rooms) { lines.push(''); lines.push('Areas in scope: ' + rooms); }
  if (note) { lines.push(''); lines.push('Note: ' + note); }
  lines.push('');
  lines.push('Thank you,');
  lines.push('Pepper & Olive Interiors');
  return lines.join('\n');
}

function roundInviteEmail(round, opts) {
  opts = opts || {};
  const project = round.projectName || 'your project';
  const link = round.clientLink || opts.link || '';
  const subject = opts.subject || ('Your revision request — ' + project);
  const text = opts.message || defaultRoundInviteText(round, link);
  return { subject: subject, text: text, html: textToHtml(text) };
}

/**
 * Email a client their revision-request link after the office creates a round.
 * Throws if the email provider is missing or the send fails.
 */
async function onRoundLink(round, opts) {
  opts = opts || {};
  const to = String(round.clientEmail || '').trim();
  if (!to) return { sent: false, reason: 'no-email' };
  const msg = roundInviteEmail(round, opts);
  const sent = await sendEmail({ to: to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: fromEmail() });
  if (!sent) throw new Error('Email provider is not configured');
  return { sent: true, to: to };
}

// ── Sending ────────────────────────────────────────────────────────────────
async function sendResend(msg) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      reply_to: msg.replyTo || undefined
    })
  });
  if (!res.ok) throw new Error('Resend returned ' + res.status + ': ' + (await res.text()).slice(0, 200));
}

async function sendSmtp(msg) {
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch (e) {
    throw new Error('SMTP is configured but the "nodemailer" package is not installed. Run `npm install nodemailer`.');
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined
  });
  await transporter.sendMail({
    from: EMAIL_FROM,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    replyTo: msg.replyTo || undefined
  });
}

/**
 * Send one email. `to` may be a string or array of strings.
 * Returns true if a provider handled it, false if no provider is configured.
 */
async function sendEmail(msg) {
  const to = Array.isArray(msg.to) ? msg.to : [msg.to];
  if (!to.length) return false;

  if (process.env.RESEND_API_KEY) {
    await sendResend(Object.assign({}, msg, { to: to.length === 1 ? to[0] : to }));
    return true;
  }
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    await sendSmtp(Object.assign({}, msg, { to: to.join(', ') }));
    return true;
  }
  return false;
}

async function sendDiscord(text) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: String(text || '').slice(0, 1900) })
    });
    if (!res.ok) console.error('discord webhook returned', res.status);
  } catch (e) {
    console.error('discord webhook failed:', e && e.message);
  }
}

function twilioNumber(phone) {
  let s = String(phone || '').trim().replace(/[^\d+]/g, '');
  if (!s) return '';
  if (!/^\+/.test(s)) s = '+' + s;
  return s;
}

function callMeBotNumber(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/**
 * Send a WhatsApp message to the OFFICE group/contact (a single, fixed
 * destination — clients are never messaged). Provider priority:
 * TextMeBot (group-capable) → Twilio → CallMeBot → generic webhook.
 */
async function sendWhatsApp(text) {
  text = String(text || '').slice(0, 1500);

  // 1) TextMeBot — can post into a WhatsApp GROUP the office number belongs to.
  if (process.env.TEXTMEBOT_APIKEY && process.env.TEXTMEBOT_RECIPIENT) {
    try {
      await textMeBotThrottle();
      const url =
        'https://api.textmebot.com/send.php' +
        '?recipient=' + encodeURIComponent(process.env.TEXTMEBOT_RECIPIENT) +
        '&apikey=' + encodeURIComponent(process.env.TEXTMEBOT_APIKEY) +
        '&text=' + encodeURIComponent(text) +
        '&json=yes';
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) console.error('textmebot returned', res.status);
      return true;
    } catch (e) {
      console.error('textmebot failed:', e && e.message);
      return false;
    }
  }

  // 2) Twilio WhatsApp (business-grade, single recipient)
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM && process.env.TWILIO_WHATSAPP_TO) {
    try {
      const from = /^whatsapp:/i.test(process.env.TWILIO_WHATSAPP_FROM)
        ? process.env.TWILIO_WHATSAPP_FROM
        : 'whatsapp:' + process.env.TWILIO_WHATSAPP_FROM.replace(/^\+/, '');
      const toNum = twilioNumber(process.env.TWILIO_WHATSAPP_TO);
      const form = new URLSearchParams();
      form.set('From', from);
      form.set('To', 'whatsapp:' + toNum.replace(/^\+/, ''));
      form.set('Body', text);
      const res = await fetch(
        'https://api.twilio.com/2010-04-01/Accounts/' + process.env.TWILIO_ACCOUNT_SID + '/Messages.json',
        {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: form.toString()
        }
      );
      if (!res.ok) console.error('twilio whatsapp returned', res.status);
      return true;
    } catch (e) {
      console.error('twilio whatsapp failed:', e && e.message);
      return false;
    }
  }

  // 3) CallMeBot (free — sends to your own WhatsApp number)
  if (process.env.CALLMEBOT_APIKEY && process.env.CALLMEBOT_PHONE) {
    try {
      const url =
        'https://api.callmebot.com/whatsapp.php' +
        '?phone=' + encodeURIComponent(callMeBotNumber(process.env.CALLMEBOT_PHONE)) +
        '&apikey=' + encodeURIComponent(process.env.CALLMEBOT_APIKEY) +
        '&text=' + encodeURIComponent(text);
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) console.error('callmebot returned', res.status);
      return true;
    } catch (e) {
      console.error('callmebot failed:', e && e.message);
      return false;
    }
  }

  // 4) Generic webhook
  const url = process.env.WHATSAPP_WEBHOOK_URL;
  if (url) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text })
      });
      if (!res.ok) console.error('whatsapp webhook returned', res.status);
      return true;
    } catch (e) {
      console.error('whatsapp webhook failed:', e && e.message);
    }
  }

  return false;
}

// ── High-level: submission + reminders ─────────────────────────────────────
function discordSubmissionText(payload) {
  const about = payload.about || {};
  const items = payload.items || [];
  const client = pick(about, /client name/i) || 'A client';
  const project = pick(about, /project/i) || 'a project';
  const phase = pick(about, /phase/i);
  const lines = items.slice(0, 15).map((it, i) => {
    const cat = pick(it, /type of revision|category/i);
    const loc = pick(it, /room|area|location/i);
    const desc = pick(it, /what would you like changed|change|description/i);
    return (i + 1) + '. ' + [cat, loc].filter(Boolean).join(' — ') + ': ' + desc;
  });
  return '📥 **Revision received** — ' + client + ' · ' + project +
    (phase ? ' (' + phase + ')' : '') + '\n' +
    items.length + ' item' + (items.length === 1 ? '' : 's') + '\n' +
    lines.join('\n') +
    (items.length > 15 ? '\n…' : '') +
    (payload.viewUrl ? '\n' + payload.viewUrl : '');
}

/**
 * Send everything for a fresh submission.
 * Returns { emailSent } so callers can fall back to legacy relays only when
 * no email provider is configured (avoiding duplicate office emails).
 */
async function onSubmission(payload, opts) {
  opts = opts || {};
  const office = officeRecipients();
  let emailSent = false;

  const officeMsg = officeSubmissionEmail(payload);
  const clientEmail = (opts.clientEmail || pick(payload.about || {}, /email/i) || '').trim();
  const clientMsg = clientSubmissionEmail(payload, clientEmail || pick(payload.about || {}, /client name/i) || '');

  if (office.length && emailConfigured()) {
    try { emailSent = !!(await sendEmail({ to: office, subject: officeMsg.subject, text: officeMsg.text, html: officeMsg.html })); }
    catch (e) { console.error('office email failed:', e && e.message); }
  }
  if (clientEmail) {
    try { emailSent = !!(await sendEmail({ to: clientEmail, subject: clientMsg.subject, text: clientMsg.text, html: clientMsg.html, replyTo: fromEmail() })) || emailSent; }
    catch (e) { console.error('client email failed:', e && e.message); }
  }

  const officeText = discordSubmissionText(payload);
  await sendDiscord(officeText);
  await sendWhatsApp(officeText.replace(/\*\*/g, '')); // office group/contact

  return { emailSent: emailSent };
}

/**
 * Send a no-submit / expiring reminder for an open round.
 */
async function onReminder(round, kind) {
  const msgs = reminderEmails(round, kind);
  const office = officeRecipients();
  let emailSent = false;

  if (office.length) {
    try { emailSent = !!(await sendEmail({ to: office, subject: msgs.office.subject, text: msgs.office.text, html: msgs.office.html })); }
    catch (e) { console.error('reminder office email failed:', e && e.message); }
  }
  if (round.clientEmail) {
    try { emailSent = !!(await sendEmail({ to: round.clientEmail, subject: msgs.client.subject, text: msgs.client.text, html: msgs.client.html })) || emailSent; }
    catch (e) { console.error('reminder client email failed:', e && e.message); }
  }

  const officeText = msgs.office.subject + '\n' + msgs.office.text;
  await sendDiscord(officeText);
  await sendWhatsApp(officeText); // office group/contact

  return { emailSent: emailSent };
}

// ── Client Design Homework — notification templates ──────────────────────
function homeworkClient(sub) {
  const c = (sub && sub.client) || {};
  return { name: c.name || '', project: c.project || '', email: c.email || '' };
}

function homeworkSelectionCount(sub) {
  let n = 0;
  (sub.sections || []).forEach((s) => {
    if (s.skipped) return;
    (s.items || []).forEach((it) => { n += (it.options || []).length; });
  });
  return n;
}

function homeworkCompletedSections(sub) {
  return (sub.sections || []).filter((s) => !s.skipped && (s.items || []).some((it) => (it.options || []).length || it.note)).length;
}

function homeworkSectionBlocks(sub, html) {
  const blocks = [];
  (sub.sections || []).forEach((s) => {
    if (s.skipped) {
      blocks.push((html ? '<p style="color:#999;margin:6px 0;"><em>' : '') + esc(s.number + ' · ' + s.title) + (html ? ' — skipped (not applicable)</em></p>' : ' — skipped (not applicable)'));
      return;
    }
    const items = (s.items || []).filter((it) => (it.options && it.options.length) || it.note);
    if (!items.length) return;
    if (html) {
      let h = '<p style="margin:10px 0 2px;"><strong>' + esc(s.number + ' · ' + s.title) + '</strong></p><ul style="margin:0 0 6px 18px;padding:0;">';
      items.forEach((it) => {
        let line = '<strong>' + esc(it.category) + '</strong>';
        if (it.options && it.options.length) line += ': ' + esc(it.options.join(', '));
        if (it.note) line += ' <span style="color:#777;">— note: ' + esc(it.note) + '</span>';
        h += '<li style="margin:2px 0;">' + line + '</li>';
      });
      blocks.push(h + '</ul>');
    } else {
      const lines = items.map((it) => {
        let line = '  • ' + it.category;
        if (it.options && it.options.length) line += ': ' + it.options.join(', ');
        if (it.note) line += ' — note: ' + it.note;
        return line;
      });
      blocks.push(s.number + ' · ' + s.title + '\n' + lines.join('\n'));
    }
  });

  const budget = (sub.budget || []).filter((b) => b.tier || b.note);
  if (budget.length) {
    if (html) {
      let h = '<p style="margin:10px 0 2px;"><strong>Budget Definition</strong></p><ul style="margin:0 0 6px 18px;padding:0;">';
      budget.forEach((b) => {
        h += '<li style="margin:2px 0;"><strong>' + esc(b.label) + '</strong>: ' + esc(b.tier || '—') +
          (b.note ? ' <span style="color:#777;">— ' + esc(b.note) + '</span>' : '') + '</li>';
      });
      blocks.push(h + '</ul>');
    } else {
      blocks.push('Budget Definition\n' + budget.map((b) => '  • ' + b.label + ': ' + (b.tier || '—') + (b.note ? ' — ' + b.note : '')).join('\n'));
    }
  }

  return blocks;
}

function homeworkOfficeEmail(sub, viewUrl) {
  const c = homeworkClient(sub);
  const n = homeworkSelectionCount(sub);
  const subject = 'Design Homework — ' + (c.name || 'A client') + ' · ' + (c.project || 'a project') + ' (' + n + ' selections)';
  const text = [
    'A Design Homework has been submitted.',
    '',
    'Client:    ' + (c.name || '—'),
    'Project:   ' + (c.project || '—'),
    c.email ? 'Email:     ' + c.email : '',
    'Selections: ' + n,
    'Sections answered: ' + homeworkCompletedSections(sub),
    '',
    homeworkSectionBlocks(sub, false).join('\n\n'),
    '',
    viewUrl ? 'Read-only copy: ' + viewUrl : '',
    '',
    '— ' + (sub.business || 'Pepper & Olive Interiors') + ' · Design Homework'
  ].filter((l) => l !== false).join('\n');

  const html =
    '<div style="font-family:Georgia,serif;color:#2b2b2b;max-width:680px;margin:0 auto;">' +
    '<h2 style="font-weight:normal;margin:0 0 4px;">Design Homework received</h2>' +
    '<p style="margin:0 0 14px;color:#666;">' + esc(c.project || '') + '</p>' +
    '<table cellpadding="4" style="border-collapse:collapse;font-size:14px;">' +
    '<tr><td style="color:#888;">Client</td><td>' + esc(c.name || '—') + '</td></tr>' +
    '<tr><td style="color:#888;">Project</td><td>' + esc(c.project || '—') + '</td></tr>' +
    (c.email ? '<tr><td style="color:#888;">Email</td><td>' + link('mailto:' + c.email, c.email) + '</td></tr>' : '') +
    '<tr><td style="color:#888;">Selections</td><td>' + n + '</td></tr>' +
    '</table>' +
    '<div style="font-size:14px;line-height:1.5;">' + homeworkSectionBlocks(sub, true).join('') + '</div>' +
    (viewUrl ? '<p style="margin:16px 0;">' + link(viewUrl, 'Open the read-only copy') + '</p>' : '') +
    '<p style="color:#999;font-size:12px;margin-top:24px;">Sent automatically by the Design Homework.</p>' +
    '</div>';

  return { subject: subject, text: text, html: html };
}

function homeworkClientEmail(sub, viewUrl) {
  const c = homeworkClient(sub);
  const project = c.project || 'your project';
  const subject = 'Your Design Homework — ' + project;
  const text = [
    'Hi' + (c.name ? ' ' + c.name : '') + ',',
    '',
    'Thank you — we received your Design Homework for ' + project + '.',
    'Our team will review everything you selected and follow up with any questions.',
    '',
    viewUrl ? 'Your private read-only copy (print/save as PDF): ' + viewUrl : '',
    '',
    '— Pepper & Olive Interiors'
  ].join('\n');
  const html =
    '<div style="font-family:Georgia,serif;color:#2b2b2b;max-width:640px;margin:0 auto;">' +
    '<h2 style="font-weight:normal;">Design Homework received</h2>' +
    '<p>Hi' + (c.name ? ' ' + esc(c.name) : '') + ',</p>' +
    '<p>Thank you — we received your Design Homework for <strong>' + esc(project) + '</strong>.</p>' +
    '<p>Our team will review everything you selected and follow up with any questions.</p>' +
    (viewUrl ? '<p>' + link(viewUrl, 'Open your private read-only copy') + '</p>' : '') +
    '<p style="color:#999;font-size:12px;margin-top:24px;">— Pepper & Olive Interiors</p></div>';
  return { subject: subject, text: text, html: html };
}

function homeworkDiscordText(sub, viewUrl) {
  const c = homeworkClient(sub);
  return '📥 **Design Homework** — ' + (c.name || 'A client') + ' · ' + (c.project || 'a project') + '\n' +
    homeworkSelectionCount(sub) + ' selections across ' + homeworkCompletedSections(sub) + ' sections' +
    (viewUrl ? '\n' + viewUrl : '');
}

async function onHomeworkSubmission(sub, opts) {
  opts = opts || {};
  const office = officeRecipients();
  const client = homeworkClient(sub);
  const officeMsg = homeworkOfficeEmail(sub, opts.viewUrl || '');
  const clientMsg = homeworkClientEmail(sub, opts.viewUrl || '');
  let emailSent = false;

  if (office.length && emailConfigured()) {
    try { emailSent = !!(await sendEmail({ to: office, subject: officeMsg.subject, text: officeMsg.text, html: officeMsg.html })); }
    catch (e) { console.error('homework office email failed:', e && e.message); }
  }
  if (client.email) {
    try { emailSent = !!(await sendEmail({ to: client.email, subject: clientMsg.subject, text: clientMsg.text, html: clientMsg.html, replyTo: fromEmail() })) || emailSent; }
    catch (e) { console.error('homework client email failed:', e && e.message); }
  }

  const text = homeworkDiscordText(sub, opts.viewUrl || '');
  await sendDiscord(text);
  await sendWhatsApp(text.replace(/\*\*/g, ''));
  return { emailSent };
}

// ── Client Design Homework — office-issued links + reminders ──────────────
function homeworkDefaultInviteText(round, link) {
  const client = round.clientName || '';
  const project = round.projectName || 'your project';
  const expires = round.expiresAt
    ? new Date(round.expiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const note = round.note || '';
  const lines = [];
  lines.push('Hi' + (client ? ' ' + client : '') + ',');
  lines.push('');
  lines.push('We have prepared your Design Homework for ' + project + '.');
  lines.push('');
  lines.push('Please browse each section, make your selections, and submit it' + (expires ? ' by ' + expires : '') + '.');
  lines.push('');
  lines.push('Open the homework here: ' + link);
  if (note) { lines.push(''); lines.push('Note: ' + note); }
  lines.push('');
  lines.push('Thank you,');
  lines.push('Pepper & Olive Interiors');
  return lines.join('\n');
}

function homeworkRoundInviteEmail(round, opts) {
  opts = opts || {};
  const project = round.projectName || 'your project';
  const link = round.clientLink || opts.link || '';
  const subject = opts.subject || ('Your Design Homework — ' + project);
  const text = opts.message || homeworkDefaultInviteText(round, link);
  return { subject: subject, text: text, html: textToHtml(text) };
}

async function onHomeworkRoundLink(round, opts) {
  opts = opts || {};
  const to = String(round.clientEmail || '').trim();
  if (!to) return { sent: false, reason: 'no-email' };
  const msg = homeworkRoundInviteEmail(round, opts);
  const sent = await sendEmail({ to: to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: fromEmail() });
  if (!sent) throw new Error('Email provider is not configured');
  return { sent: true, to: to };
}

function homeworkReminderEmails(round, kind) {
  const client = round.clientName || '';
  const project = round.projectName || 'your project';
  const link = round.clientLink || '';
  const expiresAt = round.expiresAt || '';
  const expText = expiresAt
    ? new Date(expiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const clientSubject =
    (kind === 'expiring' ? 'Reminder: ' : '') + 'Your Design Homework for ' + project +
    (kind === 'expiring' ? ' expires soon' : ' is waiting for you');

  let clientText;
  if (kind === 'expiring') {
    clientText = [
      'Hi' + (client ? ' ' + client : '') + ',',
      '',
      'A gentle reminder — we still have not received your Design Homework for ' + project + ', and it expires on ' + expText + '.',
      '',
      link ? 'Complete it here: ' + link : '',
      '',
      'If you have already submitted, please disregard this note.',
      '',
      '— Pepper & Olive Interiors'
    ].join('\n');
  } else {
    clientText = [
      'Hi' + (client ? ' ' + client : '') + ',',
      '',
      'A quick reminder — we sent you your Design Homework for ' + project + ' a week ago and have not received it yet.',
      '',
      'Please complete and submit it' + (expText ? ' by ' + expText : '') + '.',
      '',
      link ? 'Open it here: ' + link : '',
      '',
      '— Pepper & Olive Interiors'
    ].join('\n');
  }

  const officeText =
    (kind === 'expiring' ? 'Design Homework expiring soon' : 'Design Homework still not submitted') +
    ' — ' + client + ' · ' + project + '\n' + (link || '');

  return {
    client: { subject: clientSubject, text: clientText, html: textToHtml(clientText) },
    office: { subject: clientSubject, text: officeText, html: textToHtml(officeText) }
  };
}

async function onHomeworkReminder(round, kind) {
  const msgs = homeworkReminderEmails(round, kind);
  const office = officeRecipients();
  let emailSent = false;

  if (office.length) {
    try { emailSent = !!(await sendEmail({ to: office, subject: msgs.office.subject, text: msgs.office.text, html: msgs.office.html })); }
    catch (e) { console.error('homework reminder office email failed:', e && e.message); }
  }
  if (round.clientEmail) {
    try { emailSent = !!(await sendEmail({ to: round.clientEmail, subject: msgs.client.subject, text: msgs.client.text, html: msgs.client.html })) || emailSent; }
    catch (e) { console.error('homework reminder client email failed:', e && e.message); }
  }

  const officeText = msgs.office.subject + '\n' + msgs.office.text;
  await sendDiscord(officeText);
  await sendWhatsApp(officeText);
  return { emailSent };
}

function resumeDraftEmail(opts) {
  opts = opts || {};
  const name = opts.name || '';
  const project = opts.project || 'your project';
  const resumeUrl = opts.resumeUrl || '';
  const app = opts.app || 'form';
  const subject = 'Your ' + app + ' draft — resume when you are ready';
  const text = [
    'Hi' + (name ? ' ' + name : '') + ',',
    '',
    'We saved your ' + app + ' for ' + project + ' so you can pick up where you left off.',
    '',
    'Resume it here (drafts are kept for 30 days): ' + resumeUrl,
    '',
    '— Pepper & Olive Interiors'
  ].join('\n');
  return { subject: subject, text: text, html: textToHtml(text) };
}

module.exports = {
  sendEmail,
  sendDiscord,
  sendWhatsApp,
  onSubmission,
  onReminder,
  onRoundLink,
  roundInviteEmail,
  emailConfigured,
  officeRecipients,
  officeSubmissionEmail,
  clientSubmissionEmail,
  reminderEmails,
  discordSubmissionText,
  onHomeworkSubmission,
  homeworkOfficeEmail,
  homeworkClientEmail,
  onHomeworkRoundLink,
  homeworkRoundInviteEmail,
  onHomeworkReminder,
  homeworkReminderEmails,
  resumeDraftEmail
};
