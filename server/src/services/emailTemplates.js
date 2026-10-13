// The four notification emails - the same moments and wording as the
// WhatsApp templates (README "WhatsApp setup"), as branded HTML plus a
// plain-text twin. Each builder returns { subject, html, text }.
//
// Everything inserted here (patient and clinic names, addresses) is
// user-entered, so it goes through escapeHtml before landing in the HTML.
// Inline styles and a table layout only: email clients ignore <style>
// blocks and most modern CSS.

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const ACCENT = '#1d4ed8'

// Label/value rows for the details box ("Date", "Time", "Token").
function detailsHtml(details) {
  const rows = details
    .map(
      ([label, value]) =>
        `<tr><td style="width:120px;padding:4px 16px 4px 0;color:#64748b;font-size:13px;">${escapeHtml(label)}</td>` +
        `<td style="padding:4px 0;color:#0f172a;font-size:14px;font-weight:bold;">${escapeHtml(value)}</td></tr>`,
    )
    .join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:12px 16px;width:100%;">${rows}</table>`
}

function buttonHtml(label, url) {
  return `<p style="margin:20px 0;"><a href="${escapeHtml(url)}" style="background:${ACCENT};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold;font-size:14px;display:inline-block;">${escapeHtml(label)}</a></p>`
}

// Wraps a message body in the shared layout: clinic header, body, contact
// line, and the footer with the unsubscribe link.
function layout({ clinic, bodyHtml, contactLine, unsubscribeUrl }) {
  const logo = clinic.logoUrl
    ? `<img src="${escapeHtml(clinic.logoUrl)}" alt="" width="40" height="40" style="vertical-align:middle;border-radius:6px;margin-right:10px;">`
    : ''
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#dbe3ee;font-family:Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#dbe3ee;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #b8c4d4;">
<tr><td style="height:4px;background:${ACCENT};"></td></tr>
<tr><td style="padding:20px 24px;border-bottom:1px solid #cbd5e1;">${logo}<span style="font-size:18px;font-weight:bold;color:#0f172a;vertical-align:middle;">${escapeHtml(clinic.name)}</span></td></tr>
<tr><td style="padding:24px;color:#334155;font-size:15px;line-height:1.55;">
${bodyHtml}
<p style="margin:20px 0 0;color:#475569;font-size:14px;">${contactLine}</p>
</td></tr>
<tr><td style="padding:16px 24px;background:#eef2f7;border-top:1px solid #cbd5e1;color:#64748b;font-size:12px;line-height:1.5;">
You are receiving this because you are a patient of ${escapeHtml(clinic.name)}. Sent by Clinix on the clinic's behalf.<br>
<a href="${escapeHtml(unsubscribeUrl)}" style="color:#475569;">Unsubscribe from these emails</a>
</td></tr>
</table></td></tr></table>
</body></html>`
}

function textFooter(clinic, unsubscribeUrl) {
  return `\n\n--\nYou are receiving this because you are a patient of ${clinic.name}. Sent by Clinix on the clinic's behalf.\nUnsubscribe: ${unsubscribeUrl}`
}

// "contact Sunrise Clinic on +91 98220 12345, or reply to this email" -
// replies only reach the clinic when it has an email address on file.
function contactSentence(prefix, { clinic, contact }) {
  const reply = clinic.email ? ', or simply reply to this email' : ''
  return `${prefix} please contact ${clinic.name} on ${contact}${reply}.`
}

function build({ clinic, unsubscribeUrl, subject, intro, details = [], button, contact, contactPrefix }) {
  const sentence = contactSentence(contactPrefix, { clinic, contact })
  const bodyHtml = [
    ...intro.map((p) => `<p style="margin:0 0 12px;">${escapeHtml(p)}</p>`),
    details.length ? detailsHtml(details) : '',
    button ? buttonHtml(button.label, button.url) : '',
  ].join('\n')
  const text = [
    ...intro,
    ...details.map(([label, value]) => `${label}: ${value}`),
    button ? `${button.label}: ${button.url}` : null,
    sentence,
  ]
    .filter(Boolean)
    .join('\n')
  return {
    subject,
    html: layout({ clinic, bodyHtml, contactLine: escapeHtml(sentence), unsubscribeUrl }),
    text: text + textFooter(clinic, unsubscribeUrl),
  }
}

export function appointmentConfirmationEmail({ clinic, patientName, date, time, token, contact, unsubscribeUrl }) {
  return build({
    clinic,
    unsubscribeUrl,
    contact,
    subject: `Appointment confirmed - ${clinic.name}, ${date} at ${time}`,
    intro: [`Hello ${patientName},`, `Your appointment at ${clinic.name} is confirmed.`],
    details: [
      ['Date', date],
      ['Time', time],
      ['Token number', String(token)],
    ],
    contactPrefix: 'To change or cancel,',
  })
}

export function appointmentReminderEmail({ clinic, patientName, date, time, contact, unsubscribeUrl }) {
  return build({
    clinic,
    unsubscribeUrl,
    contact,
    subject: `Reminder: your appointment at ${clinic.name} tomorrow at ${time}`,
    intro: [`Hello ${patientName},`, `This is a reminder of your appointment at ${clinic.name} tomorrow.`],
    details: [
      ['Date', date],
      ['Time', time],
    ],
    contactPrefix: 'To change or cancel,',
  })
}

export function queueUpdateEmail({ clinic, patientName, token, queueUrl, contact, unsubscribeUrl }) {
  return build({
    clinic,
    unsubscribeUrl,
    contact,
    subject: `Queue update - token ${token} at ${clinic.name}`,
    intro: [`Hello ${patientName},`, `There is an update on your visit to ${clinic.name} - token ${token}.`],
    details: [['Your token', String(token)]],
    button: { label: 'See the live queue', url: queueUrl },
    contactPrefix: 'For help,',
  })
}

export function documentReadyEmail({ clinic, patientName, documentType, pickup, contact, unsubscribeUrl }) {
  return build({
    clinic,
    unsubscribeUrl,
    contact,
    subject: `Your ${documentType} from ${clinic.name} is ready`,
    intro: [`Hello ${patientName},`, `Your ${documentType} from ${clinic.name} is ready. ${pickup}`],
    contactPrefix: 'For questions,',
  })
}
