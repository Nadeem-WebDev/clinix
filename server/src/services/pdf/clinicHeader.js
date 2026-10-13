import { PAGE, COLORS } from './pdfLayout.js'

const LOGO_SIZE = 54
const LOGO_GAP = 14
const TOP = 30

// Shared clinic header for every generated PDF: optional logo on the left,
// clinic name with its address and contact lines beside it, and an optional
// `aside` on the right - a function (doc, { x, y, width }) that draws the
// document's own details there (the doctor on a prescription, the receipt
// number on a bill) and returns the y where it ended. A blue rule closes the
// header, and the cursor is left at the left margin below it.
export function drawClinicHeader(doc, clinic, logo, { aside, asideWidth = 200 } = {}) {
  let textX = PAGE.left
  let logoBottom = TOP

  if (logo) {
    try {
      doc.image(logo, PAGE.left, TOP, { fit: [LOGO_SIZE, LOGO_SIZE], align: 'center', valign: 'center' })
      textX = PAGE.left + LOGO_SIZE + LOGO_GAP
      logoBottom = TOP + LOGO_SIZE
    } catch (err) {
      // An image pdfkit can't decode just means a text-only header.
      console.error('[pdf] clinic logo could not be embedded:', err.message)
    }
  }

  const width = PAGE.right - textX - (aside ? asideWidth + 16 : 0)
  doc.font('Helvetica-Bold').fontSize(17).fillColor(COLORS.ink)
  doc.text(clinic.name || 'Clinic', textX, TOP, { width })
  doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted)
  if (clinic.address) doc.text(clinic.address, textX, doc.y + 3, { width })
  const contact = [clinic.phone && `Phone: ${clinic.phone}`, clinic.email].filter(Boolean).join('   |   ')
  if (contact) doc.text(contact, textX, doc.y + 1.5, { width })

  let bottom = Math.max(doc.y, logoBottom)
  if (aside) bottom = Math.max(bottom, aside(doc, { x: PAGE.right - asideWidth, y: TOP, width: asideWidth }))

  const ruleY = bottom + 12
  doc.moveTo(PAGE.left, ruleY).lineTo(PAGE.right, ruleY).lineWidth(1.2).strokeColor(COLORS.accent).stroke()
  doc.lineWidth(1).fillColor(COLORS.ink)
  doc.x = PAGE.left
  doc.y = ruleY + 16
}
