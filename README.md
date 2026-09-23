# Clinic CRM

A multi-tenant SaaS CRM/clinic-management app for small (1-5 doctor) clinics
and OPDs: patients, appointments, OPD queue, consultations, prescriptions,
and billing, in one screen.

> **Status: Phase 11 (public queue + WhatsApp) built, not yet exercised
> against real Meta credentials.** Phase 10 (testing/security/polish) is
> complete bar the Puppeteer acceptance script, which exists but has never
> run successfully here (missing system Chromium libraries - see
> [Testing](#testing)).
>
> Phase 11 adds the no-login waiting-room queue page (fully working and
> tested) and WhatsApp Cloud API notifications. **The WhatsApp side has
> never sent a real message**: this environment has no Meta Business
> account, no approved templates and no access token, so every test runs
> against a mocked Graph API client. `WHATSAPP_ENABLED` ships `false`, and
> with it false the app makes no outbound calls to Meta at all. See
> [WhatsApp setup](#whatsapp-setup) and [Known limitations](#known-limitations).

## Tech stack

- **Frontend:** React + Vite (JavaScript, no TypeScript) + Tailwind CSS +
  React Router + TanStack Query + React Hook Form + Zod + Lucide icons +
  Recharts
- **Backend:** Node.js + Express (JavaScript) + JWT auth + bcrypt
- **Database:** MongoDB + Mongoose
- **File storage:** Cloudinary (patient documents/images)
- **PDF:** generated server-side for prescriptions/receipts/invoices

## Architecture

- `client/` - Vite React SPA. Talks to the API over `VITE_API_URL`.
- `server/` - Express REST API, versioned under `/api/v1`. Every
  clinic-owned resource carries a `clinicId`, and tenant isolation is
  enforced server-side from the authenticated session - never from a
  client-supplied `clinicId`.
- Single `.env` at the repo root, shared by both (see below).

## Setup

Requires Node 18+ and a MongoDB instance (local or Atlas).

```bash
npm install                 # installs client + server workspaces
cp .env.example .env        # fill in real values
```

## Environment variables

See [`.env.example`](./.env.example) for the full list. Only vars prefixed
`VITE_` are exposed to the browser bundle; everything else stays
server-side. Never commit a real `.env`.

Phase 11 added these, all server-side only:

| Variable | Purpose |
|---|---|
| `WHATSAPP_ENABLED` | Global kill switch. Must be the exact string `true` to send anything; every other value is off. Ships `false`. |
| `WHATSAPP_CLOUD_API_BASE_URL` | Graph API base, e.g. `https://graph.facebook.com/v20.0`. |
| `WHATSAPP_PHONE_NUMBER_ID` | From your verified WhatsApp Business number. |
| `WHATSAPP_ACCESS_TOKEN` | Permanent System User token. Not a 24-hour temporary one. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Echoed back during Meta's webhook handshake. Any hard-to-guess string. |
| `WHATSAPP_APP_SECRET` | Verifies `X-Hub-Signature-256` on incoming webhooks. Blank is tolerated outside production and **refused** in production. |
| `WHATSAPP_TEMPLATE_*` | Approved template names (4 of them). Configurable because approval happens in Meta Business Manager, outside this repo. |
| `WHATSAPP_DISPLAY_TIMEZONE` | Timezone used *only* to render dates/times inside message text. Defaults to `Asia/Kolkata`. |
| `WHATSAPP_DEFAULT_COUNTRY_CODE` | Prepended to bare national numbers when converting to E.164. Defaults to `91`. |
| `WHATSAPP_REMINDER_CRON` | Schedule for the day-before reminder sweep. Defaults to `0 18 * * *`. |
| `PUBLIC_APP_URL` | Frontend base URL, used to build the `/q/<slug>` link inside messages. Falls back to the first `CORS_ORIGIN`. |

## MongoDB setup

Point `MONGODB_URI` at a local `mongod` or a MongoDB Atlas connection
string. No manual schema setup needed - Mongoose creates collections/indexes
on first use. A seed script (demo clinic + users + sample data) lands in a
later phase.

## Development

```bash
npm run dev            # runs client (5173) + server (5000) together
npm run dev:client      # client only
npm run dev:server      # server only
```

- Client: http://localhost:5173
- API health check: http://localhost:5000/api/v1/health

## Testing

```bash
npm run test:server    # backend tests (Jest + Supertest) - 81 tests
npm run test:client    # frontend tests (Vitest + React Testing Library) - 14 tests
npm run test:e2e       # full acceptance-workflow E2E (see below)
```

`test:e2e` (`e2e/acceptance.mjs`) drives the real client + server through
one continuous run tying every phase together: clinic/admin signup, a
staff account, patient registration, appointment booking, the OPD queue,
a consultation, a prescription (incl. finalizing it), an invoice + payment,
the dashboard/reports/audit-log views, and logout - via a real headless
Chromium (Puppeteer), not mocked requests. It's fully self-contained: an
in-memory MongoDB (`mongodb-memory-server`, no real `mongod` needed) and
its own server + Vite dev server on non-default ports, so it never touches
your real dev database or dev servers. Patient-document upload is skipped
(not failed) when Cloudinary isn't configured, matching the note below.

**Not yet verified in this environment**: Puppeteer's bundled Chromium
needs system shared libraries (`libnspr4`, `libnss3`, etc.) this machine
doesn't have installed, and installing them needs `sudo apt-get install`
on the host - out of scope for an app-level change here. The script was
written and carefully checked against the actual component source
(selectors, button labels, status text) but has not actually been run
end-to-end; expect to debug a selector or two the first time it runs
somewhere those libraries are present (a normal dev machine, or CI).

## Linting

```bash
npm run lint:client
npm run lint:server
```

## Build

```bash
npm run build   # production client build -> client/dist (alias for build:client)
```

## Production Deployment

Frontend → Vercel, backend → Render, database → MongoDB Atlas. All
configuration is environment-variable based - no secrets in source - and
`vercel.json` (repo root) already declares Vercel's build/output settings.

### 1. Database - MongoDB Atlas

1. Create a free-tier cluster and a database user (username/password).
2. Network access: allow Render's outbound traffic - `0.0.0.0/0` is
   simplest for an MVP (Atlas still requires the correct username/
   password); use Render's static outbound IPs instead if you've enabled
   that add-on.
3. Copy the connection string - this is `MONGODB_URI` below.

### 2. Backend - Render

Create a new **Web Service** from this repo:

- **Root Directory:** `server`
- **Build Command:** `npm install`
- **Start Command:** `npm start` (runs `node src/server.js`)

Environment variables (Render dashboard → Environment):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Leave unset - Render injects its own dynamically; the app already reads `process.env.PORT` (`server/src/config/env.js`). |
| `MONGODB_URI` | The Atlas connection string from step 1. |
| `JWT_SECRET` | A long random string (e.g. `openssl rand -hex 32`). **Required** - the app refuses to boot in production if this is missing or blank. |
| `JWT_EXPIRES_IN` | Optional, defaults to `7d`. |
| `CORS_ORIGIN` | The exact Vercel frontend URL (step 3) - comma-separated if you later add a custom domain too. Set to any placeholder for now (see step 4). |
| `CLOUDINARY_*` | Optional - only needed for document upload. |

Deploy, then note the Render-assigned URL (e.g.
`https://clinic-crm-api.onrender.com`) - the frontend needs it next.

### 3. Frontend - Vercel

Import this repo as a Vercel project:

- **Root Directory:** leave as the repo root (not `client/`) - this is an
  npm-workspaces monorepo, and the committed `vercel.json` already sets
  the build command (`npm run build`), output directory (`client/dist`),
  and the SPA rewrite rule client-side routing needs.
- **Environment variable:** `VITE_API_URL` = `<Render URL from step 2>/api/v1`.
  Vite bakes this in at *build* time, not read at runtime - it must be set
  before the first deploy; changing it later means redeploying.

Deploy, then note the Vercel-assigned URL (e.g.
`https://clinic-crm.vercel.app`).

### 4. Close the loop

Go back to Render and set `CORS_ORIGIN` to the actual Vercel URL from step
3 (redeploy, or let the env var change trigger one). The two platforms
are chicken-and-egg on first deploy - backend needs the frontend's URL for
CORS, frontend needs the backend's URL to build - so deploy the backend
first with any placeholder `CORS_ORIGIN`, deploy the frontend once you
have the backend's real URL, then come back and fix up `CORS_ORIGIN`.

### 5. Smoke test

Visit the Vercel URL, register a clinic, and confirm login/API calls work
with no CORS errors in the browser console. Vercel and Render sit on
different domains, making this a genuinely cross-site cookie setup - the
auth cookie is `SameSite=None; Secure` in production for exactly that
reason (`server/src/utils/jwt.js`). If login appears to succeed but every
request right after looks logged-out, `CORS_ORIGIN` not exactly matching
the Vercel URL (scheme, no trailing slash) is the first thing to check.

## Public queue page

Every clinic gets a `slug` (generated from its name at registration, e.g.
`sharma-clinic`) and a no-login page at `/q/<slug>` showing who is being
seen, how many are waiting, and a rough wait estimate. Intended for a
patient's phone and for a TV on the waiting-room wall; it polls every 12
seconds and needs no interaction.

The endpoint behind it (`GET /api/v1/public/clinics/:slug/queue`) is the
first route in this codebase that skips `authenticate`. What it publishes
is a strict field allow-list built in `publicQueue.service.js` - token
numbers, doctor names, and patient names masked to `Priya S.` Never a full
name, phone, DOB, or anything clinical. A test asserts the exact key set,
so adding a field to that response fails the suite until someone has
decided it is safe to publish.

Clinics created before Phase 11 have no slug. Backfill them once, by hand:

```bash
node server/scripts/backfill-clinic-slugs.js --dry-run   # report
node server/scripts/backfill-clinic-slugs.js             # apply
```

It is idempotent and never runs automatically on boot.

## WhatsApp setup

Notifications go through **Meta's WhatsApp Cloud API directly** (not a BSP
like Wati/Interakt). Nothing works until you have, outside this repo:

1. A Meta Business Account + WhatsApp Business Platform app.
2. A verified WhatsApp Business phone number (`WHATSAPP_PHONE_NUMBER_ID`).
3. A permanent System User access token (`WHATSAPP_ACCESS_TOKEN`).
4. **Approved message templates.** The Cloud API refuses any message sent
   outside a 24-hour customer-initiated window unless it uses an approved
   template - which is every message this app sends, since the clinic
   always initiates. Four are needed, and the variable order must match:

   | Template | Variables, in order |
   |---|---|
   | `appointment_confirmation` | patient name, clinic name, date, time, token number |
   | `appointment_reminder` | patient name, clinic name, date, time |
   | `queue_now_serving` | patient name, token number, queue link |
   | `document_ready` | patient name, document type, pickup instruction |

   Names are configurable via `WHATSAPP_TEMPLATE_*`; the variable *shape*
   is not, so changing a template's variables in Meta means changing the
   matching call in `whatsapp.service.js`.

Two independent switches gate every send, and both must be on: the global
`WHATSAPP_ENABLED` env var, and the per-clinic toggle in Clinic Settings
(Owner only). Off by default at both levels, so enabling it platform-wide
never silently starts messaging every existing clinic's patients.

Point Meta's webhook at `POST /api/v1/whatsapp/webhook` for delivery
receipts and inbound replies. A patient replying `STOP` (or `unsubscribe`,
`बंद`, `थांबा`, and a few others) is opted out immediately and permanently -
nothing re-enables it automatically.

A row is written to `whatsappmessages` for **every** send attempt,
including ones deliberately not sent (kill switch off, clinic toggle off,
patient opted out). Being able to show why a patient wasn't messaged
matters as much as showing that they were.

## Demo credentials

No seed script yet (that's a later phase). To try the app locally, create
your own clinic + admin via the "Create your clinic" link on `/login`
(`POST /api/v1/auth/register-clinic`), then use the admin account to create
doctor/receptionist/nurse accounts (`POST /api/v1/users` - there's no Staff
page UI yet, see Known limitations) before booking appointments.

## Security notes

- Passwords are hashed (bcrypt, cost 12), never stored in plain text.
- Sessions are an httpOnly, `sameSite=lax` JWT cookie - never readable from
  JS, so an XSS payload can't exfiltrate it. `secure` is enabled automatically
  in production.
- Tenant (`clinicId`) isolation and role-based authorization are enforced
  server-side (`authenticate` + `authorize` middleware), derived only from
  the verified session - a client-supplied `clinicId` is never trusted or
  even accepted as input.
- A disabled user's session stops working immediately (re-checked on every
  request), not just at token expiry.
- `/auth/login` and `/auth/register-clinic` are rate-limited.
- Login/logout/staff-created/staff-disabled events are written to an
  append-only audit log.
- Centralized error handler never leaks stack traces, DB details, or
  filesystem paths in production responses.
- Uploaded files are validated by both MIME type AND extension (PDF/JPG/
  PNG only, 10MB max) - checking either alone is spoofable, since a
  browser's declared Content-Type just echoes the file's own claimed
  extension. Stored in Cloudinary via its `authenticated` delivery type
  (never a permanent public URL - the API hands out a fresh signed,
  time-limited URL on each view), not in MongoDB.
- `app.set('trust proxy', 1)` in production (Phase 10 fix) - every
  deployment target above sits behind a reverse proxy/load balancer.
  Without it, `req.ip` resolves to the proxy's own address for every
  request, silently recording the wrong actor on every audit log entry and
  collapsing the login rate limiter into one shared bucket for everyone
  behind that proxy. Trusting exactly one hop reads the real client IP from
  `X-Forwarded-For` without blindly trusting an arbitrary spoofable chain.
- **Two unauthenticated routes exist, and only two** (Phase 11):
  `GET /api/v1/public/clinics/:slug/queue` and
  `/api/v1/whatsapp/webhook`. Both are rate-limited. The public queue
  derives its tenant from a validated `:slug` (never from request input)
  and returns a strict field allow-list; the webhook verifies Meta's
  `X-Hub-Signature-256` against `WHATSAPP_APP_SECRET` before trusting a
  payload, and refuses outright in production if that secret is unset.
  Both route files carry a header comment spelling out what a new route
  added there would be signing up for.
- An unknown clinic slug and a deactivated clinic return the identical
  generic 404 - the public endpoint is enumerable, so it must not confirm
  which clinic names exist.
- WhatsApp access tokens and the app secret are server-side only, never
  `VITE_`-prefixed, so they cannot reach the browser bundle. The Settings
  UI deliberately offers no Meta credential fields, because clinics cannot
  self-configure them in this design.
- Every form control has a real `<label htmlFor>`/`id` association (Phase
  10 fix) - a systemic gap across most forms until caught while writing
  the frontend test suite's accessible-query-based tests. Matters for
  actual screen-reader users, not just test ergonomics.

## Known limitations

This is an early-stage MVP build. As of Phase 11:

- **The WhatsApp integration has never sent a real message.** There is no
  Meta Business account, no verified number, no access token and no
  approved template in this environment, so every test exercises a mocked
  Graph API client (`whatsappClient`, stubbed the same way
  `cloudinaryClient` is). The request shape follows Meta's documented
  template-message format, but it has not been validated against the real
  API, and template approval is the most likely thing to bite first.
- No retry on a failed WhatsApp send. A failure is recorded as a `FAILED`
  `WhatsappMessage` row and that is the end of it - no backoff, no dead
  letter queue, no BullMQ/Redis worker. That is a deliberate v1 call; a
  real job queue is the natural v2 once volume justifies the operational
  cost.
- Only the patient whose own queue position changed is messaged, not the
  whole waiting room each time the "now serving" token ticks. That reading
  keeps the blast radius at one message per patient per transition, but it
  does mean a patient watching for *someone else's* turn gets nothing.
- WhatsApp messages carry no prescription/receipt PDF link. Both PDF routes
  sit behind `authenticate`, and Cloudinary's signed URLs cover only
  *uploaded* patient documents, not these server-generated PDFs - so there
  is no short-lived public link mechanism to reuse, and the message says
  "collect it from the front desk" instead. Building a signed public
  document link is its own piece of work.
- Receipt notifications fire only when an invoice becomes fully `PAID`,
  not on each partial payment - "your receipt is ready" is untrue while a
  balance is outstanding. A deliberate narrowing of the spec.
- Dates and times inside message text render in `WHATSAPP_DISPLAY_TIMEZONE`
  (default `Asia/Kolkata`), which is a display-only stopgap sitting beside
  the UTC day-bucketing used everywhere else. Sending a patient a UTC time
  would be plainly wrong; the real fix is a clinic-level timezone field,
  which would also fix the bucketing below.
- Patient phone numbers are free-form (`min(6)`), so matching an inbound
  webhook number back to a patient is best-effort: candidate forms plus a
  separator-tolerant regex, then an exact last-10-digit comparison in JS.
  An unusually formatted number could fail to match, which would mean a
  `STOP` reply not registering. E.164 validation at patient-registration
  time would remove the guesswork.
- A `STOP` reply opts the person out across every clinic that has them as
  a patient, not just the one that messaged them. That is the safer
  reading of a compliance signal, but it does mean one clinic's message can
  end another clinic's messaging.
- The day-before reminder sweep is an in-process `node-cron` timer in the
  API server. Two API instances would send every reminder twice; it needs
  a leader election or an external scheduler before horizontal scaling.
- The public queue's `estimatedWaitMinutes` is deliberately naive - waiting
  count x the clinic's default slot length. It ignores per-appointment
  duration, how far into the current consultation we are, and doctors
  working in parallel, so it over-estimates for a multi-doctor clinic. The
  response carries `isEstimate: true` and the UI labels it as a guess.
- Clinic slugs are globally unique, so two clinics with the same name get
  a random 4-character suffix (`sharma-clinic-k3f9`). There is no UI to
  choose or change a slug, and changing one would break any printed QR
  code or poster already pointing at the old URL.
- `Clinic.slug` is `required`, so clinics created before Phase 11 must be
  backfilled with `server/scripts/backfill-clinic-slugs.js` before they can
  be re-saved. Not run automatically on boot, by design.

Carried over from Phase 10:

- **Cloudinary isn't actually configured in this environment** (no real
  account/credentials) - document upload is fully wired end-to-end
  (multipart handling, file-type/size validation, patient lookup, the
  Cloudinary SDK call itself, error handling) and unit-tested with a
  mocked Cloudinary client, but was never exercised against a real
  Cloudinary account. Fill in `CLOUDINARY_*` in `.env` to actually use it.
- No cross-patient "Follow-ups Due" list view yet (Module 12) - follow-up
  date/instructions live on the consultation and surface on the doctor/
  admin dashboards, but there's no dedicated list page.
- Document types are freetext (with suggestions), not a strict enum -
  matches the spec's examples being non-exhaustive.
- No document preview/thumbnail - "View" opens the signed URL in a new
  tab and lets the browser's native PDF/image viewer handle it.
- The global Documents page is read-only (view/delete) - uploads only
  happen from a patient's profile, where the patient context is already
  established.
- Dashboard/report day-buckets are UTC, same as appointments (see below) -
  a "today" figure can be off by a few hours right around midnight in
  non-UTC timezones.
- No delta/trend indicators on dashboard stat tiles (e.g. "+12% vs
  yesterday") - just the current value, to keep the aggregation queries
  simple for the MVP; the dataviz method supports them if added later.
- CSV export is a client-side blob download of whatever's already
  rendered (no dedicated backend export endpoint) - "where practical" per
  the spec, and the data's already fetched for the chart either way.
- Reports date filters are a single from/to range shared across all three
  report tabs, not independently adjustable per tab.
- Clinic Settings now exists (name, address, contact phone, default
  consultation fee, working hours - Owner-only) - but it doesn't include a
  configurable tax rate. "Tax if configured" in the spec implies that; for
  now, tax on an invoice stays a flat amount entered per-bill, same as
  discount.
- Refund is a status flag, not a real reversing-ledger entry - it doesn't
  reduce `amountPaid` or touch individual payment records. A proper
  partial-refund/credit-note flow is exactly the accounting-ERP complexity
  the spec says to skip for the MVP.
- An invoice's line items/discount/tax are locked as soon as any payment
  is recorded (to protect the historical record a payment was made
  against) - there's no "add an item after partial payment" flow yet.
- No UI to link an invoice to the appointment/consultation it came from
  (the API supports it) - receptionists, who create invoices, don't have
  access to consultation detail pages to begin with.
- Prescription PDFs omit the clinic logo, doctor qualification/registration
  number, and a signature image - none of that data exists yet (Clinic
  logo upload, a richer DoctorProfile, and file uploads are all later
  modules), so the PDF only prints what's actually on file rather than
  fabricating placeholders for them.
- A prescription with no medicines can't be finalized (`NO_MEDICINES`),
  but there's no server-side check that a doctor didn't leave a nonsense
  freetext dosage/frequency - this is administrative documentation
  software, not a clinical safety net, per the spec's own framing.
- Consultation notes/diagnosis are visible only to admin/doctor (not
  receptionist or nurse) - a deliberate reading of "don't expose medical
  notes to receptionists"; nurses may need narrower access to vitals only
  once that's explicitly configurable.
- A consultation locks (no more edits) once its linked appointment is
  marked COMPLETED; one with no linked appointment (a manually-created
  consultation not tied to a booking) has no such lock yet.
- Follow-up date/instructions are captured on the consultation itself, but
  there's no cross-patient "Follow-ups Due" list view yet (Module 12) -
  not part of this phase's roadmap slot.
- No Staff management UI yet (`/staff` page doesn't exist) - creating
  doctors/receptionists/nurses is API-only (`POST /api/v1/users`) for now.
- No calendar/grid view for appointments - only the List view (with
  Today/Tomorrow/Upcoming filters) from the spec's "Calendar view, List
  view" requirement; a visual calendar is a reasonable later addition.
- No doctor working-hours/holiday scheduling yet - double-booking
  *is* prevented (same-doctor time-range overlap check), but nothing stops
  booking outside a doctor's actual hours since those aren't modeled yet.
- Appointment day boundaries are computed in UTC, not the clinic's local
  timezone - fine for a single-timezone deployment, would need a
  clinic-level timezone setting otherwise.
- No patient search beyond simple case-insensitive substring/prefix
  matching (no fuzzy search) - fine at small-clinic scale, would need a
  text index or search service at larger scale.
- No patient disable/soft-delete yet (only staff can be disabled so far).
- No password reset flow yet (marked "if feasible" in the spec).
- No `DoctorProfile` (qualification, specialization, fee, availability) -
  `User.role === 'doctor'` exists, but the richer profile fields come with
  a dedicated Staff & Doctors pass.
- A person can only belong to one clinic (email is globally unique, not
  per-clinic) - fine for the MVP, would need rework for a multi-clinic user.
- `npm audit` flags moderate issues in `react-router` (open-redirect CVE)
  and `esbuild`/`vite` (dev-server only) - fixes require major version
  bumps; deferred until more of the app can be regression-tested. Adding
  `puppeteer` (Phase 10, root devDependency, E2E-only) pulled in a high
  advisory too: `extract-zip` (used by `@puppeteer/browsers` to unpack the
  Chromium download) has an unvalidated-symlink-path-traversal issue with
  no fixed version published for any release. It only ever extracts
  Puppeteer's own pinned Chromium build from Google's CDN during install,
  never an untrusted archive, so the realistic risk here is low - flagged
  for visibility, not treated as blocking.
- Every page behind the authenticated app shell is route-based
  code-split (`React.lazy` + `Suspense`, Phase 10) - Reports (the heaviest,
  via Recharts) now ships as its own ~420KB chunk that only admins loading
  that page ever fetch, down from one >1.2MB chunk everyone paid for on
  first load. The main chunk (~615KB: React/Router/Query/Hook Form/Zod/
  Cloudinary and icon libs) is still over Vite's 500KB warning threshold -
  a further vendor-chunk split is possible but not done for this MVP.

## Roadmap

See the build spec's phased plan: Phase 1 (foundation) → Phase 2 (auth) →
Phase 3 (patients) → Phase 4 (appointments & OPD queue) → Phase 5
(consultations) → Phase 6 (prescriptions) → Phase 7 (billing) → Phase 8
(dashboard & reports) → Phase 9 (documents & audit logs) → Phase 10
(testing/security/polish) → Phase 11 (this milestone: public queue view +
WhatsApp Cloud API notifications).

Phase 11: a clinic `slug` and a no-login `/q/:slug` waiting-room queue
page, and WhatsApp notifications on five triggers (booking confirmed,
marked arrived, called in, prescription finalized, invoice settled) plus a
day-before reminder sweep, with delivery-status and `STOP` opt-out
handling via Meta's webhook. Phase 10's "final phase, no new modules"
note is superseded.

Natural next steps, deliberately not in this phase: a signed public
document-link mechanism (so `document_ready` can carry a real PDF link), a
background job queue with retries for failed sends, and a clinic-level
timezone field to replace both the UTC day-bucketing and the
display-only `WHATSAPP_DISPLAY_TIMEZONE` stopgap.

Phase 10 so far: a frontend test suite (Vitest + RTL, 14 tests covering
the spec's five called-out flows), a repo-wide accessibility fix (every
form label now has a real `htmlFor`/`id` association), a manual security
review pass (see [Security notes](#security-notes)), route-based
code-splitting, and a full acceptance-workflow E2E script (written, not
yet verified - see [Testing](#testing)).

## API overview

```text
POST /api/v1/auth/register-clinic   create a clinic + its first admin
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me

GET  /api/v1/users                   any authenticated user: list this clinic's staff (e.g. to pick a doctor)
POST /api/v1/users                   admin: create a staff member (doctor/receptionist/nurse)
PATCH /api/v1/users/:id/active       admin: enable/disable a staff member

POST /api/v1/patients                admin/receptionist: register a patient (auto-generates P-10001 etc.)
GET  /api/v1/patients                search (?search=) + paginate (?page=&limit=)
GET  /api/v1/patients/:id
PATCH /api/v1/patients/:id           admin/receptionist/nurse: update a patient

POST /api/v1/appointments            admin/receptionist: book (or walk-in) an appointment
GET  /api/v1/appointments            filter by ?date=/?from=/?to=/?doctorId=/?patientId=/?status=, paginated
GET  /api/v1/appointments/:id
PATCH /api/v1/appointments/:id       admin/receptionist: reschedule
POST /api/v1/appointments/:id/arrive     admin/receptionist: BOOKED -> WAITING
POST /api/v1/appointments/:id/cancel     admin/receptionist
POST /api/v1/appointments/:id/no-show    admin/receptionist
POST /api/v1/appointments/:id/call       admin/doctor: WAITING -> IN_CONSULTATION ("Next Patient")
POST /api/v1/appointments/:id/complete   admin/doctor: IN_CONSULTATION -> COMPLETED
POST /api/v1/appointments/:id/skip       admin/doctor: deprioritize in the queue, still callable
GET  /api/v1/appointments/queue      today's (or ?date=) WAITING/IN_CONSULTATION list, ordered by token

POST /api/v1/consultations           admin/doctor: save a consultation (chief complaint, vitals, diagnosis, follow-up)
GET  /api/v1/consultations           filter by ?patientId=/?doctorId=/?appointmentId=, paginated - admin/doctor only
GET  /api/v1/consultations/:id       admin/doctor only
PATCH /api/v1/consultations/:id      admin/doctor: edit - blocked once the linked appointment is COMPLETED

POST /api/v1/prescriptions           admin/doctor: save a prescription (multiple medicines, tied to a consultation)
GET  /api/v1/prescriptions           filter by ?patientId=/?doctorId=/?consultationId=, paginated - admin/doctor only
GET  /api/v1/prescriptions/:id       admin/doctor only
GET  /api/v1/prescriptions/:id/pdf   streams a printable/downloadable PDF - admin/doctor only
PATCH /api/v1/prescriptions/:id      admin/doctor: edit - blocked once finalized
POST /api/v1/prescriptions/:id/finalize   admin/doctor: locks the prescription as the historical record

POST /api/v1/invoices                admin/receptionist: create an invoice (total is always server-computed)
GET  /api/v1/invoices                filter by ?patientId=/?status=/?from=/?to=, paginated
GET  /api/v1/invoices/:id
GET  /api/v1/invoices/:id/receipt/pdf   streams a printable/downloadable receipt PDF
PATCH /api/v1/invoices/:id           edit line items/discount/tax - blocked once any payment is recorded
POST /api/v1/invoices/:id/payments   record a payment (CASH/UPI/CARD/ONLINE/OTHER) - rejected if it exceeds the balance
GET  /api/v1/invoices/:id/payments   payment history for one invoice
POST /api/v1/invoices/:id/refund     marks the invoice REFUNDED (a status flag, not a reversing ledger entry)

GET  /api/v1/dashboard                role-aware summary - shape depends on req.user.role (revenue etc. admin-only)

GET  /api/v1/reports/patients         admin only: total/new/returning + new-patients-by-day, ?from=&to=
GET  /api/v1/reports/appointments     admin only: total/completed/cancelled/no-show + by-doctor, ?from=&to=&doctorId=
GET  /api/v1/reports/revenue          admin only: total/series/by-method/by-doctor, ?from=&to=&groupBy=day|week|month

POST /api/v1/documents               admin/doctor: upload a patient document (multipart: file + patientId + documentType)
GET  /api/v1/documents                filter by ?patientId=, admin/doctor only
GET  /api/v1/documents/:id/url        a fresh signed, time-limited Cloudinary URL - never a permanent public link
DELETE /api/v1/documents/:id          removes both the Cloudinary asset and the database record

GET  /api/v1/audit-logs               admin only: filter by ?userId=/?action=/?resourceType=/?from=&to=, paginated

GET  /api/v1/clinics/settings         any authenticated user: this clinic's settings
PATCH /api/v1/clinics/settings        owner only: update name/address/phone/fee/hours/whatsappEnabled

GET  /api/v1/public/clinics/:slug/queue   NO AUTH: masked live queue for the waiting-room page, rate-limited
GET  /api/v1/whatsapp/webhook             NO AUTH: Meta's subscription handshake
POST /api/v1/whatsapp/webhook             NO AUTH: delivery receipts + inbound replies, signature-verified

GET  /api/v1/health
```

Only the two routes marked `NO AUTH` above skip `authenticate` - see
[Security notes](#security-notes) for what compensates for that.
