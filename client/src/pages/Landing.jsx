import { Link, Navigate } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  FileText,
  ListOrdered,
  Lock,
  Mail,
  MessageCircle,
  MonitorSmartphone,
  Receipt,
  ShieldCheck,
  Stethoscope,
  Tv,
  Users,
  UserCog,
} from 'lucide-react'
import ClinixLogo from '../components/ClinixLogo.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { useAuth } from '../context/AuthContext.jsx'

// The public marketing page at "/" - what search results and shared links
// open. Signed-in staff skip it and go straight to their dashboard, as on
// /login. Everything here describes features that exist today; keep it that
// way when editing (README "Landing page").

// PLACEHOLDER PRICING - illustrative plans, not real prices yet. There is no
// billing in the app: signing up is free and unlimited today. Change these
// (and the note under the plans) once real plans exist.
const PLANS = [
  {
    name: 'Starter',
    price: '₹499',
    period: '/month',
    tagline: 'For a single-doctor clinic',
    features: [
      '1 doctor + 2 staff accounts',
      'Patients, appointments and OPD queue',
      'Prescriptions and bills as PDF',
      'Reports with Excel export',
    ],
  },
  {
    name: 'Clinic',
    price: '₹999',
    period: '/month',
    tagline: 'For a busy OPD',
    highlight: true,
    features: [
      'Up to 3 doctors, unlimited staff',
      'Everything in Starter',
      'WhatsApp and email reminders',
      'Waiting-room queue screen',
    ],
  },
  {
    name: 'Multi-doctor',
    price: '₹1,999',
    period: '/month',
    tagline: 'For clinics with up to 5 doctors',
    features: [
      'Up to 5 doctors, unlimited staff',
      'Everything in Clinic',
      'Priority support',
    ],
  },
]

const FEATURES = [
  { Icon: Users, title: 'Patients', text: 'Register in seconds, search by name, phone or ID, and see every visit, prescription and bill on one profile.' },
  { Icon: CalendarDays, title: 'Appointments & tokens', text: 'Book, reschedule and cancel. Every visit gets the day\'s next token, shared across all your doctors.' },
  { Icon: ListOrdered, title: 'OPD queue & walk-ins', text: 'Add walk-ins at the desk. Doctors call the next patient, skip, and complete with one tap.' },
  { Icon: Tv, title: 'Waiting-room screen', text: 'Show "now serving" on the TV in your waiting area - no login, and patient names are never shown in full.' },
  { Icon: Stethoscope, title: 'Consultations', text: 'Complaint, vitals, diagnosis, treatment plan and follow-up date - started straight from the queue.' },
  { Icon: FileText, title: 'Prescriptions', text: 'Medicines with dose, frequency and timing. Print a professional A4 prescription with the doctor\'s signature.' },
  { Icon: Receipt, title: 'Billing & receipts', text: 'Bills, part payments by cash, UPI or card, refunds, and printed receipts. Finished visits wait in "Ready to bill".' },
  { Icon: BarChart3, title: 'Reports', text: 'Patients, appointments and revenue by day, week or month - by doctor and payment method - with Excel export.' },
  { Icon: MessageCircle, title: 'WhatsApp & email', text: 'Booking confirmations, day-before reminders and queue updates, sent automatically. Patients can opt out any time.' },
]

const STEPS = [
  { who: 'Front desk', text: 'Marks the patient arrived, or adds them as a walk-in. They get a token.' },
  { who: 'Doctor', text: 'Calls them in, records the consultation and goes straight to the prescription.' },
  { who: 'Doctor', text: 'Finalizes and prints the signed prescription, then completes the visit.' },
  { who: 'Front desk', text: 'Bills the visit from "Ready to bill", takes payment and prints the receipt.' },
]

const ROLES = [
  { role: 'Owner', text: 'Everything, including clinic settings, branding and adding admins.' },
  { role: 'Admin', text: 'Runs the clinic day to day: staff, billing, reports and the audit log.' },
  { role: 'Doctor', text: 'Their own queue, consultations, prescriptions and patient documents.' },
  { role: 'Receptionist', text: 'Registrations, appointments, walk-ins and billing - no medical notes.' },
  { role: 'Nurse', text: 'Patients, appointments and the queue, and updating patient details.' },
]

const FAQS = [
  { q: 'Do I need to install anything?', a: 'No. Clinix runs in the browser on any computer, tablet or phone. Each staff member signs in with their own account.' },
  { q: 'Does it work on a phone?', a: 'Yes - every screen is built to work on a phone as well as a desktop.' },
  { q: 'Can my receptionist see diagnoses?', a: 'No. Consultations and prescriptions are only visible to doctors, admins and the owner. The receptionist sees that a consultation happened, not what was in it.' },
  { q: 'Is my clinic\'s data kept separate?', a: 'Yes. Each clinic\'s data is completely separate from every other clinic\'s, and important actions are recorded in an audit log you can review.' },
  { q: 'Can I put my clinic\'s logo on prescriptions?', a: 'Yes. Upload your logo in Settings and it appears in the app, on the waiting-room screen, and on every prescription and receipt.' },
]

// Contact details come from the build environment (VITE_CONTACT_EMAIL,
// VITE_CONTACT_WHATSAPP - see .env.example), so they can change without a
// code change. Read on render, not at import, so tests can set them.
function contactDetails() {
  const email = import.meta.env.VITE_CONTACT_EMAIL?.trim() || null
  const whatsappDigits = (import.meta.env.VITE_CONTACT_WHATSAPP ?? '').replace(/\D/g, '') || null
  const whatsappUrl = whatsappDigits
    ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent("Hi, I'd like to know more about Clinix for my clinic.")}`
    : null
  return { email, whatsappUrl }
}

const sectionTitle = 'text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl dark:text-white'
const sectionLead = 'mt-3 max-w-2xl text-base text-gray-600 dark:text-gray-400'
const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950'
const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800'

export default function Landing() {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  const contact = contactDetails()
  const hasContact = Boolean(contact.email || contact.whatsappUrl)

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <SiteHeader showContact={hasContact} />

      <main>
        <Hero />

        <section id="features" className="scroll-mt-20 border-t border-gray-100 bg-gray-50 py-16 sm:py-20 dark:border-gray-900 dark:bg-gray-900/40">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className={sectionTitle}>Everything a small clinic runs on</h2>
            <p className={sectionLead}>
              From the moment a patient walks in to the receipt in their hand - one app for your
              front desk, your doctors and you.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ Icon, title, text }) => (
                <div key={title} className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">{title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-gray-600 dark:text-gray-400">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className={sectionTitle}>A visit, start to finish</h2>
            <p className={sectionLead}>
              Each step hands the patient to the next person - nobody hunts for paperwork.
            </p>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, i) => (
                <li key={step.text} className="relative rounded-xl border border-gray-200 p-5 dark:border-gray-800">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">{step.who}</p>
                  <p className="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-300">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-gray-100 bg-gray-50 py-16 sm:py-20 dark:border-gray-900 dark:bg-gray-900/40">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className={sectionTitle}>Everyone sees what they need</h2>
              <p className={sectionLead}>Five roles, each with exactly the access their job needs.</p>
              <ul className="mt-8 space-y-3">
                {ROLES.map(({ role, text }) => (
                  <li key={role} className="flex gap-3 rounded-lg bg-white p-4 dark:bg-gray-900">
                    <UserCog size={20} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <span className="font-semibold text-gray-900 dark:text-white">{role}.</span> {text}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className={sectionTitle}>Private by design</h2>
              <p className={sectionLead}>Patient records are sensitive. Clinix is built around that.</p>
              <ul className="mt-8 space-y-4">
                {[
                  [ShieldCheck, 'Your clinic\'s data is kept completely separate from every other clinic\'s.'],
                  [Lock, 'Medical notes are visible only to doctors and clinic management - not the front desk.'],
                  [FileText, 'Important actions are recorded in an audit log: who did what, and when.'],
                  [MonitorSmartphone, 'Works in the browser on phones, tablets and computers - nothing to install.'],
                ].map(([Icon, text]) => (
                  <li key={text} className="flex gap-3">
                    <Icon size={20} className="mt-0.5 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
                    <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">{text}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-20 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className={sectionTitle}>Simple pricing</h2>
            <p className={sectionLead}>Pick a plan by the number of doctors. Every plan includes every core feature.</p>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className={`flex flex-col rounded-2xl border p-6 ${
                    plan.highlight
                      ? 'border-blue-600 shadow-lg ring-1 ring-blue-600 dark:border-blue-500 dark:ring-blue-500'
                      : 'border-gray-200 dark:border-gray-800'
                  } bg-white dark:bg-gray-900`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{plan.name}</h3>
                    {plan.highlight && (
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        Most popular
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{plan.tagline}</p>
                  <p className="mt-5">
                    <span className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">{plan.price}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{plan.period}</span>
                  </p>
                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <Check size={18} className="shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link to="/register-clinic" className={`mt-8 ${plan.highlight ? primaryButton : secondaryButton}`}>
                    Get started
                  </Link>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
              Prices are per clinic, before GST. Getting started is free while Clinix is in early access.
            </p>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 border-t border-gray-100 bg-gray-50 py-16 sm:py-20 dark:border-gray-900 dark:bg-gray-900/40">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className={sectionTitle}>Questions clinics ask</h2>
            <div className="mt-8 divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
              {FAQS.map(({ q, a }) => (
                <details key={q} className="group p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-gray-900 dark:text-white">
                    {q}
                    <span className="text-xl leading-none text-gray-400 transition-transform group-open:rotate-45" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-400">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="scroll-mt-20 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="rounded-2xl bg-blue-600 px-6 py-10 text-center sm:px-12 dark:bg-blue-700">
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Ready to run your clinic from one screen?</h2>
              <p className="mx-auto mt-3 max-w-xl text-blue-100">
                Set up your clinic in a few minutes, or talk to us first - we&apos;re happy to show you around.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  to="/register-clinic"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                >
                  Create your clinic <ArrowRight size={16} aria-hidden="true" />
                </Link>
                {contact.whatsappUrl && (
                  <a
                    href={contact.whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/40 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    <MessageCircle size={16} aria-hidden="true" /> Chat on WhatsApp
                  </a>
                )}
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}?subject=${encodeURIComponent('Clinix for my clinic')}`}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/40 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    <Mail size={16} aria-hidden="true" /> {contact.email}
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 py-8 dark:border-gray-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-gray-500 sm:flex-row sm:px-6 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <ClinixLogo size={22} />
            <span>© {new Date().getFullYear()} Clinix</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <a href="#features" className="py-1 hover:text-gray-900 dark:hover:text-white">Features</a>
            <a href="#pricing" className="py-1 hover:text-gray-900 dark:hover:text-white">Pricing</a>
            <Link to="/login" className="py-1 hover:text-gray-900 dark:hover:text-white">Sign in</Link>
            <Link to="/register-clinic" className="py-1 hover:text-gray-900 dark:hover:text-white">Create your clinic</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

function SiteHeader({ showContact }) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
          <ClinixLogo size={30} />
          <span className="text-lg">Clinix</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-6 text-sm text-gray-600 md:flex dark:text-gray-400">
          <a href="#features" className="py-2 hover:text-gray-900 dark:hover:text-white">Features</a>
          <a href="#how-it-works" className="py-2 hover:text-gray-900 dark:hover:text-white">How it works</a>
          <a href="#pricing" className="py-2 hover:text-gray-900 dark:hover:text-white">Pricing</a>
          {showContact && <a href="#contact" className="py-2 hover:text-gray-900 dark:hover:text-white">Contact</a>}
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <Link
            to="/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Sign in
          </Link>
          <Link
            to="/register-clinic"
            className="hidden rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 min-[400px]:inline-flex"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            Clinic &amp; OPD management for India
          </p>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl dark:text-white">
            Run your whole clinic from one screen
          </h1>
          <p className="mt-5 text-lg leading-8 text-gray-600 dark:text-gray-400">
            Patients, appointments, the OPD queue, prescriptions and billing - built for clinics with
            one to five doctors. Works on any phone, tablet or computer.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/register-clinic" className={primaryButton}>
              Create your clinic <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <a href="#features" className={secondaryButton}>
              See what it does
            </a>
          </div>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Free to get started during early access. No card needed.
          </p>
        </div>
        <ProductPreview />
      </div>
    </section>
  )
}

// A drawn, simplified picture of the app (today's queue and a prescription)
// - decorative, so screen readers skip it.
function ProductPreview() {
  const queue = [
    { token: 7, name: 'Priya S.', status: 'With doctor', tone: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
    { token: 8, name: 'Rahul M.', status: 'Waiting', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
    { token: 9, name: 'Anita K.', status: 'Waiting', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  ]
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xl sm:p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Today&apos;s queue</p>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
            Now serving 7
          </span>
        </div>
        <ul className="mt-4 space-y-2">
          {queue.map((row) => (
            <li key={row.token} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2.5 dark:border-gray-800">
              <span className="flex min-w-0 items-center gap-3">
                <span className="w-6 text-center text-sm font-bold text-gray-400">{row.token}</span>
                <span className="truncate text-sm text-gray-800 dark:text-gray-200">{row.name}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${row.tone}`}>{row.status}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="relative -mt-6 ml-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl sm:ml-12 sm:p-5 dark:border-gray-800 dark:bg-gray-900">
        <p className="text-xl font-bold italic text-blue-600 dark:text-blue-400">Rx</p>
        <div className="mt-2 space-y-2 text-sm">
          {[
            ['Paracetamol 650mg', '1-1-1 · 5 days'],
            ['Cetirizine 10mg', '0-0-1 · 5 days'],
          ].map(([med, dose]) => (
            <div key={med} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-gray-100 pb-2 last:border-0 dark:border-gray-800">
              <span className="font-medium text-gray-900 dark:text-white">{med}</span>
              <span className="text-gray-500 dark:text-gray-400">{dose}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-right text-xs text-gray-400">Signed · Dr. Kavita Nair</p>
      </div>
    </div>
  )
}
