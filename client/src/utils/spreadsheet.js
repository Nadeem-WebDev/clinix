// Report exports as real .xlsx files rather than CSV. A CSV can't carry
// column widths, so Excel opened every date column too narrow and showed
// "#####"; here each column gets a width, dates stay dates and amounts
// stay numbers (so sorting and SUM() work). The library is only loaded
// when someone actually exports.
//
// columns: [{ header, value: (row) => cell value, type?, format?, width }]
export async function downloadSpreadsheet(fileName, columns, rows) {
  if (!rows.length) return
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const data = [
    columns.map((c) => ({ value: c.header, fontWeight: 'bold' })),
    ...rows.map((row) =>
      columns.map((c) => ({
        value: c.value(row),
        type: c.type,
        format: c.format,
      })),
    ),
  ]
  await writeXlsxFile(data, {
    columns: columns.map((c) => ({ width: c.width })),
    stickyRowsCount: 1,
  }).toFile(fileName)
}

// Shared column formats. Excel shows these in its own number style.
export const DATE_FORMAT = 'dd mmm yyyy'
export const MONTH_FORMAT = 'mmm yyyy'
export const MONEY_FORMAT = '"₹"#,##0'
export const PERCENT_FORMAT = '0%'
