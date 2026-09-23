import PDFDocument from 'pdfkit'

// Same approach as the prescription PDF: clinic header, then invoice
// content, omitting the clinic logo since that upload doesn't exist yet.
export function streamReceiptPdf(res, { clinic, invoice, payments }) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="receipt-${invoice.invoiceNumber}.pdf"`)
  doc.pipe(res)

  doc.fontSize(18).font('Helvetica-Bold').text(clinic.name || 'Clinic')
  doc.fontSize(9).font('Helvetica').fillColor('#555')
  const clinicLine = [clinic.address, clinic.phone, clinic.email].filter(Boolean).join('  ·  ')
  if (clinicLine) doc.text(clinicLine)
  doc.fillColor('#000')
  doc.moveDown(0.5)
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ccc').stroke()
  doc.moveDown(1)

  doc.fontSize(14).font('Helvetica-Bold').text(`Receipt — ${invoice.invoiceNumber}`, { continued: true })
  doc.font('Helvetica').fontSize(10).text(`   ${new Date(invoice.createdAt).toLocaleDateString()}`, {
    align: 'right',
  })
  doc.moveDown(1)

  doc.fontSize(10).font('Helvetica-Bold').text('Patient')
  doc.font('Helvetica').text(`${invoice.patientId.fullName}  (${invoice.patientId.patientId})`)
  if (invoice.doctorId?.name) {
    doc.font('Helvetica-Bold').text('Doctor', { continued: false })
    doc.font('Helvetica').text(`Dr. ${invoice.doctorId.name}`)
  }
  doc.moveDown(1)

  // --- Items table ---
  // Every cell in a row is written at one captured Y, rather than chained
  // .text() calls (each of which advances doc.y by its own line height) -
  // that's what actually keeps a row's columns aligned.
  const colX = { desc: 50, qty: 320, price: 380, amount: 470 }
  const rowY = doc.y
  doc.font('Helvetica-Bold').fontSize(9)
  doc.text('Description', colX.desc, rowY, { width: 260 })
  doc.text('Qty', colX.qty, rowY, { width: 50, align: 'right' })
  doc.text('Unit Price', colX.price, rowY, { width: 80, align: 'right' })
  doc.text('Amount', colX.amount, rowY, { width: 75, align: 'right' })
  doc.moveDown(1)
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ccc').stroke()
  doc.moveDown(0.3)

  doc.font('Helvetica').fontSize(9)
  invoice.items.forEach((item) => {
    const y = doc.y
    doc.text(item.description, colX.desc, y, { width: 260 })
    doc.text(String(item.quantity), colX.qty, y, { width: 50, align: 'right' })
    doc.text(item.unitPrice.toFixed(2), colX.price, y, { width: 80, align: 'right' })
    doc.text(item.amount.toFixed(2), colX.amount, y, { width: 75, align: 'right' })
    doc.moveDown(0.5)
  })

  doc.moveDown(0.5)
  doc.moveTo(300, doc.y).lineTo(545, doc.y).strokeColor('#ccc').stroke()
  doc.moveDown(0.3)

  const totalsRow = (label, value, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10)
    const y = doc.y
    doc.text(label, 350, y, { width: 100, align: 'right' })
    doc.text(value.toFixed(2), colX.amount, y, { width: 75, align: 'right' })
    doc.moveDown(0.4)
  }
  totalsRow('Subtotal', invoice.subtotal)
  if (invoice.discount) totalsRow('Discount', -invoice.discount)
  if (invoice.tax) totalsRow('Tax', invoice.tax)
  totalsRow('Total', invoice.total, true)
  totalsRow('Paid', invoice.amountPaid)
  totalsRow('Balance', Math.max(0, invoice.total - invoice.amountPaid), true)

  // The totals rows above position text at x=350/470 with narrow widths;
  // pdfkit's cursor (doc.x) is left there afterward, so anything below
  // must explicitly reset back to the left margin or it inherits that
  // leftover narrow width and wraps prematurely.
  doc.moveDown(1)
  doc.font('Helvetica-Bold').fontSize(10).text(`Status: ${invoice.paymentStatus}`, 50, doc.y, { width: 495 })

  if (payments.length > 0) {
    doc.moveDown(1)
    doc.font('Helvetica-Bold').fontSize(10).text('Payments', 50, doc.y, { width: 495 })
    doc.font('Helvetica').fontSize(9)
    payments.forEach((p) => {
      doc.text(
        `${new Date(p.paidAt).toLocaleDateString()}  ·  ${p.method}  ·  ${p.amount.toFixed(2)}`,
        50,
        doc.y,
        { width: 495 },
      )
    })
  }

  doc.fontSize(8).fillColor('#999')
  doc.text('This is a computer-generated receipt.', 50, 750, { width: 495, align: 'center' })

  doc.end()
}
