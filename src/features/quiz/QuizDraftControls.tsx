import { useEffect, useRef, useState } from 'react'

import { readWorkspaceValue, workspaceKey, writeWorkspaceValue } from '../notes/workspaceStorage'
import type { PublicQuiz, QuizAnswers } from './quizTypes'

export function QuizDraftControls({ answers, onRestore, owner, quiz, submitted }: {
  answers: QuizAnswers
  onRestore: (answers: QuizAnswers) => void
  owner: string
  quiz: PublicQuiz
  submitted: boolean
}) {
  const storageKey = workspaceKey(owner, `quiz-draft:${quiz.id}`)
  const signature = JSON.stringify(quiz.questions)
  const [initial] = useState(() => {
    try {
      const data = readWorkspaceValue(storageKey) as { answers?: QuizAnswers; signature?: string } | null
      if (!data || data.signature !== signature || !data.answers || typeof data.answers !== 'object') return { answers: null, failed: false }
      const validAnswers = Object.entries(data.answers).filter(([id, value]) => {
        const question = quiz.questions.find((item) => item.id === id)
        return question && typeof value === 'string' && value.length <= 20000 && (!question.choices?.length || question.choices.some((choice) => choice.id === value))
      })
      return { answers: validAnswers.length ? Object.fromEntries(validAnswers) : null, failed: false }
    } catch {
      return { answers: null, failed: true }
    }
  })
  const [restorable, setRestorable] = useState(initial.answers)
  const [status, setStatus] = useState(initial.failed ? '브라우저 저장소를 열지 못했습니다.' : '답안 변경 시 자동 임시저장됩니다.')
  const previous = useRef(JSON.stringify(answers))

  function save() {
    try {
      writeWorkspaceValue(storageKey, { answers, signature })
      setRestorable(null)
      setStatus('이 브라우저에 임시저장했습니다. 아직 제출되지 않았습니다.')
    } catch {
      setStatus('임시저장 실패: 화면을 떠나면 답안이 사라질 수 있습니다.')
    }
  }

  useEffect(() => {
    if (submitted) {
      try { localStorage.removeItem(storageKey) } catch { /* A submitted server result remains authoritative. */ }
      return
    }
    const serialized = JSON.stringify(answers)
    if (previous.current === serialized) return
    previous.current = serialized
    let failed = false
    try {
      writeWorkspaceValue(storageKey, { answers, signature })
    } catch {
      failed = true
    }
    // Persist synchronously so leaving the route cannot cancel the write.
    // Publish the storage result after React finishes the current effect pass.
    let active = true
    queueMicrotask(() => {
      if (!active) return
      if (!failed) setRestorable(null)
      setStatus(failed ? '임시저장 실패: 화면을 떠나면 답안이 사라질 수 있습니다.' : '이 브라우저에 임시저장했습니다. 아직 제출되지 않았습니다.')
    })
    return () => { active = false }
  }, [answers, signature, storageKey, submitted])

  if (submitted) return null
  return <div className="mb-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
    <div className="flex flex-wrap items-center gap-2">
      <button className="min-h-11 rounded-lg border border-stone-300 bg-white px-3 type-caption font-semibold" onClick={save} type="button">답안 임시저장</button>
      {restorable ? <button className="min-h-11 rounded-lg border border-brand-300 bg-white px-3 type-caption font-semibold text-brand-800" onClick={() => { onRestore(restorable); setRestorable(null) }} type="button">저장한 답안 불러오기</button> : null}
    </div>
    <p className="mt-2 type-caption text-stone-600" role="status">{status}</p>
    <p className="mt-1 type-caption text-stone-500">이 계정의 이 브라우저에서 마지막 저장 후 7일 이내 복원할 수 있습니다. 다른 기기와 동기화되지 않습니다.</p>
  </div>
}
