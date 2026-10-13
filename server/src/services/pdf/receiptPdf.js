import { drawClinicHeader } from './clinicHeader.js'
import {
  PAGE,
  COLORS,
  newDocument,
  formatDate,
  formatTime,
  formatAmount,
  formatRupees,
  rupeesInWords,
  ensureSpace,
  sectionLabel,
  drawInfoPanel,
  drawTable,
  drawPageChrome,
} from './pdfLayout.js'

// How each payment status reads on paper, and its badge colours.
const STATUS = {
  PAID: { label: 'PAID', color: '#15803d', fill: '#dcfce7' },
  PARTIAL: { label: 'PARTLY PAID', color: '#b45309', fill: '#fef3c7' },
  PENDING: { label: 'UNPAID', color: '#475569', fill: '#e2e8f0' },
  REFUNDED: { label: 'REFUNDED', color: '#b91c1c', fill: '#fee2e2' },
}

const METHODS = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', ONLINE: 'Online', OTHER: 'Other' }

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// Top right of the header: the document's title, number, date and a status
// badge. Money received makes it a receipt; nothing paid yet, a bill.
function drawReceiptAside(doc, invoice, tz, { x, y, width }) {
  const title = invoice.amountPaid > 0 ? 'RECEIPT' : 'BILL'
  doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.accent)
  doc.text(title, x, y - 2, { width, align: 'right', characterSpacing: 1.5 })

  const meta = [
    ['No.', invoice.invoiceNumber],
    ['Date', formatDate(invoice.createdAt, tz)],
  ]
  let rowY = doc.y + 3
  for (const [label, value] of meta) {
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(label, x, rowY, { width: width - 95, align: 'right' })
    doc.font('Helvetica-Bold').fillColor(COLORS.ink).text(value, x + width - 90, rowY, { width: 90, align: 'right' })
    rowY += 12
  }

  const status = STATUS[invoice.paymentStatus] ?? STATUS.PENDING
  doc.font('Helvetica-Bold').fontSize(7.5)
  const badgeWidth = doc.widthOfString(status.label, { characterSpacing: 0.8 }) + 16
  const badgeY = rowY + 3
  doc.roundedRect(x + width - badgeWidth, badgeY, badgeWidth, 15, 7.5).fill(status.fill)
  doc.fillColor(status.color).text(status.label, x + width - badgeWidth, badgeY + 4, {
    width: badgeWidth,
    align: 'center',
    characterSpacing: 0.8,
  })
  return badgeY + 15
}

// Right-hand totals with the grand total on an accent band; on the left,
// the total in words.
function drawTotals(doc, invoice) {
  const balance = Math.max(0, invoice.total - invoice.amountPaid)
  const rows = [
    ['Subtotal', formatRupees(invoice.subtotal)],
    invoice.discount ? ['Discount', formatRupees(-invoice.discount)] : null,
    invoice.tax ? ['Tax', formatRupees(invoice.tax)] : null,
  ].filter(Boolean)
  const after = [
    ['Amount paid', formatRupees(invoice.amountPaid)],
    ['Balance due', formatRupees(balance), balance > 0 ? '#b91c1c' : COLORS.ink],
  ]
  const boxX = PAGE.right - 230
  const height = rows.length * 17 + 28 + after.length * 17 + 6
  ensureSpace(doc, height)
  const top = doc.y

  // Total in words, left of the figures.
  sectionLabel(doc, 'Amount in words', PAGE.left, top + 2, boxX - PAGE.left - 20)
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLORS.text)
  doc.text(rupeesInWords(invoice.total), PAGE.left, top + 15, { width: boxX - PAGE.left - 20 })

  let y = top
  const line = (label, value, { bold = false, color = COLORS.ink } = {}) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(COLORS.text)
    doc.text(label, boxX + 10, y + 3, { width: 110 })
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(color)
    doc.text(value, boxX + 110, y + 3, { width: 110, align: 'right' })
    y += 17
  }
  rows.forEach(([label, value]) => line(label, value))

  y += 2
  doc.roundedRect(boxX, y, 230, 24, 4).fill(COLORS.accent)
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff')
  doc.text('Total', boxX + 10, y + 7, { width: 110 })
  doc.text(formatRupees(invoice.total), boxX + 110, y + 7, { width: 110, align: 'right' })
  y += 30

  after.forEach(([label, value, color]) => line(label, value, { bold: label === 'Balance due', color }))
  doc.x = PAGE.left
  doc.y = Math.max(y, doc.y) + 14
}

// Same approach as the prescription PDF: clinic header (with the logo when
// one is set), then the bill. Amounts use Indian digit grouping; dates are
// on the clinic's own clock. A refunded bill shows the refund under its
// payments.
export function streamReceiptPdf(res, { clinic, logo, invoice, payments }) {
  const tz = clinic.timezone
  const doc = newDocument()
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="receipt-${invoice.invoiceNumber}.pdf"`)
  doc.pipe(res)

  drawClinicHeader(doc, clinic, logo, {
    aside: (d, box) => drawReceiptAside(d, invoice, tz, box),
    asideWidth: 190,
  })

  const patient = invoice.patientId
  const age = patient.age ?? null
  drawInfoPanel(doc, [
    { label: 'Billed to', value: patient.fullName },
    { label: 'Patient ID', value: patient.patientId },
    { label: 'Age / Sex', value: [age != null && `${age} yrs`, capitalize(patient.gender)].filter(Boolean).join(' / ') || '-' },
    { label: 'Doctor', value: invoice.doctorId?.name ? `Dr. ${invoice.doctorId.name}` : '-' },
  ])

  drawTable(
    doc,
    [
      { header: '#', width: 28, align: 'center' },
      { header: 'Description', width: 247 },
      { header: 'Qty', width: 50, align: 'center' },
      { header: 'Rate (Rs.)', width: 95, align: 'right' },
      { header: 'Amount (Rs.)', width: 95, align: 'right' },
    ],
    invoice.items.map((item, i) => [
      String(i + 1),
      item.description,
      String(item.quantity),
      formatAmount(item.unitPrice),
      formatAmount(item.amount),
    ]),
  )

  drawTotals(doc, invoice)

  if (payments.length > 0 || invoice.refundedAt) {
    sectionLabel(doc, 'Payments')
    doc.y += 4
    const rows = payments
      .slice()
      .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt))
      .map((p) => [`${formatDate(p.paidAt, tz)}, ${formatTime(p.paidAt, tz)}`, METHODS[p.method] ?? p.method, formatAmount(p.amount)])
    if (invoice.refundedAt) {
      rows.push([
        { text: `${formatDate(invoice.refundedAt, tz)}, ${formatTime(invoice.refundedAt, tz)}`, color: '#b91c1c' },
        { text: 'Refunded', color: '#b91c1c' },
        { text: formatAmount(-(invoice.refundedAmount ?? 0)), color: '#b91c1c' },
      ])
    }
    drawTable(
      doc,
      [
        { header: 'Date', width: 200 },
        { header: 'Method', width: 200 },
        { header: 'Amount (Rs.)', width: 115, align: 'right' },
      ],
      rows,
    )
  }

  if (invoice.notes) {
    sectionLabel(doc, 'Notes')
    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.text).text(invoice.notes, PAGE.left, doc.y + 3, { width: PAGE.width })
  }

  drawPageChrome(doc, { note: 'This is a computer-generated receipt and does not require a signature.' })
  doc.end()
}
