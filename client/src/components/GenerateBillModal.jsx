import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Modal from './Modal.jsx'
import InvoiceForm from './InvoiceForm.jsx'
import { getClinicSettings } from '../api/clinic.js'
import { listStaff } from '../api/staff.js'
import { createInvoice } from '../api/invoices.js'
import { toInvoicePayload } from '../schemas/invoice.js'
import { consultationFeeFor } from '../schemas/staff.js'

// Launched from a completed consultation's "Generate Bill" button - prefills
// the same "Consultation Fee" the standalone /billing/new flow does (the
// doctor's own fee, else Clinic Settings' default), but pre-links the
// invoice to this specific patient/doctor/appointment/consultation.
export default function GenerateBillModal({ open, onClose, patientId, doctorId, appointmentId, consultationId }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState(null)

  const { data: clinic } = useQuery({
    queryKey: ['clinic', 'settings'],
    queryFn: getClinicSettings,
    enabled: open,
  })
  // A failed staff load only costs the doctor's own fee, not the bill.
  const { data: staff, isPending: staffPending } = useQuery({
    queryKey: ['staff'],
    queryFn: listStaff,
    enabled: open && Boolean(doctorId),
  })
  const feeReady = clinic && (!doctorId || !staffPending)
  const doctor = staff?.find((u) => u._id === doctorId)

  const mutation = useMutation({
    mutationFn: createInvoice,
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      onClose()
      navigate(`/billing/${invoice._id}`)
    },
  })

  const onSubmit = async (values) => {
    setServerError(null)
    try {
      await mutation.mutateAsync({
        patientId,
        ...(doctorId ? { doctorId } : {}),
        ...(appointmentId ? { appointmentId } : {}),
        ...(consultationId ? { consultationId } : {}),
        ...toInvoicePayload(values),
      })
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Generate Bill">
      <InvoiceForm
        // Remounts once the fee is known, so react-hook-form picks it up as
        // the item's initial unitPrice (defaultValues are only read once, at
        // mount).
        key={feeReady ? 'loaded' : 'loading'}
        defaultValues={{
          items: [
            {
              description: 'Consultation Fee',
              quantity: '1',
              unitPrice: feeReady ? String(consultationFeeFor(doctor, clinic)) : '',
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
    </Modal>
  )
}
