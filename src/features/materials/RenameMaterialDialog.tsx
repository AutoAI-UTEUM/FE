import { X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'

import { Button } from '../../shared/ui'
import {
  MAX_MATERIAL_TITLE_LENGTH,
  validateMaterialTitle,
} from './materialUploadValidation'

export function RenameMaterialDialog({
  initialTitle,
  onClose,
  onSave,
}: {
  initialTitle: string
  onClose: () => void
  onSave: (title: string) => Promise<boolean>
}) {
  const [title, setTitle] = useState(initialTitle)
  const [isSaving, setIsSaving] = useState(false)
  const saveInFlightRef = useRef(false)
  const titleError = validateMaterialTitle(title)
  const isUnchanged = title.trim() === initialTitle.trim()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (titleError || isUnchanged || saveInFlightRef.current) return

    saveInFlightRef.current = true
    setIsSaving(true)
    try {
      if (await onSave(title.trim())) onClose()
    } finally {
      saveInFlightRef.current = false
      setIsSaving(false)
    }
  }

  return (
    <div
      aria-label="자료 이름 변경"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4"
      role="dialog"
    >
      <form className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onSubmit={submit}>
        <div className="flex items-center justify-between">
          <h2 className="type-dialog-title font-bold text-stone-950">자료 이름 변경</h2>
          <button
            aria-label="자료 이름 변경 닫기"
            className="flex size-8 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </div>
        <label className="mt-5 block type-control font-semibold text-stone-700">
          자료 제목
          <input
            autoFocus
            className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 type-body text-stone-950 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            disabled={isSaving}
            maxLength={MAX_MATERIAL_TITLE_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </label>
        {titleError ? <p className="mt-2 type-caption font-medium text-rose-700" role="alert">{titleError}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button disabled={isSaving} onClick={onClose} variant="secondary">취소</Button>
          <Button disabled={Boolean(titleError) || isUnchanged || isSaving} type="submit">
            {isSaving ? '저장 중' : '변경사항 저장'}
          </Button>
        </div>
      </form>
    </div>
  )
}
