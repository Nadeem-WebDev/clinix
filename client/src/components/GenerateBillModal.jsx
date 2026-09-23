import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Modal from './Modal.jsx'
import InvoiceForm from './InvoiceForm.jsx'
import { getClinicSettings } from '../api/clinic.js'
import { createInvoice } from '../api/invoices.js'
import { toInvoicePayload } from '../schemas/invoice.js'

// Launched from a completed consultation's "Generate Bill" button - prefills
// the same "Consultation Fee" default the standalone /billing/new flow
// does (from Clinic Settings' defaultConsultationFee), but pre-links the
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
        // Remounts once the clinic's default fee arrives, so react-hook-form
        // picks it up as the item's initial unitPrice (defaultValues are
        // only read once, at mount).
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
    </Modal>
  )
}
