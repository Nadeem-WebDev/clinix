// Creates a Clinix platform admin (the /platform panel), or gives an
// existing one a new password. There is no signup page for this on purpose:
// whoever can run this script against the database already controls it.
//
//   npm run create-platform-admin --workspace server -- --email you@example.com --name "Your Name"
//
// A strong password is generated and printed once. To choose your own, set
// PLATFORM_ADMIN_PASSWORD (8+ characters) for that one run. Running it again
// for the same email sets a new password and signs out that admin's sessions.
/* eslint-disable no-console -- this whole file's job is CLI output */
import crypto from 'node:crypto'
import { connectDB, disconnectDB } from '../src/config/db.js'
import { env } from '../src/config/env.js'
import { PlatformAdmin } from '../src/models/PlatformAdmin.js'

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
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
  const email = arg('email')?.trim().toLowerCase()
  const name = arg('name')?.trim()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('Pass --email you@example.com')
  }

  const chosen = process.env.PLATFORM_ADMIN_PASSWORD
  if (chosen !== undefined && chosen.length < 8) throw new Error('PLATFORM_ADMIN_PASSWORD must be at least 8 characters')
  const password = chosen ?? crypto.randomBytes(12).toString('base64url')

  await connectDB()
  console.log(`Connected to ${describeDb(env.mongodbUri)}`)

  const passwordHash = await PlatformAdmin.hashPassword(password)
  const existing = await PlatformAdmin.findOne({ email })
  if (existing) {
    existing.passwordHash = passwordHash
    existing.sessionVersion = (existing.sessionVersion ?? 0) + 1
    existing.active = true
    if (name) existing.name = name
    await existing.save()
    console.log(`Updated platform admin ${email} - new password set, old sessions signed out.`)
  } else {
    if (!name) throw new Error('Pass --name "Your Name" for a new admin')
    await PlatformAdmin.create({ email, name, passwordHash })
    console.log(`Created platform admin ${email}.`)
  }
  if (chosen === undefined) {
    console.log(`\n  Password: ${password}\n\nIt is not stored anywhere readable - save it in your password manager now.`)
  }
  console.log('Log in at /platform/login')
}

main()
  .catch((err) => {
    console.error(err.message)
    process.exitCode = 1
  })
  .finally(() => disconnectDB())
