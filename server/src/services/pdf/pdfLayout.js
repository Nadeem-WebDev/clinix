import PDFDocument from 'pdfkit'
import { DEFAULT_TIMEZONE } from '../../utils/dateRange.js'

// The shared look of every generated PDF (prescription, receipt): A4, one
// accent colour, light grey panels, tables with a shaded header row, and a
// footer with page numbers. pdfkit's built-in Helvetica has no rupee sign,
// so amounts are printed as "Rs." - the usual form on Indian printed bills.

export const PAGE = { left: 40, right: 555, width: 515, top: 40 }
const FOOTER_RULE_Y = 792

export const COLORS = {
  accent: '#1d4ed8',
  accentDark: '#1e3a8a',
  accentFill: '#eff6ff',
  ink: '#0f172a',
  text: '#334155',
  muted: '#64748b',
  line: '#e2e8f0',
  fill: '#f8fafc',
  headerFill: '#f1f5f9',
}

// bufferPages keeps every page open until the end, so the footer can say
// "Page 1 of 2". The bottom margin leaves room for that footer; content
// that reaches it moves to a new page.
export function newDocument() {
  return new PDFDocument({
    size: 'A4',
    margins: { top: PAGE.top, bottom: 64, left: PAGE.left, right: 40 },
    bufferPages: true,
  })
}

// --- Dates and amounts -------------------------------------------------------

function safeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return DEFAULT_TIMEZONE
  }
}

function dateParts(date, tz, options) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: safeZone(tz), ...options }).formatToParts(new Date(date))
  return Object.fromEntries(parts.map((p) => [p.type, p.value]))
}

// "13 Oct 2026" on the clinic's own calendar (built from parts, so it reads
// the same whatever locale data the server's Node has).
export function formatDate(date, tz = DEFAULT_TIMEZONE) {
  const p = dateParts(date, tz, { day: 'numeric', month: 'short', year: 'numeric' })
  return `${p.day} ${p.month} ${p.year}`
}

// "10:30 AM" on the clinic's clock.
export function formatTime(date, tz = DEFAULT_TIMEZONE) {
  const p = dateParts(date, tz, { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${p.hour}:${p.minute} ${p.dayPeriod}`
}

// 110000.5 -> "1,10,000.50" (Indian digit grouping).
export function formatAmount(n) {
  const value = Math.round((Number(n) || 0) * 100) / 100
  const [whole, paise] = Math.abs(value).toFixed(2).split('.')
  const lastThree = whole.slice(-3)
  const rest = whole.slice(0, -3)
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}` : lastThree
  return `${value < 0 ? '-' : ''}${grouped}.${paise}`
}

export function formatRupees(n) {
  return n < 0 ? `- Rs. ${formatAmount(-n)}` : `Rs. ${formatAmount(n)}`
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
  'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function belowHundred(n) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`
}

function belowThousand(n) {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  return [hundreds && `${ONES[hundreds]} Hundred`, rest && belowHundred(rest)].filter(Boolean).join(' ')
}

// 1100 -> "Rupees One Thousand One Hundred Only", in the Indian system
// (thousand, lakh, crore) the way receipts here spell out the total.
export function rupeesInWords(n) {
  const paiseTotal = Math.round(Math.abs(Number(n) || 0) * 100)
  let rupees = Math.floor(paiseTotal / 100)
  const paise = paiseTotal % 100
  const crore = Math.floor(rupees / 10000000)
  rupees %= 10000000
  const lakh = Math.floor(rupees / 100000)
  rupees %= 100000
  const thousand = Math.floor(rupees / 1000)
  rupees %= 1000
  const words = [
    crore && `${belowThousand(crore)} Crore`,
    lakh && `${belowHundred(lakh)} Lakh`,
    thousand && `${belowHundred(thousand)} Thousand`,
    rupees && belowThousand(rupees),
  ].filter(Boolean)
  return `Rupees ${words.length ? words.join(' ') : 'Zero'}${paise ? ` and ${belowHundred(paise)} Paise` : ''} Only`
}

// --- Building blocks ---------------------------------------------------------

// Starts a new page when `height` more points won't fit above the footer.
export function ensureSpace(doc, height) {
  if (doc.y + height > doc.page.maxY()) {
    doc.addPage()
    doc.y = PAGE.top
  }
}

// Small spaced capitals in the accent colour: "PATIENT", "ADVICE".
export function sectionLabel(doc, text, x = PAGE.left, y = doc.y, width = PAGE.width) {
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.accent)
  doc.text(text.toUpperCase(), x, y, { width, characterSpacing: 0.8 })
}

// A light panel of label/value pairs laid out in equal columns - the
// patient strip on both documents. Rows grow to fit a long value.
export function drawInfoPanel(doc, cells, { columns = cells.length } = {}) {
  const padX = 12
  const padY = 9
  const colWidth = PAGE.width / columns
  const rows = []
  for (let i = 0; i < cells.length; i += columns) rows.push(cells.slice(i, i + columns))

  doc.font('Helvetica-Bold').fontSize(10)
  const rowHeights = rows.map(
    (row) => 11 + Math.max(...row.map((c) => doc.heightOfString(String(c.value ?? '-'), { width: colWidth - padX * 2 }))),
  )
  const height = rowHeights.reduce((s, h) => s + h, 0) + padY * 2 + (rows.length - 1) * 6
  ensureSpace(doc, height)
  const top = doc.y

  doc.roundedRect(PAGE.left, top, PAGE.width, height, 6).fillAndStroke(COLORS.fill, COLORS.line)
  let rowY = top + padY
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const x = PAGE.left + c * colWidth + padX
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted)
      doc.text(cell.label.toUpperCase(), x, rowY, { width: colWidth - padX * 2, characterSpacing: 0.5 })
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.ink)
      doc.text(String(cell.value ?? '-'), x, rowY + 11, { width: colWidth - padX * 2 })
    })
    rowY += rowHeights[r] + 6
  })
  doc.x = PAGE.left
  doc.y = top + height + 14
}

// A table with a shaded header row and a hairline under each row. A cell is
// a string or { text, sub } (sub = a smaller grey line under it). Rows that
// would run into the footer move to a new page, which repeats the header.
export function drawTable(doc, columns, rows) {
  const padX = 7
  const padY = 6
  const xs = []
  columns.reduce((x, col) => {
    xs.push(x)
    return x + col.width
  }, PAGE.left)

  const drawHeader = () => {
    const y = doc.y
    doc.rect(PAGE.left, y, PAGE.width, 20).fill(COLORS.headerFill)
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.text)
    columns.forEach((col, i) => {
      doc.text(col.header.toUpperCase(), xs[i] + padX, y + 6.5, {
        width: col.width - padX * 2,
        align: col.align ?? 'left',
        characterSpacing: 0.5,
      })
    })
    doc.y = y + 20
  }

  const cellHeight = (cell, col) => {
    const { text, sub } = typeof cell === 'object' && cell !== null ? cell : { text: cell }
    const width = col.width - padX * 2
    doc.font(col.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5)
    let h = doc.heightOfString(String(text ?? ''), { width })
    if (sub) {
      doc.font('Helvetica').fontSize(8)
      h += 2 + doc.heightOfString(sub, { width })
    }
    return h
  }

  ensureSpace(doc, 20 + 30)
  drawHeader()
  rows.forEach((row) => {
    const height = Math.max(...row.map((cell, i) => cellHeight(cell, columns[i]))) + padY * 2
    if (doc.y + height > doc.page.maxY()) {
      doc.addPage()
      doc.y = PAGE.top
      drawHeader()
    }
    const y = doc.y
    row.forEach((cell, i) => {
      const col = columns[i]
      const { text, sub, color } = typeof cell === 'object' && cell !== null ? cell : { text: cell }
      const width = col.width - padX * 2
      doc.font(col.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(color ?? COLORS.ink)
      doc.text(String(text ?? ''), xs[i] + padX, y + padY, { width, align: col.align ?? 'left' })
      if (sub) {
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
        doc.text(sub, xs[i] + padX, doc.y + 2, { width, align: col.align ?? 'left' })
      }
    })
    doc.moveTo(PAGE.left, y + height).lineTo(PAGE.right, y + height).lineWidth(0.6).strokeColor(COLORS.line).stroke()
    doc.y = y + height
  })
  doc.x = PAGE.left
  doc.y += 14
}

// Run last: on every page, the accent bar across the top and the footer
// (a hairline, `note` on the left, "Page n of m" on the right). Optional
// `watermark` is drawn faintly across each page (e.g. "DRAFT").
export function drawPageChrome(doc, { note, watermark } = {}) {
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    // Writing below the bottom margin would make pdfkit start a new page.
    const bottomMargin = doc.page.margins.bottom
    doc.page.margins.bottom = 0

    doc.rect(0, 0, doc.page.width, 5).fill(COLORS.accent)

    if (watermark) {
      doc.save()
      doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] })
      doc.font('Helvetica-Bold').fontSize(110).fillColor(COLORS.muted).fillOpacity(0.08)
      doc.text(watermark, 0, doc.page.height / 2 - 55, { width: doc.page.width, align: 'center', lineBreak: false })
      doc.restore()
    }

    doc.moveTo(PAGE.left, FOOTER_RULE_Y).lineTo(PAGE.right, FOOTER_RULE_Y).lineWidth(0.6).strokeColor(COLORS.line).stroke()
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
    if (note) doc.text(note, PAGE.left, FOOTER_RULE_Y + 7, { width: PAGE.width - 80 })
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, PAGE.right - 70, FOOTER_RULE_Y + 7, {
      width: 70,
      align: 'right',
    })
    doc.page.margins.bottom = bottomMargin
  }
}
