import type { Classroom, ClassroomWeek } from '../../../features/classrooms'
import { ButtonLink } from '../../../shared/ui'
import { sessionDetailPath } from '../../routes'

export function LearnerStudySummary({ classroom, weeks }: { classroom: Classroom; weeks: ClassroomWeek[] }) {
  const lastStudied = classroom.lastStudied
  const accessible = lastStudied && weeks.some((week) => week.status === 'PUBLISHED' && week.materials.some((material) => material.status === 'READY' && material.id === lastStudied.materialId))
  const progress = Number.isFinite(classroom.progressRate) ? Math.round(Math.max(0, Math.min(100, classroom.progressRate))) : null

  return <aside aria-label="내 학습 현황" className="mt-auto shrink-0 rounded-xl border border-brand-100 bg-brand-50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="type-control font-bold text-stone-900">내 학습 현황</h2>
      <span className="type-control font-bold text-brand-800">강의실 학습률 {progress === null ? '확인 필요' : `${progress}%`}</span>
    </div>
    {progress !== null ? <div aria-label="강의실 학습률" aria-valuemax={100} aria-valuemin={0} aria-valuenow={progress} className="mt-2 h-2 overflow-hidden rounded-full bg-white" role="progressbar"><div className="h-full rounded-full bg-brand-600" style={{ width: `${progress}%` }} /></div> : null}
    <p className="mt-2 type-caption text-stone-500">서버에 기록된 설명 완료 페이지 기준입니다.</p>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 flex-1 break-words type-caption text-stone-600">{accessible ? `${lastStudied.materialTitle} · 마지막 위치 ${lastStudied.pageNumber}쪽` : '목록에서 수업을 선택해 학습을 시작해 보세요.'}</p>
      {accessible ? <ButtonLink size="sm" to={sessionDetailPath(lastStudied.sessionId)}>하던 학습 계속하기</ButtonLink> : null}
    </div>
  </aside>
}
