// One-off migration: give every invoice refunded before refunds were
// recorded its Refund records, so revenue reports stop counting that money.
//
// Refunds used to be only a status flag on the invoice; reports summed the
// payments and never knew the money went back. Each payment on a REFUNDED
// invoice now needs a matching Refund. The old flag kept no refund date,
// so the invoice's last update time is used - for these invoices that was
// the refund itself, since a refunded invoice can't be edited or paid.
//
// Run manually, never on boot. It is idempotent (payments that already
// have a Refund are skipped) and touches nothing else, so re-running it is
// safe. It prints the database it connected to first - check that line.
//
//   node server/scripts/backfill-refunds.js            # apply
//   node server/scripts/backfill-refunds.js --dry-run  # report only
/* eslint-disable no-console -- this whole file's job is CLI progress output */
import { connectDB, disconnectDB } from '../src/config/db.js'
import { env } from '../src/config/env.js'
import { Invoice } from '../src/models/Invoice.js'
import { Payment } from '../src/models/Payment.js'
import { Refund } from '../src/models/Refund.js'

const dryRun = process.argv.includes('--dry-run')

function round2(n) {
  return Math.round(n * 100) / 100
}

// The database host only - never print the credentials in the URI.
function describeDb(uri) {
  try {
    const { host, pathname } = new URL(uri)
    return `${host}${pathname}`
  } catch {
    return '(database)'
  }
}

async function main() {
  await connectDB()
  console.log(`Connected to ${describeDb(env.mongodbUri)}${dryRun ? ' (dry run - nothing will be written)' : ''}`)

  const invoices = await Invoice.find({ paymentStatus: 'REFUNDED' })
  let refundsCreated = 0
  let invoicesFixed = 0

  for (const invoice of invoices) {
    const payments = await Payment.find({ clinicId: invoice.clinicId, invoiceId: invoice._id })
    const alreadyRefunded = new Set(
      (await Refund.find({ invoiceId: invoice._id }, 'paymentId')).map((r) => String(r.paymentId)),
    )
    const missing = payments.filter((p) => !alreadyRefunded.has(String(p._id)))
    const refundedAt = invoice.refundedAt ?? invoice.updatedAt
    const refundedAmount = round2(payments.reduce((sum, p) => sum + p.amount, 0))
    const needsFields = !invoice.refundedAt || invoice.refundedAmount === undefined
    if (missing.length === 0 && !needsFields) continue

    const total = round2(missing.reduce((sum, p) => sum + p.amount, 0))
    console.log(
      `  ${invoice.invoiceNumber} (${invoice._id}): ${missing.length} refund(s), ${total}, dated ${refundedAt.toISOString()}`,
    )
    invoicesFixed += 1
    refundsCreated += missing.length
    if (dryRun) continue

    if (missing.length > 0) {
      await Refund.insertMany(
        missing.map((p) => ({
          clinicId: invoice.clinicId,
          invoiceId: invoice._id,
          paymentId: p._id,
          amount: p.amount,
          method: p.method,
          refundedAt,
        })),
      )
    }
    // updateOne rather than invoice.save(): save() would run full-document
    // validation on old rows and bump updatedAt, the only refund date
    // these invoices have.
    await Invoice.updateOne(
      { _id: invoice._id },
      { $set: { refundedAt, refundedAmount } },
      { timestamps: false },
    )
  }

  if (invoicesFixed === 0) {
    console.log('No refunded invoices need refund records. Nothing to do.')
    return
  }
  console.log(
    dryRun
      ? `Dry run complete: would fix ${invoicesFixed} invoice(s) with ${refundsCreated} refund record(s).`
      : `Backfilled ${invoicesFixed} invoice(s) with ${refundsCreated} refund record(s).`,
  )
}

main()
  .then(async () => {
    await disconnectDB()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('Backfill failed:', err)
    await disconnectDB().catch(() => {})
    process.exit(1)
  })
