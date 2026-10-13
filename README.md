# Clinix

A multi-tenant SaaS CRM/clinic-management app for small (1-5 doctor) clinics
and OPDs: patients, appointments, OPD queue, consultations, prescriptions,
and billing, in one screen.

> **For clinics:** [`docs/USER_GUIDE.md`](./docs/USER_GUIDE.md) is the
> plain-language guide to show customers - every feature, the five roles, and
> who can do what. It is kept in step with the app (see `CLAUDE.md`); this
> README is the technical reference.

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
>
> The whole app works at phone width (checked at 375px) as well as on
> desktop - see [Responsive layout](#responsive-layout).

## Tech stack

- **Frontend:** React + Vite (JavaScript, no TypeScript) + Tailwind CSS +
  React Router + TanStack Query + React Hook Form + Zod + Lucide icons +
  Recharts + write-excel-file (report export)
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
- In production on Render the server also serves the built client
  (`SERVE_CLIENT=true`), so app and API share one origin - see
  [Production Deployment](#production-deployment).
- Single `.env` at the repo root, shared by both (see below).

## Responsive layout

Every screen is meant to work on a phone as well as a desktop, and any UI
change should keep it that way. The rules the current pages follow:

- **Clinic identity:** the clinic's logo and name sit at the top of the
  sidebar, and move into the header beside the menu button on phones (see
  [Clinic branding](#clinic-branding)).
- **Navigation:** from `md` (768px) up, the sidebar is always visible.
  Below that it is hidden and a menu button in the header opens the same
  role-filtered links as a slide-in drawer (`layouts/Sidebar.jsx`), which
  closes on a link tap, a tap outside it, the close button or Escape.
- **No sideways scrolling.** Below `lg` (1024px) every data table turns
  each row into a card: the main item (patient, invoice number, staff
  name) as the card title, the status badge in the top-right corner, the
  other columns as small "label / value" pairs two to a row (three from
  `sm`), and the row's buttons along the bottom, wrapping when needed.
  From `lg` up it's the normal table. It's one CSS rule set, `.stack-table`
  in `client/src/index.css`: put the class on the `<table>` and give each
  `<td>` a `data-label` (the column name) or a `data-cell` role (`title`,
  `badge`, `wide`, `actions`, `end`); the comment there explains each.
  Any new table should do the same. The breakpoint is `lg`, not `md`,
  because between 768 and 1023px the sidebar leaves too little room for a
  five- or six-column table. A card's title link covers the whole card, so
  tapping anywhere on it opens the record (its buttons stay on top).
  From `lg` up, cells that can't wrap (long IPs in the audit log) are
  allowed to break, so the table still fits at 1024px.
- **Tap targets** are at least 24x24px (the WCAG 2.2 minimum): small text
  buttons (Profile, Disable, Reset password, Remove medicine) have extra
  padding, the invoice line-item delete icon has a 30px hit area, and each
  working-hours day switch is a full-height row.
- **One scroll area.** The signed-in app scrolls inside `<main>` (the
  header stays put). `<main>` is `relative`, so visually hidden inputs
  (`sr-only`, which are `position: absolute`) stay inside it - without
  that, the working-hours switches on Settings stretched the page itself
  and phones got a second, empty scroll below the app.
- **Lists with actions** (the OPD queue) use `flex-wrap`, so the buttons
  drop to a second line rather than being clipped at the screen edge.
- **Invoice line items** use the same cards: description on its own row,
  then quantity and unit price, then the amount with the remove button at
  the right. The wrapping `<fieldset>` has `min-w-0` - a fieldset
  otherwise refuses to shrink below its content.
- **Settings - working hours:** one row per day with an on/off switch.
  Open days show both times side by side (on their own line on a phone);
  closed days show a "Closed" tag instead of greyed-out inputs. Each time
  input has an accessible label ("Monday opening time"), and native time
  pickers get `color-scheme: dark` in dark mode so their icons stay visible.
- **Tabs** wrap onto a second line instead of scrolling sideways: pill
  buttons on phones, the usual underlined tabs from `md` up (the patient
  profile has eight).
- **Prescription form:** the medicine name gets a full row on phones
  (names like "Amoxicillin-Clavulanic acid 625mg" are long); the other
  six fields sit two to a row.
- **Smaller pieces:** paired date/time fields stack
  below `sm` (640px), page title rows wrap, and page padding drops from
  `p-6` to `p-4` on phones.

All of it uses Tailwind breakpoint variants (`sm:`, `md:`, `max-md:`), so
desktop layouts are unchanged. Verified with headless-Chrome screenshots of
every page at 375px and 1280px against seeded demo data, plus a check that
no element sticks out past the right edge of the screen. The sideways-scroll
pass was checked in Playwright on all 22 pages (clinic app and platform
panel, demo data) at 375, 768, 1024 and 1280px: no page and no scroll box
inside a page is wider than the screen.

A full mobile audit (Playwright, phone emulation with touch) then went
through 68 screens at 320, 360, 375 and 390px: every page, every patient
profile and report tab, every dialog (walk-in, reschedule, cancel,
generate bill, record payment, finalize, new staff, doctor profile,
change password, suspend clinic, reset password), the phone menu drawer
and account menu, form error states, the public pages, and the owner,
doctor, receptionist and platform-admin views. On each it checked: page
wider than the screen, anything sticking out past the edge or cut off,
sideways-scrolling boxes, the page growing taller than the app frame,
text under 11px, tap targets under 24x24px, and the viewport meta tag.
All 68 pass (the only flags left are the hidden file inputs behind the
"Upload logo"/"Upload signature" buttons, which are meant to be hidden). See
[Known limitations](#known-limitations) for what that pass did not cover.

### iPhone (Safari)

Safari on iOS has quirks a width check alone doesn't catch, handled in
`client/src/index.css` and a few components:

- **Screen height:** `100vh` on iPhone includes the area behind Safari's
  toolbar, so a full-height layout's bottom is cut off. Where the browser
  supports `dvh`, `h-screen` / `min-h-screen` use `100dvh` (the height
  actually visible); older iOS keeps `100vh`.
- **No zoom when typing:** iOS zooms the page in when a field with text under
  16px is focused. Form fields are 14px in the design, so on iOS only
  (`@supports (-webkit-touch-callout: none)`) they render at 16px - Android
  and desktop are unchanged. The same block keeps empty date/time fields
  from collapsing and left-aligns their value.
- **Header on phones:** below `sm` (640px) the light/dark/system switch moves
  from the header into the account menu, which also shows the signed-in
  name and role (the header button is icon-only there). This leaves room for
  the clinic's name even on a 320px iPhone SE. On every screen size the
  account menu closes on a tap or click outside it, on Escape (focus returns
  to the account button) and on a page change - not only via its button.
- **Date range filter** (Reports, Audit Logs): on phones the presets read
  "7 days / 30 days / 90 days" and split the row, and both dates share one
  row - full-length they don't fit 320px.
- **Tap targets:** the theme buttons are 32px on phones (28px on desktop).

Verified in **WebKit (Safari's engine)** with Playwright's iPhone profiles -
iPhone SE (320px), 13 mini (375px), 14 (390px), 14 Pro Max (430px) and
iPhone 14 landscape - against the production build served by Express: every
page, the open menu and the account menu, checking that nothing runs off the
screen, no field is under 16px, and the console has no errors. The iOS-only
CSS was injected for that run, since desktop WebKit doesn't identify as iOS.
Not yet tried on a physical iPhone.

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
| `WHATSAPP_DEFAULT_COUNTRY_CODE` | Prepended to bare national numbers when converting to E.164. Defaults to `91`. |
| `WHATSAPP_REMINDER_HOUR` | Hour (0-23) on **each clinic's own clock** when day-before reminders go out. Defaults to `18`. The job ticks hourly and handles the clinics whose local time is on that hour, so the server's time zone doesn't matter. |
| `PUBLIC_APP_URL` | Frontend base URL, used to build the `/q/<slug>` link inside messages. Falls back to the first `CORS_ORIGIN`. |

Keep-alive for Render's free plan (server-side only) - see
[Things to know](#things-to-know):

| Variable | Purpose |
|---|---|
| `KEEP_ALIVE_ENABLED` | Only the exact string `true` starts the self-ping of `GET /api/v1/keep-alive`. Off locally; `render.yaml` turns it on for the free plan. |
| `KEEP_ALIVE_URL` | What to ping. Defaults to `<RENDER_EXTERNAL_URL>/api/v1/keep-alive` on Render. |
| `KEEP_ALIVE_INTERVAL_MINUTES` | Minutes between pings. Defaults to `13`; kept between 1 and 14 (Render sleeps after 15). |

Email notifications via **Brevo** (server-side only) - see
[Email notifications](#email-notifications):

| Variable | Purpose |
|---|---|
| `EMAIL_ENABLED` | Global kill switch, like `WHATSAPP_ENABLED`: only the exact string `true` sends anything. |
| `BREVO_API_KEY` | Brevo transactional email API key (`xkeysib-...`). |
| `EMAIL_FROM_ADDRESS` | The "From" address; must be a sender or domain verified in Brevo. |
| `EMAIL_FROM_NAME` | Shown after the clinic's name in the From line ("Sunrise Family Clinic via Clinix"). Defaults to `Clinix`. |
| `BREVO_API_BASE_URL` | Optional; defaults to `https://api.brevo.com/v3`. |

The older `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASSWORD`
(SMTP) entries in `.env.example` are not used by any code.

## MongoDB setup

Point `MONGODB_URI` at a local `mongod` or a MongoDB Atlas connection
string. No manual schema setup needed - Mongoose creates collections/indexes
on first use. To load a demo clinic with sample data, see
[Demo credentials](#demo-credentials).

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
npm run test:server    # backend tests (Jest + Supertest) - 260 tests, 23 suites (~6 min: each suite starts an in-memory MongoDB)
npm run test:client    # frontend tests (Vitest + React Testing Library) - 110 tests, 20 files
npm run test:e2e       # full acceptance-workflow E2E (see below)
```

`test:e2e` (`e2e/acceptance.mjs`) drives the real client + server through
one continuous run tying every phase together: clinic/admin signup, a
staff account, patient registration, appointment booking, the OPD queue,
a consultation that leads straight to its prescription (incl. finalizing
it), the completed visit billed from "Ready to bill" + a payment,
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

**Recommended: one Render web service** that serves both the API and the
built React app from the same origin, defined in [`render.yaml`](./render.yaml)
(a Render Blueprint). One URL, one deploy, no CORS to configure, and the
login cookie is first-party (`SameSite=Lax`) - so it still works in
browsers that block third-party cookies, such as Safari. A split
Vercel + Render setup is still supported, see
[the alternative below](#alternative-frontend-on-vercel-api-on-render).

### 1. Database - MongoDB Atlas

1. Create a cluster and a database user (username/password).
2. Network access: allow Render's outbound traffic - `0.0.0.0/0` is
   simplest (Atlas still requires the correct username/password); use
   Render's static outbound IPs instead if you've enabled that add-on.
3. Copy the connection string - this is `MONGODB_URI` below. Use a
   database dedicated to production, not the one you develop against.

### 2. Deploy the Blueprint

1. Push this repo to GitHub (Render deploys from the repo, so
   `render.yaml` must be committed).
2. Render dashboard → **New → Blueprint** → pick the repo.
3. Render prompts for the values marked `sync: false`:

   | Variable | Value |
   |---|---|
   | `MONGODB_URI` | The Atlas connection string from step 1. **Required** - the app refuses to boot in production without it. |
   | `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | From your Cloudinary dashboard. Needed for patient documents and clinic logos. |

4. **Apply.** Render then builds and starts the service. Everything else
   is already set by `render.yaml`:

   | Setting | Value | Why |
   |---|---|---|
   | Build | `npm ci --include=dev && npm run build && npm prune --omit=dev` | `NODE_ENV=production` makes `npm ci` skip devDependencies, but Vite and Tailwind (client devDependencies) are needed to build - so include them, build `client/dist`, then prune. |
   | Start | `npm run start --workspace server` | `node src/server.js` |
   | Health check | `/api/v1/health` | Render waits for it before switching traffic. |
   | `NODE_VERSION` | `20` | |
   | `NODE_ENV` | `production` | Secure cookies, trust proxy, generic error messages. |
   | `SERVE_CLIENT` | `true` | Express serves `client/dist` (see below). |
   | `JWT_SECRET` | generated by Render | |
   | `PUPPETEER_SKIP_DOWNLOAD` | `true` | Puppeteer is only for the E2E script; skips a ~170MB Chrome download on every build. |
   | `WHATSAPP_ENABLED` | `false` | Until Meta is set up - see [WhatsApp setup](#whatsapp-setup). |
   | `KEEP_ALIVE_ENABLED` | `true` | Self-ping so the free instance never sleeps - see [Things to know](#things-to-know). |

   `PORT`, `CORS_ORIGIN` and `PUBLIC_APP_URL` are not set: Render injects
   `PORT`, and the other two fall back to `RENDER_EXTERNAL_URL` (the
   service's own `https://<name>.onrender.com` address, set by Render).

What `SERVE_CLIENT=true` does (`server/src/middleware/serveClient.js`):
API routes are mounted first and always win; `/assets/*` (content-hashed
by Vite) is cached for a year; every other path returns `index.html`
uncached, so refreshing on `/patients/123` works. The Content-Security-
Policy allows Cloudinary images and the inline theme script in
`index.html` by its SHA-256 hash (computed from the built file at boot),
not `'unsafe-inline'`. A missing `client/dist` stops the server at boot
with a clear message rather than failing on the first request.

### 3. Smoke test

Open the `onrender.com` URL, register a clinic, and check: you land on the
dashboard, refreshing a deep link such as `/patients` still loads, a PDF
opens, and the browser console shows no CSP errors. Then upload a clinic
logo once to confirm Cloudinary is wired.

This exact flow was rehearsed before this setup was committed: a clean
copy of the repo (no `.env`), built and started with the Blueprint's
commands in a `node:20` container with `NODE_ENV=production`, then driven
in headless Chrome (register, cookie flags, deep-link refresh, a
same-origin API write, the theme script under the CSP, the public queue
logged out). Nothing was deployed to Render itself.

### Things to know

- **Free plan:** the instance sleeps after ~15 minutes without traffic
  (the next request takes ~30-60s), and the in-process reminder cron does
  not run while asleep. **Keep-alive** prevents that: with
  `KEEP_ALIVE_ENABLED=true` (set in `render.yaml`) the server calls its own
  `GET /api/v1/keep-alive` - through its public `RENDER_EXTERNAL_URL`, so
  Render counts it as traffic - every 13 minutes
  (`server/src/jobs/keepAlive.job.js`). The endpoint does no database work,
  needs no login, and isn't written to the request log. An outside monitor
  (UptimeRobot, cron-job.org) pinging that URL every 5-10 minutes does the
  same without the self-ping. Two caveats: an always-awake free instance
  uses ~744 of the workspace's 750 free instance-hours a month, so this
  only works for **one** free service; and if the instance is ever stopped
  (a deploy, a crash), the self-ping stops with it until the next request
  wakes it - an outside monitor doesn't have that gap. Use a paid instance
  for a clinic in daily use, and set `KEEP_ALIVE_ENABLED=false` there.
- **Seed script:** `npm run seed` refuses to run with `NODE_ENV=production`
  by design - production starts empty; register the first clinic in the UI.
- **Custom domain:** add it in Render, then set `CORS_ORIGIN` and
  `PUBLIC_APP_URL` to it (the fallback only knows the `onrender.com` URL).
- **One instance:** the reminder cron and the PDF logo cache live in the
  server process; see [Known limitations](#known-limitations) before
  scaling to more than one instance.

### Alternative: frontend on Vercel, API on Render

The committed `vercel.json` still builds the client for Vercel. In that
setup:

- **Render** (web service, root directory `server`, build `npm install`,
  start `npm start`): `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`,
  `CLOUDINARY_*`, `CORS_ORIGIN` = the exact Vercel URL. Leave
  `SERVE_CLIENT` unset.
- **Vercel** (repo root): `VITE_API_URL` = `<Render URL>/api/v1`, baked in
  at build time, so changing it means redeploying.
- Deploy the API first with a placeholder `CORS_ORIGIN`, then Vercel, then
  set the real `CORS_ORIGIN`. Every API call is cross-site here, so the auth
  cookie is `SameSite=None; Secure` (`server/src/utils/jwt.js`) - which
  browsers that block third-party cookies may refuse. If login seems to
  succeed but the next request looks logged out, check `CORS_ORIGIN`
  matches the Vercel URL exactly, then the browser's cookie settings.

## Reports

Owner/admin only. One date range (7/30/90-day presets or any from-to) drives
three tabs:

- **Patients** - total, new and returning patients, and a bar chart of new
  patients per day.
- **Appointments** - totals by status, then two ranked lists: by status
  (with each status's share of all appointments) and by doctor.
- **Revenue** - total and daily average, revenue over time (Daily / Weekly /
  Monthly, chosen in the chart's own header), then ranked lists by payment
  method and by doctor (payments on invoices linked to a doctor). Every
  revenue figure is **payments minus refunds** - see [Refunds](#refunds).

How the charts are drawn (`client/src/pages/Reports.jsx`):

- **Every period is shown.** The API only returns days/weeks/months that
  had data; `fillSeries()` (`client/src/utils/reportSeries.js`) fills the
  rest with 0, so a closed day shows as a dip instead of the line jumping
  over it. Week keys match MongoDB's ISO `%G-W%V`.
- **Nothing is cut off on a phone.** "By status/doctor/payment method" are
  plain HTML bar lists rather than SVG charts, so a long doctor name wraps
  instead of being clipped by the axis, and the amount sits in its own
  column. Time charts thin their date ticks so they never overlap, use
  short labels ("12 Oct"; the tooltip shows the full date) and compact
  axis amounts ("₹45K").
- Two cards per row on desktop (`lg`), one on phones.

**Export Excel** downloads a real `.xlsx` file (`client/src/utils/spreadsheet.js`,
using `write-excel-file`, loaded only on click). It replaced CSV because a CSV
can't set column widths: Excel opened every date column too narrow and showed
`#####`. Each column now has a width, dates are real Excel dates
(`dd mmm yyyy`, or `mmm yyyy` when grouped by month, "Week starting" when
weekly), amounts are numbers formatted `₹#,##0`, and the status export has
each share as a percentage. Every period in the range gets a row (zeros
included), matching the chart.

Verified in WebKit (iPhone SE, iPhone 14, desktop Safari) against the
production build with 90 days of data, long doctor names and six-figure
amounts: no chart text outside its chart, no overlapping axis labels, no
sideways scrolling; the downloaded files' totals match the screen.

### Refunds

**Refund** on a bill (owner/admin/receptionist) gives back everything paid on
it, in one go, as of today. The bill's status becomes **Refunded**, and the
bill page shows a "Refunded −₹…" line under its payments, with the date.

- **Recorded, not just flagged.** Each payment on the bill gets a matching
  `Refund` record (`server/src/models/Refund.js`) with the same amount and
  method, dated when the refund was made. The payments themselves are left
  as they were; the bill keeps `amountPaid` and gains `refundedAt` and
  `refundedAmount`.
- **Counted on the day it happens.** Revenue in Reports, on the Dashboard
  ("today's revenue") and in the Excel export is payments by the day they
  were paid, minus refunds by the day they were refunded
  (`revenueEntriesPipeline` in `server/src/services/report.service.js`). So
  a bill paid last week and refunded today lowers today's figure, and last
  week's figures stay as they were - the way a cash book shows it. A day,
  week or payment method can therefore come out negative (shown as
  "−₹500", with no bar).
- **By method and by doctor net out too.** The refund goes back off the
  method each payment used (cash off cash, UPI off UPI) and off the bill's
  doctor. A method or doctor whose takings were all refunded in the range
  drops out of the list rather than showing ₹0.
- **Once only.** A bill can be refunded once, and two clicks at the same
  moment still record a single refund. There are no partial refunds.

**Bills refunded before this existed** only had the status flag, so their
money still counts as revenue until they are backfilled - once per
database, by hand:

```bash
node server/scripts/backfill-refunds.js --dry-run   # list what it would fix
node server/scripts/backfill-refunds.js             # apply
```

It uses `MONGODB_URI` (the root `.env` unless set on the command line) and
prints the database first. Those old refunds had no date, so it dates them
at the bill's last update - which was the refund, since a refunded bill
can't be changed. It only adds what's missing, so re-running it is safe.

## Logo, icons and SEO

The Clinix mark (a "C" with a medical plus) is `client/public/favicon.svg`;
`client/src/components/ClinixLogo.jsx` draws the same thing inside the app
(login, sign-up and the platform panel). Everything in `client/public/` is
served from the site root:

| File | For |
|---|---|
| `favicon.ico` (16/32/48) and `favicon.svg` | Browser tabs, bookmarks, Google's result icon |
| `apple-touch-icon.png` (180, full-bleed) | iPhone/iPad "Add to Home Screen" |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Android / installable app, via `site.webmanifest` |
| `og-image.png` (1200x630) | The preview when a link is shared on WhatsApp, LinkedIn, Facebook or X |

The PNGs and `.ico` were rendered from `favicon.svg` (headless Chromium,
then the three favicon PNGs packed into one `.ico`). If the logo changes,
re-render them from the new SVG.

`client/index.html` carries the title ("Clinix – Clinic & OPD Management
Software"), meta description, theme colour, icon links, manifest and the
Open Graph / Twitter tags. Link previews need full URLs, so a build step
(`siteMeta()` in `client/vite.config.js`) fills them in from
`VITE_SITE_URL`, or from `RENDER_EXTERNAL_URL` on Render, and writes:

- **`robots.txt`** - crawlers may index only `/`, `/login` and
  `/register-clinic` (plus the scripts, styles and icons those pages need);
  everything else is the signed-in app, a clinic's patient queue screen or
  the platform panel.
- **`sitemap.xml`** - the two public pages (only when the site URL is known).

When the API server serves the app (Render), every other page also gets an
`X-Robots-Tag: noindex, nofollow` header (`server/src/middleware/serveClient.js`).

A link that goes nowhere shows a Clinix 404 page (`client/src/pages/NotFound.jsx`):
it names the missing path, offers "Go back" when there is an earlier page,
and its main button goes to the dashboard, the sign-in page or the platform
panel depending on who is looking. Its tab title is "Page not found –
Clinix". The server still answers these paths with 200 (it can't tell which
client routes exist), but the `noindex` header above keeps them out of search
results.

There is no marketing page yet, so the login page is what search results
show. Ranking for searches like "clinic management software" will need a
real landing page (features, pricing) - the next step for SEO.

## Platform admin panel

Clinix's own admin panel, for the people running the product, not for
clinics. It lives at **`/platform`** in the same app, with its own login,
session and accounts.

**Create your account** (there is no signup page, on purpose):

```bash
npm run create-platform-admin --workspace server -- --email you@example.com --name "Your Name"
```

It prints a generated password once; save it. To choose your own instead,
set `PLATFORM_ADMIN_PASSWORD` (8+ characters) for that run. Running it again
for the same email sets a new password and signs that admin out everywhere.
For the Render deploy, run it from your machine with `MONGODB_URI` set to the
Atlas connection string (or from the Render service's Shell, on plans that
have one). Then sign in at `https://<your-app>/platform/login`.

**How the password is made** (`server/scripts/create-platform-admin.js`)

- **Generated (the default):** 12 random bytes from Node's
  `crypto.randomBytes`, written as base64url - a 16-character password of
  letters, digits, `-` and `_`. It is printed once, at the end of the run,
  and never again.
- **Your own:** set `PLATFORM_ADMIN_PASSWORD` for that one run (8+
  characters, or the script stops). It is not printed back.

  ```bash
  PLATFORM_ADMIN_PASSWORD='your-password' npm run create-platform-admin --workspace server -- --email you@example.com --name "Your Name"
  ```

  This leaves the password in your shell history; clear that line afterwards
  (or start the command with a space, if your shell ignores those).
- **Stored as a hash only:** the script hashes it with bcrypt (cost 12,
  `PlatformAdmin.hashPassword`) and saves just the hash in the
  `PlatformAdmin` record. The plain password is never saved anywhere, so
  nobody - including you - can read it back from the database; if it's lost,
  set a new one.
- **Same email again:** the hash is replaced, the admin is re-enabled if it
  was disabled, the name is updated if you pass `--name`, and every existing
  session of that admin is signed out.
- **Which database:** the script uses `MONGODB_URI` - from the root `.env`
  unless you set it on the command line, which wins. It prints
  `Connected to <host>/<database>` first, so check that line to be sure the
  account went where you meant.

**Sign in**

1. Open the platform login page - not the clinic one at `/login`:
   - local: `http://localhost:5173/platform/login` (with `npm run dev` running)
   - production: `https://<your-app>/platform/login`
2. Enter the email you passed to `create-platform-admin` and the password it
   printed (or the one you set with `PLATFORM_ADMIN_PASSWORD`).
3. You land on the Clinics page, with the overview figures at the top.

Things to know:

- The account lives in the database the script ran against. One created
  against your local database won't work on the Render deploy, and the other
  way round - run the script once for each database.
- Clinic logins (owner, doctor, etc.) don't work here, and a platform login
  doesn't work on `/login` - they are separate accounts.
- The session lasts 12 hours, then you sign in again.
- Login is rate-limited to 20 attempts per 15 minutes.
- **Forgot the password?** Run the same `create-platform-admin` command again
  with your email. It sets a new password and signs out your old sessions.
- Never put the password in this README, `.env.example` or any committed
  file - keep it in a password manager.

**What it shows**

- **Overview:** clinics, clinics active in the last 7 days (anyone did
  anything audited), new in the last 30 days, suspended, total patients,
  appointments in the last 30 days.
- **Clinics list:** search by clinic name/URL/phone/email *or* any staff
  member's name or email ("which clinic is drsharma@... in?"), filter
  All/Active/Suspended; owner, staff/patient counts, appointments in the
  last 30 days, last activity, joined date, status.
- **Clinic page:** details, usage counts, staff, the clinic's recent
  activity, and a log of every support action taken on it.

**What it does**

- **Suspend / reactivate a clinic** (a reason is required). While suspended:
  its staff can't log in (they see "This clinic's account is suspended.
  Please contact Clinix support."), anyone already signed in is signed out
  on their next request, the public queue page returns 404, and WhatsApp
  reminders skip it. Nothing is deleted.
- **Reset a staff member's password** - the fix for "I forgot my password"
  until the app can send email. It shows a temporary 12-character password
  **once** (no look-alike characters, so it can be read over the phone),
  signs that person out everywhere, and is never stored or shown again.

**Privacy and security**

- **No patient data.** The panel only ever returns counts - never a
  patient's name, phone, record or anything clinical (a test checks a
  clinic's page for a patient's name, phone and allergies).
- **Separate from clinic logins.** Platform admins are their own collection
  (`PlatformAdmin`), not clinic `User`s. Their cookie
  (`clinix_platform_token`) is scoped to `/api/v1/platform` so the browser
  sends it nowhere else, and the token carries its own audience, so a
  clinic session can't open the panel and a platform session can't call
  the clinic API. Sessions last 12 hours; login is rate-limited.
- **Everything is recorded** in `PlatformAuditLog` (who, what, which
  clinic, when). Suspensions and password resets also appear in the
  clinic's own Audit Logs as done by "Clinix support", so the owner can
  see them.

Code: `server/src/routes/platform.routes.js`,
`server/src/services/platform.service.js`,
`server/src/middleware/authenticatePlatform.js`,
`server/scripts/create-platform-admin.js`, and `client/src/pages/platform/`.

## Doctor profile

What a prescription says about the doctor who wrote it. Each doctor
account has an optional profile: **qualifications** ("MBBS, MD (General
Medicine)"), **specialisation**, **registration number** and **medical
council**, plus a **signature image**.

- **Who edits it:** the doctor (account menu → *My doctor profile*) or the
  clinic's owner/admin (Staff page → *Profile* on a doctor's row). Other
  staff can't, and only doctor accounts have one.
- **On the prescription PDF:** top right of the header, under the doctor's
  name (qualifications, specialisation, and "Reg. No. … (council)"), and in a
  sign-off block at the bottom right with the signature above a line, then
  name, qualifications, registration number and council. Anything not on
  file is left out.
- **The signature is printed on finalized prescriptions only.** A draft's
  PDF says "Draft - not signed" in its place, so an unfinished
  prescription never looks signed.
- **The signature is private.** It is stored in MongoDB (not Cloudinary),
  so it never has a public URL. Its bytes are `select: false` and stripped
  from every JSON response; the image is served only to that doctor and
  the owner/admin (`GET /users/:id/signature`, `Cache-Control: no-store`).
  The profile form loads it through the API client and shows it as a `blob:`
  URL (`fetchDoctorSignature` in `client/src/api/staff.js`), not as a plain
  `<img src>` - Helmet's `Cross-Origin-Resource-Policy: same-origin` would
  block that whenever the app and API are on different origins (the local
  two-server setup, the Vercel + Render split).
  Other staff get 403.
- **Signature files:** PNG or JPG up to 1MB, checked by content as well as
  type (pdfkit can't draw WebP, so it isn't accepted). Saved as soon as it's
  chosen; the text fields are saved with *Save details*.
- The Staff page shows a doctor's qualifications and specialisation under
  their name.

Code: `User.doctorProfile` (`server/src/models/User.js`), the profile and
signature functions in `server/src/services/user.service.js`,
`server/src/services/pdf/prescriptionPdf.js`, and
`client/src/components/DoctorProfileModal.jsx`.

## Printed documents (PDFs)

The prescription and the bill/receipt are A4 PDFs built on the server with
pdfkit, sharing one look (`server/src/services/pdf/pdfLayout.js` and
`clinicHeader.js`): a blue bar across the top, the clinic's logo, name,
address and contact lines, a blue rule, light grey panels, tables with a
shaded header row, and a footer with "Page n of m" on every page. Long
tables carry on to the next page with their header repeated. Dates and times
are on the clinic's own clock ("13 Oct 2026, 10:30 AM").

**Prescription** (`prescriptionPdf.js`):

- Header right: the doctor - name, qualifications, specialisation,
  registration (see [Doctor profile](#doctor-profile)).
- A patient panel: name, patient ID, age / sex, date and time.
- From the consultation: complaint, vitals ("Temp 101.2 °F | BP 124/82 | ...")
  and diagnosis - only the ones on file.
- "Rx" and a medicines table: medicine (route and instructions under it),
  dose, frequency (with timing under it), duration, quantity.
- *Advice* (the prescription's notes) and *Follow-up* (date and the
  consultation's follow-up instructions) in tinted boxes.
- The signed sign-off bottom right. A draft says "Draft - not signed"
  there and carries a faint **DRAFT** watermark on every page.

**Bill / receipt** (`receiptPdf.js`):

- Header right: **RECEIPT** once any money has been paid, **BILL** before
  that; the number, the date, and a status badge (Paid, Partly paid, Unpaid,
  Refunded).
- A panel: billed to, patient ID, age / sex, doctor.
- The items table (rate and amount), then the totals - subtotal, discount,
  tax, the total on a blue band, amount paid and balance due (red while
  money is owed) - with the total in words beside them ("Rupees One Thousand
  One Hundred Only", in lakhs and crores).
- The payments, oldest first, with date, time and method; a refunded bill
  adds the refund as a red line. Then the bill's notes, if any.

Amounts use Indian digit grouping (1,10,000.00) and the prefix **"Rs."**:
pdfkit's built-in Helvetica has no rupee sign, and embedding a font that has
one would mean shipping a font file. The clinic's GSTIN isn't printed - the
app has no GST settings yet.

## Patient history: Visits and Follow-ups

Two tabs on the patient profile are views over records that already exist -
there is no separate "visit" record. Both are assembled server-side
(`services/patientHistory.service.js`), so each role gets one call that
already leaves out what it may not see - the same lines the Consultations,
Prescriptions and Billing tabs draw.

**Visits** - one entry per time the patient was seen, newest first: the
appointment (date, doctor, token, status, walk-in tag) with that visit's
consultation, prescriptions and bills.

- A visit is an appointment that was **arrived, waiting, in consultation or
  completed**; future bookings, cancellations and no-shows stay on the
  Appointments tab. A consultation recorded without an appointment is a visit
  of its own.
- Owner/admin/doctor see the diagnosis and prescriptions (linked); the front
  desk and nurses see "Consultation recorded" only. Bills are shown to
  owner/admin/receptionist.
- Bills raised from a consultation are linked to it; bills raised from the
  Billing page usually aren't (there is no UI to link them), so they are
  matched to a visit **on the same day**. A bill with no visit that day is
  shown as its own entry rather than dropped.

**Follow-ups** - every follow-up a doctor set on this patient's consultations,
each marked **Due today**, **Overdue**, **Upcoming** or **Done** (the patient
was seen at a later visit), open ones first.

- "Later" is judged by the **visit's date** (the appointment time, or when a
  consultation without one was recorded) - not when the notes were typed, so
  notes written up afterwards don't make an old visit look like a new one.
- Owner/admin/doctor see the doctor's instructions and can open the
  consultation. Receptionists, who book follow-ups, get the dates and status
  only. Nurses don't see this tab, matching their lack of consultation access.

## Clinic time zone

Each clinic has a **time zone** (Settings → Clinic details, Owner only;
`Clinic.timezone`, an IANA name, default `Asia/Kolkata`), and "a day" means
that clinic's calendar day everywhere:

- the queue and Appointments' Today/Tomorrow, double-booking checks and the
  daily token sequence;
- dashboard "today" figures, report date ranges and per-day/week/month
  grouping (done in MongoDB with `$dateToString`'s `timezone`);
- audit-log date filters, the public queue page, patient-history follow-up
  status and same-day bill matching;
- WhatsApp: times inside messages, which day is "tomorrow" for reminders,
  and the reminder hour (`WHATSAPP_REMINDER_HOUR`, on each clinic's clock).

Before this, every one of those used **UTC** days - in India the UTC date is
still "yesterday" until 05:30, so an early-morning visit counted toward the
previous day's tokens, queue and figures.

How it works (`server/src/utils/dateRange.js`): day helpers take the zone as
a **required** argument and throw without one, so a missed call site fails
in tests instead of silently using UTC. Built on `Intl` only (no date
library), and daylight-saving-safe (offsets are looked up per instant).
Date-only fields - a follow-up date, sent as `YYYY-MM-DD` and stored as
midnight UTC - are read back as that calendar date (`calendarDateOf`), so a
clinic behind UTC doesn't see them a day early. The client builds dates from
the browser's local calendar, not `toISOString()` (which is UTC); see Known
limitations for the "staff are in the clinic's zone" assumption that makes.

Existing clinics need no migration - they read the default until changed.
Changing a clinic's zone re-buckets past data by the new zone from then on.

## Token numbers

Every appointment gets a token: **one sequence per clinic per day**, shared by
all doctors and by both bookings and walk-ins (`generateTokenNumber` in
`appointment.service.js`). No two patients in the waiting room hold the same
number that day; each doctor's queue may skip numbers (Dr A: 1, 3, 4 -
Dr B: 2, 5). A booking takes its token from the day it is booked *for*, and a
rescheduled appointment takes the next token on its new day.

Tokens used to be numbered per doctor, so with two doctors both first patients
were "token 1". The counter now starts above the highest token already issued
that day, so the switch-over (and any counter drift) can never repeat a number.
"A day" is the clinic's own calendar day - see [Clinic time zone](#clinic-time-zone).

## Walk-ins

A patient who turns up without a booking is added from **Queue → Add walk-in**
(or **Appointments → Walk-in**), in one pop-up (`components/WalkInModal.jsx`):

- **Patient:** search an existing patient, or **New patient** with just name,
  phone, age and gender - the fields the patient API requires. Full details
  can be added on their profile later.
- **Doctor:** pre-selected when the queue is filtered to one, or when the
  clinic has only one doctor.
- No date or time: `POST /appointments/walk-in` creates the visit **now**,
  already **WAITING** (they are at the desk - no separate "Mark Arrived"),
  with the clinic's next token for today, so they join the end of the queue.

How it differs from a booking (`createWalkIn` in `appointment.service.js`):

- **No slot check.** A booking claims a time slot and is refused if it
  overlaps another; a walk-in has no slot - it queues behind whoever is
  waiting - so a doctor's booked slot never blocks a walk-in.
- **No "appointment confirmed" WhatsApp** - only the queue update any
  patient gets on joining the queue.
- **No duplicates.** If the patient already has a **booking** today with that
  doctor, the server answers `409 BOOKED_TODAY` with the booking's id and the
  pop-up offers **Mark arrived instead**; if they are already waiting or
  being seen, `409 ALREADY_IN_QUEUE`.
- If a newly registered patient is created but the queue step then fails,
  the pop-up keeps that patient selected, so a retry never registers them
  twice.

Walk-ins carry `isWalkIn: true` and show a **Walk-in** tag in the Queue and the
Appointments list; adding one is audit-logged as `APPOINTMENT_WALK_IN`. The
Book Appointment form is for scheduled visits only and no longer has a
walk-in option; `POST /appointments` ignores an `isWalkIn` field.

## Visit flow: consultation → prescription → billing

A visit moves from the doctor to the front desk:

1. **Doctor (Queue):** *Call* the patient, then *Consult*.
2. **Saving the consultation opens the new-prescription form** for it, with
   "Consultation saved. Add the prescription next." and a **Skip, no
   prescription** link (back to the patient's profile) for visits that don't
   need one. Saving the prescription opens it to finalize and print.
3. **Doctor (Queue):** *Complete* the visit.
4. **Front desk (Billing):** the visit appears under **Ready to bill** at the
   top of the Billing page - token, patient, doctor and when it was done.
   **Generate Bill** opens the bill form with the clinic's default
   consultation fee, already linked to the patient, doctor, appointment and
   consultation; creating it opens the bill to take payment, and the visit
   leaves the list.

Billing stays with the front desk on purpose: doctors have no access to bills
(owner/admin/receptionist only), as in most small clinics the doctor writes
the prescription and the patient pays at the desk.

**Ready to bill** (`GET /invoices/ready-to-bill`, `listReadyToBill` in
`invoice.service.js`, shown by `client/src/components/ReadyToBill.jsx`) lists
**today's** completed visits, by the clinic's calendar day, that no bill
covers yet. A visit is covered by a bill linked to its appointment, or - as
bills made from *Create Bill* usually aren't linked - by any unlinked bill for
the same patient made the same day (the matching the Visits tab uses).
Refunded bills still count as billed. The section is hidden when nobody is
waiting.

## Public queue page

Every clinic gets a `slug` (generated from its name at registration, e.g.
`sharma-clinic`) and a no-login page at `/q/<slug>` showing who is being
seen, how many are waiting, and a rough wait estimate. Intended for a
patient's phone and for a TV on the waiting-room wall; it polls every 12
seconds and needs no interaction.

The endpoint behind it (`GET /api/v1/public/clinics/:slug/queue`) is the
first route in this codebase that skips `authenticate`. What it publishes
is a strict field allow-list built in `publicQueue.service.js` - the clinic's
name and logo URL, token numbers, doctor names, and patient names masked to
`Priya S.` Never a full
name, phone, DOB, or anything clinical. A test asserts the exact key set,
so adding a field to that response fails the suite until someone has
decided it is safe to publish.

Clinics created before Phase 11 have no slug. Backfill them once, by hand:

```bash
node server/scripts/backfill-clinic-slugs.js --dry-run   # report
node server/scripts/backfill-clinic-slugs.js             # apply
```

It is idempotent and never runs automatically on boot.

## Clinic branding

Each clinic can upload its own logo in **Settings → Clinic logo** (Owner
only, like the rest of Clinic Settings). The upload applies straight away,
separately from the settings form's Save button.

Where the clinic's identity appears:

- **App shell:** logo + clinic name at the top of the sidebar on desktop,
  and next to the menu button in the header on phones (where the sidebar
  is hidden). Long names wrap to two lines rather than being cut off. With
  no logo uploaded, a tile with the name's first letter stands in.
- **Public queue page** (`/q/<slug>`): the logo above the clinic name, so
  the waiting-room screen carries the clinic's branding.
- **Prescription and receipt PDFs:** the logo top-left of the header, beside
  the clinic name, address and contact lines (`services/pdf/clinicHeader.js`,
  shared by both - see [Printed documents](#printed-documents-pdfs)). Without
  a logo the name starts at the left margin.
- The login page says "Clinix" - nobody's clinic is known before they sign
  in.

Rules (`server/src/middleware/upload.js`, mirrored in the Settings page so
a bad file is rejected before uploading): PNG, JPG or WebP only, 2MB max.
SVG is refused because it can carry script. Cloudinary scales anything
larger than 512px down on upload.

Unlike patient documents, the logo is stored as a **public** Cloudinary
asset (`type: 'upload'`, folder `clinic-crm/<clinicId>/branding`) - it is
meant to be seen, including on the no-login queue page. Replacing a logo
saves the new one first, then deletes the old image best-effort, so a
Cloudinary hiccup can at worst leave an orphaned file, never a clinic with
no logo. Uploads and removals are audit-logged (`CLINIC_LOGO_UPDATED` /
`CLINIC_LOGO_REMOVED`).

For PDFs (`services/pdf/clinicLogo.js`) the server downloads the logo
itself, because pdfkit embeds image bytes, not URLs:

- The URL is built from the stored `logoPublicId` for this app's own
  Cloudinary account - never the saved `logoUrl` - so the server never
  fetches an arbitrary address. It asks Cloudinary for a PNG at most 240px,
  so a WebP upload still embeds (pdfkit reads only PNG and JPEG).
- 3-second timeout, 1MB cap, and any failure (network, HTTP error,
  undecodable image) produces the PDF without a logo - a logo problem never
  stops a prescription or receipt from printing.
- Cached in memory per `logoPublicId` for an hour, so printing a stack of
  receipts downloads it once. A replaced logo has a new public ID, so it is
  never served stale.

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
   | `appointment_confirmation` | patient name, clinic name, date, time, token number, clinic contact |
   | `appointment_reminder` | patient name, clinic name, date, time, clinic contact |
   | `queue_now_serving` | patient name, clinic name, token number, queue link, clinic contact |
   | `document_ready` | patient name, clinic name, document type, pickup instruction, clinic contact |

   Names are configurable via `WHATSAPP_TEMPLATE_*`; the variable *shape*
   is not, so changing a template's variables in Meta means changing the
   matching call in `whatsapp.service.js`.

**One shared number for every clinic.** All clinics send from the single
number above - there is no per-clinic WhatsApp number yet. So each message
names the clinic and ends with the clinic's own contact (`clinicContact()`:
the clinic's phone from Settings, else its email, else "the clinic's front
desk" - Meta rejects a blank variable). Replies to the shared number are
not shown to anyone; only `STOP` is acted on. The templates should say so.

Suggested template text to submit in Meta (category *Utility*, language
English). Keep the variables in exactly this order:

- **`appointment_confirmation`**
  > Hello {{1}}, your appointment at {{2}} is confirmed for {{3}} at {{4}}. Your token number is {{5}}.
  >
  > To change or cancel, please contact {{2}}: {{6}}. Replies to this WhatsApp number are not monitored. Reply STOP to stop these messages.
- **`appointment_reminder`**
  > Hello {{1}}, this is a reminder of your appointment at {{2}} tomorrow, {{3}} at {{4}}.
  >
  > To change or cancel, please contact {{2}}: {{5}}. Replies to this WhatsApp number are not monitored. Reply STOP to stop these messages.
- **`queue_now_serving`**
  > Hello {{1}}, there is an update on your visit to {{2}} - token {{3}}. See the live queue here: {{4}}
  >
  > For help, please contact {{2}}: {{5}}. Replies to this WhatsApp number are not monitored.
- **`document_ready`**
  > Hello {{1}}, your {{3}} from {{2}} is ready. {{4}}
  >
  > For questions, please contact {{2}}: {{5}}. Replies to this WhatsApp number are not monitored.

Meta may ask for sample values for each variable when you submit; any
realistic example works ("Priya Sharma", "Sunrise Family Clinic",
"14 Oct 2026", "10:30 AM", "5", "+91 98220 12345").

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

## Email notifications

The same notifications as WhatsApp - booking confirmed, the day-before
reminder, marked arrived / called in, prescription finalized, bill fully
paid - sent as email through **Brevo's transactional API**
(`server/src/services/email.service.js`, `emailClient.js`,
`emailTemplates.js`). Each trigger point calls the WhatsApp helper and the
email helper of the same name side by side, and the reminder sweep sends
both. Email works on its own: a clinic can have either channel on, or both.

**Two switches, both must be on** - exactly as for WhatsApp: the global
`EMAIL_ENABLED` env var (only the string `true`), and the per-clinic
*Email notifications* toggle in Settings (Owner only, off by default).
Brevo itself needs `BREVO_API_KEY` and an `EMAIL_FROM_ADDRESS` that is a
verified sender or domain in Brevo (Senders, Domains & Dedicated IPs).

**What a patient gets**

- Only patients with an email address on file - email is optional at
  registration, so a missing address is a routine skip, not a failure.
- From: "*Clinic name* via Clinix" `<EMAIL_FROM_ADDRESS>` - one shared,
  verified sending address for every clinic, but the clinic's name on it.
- **Reply-To: the clinic's own contact email** (Settings → Clinic details →
  *Contact email*, new with this feature and also printed on the PDFs), so
  replies reach the clinic - unlike WhatsApp replies. Without a clinic
  email there is no Reply-To and the email doesn't invite replies.
- Branded HTML (clinic name and logo, a details box, a "See the live queue"
  button on queue updates) plus a plain-text version, the clinic's phone
  (`clinicContact()`, as on WhatsApp), and an unsubscribe link in the
  footer. Every user-entered value is HTML-escaped.

**Unsubscribing.** The footer link opens `/email/unsubscribe?p=<patient
id>&t=<signature>` in the app. The signature is an HMAC of the patient id
with `JWT_SECRET`, so a link can't be forged for another patient; the page
asks before acting (so mail scanners that pre-open links can't unsubscribe
anyone) and then calls `POST /api/v1/public/email/unsubscribe`, which sets
`Patient.emailOptIn = false` for good and returns only the clinic's name.
Unlike WhatsApp's STOP, this is per patient record - one clinic's patient,
not every clinic that has the same person.

**Logged like WhatsApp.** An `EmailMessage` row is written for every
attempt - `SENT` (with Brevo's message id), `FAILED` (with Brevo's reason,
or "BREVO_API_KEY or EMAIL_FROM_ADDRESS is not set"), or `QUEUED` for a
deliberate skip (switch off, clinic off, unsubscribed, no address). Sending
never fails the booking, payment or prescription that triggered it.

## Demo credentials

Load a demo clinic with sample data:

```bash
npm run seed --workspace server
```

**This wipes the database `MONGODB_URI` points at** and refills it with one
clinic ("Sunrise Family Clinic"), 18 patients, past visits (consultation +
invoice + payment) and today's appointments, including a live queue. It
refuses to run when `NODE_ENV=production`, and refuses an Atlas
(`mongodb.net`) URI unless the database name contains `seed`, `demo` or
`dev`. Point it at a local or throwaway database, never a real one.

Demo logins (password `Demo@12345` for all three):

| Role | Email |
|---|---|
| Owner | `owner@demo-clinic.test` |
| Doctor | `doctor@demo-clinic.test` |
| Receptionist | `receptionist@demo-clinic.test` |

Alternatively, create your own clinic via the "Create your clinic" link on
`/login` (`POST /api/v1/auth/register-clinic`), then add doctors,
receptionists and nurses from the Staff page.

## Security notes

- Passwords are hashed (bcrypt, cost 12), never stored in plain text.
- Sessions are an httpOnly JWT cookie - never readable from JS, so an XSS
  payload can't exfiltrate it. `secure` is enabled automatically in
  production. `SameSite=Lax` locally and on the single-service Render
  deploy (same origin); `SameSite=None` only in the Vercel + Render split,
  where every API call is cross-site.
- When the server serves the React app (`SERVE_CLIENT`), the
  Content-Security-Policy allows scripts only from the app itself plus the
  one inline theme script by SHA-256 hash - no `'unsafe-inline'` - and
  images only from the app, `data:`/`blob:` and `res.cloudinary.com`.
- Tenant (`clinicId`) isolation and role-based authorization are enforced
  server-side (`authenticate` + `authorize` middleware), derived only from
  the verified session - a client-supplied `clinicId` is never trusted or
  even accepted as input.
- A disabled user's session stops working immediately (re-checked on every
  request), not just at token expiry.
- **Change password:** every signed-in user can change their own password
  from the account menu (top right) - current password, new password (8+
  characters) and a confirmation. The current password is required even
  though the user is signed in, so nobody at an unlocked front-desk PC can
  lock the owner out. Each login token carries the user's
  `sessionVersion`; a change bumps it, so every *other* device signed in to
  that account is signed out on its next request (401 `PASSWORD_CHANGED`),
  while the device that made the change gets a fresh token and stays in.
  A wrong current password is a 400 `WRONG_PASSWORD` (the session is fine).
  Tokens issued before this existed have no version and count as 0, so
  nobody is signed out by the upgrade itself.
- `/auth/login`, `/auth/register-clinic` and `/auth/change-password` are
  rate-limited.
- Login/logout/password-changed/staff-created/staff-disabled and
  doctor-profile/signature changes are written to an append-only audit log.
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
- **Three unauthenticated routes exist, and only three** (besides
  `/health` and `/keep-alive`, which return no data at all):
  `GET /api/v1/public/clinics/:slug/queue`, `/api/v1/whatsapp/webhook`
  and `POST /api/v1/public/email/unsubscribe`. All are rate-limited. The
  public queue derives its tenant from a validated `:slug` (never from
  request input) and returns a strict field allow-list; the webhook
  verifies Meta's `X-Hub-Signature-256` against `WHATSAPP_APP_SECRET`
  before trusting a payload, and refuses outright in production if that
  secret is unset; the unsubscribe route acts only on a valid HMAC
  signature (see [Email notifications](#email-notifications)), answers a
  forged link with the same 404 as an unknown one, and returns nothing but
  the clinic's name. The route files carry a header comment spelling out
  what a new route added there would be signing up for.
- An unknown clinic slug and a deactivated clinic return the identical
  generic 404 - the public endpoint is enumerable, so it must not confirm
  which clinic names exist.
- The clinic logo is the one deliberately **public** upload: a Cloudinary
  `upload`-type asset with a permanent URL, because it appears on the
  no-login queue page. It is only ever set by the Owner-only logo route -
  `updateClinicSettingsSchema` has no logo fields, and a test asserts a
  settings PATCH carrying `logoUrl` is ignored, so nobody can point it at
  an arbitrary URL. Raster images only (no SVG), 2MB max.
- WhatsApp access tokens and the app secret are server-side only, never
  `VITE_`-prefixed, so they cannot reach the browser bundle. The Settings
  UI deliberately offers no Meta credential fields, because clinics cannot
  self-configure them in this design.
- The Content-Security-Policy's `upgrade-insecure-requests` is sent only in
  production. Over plain http (a local production build, or a phone on the
  LAN) Safari would otherwise re-request the app's scripts over https, fail,
  and show a blank page; production always runs behind HTTPS.
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
- **One WhatsApp number for every clinic** (see [WhatsApp setup](#whatsapp-setup)).
  Messages carry the clinic's name and phone, but they don't come from the
  clinic's own number, and patients' replies (other than STOP) reach no one.
  Per-clinic numbers would need Meta Tech Provider sign-up, per-clinic
  credentials and a replies inbox - a planned next step, not built.
- No retry on a failed WhatsApp send. A failure is recorded as a `FAILED`
  `WhatsappMessage` row and that is the end of it - no backoff, no dead
  letter queue, no BullMQ/Redis worker. That is a deliberate v1 call; a
  real job queue is the natural v2 once volume justifies the operational
  cost.
- **Email** (see [Email notifications](#email-notifications)) has the same
  no-retry rule, and no delivery tracking: a row says `SENT` once Brevo
  accepts the email - bounces, spam-folder placement and opens aren't
  recorded (Brevo's own dashboard shows them; its webhooks aren't wired
  up). Emails are English only, and there is no screen showing a patient's
  unsubscribe state or turning it back on. Never tested against a real
  Brevo account in this environment - the tests stub `emailClient`.
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

Responsive layout (see [Responsive layout](#responsive-layout)):

- The mobile audit ran in light mode. Dark mode at phone width was only
  spot-checked (Billing, the 404 page, Settings working hours).
- The demo seed has no prescriptions; the audit added two (one draft, one
  finalized) through the API to check the Prescriptions list and detail
  pages.
- Checked in headless Chrome and in WebKit with iPhone profiles, not on a
  physical phone - touch scrolling, the on-screen keyboard, Safari's
  toolbar collapsing and the native date/time pickers are untested.
- Text links inside table rows (patient names, invoice numbers) are normal
  text height, smaller than the ~44px tap target Apple recommends; the
  rows themselves are taller, but only the text is tappable.

Carried over from Phase 10:

- **Uploads have never been exercised against a real Cloudinary account
  in this repo's test runs.** Document upload and clinic logo upload are
  fully wired end-to-end (multipart handling, file-type/size validation,
  the Cloudinary SDK call itself, error handling) and tested with a mocked
  Cloudinary client. Fill in `CLOUDINARY_*` in `.env` to use them, and try
  one real upload of each before relying on it.
- No clinic-wide "Follow-ups Due" list page yet (Module 12) - follow-ups
  live on the consultation and surface on the doctor/admin dashboards (next
  7 days) and on each patient's Follow-ups tab, but there's no page listing
  every patient's.
- A follow-up counts as **Done** once the patient is seen at any later visit -
  even before the follow-up date, or by a different doctor. There is no way
  to mark one done or dismissed by hand.
- Document types are freetext (with suggestions), not a strict enum -
  matches the spec's examples being non-exhaustive.
- No document preview/thumbnail - "View" opens the signed URL in a new
  tab and lets the browser's native PDF/image viewer handle it.
- The global Documents page is read-only (view/delete) - uploads only
  happen from a patient's profile, where the patient context is already
  established.
- No delta/trend indicators on dashboard stat tiles (e.g. "+12% vs
  yesterday") - just the current value, to keep the aggregation queries
  simple for the MVP; the dataviz method supports them if added later.
- Report export is built in the browser from the data already fetched for
  the chart (no dedicated backend export endpoint) - see
  [Reports](#reports). Only the three time/status charts export; the
  by-doctor and by-payment-method lists don't.
- Reports date filters are a single from/to range shared across all three
  report tabs, not independently adjustable per tab.
- Clinic Settings now exists (name, address, contact phone, default
  consultation fee, working hours - Owner-only) - but it doesn't include a
  configurable tax rate. "Tax if configured" in the spec implies that; for
  now, tax on an invoice stays a flat amount entered per-bill, same as
  discount.
- Refunds are all-or-nothing: a refund gives back everything paid on the
  bill, today (see [Refunds](#refunds)). There are no partial refunds,
  credit notes or a choice of refund method - that's the accounting-ERP
  complexity the spec says to skip for the MVP.
- An invoice's line items/discount/tax are locked as soon as any payment
  is recorded (to protect the historical record a payment was made
  against) - there's no "add an item after partial payment" flow yet.
- Bills generated from **Ready to bill** are linked to their appointment
  and consultation (see [Visit flow](#visit-flow-consultation--prescription--billing)),
  but one made with *Create Bill* can't be linked afterwards.
- **Ready to bill** covers today only: a completed visit not billed by the
  end of the clinic's day drops off the list (bill it from *Create Bill*).
  Nor can a visit be dismissed from it - a free visit stays listed until the
  day ends.
- Prescription PDFs print the doctor's profile (see
  [Doctor profile](#doctor-profile)) - only what's on file, never
  placeholders. Receipts name the doctor but carry no signature.
- PDF amounts read "Rs.", not "₹" (no rupee sign in pdfkit's built-in
  font), and there's no GSTIN or tax breakdown (no GST settings yet).
- The PDF logo cache is per server process and in memory: with several API
  instances each downloads the logo once, and a restart empties it.
- No cropping or positioning for an uploaded logo - it is shown whole,
  scaled to fit (`object-contain`), so a wide wordmark appears small in the
  square tile.
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
- The Staff page (`/staff`, Owner/Admin) lists staff, adds doctors,
  receptionists and nurses, and disables/re-enables accounts - but it has
  no frontend test yet, unlike the other modules.
- No calendar/grid view for appointments - only the List view (with
  Today/Tomorrow/Upcoming filters) from the spec's "Calendar view, List
  view" requirement; a visual calendar is a reasonable later addition.
- No doctor working-hours/holiday scheduling yet - double-booking
  *is* prevented (same-doctor time-range overlap check), but nothing stops
  booking outside a doctor's actual hours since those aren't modeled yet.
- Times are **displayed** in each viewer's browser time zone, and the date
  pickers send the browser's local date - staff are assumed to be in the
  clinic's time zone. Someone viewing a clinic from a different zone sees
  times shifted to their own clock.
- No patient search beyond simple case-insensitive substring/prefix
  matching (no fuzzy search) - fine at small-clinic scale, would need a
  text index or search service at larger scale.
- No patient disable/soft-delete yet (only staff can be disabled so far).
- No self-service "forgot password" yet (marked "if feasible" in the spec)
  - the app can't send email. Someone who forgot theirs asks Clinix
  support, who resets it from the platform panel; an owner/admin can't set
  a new password for their own staff.
- The doctor profile has no per-doctor consultation fee, working hours or
  holidays yet - fees still come from the clinic default, and nothing stops
  booking a doctor outside their hours.
- Only accounts with the **doctor** role have a doctor profile. An owner
  who also sees patients needs a separate doctor account (the booking and
  consultation doctor pickers only list doctors).
- A doctor's signature is printed as uploaded - no cropping or background
  removal, so a photo on grey paper prints grey.
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

After Phase 11: clinic branding (logo upload, clinic name and logo in the
app shell, on the public queue page and on prescription/receipt PDFs), and a
responsive-layout pass (phone navigation drawer, tables
shown as cards on phones and tablets, wrapping queue actions) so the whole app
works at phone width - see [Responsive layout](#responsive-layout).

Natural next steps, deliberately not in this phase: a signed public
document-link mechanism (so `document_ready` can carry a real PDF link)
and a background job queue with retries for failed sends.

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
POST /api/v1/auth/change-password   signed-in user: { currentPassword, newPassword }; signs out other devices

GET  /api/v1/users                   any authenticated user: list this clinic's staff (e.g. to pick a doctor)
POST /api/v1/users                   admin: create a staff member (doctor/receptionist/nurse)
PATCH /api/v1/users/:id/active       admin: enable/disable a staff member
PATCH /api/v1/users/:id/doctor-profile   the doctor or owner/admin: qualifications, specialization, registrationNumber, registrationCouncil
PUT  /api/v1/users/:id/signature     the doctor or owner/admin: multipart `signature` (PNG/JPG, 1MB)
GET  /api/v1/users/:id/signature     the doctor or owner/admin: the signature image (private, no-store)
DELETE /api/v1/users/:id/signature   the doctor or owner/admin

# Platform admin panel - separate session (see "Platform admin panel")
POST /api/v1/platform/auth/login
POST /api/v1/platform/auth/logout
GET  /api/v1/platform/auth/me
GET  /api/v1/platform/overview
GET  /api/v1/platform/clinics        ?search=&status=all|active|suspended&page=
GET  /api/v1/platform/clinics/:id    details, usage counts, staff, recent activity, support actions
POST /api/v1/platform/clinics/:id/suspend      { reason }
POST /api/v1/platform/clinics/:id/unsuspend
POST /api/v1/platform/clinics/:id/staff/:userId/reset-password   returns a one-time temporary password

POST /api/v1/patients                admin/receptionist: register a patient (auto-generates P-10001 etc.)
GET  /api/v1/patients                search (?search=) + paginate (?page=&limit=)
GET  /api/v1/patients/:id
GET  /api/v1/patients/:id/visits     every role: visit timeline (clinical detail for owner/admin/doctor, bills for owner/admin/receptionist)
GET  /api/v1/patients/:id/follow-ups owner/admin/doctor/receptionist: follow-ups with status (instructions for clinical roles only)
PATCH /api/v1/patients/:id           admin/receptionist/nurse: update a patient

POST /api/v1/appointments            admin/receptionist: book an appointment for a date/time
POST /api/v1/appointments/walk-in    admin/receptionist: patient at the desk -> straight into today's queue as WAITING (409 BOOKED_TODAY / ALREADY_IN_QUEUE)
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
GET  /api/v1/invoices/ready-to-bill   today's completed visits with no bill yet (the Billing page's "Ready to bill")
GET  /api/v1/invoices/:id
GET  /api/v1/invoices/:id/receipt/pdf   streams a printable/downloadable receipt PDF
PATCH /api/v1/invoices/:id           edit line items/discount/tax - blocked once any payment is recorded
POST /api/v1/invoices/:id/payments   record a payment (CASH/UPI/CARD/ONLINE/OTHER) - rejected if it exceeds the balance
GET  /api/v1/invoices/:id/payments   payment history for one invoice
POST /api/v1/invoices/:id/refund     refunds everything paid, today: status REFUNDED + a Refund record per payment (reports subtract them)

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
PATCH /api/v1/clinics/settings        owner only: update name/address/phone/email/fee/hours/whatsappEnabled/emailEnabled
POST /api/v1/clinics/settings/logo    owner only: multipart `logo` (PNG/JPG/WebP, 2MB) - set/replace the clinic logo
DELETE /api/v1/clinics/settings/logo  owner only: remove the clinic logo

GET  /api/v1/public/clinics/:slug/queue   NO AUTH: masked live queue for the waiting-room page, rate-limited
POST /api/v1/public/email/unsubscribe     NO AUTH: { p, t } from an email's unsubscribe link; HMAC-checked, rate-limited
GET  /api/v1/whatsapp/webhook             NO AUTH: Meta's subscription handshake
POST /api/v1/whatsapp/webhook             NO AUTH: delivery receipts + inbound replies, signature-verified

GET  /api/v1/health
GET  /api/v1/keep-alive             NO AUTH: no-op for keeping a free instance awake (no DB, not logged)
```

Only the routes marked `NO AUTH` above skip `authenticate` - see
[Security notes](#security-notes) for what compensates for that.
