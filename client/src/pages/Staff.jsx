import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { UserCog, Plus, ShieldCheck, ShieldOff, AlertTriangle } from 'lucide-react'
import { listStaff, createStaff, setStaffActive } from '../api/staff.js'
import { staffFormSchema, STAFF_ROLES } from '../schemas/staff.js'
import Button from '../components/Button.jsx'
import FormField from '../components/FormField.jsx'
import Modal from '../components/Modal.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import LoadingState from '../components/LoadingState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import EmptyState from '../components/EmptyState.jsx'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', doctor: 'Doctor', receptionist: 'Receptionist', nurse: 'Nurse' }

// Owner/admin accounts can't be disabled here (the API rejects it) - the
// table just doesn't offer the action for those rows, rather than letting
// staff click it and hit a 403.
const CAN_TOGGLE_ACTIVE = ['doctor', 'receptionist', 'nurse']

export default function Staff() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [toggleTarget, setToggleTarget] = useState(null) // { _id, name, active }

  const {
    data: staff,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['staff'], queryFn: listStaff })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(staffFormSchema),
    defaultValues: { name: '', email: '', password: '', role: 'receptionist' },
  })

  const createMutation = useMutation({
    mutationFn: createStaff,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      setModalOpen(false)
      reset()
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }) => setStaffActive(id, active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      setToggleTarget(null)
    },
  })

  const openNewStaff = () => {
    setServerError(null)
    reset({ name: '', email: '', password: '', role: 'receptionist' })
    setModalOpen(true)
  }

  const onCreate = async (values) => {
    setServerError(null)
    try {
      await createMutation.mutateAsync(values)
    } catch (err) {
      setServerError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    }
  }

  const onConfirmToggle = async () => {
    await toggleMutation.mutateAsync({ id: toggleTarget._id, active: !toggleTarget.active })
  }

  if (isLoading) return <LoadingState label="Loading staff…" />
  if (isError) return <ErrorState onRetry={refetch} />

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
          <UserCog size={22} aria-hidden="true" />
          Staff
        </h1>
        <Button onClick={openNewStaff}>
          <Plus size={16} aria-hidden="true" />
          New Staff
        </Button>
      </div>

      {staff.length === 0 ? (
        <EmptyState
          title="No staff yet"
          description="Add your first doctor, receptionist, or nurse to get started."
          action={
            <Button variant="secondary" onClick={openNewStaff}>
              <Plus size={16} aria-hidden="true" />
              New Staff
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {staff.map((member) => (
                <tr key={member._id} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                  <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">{member.name}</td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{member.email}</td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                    {ROLE_LABELS[member.role] ?? member.role}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={member.active ? 'ACTIVE' : 'INACTIVE'} />
                  </td>
                  <td className="px-4 py-2.5">
                    {CAN_TOGGLE_ACTIVE.includes(member.role) && (
                      <button
                        type="button"
                        onClick={() => setToggleTarget(member)}
                        className={
                          member.active
                            ? 'flex items-center gap-1.5 text-red-600 hover:text-red-700 dark:text-red-400'
                            : 'flex items-center gap-1.5 text-green-600 hover:text-green-700 dark:text-green-400'
                        }
                      >
                        {member.active ? (
                          <>
                            <ShieldOff size={14} aria-hidden="true" />
                            Disable
                          </>
                        ) : (
                          <>
                            <ShieldCheck size={14} aria-hidden="true" />
                            Enable
                          </>
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Staff Member">
        <form onSubmit={handleSubmit(onCreate)} noValidate className="space-y-4">
          {serverError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {serverError}
            </div>
          )}

          <FormField name="name" label="Full name" error={errors.name}>
            <input className={inputClass} {...register('name')} />
          </FormField>
          <FormField name="email" label="Email" error={errors.email}>
            <input type="email" className={inputClass} {...register('email')} />
          </FormField>
          <FormField name="password" label="Temporary password" error={errors.password}>
            <input type="password" className={inputClass} {...register('password')} />
          </FormField>
          <FormField name="role" label="Role" error={errors.role}>
            <select className={inputClass} {...register('role')}>
              {STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Create Account
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        title={toggleTarget?.active ? 'Disable staff member?' : 'Enable staff member?'}
        description={
          toggleTarget?.active
            ? `${toggleTarget?.name} will no longer be able to log in.`
            : `${toggleTarget?.name} will be able to log in again.`
        }
        confirmLabel={toggleTarget?.active ? 'Disable' : 'Enable'}
        variant={toggleTarget?.active ? 'danger' : 'primary'}
        loading={toggleMutation.isPending}
        onConfirm={onConfirmToggle}
        onCancel={() => setToggleTarget(null)}
      />
    </div>
  )
}
