import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUp,
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

// --- Motion ------------------------------------------------------------------
// Plain CSS transitions driven by IntersectionObserver - no animation library.
// Everything is off for visitors who ask for reduced motion (motion-safe: /
// motion-reduce: in the classes, and prefersReducedMotion() in JS), and
// without IntersectionObserver (old browsers, tests) content simply shows.

function prefersReducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

// True once the element has scrolled into view; stays true.
function useInView() {
  const ref = useRef(null)
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || inView) return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -60px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [inView])
  return [ref, inView]
}

// Fades and slides its children up as they scroll into view. `delay` (ms)
// staggers items in a grid. Wraps rather than styles the content, so a
// card's own hover transition isn't slowed by the delay.
function Reveal({ as: Tag = 'div', delay = 0, className = '', children }) {
  const [ref, inView] = useInView()
  return (
    <Tag
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`transition duration-700 ease-out motion-reduce:transition-none ${
        inView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100'
      } ${className}`}
    >
      {children}
    </Tag>
  )
}

function useScrolledPast(px) {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > px)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [px])
  return past
}

// The section in the middle of the screen, for highlighting its header link.
function useActiveSection(ids) {
  const [active, setActive] = useState(null)
  const key = ids.join(',')
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id)
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    for (const id of key.split(',')) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [key])
  return active
}

const sectionTitle = 'text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl dark:text-white'
const sectionLead = 'mt-3 max-w-2xl text-base text-gray-600 dark:text-gray-400'
const primaryButton =
  'group inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950'
// The arrow in a primary button nudges right on hover.
const buttonArrow = 'transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none'
const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800'

const NAV_SECTIONS = ['features', 'how-it-works', 'pricing', 'contact']

export default function Landing() {
  const { isAuthenticated } = useAuth()
  const showBackToTop = useScrolledPast(600)

  // Smooth scrolling for the in-page links, on this page only: set on <html>
  // (where scroll-behavior applies) and removed on leaving, so the app's own
  // navigation isn't animated. motion-safe: skips it under reduced motion.
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('motion-safe:scroll-smooth')
    return () => root.classList.remove('motion-safe:scroll-smooth')
  }, [])

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
            <Reveal>
              <h2 className={sectionTitle}>Everything a small clinic runs on</h2>
              <p className={sectionLead}>
                From the moment a patient walks in to the receipt in their hand - one app for your
                front desk, your doctors and you.
              </p>
            </Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ Icon, title, text }, i) => (
                <Reveal key={title} delay={(i % 3) * 100}>
                  <div className="group h-full rounded-xl border border-gray-200 bg-white p-5 transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-900">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors duration-200 group-hover:bg-blue-600 group-hover:text-white dark:bg-blue-950 dark:text-blue-400 dark:group-hover:bg-blue-500 dark:group-hover:text-white">
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">{title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-gray-600 dark:text-gray-400">{text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <h2 className={sectionTitle}>A visit, start to finish</h2>
              <p className={sectionLead}>
                Each step hands the patient to the next person - nobody hunts for paperwork.
              </p>
            </Reveal>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, i) => (
                <Reveal as="li" key={step.text} delay={i * 120}>
                  <div className="group h-full rounded-xl border border-gray-200 p-5 transition duration-200 hover:border-blue-200 hover:shadow-md motion-reduce:transition-none dark:border-gray-800 dark:hover:border-blue-900">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none">
                      {i + 1}
                    </span>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">{step.who}</p>
                    <p className="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-300">{step.text}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-gray-100 bg-gray-50 py-16 sm:py-20 dark:border-gray-900 dark:bg-gray-900/40">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <Reveal>
              <h2 className={sectionTitle}>Everyone sees what they need</h2>
              <p className={sectionLead}>Five roles, each with exactly the access their job needs.</p>
              <ul className="mt-8 space-y-3">
                {ROLES.map(({ role, text }) => (
                  <li key={role} className="flex gap-3 rounded-lg bg-white p-4 transition duration-200 hover:translate-x-1 hover:shadow-sm motion-reduce:transition-none motion-reduce:hover:translate-x-0 dark:bg-gray-900">
                    <UserCog size={20} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <span className="font-semibold text-gray-900 dark:text-white">{role}.</span> {text}
                    </p>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={150}>
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
            </Reveal>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-20 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <h2 className={sectionTitle}>Simple pricing</h2>
              <p className={sectionLead}>Pick a plan by the number of doctors. Every plan includes every core feature.</p>
            </Reveal>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {PLANS.map((plan, i) => (
                <Reveal key={plan.name} delay={i * 120}>
                  <div
                    className={`flex h-full flex-col rounded-2xl border p-6 transition duration-200 hover:-translate-y-1 hover:shadow-xl motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
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
                </Reveal>
              ))}
            </div>
            <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
              Prices are per clinic, before GST. Getting started is free while Clinix is in early access.
            </p>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 border-t border-gray-100 bg-gray-50 py-16 sm:py-20 dark:border-gray-900 dark:bg-gray-900/40">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <Reveal>
              <h2 className={sectionTitle}>Questions clinics ask</h2>
            </Reveal>
            <Reveal delay={100} className="mt-8">
              <div className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
                {FAQS.map(({ q, a }) => (
                  <details key={q} className="group p-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-gray-900 transition-colors hover:text-blue-700 dark:text-white dark:hover:text-blue-400">
                      {q}
                      <span className="text-xl leading-none text-gray-400 transition-transform group-open:rotate-45" aria-hidden="true">
                        +
                      </span>
                    </summary>
                    {/* Re-runs each time the answer opens: a closed <details> body isn't rendered. */}
                    <p className="mt-3 text-sm leading-6 text-gray-600 motion-safe:animate-fade-in dark:text-gray-400">{a}</p>
                  </details>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <section id="contact" className="scroll-mt-20 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal className="rounded-2xl bg-blue-600 px-6 py-10 text-center sm:px-12 dark:bg-blue-700">
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Ready to run your clinic from one screen?</h2>
              <p className="mx-auto mt-3 max-w-xl text-blue-100">
                Set up your clinic in a few minutes, or talk to us first - we&apos;re happy to show you around.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  to="/register-clinic"
                  className="group inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 hover:shadow-lg"
                >
                  Create your clinic <ArrowRight size={16} aria-hidden="true" className={buttonArrow} />
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
            </Reveal>
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

      {showBackToTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })}
          aria-label="Back to top"
          className="fixed bottom-4 right-4 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 motion-safe:animate-fade-up dark:focus-visible:ring-offset-gray-950"
        >
          <ArrowUp size={20} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function SiteHeader({ showContact }) {
  const scrolled = useScrolledPast(8)
  const active = useActiveSection(NAV_SECTIONS)
  const navLink = (id, label) => (
    <a
      href={`#${id}`}
      aria-current={active === id ? 'location' : undefined}
      className={`relative py-2 transition-colors hover:text-gray-900 dark:hover:text-white ${
        active === id ? 'font-medium text-blue-700 dark:text-blue-400' : ''
      }`}
    >
      {label}
      {/* Underline that grows under the section you're reading. */}
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 bottom-0.5 h-0.5 origin-left rounded-full bg-blue-600 transition-transform duration-300 motion-reduce:transition-none dark:bg-blue-400 ${
          active === id ? 'scale-x-100' : 'scale-x-0'
        }`}
      />
    </a>
  )
  return (
    <header
      className={`sticky top-0 z-30 border-b bg-white/90 backdrop-blur transition-shadow dark:bg-gray-950/90 ${
        scrolled ? 'border-gray-200 shadow-sm dark:border-gray-800' : 'border-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
          <ClinixLogo size={30} />
          <span className="text-lg">Clinix</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-6 text-sm text-gray-600 md:flex dark:text-gray-400">
          {navLink('features', 'Features')}
          {navLink('how-it-works', 'How it works')}
          {navLink('pricing', 'Pricing')}
          {showContact && navLink('contact', 'Contact')}
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
            className="hidden rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 hover:shadow-md min-[400px]:inline-flex"
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
        {/* Entrance: each line fades up a moment after the one before. */}
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 motion-safe:animate-fade-up dark:bg-blue-950 dark:text-blue-300">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400" />
            </span>
            Clinic &amp; OPD management for India
          </p>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-gray-900 motion-safe:animate-fade-up motion-safe:[animation-delay:100ms] sm:text-5xl dark:text-white">
            Run your whole clinic from one screen
          </h1>
          <p className="mt-5 text-lg leading-8 text-gray-600 motion-safe:animate-fade-up motion-safe:[animation-delay:200ms] dark:text-gray-400">
            Patients, appointments, the OPD queue, prescriptions and billing - built for clinics with
            one to five doctors. Works on any phone, tablet or computer.
          </p>
          <div className="mt-8 flex flex-col gap-3 motion-safe:animate-fade-up motion-safe:[animation-delay:300ms] sm:flex-row">
            <Link to="/register-clinic" className={primaryButton}>
              Create your clinic <ArrowRight size={16} aria-hidden="true" className={buttonArrow} />
            </Link>
            <a href="#features" className={secondaryButton}>
              See what it does
            </a>
          </div>
          <p className="mt-4 text-sm text-gray-500 motion-safe:animate-fade-up motion-safe:[animation-delay:400ms] dark:text-gray-400">
            Free to get started during early access. No card needed.
          </p>
        </div>
        <ProductPreview />
      </div>
    </section>
  )
}

// A drawn, simplified picture of the app (today's queue and a prescription)
// - decorative, so screen readers skip it. The queue moves along every few
// seconds like a real OPD: the patient with the doctor leaves, the next one
// goes in, and a new token joins at the back. Still under reduced motion.
const PREVIEW_PATIENTS = ['Priya S.', 'Rahul M.', 'Anita K.', 'Imran A.', 'Sneha P.', 'Vikram R.']
const FIRST_TOKEN = 7
const WITH_DOCTOR = 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
const WAITING = 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'

function useQueueTicker(intervalMs) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (prefersReducedMotion()) return undefined
    const id = setInterval(() => setStep((n) => (n + 1) % (PREVIEW_PATIENTS.length - 2)), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return step
}

function ProductPreview() {
  const step = useQueueTicker(2800)
  const serving = FIRST_TOKEN + step
  const queue = [0, 1, 2].map((offset) => ({
    token: serving + offset,
    name: PREVIEW_PATIENTS[step + offset],
    status: offset === 0 ? 'With doctor' : 'Waiting',
    tone: offset === 0 ? WITH_DOCTOR : WAITING,
  }))
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md motion-safe:animate-fade-up motion-safe:[animation-delay:250ms] lg:max-w-none">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xl sm:p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Today&apos;s queue</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 motion-safe:animate-pulse" />
            {/* Keyed by token so the number fades in fresh each time it changes. */}
            Now serving <span key={serving} className="motion-safe:animate-fade-in">{serving}</span>
          </span>
        </div>
        <ul className="mt-4 space-y-2">
          {queue.map((row, i) => (
            <li
              key={row.token}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-500 motion-safe:animate-fade-up ${
                i === 0 ? 'border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30' : 'border-gray-100 dark:border-gray-800'
              }`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="w-6 text-center text-sm font-bold text-gray-400">{row.token}</span>
                <span className="truncate text-sm text-gray-800 dark:text-gray-200">{row.name}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-500 ${row.tone}`}>{row.status}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="relative -mt-6 ml-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl motion-safe:animate-float sm:ml-12 sm:p-5 dark:border-gray-800 dark:bg-gray-900">
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
