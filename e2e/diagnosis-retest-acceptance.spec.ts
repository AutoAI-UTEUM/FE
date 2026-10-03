import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAs } from './qa-helpers'

interface TurnBody {
  eventType?: string
  payload?: Record<string, unknown>
  requestId?: string
}

const diagnosisAnswer = 'Synthetic explanation with enough detail for correction.'

test.describe('diagnosis correction and retest acceptance with synthetic APIs', () => {
  test('submits a correction and starts a retest with the expected payload and navigation', async ({ page }) => {
    const turns: TurnBody[] = []
    const externalRequests = await installSyntheticDiagnosisApi(page, async (route, body) => {
      turns.push(body)
      await route.fulfill(successfulTurn(body))
    })

    await loginAs(page, 'LEARNER')
    await page.goto('/sessions/100/diagnosis/42')
    await submitDiagnosis(page)
    await expect(page.getByText('Synthetic correction summary')).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveValue(diagnosisAnswer)
    await expect(page.getByRole('textbox')).toBeDisabled()

    await page.getByRole('button', { name: 'OX' }).click()

    await expect(page).toHaveURL(/\/sessions\/100$/)
    expect(turns).toHaveLength(2)
    expect(turns[0]).toMatchObject({
      eventType: 'DIAGNOSIS_ANSWER_SUBMITTED',
      payload: { answer: diagnosisAnswer, diagnosisId: 42 },
    })
    expect(turns[1]).toMatchObject({
      eventType: 'QUIZ_TYPE_SELECTED',
      payload: { quizType: 'OX' },
    })
    expect(turns.every((turn) => typeof turn.requestId === 'string' && turn.requestId.length > 0)).toBe(true)
    expect(externalRequests).toEqual([])
  })

  test('preserves the correction and retries once after a failed retest', async ({ page }) => {
    const turns: TurnBody[] = []
    let retestAttempts = 0
    const externalRequests = await installSyntheticDiagnosisApi(page, async (route, body) => {
      turns.push(body)
      if (body.eventType === 'QUIZ_TYPE_SELECTED') {
        retestAttempts += 1
        if (retestAttempts === 1) {
          await route.fulfill({
            body: JSON.stringify({
              error: { code: 'SERVICE_UNAVAILABLE', details: [], message: 'Synthetic retest unavailable' },
              success: false,
            }),
            contentType: 'application/json',
            status: 503,
          })
          return
        }
      }
      await route.fulfill(successfulTurn(body))
    })

    await loginAs(page, 'LEARNER')
    await page.goto('/sessions/100/diagnosis/42')
    await submitDiagnosis(page)
    await page.getByRole('button', { name: 'OX' }).click()

    await expect(page).toHaveURL(/\/sessions\/100\/diagnosis\/42$/)
    await expect(page.getByRole('alert')).toHaveText('Synthetic retest unavailable')
    await expect(page.getByText('Synthetic correction summary')).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveValue(diagnosisAnswer)
    await expect(page.getByRole('textbox')).toBeDisabled()
    await expect(page.getByRole('button', { name: 'OX' })).toBeEnabled()

    await page.getByRole('button', { name: 'OX' }).click()

    await expect(page).toHaveURL(/\/sessions\/100$/)
    const retests = turns.filter((turn) => turn.eventType === 'QUIZ_TYPE_SELECTED')
    expect(turns.filter((turn) => turn.eventType === 'DIAGNOSIS_ANSWER_SUBMITTED')).toHaveLength(1)
    expect(retests).toHaveLength(2)
    expect(retests.map((turn) => turn.payload)).toEqual([
      { quizType: 'OX' },
      { quizType: 'OX' },
    ])
    expect(retests[0]?.requestId).not.toBe(retests[1]?.requestId)
    expect(externalRequests).toEqual([])
  })
})

async function submitDiagnosis(page: Page) {
  const answer = page.getByRole('textbox')
  await expect(answer).toBeVisible()
  await answer.fill(diagnosisAnswer)
  await page.locator('form button[type="submit"]').click()
}

async function installSyntheticDiagnosisApi(
  page: Page,
  handleTurn: (route: Route, body: TurnBody) => Promise<void>,
): Promise<string[]> {
  const externalRequests: string[] = []
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname !== '127.0.0.1') {
      externalRequests.push(url.origin)
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
  await page.route('**/api/sessions/100', async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          currentPage: 1,
          materialId: 10,
          pageStatus: 'EXPLAINED',
          pendingDiagnosis: {
            diagnosisId: 42,
            prompt: 'Explain the distinction using a concrete example.',
            quizScore: 48,
            sourceQuestion: 'Synthetic source question',
          },
          sessionId: 100,
          status: 'ACTIVE',
          uiActions: [],
          updatedAt: '2026-10-03T00:00:00Z',
        },
        message: 'Synthetic session restored',
        success: true,
      }),
      contentType: 'application/json',
      status: 200,
    })
  })
  await page.route('**/api/sessions/100/turns', async (route) => {
    await handleTurn(route, route.request().postDataJSON() as TurnBody)
  })
  return externalRequests
}

function successfulTurn(body: TurnBody) {
  const data = body.eventType === 'QUIZ_TYPE_SELECTED'
    ? { messages: [], state: { activeQuizId: 50 }, uiActions: [] }
    : {
        messages: [{
          content: 'Synthetic correction summary',
          createdAt: '2026-10-03T00:00:01Z',
          messageId: 501,
          messageType: 'REPAIR',
          senderType: 'AI',
        }],
        state: {},
        uiActions: [],
      }
  return {
    body: JSON.stringify({ data, message: 'Synthetic turn accepted', success: true }),
    contentType: 'application/json',
    status: 200,
  }
}
