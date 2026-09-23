import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Image as ImageIcon, ExternalLink, Trash2 } from 'lucide-react'
import Button from './Button.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'

function icon(mimeType) {
  return mimeType === 'application/pdf' ? FileText : ImageIcon
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentList({ documents, onView, onDelete, showPatient = false }) {
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(confirmTarget._id)
      setConfirmTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
        {documents.map((doc) => {
          const Icon = icon(doc.mimeType)
          return (
            <li key={doc._id} className="flex items-center gap-3 bg-white p-3 dark:bg-gray-900">
              <Icon size={18} className="shrink-0 text-gray-400" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {doc.documentType}
                  {showPatient && doc.patientId && (
                    <>
                      {' · '}
                      <Link to={`/patients/${doc.patientId._id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                        {doc.patientId.fullName}
                      </Link>
                    </>
                  )}
                </p>
                <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                  {doc.originalFilename} · {formatSize(doc.fileSize)} · {doc.uploadedBy?.name} ·{' '}
                  {new Date(doc.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button variant="ghost" onClick={() => onView(doc._id)} aria-label="View">
                <ExternalLink size={14} aria-hidden="true" />
              </Button>
              <Button variant="ghost" onClick={() => setConfirmTarget(doc)} aria-label="Delete">
                <Trash2 size={14} className="text-red-600 dark:text-red-400" aria-hidden="true" />
              </Button>
            </li>
          )
        })}
      </ul>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title="Delete this document?"
        description={`"${confirmTarget?.originalFilename}" will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmTarget(null)}
      />
    </>
  )
}
