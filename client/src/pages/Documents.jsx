import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listDocuments, getDocumentUrl, deleteDocument } from '../api/documents.js'
import DocumentList from '../components/DocumentList.jsx'
import LoadingState from '../components/LoadingState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import EmptyState from '../components/EmptyState.jsx'

export default function Documents() {
  const queryClient = useQueryClient()
  const queryKey = ['documents', {}]

  const { data: documents, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => listDocuments(),
  })

  const handleView = async (id) => {
    const url = await getDocumentUrl(id)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleDelete = async (id) => {
    await deleteDocument(id)
    queryClient.invalidateQueries({ queryKey })
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">Documents</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Uploaded from a patient&apos;s profile. Most recent first.
      </p>

      {isLoading && <LoadingState label="Loading documents…" />}
      {isError && <ErrorState onRetry={refetch} />}
      {!isLoading && !isError && documents.length === 0 && (
        <EmptyState
          title="No documents yet"
          description="Upload one from a patient's profile (Documents tab)."
        />
      )}
      {!isLoading && !isError && documents.length > 0 && (
        <DocumentList documents={documents} onView={handleView} onDelete={handleDelete} showPatient />
      )}
    </div>
  )
}
