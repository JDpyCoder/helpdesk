import { randomUUID } from 'node:crypto'
import { expect, signIn, signInViaApi, test, uniqueEmail, type Credentials } from './fixtures'
import type { APIRequestContext, Locator, Page } from '@playwright/test'

// Happy-path reference for the admin user-management page (/users): list, create,
// update and delete, driven through the UI the way an admin uses it. Validation, errors,
// permissions and other edge cases live in users.spec.ts, edit-user.spec.ts and
// delete-user.spec.ts.

type ApiUser = { id: string; name: string; email: string; role: string; createdAt: string }

type UserDetails = Pick<Credentials, 'name' | 'email'>

function newUserDetails(label: string): Credentials {
  return {
    name: `${label} ${randomUUID().slice(0, 6)}`,
    email: uniqueEmail(label.toLowerCase().replace(/\s+/g, '-')),
    password: `pw-${randomUUID()}`,
  }
}

function usersTable(page: Page) {
  return page.getByRole('table')
}

function userRow(page: Page, email: string) {
  return usersTable(page).getByRole('row').filter({ hasText: email })
}

// Signs in as the admin and opens the users page through the NavBar link
async function openUsersPage(page: Page, admin: Credentials) {
  await signIn(page, admin)
  await page.getByRole('link', { name: 'Users' }).click()
  await expect(page).toHaveURL('/users')
  await expect(page.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible()
  await expect(usersTable(page)).toBeVisible()
}

// The Created column as the browser renders it (toLocaleDateString in the page's locale)
async function createdDate(page: Page, email: string) {
  const { users } = (await (await page.request.get('/api/users')).json()) as { users: ApiUser[] }
  const user = users.find((u) => u.email === email)
  expect(user, `no user with email ${email}`).toBeDefined()
  return page.evaluate((iso) => new Date(iso).toLocaleDateString(), user!.createdAt)
}

async function expectAgentRow(page: Page, user: UserDetails) {
  await expect(userRow(page, user.email).getByRole('cell')).toHaveText([
    user.name,
    user.email,
    'Agent',
    await createdDate(page, user.email),
    '',
  ])
}

async function fillUserForm(dialog: Locator, values: { name: string; email: string; password: string }) {
  await dialog.getByLabel('Name').fill(values.name)
  await dialog.getByLabel('Email').fill(values.email)
  await dialog.getByLabel('Password').fill(values.password)
}

async function createUserThroughUi(page: Page, user: Credentials) {
  await page.getByRole('button', { name: 'New user' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create user' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('New users can sign in as agents right away.')).toBeVisible()

  await fillUserForm(dialog, user)
  await dialog.getByRole('button', { name: 'Create user' }).click()

  await expect(dialog).toBeHidden()
}

// Opens the edit dialog for `user`, checks it is pre-filled, saves `changes`
async function editUserThroughUi(page: Page, user: UserDetails, changes: { name: string; email: string; password: string }) {
  await page.getByRole('button', { name: `Edit ${user.name}` }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit user' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Name')).toHaveValue(user.name)
  await expect(dialog.getByLabel('Email')).toHaveValue(user.email)
  await expect(dialog.getByLabel('Password')).toHaveValue('')
  await expect(dialog.getByText('Leave blank to keep the current password.')).toBeVisible()

  await fillUserForm(dialog, changes)
  await dialog.getByRole('button', { name: 'Save changes' }).click()

  await expect(dialog).toBeHidden()
}

async function deleteUserThroughUi(page: Page, user: UserDetails) {
  await page.getByRole('button', { name: `Delete ${user.name}` }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Delete user' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(
    `Delete ${user.name} (${user.email})? They will be signed out and can no longer sign in.`,
  )

  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(dialog).toBeHidden()
}

// Signs in with a separate API context (not the admin's browser) and checks who it is
async function expectCanSignIn(request: APIRequestContext, user: Credentials) {
  await signInViaApi(request, user)
  const me = await (await request.get('/api/me')).json()
  expect(me.user).toMatchObject({ name: user.name, email: user.email, role: 'AGENT' })
}

test.describe('User management', () => {
  test('lists every user with their name, email, role and created date', async ({ page, admin, agent }) => {
    await openUsersPage(page, admin)

    await expect(page.getByText('People who can sign in to the helpdesk')).toBeVisible()
    await expect(usersTable(page).getByRole('columnheader')).toHaveText(['Name', 'Email', 'Role', 'Created', 'Actions'])

    await expect(userRow(page, admin.email).getByRole('cell')).toHaveText([
      admin.name,
      admin.email,
      'Admin',
      await createdDate(page, admin.email),
      '',
    ])
    await expectAgentRow(page, agent)
  })

  test('creates an agent who can sign in right away', async ({ page, request, admin }) => {
    const newAgent = newUserDetails('New Agent')
    await openUsersPage(page, admin)

    await createUserThroughUi(page, newAgent)

    await expectAgentRow(page, newAgent)
    await expectCanSignIn(request, newAgent)
  })

  test('updates an agent\'s name and email and keeps their password', async ({ page, request, admin, agent }) => {
    const updated = { ...newUserDetails('Renamed Agent'), password: agent.password }
    await openUsersPage(page, admin)

    await editUserThroughUi(page, agent, { name: updated.name, email: updated.email, password: '' })

    await expectAgentRow(page, updated)
    await expect(userRow(page, agent.email)).toHaveCount(0)
    // New email, old password
    await expectCanSignIn(request, updated)
  })

  test('sets a new password for an agent', async ({ page, request, admin, agent }) => {
    const newPassword = `new-pw-${randomUUID()}`
    await openUsersPage(page, admin)

    await editUserThroughUi(page, agent, { name: agent.name, email: agent.email, password: newPassword })

    await expectAgentRow(page, agent)
    await expectCanSignIn(request, { ...agent, password: newPassword })
  })

  test('deletes an agent after confirmation', async ({ page, admin, agent }) => {
    await openUsersPage(page, admin)
    await expectAgentRow(page, agent)

    await deleteUserThroughUi(page, agent)

    await expect(userRow(page, agent.email)).toHaveCount(0)
    await page.reload()
    await expect(userRow(page, admin.email)).toHaveCount(1)
    await expect(userRow(page, agent.email)).toHaveCount(0)
  })

  test('takes one user through create, edit and delete', async ({ page, admin }) => {
    const created = newUserDetails('Lifecycle Agent')
    const edited = newUserDetails('Lifecycle Edited')
    await openUsersPage(page, admin)

    await test.step('create', async () => {
      await createUserThroughUi(page, created)
      await expectAgentRow(page, created)
    })

    await test.step('edit', async () => {
      await editUserThroughUi(page, created, edited)
      await expectAgentRow(page, edited)
      await expect(userRow(page, created.email)).toHaveCount(0)
    })

    await test.step('delete', async () => {
      await deleteUserThroughUi(page, edited)
      await expect(userRow(page, edited.email)).toHaveCount(0)
      await expect(userRow(page, admin.email)).toHaveCount(1)
    })
  })
})
