import { drawClinicHeader } from './clinicHeader.js'
import {
  PAGE,
  COLORS,
  newDocument,
  formatDate,
  formatTime,
  ensureSpace,
  sectionLabel,
  drawInfoPanel,
  drawTable,
  drawPageChrome,
} from './pdfLayout.js'

function calculateAge(patient) {
  if (patient.age != null) return patient.age
  if (!patient.dob) return null
  const diff = Date.now() - new Date(patient.dob).getTime()
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
}

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// "Reg. No. 12345 (Maharashtra Medical Council)", or null if not on file.
function registrationLine(profile) {
  if (!profile?.registrationNumber) return null
  return `Reg. No. ${profile.registrationNumber}${profile.registrationCouncil ? ` (${profile.registrationCouncil})` : ''}`
}

const VITALS = [
  ['temperature', 'Temp'],
  ['bloodPressure', 'BP'],
  ['pulse', 'Pulse'],
  ['respiratoryRate', 'Resp. rate'],
  ['spo2', 'SpO2'],
  ['weight', 'Weight'],
  ['height', 'Height'],
]

const SIGNATURE_WIDTH = 200
const SIGNATURE_HEIGHT = 50
const SIGNATURE_X = PAGE.right - SIGNATURE_WIDTH

// The prescribing doctor, top right of the header: name, qualifications
// and specialisation, registration. Only what's on file is printed.
function drawDoctorAside(doc, doctor, { x, y, width }) {
  const profile = doctor.doctorProfile
  doc.font('Helvetica-Bold').fontSize(12.5).fillColor(COLORS.accentDark)
  doc.text(`Dr. ${doctor.name}`, x, y, { width, align: 'right' })
  doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text)
  for (const line of [profile?.qualifications, profile?.specialization]) {
    if (line) doc.text(line, x, doc.y + 1.5, { width, align: 'right' })
  }
  const registration = registrationLine(profile)
  if (registration) {
    doc.fontSize(8).fillColor(COLORS.muted).text(registration, x, doc.y + 1.5, { width, align: 'right' })
  }
  return doc.y
}

// Chief complaint, vitals and diagnosis from the consultation - the
// "C/O, O/E, Dx" lines of a written prescription. Skipped entirely when
// none of it is on file.
function drawClinicalSummary(doc, consultation) {
  const vitals = VITALS.filter(([key]) => consultation?.vitals?.[key]).map(
    ([key, label]) => `${label} ${consultation.vitals[key]}`,
  )
  const rows = [
    ['Complaint', consultation?.chiefComplaint],
    ['Vitals', vitals.join('   |   ')],
    ['Diagnosis', consultation?.diagnosis],
  ].filter(([, value]) => value)
  if (rows.length === 0) return

  ensureSpace(doc, 20 + rows.length * 16)
  for (const [label, value] of rows) {
    const y = doc.y
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.muted)
    doc.text(label.toUpperCase(), PAGE.left, y + 1.5, { width: 80, characterSpacing: 0.5 })
    doc.font(label === 'Diagnosis' ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(COLORS.ink)
    doc.text(value, PAGE.left + 84, y, { width: PAGE.width - 84 })
    doc.y += 5
  }
  doc.y += 8
}

// The big "Rx" and the medicines table.
function drawMedicines(doc, medicines) {
  ensureSpace(doc, 80)
  doc.font('Helvetica-BoldOblique').fontSize(22).fillColor(COLORS.accent).text('Rx', PAGE.left, doc.y)
  doc.y += 4

  drawTable(
    doc,
    [
      { header: '#', width: 26, align: 'center' },
      { header: 'Medicine', width: 205, bold: true },
      { header: 'Dose', width: 70 },
      { header: 'Frequency', width: 92 },
      { header: 'Duration', width: 70 },
      { header: 'Qty', width: 52, align: 'center' },
    ],
    medicines.map((med, i) => [
      String(i + 1),
      { text: med.name, sub: [med.route, med.instructions].filter(Boolean).join('  ·  ') || null },
      med.dosage ?? '',
      { text: med.frequency ?? '', sub: med.timing || null },
      med.duration ?? '',
      med.quantity ?? '',
    ]),
  )
}

// A tinted box with a small heading - advice and follow-up.
function drawNote(doc, label, text) {
  doc.font('Helvetica').fontSize(9.5)
  const height = doc.heightOfString(text, { width: PAGE.width - 28 }) + 32
  ensureSpace(doc, height)
  const top = doc.y
  doc.roundedRect(PAGE.left, top, PAGE.width, height, 6).fill(COLORS.accentFill)
  doc.rect(PAGE.left, top, 3, height).fill(COLORS.accent)
  sectionLabel(doc, label, PAGE.left + 14, top + 10, PAGE.width - 28)
  doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.ink)
  doc.text(text, PAGE.left + 14, top + 22, { width: PAGE.width - 28 })
  doc.x = PAGE.left
  doc.y = top + height + 10
}

// Bottom-right sign-off: the signature image (finalized prescriptions
// only - a draft must not look signed), a rule, then the doctor's name,
// qualifications and registration. Moves to a new page rather than run
// into the footer.
function drawSignatureBlock(doc, doctor, finalized) {
  const profile = doctor.doctorProfile
  // Registration and council on separate lines - together they wrap
  // mid-name in a block this narrow.
  const lines = [
    profile?.qualifications,
    profile?.registrationNumber && `Reg. No. ${profile.registrationNumber}`,
    profile?.registrationNumber && profile?.registrationCouncil,
  ].filter(Boolean)
  const blockHeight = SIGNATURE_HEIGHT + 22 + lines.length * 12
  doc.y += 18
  ensureSpace(doc, blockHeight)

  const top = doc.y
  const signature = profile?.signature
  if (finalized && signature?.data?.length) {
    try {
      doc.image(signature.data, SIGNATURE_X, top, {
        fit: [SIGNATURE_WIDTH, SIGNATURE_HEIGHT],
        align: 'right',
        valign: 'bottom',
      })
    } catch (err) {
      console.error('[pdf] doctor signature could not be embedded:', err.message)
    }
  } else if (!finalized) {
    doc
      .fontSize(9)
      .font('Helvetica-Oblique')
      .fillColor(COLORS.muted)
      .text('Draft - not signed', SIGNATURE_X, top + SIGNATURE_HEIGHT - 12, { width: SIGNATURE_WIDTH, align: 'right' })
  }

  const ruleY = top + SIGNATURE_HEIGHT + 4
  doc.moveTo(SIGNATURE_X, ruleY).lineTo(PAGE.right, ruleY).lineWidth(0.8).strokeColor(COLORS.muted).stroke()
  doc
    .fillColor(COLORS.ink)
    .fontSize(10)
    .font('Helvetica-Bold')
    .text(`Dr. ${doctor.name}`, SIGNATURE_X, ruleY + 5, { width: SIGNATURE_WIDTH, align: 'right' })
  doc.fontSize(8.5).font('Helvetica').fillColor(COLORS.text)
  for (const line of lines) doc.text(line, SIGNATURE_X, doc.y + 1, { width: SIGNATURE_WIDTH, align: 'right' })
  doc.fillColor(COLORS.ink)
  doc.x = PAGE.left
}

// Renders the prescription PDF and streams it to the response. `logo` is
// the clinic logo as PNG bytes (see clinicLogo.js) or null. `doctor` may
// carry a doctorProfile (with the signature bytes); `consultation` may
// carry the complaint, vitals, diagnosis and follow-up. Whatever isn't on
// file is left out rather than printed as a placeholder. Dates are on the
// clinic's own clock.
export function streamPrescriptionPdf(res, { clinic, logo, doctor, patient, consultation, prescription }) {
  const tz = clinic.timezone
  const doc = newDocument()
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="prescription-${patient.patientId}.pdf"`)
  doc.pipe(res)

  drawClinicHeader(doc, clinic, logo, {
    aside: (d, box) => drawDoctorAside(d, doctor, box),
    asideWidth: 230,
  })

  const age = calculateAge(patient)
  drawInfoPanel(doc, [
    { label: 'Patient', value: patient.fullName },
    { label: 'Patient ID', value: patient.patientId },
    { label: 'Age / Sex', value: [age != null && `${age} yrs`, capitalize(patient.gender)].filter(Boolean).join(' / ') || '-' },
    { label: 'Date', value: `${formatDate(prescription.createdAt, tz)}, ${formatTime(prescription.createdAt, tz)}` },
  ])

  drawClinicalSummary(doc, consultation)
  drawMedicines(doc, prescription.medicines)

  if (prescription.notes) drawNote(doc, 'Advice', prescription.notes)
  if (consultation?.followUpDate) {
    // A follow-up date is date-only, stored as midnight UTC - read it as
    // that calendar date, not shifted into the clinic's zone.
    const when = `Review on ${formatDate(consultation.followUpDate, 'UTC')}`
    drawNote(doc, 'Follow-up', consultation.followUpInstructions ? `${when}. ${consultation.followUpInstructions}` : when)
  }

  drawSignatureBlock(doc, doctor, prescription.finalized)

  drawPageChrome(doc, {
    note: 'This is a computer-generated prescription and is intended as administrative documentation, not a substitute for professional medical judgment.',
    watermark: prescription.finalized ? null : 'DRAFT',
  })
  doc.end()
}
