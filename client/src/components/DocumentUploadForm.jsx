import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import Button from './Button.jsx'

const SUGGESTED_TYPES = ['Blood report', 'X-ray', 'MRI report', 'Previous prescription', 'Other']
const ACCEPTED = '.pdf,.jpg,.jpeg,.png'

export default function DocumentUploadForm({ onUpload }) {
  const [documentType, setDocumentType] = useState('')
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!documentType.trim()) {
      setError('Enter a document type.')
      return
    }
    if (!file) {
      setError('Choose a file first.')
      return
    }
    setUploading(true)
    try {
      await onUpload({ documentType: documentType.trim(), file })
      setDocumentType('')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setError(err.response?.data?.message ?? 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <div className="flex-1 min-w-[160px]">
        <label
          htmlFor="documentType"
          className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400"
        >
          Document type
        </label>
        <input
          id="documentType"
          list="document-type-suggestions"
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
          placeholder="Blood report"
          className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
        <datalist id="document-type-suggestions">
          {SUGGESTED_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
      <div>
        <label
          htmlFor="documentFile"
          className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400"
        >
          File (PDF, JPG, PNG - max 10MB)
        </label>
        <input
          id="documentFile"
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-gray-600 file:mr-2 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium dark:text-gray-400 dark:file:bg-gray-800 dark:file:text-gray-200"
        />
      </div>
      <Button type="submit" loading={uploading}>
        <Upload size={16} aria-hidden="true" />
        Upload
      </Button>
      {error && <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  )
}
