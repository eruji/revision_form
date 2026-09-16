/**
 * Pepper & Olive Interiors — Revision Request Form
 * DEFAULT CONFIGURATION
 *
 * This file defines everything the team can tweak: the policy copy, the
 * flat "about the round" questions, the fields that appear on every
 * repeatable revision item, and the acknowledgment block.
 *
 * The Team Setup panel in the app can override all of this at runtime and
 * export a new config.js-compatible JSON blob, so you can prototype wording
 * and question sets without editing code.
 *
 * Field object shape:
 *   id         unique key (used in submissions / CSV columns)
 *   label      question text shown to the client
 *   type       text | textarea | select | url | date
 *   help       optional helper text under the label
 *   placeholder optional input placeholder
 *   options    array of strings (select only)
 *   required   whether the client must answer
 *   enabled    whether the field is shown at all
 *   locked     true = cannot be disabled in Team Setup (core to the workflow)
 *   custom     true = was added in Team Setup (can be deleted there)
 */
window.REVISION_FORM_CONFIG = {
  schemaVersion: 1,
  business: 'Pepper & Olive Interiors',
  hourlyRate: 225,
  formTitle: 'Design Revision Request',
  subtitle: 'One consolidated round of revisions per design phase',

  intro:
    'Thank you for reviewing your design! The design process is collaborative, and ' +
    'your feedback is an important part of making sure the final space feels ' +
    'thoughtful, functional, and uniquely yours.\n\n' +
    'As outlined in your Letter of Agreement, one (1) consolidated round of ' +
    'revisions is included with each design phase. Please review the design in its ' +
    'entirety before submitting, and include ALL requested changes for this design ' +
    'phase in this single submission.\n\n' +
    'Additional revisions, new requests, or changes submitted after this form will be ' +
    'considered additional design services and billed at our current hourly rate of ' +
    '$225/hour, in accordance with your Letter of Agreement.\n\n' +
    'We also understand that design is nuanced and communication is not always ' +
    'perfect. If a change stems from a misunderstanding, we will review it with care ' +
    'and find the most appropriate path forward.\n\n' +
    'Filling this out may take a while. You can click “Save & continue later” at ' +
    'any point to get a link and code to come back to it, even on another device. ' +
    'Saved drafts are kept for 30 days.',

  // ── Questions asked once, before the revision items ──────────────────────
  aboutFields: [
    {
      id: 'clientName',
      label: 'Client Name',
      type: 'text',
      required: true,
      enabled: true,
      locked: true,
      half: true
    },
    {
      id: 'projectName',
      label: 'Project Name',
      type: 'text',
      required: true,
      enabled: true,
      locked: true,
      half: true
    },
    {
      id: 'designPhase',
      label: 'Design Phase',
      type: 'select',
      help: 'One included round of revisions per phase.',
      required: true,
      enabled: true,
      locked: true,
      half: true,
      options: [
        'Concept / Space Planning',
        'Design Development',
        'Construction Documents',
        'Other (noted below)'
      ]
    },
    {
      id: 'dateSubmitted',
      label: 'Date Submitted',
      type: 'date',
      required: true,
      enabled: true,
      locked: true,
      half: true
    }
  ],

  // ── Fields rendered on EVERY repeatable revision item ────────────────────
  revisionFields: [
    {
      id: 'category',
      label: 'Type of revision',
      type: 'select',
      required: true,
      enabled: true,
      locked: true,
      options: [
        'Architectural / Space Planning',
        'Material + Finish',
        'Furniture / Furnishings',
        'Lighting / Electrical',
        'Other'
      ]
    },
    {
      id: 'location',
      label: 'Location / Room',
      type: 'text',
      help: 'e.g., Primary bathroom, Kitchen island, Mudroom layout',
      placeholder: 'Where is this change?',
      required: true,
      enabled: true,
      locked: true
    },
    {
      id: 'description',
      label: 'What would you like changed?',
      type: 'textarea',
      help: 'Be as specific as you can — this is the change we will act on.',
      placeholder: 'Describe the specific change you are requesting.',
      required: true,
      enabled: true,
      locked: true
    },
    {
      id: 'reason',
      label: 'Why would you like this changed?',
      type: 'textarea',
      help: 'Understanding what is not working helps us find the best solution.',
      placeholder: 'Optional — the thinking behind the request.',
      required: false,
      enabled: true
    },
    {
      id: 'reference',
      label: 'Inspiration / reference link',
      type: 'url',
      help: 'Paste a Pinterest, Houzz, retailer, or Instagram link.',
      placeholder: 'https://…',
      required: false,
      enabled: true
    },
    {
      id: 'priority',
      label: 'Priority',
      type: 'select',
      help: 'Helps our team sequence the round if time is tight.',
      required: false,
      enabled: false,
      options: ['Nice to have', 'Important', 'Critical']
    }
  ],

  // ── Closing acknowledgment / signature ───────────────────────────────────
  ackFields: [
    {
      id: 'ackRound',
      label:
        'I have read and agree to the revision instructions above, have reviewed ' +
        'the design in its entirety, and understand that this submission represents ' +
        'my one (1) included round of revisions for this design phase.',
      type: 'checkbox',
      required: true,
      enabled: true
    },
    {
      id: 'ackBilling',
      label:
        'I understand that revisions, additions, or changes requested after ' +
        'submission may be considered additional design services and billed at our ' +
        'current hourly rate, as outlined in the instructions above and my Letter of ' +
        'Agreement.',
      type: 'checkbox',
      required: true,
      enabled: true
    },
    {
      id: 'signature',
      label: 'Client Name (typing your name serves as your electronic signature)',
      type: 'text',
      required: true,
      enabled: true,
      half: true
    },
    {
      id: 'signatureDate',
      label: 'Signature Date',
      type: 'date',
      required: true,
      enabled: true,
      half: true
    }
  ]
};
