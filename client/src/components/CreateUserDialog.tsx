import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { createUserSchema, type CreateUserInput } from 'core'
import { Loader2, Plus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import UserForm, { userFormDefaults } from '@/components/UserForm.tsx'
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

function CreateUserDialog() {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: userFormDefaults,
  })

  const createUser = useMutation({
    mutationFn: (values: CreateUserInput) => axios.post('/api/users', values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      handleOpenChange(false)
    },
    onError: (error) => {
      // 400/409 carry a readable message from the server; fall back to the status otherwise
      const serverMessage = (error.response?.data as { error?: string } | undefined)?.error
      form.setError('root.serverError', {
        message: serverMessage ?? `Could not create user (${errorMessage(error)}).`,
      })
    },
  })

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      form.reset(userFormDefaults)
      createUser.reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          New user
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>New users can sign in as agents right away.</DialogDescription>
        </DialogHeader>
        <UserForm form={form} onSubmit={(values) => createUser.mutate(values)}>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending && <Loader2 className="animate-spin" />}
              {createUser.isPending ? 'Creating…' : 'Create user'}
            </Button>
          </DialogFooter>
        </UserForm>
      </DialogContent>
    </Dialog>
  )
}

export default CreateUserDialog
