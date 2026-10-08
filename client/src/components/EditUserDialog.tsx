import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { updateUserSchema, type UpdateUserInput } from 'core'
import { Loader2, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import UserForm from '@/components/UserForm.tsx'
import type { User } from '@/components/UsersTable.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.tsx'
import { errorMessage } from '@/lib/query-client.ts'

function EditUserDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const current: UpdateUserInput = { name: user.name, email: user.email, password: '' }
  const form = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: current,
  })

  const updateUser = useMutation({
    mutationFn: (values: UpdateUserInput) => axios.patch(`/api/users/${user.id}`, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      handleOpenChange(false)
    },
    onError: (error) => {
      // 400/404/409 carry a readable message from the server; fall back to the status otherwise
      const serverMessage = (error.response?.data as { error?: string } | undefined)?.error
      form.setError('root.serverError', {
        message: serverMessage ?? `Could not update user (${errorMessage(error)}).`,
      })
    },
  })

  function handleOpenChange(next: boolean) {
    setOpen(next)
    // Opening shows the user's current details (the list may have refetched since);
    // closing discards unsaved edits
    form.reset(current)
    if (!next) updateUser.reset()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Edit ${user.name}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>Change this user's details. Leave the password blank to keep it.</DialogDescription>
        </DialogHeader>
        <UserForm
          form={form}
          onSubmit={(values) => updateUser.mutate(values)}
          passwordOptional
          idPrefix={`edit-user-${user.id}`}
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={updateUser.isPending}>
              {updateUser.isPending && <Loader2 className="animate-spin" />}
              {updateUser.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </UserForm>
      </DialogContent>
    </Dialog>
  )
}

export default EditUserDialog
