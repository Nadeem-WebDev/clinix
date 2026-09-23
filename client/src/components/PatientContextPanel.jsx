import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { getPatient } from '../api/patients.js'
import { listConsultations } from '../api/consultations.js'
import PatientAvatar from './PatientAvatar.jsx'

// Gives the doctor the context the spec calls for at the top of the
// consultation screen: patient info, allergies, medical history, and
// previous visits. Previous prescriptions/documents will join this once
// those modules exist.
export default function PatientContextPanel({ patientId }) {
  const { data: patient } = useQuery({
    queryKey: ['patients', patientId],
    queryFn: () => getPatient(patientId),
    enabled: Boolean(patientId),
  })
  const { data: history } = useQuery({
    queryKey: ['consultations', { patientId }],
    queryFn: () => listConsultations({ patientId, limit: 5 }),
    enabled: Boolean(patientId),
  })

  if (!patient) return null

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-3">
        <PatientAvatar name={patient.fullName} size={40} />
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{patient.fullName}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {patient.patientId} · {patient.gender} · {patient.phone}
          </p>
        </div>
      </div>

      {patient.allergies?.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Allergies</p>
            <p>{patient.allergies.join(', ')}</p>
          </div>
        </div>
      )}

      {patient.medicalConditions?.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Medical Conditions
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">{patient.medicalConditions.join(', ')}</p>
        </div>
      )}

      {patient.medicalHistory && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Medical History
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">{patient.medicalHistory}</p>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Previous Visits
        </p>
        {!history?.consultations.length && (
          <p className="text-sm text-gray-400 dark:text-gray-500">No previous consultations.</p>
        )}
        <ul className="space-y-1.5">
          {history?.consultations.map((c) => (
            <li key={c._id} className="text-sm text-gray-700 dark:text-gray-300">
              <span className="text-gray-400 dark:text-gray-500">
                {new Date(c.createdAt).toLocaleDateString()}
              </span>{' '}
              — {c.diagnosis || 'No diagnosis recorded'}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
