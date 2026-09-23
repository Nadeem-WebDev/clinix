import { z } from 'zod'

const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, 'Description is required'),
  quantity: z.string().trim().min(1, 'Required'),
  unitPrice: z.string().trim().min(1, 'Required'),
})

export const invoiceFormSchema = z.object({
  items: z.array(invoiceItemSchema).min(1, 'Add at least one line item'),
  discount: z.string().trim().optional(),
  tax: z.string().trim().optional(),
  notes: z.string().trim().optional(),
})

export const emptyInvoiceItem = { description: '', quantity: '1', unitPrice: '' }

export function toInvoicePayload(values) {
  return {
    items: values.items.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    })),
    discount: values.discount ? Number(values.discount) : 0,
    tax: values.tax ? Number(values.tax) : 0,
    ...(values.notes ? { notes: values.notes } : {}),
  }
}

export function fromInvoice(invoice) {
  return {
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
    })),
    discount: invoice.discount ? String(invoice.discount) : '',
    tax: invoice.tax ? String(invoice.tax) : '',
    notes: invoice.notes ?? '',
  }
}

export const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'ONLINE', 'OTHER']

export const paymentFormSchema = z.object({
  amount: z.string().trim().min(1, 'Amount is required'),
  method: z.enum(PAYMENT_METHODS),
  notes: z.string().trim().optional(),
})
