import PDFDocument from 'pdfkit'

function calculateAge(patient) {
  if (patient.age != null) return patient.age
  if (!patient.dob) return null
  const diff = Date.now() - new Date(patient.dob).getTime()
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
}

// Renders a professional-looking prescription PDF and streams it directly
// to the response. Deliberately omits clinic logo, doctor
// qualification/registration, and a signature image - none of that data
// exists yet (Clinic logo, DoctorProfile, and file uploads are all later
// modules) - rather than fabricate placeholder values for them.
export function streamPrescriptionPdf(res, { clinic, doctor, patient, consultation, prescription }) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="prescription-${patient.patientId}.pdf"`)
  doc.pipe(res)

  // --- Clinic header ---
  doc.fontSize(18).font('Helvetica-Bold').text(clinic.name || 'Clinic')
  doc.fontSize(9).font('Helvetica').fillColor('#555')
  const clinicLine = [clinic.address, clinic.phone, clinic.email].filter(Boolean).join('  ·  ')
  if (clinicLine) doc.text(clinicLine)
  doc.fillColor('#000')
  doc.moveDown(0.5)
  doc
    .moveTo(50, doc.y)
    .lineTo(545, doc.y)
    .strokeColor('#ccc')
    .stroke()
  doc.moveDown(1)

  // --- Doctor + date ---
  doc.fontSize(11).font('Helvetica-Bold').text(`Dr. ${doctor.name}`, { continued: true })
  doc
    .font('Helvetica')
    .text(`   ${new Date(prescription.createdAt).toLocaleDateString()}`, { align: 'right' })
  doc.moveDown(1)

  // --- Patient block ---
  const age = calculateAge(patient)
  doc.fontSize(10).font('Helvetica-Bold').text('Patient')
  doc.font('Helvetica').text(`${patient.fullName}  (${patient.patientId})`)
  doc.text(`${age != null ? `${age} yrs` : ''}${age != null && patient.gender ? ' · ' : ''}${patient.gender ?? ''}`)
  doc.moveDown(1)

  if (consultation?.diagnosis) {
    doc.font('Helvetica-Bold').text('Diagnosis')
    doc.font('Helvetica').text(consultation.diagnosis)
    doc.moveDown(1)
  }

  // --- Rx / medicines ---
  doc.fontSize(14).font('Helvetica-Bold').text('Rx')
  doc.moveDown(0.5)
  doc.fontSize(10)
  prescription.medicines.forEach((med, index) => {
    doc.font('Helvetica-Bold').text(`${index + 1}. ${med.name}${med.dosage ? ` ${med.dosage}` : ''}`)
    const details = [med.frequency, med.route, med.timing, med.duration]
      .filter(Boolean)
      .join('  ·  ')
    if (details) doc.font('Helvetica').text(`   ${details}`)
    if (med.quantity) doc.font('Helvetica').text(`   Qty: ${med.quantity}`)
    if (med.instructions) doc.font('Helvetica-Oblique').text(`   ${med.instructions}`)
    doc.moveDown(0.5)
  })

  if (prescription.notes) {
    doc.moveDown(0.5)
    doc.font('Helvetica-Bold').fontSize(10).text('Notes')
    doc.font('Helvetica').text(prescription.notes)
  }

  if (consultation?.followUpDate) {
    doc.moveDown(1)
    doc
      .font('Helvetica-Bold')
      .text(`Follow-up: ${new Date(consultation.followUpDate).toLocaleDateString()}`)
  }

  // --- Footer ---
  doc.fontSize(8).fillColor('#999')
  doc.text(
    'This is a computer-generated prescription and is intended as administrative documentation, not a substitute for professional medical judgment.',
    50,
    750,
    { width: 495, align: 'center' },
  )

  doc.end()
}
