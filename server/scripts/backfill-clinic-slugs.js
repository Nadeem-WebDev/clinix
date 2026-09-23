// One-off migration: give every pre-existing clinic a public `slug`.
//
// Clinic.slug was added with the public queue page (/q/:slug) and is
// `required` on the schema, but clinics created before that change have no
// slug at all. Anything that re-saves such a document would now fail
// validation, and their queue URL doesn't exist. This script backfills
// them.
//
// Run manually, never on boot - see the README's deployment notes. It is
// idempotent (clinics that already have a slug are skipped) and touches
// nothing else, so re-running it is safe.
//
//   node server/scripts/backfill-clinic-slugs.js            # apply
//   node server/scripts/backfill-clinic-slugs.js --dry-run  # report only
/* eslint-disable no-console -- this whole file's job is CLI progress output */
import { connectDB, disconnectDB } from '../src/config/db.js'
import { env } from '../src/config/env.js'
import { Clinic } from '../src/models/Clinic.js'
import { generateUniqueSlug } from '../src/services/clinic.service.js'

const dryRun = process.argv.includes('--dry-run')

async function main() {
  await connectDB()
  console.log(`Connected to ${env.mongodbUri}${dryRun ? ' (dry run - nothing will be written)' : ''}`)

  // `$in: [null, '']` rather than `$exists: false` alone: a document can
  // also carry an explicit null from an earlier partial write.
  const clinics = await Clinic.find({
    $or: [{ slug: { $exists: false } }, { slug: { $in: [null, ''] } }],
  })

  if (clinics.length === 0) {
    console.log('No clinics need a slug. Nothing to do.')
    return
  }

  console.log(`${clinics.length} clinic(s) missing a slug.`)
  let updated = 0

  for (const clinic of clinics) {
    // Generated one at a time, not in parallel: generateUniqueSlug checks
    // the collection for collisions, so concurrent generation could hand
    // the same slug to two same-named clinics.
    const slug = await generateUniqueSlug(clinic.name)
    if (dryRun) {
      console.log(`  would set ${clinic._id} "${clinic.name}" -> ${slug}`)
      continue
    }

    // updateOne rather than clinic.save(): save() would run full-document
    // validation on legacy rows that may predate other required fields
    // too, turning an unrelated old gap into a failed migration.
    await Clinic.updateOne({ _id: clinic._id }, { $set: { slug } })
    updated += 1
    console.log(`  ${clinic._id} "${clinic.name}" -> ${slug}`)
  }

  console.log(dryRun ? 'Dry run complete.' : `Backfilled ${updated} clinic(s).`)
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
