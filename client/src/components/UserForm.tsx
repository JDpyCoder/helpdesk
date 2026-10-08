import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Controller, type UseFormReturn } from 'react-hook-form'
import { Alert, AlertDescription } from '@/components/ui/alert.tsx'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'

// Shape of both CreateUserInput and UpdateUserInput from core
export type UserFormValues = { name: string; email: string; password: string }

export const userFormDefaults: UserFormValues = { name: '', email: '', password: '' }

// Chromium browsers (Brave, Chrome) ignore autocomplete="off" on any form with an
// <input type="password"> and fill in the signed-in admin's own saved login. So the
// password field is a text input masked with CSS, which leaves the browser's password
// manager nothing to detect; the data-* attributes opt out of 1Password, LastPass and
// Bitwarden too.
const noAutofill = {
  autoComplete: 'off',
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': true,
  'data-form-type': 'other',
} as const

type UserFormProps = {
  // Owned by the caller, so it can reset the form and set root.serverError from a mutation
  form: UseFormReturn<UserFormValues>
  onSubmit: (values: UserFormValues) => void
  // Action buttons, rendered after the fields (include a type="submit" button)
  children: ReactNode
  // Editing: a blank password keeps the current one, so say so under the field
  passwordOptional?: boolean
  // Prefix for input ids/names, unique per form so two forms on a page never share ids
  idPrefix?: string
}

// Name / email / password fields for a user, validated by the form's resolver
function UserForm({ form, onSubmit, children, passwordOptional = false, idPrefix = 'new-user' }: UserFormProps) {
  const { errors } = form.formState

  return (
    <form autoComplete="off" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        {errors.root?.serverError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{errors.root.serverError.message}</AlertDescription>
          </Alert>
        )}

        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${idPrefix}-${field.name}`}>Name</FieldLabel>
              <Input
                {...field}
                id={`${idPrefix}-${field.name}`}
                name={`${idPrefix}-${field.name}`}
                autoComplete="off"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${idPrefix}-${field.name}`}>Email</FieldLabel>
              <Input
                {...field}
                id={`${idPrefix}-${field.name}`}
                name={`${idPrefix}-${field.name}`}
                {...noAutofill}
                type="email"
                placeholder="agent@example.com"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${idPrefix}-${field.name}`}>Password</FieldLabel>
              <Input
                {...field}
                id={`${idPrefix}-${field.name}`}
                name={`${idPrefix}-${field.name}`}
                {...noAutofill}
                // Masked text input, not type="password": see noAutofill above
                type="text"
                spellCheck={false}
                className="[-webkit-text-security:disc]"
                aria-invalid={fieldState.invalid}
              />
              {passwordOptional && (
                <FieldDescription>Leave blank to keep the current password.</FieldDescription>
              )}
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {children}
      </FieldGroup>
    </form>
  )
}

export default UserForm
