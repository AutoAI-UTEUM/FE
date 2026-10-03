import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useCallback, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider, useAuth, type AuthenticatedRequest } from '../../features/auth'
import { AuthContext } from '../../features/auth/authContext'
import { ToastProvider } from '../../shared/ui'
import {
  apiFailure,
  apiSuccess,
  installApiFixtureServer,
} from '../../test/apiFixtureServer'
import { MaterialsPage } from './MaterialsPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function material(materialId: number, title: string) {
  return {
    createdAt: '2026-10-03T00:00:00Z',
    materialId,
    processingStatus: 'READY',
    title,
  }
}

function materialPage(items: ReturnType<typeof material>[]) {
  return {
    items,
    page: 0,
    size: 20,
    totalElements: items.length,
    totalPages: items.length > 0 ? 1 : 0,
  }
}

function loginAsBResponse() {
  return apiSuccess({
    accessToken: 'b-access-token',
    expiresIn: 3600,
    tokenType: 'Bearer',
    user: {
      email: 'b@example.com',
      id: 202,
      name: 'Account B',
      role: 'LEARNER',
    },
  })
}

function authorization(request: Request) {
  return request.headers.get('Authorization')
}

function AccountSwitchHarness({ changingRequestIdentity = false }) {
  const auth = useAuth()
  const { apiRequest, login, user } = auth
  const accountScope = user?.id ?? user?.email
  const accountScopedRequest = useCallback<AuthenticatedRequest>(
    (path, options) => {
      void accountScope
      return apiRequest(path, options)
    },
    [accountScope, apiRequest],
  )
  const materialsRequest = changingRequestIdentity
    ? accountScopedRequest
    : apiRequest
  const [initialRequest] = useState(() => ({ value: materialsRequest }))
  const context = changingRequestIdentity
    ? { ...auth, apiRequest: materialsRequest }
    : auth

  return (
    <>
      <output data-testid="account">{user?.email}</output>
      <output data-testid="request-identity">
        {initialRequest.value === materialsRequest ? 'stable' : 'changed'}
      </output>
      <button
        onClick={() => {
          void login({
            email: 'b@example.com',
            password: 'synthetic-password',
          })
        }}
        type="button"
      >
        Switch to B
      </button>
      <AuthContext.Provider value={context}>
        <MemoryRouter>
          <MaterialsPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </>
  )
}

function renderAccountSwitch(changingRequestIdentity = false) {
  return render(
    <AuthProvider
      initialUser={{
        email: 'a@example.com',
        id: 101,
        name: 'Account A',
        role: 'LEARNER',
      }}
    >
      <ToastProvider>
        <AccountSwitchHarness
          changingRequestIdentity={changingRequestIdentity}
        />
      </ToastProvider>
    </AuthProvider>,
  )
}

function uploadControls() {
  const fileInput = document.querySelector<HTMLInputElement>('#material-upload')
  const form = fileInput?.closest('form')
  const titleInput = form?.querySelector<HTMLInputElement>('input:not([type="file"])')
  const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (!fileInput || !form || !titleInput || !submit) {
    throw new Error('Upload controls were not rendered')
  }
  return { fileInput, form, submit, titleInput }
}

function materialButtons(title: string) {
  const article = screen.getByRole('heading', { name: title }).closest('article')
  if (!article) throw new Error(`Material article not found: ${title}`)
  const buttons = within(article).getAllByRole('button')
  if (buttons.length !== 2) throw new Error(`Unexpected actions for: ${title}`)
  return { deleteButton: buttons[1], renameButton: buttons[0] }
}

describe('MaterialsPage account scope', () => {
  it.each([
    ['stable AuthProvider request', false, 'stable'],
    ['changing account-scoped request', true, 'changed'],
  ] as const)(
    'clears A rows and local controls before B list resolves with a %s',
    async (_label, changingRequestIdentity, expectedIdentity) => {
      const bList = deferred<Response>()
      installApiFixtureServer((request) => {
        const url = new URL(request.url)
        if (request.method === 'POST' && url.pathname === '/api/auth/login') {
          return loginAsBResponse()
        }
        if (request.method === 'GET' && url.pathname === '/api/materials') {
          return authorization(request) === 'Bearer b-access-token'
            ? bList.promise
            : apiSuccess(materialPage([material(41, 'A-private.pdf')]))
        }
        return undefined
      })
      renderAccountSwitch(changingRequestIdentity)

      await screen.findByRole('heading', { name: 'A-private.pdf' })
      fireEvent.click(materialButtons('A-private.pdf').renameButton)
      const beforeSwitch = uploadControls()
      fireEvent.change(beforeSwitch.fileInput, {
        target: {
          files: [
            new File(['synthetic'], 'A-selected.pdf', {
              type: 'application/pdf',
            }),
          ],
        },
      })
      expect(beforeSwitch.titleInput).toHaveValue('A-selected.pdf')
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Switch to B' }))
      await waitFor(() =>
        expect(screen.getByTestId('account')).toHaveTextContent('b@example.com'),
      )

      expect(screen.getByTestId('request-identity')).toHaveTextContent(
        expectedIdentity,
      )
      expect(
        screen.queryByRole('heading', { name: 'A-private.pdf' }),
      ).not.toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      const afterSwitch = uploadControls()
      expect(afterSwitch.titleInput).toHaveValue('')
      expect(afterSwitch.titleInput).toBeDisabled()
      expect(afterSwitch.submit).toBeDisabled()

      await act(async () => {
        bList.resolve(apiSuccess(materialPage([material(41, 'B-private.pdf')])))
      })
      expect(
        await screen.findByRole('heading', { name: 'B-private.pdf' }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'A-private.pdf' }),
      ).not.toBeInTheDocument()
    },
  )

  it('ignores a late A denial, shows B failure, and retries only B', async () => {
    const aList = deferred<Response>()
    let bListCalls = 0
    let aListSignal: AbortSignal | undefined
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'POST' && url.pathname === '/api/auth/login') {
        return loginAsBResponse()
      }
      if (request.method === 'GET' && url.pathname === '/api/materials') {
        if (authorization(request) !== 'Bearer b-access-token') {
          aListSignal = request.signal
          return aList.promise
        }
        bListCalls += 1
        return bListCalls === 1
          ? apiFailure('B_LIST_FAILED', 'B list failed', 500)
          : apiSuccess(materialPage([material(52, 'B-retry.pdf')]))
      }
      return undefined
    })
    renderAccountSwitch()
    await waitFor(() => expect(aListSignal).toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: 'Switch to B' }))
    expect(await screen.findByText('B list failed')).toBeInTheDocument()
    expect(aListSignal?.aborted).toBe(true)

    await act(async () => {
      aList.resolve(apiFailure('A_FORBIDDEN', 'A denied', 403))
    })
    expect(screen.queryByText('A denied')).not.toBeInTheDocument()
    expect(screen.getByText('B list failed')).toBeInTheDocument()

    const alert = screen.getByRole('alert')
    fireEvent.click(within(alert).getByRole('button'))
    expect(
      await screen.findByRole('heading', { name: 'B-retry.pdf' }),
    ).toBeInTheDocument()
    expect(bListCalls).toBe(2)
  })

  it.each([false, true])(
    'aborts a late A upload and unlocks a fresh B upload (changing request: %s)',
    async (changingRequestIdentity) => {
      const aUpload = deferred<Response>()
      let aUploadSignal: AbortSignal | undefined
      let bUploadCalls = 0
      installApiFixtureServer((request) => {
        const url = new URL(request.url)
        if (request.method === 'POST' && url.pathname === '/api/auth/login') {
          return loginAsBResponse()
        }
        if (request.method === 'GET' && url.pathname === '/api/materials') {
          if (authorization(request) === 'Bearer b-access-token') {
            return apiSuccess(
              materialPage([
                ...(bUploadCalls > 0 ? [material(62, 'B-upload.pdf')] : []),
                material(61, 'B-private.pdf'),
              ]),
            )
          }
          return apiSuccess(materialPage([material(61, 'A-private.pdf')]))
        }
        if (request.method === 'POST' && url.pathname === '/api/materials') {
          if (authorization(request) !== 'Bearer b-access-token') {
            aUploadSignal = request.signal
            return aUpload.promise
          }
          bUploadCalls += 1
          return apiSuccess(material(62, 'B-upload.pdf'))
        }
        return undefined
      })
      renderAccountSwitch(changingRequestIdentity)
      await screen.findByRole('heading', { name: 'A-private.pdf' })

      const aControls = uploadControls()
      fireEvent.change(aControls.fileInput, {
        target: {
          files: [new File(['A'], 'A-upload.pdf', { type: 'application/pdf' })],
        },
      })
      fireEvent.submit(aControls.form)
      await waitFor(() => expect(aUploadSignal).toBeDefined())

      fireEvent.click(screen.getByRole('button', { name: 'Switch to B' }))
      expect(
        await screen.findByRole('heading', { name: 'B-private.pdf' }),
      ).toBeInTheDocument()
      expect(aUploadSignal?.aborted).toBe(true)
      const bControls = uploadControls()
      expect(bControls.submit).toBeDisabled()

      await act(async () => {
        aUpload.resolve(apiSuccess(material(63, 'A-late-upload.pdf')))
      })
      expect(
        screen.queryByRole('heading', { name: 'A-late-upload.pdf' }),
      ).not.toBeInTheDocument()

      fireEvent.change(bControls.fileInput, {
        target: {
          files: [new File(['B'], 'B-upload.pdf', { type: 'application/pdf' })],
        },
      })
      fireEvent.submit(bControls.form)
      expect(
        await screen.findByRole('heading', { name: 'B-upload.pdf' }),
      ).toBeInTheDocument()
      expect(bUploadCalls).toBe(1)
    },
  )

  it('ignores a late A delete and leaves B delete controls usable', async () => {
    const aDelete = deferred<Response>()
    let aDeleteSignal: AbortSignal | undefined
    let bDeleted = false
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      const isB = authorization(request) === 'Bearer b-access-token'
      if (request.method === 'POST' && url.pathname === '/api/auth/login') {
        return loginAsBResponse()
      }
      if (request.method === 'GET' && url.pathname === '/api/materials') {
        return apiSuccess(
          materialPage(
            isB && bDeleted
              ? []
              : [material(71, isB ? 'B-delete.pdf' : 'A-delete.pdf')],
          ),
        )
      }
      if (request.method === 'DELETE' && url.pathname === '/api/materials/71') {
        if (!isB) {
          aDeleteSignal = request.signal
          return aDelete.promise
        }
        bDeleted = true
        return apiSuccess(null)
      }
      return undefined
    })
    renderAccountSwitch(true)
    await screen.findByRole('heading', { name: 'A-delete.pdf' })
    fireEvent.click(materialButtons('A-delete.pdf').deleteButton)
    await waitFor(() => expect(aDeleteSignal).toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: 'Switch to B' }))
    await screen.findByRole('heading', { name: 'B-delete.pdf' })
    expect(aDeleteSignal?.aborted).toBe(true)
    expect(materialButtons('B-delete.pdf').deleteButton).toBeEnabled()

    await act(async () => {
      aDelete.resolve(apiSuccess(null))
    })
    expect(
      screen.getByRole('heading', { name: 'B-delete.pdf' }),
    ).toBeInTheDocument()

    fireEvent.click(materialButtons('B-delete.pdf').deleteButton)
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'B-delete.pdf' }),
      ).not.toBeInTheDocument(),
    )
    expect(bDeleted).toBe(true)
  })

  it('closes an A rename and ignores its late completion before a B rename', async () => {
    const aRename = deferred<Response>()
    let aRenameSignal: AbortSignal | undefined
    let bTitle = 'B-rename.pdf'
    installApiFixtureServer(async (request) => {
      const url = new URL(request.url)
      const isB = authorization(request) === 'Bearer b-access-token'
      if (request.method === 'POST' && url.pathname === '/api/auth/login') {
        return loginAsBResponse()
      }
      if (request.method === 'GET' && url.pathname === '/api/materials') {
        return apiSuccess(
          materialPage([material(81, isB ? bTitle : 'A-rename.pdf')]),
        )
      }
      if (request.method === 'PATCH' && url.pathname === '/api/materials/81') {
        const body = await request.clone().json() as { title: string }
        if (!isB) {
          aRenameSignal = request.signal
          return aRename.promise
        }
        bTitle = body.title
        return apiSuccess(material(81, bTitle))
      }
      return undefined
    })
    renderAccountSwitch()
    await screen.findByRole('heading', { name: 'A-rename.pdf' })
    fireEvent.click(materialButtons('A-rename.pdf').renameButton)
    const aDialog = screen.getByRole('dialog')
    fireEvent.change(within(aDialog).getByRole('textbox'), {
      target: { value: 'A-late-rename.pdf' },
    })
    const aForm = within(aDialog).getByRole('textbox').closest('form')
    if (!aForm) throw new Error('Rename form was not rendered')
    fireEvent.submit(aForm)
    await waitFor(() => expect(aRenameSignal).toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: 'Switch to B' }))
    await screen.findByRole('heading', { name: 'B-rename.pdf' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(aRenameSignal?.aborted).toBe(true)

    await act(async () => {
      aRename.resolve(apiSuccess(material(81, 'A-late-rename.pdf')))
    })
    expect(
      screen.queryByRole('heading', { name: 'A-late-rename.pdf' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'B-rename.pdf' }),
    ).toBeInTheDocument()

    fireEvent.click(materialButtons('B-rename.pdf').renameButton)
    const bDialog = screen.getByRole('dialog')
    fireEvent.change(within(bDialog).getByRole('textbox'), {
      target: { value: 'B-renamed.pdf' },
    })
    const bForm = within(bDialog).getByRole('textbox').closest('form')
    if (!bForm) throw new Error('Rename form was not rendered')
    fireEvent.submit(bForm)
    expect(
      await screen.findByRole('heading', { name: 'B-renamed.pdf' }),
    ).toBeInTheDocument()
  })
})
