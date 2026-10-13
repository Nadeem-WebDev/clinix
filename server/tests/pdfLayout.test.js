import { formatAmount, formatRupees, rupeesInWords, formatDate, formatTime } from '../src/services/pdf/pdfLayout.js'

describe('PDF amounts', () => {
  it('groups digits the Indian way, always with paise', () => {
    expect(formatAmount(0)).toBe('0.00')
    expect(formatAmount(500)).toBe('500.00')
    expect(formatAmount(1150)).toBe('1,150.00')
    expect(formatAmount(110000.5)).toBe('1,10,000.50')
    expect(formatAmount(12345678.9)).toBe('1,23,45,678.90')
    expect(formatAmount(-1100)).toBe('-1,100.00')
  })

  it('puts a discount\'s minus sign before the rupee prefix', () => {
    expect(formatRupees(1100)).toBe('Rs. 1,100.00')
    expect(formatRupees(-50)).toBe('- Rs. 50.00')
  })

  it('spells the total in lakhs and crores', () => {
    expect(rupeesInWords(0)).toBe('Rupees Zero Only')
    expect(rupeesInWords(1100)).toBe('Rupees One Thousand One Hundred Only')
    expect(rupeesInWords(250050)).toBe('Rupees Two Lakh Fifty Thousand Fifty Only')
    expect(rupeesInWords(10000000)).toBe('Rupees One Crore Only')
    expect(rupeesInWords(99.5)).toBe('Rupees Ninety Nine and Fifty Paise Only')
  })
})

describe('PDF dates', () => {
  it('reads dates and times on the clinic\'s clock', () => {
    // 20:00 UTC is already the next morning in India.
    const instant = new Date('2026-10-12T20:00:00.000Z')
    expect(formatDate(instant, 'Asia/Kolkata')).toBe('13 Oct 2026')
    expect(formatTime(instant, 'Asia/Kolkata')).toBe('1:30 AM')
    expect(formatDate(instant, 'America/New_York')).toBe('12 Oct 2026')
  })

  it('falls back to India time for an unknown zone rather than failing the PDF', () => {
    expect(formatDate(new Date('2026-10-12T20:00:00.000Z'), 'Not/AZone')).toBe('13 Oct 2026')
  })
})
