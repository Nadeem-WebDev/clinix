import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listPatients } from '../api/patients.js'
import { useDebouncedValue } from '../hooks/useDebouncedValue.js'
import SearchInput from './SearchInput.jsx'

// A search-as-you-type patient selector for the appointment booking form.
// Keeps its own text input state separate from the selected value - typing
// searches, clicking a result commits the selection.
export default function PatientPicker({ value, onChange, selectedLabel }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const debouncedQuery = useDebouncedValue(query)

  const { data, isLoading } = useQuery({
    queryKey: ['patients', 'picker', debouncedQuery],
    queryFn: () => listPatients({ search: debouncedQuery, limit: 8 }),
    enabled: open && debouncedQuery.length > 0,
  })

  useEffect(() => {
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  if (value && selectedLabel && !open) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
        <span className="text-gray-900 dark:text-gray-100">{selectedLabel}</span>
        <button
          type="button"
          onClick={() => {
            onChange('')
            setQuery('')
          }}
          className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <SearchInput
        value={query}
        onChange={(v) => {
          setQuery(v)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search patient by name, phone, or ID…"
      />
      {open && debouncedQuery && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
          {isLoading && (
            <p className="p-3 text-sm text-gray-500 dark:text-gray-400">Searching…</p>
          )}
          {!isLoading && data?.patients.length === 0 && (
            <p className="p-3 text-sm text-gray-500 dark:text-gray-400">No patients found</p>
          )}
          {!isLoading &&
            data?.patients.map((patient) => (
              <button
                key={patient._id}
                type="button"
                onClick={() => {
                  onChange(patient._id, patient)
                  setOpen(false)
                }}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {patient.fullName}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {patient.patientId} · {patient.phone}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
