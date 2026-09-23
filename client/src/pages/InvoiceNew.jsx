import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import InvoiceForm from '../components/InvoiceForm.jsx'
import PatientPicker from '../components/PatientPicker.jsx'
import { listStaff } from '../api/staff.js'
import { getClinicSettings } from '../api/clinic.js'
import { createInvoice } from '../api/invoices.js'
import { toInvoicePayload } from '../schemas/invoice.js'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

export default function InvoiceNew() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState(null)
  const [patient, setPatient] = useState(null)
  const [doctorId, setDoctorId] = useState('')

  const { data: staff } = useQuery({ queryKey: ['staff'], queryFn: listStaff })
  const doctors = (staff ?? []).filter((u) => u.role === 'doctor')

  // Clinic Settings' default consultation fee prefills the bill's line
  // item, so the receptionist starts from a sensible amount instead of a
  // blank price on every invoice.
  const { data: clinic } = useQuery({ queryKey: ['clinic', 'settings'], queryFn: getClinicSettings })

  const onSubmit = async (values) => {
    setServerError(null)
    if (!patient) {
      setServerError('Select a patient first.')
      return
    }
    try {
      const invoice = await createInvoice({
        patientId: patient._id,
        ...(doctorId ? { doctorId } : {}),
        ...toInvoicePayload(values),
      })
      navigate(`/billing/${invoice._id}`, { replace: true })
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-xl font-semibold text-gray-900 dark:text-gray-100">Create Bill</h1>

      <div className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Patient
          </label>
          <PatientPicker
            value={patient?._id}
            selectedLabel={patient ? `${patient.fullName} (${patient.patientId})` : null}
            onChange={(_id, p) => setPatient(p)}
          />
        </div>
        <div>
          <label htmlFor="doctorId" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Doctor (optional)
          </label>
          <select id="doctorId" className={inputClass} value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            <option value="">None</option>
            {doctors.map((d) => (
              <option key={d._id} value={d._id}>
                Dr. {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <InvoiceForm
        // Remounts once the clinic's default fee arrives, so react-hook-form
        // picks it up as the item's initial unitPrice (defaultValues are only
        // read once, at mount - see FormField/InvoiceForm conventions).
        key={clinic ? 'loaded' : 'loading'}
        defaultValues={{
          items: [
            {
              description: 'Consultation Fee',
              quantity: '1',
              unitPrice: clinic ? String(clinic.defaultConsultationFee ?? 0) : '',
            },
          ],
          discount: '',
          tax: '',
          notes: '',
        }}
        onSubmit={onSubmit}
        submitLabel="Create Invoice"
        serverError={serverError}
      />
    </div>
  )
}
