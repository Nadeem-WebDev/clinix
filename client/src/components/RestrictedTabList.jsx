import { useQuery } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import LoadingState from './LoadingState.jsx'
import ErrorState from './ErrorState.jsx'
import EmptyState from './EmptyState.jsx'

// Shared shape for a patient-profile tab backed by a role-gated list
// endpoint (Consultations, Prescriptions, ...): shows a clear "Restricted"
// state instead of attempting - and failing - the API call for roles that
// aren't permitted to see it.
export default function RestrictedTabList({
  active,
  canView,
  queryKey,
  queryFn,
  emptyTitle,
  emptyDescription,
  renderItem,
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn,
    enabled: active && canView,
  })

  if (!canView) {
    return (
      <EmptyState icon={Lock} title="Restricted" description="Not shown to your role." />
    )
  }
  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState onRetry={refetch} />
  if (!data?.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return <ul className="space-y-2">{data.map(renderItem)}</ul>
}
