#!/usr/bin/env node
// Full acceptance-workflow E2E: drives the real client + server (spun up
// fresh against an isolated port/DB pair, never the developer's own dev
// servers) through one continuous run tying together every phase of the
// spec - clinic/admin signup, staff, patient registration, appointment
// booking, the OPD queue, a consultation, a prescription, an invoice +
// payment, and the dashboard/reports/audit-log views. Exits 0 on a clean
// pass, 1 on any failed step (with the failing step named).
//
// Usage: npm run test:e2e   (from the repo root)
// Uses its own ephemeral in-memory MongoDB (mongodb-memory-server, already
// a server devDependency - same tool the backend Jest suite runs on), not
// the developer's real dev database, and not a real system `mongod` at
// all - nothing to have running first, nothing left behind after.

import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'
import { MongoMemoryServer } from 'mongodb-memory-server'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const API_PORT = 5057
const CLIENT_PORT = 5178
const API_URL = `http://localhost:${API_PORT}/api/v1`
const CLIENT_URL = `http://localhost:${CLIENT_PORT}`
const STAMP = Date.now()
const PASSWORD = 'SuperSecret123!'

let mongod
let serverProc
let clientProc
let browser
let failures = 0

function step(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failures += 1
  return ok
}

function assert(name, condition, detail = '') {
  return step(name, Boolean(condition), detail)
}

// Cloudinary has no real credentials in this environment (see README
// "Known limitations") - reads the same root .env the server itself loads,
// so the document-upload step can be skipped honestly instead of failing
// on an environment gap that isn't an app bug.
function cloudinaryConfigured() {
  try {
    const envText = readFileSync(path.join(ROOT, '.env'), 'utf8')
    const match = envText.match(/^CLOUDINARY_CLOUD_NAME=(.+)$/m)
    return Boolean(match && match[1].trim())
  } catch {
    return false
  }
}

function spawnProc(label, cmd, args, opts) {
  const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts })
  proc.stderr.on('data', (d) => process.stderr.write(`[${label}] ${d}`))
  proc.on('error', (err) => console.error(`[${label}] failed to start:`, err.message))
  return proc
}

async function waitForHttp(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  let lastErr
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.status < 500) return
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Timed out waiting for ${url}${lastErr ? `: ${lastErr.message}` : ''}`)
}

// Finds the first element matching `selector` whose textContent includes
// `text` and clicks it. Polls (via waitForFunction) since content is often
// still rendering right after a navigation.
async function clickByText(page, selector, text, { timeout = 15000 } = {}) {
  const handle = await page.waitForFunction(
    (sel, txt) => {
      const els = Array.from(document.querySelectorAll(sel))
      return els.find((el) => el.textContent.includes(txt)) || null
    },
    { timeout },
    selector,
    text,
  )
  const el = handle.asElement()
  if (!el) throw new Error(`Element not found: ${selector} containing "${text}"`)
  await el.click()
}

async function waitForText(page, selector, text, timeout = 15000) {
  await page.waitForFunction(
    (sel, txt) => Array.from(document.querySelectorAll(sel)).some((el) => el.textContent.includes(txt)),
    { timeout },
    selector,
    text,
  )
}

async function typeInto(page, selector, value) {
  await page.waitForSelector(selector, { visible: true })
  await page.click(selector, { clickCount: 3 }) // select any pre-filled value first
  await page.type(selector, value)
}

// Sets a native <select>'s value by matching its option's visible text
// (rather than needing to already know the option's value, e.g. a doctor's
// ObjectId) and dispatches a real change event so React Hook Form sees it.
async function selectByOptionText(page, selectSelector, optionText) {
  const value = await page.$eval(
    selectSelector,
    (el, text) => {
      const opt = Array.from(el.options).find((o) => o.textContent.includes(text))
      if (!opt) return null
      el.value = opt.value
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return opt.value
    },
    optionText,
  )
  if (!value) throw new Error(`Option containing "${optionText}" not found in ${selectSelector}`)
  return value
}

// Finds the row (matching rowSelector) whose text includes rowText, then
// clicks the button inside that row whose text includes buttonText. Used
// for list/table actions (Appointments, Queue) where several rows repeat
// the same action labels and only the row's own content disambiguates them.
async function clickButtonInRow(page, rowSelector, rowText, buttonText, { timeout = 20000 } = {}) {
  const handle = await page.waitForFunction(
    (rowSel, rowTxt, btnTxt) => {
      const rows = Array.from(document.querySelectorAll(rowSel))
      const row = rows.find((r) => r.textContent.includes(rowTxt))
      if (!row) return null
      return Array.from(row.querySelectorAll('button')).find((b) => b.textContent.includes(btnTxt)) || null
    },
    { timeout },
    rowSelector,
    rowText,
    buttonText,
  )
  const el = handle.asElement()
  if (!el) throw new Error(`Button "${buttonText}" not found in a row containing "${rowText}"`)
  await el.click()
}

// A minimal valid 1x1 red PNG, for the document-upload step - real bytes,
// not a renamed text file, so the server's MIME-type check (which reads
// the browser-supplied Content-Type of the multipart part, itself derived
// from the extension) passes the same way a real screenshot upload would.
const ONE_PX_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

async function main() {
  console.log(`\nClinic CRM - full acceptance-workflow E2E`)
  console.log(`API:    ${API_URL}`)
  console.log(`Client: ${CLIENT_URL}\n`)

  mongod = await MongoMemoryServer.create()
  step('In-memory MongoDB started', true)

  serverProc = spawnProc('server', 'node', ['src/server.js'], {
    cwd: path.join(ROOT, 'server'),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(API_PORT),
      MONGODB_URI: mongod.getUri(),
      CORS_ORIGIN: CLIENT_URL,
    },
  })
  await waitForHttp(`${API_URL}/health`)
  step('Server started (isolated port/DB)', true)

  // Invoke Vite's actual JS entry point via `node`, not the node_modules/.bin
  // wrapper - that wrapper is a .CMD file on Windows, which Node can't spawn
  // directly without a shell. `node <bin/vite.js>` runs identically on
  // every platform.
  clientProc = spawnProc(
    'client',
    process.execPath,
    [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(CLIENT_PORT), '--strictPort'],
    { cwd: path.join(ROOT, 'client'), env: { ...process.env, VITE_API_URL: API_URL } },
  )
  await waitForHttp(CLIENT_URL)
  step('Client started (isolated port, pointed at the isolated server)', true)

  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  page.setDefaultTimeout(20000)

  const adminEmail = `admin+${STAMP}@e2e.test`
  const doctorEmail = `doctor+${STAMP}@e2e.test`

  // --- Phase 1/2: clinic + admin signup, auto-logged-in ---
  await page.goto(`${CLIENT_URL}/register-clinic`, { waitUntil: 'networkidle0' })
  await typeInto(page, '#clinicName', `E2E Test Clinic ${STAMP}`)
  await typeInto(page, '#adminName', 'Ada Admin')
  await typeInto(page, '#email', adminEmail)
  await typeInto(page, '#password', PASSWORD)
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    clickByText(page, 'button[type="submit"]', 'Create clinic'),
  ])
  assert('Clinic + admin registered and auto-logged-in', page.url() === `${CLIENT_URL}/dashboard`, page.url())

  // Staff creation has no UI yet (README "Known limitations") - the admin
  // account's own session cookie carries over to a direct API call here,
  // exactly like the real app's own axios client does cross-origin.
  const doctorCreated = await page.evaluate(
    async (apiUrl, email, password) => {
      const res = await fetch(`${apiUrl}/users`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Dr. Priya Verma', email, password, role: 'doctor' }),
      })
      return res.ok
    },
    API_URL,
    doctorEmail,
    PASSWORD,
  )
  step('Doctor staff account created (API - no Staff UI yet)', doctorCreated)

  // --- Phase 3: register a patient ---
  await page.goto(`${CLIENT_URL}/patients/new`, { waitUntil: 'networkidle0' })
  await typeInto(page, '#fullName', 'Rahul Sharma')
  await typeInto(page, '#phone', '9876543210')
  await typeInto(page, '#age', '34')
  await page.select('#gender', 'male')
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    clickByText(page, 'button[type="submit"]', 'Register Patient'),
  ])
  const patientMatch = page.url().match(/\/patients\/([a-f0-9]{24})$/)
  assert('Patient registered (auto-generated patient ID)', Boolean(patientMatch), page.url())

  // --- Phase 4: book an appointment ---
  await page.goto(`${CLIENT_URL}/appointments/new`, { waitUntil: 'networkidle0' })
  await typeInto(page, 'input[placeholder="Search patient by name, phone, or ID…"]', 'Rahul')
  await waitForText(page, 'button', 'Rahul Sharma')
  await clickByText(page, 'button', 'Rahul Sharma')
  await selectByOptionText(page, '#doctorId', 'Priya Verma')
  // A native <input type="time"> is a compound control (hour/minute
  // sub-fields) - typing a literal colon into it is unreliable across
  // browsers. Digits alone let Chrome auto-advance between sub-fields, the
  // same as a real user typing "1030" without reaching for the colon key.
  await typeInto(page, '#time', '1030')
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    clickByText(page, 'button[type="submit"]', 'Book Appointment'),
  ])
  assert('Appointment booked', page.url() === `${CLIENT_URL}/appointments`, page.url())

  // Front desk: mark the booked appointment arrived (BOOKED -> WAITING).
  // StatusBadge renders the Title Case label ("Waiting"), not the raw
  // status enum ("WAITING") - match what's actually on screen.
  await clickButtonInRow(page, 'table tbody tr', 'Rahul Sharma', 'Mark Arrived')
  await waitForText(page, 'table tbody tr', 'Waiting')
  step('Front desk marked the patient arrived (BOOKED -> WAITING)', true)

  // --- OPD queue: call the patient in (WAITING -> IN_CONSULTATION) ---
  await page.goto(`${CLIENT_URL}/queue`, { waitUntil: 'networkidle0' })
  await clickButtonInRow(page, 'ul li', 'Rahul Sharma', 'Call')
  await waitForText(page, 'ul li', 'In Consultation')
  step('Doctor called the patient in (WAITING -> IN_CONSULTATION)', true)

  // --- Phase 5: consultation, opened from that queue row's "Consult" link ---
  await clickButtonInRow(page, 'ul li', 'Rahul Sharma', 'Consult')
  await page.waitForFunction(() => location.pathname.startsWith('/consultations/new'))
  await typeInto(page, '#chiefComplaint', 'Fever and cough for 3 days')
  await typeInto(page, '#diagnosis', 'Viral fever')
  await typeInto(page, '#treatmentPlan', 'Rest, fluids, paracetamol')
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    clickByText(page, 'button[type="submit"]', 'Save Consultation'),
  ])
  assert('Consultation saved (back on the patient profile)', page.url() === `${CLIENT_URL}/patients/${patientMatch[1]}`, page.url())

  // --- Phase 6: prescription, reached via Consultations tab -> record -> New Prescription ---
  await clickByText(page, 'button[role="tab"]', 'Consultations')
  await clickByText(page, 'a', 'Viral fever')
  await page.waitForFunction(() => location.pathname.startsWith('/consultations/'))
  await clickByText(page, 'a', 'New Prescription')
  await page.waitForFunction(() => location.pathname.startsWith('/prescriptions/new'))
  await typeInto(page, '[id="medicines.0.name"]', 'Paracetamol')
  await typeInto(page, '[id="medicines.0.dosage"]', '500mg')
  await typeInto(page, '[id="medicines.0.frequency"]', '1-0-1')
  await typeInto(page, '[id="medicines.0.duration"]', '3 days')
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    clickByText(page, 'button[type="submit"]', 'Save Prescription'),
  ])
  const prescriptionMatch = page.url().match(/\/prescriptions\/([a-f0-9]{24})$/)
  assert('Prescription saved', Boolean(prescriptionMatch), page.url())

  await clickByText(page, 'button', 'Finalize')
  await clickByText(page, '[role="dialog"] button', 'Finalize')
  await waitForText(page, 'body', 'finalized')
  step('Prescription finalized (edit-locked)', true)

  // Back to the queue to complete the appointment (IN_CONSULTATION -> COMPLETED).
  await page.goto(`${CLIENT_URL}/queue`, { waitUntil: 'networkidle0' })
  await clickButtonInRow(page, 'ul li', 'Rahul Sharma', 'Complete')
  await waitForText(page, 'body', 'Queue is empty')
  step('Appointment completed (IN_CONSULTATION -> COMPLETED)', true)

  // --- Phase 7: billing - create an invoice and record a payment ---
  await page.goto(`${CLIENT_URL}/billing/new`, { waitUntil: 'networkidle0' })
  await typeInto(page, 'input[placeholder="Search patient by name, phone, or ID…"]', 'Rahul')
  await waitForText(page, 'button', 'Rahul Sharma')
  await clickByText(page, 'button', 'Rahul Sharma')
  await selectByOptionText(page, '#doctorId', 'Priya Verma')
  await typeInto(page, 'input[aria-label="Description (item 1)"]', 'Consultation fee')
  await typeInto(page, 'input[aria-label="Quantity (item 1)"]', '1')
  await typeInto(page, 'input[aria-label="Unit price (item 1)"]', '500')
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    clickByText(page, 'button[type="submit"]', 'Create Invoice'),
  ])
  const invoiceMatch = page.url().match(/\/billing\/([a-f0-9]{24})$/)
  assert('Invoice created', Boolean(invoiceMatch), page.url())

  await clickByText(page, 'button', 'Record Payment')
  await typeInto(page, '[role="dialog"] #amount', '500')
  await clickByText(page, '[role="dialog"] button', 'Record Payment')
  await waitForText(page, 'body', 'Paid') // StatusBadge's Title Case label, not the raw "PAID" enum
  step('Payment recorded (invoice marked Paid)', true)

  // --- Phase 9: patient document upload (skipped honestly if Cloudinary
  // isn't configured in this environment - see README known limitations) ---
  if (cloudinaryConfigured()) {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'clinic-crm-e2e-'))
    const filePath = path.join(tmpDir, 'report.png')
    writeFileSync(filePath, Buffer.from(ONE_PX_PNG_BASE64, 'base64'))

    await page.goto(`${CLIENT_URL}/patients/${patientMatch[1]}`, { waitUntil: 'networkidle0' })
    await clickByText(page, 'button[role="tab"]', 'Documents')
    await typeInto(page, '#documentType', 'Blood report')
    const fileInput = await page.waitForSelector('#documentFile')
    await fileInput.uploadFile(filePath)
    await clickByText(page, 'form button[type="submit"]', 'Upload')
    await waitForText(page, 'body', 'Blood report')
    step('Patient document uploaded', true)
  } else {
    console.log('⚠ Document upload SKIPPED - Cloudinary not configured in this environment (see README)')
  }

  // --- Phase 8: dashboard, reports, audit logs ---
  await page.goto(`${CLIENT_URL}/dashboard`, { waitUntil: 'networkidle0' })
  await waitForText(page, 'body', "Today's revenue")
  step('Dashboard loaded with today\'s stats', true)

  await page.goto(`${CLIENT_URL}/reports`, { waitUntil: 'networkidle0' })
  await waitForText(page, 'h1', 'Reports')
  step('Reports page loaded', true)

  await page.goto(`${CLIENT_URL}/audit-logs`, { waitUntil: 'networkidle0' })
  await waitForText(page, 'body', 'CLINIC_REGISTERED')
  await waitForText(page, 'body', 'PATIENT_CREATED')
  step('Audit log shows the actions recorded through this run', true)

  // --- Logout (behind the header's user menu) ---
  await clickByText(page, 'header button', 'Ada Admin')
  await clickByText(page, 'header button', 'Log out')
  await page.waitForFunction(() => location.pathname === '/login')
  step('Logged out', true)
}

async function cleanup() {
  if (browser) await browser.close().catch(() => {})
  if (clientProc) clientProc.kill()
  if (serverProc) serverProc.kill()
  if (mongod) await mongod.stop().catch(() => {})
}

main()
  .catch((err) => {
    console.error(`\n✗ Run aborted: ${err.message}`)
    failures += 1
  })
  .finally(async () => {
    await cleanup()
    console.log(failures === 0 ? '\nAll steps passed.\n' : `\n${failures} step(s) failed.\n`)
    process.exit(failures === 0 ? 0 : 1)
  })
