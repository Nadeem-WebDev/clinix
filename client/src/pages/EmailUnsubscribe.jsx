import { useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { MailX, CheckCircle2 } from 'lucide-react'
import Button from '../components/Button.jsx'
import ClinixLogo from '../components/ClinixLogo.jsx'
import { unsubscribeFromEmail } from '../api/emailPreferences.js'

// Where the "Unsubscribe" link in every notification email lands. Outside
// the signed-in app (no session, no sidebar): the patient has no account.
// It asks before acting, rather than unsubscribing on page load, so a mail
// scanner that pre-opens links can't unsubscribe anyone.
export default function EmailUnsubscribe() {
  const [searchParams] = useSearchParams()
  const p = searchParams.get('p') ?? ''
  const t = searchParams.get('t') ?? ''
  const mutation = useMutation({ mutationFn: () => unsubscribeFromEmail({ p, t }) })

  let content
  if (!p || !t) {
    content = <Message title="This link is incomplete" body="Please use the full unsubscribe link from the email." />
  } else if (mutation.isSuccess) {
    content = (
      <Message
        icon={<CheckCircle2 size={28} className="text-green-600 dark:text-green-400" aria-hidden="true" />}
        title="You've been unsubscribed"
        body={`You won't receive any more emails from ${mutation.data.clinicName}. You can still contact the clinic directly.`}
      />
    )
  } else if (mutation.isError) {
    content = (
      <Message
        title="This link isn't valid"
        body={
          mutation.error.response?.status === 429
            ? 'Too many attempts. Please try again in a few minutes.'
            : "We couldn't find the subscription this link belongs to. Please contact the clinic directly."
        }
      />
    )
  } else {
    content = (
      <>
        <Message
          icon={<MailX size={28} className="text-gray-500 dark:text-gray-400" aria-hidden="true" />}
          title="Unsubscribe from clinic emails?"
          body="You'll stop getting appointment confirmations, reminders and other updates from this clinic by email."
        />
        <div className="mt-6 flex justify-center">
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            Unsubscribe
          </Button>
        </div>
      </>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center sm:p-8 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-6 flex justify-center">
          <ClinixLogo />
        </div>
        {content}
      </div>
    </main>
  )
}

function Message({ icon, title, body }) {
  return (
    <div>
      {icon && <div className="mb-3 flex justify-center">{icon}</div>}
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{body}</p>
    </div>
  )
}
