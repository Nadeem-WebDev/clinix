import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileDown, Undo2, Plus } from 'lucide-react'
import InvoiceForm from '../components/InvoiceForm.jsx'
import Button from '../components/Button.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Modal from '../components/Modal.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import {
  getInvoice,
  updateInvoice,
  recordPayment,
  listPayments,
  refundInvoice,
  receiptPdfUrl,
} from '../api/invoices.js'
import { fromInvoice, toInvoicePayload, paymentFormSchema, PAYMENT_METHODS } from '../schemas/invoice.js'
import LoadingState from '../components/LoadingState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import BackButton from '../components/BackButton.jsx'

function money(n) {
  return (Number(n) || 0).toFixed(2)
}

function PaymentModal({ open, onClose, onRecorded, invoiceId, balance }) {
  const [serverError, setServerError] = useState(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: { amount: String(balance), method: 'CASH', notes: '' },
  })

  // react-hook-form's defaultValues only apply on the hook's initial
  // mount - this component stays mounted across opens/closes (Modal just
  // hides its content), so without this the pre-filled amount would stay
  // frozen at whatever the balance was the very first time it opened,
  // silently going stale after any partial payment.
  useEffect(() => {
    if (open) reset({ amount: String(balance), method: 'CASH', notes: '' })
  }, [open, balance, reset])

  const onSubmit = async (values) => {
    setServerError(null)
    try {
      const result = await recordPayment(invoiceId, {
        amount: Number(values.amount),
        method: values.method,
        ...(values.notes ? { notes: values.notes } : {}),
      })
      reset()
      onRecorded(result)
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Could not record payment.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record Payment">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {serverError && (
          <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {serverError}
          </p>
        )}
        <div>
          <label htmlFor="amount" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Amount (balance: {money(balance)})
          </label>
          <input
            id="amount"
            type="number"
            step="0.01"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            {...register('amount')}
          />
          {errors.amount && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.amount.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="method" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Method
          </label>
          <select
            id="method"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            {...register('method')}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Record Payment
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function InvoiceDetail() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState(null)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [confirmRefund, setConfirmRefund] = useState(false)
  const [refunding, setRefunding] = useState(false)

  const { data: invoice, isLoading, isError, refetch } = useQuery({
    queryKey: ['invoices', id],
    queryFn: () => getInvoice(id),
  })
  const { data: payments } = useQuery({
    queryKey: ['invoices', id, 'payments'],
    queryFn: () => listPayments(id),
    enabled: Boolean(invoice),
  })

  if (isLoading) return <LoadingState label="Loading invoice…" />
  if (isError) return <ErrorState onRetry={refetch} />

  const balance = Math.max(0, invoice.total - invoice.amountPaid)
  const readOnly = invoice.amountPaid > 0

  const onSubmit = async (values) => {
    setServerError(null)
    try {
      const updated = await updateInvoice(id, toInvoicePayload(values))
      queryClient.setQueryData(['invoices', id], updated)
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    }
  }

  const handleRefund = async () => {
    setRefunding(true)
    try {
      const updated = await refundInvoice(id)
      queryClient.setQueryData(['invoices', id], updated)
      setConfirmRefund(false)
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Could not refund.')
      setConfirmRefund(false)
    } finally {
      setRefunding(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <BackButton />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {invoice.invoiceNumber}
            </h1>
            <StatusBadge status={invoice.paymentStatus} />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {invoice.patientId?.fullName}
            {invoice.doctorId?.name ? ` · Dr. ${invoice.doctorId.name}` : ''} ·{' '}
            {new Date(invoice.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={receiptPdfUrl(id)} target="_blank" rel="noreferrer">
            <Button variant="secondary">
              <FileDown size={16} aria-hidden="true" />
              View / Print Receipt
            </Button>
          </a>
          {invoice.paymentStatus !== 'REFUNDED' && balance > 0 && (
            <Button onClick={() => setPaymentModalOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              Record Payment
            </Button>
          )}
          {invoice.paymentStatus !== 'REFUNDED' && invoice.amountPaid > 0 && (
            <Button variant="danger" onClick={() => setConfirmRefund(true)}>
              <Undo2 size={16} aria-hidden="true" />
              Refund
            </Button>
          )}
        </div>
      </div>

      <InvoiceForm
        defaultValues={fromInvoice(invoice)}
        onSubmit={onSubmit}
        submitLabel="Save Changes"
        serverError={serverError}
        readOnly={readOnly}
      />

      {payments?.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Payments</h2>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            {payments.map((p) => (
              <li key={p._id} className="flex justify-between px-3 py-2 text-sm">
                <span className="text-gray-700 dark:text-gray-300">
                  {new Date(p.paidAt).toLocaleDateString()} · {p.method}
                </span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        invoiceId={id}
        balance={balance}
        onRecorded={({ invoice: updatedInvoice }) => {
          queryClient.setQueryData(['invoices', id], updatedInvoice)
          queryClient.invalidateQueries({ queryKey: ['invoices', id, 'payments'] })
          setPaymentModalOpen(false)
        }}
      />

      <ConfirmDialog
        open={confirmRefund}
        title="Refund this invoice?"
        description="This marks the invoice as refunded. It won't reverse individual payments - that's a full accounting flow this MVP doesn't implement yet."
        confirmLabel="Refund"
        loading={refunding}
        onConfirm={handleRefund}
        onCancel={() => setConfirmRefund(false)}
      />
    </div>
  )
}
