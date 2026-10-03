import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { CreateExamInput } from './examsRepository'
import { ExamEditor } from './ExamEditor'
import { createQuestion, isExamDraftValid } from './examEditorModel'

afterEach(cleanup)

describe('ExamEditor acceptance contract', () => {
  it('rejects empty and Unicode-only required text while accepting meaningful Unicode', () => {
    const valid = draft({
      questions: [createQuestion('SHORT', '자료구조 🧭', 0.25)],
      title: '중간고사 – αβ',
    })

    expect(isExamDraftValid(valid)).toBe(true)
    expect(isExamDraftValid({ ...valid, title: '\u3000\u00a0\u202f' })).toBe(false)
    expect(isExamDraftValid({
      ...valid,
      questions: [createQuestion('SHORT', '\u2003\u3000', 10)],
    })).toBe(false)
    expect(isExamDraftValid({
      ...valid,
      questions: [createQuestion('SHORT', '유효한 문제', 0)],
    })).toBe(false)
  })

  it('switches every supported question type with deterministic choices and keeps text and points', () => {
    render(<ControlledEditor initial={draft({
      questions: [createQuestion('SHORT', '유니코드 문제 Ω', 7.5)],
      title: '편집 계약',
    })} />)

    const questionSection = screen.getByRole('strong').closest('section') ?? document.body
    const type = screen.getByRole('combobox', { name: '1번 문항 유형' })
    fireEvent.change(type, { target: { value: 'MCQ' } })

    let value = readDraft()
    expect(value.questions[0]).toMatchObject({
      answerChoiceId: 'a',
      options: [
        { id: 'a', text: '' },
        { id: 'b', text: '' },
        { id: 'c', text: '' },
        { id: 'd', text: '' },
      ],
      points: 7.5,
      questionText: '유니코드 문제 Ω',
      questionType: 'MCQ',
    })

    const textboxes = within(questionSection).getAllByRole('textbox')
    fireEvent.change(textboxes[2]!, { target: { value: '선택지 나 – β' } })
    fireEvent.click(within(questionSection).getAllByRole('radio')[1]!)
    value = readDraft()
    expect(value.questions[0]?.options?.[1]?.text).toBe('선택지 나 – β')
    expect(value.questions[0]?.answerChoiceId).toBe('b')

    fireEvent.change(type, { target: { value: 'OX' } })
    expect(readDraft().questions[0]).toMatchObject({
      answerValue: true,
      points: 7.5,
      questionText: '유니코드 문제 Ω',
      questionType: 'OX',
    })
    fireEvent.change(type, { target: { value: 'ESSAY' } })
    expect(readDraft().questions[0]).toMatchObject({
      modelAnswer: '',
      points: 7.5,
      questionText: '유니코드 문제 Ω',
      questionType: 'ESSAY',
    })
    fireEvent.change(type, { target: { value: 'SHORT' } })
    expect(readDraft().questions[0]).toMatchObject({
      points: 7.5,
      questionText: '유니코드 문제 Ω',
      questionType: 'SHORT',
      referenceAnswer: '',
    })
  })

  it('keeps fractional per-question points whose current-contract total is exact', () => {
    const value = draft({
      questions: [
        createQuestion('MCQ', '1번', 2.25),
        createQuestion('OX', '2번', 3.5),
        createQuestion('ESSAY', '3번', 4.25),
      ],
      title: '배점 합계',
    })

    expect(isExamDraftValid(value)).toBe(true)
    expect(value.questions.reduce((sum, question) => sum + question.points, 0)).toBe(10)
  })
})

function ControlledEditor({ initial }: { initial: CreateExamInput }) {
  const [value, setValue] = useState(initial)
  return <>
    <ExamEditor onChange={setValue} value={value} />
    <output data-testid="draft-state">{JSON.stringify(value)}</output>
  </>
}

function draft(overrides: Partial<CreateExamInput> = {}): CreateExamInput {
  return {
    allowRetake: false,
    description: '',
    questions: [createQuestion('SHORT')],
    title: '',
    ...overrides,
  }
}

function readDraft(): CreateExamInput {
  return JSON.parse(screen.getByTestId('draft-state').textContent ?? '{}') as CreateExamInput
}
