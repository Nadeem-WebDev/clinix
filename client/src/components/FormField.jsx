import { cloneElement } from 'react'

// A <label> with no `htmlFor` and a sibling (not nested) input has zero
// programmatic association with its control - invisible to screen readers
// and to any accessibility-based test query (getByLabelText). This wraps
// a single form control and wires that association via id/htmlFor, using
// cloneElement so every call site only has to name the field once.
export default function FormField({ name, label, error, hint, children, className }) {
  return (
    <div className={className}>
      <label
        htmlFor={name}
        className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
      </label>
      {cloneElement(children, { id: name, ...(hint ? { 'aria-describedby': `${name}-hint` } : {}) })}
      {hint && (
        <p id={`${name}-hint`} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {hint}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error.message}</p>}
    </div>
  )
}
