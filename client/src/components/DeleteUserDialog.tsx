import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { AlertCircle, Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { User } from '@/components/UsersTable.tsx'
import { Alert, AlertDescription } from '@/components/ui/alert.tsx'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.tsx'
import { errorMessage } from '@/lib/query-client.ts'
import { Role } from 'core'

function DeleteUserDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const deleteUser = useMutation({
    mutationFn: () => axios.delete(`/api/users/${user.id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      handleOpenChange(false)
    },
  })

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) deleteUser.reset()
  }

  // The server refuses too; this explains why before anyone tries
  if (user.role === Role.ADMIN) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Disabled buttons get no pointer or focus events, so the span carries the tooltip */}
          <span tabIndex={0} className="inline-flex">
            <Button variant="ghost" size="icon" aria-label={`Delete ${user.name}`} disabled>
              <Trash2 />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Admins can't be deleted</TooltipContent>
      </Tooltip>
    )
  }

  // 403/404 carry a readable message from the server; fall back to the status otherwise
  const serverMessage = (deleteUser.error?.response?.data as { error?: string } | undefined)?.error

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Delete ${user.name}`} className="text-destructive">
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete user</AlertDialogTitle>
          <AlertDialogDescription>
            Delete {user.name} ({user.email})? They will be signed out and can no longer sign in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteUser.error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>
              {serverMessage ?? `Could not delete user (${errorMessage(deleteUser.error)}).`}
            </AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {/* A plain button, not AlertDialogAction, so the dialog stays open if the request fails */}
          <Button variant="destructive" disabled={deleteUser.isPending} onClick={() => deleteUser.mutate()}>
            {deleteUser.isPending && <Loader2 className="animate-spin" />}
            {deleteUser.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default DeleteUserDialog
