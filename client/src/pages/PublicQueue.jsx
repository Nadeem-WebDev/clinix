import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Clock, Users } from 'lucide-react'
import { getPublicQueue } from '../api/publicQueue.js'

// The no-login waiting-room page (/q/:slug). Rendered outside the
// authenticated app shell - no sidebar, no header, no redirect to /login -
// because its two audiences are a patient's phone and a TV on the waiting
// room wall, neither of which has an account.
//
// Everything it can display is already masked server-side (see
// publicQueue.service.js); this file must not assume it can request more.

// Slow enough not to hammer the API from every phone in the room, fast
// enough that "now serving" is never meaningfully stale.
const POLL_INTERVAL_MS = 12000

function Panel({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 ${className}`}>
      {children}
    </div>
  )
}

function CenteredMessage({ title, description }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 dark:bg-gray-950">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
        <p className="mt-3 text-base text-gray-600 dark:text-gray-400">{description}</p>
      </div>
    </main>
  )
}

export default function PublicQueue() {
  const { slug } = useParams()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['public-queue', slug],
    queryFn: () => getPublicQueue(slug),
    refetchInterval: POLL_INTERVAL_MS,
    // A TV is left open for hours; keep polling even when the tab isn't
    // focused, which is the normal state for a wall-mounted screen.
    refetchIntervalInBackground: true,
    retry: false,
  })

  if (isLoading) {
    return <CenteredMessage title="Loading…" description="Fetching the current queue." />
  }

  if (isError) {
    // A bad or retired link is the common case here, and the person
    // holding it can't do anything technical about it - say so plainly
    // rather than showing a status code.
    if (error?.response?.status === 404) {
      return (
        <CenteredMessage
          title="Queue not found"
          description="This link doesn't match a clinic. Please check the link from your clinic, or ask at the front desk."
        />
      )
    }
    return (
      <CenteredMessage
        title="Can't load the queue"
        description="Something went wrong on our side. This page retries by itself, so please leave it open."
      />
    )
  }

  const { clinicName, nowServing, waitingCount, upcoming, estimatedWaitMinutes, isEstimate } = data

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 dark:bg-gray-950 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-5xl">
            {clinicName}
          </h1>
          <p className="mt-2 text-base text-gray-500 dark:text-gray-400 sm:text-lg">Live queue status</p>
        </header>

        <Panel className="mb-6 text-center">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 sm:text-base">
            Now Serving
          </h2>
          {/* aria-live so a patient using a screen reader hears the token
              change without re-navigating; polite, not assertive, because
              it updates on a timer rather than from their own action. */}
          <div aria-live="polite">
            {nowServing.length === 0 ? (
              <p className="mt-4 text-2xl font-medium text-gray-400 dark:text-gray-500 sm:text-3xl">
                No one is being seen right now
              </p>
            ) : (
              <ul className="mt-4 flex flex-wrap items-end justify-center gap-x-12 gap-y-6">
                {nowServing.map((entry) => (
                  <li key={`${entry.doctorName}-${entry.tokenNumber}`}>
                    <p className="text-7xl font-bold leading-none text-blue-600 dark:text-blue-400 sm:text-9xl">
                      {entry.tokenNumber}
                    </p>
                    <p className="mt-3 text-lg text-gray-600 dark:text-gray-300 sm:text-2xl">
                      Dr. {entry.doctorName}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Panel className="text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
              <Users size={18} aria-hidden="true" />
              Waiting
            </p>
            <p className="mt-3 text-5xl font-bold text-gray-900 dark:text-gray-100 sm:text-6xl">
              {waitingCount}
            </p>
          </Panel>

          <Panel className="text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
              <Clock size={18} aria-hidden="true" />
              Estimated wait
            </p>
            <p className="mt-3 text-5xl font-bold text-gray-900 dark:text-gray-100 sm:text-6xl">
              {estimatedWaitMinutes}
              <span className="ml-2 text-2xl font-medium text-gray-500 dark:text-gray-400">min</span>
            </p>
            {isEstimate && (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Rough estimate — actual wait may differ
              </p>
            )}
          </Panel>
        </div>

        {upcoming.length > 0 && (
          <Panel>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
              Up next
            </h2>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {upcoming.map((entry) => (
                <li key={entry.tokenNumber} className="flex items-center gap-6 py-3">
                  <span className="min-w-[3.5rem] text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:text-4xl">
                    {entry.tokenNumber}
                  </span>
                  <span className="text-xl text-gray-600 dark:text-gray-300 sm:text-2xl">
                    {entry.patientName}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <p className="mt-8 text-center text-sm text-gray-400 dark:text-gray-500">
          This screen updates automatically.
        </p>
      </div>
    </main>
  )
}
