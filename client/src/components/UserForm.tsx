import type { CreateUserInput } from 'core'
import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Controller, type UseFormReturn } from 'react-hook-form'
import { Alert, AlertDescription } from '@/components/ui/alert.tsx'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'

export const userFormDefaults: CreateUserInput = { name: '', email: '', password: '' }

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
  form: UseFormReturn<CreateUserInput>
  onSubmit: (values: CreateUserInput) => void
  // Action buttons, rendered after the fields (include a type="submit" button)
  children: ReactNode
}

// Name / email / password fields for a user, validated by the form's resolver
function UserForm({ form, onSubmit, children }: UserFormProps) {
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
              <FieldLabel htmlFor={`new-user-${field.name}`}>Name</FieldLabel>
              <Input
                {...field}
                id={`new-user-${field.name}`}
                name={`new-user-${field.name}`}
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
              <FieldLabel htmlFor={`new-user-${field.name}`}>Email</FieldLabel>
              <Input
                {...field}
                id={`new-user-${field.name}`}
                name={`new-user-${field.name}`}
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
              <FieldLabel htmlFor={`new-user-${field.name}`}>Password</FieldLabel>
              <Input
                {...field}
                id={`new-user-${field.name}`}
                name={`new-user-${field.name}`}
                {...noAutofill}
                // Masked text input, not type="password": see noAutofill above
                type="text"
                spellCheck={false}
                className="[-webkit-text-security:disc]"
                aria-invalid={fieldState.invalid}
              />
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
