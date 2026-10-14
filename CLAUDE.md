# CLAUDE.md

Guidance for Claude Code sessions working in this repo. `README.md` is the
full, authoritative description of every feature - read the relevant section
before changing something. This file holds the working rules and the
practical setup that the README doesn't.

## What this is

**Clinix** - a multi-clinic OPD / clinic management web app (patients,
appointments, OPD queue, consultations, prescriptions, billing, reports,
staff, public queue screen, WhatsApp, and a separate platform admin panel at
`/platform`). A personal project of the repo owner, built to sell to small clinics
and OPDs in India.

MERN monorepo with npm workspaces:

- `client/` - React 18, Vite 5, Tailwind 3.4, React Router 6, TanStack Query 5,
  react-hook-form + zod, recharts, lucide-react. Tests: Vitest + React Testing
  Library.
- `server/` - Express, Mongoose, zod validators, pdfkit, JWT in httpOnly
  cookies. Tests: Jest + Supertest + mongodb-memory-server.
- `e2e/acceptance.mjs` - Puppeteer end-to-end run (never run on this server:
  its Chromium is missing system libraries).

## Commands (from the repo root)

```bash
npm run dev              # client (5173) + server (5000)
npm run test:client      # Vitest
npm run test:server      # Jest, ~6 min (each suite starts an in-memory MongoDB)
npm run lint:client      # eslint, --max-warnings 0
npm run lint:server
npm run build:client     # Vite build -> client/dist (gitignored)
npm run seed --workspace server                    # WIPES the target DB, loads demo data
npm run create-platform-admin --workspace server -- --email x --name "Y"
```

Single test file: `npx vitest run --root client src/pages/NotFound.test.jsx`,
or `cd server && NODE_OPTIONS=--experimental-vm-modules npx jest tests/auth.test.js`.

## Standing rules

- **Commit or push only when the owner asks.** Leave changes uncommitted
  otherwise. Stage explicit paths - never `git commit -a` / `git add -A`.
- **Mobile first, always.** Every UI change must work at phone width
  (320-390px) as well as desktop. Check it, don't assume it. No page may
  scroll sideways; see "Responsive layout" in the README for the rules
  (tables use the `.stack-table` card pattern in `client/src/index.css`,
  tabs wrap, tap targets are at least 24x24px).
- **Keep `README.md` in sync** with every feature, behaviour, config or
  test-count change, in the same piece of work, and say which sections
  changed.
- **Keep `docs/USER_GUIDE.md` in sync too** - the client-facing guide the
  owner shows to clinics. Update it in the same piece of work whenever a
  change affects what users see or can do: a new or removed feature, a
  changed step, a role/permission change (check the "Access at a glance"
  table against the `authorize(...)` lists in `server/src/routes/` and the
  role constants in the client pages), or a new limitation. Write it for
  clinic staff: plain words, no code, file names, API paths or tech terms.
  Bump its "Last updated" date and say which sections changed. Internal-only
  changes (tests, refactors, deployment) don't touch it.
- **Never touch the real database.** `.env`'s `MONGODB_URI` points at a
  MongoDB Atlas cluster with possibly real data. Never run `seed`, test
  setups or anything that writes against it - use a throwaway local Mongo
  (below).
- The owner may have their own `npm run dev` running on 5000/5173 against
  Atlas. Check `ss -ltnp` first and never kill or reuse those; run your copy
  on other ports.
- Verify before claiming: name the command or screenshot that proved it,
  or say it's unverified.

## Code conventions

- Match the surrounding file: multi-line wrapped comments explaining *why*
  are the norm here, naming follows `thing.controller.js` /
  `thing.service.js` / `thing.routes.js` on the server.
- Prettier: the repo was not Prettier-clean when this work started. Format
  only files that are new or were already clean at HEAD
  (`git show HEAD:<f> | npx prettier --stdin-filepath <f> --check`); fix
  other files' formatting by hand, so diffs stay small.
- Tailwind only (no separate CSS files), with `dark:` variants for every
  colour - the app has light, dark and system themes.
- Server input is validated with zod in `server/src/validators/`; every
  clinic query is scoped by `clinicId`; sensitive actions write an audit log.

## Checking UI changes in a real browser

There's no desktop browser on this server; use Docker. The working recipe:

```bash
# throwaway database + demo data (logins: owner@ / doctor@ / receptionist@demo-clinic.test, password Demo@12345)
docker run -d --name clinix-shots-mongo -p 127.0.0.1:27018:27017 mongo:7
cd server && MONGODB_URI=mongodb://127.0.0.1:27018/clinix_shots NODE_ENV=development \
  CLOUDINARY_CLOUD_NAME= CLOUDINARY_API_KEY= CLOUDINARY_API_SECRET= npm run seed

# production build served by Express (the root .env sets VITE_API_URL to localhost:5000, so override it)
VITE_API_URL=/api/v1 npm run build:client
cd server && PORT=5002 SERVE_CLIENT=true CORS_ORIGIN=http://localhost:5002 \
  MONGODB_URI=mongodb://127.0.0.1:27018/clinix_shots NODE_ENV=development node src/server.js

# Playwright (Chromium + WebKit for iPhone) - run a script from a mounted folder
docker run --rm --ipc=host --network host -v <dir>:/work -w /work \
  --entrypoint node mcr.microsoft.com/playwright:v1.48.2-jammy script.mjs
# (npm i playwright@1.48.2 in that folder first)
```

Gotchas:

- Login checks take 1.5-3s (bcrypt); wait for elements, not fixed timeouts.
- The login rate limit is 20 attempts per 15 minutes - log in once per role
  and reuse the page; restart the server to reset it.
- Don't run browser checks while the server test suite runs - WebKit crashes.
- The demo seed has no prescriptions; create them via the API if needed.
- Clean up afterwards: stop the server by PID (`ss -ltnp | grep :5002`; don't
  `pkill -f` a pattern that matches your own shell), then
  `docker rm -f -v clinix-shots-mongo`, then `npm run build:client` without
  overrides.
- A useful mobile check on every page: `document.documentElement.scrollWidth
  > innerWidth`, any `overflow-x: auto` box with `scrollWidth > clientWidth`,
  and (in the app shell) `scrollHeight > innerHeight`.

## Open items (as of 2026-10-14)

- `npm audit`: the critical `proxy-addr` advisory is fixed (`npm audit fix`,
  2026-10-14, lock file only). Left: 2 moderate `react-router` findings in
  production (need React Router 7) and dev-only tooling that needs major
  upgrades (Jest 30, Vitest 5, Vite 8, Tailwind 4, Puppeteer 25) - see the
  README's Known limitations. Never `npm audit fix --force`.
- Refunds are now recorded and subtracted from revenue (README "Refunds"),
  but `server/scripts/backfill-refunds.js` has not been run against Atlas -
  bills refunded before that change still count as revenue there. The owner
  runs it (dry run first); never run it yourself against `.env`'s database.
- Never tested against real services: WhatsApp sends, Brevo email sends,
  Cloudinary uploads, a physical iPhone. Brevo keys go in `.env`
  (`BREVO_API_KEY`, `EMAIL_FROM_ADDRESS` must be a Brevo-verified sender);
  email stays off until `EMAIL_ENABLED=true` and a clinic turns it on.
- Landing page (`/`, README "Landing page") has **placeholder pricing**
  (`PLANS` in `client/src/pages/Landing.jsx`) and needs the owner's real
  `VITE_CONTACT_EMAIL` / `VITE_CONTACT_WHATSAPP` (blank hides the buttons).
- Per-doctor consultation fee and weekly working hours are built (README
  "Consultation fee and working hours"). Doctors without fixed hours stay
  bookable any time on purpose - clinic opening hours are not enforced, so
  existing clinics see no new warnings. Not built: holidays/leave dates,
  follow-up fee, per-doctor slot length.
- Suggested next modules: subscriptions/payments
  (Razorpay), forgot password by email, doctor leave/holidays,
  medicine favourites, lab tests, calendar view, GST settings.
