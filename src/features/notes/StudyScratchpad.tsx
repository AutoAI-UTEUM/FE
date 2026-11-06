import { useRef, useState, type PointerEvent } from 'react'

import { readWorkspaceValue, workspaceKey, writeWorkspaceValue } from './workspaceStorage'

type Point = [number, number]
type Note = { strokes: Point[][]; text: string }
const emptyNote: Note = { strokes: [], text: '' }

function readNote(key: string): { note: Note; failed: boolean } {
  try {
    const data = readWorkspaceValue(key) as Note | null
    if (!data || typeof data.text !== 'string' || data.text.length > 5000 || !Array.isArray(data.strokes) || data.strokes.length > 100) return { note: emptyNote, failed: false }
    const valid = data.strokes.every((stroke) => Array.isArray(stroke) && stroke.length <= 300 && stroke.every((point) => Array.isArray(point) && point.length === 2 && point.every((coordinate) => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1000)))
    return { note: valid ? data : emptyNote, failed: false }
  } catch {
    return { note: emptyNote, failed: true }
  }
}

export function StudyScratchpad({ owner, scope }: { owner: string; scope: string }) {
  return <Scratchpad key={workspaceKey(owner, scope)} storageKey={workspaceKey(owner, scope)} />
}

function Scratchpad({ storageKey }: { storageKey: string }) {
  const [initial] = useState(() => readNote(storageKey))
  const [note, setNote] = useState(initial.note)
  const [failed, setFailed] = useState(initial.failed)
  const [currentStroke, setCurrentStroke] = useState<Point[]>([])
  const drawing = useRef<{ id: number; points: Point[] } | null>(null)

  function save(next: Note) {
    setNote(next)
    try {
      writeWorkspaceValue(storageKey, next)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  function point(event: PointerEvent<SVGSVGElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect()
    return [Math.max(0, Math.min(1000, (event.clientX - bounds.left) / Math.max(1, bounds.width) * 1000)), Math.max(0, Math.min(500, (event.clientY - bounds.top) / Math.max(1, bounds.height) * 500))]
  }

  function finish(event: PointerEvent<SVGSVGElement>) {
    if (drawing.current?.id !== event.pointerId) return
    const points = drawing.current.points
    drawing.current = null
    setCurrentStroke([])
    save({ ...note, strokes: [...note.strokes, points] })
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return <details className="mt-3 rounded-lg border border-stone-200 bg-white p-3">
    <summary className="min-h-11 cursor-pointer type-control font-semibold text-stone-800">펜 · 메모</summary>
    <p className="mb-2 type-caption text-stone-500">이 계정의 이 브라우저에서 마지막 저장 후 7일 이내 복원할 수 있습니다. 답안으로 제출되지 않습니다.</p>
    <svg aria-label="펜으로 쓰는 풀이 노트" className="w-full touch-none rounded-lg border border-stone-300 bg-stone-50" onPointerDown={(event) => {
      if (drawing.current || event.button !== 0 || note.strokes.length >= 100) return
      event.preventDefault()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      drawing.current = { id: event.pointerId, points: [point(event)] }
      setCurrentStroke(drawing.current.points)
    }} onPointerMove={(event) => {
      if (drawing.current?.id !== event.pointerId || drawing.current.points.length >= 300) return
      drawing.current.points = [...drawing.current.points, point(event)]
      setCurrentStroke(drawing.current.points)
    }} onPointerUp={finish} onPointerCancel={finish} viewBox="0 0 1000 500">
      {[...note.strokes, ...(currentStroke.length ? [currentStroke] : [])].map((stroke, index) => stroke.length === 1
        ? <circle cx={stroke[0][0]} cy={stroke[0][1]} fill="#292524" key={index} r="2" />
        : <polyline fill="none" key={index} points={stroke.map((position) => position.join(',')).join(' ')} stroke="#292524" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />)}
    </svg>
    <div className="my-2 flex flex-wrap gap-2">
      <button className="min-h-11 rounded border border-stone-300 px-3 type-caption disabled:opacity-50" disabled={!note.strokes.length} onClick={() => save({ ...note, strokes: note.strokes.slice(0, -1) })} type="button">한 획 되돌리기</button>
      <button className="min-h-11 rounded border border-stone-300 px-3 type-caption disabled:opacity-50" disabled={!note.strokes.length} onClick={() => save({ ...note, strokes: [] })} type="button">필기 지우기</button>
    </div>
    {note.strokes.length >= 100 ? <p className="type-caption text-amber-800">필기 공간이 찼습니다. 일부 획을 지우고 계속 써 주세요.</p> : null}
    <label className="block type-control text-stone-700">글자 메모<textarea className="mt-1 min-h-24 w-full rounded-lg border border-stone-300 p-3" maxLength={5000} onChange={(event) => save({ ...note, text: event.target.value })} value={note.text} /></label>
    <p className={`mt-2 type-caption ${failed ? 'text-rose-700' : 'text-stone-500'}`} role="status">{failed ? '브라우저 저장 실패: 이 화면을 떠나면 메모가 사라질 수 있습니다.' : '변경할 때 이 브라우저에 자동 저장됩니다.'}</p>
  </details>
}
