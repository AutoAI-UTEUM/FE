import {
  BookOpen,
  FileText,
  Minus,
  Plus,
  Search,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../../../features/auth'
import {
  createClassroomsRepository,
  type Classroom,
  type ClassroomColor,
  type ClassroomMaterial,
  type CreateClassroomInput,
} from '../../../features/classrooms'
import { getRequestErrorMessage } from '../../../shared/api'
import { usePageTitle } from '../../../shared/lib/usePageTitle'
import {
  Button,
  EmptyState,
  PageContainer,
  PageHeader,
  useToast,
} from '../../../shared/ui'
import {
  classroomDetailPath,
  classroomEditPath,
  learningStatusPath,
  materialViewerPath,
} from '../../routes'

type CreateClassroomDraft = CreateClassroomInput & { weekCount: number }

interface SearchableMaterial extends ClassroomMaterial {
  classroomId: string
  classroomName: string
}

interface DisplayClassroom extends Classroom {
  searchMaterials: SearchableMaterial[]
}

interface SearchResult {
  id: string
  kind: 'classroom' | 'material'
  path: string
  subtitle: string
  title: string
}

export function InstructorClassroomsPage() {
  usePageTitle('내 강의실')
  const { apiRequest } = useAuth()
  const { show: showToast } = useToast()
  const navigate = useNavigate()
  const [classrooms, setClassrooms] = useState<DisplayClassroom[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const repository = useMemo(
    () => createClassroomsRepository(apiRequest),
    [apiRequest],
  )

  async function loadClassrooms(search = '') {
    setIsLoading(true)
    setError(null)
    try {
      setClassrooms(
        await loadCardDetails(await repository.list(search), repository),
      )
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    repository
      .list()
      .then((items) => loadCardDetails(items, repository))
      .then((items) => {
        if (!cancelled) setClassrooms(items)
      })
      .catch((requestError) => {
        if (!cancelled) setError(getRequestErrorMessage(requestError))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [repository])

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setIsSearchOpen(true)
      }
      if (event.key === 'Escape') {
        setIsCreateOpen(false)
        setIsSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  useEffect(() => {
    if (isSearchOpen) searchInputRef.current?.focus()
  }, [isSearchOpen])

  const searchResults = useMemo<SearchResult[]>(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR')
    if (!normalizedQuery) return []

    const classroomResults = classrooms
      .filter((classroom) =>
        classroom.name.toLocaleLowerCase('ko-KR').includes(normalizedQuery),
      )
      .map((classroom) => ({
        id: classroom.id,
        kind: 'classroom' as const,
        path: classroomDetailPath(classroom.id),
        subtitle: `학습자 ${classroom.learnerCount}명 · ${classroom.status === 'ACTIVE' ? '운영 중' : '종료'}`,
        title: classroom.name,
      }))

    const seenMaterialIds = new Set<string>()
    const materialResults = classrooms.flatMap((classroom) =>
      classroom.searchMaterials
        .filter((material) =>
          material.title
            .toLocaleLowerCase('ko-KR')
            .includes(normalizedQuery),
        )
        .filter((material) => {
          if (seenMaterialIds.has(material.id)) return false
          seenMaterialIds.add(material.id)
          return true
        })
        .map((material) => ({
          id: material.id,
          kind: 'material' as const,
          path: materialViewerPath(material.id),
          subtitle: `${classroom.name} · PDF 자료`,
          title: material.title,
        })),
    )

    return [...classroomResults, ...materialResults]
  }, [classrooms, query])

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (searchResults.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedSearchIndex((index) => (index + 1) % searchResults.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedSearchIndex(
        (index) => (index - 1 + searchResults.length) % searchResults.length,
      )
    } else if (event.key === 'Enter') {
      event.preventDefault()
      navigate(searchResults[selectedSearchIndex].path)
      setIsSearchOpen(false)
    }
  }

  async function copyInviteCode(classroom: Classroom) {
    try {
      const code =
        classroom.inviteCode ||
        (await repository.getInviteCode(classroom.id))
      await navigator.clipboard.writeText(code)
      showToast('초대 코드를 복사했습니다.', 'success')
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    }
  }

  async function regenerateInviteCode(classroom: Classroom) {
    if (
      !window.confirm(
        '기존 초대 코드는 더 이상 사용할 수 없습니다. 재발급할까요?',
      )
    ) {
      return
    }
    try {
      const code = await repository.regenerateInviteCode(classroom.id)
      await navigator.clipboard.writeText(code)
      setClassrooms((items) =>
        items.map((item) =>
          item.id === classroom.id ? { ...item, inviteCode: code } : item,
        ),
      )
      showToast('새 초대 코드를 발급하고 복사했습니다.', 'success')
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="내 강의실"
        actions={
          <>
            <button
              aria-label="강의실 검색"
              className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-left type-body text-stone-400 hover:border-stone-300 hover:text-stone-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:min-w-72 xl:flex-none"
              onClick={() => setIsSearchOpen(true)}
              type="button"
            >
              <Search aria-hidden="true" size={15} />
              <span className="flex-1">강의실 검색</span>
              <kbd className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 type-micro">
                ⌘K
              </kbd>
            </button>
            <Button className="h-10" onClick={() => setIsCreateOpen(true)}>
              <Plus aria-hidden="true" size={15} />
              강의실 만들기
            </Button>
          </>
        }
      />

      {error ? (
        <EmptyState
          action={
            <Button onClick={() => void loadClassrooms()} variant="secondary">
              다시 시도
            </Button>
          }
          description={error}
          title="강의실을 불러오지 못했습니다"
        />
      ) : null}
      {!error && isLoading ? (
        <p className="py-16 text-center type-body text-stone-500" role="status">
          강의실을 불러오는 중입니다.
        </p>
      ) : null}
      {!error && !isLoading && classrooms.length === 0 ? (
        <EmptyState
          description="새 강의실을 만들면 운영 현황과 초대 코드를 확인할 수 있습니다."
          title="아직 운영 중인 강의실이 없습니다"
        />
      ) : null}
      {!error && classrooms.length > 0 ? (
        <section
          aria-label="운영 강의실"
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          {classrooms.map((classroom) => (
            <ClassroomCard
              classroom={classroom}
              key={classroom.id}
              onCopy={() => void copyInviteCode(classroom)}
              onRegenerate={() => void regenerateInviteCode(classroom)}
            />
          ))}
        </section>
      ) : null}

      {isSearchOpen ? (
        <SearchDialog
          onClose={() => setIsSearchOpen(false)}
          onKeyDown={handleSearchKeyDown}
          onQueryChange={(nextQuery) => {
            setQuery(nextQuery)
            setSelectedSearchIndex(0)
          }}
          onSelect={(path) => {
            setIsSearchOpen(false)
            navigate(path)
          }}
          query={query}
          results={searchResults}
          searchInputRef={searchInputRef}
          selectedIndex={selectedSearchIndex}
          setSelectedIndex={setSelectedSearchIndex}
        />
      ) : null}

      {isCreateOpen ? (
        <CreateClassroomDialog
          onClose={() => setIsCreateOpen(false)}
          onSubmit={async (draft) => {
            try {
              const { weekCount, ...classroomInput } = draft
              const created = await repository.create(classroomInput)
              let createdWeekCount = 0
              for (let index = 0; index < weekCount; index += 1) {
                try {
                  await repository.createWeek(created.id, {
                    title: `${index + 1}주차`,
                    weekNumber: index + 1,
                  })
                  createdWeekCount += 1
                } catch {
                  break
                }
              }
              setIsCreateOpen(false)
              const failed = weekCount - createdWeekCount
              showToast(
                failed
                  ? `강의실은 만들었지만 ${failed}개 주차 생성에 실패했습니다.`
                  : `${weekCount}개 주차와 강의실을 만들었습니다.`,
                failed ? 'danger' : 'success',
              )
              await loadClassrooms()
            } catch (requestError) {
              showToast(getRequestErrorMessage(requestError), 'danger')
            }
          }}
        />
      ) : null}
    </PageContainer>
  )
}

function ClassroomCard({
  classroom,
  onCopy,
  onRegenerate,
}: {
  classroom: Classroom
  onCopy: () => void
  onRegenerate: () => void
}) {
  const isActive = classroom.status === 'ACTIVE'
  const progress = Math.min(100, Math.max(0, classroom.progressRate))
  const tone = getClassroomTone(classroom.color)

  return (
    <article
      className={`flex min-h-[252px] flex-col rounded-lg border border-stone-200 bg-white p-5 ${isActive ? '' : 'opacity-60'}`}
    >
      <div className="flex items-start gap-4">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-lg type-body font-bold ${tone}`}
        >
          {classroom.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            className="block truncate type-card-title font-bold text-stone-950 hover:text-brand-700"
            to={classroomDetailPath(classroom.id)}
          >
            {classroom.name}
          </Link>
          <p className="mt-0.5 truncate type-micro text-stone-400">
            학습자 {classroom.learnerCount}명 · 자료{' '}
            {classroom.materialCount ?? 0}개
          </p>
        </div>
        <span
          className={
            isActive
              ? 'rounded-full bg-emerald-50 px-2 py-1 type-micro font-semibold text-emerald-700'
              : 'rounded-full bg-stone-100 px-2 py-1 type-micro font-semibold text-stone-500'
          }
        >
          {isActive ? '운영 중' : '종료'}
        </span>
      </div>
      <div className="mt-4 flex min-h-14 items-center gap-3 rounded-lg bg-stone-50 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="type-micro text-stone-400">초대코드</p>
          <strong className="block truncate font-mono type-section-title tracking-wide text-stone-900">
            {isActive
              ? (classroom.inviteCode ?? '코드 확인')
              : '비활성화됨'}
          </strong>
        </div>
        {isActive ? (
          <>
            <button
              aria-label={`${classroom.name} 초대 코드 복사`}
              className="inline-flex h-9 items-center rounded-md border border-stone-200 bg-white px-3 type-compact-action font-semibold text-brand-700 hover:bg-brand-50"
              onClick={onCopy}
              title="초대 코드 복사"
              type="button"
            >
              복사
            </button>
            <button
              aria-label={`${classroom.name} 초대 코드 재발급`}
              className="inline-flex h-9 items-center rounded-md border border-stone-200 bg-white px-3 type-compact-action font-semibold text-stone-600 hover:bg-stone-100"
              onClick={onRegenerate}
              title="초대 코드 재발급"
              type="button"
            >
              재발급
            </button>
          </>
        ) : null}
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between type-micro">
          <span className="text-stone-400">평균 진도</span>
          <strong className={isActive ? 'text-brand-700' : 'text-stone-400'}>
            {progress}%
          </strong>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-stone-200">
          <div
            className={`h-full rounded-full ${isActive ? 'bg-brand-600' : 'bg-stone-400'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className={`mt-auto grid gap-2 pt-4 ${isActive ? 'grid-cols-[1fr_1fr_auto]' : 'grid-cols-[1fr_auto]'}`}>
        <Link className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 px-3 type-micro font-semibold text-stone-700 hover:bg-stone-50" to={classroomDetailPath(classroom.id)}>
          {isActive ? '자료 관리' : '보관된 자료 보기'}
        </Link>
        {isActive ? (
          <Link
            className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 px-3 type-micro font-semibold text-stone-700 hover:bg-stone-50"
            to={learningStatusPath(classroom.id)}
          >
            학습 현황
          </Link>
        ) : null}
        <Link
          className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 px-3 type-micro font-semibold text-stone-700 hover:bg-stone-50"
          to={classroomEditPath(classroom.id)}
        >
          설정
        </Link>
      </div>
    </article>
  )
}

function SearchDialog({
  onClose,
  onKeyDown,
  onQueryChange,
  onSelect,
  query,
  results,
  searchInputRef,
  selectedIndex,
  setSelectedIndex,
}: {
  onClose: () => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onQueryChange: (query: string) => void
  onSelect: (path: string) => void
  query: string
  results: SearchResult[]
  searchInputRef: React.RefObject<HTMLInputElement | null>
  selectedIndex: number
  setSelectedIndex: (index: number) => void
}) {
  const classroomResults = results.filter((result) => result.kind === 'classroom')
  const materialResults = results.filter((result) => result.kind === 'material')

  return (
    <div
      aria-label="강의실 검색"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-stone-950/35 px-4 pt-[15vh]"
      role="dialog"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl">
        <div className="flex h-14 items-center gap-3 border-b border-stone-100 px-4">
          <Search aria-hidden="true" className="text-stone-400" size={16} />
          <input
            aria-activedescendant={
              results.length > 0
                ? `classroom-search-result-${selectedIndex}`
                : undefined
            }
            aria-controls="classroom-search-results"
            aria-label="검색어"
            className="h-full min-w-0 flex-1 border-0 bg-transparent type-body text-stone-900 outline-none placeholder:text-stone-400"
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="강의실 또는 자료 검색"
            ref={searchInputRef}
            role="combobox"
            value={query}
          />
          <button
            aria-label="검색 닫기"
            className="flex h-7 items-center justify-center rounded-md border border-stone-200 px-2 type-micro font-semibold text-stone-400"
            onClick={onClose}
            type="button"
          >
            esc
          </button>
        </div>
        <div className="min-h-52 px-2 py-3" id="classroom-search-results" role="listbox">
          {!query.trim() ? (
            <SearchEmpty
              description="강의실 이름이나 등록한 자료명을 입력하세요."
              title="검색어를 입력하세요"
            />
          ) : null}
          {query.trim() && results.length === 0 ? (
            <SearchEmpty
              description="다른 검색어로 다시 시도해 보세요."
              title="일치하는 검색 결과가 없습니다"
            />
          ) : null}
          <SearchResultGroup
            label="강의실"
            onSelect={onSelect}
            results={classroomResults}
            selectedIndex={selectedIndex}
            setSelectedIndex={setSelectedIndex}
            startIndex={0}
          />
          <SearchResultGroup
            label="자료"
            onSelect={onSelect}
            results={materialResults}
            selectedIndex={selectedIndex}
            setSelectedIndex={setSelectedIndex}
            startIndex={classroomResults.length}
          />
        </div>
        {results.length > 0 ? (
          <div className="flex gap-4 border-t border-stone-100 px-4 py-2.5 type-micro font-medium text-stone-400">
            <span>↑↓ 이동</span>
            <span>↵ 열기</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function SearchResultGroup({
  label,
  onSelect,
  results,
  selectedIndex,
  setSelectedIndex,
  startIndex,
}: {
  label: string
  onSelect: (path: string) => void
  results: SearchResult[]
  selectedIndex: number
  setSelectedIndex: (index: number) => void
  startIndex: number
}) {
  if (results.length === 0) return null
  return (
    <section aria-label={label} className="mb-2 last:mb-0">
      <p className="px-2 pb-1.5 type-micro font-semibold text-stone-400">
        {label}
      </p>
      {results.map((result, index) => {
        const globalIndex = startIndex + index
        const isSelected = globalIndex === selectedIndex
        return (
          <button
            aria-selected={isSelected}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${isSelected ? 'bg-stone-100' : 'hover:bg-stone-50'}`}
            id={`classroom-search-result-${globalIndex}`}
            key={`${result.kind}-${result.id}`}
            onClick={() => onSelect(result.path)}
            onMouseEnter={() => setSelectedIndex(globalIndex)}
            role="option"
            type="button"
          >
            <span className={`flex size-7 items-center justify-center rounded-md ${result.kind === 'classroom' ? 'bg-brand-50 text-brand-700' : 'bg-rose-50 text-rose-600'}`}>
              {result.kind === 'classroom' ? (
                <BookOpen aria-hidden="true" size={14} />
              ) : (
                <FileText aria-hidden="true" size={14} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate type-body text-stone-900">
                {result.title}
              </strong>
              <span className="block truncate type-micro text-stone-400">
                {result.subtitle}
              </span>
            </span>
          </button>
        )
      })}
    </section>
  )
}

function SearchEmpty({
  description,
  title,
}: {
  description: string
  title: string
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center text-center">
      <Search aria-hidden="true" className="text-stone-300" size={22} />
      <p className="mt-3 type-body font-semibold text-stone-800">{title}</p>
      <p className="mt-1 type-caption text-stone-400">{description}</p>
    </div>
  )
}

async function loadCardDetails(
  classrooms: Classroom[],
  repository: ReturnType<typeof createClassroomsRepository>,
): Promise<DisplayClassroom[]> {
  return Promise.all(
    classrooms.map(async (classroom) => {
      const [inviteResult, weeksResult] = await Promise.allSettled([
        classroom.status === 'ACTIVE'
          ? repository.getInviteCode(classroom.id)
          : Promise.resolve(undefined),
        repository.listWeeks(classroom.id),
      ])
      const weeks = weeksResult.status === 'fulfilled' ? weeksResult.value : []
      return {
        ...classroom,
        inviteCode:
          inviteResult.status === 'fulfilled'
            ? inviteResult.value
            : classroom.inviteCode,
        materialCount: weeks.reduce(
          (sum, week) => sum + week.materials.length,
          weeksResult.status === 'fulfilled' ? 0 : (classroom.materialCount ?? 0),
        ),
        searchMaterials: weeks.flatMap((week) =>
          week.materials.map((material) => ({
            ...material,
            classroomId: classroom.id,
            classroomName: classroom.name,
          })),
        ),
      }
    }),
  )
}

function getClassroomTone(color: ClassroomColor): string {
  switch (color) {
    case 'ORANGE':
      return 'bg-orange-100 text-orange-700'
    case 'GREEN':
      return 'bg-emerald-100 text-emerald-700'
    case 'PURPLE':
      return 'bg-violet-100 text-violet-700'
    case 'RED':
      return 'bg-rose-100 text-rose-700'
    case 'GRAY':
      return 'bg-stone-100 text-stone-500'
    case 'BLUE':
      return 'bg-brand-100 text-brand-700'
  }
}

function CreateClassroomDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (draft: CreateClassroomDraft) => Promise<void> | void
}) {
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [weekCount, setWeekCount] = useState(15)
  const submitLockRef = useRef(false)
  const endDate = getEndDate(startDate, weekCount)
  const canSubmit = Boolean(name.trim() && startDate && weekCount > 0)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit || submitLockRef.current) return

    submitLockRef.current = true
    setIsSubmitting(true)
    try {
      await onSubmit({
        color: 'BLUE',
        description: description.trim(),
        endDate,
        name: name.trim(),
        startDate,
        weekCount,
      })
    } finally {
      submitLockRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <div
      aria-labelledby="create-classroom-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4"
      role="dialog"
    >
      <form
        className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-6 shadow-2xl"
        onSubmit={submit}
      >
        <div className="flex items-center justify-between">
          <h2 className="type-dialog-title font-bold" id="create-classroom-title">
            강의실 만들기
          </h2>
          <button
            aria-label="닫기"
            className="flex size-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100"
            disabled={isSubmitting}
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
        <label className="mt-5 block type-body font-semibold">
          강의실 이름
          <input
            autoFocus
            className="mt-1 h-11 w-full rounded-lg border border-stone-300 px-3.5"
            onChange={(event) => setName(event.target.value)}
            placeholder="강의실 이름을 입력하세요"
            value={name}
          />
        </label>
        <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
          <p className="type-body font-semibold">수업 기간</p>
          <div className="mt-2 grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="type-body font-semibold">
              수업 시작일
              <input
                className="mt-1 h-11 w-full rounded-lg border border-stone-300 bg-white px-3"
                onChange={(event) => setStartDate(event.target.value)}
                type="date"
                value={startDate}
              />
            </label>
            <div>
              <span className="type-body font-semibold">주차 수</span>
              <div className="mt-1 flex h-11 items-center rounded-lg border border-stone-300 bg-white p-1">
                <button
                  aria-label="주차 수 줄이기"
                  className="flex size-8 items-center justify-center rounded-md hover:bg-stone-100"
                  disabled={weekCount <= 1}
                  onClick={() =>
                    setWeekCount((value) => Math.max(1, value - 1))
                  }
                  type="button"
                >
                  <Minus size={14} />
                </button>
                <output className="min-w-12 text-center type-body font-bold">
                  {weekCount}주
                </output>
                <button
                  aria-label="주차 수 늘리기"
                  className="flex size-8 items-center justify-center rounded-md hover:bg-stone-100"
                  disabled={weekCount >= 52}
                  onClick={() =>
                    setWeekCount((value) => Math.min(52, value + 1))
                  }
                  type="button"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-2 min-h-5 type-caption text-stone-500">
          {endDate
            ? `${endDate}까지 · ${weekCount}개 주차가 자동 생성됩니다.`
            : '시작일을 선택하면 종료일과 주차 수를 계산합니다.'}
        </p>
        <label className="mt-4 block type-body font-semibold">
          설명 <span className="font-normal text-stone-400">(선택)</span>
          <textarea
            className="mt-1 min-h-24 w-full resize-none rounded-lg border border-stone-300 p-3"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="학습자에게 보이는 한 줄 소개"
            value={description}
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button disabled={isSubmitting} onClick={onClose} variant="ghost">
            취소
          </Button>
          <Button disabled={!canSubmit || isSubmitting} type="submit">
            {isSubmitting ? '만드는 중' : '만들기'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function getEndDate(startDate: string, weekCount: number): string {
  if (!startDate || weekCount < 1) return ''
  const date = new Date(`${startDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + weekCount * 7 - 1)
  return date.toISOString().slice(0, 10)
}
